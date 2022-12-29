const fs = require('fs');
const path = require('path');
const { fdir } = require("fdir");
const GM = require('./gm')
const Parser = require('./parser')
const parser = new Parser()
class Standard {
  constructor(folderpath) {
    this.folderpath = folderpath
    this.gm = new GM()
  }
  async init() {
  }
  async sync(filename, force) {
    let info = await this.gm.get(filename)
    try {
      // no XMP tag => parse the custom headers and convert to XMP
      if (!info.parsed || force) {
        let buf = await fs.promises.readFile(filename)
        let parsed = await parser.parse(buf)
        let list = parser.convert(parsed)
        await this.gm.set(filename, list) 
      }

      let serialized = await parser.serialize(this.folderpath, filename)
      return serialized
    } catch (e) {
      console.log("E", e)
    }
  }
}
module.exports = Standard
