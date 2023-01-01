const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser")
const axios = require('axios')
class Updater {
  async check (releaseFeed) {
    let parser = new XMLParser()
    let xml = await axios.get(releaseFeed, { timeout: 5000 }).then((r) => {
      return r.data
    })
    let parsed = parser.parse(xml)
    return parsed
  }
}
module.exports = Updater
