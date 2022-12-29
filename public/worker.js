importScripts("./dexie.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  //files: "path, model, app, prompt, ctime, *tokens",
  files: "file_path, model_name, root_path, prompt, btime, *tokens",
  folders: "&name",
  checkpoints: "&root_path, btime"
})
function applyFilter(q, filters) {
  if (filters.length > 0) {
    for(let filter of filters) {
      if (filter.before) {
        q = q.and("btime").belowOrEqual(new Date(filter.before).getTime())
      } else if (filter.after) {
        q = q.and("btime").aboveOrEqual(new Date(filter.after).getTime())
      } else if (filter.model_name) {
        q = q.and((item) => {
          return new RegExp(filter.model_name, "i").test(item.model_name)
        })
      } else if (filter.path) {
        q = q.and((item) => {
          return new RegExp(filter.path, "i").test(item.path)
        })
      }
    }
  }
  return q.primaryKeys()
}
function find (phrase) {
  let prefixes = phrase.split(" ").filter(x => x && x.length > 0)

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
    } else if (prefix.startsWith("path:")) {
      filters.push({
        path: prefix.replace("path:", "").trim()
      })
    } else {
      tokens.push(prefix)
    }
  }


  console.log("tokens", tokens)
  console.log("filters", filters)
  return db.transaction('r', db.files, function*() {
    let promises
    if (tokens.length > 0) {
      promises = tokens.map((token) => {
        let q = db.files.where('tokens').startsWithIgnoreCase(token)
        return applyFilter(q, filters)
      })
    } else {
      let q = db.files.toCollection()
      promises = [applyFilter(q, filters)]
    }
    const results = yield Dexie.Promise.all(promises)
    console.log("results", results)
    const reduced = results.reduce ((a, b) => {
      const set = new Set(b);
      return a.filter(k => set.has(k));
    });
    return yield db.files.where(':id').anyOf (reduced).toArray();
  });
}
addEventListener("message", async event => {
  const { query, sorter } = event.data;
  let res = []
  if (query) {
    res = await find(query, sorter)
    if (sorter.direction > 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => { return x[sorter.column] - y[sorter.column] })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          return x[sorter.column].localeCompare(y[sorter.column])
        })
      }
    } else if (sorter.direction < 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => { return y[sorter.column] - x[sorter.column] })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          return y[sorter.column].localeCompare(x[sorter.column])
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
  console.log("postMessage", res)
  postMessage(res)
});
