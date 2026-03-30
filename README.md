# Media Organizer

A keyboard-driven desktop app for quickly sorting images and videos into folders. Built with Electron + React + Vite.

<img width="1275" height="796" alt="image" src="https://github.com/user-attachments/assets/6fd086a8-20de-4155-86db-9eeffae31f9d" />

<img width="1275" height="795" alt="image" src="https://github.com/user-attachments/assets/207372d1-2f89-46c5-9a4b-7f1f892c6522" />

## Features

- **Hotkey sorting** — map up to 6 destination folders to keys 1–6. Press a key to move the current file and auto-advance
- **Separate tabs** for images and videos with individual file counters
- **Preview strip** — the next 10 files are shown as thumbnails in a sidebar to the right
- **Star ratings** — rate files 1–5 stars (Alt+1–5) stored in JSON sidecar files
- **Rating filter** — filter navigation to only 4★+ or 5★ files
- **Video splitting** — press S at any point while watching to mark a cut; choose to keep the part before, the part after, or both halves (frame-accurate, re-encoded)
- **Video frame snapshot** — capture current frame as PNG (F)
- **Zoom & pan** — scroll to zoom, drag to pan, minimap overlay when zoomed
- **Slideshow mode** — auto-advance to next video when current one ends (L)
- **Loop mode** — loop ±2 seconds around current position (R)
- **Activity log** — in-app console showing all moves, deletes, ratings, splits (`` ` ``)
- **Recycle Bin** — deletes send files to the Recycle Bin, not permanent (D)
- **Persistent session** — source folder and hotkey config are remembered across app restarts

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next file |
| `1`–`6` | Move file to hotkey folder and advance |
| `D` `D` | Send to Recycle Bin (press twice to confirm) |
| `Alt+1`–`5` | Set star rating |
| `Alt+0` | Clear rating |
| `Space` | Next image / play-pause video |
| `S` | Mark video split point at current position |
| `F` | Save current video frame as PNG |
| `L` | Toggle slideshow (videos only) |
| `R` | Toggle ±2s loop at current position (videos only) |
| `Scroll` / `+` / `-` | Zoom in/out |
| `0` | Reset zoom |
| `` ` `` | Toggle activity log |

## Video Splitting

Press `S` while watching a video to mark a cut point. A dialog appears asking what to do with the two resulting halves:

| Option | Result |
|--------|--------|
| `1` — Delete first part | Keep everything after the cut |
| `2` — Delete second part | Keep everything before the cut |
| `Esc` — Keep both | Split into two files, delete nothing |

The original file is moved to the Recycle Bin after the split. Splits are frame-accurate (re-encoded with libx264 CRF 18).

## Metadata

Ratings are stored as JSON sidecar files next to each media file:

```
photo.jpg
photo.jpg.meta.json   ← { "rating": 4 }
```

Sidecar files move with the media file when you use hotkey sorting, and are sent to the Recycle Bin when you delete.

## Development

```bash
npm install
npm run dev     # start in development mode (hot reload)
```

Requires Node.js 18+. Windows only.

## Building an Executable

```bash
npm run dist
```

This runs two steps automatically:

1. **`vite build`** — compiles the React frontend into `dist/`
2. **`electron-packager`** — packages everything into a standalone Windows executable

The output lands in `dist-app/MediaOrganizer-win32-x64/`. The folder contains `MediaOrganizer.exe` and can be zipped and shared — no installer needed.

**Notes:**
- Build targets Windows x64 only.
- ffmpeg and ffprobe binaries are bundled automatically via `ffmpeg-static` and `ffprobe-static`.
- Settings are stored in `%APPDATA%\media-organizer\` and persist independently of the app folder.

## Tech Stack

- **Electron 28** + **React 18** + **Vite 5**
- **fluent-ffmpeg** + **ffmpeg-static v4** + **ffprobe-static v3** — video splitting
- **electron-store v8** — persistent config (source folder + hotkeys)
