import { useState, useRef, useCallback, useEffect } from 'react'

export const LOG_TYPES = {
  move: 'log-move',
  delete: 'log-delete',
  save: 'log-save',
  split: 'log-split',
  info: 'log-info',
  rate: 'log-rate',
}

function nowStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export default function useActivityLog() {
  const [logEntries, setLogEntries] = useState([])
  const [showConsole, setShowConsole] = useState(false)
  const logIdCounter = useRef(0)
  const logEndRef = useRef(null)

  const addLog = useCallback((message, type = 'info') => {
    setLogEntries(prev => [...prev.slice(-199), { id: ++logIdCounter.current, time: nowStr(), message, type }])
  }, [])

  useEffect(() => {
    if (showConsole) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries, showConsole])

  return { logEntries, setLogEntries, showConsole, setShowConsole, addLog, logEndRef }
}
