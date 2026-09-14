import { memo, useEffect, useMemo, useState } from 'react'
import { Play, Pause, SkipForward, SkipBack, Rewind, FastForward, Clock } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { StatCard } from '../utils/ui-helpers'

const SPEEDS = [0.5, 1, 2, 5, 10]

const fmtTime = (ms) => {
  const d = new Date(ms)
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const TickReplay = memo(function TickReplay({ symbol, fills }) {
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [speed, setSpeed] = useState(1)

  // fills arrive newest-first; replay oldest→newest
  const ticks = useMemo(() => {
    const list = (fills || []).filter(f => !symbol || f.symbol === symbol)
    return list
      .slice()
      .reverse()
      .map((f, i) => ({
        id: f.id || i,
        ts: fmtTime(f.received_at ?? (f.timestamp ? f.timestamp * 1000 : Date.now())),
        price: f.filled_price ?? f.price,
        size: f.filled_quantity ?? f.quantity ?? 0,
        side: f.side,
        exch: f.exchange,
      }))
  }, [fills, symbol])

  const clamped = Math.min(position, Math.max(0, ticks.length - 1))

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setPosition(p => {
        if (p >= ticks.length - 1) {
          setPlaying(false)
          return p
        }
        return p + 1
      })
    }, 400 / speed)
    return () => clearInterval(id)
  }, [playing, speed, ticks.length])

  const stats = useMemo(() => {
    const visibleTicks = ticks.slice(0, clamped + 1)
    if (visibleTicks.length === 0) return { vwap: 0, totalVol: 0, buyVol: 0, sellVol: 0, count: 0 }
    const totalVol = visibleTicks.reduce((s, t) => s + t.size, 0)
    const vwap = totalVol > 0 ? visibleTicks.reduce((s, t) => s + t.price * t.size, 0) / totalVol : 0
    const buyVol = visibleTicks.filter(t => t.side === 'BUY').reduce((s, t) => s + t.size, 0)
    const sellVol = totalVol - buyVol
    return { vwap, totalVol, buyVol, sellVol, count: visibleTicks.length }
  }, [ticks, clamped])

  const currentTick = ticks[clamped]
  const progress = ticks.length > 0 ? ((clamped + 1) / ticks.length) * 100 : 0

  const handleStep = (dir) => {
    setPlaying(false)
    setPosition(p => Math.max(0, Math.min(ticks.length - 1, p + dir)))
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Rewind size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Tick Replay</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'all symbols'}</span>
      </div>

      {ticks.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No fills yet — replay appears after orders execute</div>
      ) : (
        <>
          {/* Current tick */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Last Price" value={currentTick ? `$${formatPrice(currentTick.price)}` : '—'} color="text-gray-200" />
            <StatCard label="VWAP" value={`$${formatPrice(stats.vwap)}`} color="text-accent-blue" />
            <StatCard label="Buy Vol" value={formatVolume(stats.buyVol)} color="text-accent-green" />
            <StatCard label="Sell Vol" value={formatVolume(stats.sellVol)} color="text-accent-red" />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 p-2 bg-bg-700 border border-bg-600 rounded">
            <button onClick={() => { setPlaying(false); setPosition(0) }} className="p-1 hover:bg-bg-600 rounded transition-colors">
              <SkipBack size={12} className="text-gray-400" />
            </button>
            <button onClick={() => handleStep(-1)} className="p-1 hover:bg-bg-600 rounded transition-colors">
              <Play size={12} className="text-gray-400 rotate-180" />
            </button>
            <button onClick={() => setPlaying(!playing)} className="p-1.5 bg-accent-blue/20 hover:bg-accent-blue/30 rounded transition-colors">
              {playing ? <Pause size={14} className="text-accent-blue" /> : <Play size={14} className="text-accent-blue" />}
            </button>
            <button onClick={() => handleStep(1)} className="p-1 hover:bg-bg-600 rounded transition-colors">
              <Play size={12} className="text-gray-400" />
            </button>
            <button onClick={() => { setPlaying(false); setPosition(ticks.length - 1) }} className="p-1 hover:bg-bg-600 rounded transition-colors">
              <SkipForward size={12} className="text-gray-400" />
            </button>
            <div className="flex-1 mx-2">
              <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden">
                <div className="h-full bg-accent-blue transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="text-[9px] text-gray-600 font-mono">{clamped + 1}/{ticks.length}</span>
          </div>

          {/* Speed control */}
          <div className="flex items-center gap-1">
            <FastForward size={10} className="text-gray-600" />
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  speed === s ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Tick list */}
          <div className="bg-bg-900 border border-bg-600 rounded max-h-40 overflow-y-auto">
            {ticks.slice(0, clamped + 1).reverse().map(tick => (
              <div key={tick.id} className="flex items-center gap-2 py-0.5 px-2 border-b border-bg-800">
                <span className="text-[9px] text-gray-600 font-mono shrink-0 w-20">{tick.ts}</span>
                <span className={`text-[9px] font-mono shrink-0 w-10 ${tick.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {tick.side}
                </span>
                <span className="text-[10px] font-mono text-gray-300 shrink-0 w-16">${formatPrice(tick.price)}</span>
                <span className="text-[10px] font-mono text-gray-500 shrink-0 w-12">{tick.size}</span>
                <span className="text-[9px] text-gray-600 shrink-0">{tick.exch}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <Clock size={9} />
              {stats.count} ticks replayed
            </span>
            <span>Speed: {speed}x</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(TickReplay)
