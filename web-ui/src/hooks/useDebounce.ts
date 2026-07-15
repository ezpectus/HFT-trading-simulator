import { useState, useEffect } from 'react'

/**
 * Debounce a rapidly-changing value (e.g. search input).
 * Returns the value only after `delay` ms have elapsed without changes.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default 300)
 * @returns Debounced value
 *
 * @example
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 500)
 * useEffect(() => { fetchResults(debouncedSearch) }, [debouncedSearch])
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
