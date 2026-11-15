import { useEffect, useRef } from 'react'

/**
 * Fades a section in the first time it scrolls into view. Content is visible
 * by default: it is hidden only after this hook confirms motion is allowed and
 * the section starts below the fold, and any scroll that brings it near the
 * viewport reveals it, so nothing can get stuck invisible.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const visible = () => element.getBoundingClientRect().top < window.innerHeight * 0.88
    if (visible()) return // already on screen: no animation
    element.dataset.reveal = 'pending'
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!visible()) return
        element.dataset.reveal = 'in'
        stop()
      })
    }
    const stop = () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      stop()
      cancelAnimationFrame(frame)
      delete element.dataset.reveal
    }
  }, [])
  return ref
}
