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
        if (!parsed.app) {
          // no app found => try parse from external txt file
          const parametersFilename = path.join(path.dirname(filename), path.basename(filename, path.extname(filename)) + '.txt');

          try {
            let parametersText = await fs.promises.readFile(parametersFilename, 'utf8')
            parsed = await parser.parseParametersText(parsed, parametersText);
          } catch (e) {
            if (e.code !== 'ENOENT') {
              throw e;
            }
          }
        }

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
