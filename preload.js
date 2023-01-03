const { contextBridge, webFrame, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI',{
  sync: (rpc) => {
    return ipcRenderer.invoke('sync', rpc)
  },
  del: (filenames) => {
    if (Array.isArray(filenames)) {
      return ipcRenderer.invoke("del", filenames)
    } else {
      return ipcRenderer.invoke("del", [filenames])
    }
  },
  startDrag: (fileNames) => {
    ipcRenderer.send('ondragstart', fileNames)
  },
  onMsg: (callback) => ipcRenderer.on('msg', callback),
  select: () => {
    return ipcRenderer.invoke("select")
  },
  copy: (text) => {
    return ipcRenderer.invoke("copy", text)
  },
  defaults: () => {
    return ipcRenderer.invoke("defaults")
  },
  gm: (rpc) => {
    return ipcRenderer.invoke("gm", rpc)
  },
  open: (file_path) => {
    return ipcRenderer.invoke("open", file_path)
  },
  xmp: (file_path) => {
    return ipcRenderer.invoke("xmp", file_path)
  },
  zoom: (ratio) => {
    // ratio 50 - 200
    if (ratio >= 50 && ratio <= 200) {
      webFrame.setZoomFactor(ratio/100)
    }
  },
  getzoom: () => {
    // ratio 50 - 200
    return webFrame.getZoomFactor()
  },
  docs: () => {
    ipcRenderer.invoke("docs")
  },
  theme: (val) => {
    ipcRenderer.invoke("theme", val)
  }
})
