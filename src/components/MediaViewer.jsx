import { useState, useEffect, useCallback, useRef } from 'react'
import VideoPlayer from './VideoPlayer'
import './MediaViewer.css'

function toFileUrl(filePath) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${ms}`
}

function nowStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

const LOG_TYPES = { move: 'log-move', delete: 'log-delete', save: 'log-save', split: 'log-split', info: 'log-info', rate: 'log-rate' }

let logIdCounter = 0

export default function MediaViewer({ files: initialFiles, hotkeys, onBackToSetup }) {
  const [imageFiles, setImageFiles] = useState(initialFiles.filter(f => f.type === 'image'))
  const [videoFiles, setVideoFiles] = useState(initialFiles.filter(f => f.type === 'video'))
  const [tab, setTab] = useState(initialFiles.some(f => f.type === 'image') ? 'images' : 'videos')
  const [imageIndex, setImageIndex] = useState(0)
  const [videoIndex, setVideoIndex] = useState(0)

  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [splitTimestamps, setSplitTimestamps] = useState([])
  const [isSplitting, setIsSplitting] = useState(false)
  const [toast, setToast] = useState('')

  // Rating (0 = unrated)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)

  // Activity log
  const [logEntries, setLogEntries] = useState([])
  const [showConsole, setShowConsole] = useState(false)
  const logEndRef = useRef(null)

  // Slideshow
  const [slideshow, setSlideshow] = useState(false)

  // Zoom & pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragActive, setDragActive] = useState(false)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const notesRef = useRef(null)
  const toastTimer = useRef(null)
  const videoPlayerRef = useRef(null)
  const viewerMediaRef = useRef(null)
  const minimapCanvasRef = useRef(null)

  const files = tab === 'images' ? imageFiles : videoFiles
  const index = tab === 'images' ? imageIndex : videoIndex
  const setIndex = tab === 'images' ? setImageIndex : setVideoIndex
  const current = files[index]

  const releaseVideo = async () => {
    if (tab === 'videos' && videoPlayerRef.current) {
      videoPlayerRef.current.release()
      await new Promise(r => setTimeout(r, 150))
    }
  }

  // ── Logging ──────────────────────────────────────────────
  const addLog = useCallback((message, type = 'info') => {
    setLogEntries(prev => [...prev.slice(-199), { id: ++logIdCounter, time: nowStr(), message, type }])
  }, [])

  // Auto-scroll console to bottom
  useEffect(() => {
    if (showConsole) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries, showConsole])

  // ── Load metadata when file changes ──────────────────────
  useEffect(() => {
    if (!current) return
    window.api.getNotes(current.path).then(data => {
      setNotes(data.notes || '')
      setRating(data.rating || 0)
    })
    setSplitTimestamps([])
  }, [current?.path])

  // Reset pan (not zoom) when file changes
  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [current?.path])

  useEffect(() => {
    if (showNotes) setTimeout(() => notesRef.current?.focus(), 50)
  }, [showNotes])

  useEffect(() => {
    setSplitTimestamps([])
    setShowNotes(false)
    setSlideshow(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [tab])

  // ── Toast ─────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }, [])

  // ── Navigation ────────────────────────────────────────────
  const advance = useCallback((newFiles, fromIndex) => {
    setIndex(Math.max(0, Math.min(fromIndex, newFiles.length - 1)))
  }, [setIndex])

  const goNext = useCallback(() => {
    if (index < files.length - 1) setIndex(i => i + 1)
    else { setSlideshow(false); showToast('End of files') }
  }, [index, files.length, setIndex, showToast])

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(i => i - 1)
  }, [index, setIndex])

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
  }, [current, files, hotkeys, index, tab, advance, showToast, addLog])

  const deleteFile = useCallback(async () => {
    if (!current) return
    if (!window.confirm(`Delete "${current.name}"?\n\nThis will send it to the Recycle Bin.`)) return
    await releaseVideo()
    await window.api.deleteFile(current.path)
    showToast('Deleted')
    addLog(`Deleted  ${current.name}`, 'delete')
    const newFiles = files.filter((_, i) => i !== index)
    if (tab === 'images') setImageFiles(newFiles)
    else setVideoFiles(newFiles)
    advance(newFiles, index)
  }, [current, files, index, tab, advance, showToast, addLog])

  const saveNotes = useCallback(async () => {
    if (!current) return
    await window.api.saveNotes({ filePath: current.path, notes })
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1500)
    addLog(`Notes saved  →  ${current.name}`, 'save')
  }, [current, notes, addLog])

  const saveRating = useCallback(async (newRating, file) => {
    if (!file) return
    await window.api.setRating(file.path, newRating)
    const stars = newRating === 0 ? 'unrated' : '★'.repeat(newRating) + '☆'.repeat(5 - newRating)
    addLog(`Rated  ${file.name}  ${stars}`, 'rate')
  }, [addLog])

  const executeSplits = useCallback(async () => {
    if (!current || splitTimestamps.length === 0) return
    setIsSplitting(true)
    try {
      const newPaths = await window.api.splitVideo({ filePath: current.path, timestamps: splitTimestamps })
      const newParts = newPaths.map(p => ({ path: p, name: p.split(/[\\/]/).pop(), type: 'video', ext: current.ext }))
      const newFiles = [...videoFiles.slice(0, index), ...newParts, ...videoFiles.slice(index + 1)]
      setVideoFiles(newFiles)
      setSplitTimestamps([])
      showToast(`✂ Split into ${newParts.length} parts`)
      addLog(`Split  ${current.name}  →  ${newParts.length} parts`, 'split')
    } catch (e) {
      showToast(`Split failed: ${e.message}`)
      addLog(`Split failed: ${e.message}`, 'delete')
    } finally {
      setIsSplitting(false)
    }
  }, [current, videoFiles, index, splitTimestamps, showToast, addLog])

  // ── Zoom ──────────────────────────────────────────────────
  const changeZoom = useCallback((delta) => {
    setZoom(prev => {
      const next = Math.round(Math.max(1, Math.min(5, prev + delta)) * 100) / 100
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    changeZoom(e.deltaY < 0 ? 0.25 : -0.25)
  }, [changeZoom])

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return
    e.preventDefault()
    isDragging.current = true
    setDragActive(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [zoom, pan])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return
    setPan({ x: dragStart.current.panX + e.clientX - dragStart.current.x, y: dragStart.current.panY + e.clientY - dragStart.current.y })
  }, [])

  const handleMouseUp = useCallback(() => { isDragging.current = false; setDragActive(false) }, [])

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

  // ── Slideshow ─────────────────────────────────────────────
  const handleVideoEnded = useCallback(() => {
    if (slideshow) goNext()
  }, [slideshow, goNext])

  // ── Keyboard ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
      if (inInput) {
        if (e.key === 'Escape') { e.target.blur(); setShowNotes(false) }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNotes() }
        return
      }

      // Alt+1-5: set rating
      if (e.altKey && e.key >= '0' && e.key <= '5') {
        e.preventDefault()
        const newRating = parseInt(e.key)
        setRating(newRating)
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
        case 'n': case 'N':
          setShowNotes(v => !v)
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
        case 'u': case 'U':
          if (tab === 'images' && current) {
            showToast('⏳ Upscaling…')
            window.api.upscaleImage(current.path)
              .then(({ name }) => { showToast(`✅ Saved: ${name}`); addLog(`Upscaled  ${current.name}  →  ${name}`, 'save') })
              .catch(err => { showToast(`❌ Upscale failed: ${err.message}`); addLog(`Upscale failed: ${err.message}`, 'delete') })
          }
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
          setShowNotes(false)
          setSplitTimestamps([])
          break
        default:
          if (!e.altKey && e.key >= '1' && e.key <= '9') moveFile(parseInt(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, deleteFile, moveFile, saveNotes, saveRating, tab, changeZoom, resetZoom, zoom, showToast, addLog, current])

  const progressPct = files.length > 1 ? (index / (files.length - 1)) * 100 : 100
  const mediaCursor = zoom > 1 ? (dragActive ? 'grabbing' : 'grab') : 'default'

  const minimapRect = (() => {
    const vW = viewerMediaRef.current?.offsetWidth || 800
    const vH = viewerMediaRef.current?.offsetHeight || 600
    const rW = 1 / zoom
    const rH = 1 / zoom
    const rL = Math.max(0, Math.min(1 - rW, 0.5 - 0.5 / zoom - pan.x / (zoom * vW)))
    const rT = Math.max(0, Math.min(1 - rH, 0.5 - 0.5 / zoom - pan.y / (zoom * vH)))
    return { left: rL, top: rT, width: rW, height: rH }
  })()

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
                    setRating(newRating)
                    saveRating(newRating, current)
                    showToast(newRating === 0 ? 'Rating cleared' : '★'.repeat(newRating) + '☆'.repeat(5 - newRating))
                  }}
                >★</span>
              ))}
            </div>

            <div className="viewer-progress">{index + 1} / {files.length}</div>
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

        <button className={`btn-notes-toggle ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(v => !v)}>
          📝 Notes
        </button>
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
                  splitTimestamps={splitTimestamps}
                  onAddSplit={ts => setSplitTimestamps(prev => [...prev, ts].sort((a, b) => a - b))}
                  onRemoveSplit={ts => setSplitTimestamps(prev => prev.filter(t => Math.abs(t - ts) > 0.1))}
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

        {/* Notes panel */}
        {showNotes && (
          <div className="notes-panel">
            <div className="notes-header">
              <span>Notes</span>
              <button className="notes-close" onClick={() => setShowNotes(false)}>✕</button>
            </div>
            <textarea ref={notesRef} className="notes-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes…&#10;&#10;Ctrl+S to save." />
            <div className="notes-footer">
              <span className="notes-hint">Ctrl+S to save</span>
              <button className="btn-save-notes" onClick={saveNotes}>{noteSaved ? 'Saved ✓' : 'Save'}</button>
            </div>
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

      {/* Split bar */}
      {tab === 'videos' && splitTimestamps.length > 0 && (
        <div className="split-bar">
          <div className="split-bar-label">✂ {splitTimestamps.length} split point{splitTimestamps.length !== 1 ? 's' : ''}</div>
          <div className="split-tags">
            {splitTimestamps.map(ts => (
              <div key={ts} className="split-tag">
                {formatTimestamp(ts)}
                <button className="split-tag-x" onClick={() => setSplitTimestamps(prev => prev.filter(t => t !== ts))}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn-execute-split" onClick={executeSplits} disabled={isSplitting}>
            {isSplitting ? 'Splitting…' : 'Execute Splits'}
          </button>
          <button className="btn-clear-splits" onClick={() => setSplitTimestamps([])}>Clear</button>
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
            <span className="action-hint"><kbd>D</kbd> Delete</span>
            <span className="action-hint"><kbd>N</kbd> Notes</span>
            <span className="action-hint"><kbd>Alt+1–5</kbd> Rate</span>
            <span className="action-hint"><kbd>scroll</kbd> Zoom</span>
            {tab === 'images' && <span className="action-hint"><kbd>U</kbd> Upscale</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>F</kbd> Snapshot</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>S</kbd> Split</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>R</kbd> Loop</span>}
            {tab === 'videos' && <span className="action-hint"><kbd>L</kbd> Slideshow</span>}
            <span className="action-hint"><kbd>`</kbd> Log</span>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
