import { useState, useEffect, useRef, useMemo } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { Play, Loader2, Settings, TrendingUp, BarChart3, Save, Trash2, GitCompare, Download, Share2 } from 'lucide-react'

const STRATEGIES = [
  { id: 'all', label: 'All Strategies' },
  { id: 'trend', label: 'Trend Following' },
  { id: 'mean_reversion', label: 'Mean Reversion' },
  { id: 'fft', label: 'FFT Cycle' },
  { id: 'ensemble', label: 'Ensemble' },
]

const COLORS = ['#3b82f6', '#eab308', '#a855f7', '#22c55e', '#ef4444']
const SAVED_KEY = 'trading-sim-saved-backtests'

export default function BacktestRunner({ symbol, connected, sendSignalMessage, backtestResult }) {
  const [config, setConfig] = useState({
    strategy: 'all',
    candles: 500,
    balance: 10000,
    initial_price: 65000,
    volatility: 0.75,
    trailing_stop: false,
    breakeven: false,
  })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
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

  const handleSaveBacktest = () => {
    if (!result || result.error) return
    const entry = {
      id: Date.now(),
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

  const handleExportCSV = () => {
    if (!result?.results) return
    const rows = [['Strategy', 'Return%', 'Trades', 'WinRate%', 'ProfitFactor', 'MaxDD%', 'Sharpe', 'FinalBalance']]
    for (const [name, r] of Object.entries(result.results)) {
      rows.push([name, r.total_return_pct, r.total_trades, r.win_rate, r.profit_factor, r.max_drawdown_pct, r.sharpe_ratio, r.final_balance])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backtest_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [shareLink, setShareLink] = useState('')

  const handleShareLink = () => {
    if (!result?.results) return
    const summary = {
      v: 1,
      sym: symbol,
      cfg: { s: config.strategy, c: config.candles, b: config.balance },
      res: Object.entries(result.results).map(([name, r]) => ({
        n: name,
        ret: r.total_return_pct,
        tr: r.total_trades,
        wr: r.win_rate,
        pf: r.profit_factor,
        dd: r.max_drawdown_pct,
        sh: r.sharpe_ratio,
        fb: r.final_balance,
      })),
    }
    try {
      const encoded = btoa(JSON.stringify(summary))
      const link = `${window.location.origin}${window.location.pathname}#bt=${encoded}`
      navigator.clipboard.writeText(link).then(() => {
        setShareLink(link)
        setTimeout(() => setShareLink(''), 3000)
      }).catch(() => {
        setShareLink(link)
        setTimeout(() => setShareLink(''), 5000)
      })
    } catch {
      setError('Failed to generate share link')
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

  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})

  // Create equity curve chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1521' },
        textColor: '#8b95a7',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#161b26' },
        horzLines: { color: '#161b26' },
      },
      rightPriceScale: { borderColor: '#1e2433' },
      timeScale: { borderColor: '#1e2433' },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    })
    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  // Update chart when results change
  useEffect(() => {
    if (!chartRef.current || !result || result.error) return

    // Clear previous series
    for (const key of Object.keys(seriesRef.current)) {
      try {
        chartRef.current.removeSeries(seriesRef.current[key])
      } catch {
        // series already removed
      }
    }
    seriesRef.current = {}

    const entries = Object.entries(result.results || {})
    entries.forEach(([name, data], idx) => {
      const color = COLORS[idx % COLORS.length]
      const series = chartRef.current.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: name,
      })
      const equityData = (data.equity_curve || []).map((v, i) => ({
        time: i,
        value: v,
      }))
      series.setData(equityData)
      seriesRef.current[name] = series
    })
  }, [result])

  const handleRun = () => {
    if (!sendSignalMessage) {
      setError('WebSocket not connected')
      return
    }

    setRunning(true)
    setError(null)
    setResult(null)

    sendSignalMessage({
      type: 'run_backtest',
      strategy: config.strategy,
      candles: parseInt(config.candles),
      balance: parseFloat(config.balance),
      symbol,
      initial_price: parseFloat(config.initial_price),
      volatility: parseFloat(config.volatility),
      trailing_stop: config.trailing_stop,
      breakeven: config.breakeven,
    })

    // Safety timeout — reset running state after 30s if no response
    setTimeout(() => {
      setRunning(prev => {
        if (prev) {
          setError('Backtest timed out — no response from server')
          return false
        }
        return prev
      })
    }, 30000)
  }

  // Listen for backtest_result or comparison_result from props
  useEffect(() => {
    if (backtestResult) {
      if (backtestResult.type === 'comparison_result') {
        setComparisonResult(backtestResult)
        setCompareLoading(false)
        if (backtestResult.error) setError(backtestResult.error)
        else setError(null)
      } else {
        setResult(backtestResult)
        setRunning(false)
        if (backtestResult.error) setError(backtestResult.error)
        else setError(null)
      }
    }
  }, [backtestResult])

  const sortedResults = useMemo(() => {
    if (!result?.results) return []
    return Object.entries(result.results).sort(
      (a, b) => b[1].total_return_pct - a[1].total_return_pct
    )
  }, [result])

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Config form */}
      <div className="bg-bg-700 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Settings size={14} className="text-accent-blue" />
          <span className="text-xs text-gray-400 font-medium">Backtest Configuration</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Strategy</span>
            <select
              value={config.strategy}
              onChange={e => setConfig(p => ({ ...p, strategy: e.target.value }))}
              className="bg-bg-800 border border-bg-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-blue"
            >
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Candles</span>
            <input
              type="number"
              value={config.candles}
              onChange={e => setConfig(p => ({ ...p, candles: e.target.value }))}
              className="bg-bg-800 border border-bg-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-blue"
              min="100"
              max="5000"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Initial Balance ($)</span>
            <input
              type="number"
              value={config.balance}
              onChange={e => setConfig(p => ({ ...p, balance: e.target.value }))}
              className="bg-bg-800 border border-bg-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-blue"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Initial Price</span>
            <input
              type="number"
              value={config.initial_price}
              onChange={e => setConfig(p => ({ ...p, initial_price: e.target.value }))}
              className="bg-bg-800 border border-bg-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-blue"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Volatility</span>
            <input
              type="number"
              step="0.05"
              value={config.volatility}
              onChange={e => setConfig(p => ({ ...p, volatility: e.target.value }))}
              className="bg-bg-800 border border-bg-600 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-blue"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-gray-500">Risk Options</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 text-gray-300">
                <input
                  type="checkbox"
                  checked={config.trailing_stop}
                  onChange={e => setConfig(p => ({ ...p, trailing_stop: e.target.checked }))}
                  className="accent-blue-500"
                />
                Trailing
              </label>
              <label className="flex items-center gap-1 text-gray-300">
                <input
                  type="checkbox"
                  checked={config.breakeven}
                  onChange={e => setConfig(p => ({ ...p, breakeven: e.target.checked }))}
                  className="accent-blue-500"
                />
                Breakeven
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={running || !connected}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded transition-colors bg-accent-blue text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play size={14} />
              Run Backtest
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && !result.error && (
        <>
          {/* Action buttons */}
          <div className="flex gap-1">
            <button
              onClick={handleSaveBacktest}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors"
            >
              <Save size={10} />
              Save
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 transition-colors"
            >
              <Download size={10} />
              CSV
            </button>
            <button
              onClick={handleShareLink}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 transition-colors"
            >
              <Share2 size={10} />
              {shareLink ? 'Copied!' : 'Share'}
            </button>
            {savedBacktests.length > 0 && (
              <button
                onClick={() => setShowCompare(!showCompare)}
                className={'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ' +
                  (showCompare ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-600 text-gray-400 hover:bg-bg-500')}
              >
                <GitCompare size={10} />
                Compare ({savedBacktests.length})
              </button>
            )}
          </div>

          {/* Comparison view — side-by-side panel */}
          {showCompare && savedBacktests.length > 0 && (
            <div className="bg-bg-700 rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-2 px-1 py-1">
                <GitCompare size={12} className="text-accent-purple" />
                <span className="text-xs text-gray-400 font-medium">Side-by-Side Comparison</span>
                {selectedForCompare.size >= 2 && (
                  <button
                    onClick={handleRunComparison}
                    disabled={compareLoading || !connected}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30 transition-colors disabled:opacity-50"
                  >
                    {compareLoading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                    Run Comparison ({selectedForCompare.size})
                  </button>
                )}
              </div>
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="text-gray-500 border-b border-bg-600">
                    <th className="text-left py-1 w-6"></th>
                    <th className="text-left py-1">Run</th>
                    <th className="text-right">Return</th>
                    <th className="text-right">Trades</th>
                    <th className="text-right">Win%</th>
                    <th className="text-right">MaxDD</th>
                    <th className="text-right">Sharpe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {savedBacktests.map(bt => {
                    const best = Object.entries(bt.results || {}).sort(
                      (a, b) => b[1].total_return_pct - a[1].total_return_pct
                    )[0]
                    if (!best) return null
                    const [, r] = best
                    const isSelected = selectedForCompare.has(bt.id)
                    return (
                      <tr key={bt.id} className={'border-b border-bg-600/50 ' + (isSelected ? 'bg-accent-purple/10' : '')}>
                        <td className="py-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectForCompare(bt.id)}
                            className="accent-purple-500 w-3 h-3"
                          />
                        </td>
                        <td className="py-1 text-gray-300 truncate max-w-[100px]" title={bt.label}>
                          {bt.label}
                        </td>
                        <td className={'text-right font-medium ' + (r.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400')}>
                          {r.total_return_pct > 0 ? '+' : ''}{r.total_return_pct}%
                        </td>
                        <td className="text-right text-gray-400">{r.total_trades}</td>
                        <td className="text-right text-gray-400">{r.win_rate}%</td>
                        <td className="text-right text-red-400">{r.max_drawdown_pct}%</td>
                        <td className="text-right text-gray-400">{r.sharpe_ratio}</td>
                        <td className="text-right">
                          <button
                            onClick={() => handleDeleteSaved(bt.id)}
                            className="text-gray-600 hover:text-accent-red transition-colors"
                          >
                            <Trash2 size={9} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Comparison results */}
              {comparisonResult && !comparisonResult.error && (
                <div className="space-y-2 pt-2 border-t border-bg-600">
                  {/* Best by metrics */}
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div className="bg-bg-800 rounded px-2 py-1">
                      <span className="text-gray-500">Best Sharpe: </span>
                      <span className="text-accent-blue font-medium">{comparisonResult.best_by_sharpe}</span>
                    </div>
                    <div className="bg-bg-800 rounded px-2 py-1">
                      <span className="text-gray-500">Best Return: </span>
                      <span className="text-green-400 font-medium">{comparisonResult.best_by_return}</span>
                    </div>
                    <div className="bg-bg-800 rounded px-2 py-1">
                      <span className="text-gray-500">Best Calmar: </span>
                      <span className="text-accent-purple font-medium">{comparisonResult.best_by_calmar}</span>
                    </div>
                    <div className="bg-bg-800 rounded px-2 py-1">
                      <span className="text-gray-500">Best PF: </span>
                      <span className="text-yellow-400 font-medium">{comparisonResult.best_by_profit_factor}</span>
                    </div>
                  </div>

                  {/* Overlaid equity curves from comparison */}
                  {comparisonResult.equity_curves && Object.keys(comparisonResult.equity_curves).length > 0 && (
                    <div className="bg-bg-800 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-1">Overlaid Equity Curves</div>
                      <ComparisonChart curves={comparisonResult.equity_curves} />
                    </div>
                  )}

                  {/* Significance tests */}
                  {comparisonResult.significance_tests && Object.keys(comparisonResult.significance_tests).length > 0 && (
                    <div className="bg-bg-800 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-1">Statistical Significance (bootstrap)</div>
                      <table className="w-full text-[9px]">
                        <thead>
                          <tr className="text-gray-500 border-b border-bg-600">
                            <th className="text-left py-1">Pair</th>
                            <th className="text-right">p-value</th>
                            <th className="text-right">Significant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(comparisonResult.significance_tests).map(([pair, test]) => (
                            <tr key={pair} className="border-b border-bg-600/30">
                              <td className="py-1 text-gray-400 truncate max-w-[120px]" title={pair}>{pair}</td>
                              <td className="text-right text-gray-400">{test.p_value?.toFixed(4)}</td>
                              <td className={'text-right ' + (test.significant ? 'text-green-400' : 'text-gray-500')}>
                                {test.significant ? 'Yes' : 'No'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed comparison table */}
                  {comparisonResult.rows && comparisonResult.rows.length > 0 && (
                    <div className="bg-bg-800 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-1">Detailed Metrics</div>
                      <table className="w-full text-[9px]">
                        <thead>
                          <tr className="text-gray-500 border-b border-bg-600">
                            <th className="text-left py-1">Name</th>
                            <th className="text-right">Return%</th>
                            <th className="text-right">Sharpe</th>
                            <th className="text-right">Sortino</th>
                            <th className="text-right">Calmar</th>
                            <th className="text-right">MaxDD%</th>
                            <th className="text-right">Win%</th>
                            <th className="text-right">PF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonResult.rows.map((row, idx) => (
                            <tr key={idx} className="border-b border-bg-600/30">
                              <td className="py-1 text-gray-300 truncate max-w-[80px]" title={row.name}>{row.name}</td>
                              <td className={'text-right ' + (row.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400')}>
                                {row.total_return_pct > 0 ? '+' : ''}{row.total_return_pct?.toFixed(2)}
                              </td>
                              <td className="text-right text-gray-400">{row.sharpe_ratio?.toFixed(3)}</td>
                              <td className="text-right text-gray-400">{row.sortino_ratio?.toFixed(3)}</td>
                              <td className="text-right text-gray-400">{row.calmar_ratio?.toFixed(3)}</td>
                              <td className="text-right text-red-400">{row.max_drawdown_pct?.toFixed(2)}</td>
                              <td className="text-right text-gray-400">{row.win_rate?.toFixed(1)}</td>
                              <td className="text-right text-gray-400">{row.profit_factor?.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Equity curve chart */}
          <div className="bg-bg-700 rounded-lg p-2">
            <div className="flex items-center gap-2 px-1 py-1 mb-1">
              <TrendingUp size={12} className="text-accent-blue" />
              <span className="text-xs text-gray-400 font-medium">Equity Curves</span>
            </div>
            <div ref={chartContainerRef} className="h-[150px]" />
          </div>

          {/* Strategy comparison table */}
          <div className="bg-bg-700 rounded-lg p-2">
            <div className="flex items-center gap-2 px-1 py-1 mb-2">
              <BarChart3 size={12} className="text-accent-blue" />
              <span className="text-xs text-gray-400 font-medium">Strategy Comparison</span>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-500 border-b border-bg-600">
                  <th className="text-left py-1">Strategy</th>
                  <th className="text-right">Return</th>
                  <th className="text-right">Trades</th>
                  <th className="text-right">Win%</th>
                  <th className="text-right">PF</th>
                  <th className="text-right">MaxDD</th>
                  <th className="text-right">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map(([name, r], idx) => (
                  <tr key={name} className="border-b border-bg-600/50">
                    <td className="py-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-gray-300">{name}</span>
                    </td>
                    <td className={`text-right font-medium ${r.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.total_return_pct > 0 ? '+' : ''}{r.total_return_pct}%
                    </td>
                    <td className="text-right text-gray-400">{r.total_trades}</td>
                    <td className="text-right text-gray-400">{r.win_rate}%</td>
                    <td className="text-right text-gray-400">{r.profit_factor}</td>
                    <td className="text-right text-red-400">{r.max_drawdown_pct}%</td>
                    <td className="text-right text-gray-400">{r.sharpe_ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed metrics per strategy */}
          {sortedResults.map(([name, r], idx) => (
            <div key={name} className="bg-bg-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="text-xs text-gray-300 font-medium">{name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <Metric label="Final Balance" value={`$${r.final_balance}`} />
                <Metric label="Avg Win" value={`$${r.avg_win}`} color="text-green-400" />
                <Metric label="Avg Loss" value={`$${r.avg_loss}`} color="text-red-400" />
                <Metric label="Signals" value={r.signals_generated} />
                <Metric label="Valid" value={r.signals_valid} />
                <Metric label="Win Rate" value={`${r.win_rate}%`} color={r.win_rate >= 50 ? 'text-green-400' : 'text-yellow-400'} />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Running skeleton */}
      {running && !result && (
        <div className="space-y-2">
          <div className="bg-bg-700 rounded-lg p-2 animate-pulse">
            <div className="h-3 w-32 bg-bg-600 rounded mb-2" />
            <div className="h-[150px] bg-bg-600 rounded" />
          </div>
          <div className="bg-bg-700 rounded-lg p-2 animate-pulse">
            <div className="h-3 w-40 bg-bg-600 rounded mb-2" />
            <div className="space-y-1.5">
              <div className="h-4 bg-bg-600 rounded" />
              <div className="h-4 bg-bg-600 rounded" />
              <div className="h-4 bg-bg-600 rounded w-3/4" />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !running && !error && (
        <div className="text-center text-gray-500 text-xs py-8">
          Configure parameters and click "Run Backtest" to see results.
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color = 'text-gray-200' }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  )
}

function ComparisonChart({ curves }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1521' },
        textColor: '#8b95a7',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#161b26' },
        horzLines: { color: '#161b26' },
      },
      rightPriceScale: { borderColor: '#1e2433' },
      timeScale: { borderColor: '#1e2433' },
      width: containerRef.current.clientWidth,
      height: 120,
    })
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !curves) return
    for (const key of Object.keys(seriesRef.current)) {
      try { chartRef.current.removeSeries(seriesRef.current[key]) } catch { /* */ }
    }
    seriesRef.current = {}

    Object.entries(curves).forEach(([name, data], idx) => {
      const color = COLORS[idx % COLORS.length]
      const series = chartRef.current.addLineSeries({
        color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: name,
      })
      series.setData((data || []).map((v, i) => ({ time: i, value: v })))
      seriesRef.current[name] = series
    })
  }, [curves])

  return <div ref={containerRef} className="h-[120px]" />
}
