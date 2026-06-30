import { useMemo } from 'react'
import { Clock, Globe, Sunrise, Sunset, Moon } from 'lucide-react'
import { formatPrice } from '../utils/format'

const SESSIONS = [
  { name: 'Asia', start: 0, end: 7, color: '#8b5cf6', icon: Moon },
  { name: 'London', start: 7, end: 13, color: '#22c55e', icon: Sunrise },
  { name: 'New York', start: 13, end: 21, color: '#3b82f6', icon: Globe },
  { name: 'Off Hours', start: 21, end: 24, color: '#64748b', icon: Sunset },
]

export default function SessionVWAP({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 10) return null

    // Calculate VWAP per session for each day
    const sessionVWAPs = SESSIONS.map(s => ({
      ...s,
      vwap: 0,
      totalVol: 0,
      totalPV: 0,
      candles: [],
      prevVwap: 0,
      deviations: [],
    }))

    for (const c of symCandles) {
      const ts = c.time || c.timestamp || 0
      const hour = new Date(ts * 1000).getUTCHours()
      const session = sessionVWAPs.find(s => hour >= s.start && hour < s.end)
      if (!session) continue

      const vol = c.volume || 0
      const typicalPrice = (c.high + c.low + c.close) / 3
      session.totalVol += vol
      session.totalPV += typicalPrice * vol
      session.candles.push(c)
    }

    // Calculate VWAP for each session
    for (const s of sessionVWAPs) {
      if (s.totalVol > 0) {
        s.vwap = s.totalPV / s.totalVol
      }
      // Calculate std dev for bands
      if (s.candles.length > 0) {
        const deviations = s.candles.map(c => {
          const tp = (c.high + c.low + c.close) / 3
          return (tp - s.vwap) ** 2
        })
        s.stdDev = Math.sqrt(deviations.reduce((sum, d) => sum + d, 0) / deviations.length) || 0
      } else {
        s.stdDev = 0
      }
    }

    // Current session
    const lastTs = symCandles[symCandles.length - 1].time || symCandles[symCandles.length - 1].timestamp || 0
    const lastHour = new Date(lastTs * 1000).getUTCHours()
    const currentSession = SESSIONS.find(s => lastHour >= s.start && lastHour < s.end) || SESSIONS[0]
    const currentSessionData = sessionVWAPs.find(s => s.name === currentSession.name)

    // Current price
    const lastPrice = symCandles[symCandles.length - 1].close

    // Price vs each session VWAP
    const sessionComparisons = sessionVWAPs
      .filter(s => s.totalVol > 0)
      .map(s => ({
        name: s.name,
        color: s.color,
        vwap: s.vwap,
        stdDev: s.stdDev,
        upper: s.vwap + s.stdDev,
        lower: s.vwap - s.stdDev,
        priceVsVwap: ((lastPrice - s.vwap) / s.vwap) * 100,
        above: lastPrice > s.vwap,
        vol: s.totalVol,
      }))

    // Signal: price above all session VWAPs = strong bullish
    const allAbove = sessionComparisons.length > 0 && sessionComparisons.every(s => s.above)
    const allBelow = sessionComparisons.length > 0 && sessionComparisons.every(s => !s.above)
    let signal = 'Mixed'
    let signalColor = 'text-gray-400'
    if (allAbove) { signal = 'Above all VWAPs — Bullish'; signalColor = 'text-accent-green' }
    else if (allBelow) { signal = 'Below all VWAPs — Bearish'; signalColor = 'text-accent-red' }
    else if (currentSessionData && lastPrice > currentSessionData.vwap) {
      signal = `Above ${currentSession.name} VWAP`; signalColor = 'text-accent-green'
    } else if (currentSessionData && lastPrice < currentSessionData.vwap) {
      signal = `Below ${currentSession.name} VWAP`; signalColor = 'text-accent-red'
    }

    return { sessionComparisons, currentSession, lastPrice, signal, signalColor }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Clock size={12} className="text-accent-blue" />
          Session VWAP
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { sessionComparisons, currentSession, lastPrice, signal, signalColor } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Clock size={12} className="text-accent-blue" />
        Session VWAP
      </div>

      {/* Current session */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[8px] text-gray-600">Current Session</span>
          <div className="text-xs font-bold" style={{ color: currentSession.color }}>{currentSession.name}</div>
        </div>
        <div className="text-right">
          <span className="text-[8px] text-gray-600">Price</span>
          <div className="text-sm font-mono font-bold text-gray-200">{formatPrice(lastPrice)}</div>
        </div>
      </div>

      {/* Signal */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2 text-center">
        <span className={'text-[10px] font-medium ' + signalColor}>{signal}</span>
      </div>

      {/* Per-session VWAP */}
      <div className="space-y-1">
        {sessionComparisons.map((s, i) => (
          <div key={i} className="bg-bg-800 rounded px-1.5 py-1">
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-gray-400">{s.name}</span>
              </div>
              <span className={'font-mono ' + (s.above ? 'text-accent-green' : 'text-accent-red')}>
                {s.above ? '+' : ''}{s.priceVsVwap.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-[7px] text-gray-600">
              <span>Lower: {formatPrice(s.lower)}</span>
              <span className="font-mono text-gray-400">VWAP: {formatPrice(s.vwap)}</span>
              <span>Upper: {formatPrice(s.upper)}</span>
            </div>
            {/* Band visualization */}
            <div className="relative h-1 bg-bg-600 rounded-full mt-0.5">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-500" />
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  backgroundColor: s.color,
                  left: s.above ? '50%' : `${50 - Math.min(Math.abs(s.priceVsVwap), 50)}%`,
                  width: `${Math.min(Math.abs(s.priceVsVwap), 50)}%`,
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        VWAP per trading session (UTC). Price above all = strong trend. Bands = ±1σ.
      </div>
    </div>
  )
}
