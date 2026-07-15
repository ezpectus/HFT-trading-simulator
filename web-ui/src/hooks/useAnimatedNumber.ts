import { useState, useEffect, useRef } from 'react'

/**
 * useAnimatedNumber — animates a number from its previous value to the new value.
 * Uses requestAnimationFrame for smooth 60fps transitions.
 *
 * @param value - The target value to animate to
 * @param duration - Animation duration in ms (default: 300)
 * @returns The currently displayed (animated) value
 *
 * Usage:
 *   const animatedBalance = useAnimatedNumber(balance)
 *   <span>${animatedBalance.toFixed(2)}</span>
 */
export function useAnimatedNumber(value: number, duration: number = 300): number {
  const [displayValue, setDisplayValue] = useState<number>(value)
  const prevValueRef = useRef<number>(value)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    const prevValue = prevValueRef.current
    if (value === prevValue) return

    startTimeRef.current = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current
      const progress = Math.min(1, elapsed / duration)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = prevValue + (value - prevValue) * eased
      setDisplayValue(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = value
        setDisplayValue(value)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return displayValue
}
