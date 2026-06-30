import { useMemo } from 'react'
import { LineChart, TrendingUp, TrendingDown } from 'lucide-react'
import { formatUsd } from '../utils/format'

export default function PnLAttributionChart({ accounts }) {
  const chartData = useMemo(() => {
    // Collect all trades sorted by close time
    const allTrades = []
    for (const [exId, acc] of Object.entries(accounts || {})) {
      for (const t of (acc.trade_history || [])) {
        allTrades.push({ ...t, exchange: exId })
      }
    }
    allTrades.sort((a, b) => (a.closed_at || a.timestamp || 0) - (b.closed_at || b.timestamp || 0))

    if (allTrades.length < 3) return null

    // Build cumulative PnL per symbol over time
    const symbols = [...new Set(allTrades.map(t => t.symbol))]
    const cumBySymbol = {}
    for (const s of symbols) cumBySymbol[s] = []

    let totalCum = 0
    const totalLine = []
    const points = []

    for (const t of allTrades) {
      const pnl = t.pnl || 0
      totalCum += pnl

      for (const s of symbols) {
        const prev = cumBySymbol[s].length > 0 ? cumBySymbol[s][cumBySymbol[s].length - 1] : 0
        cumBySymbol[s].push(s === t.symbol ? prev + pnl : prev)
      }

      totalLine.push(totalCum)
      points.push({
        time: t.closed_at || t.timestamp,
        total: totalCum,
        symbol: t.symbol,
        pnl,
        perSymbol: symbols.map(s => ({ symbol: s, cum: cumBySymbol[s][cumBySymbol[s].length - 1] })),
      })
    }

    // SVG dimensions
    const W = 100, H = 40
    const allValues = [...totalLine, ...symbols.flatMap(s => cumBySymbol[s])]
    const minV = Math.min(...allValues, 0)
    const maxV = Math.max(...allValues, 0)
    const range = maxV - minV || 1
    const xScale = (i) => (i / (points.length - 1)) * W
    const yScale = (v) => H - ((v - minV) / range) * H
    const zeroY = yScale(0)

    // Build paths
    const totalPath = totalLine.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')

    const symbolPaths = {}
    const symbolColors = { 'BTC/USDT': '#f7931a', 'ETH/USDT': '#627eea', 'SOL/USDT': '#9945ff' }
    for (const s of symbols) {
      symbolPaths[s] = cumBySymbol[s].map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')
    }

    // Latest attribution
    const latest = points[points.length - 1]
    const attribution = latest.perSymbol
      .sort((a, b) => Math.abs(b.cum) - Math.abs(a.cum))

    // Top contributor
    const topContributor = attribution[0]

    return {
      totalPath,
      symbolPaths,
      symbolColors,
      zeroY,
      W, H,
      totalCum,
      attribution,
      topContributor,
      tradeCount: allTrades.length,
      symbols,
    }
  }, [accounts])

  if (!chartData) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <LineChart size={12} className="text-accent-green" />
          P&L Attribution Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 3+ closed trades</div>
      </div>
    )
  }

  const { totalPath, symbolPaths, symbolColors, zeroY, W, H, totalCum, attribution, topContributor, tradeCount, symbols } = chartData

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <LineChart size={12} className="text-accent-green" />
        P&L Attribution Over Time
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[60px]" preserveAspectRatio="none">
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#3b82f6" strokeWidth="0.3" strokeDasharray="1" />
        {/* Per-symbol lines */}
        {symbols.map(s => (
          <path key={s} d={symbolPaths[s]} fill="none" stroke={symbolColors[s] || '#888'} strokeWidth="0.5" opacity="0.7" />
        ))}
        {/* Total line */}
        <path d={totalPath} fill="none" stroke={totalCum >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1" />
      </svg>

      {/* Total + top contributor */}
      <div className="flex items-center justify-between mt-2 mb-1">
        <div>
          <span className="text-[8px] text-gray-600">Total Cum PnL</span>
          <div className={'text-sm font-mono font-bold ' + (totalCum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {totalCum >= 0 ? '+' : ''}{formatUsd(totalCum)}
          </div>
        </div>
        {topContributor && (
          <div className="text-right">
            <span className="text-[8px] text-gray-600">Top Contributor</span>
            <div className={'text-[10px] font-mono ' + (topContributor.cum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {topContributor.symbol.split('/')[0]} {topContributor.cum >= 0 ? '+' : ''}{formatUsd(topContributor.cum, 0)}
            </div>
          </div>
        )}
      </div>

      {/* Attribution breakdown */}
      <div className="space-y-0.5">
        {attribution.map(a => (
          <div key={a.symbol} className="flex items-center gap-1.5 text-[8px]">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: symbolColors[a.symbol] || '#888' }} />
            <span className="text-gray-400 w-10">{a.symbol.split('/')[0]}</span>
            <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden relative">
              <div
                className={'absolute h-full rounded-full ' + (a.cum >= 0 ? 'bg-accent-green/60 left-1/2' : 'bg-accent-red/60 right-1/2')}
                style={{ width: `${Math.min(50, Math.abs(a.cum) / (Math.abs(totalCum) || 1) * 50)}%` }}
              />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-bg-500" />
            </div>
            <span className={'font-mono w-12 text-right ' + (a.cum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {a.cum >= 0 ? '+' : ''}{formatUsd(a.cum, 0)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Cumulative PnL per symbol over {tradeCount} trades. Colored lines = per-symbol, bold line = total.
      </div>
    </div>
  )
}
