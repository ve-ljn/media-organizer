import { useEffect, useState } from 'react'

// Shows exactly what the crop will produce, before anything is written.
//
// Two source shapes:
//   rect set  → `src` is the whole picture and the crop is applied with CSS.
//               Used for images: no canvas round-trip, so nothing to taint and
//               no cost on very large files.
//   rect null → `src` is already the cropped region (a captured video frame).
export default function CropPreviewModal({
  src, rect, outW, outH, onConfirm, onBack,
  title = 'Preview', transform, note,
  keepOriginal, onKeepOriginalChange,
}) {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onBack])

  // Size the window in JS. Doing this with aspect-ratio plus max-width and
  // max-height lets one axis clamp independently, which would stretch the
  // percentage-positioned image inside.
  const scale = Math.min(
    Math.min(viewport.w * 0.78, 860) / outW,
    (viewport.h * 0.62) / outH,
  )
  const frame = {
    width: Math.max(80, Math.round(outW * scale)),
    height: Math.max(80, Math.round(outH * scale)),
  }

  const inner = rect
    ? {
        position: 'absolute',
        width: `${100 / rect.w}%`,
        height: `${100 / rect.h}%`,
        left: `${(-rect.x * 100) / rect.w}%`,
        top: `${(-rect.y * 100) / rect.h}%`,
        maxWidth: 'none',
      }
    : { width: '100%', height: '100%', objectFit: 'contain' }

  // A rotation preview reuses this modal. The frame is already the post-rotation
  // size, so for a quarter turn the picture is laid out with the axes swapped
  // and then rotated into it — otherwise object-fit would letterbox against the
  // wrong aspect and the preview would lie about the framing.
  if (transform) {
    const quarterTurn = transform.includes('90deg')
    Object.assign(inner, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: quarterTurn ? `${frame.height}px` : `${frame.width}px`,
      height: quarterTurn ? `${frame.width}px` : `${frame.height}px`,
      maxWidth: 'none',
      objectFit: 'contain',
      transformOrigin: 'center center',
      transform: `translate(-50%, -50%) ${transform}`,
    })
  }

  return (
    <div className="crop-preview-overlay" onClick={onBack}>
      <div className="crop-preview" onClick={e => e.stopPropagation()}>
        <div className="crop-preview-title">
          {title} — <b>{outW} × {outH}</b>
          {note && <span className="crop-preview-note">{note}</span>}
        </div>

        <div className="crop-preview-frame" style={frame}>
          <img src={src} alt="Crop preview" style={inner} draggable={false} />
        </div>

        <div className="crop-preview-actions">
          <button className="crop-confirm" onClick={onConfirm}>✓ Save (Enter)</button>
          <button className="crop-cancel" onClick={onBack}>← Back (Esc)</button>

          {/* Shown at the moment of commitment, so the choice is visible for
              rotate too and not buried in the crop toolbar */}
          {onKeepOriginalChange && (
            <label className="crop-keep">
              <input
                type="checkbox"
                checked={keepOriginal}
                onChange={e => onKeepOriginalChange(e.target.checked)}
              />
              Keep original
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
