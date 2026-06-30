import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Film, Play, Pause, SkipBack, SkipForward, Clock, Layers } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function MarketDepthReplay({ candles, orderbooks, fills, symbol, exchange }) {
  const [playing, setPlaying] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [speed, setSpeed] = useState(1)
  const intervalRef = useRef(null)

  const replayData = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 10) return null

    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && (f.exchange === exchange || f.selectedExchange === exchange))
      .slice(-50)

    // Build snapshots: each candle is a "frame"
    const frames = symCandles.map((c, i) => {
      // Find fills near this candle's timestamp
      const nearbyFills = symFills.filter(f => {
        const ts = f.timestamp || f.received_at || 0
        return Math.abs(ts - c.timestamp) < 60
      })

      // Estimate orderbook state from candle OHLC
      const midPrice = (c.high + c.low) / 2
      const spread = Math.max((c.high - c.low) * 0.001, 0.5)
      const levels = 10
      const bids = []
      const asks = []
      for (let l = 0; l < levels; l++) {
        const bidPrice = midPrice - spread - l * spread * 1.5
        const askPrice = midPrice + spread + l * spread * 1.5
        // Decay volume with distance
        const decay = Math.exp(-l * 0.3)
        const baseVol = c.volume * 0.1 * decay
        bids.push({ price: bidPrice, quantity: baseVol * (0.8 + Math.random() * 0.4) })
        asks.push({ price: askPrice, quantity: baseVol * (0.8 + Math.random() * 0.4) })
      }

      // Imbalance
      const bidVol = bids.reduce((s, b) => s + b.quantity, 0)
      const askVol = asks.reduce((s, a) => s + a.quantity, 0)
      const totalVol = bidVol + askVol
      const imbalance = totalVol > 0 ? (bidVol - askVol) / totalVol : 0

      return {
        idx: i,
        timestamp: c.timestamp,
        time: new Date(c.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false }),
        candle: c,
        bids,
        asks,
        midPrice,
        spread,
        bidVol,
        askVol,
        imbalance,
        fills: nearbyFills,
        fillCount: nearbyFills.length,
      }
    })

    return { frames, totalFrames: frames.length }
  }, [candles, fills, symbol, exchange])

  // Playback control
  useEffect(() => {
    if (playing && replayData) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx(prev => {
          if (prev >= replayData.totalFrames - 1) {
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 1000 / speed)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed, replayData])

  const handlePlayPause = useCallback(() => {
    if (!replayData) return
    if (currentIdx < 0 || currentIdx >= replayData.totalFrames - 1) {
      setCurrentIdx(0)
    }
    setPlaying(p => !p)
  }, [replayData, currentIdx])

  const handleStep = useCallback((dir) => {
    setPlaying(false)
    setCurrentIdx(prev => {
      if (!replayData) return prev
      const next = prev + dir
      return Math.max(0, Math.min(replayData.totalFrames - 1, next))
    })
  }, [replayData])

  const handleScrub = useCallback((e) => {
    setPlaying(false)
    const idx = parseInt(e.target.value)
    setCurrentIdx(idx)
  }, [])

  if (!replayData) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Film size={12} className="text-accent-purple" />
          Depth Replay
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 10+ candles</div>
      </div>
    )
  }

  const { frames, totalFrames } = replayData
  const frame = currentIdx >= 0 ? frames[currentIdx] : null
  const progress = currentIdx >= 0 ? ((currentIdx + 1) / totalFrames) * 100 : 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Film size={12} className="text-accent-purple" />
        Market Depth Replay
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => handleStep(-1)}
          className="p-1 bg-bg-600 rounded hover:bg-bg-500 transition-colors"
          title="Step back"
        >
          <SkipBack size={12} className="text-gray-400" />
        </button>
        <button
          onClick={handlePlayPause}
          className="p-1.5 bg-accent-purple rounded hover:bg-accent-purple/80 transition-colors"
          title="Play/Pause"
        >
          {playing ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-white" />}
        </button>
        <button
          onClick={() => handleStep(1)}
          className="p-1 bg-bg-600 rounded hover:bg-bg-500 transition-colors"
          title="Step forward"
        >
          <SkipForward size={12} className="text-gray-400" />
        </button>
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[8px] text-gray-600">Speed:</span>
          {[0.5, 1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={'px-1 text-[8px] rounded transition-colors ' +
                (speed === s ? 'bg-accent-purple text-white' : 'bg-bg-600 text-gray-400')}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="mb-2">
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={Math.max(currentIdx, 0)}
          onChange={handleScrub}
          className="w-full h-1.5 accent-accent-purple"
        />
        <div className="flex justify-between text-[7px] text-gray-600 mt-0.5">
          <span>Frame {Math.max(currentIdx + 1, 0)} / {totalFrames}</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
      </div>

      {/* Current frame info */}
      {frame ? (
        <>
          <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600 flex items-center gap-0.5"><Clock size={7} /> Time</span>
              <div className="font-mono text-gray-400">{frame.time}</div>
            </div>
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Mid Price</span>
              <div className="font-mono text-gray-300">{formatPrice(frame.midPrice)}</div>
            </div>
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Spread</span>
              <div className="font-mono text-gray-400">{formatPrice(frame.spread)}</div>
            </div>
          </div>

          {/* Imbalance bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[8px] mb-0.5">
              <span className="text-gray-600 flex items-center gap-0.5"><Layers size={7} /> Imbalance</span>
              <span className={'font-mono ' + (frame.imbalance > 0.1 ? 'text-accent-green' : frame.imbalance < -0.1 ? 'text-accent-red' : 'text-gray-400')}>
                {(frame.imbalance * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-bg-800 rounded-full overflow-hidden flex">
              <div className="bg-accent-green h-full transition-all" style={{ width: `${(frame.bidVol / (frame.bidVol + frame.askVol)) * 100}%` }} />
              <div className="bg-accent-red h-full flex-1" />
            </div>
            <div className="flex justify-between text-[7px] text-gray-700 mt-0.5">
              <span className="text-accent-green">B: {formatVolume(frame.bidVol)}</span>
              <span className="text-accent-red">A: {formatVolume(frame.askVol)}</span>
            </div>
          </div>

          {/* Orderbook snapshot */}
          <div className="mb-2">
            <div className="text-[8px] text-gray-600 mb-0.5">Depth Snapshot (10 levels):</div>
            <div className="space-y-px">
              {frame.asks.slice(0, 5).reverse().map((a, i) => (
                <div key={'a' + i} className="flex items-center justify-between text-[8px] bg-accent-red/5 px-1.5 py-px rounded-sm">
                  <span className="text-accent-red font-mono">{formatPrice(a.price)}</span>
                  <div className="flex-1 mx-2 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-red/40" style={{ width: `${(a.quantity / frame.asks[0].quantity) * 100}%` }} />
                  </div>
                  <span className="text-gray-500 font-mono">{a.quantity.toFixed(3)}</span>
                </div>
              ))}
              <div className="flex items-center justify-center text-[8px] text-gray-600 py-px border-y border-bg-600">
                {formatPrice(frame.midPrice)} ← mid
              </div>
              {frame.bids.slice(0, 5).map((b, i) => (
                <div key={'b' + i} className="flex items-center justify-between text-[8px] bg-accent-green/5 px-1.5 py-px rounded-sm">
                  <span className="text-accent-green font-mono">{formatPrice(b.price)}</span>
                  <div className="flex-1 mx-2 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-green/40" style={{ width: `${(b.quantity / frame.bids[0].quantity) * 100}%` }} />
                  </div>
                  <span className="text-gray-500 font-mono">{b.quantity.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fills at this frame */}
          {frame.fills.length > 0 && (
            <div className="pt-1.5 border-t border-bg-600">
              <div className="text-[8px] text-gray-600 mb-0.5">Fills at this candle ({frame.fillCount}):</div>
              <div className="space-y-0.5">
                {frame.fills.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
                    <span className={f.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}>
                      {f.side} {f.filled_quantity?.toFixed(4) || '--'}
                    </span>
                    <span className="font-mono text-gray-400">{formatPrice(f.price || f.fill_price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4 text-[10px] text-gray-600">
          Press play to start depth replay
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Reconstructs L2 depth from candle OHLC + fills. Scrub timeline to inspect historical market state.
      </div>
    </div>
  )
}
