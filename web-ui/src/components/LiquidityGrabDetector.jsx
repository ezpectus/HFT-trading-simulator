import { useMemo } from 'react'
import { Crosshair, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function LiquidityGrabDetector({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-40)
    if (symCandles.length < 10) return null

    // Find recent swing highs/lows (liquidity pools)
    const swingHighs = []
    const swingLows = []
    for (let i = 2; i < symCandles.length - 2; i++) {
      const c = symCandles[i]
      if (c.high > symCandles[i - 1].high && c.high > symCandles[i - 2].high &&
          c.high > symCandles[i + 1].high && c.high > symCandles[i + 2].high) {
        swingHighs.push({ idx: i, price: c.high })
      }
      if (c.low < symCandles[i - 1].low && c.low < symCandles[i - 2].low &&
          c.low < symCandles[i + 1].low && c.low < symCandles[i + 2].low) {
        swingLows.push({ idx: i, price: c.low })
      }
    }

    // Detect liquidity grabs: price wicks beyond a swing point then closes back inside
    const grabs = []
    for (let i = 5; i < symCandles.length; i++) {
      const c = symCandles[i]

      // Check for buy-side liquidity grab (sweep of swing high)
      for (const sh of swingHighs) {
        if (sh.idx < i && sh.idx >= i - 10) {
          // Wick above swing high but close below
          if (c.high > sh.price && c.close < sh.price) {
            const wickSize = c.high - sh.price
            const grabStrength = (wickSize / sh.price) * 100
            grabs.push({
              idx: i,
              type: 'sell-side-grab',
              label: 'Buy-side liquidity grab',
              sweptLevel: sh.price,
              wickHigh: c.high,
              closePrice: c.close,
              strength: grabStrength,
              direction: 'bearish',
            })
            break
          }
        }
      }

      // Check for sell-side liquidity grab (sweep of swing low)
      for (const sl of swingLows) {
        if (sl.idx < i && sl.idx >= i - 10) {
          // Wick below swing low but close above
          if (c.low < sl.price && c.close > sl.price) {
            const wickSize = sl.price - c.low
            const grabStrength = (wickSize / sl.price) * 100
            grabs.push({
              idx: i,
              type: 'buy-side-grab',
              label: 'Sell-side liquidity grab',
              sweptLevel: sl.price,
              wickLow: c.low,
              closePrice: c.close,
              strength: grabStrength,
              direction: 'bullish',
            })
            break
          }
        }
      }
    }

    if (grabs.length === 0 && swingHighs.length === 0 && swingLows.length === 0) return null

    // Current liquidity levels (untested)
    const lastPrice = symCandles[symCandles.length - 1].close
    const activeHighs = swingHighs.filter(sh => !grabs.some(g => g.sweptLevel === sh.price)).slice(-3)
    const activeLows = swingLows.filter(sl => !grabs.some(g => g.sweptLevel === sl.price)).slice(-3)

    // Nearest liquidity
    const nearestHigh = activeHighs.length > 0 ? activeHighs.reduce((closest, h) =>
      Math.abs(h.price - lastPrice) < Math.abs(closest.price - lastPrice) ? h : closest) : null
    const nearestLow = activeLows.length > 0 ? activeLows.reduce((closest, l) =>
      Math.abs(l.price - lastPrice) < Math.abs(closest.price - lastPrice) ? l : closest) : null

    // Recent grabs
    const recentGrabs = grabs.slice(-4)

    // Chart
    const slice = symCandles.slice(-25)
    const minP = Math.min(...slice.map(c => c.low))
    const maxP = Math.max(...slice.map(c => c.high))
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 80 - 10

    const candleBars = slice.map((c, i) => {
      const x = (i / slice.length) * 100
      const w = 100 / slice.length * 0.7
      const isBull = c.close >= c.open
      return {
        x: x + (100 / slice.length) * 0.15, w,
        bodyY: toY(Math.max(c.open, c.close)),
        bodyH: Math.abs(toY(c.open) - toY(c.close)) || 0.5,
        wickTop: toY(c.high), wickBot: toY(c.low),
        isBull,
      }
    })

    // Liquidity level lines
    const sliceStart = symCandles.length - 25
    const liquidityLines = []
    for (const sh of swingHighs.slice(-3)) {
      const relIdx = sh.idx - sliceStart
      if (relIdx >= 0 && relIdx < slice.length) {
        liquidityLines.push({ y: toY(sh.price), type: 'high', price: sh.price, x: (relIdx / slice.length) * 100 })
      }
    }
    for (const sl of swingLows.slice(-3)) {
      const relIdx = sl.idx - sliceStart
      if (relIdx >= 0 && relIdx < slice.length) {
        liquidityLines.push({ y: toY(sl.price), type: 'low', price: sl.price, x: (relIdx / slice.length) * 100 })
      }
    }

    // Grab markers
    const grabMarkers = recentGrabs.map(g => {
      const relIdx = g.idx - sliceStart
      if (relIdx < 0 || relIdx >= slice.length) return null
      return {
        x: (relIdx / slice.length) * 100,
        y: g.direction === 'bearish' ? toY(g.wickHigh) : toY(g.wickLow),
        direction: g.direction,
      }
    }).filter(Boolean)

    return {
      recentGrabs, activeHighs, activeLows,
      nearestHigh, nearestLow, lastPrice,
      candleBars, liquidityLines, grabMarkers,
      totalGrabs: grabs.length,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Crosshair size={12} className="text-accent-yellow" />
          Liquidity Grabs
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { recentGrabs, activeHighs, activeLows, nearestHigh, nearestLow, lastPrice, candleBars, liquidityLines, grabMarkers, totalGrabs } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Crosshair size={12} className="text-accent-yellow" />
        Liquidity Grab Detector
      </div>

      {/* Nearest liquidity */}
      <div className="grid grid-cols-2 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Nearest High</span>
          {nearestHigh ? (
            <div className="font-mono text-accent-red">{formatPrice(nearestHigh.price)}
              <span className="text-gray-600 ml-1">({((nearestHigh.price - lastPrice) / lastPrice * 100).toFixed(2)}%)</span>
            </div>
          ) : <div className="text-gray-700">—</div>}
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Nearest Low</span>
          {nearestLow ? (
            <div className="font-mono text-accent-green">{formatPrice(nearestLow.price)}
              <span className="text-gray-600 ml-1">({((nearestLow.price - lastPrice) / lastPrice * 100).toFixed(2)}%)</span>
            </div>
          ) : <div className="text-gray-700">—</div>}
        </div>
      </div>

      {/* Chart with liquidity levels */}
      <svg viewBox="0 0 100 100" className="w-full h-[45px]" preserveAspectRatio="none">
        {/* Liquidity lines */}
        {liquidityLines.map((l, i) => (
          <line key={'l' + i} x1={l.x} y1={l.y} x2="100" y2={l.y}
            stroke={l.type === 'high' ? '#ef4444' : '#22c55e'} strokeWidth="0.3" strokeDasharray="1 2" opacity="0.4" />
        ))}
        {/* Candles */}
        {candleBars.map((b, i) => (
          <g key={i}>
            <line x1={b.x + b.w / 2} y1={b.wickTop} x2={b.x + b.w / 2} y2={b.wickBot}
              stroke={b.isBull ? '#22c55e' : '#ef4444'} strokeWidth="0.3" />
            <rect x={b.x} y={b.bodyY} width={b.w} height={b.bodyH}
              fill={b.isBull ? '#22c55e' : '#ef4444'} fillOpacity="0.5" />
          </g>
        ))}
        {/* Grab markers */}
        {grabMarkers.map((m, i) => (
          <g key={'g' + i}>
            <circle cx={m.x} cy={m.y} r="1.5" fill={m.direction === 'bullish' ? '#22c55e' : '#ef4444'} />
            <text x={m.x + 2} y={m.y + 1} fontSize="2.5" fill={m.direction === 'bullish' ? '#22c55e' : '#ef4444'}>
              GRAB
            </text>
          </g>
        ))}
      </svg>

      {/* Recent grabs */}
      {recentGrabs.length > 0 && (
        <div className="mt-2">
          <div className="text-[8px] text-gray-600 mb-1">Recent grabs ({totalGrabs} total):</div>
          <div className="space-y-0.5">
            {recentGrabs.map((g, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                {g.direction === 'bullish' ? (
                  <TrendingUp size={8} className="text-accent-green shrink-0" />
                ) : (
                  <TrendingDown size={8} className="text-accent-red shrink-0" />
                )}
                <span className={g.direction === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>
                  {g.label}
                </span>
                <span className="text-gray-500 ml-auto">str: {g.strength.toFixed(3)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning */}
      {recentGrabs.length > 0 && recentGrabs[recentGrabs.length - 1].direction === 'bullish' && (
        <div className="mt-1.5 bg-accent-green/10 border border-accent-green/20 rounded px-1.5 py-0.5 flex items-center gap-1">
          <AlertTriangle size={9} className="text-accent-green shrink-0" />
          <span className="text-[8px] text-accent-green">Recent sell-side grab = potential long entry</span>
        </div>
      )}
      {recentGrabs.length > 0 && recentGrabs[recentGrabs.length - 1].direction === 'bearish' && (
        <div className="mt-1.5 bg-accent-red/10 border border-accent-red/20 rounded px-1.5 py-0.5 flex items-center gap-1">
          <AlertTriangle size={9} className="text-accent-red shrink-0" />
          <span className="text-[8px] text-accent-red">Recent buy-side grab = potential short entry</span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Stop hunts: price sweeps liquidity pool then reverses. Watch for wick rejections at key levels.
      </div>
    </div>
  )
}
