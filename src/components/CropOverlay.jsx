import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import './CropOverlay.css'

// Smallest allowed crop, as a fraction of the frame
const MIN = 0.04

const HANDLES = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Resolve a drag into a new normalized rect. Edge coordinates are used so the
// edges opposite the grabbed handle stay pinned.
function applyDrag(drag, dx, dy) {
  const s = drag.start

  if (drag.mode === 'move') {
    return {
      ...s,
      x: clamp(s.x + dx, 0, 1 - s.w),
      y: clamp(s.y + dy, 0, 1 - s.h),
    }
  }

  let l = s.x
  let t = s.y
  let r = s.x + s.w
  let b = s.y + s.h

  if (drag.mode.includes('w')) l = clamp(s.x + dx, 0, r - MIN)
  if (drag.mode.includes('e')) r = clamp(s.x + s.w + dx, l + MIN, 1)
  if (drag.mode.includes('n')) t = clamp(s.y + dy, 0, b - MIN)
  if (drag.mode.includes('s')) b = clamp(s.y + s.h + dy, t + MIN, 1)

  return { x: l, y: t, w: r - l, h: b - t }
}

// Intrinsic pixel size of either kind of media element. <img> exposes
// naturalWidth, <video> exposes videoWidth; each is undefined on the other.
const intrinsic = (el) => ({
  w: el.naturalWidth || el.videoWidth || 0,
  h: el.naturalHeight || el.videoHeight || 0,
})

export default function CropOverlay({ mediaRef, rect, onChange }) {
  // Where the visible picture sits inside the media element, in px
  const [content, setContent] = useState(null)
  const dragRef = useRef(null)

  // The element box is not the same rectangle as the picture inside it. Both
  // `.vp-video` and `.viewer-image` are constrained by max-height, so once that
  // clamps a tall item the element goes wider than the picture and object-fit
  // (contain) letterboxes it. Mapping crop coordinates against the element box
  // would then crop the wrong region — measure the real content box instead.
  const measure = useCallback(() => {
    const el = mediaRef.current
    if (!el) return

    const { w: iw, h: ih } = intrinsic(el)
    if (!iw || !ih || !el.clientWidth) return

    const scale = Math.min(el.clientWidth / iw, el.clientHeight / ih)
    const width = iw * scale
    const height = ih * scale

    setContent({
      left: el.offsetLeft + (el.clientWidth - width) / 2,
      top: el.offsetTop + (el.clientHeight - height) / 2,
      width,
      height,
    })
  }, [mediaRef])

  useLayoutEffect(() => {
    const el = mediaRef.current
    if (!el) return

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // 'loadedmetadata' fires for video, 'load' for img — attach both rather
    // than branching on element type.
    el.addEventListener('loadedmetadata', measure)
    el.addEventListener('load', measure)
    window.addEventListener('resize', measure)

    return () => {
      ro.disconnect()
      el.removeEventListener('loadedmetadata', measure)
      el.removeEventListener('load', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, mediaRef])

  // Global move/up listeners so a fast drag that leaves the box still tracks
  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag || !content) return
      const dx = (e.clientX - drag.mx) / content.width
      const dy = (e.clientY - drag.my) / content.height
      onChange(applyDrag(drag, dx, dy))
    }
    const onUp = () => { dragRef.current = null }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [content, onChange])

  const startDrag = (e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { mode, mx: e.clientX, my: e.clientY, start: { ...rect } }
  }

  if (!content) return null

  const box = {
    left: content.left + rect.x * content.width,
    top: content.top + rect.y * content.height,
    width: rect.w * content.width,
    height: rect.h * content.height,
  }

  // Mirror the rounding the main process applies, so this readout is the real
  // output size: video floors to even numbers (H.264 yuv420p cannot encode odd
  // dimensions), images round exactly since no such constraint applies.
  const el = mediaRef.current
  const { w: iw, h: ih } = el ? intrinsic(el) : { w: 0, h: 0 }
  const isVideo = !!(el && el.videoWidth)
  const fit = isVideo
    ? (n) => Math.max(2, Math.floor(n / 2) * 2)
    : (n) => Math.max(1, Math.round(n))
  const outW = iw ? fit(rect.w * iw) : 0
  const outH = ih ? fit(rect.h * ih) : 0

  const shade = (style, key) => <div key={key} className="crop-shade" style={style} />

  return (
    <div className="crop-overlay">
      {/* Dim everything outside the box, within the frame only */}
      {shade({
        left: content.left, top: content.top,
        width: content.width, height: box.top - content.top,
      }, 'top')}
      {shade({
        left: content.left, top: box.top + box.height,
        width: content.width, height: content.top + content.height - box.top - box.height,
      }, 'bottom')}
      {shade({
        left: content.left, top: box.top,
        width: box.left - content.left, height: box.height,
      }, 'left')}
      {shade({
        left: box.left + box.width, top: box.top,
        width: content.left + content.width - box.left - box.width, height: box.height,
      }, 'right')}

      <div
        className="crop-box"
        style={box}
        onPointerDown={(e) => startDrag(e, 'move')}
      >
        <div className="crop-dims">{outW} × {outH}</div>

        <div className="crop-thirds">
          <i className="v" style={{ left: '33.33%' }} />
          <i className="v" style={{ left: '66.66%' }} />
          <i className="h" style={{ top: '33.33%' }} />
          <i className="h" style={{ top: '66.66%' }} />
        </div>

        {HANDLES.map(h => (
          <div
            key={h}
            className={`crop-handle crop-handle--${h}`}
            onPointerDown={(e) => startDrag(e, h)}
          />
        ))}
      </div>
    </div>
  )
}
