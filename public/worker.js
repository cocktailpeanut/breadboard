importScripts("./dexie.js")
//var db = new Dexie("breadboard")
//db.version(1).stores({
//  files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
//  folders: "&name",
//  checkpoints: "&root_path, btime",
//  settings: "key, val",
//  favorites: "query"
//})
var db = new Dexie("data")
var user = new Dexie("user")
db.version(1).stores({
  files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
})
user.version(1).stores({
  folders: "&name",
  checkpoints: "&root_path, btime",
  settings: "key, val",
  favorites: "query, global"
})
const esc = (str) => {
  return str
		.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
		.replace(/-/g, '\\x2d');
}
function applyFilter(q, filters) {
  if (filters.length > 0) {
    for(let filter of filters) {
      if (filter.before) {
        q = q.and("btime").belowOrEqual(new Date(filter.before).getTime())
      } else if (filter.after) {
        q = q.and("btime").aboveOrEqual(new Date(filter.after).getTime())
      } else if (filter.width) {
        q = q.and((item) => {
          return item.width === parseInt(filter.width)
        })
      } else if (filter.height) {
        q = q.and((item) => {
          return item.height === parseInt(filter.height)
        })
      } else if (filter["+width"]) {
        q = q.and((item) => {
          return item.width > parseInt(filter["+width"])
        })
      } else if (filter["+height"]) {
        q = q.and((item) => {
          return item.height > parseInt(filter["+height"])
        })
      } else if (filter["-width"]) {
        q = q.and((item) => {
          return item.width < parseInt(filter["-width"])
        })
      } else if (filter["-height"]) {
        q = q.and((item) => {
          return item.height < parseInt(filter["-height"])
        })
      } else if (filter["+=width"]) {
        q = q.and((item) => {
          return item.width >= parseInt(filter["+=width"])
        })
      } else if (filter["+=height"]) {
        q = q.and((item) => {
          return item.height >= parseInt(filter["+=height"])
        })
      } else if (filter["-=width"]) {
        q = q.and((item) => {
          return item.width <= parseInt(filter["-=width"])
        })
      } else if (filter["-=height"]) {
        q = q.and((item) => {
          return item.height <= parseInt(filter["-=height"])
        })
      } else if (filter["-tag"]) {
        let tag = filter["-tag"].slice(1).toLowerCase()   // gotta strip off the "-" to get only the "tag:..."
        q = q.and((item) => {
          return !item.tokens.map(x => x.toLowerCase()).includes(tag)
        })
      } else if (filter["-"]) {
        let token = filter["-"].slice(2).toLowerCase()   // gotta strip off the -: to get only the keyword
        q = q.and((item) => {
          return !item.tokens.map(x => x.toLowerCase()).includes(token)
        })
      } else if (filter.model_name) {
        q = q.and((item) => {
          return new RegExp(esc(filter.model_name), "i").test(item.model_name)
        })
      } else if (filter.agent) {
        //q = q.and("agent").startsWithIgnoreCase(filter.agent)
        q = q.and((item) => {
          return item.agent && item.agent.toLowerCase().startsWith(filter.agent.toLowerCase())
        })
      } else if (filter.file_path) {
        q = q.and((item) => {
          return new RegExp(esc(filter.file_path), "i").test(item.file_path)
        })
      } else if (filter["-file_path"]) {
        q = q.and((item) => {
          return !new RegExp(esc(filter["-file_path"]), "i").test(item.file_path)
        })
      }
    }
  }
  return q.primaryKeys()
}

const preprocess_query = (phrase) => {
  let complex_re = /(-?(file_path|tag)?:)"([^"]+)"/g
  let mn_re = /model_name:"([^"]+)"/g
  let tag_re = /(-?(tag)?:)"([^"]+)"/g
  let agent_re = /agent:"([^"]+)"/g
  let mn_placeholder = "model_name:" + Date.now()
  let agent_placeholder = "agent:" + Date.now()

  // file_path capture
  let complex_captured = {}
  let to_replace = []
  while(true) {
    let test = complex_re.exec(phrase)
    if (test) {
      let captured = test[3]
      let complex_placeholder = test[1] + Math.floor(Math.random() * 100000)
      to_replace.push(complex_placeholder)
      complex_captured[complex_placeholder] = captured
    } else {
      break;
    }
  }
  let complex_re2 = /-?(file_path|tag)?:"([^"]+)"/
  for(let placeholder of to_replace) {
    phrase = phrase.replace(complex_re2, placeholder)
  }

  // model_name capture
  let mn_test = mn_re.exec(phrase)
  let mn_captured
  if (mn_test && mn_test.length > 1) {
    phrase = phrase.replace(mn_re, mn_placeholder)
    mn_captured = mn_test[1]
  }

  // agent capture
  let agent_test = agent_re.exec(phrase)
  let agent_captured
  if (agent_test && agent_test.length > 1) {
    phrase = phrase.replace(agent_re, agent_placeholder)
    agent_captured = agent_test[1]
  }

  let prefixes = phrase.split(" ").filter(x => x && x.length > 0)
  const converted = []
  for (let prefix of prefixes) {
    if (prefix.startsWith("model_name:")) {
      if (mn_captured) {
        converted.push("model_name:" + prefix.replace(/model_name:[0-9]+/, mn_captured))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("file_path:")) {
      if (complex_captured[prefix]) {
        converted.push("file_path:" + prefix.replace(/file_path:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-file_path:")) {
      if (complex_captured[prefix]) {
        converted.push("-file_path:" + prefix.replace(/-file_path:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("tag:")) {
      if (complex_captured[prefix]) {
        converted.push("tag:" + prefix.replace(/tag:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-tag:")) {
      if (complex_captured[prefix]) {
        converted.push("-tag:" + prefix.replace(/-tag:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-:")) {
      if (complex_captured[prefix]) {
        converted.push("-:" + prefix.replace(/-:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("agent:")) {
      if (agent_captured) {
        converted.push("agent:" + prefix.replace(/agent:[0-9]+/, agent_captured))
      } else {
        converted.push(prefix)
      }
    } else {
      converted.push(prefix)
    }
  }
  return converted
}

function find (phrase) {

  // replace all 
  // file_path:".*"
  // model_name:".*"
  // with 
  // file_path:Date.now()
  // model_name:Date.now()

  // run the split
  // replace the pattern after the split

  let prefixes = preprocess_query(phrase)
  let tokens = []
  let filters = []
  for(let prefix of prefixes) {
    if (prefix.startsWith("before:")) {
      filters.push({
        before: prefix.replace("before:", "").trim()
      })
    } else if (prefix.startsWith("after:")) {
      filters.push({
        after: prefix.replace("after:", "").trim()
      })
    } else if (prefix.startsWith("model_name:")) {
      filters.push({
        model_name: prefix.replace("model_name:", "").trim()
      })
    } else if (prefix.startsWith("agent:")) {
      filters.push({
        agent: prefix.replace("agent:", "").trim()
      })
    } else if (prefix.startsWith("file_path:")) {
      filters.push({
        file_path: prefix.replace("file_path:", "").trim()
      })
    } else if (prefix.startsWith("width:")) {
      filters.push({
        width: prefix.replace("width:", "").trim()
      })
    } else if (prefix.startsWith("height:")) {
      filters.push({
        height: prefix.replace("height:", "").trim()
      })
    } else if (prefix.startsWith("-width:")) {
      filters.push({
        "-width": prefix.replace("-width:", "").trim()
      })
    } else if (prefix.startsWith("-height:")) {
      filters.push({
        "-height": prefix.replace("-height:", "").trim()
      })
    } else if (prefix.startsWith("+width:")) {
      filters.push({
        "+width": prefix.replace("+width:", "").trim()
      })
    } else if (prefix.startsWith("+height:")) {
      filters.push({
        "+height": prefix.replace("+height:", "").trim()
      })
    } else if (prefix.startsWith("+=width:")) {
      filters.push({
        "+=width": prefix.replace("+=width:", "").trim()
      })
    } else if (prefix.startsWith("+=height:")) {
      filters.push({
        "+=height": prefix.replace("+=height:", "").trim()
      })
    } else if (prefix.startsWith("-=width:")) {
      filters.push({
        "-=width": prefix.replace("-=width:", "").trim()
      })
    } else if (prefix.startsWith("-=height:")) {
      filters.push({
        "-=height": prefix.replace("-=height:", "").trim()
      })
    } else if (prefix.startsWith("-tag:")) {
      filters.push({ "-tag": prefix })
    } else if (prefix.startsWith("-:")) {
      filters.push({ "-": prefix })
    } else if (prefix.startsWith("-file_path:")) {
      filters.push({
        "-file_path": prefix.replace("-file_path:", "").trim()
      })
    } else {
      tokens.push(prefix)
    }
  }

  return db.transaction('r', db.files, function*() {
    let promises
    if (tokens.length > 0) {
      promises = tokens.map((token) => {
        if (token.startsWith("-tag:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else if (token.startsWith("-:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else if (token.startsWith("-file_path:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else {
          let q = db.files.where('tokens').startsWithIgnoreCase(token)
          return applyFilter(q, filters)
        }
      })
    } else {
      let q = db.files.toCollection()
      promises = [applyFilter(q, filters)]
    }
    const results = yield Dexie.Promise.all(promises)
    const reduced = results.reduce ((a, b) => {
      const set = new Set(b);
      return a.filter(k => set.has(k));
    });
    return yield db.files.where(':id').anyOf (reduced).toArray();
  });
}
addEventListener("message", async event => {
  let { query, sorter } = event.data;
  let res = []

  // Global filter application
  let globalQueries = await user.favorites.where({ global: 1 }).toArray()
  if (globalQueries.length > 0) {
    let appendStr = globalQueries.map((item) => { return item.query }).join(" ")
    if (query) {
      query = query + " " + appendStr
    } else {
      query = appendStr
    }
  }
  console.log("query = ", query)

  if (query) {

    res = await find(query, sorter)
    if (sorter.direction > 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => {
          return x[sorter.column] - y[sorter.column]
        })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          let xx = (x[sorter.column] && typeof x[sorter.column] === 'string' ? x[sorter.column] : "")
          let yy = (y[sorter.column] && typeof y[sorter.column] === 'string' ? y[sorter.column] : "")
          return xx.localeCompare(yy)
        })
      }
    } else if (sorter.direction < 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => {
          return y[sorter.column] - x[sorter.column]
        })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          let xx = (x[sorter.column] && typeof x[sorter.column] === 'string' ? x[sorter.column] : "")
          let yy = (y[sorter.column] && typeof y[sorter.column] === 'string' ? y[sorter.column] : "")
          return yy.localeCompare(xx)
        })
      }
    }
  } else {
    if (sorter.direction > 0) {
      res = await db.files.orderBy(sorter.column).toArray()
    } else if (sorter.direction < 0) {
      res = await db.files.orderBy(sorter.column).reverse().toArray()
    }
  }
  postMessage(res)
});
