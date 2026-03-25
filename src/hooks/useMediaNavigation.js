import { useCallback } from 'react'

export default function useMediaNavigation({ index, files, setIndex, ratingFilter, ratingsMap, showToast, setSlideshow }) {
  const goNext = useCallback(() => {
    if (ratingFilter) {
      let next = index + 1
      while (next < files.length && (ratingsMap[files[next]?.path] || 0) < ratingFilter) next++
      if (next < files.length) setIndex(next)
      else { setSlideshow(false); showToast('End of filtered files') }
    } else {
      if (index < files.length - 1) setIndex(i => i + 1)
      else { setSlideshow(false); showToast('End of files') }
    }
  }, [index, files, setIndex, showToast, ratingFilter, ratingsMap, setSlideshow])

  const goPrev = useCallback(() => {
    if (ratingFilter) {
      let prev = index - 1
      while (prev >= 0 && (ratingsMap[files[prev]?.path] || 0) < ratingFilter) prev--
      if (prev >= 0) setIndex(prev)
    } else {
      if (index > 0) setIndex(i => i - 1)
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
