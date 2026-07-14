import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { Play, Loader2, TrendingUp, TrendingDown, BarChart3, Download } from 'lucide-react'
import { runBacktest } from '../utils/backtestEngine'
import { useTradingStore } from '../stores/useTradingStore'
import { useUIStore } from '../stores/useUIStore'

const SAVED_KEY = 'trading-sim-strategies'

const DEFAULT_RULES = [
  { id: 1, condition: 'rsi_below', value: 30, action: 'buy', qty: 0.1 },
  { id: 2, condition: 'rsi_above', value: 70, action: 'sell', qty: 0.1 },
]

export default function StrategyBacktest() {
  const candles = useTradingStore((s) => s.candles)
  const selectedExchange = useUIStore((s) => s.selectedExchange)
  const selectedSymbol = useUIStore((s) => s.selectedSymbol)

  const [rules, setRules] = useState(DEFAULT_RULES)
  const [config, setConfig] = useState({
    initialBalance: 10000,
    feePct: 0.075,
    positionSizePct: 10,
    emaFastPeriod: 9,
    emaSlowPeriod: 21,
    rsiPeriod: 14,
  })
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [showTrades, setShowTrades] = useState(false)

  // Load saved strategies
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.length > 0 && parsed[0].rules) {
          setRules(parsed[0].rules)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const backtestCandles = useMemo(() => {
    return candles
      .filter(c => c.exchange === selectedExchange && c.symbol === selectedSymbol)
      .map(c => ({
        time: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
      .sort((a, b) => a.time - b.time)
  }, [candles, selectedExchange, selectedSymbol])

  const handleRun = useCallback(() => {
    setRunning(true)
    setTimeout(() => {
      const res = runBacktest(backtestCandles, rules, {
        initialBalance: config.initialBalance,
        feePct: config.feePct,
        positionSizePct: config.positionSizePct / 100,
        emaFastPeriod: config.emaFastPeriod,
        emaSlowPeriod: config.emaSlowPeriod,
        rsiPeriod: config.rsiPeriod,
      })
      setResult(res)
      setRunning(false)
    }, 50)
  }, [backtestCandles, rules, config])

  const handleExportCSV = () => {
    if (!result?.trades?.length) return
    const rows = [['Entry Time', 'Exit Time', 'Side', 'Entry', 'Exit', 'Qty', 'PnL', 'PnL %', 'Reason']]
    for (const t of result.trades) {
      rows.push([
        new Date(t.entryTime * 1000).toISOString().slice(0, 19),
        new Date(t.exitTime * 1000).toISOString().slice(0, 19),
        t.side,
        t.entryPrice.toFixed(2),
        t.exitPrice.toFixed(2),
        t.qty.toFixed(4),
        t.pnl.toFixed(2),
        t.pnlPct.toFixed(2),
        t.exitReason,
      ])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `strategy_backtest_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Equity curve chart
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)

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
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !result || result.error) return
    if (seriesRef.current) {
      try { chartRef.current.removeSeries(seriesRef.current) } catch { /* */ }
    }
    const series = chartRef.current.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Equity',
    })
    const data = (result.equityCurve || []).map((v, i) => ({ time: i, value: v }))
    series.setData(data)
    seriesRef.current = series
  }, [result])

  const isProfit = result && result.totalReturnPct > 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
        <BarChart3 size={12} className="text-accent-blue" />
        Strategy Backtest Engine
        <span className="text-gray-700 normal-case ml-1">
          ({backtestCandles.length} candles available)
        </span>
      </div>

      {/* Config */}
      <div className="grid grid-cols-3 gap-1">
        <ConfigInput label="Balance" value={config.initialBalance}
          onChange={v => setConfig(c => ({ ...c, initialBalance: v }))} />
        <ConfigInput label="Fee %" value={config.feePct} step="0.01"
          onChange={v => setConfig(c => ({ ...c, feePct: v }))} />
        <ConfigInput label="Size %" value={config.positionSizePct}
          onChange={v => setConfig(c => ({ ...c, positionSizePct: v }))} />
        <ConfigInput label="EMA Fast" value={config.emaFastPeriod}
          onChange={v => setConfig(c => ({ ...c, emaFastPeriod: v }))} />
        <ConfigInput label="EMA Slow" value={config.emaSlowPeriod}
          onChange={v => setConfig(c => ({ ...c, emaSlowPeriod: v }))} />
        <ConfigInput label="RSI Period" value={config.rsiPeriod}
          onChange={v => setConfig(c => ({ ...c, rsiPeriod: v }))} />
      </div>

      {/* Run button */}
      <div className="flex gap-1">
        <button
          onClick={handleRun}
          disabled={running || backtestCandles.length < 30}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {running ? 'Running...' : 'Run Backtest'}
        </button>
        {result && !result.error && (
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 transition-colors"
            title="Export trades as CSV"
          >
            <Download size={11} /> CSV
          </button>
        )}
      </div>

      {backtestCandles.length < 30 && (
        <div className="text-[9px] text-gray-600 text-center py-1">
          Need at least 30 candles (have {backtestCandles.length}). Wait for data to load.
        </div>
      )}

      {/* Results */}
      {result && !result.error && (
        <div className="space-y-2">
          {/* Summary metrics */}
          <div className="grid grid-cols-4 gap-1">
            <Metric label="Return" value={`${result.totalReturnPct.toFixed(2)}%`}
              color={result.totalReturnPct >= 0 ? 'text-accent-green' : 'text-accent-red'} />
            <Metric label="Trades" value={result.totalTrades} color="text-gray-300" />
            <Metric label="Win Rate" value={`${result.winRate.toFixed(1)}%`} color="text-gray-300" />
            <Metric label="Sharpe" value={result.sharpeRatio.toFixed(2)} color="text-gray-300" />
            <Metric label="Max DD" value={`${result.maxDrawdownPct.toFixed(2)}%`} color="text-accent-red" />
            <Metric label="Profit Factor" value={result.profitFactor.toFixed(2)} color="text-gray-300" />
            <Metric label="Sortino" value={result.sortinoRatio.toFixed(2)} color="text-gray-300" />
            <Metric label="Calmar" value={result.calmarRatio.toFixed(2)} color="text-gray-300" />
            <Metric label="Final Balance" value={`$${result.finalBalance.toFixed(2)}`}
              color={isProfit ? 'text-accent-green' : 'text-accent-red'} />
            <Metric label="Avg Win" value={`$${result.avgWin.toFixed(2)}`} color="text-accent-green" />
            <Metric label="Avg Loss" value={`$${result.avgLoss.toFixed(2)}`} color="text-accent-red" />
            <Metric label="Recovery" value={result.recoveryFactor.toFixed(2)} color="text-gray-300" />
          </div>

          {/* Equity curve */}
          <div className="h-[120px] bg-bg-800 rounded" ref={chartContainerRef} />

          {/* Trade list toggle */}
          <button
            onClick={() => setShowTrades(s => !s)}
            className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showTrades ? 'Hide' : 'Show'} trades ({result.trades.length})
          </button>

          {showTrades && result.trades.length > 0 && (
            <div className="max-h-[150px] overflow-y-auto scrollbar-thin bg-bg-800 rounded p-1">
              <table className="w-full text-[8px] font-mono">
                <thead>
                  <tr className="text-gray-600 border-b border-bg-600">
                    <th className="text-left py-0.5">Side</th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Exit</th>
                    <th className="text-right">PnL</th>
                    <th className="text-right">PnL %</th>
                    <th className="text-right">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-bg-600/30">
                      <td className={`py-0.5 ${t.side === 'LONG' ? 'text-accent-green' : 'text-accent-red'}`}>
                        {t.side === 'LONG' ? <TrendingUp size={8} className="inline" /> : <TrendingDown size={8} className="inline" />} {t.side}
                      </td>
                      <td className="text-right text-gray-400">{t.entryPrice.toFixed(2)}</td>
                      <td className="text-right text-gray-400">{t.exitPrice.toFixed(2)}</td>
                      <td className={`text-right ${t.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                      </td>
                      <td className={`text-right ${t.pnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                      </td>
                      <td className="text-right text-gray-600">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {result?.error && (
        <div className="text-[9px] text-accent-red text-center py-1">{result.error}</div>
      )}
    </div>
  )
}

function ConfigInput({ label, value, onChange, step = '1' }) {
  return (
    <div>
      <label className="text-[8px] text-gray-600 uppercase block mb-0.5">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none focus:border-accent-blue"
      />
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div className="bg-bg-800 rounded p-1">
      <div className="text-[7px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[10px] font-mono font-medium ${color}`}>{value}</div>
    </div>
  )
}
