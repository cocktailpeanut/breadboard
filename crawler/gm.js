const meta = require('png-metadata')
const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser")
const fs = require('fs')
class GM {
  constructor() {
    this.parser = new XMLParser();
  }
  /****************************************************************************
  *
  *   set(filepath, [{
  *     key: <key>,
  *     val: <val>|undefined
  *   }]
  *
  *   Only overwrite
  *   - if the key already exists, set the value to the new value
  *   - if the key doesn't already exist, set the value to the new value
  *
  ****************************************************************************/
  async set (filepath, new_items) {
    if (Array.isArray(filepath)) {
      let r = await Promise.allSettled(filepath.map((p) => {
        return this.setOne(p, new_items)
      }))
      return r
    } else {
      let r = await Promise.allSettled([
        this.setOne(filepath, new_items)
      ])
      return r
    }
  }
  async setOne(filepath, new_items) {
    const buf = await fs.promises.readFile(filepath)
    const info = await this._get(buf)
    if (info.list) {
      const r = await this._set(filepath, info, new_items)
      return r
    } else {
      throw new Error("invalid file")
    }
  }
  _normalize(items) {
    let keys = [
      "xmp:prompt",
      "xmp:sampler",
      "xmp:steps",
      "xmp:cfg_scale",
      "xmp:seed",
      "xmp:negative_prompt",
      "xmp:model_name",
      "xmp:model_url",
      "xmp:agent",
      "dc:subject",
    ]

    let mapping = {}
    for(let item of items) {
      mapping[item.key] = {
        val: item.val,
        mode: item.mode
      }
    }

    let result = []
    for(let i=0; i<keys.length; i++) {
      let key = keys[i]
      if (mapping[key]) {
        result.push({
          key,
          val: mapping[key].val,
          mode: mapping[key].mode,
        })
      } else {
        result.push({
          key
        })
      }
    }
    return result
  }
  /****************************************************************************
  *
  *   rm(filepath, [key0, key1, ...])
  *
  *   calls:
  *   set(filepath, [{
  *     key: key0,
  *   }, {
  *     key: key1,
  *   }]
  *
  ****************************************************************************/
  async rm (filepath, keys) {
    if (Array.isArray(filepath)) {
      let r = await Promise.allSettled(filepath.map((p) => {
        return this.rmOne(p, keys)
      }))
      return r
    } else {
      let r = await Promise.allSettled([
        this.rmOne(filepath, keys)
      ])
      return r
    }
  }
  async rmOne (filepath, keys) {
    const buf = await fs.promises.readFile(filepath)
    let info = await this._get(buf)
    let normalized_old_items = this._normalize(info.parsed ? info.parsed : [])
    let new_items = normalized_old_items.map((item) => {
      if (keys.includes(item.key)) {
        return {
          key: item.key
        }
      } else {
        return item
      }
    })
    info.parsed = new_items
    let r = await this._set(filepath, info, new_items)
    return r
  }
  async get (filepath) {
    const buf = await fs.promises.readFile(filepath)
    let info = await this._get(buf)
    return info
  }
  async _set(filepath, info, new_items) {
    // find the relevant index
    // does iTxT already exist? => need to replace one item at the index
    // not exist? => insert into index 1 without replacing
    let modifyConfig = (info.chunk ? { index: info.chunk.index, count: 1 } : { index: 1, count: 0 });

    //let rendered = items.map(item => this._xml(item)).join("\n")
    let normalized_old_items = this._normalize(info.parsed ? info.parsed : [])
    let normalized_new_items = this._normalize(new_items)


    let rendered = this._update(normalized_old_items, normalized_new_items)
    let m = this._wrapper(rendered)
    let data = "XML:com.adobe.xmp" + String.fromCharCode(0x00) + String.fromCharCode(0x00) + String.fromCharCode(0x00) + String.fromCharCode(0x00) + String.fromCharCode(0x00) + m

    // Create chunk
    let chunk = meta.createChunk("iTXt", data)

    // Insert or replace the chunk at the right position
    info.list.splice(modifyConfig.index, modifyConfig.count, chunk)

    // join the chunks
    const newBuf = meta.joinChunk(info.list)

    // write to file
    await fs.promises.writeFile(filepath, newBuf, "binary")

    // return value
    return {
      xml: m,
      chunk: data,
    }
  }
  async _get (buf) {
    const bin = buf.toString('binary');
    let list = meta.splitChunk(bin);
    let itxt;
    for(let i=0; i<list.length; i++) {
      let item = list[i]
      if (item.type === "iTXt" && item.data.startsWith("XML:com.adobe.xmp")) {
        itxt = item
        itxt.index = i
        break;
      }
    }
    if (itxt) {
      let parsed = this.parser.parse(itxt.data)
      let gms = parsed["x:xmpmeta"]["rdf:RDF"]["rdf:Description"]["xmp:gm"]
      let subject = parsed["x:xmpmeta"]["rdf:RDF"]["rdf:Description"]["dc:subject"]
      let keys = [
        "xmp:prompt",
        "xmp:sampler",
        "xmp:steps",
        "xmp:cfg_scale",
        "xmp:seed",
        "xmp:negative_prompt",
        "xmp:model_name",
        "xmp:model_url",
        "xmp:agent",
      ]
      let res = []
      if (gms) {
        for(let key of keys) {
          if (gms[key]) {
            res.push({ key, val: gms[key] })
          } else {
            res.push({ key, })
          }
        }
      }
      if (subject) {
        let val = subject["rdf:Bag"]["rdf:li"]
        if (val) {
          val = (Array.isArray(val) ? val : [val])
          res.push({
            key: "dc:subject",
            val
          })
        } else {
          res.push({ key: "dc:subject" })
        }
      } else {
        res.push({ key: "dc:subject" })
      }
      return { chunk: itxt, parsed: res, list }
    }
    return { list }
  }
  _wrapper (data) {
    return `<?xpacket begin="?" id="W5M0MpCehiHzreSzNTczkc9d"?>
  <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core  5.6-c138 79.159824, 2016/09/14-01:09:01        ">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="XMP template with common namespaces" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">${data}</rdf:Description>
    </rdf:RDF>
  </x:xmpmeta>
<?xpacket end="w"?>`
  }
  _update (old_items, new_items) {

    // iterate through old items

    // - is 'val' empty?
    //   - look at the same index at new items
    //      - does new items have a value? => set the value
    //      - does the new items NOT have a avlue => set to null
    // - is 'value' NOT empty? =>
    //    - look at the same index at new items
    //      - does the new items have a value? => set the value
    //      - does the new items NOT have a value? => keep the old_items

    let updated_items = []
    for(let i=0; i<old_items.length; i++) {
      let old_item = old_items[i]
      let new_item = new_items[i]
      if (typeof new_item.val === "undefined") {
        updated_items.push(old_item)      // keep the old item (same as new item)
      } else {
        if (Array.isArray(new_item.val)) {
          if (new_item.mode && new_item.mode === "merge") {
            let set = new Set(old_item.val)
            for(let item of new_item.val) {
              set.add(item)
            }
            updated_items.push({
              key: new_item.key,
              val: Array.from(set)
            })
          } else if (new_item.mode && new_item.mode === "delete") {
            // remove the item from the old value
            let set = new Set(old_item.val)
            for(let item of new_item.val) {
              set.delete(item)
            }
            updated_items.push({
              key: new_item.key,
              val: Array.from(set)
            })
          } else {
            // overwrite
            updated_items.push(new_item)      // update with the new item
          }
        } else {
          // overwrite
          updated_items.push(new_item)      // update with the new item
        }
      }
    }


    let xmps = []
    let dcs = []

    for(let i=0; i<updated_items.length; i++) {
      let item = updated_items[i]
      if (typeof item.val !== "undefined") {
        if (item.key.startsWith("dc:")) {
          dcs.push(this._dc(item))
        } else if (item.key.startsWith("xmp:")) {
          xmps.push(this._xmp(item))
        }
      }
    }


    // iterate through olditems and check if the item.key is included in keys object
    // if included, do nothing => because it's already been correctly updated
    // if not included, this means the new keys didn't include this particular old key, so insert this

    return `<xmp:gm rdf:parseType="Resource">${xmps.join("")}</xmp:gm>${dcs.join("")}`
  }
  _dc({ key, val }) {
    if (key === "dc:subject") {
      let items = val.map((d) => {
        return `<rdf:li>${d}</rdf:li>`
      }).join("")
      return `<${key}><rdf:Bag>${items}</rdf:Bag></${key}>`
    }
  }
  _xmp ({ key, val }) {
    return `<${key}>${val}</${key}>`
  }
}
module.exports = GM
