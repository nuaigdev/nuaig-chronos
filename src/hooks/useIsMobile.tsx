'use client'

import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches)

    // Set initial value
    handler(mql)

    // Listen for changes
    mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void)
    return () => mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void)
  }, [breakpoint])

  return isMobile
}
