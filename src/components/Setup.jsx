import { useState, useEffect } from 'react'
import './Setup.css'

const KEY_LABELS = ['1', '2', '3', '4', '5', '6']

export default function Setup({ hotkeys: initialHotkeys, sourceFolder: initialSourceFolder, includeSubfolders: initialIncludeSubfolders, onStart }) {
  const [hotkeys, setHotkeys] = useState(initialHotkeys)

  // Sync when the store finishes loading in the parent
  useEffect(() => { setHotkeys(initialHotkeys) }, [initialHotkeys])
  const [sourceFolder, setSourceFolder] = useState(initialSourceFolder)
  const [fileCount, setFileCount] = useState(null)
  const [includeSubfolders, setIncludeSubfolders] = useState(initialIncludeSubfolders)
  const [error, setError] = useState(null)

  useEffect(() => { setIncludeSubfolders(initialIncludeSubfolders) }, [initialIncludeSubfolders])

  // Sync when the saved folder finishes loading from the store (async on first mount)
  useEffect(() => {
    if (initialSourceFolder) setSourceFolder(initialSourceFolder)
  }, [initialSourceFolder])

  // The count has to mean the same thing as the scope the checkbox sets, so it
  // is recounted whenever either changes rather than only when a folder is
  // picked. A scan of a deep tree can take a moment, so a stale result from a
  // previous scope is discarded instead of overwriting a newer one.
  useEffect(() => {
    if (!sourceFolder) return
    let current = true
    setFileCount(null)
    window.api.getMediaFiles(sourceFolder, includeSubfolders)
      .then(files => { if (current) setFileCount(files.length) })
      .catch(() => { if (current) setFileCount(0) })
    return () => { current = false }
  }, [sourceFolder, includeSubfolders])

  const selectSourceFolder = async () => {
    // Start where the current selection is, not wherever the shell last was
    const folder = await window.api.selectFolder(sourceFolder)
    if (!folder) return
    setSourceFolder(folder)
  }

  const selectHotkeyFolder = async (index) => {
    // Change reopens on that hotkey's own folder; an empty slot has none, so
    // start from the source folder, which is usually where destinations live
    const folder = await window.api.selectFolder(hotkeys[index]?.folder || sourceFolder)
    if (!folder) return
    const folderName = folder.split(/[\\/]/).pop()
    const updated = hotkeys.map((hk, i) =>
      i === index
        ? { folder, label: folderName }
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

  const handleStart = async () => {
    if (!sourceFolder) return setError('Select a source folder first.')
    if (fileCount === 0) return setError('The selected folder contains no supported media files.')
    setError(null)
    try {
      await onStart(sourceFolder, hotkeys, includeSubfolders)
    } catch (e) {
      setError(`Failed to start: ${e.message}`)
    }
  }

  const configuredCount = hotkeys.filter(h => h.folder).length

  return (
    <div className="setup-root">
      <div className="setup-body">
        <div className="setup-header">
          <h1>Media Organizer</h1>
          <p>Choose a source folder to get started. Hotkeys are optional — skip them if you only want to crop, rotate, or rate.</p>
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
            {fileCount === null && sourceFolder && (
              <div className="file-count file-count--counting">counting…</div>
            )}
            <button className="btn-browse" onClick={selectSourceFolder}>Browse…</button>
          </div>

          <label className="subfolders-toggle">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={e => setIncludeSubfolders(e.target.checked)}
            />
            <span>
              Include subfolders
              <span className="subfolders-note">
                {includeSubfolders
                  ? 'Counting this folder and everything inside it'
                  : 'Counting only files directly in this folder'}
              </span>
            </span>
          </label>
        </div>

        {/* Hotkeys grid */}
        <div className="setup-section">
          <div className="section-title">Hotkey Destinations — Keys 1 through 6 (optional)</div>
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
