import { useState, useEffect } from 'react'
import Setup from './components/Setup'
import MediaViewer from './components/MediaViewer'
import ErrorBoundary from './components/ErrorBoundary'

const EMPTY_HOTKEYS = Array(6).fill(null).map((_, i) =>
  i === 0 ? { folder: 'C:\\', label: 'C:' } : { folder: null, label: '' }
)

export default function App() {
  const [view, setView] = useState('setup')
  const [hotkeys, setHotkeys] = useState(EMPTY_HOTKEYS)
  const [files, setFiles] = useState([])
  const [sourceFolder, setSourceFolder] = useState(null)
  const [includeSubfolders, setIncludeSubfolders] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.getHotkeys(),
      window.api.getSourceFolder(),
      window.api.getIncludeSubfolders(),
    ]).then(([hk, folder, recursive]) => {
      setHotkeys(hk)
      setSourceFolder(folder)
      setIncludeSubfolders(recursive)
    })
  }, [])

  // Jump straight from organizing one folder to another, without going back to
  // setup. MediaViewer is keyed on the folder so it remounts clean: indices,
  // tab, zoom, and filters all belong to the folder being organized.
  const handleSwitchFolder = async (folder) => {
    // Same scope as the setup screen chose, so the count you saw there is the
    // list you get here, whichever folder you jump to
    const mediaFiles = await window.api.getMediaFiles(folder, includeSubfolders)
    await window.api.setSourceFolder(folder)
    setSourceFolder(folder)
    setFiles(mediaFiles)
  }

  // Hotkeys can now change mid-session (creating a folder binds one), so the
  // store has to be kept in step rather than only written at setup.
  const handleHotkeysChange = async (updated) => {
    await window.api.setHotkeys(updated)
    setHotkeys(updated)
  }

  const handleStart = async (folder, updatedHotkeys, recursive) => {
    const mediaFiles = await window.api.getMediaFiles(folder, recursive)
    await window.api.setHotkeys(updatedHotkeys)
    await window.api.setSourceFolder(folder)
    await window.api.setIncludeSubfolders(recursive)
    setHotkeys(updatedHotkeys)
    setIncludeSubfolders(recursive)
    setSourceFolder(folder)
    setFiles(mediaFiles)
    setView('organize')
  }

  return (
    <div className="app">
      {view === 'setup' && (
        <Setup
          hotkeys={hotkeys}
          sourceFolder={sourceFolder}
          includeSubfolders={includeSubfolders}
          onStart={handleStart}
        />
      )}
      {view === 'organize' && (
        <ErrorBoundary>
          <MediaViewer
            key={sourceFolder}
            files={files}
            hotkeys={hotkeys}
            sourceFolder={sourceFolder}
            onSwitchFolder={handleSwitchFolder}
            onHotkeysChange={handleHotkeysChange}
            onBackToSetup={() => setView('setup')}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
