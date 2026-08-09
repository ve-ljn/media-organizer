import { useEffect } from 'react'
import './SplitModal.css'

// Reuses the split modal's styling so the two confirmations look identical.
export default function RotateModal({ fileName, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '1') onConfirm('left')
      else if (e.key === '2') onConfirm('right')
      else if (e.key === '3') onConfirm('flip')
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="split-modal-overlay" onClick={onCancel}>
      <div className="split-modal" onClick={e => e.stopPropagation()}>
        <h2 className="split-modal-title">⟳ Rotate</h2>
        <p className="split-modal-subtitle">{fileName}</p>

        <div className="split-modal-options">
          <button className="split-modal-btn split-modal-btn--keep" onClick={() => onConfirm('left')}>
            <kbd>1</kbd>
            <span>
              <span className="split-modal-btn-label">↺ Rotate left</span>
              <span className="split-modal-btn-desc">90° counter-clockwise</span>
            </span>
          </button>

          <button className="split-modal-btn split-modal-btn--keep" onClick={() => onConfirm('right')}>
            <kbd>2</kbd>
            <span>
              <span className="split-modal-btn-label">↻ Rotate right</span>
              <span className="split-modal-btn-desc">90° clockwise</span>
            </span>
          </button>

          <button className="split-modal-btn split-modal-btn--keep" onClick={() => onConfirm('flip')}>
            <kbd>3</kbd>
            <span>
              <span className="split-modal-btn-label">⇵ Upside down</span>
              <span className="split-modal-btn-desc">180°</span>
            </span>
          </button>

          <button className="split-modal-btn" onClick={onCancel}>
            <kbd>Esc</kbd>
            <span>
              <span className="split-modal-btn-label">Cancel</span>
              <span className="split-modal-btn-desc">Leave the file as it is</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
