const fs = require('fs');
const path = require('path');
const { fdir } = require("fdir");
const Parser = require('./parser')
const parser = new Parser()
class Standard {
  constructor(folderpath) {
    this.folderpath = folderpath
  }
  async init() {
  }
  async sync(checkpoint, cb) {
    let files
    try {
      files = await new fdir()
        .glob("**/*.png")
        .withBasePath()
        .crawl(this.folderpath)
        .withPromise()
//      files = await fs.promises.readdir(this.folderpath)
    } catch (e) {
      await cb({
        app: this.folderpath,
        total: 1,
        progress: 1,
      })
      return;
    }
    let counter = 0;
    let keysLength = files.length;
    for(let file of files) {
      try {
        let filename = path.resolve(this.folderpath, file)
        let stat = await fs.promises.stat(filename)
        if (stat.isFile()) {
          let ctime = new Date(stat.ctime).getTime()
          let mtime = new Date(stat.mtime).getTime()
          if (ctime >= checkpoint) {
            let buf = await fs.promises.readFile(filename)
            let parsed = await parser.parse(buf)
            let converted = parser.convert(parsed)
            let flattened = parser.flatten(this.folderpath, converted, filename, ctime, mtime)
            await cb({
              app: this.folderpath,
              total: keysLength,
              progress: counter,
              meta: flattened
            })
          }
        }
      } catch (e) {
        console.log("# Error", e)
      }
      counter++;
    }
  }
}
module.exports = Standard
