import { useRef, useEffect } from 'react'

/**
 * Declarative interval hook — calls `callback` every `delay` ms.
 *
 * Uses a ref-based pattern to avoid stale closures: the callback can read
 * the latest state/props without requiring the interval to be reset.
 * Pass `null` as delay to pause the interval.
 *
 * @param callback - Function to call on each interval tick
 * @param delay - Interval in ms, or null to pause
 *
 * @example
 * // Tick every second
 * const [count, setCount] = useState(0)
 * useInterval(() => setCount(c => c + 1), 1000)
 *
 * @example
 * // Pausable
 * const [running, setRunning] = useState(true)
 * useInterval(() => fetchData(), running ? 5000 : null)
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null || delay === undefined) return

    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
