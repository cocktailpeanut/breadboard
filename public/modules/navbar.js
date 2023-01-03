//function debounce(func, timeout = 1000){
//  let timer;
//  return (...args) => {
//    clearTimeout(timer);
//    timer = setTimeout(() => { func.apply(this, args); }, timeout);
//  };
//}
class Navbar {
  constructor(app) {
    this.app = app
    this.sorters = [{
      direction: -1,
      column: "btime",
      compare: 0, // numeric compare
    }, {
      direction: 1,
      column: "btime",
      compare: 0, // numeric compare
    }, {
      direction: -1,
      column: "mtime",
      compare: 0, // alphabetical compare
    }, {
      direction: 1,
      column: "mtime",
      compare: 0, // alphabetical compare
    }, {
      direction: 1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }, {
      direction: -1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }]
    this.sorter = this.sorters[this.app.sorter_code]
    this.sorter_code = parseInt(this.app.sorter_code)
//    this.debouncedSearch = debounce(this.app.search)
    document.querySelector("#prev").addEventListener("click", (e) => {
      history.back()
    })
    document.querySelector("#next").addEventListener("click", (e) => {
      history.forward()
    })
    document.querySelector("#favorite").addEventListener("click", async (e) => {
      let query = document.querySelector(".search").value
      if (query && query.length > 0) {
        let exists = await this.app.db.favorites.get({ query })
        if (exists) {
          await this.app.db.favorites.where({ query }).delete()
        } else {
          await this.app.db.favorites.put({ query })
        }
        await this.app.search(query)
      }
    })
    document.querySelector("nav select").addEventListener("change", async (e) => {
      this.sorter_code = parseInt(e.target.value)
      this.app.sorter_code = this.sorter_code
      let query = document.querySelector(".search").value
      if (query && query.length > 0) {
        await this.app.search(query)
      } else {
        await this.app.search()
      }
    })
    document.querySelector("#sync").addEventListener('click', async (e) => {
      await this.app.synchronize()
    })
//    document.querySelector(".search").addEventListener('input', (e) => {
//      this.debouncedSearch(e.target.value)
//    })
    document.querySelector(".search").addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        this.app.search(e.target.value)
      }
    })

  }
  preprocess_query (phrase) {
    let fp_re = /file_path:"(.+)"/g
    let mn_re = /model_name:"(.+)"/g
    let tag_re = /tag:"(.+)"/g
    let fp_placeholder = "file_path:" + Date.now()
    let mn_placeholder = "model_name:" + Date.now()
    let tag_placeholder = "tag:" + Date.now()
    let test = fp_re.exec(phrase)
    let fp_captured
    if (test && test.length > 1) {
      phrase = phrase.replace(fp_re, fp_placeholder)
      fp_captured = test[1]
    }
    test = mn_re.exec(phrase)
    let mn_captured
    if (test && test.length > 1) {
      phrase = phrase.replace(mn_re, mn_placeholder)
      mn_captured = test[1]
    }

    test = tag_re.exec(phrase)
    let tag_captured
    if (test && test.length > 1) {
      phrase = phrase.replace(tag_re, tag_placeholder)
      tag_captured = test[1]
    }

    let prefixes = phrase.split(" ").filter(x => x && x.length > 0)
    const converted = []
    for (let prefix of prefixes) {
      if (prefix.startsWith("model_name:")) {
        if (mn_captured) {
          converted.push(`model_name:"${prefix.replace(/model_name:[0-9]+/, mn_captured)}"`)
        } else {
          converted.push(prefix)
        }
      } else if (prefix.startsWith("file_path:")) {
        if (fp_captured) {
          converted.push(`file_path:"${prefix.replace(/file_path:[0-9]+/, fp_captured)}"`)
        } else {
          converted.push(prefix)
        }
      } else if (prefix.startsWith("tag:")) {
        if (tag_captured) {
          converted.push(`tag:"${prefix.replace(/tag:[0-9]+/, tag_captured)}"`)
        } else {
          converted.push(prefix)
        }
      } else {
        converted.push(prefix)
      }
    }
    return converted
  }
  input (key, val) {
    // find the key in query
    let query = document.querySelector(".search").value

    let t = this.preprocess_query(query)
    //let t = query.split(" ").filter(x => x && x.length > 0)


    // find prompt search tokens (no :)
    let existingPromptTokens = []
    let existingAdvancedTokens = []


    let changed

    // 1. split the t array into existingPromptTokens and existingAdvancedTokens array
    for(let token of t) {
      if (/[^:]+:/.test(token)) {
        existingAdvancedTokens.push(token)
      } else {
        existingPromptTokens.push(token)
      }
    }

    let existingPrompts = JSON.stringify(existingPromptTokens)
    let existingAdvanced = JSON.stringify(existingAdvancedTokens)


    if (key === "prompt") {
      // 2. if the 'key' filter is 'prompt'
        // find whether the 'val' is included in the existingPromptTokens array
        // if it is included, don't do anything
        // if it's not included, append it to existingPromptTokens array
      let exists
      // tag: doesn't need to be cleaned. only search keywords need to be cleaned
      let cleaned = (val.startsWith("tag:") ? val : this.app.stripPunctuation(val))
      for(let i=0; i<existingPromptTokens.length; i++) {
        let token = existingPromptTokens[i]
        if (token === cleaned) {
          exists = true
        }
      }
      if (!exists) {
        existingPromptTokens.push(cleaned)
      }
    } else {
      // 3. if the 'key' filter is not 'prompt'
        // find whether the existingAdvancedTokens array contains any of the 'key' filter
        // if it does, replace the existingAdvancedTokens array with the new 'key' filter
        // if it doesn't, append the 'key' filter to the end of the existingAdvancedTokens array
      let exists
      for(let i=0; i<existingAdvancedTokens.length; i++) {
        let token = existingAdvancedTokens[i]
        if (token.startsWith(key + ":")) {
          existingAdvancedTokens[i] = key + ":" + val
          exists = true
        }
      }
      if (!exists) {
        existingAdvancedTokens.push(key + ":" + val) 
      }
    }



    let result = []
    for(let token of existingPromptTokens) {
      result.push(token)
    }
    for(let token of existingAdvancedTokens) {
      result.push(token)
    }

    if (existingPrompts === JSON.stringify(existingPromptTokens) && existingAdvanced === JSON.stringify(existingAdvancedTokens)) {
      // do nothing because they are identical before and after
    } else {
      // there's a change. re render
      let newQuery = result.join(" ")
      this.app.search(newQuery)
    }
      

  }
  notification(value) {
    let el = document.querySelector("#notification")
    el.classList.remove("hidden")
    tippy(el, {
      interactive: true,
      placement: "bottom-end",
      trigger: 'click',
      content: `<div class='notification-popup'>
  <div><a href='${value.$url}' id='get-update' target="_blank">Get update</a></div>
  <h2>${value.latest.title}</h2>
  <div>${value.latest.content}</div>
</div>`,
      allowHTML: true,
    });
  }
}
