const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const Store = require('electron-store')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const sharp = require('sharp')

ffmpeg.setFfmpegPath(ffmpegPath)

const store = new Store()
const isDev = !app.isPackaged

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
      webSecurity: false, // allows loading local file:// URLs for media
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

// ── IPC Handlers ──────────────────────────────────────────

// Open folder picker dialog
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// List all supported media files in a folder (non-recursive, sorted by name)
ipcMain.handle('media:getFiles', async (_event, folderPath) => {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
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

// Move a file to a destination folder (handles name conflicts)
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

  fs.renameSync(filePath, destPath)

  const sidecar = filePath + '.meta.json'
  if (fs.existsSync(sidecar)) {
    fs.renameSync(sidecar, destPath + '.meta.json')
  }

  return destPath
})

// Send a file to the Recycle Bin
// Falls back to PowerShell Shell.Application if shell.trashItem fails (common on Windows)
async function trashFile(filePath) {
  try {
    await shell.trashItem(filePath)
  } catch {
    const escaped = filePath.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`,
      { windowsHide: true }
    )
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

// Read notes sidecar for a file
ipcMain.handle('notes:get', async (_event, filePath) => {
  const sidecarPath = filePath + '.meta.json'
  if (!fs.existsSync(sidecarPath)) return { notes: '' }
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
  } catch {
    return { notes: '' }
  }
})

// Write notes sidecar for a file
ipcMain.handle('notes:save', async (_event, { filePath, notes }) => {
  const sidecarPath = filePath + '.meta.json'
  let existing = {}
  if (fs.existsSync(sidecarPath)) {
    try { existing = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) } catch {}
  }
  fs.writeFileSync(sidecarPath, JSON.stringify({ ...existing, notes }, null, 2))
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
          .outputOptions(['-c copy', '-avoid_negative_ts make_zero'])
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

// Upscale an image 2x using Lanczos resampling
ipcMain.handle('media:upscale', async (_event, { filePath }) => {
  const ext = path.extname(filePath).toLowerCase()
  const base = path.basename(filePath, path.extname(filePath))
  const dir = path.dirname(filePath)
  const outPath = path.join(dir, `${base}_upscaled${ext}`)

  const meta = await sharp(filePath).metadata()
  await sharp(filePath)
    .resize(meta.width * 2, meta.height * 2, { kernel: sharp.kernel.lanczos3 })
    .toFile(outPath)

  return { outPath, name: path.basename(outPath) }
})

// Save a raw PNG data URL to disk (for video frame snapshots)
ipcMain.handle('media:saveFrame', async (_event, { filePath, dataUrl }) => {
  const base = path.basename(filePath, path.extname(filePath))
  const dir = path.dirname(filePath)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = path.join(dir, `${base}_frame_${timestamp}.png`)

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'))

  return { outPath, name: path.basename(outPath) }
})

// Set rating in sidecar JSON
ipcMain.handle('meta:setRating', async (_event, { filePath, rating }) => {
  const sidecarPath = filePath + '.meta.json'
  let existing = {}
  if (fs.existsSync(sidecarPath)) {
    try { existing = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) } catch {}
  }
  fs.writeFileSync(sidecarPath, JSON.stringify({ ...existing, rating }, null, 2))
  return true
})

// Batch-read ratings for a list of file paths
ipcMain.handle('meta:getAllRatings', async (_event, filePaths) => {
  const result = {}
  for (const filePath of filePaths) {
    const sidecarPath = filePath + '.meta.json'
    if (fs.existsSync(sidecarPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
        result[filePath] = data.rating || 0
      } catch {
        result[filePath] = 0
      }
    } else {
      result[filePath] = 0
    }
  }
  return result
})

// Get persisted hotkey config
ipcMain.handle('config:getHotkeys', () => {
  const fallback = Array(9).fill(null).map(() => ({ folder: null, label: '' }))
  const hotkeys = store.get('hotkeys', fallback)
  // Always ensure slot 1 has a default if it was never configured
  if (!hotkeys[0]?.folder) hotkeys[0] = { folder: 'C:\\', label: 'C:' }
  return hotkeys
})

// Save hotkey config
ipcMain.handle('config:setHotkeys', (_event, hotkeys) => {
  store.set('hotkeys', hotkeys)
  return true
})
