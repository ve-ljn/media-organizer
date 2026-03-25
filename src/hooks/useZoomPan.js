import { useState, useRef, useCallback } from 'react'

export default function useZoomPan(viewerMediaRef) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragActive, setDragActive] = useState(false)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const changeZoom = useCallback((delta) => {
    setZoom(prev => {
      const next = Math.round(Math.max(1, Math.min(5, prev + delta)) * 100) / 100
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    changeZoom(e.deltaY < 0 ? 0.25 : -0.25)
  }, [changeZoom])

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return
    e.preventDefault()
    isDragging.current = true
    setDragActive(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [zoom, pan])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return
    setPan({ x: dragStart.current.panX + e.clientX - dragStart.current.x, y: dragStart.current.panY + e.clientY - dragStart.current.y })
  }, [])

  const handleMouseUp = useCallback(() => { isDragging.current = false; setDragActive(false) }, [])

  const minimapRect = (() => {
    const vW = viewerMediaRef.current?.offsetWidth || 800
    const vH = viewerMediaRef.current?.offsetHeight || 600
    const rW = 1 / zoom
    const rH = 1 / zoom
    const rL = Math.max(0, Math.min(1 - rW, 0.5 - 0.5 / zoom - pan.x / (zoom * vW)))
    const rT = Math.max(0, Math.min(1 - rH, 0.5 - 0.5 / zoom - pan.y / (zoom * vH)))
    return { left: rL, top: rT, width: rW, height: rH }
  })()

  return {
    zoom, pan, setPan, dragActive, isDragging,
    changeZoom, resetZoom,
    handleWheel, handleMouseDown, handleMouseMove, handleMouseUp,
    minimapRect,
  }
}
