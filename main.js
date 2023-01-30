const {app, shell, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron')
const contextMenu = require('electron-context-menu');
const path = require("path")
const Breadmachine = require('breadmachine')
const packagejson = require('./package.json')
const is_mac = process.platform.startsWith("darwin")
contextMenu({ showSaveImageAs: true });
var mainWindow;
var theme = "default";
const titleBarOverlay = (theme) => {
  if (is_mac) {
    return false
  } else {
    if (theme === "dark") {
      return {
        color: "#111",
        symbolColor: "white"
      }
    } else if (theme === "default") {
      return {
        color: "white",
        symbolColor: "black"
      }
    }
    return {
      color: "white",
      symbolColor: "black"
    }
  }
}
function createWindow (port) {
  mainWindow = new BrowserWindow({
		titleBarStyle : "hidden",
		titleBarOverlay : titleBarOverlay(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
  })
  mainWindow.loadURL(`http://localhost:${port}`)
  mainWindow.maximize();


  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}
const breadmachine = new Breadmachine();
app.whenReady().then(async () => {
  await breadmachine.init({
    theme,
    config: path.resolve(__dirname, "breadboard.yaml"),
    version: packagejson.version,
    releases: {
      feed: "https://github.com/cocktailpeanut/breadboard/releases.atom",
      url: "https://github.com/cocktailpeanut/breadboard/releases"
    }
  })

  // Request handlers for api.js
  breadmachine.ipc.handle("theme", (event, _theme) => {
    breadmachine.ipc.theme = _theme
    if (mainWindow.setTitleBarOverlay) {
      mainWindow.setTitleBarOverlay(titleBarOverlay(breadmachine.ipc.theme))
    }
  })
  breadmachine.ipc.handle('debug', (event) => {
    mainWindow.webContents.openDevTools()
  })
  breadmachine.ipc.handle('select', async (event) => {
    let res = await dialog.showOpenDialog({ properties: ['openDirectory', 'showHiddenFiles'] })
    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
      return res.filePaths
    }
  })
  breadmachine.ipc.handle('open', async (event, file_path) => {
    await shell.showItemInFolder(file_path)
  })

  // Request handlers for preload.js
  ipcMain.handle("ondragstart", (event, filePaths) => {
    if (event && event.sender) {
      event.sender.startDrag({
        files: filePaths,
        icon: filePaths[0]
      })
    }
  })

  createWindow(breadmachine.port)
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(breadmachine.port)
  })

})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
