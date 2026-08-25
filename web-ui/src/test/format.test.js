import { describe, it, expect } from 'vitest'
import { formatPrice, formatVolume, formatPct, formatUsd, formatTime } from '../utils/format'

describe('format utilities', () => {
  describe('formatPrice', () => {
    it('formats positive number with 2 decimals', () => {
      expect(formatPrice(1234.5678)).toBe('1,234.57')
    })
    it('formats with custom decimals', () => {
      expect(formatPrice(1234.5, 0)).toBe('1,235')
    })
    it('returns -- for null', () => {
      expect(formatPrice(null)).toBe('--')
    })
    it('returns -- for undefined', () => {
      expect(formatPrice(undefined)).toBe('--')
    })
    it('returns -- for NaN', () => {
      expect(formatPrice(NaN)).toBe('--')
    })
    it('formats 0', () => {
      expect(formatPrice(0)).toBe('0.00')
    })
  })

  describe('formatVolume', () => {
    it('formats millions with M suffix', () => {
      expect(formatVolume(1_500_000)).toBe('1.50M')
    })
    it('formats thousands with K suffix', () => {
      expect(formatVolume(15_000)).toBe('15.00K')
    })
    it('formats small numbers without suffix', () => {
      expect(formatVolume(99.5)).toBe('99.50')
    })
    it('returns -- for null', () => {
      expect(formatVolume(null)).toBe('--')
    })
    it('returns -- for NaN', () => {
      expect(formatVolume(NaN)).toBe('--')
    })
  })

  describe('formatPct', () => {
    it('formats positive with + sign', () => {
      expect(formatPct(5.123)).toBe('+5.12%')
    })
    it('formats negative with - sign', () => {
      expect(formatPct(-3.5)).toBe('-3.50%')
    })
    it('formats zero with + sign', () => {
      expect(formatPct(0)).toBe('+0.00%')
    })
    it('returns -- for null', () => {
      expect(formatPct(null)).toBe('--')
    })
    it('supports custom decimals', () => {
      expect(formatPct(5.1234, 4)).toBe('+5.1234%')
    })
  })

  describe('formatUsd', () => {
    it('formats positive amount', () => {
      expect(formatUsd(1234.5)).toBe('$1,234.50')
    })
    it('formats negative with - prefix', () => {
      expect(formatUsd(-500)).toBe('- $500.00')
    })
    it('returns -- for null', () => {
      expect(formatUsd(null)).toBe('--')
    })
    it('returns -- for NaN', () => {
      expect(formatUsd(NaN)).toBe('--')
    })
    it('formats 0', () => {
      expect(formatUsd(0)).toBe('$0.00')
    })
  })

  describe('formatTime', () => {
    it('formats timestamp to time string', () => {
      const ts = 1700000000 // known timestamp
      const result = formatTime(ts)
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/)
    })
    it('returns -- for 0', () => {
      expect(formatTime(0)).toBe('--')
    })
    it('returns -- for falsy', () => {
      expect(formatTime(null)).toBe('--')
    })
  })
})
