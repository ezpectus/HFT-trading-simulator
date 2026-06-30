import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Debounce a rapidly-changing value.
 * @param {*} value - The value to debounce
 * @param {number} delay - Delay in ms (default 300)
 * @returns {*} The debounced value
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * Throttle a callback to limit invocation frequency.
 * @param {Function} callback - The function to throttle
 * @param {number} limit - Minimum interval between calls in ms (default 100)
 * @returns {Function} Throttled callback
 */
export function useThrottledCallback(callback, limit = 100) {
  const lastRun = useRef(0)
  const timerRef = useRef(null)
  const callbackRef = useRef(callback)

  useEffect(() => { callbackRef.current = callback })

  return useCallback((...args) => {
    const now = Date.now()
    const remaining = limit - (now - lastRun.current)

    if (remaining <= 0) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      lastRun.current = now
      callbackRef.current(...args)
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        lastRun.current = Date.now()
        timerRef.current = null
        callbackRef.current(...args)
      }, remaining)
    }
  }, [limit])
}

/**
 * Batch multiple state updates into a single requestAnimationFrame.
 * Useful for high-frequency data (WebSocket messages) that would otherwise
 * cause excessive re-renders.
 * @param {Function} updater - Receives a batch array, returns new state
 * @param {number} maxBatchSize - Maximum items per batch (default 50)
 * @returns {Function} push(item) — add an item to the pending batch
 */
export function useBatchedUpdates(updater, maxBatchSize = 50) {
  const batchRef = useRef([])
  const rafRef = useRef(null)
  const updaterRef = useRef(updater)

  useEffect(() => { updaterRef.current = updater })

  const flush = useCallback(() => {
    if (batchRef.current.length > 0) {
      updaterRef.current(batchRef.current)
      batchRef.current = []
    }
    rafRef.current = null
  }, [])

  const push = useCallback((item) => {
    batchRef.current.push(item)
    if (batchRef.current.length >= maxBatchSize) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      flush()
    } else if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [maxBatchSize, flush])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  return push
}

/**
 * Memoized web worker hook — creates a worker from a URL and manages lifecycle.
 * @param {string} workerUrl - URL to the worker script
 * @returns {{ worker: Worker|null, postMessage: Function, terminate: Function }}
 */
export function useWorker(workerUrl) {
  const workerRef = useRef(null)

  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL(workerUrl, import.meta.url), { type: 'module' })
    } catch {
      workerRef.current = null
    }
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [workerUrl])

  const postMessage = useCallback((message) => {
    if (workerRef.current) workerRef.current.postMessage(message)
  }, [])

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

  return { worker: workerRef.current, postMessage, terminate }
}

/**
 * Intersection Observer hook — for lazy-loading components on scroll.
 * @param {Object} options - IntersectionObserver options
 * @returns {[ref, isVisible]} Ref to attach and visibility boolean
 */
export function useIntersectionObserver(options = {}) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.1, ...options })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, isVisible]
}
