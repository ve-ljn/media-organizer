# Media Organizer

A keyboard-driven desktop app for quickly sorting images and videos into folders. Built with Electron + React + Vite.

<img width="1275" height="796" alt="image" src="https://github.com/user-attachments/assets/6fd086a8-20de-4155-86db-9eeffae31f9d" />

<img width="1275" height="795" alt="image" src="https://github.com/user-attachments/assets/207372d1-2f89-46c5-9a4b-7f1f892c6522" />

## Features

- **Hotkey sorting** — map up to 6 destination folders to keys 1–6. Press a key to move the current file and auto-advance. Optional: leave them unset if you only want to crop, rotate, or rate
- **Separate tabs** for images and videos with individual file counters
- **Preview strip** — a sidebar of thumbnails showing where you are, a few files back, and what's coming. Click or tab to any of them to jump. It follows the same order as the arrow keys, including the rating filter and wrap-around
- **Star ratings** — rate files 1–5 stars (Alt+1–5) stored in JSON sidecar files
- **Rating filter** — filter navigation to only 4★+ or 5★ files
- **Video splitting** — press S at any point while watching to mark a cut; choose to keep the part before, the part after, or both halves (frame-accurate, re-encoded)
- **Cropping** — press C on an image or video to draw a crop box, with half/centre presets and a draggable toolbar. Nothing is written until you confirm a full-size preview
- **Frame region export** — pull a still PNG out of a video crop box (Shift+Enter), for clips that are really static composites
- **Rotation** — rotate images and videos left, right, or 180° (T), with a preview before it commits
- **Audio removal** — strip a video's audio track (M, twice to confirm). Stream-copied, so no re-encode and no quality loss
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
| `C` | Enter crop mode (images and videos) |
| `T` | Rotate — opens left / right / 180° chooser |
| `M` `M` | Remove a video's audio track (press twice to confirm) |
| `F` | Save current video frame as PNG |
| `L` | Toggle slideshow (videos only) |
| `R` | Toggle ±2s loop at current position (videos only) |
| `Scroll` / `+` / `-` | Zoom in/out |
| `0` | Reset zoom |
| `` ` `` | Toggle activity log |

### In crop mode

| Key | Action |
|-----|--------|
| drag | Move the box; drag a handle to resize |
| `Enter` | Preview the result, then `Enter` again to write it |
| `Shift+Enter` | Save the boxed region of the current video frame as a PNG |
| `Esc` | Leave crop mode (from the preview, `Esc` returns to editing) |

## Video Splitting

Press `S` while watching a video to mark a cut point. A dialog appears asking what to do with the two resulting halves:

| Option | Result |
|--------|--------|
| `1` — Delete first part | Keep everything after the cut |
| `2` — Delete second part | Keep everything before the cut |
| `Esc` — Keep both | Split into two files, delete nothing |

The original file is moved to the Recycle Bin after the split. Splits are frame-accurate (re-encoded with libx264 CRF 18).

## Cropping

Press `C` to draw a box over the current image or video. Everything outside it dims out, and the toolbar offers half/centre presets — dragging its `⠿` grip moves it out of the way. `Enter` opens a preview at the real output size; `Enter` again writes the file, `Esc` goes back to editing with the box intact.

By default the cropped file replaces the original, which goes to the Recycle Bin. Tick **Keep original** to keep both.

| | Video | Image |
|---|---|---|
| Encoding | Re-encoded (libx264 CRF 18); audio stream-copied | Source format kept — a JPEG stays a JPEG |
| Dimensions | Floored to even numbers, an H.264 requirement | Exact to the pixel |
| Preview shows | The current frame | The real source pixels |

On a video, `Shift+Enter` saves the boxed region of the current frame as a PNG instead — useful when a clip is a static composite and only one panel is worth keeping.

## Rotation

`T` opens a chooser (`1` left, `2` right, `3` upside down), then a preview before anything is written. Video is re-encoded; images keep their source format. **Keep original** is offered on the preview, same as for crop — left unticked, the rotated file replaces the original and the original goes to the Recycle Bin.

Animated GIFs are refused rather than re-encoded, since that would destroy the animation.

Crop, rotate, and audio removal all pin the file they were started on. If the player advances underneath an open box or dialog — slideshow reaching the end of a clip is the usual way — the action is cancelled rather than applied to whatever is on screen by then.

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
- **fluent-ffmpeg** + **ffmpeg-static v4** + **ffprobe-static v3** — splitting, cropping, rotation, audio removal
- **electron-store v8** — persistent config (source folder + hotkeys)
