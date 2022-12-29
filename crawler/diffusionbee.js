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

const GM = require('./gm')
const path = require('path');
const { fdir } = require("fdir");
const os = require('os');
const fs = require('fs');
const meta = require('png-metadata')
const Parser = require('./parser')
const parser = new Parser()
class Diffusionbee {
  constructor(folderpath) {
    this.folderpath = folderpath
    this.gm = new GM()
  }
  async init() {
    let str = await fs.promises.readFile(path.resolve(path.dirname(this.folderpath), "data.json"), "utf8")
    let data = JSON.parse(str)
    let history = data.history
    /****************************************************
    *
    *   mapping := {
    *     [filename]: {
    *       prompt,
    *       seed,
    *       key,
    *       img_w,
    *       img_h,
    *       dif_steps,
    *       guidence_scale
    *     }
    *   }
    *
    ****************************************************/
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
  }
  async sync(filename, force) {
    /******************************************************************************
    *   info := {
    *     parsed: [
    *       { key: 'xmp:prompt', val: 'Steve Buscemi, itojunji style' },
    *       { key: 'xmp:sampler' },
    *       { key: 'xmp:steps', val: 25 },
    *       { key: 'xmp:cfg_scale' },
    *       { key: 'xmp:seed' },
    *       { key: 'xmp:negative_prompt', val: 'disfigured' },
    *       { key: 'xmp:model_name' },
    *       { key: 'xmp:model_url' },
    *       { key: 'xmp:agent' },
    *       { key: 'dc:subject' }
    *     ]
    *   }
    ******************************************************************************/
    let info = await this.gm.get(filename)
    try {
      // gm doesn't exist => write to files first
      if (!info.parsed || force) {
        let m = this.mapping[filename]
        let seed = parseInt(m.seed) + 1234 * this.batchIndex[filename]
        let list = [{
          key: 'xmp:prompt',
          val: m.prompt,
        }, {
          key: 'xmp:sampler',
          val: "plms",
        }, {
          key: 'xmp:steps',
          val: (m.dif_steps ? parseInt(m.dif_steps) : null),
        }, {
          key: 'xmp:cfg_scale',
          val: (m["guidence_scale"] ? parseFloat(m["guidence_scale"]) : null),
        }, {
          key: 'xmp:seed',
          val: seed,
        }, {
          key: 'xmp:negative_prompt',
          val: m.negative_prompt,
        }, {
          key: 'xmp:model_name',
          val: m.model_version,
        }, {
          key: 'xmp:model_url',
          val: null,  // reserved
        }, {
          keyi: 'xmp:agent',
          val: "diffusionbee"
        }]
        await this.gm.set(filename, list)
      }
      let serialized = await parser.serialize(this.folderpath, filename)
      return serialized
    } catch (e) {
      console.log("E", e)
    }
  }
};
module.exports = Diffusionbee
