class Selection {
  constructor (app) {
    this.els = []
    this.app = app
    this.addTagInput = document.querySelector('#add-tag-field')
    this.addtags = tagger(this.addTagInput, {
      allow_duplicates: false,
//      allow_spaces: false,
      add_on_blur: true,
      wrap: true,
    });
    this.removeTagInput = document.querySelector('#remove-tag-field')
    this.removetags = tagger(this.removeTagInput, {
      allow_duplicates: false,
//      allow_spaces: false,
      add_on_blur: true,
      wrap: true,
    });
//    this.init()

    hotkeys("shift+left,shift+up", (e) => {
      if (this.els && this.els.length > 0) {
        let prev = this.els[0].previousSibling
        if (prev) {
          e.preventDefault()
          e.stopPropagation()
          this.els = [prev].concat(this.els)
          this.ds.setSelection(this.els)
          prev.scrollIntoView({ behavior: "smooth", block: "end" })
          this.update(this.els)
        }
      }
    })
    hotkeys("shift+right,shift+down", (e) => {
      if (this.els && this.els.length > 0) {
        let next = this.els[this.els.length-1].nextSibling
        if (next) {
          e.preventDefault()
          e.stopPropagation()
          this.els = this.els.concat(next)
          this.ds.setSelection(this.els)
          next.scrollIntoView({ behavior: "smooth", block: "start" })
          this.update(this.els)
        }
      }
    })
    hotkeys("left,up", (e) => {
      if (this.els && this.els.length > 0) {
        let prev = this.els[0].previousSibling
        if (prev) {
          e.preventDefault()
          e.stopPropagation()
          this.els = [prev]
          this.ds.setSelection(this.els)
          prev.scrollIntoView({ behavior: "smooth", block: "end" })
          this.update(this.els)
        }
      }
    })
    hotkeys("right,down", (e) => {
      if (this.els && this.els.length > 0) {
        let next = this.els[this.els.length-1].nextSibling
        if (next) {
          e.preventDefault()
          e.stopPropagation()
          this.els = [next]
          this.ds.setSelection(this.els)
          next.scrollIntoView({ behavior: "smooth", block: "end" })
          this.update(this.els)
        }
      }
    })
    hotkeys("delete,backspace", async (e) => {
      await this.del()
    })
    hotkeys("escape", (e) => {
      for(let el of this.els) {
        el.classList.remove("expanded")
        el.classList.remove("fullscreen")
      }
      this.els = []
      this.ds.setSelection(this.els)
      this.update(this.els)
    })
    hotkeys("enter", (e) => {
      if (this.els && this.els.length > 0) {
        let target = this.els[0]
        if (target) {
          e.preventDefault()
          e.stopPropagation()
          target.classList.toggle("expanded")
          target.scrollIntoView({ behavior: "smooth", block: "end" })
        }
      }
    })
    document.querySelector(".container").ondragstart = (event) => {
      event.preventDefault()
      event.stopPropagation()
      let filenames = this.els.map((el) => {
        return el.querySelector("img").getAttribute("data-src")
      })
      if (this.els.length > 0) {
        this.ds.setSelection(this.els)
      }
      window.electronAPI.startDrag(filenames)
    }
    document.querySelector("#cancel-selection").addEventListener("click", async (e) => {
      this.ds.setSelection([])
      this.update([])
    })
    document.querySelector("#tag-menu").addEventListener("click", async (e) => {
      e.preventDefault()
      e.stopPropagation()
      document.querySelector(".tag-menu-items").classList.toggle("hidden")
      document.querySelector(".tag-menu-collapsed").classList.toggle("hidden")
      document.querySelector(".tag-menu-expanded").classList.toggle("hidden")
    })
    document.querySelector("#remove-tags").addEventListener("click", async (e) => {
      let tags = this.removeTagInput.value.split(",")
      let selected = this.els.map((el) => {
        return el.getAttribute("data-src")
      })
      let response = await window.electronAPI.gm({
        cmd: "set",
        args: [
          selected,
          [{
            key: "dc:subject",
            val: tags,
            mode: "delete"
          }]
        ]
      })
      let paths = this.els.map((el) => {
        return {
          file_path: el.getAttribute("data-src"),
          root_path: el.getAttribute("data-root")
        }
      })
      await this.app.synchronize(paths, async () => {
        document.querySelector("footer").classList.add("hidden")
        this.els = []
        document.querySelector(".status").innerHTML = ""
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.app.search(query)
        } else {
          await this.app.search()
        }
        bar.go(100)
      })
    })
    document.querySelector("#save-tags").addEventListener("click", async (e) => {

      let tags = this.addTagInput.value.split(",")
      let selected = this.els.map((el) => {
        return el.getAttribute("data-src")
      })
      let response = await window.electronAPI.gm({
        cmd: "set",
        args: [
          selected,
          [{
            key: "dc:subject",
            val: tags,
            mode: "merge"
          }]
        ]
      })
      let items = tags.map((x) => {
        if (x.split(" ").length > 1) {
          return `tag:"${x}"`
        } else {
          return "tag:" + x
        }
      })
      let paths = this.els.map((el) => {
        return {
          file_path: el.getAttribute("data-src"),
          root_path: el.getAttribute("data-root")
        }
      })
      await this.app.synchronize(paths, async () => {
        document.querySelector("footer").classList.add("hidden")
        this.els = []
        document.querySelector(".status").innerHTML = ""
        let query = items.join(" ")
        if (query && query.length > 0) {
          await this.app.search(query)
        } else {
          await this.app.search()
        }
        this.app.bar.go(100)
      })

    })
    document.querySelector("#delete-selected").addEventListener("click", async (e) => {
      const confirmed = confirm("Delete the selected files from your device?")
      if (confirmed) {
        await this.del()
      }
    })
  }
  init () {
    if (!this.ds) {
      this.ds = new DragSelect({
        selectables: document.querySelectorAll('.card'),
        area: document.querySelector(".content"),
        draggability: false,
      });
      this.ds.subscribe('callback', async (e) => {
        console.log("e", e)
        console.log("callback", e.items)
        if (e.items && e.items.length > 0) {
          // reset tags
          this.update(e.items)
        } else {
          this.els = []
          document.querySelector("footer").classList.add("hidden")
        }
      });
    }
  }
  async del() {
    let selected = this.els.map((el) => {
      return el.getAttribute("data-src")
    })
    await window.electronAPI.del(selected)
    let res = await this.app.db.files.where("file_path").anyOf(selected).delete()
    for(let el of this.els) {
      el.classList.remove("expanded")
      el.classList.add("removed")
      setTimeout(() => {
        el.remove()
      }, 1000)
    }
    document.querySelector("footer").classList.add("hidden")
    this.els = []
    this.ds.clearSelection()
  }
  update (items) {
    console.log("update", items)
//    this.ds.setSelection(items)
    let addTagItems = this.addTagInput.value.split(",")
    for(let tagItem of addTagItems) {
      this.addtags.remove_tag(tagItem)
    }
    let removeTagItems = this.removeTagInput.value.split(",")
    for(let tagItem of removeTagItems) {
      this.removetags.remove_tag(tagItem)
    }
    document.querySelector(".selected-count .counter").innerHTML = items.length;
    this.els = items
    if (items.length > 0) {
      document.querySelector("footer").classList.remove("hidden")
    } else {
      document.querySelector("footer").classList.add("hidden")
    }
  }
}
