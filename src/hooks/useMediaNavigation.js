import { useCallback } from 'react'

export default function useMediaNavigation({ index, files, setIndex, ratingFilter, ratingsMap, showToast, setSlideshow }) {
  const goNext = useCallback(() => {
    if (files.length === 0) return
    if (ratingFilter) {
      // Search forward, then wrap around from the beginning
      let next = index + 1
      while (next < files.length && (ratingsMap[files[next]?.path] || 0) < ratingFilter) next++
      if (next < files.length) {
        setIndex(next)
      } else {
        // Wrap: search from beginning up to current index
        let wrapped = 0
        while (wrapped < index && (ratingsMap[files[wrapped]?.path] || 0) < ratingFilter) wrapped++
        if (wrapped < index && (ratingsMap[files[wrapped]?.path] || 0) >= ratingFilter) setIndex(wrapped)
        else { setSlideshow(false); showToast('No other filtered files') }
      }
    } else {
      setIndex(i => (i + 1) % files.length)
    }
  }, [index, files, setIndex, showToast, ratingFilter, ratingsMap, setSlideshow])

  const goPrev = useCallback(() => {
    if (files.length === 0) return
    if (ratingFilter) {
      // Search backward, then wrap around from the end
      let prev = index - 1
      while (prev >= 0 && (ratingsMap[files[prev]?.path] || 0) < ratingFilter) prev--
      if (prev >= 0) {
        setIndex(prev)
      } else {
        // Wrap: search from end down to current index
        let wrapped = files.length - 1
        while (wrapped > index && (ratingsMap[files[wrapped]?.path] || 0) < ratingFilter) wrapped--
        if (wrapped > index && (ratingsMap[files[wrapped]?.path] || 0) >= ratingFilter) setIndex(wrapped)
      }
    } else {
      setIndex(i => (i - 1 + files.length) % files.length)
    }
  }, [index, files, setIndex, ratingFilter, ratingsMap])

  const advance = useCallback((newFiles, fromIndex) => {
    if (ratingFilter) {
      let next = fromIndex
      while (next < newFiles.length && (ratingsMap[newFiles[next]?.path] || 0) < ratingFilter) next++
      if (next >= newFiles.length) {
        next = fromIndex - 1
        while (next >= 0 && (ratingsMap[newFiles[next]?.path] || 0) < ratingFilter) next--
      }
      setIndex(Math.max(0, Math.min(Math.max(next, 0), newFiles.length - 1)))
    } else {
      setIndex(Math.max(0, Math.min(fromIndex, newFiles.length - 1)))
    }
  }, [setIndex, ratingFilter, ratingsMap])

  return { goNext, goPrev, advance }
}
