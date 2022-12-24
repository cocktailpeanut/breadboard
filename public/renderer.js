//var bar = new ProgressBar.Line('.container', {easing: 'easeInOut', duration: 0});
var bar = new Nanobar({
  target: document.querySelector(".container")
});
var worker = new Worker("./worker.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  //files: "app, model, prompt, sampler, weight, steps, cfg_scale, height, width, seed, negative_prompt, mtime, ctime, &filename",
  files: "filename, model, app, prompt, ctime, *tokens",
  folders: "&name",
  checkpoints: "&app, ctime"
})
//db.files.hook("creating", function (primKey, obj, trans) {
//  if (typeof obj.prompt === 'string') {
//    var wordSet = obj.prompt.split(' ').reduce(function (prev, current) {
//      if (current.length > 0) prev[current] = true;
//      return prev;
//    }, {});
//    obj.tokens = Object.keys(wordSet);
//  } else {
//    obj.tokens = []
//  }
//});

var counter
var sorter = {
  direction: -1,
  column: "ctime",
  compare: 0
};
//document.querySelector("#cancel-selected").addEventListener("click", async (e) => {
//  ds.clearSelection()  
//  document.querySelector("footer").classList.add("hidden")
//})
document.querySelector("#delete-selected").addEventListener("click", async (e) => {
  let selected = selectedEls.map((el) => {
    return el.getAttribute("data-src")
  })
  await window.electronAPI.del(selected)
  let res = await db.files.where("filename").anyOf(selected).delete()
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
})
document.querySelector("nav select").addEventListener("change", async (e) => {
  if (e.target.value === "1") {
    sorter = {
      direction: -1,
      column: "ctime",
      compare: 0, // numeric compare
    }
  } else if (e.target.value === "2") {
    sorter = {
      direction: 1,
      column: "ctime",
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
const synchronize = async () => {
  document.querySelector("#sync").disabled = true
  document.querySelector("#sync i").classList.add("fa-spin")
  let folderpaths = await db.folders.toArray()
  for(let folderpath of folderpaths) {
    let app = folderpath.name
    let c = await checkpoint(app)
    document.querySelector(".status").innerHTML = "synchronizing from " + app
    counter = 0
    await new Promise((resolve, reject) => {
      window.electronAPI.sync(app, c)
      let interval = setInterval(() => {
        if (counter <= 0) {
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
  await render()
}
const renderHelp = async () => {
  document.querySelector(".content").classList.add("hidden")
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
  document.querySelector(".content").classList.add("hidden")
  document.querySelector(".help").classList.add("hidden")
  document.querySelector(".settings").classList.remove("hidden")


  let res = await db.folders.toArray()
  let rows = res.map((r) => {
    return `<div class='row'>
    <div>${r.name}</div><div class='flexible'></div><button class='del' data-name='${r.name}'><i class="fa-regular fa-trash-can"></i></button>
</div>`
  }).join("")
  document.querySelector(".settings").innerHTML = `<main>
  <div class='header'>
    <h2>Settings</h2>
    <div class='flexible'></div>
    <button id='select'>Add a folder</button>
  </div>
<div class='rows'>
${rows}
</div>
</main>`
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
  let times = `<tr><td>created</td><td>${timeago.format(meta.ctime)}</td><td></td></tr>
<tr><td>modified</td><td>${timeago.format(meta.mtime)}</td><td></td></tr>`
  let trs = attributes.filter((attr) => {
    return attr.key !== "app" && attr.key !== "tokens"
  }).map((attr) => {
    let el
    if (attr.key === "model" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "prompt" && attr.val) {
      let tokens = attr.val.split(" ").filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join(" ")
    } else if (attr.key === "filename" && attr.val) {
      let tokens = attr.val.split(/[\/\\]/).filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join("/")
      
    } else {
      el = attr.val
    }

    return `<tr data-key="${attr.key}"><td>${attr.key}</td><td>${el}</td><td class='copy-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button></td></tr>`
  }).join("")
  return `<img loading='lazy' data-src="${meta.filename}" src="/file?file=${meta.filename}">
<div class='col'>
  <h4>${meta.prompt}</h4>
  <table>${times}${trs}</table>
</div>
<button class='gofullscreen'><i class="fa-solid fa-expand"></i></button>`
}

const stripPunctuation = (str) => {
  return str.replace(/[^\p{L}\s]/gu,"")
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
    let cleaned = stripPunctuation(val)
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
    document.querySelector(".search").value = result.join(" ")
    document.querySelector(".search").dispatchEvent(new Event('input'))
  }
    

}


window.electronAPI.onMsg(async (_event, value) => {
  let div = document.createElement("div")
  div.className = "card"
  queueMicrotask(async () => {
    counter++;
    if (value.meta) {
      let response = await insert(value.meta).catch((e) => {
        console.log("ERROR", e)
      })
    }
    counter--
    let ratio = value.progress/value.total
    if (ratio < 1) {
      bar.go(100*value.progress/value.total);
    }
  })
})
document.querySelector(".container").addEventListener("click", async (e) => {
  e.preventDefault()
  e.stopPropagation()
  let colTarget = (e.target.classList.contains(".col") ? e.target : e.target.closest(".col"))
  let fullscreenTarget = (e.target.classList.contains(".gofullscreen") ? e.target : e.target.closest(".gofullscreen"))
  let clipboardTarget = (e.target.classList.contains(".copy-text") ? e.target : e.target.closest(".copy-text"))
  let tokenTarget = (e.target.classList.contains(".token") ? e.target : e.target.closest(".token"))
  let card = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
  if (card) card.classList.remove("fullscreen")
  if (fullscreenTarget && e.target.closest(".card.expanded")) {
    card.classList.remove("expanded")
    card.classList.add("fullscreen")
  } else if (tokenTarget && e.target.closest(".card.expanded")) {
    let key = tokenTarget.closest("tr").getAttribute("data-key")
    let val = tokenTarget.getAttribute("data-value")
    includeSearch(key, val)
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


var compiledInsert;
const checkpoint = async (folderpath) => {
  let cp = await db.checkpoints.where({ app: folderpath }).first()
  if (cp) return cp.ctime
  else return null
}


let checkpoints = { }

const updateCheckpoint = async (app, ctime) => {
  let cp = await db.checkpoints.put({ app, ctime })
  checkpoints[app] = ctime
}
const insert = async (o) => {

  let tokens = []
  if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
    let wordSet = o.prompt.split(' ').reduce(function (prev, current) {
      if (current.length > 0) prev[current] = true;
      return prev;
    }, {});
    tokens = Object.keys(wordSet);
  }

  await db.files.put({
    app: (o.app),
    model: (o.model ? o.model : null),
    prompt: (o.prompt ? o.prompt : null),
    sampler: (o.sampler ? o.sampler : null),
    weight: (o.weight ? o.weight : null),
    steps: (o.steps ? o.steps : null),
    cfg_scale: (o.cfg_scale ? o.cfg_scale : null),
    height: (o.height ? o.height : null),
    width: (o.width ? o.width : null),
    seed: (o.seed ? o.seed : null),
    negative_prompt: (o.negative_prompt ? o.negative_prompt : null),
    mtime: (o.mtime ? o.mtime : null),
    ctime: (o.ctime ? o.ctime: null),
    filename: (o.filename),
    tokens
  })

  if (checkpoints[o.app]) {
    if (checkpoints[o.app] < o.ctime) {
      await updateCheckpoint(o.app, o.ctime)
    }
  } else {
    let cp = await db.checkpoints.where({ app: o.app }).first()   
    if (cp) {
      if (cp < o.ctime) {
        await updateCheckpoint(o.app, o.ctime)
      }
    } else {
      await updateCheckpoint(o.app, o.ctime)
    }
  }
}
var clusterize;
var selected = []
var selectedEls = []
var ds;
var rendered
var settingsRendered
worker.onmessage = function(e) {
  let res = e.data
  document.querySelector(".content").innerHTML = res.map((item) => {
    return `<div class='card' data-src="${item.filename}">${card(item)}</div>`
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
      document.querySelector("#delete-selected").innerHTML = "<i class='fa-regular fa-trash-can'></i> Delete " + e.items.length + " items"
      document.querySelector("footer").classList.remove("hidden")
      selectedEls = e.items
    } else {
      selectedEls = []
      document.querySelector("footer").classList.add("hidden")
    }
  });
}
const search = (query) => {
  worker.postMessage({ query, sorter })
}
const render = () => {
  document.querySelector(".content").classList.remove("hidden")
  document.querySelector(".settings").classList.add("hidden")
  document.querySelector(".help").classList.add("hidden")
}
const debouncedSearch = debounce(search)
const init = async () => {
  let defaults = await window.electronAPI.defaults()
  for(let d of defaults) {
    await db.folders.put({ name: d }).catch((e) => { })
  }
}
init().then(async () => {
  await synchronize()
})
