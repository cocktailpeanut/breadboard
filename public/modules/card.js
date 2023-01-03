const card = (meta) => {
  let attributes = Object.keys(meta).map((key) => {
    return { key, val: meta[key] }
  })
  let times = `<tr><td>created</td><td>${timeago.format(meta.btime)}</td><td></td></tr>
<tr><td>modified</td><td>${timeago.format(meta.mtime)}</td><td></td></tr>`

  let tags = []
  for(let attr of attributes) {
    if (attr.key === "tokens") {
      if (attr.val && attr.val.length > 0) {
        tags = attr.val.filter((x) => {
          return x.startsWith("tag:")
        })
      }
      break;
    }
  }
  let is_favorited = tags.includes("tag:favorite")

  let trs = attributes.filter((attr) => {
    //return attr.key !== "app" && attr.key !== "tokens"
    return attr.key !== "root_path"
  }).map((attr) => {
    let el
    if (attr.key === "model_name" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "agent" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "tokens") {
      let val = []
      if (attr.val && attr.val.length > 0) {
        val = attr.val
      }
      let els = val.filter((x) => {
        return x.startsWith("tag:")
      }).map((x) => {
        return `<span data-tag="${x}">
<button data-tag="${x}" class='tag-item'><i class="fa-solid fa-tag"></i> ${x.replace("tag:", "")}</button>
</span>`
      })
      el = els.join("")
      attr.key = "tags"
    } else if (attr.key === "prompt" && attr.val) {
      let tokens = attr.val.split(" ").filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join(" ")
    } else if (attr.key === "file_path" && attr.val) {
      let tokens = attr.val.split(/[\/\\]/).filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join("/")
    } else {
      el = attr.val
    }

    return `<tr data-key="${attr.key}"><td>${attr.key}</td><td class='attr-val'>${el}</td><td class='copy-td'><button class='copy-text' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span>copy</span></button></td></tr>`
  }).join("")


  let favClass = (is_favorited ? "fa-solid fa-heart" : "fa-regular fa-heart")

  return `<div class='grab'>
  <button class='gofullscreen'><i class="fa-solid fa-expand"></i></button>
  <button data-src="${meta.file_path}" class='open-file'><i class="fa-solid fa-up-right-from-square"></i></button>
  <button data-favorited="${is_favorited}" data-src="${meta.file_path}" class='favorite-file'><i class="${favClass}"></i></button>
  </div>
<img loading='lazy' data-root="${meta.root_path}" data-src="${meta.file_path}" src="/file?file=${encodeURIComponent(meta.file_path)}">
<div class='col'>
  <h4 class='flex'>${meta.prompt}</h4>
  <div class='xmp'>
    <div class='card-header'>
      <button class='copy-text' data-value="${meta.prompt}"><i class='fa-regular fa-clone'></i> <span>copy prompt</span></button>
      <button class='view-xmp' data-src="${meta.file_path}"><i class="fa-solid fa-code"></i> View XML</button>
    </div>
    <textarea readonly class='hidden slot'></textarea>
  </div>
  <table>${times}${trs}</table>
</div>`
}
