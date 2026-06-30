import { useMemo, useState } from 'react'
import { GitBranch, Eye, EyeOff } from 'lucide-react'
import { formatPrice } from '../utils/format'

const FIB_LEVELS = [
  { level: 0, label: '0%', color: '#ef4444' },
  { level: 0.236, label: '23.6%', color: '#f97316' },
  { level: 0.382, label: '38.2%', color: '#eab308' },
  { level: 0.5, label: '50.0%', color: '#22c55e' },
  { level: 0.618, label: '61.8%', color: '#3b82f6' },
  { level: 0.786, label: '78.6%', color: '#a855f7' },
  { level: 1, label: '100%', color: '#64748b' },
]

export default function FibonacciLevels({ candles, currentPrice }) {
  const [visible, setVisible] = useState(true)

  const fibData = useMemo(() => {
    if (!candles?.length || candles.length < 10) return null

    const recent = candles.slice(-50)
    const high = Math.max(...recent.map(c => c.high))
    const low = Math.min(...recent.map(c => c.low))
    const range = high - low
    if (range <= 0) return null

    // Determine trend direction (first vs last candle)
    const firstClose = recent[0].close
    const lastClose = recent[recent.length - 1].close
    const isUptrend = lastClose >= firstClose

    const levels = FIB_LEVELS.map(f => {
      const price = isUptrend ? high - range * f.level : low + range * f.level
      return { ...f, price }
    })

    // Find nearest fib level to current price
    let nearest = levels[0]
    let minDist = Infinity
    for (const l of levels) {
      const dist = Math.abs(l.price - (currentPrice || lastClose))
      if (dist < minDist) {
        minDist = dist
        nearest = l
      }
    }

    return {
      high,
      low,
      range,
      isUptrend,
      levels,
      nearest,
      currentPrice: currentPrice || lastClose,
    }
  }, [candles, currentPrice])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <GitBranch size={12} className="text-accent-purple" />
        Fibonacci Levels
        <div className="flex-1" />
        <button
          onClick={() => setVisible(!visible)}
          className="text-gray-500 hover:text-gray-300"
        >
          {visible ? <Eye size={10} /> : <EyeOff size={10} />}
        </button>
      </div>

      {!visible ? (
        <div className="text-[10px] text-gray-600 italic py-1 text-center">Hidden</div>
      ) : !fibData ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      ) : (
        <>
          {/* Trend badge */}
          <div className="flex items-center gap-2 mb-2 text-[9px]">
            <span className={'px-1.5 py-0.5 rounded font-medium ' +
              (fibData.isUptrend ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red')}>
              {fibData.isUptrend ? '↗ Uptrend' : '↘ Downtrend'}
            </span>
            <span className="text-gray-600">
              H: ${formatPrice(fibData.high)} · L: ${formatPrice(fibData.low)}
            </span>
          </div>

          {/* Fib levels */}
          <div className="space-y-0.5">
            {fibData.levels.map(l => {
              const isNearest = l.label === fibData.nearest.label
              const isAbove = l.price > fibData.currentPrice
              return (
                <div
                  key={l.label}
                  className={'flex items-center gap-2 px-1.5 py-0.5 rounded ' +
                    (isNearest ? 'bg-bg-600 ring-1 ring-accent-blue/30' : '')}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-[9px] font-mono text-gray-400 w-10">{l.label}</span>
                  <span className="text-[10px] font-mono text-gray-300 flex-1">${formatPrice(l.price)}</span>
                  {isNearest && <span className="text-[7px] text-accent-blue">← nearest</span>}
                  {!isNearest && (
                    <span className={'text-[7px] ' + (isAbove ? 'text-accent-red' : 'text-accent-green')}>
                      {isAbove ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Current price position */}
          <div className="mt-2 pt-1.5 border-t border-bg-600 text-[9px] text-gray-500">
            Current: <span className="font-mono text-gray-300">${formatPrice(fibData.currentPrice)}</span>
            {' · '}
            Nearest: <span className="font-mono" style={{ color: fibData.nearest.color }}>{fibData.nearest.label}</span>
          </div>
        </>
      )}
    </div>
  )
}
