const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const Store = require('electron-store')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path
ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

const store = new Store()
const isDev = process.env.ELECTRON_IS_DEV === '1'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v']

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141414',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,        // restricts renderer to minimal privileges
      webSecurity: false,   // required for file:// media URLs; custom protocols don't work reliably on Windows
    },
    title: 'Media Organizer',
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Sidecar helpers ───────────────────────────────────────
function readSidecar(filePath) {
  const sidecarPath = filePath + '.meta.json'
  if (!fs.existsSync(sidecarPath)) return {}
  try { return JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) } catch { return {} }
}

function writeSidecar(filePath, patch) {
  const sidecarPath = filePath + '.meta.json'
  fs.writeFileSync(sidecarPath, JSON.stringify({ ...readSidecar(filePath), ...patch }, null, 2))
}

// ── IPC Handlers ──────────────────────────────────────────

// Open folder picker dialog
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// List all supported media files in a folder (non-recursive, sorted by name)
ipcMain.handle('media:getFiles', async (_event, folderPath) => {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    const fullPath = path.join(folderPath, entry.name)
    if (IMAGE_EXTENSIONS.includes(ext)) {
      files.push({ path: fullPath, name: entry.name, type: 'image', ext })
    } else if (VIDEO_EXTENSIONS.includes(ext)) {
      files.push({ path: fullPath, name: entry.name, type: 'video', ext })
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
})

// Move a file to a destination folder (handles name conflicts and cross-drive moves)
async function moveWithFallback(src, dest) {
  try {
    await fs.promises.rename(src, dest)
  } catch (err) {
    if (err.code !== 'EXDEV') throw err
    // Cross-device: copy then delete
    await fs.promises.copyFile(src, dest)
    await fs.promises.unlink(src)
  }
}

ipcMain.handle('media:move', async (_event, { filePath, destFolder }) => {
  const fileName = path.basename(filePath)
  let destPath = path.join(destFolder, fileName)

  if (fs.existsSync(destPath)) {
    const ext = path.extname(fileName)
    const base = path.basename(fileName, ext)
    let i = 1
    while (fs.existsSync(destPath)) {
      destPath = path.join(destFolder, `${base}_${i}${ext}`)
      i++
    }
  }

  await moveWithFallback(filePath, destPath)

  const sidecar = filePath + '.meta.json'
  if (fs.existsSync(sidecar)) {
    await moveWithFallback(sidecar, destPath + '.meta.json')
  }

  return destPath
})

// Send a file to the Recycle Bin
// Falls back to PowerShell Shell.Application if shell.trashItem fails (common on Windows)
async function trashFile(filePath) {
  try {
    await shell.trashItem(filePath)
  } catch {
    // Fallback: pass path via env var to avoid any shell injection risk,
    // and use execFile (async) so the main process thread is not blocked.
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command',
         'Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:TRASH_PATH, \'OnlyErrorDialogs\', \'SendToRecycleBin\')'],
        { windowsHide: true, env: { ...process.env, TRASH_PATH: filePath } },
        (err) => err ? reject(err) : resolve()
      )
    })
  }
}

ipcMain.handle('media:delete', async (_event, filePath) => {
  await trashFile(filePath)
  const sidecar = filePath + '.meta.json'
  if (fs.existsSync(sidecar)) {
    await trashFile(sidecar)
  }
  return true
})

// Split a video at given timestamps (array of seconds) using ffmpeg -c copy (no re-encode)
ipcMain.handle('video:split', async (_event, { filePath, timestamps }) => {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath)
    const base = path.basename(filePath, ext)
    const dir = path.dirname(filePath)

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const duration = metadata.format.duration
      const sorted = [...new Set([0, ...timestamps])].sort((a, b) => a - b)
      const results = []

      const processSegment = (index) => {
        if (index >= sorted.length) return resolve(results)

        const start = sorted[index]
        const end = index < sorted.length - 1 ? sorted[index + 1] : duration
        const outPath = path.join(dir, `${base}_part${index + 1}${ext}`)

        ffmpeg(filePath)
          .setStartTime(start)
          .setDuration(end - start)
          .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a copy'])
          .output(outPath)
          .on('end', () => {
            results.push(outPath)
            processSegment(index + 1)
          })
          .on('error', reject)
          .run()
      }

      processSegment(0)
    })
  })
})

// Save a raw PNG data URL to disk (for video frame snapshots)
ipcMain.handle('media:saveFrame', async (_event, { filePath, dataUrl }) => {
  const base = path.basename(filePath, path.extname(filePath))
  const dir = path.dirname(filePath)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = path.join(dir, `${base}_frame_${timestamp}.png`)

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  await fs.promises.writeFile(outPath, Buffer.from(base64, 'base64'))

  return { outPath, name: path.basename(outPath) }
})

// Set rating in sidecar JSON
ipcMain.handle('meta:setRating', async (_event, { filePath, rating }) => {
  writeSidecar(filePath, { rating })
  return true
})

// Batch-read ratings for a list of file paths
ipcMain.handle('meta:getAllRatings', async (_event, filePaths) => {
  const result = {}
  for (const filePath of filePaths) {
    result[filePath] = readSidecar(filePath).rating || 0
  }
  return result
})

// Get persisted hotkey config
ipcMain.handle('config:getHotkeys', () => {
  const fallback = Array(3).fill(null).map(() => ({ folder: null, label: '' }))
  return store.get('hotkeys', fallback).slice(0, 3)
})

// Save hotkey config
ipcMain.handle('config:setHotkeys', (_event, hotkeys) => {
  store.set('hotkeys', hotkeys)
  return true
})
