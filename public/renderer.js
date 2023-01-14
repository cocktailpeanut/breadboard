class App {
  constructor (query, sorter_code, need_update, sync_mode, sync_folder) {
    this.query = query
    this.sorter_code = sorter_code
    this.sync_mode = sync_mode
    this.sync_folder = sync_folder
    this.checkpoints = { }
    this.selection = new Selection(this)
    this.navbar = new Navbar(this);
    if (need_update) {
      this.navbar.notification(need_update)
    }
    this.handler = new Handler(this);
    if (!this.bar) {
      this.bar = new Nanobar({
        target: document.querySelector("#bar")
      });
    }
    this.domparser = new DOMParser()
  }
  async init () {
    console.log("INIT", VERSION)
    this.selector = new TomSelect("nav select", {
      onDropdownClose: () => {
        this.selector.blur()
      }
    })
    await this.init_db()
    this.init_rpc()
    await this.bootstrap()
  }
  async init_db () {
    // upgrade from legacy db schema (breadboard => data + user)
    // 1. The "data" DB only contains attributes that can be crawled from the files
    this.db = new Dexie("data")
    this.db.version(1).stores({
      files: "file_path, agent, model_name, model_hash, root_path, prompt, btime, mtime, width, height, *tokens",
    })

    // 2. The "user" DB contains attributes that can NOT be crawled from the files
    this.user = new Dexie("user")
    this.user.version(1).stores({
      folders: "&name",
      checkpoints: "&root_path, btime",
      settings: "key, val",
      favorites: "query, global"
    })

    let legacy_exists = await Dexie.exists("breadboard")
    if (legacy_exists) {
      // should only trigger once when upgrading

      // must reindex after updating => all the files must be re-indexed
      this.sync_mode = "reindex"

      // if legacy db exists, delete it
      let legacy_db = new Dexie("breadboard")
      legacy_db.version(1).stores({
        files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
        folders: "&name",
        checkpoints: "&root_path, btime",
        settings: "key, val",
        favorites: "query"
      })
      
      let previous_version
      try {
        let ver = await legacy_db.settings.where({ key: "version" }).first()
        if (ver) {
          previous_version = ver.val
        } else {
          previous_version = "0.0.0"
        }
      } catch (e) {
        previous_version = "0.0.0"
      }

      if (previous_version === "0.0.0") {
        // if it's 0.0.0
        // Just reset everything and recrawl
        let folders = await legacy_db.folders.toArray()
        await this.user.folders.bulkPut(folders)
      } else {
        // if it's 0.1.0 or 0.2.0
        // No need to declare version. Just read from the old DB and migrate to the "data" and "user" dbs
        // 3. Migrate the "folders", "checkpoints", "settings", "favorites" table to the user table
        let files = await legacy_db.files.toArray()
        let folders = await legacy_db.folders.toArray()
        let checkpoints = await legacy_db.checkpoints.toArray()
        let settings = await legacy_db.settings.toArray()
        let favorites = await legacy_db.favorites.toArray()
        // Only replicate folders and settings,  do NOT replicate checkpoint => checkpoint must be null when reindexing
        await this.user.folders.bulkPut(folders)
        await this.user.settings.bulkPut(settings)

        let fav = favorites.map((f) => {
          return {
            query: f.query,
            global: 0
          }
        })
        await this.user.favorites.bulkPut(fav)
      }
      await legacy_db.delete()

    }

    // Set up db with defaults and version
    await this.user.settings.put({ key: "version", val: VERSION })

    // bootstrap the DB with defaults (only the first time)
    let defaults = await window.electronAPI.defaults()
    for(let d of defaults) {
      await this.user.folders.put({ name: d }).catch((e) => { })
    }

    await this.persist()

  }
  async persist() {
    if (!navigator.storage || !navigator.storage.persisted) {
      return "never";
    }
    let persisted = await navigator.storage.persisted();
    if (persisted) {
      return "persisted";
    }
    if (!navigator.permissions || !navigator.permissions.query) {
      return "prompt"; // It MAY be successful to prompt. Don't know.
    }
    const permission = await navigator.permissions.query({
      name: "persistent-storage"
    });
    if (permission.state === "granted") {
      persisted = await navigator.storage.persist();
      if (persisted) {
        return "persisted";
      } else {
        throw new Error("Failed to persist");
      }
    }
    if (permission.state === "prompt") {
      return "prompt";
    }
    return "never";
  }
  async bootstrap () {
    await this.init_theme()
    await this.init_zoom()
    this.init_worker()
    if (this.sync_mode === "default" || this.sync_mode === "reindex" || this.sync_mode === "reindex_folder") {
      await this.synchronize()
    } else {
      this.observer = new IntersectionObserver(async entries => {
        let entry = entries[0]
        if (entry.intersectionRatio > 0) {
          this.offset = this.offset + 1
          await this.draw()
        }
      });
      this.offset = 0
      await this.draw()
    }
  }
  async insert (o) {
    let tokens = []
    let wordSet = {}
    if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
      let p = this.domparser.parseFromString(o.prompt, "text/html").documentElement.textContent;    // Escape XML-unsafe characters
      wordSet = this.stripPunctuation(p).split(/\s/).reduce(function (prev, current) {
        if (current.length > 0) prev[current] = true;
        return prev;
      }, {});
    }
    if (o.subject) {
      for(let k of o.subject) {
        wordSet["tag:" + k] = true
      }
    }
    tokens = Object.keys(wordSet);

    await this.db.files.put({ ...o, tokens })

    if (this.checkpoints[o.root_path]) {
      if (this.checkpoints[o.root_path] < o.btime) {
        await this.updateCheckpoint(o.root_path, o.btime)
      }
    } else {
      let cp = await this.user.checkpoints.where({ root_path: o.root_path }).first()   
      if (cp) {
        if (cp && cp.btime < o.btime) {
          await this.updateCheckpoint(o.root_path, o.btime)
        }
      } else {
        await this.updateCheckpoint(o.root_path, o.btime)
      }
    }
  }
  async checkpoint (root_path) {
    let cp = await this.user.checkpoints.where({ root_path }).first()
    if (cp) return cp.btime
    else return null
  }
  async updateCheckpoint (root_path, btime) {
    let cp = await this.user.checkpoints.put({ root_path, btime })
    this.checkpoints[root_path] = btime
  }
  init_rpc() {
    window.electronAPI.onMsg(async (_event, value) => {
      queueMicrotask(async () => {
        if (value.meta) {
          let response = await this.insert(value.meta).catch((e) => {
            console.log("ERROR", e)
          })
        }
        this.sync_counter++;
        if (this.sync_counter === value.total) {
          this.sync_complete = true
        }
        let ratio = value.progress/value.total
        this.bar.go(100*value.progress/value.total);
      })
    })
  }
  async init_zoom () {
    let zoom = await this.user.settings.where({ key: "zoom" }).first()
    if (zoom) {
      window.electronAPI.zoom(zoom.val)
    }
  }
  async init_theme () {
    this.theme = await this.user.settings.where({ key: "theme" }).first()
    if (!this.theme) this.theme = { val: "default" }
    document.body.className = this.theme.val
    document.querySelector("html").className = this.theme.val
    window.electronAPI.theme(this.theme.val)
  }
  init_worker () {
    if (!this.worker) {
      this.worker = new Worker("./worker.js")
      this.worker.onmessage = async (e) => {
        if (e.data.res.length > 0) {
          await this.fill(e.data)
          setTimeout(() => {
            document.querySelector("#sync").classList.remove("disabled")
            document.querySelector("#sync").disabled = false
            document.querySelector("#sync i").classList.remove("fa-spin")
            this.selection.init()
          }, 0)
        } else {
          document.querySelector(".end-marker .caption i").classList.remove("fa-spin")
        }
      }
    }
  }
  async synchronize (paths, cb) {
    document.querySelector("#sync").classList.add("disabled")
    document.querySelector("#sync").disabled = true
    document.querySelector("#sync i").classList.add("fa-spin")
    if (paths) {
      document.querySelector(".status").innerHTML = "synchronizing..."
      this.sync_counter = 0
      this.sync_complete = false
      await new Promise((resolve, reject) => {
        window.electronAPI.sync({ paths })
        let interval = setInterval(() => {
          if (this.sync_complete) {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      })
      if (cb) {
        await cb()
      }
    } else {
      if (this.sync_mode === "reindex" || this.sync_mode === "default" || this.sync_mode === "false") {
        let folderpaths = await this.user.folders.toArray()
        for(let folderpath of folderpaths) {
          let root_path = folderpath.name
          let c = await this.checkpoint(root_path)
          document.querySelector(".status").innerHTML = "synchronizing from " + root_path
          this.sync_counter = 0
          this.sync_complete = false
          await new Promise((resolve, reject) => {
            const config = {
              root_path,
              checkpoint: c,
            }
            if (this.sync_mode === "default") {
              // nothing
            } else if (this.sync_mode === "reindex") {
              config.force = true
            }
            window.electronAPI.sync(config)
            let interval = setInterval(() => {
              if (this.sync_complete) {
                clearInterval(interval)
                resolve()
              }
            }, 1000)
          })
        }
        this.sync_counter = 0
        document.querySelector(".status").innerHTML = ""
        this.bar.go(100)
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.search(query)
        } else {
          await this.search()
        }
      } else if (this.sync_mode === "reindex_folder" && this.sync_folder && this.sync_folder.length > 0) {
        document.querySelector(".status").innerHTML = "synchronizing from " + this.sync_folder
        this.sync_counter = 0
        this.sync_complete = false
        await new Promise((resolve, reject) => {
          const config = {
            root_path: this.sync_folder,
            force: true,
          }
          window.electronAPI.sync(config)
          let interval = setInterval(() => {
            if (this.sync_complete) {
              clearInterval(interval)
              resolve()
            }
          }, 1000)
        })
        this.sync_counter = 0
        document.querySelector(".status").innerHTML = ""
        this.bar.go(100)
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.search(query)
        } else {
          await this.search()
        }
      }
    }
  }
  async fill ({ count, res }) {
    let items = res
    document.querySelector(".content-info").innerHTML = `<i class="fa-solid fa-check"></i> ${count}`
    document.querySelector(".status").innerHTML = "Loading..."
    let data = items.map((item) => {
      return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item, this.stripPunctuation)}</div>`
    })
    if (!this.clusterize) {
      this.clusterize = new Clusterize({
  //      rows: data,
        scrollElem: document.querySelector(".container"),
        contentElem: document.querySelector(".content"),
        rows_in_block: 500,
        blocks_in_cluster: 10
      });
    }
    this.clusterize.append(data)
    document.querySelector(".status").innerHTML = ""
    // start observing
    this.observer.unobserve(document.querySelector(".end-marker"));
    this.observer.observe(document.querySelector(".end-marker"));
  }
  async draw () {
    document.querySelector(".search").value = (this.query && this.query.length ? this.query : "")
    if (this.query) {
      let favorited = await this.user.favorites.get(this.query)
      if (favorited) {
        document.querySelector("nav #favorite").classList.add("selected") 
        document.querySelector("nav #favorite i").className = "fa-solid fa-star"
      } else {
        document.querySelector("nav #favorite").classList.remove("selected") 
        document.querySelector("nav #favorite i").className = "fa-regular fa-star"
      }
    } else {
      document.querySelector("nav #favorite").classList.remove("selected") 
      document.querySelector("nav #favorite i").className = "fa-regular fa-star"
    }
    this.worker.postMessage({ query: this.query, sorter: this.navbar.sorter, offset: this.offset })

  }
  async search (query, silent) {
    let params = new URLSearchParams({ sorter_code: this.sorter_code })
    if (query && query.length > 0) {
      params.set("query", query)
    }
    location.href = "/?" + params.toString()
  }
  stripPunctuation (str) {
    return str
      .replaceAll("&quot;", " ")
      .replace(/[.,\/#!$%\^&\*;:\[\]{}=\-_`"~()\\\|+]/g, " ")
      .replace(/\s{2,}/g, " ");
  }

}

let QUERY
if (document.querySelector("#query")) {
  QUERY = document.querySelector("#query").getAttribute("data-value")
}
console.log("QUERY", QUERY)

const app = new App(QUERY, SORTER, NEED_UPDATE, SYNC_MODE, SYNC_FOLDER);
(async () => {
  await app.init()
})();
