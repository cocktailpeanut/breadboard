async function persist() {
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


var theme;
var forceSynchronize = false;
var bar = new Nanobar({
  //target: document.querySelector(".container")
  //target: document.querySelector("body")
  target: document.querySelector("#bar")
});
var worker
var db;

var counter
var sorter = {
  direction: -1,
  column: "btime",
  compare: 0
};
let addTagInput = document.querySelector('#add-tag-field')
let addtags = tagger(addTagInput, {
  allow_duplicates: false,
  allow_spaces: false,
  add_on_blur: true,
  wrap: true,
});
let removeTagInput = document.querySelector('#remove-tag-field')
let removetags = tagger(removeTagInput, {
  allow_duplicates: false,
  allow_spaces: false,
  add_on_blur: true,
  wrap: true,
});

const deleteSelection = async () => {
  let selected = selectedEls.map((el) => {
    return el.getAttribute("data-src")
  })
  await window.electronAPI.del(selected)
  let res = await db.files.where("file_path").anyOf(selected).delete()
  for(let el of selectedEls) {
    el.classList.remove("expanded")
    el.classList.add("removed")
    setTimeout(() => {
      el.remove()
    }, 1000)
  }
  document.querySelector("footer").classList.add("hidden")
  selectedEls = []
  ds.clearSelection()
}

document.querySelector("#prev").addEventListener("click", (e) => {
  history.back()
})
document.querySelector("#next").addEventListener("click", (e) => {
  history.forward()
})
document.querySelector("#favorites").addEventListener("click", async (e) => {
  history.pushState({ breadboard: "favorites" }, "")
  await renderFavorites()
})
document.querySelector("#favorite").addEventListener("click", async (e) => {
  let query = document.querySelector(".search").value
  if (query && query.length > 0) {
    let exists = await db.favorites.get({ query })
    if (exists) {
      await db.favorites.where({ query }).delete()
    } else {
      await db.favorites.put({ query })
    }
    await search(query)
  }
})
document.querySelector("#cancel-selection").addEventListener("click", async (e) => {
  ds.setSelection([])
  updateSelection([])
})
document.querySelector("#tag-menu").addEventListener("click", async (e) => {
  e.preventDefault()
  e.stopPropagation()
  document.querySelector(".tag-menu-items").classList.toggle("hidden")
  document.querySelector(".tag-menu-collapsed").classList.toggle("hidden")
  document.querySelector(".tag-menu-expanded").classList.toggle("hidden")
})
document.querySelector("#remove-tags").addEventListener("click", async (e) => {
  let tags = removeTagInput.value.split(",")
  let selected = selectedEls.map((el) => {
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
  let paths = selectedEls.map((el) => {
    return {
      file_path: el.getAttribute("data-src"),
      root_path: el.getAttribute("data-root")
    }
  })
  await synchronize(paths, async () => {
    document.querySelector("footer").classList.add("hidden")
    selectedEls = []
    document.querySelector(".status").innerHTML = ""
    let query = document.querySelector(".search").value
    if (query && query.length > 0) {
      await search(query)
    } else {
      await search()
    }
    bar.go(100)
  })
})
document.querySelector("#save-tags").addEventListener("click", async (e) => {

  let tags = addTagInput.value.split(",")
  let selected = selectedEls.map((el) => {
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
    return "tag:" + x
  })
  let paths = selectedEls.map((el) => {
    return {
      file_path: el.getAttribute("data-src"),
      root_path: el.getAttribute("data-root")
    }
  })
  await synchronize(paths, async () => {
    document.querySelector("footer").classList.add("hidden")
    selectedEls = []
    document.querySelector(".status").innerHTML = ""
    let query = items.join(" ")
    if (query && query.length > 0) {
      await search(query)
    } else {
      await search()
    }
    bar.go(100)
  })

//  let selected = selectedEls.map((el) => {
//    return el.getAttribute("data-src")
//  })
//  await db.files.where("file_path").anyOf(selected).modify((x) => {
//    // get the existing tokens SANS the new tokens
//    let tokens = x.tokens.filter((token) => {
//      return !items.includes(token)
//    })
//    x.tokens = tokens.concat(items)
//  });

})
document.querySelector("#delete-selected").addEventListener("click", async (e) => {
  const confirmed = confirm("Delete the selected files from your device?")
  if (confirmed) {
    await deleteSelection()
  }
})
document.querySelector("nav select").addEventListener("change", async (e) => {
  if (e.target.value === "1") {
    sorter = {
      direction: -1,
      column: "btime",
      compare: 0, // numeric compare
    }
  } else if (e.target.value === "2") {
    sorter = {
      direction: 1,
      column: "btime",
      compare: 0, // numeric compare
    }
  } else if (e.target.value === "3") {
    sorter = {
      direction: 1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }
  } else if (e.target.value === "4") {
    sorter = {
      direction: -1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }
  }
  let query = document.querySelector(".search").value
  if (query && query.length > 0) {
    await search(query)
  } else {
    await search()
  }
})
document.querySelector("#help").addEventListener('click', async (e) => {
  history.pushState({ breadboard: "help" }, "")
  await renderHelp()
})
document.querySelector("#home").addEventListener('click', async (e) => {
//  await render()
  await search()
})
document.querySelector("#sync").addEventListener('click', async (e) => {
  await synchronize()
})

var syncComplete;
const synchronize = async (paths, cb) => {
  document.querySelector("#sync").classList.add("disabled")
//  await render()
  document.querySelector("#sync").disabled = true
  document.querySelector("#sync i").classList.add("fa-spin")
  if (paths) {
    document.querySelector(".status").innerHTML = "synchronizing..."
    counter = 0
    syncComplete = false
    await new Promise((resolve, reject) => {
      window.electronAPI.sync({ paths })
      let interval = setInterval(() => {
        if (syncComplete) {
          clearInterval(interval)
          resolve()
        }
      }, 1000)
    })
    if (cb) {
      await cb()
    }
  } else {
    let folderpaths = await db.folders.toArray()
    for(let folderpath of folderpaths) {
      let root_path = folderpath.name
      let c = await checkpoint(root_path)
      document.querySelector(".status").innerHTML = "synchronizing from " + root_path
      counter = 0
      syncComplete = false
      await new Promise((resolve, reject) => {
        window.electronAPI.sync({
          root_path,
          checkpoint: c,
          force: forceSynchronize
        })
        let interval = setInterval(() => {
          if (syncComplete) {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      })
    }
    counter = 0
    document.querySelector(".status").innerHTML = ""
    bar.go(100)
    let query = document.querySelector(".search").value
    if (query && query.length > 0) {
      await search(query)
    } else {
      await search()
    }
  }
//  await render()
}
const selectView = (className) => {
  let classes = ["container", "settings", "help", "favorites"].filter((x) => {
    return x !== className
  })
  for(let c of classes) {
    document.querySelector("." + c).classList.add("hidden")
  }
  document.querySelector("." + className).classList.remove("hidden")
}
const renderHelp = async () => {
  selectView("help")
  let res = [{
    name: "discord",
    description: "ask questions and share feedback",
    icon: "fa-brands fa-discord",
    href: "https://discord.gg/6MJ6MQScnX"
  }, {
    name: "twitter",
    description: "stay updated on Twitter",
    icon: "fa-brands fa-twitter",
    href: "https://twitter.com/cocktailpeanut"
  }, {
    name: "github",
    description: "feature requests and bug report",
    icon: "fa-brands fa-github",
    href: "https://github.com/cocktailpeanut/breadboard/issues"
  }]
  let rows = res.map((r) => {
    return `<a class='item' href="${r.href}" target="_blank">
<div><b><i class="${r.icon}"></i> ${r.name}</b>: ${r.description}</div>
</a>`
  }).join("")
  document.querySelector(".help").innerHTML = `<main>
  <div class='header'>
    <h2>Getting Started</h2>
  </div>
  <div class='rows'>
    <a href="https://breadboard.me" target="_blank" class='item'><b><i class="fa-solid fa-book"></i> Breadboard Manual</b>: Learn how to use breadboard</a>
  </div>
  <br><br>
  <div class='header'>
    <h2>Help</h2>
  </div>
<div class='rows'>
${rows}
</div>
</main>`
}
const renderFavorites = async () => {
  selectView("favorites")
  let res = await db.favorites.toArray()
  let rows = res.map((r) => {
    return `<div class='row'><div class='favorite-item' data-val="${r.query}"><i class="fa-solid fa-star"></i> ${r.query}</div></div>`
  }).join("")

  document.querySelector(".favorites").innerHTML = `<main>
  <div class='header'>
    <h2>Saved</h2>
    <div class='flexible'></div>
  </div>
  <div class='rows'>
  ${rows}
  </div>
</main>`
  document.querySelector(".favorites .rows").addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    let target = (e.target.classList.contains("favorite-item") ? e.target : e.target.closest(".favorite-item"))
    if (target) {
      let query = target.getAttribute("data-val")
      await search(query)
    }
  })
}
const renderSettings = async () => {
  selectView("settings")

  let res = await db.folders.toArray()
  let rows = res.map((r) => {
    return `<div class='row'>
    <div>${r.name}</div><div class='flexible'></div><button class='del' data-name='${r.name}'><i class="fa-regular fa-trash-can"></i></button>
</div>`
  }).join("")

  let currentZoom = await db.settings.where({ key: "zoom" }).first()
  let zoom;
  if (currentZoom) {
    zoom = currentZoom.val
  } else {
    zoom = window.electronAPI.getzoom() * 100
  }

  document.querySelector(".settings").innerHTML = `<main>
  <div class='header'>
    <h2>Version</h2>
  </div>
  <div class='rows'>
    <div class='row'>${VERSION}</div>
  </div>
  <br><br>
  <div class='header'>
    <h2>Connected Folders</h2>
    <div class='flexible'></div>
    <button id='select'><i class="fa-solid fa-folder-plus"></i> Add a folder</button>
  </div>
  <div class='rows'>
  ${rows}
  </div>
  <br><br>
  <div class='header'>
    <h2>Theme</h2>
    <div class='flexible'></div>
  </div>
  <div class='rows'>
    <div class='row'>
      <button id='dark-theme'><i class="fa-solid fa-moon"></i> Dark</button>
      <button id='default-theme'><i class="fa-regular fa-sun"></i> Light</button>
    </div>
  </div>
  <br><br>
  <div class='header'>
    <h2>Zoom</h2>
    <div class='flexible'></div>
  </div>
  <div class='rows'>
    <div class='row currentZoom'>${zoom}%</div>
    <div class='row'>
      <input type='range' min="50" max="200" value="${zoom}" step="1">
    </div>
  </div>
  <br><br>
  <div class='header'>
    <h2>Re-index</h2>
    <div class='flexible'></div>
  </div>
  <div class='rows'>
    <div class='row'>
      <button id='reindex'><i class="fa-solid fa-rotate"></i> Re-index</button>
    </div>
  </div>
</main>`
  document.querySelector("input[type=range]").addEventListener("change", async (e) => {
    window.electronAPI.zoom(e.target.value)
    await db.settings.put({ key: "zoom", val: e.target.value })
    e.target.closest(".rows").querySelector(".currentZoom").innerHTML = "" + e.target.value + "%"
  })
  document.querySelector("#reindex").addEventListener("click", async () => {
    // reset the indexedDB
    await db.files.clear()
    await db.checkpoints.clear()
    // force synchronize
    forceSynchronize = true
    await synchronize()
    forceSynchronize = false
  })
  document.querySelector("#select").addEventListener('click', async () => {
    let paths = await window.electronAPI.select()
    for(let name of paths) {
      await db.folders.put({ name: name })
    }
    await renderSettings()
    setTimeout(async () => {
      await synchronize()
    }, 1000)
  })
  document.querySelector(".settings .rows").addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    let target = (e.target.classList.contains("del") ? e.target : e.target.closest(".del"))
    if (target) {
      let name = target.getAttribute("data-name")
      await db.folders.where({ name }).delete()
      await renderSettings()
    }
  })
  document.querySelector("#dark-theme").addEventListener('click', async () => {
    await db.settings.put({ key: "theme", val: "dark" })
    await init_theme()
  })
  document.querySelector("#default-theme").addEventListener('click', async () => {
    await db.settings.put({ key: "theme", val: "default" })
    await init_theme()
  })
  settingsRendered = true
}
document.querySelector("#settings").addEventListener('click', async () => {
  history.pushState({ breadboard: "settings" }, "")
  await renderSettings()
})
document.querySelector(".search").addEventListener('input', (e) => {
  debouncedSearch(e.target.value)
})
document.querySelector(".container").ondragstart = (event) => {
  event.preventDefault()
  event.stopPropagation()
  let filenames = selectedEls.map((el) => {
    return el.querySelector("img").getAttribute("data-src")
  })
  if (selectedEls.length > 0) {
    ds.setSelection(selectedEls) 
  }
  window.electronAPI.startDrag(filenames)
}

function debounce(func, timeout = 1000){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

const card = (meta) => {
  let attributes = Object.keys(meta).map((key) => {
    return { key, val: meta[key] }
  })
  let times = `<tr><td>created</td><td>${timeago.format(meta.btime)}</td><td></td></tr>
<tr><td>modified</td><td>${timeago.format(meta.mtime)}</td><td></td></tr>`
  let trs = attributes.filter((attr) => {
    //return attr.key !== "app" && attr.key !== "tokens"
    return attr.key !== "root_path"
  }).map((attr) => {
    let el
    if (attr.key === "model_name" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "agent" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "tokens" && attr.val && attr.val.length > 0) {
      let els = attr.val.filter((x) => {
        return x.startsWith("tag:")
      }).map((x) => {
        return `<span>
<button data-tag="${x}" class='tag-item'><i class="fa-solid fa-tag"></i> ${x.replace("tag:", "")}</button>
<button data-tag="${x}" class='del-item'><i class="fa-solid fa-xmark"></i></button>
</span>`
      })
      el = els.join("")
      attr.key = "tags"
    } else if (attr.key === "prompt" && attr.val) {
      let tokens = attr.val.split(" ").filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join(" ")
    } else if (attr.key === "file_path" && attr.val) {
      let tokens = attr.val.split(/[\/\\]/).filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join("/")
    } else {
      el = attr.val
    }

    if (attr.key === "tags") {
      return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='edit-td'><button class='edit-tags' data-value="${attr.val}"><i class="fa-solid fa-pen-to-square"></i> <span>edit</span></button></td></tr>`
//    } else if (attr.key === "file_path") {
//      return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='edit-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button><button data-src="${attr.val}" class='open-file'><i class="fa-solid fa-up-right-from-square"></i> <span>open</span></button></td></tr>`
    } else {
      return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='copy-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button></td></tr>`
    }
  }).join("")
  //return `<div class='grab'><i class="fa-solid fa-circle"></i></div>
  //return `<div class='grab'><i class="fa-regular fa-square"></i></div>
  return `<div class='grab'></div>
<img loading='lazy' data-root="${meta.root_path}" data-src="${meta.file_path}" src="/file?file=${encodeURIComponent(meta.file_path)}">
<div class='col'>
  <h4 class='flex'>${meta.prompt}</h4>
  <div class='xmp'>
    <div class='xmp-header'>
      <button class='view-xmp' data-src="${meta.file_path}"><i class="fa-solid fa-code"></i> View XML</button>
      <!--
      <button data-src="${meta.file_path}" class='open-file'><i class="fa-solid fa-up-right-from-square"></i> Open</button>
      <button data-src="/file?file=${encodeURIComponent(meta.file_path)}" class='full-screen'><i class="fa-solid fa-maximize"></i> Fullscreen</button>
      -->
    </div>
    <textarea readonly class='hidden slot'></textarea>
  </div>
  <table>${times}${trs}</table>
</div>
<div class='extra-buttons'>
  <button data-src="${meta.file_path}" class='open-file'><i class="fa-solid fa-up-right-from-square"></i></button>
  <br>
  <button class='gofullscreen'><i class="fa-solid fa-expand"></i></button>
</div>`
}

const stripPunctuation = (str) => {
  return str.replace(/(^[^\p{L}\s]|[^\p{L}\s]$)/gu,"")
}

const includeSearch = (key, val) => {
  // find the key in query
  let query = document.querySelector(".search").value
  let t = query.split(" ").filter(x => x.length > 0)

  // find prompt search tokens (no :)
  let existingPromptTokens = []
  let existingAdvancedTokens = []


  let changed

  // 1. split the t array into existingPromptTokens and existingAdvancedTokens array
  for(let token of t) {
    if (/[^:]+:/.test(token)) {
      existingAdvancedTokens.push(token)
    } else {
      existingPromptTokens.push(token)
    }
  }

  let existingPrompts = JSON.stringify(existingPromptTokens)
  let existingAdvanced = JSON.stringify(existingAdvancedTokens)


  if (key === "prompt") {
    // 2. if the 'key' filter is 'prompt'
      // find whether the 'val' is included in the existingPromptTokens array
      // if it is included, don't do anything
      // if it's not included, append it to existingPromptTokens array
    let exists
    // tag: doesn't need to be cleaned. only search keywords need to be cleaned
    let cleaned = (val.startsWith("tag:") ? val : stripPunctuation(val))
    for(let i=0; i<existingPromptTokens.length; i++) {
      let token = existingPromptTokens[i]
      if (token === cleaned) {
        exists = true
      }
    }
    if (!exists) {
      existingPromptTokens.push(cleaned)
    }
  } else {
    // 3. if the 'key' filter is not 'prompt'
      // find whether the existingAdvancedTokens array contains any of the 'key' filter
      // if it does, replace the existingAdvancedTokens array with the new 'key' filter
      // if it doesn't, append the 'key' filter to the end of the existingAdvancedTokens array
    let exists
    for(let i=0; i<existingAdvancedTokens.length; i++) {
      let token = existingAdvancedTokens[i]
      if (token.startsWith(key + ":")) {
        existingAdvancedTokens[i] = key + ":" + val
        exists = true
      }
    }
    if (!exists) {
      existingAdvancedTokens.push(key + ":" + val) 
    }
  }



  let result = []
  for(let token of existingPromptTokens) {
    result.push(token)
  }
  for(let token of existingAdvancedTokens) {
    result.push(token)
  }

  if (existingPrompts === JSON.stringify(existingPromptTokens) && existingAdvanced === JSON.stringify(existingAdvancedTokens)) {
    // do nothing because they are identical before and after
  } else {
    // there's a change. re render
    let newQuery = result.join(" ")
    search(newQuery)
    //document.querySelector(".search").dispatchEvent(new Event('input'))
  }
    

}


window.electronAPI.onMsg(async (_event, value) => {
  if (value.$type === "update") {
    let el = document.querySelector("#notification")
    el.classList.remove("hidden")
    tippy(el, {
      interactive: true,
      trigger: 'click',
      content: `<div class='notification-popup'>
  <h2>${value.latest.title}</h2>
  <div>${value.latest.content}</div>
  <div><a href='${value.$url}' id='get-update' target="_blank">Get update</a></div>
</div>`,
      allowHTML: true,
    });
  } else {
    let div = document.createElement("div")
    div.className = "card"
    queueMicrotask(async () => {
      if (value.meta) {
        let response = await insert(value.meta).catch((e) => {
          console.log("ERROR", e)
        })
      }
      counter++;
      if (counter === value.total) {
        syncComplete = true 
      }
      let ratio = value.progress/value.total
      bar.go(100*value.progress/value.total);
    })
  }
})
var viewer;
document.querySelector(".container").addEventListener("click", async (e) => {
  e.preventDefault()
  e.stopPropagation()
  let colTarget = (e.target.classList.contains(".col") ? e.target : e.target.closest(".col"))
  let fullscreenTarget = (e.target.classList.contains(".gofullscreen") ? e.target : e.target.closest(".gofullscreen"))
  let clipboardTarget = (e.target.classList.contains(".copy-text") ? e.target : e.target.closest(".copy-text"))
  let editTagsTarget = (e.target.classList.contains(".edit-tags") ? e.target : e.target.closest(".edit-tags"))
  let tokenTarget = (e.target.classList.contains(".token") ? e.target : e.target.closest(".token"))
  let tagTarget = (e.target.classList.contains(".tag-item") ? e.target : e.target.closest(".tag-item"))
  let grabTarget = (e.target.classList.contains(".grab") ? e.target : e.target.closest(".grab"))
  let openFileTarget = (e.target.classList.contains(".open-file") ? e.target : e.target.closest(".open-file"))
  let displayMetaTarget = (e.target.classList.contains(".view-xmp") ? e.target : e.target.closest(".view-xmp"))
  let card = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
  if (card) card.classList.remove("fullscreen")
  if (fullscreenTarget) {
    viewer.show()
  } else if (grabTarget) {
  } else if (openFileTarget && e.target.closest(".card.expanded")) {
    window.electronAPI.open(openFileTarget.getAttribute("data-src"))
  } else if (tokenTarget && e.target.closest(".card.expanded")) {
    let key = tokenTarget.closest("tr").getAttribute("data-key")
    let val = tokenTarget.getAttribute("data-value")
    includeSearch(key, val)
  } else if (tagTarget && e.target.closest(".card.expanded")) {
    let tag = tagTarget.getAttribute("data-tag")
    includeSearch("prompt", tag)
  } else if (editTagsTarget && e.target.closest(".card.expanded")) {
    editTagsTarget.closest("tr").classList.toggle("edit-mode")
  } else if (displayMetaTarget) {
    let file_path = displayMetaTarget.getAttribute("data-src")
    let xml = await window.electronAPI.xmp(file_path)
    let textarea = displayMetaTarget.closest(".xmp").querySelector(".slot")
    textarea.classList.toggle("hidden")
    textarea.value = xml;
    textarea.style.height = "" + (textarea.scrollHeight + 2) + "px";
  } else if (colTarget && e.target.closest(".card.expanded")) {
    // if clicked inside the .col section when NOT expanded, don't do anything.
    // except the clipboard button
    // if the clicked element is the delete button, delete
    if (clipboardTarget) {
      window.electronAPI.copy(clipboardTarget.getAttribute("data-value"))
      clipboardTarget.querySelector("i").classList.remove("fa-regular")
      clipboardTarget.querySelector("i").classList.remove("fa-clone")
      clipboardTarget.querySelector("i").classList.add("fa-solid")
      clipboardTarget.querySelector("i").classList.add("fa-check")
      clipboardTarget.querySelector("span").innerHTML = "copied"

      setTimeout(() => {
        clipboardTarget.querySelector("i").classList.remove("fa-solid")
        clipboardTarget.querySelector("i").classList.remove("fa-check")
        clipboardTarget.querySelector("i").classList.add("fa-regular")
        clipboardTarget.querySelector("i").classList.add("fa-clone")
        clipboardTarget.querySelector("span").innerHTML = "copy"
      }, 1000)
    }
  } else {
    let target = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
    if (target) {
      target.classList.toggle("expanded")
      if (target.classList.contains("expanded")) {
        let img = target.querySelector("img").cloneNode()
        let scaleFactor = Math.min(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight)
        if (viewer) viewer.destroy()
        viewer = new Viewer(img, {
          transition: false,
          viewed() {
            viewer.zoomTo(scaleFactor)
          },
        });
      }
    }
  }
})

hotkeys("shift+left,shift+up", function(e) {
  if (selectedEls && selectedEls.length > 0) {
    let prev = selectedEls[0].previousSibling
    if (prev) {
      e.preventDefault()
      e.stopPropagation()
      selectedEls = [prev].concat(selectedEls)
      ds.setSelection(selectedEls)
      prev.scrollIntoView({ behavior: "smooth", block: "end" })
      updateSelection(selectedEls)
    }
  }
})
hotkeys("shift+right,shift+down", function(e) {
  if (selectedEls && selectedEls.length > 0) {
    let next = selectedEls[selectedEls.length-1].nextSibling
    if (next) {
      e.preventDefault()
      e.stopPropagation()
      selectedEls = selectedEls.concat(next)
      ds.setSelection(selectedEls)
      next.scrollIntoView({ behavior: "smooth", block: "start" })
      updateSelection(selectedEls)
    }
  }
})
hotkeys("left,up", function(e) {
  if (selectedEls && selectedEls.length > 0) {
    let prev = selectedEls[0].previousSibling
    if (prev) {
      e.preventDefault()
      e.stopPropagation()
      selectedEls = [prev]
      ds.setSelection(selectedEls)
      prev.scrollIntoView({ behavior: "smooth", block: "end" })
      updateSelection(selectedEls)
    }
  }
})
hotkeys("right,down", function(e) {
  if (selectedEls && selectedEls.length > 0) {
    let next = selectedEls[selectedEls.length-1].nextSibling
    if (next) {
      e.preventDefault()
      e.stopPropagation()
      selectedEls = [next]
      ds.setSelection(selectedEls)
      next.scrollIntoView({ behavior: "smooth", block: "end" })
      updateSelection(selectedEls)
    }
  }
})
hotkeys("delete,backspace", async function(e) {
  await deleteSelection()
})
hotkeys("escape", function(e) {
  for(let el of selectedEls) {
    el.classList.remove("expanded")
    el.classList.remove("fullscreen")
  }
  selectedEls = [] 
  ds.setSelection(selectedEls)
  updateSelection(selectedEls)
})
hotkeys("enter", function(e) {
  if (selectedEls && selectedEls.length > 0) {
    let target = selectedEls[0]
    if (target) {
      e.preventDefault()
      e.stopPropagation()
      target.classList.toggle("expanded")
      target.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }
})


var compiledInsert;
const checkpoint = async (root_path) => {
  let cp = await db.checkpoints.where({ root_path }).first()
  if (cp) return cp.btime
  else return null
}


let checkpoints = { }

const updateCheckpoint = async (root_path, btime) => {
  let cp = await db.checkpoints.put({ root_path, btime })
  checkpoints[root_path] = btime
}
const insert = async (o) => {
  let tokens = []
  let wordSet = {}
  if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
    wordSet = o.prompt.split(' ')
    .map((x) => {
      return stripPunctuation(x)
    })
    .reduce(function (prev, current) {
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

  await db.files.put({ ...o, tokens })

  if (checkpoints[o.root_path]) {
    if (checkpoints[o.root_path] < o.btime) {
      await updateCheckpoint(o.root_path, o.btime)
    }
  } else {
    let cp = await db.checkpoints.where({ root_path: o.root_path }).first()   
    if (cp) {
      if (cp < o.btime) {
        await updateCheckpoint(o.root_path, o.btime)
      }
    } else {
      await updateCheckpoint(o.root_path, o.btime)
    }
  }
}
var clusterize;
var selected = []
var selectedEls = []
var ds;
var rendered
var settingsRendered
const updateSelection = (items) => {
  let addTagItems = addTagInput.value.split(",")
  for(let tagItem of addTagItems) {
    addtags.remove_tag(tagItem)
  }
  let removeTagItems = removeTagInput.value.split(",")
  for(let tagItem of removeTagItems) {
    removetags.remove_tag(tagItem)
  }
  document.querySelector(".selected-count .counter").innerHTML = items.length;
  selectedEls = items
  if (items.length > 0) {
    document.querySelector("footer").classList.remove("hidden")
  } else {
    document.querySelector("footer").classList.add("hidden")
  }
}
const search = async (query, silent) => {
  if (!silent) {
    history.pushState({ query }, "")
  }
  if (query && query.length > 0) {
    document.querySelector("#favorite").classList.remove("hide")
  } else {
    document.querySelector("#favorite").classList.add("hide")
  }
  document.querySelector(".search").value = (query && query.length ? query : "")
  document.querySelector("footer").classList.add("hidden")
  document.querySelector(".loading").classList.remove("hidden")
  document.querySelector(".container").classList.add("hidden")
  if (query) {
    let favorited = await db.favorites.get(query)
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
  worker.postMessage({ query, sorter })
}
const render = () => {
  selectView("container")
  document.querySelector(".loading").classList.add("hidden")
}
const debouncedSearch = debounce(search)
const initdb = async () => {
  db = new Dexie("breadboard")
  db.version(1).stores({
    //files: "app, model, prompt, sampler, weight, steps, cfg_scale, height, width, seed, negative_prompt, mtime, ctime, &filename",
    //files: "path, model, app, prompt, ctime, *tokens",
    files: "file_path, agent, model_name, root_path, prompt, btime, *tokens",
    folders: "&name",
    checkpoints: "&root_path, btime",
    settings: "key, val",
    favorites: "query"
  })
  await persist()
}
const fillContainer = async (items) => {

  const chunkSize = 800;
  document.querySelector(".content").innerHTML = ""
  document.querySelector(".container").classList.remove("hidden")
  document.querySelector(".status").innerHTML = "Loading..."
  console.time("render")
  for (let i=0; i<items.length; i+=chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    let frag = document.createDocumentFragment();
    for(let item of chunk) {
      let el = document.createElement("div")
      el.className = "card"
      el.setAttribute("data-root", item.root_path)
      el.setAttribute("data-src", item.file_path)
      el.innerHTML = card(item)
      frag.appendChild(el)
    }
    document.querySelector(".content").appendChild(frag)
    await new Promise(resolve => setTimeout(resolve, 0));
    bar.go(100 * i/items.length);
  }
  console.timeEnd("render")
  bar.go(100)
  document.querySelector(".status").innerHTML = ""



//  document.querySelector(".content").innerHTML = items.map((item) => {
//    return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item)}</div>`
//  }).join("")
}
const initworker = () => {
  worker = new Worker("./worker.js")
  worker.onmessage = async function(e) {

    await fillContainer(e.data)

    render()

    setTimeout(() => {
      clusterize = new Clusterize({
        scrollElem: document.querySelector(".container"),
        contentElem: document.querySelector(".content"),
        rows_in_block: 500,
        blocks_in_cluster: 10
      });
      document.querySelector("#sync").classList.remove("disabled")
      document.querySelector("#sync").disabled = false
      document.querySelector("#sync i").classList.remove("fa-spin")



      // dragselect
      if (ds) ds.stop()
      ds = new DragSelect({
        selectables: document.querySelectorAll('.card'),
        area: document.querySelector(".content"),
        draggability: false,
      });
      ds.subscribe('callback', async (e) => {
        if (e.items && e.items.length > 0) {
          // reset tags
          updateSelection(e.items)
        } else {
          selectedEls = []
          document.querySelector("footer").classList.add("hidden")
        }
      });
    }, 0)
  }
}
const init_theme = async () => {
  theme = await db.settings.where({ key: "theme" }).first()
  if (!theme) theme = { val: "default" }
  document.body.className = theme.val
}
const init_zoom = async () => {
  let zoom = await db.settings.where({ key: "zoom" }).first()
  if (zoom) {
    window.electronAPI.zoom(zoom.val)
  }
}
const bootstrap_db = async () => {
  let defaults = await window.electronAPI.defaults()
  for(let d of defaults) {
    await db.folders.put({ name: d }).catch((e) => { })
  }
  await db.settings.put({ key: "version", val: VERSION })
}
(async () => {
  console.log("INIT", VERSION)
  let selector = new TomSelect("nav select", {
    onDropdownClose: () => {
      selector.blur()
    }
  })
  await initdb()
  try {
    let current_version = await db.settings.where({ key: "version" }).first()
    if (current_version.val === VERSION) {
      await init_theme()
      await init_zoom()
      initworker()
      await synchronize()
    } else {
      //await db.delete()
      await db.files.clear()
      await db.checkpoints.clear()
      await initdb()
      await bootstrap_db()
      await init_theme()
      await init_zoom()
      initworker()
      await synchronize()
    }
  } catch (e) {
    //await db.delete()
    await db.files.clear()
    await db.checkpoints.clear()
    await initdb()
    await bootstrap_db()
    await init_theme()
    await init_zoom()
    initworker()
    await synchronize()
  }
  window.onpopstate = async () => {
    if (history.state.breadboard) {
      // nothing
      if (history.state.breadboard === "help") {
        await renderHelp()
      } else if (history.state.breadboard === "settings") {
        await renderSettings()
      } else if (history.state.breadboard === "favorites") {
        await renderFavorites()
      }
    } else {
      await search(history.state.query, true)
    }
  }
})();
