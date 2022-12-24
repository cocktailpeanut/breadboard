importScripts("./dexie.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  files: "filename, model, app, prompt, ctime, *tokens",
  folders: "&name",
  checkpoints: "&app, ctime"
})
function applyFilter(q, filters) {
  if (filters.length > 0) {
    for(let filter of filters) {
      if (filter.before) {
        q = q.and("ctime").belowOrEqual(new Date(filter.before).getTime())
      } else if (filter.after) {
        q = q.and("ctime").aboveOrEqual(new Date(filter.after).getTime())
      } else if (filter.model) {
        q = q.and((item) => {
          return new RegExp(filter.model, "i").test(item.model)
        })
      } else if (filter.filename) {
        q = q.and((item) => {
          return new RegExp(filter.filename, "i").test(item.filename)
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
    } else if (prefix.startsWith("model:")) {
      filters.push({
        model: prefix.replace("model:", "").trim()
      })
    } else if (prefix.startsWith("filename:")) {
      filters.push({
        filename: prefix.replace("filename:", "").trim()
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
        let q = db.files.where('tokens').startsWithIgnoreCase(token)//.primaryKeys()
        return applyFilter(q, filters)
      })
    } else {
      let q = db.files.toCollection()
      promises = [applyFilter(q, filters)]
    }
    //const results = yield Dexie.Promise.all (tokens.map(prefix => db.files.where('tokens').startsWithIgnoreCase(prefix).primaryKeys()));
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
  postMessage(res)
});
