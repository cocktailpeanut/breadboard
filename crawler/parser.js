const exifr = require('exifr')
class Parser {
  async parse(buf) {
    let parsed = await exifr.parse(buf, true)
    let attrs = {}
    if (parsed.ImageWidth) attrs.width = parsed.ImageWidth
    if (parsed.ImageHeight) attrs.height = parsed.ImageHeight
    return { ...attrs, ...this.getMeta(parsed) }
  }
  convert(e, options) {
  /*
  automatic111 {
    width: 512,
    height: 512,
    Steps: '20',
    Sampler: 'DDIM',
    'CFG scale': '7',
    Seed: '76682',
    Size: '512x512',
    'Model hash': '38b5677b',
    'Variation seed': '458188939',
    'Variation seed strength': '0.06',
    prompt: 'lake ness monster, procam style'
  }
  invokeAI {
    "width": 512,
    "height": 512,
    "prompt": "a ((dog)) running in a park",
    "steps": 50,
    "cfg_scale": 7.5,
    "threshold": 0,
    "perlin": 0,
    "seed": 3561693215,
    "seamless": false,
    "hires_fix": false,
    "type": "txt2img",
    "postprocessing": null,
    "sampler": "k_lms",
    "variations": [],
    "weight": 1,
    "model": "stable diffusion",
    "model_weights": "stable-diffusion-1.5",
    "model_hash": "cc6cb27103417325ff94f52b7a5d2dde45a7515b25c255d8e396c90014281516",
    "app_id": "invoke-ai/InvokeAI",
    "app_version": "v2.2.0"
  }
  diffusionbee {
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
  */
    let cfg;
    if (options && options.cfg) {
      cfg = options.cfg
    } else if (e["CFG scale"]) {
      cfg = parseFloat(e["CFG scale"])
    } else if (e.cfg_scale) {
      cfg = parseFloat(e.cfg_scale)
    }

    let seed
    if (options && options.seed) {
      seed = options.seed
    } else if (e.Seed) {
      seed = parseInt(e.Seed)
    } else if (e.seed) {
      seed = parseInt(e.seed)
    }

    let width;
    let height;
    if (options && options.width) {
      width = options.width
    } else if (e.width) {
      width = e.width
    }
    if (options && options.height) {
      height = options.height
    } else if (e.height) {
      height = e.height
    }

    let negative;
    if (options && options.negative) {
      negative = options.negative
    } else if (e["Negative prompt"]) {
      negative = e["Negative prompt"]
    } else {
      // test for invokeAI negative prompt syntax
      let matches = [...e.prompt.matchAll(/\[([^\]]+)\]/g)].map((m) => {
        return m[1]
      })
      if (matches.length > 0) {
        negative = matches.join(", ")
        e.prompt = e.prompt.replaceAll(/\[([^\]]+)\]/g, "").trim()
      } else {
        negative = null
      }
    }

    let sampler
    if (options && options.sampler) {
      sampler = options.sampler
    } else if (e.Sampler) {
      sampler = e.Sampler
    } else if (e.sampler) {
      sampler = e.sampler
    }

    let steps
    if (options && options.steps) {
      steps = options.steps
    } else if (e.steps) {
      steps = e.steps
    }
      

    let p
    if (e.weight) {
      p = [{
        prompt: e.prompt,
        weight: parseFloat(e.weight)
      }]
    } else {
      p = [{
        prompt: e.prompt,
        weight: 1.0
      }]
    }

  //"model_weights": "stable-diffusion-1.5",
    return {
      model: e.model,
      model_weights: e.model_weights,
      model_hash: e.model_hash,
      app_id: e.app_id,
      app_version: e.app_version,
      image: {
        prompt: p,
        sampler,
        steps: steps,
        cfg_scale: cfg,
        height: height,
        width: width,
        seed,
        negative_prompt: negative
      },
    }
  }
  flatten (app, converted, filepath, ctime, mtime) {
    let model
    if (converted.model_weights) {
      model = converted.model_weights
    } else if (converted.model_version) {
      model = converted.model_version
    }
    return {
      //app: S.escape(app),
      app,
      //model: (model ? S.escape(model) : 'NULL'),
      model,
      //sampler: (converted.image.sampler ? S.escape(converted.image.sampler) : 'NULL'),
      sampler: converted.image.sampler,
      //prompt: (converted.image.prompt[0].prompt ? S.escape(converted.image.prompt[0].prompt) : 'NULL'),
      prompt: converted.image.prompt[0].prompt,
      //weight: (converted.image.prompt[0].weight ? converted.image.prompt[0].weight : 'NULL'),
      weight: converted.image.prompt[0].weight,
      steps: converted.image.steps,
      cfg_scale: converted.image.cfg_scale,
      height: (converted.image.height ? converted.image.height : 'NULL'),
      width: (converted.image.width ? converted.image.width : 'NULL'),
      seed: converted.image.seed,
      //negative_prompt: S.escape(converted.image.negative_prompt),
      negative_prompt: converted.image.negative_prompt,
      mtime,
      ctime,
      //filename: S.escape(filepath)
      filename: filepath
    }
  }
  getPrompt(parsed) {
    if (parsed.Dream) {
      return parsed.Dream.match(/^".*"/g)[0]
    } else if (parsed.parameters) {
      return parsed.parameters.split("\n")[0]
    }
  }
  getMeta(parsed) {
    if (parsed["sd-metadata"]) {
      let p = JSON.parse(parsed["sd-metadata"])
      let image = p.image
      delete p.image
      let _prompt = image.prompt[0]
      image.prompt = _prompt.prompt
      image.weight = _prompt.weight
      return { ...image, ...p, }
    } else if (parsed.parameters) {
      let re = /([^:]+):([^:]+)(,|$|\n)/g
      let metaStr = parsed.parameters.split("\n").slice(1).join("\n")
      let captured = [...metaStr.matchAll(re)].map((x) => {
        return {
          key: x[1].trim(),
          val: x[2].trim(),
        }
      });
      let metaChunks = metaStr.split(",").map(x => x.trim())
      let attrs = {}
      for(let kv of captured) {
        attrs[kv.key] = kv.val
      }
      attrs.prompt = this.getPrompt(parsed)
      return attrs
    }
  }
}
module.exports = Parser
