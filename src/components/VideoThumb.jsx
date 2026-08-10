import { useRef, useEffect } from 'react'
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
export default function VideoThumb({ path }) {
  const ref = useRef(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return

    const seekIn = () => {
      const target = Math.min(0.2, (isFinite(video.duration) ? video.duration : 1) / 2)
      try { video.currentTime = target } catch { /* seek unsupported; leave frame 0 */ }
    }

    video.addEventListener('loadedmetadata', seekIn)
    return () => video.removeEventListener('loadedmetadata', seekIn)
  }, [path])

  return (
    <video
      ref={ref}
      src={toFileUrl(path)}
      className="preview-thumb"
      preload="metadata"
      muted
      playsInline
      tabIndex={-1}
    />
  )
}
