const {app, shell, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron')
const { fdir } = require("fdir");
const contextMenu = require('electron-context-menu');
const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const fastq = require('fastq')
const getport = require('getport')
const Diffusionbee = require('./crawler/diffusionbee')
const Standard = require('./crawler/standard')
const GM = require('./crawler/gm')
const gm = new GM()
contextMenu({ showSaveImageAs: true });
var mainWindow;
function createWindow (port) {
  mainWindow = new BrowserWindow({
//    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
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
  session.defaultSession.clearStorageData()   // for testing freshly every time
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
  ipcMain.handle('sync', async (event, rpc) => {
    console.log("## sync from rpc", rpc)
    let filter
    const queue = fastq.promise(async (msg) => {
      mainWindow.webContents.send('msg', msg)
    }, 1)
    if (rpc.paths) {
      let diffusionbee;
      let standard;
      for(let i=0; i<rpc.paths.length; i++) {
        let { file_path, root_path } = rpc.paths[i]
        let res;
        if (/diffusionbee/g.test(root_path)) {
          if (!diffusionbee) {
            diffusionbee = new Diffusionbee(root_path)
            await diffusionbee.init()
          }
          res = await diffusionbee.sync(file_path, rpc.force)
        } else {
          if (!standard) {
            standard = new Standard(root_path)
            await standard.init()
          }
          res = await standard.sync(file_path, rpc.force)
        }
        if (res) {
          await queue.push({
            app: root_path,
            total: rpc.paths.length,
            progress: i,
            meta: res
          })
        } else {
          await queue.push({
            app: root_path,
            total: rpc.paths.length,
            progress: i,
          })
        }
      }
    } else if (rpc.root_path) {
      let filenames = await new fdir()
        .glob("**/*.png")
        .withBasePath()
        .crawl(rpc.root_path)
        .withPromise()

      let crawler;
      if (/diffusionbee/g.test(rpc.root_path)) {
        crawler = new Diffusionbee(rpc.root_path)
      } else {
        crawler = new Standard(rpc.root_path)
      }
      await crawler.init()
      for(let i=0; i<filenames.length; i++) {
        let filename = filenames[i]
        let stat = await fs.promises.stat(filename)
        let btime = new Date(stat.birthtime).getTime()
        if (btime > rpc.checkpoint) {
          console.log("above checkpoint", btime, rpc.checkpoint, filename)
          let res = await crawler.sync(filename, rpc.force)
          if (res) {
            await queue.push({
              app: rpc.root_path,
              total: filenames.length,
              progress: i,
              meta: res
            })
            continue;
          }
        }
        await queue.push({
          app: rpc.root_path,
          total: filenames.length,
          progress: i,
        })
      }
    }
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
//      path.resolve(home, ".diffusionbee", "images"),
    ]
  })
  ipcMain.handle('copy', (event, text) => {
    clipboard.writeText(text)
  })
  ipcMain.handle('gm', async (event, rpc) => {
    console.log("rpc",rpc)
    if (rpc.cmd === "set" || rpc.cmd === "rm") {
      let res = await gm[rpc.cmd](...rpc.args)
      return res
    } 
  })
  ipcMain.handle('open', async (event, file_path) => {
    console.log("OPEN", file_path)
    await shell.showItemInFolder(file_path)
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
