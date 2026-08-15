import { useRef, useEffect, useState } from 'react'
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
export default function VideoThumb({ path }) {
  const ref = useRef(null)
  const holderRef = useRef(null)
  const [mounted, setMounted] = useState(false)

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
    const video = ref.current
    if (!video) return

    const seekIn = () => {
      const target = Math.min(0.2, (isFinite(video.duration) ? video.duration : 1) / 2)
      try { video.currentTime = target } catch { /* seek unsupported; leave frame 0 */ }
    }

    video.addEventListener('loadedmetadata', seekIn)
    return () => video.removeEventListener('loadedmetadata', seekIn)
  }, [path, mounted])

  return (
    <div ref={holderRef} className="preview-thumb-holder">
      {mounted ? (
        <video
          ref={ref}
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
}
