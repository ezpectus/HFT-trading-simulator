import { useMemo } from 'react'
import { Hash, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function TickChart({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 5) return null

    // Treat each candle close as a tick
    const ticks = symCandles.map((c, i) => ({
      idx: i,
      price: c.close,
      volume: c.volume || 0,
      time: c.time || c.timestamp || 0,
      high: c.high,
      low: c.low,
    }))

    // Color ticks by direction
    const tickData = ticks.map((t, i) => ({
      ...t,
      dir: i > 0 ? (t.price > ticks[i - 1].price ? 'up' : t.price < ticks[i - 1].price ? 'down' : 'flat') : 'up',
    }))

    // Up/down counts
    const upCount = tickData.filter(t => t.dir === 'up').length
    const downCount = tickData.filter(t => t.dir === 'down').length

    // Cumulative volume delta
    let cvd = 0
    const cvdSeries = tickData.map(t => {
      cvd += t.dir === 'up' ? t.volume : -t.volume
      return cvd
    })

    // Price line
    const prices = tickData.map(t => t.price)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 85 - 7.5

    const pricePath = prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${((i / (prices.length - 1)) * 100).toFixed(1)} ${toY(p).toFixed(1)}`).join(' ')

    // CVD line (normalized)
    const cvdMin = Math.min(...cvdSeries)
    const cvdMax = Math.max(...cvdSeries)
    const cvdRange = cvdMax - cvdMin || 1
    const cvdToY = (v) => 100 - ((v - cvdMin) / cvdRange) * 85 - 7.5
    const cvdPath = cvdSeries.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (cvdSeries.length - 1)) * 100).toFixed(1)} ${cvdToY(v).toFixed(1)}`).join(' ')

    // Tick dots
    const dots = tickData.map((t, i) => ({
      x: (i / (tickData.length - 1)) * 100,
      y: toY(t.price),
      dir: t.dir,
    }))

    // Momentum: last N ticks
    const last10 = tickData.slice(-10)
    const momentum = last10.filter(t => t.dir === 'up').length - last10.filter(t => t.dir === 'down').length

    // Tick speed (volume per tick)
    const avgVol = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length || 0

    return {
      pricePath, cvdPath, dots, upCount, downCount, momentum,
      lastPrice: prices[prices.length - 1],
      avgVol,
      tickCount: ticks.length,
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Hash size={12} className="text-accent-teal" />
          Tick Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { pricePath, cvdPath, dots, upCount, downCount, momentum, lastPrice, avgVol, tickCount } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Hash size={12} className="text-accent-teal" />
        Tick Chart
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Last Price</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatPrice(lastPrice)}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Ticks</span>
          <div className="text-[10px] font-mono text-gray-400">{tickCount}</div>
        </div>
      </div>

      {/* Price line with dots */}
      <svg viewBox="0 0 100 100" className="w-full h-[45px]" preserveAspectRatio="none">
        <path d={pricePath} fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="0.8"
            fill={d.dir === 'up' ? '#22c55e' : d.dir === 'down' ? '#ef4444' : '#64748b'}
          />
        ))}
      </svg>

      {/* CVD line */}
      <div className="text-[8px] text-gray-600 mt-1 mb-0.5">Cumulative Volume Delta</div>
      <svg viewBox="0 0 100 100" className="w-full h-[25px]" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="100" y2="50" stroke="#64748b" strokeWidth="0.2" strokeDasharray="1 3" opacity="0.3" />
        <path d={cvdPath} fill="none" stroke="#3b82f6" strokeWidth="1" />
      </svg>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between">
          <span className="text-gray-600">Up</span>
          <span className="text-accent-green font-mono">{upCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Down</span>
          <span className="text-accent-red font-mono">{downCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Mom</span>
          <span className={'font-mono ' + (momentum >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {momentum >= 0 ? '+' : ''}{momentum}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Avg Vol</span>
          <span className="text-gray-400 font-mono">{avgVol.toFixed(0)}</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Tick-by-tick price movement with CVD. Green dots = uptick, red = downtick.
      </div>
    </div>
  )
}
