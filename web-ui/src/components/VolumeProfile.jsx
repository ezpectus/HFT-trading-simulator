import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function VolumeProfile({ candles, symbol }) {
  const profile = useMemo(() => {
    if (!candles?.length || candles.length < 10) return null

    const recent = candles.slice(-100)
    const prices = recent.map(c => c.close)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice || 1

    // Create 20 price bins
    const BINS = 20
    const binSize = priceRange / BINS
    const bins = new Array(BINS).fill(0).map((_, i) => ({
      min: minPrice + i * binSize,
      max: minPrice + (i + 1) * binSize,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    }))

    for (const c of recent) {
      const typicalPrice = (c.high + c.low + c.close) / 3
      const binIdx = Math.min(BINS - 1, Math.floor((typicalPrice - minPrice) / binSize))
      if (binIdx >= 0 && binIdx < BINS) {
        bins[binIdx].volume += c.volume
        if (c.close >= c.open) {
          bins[binIdx].buyVolume += c.volume
        } else {
          bins[binIdx].sellVolume += c.volume
        }
      }
    }

    // Find POC (Point of Control) — bin with highest volume
    let pocIdx = 0
    let maxVol = 0
    bins.forEach((b, i) => {
      if (b.volume > maxVol) {
        maxVol = b.volume
        pocIdx = i
      }
    })

    // Value Area (70% of volume around POC)
    const totalVol = bins.reduce((s, b) => s + b.volume, 0)
    const targetVol = totalVol * 0.70
    let vaVol = bins[pocIdx].volume
    let vaLow = pocIdx
    let vaHigh = pocIdx
    while (vaVol < targetVol && (vaLow > 0 || vaHigh < BINS - 1)) {
      if (vaLow > 0 && (vaHigh >= BINS - 1 || bins[vaLow - 1].volume >= bins[vaHigh + 1].volume)) {
        vaLow--
        vaVol += bins[vaLow].volume
      } else if (vaHigh < BINS - 1) {
        vaHigh++
        vaVol += bins[vaHigh].volume
      } else break
    }

    const maxBinVol = Math.max(...bins.map(b => b.volume), 0.001)

    return {
      bins,
      pocIdx,
      pocPrice: (bins[pocIdx].min + bins[pocIdx].max) / 2,
      vaLow: bins[vaLow].min,
      vaHigh: bins[vaHigh].max,
      maxBinVol,
      minPrice,
      maxPrice,
    }
  }, [candles])

  if (!profile) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-orange" />
          Volume Profile
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { bins, pocIdx, pocPrice, vaLow, vaHigh, maxBinVol } = profile

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-orange" />
        Volume Profile
      </div>

      {/* POC + Value Area info */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-[9px]">
        <div>
          <div className="text-gray-600">POC</div>
          <div className="font-mono text-accent-orange">${formatPrice(pocPrice)}</div>
        </div>
        <div>
          <div className="text-gray-600">VA Low</div>
          <div className="font-mono text-gray-400">${formatPrice(vaLow)}</div>
        </div>
        <div>
          <div className="text-gray-600">VA High</div>
          <div className="font-mono text-gray-400">${formatPrice(vaHigh)}</div>
        </div>
      </div>

      {/* Horizontal volume bars */}
      <div className="space-y-0.5">
        {bins.map((bin, i) => {
          const widthPct = (bin.volume / maxBinVol) * 100
          const isPOC = i === pocIdx
          const inVA = i >= bins.findIndex(b => b.min === vaLow) && i <= bins.findIndex(b => b.max === vaHigh)
          const buyPct = bin.volume > 0 ? (bin.buyVolume / bin.volume) * 100 : 0

          return (
            <div key={i} className="flex items-center gap-1 group">
              {/* Price label */}
              <div className="w-14 text-[7px] font-mono text-gray-600 text-right shrink-0">
                {formatPrice((bin.min + bin.max) / 2, 0)}
              </div>
              {/* Bar container */}
              <div className="flex-1 relative h-3 bg-bg-600/30 rounded-sm overflow-hidden">
                {/* Buy volume (green) */}
                <div
                  className="absolute left-0 top-0 h-full bg-accent-green/40"
                  style={{ width: `${(widthPct * buyPct) / 100}%` }}
                />
                {/* Sell volume (red) */}
                <div
                  className="absolute top-0 h-full bg-accent-red/40"
                  style={{ left: `${(widthPct * buyPct) / 100}%`, width: `${(widthPct * (100 - buyPct)) / 100}%` }}
                />
                {/* POC marker */}
                {isPOC && (
                  <div className="absolute right-0 top-0 h-full flex items-center pr-1">
                    <span className="text-[7px] text-accent-orange font-bold">POC</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 flex items-center justify-between text-[8px] text-gray-600">
        <span><span className="text-accent-green">■</span> Buy vol <span className="text-accent-red ml-1">■</span> Sell vol</span>
        <span>100 candles · 20 bins</span>
      </div>
    </div>
  )
}
