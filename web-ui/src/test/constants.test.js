import { describe, it, expect } from 'vitest'
import { STRATEGIES, COLORS, SAVED_KEY } from '../components/backtest/constants'

describe('backtest constants', () => {
  it('STRATEGIES covers every backend strategy id', () => {
    const ids = STRATEGIES.map(s => s.id)
    // ids must match build_strategies() in backtest_requests.py
    expect(ids).toEqual(['all', 'trend', 'mean_reversion', 'fft', 'ensemble'])
    expect(STRATEGIES.every(s => s.label.length > 0)).toBe(true)
  })
  it('COLORS are valid hex', () => {
    expect(COLORS.length).toBeGreaterThanOrEqual(3)
    expect(COLORS.every(c => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
  })
  it('SAVED_KEY is stable localStorage key', () => {
    expect(SAVED_KEY).toBe('trading-sim-saved-backtests')
  })
})
