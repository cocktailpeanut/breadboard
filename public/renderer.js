//var bar = new ProgressBar.Line('.container', {easing: 'easeInOut', duration: 0});
var bar = new Nanobar({
  target: document.querySelector(".container")
});
var worker = new Worker("./worker.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  //files: "app, model, prompt, sampler, weight, steps, cfg_scale, height, width, seed, negative_prompt, mtime, ctime, &filename",
  files: "filename, app, prompt, ctime, *tokens",
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
    href: "https://discord.gg/dZywHttS"
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

function debounce(func, timeout = 300){
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
  let times = `<tr><td>created</td><td>${timeago.format(meta.ctime)}</td></tr>
<tr><td>modified</td><td>${timeago.format(meta.mtime)}</td></tr>`
  let trs = attributes.map((attr) => {
    return `<tr><td>${attr.key}</td><td>${attr.val}</td></tr>`
  }).join("")
  return `<img loading='lazy' data-src="${meta.filename}" src="/file?file=${meta.filename}">
<div class='col'>
  <h4>${meta.prompt}</h4>
  <table>${times}${trs}</table>
</div>`
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
  if (colTarget && e.target.closest(".card.expanded")) {
    // if clicked inside the .col section when NOT expanded, don't do anything.
    // if the clicked element is the delete button, delete
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
  worker.postMessage(query)
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
