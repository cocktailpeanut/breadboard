const {app, shell, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron')
const contextMenu = require('electron-context-menu');
const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const fastq = require('fastq')
const getport = require('getport')
const Crawler = require('./crawler/index')
const crawler = new Crawler()
contextMenu({ showSaveImageAs: true });
var mainWindow;
function createWindow (port) {
  mainWindow = new BrowserWindow({
//    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
  mainWindow.loadURL(`http://localhost:${port}`)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}
app.whenReady().then(async () => {
//  session.defaultSession.clearStorageData()   // for testing freshly every time
  const port = await new Promise((resolve, reject) => {
    getport(function (e, p) {
      if (e) throw e
      resolve(p)
    })
  })

  const server = express()
  server.use(express.static(path.resolve(__dirname, 'public')))
  server.get('/file', (req, res) => {
    res.sendFile(req.query.file)
  })
  server.listen(port, () => {
    console.log(`Breadboard listening on port ${port}`)
  })
  ipcMain.handle('sync', async (event, app, checkpoint) => {
    console.log("## sync from checkpoint", app, checkpoint)
    const queue = fastq.promise(async (msg) => {
      mainWindow.webContents.send('msg', msg)
    }, 1)
    await crawler.get(app, checkpoint, async (msg) => {
      await queue.push(msg)
    })
  })
  ipcMain.handle('del', async (event, filenames) => {
    for(filename of filenames) {
      console.log("deleting", filename)
      await fs.promises.rm(filename).catch((e) => {
        console.log("error", e)
      })
    }
  })
  ipcMain.on('ondragstart', (event, filePaths) => {
    event.sender.startDrag({
      files: filePaths,
      icon: filePaths[0],
    })
  })
  ipcMain.handle('select', async (event) => {
    let res = await dialog.showOpenDialog({ properties: ['openDirectory', 'showHiddenFiles'] })
    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
      return res.filePaths
    }
  })
  ipcMain.handle('defaults', async (event) => {
    let home = os.homedir()
    return [
      path.resolve(home, "invokeai", "outputs"),
      path.resolve(home, ".diffusionbee", "images"),
    ]
  })
  ipcMain.handle('copy', (event, text) => {
    clipboard.writeText(text)
  })

  createWindow(port)
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port)
  })
//  mainWindow.webContents.openDevTools()

})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
