'use client'

import { useEffect, useState } from 'react'

/**
 * The current time, ticking every `intervalMs`. It starts at `initial` (the server's render time,
 * passed down from the page), so server and browser render time-dependent labels the same way.
 */
export function useNow(initial: number, intervalMs: number): number {
  const [now, setNow] = useState(initial)

  useEffect(() => {
    // Catch up straight away: the page may have been rendered a while ago.
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, intervalMs)

    tick()

    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}
