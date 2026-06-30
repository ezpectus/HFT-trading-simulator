import { useMemo } from 'react'
import { Globe, Sunrise, Sunset, Moon } from 'lucide-react'
import { formatPrice } from '../utils/format'

const SESSIONS = [
  { name: 'Asia', start: 0, end: 7, color: '#8b5cf6', icon: Moon },
  { name: 'London', start: 7, end: 13, color: '#22c55e', icon: Sunrise },
  { name: 'New York', start: 13, end: 21, color: '#3b82f6', icon: Globe },
  { name: 'Off Hours', start: 21, end: 24, color: '#64748b', icon: Sunset },
]

export default function SessionVolumeProfile({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-200)
    if (symCandles.length < 20) return null

    // Assign each candle to a session based on its timestamp hour (UTC)
    const sessionData = SESSIONS.map(s => ({
      ...s,
      candles: [],
      totalVolume: 0,
      buyVolume: 0,
      sellVolume: 0,
      avgPrice: 0,
      high: -Infinity,
      low: Infinity,
      priceRange: 0,
    }))

    for (const c of symCandles) {
      const ts = c.time || c.timestamp || 0
      const hour = new Date(ts * 1000).getUTCHours()
      const session = sessionData.find(s => hour >= s.start && hour < s.end)
      if (!session) continue

      session.candles.push(c)
      session.totalVolume += c.volume || 0
      const isBull = c.close >= c.open
      if (isBull) session.buyVolume += c.volume || 0
      else session.sellVolume += c.volume || 0
      if (c.high > session.high) session.high = c.high
      if (c.low < session.low) session.low = c.low
    }

    // Calculate averages and ranges
    for (const s of sessionData) {
      if (s.candles.length > 0) {
        s.avgPrice = s.candles.reduce((sum, c) => sum + c.close, 0) / s.candles.length
        s.priceRange = s.high - s.low
      } else {
        s.high = 0
        s.low = 0
      }
    }

    const totalVol = sessionData.reduce((s, x) => s + x.totalVolume, 0) || 1
    const maxVol = Math.max(...sessionData.map(s => s.totalVolume))

    // Dominant session
    const dominant = sessionData.reduce((max, s) => s.totalVolume > max.totalVolume ? s : max, sessionData[0])

    // Buy/sell ratio per session
    const sessionStats = sessionData.map(s => ({
      ...s,
      volPct: (s.totalVolume / totalVol) * 100,
      buyPct: s.totalVolume > 0 ? (s.buyVolume / s.totalVolume) * 100 : 0,
      sellPct: s.totalVolume > 0 ? (s.sellVolume / s.totalVolume) * 100 : 0,
      barHeight: maxVol > 0 ? (s.totalVolume / maxVol) * 100 : 0,
    }))

    return { sessionStats, dominant, totalVol }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Globe size={12} className="text-accent-blue" />
          Session Volume
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { sessionStats, dominant } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Globe size={12} className="text-accent-blue" />
        Session Volume Profile
      </div>

      <div className="text-[9px] text-gray-600 mb-2">
        Dominant: <span className="text-gray-300 font-medium">{dominant.name}</span> ({dominant.volPct?.toFixed(0)}%)
      </div>

      {/* Session bars */}
      <div className="space-y-1.5">
        {sessionStats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.name}>
              <div className="flex items-center justify-between text-[9px] mb-0.5">
                <div className="flex items-center gap-1">
                  <Icon size={9} style={{ color: s.color }} />
                  <span className="text-gray-400">{s.name}</span>
                </div>
                <span className="text-gray-600 font-mono">{s.volPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-bg-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-accent-green transition-all"
                  style={{ width: `${s.buyPct * s.barHeight / 100}%`, backgroundColor: s.color, opacity: 0.7 }}
                />
                <div
                  className="bg-accent-red transition-all"
                  style={{ width: `${s.sellPct * s.barHeight / 100}%`, backgroundColor: s.color, opacity: 0.35 }}
                />
              </div>
              {s.candles.length > 0 && (
                <div className="flex justify-between text-[7px] text-gray-700 mt-0.5">
                  <span>Buy {s.buyPct.toFixed(0)}%</span>
                  <span>{s.candles.length} candles</span>
                  <span>Sell {s.sellPct.toFixed(0)}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Price ranges */}
      <div className="mt-2 pt-1.5 border-t border-bg-600 space-y-0.5">
        {sessionStats.filter(s => s.candles.length > 0).map(s => (
          <div key={s.name} className="flex justify-between text-[8px]">
            <span className="text-gray-600">{s.name}</span>
            <span className="font-mono text-gray-500">
              {formatPrice(s.low)} - {formatPrice(s.high)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1.5 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Volume distribution by trading session (UTC). London/NY overlap = highest liquidity.
      </div>
    </div>
  )
}
