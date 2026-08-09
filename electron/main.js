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

// ── Output helpers ────────────────────────────────────────

// Build a sibling path like "clip_rotated.mp4", numbering up if taken.
// Every writer must go through this: silently overwriting a previous output is
// data loss the user cannot undo. Pass forceExt to change the container (e.g.
// a PNG frame grabbed from an .mp4).
function uniqueOutputPath(filePath, suffix, forceExt) {
  const srcExt = path.extname(filePath)
  const ext = forceExt || srcExt
  const base = path.basename(filePath, srcExt)
  const dir = path.dirname(filePath)

  let out = path.join(dir, `${base}_${suffix}${ext}`)
  let n = 1
  while (fs.existsSync(out)) {
    out = path.join(dir, `${base}_${suffix}_${n}${ext}`)
    n++
  }
  return out
}

// Is this GIF animated?
//
// Counts Graphic Control Extension blocks (21 F9 04), one of which precedes
// each frame — more than one means multiple frames. Read from the bytes rather
// than ffprobe because ffprobe reports nb_frames as "N/A" for GIF often enough
// that a numeric check silently passes everything through.
async function isAnimatedGif(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.gif') return false

  const buf = await fs.promises.readFile(filePath)
  let blocks = 0
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) {
      blocks++
      if (blocks > 1) return true
    }
  }
  return false
}

// Re-encoding an animated GIF through the default encoder wrecks its palette
// and can flatten the animation. Refuse rather than hand back a degraded file.
async function rejectIfAnimatedGif(filePath) {
  if (await isAnimatedGif(filePath)) {
    throw new Error('Animated GIFs are not supported — re-encoding would destroy the animation')
  }
}

// Names for every segment of one split, chosen together so a re-split does not
// interleave "_part1_1" with a fresh "_part2".
function splitOutputPaths(filePath, count) {
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext)
  const dir = path.dirname(filePath)

  for (let run = 0; ; run++) {
    const tag = run === 0 ? '' : `_${run}`
    const paths = Array.from({ length: count }, (_, i) =>
      path.join(dir, `${base}_part${i + 1}${tag}${ext}`))
    if (!paths.some(p => fs.existsSync(p))) return paths
  }
}

// Quality flags per still-image container; codec defaults are lossy for photos
function imageQualityOptions(ext) {
  const lower = ext.toLowerCase()
  if (lower === '.jpg' || lower === '.jpeg') return ['-q:v', '2']
  if (lower === '.webp') return ['-quality', '90']
  return []
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
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const duration = metadata.format.duration
      const sorted = [...new Set([0, ...timestamps])].sort((a, b) => a - b)
      const outPaths = splitOutputPaths(filePath, sorted.length)
      const results = []

      const processSegment = (index) => {
        if (index >= sorted.length) return resolve(results)

        const start = sorted[index]
        const end = index < sorted.length - 1 ? sorted[index + 1] : duration
        const outPath = outPaths[index]

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

// Crop a video to a rectangle given in normalized (0–1) coordinates.
// Cropping is a filter, so -c copy is impossible — the video is re-encoded.
// Audio is stream-copied, so only the video track loses a generation.
ipcMain.handle('video:crop', async (event, { filePath, rect }) => {
  const { x, y, w, h } = rect || {}

  const valid = [x, y, w, h].every(n => typeof n === 'number' && isFinite(n))
  if (!valid || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) {
    throw new Error('Invalid crop rectangle')
  }

  const outPath = uniqueOutputPath(filePath, 'cropped')

  // Expressing the crop in terms of iw/ih rather than probed dimensions keeps
  // this correct for videos carrying rotation metadata: ffmpeg applies the
  // display matrix before the filter chain, so iw/ih are already in display
  // orientation and match what the user saw in the player.
  //
  // Every value is floored to a multiple of 2 because H.264 yuv420p cannot
  // encode odd widths/heights; an odd value fails the whole run.
  const even = (dim, v) => `floor(${dim}*${v}/2)*2`
  const filter =
    `crop=${even('iw', w)}:${even('ih', h)}:${even('iw', x)}:${even('ih', y)}`

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .videoFilters(filter)
      .outputOptions(['-c:v libx264', '-crf 18', '-preset fast', '-c:a copy'])
      .output(outPath)
      .on('progress', (p) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('media:progress', Math.round(p.percent || 0))
        }
      })
      .on('end', () => resolve(outPath))
      .on('error', (err) => {
        // Don't leave a half-written file behind for the renderer to adopt
        fs.promises.unlink(outPath).catch(() => {})
        reject(err)
      })
      .run()
  })
})

// Strip the audio track from a video.
// Returns { skipped: true } when there is nothing to remove, so the caller can
// say so instead of pointlessly rewriting the file.
ipcMain.handle('video:removeAudio', async (_event, { filePath }) => {
  const hasAudio = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)
      resolve((metadata.streams || []).some(s => s.codec_type === 'audio'))
    })
  })

  if (!hasAudio) return { skipped: true }

  const outPath = uniqueOutputPath(filePath, 'noaudio')

  // Dropping a track needs no re-encode: -c copy passes the video bitstream
  // through untouched, so this is fast and lossless regardless of clip length.
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions(['-c copy', '-an'])
      .output(outPath)
      .on('end', () => resolve({ outPath }))
      .on('error', (err) => {
        fs.promises.unlink(outPath).catch(() => {})
        reject(err)
      })
      .run()
  })
})

// Crop a still image. There is no even-dimension constraint here (that is an
// H.264 rule), so the rectangle is applied at full pixel precision.
ipcMain.handle('image:crop', async (_event, { filePath, rect }) => {
  const { x, y, w, h } = rect || {}

  const valid = [x, y, w, h].every(n => typeof n === 'number' && isFinite(n))
  if (!valid || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) {
    throw new Error('Invalid crop rectangle')
  }

  await rejectIfAnimatedGif(filePath)

  // Output keeps the source extension, so ffmpeg picks the matching encoder and
  // a JPEG stays a JPEG.
  const outPath = uniqueOutputPath(filePath, 'cropped')
  const quality = imageQualityOptions(path.extname(filePath))

  const filter =
    `crop=round(iw*${w}):round(ih*${h}):round(iw*${x}):round(ih*${y})`

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .videoFilters(filter)
      .outputOptions(quality)
      .output(outPath)
      .on('end', () => resolve(outPath))
      .on('error', (err) => {
        fs.promises.unlink(outPath).catch(() => {})
        reject(err)
      })
      .run()
  })
})

// Rotate an image or video by a quarter turn or a half turn.
// transpose=1 is 90° clockwise, transpose=2 is 90° counter-clockwise, and two
// clockwise turns give 180°. ffmpeg applies any existing rotation metadata
// before the filter chain, so this composes correctly with phone footage.
const ROTATE_FILTERS = {
  left: ['transpose=2'],
  right: ['transpose=1'],
  flip: ['transpose=1', 'transpose=1'],
}

ipcMain.handle('media:rotate', async (event, { filePath, direction }) => {
  const filters = ROTATE_FILTERS[direction]
  if (!filters) throw new Error(`Unknown rotation: ${direction}`)

  const ext = path.extname(filePath)
  const isImage = IMAGE_EXTENSIONS.includes(ext.toLowerCase())

  if (isImage) await rejectIfAnimatedGif(filePath)

  const outPath = uniqueOutputPath(filePath, 'rotated')

  // Rotation is a filter, so video cannot be stream-copied and must be
  // re-encoded. Images keep their source format and quality settings.
  const options = isImage
    ? imageQualityOptions(ext)
    : ['-c:v libx264', '-crf 18', '-preset fast', '-c:a copy']

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .videoFilters(filters)
      .outputOptions(options)
      .output(outPath)
      .on('progress', (p) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('media:progress', Math.round(p.percent || 0))
        }
      })
      .on('end', () => resolve(outPath))
      .on('error', (err) => {
        fs.promises.unlink(outPath).catch(() => {})
        reject(err)
      })
      .run()
  })
})

// Save a raw PNG data URL to disk (for video frame snapshots)
ipcMain.handle('media:saveFrame', async (_event, { filePath, dataUrl }) => {
  // The timestamp only resolves to the second, so two grabs in the same second
  // collide. uniqueOutputPath numbers them apart instead of overwriting.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outPath = uniqueOutputPath(filePath, `frame_${timestamp}`, '.png')

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  await fs.promises.writeFile(outPath, Buffer.from(base64, 'base64'))

  return { outPath, name: path.basename(outPath) }
})

// Lets the renderer refuse an animated GIF before showing a preview the user
// would confirm only to hit the same rejection from ffmpeg afterwards.
ipcMain.handle('media:isAnimatedGif', async (_event, filePath) => isAnimatedGif(filePath))

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

// Get/set persisted source folder
ipcMain.handle('config:getSourceFolder', () => store.get('sourceFolder', null))
ipcMain.handle('config:setSourceFolder', (_event, folder) => { store.set('sourceFolder', folder); return true })

// Get persisted hotkey config
ipcMain.handle('config:getHotkeys', () => {
  const empty = () => ({ folder: null, label: '' })
  const fallback = Array(6).fill(null).map(empty)
  const saved = store.get('hotkeys', fallback).slice(0, 6)
  while (saved.length < 6) saved.push(empty())
  return saved
})

// Save hotkey config
ipcMain.handle('config:setHotkeys', (_event, hotkeys) => {
  store.set('hotkeys', hotkeys)
  return true
})
