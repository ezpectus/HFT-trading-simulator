import { useState, useEffect, useCallback } from 'react'

/**
 * Persist state to localStorage with automatic JSON serialization.
 * @param key - localStorage key
 * @param initialValue - initial value if nothing is stored
 * @returns [value, setValue, remove]
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) as T : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota / serialization errors
    }
  }, [key, value])

  const remove = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
    setValue(initialValue)
  }, [key, initialValue])

  return [value, setValue, remove]
}
