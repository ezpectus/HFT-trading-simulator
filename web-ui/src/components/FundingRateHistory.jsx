import { useMemo } from 'react'
import { Percent, TrendingUp, TrendingDown, Clock } from 'lucide-react'

export default function FundingRateHistory({ fundingRates, candlesToFunding, symbol, exchange }) {
  const data = useMemo(() => {
    if (!fundingRates || Object.keys(fundingRates).length === 0) return null

    const rates = Object.entries(fundingRates).map(([ex, rate]) => ({
      exchange: ex,
      rate: rate || 0,
      annualized: (rate || 0) * 365 * 3, // 3 funding periods per day
      isPositive: (rate || 0) >= 0,
    }))

    // Sort by rate
    const sorted = [...rates].sort((a, b) => b.rate - a.rate)

    // Consensus
    const avgRate = rates.reduce((s, r) => s + r.rate, 0) / rates.length
    const maxRate = Math.max(...rates.map(r => Math.abs(r.rate)))
    const skew = avgRate >= 0 ? 'Longs pay shorts' : 'Shorts pay longs'

    // Historical simulation: generate pseudo-history from current rate + volatility
    // (since we don't have historical funding data from the backend)
    const history = []
    let currentRate = avgRate
    for (let i = 29; i >= 0; i--) {
      const noise = (Math.sin(i * 0.7) + Math.cos(i * 1.3)) * maxRate * 0.3
      const r = currentRate + noise * (1 - i / 40)
      history.push({ idx: i, rate: r })
      currentRate = r * 0.85 // mean reversion
    }

    // Sparkline
    const minR = Math.min(...history.map(h => h.rate))
    const maxR = Math.max(...history.map(h => h.rate))
    const rRange = maxR - minR || 0.0001
    const toY = (v) => 50 - ((v - (minR + maxR) / 2) / rRange) * 35

    const path = history.map((h, i) => {
      const x = (i / (history.length - 1)) * 100
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${toY(h.rate).toFixed(1)}`
    }).join(' ')

    const zeroY = toY(0)

    return { rates, sorted, avgRate, skew, path, zeroY, candlesToFunding, maxRate }
  }, [fundingRates, candlesToFunding])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Percent size={12} className="text-accent-blue" />
          Funding Rate
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No funding data</div>
      </div>
    )
  }

  const { rates, sorted, avgRate, skew, path, zeroY, candlesToFunding, maxRate } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Percent size={12} className="text-accent-blue" />
        Funding Rate History
      </div>

      {/* Consensus */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Avg Rate</span>
          <div className={'text-sm font-mono font-bold ' + (avgRate >= 0 ? 'text-accent-red' : 'text-accent-green')}>
            {(avgRate * 100).toFixed(4)}%
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Skew</span>
          <div className={'text-[9px] ' + (avgRate >= 0 ? 'text-accent-red' : 'text-accent-green')}>{skew}</div>
        </div>
      </div>

      {/* Per-exchange rates */}
      <div className="space-y-1 mb-2">
        {sorted.map(r => (
          <div key={r.exchange} className="flex items-center gap-1.5 text-[9px]">
            <span className="text-gray-400 w-12">{r.exchange}</span>
            <div className="flex-1 h-2 bg-bg-800 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
              {r.isPositive ? (
                <div className="absolute top-0 bottom-0 left-1/2 bg-accent-red/50 rounded-full"
                  style={{ width: `${(r.rate / maxRate) * 50}%` }} />
              ) : (
                <div className="absolute top-0 bottom-0 right-1/2 bg-accent-green/50 rounded-full"
                  style={{ width: `${(Math.abs(r.rate) / maxRate) * 50}%` }} />
              )}
            </div>
            <span className={'font-mono w-16 text-right ' + (r.isPositive ? 'text-accent-red' : 'text-accent-green')}>
              {(r.rate * 100).toFixed(4)}%
            </span>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div className="text-[8px] text-gray-600 mb-0.5">30-period history (simulated)</div>
      <svg viewBox="0 0 100 100" className="w-full h-[30px]" preserveAspectRatio="none">
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.4" />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.2" />
      </svg>

      {/* Annualized + countdown */}
      <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Annualized</span>
          <span className={'font-mono ' + (avgRate >= 0 ? 'text-accent-red' : 'text-accent-green')}>
            {(avgRate * 365 * 3 * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600 flex items-center gap-0.5">
            <Clock size={7} /> Next
          </span>
          <span className="font-mono text-gray-400">
            {candlesToFunding != null ? `${candlesToFunding} candles` : 'N/A'}
          </span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Positive = longs pay shorts (bearish skew). Funding every 8h typically.
      </div>
    </div>
  )
}
