import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Play, Square, Clock } from 'lucide-react'
import { formatPrice } from '../utils/format'

const STRATEGIES = [
  { id: 'twap', label: 'TWAP', desc: 'Time-Weighted Average Price' },
  { id: 'vwap', label: 'VWAP', desc: 'Volume-Weighted Average Price' },
]

export default function ExecutionBot({ currentPrice, onSubmit, connected, symbol, _exchange }) {
  const [strategy, setStrategy] = useState('twap')
  const [side, setSide] = useState('BUY')
  const [totalQty, setTotalQty] = useState(1.0)
  const [slices, setSlices] = useState(10)
  const [intervalSec, setIntervalSec] = useState(5)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ sent: 0, filled: 0, avgPrice: 0 })
  const [log, setLog] = useState([])

  const sliceQty = useMemo(() => slices > 0 ? totalQty / slices : 0, [totalQty, slices])
  const sliceIdxRef = useRef(0)
  const intervalRef = useRef(null)
  const pricesRef = useRef([])
  const currentPriceRef = useRef(currentPrice)

  useEffect(() => {
    currentPriceRef.current = currentPrice
  }, [currentPrice])

  const stopExecution = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
  }, [])

  const sendSlice = useCallback(() => {
    if (sliceIdxRef.current >= slices) {
      stopExecution()
      setLog(prev => [...prev, { time: Date.now(), msg: 'Execution complete', type: 'done' }])
      return
    }

    const price = currentPriceRef.current
    let orderPrice = price
    if (strategy === 'vwap' && pricesRef.current.length > 0) {
      const recent = pricesRef.current.slice(-20)
      const vwap = recent.reduce((s, p) => s + p, 0) / recent.length
      orderPrice = vwap
    }

    pricesRef.current.push(price)

    if (onSubmit) {
      const order = {
        type: 'MARKET',
        side,
        quantity: sliceQty,
        symbol,
      }
      if (strategy === 'vwap') {
        order.order_type = 'LIMIT'
        order.price = orderPrice
      }
      onSubmit(order)
    }

    sliceIdxRef.current++
    const newAvg = pricesRef.current.reduce((s, p) => s + p, 0) / pricesRef.current.length
    setProgress({
      sent: sliceIdxRef.current,
      filled: sliceIdxRef.current,
      avgPrice: newAvg,
    })
    setLog(prev => [...prev.slice(-10), {
      time: Date.now(),
      msg: `Slice ${sliceIdxRef.current}/${slices}: ${side} ${sliceQty.toFixed(4)} @ $${formatPrice(price)}`,
      type: 'slice',
    }])
  }, [slices, side, sliceQty, strategy, onSubmit, symbol])

  const startExecution = useCallback(() => {
    if (!connected || !onSubmit) return
    sliceIdxRef.current = 0
    pricesRef.current = []
    setLog([])
    setProgress({ sent: 0, filled: 0, avgPrice: 0 })
    setRunning(true)

    sendSlice()
    intervalRef.current = setInterval(sendSlice, intervalSec * 1000)
  }, [connected, onSubmit, intervalSec, sendSlice])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const pct = slices > 0 ? (progress.sent / slices * 100).toFixed(0) : 0

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Clock size={12} className="text-accent-green" />
        Execution Bot (TWAP/VWAP)
      </div>

      {/* Strategy selector */}
      <div className="flex gap-1 mb-2">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => setStrategy(s.id)}
            className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
              (strategy === s.id ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-400 hover:bg-bg-500')}
            title={s.desc}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Side selector */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setSide('BUY')}
          className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
            (side === 'BUY' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-400')}
        >
          BUY
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
            (side === 'SELL' ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-600 text-gray-400')}
        >
          SELL
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Total Qty</span>
          <input
            type="number"
            step="0.1"
            value={totalQty}
            onChange={e => setTotalQty(Number(e.target.value))}
            disabled={running}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-green disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Slices</span>
          <input
            type="number"
            value={slices}
            onChange={e => setSlices(Number(e.target.value))}
            disabled={running}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-green disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Interval(s)</span>
          <input
            type="number"
            value={intervalSec}
            onChange={e => setIntervalSec(Number(e.target.value))}
            disabled={running}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-green disabled:opacity-50"
          />
        </label>
      </div>

      {/* Info */}
      <div className="text-[9px] text-gray-500 mb-2 flex justify-between">
        <span>Per slice: <span className="text-gray-300 font-mono">{sliceQty.toFixed(4)}</span></span>
        <span>Duration: <span className="text-gray-300 font-mono">{(slices * intervalSec)}s</span></span>
      </div>

      {/* Progress bar */}
      {progress.sent > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
            <span>Progress: {progress.sent}/{slices} ({pct}%)</span>
            <span>Avg: ${formatPrice(progress.avgPrice)}</span>
          </div>
          <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-green rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-1">
        {!running ? (
          <button
            onClick={startExecution}
            disabled={!connected}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 transition-colors disabled:opacity-50"
          >
            <Play size={10} />
            Start
          </button>
        ) : (
          <button
            onClick={stopExecution}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] rounded bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
          >
            <Square size={10} />
            Stop
          </button>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="mt-2 max-h-[80px] overflow-y-auto scrollbar-thin space-y-0.5">
          {log.map((entry, i) => (
            <div key={i} className="text-[8px] font-mono text-gray-500 px-1">
              <span className="text-gray-600">{new Date(entry.time).toLocaleTimeString()}</span>
              {' '}
              <span className={entry.type === 'done' ? 'text-accent-green' : 'text-gray-400'}>
                {entry.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
