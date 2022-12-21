const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI',{
  sync: (app, checkpoint) => {
    return ipcRenderer.invoke('sync', app, checkpoint)
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
  defaults: () => {
    return ipcRenderer.invoke("defaults")
  }
})
