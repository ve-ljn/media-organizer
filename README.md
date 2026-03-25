# Media Organizer

A keyboard-driven desktop app for quickly sorting images and videos into folders. Built with Electron + React + Vite.

<img width="1275" height="796" alt="image" src="https://github.com/user-attachments/assets/6fd086a8-20de-4155-86db-9eeffae31f9d" />

<img width="1275" height="795" alt="image" src="https://github.com/user-attachments/assets/207372d1-2f89-46c5-9a4b-7f1f892c6522" />

## Features

- **Hotkey sorting** — map up to 9 destination folders to keys 1–9. Press a key to move the current file and auto-advance
- **Separate tabs** for images and videos with individual file counters
- **Star ratings** — rate files 1–5 stars (Alt+1–5) stored in JSON sidecar files
- **Rating filter** — filter navigation to only 4★+ or 5★ files
- **Notes panel** — attach text notes to any file (N to toggle, Ctrl+S to save)
- **Video splitting** — mark split points (S) while playing, then execute to cut with ffmpeg (no re-encode)
- **Image upscaling** — 2× Lanczos upscale via sharp (U)
- **Video frame snapshot** — capture current frame as PNG (F)
- **Zoom & pan** — scroll to zoom, drag to pan, minimap overlay when zoomed
- **Slideshow mode** — auto-advance to next video when current one ends (L)
- **Loop mode** — loop ±2 seconds around current position (R)
- **Activity log** — in-app console showing all moves, deletes, ratings, splits (`` ` ``)
- **Recycle Bin** — deletes send files to the Recycle Bin, not permanent (D)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next file |
| `1`–`9` | Move file to hotkey folder and advance |
| `D` / `Delete` | Send to Recycle Bin |
| `N` | Toggle notes panel |
| `Alt+1`–`5` | Set star rating |
| `Alt+0` | Clear rating |
| `Space` | Next image / play-pause video |
| `S` | Add split point at current video position |
| `U` | Upscale image 2× (images only) |
| `F` | Save current video frame as PNG |
| `L` | Toggle slideshow (videos only) |
| `R` | Toggle ±2s loop at current position (videos only) |
| `Scroll` / `+` / `-` | Zoom in/out |
| `0` | Reset zoom |
| `Escape` | Reset zoom / close notes / clear split points |
| `` ` `` | Toggle activity log |

## Metadata

Ratings and notes are stored as JSON sidecar files next to each media file:

```
photo.jpg
photo.jpg.meta.json   ← { "rating": 4, "notes": "keeper" }
```

Sidecar files move with the media file when you use hotkey sorting, and are sent to the Recycle Bin when you delete.

## Setup

```bash
npm install
npm run dev     # start in development mode (hot reload)
npm run build   # build renderer for production
npm start       # run built app
```

Requires Node.js 18+. Windows only.

## Tech Stack

- **Electron 28** + **React 18** + **Vite 5**
- **fluent-ffmpeg** + **ffmpeg-static v4** — video splitting (CJS-compatible)
- **sharp** — image upscaling
- **electron-store v8** — persistent hotkey config (CJS-compatible)
