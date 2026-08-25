import { useRef } from 'react'

export function usePrevious(value) {
  const ref = useRef(value)
  const prev = ref.current
  ref.current = value
  return prev
}
