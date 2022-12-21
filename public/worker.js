importScripts("./dexie.js")
var db = new Dexie("breadboard")
db.version(1).stores({
  files: "filename, app, prompt, ctime, *tokens",
  folders: "&name",
  checkpoints: "&app, ctime"
})
function find (phrase) {
  let prefixes = phrase.split(" ").filter(x => x && x.length > 0)
  return db.transaction('r', db.files, function*() {
    const results = yield Dexie.Promise.all (prefixes.map(prefix => db.files.where('tokens').startsWithIgnoreCase(prefix).primaryKeys()));
    const reduced = results.reduce ((a, b) => {
      const set = new Set(b);
      return a.filter(k => set.has(k));
    });
    return yield db.files.where(':id').anyOf (reduced).toArray();
  });
}
addEventListener("message", async event => {
  const query = event.data;
  let res = []
  if (query) {
    res = await find(query)
    res.sort((x, y) => { return y.ctime - x.ctime })
  } else {
    res = await db.files.orderBy("ctime").reverse().toArray()
  }
  postMessage(res)
});
