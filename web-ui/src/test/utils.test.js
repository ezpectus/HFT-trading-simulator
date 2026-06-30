/**
 * Tests for format utilities (utils/format.js)
 */
import { describe, it, expect } from 'vitest'
import {
  formatPrice, formatVolume, formatPct, formatUsd,
  formatTime, colorForSide, bgColorForSide,
} from '../utils/format'

describe('formatPrice', () => {
  it('formats with default 2 decimals', () => {
    expect(formatPrice(50000.123)).toBe('50,000.12')
  })

  it('formats with custom decimals', () => {
    expect(formatPrice(50000.123456, 4)).toBe('50,000.1235')
  })

  it('returns -- for null/NaN', () => {
    expect(formatPrice(null)).toBe('--')
    expect(formatPrice(NaN)).toBe('--')
    expect(formatPrice(undefined)).toBe('--')
  })
})

describe('formatVolume', () => {
  it('formats millions', () => {
    expect(formatVolume(1500000)).toBe('1.50M')
  })

  it('formats thousands', () => {
    expect(formatVolume(15000)).toBe('15.00K')
  })

  it('formats small numbers', () => {
    expect(formatVolume(99.5)).toBe('99.50')
  })

  it('returns -- for null/NaN', () => {
    expect(formatVolume(null)).toBe('--')
    expect(formatVolume(NaN)).toBe('--')
  })
})

describe('formatPct', () => {
  it('formats positive with + sign', () => {
    expect(formatPct(5.5)).toBe('+5.50%')
  })

  it('formats negative with - sign', () => {
    expect(formatPct(-3.2)).toBe('-3.20%')
  })

  it('formats zero', () => {
    expect(formatPct(0)).toBe('+0.00%')
  })

  it('returns -- for null/NaN', () => {
    expect(formatPct(null)).toBe('--')
    expect(formatPct(NaN)).toBe('--')
  })
})

describe('formatUsd', () => {
  it('formats positive amounts', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
  })

  it('formats negative amounts', () => {
    expect(formatUsd(-500)).toBe('-$500.00')
  })

  it('returns -- for null/NaN', () => {
    expect(formatUsd(null)).toBe('--')
    expect(formatUsd(NaN)).toBe('--')
  })
})

describe('formatTime', () => {
  it('returns -- for falsy', () => {
    expect(formatTime(0)).toBe('--')
    expect(formatTime(null)).toBe('--')
  })

  it('formats a timestamp', () => {
    const result = formatTime(1700000000)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})

describe('colorForSide', () => {
  it('returns green for BUY', () => {
    expect(colorForSide('BUY')).toBe('text-accent-green')
  })

  it('returns green for LONG', () => {
    expect(colorForSide('LONG')).toBe('text-accent-green')
  })

  it('returns red for SELL', () => {
    expect(colorForSide('SELL')).toBe('text-accent-red')
  })
})

describe('bgColorForSide', () => {
  it('returns green bg for BUY', () => {
    expect(bgColorForSide('BUY')).toBe('bg-accent-green')
  })

  it('returns red bg for SELL', () => {
    expect(bgColorForSide('SELL')).toBe('bg-accent-red')
  })
})
