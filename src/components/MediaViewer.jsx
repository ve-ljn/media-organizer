import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import VideoPlayer from './VideoPlayer'
import SplitModal from './SplitModal'
import useActivityLog, { LOG_TYPES } from '../hooks/useActivityLog'
import useZoomPan from '../hooks/useZoomPan'
import useMediaNavigation from '../hooks/useMediaNavigation'
import { toFileUrl } from '../utils'
import './MediaViewer.css'

export default function MediaViewer({ files: initialFiles, hotkeys, onBackToSetup }) {
  const [imageFiles, setImageFiles] = useState(initialFiles.filter(f => f.type === 'image'))
  const [videoFiles, setVideoFiles] = useState(initialFiles.filter(f => f.type === 'video'))
  const [tab, setTab] = useState(initialFiles.some(f => f.type === 'image') ? 'images' : 'videos')
  const [imageIndex, setImageIndex] = useState(0)
  const [videoIndex, setVideoIndex] = useState(0)

  const [pendingSplitTime, setPendingSplitTime] = useState(null)
  const [isSplitting, setIsSplitting] = useState(false)
  const [toast, setToast] = useState('')

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
    // Disarm any pending delete confirmation when navigating away
    deleteConfirmRef.current = false
    clearTimeout(deleteConfirmTimer.current)
  }, [current?.path])

  // Bulk-load all ratings on mount so filter can work immediately.
  // initialFilesRef captures the value at mount; the dep array is intentionally empty.
  useEffect(() => {
    window.api.getAllRatings(initialFilesRef.current.map(f => f.path)).then(setRatingsMap)
  }, [])

  // Clean up timers on unmount
  useEffect(() => () => {
    clearTimeout(toastTimer.current)
    clearTimeout(deleteConfirmTimer.current)
  }, [])

  // Reset pan (not zoom) when file changes
  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [current?.path])

  useEffect(() => {
    setPendingSplitTime(null)
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

  // ── Slideshow ─────────────────────────────────────────────
  const handleVideoEnded = useCallback(() => {
    if (slideshow) goNext()
  }, [slideshow, goNext])

  // ── Keyboard ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
      if (inInput) {
        if (e.key === 'Escape') e.target.blur()
        return
      }
      if (pendingSplitTime !== null || isSplitting) return

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
  }, [goNext, goPrev, deleteFile, moveFile, saveRating, tab, changeZoom, resetZoom, zoom, showToast, addLog, current, setShowConsole, setPan, pendingSplitTime, isSplitting])

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
              {ratingFilter ? `${Math.max(0, filteredIndex + 1)} / ${filteredFiles.length}` : `${index + 1} / ${files.length}`}
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
          onWheel={handleWheel}
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
                <img key={current.path} src={toFileUrl(current.path)} className="viewer-image" alt={current.name} draggable={false} />
              )}
              {tab === 'videos' && (
                <VideoPlayer
                  ref={videoPlayerRef}
                  key={current.path}
                  filePath={current.path}
                  onSplitRequest={t => setPendingSplitTime(t)}
                  onVideoEnded={handleVideoEnded}
                  autoPlay={slideshow}
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
            {files.slice(index + 1, index + 11).map((f, i) => (
              <div
                key={f.path}
                className="preview-item"
                onClick={() => setIndex(index + 1 + i)}
                title={f.name}
              >
                {f.type === 'image'
                  ? <img src={toFileUrl(f.path)} className="preview-thumb" alt={f.name} draggable={false} />
                  : <div className="preview-video-icon">🎬</div>
                }
                <div className="preview-name">{f.name}</div>
              </div>
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
            {tab === 'videos' && <span className="action-hint"><kbd>R</kbd> Loop</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>L</kbd> Slideshow</span>}
            <span className="action-hint"><kbd>`</kbd> Log</span>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

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
