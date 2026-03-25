import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { toFileUrl, formatTime, formatTimestamp } from '../utils'
import './VideoPlayer.css'

const VideoPlayer = forwardRef(function VideoPlayer({ filePath, splitTimestamps, onAddSplit, onRemoveSplit, onVideoEnded, autoPlay }, ref) {
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
    togglePlay: () => {
      const v = videoRef.current
      if (!v) return
      v.paused ? v.play() : v.pause()
    },
    captureFrame: () => {
      const v = videoRef.current
      if (!v || !v.videoWidth) return null
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      canvas.getContext('2d').drawImage(v, 0, 0)
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

  // S key: add/remove split at current time
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key !== 's' && e.key !== 'S') return
      const v = videoRef.current
      if (!v) return
      const t = v.currentTime
      const nearby = splitTimestamps.find(ts => Math.abs(ts - t) < 0.5)
      if (nearby !== undefined) onRemoveSplit(nearby)
      else onAddSplit(t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitTimestamps, onAddSplit, onRemoveSplit])

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
    v.currentTime = Math.max(0, Math.min(duration, ratio * duration))
  }

  const pct = duration ? (currentTime / duration) * 100 : 0
  const loopStartPct = loopRange && duration ? (loopRange.start / duration) * 100 : 0
  const loopEndPct = loopRange && duration ? (loopRange.end / duration) * 100 : 0

  return (
    <div className="vp-root">
      <video
        ref={videoRef}
        src={src}
        className="vp-video"
        onClick={togglePlay}
      />

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

            {splitTimestamps.map(ts => (
              <div
                key={ts}
                className="vp-split-mark"
                style={{ left: `${(ts / duration) * 100}%` }}
                title={`Split at ${formatTime(ts)} — click to remove`}
                onClick={e => { e.stopPropagation(); onRemoveSplit(ts) }}
              >
                <div className="vp-split-label">{formatTime(ts)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="vp-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="vp-hint">
        Press <kbd>S</kbd> to mark a split &nbsp;·&nbsp; <kbd>R</kbd> to loop ±2s
      </div>
    </div>
  )
})

export default VideoPlayer
