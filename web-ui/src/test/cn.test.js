import { describe, it, expect } from 'vitest'
import { cn } from '../utils/cn'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters out falsy values', () => {
    expect(cn('a', null, 'b', undefined, 'c', false, '')).toBe('a b c')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('handles single class', () => {
    expect(cn('only')).toBe('only')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })

  it('handles 0 as falsy', () => {
    expect(cn('a', 0, 'b')).toBe('a b')
  })

  it('handles numeric strings', () => {
    expect(cn('a', '1', 'b')).toBe('a 1 b')
  })
})
