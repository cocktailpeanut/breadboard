//var bar = new ProgressBar.Line('.container', {easing: 'easeInOut', duration: 0});


async function persist() {
  if (!navigator.storage || !navigator.storage.persisted) {
    console.log("#1")
    return "never";
  }
  let persisted = await navigator.storage.persisted();
  if (persisted) {
    console.log("#2")
    return "persisted";
  }
  if (!navigator.permissions || !navigator.permissions.query) {
    console.log("#3")
    return "prompt"; // It MAY be successful to prompt. Don't know.
  }
  const permission = await navigator.permissions.query({
    name: "persistent-storage"
  });
  if (permission.state === "granted") {
    console.log("#4")
    persisted = await navigator.storage.persist();
    if (persisted) {
      console.log("#5")
      return "persisted";
    } else {
      console.log("#6")
      throw new Error("Failed to persist");
    }
  }
  if (permission.state === "prompt") {
    console.log("#7")
    return "prompt";
  }
  console.log("#8")
  return "never";
}


var forceSynchronize = false;
var bar = new Nanobar({
  target: document.querySelector(".container")
});
var worker = new Worker("./worker.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  //files: "app, model, prompt, sampler, weight, steps, cfg_scale, height, width, seed, negative_prompt, mtime, ctime, &filename",
  //files: "path, model, app, prompt, ctime, *tokens",
  files: "file_path, model_name, root_path, prompt, btime, *tokens",
  folders: "&name",
  checkpoints: "&root_path, btime"
})
var counter
var sorter = {
  direction: -1,
  column: "btime",
  compare: 0
};
let tagInput = document.querySelector('#tag-field')
let tags = tagger(tagInput, {
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
//  document.querySelector("footer").classList.add("hidden")
  selectedEls = []
  ds.clearSelection()
}
document.querySelector("#edit-mode").addEventListener("click", async (e) => {
  document.querySelector("footer .edit-mode").classList.remove("hidden")
  document.querySelector("footer .view-mode").classList.add("hidden")
})
document.querySelector("#view-mode").addEventListener("click", async (e) => {
  document.querySelector("footer .edit-mode").classList.add("hidden")
  document.querySelector("footer .view-mode").classList.remove("hidden")
})
document.querySelector("#save-tags").addEventListener("click", async (e) => {

  let tags = tagInput.value.split(",")
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
  console.log("response", response)
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
//    document.querySelector("footer").classList.add("hidden")
    selectedEls = []
    document.querySelector(".status").innerHTML = ""
    let query = items.join(" ")
    document.querySelector(".search").value = query
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
  await deleteSelection()
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
  await renderHelp()
})
document.querySelector("#home").addEventListener('click', async (e) => {
  await render()
})
document.querySelector("#sync").addEventListener('click', async (e) => {
  e.target.classList.add("disabled")
  await synchronize()
})

var syncComplete;
const synchronize = async (paths, cb) => {
  await render()
  document.querySelector("#sync").disabled = true
  document.querySelector("#sync i").classList.add("fa-spin")
  if (paths) {
    document.querySelector(".status").innerHTML = "synchronizing..."
    counter = 0
    syncComplete = false
    await new Promise((resolve, reject) => {
      window.electronAPI.sync({ paths })
      let interval = setInterval(() => {
        console.log("counter", counter, syncComplete)
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
          console.log("counter", counter, syncComplete)
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
const renderHelp = async () => {
  document.querySelector(".container").classList.add("hidden")
  document.querySelector(".settings").classList.add("hidden")
  document.querySelector(".help").classList.remove("hidden")
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
    <h2>Help</h2>
  </div>
<div class='rows'>
${rows}
</div>
</main>`
}
const renderSettings = async () => {
  document.querySelector(".container").classList.add("hidden")
  document.querySelector(".help").classList.add("hidden")
  document.querySelector(".settings").classList.remove("hidden")


  let res = await db.folders.toArray()
  let rows = res.map((r) => {
    return `<div class='row'>
    <div>${r.name}</div><div class='flexible'></div><button class='del' data-name='${r.name}'><i class="fa-regular fa-trash-can"></i></button>
</div>`
  }).join("")

  let rows2 = [{
    name: "Hard refresh",
  }].map((r) => {
    return `<div class='row'><div>Re-index the files from scratch, just like when you first ran the app.</div></div>`
  }).join("")

  document.querySelector(".settings").innerHTML = `<main>
  <div class='header'>
    <h2>Tracked Folders</h2>
    <div class='flexible'></div>
    <button id='select'>Add a folder</button>
  </div>
  <div class='rows'>
  ${rows}
  </div>
  <br><br>
  <div class='header'>
    <h2>Re-index</h2>
    <div class='flexible'></div>
    <button id='reindex'><i class="fa-solid fa-rotate"></i> Re-index</button>
  </div>
  <div class='rows'>
  ${rows2}
  </div>
</main>`
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
  settingsRendered = true
}
document.querySelector("#settings").addEventListener('click', async () => {
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
      if (els.length > 0) {
        console.log("el", el)
      }
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
    } else if (attr.key === "file_path") {
      return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='edit-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button><button data-src="${attr.val}" class='open-file'><i class="fa-solid fa-up-right-from-square"></i> <span>open</span></button></td></tr>`
    } else {
      return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='copy-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button></td></tr>`
    }
  }).join("")
  return `<img loading='lazy' data-root="${meta.root_path}" data-src="${meta.file_path}" src="/file?file=${encodeURIComponent(meta.file_path)}">
<div class='col'>
  <h4 class='flex'>${meta.prompt}</h4>
  <table>${times}${trs}</table>
</div>
<button class='gofullscreen'><i class="fa-solid fa-expand"></i></button>`
}

const stripPunctuation = (str) => {
  return str.replace(/(^[^\p{L}\s]|[^\p{L}\s]$)/gu,"")
}

const includeSearch = (key, val) => {
  console.log("includeSearch", key, val)
  // find the key in query
  let query = document.querySelector(".search").value
  let t = query.split(" ").filter(x => x.length > 0)
  console.log("t", t)

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
      console.log({ token, cleaned })
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
  console.log("result", result)


  if (existingPrompts === JSON.stringify(existingPromptTokens) && existingAdvanced === JSON.stringify(existingAdvancedTokens)) {
    // do nothing because they are identical before and after
  } else {
    // there's a change. re render
    let newQuery = result.join(" ")
    document.querySelector(".search").value = newQuery
    search(newQuery)
    //document.querySelector(".search").dispatchEvent(new Event('input'))
  }
    

}


window.electronAPI.onMsg(async (_event, value) => {
  console.log("MSG", value)
  let div = document.createElement("div")
  div.className = "card"
  queueMicrotask(async () => {
    if (value.meta) {
      let response = await insert(value.meta).catch((e) => {
        console.log("ERROR", e)
      })
    }
    counter++;
    console.log("counter, total", counter, value.total)
    if (counter === value.total) {
      syncComplete = true 
    }
    console.log("counter", counter)
    let ratio = value.progress/value.total
//    if (ratio < 1) {
      bar.go(100*value.progress/value.total);
//    }
  })
})
document.querySelector(".container").addEventListener("click", async (e) => {
  e.preventDefault()
  e.stopPropagation()
  let colTarget = (e.target.classList.contains(".col") ? e.target : e.target.closest(".col"))
  let fullscreenTarget = (e.target.classList.contains(".gofullscreen") ? e.target : e.target.closest(".gofullscreen"))
  let clipboardTarget = (e.target.classList.contains(".copy-text") ? e.target : e.target.closest(".copy-text"))
  let editTagsTarget = (e.target.classList.contains(".edit-tags") ? e.target : e.target.closest(".edit-tags"))
  let tokenTarget = (e.target.classList.contains(".token") ? e.target : e.target.closest(".token"))
  let tagTarget = (e.target.classList.contains(".tag-item") ? e.target : e.target.closest(".tag-item"))
  let openFileTarget = (e.target.classList.contains(".open-file") ? e.target : e.target.closest(".open-file"))
  let card = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
  if (card) card.classList.remove("fullscreen")
  if (fullscreenTarget && e.target.closest(".card.expanded")) {
    card.classList.remove("expanded")
    card.classList.add("fullscreen")
  } else if (openFileTarget && e.target.closest(".card.expanded")) {
    console.log("OPEN")
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
  console.log("left")
})
hotkeys("shift+right,shift+down", function(e) {
  console.log("right")
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
  console.log("left")
})
hotkeys("right,down", function(e) {
  console.log("right")
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
  console.log("delete")
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

  console.log("insert", o)

  let tokens = []
  let wordSet = {}
  if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
    wordSet = o.prompt.split(' ').reduce(function (prev, current) {
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
  console.log("tokens", tokens)

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
  let tagItems = tagInput.value.split(",")
  for(let tagItem of tagItems) {
    tags.remove_tag(tagItem)
  }
  document.querySelector("#delete-selected").innerHTML = "<i class='fa-regular fa-trash-can'></i> Delete " + items.length + " items"
  selectedEls = items
//  if (items.length > 0) {
//    document.querySelector("footer .edit-mode").classList.remove("hidden")
//  } else {
//    document.querySelector("footer .edit-mode").classList.add("hidden")
//  }
}
worker.onmessage = function(e) {
  let res = e.data
  console.log("Res", res)
  document.querySelector(".content").innerHTML = res.map((item) => {
    return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item)}</div>`
  }).join("")
  clusterize = new Clusterize({
    scrollElem: document.querySelector(".container"),
    contentElem: document.querySelector(".content"),
    rows_in_block: 500,
    blocks_in_cluster: 10
  });
  document.querySelector("#sync").classList.remove("disabled")
  document.querySelector("#sync").disabled = false
  document.querySelector("#sync i").classList.remove("fa-spin")

  render()


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
//      document.querySelector("footer .edit-mode").classList.add("hidden")
    }
  });
}
const search = (query) => {
  console.log("* search", query)
//  document.querySelector("footer").classList.add("hidden")
  document.querySelector(".loading").classList.remove("hidden")
  document.querySelector(".container").classList.add("hidden")
  worker.postMessage({ query, sorter })
}
const render = () => {
  console.log("#render")
  document.querySelector(".container").classList.remove("hidden")
  document.querySelector(".settings").classList.add("hidden")
  document.querySelector(".help").classList.add("hidden")
  document.querySelector(".loading").classList.add("hidden")
}
const debouncedSearch = debounce(search)
const init = async () => {
  let defaults = await window.electronAPI.defaults()
  for(let d of defaults) {
    await db.folders.put({ name: d }).catch((e) => { })
  }
}
init().then(async () => {
  await persist()
  await synchronize()
})
