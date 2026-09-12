import { useState, useEffect, useCallback } from 'react'
import { SAVED_KEY } from '../components/backtest/constants'

/** Saved-backtest persistence + side-by-side comparison state.
 *  Extracted from BacktestRunner.jsx (S015). */
export function useSavedBacktests({ sendSignalMessage, setError }) {
  const [savedBacktests, setSavedBacktests] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [comparisonResult, setComparisonResult] = useState(null)
  const [selectedForCompare, setSelectedForCompare] = useState(new Set())
  const [compareLoading, setCompareLoading] = useState(false)

  // Load saved backtests from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_KEY)
      if (saved) setSavedBacktests(JSON.parse(saved))
    } catch {
      // ignore
    }
  }, [])

  const handleSaveBacktest = (result, config) => {
    if (!result || result.error) return
    const entry = {
      // Date.now() alone collides for saves within the same millisecond —
      // two entries would share an id and the compare-select Set breaks
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `${config.strategy} | ${config.candles}c | vol=${config.volatility}${config.trailing_stop ? ' | TS' : ''}${config.breakeven ? ' | BE' : ''}`,
      config: { ...config },
      results: result.results,
      timestamp: new Date().toISOString().slice(0, 19),
    }
    const next = [...savedBacktests, entry].slice(-10) // keep last 10
    setSavedBacktests(next)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const handleDeleteSaved = (id) => {
    const next = savedBacktests.filter(b => b.id !== id)
    setSavedBacktests(next)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const toggleSelectForCompare = (id) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRunComparison = () => {
    const selected = savedBacktests.filter(bt => selectedForCompare.has(bt.id))
    if (selected.length < 2) return

    setCompareLoading(true)
    setComparisonResult(null)

    sendSignalMessage({
      type: 'compare_backtests',
      backtests: selected.map(bt => ({
        name: bt.label,
        results: bt.results,
      })),
    })

    setTimeout(() => {
      setCompareLoading(prev => {
        if (prev) {
          setError('Comparison timed out — no response from server')
          return false
        }
        return prev
      })
    }, 15000)
  }

  /** Feed an incoming WS message — returns true if it was a comparison_result. */
  const handleComparisonMessage = useCallback((msg) => {
    if (msg?.type !== 'comparison_result') return false
    setComparisonResult(msg)
    setCompareLoading(false)
    setError(msg.error ? msg.error : null)
    return true
  }, [setError])

  return {
    savedBacktests, showCompare, setShowCompare,
    comparisonResult, compareLoading, selectedForCompare,
    handleSaveBacktest, handleDeleteSaved,
    toggleSelectForCompare, handleRunComparison, handleComparisonMessage,
  }
}
