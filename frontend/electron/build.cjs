const { packager } = require('@electron/packager')
const path = require('path')
const fs = require('fs')

async function build() {
  const appPaths = await packager({
    dir: path.join(__dirname, '..'),
    name: 'Vidora',
    out: path.join(__dirname, '..', 'release'),
    platform: 'win32',
    arch: 'x64',
    electronVersion: '43.1.1',
    appVersion: '0.1.0',
    prune: false,
    packageManager: 'pnpm',
    overwrite: true,
  })
  const appDir = appPaths[0]
  console.log('✔ Packaged:', appDir)

  const backendExe = path.join(__dirname, '..', '..', 'backend', 'dist', 'backend.exe')
  if (fs.existsSync(backendExe)) {
    const resourcesDir = path.join(appDir, 'resources', 'backend')
    fs.mkdirSync(resourcesDir, { recursive: true })
    fs.cpSync(backendExe, path.join(resourcesDir, 'backend.exe'))
    console.log('✔ Copied backend.exe → resources/backend/')
  } else {
    console.warn('⚠ backend.exe not found at', backendExe)
  }
}

build().catch(console.error)
