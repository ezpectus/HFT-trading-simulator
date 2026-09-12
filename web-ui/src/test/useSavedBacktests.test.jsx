import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSavedBacktests } from '../hooks/useSavedBacktests'
import { SAVED_KEY } from '../components/backtest/constants'

const makeResult = (ret = 5.5) => ({
  results: { strat: { total_return_pct: ret, total_trades: 10 } },
})
const makeConfig = (over = {}) => ({
  strategy: 'trend', candles: 500, volatility: 0.75,
  trailing_stop: false, breakeven: false, ...over,
})

const setup = () => {
  const sendSignalMessage = vi.fn()
  const setError = vi.fn()
  const { result } = renderHook(() => useSavedBacktests({ sendSignalMessage, setError }))
  return { result, sendSignalMessage, setError }
}

describe('useSavedBacktests', () => {
  beforeEach(() => localStorage.clear())

  it('saves a backtest entry to state + localStorage', () => {
    const { result } = setup()
    act(() => result.current.handleSaveBacktest(makeResult(), makeConfig()))
    expect(result.current.savedBacktests).toHaveLength(1)
    const entry = result.current.savedBacktests[0]
    expect(entry.label).toBe('trend | 500c | vol=0.75')
    expect(entry.results.strat.total_return_pct).toBe(5.5)
    expect(JSON.parse(localStorage.getItem(SAVED_KEY))).toHaveLength(1)
  })

  it('labels trailing/breakeven flags', () => {
    const { result } = setup()
    act(() => result.current.handleSaveBacktest(
      makeResult(), makeConfig({ trailing_stop: true, breakeven: true })))
    expect(result.current.savedBacktests[0].label).toBe('trend | 500c | vol=0.75 | TS | BE')
  })

  it('caps saved list at 10 entries', () => {
    const { result } = setup()
    for (let i = 0; i < 12; i++) {
      act(() => result.current.handleSaveBacktest(makeResult(i), makeConfig()))
    }
    expect(result.current.savedBacktests).toHaveLength(10)
    // oldest dropped — first entry is run #2 (ret=2)
    expect(result.current.savedBacktests[0].results.strat.total_return_pct).toBe(2)
  })

  it('deletes a saved entry from state + storage', () => {
    const { result } = setup()
    act(() => result.current.handleSaveBacktest(makeResult(), makeConfig()))
    const id = result.current.savedBacktests[0].id
    act(() => result.current.handleDeleteSaved(id))
    expect(result.current.savedBacktests).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(SAVED_KEY))).toHaveLength(0)
  })

  it('refuses to save an errored result', () => {
    const { result } = setup()
    act(() => result.current.handleSaveBacktest({ error: 'boom' }, makeConfig()))
    expect(result.current.savedBacktests).toHaveLength(0)
  })

  it('loads pre-existing entries from localStorage on mount', () => {
    localStorage.setItem(SAVED_KEY, JSON.stringify([{ id: 1, label: 'old', results: {} }]))
    const { result } = setup()
    expect(result.current.savedBacktests).toHaveLength(1)
    expect(result.current.savedBacktests[0].label).toBe('old')
  })

  it('runComparison requires ≥2 selected and sends compare_backtests', () => {
    const { result, sendSignalMessage } = setup()
    act(() => result.current.handleSaveBacktest(makeResult(1), makeConfig()))
    act(() => result.current.handleSaveBacktest(makeResult(2), makeConfig()))
    const [a, b] = result.current.savedBacktests.map(e => e.id)

    // 1 selected → no send
    act(() => result.current.toggleSelectForCompare(a))
    act(() => result.current.handleRunComparison())
    expect(sendSignalMessage).not.toHaveBeenCalled()

    // 2 selected → sends compare_backtests with both
    act(() => result.current.toggleSelectForCompare(b))
    act(() => result.current.handleRunComparison())
    expect(sendSignalMessage).toHaveBeenCalledWith({
      type: 'compare_backtests',
      backtests: expect.arrayContaining([
        expect.objectContaining({ results: expect.any(Object) }),
      ]),
    })
    expect(sendSignalMessage.mock.calls[0][0].backtests).toHaveLength(2)
    expect(result.current.compareLoading).toBe(true)
  })

  it('handleComparisonMessage routes comparison_result, ignores others', () => {
    const { result, setError } = setup()
    let routed
    act(() => { routed = result.current.handleComparisonMessage({ type: 'backtest_result' }) })
    expect(routed).toBe(false)
    const cmp = { type: 'comparison_result', best_by_sharpe: 'x' }
    act(() => { routed = result.current.handleComparisonMessage(cmp) })
    expect(routed).toBe(true)
    expect(result.current.comparisonResult).toEqual(cmp)
    expect(result.current.compareLoading).toBe(false)
    expect(setError).toHaveBeenCalledWith(null)
  })
})
