import { useState, useEffect, useRef, forwardRef } from 'react'
import { toFileUrl } from '../utils'

// An <img> that recovers from formats Chromium cannot decode.
//
// The common case is HEIC saved with a .jpg extension, which phones do
// routinely. Rather than sniffing every file up front — an IPC round trip per
// thumbnail — this waits for the load to actually fail and only then asks the
// main process for a decoded copy. Normal images pay nothing.
const SmartImage = forwardRef(function SmartImage(
  { path, onFallback, ...imgProps },
  ref,
) {
  const [src, setSrc] = useState(() => toFileUrl(path))
  const attemptedRef = useRef(false)

  useEffect(() => {
    setSrc(toFileUrl(path))
    attemptedRef.current = false
  }, [path])

  const handleError = async () => {
    // One attempt only: if the decoded copy also fails to load, leaving the
    // broken image is better than looping.
    if (attemptedRef.current) return
    attemptedRef.current = true

    try {
      const decoded = await window.api.heicPreview(path)
      if (decoded) {
        setSrc(toFileUrl(decoded))
        onFallback?.(path)
      }
    } catch {
      // Windows could not decode it either; the broken image stands
    }
  }

  return <img ref={ref} src={src} onError={handleError} {...imgProps} />
})

export default SmartImage
