import { useState, useMemo, useEffect } from 'react'
import { SkipForward, SkipBack, Play, Pause, Rewind, FastForward } from 'lucide-react'
import { formatPrice, formatTime } from '../utils/format'

export default function TradeReplay({ fills, candles, symbol, selectedExchange }) {
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [speed, setSpeed] = useState(1)

  const replayData = useMemo(() => {
    const symFills = (fills || [])
      .filter(f => f.status === 'FILLED' && (!symbol || f.symbol === symbol) && (!selectedExchange || f.exchange === selectedExchange))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const symCandles = (candles || [])
      .filter(c => (!symbol || c.symbol === symbol) && (!selectedExchange || c.exchange === selectedExchange))
      .sort((a, b) => (a.time || 0) - (b.time || 0))

    // Merge into timeline
    const events = []
    let runningPnl = 0
    let runningEquity = 10000

    for (const c of symCandles) {
      events.push({ type: 'candle', time: c.time, data: c })
    }
    for (const f of symFills) {
      runningPnl += f.pnl || 0
      runningEquity += f.pnl || 0
      events.push({ type: 'fill', time: f.timestamp, data: f, runningPnl, runningEquity })
    }

    events.sort((a, b) => (a.time || 0) - (b.time || 0))

    // Calculate running equity at each point
    let eq = 10000
    for (const e of events) {
      if (e.type === 'fill') {
        eq += e.data.pnl || 0
        e.equity = eq
      } else {
        e.equity = eq
      }
    }

    return events
  }, [fills, candles, symbol, selectedExchange])

  const currentEvent = replayData[step]
  const totalSteps = replayData.length

  // Auto-play
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      setStep(s => {
        if (s >= totalSteps - 1) {
          setPlaying(false)
          return s
        }
        return s + 1
      })
    }, 1000 / speed)
    return () => clearInterval(interval)
  }, [playing, speed, totalSteps])

  const handlePlayPause = () => {
    if (step >= totalSteps - 1) setStep(0)
    setPlaying(!playing)
  }

  const handleStep = (dir) => {
    setPlaying(false)
    setStep(s => Math.max(0, Math.min(totalSteps - 1, s + dir)))
  }

  const handleJump = (pct) => {
    setPlaying(false)
    setStep(Math.floor(totalSteps * pct))
  }

  if (totalSteps === 0) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Play size={12} className="text-accent-green" />
          Trade Replay
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No events to replay</div>
      </div>
    )
  }

  const progressPct = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Play size={12} className="text-accent-green" />
        Trade Replay
        <span className="text-gray-600 ml-auto">{step + 1}/{totalSteps}</span>
      </div>

      {/* Current event display */}
      {currentEvent && (
        <div className="bg-bg-600/50 rounded p-2 mb-2">
          {currentEvent.type === 'candle' ? (
            <div className="grid grid-cols-4 gap-1 text-[9px]">
              <div><span className="text-gray-600">O</span> <span className="text-gray-300 font-mono">${formatPrice(currentEvent.data.open)}</span></div>
              <div><span className="text-gray-600">H</span> <span className="text-gray-300 font-mono">${formatPrice(currentEvent.data.high)}</span></div>
              <div><span className="text-gray-600">L</span> <span className="text-gray-300 font-mono">${formatPrice(currentEvent.data.low)}</span></div>
              <div><span className="text-gray-600">C</span> <span className={'font-mono ' + (currentEvent.data.close >= currentEvent.data.open ? 'text-accent-green' : 'text-accent-red')}>${formatPrice(currentEvent.data.close)}</span></div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={'text-[10px] font-bold ' + (currentEvent.data.side === 'BUY' ? 'text-accent-green' : 'text-accent-red')}>
                  {currentEvent.data.side}
                </span>
                <span className="text-[10px] text-gray-300">{currentEvent.data.quantity?.toFixed(4)}</span>
                <span className="text-[9px] text-gray-600">@</span>
                <span className="text-[10px] font-mono text-gray-300">${formatPrice(currentEvent.data.price)}</span>
                <span className="text-[8px] text-gray-600 ml-auto">{formatTime(currentEvent.data.timestamp)}</span>
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-gray-600">Equity: <span className="text-gray-300 font-mono">${currentEvent.equity?.toFixed(2)}</span></span>
                <span className="text-gray-600">PnL: <span className={'font-mono ' + ((currentEvent.data.pnl || 0) >= 0 ? 'text-accent-green' : 'text-accent-red')}>{(currentEvent.data.pnl || 0) >= 0 ? '+' : ''}{(currentEvent.data.pnl || 0).toFixed(2)}</span></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-accent-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 mb-2">
        <button onClick={() => handleJump(0)} className="p-1 rounded bg-bg-600 text-gray-400 hover:text-gray-200" title="Start">
          <Rewind size={11} />
        </button>
        <button onClick={() => handleStep(-1)} className="p-1 rounded bg-bg-600 text-gray-400 hover:text-gray-200" title="Step back">
          <SkipBack size={11} />
        </button>
        <button onClick={handlePlayPause} className="p-1.5 rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30" title="Play/Pause">
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={() => handleStep(1)} className="p-1 rounded bg-bg-600 text-gray-400 hover:text-gray-200" title="Step forward">
          <SkipForward size={11} />
        </button>
        <button onClick={() => handleJump(1)} className="p-1 rounded bg-bg-600 text-gray-400 hover:text-gray-200" title="End">
          <FastForward size={11} />
        </button>
        <div className="flex-1" />
        <select
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          className="bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>
    </div>
  )
}
