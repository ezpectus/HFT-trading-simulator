import { memo, useMemo, useState } from 'react'
import { Play, Pause, SkipForward, SkipBack, Rewind, FastForward, Clock } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'
import { StatCard } from '../utils/ui-helpers'

const MOCK_TICKS = [
  { id: 1, ts: '12:45:32.100', price: 44100.5, size: 0.15, side: 'BUY', exch: 'Binance' },
  { id: 2, ts: '12:45:32.150', price: 44100.8, size: 0.32, side: 'BUY', exch: 'Binance' },
  { id: 3, ts: '12:45:32.200', price: 44101.0, size: 0.08, side: 'BUY', exch: 'OKX' },
  { id: 4, ts: '12:45:32.250', price: 44100.5, size: 0.50, side: 'SELL', exch: 'Binance' },
  { id: 5, ts: '12:45:32.300', price: 44100.2, size: 0.22, side: 'SELL', exch: 'Bybit' },
  { id: 6, ts: '12:45:32.350', price: 44100.0, size: 1.20, side: 'SELL', exch: 'Binance' },
  { id: 7, ts: '12:45:32.400', price: 44099.8, size: 0.15, side: 'SELL', exch: 'OKX' },
  { id: 8, ts: '12:45:32.450', price: 44100.0, size: 0.45, side: 'BUY', exch: 'Bybit' },
  { id: 9, ts: '12:45:32.500', price: 44100.3, size: 0.18, side: 'BUY', exch: 'Binance' },
  { id: 10, ts: '12:45:32.550', price: 44100.5, size: 0.65, side: 'BUY', exch: 'Binance' },
  { id: 11, ts: '12:45:32.600', price: 44101.0, size: 0.30, side: 'BUY', exch: 'OKX' },
  { id: 12, ts: '12:45:32.650', price: 44101.2, size: 0.12, side: 'BUY', exch: 'Binance' },
]

const SPEEDS = [0.5, 1, 2, 5, 10]

const TickReplay = memo(function TickReplay({ symbol }) {
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [speed, setSpeed] = useState(1)

  const stats = useMemo(() => {
    const visibleTicks = MOCK_TICKS.slice(0, position + 1)
    if (visibleTicks.length === 0) return { vwap: 0, totalVol: 0, buyVol: 0, sellVol: 0, count: 0 }
    const totalVol = visibleTicks.reduce((s, t) => s + t.size, 0)
    const vwap = visibleTicks.reduce((s, t) => s + t.price * t.size, 0) / totalVol
    const buyVol = visibleTicks.filter(t => t.side === 'BUY').reduce((s, t) => s + t.size, 0)
    const sellVol = totalVol - buyVol
    return { vwap, totalVol, buyVol, sellVol, count: visibleTicks.length }
  }, [position])

  const currentTick = MOCK_TICKS[position]
  const progress = ((position + 1) / MOCK_TICKS.length) * 100

  const handleStep = (dir) => {
    setPosition(p => Math.max(0, Math.min(MOCK_TICKS.length - 1, p + dir)))
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Rewind size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Tick Replay</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'BTC/USDT'}</span>
      </div>

      {/* Current tick */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Last Price" value={currentTick ? `$${formatPrice(currentTick.price)}` : '—'} color="text-gray-200" />
        <StatCard label="VWAP" value={`$${formatPrice(stats.vwap)}`} color="text-accent-blue" />
        <StatCard label="Buy Vol" value={formatVolume(stats.buyVol)} color="text-accent-green" />
        <StatCard label="Sell Vol" value={formatVolume(stats.sellVol)} color="text-accent-red" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 p-2 bg-bg-700 border border-bg-600 rounded">
        <button onClick={() => setPosition(0)} className="p-1 hover:bg-bg-600 rounded transition-colors">
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
        <button onClick={() => setPosition(MOCK_TICKS.length - 1)} className="p-1 hover:bg-bg-600 rounded transition-colors">
          <SkipForward size={12} className="text-gray-400" />
        </button>
        <div className="flex-1 mx-2">
          <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden">
            <div className="h-full bg-accent-blue transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="text-[9px] text-gray-600 font-mono">{position + 1}/{MOCK_TICKS.length}</span>
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
        {MOCK_TICKS.slice(0, position + 1).reverse().map(tick => (
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
    </div>
  )
})

export default TickReplay
