/*
exif {
  "prompt": "mafia santa, retro style",
  "seed": "15982",
  "img_w": "768",
  "img_h": "768",
  "key": "0.6032483614978881",
  "guidence_scale": "7.5",
  "dif_steps": "50",
  "model_version": "custom_retrodiffusion2_fp16",
  "negative_prompt": "blurry, disfigured"
}
{
	"model": "stable diffusion",
	"model_weights": "stable-diffusion-1.5",
	"model_hash": "cc6cb27103417325ff94f52b7a5d2dde45a7515b25c255d8e396c90014281516",
	"app_id": "invoke-ai/InvokeAI",
	"app_version": "v2.2.0",
	"image": {
		"prompt": [{
			"prompt": "a ((dog)) running in a park",
			"weight": 1.0
		}],
		"steps": 50,
		"cfg_scale": 7.5,
		"threshold": 0,
		"perlin": 0,
		"height": 512,
		"width": 512,
		"seed": 3561693215,
		"seamless": false,
		"hires_fix": false,
		"type": "txt2img",
		"postprocessing": null,
		"sampler": "k_lms",
		"variations": []
	}
}

*/

const path = require('path');
const os = require('os');
const fs = require('fs');
const meta = require('png-metadata')
const Parser = require('./parser')
const parser = new Parser()
class Diffusionbee {
  constructor(folderpath) {
    this.folderpath = folderpath
  }
  async init() {
    let str = await fs.promises.readFile(path.resolve(path.dirname(this.folderpath), "data.json"), "utf8")
    let data = JSON.parse(str)
    let history = data.history

    this.mapping = {}
    this.batchIndex = {}
    for(let key in history) {
      let attrs = history[key]
      let imgs = attrs.imgs
      let exif = {}
      for(let key in attrs) {
        if (key !== "imgs") {
          exif[key] = "" + attrs[key]
        }
      }
      for(let i=0; i<imgs.length; i++) {
        let img = imgs[i]
        this.mapping[img] = exif
        this.batchIndex[img] = i
      }
    }

    /*
    mapping := {
      [filename]: {
        prompt,
        seed,
        key,
        img_w,
        img_h,
        dif_steps,
        guidence_scale
      }
    }
    */
  }
  async sync(checkpoint, cb) {
    let files
    try {
      files = await fs.promises.readdir(this.folderpath)
    } catch (e) {
      await cb({
        app: this.folderpath,
        total: 1,
        progress: 1,
      })
      return
    }

    let counter = 0;
    let keysLength = files.length;
    for(let file of files) {
      let filename = path.resolve(this.folderpath, file)
      let stat = await fs.promises.stat(filename)
      try {

        if (stat.isFile()) {
          let ctime = new Date(stat.ctime).getTime()
          let mtime = new Date(stat.mtime).getTime()
          if (ctime >= checkpoint) {
            console.log("above checkpoint", ctime, checkpoint, filename)

            let buf = await fs.promises.readFile(filename)
            let parsed = await parser.parse(buf)
            //parsed = false  // for testing freshly every time
            if (parsed && parsed.prompt) {
              let converted = parser.convert(parsed)
              let flattened = parser.flatten(this.folderpath, converted, filename, ctime, mtime)
              await cb({
                app: this.folderpath,
                total: keysLength,
                progress: counter,
                meta: flattened
              })
            } else {
              // Write
              let m = this.mapping[filename]
              let seed = parseInt(m.seed) + 1234 * this.batchIndex[filename]
              let converted = parser.convert(m, {
                sampler: "PLMS",
                steps: (m.dif_steps ? parseInt(m.dif_steps) : null),
                cfg: (m["guidence_scale"] ? parseFloat(m["guidence_scale"]) : null),
                width: parseInt(m.img_w),
                height: parseInt(m.img_h),
                seed,
              })
              // Send to frontend
              const bin = buf.toString('binary');


              let list = meta.splitChunk(bin);
              let chunk = meta.createChunk("tEXt", "sd-metadata" + String.fromCharCode(0x00) + JSON.stringify(converted))

              list.splice(1, 0, chunk)

              let newBin = meta.joinChunk(list);

              await fs.promises.writeFile(filename, newBin, "binary")

              // need to get a new mtime because they get updated when metadata is attached
              let stat = await fs.promises.stat(filename)
              let ctime = new Date(stat.ctime).getTime()
              let mtime = new Date(stat.mtime).getTime()
              let flattened = parser.flatten(this.folderpath, converted, filename, ctime, mtime)

              await cb({
                app: this.folderpath,
                total: keysLength,
                progress: counter,
                meta: flattened
              })
            }
          }
        }
      } catch (e) {
        console.log("# Error", e)
      }
      counter++;
    }
  }
};
module.exports = Diffusionbee
