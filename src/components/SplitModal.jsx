import { useEffect } from 'react'
import { formatTimestamp } from '../utils'
import './SplitModal.css'

export default function SplitModal({ timestamp, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '1') onConfirm('first')
      else if (e.key === '2') onConfirm('last')
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div className="split-modal-overlay" onClick={onCancel}>
      <div className="split-modal" onClick={e => e.stopPropagation()}>
        <h2 className="split-modal-title">✂ Split at {formatTimestamp(timestamp)}</h2>
        <p className="split-modal-subtitle">Which part do you want to delete?</p>

        <div className="split-modal-options">
          <button className="split-modal-btn split-modal-btn--delete" onClick={() => onConfirm('first')}>
            <kbd>1</kbd>
            <span>
              <span className="split-modal-btn-label">Delete first part</span>
              <span className="split-modal-btn-desc">Keep everything after the cut</span>
            </span>
          </button>

          <button className="split-modal-btn split-modal-btn--delete" onClick={() => onConfirm('last')}>
            <kbd>2</kbd>
            <span>
              <span className="split-modal-btn-label">Delete second part</span>
              <span className="split-modal-btn-desc">Keep everything before the cut</span>
            </span>
          </button>

          <button className="split-modal-btn split-modal-btn--keep" onClick={onCancel}>
            <kbd>Esc</kbd>
            <span>
              <span className="split-modal-btn-label">Split, keep both</span>
              <span className="split-modal-btn-desc">Don't delete anything</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
