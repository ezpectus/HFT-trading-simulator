import { useMemo } from 'react'
import { Eye, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function OpenInterestTracker({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 10) return null

    // Estimate open interest from fill flow
    // OI increases when new positions open, decreases when they close
    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && f.exchange === exchange && f.status === 'FILLED')
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Simulate OI from candle volume (proxy: cumulative volume * retention factor)
    let oi = 0
    const oiSeries = []
    for (const c of symCandles) {
      // New OI from volume (assume ~30% of volume opens new positions)
      const newOI = (c.volume || 0) * 0.3
      // Close OI (assume ~25% of volume closes existing)
      const closeOI = (c.volume || 0) * 0.25
      oi += newOI - closeOI
      oiSeries.push({ time: c.time, oi: Math.max(0, oi), volume: c.volume, close: c.close })
    }

    if (oiSeries.length < 5) return null

    // Price-OI divergence detection
    const recent = oiSeries.slice(-10)
    const older = oiSeries.slice(-20, -10)
    const recentOITrend = recent[recent.length - 1].oi - recent[0].oi
    const recentPriceTrend = recent[recent.length - 1].close - recent[0].close
    const olderOITrend = older.length > 0 ? older[older.length - 1].oi - older[0].oi : 0

    // Divergence: price up + OI down = weakening (short covering)
    // Price down + OI up = strengthening (new shorts entering)
    let divergence = null
    let divergenceColor = 'text-gray-400'
    if (recentPriceTrend > 0 && recentOITrend < 0) {
      divergence = 'Bearish: Price up, OI down (short covering)'
      divergenceColor = 'text-accent-red'
    } else if (recentPriceTrend < 0 && recentOITrend > 0) {
      divergence = 'Bearish: Price down, OI up (new shorts)'
      divergenceColor = 'text-accent-red'
    } else if (recentPriceTrend > 0 && recentOITrend > 0) {
      divergence = 'Bullish: Price up, OI up (new longs)'
      divergenceColor = 'text-accent-green'
    } else if (recentPriceTrend < 0 && recentOITrend < 0) {
      divergence = 'Bullish: Price down, OI down (long unwinding)'
      divergenceColor = 'text-accent-green'
    }

    // OI change rate
    const lastOI = oiSeries[oiSeries.length - 1].oi
    const firstOI = oiSeries[0].oi
    const oiChange = firstOI > 0 ? ((lastOI - firstOI) / firstOI) * 100 : 0

    // Chart
    const oiSlice = oiSeries.slice(-30)
    const minOI = Math.min(...oiSlice.map(s => s.oi))
    const maxOI = Math.max(...oiSlice.map(s => s.oi))
    const oiRange = maxOI - minOI || 1
    const toOY = (v) => 100 - ((v - minOI) / oiRange) * 80 - 10

    const prices = oiSlice.map(s => s.close)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const pRange = maxP - minP || 1
    const toPY = (v) => 100 - ((v - minP) / pRange) * 80 - 10

    const oiPath = oiSlice.map((s, i) => `${i === 0 ? 'M' : 'L'} ${((i / (oiSlice.length - 1)) * 100).toFixed(1)} ${toOY(s.oi).toFixed(1)}`).join(' ')
    const pricePath = oiSlice.map((s, i) => `${i === 0 ? 'M' : 'L'} ${((i / (oiSlice.length - 1)) * 100).toFixed(1)} ${toPY(s.close).toFixed(1)}`).join(' ')

    // Volume bars
    const maxVol = Math.max(...oiSlice.map(s => s.volume || 0)) || 1
    const volBars = oiSlice.map((s, i) => ({
      x: (i / (oiSlice.length - 1)) * 100,
      h: ((s.volume || 0) / maxVol) * 15,
      isUp: i === 0 || s.close >= oiSlice[i - 1].close,
    }))

    return {
      lastOI, oiChange, divergence, divergenceColor,
      oiPath, pricePath, volBars,
      recentOITrend, recentPriceTrend,
    }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Eye size={12} className="text-accent-teal" />
          Open Interest
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { lastOI, oiChange, divergence, divergenceColor, oiPath, pricePath, volBars } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Eye size={12} className="text-accent-teal" />
        Open Interest Tracker
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Est. OI</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatVolume(lastOI)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Change</span>
          <div className={'text-[10px] font-mono ' + (oiChange >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {oiChange >= 0 ? '+' : ''}{oiChange.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* OI + Price chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[45px]" preserveAspectRatio="none">
        {/* Volume bars at bottom */}
        {volBars.map((b, i) => (
          <rect key={i} x={b.x - 0.5} y={100 - b.h} width="1.5" height={b.h}
            fill={b.isUp ? '#22c55e' : '#ef4444'} fillOpacity="0.15" />
        ))}
        {/* OI line (teal) */}
        <path d={oiPath} fill="none" stroke="#14b8a6" strokeWidth="1.2" />
        {/* Price line (gray) */}
        <path d={pricePath} fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="1 1" />
      </svg>

      <div className="flex items-center justify-between mt-0.5 text-[7px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 bg-accent-teal" />
          <span className="text-gray-600">OI</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 bg-gray-400" style={{ borderTop: '1px dashed' }} />
          <span className="text-gray-600">Price</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-accent-green/30" />
          <span className="text-gray-600">Vol</span>
        </div>
      </div>

      {/* Divergence signal */}
      {divergence && (
        <div className="mt-2 bg-bg-800 rounded px-1.5 py-1">
          <div className="flex items-center gap-1">
            <Activity size={9} className={divergenceColor} />
            <span className={'text-[8px] font-medium ' + divergenceColor}>{divergence}</span>
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        OI estimated from volume flow. Price+OI up = trend confirmation. Divergence = reversal risk.
      </div>
    </div>
  )
}
