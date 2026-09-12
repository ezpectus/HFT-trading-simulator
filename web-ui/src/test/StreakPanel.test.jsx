import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StreakPanel from '../components/performance/StreakPanel'

function acc(trades) {
  return { ex: { trade_history: trades } }
}

const T = (pnl, t) => ({ pnl, close_time: t })

describe('StreakPanel', () => {
  it('computes current + max streaks from trade history', () => {
    // sorted newest-first, iterated in that order: W W L W W W
    // → ends on 3 consecutive wins → current = 3W, maxWin 3, maxLoss 1
    render(<StreakPanel accounts={acc([
      T(10, 5), T(10, 4), T(-5, 3), T(10, 2), T(10, 1), T(10, 0),
    ])} />)
    expect(screen.getByText('3W')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()   // max win streak
    expect(screen.getByText('1')).toBeTruthy()   // max loss streak
  })

  it('losing streak shows -L and counts max', () => {
    render(<StreakPanel accounts={acc([T(-5, 1), T(-5, 0)])} />)
    expect(screen.getByText('2L')).toBeTruthy()
  })

  it('empty history → zero streaks and dash', () => {
    render(<StreakPanel accounts={{}} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('aggregates trades across exchanges', () => {
    render(<StreakPanel accounts={{
      a: { trade_history: [T(10, 1), T(10, 0)] },
      b: { trade_history: [T(10, 2)] },
    }} />)
    expect(screen.getByText('3W')).toBeTruthy()
  })
})
