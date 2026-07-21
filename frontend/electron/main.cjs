const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')

let mainWindow
let backendProcess

function startBackend() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const backendPath = isDev
    ? path.join(__dirname, '..', '..', 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(process.resourcesPath, 'backend', 'backend.exe')

  const args = isDev
    ? ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8355']
    : []

  try {
    backendProcess = spawn(backendPath, args, {
      stdio: 'pipe',
      cwd: isDev ? path.join(__dirname, '..', '..', 'backend') : undefined,
    })
    backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
    backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`))
  } catch {
    // backend optional in dev
  }
}

// ponytail: backend process cleanup on exit, window->quit on all platforms
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})
