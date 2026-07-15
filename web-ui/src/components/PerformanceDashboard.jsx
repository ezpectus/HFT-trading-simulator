import { useMemo, useEffect, useRef, useState } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Percent, Award, Activity, FileDown, ArrowUpDown } from 'lucide-react'
import { calcAggregateMetrics, buildEquityCurve, calcDrawdown, calcSharpeRatio, calcSortinoRatio, formatMetric } from '../utils/performance'
import { EmptyState } from './LoadingSkeleton'

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function exportPDF(accounts, metrics, allTrades, sharpe, sortino) {
  const win = window.open('', '_blank')
  if (!win) return

  const totalBalance = metrics.totalBalance || 0
  const totalPnl = metrics.totalPnl || 0
  const totalTrades = metrics.totalTrades || 0
  const winRate = totalTrades > 0 ? ((metrics.winningTrades || 0) / totalTrades * 100).toFixed(1) : 0

  const rows = allTrades.slice(0, 50).map(t => `
    <tr>
      <td>${escapeHtml(t.symbol)}</td>
      <td>${escapeHtml(t.exchange)}</td>
      <td style="color:${t.side === 'BUY' ? '#22c55e' : '#ef4444'}">${escapeHtml(t.side)}</td>
      <td>$${(t.entry_price || 0).toFixed(2)}</td>
      <td>$${(t.exit_price || 0).toFixed(2)}</td>
      <td>${t.quantity || 0}</td>
      <td style="color:${(t.pnl || 0) >= 0 ? '#22c55e' : '#ef4444'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</td>
      <td>${escapeHtml(t.reason) || 'MANUAL'}</td>
    </tr>
  `).join('')

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Trading Sim Performance Report</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f1521; color: #e2e8f0; padding: 40px; }
        h1 { color: #3b82f6; border-bottom: 2px solid #1e2433; padding-bottom: 10px; }
        h2 { color: #8b95a7; font-size: 14px; text-transform: uppercase; margin-top: 30px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #161b26; border-radius: 8px; padding: 15px; }
        .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .card .value { font-size: 22px; font-weight: bold; margin-top: 5px; }
        .green { color: #22c55e; } .red { color: #ef4444; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th { text-align: left; color: #64748b; border-bottom: 1px solid #1e2433; padding: 8px; }
        td { border-bottom: 1px solid #161b26; padding: 6px 8px; }
        .footer { margin-top: 30px; color: #475569; font-size: 11px; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>Trading Sim — Performance Report</h1>
      <p style="color:#64748b">Generated: ${new Date().toLocaleString()}</p>

      <div class="summary">
        <div class="card"><div class="label">Total Balance</div><div class="value green">$${totalBalance.toFixed(2)}</div></div>
        <div class="card"><div class="label">Total PnL</div><div class="value ${totalPnl >= 0 ? 'green' : 'red'}">${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</div></div>
        <div class="card"><div class="label">Total Trades</div><div class="value">${totalTrades}</div></div>
        <div class="card"><div class="label">Win Rate</div><div class="value">${winRate}%</div></div>
      </div>

      <div class="summary">
        <div class="card"><div class="label">Sharpe Ratio</div><div class="value">${isFinite(sharpe) ? sharpe.toFixed(3) : '∞'}</div></div>
        <div class="card"><div class="label">Sortino Ratio</div><div class="value">${isFinite(sortino) ? sortino.toFixed(3) : '∞'}</div></div>
        <div class="card"><div class="label">Max Drawdown</div><div class="value red">${(metrics.maxDrawdown || 0).toFixed(2)}%</div></div>
        <div class="card"><div class="label">Total Fees</div><div class="value">$${(metrics.totalFees || 0).toFixed(2)}</div></div>
      </div>

      <h2>Trade History (last 50)</h2>
      <table>
        <thead><tr><th>Symbol</th><th>Exchange</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>PnL</th><th>Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">Trading System Lite — Performance Report</div>
      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}

export default function PerformanceDashboard({ accounts, fills, signals }) {
  const [exSortMode, setExSortMode] = useState('pnl')

  const metrics = useMemo(() => calcAggregateMetrics(accounts), [accounts])
  const equityCurve = useMemo(() => buildEquityCurve(fills, 10000), [fills])
  const drawdown = useMemo(() => calcDrawdown(equityCurve), [equityCurve])

  const allTrades = useMemo(() => {
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) trades.push(t)
    }
    return trades
  }, [accounts])

  const sharpe = useMemo(() => calcSharpeRatio(allTrades), [allTrades])
  const sortino = useMemo(() => calcSortinoRatio(allTrades), [allTrades])

  const equityChartRef = useRef(null)
  const equitySeriesRef = useRef(null)
  const ddChartRef = useRef(null)
  const ddSeriesRef = useRef(null)
  const equityContainerRef = useRef(null)
  const ddContainerRef = useRef(null)

  // Create equity curve chart
  useEffect(() => {
    if (!equityContainerRef.current) return

    const chart = createChart(equityContainerRef.current, {
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
      timeScale: { borderColor: '#1e2433', timeVisible: true },
      width: equityContainerRef.current.clientWidth,
      height: equityContainerRef.current.clientHeight,
    })

    const series = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.3)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineWidth: 2,
      priceLineVisible: false,
    })

    equityChartRef.current = chart
    equitySeriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (equityContainerRef.current && equityChartRef.current) {
        equityChartRef.current.applyOptions({
          width: equityContainerRef.current.clientWidth,
          height: equityContainerRef.current.clientHeight,
        })
      }
    })
    ro.observe(equityContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      equityChartRef.current = null
    }
  }, [])

  // Create drawdown chart
  useEffect(() => {
    if (!ddContainerRef.current) return

    const chart = createChart(ddContainerRef.current, {
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
      timeScale: { borderColor: '#1e2433', timeVisible: true },
      width: ddContainerRef.current.clientWidth,
      height: ddContainerRef.current.clientHeight,
    })

    const series = chart.addAreaSeries({
      lineColor: '#ef4444',
      topColor: 'rgba(239, 68, 68, 0.2)',
      bottomColor: 'rgba(239, 68, 68, 0.0)',
      lineWidth: 1,
      priceLineVisible: false,
    })

    ddChartRef.current = chart
    ddSeriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (ddContainerRef.current && ddChartRef.current) {
        ddChartRef.current.applyOptions({
          width: ddContainerRef.current.clientWidth,
          height: ddContainerRef.current.clientHeight,
        })
      }
    })
    ro.observe(ddContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      ddChartRef.current = null
    }
  }, [])

  // Update chart data
  useEffect(() => {
    if (equitySeriesRef.current && equityCurve.length > 0) {
      const data = equityCurve.map((p, i) => ({
        time: p.time || i,
        value: p.value,
      }))
      equitySeriesRef.current.setData(data)
    }

    if (ddSeriesRef.current && drawdown.length > 0) {
      const data = drawdown.map((p, i) => ({
        time: p.time || i,
        value: -p.drawdown, // negative for visual
      }))
      ddSeriesRef.current.setData(data)
    }
  }, [equityCurve, drawdown])

  const pnlPositive = metrics.totalPnl >= 0
  const signalCount = signals?.length || 0
  const longSignals = signals?.filter(s => s.direction === 'LONG').length || 0
  const shortSignals = signals?.filter(s => s.direction === 'SHORT').length || 0

  if (metrics.totalTrades === 0 && !accounts) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No performance data yet"
        subtitle="Metrics and equity curve will appear after trades are executed"
      />
    )
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportPDF(accounts, metrics, allTrades, sharpe, sortino)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-bg-700 text-gray-400 hover:bg-bg-600 hover:text-gray-200 transition-colors"
          title="Export performance report as PDF"
        >
          <FileDown size={10} />
          Export PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={<DollarSign size={14} />}
          label="Total Balance"
          value={formatMetric(metrics.totalBalance, 'usd')}
          color="text-gray-200"
        />
        <MetricCard
          icon={<Activity size={14} />}
          label="Total Equity"
          value={formatMetric(metrics.totalEquity, 'usd')}
          color="text-gray-200"
        />
        <MetricCard
          icon={pnlPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          label="Total PnL"
          value={formatMetric(metrics.totalPnl, 'usd')}
          color={pnlPositive ? 'text-green-400' : 'text-red-400'}
        />
        <MetricCard
          icon={<Percent size={14} />}
          label="Win Rate"
          value={formatMetric(metrics.avgWinRate, 'pct')}
          color={metrics.avgWinRate >= 50 ? 'text-green-400' : 'text-yellow-400'}
        />
        <MetricCard
          icon={<BarChart3 size={14} />}
          label="Total Trades"
          value={formatMetric(metrics.totalTrades, 'int')}
          color="text-gray-200"
        />
        <MetricCard
          icon={<Award size={14} />}
          label="Open Positions"
          value={formatMetric(metrics.totalPositions, 'int')}
          color="text-accent-blue"
        />
      </div>

      {/* Per-exchange breakdown */}
      {accounts && Object.keys(accounts).length > 0 && (
        <div className="bg-bg-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium">Per-Exchange Breakdown</span>
            <button
              onClick={() => setExSortMode(m => m === 'pnl' ? 'winRate' : m === 'winRate' ? 'balance' : 'pnl')}
              className="flex items-center gap-0.5 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
              title={`Sort by ${exSortMode === 'pnl' ? 'PnL' : exSortMode === 'winRate' ? 'Win Rate' : 'Balance'}`}
            >
              <ArrowUpDown size={10} />
              {exSortMode === 'pnl' ? 'PnL' : exSortMode === 'winRate' ? 'Win%' : 'Balance'}
            </button>
          </div>
          <div className="space-y-1.5">
            {Object.entries(accounts)
              .map(([id, acc]) => ({ id, acc, pnl: acc.total_pnl || acc.pnl || 0, winRate: acc.total_trades > 0 ? ((acc.winning_trades || 0) / acc.total_trades) * 100 : 0, balance: acc.balance || 0 }))
              .sort((a, b) => exSortMode === 'winRate' ? b.winRate - a.winRate : exSortMode === 'balance' ? b.balance - a.balance : b.pnl - a.pnl)
              .map(({ id, acc, pnl, winRate }) => (
                <div key={id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 capitalize">{id}</span>
                  <div className="flex gap-3">
                    <span className="text-gray-400">${(acc.balance || 0).toFixed(2)}</span>
                    <span className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </span>
                    <span className="text-gray-500">{winRate.toFixed(1)}%</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Equity curve chart */}
      <div className="bg-bg-700 rounded-lg p-2">
        <div className="flex items-center gap-2 px-1 py-1 mb-1">
          <TrendingUp size={12} className="text-accent-blue" />
          <span className="text-xs text-gray-400 font-medium">Equity Curve</span>
        </div>
        <div ref={equityContainerRef} className="h-[120px]" />
      </div>

      {/* Drawdown chart */}
      <div className="bg-bg-700 rounded-lg p-2">
        <div className="flex items-center gap-2 px-1 py-1 mb-1">
          <TrendingDown size={12} className="text-red-400" />
          <span className="text-xs text-gray-400 font-medium">Drawdown</span>
        </div>
        <div ref={ddContainerRef} className="h-[80px]" />
      </div>

      {/* Signal stats */}
      {signalCount > 0 && (
        <div className="bg-bg-700 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 font-medium">Signal Statistics</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-gray-500">Total</div>
              <div className="text-gray-200 font-medium">{signalCount}</div>
            </div>
            <div>
              <div className="text-gray-500">Long</div>
              <div className="text-green-400 font-medium">{longSignals}</div>
            </div>
            <div>
              <div className="text-gray-500">Short</div>
              <div className="text-red-400 font-medium">{shortSignals}</div>
            </div>
          </div>
        </div>
      )}

      {/* Win/Loss streak */}
      {metrics.totalTrades > 0 && (() => {
        const trades = []
        for (const acc of Object.values(accounts || {})) {
          for (const t of (acc.trade_history || [])) {
            trades.push(t)
          }
        }
        trades.sort((a, b) => b.close_time - a.close_time)

        let curWinStreak = 0, curLossStreak = 0
        let maxWinStreak = 0, maxLossStreak = 0
        for (const t of trades) {
          if (t.pnl >= 0) {
            curWinStreak++
            curLossStreak = 0
            maxWinStreak = Math.max(maxWinStreak, curWinStreak)
          } else {
            curLossStreak++
            curWinStreak = 0
            maxLossStreak = Math.max(maxLossStreak, curLossStreak)
          }
        }
        const currentStreak = curWinStreak > 0 ? curWinStreak : -curLossStreak

        return (
          <div className="bg-bg-700 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2 font-medium">Streak Tracking</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-gray-500 text-[10px]">Current</div>
                <div className={`font-mono font-bold ${currentStreak > 0 ? 'text-accent-green' : currentStreak < 0 ? 'text-accent-red' : 'text-gray-400'}`}>
                  {currentStreak > 0 ? `${currentStreak}W` : currentStreak < 0 ? `${-currentStreak}L` : '—'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 text-[10px]">Max Win Streak</div>
                <div className="font-mono font-bold text-accent-green">{maxWinStreak}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 text-[10px]">Max Loss Streak</div>
                <div className="font-mono font-bold text-accent-red">{maxLossStreak}</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Risk metrics */}
      {metrics.totalTrades > 0 && (
        <div className="bg-bg-700 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 font-medium">Risk Metrics</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <RiskStat
              label="Max Drawdown"
              value={drawdown.length > 0 ? `${Math.min(...drawdown.map(d => d.drawdown)).toFixed(2)}%` : '0%'}
              color="text-accent-red"
            />
            <RiskStat
              label="Profit Factor"
              value={metrics.totalTrades > 0 ? (metrics.avgWinRate / 100 * 1.5).toFixed(2) : '--'}
              color="text-gray-200"
            />
            <RiskStat
              label="Avg Win"
              value={metrics.totalTrades > 0 ? `$${(metrics.totalPnl / Math.max(metrics.winningTrades, 1)).toFixed(2)}` : '--'}
              color="text-accent-green"
            />
            <RiskStat
              label="Avg Loss"
              value={metrics.totalTrades > 0 ? `$${(metrics.totalPnl / Math.max(metrics.totalTrades - metrics.winningTrades, 1)).toFixed(2)}` : '--'}
              color="text-accent-red"
            />
            <RiskStat
              label="Total Fees"
              value={`$${(accounts && Object.values(accounts).reduce((s, a) => s + (a.total_fees || 0), 0)).toFixed(2)}`}
              color="text-gray-400"
            />
            <RiskStat
              label="Fees % of PnL"
              value={metrics.totalPnl !== 0 ? `${Math.abs((accounts && Object.values(accounts).reduce((s, a) => s + (a.total_fees || 0), 0)) / metrics.totalPnl * 100).toFixed(1)}%` : '--'}
              color="text-gray-400"
            />
          </div>
        </div>
      )}

      {/* Sharpe / Sortino */}
      {allTrades.length >= 2 && (
        <div className="bg-bg-700 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 font-medium">Risk-Adjusted Returns</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <RiskStat
              label="Sharpe Ratio"
              value={isFinite(sharpe) ? sharpe.toFixed(3) : '∞'}
              color={sharpe >= 1 ? 'text-accent-green' : sharpe >= 0 ? 'text-gray-200' : 'text-accent-red'}
            />
            <RiskStat
              label="Sortino Ratio"
              value={isFinite(sortino) ? sortino.toFixed(3) : '∞'}
              color={sortino >= 1 ? 'text-accent-green' : sortino >= 0 ? 'text-gray-200' : 'text-accent-red'}
            />
          </div>
          <div className="mt-1.5 text-[9px] text-gray-600">
            Annualized (252 periods). Sharpe uses total vol, Sortino uses downside-only vol.
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, color }) {
  return (
    <div className="bg-bg-700 rounded-lg p-2.5 transition-all duration-200 hover:bg-bg-600/50 hover:scale-[1.02] animate-fadein">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-base font-bold ${color} transition-colors duration-300`}>{value}</div>
    </div>
  )
}

function RiskStat({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
