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

  useEffect(() => {
    Promise.all([window.api.getHotkeys(), window.api.getSourceFolder()]).then(([hk, folder]) => {
      setHotkeys(hk)
      setSourceFolder(folder)
    })
  }, [])

  const handleStart = async (folder, updatedHotkeys) => {
    const mediaFiles = await window.api.getMediaFiles(folder)
    await window.api.setHotkeys(updatedHotkeys)
    await window.api.setSourceFolder(folder)
    setHotkeys(updatedHotkeys)
    setSourceFolder(folder)
    setFiles(mediaFiles)
    setView('organize')
  }

  return (
    <div className="app">
      {view === 'setup' && (
        <Setup hotkeys={hotkeys} sourceFolder={sourceFolder} onStart={handleStart} />
      )}
      {view === 'organize' && (
        <ErrorBoundary>
          <MediaViewer
            files={files}
            hotkeys={hotkeys}
            onBackToSetup={() => setView('setup')}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
