import { useMemo } from 'react'
import { Activity, TrendingUp, TrendingDown, Gauge } from 'lucide-react'

export default function CumulativeTickIndex({ candles, fills, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 10) return null

    // Build tick series: each candle = one "tick" (up/down/flat based on close vs open)
    const ticks = symCandles.map(c => ({
      up: c.close > c.open ? 1 : 0,
      down: c.close < c.open ? 1 : 0,
      flat: c.close === c.open ? 1 : 0,
      volume: c.volume || 0,
    }))

    // Cumulative tick (up minus down)
    let cumTick = 0
    const cumTickSeries = ticks.map(t => {
      cumTick += t.up - t.down
      return cumTick
    })

    // Tick ratio (up / total)
    const totalTicks = ticks.length
    const upTicks = ticks.reduce((s, t) => s + t.up, 0)
    const downTicks = ticks.reduce((s, t) => s + t.down, 0)
    const tickRatio = totalTicks > 0 ? upTicks / totalTicks : 0.5

    // Breadth thrust: % of up ticks in last 10
    const recentTicks = ticks.slice(-10)
    const recentUp = recentTicks.reduce((s, t) => s + t.up, 0)
    const breadthThrust = recentTicks.length > 0 ? recentUp / recentTicks.length : 0.5

    // Volume-weighted tick
    const volUp = ticks.reduce((s, t) => s + t.up * t.volume, 0)
    const volDown = ticks.reduce((s, t) => s + t.down * t.volume, 0)
    const volTickRatio = (volUp + volDown) > 0 ? volUp / (volUp + volDown) : 0.5

    // Fill-based tick (actual trades)
    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && f.exchange === exchange && f.status === 'FILLED')
      .slice(-30)
    const buyFills = symFills.filter(f => f.side === 'BUY').length
    const sellFills = symFills.filter(f => f.side === 'SELL').length
    const fillTickRatio = symFills.length > 0 ? buyFills / symFills.length : 0.5

    // Composite tick score
    const compositeTick = (tickRatio * 0.3 + volTickRatio * 0.3 + fillTickRatio * 0.2 + breadthThrust * 0.2) * 100

    // Chart
    const tickSlice = cumTickSeries.slice(-30)
    const minT = Math.min(...tickSlice)
    const maxT = Math.max(...tickSlice)
    const tRange = maxT - minT || 1
    const toY = (v) => 100 - ((v - minT) / tRange) * 80 - 10

    const tickPath = tickSlice.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (tickSlice.length - 1)) * 100).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
    const zeroVal = 0
    const zeroY = toY(zeroVal >= minT && zeroVal <= maxT ? zeroVal : (minT + maxT) / 2)

    // Signal
    let signal = 'Neutral'
    let signalColor = 'text-gray-400'
    if (compositeTick > 70) { signal = 'Strong Bullish Breadth'; signalColor = 'text-accent-green' }
    else if (compositeTick > 55) { signal = 'Bullish Breadth'; signalColor = 'text-accent-green' }
    else if (compositeTick < 30) { signal = 'Strong Bearish Breadth'; signalColor = 'text-accent-red' }
    else if (compositeTick < 45) { signal = 'Bearish Breadth'; signalColor = 'text-accent-red' }

    return {
      cumTick: cumTickSeries[cumTickSeries.length - 1],
      tickPath, zeroY,
      upTicks, downTicks, tickRatio,
      breadthThrust, volTickRatio, fillTickRatio,
      compositeTick, signal, signalColor,
      buyFills, sellFills,
    }
  }, [candles, fills, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Activity size={12} className="text-accent-teal" />
          Cumulative Tick
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { cumTick, tickPath, zeroY, upTicks, downTicks, tickRatio, breadthThrust, volTickRatio, fillTickRatio, compositeTick, signal, signalColor, buyFills, sellFills } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Activity size={12} className="text-accent-teal" />
        Cumulative Tick Index
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Cum Tick</span>
          <div className={'text-sm font-mono font-bold ' + (cumTick >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {cumTick >= 0 ? '+' : ''}{cumTick}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Signal</span>
          <div className={'text-[10px] font-medium ' + signalColor}>{signal}</div>
        </div>
      </div>

      {/* Cumulative tick chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[40px]" preserveAspectRatio="none">
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#64748b" strokeWidth="0.3" strokeDasharray="1 3" opacity="0.4" />
        <path d={tickPath} fill="none" stroke={cumTick >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
      </svg>

      {/* Breadth metrics */}
      <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Up Ticks</span>
          <span className="text-accent-green font-mono">{upTicks}</span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Down Ticks</span>
          <span className="text-accent-red font-mono">{downTicks}</span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Tick Ratio</span>
          <span className="font-mono text-gray-300">{(tickRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Vol Ratio</span>
          <span className="font-mono text-gray-300">{(volTickRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Breadth (10)</span>
          <span className="font-mono text-gray-300">{(breadthThrust * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Fill Ratio</span>
          <span className="font-mono text-gray-300">{(fillTickRatio * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Composite gauge */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[8px] mb-0.5">
          <span className="text-gray-600 flex items-center gap-0.5"><Gauge size={8} /> Composite</span>
          <span className={'font-mono font-bold ' + signalColor}>{compositeTick.toFixed(0)}</span>
        </div>
        <div className="h-2 bg-bg-800 rounded-full overflow-hidden">
          <div
            className={'h-full rounded-full transition-all ' + (compositeTick > 55 ? 'bg-accent-green' : compositeTick < 45 ? 'bg-accent-red' : 'bg-gray-500')}
            style={{ width: `${compositeTick}%` }}
          />
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Tick breadth = market internals. &gt;70 = strong buying, &lt;30 = strong selling.
      </div>
    </div>
  )
}
