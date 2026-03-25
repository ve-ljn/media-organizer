export function toFileUrl(filePath) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

// m:ss — for timeline labels and time display
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// m:ss.d — for split markers and loop badge
export function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.0'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const d = Math.floor((seconds % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${d}`
}
