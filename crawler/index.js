const Diffusionbee = require("./diffusionbee")
const Standard = require('./standard')
class Crawler {
  async get(folderpath, checkpoint, cb) {
    console.log("get", folderpath, checkpoint)
    let crawler
    if (/diffusionbee/g.test(folderpath)) {
      crawler = new Diffusionbee(folderpath)
    } else {
      crawler = new Standard(folderpath)
    }
    await crawler.init()
    await crawler.sync(checkpoint, cb)
  }
}
module.exports = Crawler
