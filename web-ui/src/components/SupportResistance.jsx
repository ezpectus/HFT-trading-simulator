import { useMemo } from 'react'
import { Layers, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function SupportResistance({ candles, currentPrice }) {
  const levels = useMemo(() => {
    if (!candles?.length || candles.length < 20) return null

    const recent = candles.slice(-100)
    const touches = {}

    // Detect swing highs and lows
    const WINDOW = 3
    for (let i = WINDOW; i < recent.length - WINDOW; i++) {
      let isHigh = true, isLow = true
      for (let j = 1; j <= WINDOW; j++) {
        if (recent[i].high <= recent[i - j].high || recent[i].high <= recent[i + j].high) isHigh = false
        if (recent[i].low >= recent[i - j].low || recent[i].low >= recent[i + j].low) isLow = false
      }
      if (isHigh) {
        const key = Math.round(recent[i].high)
        touches[key] = (touches[key] || 0) + 1
      }
      if (isLow) {
        const key = Math.round(recent[i].low)
        touches[key] = (touches[key] || 0) + 1
      }
    }

    // Cluster nearby levels (within 0.5% of each other)
    const sorted = Object.entries(touches).map(([price, count]) => ({
      price: Number(price),
      count,
    })).sort((a, b) => a.price - b.price)

    const clusters = []
    let currentCluster = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const last = currentCluster[currentCluster.length - 1]
      const distPct = Math.abs(sorted[i].price - last.price) / last.price
      if (distPct < 0.005) {
        currentCluster.push(sorted[i])
      } else {
        clusters.push(currentCluster)
        currentCluster = [sorted[i]]
      }
    }
    clusters.push(currentCluster)

    // Merge clusters into levels
    const merged = clusters.map(cluster => {
      const avgPrice = cluster.reduce((s, l) => s + l.price * l.count, 0) / cluster.reduce((s, l) => s + l.count, 0)
      const totalTouches = cluster.reduce((s, l) => s + l.count, 0)
      return { price: avgPrice, touches: totalTouches }
    })

    // Classify as support or resistance based on current price
    const price = currentPrice || recent[recent.length - 1].close
    const supports = merged.filter(l => l.price < price).sort((a, b) => b.price - a.price).slice(0, 3)
    const resistances = merged.filter(l => l.price > price).sort((a, b) => a.price - b.price).slice(0, 3)

    return { supports, resistances, currentPrice: price }
  }, [candles, currentPrice])

  if (!levels) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Layers size={12} className="text-accent-blue" />
          Support / Resistance
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers size={12} className="text-accent-blue" />
        Support / Resistance
      </div>

      {/* Resistance levels (above current price) */}
      <div className="mb-2">
        <div className="flex items-center gap-1 text-[9px] text-accent-red mb-1">
          <TrendingUp size={10} />
          Resistance
        </div>
        {levels.resistances.length === 0 ? (
          <div className="text-[9px] text-gray-600 italic pl-3">None detected above</div>
        ) : (
          <div className="space-y-0.5">
            {levels.resistances.map((r, i) => (
              <LevelRow key={i} level={r} type="resistance" currentPrice={levels.currentPrice} />
            ))}
          </div>
        )}
      </div>

      {/* Current price divider */}
      <div className="flex items-center gap-2 py-1 border-y border-bg-600 mb-2">
        <div className="text-[9px] text-gray-500">Current</div>
        <div className="flex-1" />
        <div className="text-[10px] font-mono text-gray-300">${formatPrice(levels.currentPrice)}</div>
      </div>

      {/* Support levels (below current price) */}
      <div>
        <div className="flex items-center gap-1 text-[9px] text-accent-green mb-1">
          <TrendingDown size={10} />
          Support
        </div>
        {levels.supports.length === 0 ? (
          <div className="text-[9px] text-gray-600 italic pl-3">None detected below</div>
        ) : (
          <div className="space-y-0.5">
            {levels.supports.map((s, i) => (
              <LevelRow key={i} level={s} type="support" currentPrice={levels.currentPrice} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Auto-detected from swing highs/lows (100 candles, window=3). Touches = number of times level was tested.
      </div>
    </div>
  )
}

function LevelRow({ level, type, currentPrice }) {
  const distPct = Math.abs(level.price - currentPrice) / currentPrice * 100
  const strength = level.touches >= 3 ? 'strong' : level.touches >= 2 ? 'medium' : 'weak'
  const strengthColor = strength === 'strong' ? 'text-accent-yellow' : strength === 'medium' ? 'text-gray-400' : 'text-gray-600'

  return (
    <div className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-bg-600/30">
      <span className={'text-[10px] font-mono ' + (type === 'resistance' ? 'text-accent-red' : 'text-accent-green')}>
        ${formatPrice(level.price)}
      </span>
      <span className="text-[8px] text-gray-600">{distPct.toFixed(1)}% away</span>
      <div className="flex-1" />
      <span className={`text-[7px] ${strengthColor}`}>
        {level.touches}× {strength}
      </span>
    </div>
  )
}
