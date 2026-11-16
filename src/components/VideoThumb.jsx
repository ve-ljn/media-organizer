import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import { toFileUrl } from '../utils'

// A poster frame for the preview strip.
//
// No ffmpeg pass and no thumbnail cache: a <video> at preload="metadata" reads
// only the container headers, and seeking paints one frame. The seek is
// explicit rather than relying on a #t= fragment, because a media fragment is
// not guaranteed to paint before playback starts.
//
// It lands slightly into the clip — plenty of videos open on a black or fading
// frame, which would make every thumbnail look identical.
// Mounting is deferred until the thumbnail scrolls near the viewport. Unlike an
// <img>, a <video> has no lazy attribute — it opens the file and seeks the
// moment it mounts — so a long strip would hit the disk once per entry up
// front. Once mounted it stays mounted, to avoid re-seeking on every scroll.
//
// Staying mounted means the file stays open, and Windows will not rename or
// delete a file that any handle is still on. The current file is open twice —
// here and in the player — so this exposes the same release()/restore() pair
// the player has, for the viewer to call before it touches the file on disk.
const VideoThumb = forwardRef(function VideoThumb({ path }, ref) {
  const elRef = useRef(null)
  const holderRef = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [released, setReleased] = useState(false)

  useImperativeHandle(ref, () => ({
    release: () => {
      const v = elRef.current
      if (v) {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
      setReleased(true)
    },
    // Only needed when the operation failed and the file is still there.
    restore: () => setReleased(false),
  }), [])

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { root: holder.closest('.preview-strip'), rootMargin: '300px' },
    )

    observer.observe(holder)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = elRef.current
    if (!video) return

    const seekIn = () => {
      const target = Math.min(0.2, (isFinite(video.duration) ? video.duration : 1) / 2)
      try { video.currentTime = target } catch { /* seek unsupported; leave frame 0 */ }
    }

    video.addEventListener('loadedmetadata', seekIn)
    return () => video.removeEventListener('loadedmetadata', seekIn)
  }, [path, mounted, released])

  return (
    <div ref={holderRef} className="preview-thumb-holder">
      {mounted && !released ? (
        <video
          ref={elRef}
          src={toFileUrl(path)}
          className="preview-thumb"
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
        />
      ) : (
        <div className="preview-thumb-placeholder">🎬</div>
      )}
    </div>
  )
})

export default VideoThumb
