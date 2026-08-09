import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { toFileUrl, formatTime, formatTimestamp } from '../utils'
import CropOverlay from './CropOverlay'
import './VideoPlayer.css'

const VideoPlayer = forwardRef(function VideoPlayer({
  filePath, onSplitRequest, onVideoEnded, autoPlay,
  cropMode = false, cropRect, onCropChange,
}, ref) {
  const videoRef = useRef(null)
  const loopRef = useRef(null)        // { start, end } or null
  const [loopRange, setLoopRange] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const src = toFileUrl(filePath)

  useImperativeHandle(ref, () => ({
    release: () => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      v.removeAttribute('src')
      v.load()
    },
    play: () => {
      videoRef.current?.play()
    },
    pause: () => {
      videoRef.current?.pause()
    },
    togglePlay: () => {
      const v = videoRef.current
      if (!v) return
      v.paused ? v.play() : v.pause()
    },
    // Grabs the frame currently displayed. An optional normalized rect limits
    // the grab to a region, so a static composite video can yield just one
    // panel as a still. Pixels come from the source resolution, not the
    // on-screen size, so the result is full quality.
    captureFrame: (rect) => {
      const v = videoRef.current
      if (!v || !v.videoWidth) return null

      const sx = rect ? Math.round(rect.x * v.videoWidth) : 0
      const sy = rect ? Math.round(rect.y * v.videoHeight) : 0
      const sw = rect ? Math.max(1, Math.round(rect.w * v.videoWidth)) : v.videoWidth
      const sh = rect ? Math.max(1, Math.round(rect.h * v.videoHeight)) : v.videoHeight

      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      canvas.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh)
      return canvas.toDataURL('image/png')
    },
    loopAround: () => {
      const v = videoRef.current
      if (!v) return false
      if (loopRef.current) {
        // cancel loop
        loopRef.current = null
        setLoopRange(null)
        return false
      }
      const start = Math.max(0, v.currentTime - 2)
      const end = Math.min(isFinite(v.duration) ? v.duration : v.currentTime + 2, v.currentTime + 2)
      const range = { start, end }
      loopRef.current = range
      setLoopRange(range)
      v.currentTime = start
      v.play()
      return true
    },
    isLooping: () => !!loopRef.current,
    getVideoElement: () => videoRef.current,
  }))

  // Reset state when file changes
  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    loopRef.current = null
    setLoopRange(null)
  }, [filePath])

  // Attach video event listeners
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime)
      // loop enforcement
      if (loopRef.current && v.currentTime >= loopRef.current.end) {
        v.currentTime = loopRef.current.start
      }
    }
    const onDurationChange = () => setDuration(v.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      if (loopRef.current) {
        // video ended before loop end — restart from loop start
        v.currentTime = loopRef.current.start
        v.play()
      } else {
        setPlaying(false)
        onVideoEnded?.()
      }
    }
    const onCanPlay = () => { if (autoPlay) v.play() }

    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('canplay', onCanPlay)

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('canplay', onCanPlay)
    }
  }, [filePath, autoPlay])

  // S key: request a split at current time.
  // This listener is on window and independent of MediaViewer's handler, so it
  // needs its own crop-mode guard — otherwise S would open the split modal
  // while the user is dragging a crop box.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (cropMode) return
      if (e.key !== 's' && e.key !== 'S') return
      const v = videoRef.current
      if (!v) return
      onSplitRequest?.(v.currentTime)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSplitRequest, cropMode])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play() : v.pause()
  }

  const handleTimelineClick = (e) => {
    const v = videoRef.current
    if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    v.pause()
    v.currentTime = Math.max(0, Math.min(duration, ratio * duration))
  }

  const pct = duration ? (currentTime / duration) * 100 : 0
  const loopStartPct = loopRange && duration ? (loopRange.start / duration) * 100 : 0
  const loopEndPct = loopRange && duration ? (loopRange.end / duration) * 100 : 0

  return (
    <div className="vp-root">
      <div className="vp-stage">
        <video
          ref={videoRef}
          src={src}
          className="vp-video"
          onClick={togglePlay}
        />

        {cropMode && cropRect && (
          <CropOverlay mediaRef={videoRef} rect={cropRect} onChange={onCropChange} />
        )}
      </div>

      {/* Loop badge */}
      {loopRange && (
        <div className="vp-loop-badge">
          🔁 {formatTimestamp(loopRange.start)} – {formatTimestamp(loopRange.end)}
          <span className="vp-loop-hint">R to cancel</span>
        </div>
      )}

      <div className="vp-controls">
        <button className="vp-play" onClick={togglePlay}>
          {playing ? '⏸' : '▶'}
        </button>

        <div className="vp-timeline" onClick={handleTimelineClick}>
          <div className="vp-track">
            <div className="vp-progress" style={{ width: `${pct}%` }} />
            <div className="vp-cursor" style={{ left: `${pct}%` }} />

            {/* Loop region highlight */}
            {loopRange && duration && (
              <div
                className="vp-loop-region"
                style={{ left: `${loopStartPct}%`, width: `${loopEndPct - loopStartPct}%` }}
              />
            )}

          </div>
        </div>

        <div className="vp-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="vp-hint">
        Press <kbd>S</kbd> to split &nbsp;·&nbsp; <kbd>R</kbd> to loop ±2s
      </div>
    </div>
  )
})

export default VideoPlayer
