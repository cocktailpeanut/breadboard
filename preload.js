const { contextBridge, webFrame, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  startDrag: (fileNames) => {
    ipcRenderer.invoke('ondragstart', fileNames)
  },
})
