const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let mainWindow
let backendProcess

function findPython() {
  const candidates = [
    path.join(__dirname, '..', '..', 'backend', '.venv', 'Scripts', 'python.exe'),
    path.join(__dirname, '..', '..', 'backend', '.venv', 'bin', 'python3'),
    'python3', 'python'
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
    try { require('child_process').execSync(`${c} --version`, { stdio: 'ignore' }); return c }
    catch {}
  }
  return 'python'
}

function startBackend() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    const pythonPath = findPython()
    const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8355']
    try {
      backendProcess = spawn(pythonPath, args, {
        stdio: 'pipe',
        cwd: path.join(__dirname, '..', '..', 'backend'),
      })
      backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
      backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`))
    } catch { /* backend optional in dev */ }
  } else {
    const backendExe = path.join(process.resourcesPath, 'backend', 'backend.exe')
    if (fs.existsSync(backendExe)) {
      backendProcess = spawn(backendExe, [], { stdio: 'pipe' })
      backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
      backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`))
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
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

app.whenReady().then(() => { startBackend(); createWindow() })
app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => { if (backendProcess && !backendProcess.killed) backendProcess.kill() })
