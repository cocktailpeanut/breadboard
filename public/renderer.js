class App {
  constructor (query, sorter_code, need_update, sync_mode, sync_folder) {
    this.init_rpc()
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
  async clear_db() {
    // TODO => Must switch to only clearing files and checkpoints in the next release
    await this.db.delete()    // only for this version => from next version will be upgraded

    //await this.db.files.clear()
    //await this.db.checkpoints.clear()
  }
  async bootstrap (options) {

    // fresh bootstrap => clear DB
    if (options && options.fresh) {
      await this.clear_db()
      await this.init_db()
      await this.bootstrap_db()
    }

    await this.init_theme()
    await this.init_zoom()
    this.init_worker()
    if (this.sync_mode === "default" || this.sync_mode === "reindex" || this.sync_mode === "reindex_folder") {
      await this.synchronize()
    } else {
      await this.draw()
    }
  }
  async init () {
    console.log("INIT", VERSION)
    this.selector = new TomSelect("nav select", {
      onDropdownClose: () => {
        this.selector.blur()
      }
    })
    await this.init_db()
    try {
      let current_version = await this.db.settings.where({ key: "version" }).first()
      if (current_version.val === VERSION) {
        // Normal situation
        await this.bootstrap()
      } else {
        // The current app version and the existing DB version doesn't match
        // which means the app (with a new version) has been freshly installed 
        // therefore re-index everything
        await this.bootstrap({ fresh: true })
      }
    } catch (e) {
      // VERSION does not exist => (only in the first version)
      // Treat the same way as DB version not matching 
      await this.bootstrap({ fresh: true })
    }
  }
  async insert (o) {
    let tokens = []
    let wordSet = {}
    if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
      let p = this.domparser.parseFromString(o.prompt, "text/html").documentElement.textContent;    // Escape XML-unsafe characters
      wordSet = this.stripPunctuation(p).split(' ').reduce(function (prev, current) {
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
      let cp = await this.db.checkpoints.where({ root_path: o.root_path }).first()   
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
    let cp = await this.db.checkpoints.where({ root_path }).first()
    if (cp) return cp.btime
    else return null
  }
  async updateCheckpoint (root_path, btime) {
    let cp = await this.db.checkpoints.put({ root_path, btime })
    this.checkpoints[root_path] = btime
  }
  init_rpc() {
    console.log("init_rpc")
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
  async init_db () {
    this.db = new Dexie("breadboard")
    this.db.version(1).stores({
      files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
      folders: "&name",
      checkpoints: "&root_path, btime",
      settings: "key, val",
      favorites: "query"
    })
    await this.persist()

    // try to recover from backup if backup exists, and then delete the backup

    let backup = new Dexie("breadboard_backup")
    backup.version(1).stores({
      settings: "key, val",
      folders: "&name",
      favorites: "query"
    })


    let favorites = await backup.favorites.toArray()
    console.log("favorites", favorites)
    if (favorites && favorites.length > 0) {

      // recover backup
      await this.db.favorites.bulkPut(favorites)

      // clear the DB if backup was fully recovered
      await backup.favorites.clear()

    }

    let settings = await backup.settings.toArray()
    console.log("settings", settings)
    if (settings && settings.length > 0) {

      // recover backup
      await this.db.settings.bulkPut(settings)

      // clear the DB if backup was fully recovered
      await backup.settings.clear()

    }

    let folders = await backup.folders.toArray()
    if (folders && folders.length > 0) {
      // recover backup
      await this.db.folders.bulkPut(folders)

      // clear the DB if backup was fully recovered
      await backup.folders.clear()
    }

    await backup.delete()
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
  async init_zoom () {
    let zoom = await this.db.settings.where({ key: "zoom" }).first()
    if (zoom) {
      window.electronAPI.zoom(zoom.val)
    }
  }
  async bootstrap_db () {
    let defaults = await window.electronAPI.defaults()
    for(let d of defaults) {
      await this.db.folders.put({ name: d }).catch((e) => { })
    }
    await this.db.settings.put({ key: "version", val: VERSION })
  }
  async init_theme () {
    this.theme = await this.db.settings.where({ key: "theme" }).first()
    if (!this.theme) this.theme = { val: "default" }
    document.body.className = this.theme.val
    window.electronAPI.theme(this.theme.val)
  }
  init_worker () {
    if (!this.worker) {
      this.worker = new Worker("./worker.js")
      this.worker.onmessage = async (e) => {
        await this.fill(e.data)
        setTimeout(() => {
          document.querySelector("#sync").classList.remove("disabled")
          document.querySelector("#sync").disabled = false
          document.querySelector("#sync i").classList.remove("fa-spin")
          this.selection.init()
        }, 0)
      }
    }
  }
  async synchronize (paths, cb) {
    console.log("this.sync_mode", this.sync_mode)
    console.log("this.sync_folder", this.sync_folder)
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
        let folderpaths = await this.db.folders.toArray()
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
        console.log("DONE")
        this.bar.go(100)
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.search(query)
        } else {
          await this.search()
        }
      } else if (this.sync_mode === "reindex_folder" && this.sync_folder && this.sync_folder.length > 0) {
        console.log("reindex folder", this.sync_folder)
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
        console.log("DONE")
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
  async fill (items) {
    const chunkSize = 800;
    document.querySelector(".content-info").innerHTML = `<i class="fa-solid fa-check"></i> ${items.length}`
    document.querySelector(".container").classList.remove("hidden")
    document.querySelector(".status").innerHTML = "Loading..."
    let data = items.map((item) => {
      return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item)}</div>`
    })
    this.clusterize = new Clusterize({
      rows: data,
      scrollElem: document.querySelector(".container"),
      contentElem: document.querySelector(".content"),
      rows_in_block: 500,
      blocks_in_cluster: 10
    });
    document.querySelector(".status").innerHTML = ""
    document.querySelector(".loading").classList.add("hidden")
  }
  async draw () {
    document.querySelector(".loading").classList.remove("hidden")
    document.querySelector(".search").value = (this.query && this.query.length ? this.query : "")
    document.querySelector("footer").classList.add("hidden")
    document.querySelector(".container").classList.add("hidden")
    if (this.query) {
      let favorited = await this.db.favorites.get(this.query)
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
    this.worker.postMessage({ query: this.query, sorter: this.navbar.sorter })
  }
  async search (query, silent) {
    let params = new URLSearchParams({ sorter_code: this.sorter_code })
    if (query && query.length > 0) {
      params.set("query", query)
    }
    location.href = "/?" + params.toString()
  }
  stripPunctuation (str) {
//    return str.replace(/(^[^\p{L}\s]|[^\p{L}\s]$)/gu,"")
    return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()+]/g, "").replace(/\s{2,}/g, " ");
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
