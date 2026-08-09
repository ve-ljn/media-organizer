import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import VideoPlayer from './VideoPlayer'
import SplitModal from './SplitModal'
import CropOverlay from './CropOverlay'
import RotateModal from './RotateModal'
import CropPreviewModal from './CropPreviewModal'
import './CropOverlay.css'
import useActivityLog, { LOG_TYPES } from '../hooks/useActivityLog'
import useZoomPan from '../hooks/useZoomPan'
import useMediaNavigation from '../hooks/useMediaNavigation'
import { toFileUrl } from '../utils'
import './MediaViewer.css'

// How much context the preview strip shows either side of the current file
const STRIP_BEFORE = 3
const STRIP_AHEAD = 10

const ROTATE_LABELS = { left: 'left', right: 'right', flip: '180°' }
const ROTATE_TRANSFORMS = { left: 'rotate(-90deg)', right: 'rotate(90deg)', flip: 'rotate(180deg)' }

const CROP_PRESETS = {
  'Left half':   { x: 0,    y: 0,    w: 0.5, h: 1   },
  'Right half':  { x: 0.5,  y: 0,    w: 0.5, h: 1   },
  'Top half':    { x: 0,    y: 0,    w: 1,   h: 0.5 },
  'Bottom half': { x: 0,    y: 0.5,  w: 1,   h: 0.5 },
  'Center 50%':  { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  'Reset':       { x: 0,    y: 0,    w: 1,   h: 1   },
}

export default function MediaViewer({ files: initialFiles, hotkeys, onBackToSetup }) {
  const [imageFiles, setImageFiles] = useState(initialFiles.filter(f => f.type === 'image'))
  const [videoFiles, setVideoFiles] = useState(initialFiles.filter(f => f.type === 'video'))
  const [tab, setTab] = useState(initialFiles.some(f => f.type === 'image') ? 'images' : 'videos')
  const [imageIndex, setImageIndex] = useState(0)
  const [videoIndex, setVideoIndex] = useState(0)

  const [pendingSplitTime, setPendingSplitTime] = useState(null)
  const [isSplitting, setIsSplitting] = useState(false)
  const [toast, setToast] = useState('')

  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState(null)   // normalized { x, y, w, h }
  const [isCropping, setIsCropping] = useState(false)
  const [cropProgress, setCropProgress] = useState(0)
  const [cropKind, setCropKind] = useState('video')   // what the progress bar is describing
  // Bumping this remounts VideoPlayer. releaseVideo() strips the <video> src to
  // free the Windows file lock; if the operation that followed then fails or is
  // skipped, the path is unchanged and React would keep the now-blank player.
  const [playerNonce, setPlayerNonce] = useState(0)
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [pendingRotate, setPendingRotate] = useState(false)
  const [cropPreview, setCropPreview] = useState(null)     // { src, rect, outW, outH }
  const [rotatePreview, setRotatePreview] = useState(null) // { src, transform, outW, outH, direction }
  const [cropPanelPos, setCropPanelPos] = useState(null)   // viewport px, null = default spot

  const [hoverRating, setHoverRating] = useState(0)
  const [ratingFilter, setRatingFilter] = useState(null)
  const [ratingsMap, setRatingsMap] = useState({})
  const [slideshow, setSlideshow] = useState(false)

  const initialFilesRef = useRef(initialFiles)
  const toastTimer = useRef(null)
  const deleteConfirmRef = useRef(false)
  const deleteConfirmTimer = useRef(null)
  const videoPlayerRef = useRef(null)
  const viewerMediaRef = useRef(null)
  const minimapCanvasRef = useRef(null)
  const cropPanelRef = useRef(null)
  const panelDragRef = useRef(null)
  const imgRef = useRef(null)
  const actionSourceRef = useRef(null)   // path the in-flight action was started on
  const audioConfirmRef = useRef(false)
  const audioConfirmTimer = useRef(null)

  // ── Derived state ─────────────────────────────────────────
  const files = tab === 'images' ? imageFiles : videoFiles
  const index = tab === 'images' ? imageIndex : videoIndex
  const setIndex = tab === 'images' ? setImageIndex : setVideoIndex
  const current = files[index]

  const filteredFiles = useMemo(() => {
    if (!ratingFilter) return files
    return files.filter(f => (ratingsMap[f.path] || 0) >= ratingFilter)
  }, [files, ratingsMap, ratingFilter])
  const filteredIndex = filteredFiles.findIndex(f => f.path === current?.path)
  const rating = ratingsMap[current?.path] || 0

  // Preview strip contents.
  //
  // Built from filteredFiles, not files, so the strip walks exactly the
  // sequence the arrow keys walk. Sourcing it from the raw list meant a rating
  // filter could show entries the keyboard would never reach, and clicking one
  // dropped you onto a file outside the filter.
  //
  // It wraps for the same reason: goNext/goPrev wrap with %, so on the last
  // file the keyboard returns to the start while the old slice simply ran out.
  const stripItems = useMemo(() => {
    const total = filteredFiles.length
    if (total === 0) return []

    const pos = filteredIndex >= 0 ? filteredIndex : 0
    const span = Math.min(total, STRIP_BEFORE + 1 + STRIP_AHEAD)

    return Array.from({ length: span }, (_, k) => {
      const at = (((pos - STRIP_BEFORE + k) % total) + total) % total
      return { file: filteredFiles[at], isCurrent: at === filteredIndex }
    })
  }, [filteredFiles, filteredIndex])

  // Strip entries are positions in filteredFiles; the index state indexes the
  // raw list, so map back through the path.
  const goToFile = useCallback((file) => {
    const at = files.findIndex(f => f.path === file.path)
    if (at >= 0) setIndex(at)
  }, [files, setIndex])

  // ── Toast ─────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }, [])

  // ── Hooks ─────────────────────────────────────────────────
  const { logEntries, setLogEntries, showConsole, setShowConsole, addLog, logEndRef } = useActivityLog()
  const { zoom, pan, setPan, dragActive, isDragging, changeZoom, resetZoom, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, minimapRect } = useZoomPan(viewerMediaRef)
  const { goNext, goPrev, advance } = useMediaNavigation({ index, files, setIndex, ratingFilter, ratingsMap, showToast, setSlideshow })

  // ── Refactor 3: releaseVideo as useCallback ───────────────
  const releaseVideo = useCallback(async () => {
    if (tab === 'videos' && videoPlayerRef.current) {
      videoPlayerRef.current.release()
      await new Promise(r => setTimeout(r, 150))
    }
  }, [tab])

  // ── Reset per-file state when file changes ────────────────
  useEffect(() => {
    setPendingSplitTime(null)
    setCropMode(false)
    setCropPreview(null)
    setPendingRotate(false)
    setRotatePreview(null)
    // Disarm any pending confirmations when navigating away
    deleteConfirmRef.current = false
    clearTimeout(deleteConfirmTimer.current)
    audioConfirmRef.current = false
    clearTimeout(audioConfirmTimer.current)
  }, [current?.path])

  // Relay ffmpeg encode progress from the main process
  useEffect(() => {
    const unsubscribe = window.api.onProgress(setCropProgress)
    return () => { if (typeof unsubscribe === 'function') unsubscribe() }
  }, [])

  // Bulk-load all ratings on mount so filter can work immediately.
  // initialFilesRef captures the value at mount; the dep array is intentionally empty.
  useEffect(() => {
    window.api.getAllRatings(initialFilesRef.current.map(f => f.path)).then(setRatingsMap)
  }, [])

  // Clean up timers on unmount
  useEffect(() => () => {
    clearTimeout(toastTimer.current)
    clearTimeout(deleteConfirmTimer.current)
    clearTimeout(audioConfirmTimer.current)
  }, [])

  // Reset pan (not zoom) when file changes
  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [current?.path])

  useEffect(() => {
    setPendingSplitTime(null)
    setCropMode(false)
    setCropPreview(null)
    setSlideshow(false)
  }, [tab])

  // ── Minimap canvas ────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'videos' || zoom <= 1) return
    let rafId
    const draw = () => {
      const canvas = minimapCanvasRef.current
      const video = videoPlayerRef.current?.getVideoElement()
      if (canvas && video && video.videoWidth) {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      }
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [tab, zoom, current?.path])

  // ── File operations ───────────────────────────────────────
  const moveFile = useCallback(async (hotkeyIndex) => {
    const hk = hotkeys[hotkeyIndex]
    if (!hk?.folder || !current) return
    try {
      await releaseVideo()
      await window.api.moveFile({ filePath: current.path, destFolder: hk.folder })
      const dest = hk.label || hk.folder.split(/[\\/]/).pop()
      showToast(`→ ${dest}`)
      addLog(`Moved  ${current.name}  →  ${dest}`, 'move')
      const newFiles = files.filter((_, i) => i !== index)
      if (tab === 'images') setImageFiles(newFiles)
      else setVideoFiles(newFiles)
      advance(newFiles, index)
    } catch (e) {
      showToast(`Error: ${e.message}`)
      addLog(`Error moving ${current.name}: ${e.message}`, 'delete')
    }
  }, [current, files, hotkeys, index, tab, releaseVideo, advance, showToast, addLog])

  const deleteFile = useCallback(async () => {
    if (!current) return

    // First press: arm confirmation
    if (!deleteConfirmRef.current) {
      deleteConfirmRef.current = true
      showToast('🗑 Press D again to delete')
      clearTimeout(deleteConfirmTimer.current)
      deleteConfirmTimer.current = setTimeout(() => {
        deleteConfirmRef.current = false
      }, 2000)
      return
    }

    // Second press: confirmed — delete
    deleteConfirmRef.current = false
    clearTimeout(deleteConfirmTimer.current)
    try {
      await releaseVideo()
      await window.api.deleteFile(current.path)
      showToast('Deleted')
      addLog(`Deleted  ${current.name}`, 'delete')
      const newFiles = files.filter((_, i) => i !== index)
      if (tab === 'images') setImageFiles(newFiles)
      else setVideoFiles(newFiles)
      advance(newFiles, index)
    } catch (e) {
      showToast(`Error: ${e.message}`)
      addLog(`Error deleting ${current.name}: ${e.message}`, 'delete')
    }
  }, [current, files, index, tab, releaseVideo, advance, showToast, addLog])

  const saveRating = useCallback(async (newRating, file) => {
    if (!file) return
    try {
      await window.api.setRating(file.path, newRating)
      setRatingsMap(prev => ({ ...prev, [file.path]: newRating }))
      const stars = newRating === 0 ? 'unrated' : '★'.repeat(newRating) + '☆'.repeat(5 - newRating)
      addLog(`Rated  ${file.name}  ${stars}`, 'rate')
    } catch (e) {
      showToast(`Rating failed: ${e.message}`)
      addLog(`Rating failed: ${e.message}`, 'delete')
    }
  }, [addLog, showToast])

  const executeSplits = useCallback(async (deleteOption) => {
    if (!current || pendingSplitTime === null) return
    setPendingSplitTime(null)
    if (deleteOption === 'cancel') return
    const originalPath = current.path
    const originalExt = current.ext
    const originalName = current.name
    setIsSplitting(true)
    try {
      await releaseVideo()
      const newPaths = await window.api.splitVideo({ filePath: originalPath, timestamps: [pendingSplitTime] })
      let keepPaths = newPaths

      if (deleteOption === 'first') {
        await window.api.deleteFile(newPaths[0])
        keepPaths = newPaths.slice(1)
        addLog(`Deleted first part  →  ${newPaths[0].split(/[\\/]/).pop()}`, 'delete')
      } else if (deleteOption === 'last') {
        await window.api.deleteFile(newPaths[newPaths.length - 1])
        keepPaths = newPaths.slice(0, -1)
        addLog(`Deleted last part  →  ${newPaths[newPaths.length - 1].split(/[\\/]/).pop()}`, 'delete')
      }

      await window.api.deleteFile(originalPath)

      const newParts = keepPaths.map(p => ({ path: p, name: p.split(/[\\/]/).pop(), type: 'video', ext: originalExt }))
      const newFiles = [...videoFiles.slice(0, index), ...newParts, ...videoFiles.slice(index + 1)]
      setVideoFiles(newFiles)
      showToast(`✂ Split into ${newParts.length} part${newParts.length !== 1 ? 's' : ''}`)
      addLog(`Split  ${originalName}  →  ${newParts.length} part${newParts.length !== 1 ? 's' : ''}`, 'split')
    } catch (e) {
      showToast(`Split failed: ${e.message}`)
      addLog(`Split failed: ${e.message}`, 'delete')
    } finally {
      setIsSplitting(false)
    }
  }, [current, videoFiles, index, pendingSplitTime, releaseVideo, showToast, addLog])

  // Zooming past 1x sets pointer-events:none on .zoom-wrapper, which contains
  // the crop overlay — the box would stay visually aligned but stop responding,
  // with nothing on screen explaining why. Swallow the wheel while cropping.
  const handleViewerWheel = useCallback((e) => {
    if (cropMode) {
      e.preventDefault()
      return
    }
    handleWheel(e)
  }, [cropMode, handleWheel])

  // ── File-identity guard, shared by every replacing action ─
  //
  // A modal or a crop box can stay open while the player advances underneath
  // it — slideshow reaching the end of a clip is the usual way. Each action
  // records the file it was started on and refuses to run against any other,
  // so a confirmation can never land on something the user was not looking at.
  const beginFileAction = useCallback(() => {
    videoPlayerRef.current?.pause()
    actionSourceRef.current = current?.path ?? null
  }, [current])

  const isSameFileAsAction = useCallback(
    () => !actionSourceRef.current || actionSourceRef.current === current?.path,
    [current],
  )

  // Any interactive or in-flight operation. Auto-advance must stand down for
  // all of these, not just crop.
  const actionPending =
    cropMode || !!cropPreview || pendingRotate || !!rotatePreview ||
    isCropping || isSplitting || pendingSplitTime !== null

  // ── Crop ──────────────────────────────────────────────────
  // The toolbar floats over the frame, so it can cover the part of the video
  // the user wants to crop. Let it be dragged out of the way by its grip.
  useEffect(() => {
    const onMove = (e) => {
      const d = panelDragRef.current
      if (!d) return
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
      setCropPanelPos({
        x: clamp(d.left + e.clientX - d.mx, 0, window.innerWidth - d.width),
        y: clamp(d.top + e.clientY - d.my, 0, window.innerHeight - d.height),
      })
    }
    const onUp = () => { panelDragRef.current = null }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const startPanelDrag = useCallback((e) => {
    const el = cropPanelRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    panelDragRef.current = {
      mx: e.clientX, my: e.clientY,
      left: r.left, top: r.top, width: r.width, height: r.height,
    }
    e.preventDefault()
  }, [])

  const enterCropMode = useCallback(() => {
    if (!current) return
    // useZoomPan disables pointer events above 1x and translates the frame,
    // which would put the box out of register with the picture. Start clean.
    resetZoom()
    beginFileAction()
    setCropRect({ x: 0, y: 0, w: 1, h: 1 })
    setCropMode(true)
    showToast('✂ Crop mode — drag the box, Enter to apply')
  }, [current, resetZoom, showToast, beginFileAction])

  // Nothing is written until the preview is confirmed. Build it from what is
  // already on screen so there is no ffmpeg round-trip just to look at it.
  const requestCropPreview = useCallback(async () => {
    if (!current || !cropRect) return

    if (!isSameFileAsAction()) {
      showToast('⚠ File changed — crop cancelled, press C again')
      setCropMode(false)
      return
    }

    if (cropRect.w > 0.995 && cropRect.h > 0.995) {
      showToast('Nothing to crop — shrink the box first')
      return
    }

    const isImage = tab === 'images'

    // Catch this before the preview rather than after the user confirms one
    if (isImage && current.ext?.toLowerCase() === '.gif' &&
        await window.api.isAnimatedGif(current.path)) {
      showToast('❌ Animated GIFs cannot be cropped')
      setCropMode(false)
      return
    }

    const el = isImage ? imgRef.current : videoPlayerRef.current?.getVideoElement()
    const iw = el ? (el.naturalWidth || el.videoWidth || 0) : 0
    const ih = el ? (el.naturalHeight || el.videoHeight || 0) : 0
    if (!iw || !ih) {
      showToast('❌ Media not ready')
      return
    }

    // Same rounding the main process will apply, so the number shown is the
    // number produced: even for H.264 video, exact for stills.
    const fit = isImage
      ? (n) => Math.max(1, Math.round(n))
      : (n) => Math.max(2, Math.floor(n / 2) * 2)

    const outW = fit(cropRect.w * iw)
    const outH = fit(cropRect.h * ih)

    if (isImage) {
      setCropPreview({ src: toFileUrl(current.path), rect: cropRect, outW, outH })
    } else {
      const dataUrl = videoPlayerRef.current?.captureFrame(cropRect)
      if (!dataUrl) {
        showToast('❌ No frame available')
        return
      }
      setCropPreview({ src: dataUrl, rect: null, outW, outH, note: 'current frame' })
    }
  }, [current, cropRect, tab, showToast, isSameFileAsAction])

  const executeCrop = useCallback(async () => {
    if (!current || !cropRect) return
    setCropPreview(null)

    if (!isSameFileAsAction()) {
      showToast('⚠ File changed — crop cancelled, press C again')
      setCropMode(false)
      return
    }

    if (cropRect.w > 0.995 && cropRect.h > 0.995) {
      showToast('Nothing to crop — shrink the box first')
      return
    }

    const isImage = tab === 'images'
    const sourceFiles = isImage ? imageFiles : videoFiles
    const applyFiles = isImage ? setImageFiles : setVideoFiles
    const applyIndex = isImage ? setImageIndex : setVideoIndex

    setIsCropping(true)
    setCropProgress(0)
    setCropKind(isImage ? 'image' : 'video')
    const originalPath = current.path
    const originalName = current.name

    try {
      // Windows keeps a lock on a video while it is loaded in the player, which
      // would make ffmpeg's write fail. Images are not held that way.
      if (!isImage) await releaseVideo()

      const outPath = isImage
        ? await window.api.cropImage({ filePath: originalPath, rect: cropRect })
        : await window.api.cropVideo({ filePath: originalPath, rect: cropRect })

      const newFile = {
        path: outPath,
        name: outPath.split(/[\\/]/).pop(),
        type: isImage ? 'image' : 'video',
        ext: current.ext,
      }

      let newFiles
      if (keepOriginal) {
        newFiles = [...sourceFiles.slice(0, index + 1), newFile, ...sourceFiles.slice(index + 1)]
      } else {
        await window.api.deleteFile(originalPath)
        newFiles = [...sourceFiles.slice(0, index), newFile, ...sourceFiles.slice(index + 1)]
      }
      applyFiles(newFiles)

      // Land on the cropped file. When the original is kept its path does not
      // change, so for video the player would never remount after
      // releaseVideo() and would sit on a black frame.
      if (keepOriginal) applyIndex(index + 1)

      setCropMode(false)
      showToast(`✂ Cropped → ${newFile.name}`)
      addLog(`Cropped  ${originalName}  →  ${newFile.name}`, 'split')
    } catch (e) {
      showToast(`Crop failed: ${e.message}`)
      addLog(`Crop failed: ${e.message}`, 'delete')
      // The player was released before ffmpeg ran; bring it back
      if (!isImage) setPlayerNonce(n => n + 1)
    } finally {
      setIsCropping(false)
    }
  }, [current, cropRect, keepOriginal, tab, imageFiles, videoFiles, index, releaseVideo, showToast, addLog, isSameFileAsAction])

  // Export the crop box as a still PNG instead of a video. Useful when a clip
  // is really a static composite — a 2x2 of stills that never move — and only
  // one panel is worth keeping. Nothing is re-encoded: the frame on screen is
  // read straight off the video at source resolution.
  const exportFrameAsImage = useCallback(async () => {
    if (tab !== 'videos' || !current || !cropRect) return

    if (!isSameFileAsAction()) {
      showToast('⚠ File changed — cancelled, press C again')
      setCropMode(false)
      return
    }

    // Capture before releasing the player — release() clears the src.
    const dataUrl = videoPlayerRef.current?.captureFrame(cropRect)
    if (!dataUrl) {
      showToast('❌ No frame available')
      return
    }

    setIsCropping(true)
    setCropKind('still')
    try {
      const { outPath, name } = await window.api.saveFrame(current.path, dataUrl)

      // Surface it in the Images tab straight away, in media:getFiles order.
      // Inserting into a sorted list shifts every later index, so nudge
      // imageIndex too — otherwise the Images tab silently ends up on a
      // different file than it was on.
      const nextImages = [...imageFiles, { path: outPath, name, type: 'image', ext: '.png' }]
        .sort((a, b) => a.name.localeCompare(b.name))
      const insertedAt = nextImages.findIndex(f => f.path === outPath)
      setImageFiles(nextImages)
      setImageIndex(i => (insertedAt <= i ? i + 1 : i))

      showToast(`🖼 Saved image: ${name}`)
      addLog(`Frame region  ${current.name}  →  ${name}`, 'save')
      setCropMode(false)

      // The checkbox means the same thing here: drop the source once the part
      // worth keeping has been extracted.
      if (!keepOriginal) {
        await releaseVideo()
        await window.api.deleteFile(current.path)
        const newFiles = videoFiles.filter((_, i) => i !== index)
        setVideoFiles(newFiles)
        addLog(`Deleted  ${current.name}`, 'delete')
        advance(newFiles, index)
      }
    } catch (e) {
      showToast(`Save failed: ${e.message}`)
      addLog(`Save failed: ${e.message}`, 'delete')
    } finally {
      setIsCropping(false)
    }
  }, [tab, current, cropRect, keepOriginal, imageFiles, videoFiles, index, releaseVideo, advance, showToast, addLog, isSameFileAsAction])

  // ── Rotate ────────────────────────────────────────────────
  // Rotation replaces the original, so it gets the same look-before-you-commit
  // step as crop rather than firing straight from the direction picker.
  const requestRotatePreview = useCallback(async (direction) => {
    setPendingRotate(false)
    if (!direction || !current) return

    const isImage = tab === 'images'

    if (isImage && current.ext?.toLowerCase() === '.gif' &&
        await window.api.isAnimatedGif(current.path)) {
      showToast('❌ Animated GIFs cannot be rotated')
      return
    }

    // Pin the file for the same reason crop does: the preview is a decision
    // point, and the player can advance while it is open.
    beginFileAction()

    const el = isImage ? imgRef.current : videoPlayerRef.current?.getVideoElement()
    const iw = el ? (el.naturalWidth || el.videoWidth || 0) : 0
    const ih = el ? (el.naturalHeight || el.videoHeight || 0) : 0
    if (!iw || !ih) {
      showToast('❌ Media not ready')
      return
    }

    const quarterTurn = direction !== 'flip'
    let src = isImage ? toFileUrl(current.path) : videoPlayerRef.current?.captureFrame()
    if (!src) {
      showToast('❌ No frame available')
      return
    }

    setRotatePreview({
      src,
      transform: ROTATE_TRANSFORMS[direction],
      outW: quarterTurn ? ih : iw,
      outH: quarterTurn ? iw : ih,
      direction,
      note: isImage ? undefined : 'current frame',
    })
  }, [current, tab, showToast, beginFileAction])

  const executeRotate = useCallback(async (direction) => {
    setPendingRotate(false)
    if (!direction || !current) return

    if (!isSameFileAsAction()) {
      showToast('⚠ File changed — rotate cancelled, press T again')
      setRotatePreview(null)
      return
    }

    const isImage = tab === 'images'
    const sourceFiles = isImage ? imageFiles : videoFiles
    const applyFiles = isImage ? setImageFiles : setVideoFiles
    const applyIndex = isImage ? setImageIndex : setVideoIndex

    setIsCropping(true)
    setCropKind('rotate')
    const originalPath = current.path
    const originalName = current.name

    try {
      if (!isImage) await releaseVideo()

      const outPath = await window.api.rotateMedia({ filePath: originalPath, direction })
      const newFile = {
        path: outPath,
        name: outPath.split(/[\\/]/).pop(),
        type: isImage ? 'image' : 'video',
        ext: current.ext,
      }

      // Honours the same Keep original setting as crop, rather than always
      // replacing regardless of what the user chose.
      if (keepOriginal) {
        applyFiles([...sourceFiles.slice(0, index + 1), newFile, ...sourceFiles.slice(index + 1)])
        applyIndex(index + 1)
      } else {
        await window.api.deleteFile(originalPath)
        applyFiles([...sourceFiles.slice(0, index), newFile, ...sourceFiles.slice(index + 1)])
      }

      showToast(`⟳ Rotated ${ROTATE_LABELS[direction]} → ${newFile.name}`)
      addLog(`Rotated ${ROTATE_LABELS[direction]}  ${originalName}  →  ${newFile.name}`, 'split')
    } catch (e) {
      showToast(`Rotate failed: ${e.message}`)
      addLog(`Rotate failed: ${e.message}`, 'delete')
      if (!isImage) setPlayerNonce(n => n + 1)
    } finally {
      setIsCropping(false)
    }
  }, [current, tab, keepOriginal, imageFiles, videoFiles, index, releaseVideo, showToast, addLog, isSameFileAsAction])

  // ── Remove audio ──────────────────────────────────────────
  const removeAudio = useCallback(async () => {
    if (tab !== 'videos' || !current) return

    // Audio removal cannot be previewed and replaces the original, so it takes
    // a second press to confirm — same shape as the delete guard.
    if (!audioConfirmRef.current) {
      audioConfirmRef.current = true
      beginFileAction()
      showToast('🔇 Press M again to remove audio')
      clearTimeout(audioConfirmTimer.current)
      audioConfirmTimer.current = setTimeout(() => { audioConfirmRef.current = false }, 2000)
      return
    }
    audioConfirmRef.current = false
    clearTimeout(audioConfirmTimer.current)

    if (!isSameFileAsAction()) {
      showToast('⚠ File changed — press M again')
      return
    }

    setIsCropping(true)
    setCropKind('audio')
    const originalPath = current.path
    const originalName = current.name

    try {
      await releaseVideo()
      const { outPath, skipped } = await window.api.removeAudio({ filePath: originalPath })

      if (skipped) {
        showToast('🔇 No audio track — nothing to remove')
        setPlayerNonce(n => n + 1)
        return
      }

      const newFile = {
        path: outPath,
        name: outPath.split(/[\\/]/).pop(),
        type: 'video',
        ext: current.ext,
      }

      // The silent copy replaces the original, which goes to the Recycle Bin.
      await window.api.deleteFile(originalPath)
      setVideoFiles([...videoFiles.slice(0, index), newFile, ...videoFiles.slice(index + 1)])

      showToast(`🔇 Audio removed → ${newFile.name}`)
      addLog(`Audio removed  ${originalName}  →  ${newFile.name}`, 'split')
    } catch (e) {
      showToast(`Remove audio failed: ${e.message}`)
      addLog(`Remove audio failed: ${e.message}`, 'delete')
      setPlayerNonce(n => n + 1)
    } finally {
      setIsCropping(false)
    }
  }, [tab, current, videoFiles, index, releaseVideo, showToast, addLog, beginFileAction, isSameFileAsAction])

  // ── Slideshow ─────────────────────────────────────────────
  const handleVideoEnded = useCallback(() => {
    // Never auto-advance out from under an open crop box, rotate chooser, or
    // preview: the file would change mid-decision and the confirmed action
    // would land on the wrong clip.
    if (slideshow && !actionPending) goNext()
  }, [slideshow, actionPending, goNext])

  // ── Keyboard ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
      if (inInput) {
        if (e.key === 'Escape') e.target.blur()
        return
      }

      // Let a focused strip thumbnail handle its own activation. Arrows still
      // navigate globally; only the activation keys are ceded, otherwise Space
      // would both click the thumbnail and trigger play/advance.
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.preview-strip')) return
      // The rotate modal owns 1/2/3/Esc, and its preview owns Enter/Esc
      if (pendingSplitTime !== null || isSplitting || isCropping || pendingRotate || rotatePreview) return

      // Crop mode owns the keyboard: swallow everything else so a stray digit
      // can't move or delete the file out from under an in-progress crop.
      if (cropMode) {
        // The preview modal owns Enter/Esc while it is open
        if (cropPreview) return

        if (e.key === 'Escape') {
          e.preventDefault()
          setCropMode(false)
          showToast('Crop cancelled')
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (e.shiftKey && tab === 'videos') exportFrameAsImage()
          else requestCropPreview()
        }
        return
      }

      if (e.altKey && e.key >= '0' && e.key <= '5') {
        e.preventDefault()
        const newRating = parseInt(e.key)
        saveRating(newRating, current)
        showToast(newRating === 0 ? 'Rating cleared' : '★'.repeat(newRating) + '☆'.repeat(5 - newRating))
        return
      }

      switch (e.key) {
        case '`':
          setShowConsole(v => !v)
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowUp':
          e.preventDefault()
          if (zoom > 1) setPan(p => ({ ...p, y: p.y + 80 }))
          break
        case 'ArrowDown':
          e.preventDefault()
          if (zoom > 1) setPan(p => ({ ...p, y: p.y - 80 }))
          break
        case ' ':
          e.preventDefault()
          if (tab === 'images') goNext()
          else videoPlayerRef.current?.togglePlay()
          break
        case 'd': case 'D': case 'Delete':
          deleteFile()
          break
        case 'l': case 'L':
          if (tab === 'videos') {
            setSlideshow(v => {
              const next = !v
              showToast(next ? '▶▶ Slideshow ON' : '⏹ Slideshow OFF')
              if (next) videoPlayerRef.current?.play()
              return next
            })
          }
          break
        case 'c': case 'C':
          enterCropMode()
          break
        case 'm': case 'M':
          removeAudio()
          break
        case 't': case 'T':
          if (current) setPendingRotate(true)
          break
        case 'r': case 'R':
          if (tab === 'videos' && videoPlayerRef.current) {
            const nowLooping = videoPlayerRef.current.loopAround()
            showToast(nowLooping ? '🔁 Looping ±2s — R to cancel' : '⏹ Loop cancelled')
          }
          break
        case '+': case '=':
          changeZoom(0.5)
          break
        case '-':
          changeZoom(-0.5)
          break
        case '0':
          if (!e.altKey) resetZoom()
          break
        case 'f': case 'F':
          if (tab === 'videos' && videoPlayerRef.current) {
            const dataUrl = videoPlayerRef.current.captureFrame()
            if (!dataUrl) { showToast('❌ No frame available'); break }
            window.api.saveFrame(current.path, dataUrl)
              .then(({ name }) => { showToast(`📸 Saved: ${name}`); addLog(`Frame captured  →  ${name}`, 'save') })
              .catch(err => { showToast(`❌ Snapshot failed: ${err.message}`); addLog(`Snapshot failed: ${err.message}`, 'delete') })
          }
          break
        case 'Escape':
          if (zoom > 1) { resetZoom(); break }
          break
        default:
          if (!e.altKey && e.key >= '1' && e.key <= '6') moveFile(parseInt(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, deleteFile, moveFile, saveRating, tab, changeZoom, resetZoom, zoom, showToast, addLog, current, setShowConsole, setPan, pendingSplitTime, isSplitting, cropMode, isCropping, enterCropMode, executeCrop, exportFrameAsImage, removeAudio, pendingRotate, cropPreview, requestCropPreview, rotatePreview])

  const progressPct = files.length > 1 ? (index / (files.length - 1)) * 100 : 100
  const mediaCursor = zoom > 1 ? (dragActive ? 'grabbing' : 'grab') : 'default'

  const renderEmpty = () => (
    <div className="viewer-empty">
      <div className="viewer-empty-icon">{tab === 'images' ? '🖼' : '🎬'}</div>
      <h2>No {tab === 'images' ? 'images' : 'videos'} left</h2>
      <p>All {tab === 'images' ? 'images' : 'videos'} have been organized.</p>
    </div>
  )

  return (
    <div className="viewer">
      {/* Top bar */}
      <div className="viewer-topbar">
        <button className="btn-back" onClick={onBackToSetup}>← Setup</button>

        <div className="viewer-tabs">
          <button className={`viewer-tab ${tab === 'images' ? 'active' : ''}`} onClick={() => setTab('images')}>
            Images <span className="tab-count">{imageFiles.length}</span>
          </button>
          <button className={`viewer-tab ${tab === 'videos' ? 'active' : ''}`} onClick={() => setTab('videos')}>
            Videos <span className="tab-count">{videoFiles.length}</span>
          </button>
        </div>

        {files.length > 0 && (
          <>
            <div className="viewer-filename" title={current?.path}>{current?.name}</div>
            <div className="viewer-type">{current?.ext?.replace('.', '').toUpperCase()}</div>

            {/* Rating filter */}
            <div className="rating-filter" title="Filter by rating">
              {[null, 4, 5].map(val => (
                <button
                  key={val ?? 'all'}
                  className={`rating-filter-btn ${ratingFilter === val ? 'active' : ''}`}
                  onClick={() => {
                    setRatingFilter(val)
                    if (val) {
                      const firstMatch = files.findIndex(f => (ratingsMap[f.path] || 0) >= val)
                      if (firstMatch >= 0) setIndex(firstMatch)
                      else showToast(`No ${val}★+ files`)
                    }
                  }}
                >
                  {val === null ? 'All' : val === 4 ? '4★+' : '5★'}
                </button>
              ))}
            </div>

            {/* Star rating */}
            <div className="star-rating" title="Alt+1–5 to rate, Alt+0 to clear">
              {[1,2,3,4,5].map(n => (
                <span
                  key={n}
                  className={`star ${n <= (hoverRating || rating) ? 'star-on' : ''}`}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => {
                    const newRating = n === rating ? 0 : n
                    saveRating(newRating, current)
                    showToast(newRating === 0 ? 'Rating cleared' : '★'.repeat(newRating) + '☆'.repeat(5 - newRating))
                  }}
                >★</span>
              ))}
            </div>

            <div className="viewer-progress">
              {ratingFilter
                // filteredIndex is -1 when the current file falls outside the
                // filter — e.g. its rating was just lowered. Showing "0" read
                // like a broken counter; "–" says "not in this filter".
                ? `${filteredIndex >= 0 ? filteredIndex + 1 : '–'} / ${filteredFiles.length}`
                : `${index + 1} / ${files.length}`}
              {ratingFilter && <span className="filter-badge">{ratingFilter}★+</span>}
            </div>
            <div className="viewer-progbar">
              <div className="viewer-progfill" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        )}

        {zoom !== 1 && (
          <div className="zoom-indicator" title="Press 0 to reset zoom">🔍 {Math.round(zoom * 100)}%</div>
        )}

        {files.length > 0 && (
          <button
            className="btn-rotate"
            onClick={() => setPendingRotate(true)}
            title="Rotate this file (T)"
          >
            ⟳ Rotate
          </button>
        )}

        {tab === 'videos' && files.length > 0 && (
          <button
            className={`btn-slideshow ${slideshow ? 'active' : ''}`}
            onClick={() => setSlideshow(v => { const next = !v; showToast(next ? '▶▶ Slideshow ON' : '⏹ Slideshow OFF'); if (next) videoPlayerRef.current?.play(); return next })}
            title="Auto-advance when video ends (L)"
          >
            {slideshow ? '⏹ Stop' : '▶▶ Slideshow'}
          </button>
        )}

        <button className={`btn-console-toggle ${showConsole ? 'active' : ''}`} onClick={() => setShowConsole(v => !v)} title="Activity log (`)">
          📋 Log {logEntries.length > 0 && <span className="log-count">{logEntries.length}</span>}
        </button>
      </div>

      {/* Main content */}
      <div className="viewer-body">
        <div
          ref={viewerMediaRef}
          className="viewer-media"
          style={{ cursor: mediaCursor }}
          onWheel={handleViewerWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {files.length === 0 ? renderEmpty() : (
            <div
              className="zoom-wrapper"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isDragging.current ? 'none' : 'transform 0.1s ease',
                userSelect: 'none',
                pointerEvents: zoom > 1 ? 'none' : 'auto',
              }}
            >
              {tab === 'images' && (
                <>
                  <img
                    ref={imgRef}
                    key={current.path}
                    src={toFileUrl(current.path)}
                    className="viewer-image"
                    alt={current.name}
                    draggable={false}
                  />
                  {cropMode && cropRect && (
                    <CropOverlay mediaRef={imgRef} rect={cropRect} onChange={setCropRect} />
                  )}
                </>
              )}
              {tab === 'videos' && (
                <VideoPlayer
                  ref={videoPlayerRef}
                  key={`${current.path}#${playerNonce}`}
                  filePath={current.path}
                  onSplitRequest={t => setPendingSplitTime(t)}
                  onVideoEnded={handleVideoEnded}
                  autoPlay={slideshow}
                  cropMode={cropMode}
                  cropRect={cropRect}
                  onCropChange={setCropRect}
                />
              )}
            </div>
          )}

          {/* Minimap */}
          {zoom > 1 && current && (
            <div className="minimap">
              {tab === 'images' && <img src={toFileUrl(current.path)} className="minimap-thumb" draggable={false} alt="" />}
              {tab === 'videos' && <canvas ref={minimapCanvasRef} className="minimap-thumb" width={160} height={100} />}
              <div className="minimap-viewport" style={{
                left: `${minimapRect.left * 100}%`, top: `${minimapRect.top * 100}%`,
                width: `${minimapRect.width * 100}%`, height: `${minimapRect.height * 100}%`,
              }} />
            </div>
          )}
        </div>

        {/* Preview strip */}
        {files.length > 1 && (
          <div className="preview-strip">
            {stripItems.map(({ file, isCurrent }) => (
              // A button rather than a div: focusable, and Enter/Space activate
              // it natively, so the strip is reachable without a mouse.
              <button
                type="button"
                key={file.path}
                className={`preview-item ${isCurrent ? 'preview-item--current' : ''}`}
                onClick={() => goToFile(file)}
                title={file.name}
                aria-current={isCurrent ? 'true' : undefined}
              >
                {file.type === 'image'
                  ? <img
                      src={toFileUrl(file.path)}
                      className="preview-thumb"
                      alt={file.name}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                    />
                  : <div className="preview-video-icon">🎬</div>
                }
                <div className="preview-name">{file.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Activity console */}
      {showConsole && (
        <div className="console-panel">
          <div className="console-header">
            <span>Activity Log</span>
            <button className="console-clear" onClick={() => setLogEntries([])}>Clear</button>
            <button className="console-close" onClick={() => setShowConsole(false)}>✕</button>
          </div>
          <div className="console-entries">
            {logEntries.length === 0 && <div className="console-empty">No activity yet.</div>}
            {logEntries.map(e => (
              <div key={e.id} className={`console-entry ${LOG_TYPES[e.type] || ''}`}>
                <span className="console-time">{e.time}</span>
                <span className="console-msg">{e.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Splitting spinner */}
      {isSplitting && (
        <div className="split-bar">
          <div className="split-bar-label">✂ Splitting…</div>
        </div>
      )}

      {/* Crop toolbar */}
      {cropMode && !isCropping && cropRect && (
        <div
          className="crop-panel"
          ref={cropPanelRef}
          style={cropPanelPos
            ? { left: cropPanelPos.x, top: cropPanelPos.y, bottom: 'auto', transform: 'none' }
            : undefined}
        >
          <div
            className="crop-grip"
            onPointerDown={startPanelDrag}
            title="Drag to move this toolbar"
          >⠿</div>

          <div className="crop-group">
            <span className="crop-group-label">Keep</span>
            {Object.entries(CROP_PRESETS).map(([label, preset]) => (
              <button key={label} className="crop-chip" onClick={() => setCropRect(preset)}>
                {label}
              </button>
            ))}
          </div>

          <div className="crop-readout">
            <b>{Math.round(cropRect.w * 100)}%</b> × <b>{Math.round(cropRect.h * 100)}%</b> of frame
          </div>

          <button className="crop-confirm" onClick={requestCropPreview}>
            ✂ Crop &amp; Save (Enter)
          </button>

          {tab === 'videos' && (
            <button
              className="crop-still"
              onClick={exportFrameAsImage}
              title="Save the boxed region of the current frame as a PNG instead of a video"
            >
              🖼 Save as image (Shift+Enter)
            </button>
          )}

          <button className="crop-cancel" onClick={() => { setCropPreview(null); setCropMode(false) }}>
            Cancel (Esc)
          </button>

          <label className="crop-keep">
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={e => setKeepOriginal(e.target.checked)}
            />
            Keep original
          </label>
        </div>
      )}

      {/* Crop progress — re-encoding is not instant, so show real percentage */}
      {isCropping && (
        <div className="crop-bar">
          {cropKind === 'video' && (
            <>
              <div className="crop-bar-label">✂ Cropping &amp; re-encoding… {cropProgress}%</div>
              <div className="crop-bar-track">
                <div className="crop-bar-fill" style={{ width: `${cropProgress}%` }} />
              </div>
              <div className="crop-bar-hint">Video is re-encoded (H.264, CRF 18); audio is copied untouched.</div>
            </>
          )}
          {cropKind === 'image' && <div className="crop-bar-label">✂ Cropping image…</div>}
          {cropKind === 'still' && <div className="crop-bar-label">🖼 Saving frame…</div>}
          {cropKind === 'audio' && <div className="crop-bar-label">🔇 Removing audio…</div>}
          {cropKind === 'rotate' && (
            <>
              <div className="crop-bar-label">⟳ Rotating… {cropProgress}%</div>
              <div className="crop-bar-track">
                <div className="crop-bar-fill" style={{ width: `${cropProgress}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom bar */}
      {files.length > 0 && (
        <div className="viewer-bottombar">
          <div className="hk-pills">
            {hotkeys.map((hk, i) => hk?.folder && (
              <div key={i} className="hk-pill">
                <kbd>{i + 1}</kbd>
                <span>{hk.label || hk.folder.split(/[\\/]/).pop()}</span>
              </div>
            ))}
          </div>
          <div className="action-hints">
            <span className="action-hint"><kbd>←</kbd><kbd>→</kbd> Navigate</span>
            <span className="action-hint"><kbd>D</kbd><kbd>D</kbd> Delete</span>
            <span className="action-hint"><kbd>Alt+1–5</kbd> Rate</span>
            <span className="action-hint"><kbd>scroll</kbd> Zoom</span>
            {tab === 'videos' && <span className="action-hint"><kbd>F</kbd> Snapshot</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>S</kbd> Split</span>}
            <span className="action-hint"><kbd>C</kbd> Crop</span>
            {tab === 'videos' && <span className="action-hint"><kbd>M</kbd> Mute</span>}
            <span className="action-hint"><kbd>T</kbd> Rotate</span>
            {tab === 'videos' && <span className="action-hint"><kbd>R</kbd> Loop</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>L</kbd> Slideshow</span>}
            <span className="action-hint"><kbd>`</kbd> Log</span>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {cropPreview && (
        <CropPreviewModal
          src={cropPreview.src}
          rect={cropPreview.rect}
          note={cropPreview.note}
          outW={cropPreview.outW}
          outH={cropPreview.outH}
          keepOriginal={keepOriginal}
          onKeepOriginalChange={setKeepOriginal}
          onConfirm={executeCrop}
          onBack={() => setCropPreview(null)}
        />
      )}

      {rotatePreview && (
        <CropPreviewModal
          src={rotatePreview.src}
          rect={null}
          transform={rotatePreview.transform}
          title="Rotate preview"
          note={rotatePreview.note}
          outW={rotatePreview.outW}
          outH={rotatePreview.outH}
          keepOriginal={keepOriginal}
          onKeepOriginalChange={setKeepOriginal}
          onConfirm={() => {
            const { direction } = rotatePreview
            setRotatePreview(null)
            executeRotate(direction)
          }}
          onBack={() => { setRotatePreview(null); setPendingRotate(true) }}
        />
      )}

      {pendingRotate && current && (
        <RotateModal
          fileName={current.name}
          onConfirm={requestRotatePreview}
          onCancel={() => setPendingRotate(false)}
        />
      )}

      {pendingSplitTime !== null && (
        <SplitModal
          timestamp={pendingSplitTime}
          onConfirm={executeSplits}
          onCancel={() => executeSplits('none')}
        />
      )}
    </div>
  )
}
