import { useMemo } from 'react'
import { Activity, TrendingUp, TrendingDown } from 'lucide-react'

export default function CumulativeVolumeDelta({ candles, symbol, exchange }) {
  const cvdData = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)

    if (symCandles.length < 5) return null

    let cumDelta = 0
    const points = []
    let buyVol = 0, sellVol = 0

    for (const c of symCandles) {
      // Estimate buy/sell volume from candle direction
      const totalVol = c.volume || 0
      const isBullish = c.close >= c.open
      const bodyRatio = c.high > c.low ? Math.abs(c.close - c.open) / (c.high - c.low) : 0

      // Split volume: bullish candle → more buy vol, bearish → more sell vol
      const buyPct = isBullish ? 0.5 + bodyRatio * 0.3 : 0.5 - bodyRatio * 0.3
      const candleBuy = totalVol * buyPct
      const candleSell = totalVol * (1 - buyPct)

      buyVol += candleBuy
      sellVol += candleSell
      cumDelta += candleBuy - candleSell

      points.push({
        time: c.time,
        delta: candleBuy - candleSell,
        cumDelta,
        price: c.close,
        volume: totalVol,
      })
    }

    // Recent delta (last 10 candles)
    const recent = points.slice(-10)
    const recentDelta = recent.reduce((s, p) => s + p.delta, 0)

    // Detect divergence: price up but CVD down (or vice versa)
    const firstPrice = points[0].price
    const lastPrice = points[points.length - 1].price
    const firstCVD = points[0].cumDelta
    const lastCVD = points[points.length - 1].cumDelta
    const priceUp = lastPrice > firstPrice
    const cvdUp = lastCVD > firstCVD
    const divergence = (priceUp && !cvdUp) || (!priceUp && cvdUp)

    return {
      points,
      cumDelta,
      buyVol,
      sellVol,
      recentDelta,
      divergence,
      priceUp,
      cvdUp,
    }
  }, [candles, symbol, exchange])

  if (!cvdData) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Activity size={12} className="text-accent-blue" />
          Cumulative Volume Delta
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { points, cumDelta, buyVol, sellVol, recentDelta, divergence, priceUp, cvdUp } = cvdData

  // SVG sparkline
  const W = 100, H = 30
  const cvds = points.map(p => p.cumDelta)
  const minCVD = Math.min(...cvds, 0)
  const maxCVD = Math.max(...cvds, 0)
  const range = maxCVD - minCVD || 1
  const xScale = (i) => (i / (points.length - 1)) * W
  const yScale = (v) => H - ((v - minCVD) / range) * H
  const zeroY = yScale(0)

  const cvdPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.cumDelta)}`).join(' ')
  const cvdArea = `${cvdPath} L ${W} ${zeroY} L 0 ${zeroY} Z`

  const buyPct = buyVol / (buyVol + sellVol) * 100
  const sellPct = 100 - buyPct

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Activity size={12} className="text-accent-blue" />
        Cumulative Volume Delta
      </div>

      {/* Divergence warning */}
      {divergence && (
        <div className="flex items-center gap-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-2 py-1 mb-2">
          <span className="text-[9px] text-accent-yellow font-medium">⚠ DIVERGENCE</span>
          <span className="text-[8px] text-gray-500">
            Price {priceUp ? '↑' : '↓'} but CVD {cvdUp ? '↑' : '↓'}
          </span>
        </div>
      )}

      {/* CVD Sparkline */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[40px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cvdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cumDelta >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={cumDelta >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#3b82f6" strokeWidth="0.3" strokeDasharray="1" />
        <path d={cvdArea} fill="url(#cvdGrad)" />
        <path d={cvdPath} fill="none" stroke={cumDelta >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="0.8" />
      </svg>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-2 text-[9px]">
        <div>
          <div className="text-gray-600">CVD</div>
          <div className={'font-mono ' + (cumDelta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {cumDelta >= 0 ? '+' : ''}{cumDelta.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Recent Δ</div>
          <div className={'font-mono ' + (recentDelta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {recentDelta >= 0 ? '+' : ''}{recentDelta.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-gray-600">B/S Ratio</div>
          <div className="font-mono text-gray-300">
            {buyPct.toFixed(0)}/{sellPct.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Buy/Sell bar */}
      <div className="mt-1.5">
        <div className="flex h-2 rounded-sm overflow-hidden">
          <div className="bg-accent-green/60" style={{ width: `${buyPct}%` }} />
          <div className="bg-accent-red/60" style={{ width: `${sellPct}%` }} />
        </div>
        <div className="flex justify-between text-[7px] text-gray-600 mt-0.5">
          <span className="text-accent-green">Buy {buyVol.toFixed(2)}</span>
          <span className="text-accent-red">Sell {sellVol.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
