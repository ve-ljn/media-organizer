import { useState, useEffect, useRef } from 'react'
import './SplitModal.css'

// Asks for a name, nothing else. The folder is created inside the folder being
// organized and bound to the first free hotkey — the slot is shown up front so
// the number to press afterwards is never a surprise.
export default function NewFolderModal({ parentFolder, slot, onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (clean) onConfirm(clean)
  }

  // Escape is handled here rather than on window: the viewer's global handler
  // only blurs inputs, so it would leave the modal open.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  const parentName = parentFolder?.split(/[\\/]/).filter(Boolean).pop() || parentFolder

  return (
    <div className="split-modal-overlay" onClick={onCancel}>
      <form className="split-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 className="split-modal-title">📁 New folder</h2>
        <p className="split-modal-subtitle">
          Inside <b>{parentName}</b>, on hotkey <kbd>{slot + 1}</kbd>
        </p>

        <input
          ref={inputRef}
          className="new-folder-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Folder name"
          spellCheck={false}
        />

        <div className="split-modal-options">
          <button
            type="submit"
            className="split-modal-btn split-modal-btn--keep"
            disabled={!name.trim()}
          >
            <kbd>Enter</kbd>
            <span>
              <span className="split-modal-btn-label">Create and bind to {slot + 1}</span>
              <span className="split-modal-btn-desc">The current file is not moved</span>
            </span>
          </button>

          <button type="button" className="split-modal-btn" onClick={onCancel}>
            <kbd>Esc</kbd>
            <span>
              <span className="split-modal-btn-label">Cancel</span>
            </span>
          </button>
        </div>
      </form>
    </div>
  )
}
