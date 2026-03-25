import { useState, useEffect } from 'react'
import './Setup.css'

const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function Setup({ hotkeys: initialHotkeys, onStart }) {
  const [hotkeys, setHotkeys] = useState(initialHotkeys)

  // Sync when the store finishes loading in the parent
  useEffect(() => { setHotkeys(initialHotkeys) }, [initialHotkeys])
  const [sourceFolder, setSourceFolder] = useState(null)
  const [fileCount, setFileCount] = useState(null)
  const [error, setError] = useState(null)

  const selectSourceFolder = async () => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    setSourceFolder(folder)
    const files = await window.api.getMediaFiles(folder)
    setFileCount(files.length)
  }

  const selectHotkeyFolder = async (index) => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const folderName = folder.split(/[\\/]/).pop()
    const updated = hotkeys.map((hk, i) =>
      i === index
        ? { folder, label: hk.label || folderName }
        : hk
    )
    setHotkeys(updated)
  }

  const updateLabel = (index, label) => {
    setHotkeys(hotkeys.map((hk, i) => (i === index ? { ...hk, label } : hk)))
  }

  const clearHotkey = (index) => {
    setHotkeys(hotkeys.map((hk, i) => (i === index ? { folder: null, label: '' } : hk)))
  }

  const handleStart = () => {
    if (!sourceFolder) return setError('Select a source folder first.')
    if (!hotkeys.some(h => h.folder)) return setError('Configure at least one hotkey folder.')
    if (fileCount === 0) return setError('The selected folder contains no supported media files.')
    setError(null)
    onStart(sourceFolder, hotkeys)
  }

  const configuredCount = hotkeys.filter(h => h.folder).length

  return (
    <div className="setup-root">
      <div className="setup-body">
        <div className="setup-header">
          <h1>Media Organizer</h1>
          <p>Choose a source folder and map your hotkeys before you start organizing.</p>
        </div>

        {/* Source folder */}
        <div className="setup-section">
          <div className="section-title">Source Folder</div>
          <div className="folder-row">
            <div className="folder-icon">📂</div>
            <div className="folder-text">
              <div className="folder-label">Folder to organize</div>
              <div className="folder-path">
                {sourceFolder || 'No folder selected'}
              </div>
            </div>
            {fileCount !== null && (
              <div className="file-count">{fileCount} file{fileCount !== 1 ? 's' : ''}</div>
            )}
            <button className="btn-browse" onClick={selectSourceFolder}>Browse…</button>
          </div>
        </div>

        {/* Hotkeys grid */}
        <div className="setup-section">
          <div className="section-title">Hotkey Destinations — Keys 1 through 9</div>
          <div className="hotkeys-grid">
            {KEY_LABELS.map((key, i) => {
              const hk = hotkeys[i]
              const filled = !!hk.folder
              return (
                <div key={key} className={`hotkey-slot ${filled ? 'filled' : 'empty'}`}>
                  <div className="hk-badge">{key}</div>
                  <div className="hk-info">
                    {filled ? (
                      <>
                        <input
                          className="hk-label-input"
                          value={hk.label}
                          onChange={e => updateLabel(i, e.target.value)}
                          placeholder="Label"
                        />
                        <div className="hk-path" title={hk.folder}>{hk.folder}</div>
                        <div className="hk-actions">
                          <button className="hk-btn" onClick={() => selectHotkeyFolder(i)}>Change</button>
                          <button className="hk-btn danger" onClick={() => clearHotkey(i)}>Clear</button>
                        </div>
                      </>
                    ) : (
                      <button className="btn-add-folder" onClick={() => selectHotkeyFolder(i)}>
                        + Add folder
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && <div className="setup-error">{error}</div>}
      </div>

      <div className="setup-footer">
        <div className="setup-summary">
          {sourceFolder && (
            <>
              <span className="accent">{sourceFolder.split(/[\\/]/).pop()}</span>
              {fileCount !== null && <> &nbsp;·&nbsp; {fileCount} files</>}
              {configuredCount > 0 && <> &nbsp;·&nbsp; <span className="accent">{configuredCount}</span> hotkeys</>}
            </>
          )}
        </div>
        <button
          className="btn-start"
          onClick={handleStart}
          disabled={!sourceFolder || fileCount === 0}
        >
          Start Organizing →
        </button>
      </div>
    </div>
  )
}
