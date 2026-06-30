import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function DepthChart({ orderbookData, currentPrice }) {
  const depthData = useMemo(() => {
    if (!orderbookData) return null

    const bids = (orderbookData.bids || []).slice(0, 10)
    const asks = (orderbookData.asks || []).slice(0, 10)

    if (bids.length === 0 || asks.length === 0) return null

    // Cumulative depth
    let bidCum = 0
    const bidPoints = bids.map(b => {
      bidCum += b.quantity
      return { price: b.price, cumQty: bidCum }
    })

    let askCum = 0
    const askPoints = asks.map(a => {
      askCum += a.quantity
      return { price: a.price, cumQty: askCum }
    })

    const maxCum = Math.max(bidCum, askCum, 0.001)
    const minPrice = Math.min(bids[bids.length - 1].price, asks[asks.length - 1].price)
    const maxPrice = Math.max(bids[0].price, asks[0].price)
    const priceRange = maxPrice - minPrice || 1

    return { bidPoints, askPoints, maxCum, minPrice, maxPrice, priceRange }
  }, [orderbookData])

  if (!depthData) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-blue" />
          Depth Chart
        </div>
        <div className="text-[10px] text-gray-600 italic py-4 text-center">No order book data</div>
      </div>
    )
  }

  const { bidPoints, askPoints, maxCum, minPrice, maxPrice, priceRange } = depthData
  const W = 100 // percentage width
  const H = 80 // percentage height

  // Build SVG path for bid area (step chart)
  const bidPath = bidPoints.map((p, i) => {
    const x = ((p.price - minPrice) / priceRange) * W
    const y = H - (p.cumQty / maxCum) * H
    if (i === 0) return `M ${x} ${H} L ${x} ${y}`
    const prevX = ((bidPoints[i - 1].price - minPrice) / priceRange) * W
    return `L ${x} ${y}`
  }).join(' ')

  const askPath = askPoints.map((p, i) => {
    const x = ((p.price - minPrice) / priceRange) * W
    const y = H - (p.cumQty / maxCum) * H
    if (i === 0) return `M ${x} ${y}`
    const prevX = ((askPoints[i - 1].price - minPrice) / priceRange) * W
    return `L ${x} ${y}`
  }).join(' ')

  // Close paths for fill
  const bidFill = bidPath + ` L ${((bidPoints[bidPoints.length - 1].price - minPrice) / priceRange) * W} ${H} Z`
  const askFill = askPath + ` L ${((askPoints[askPoints.length - 1].price - minPrice) / priceRange) * W} ${H} Z`

  // Current price position
  const priceX = currentPrice ? ((currentPrice - minPrice) / priceRange) * W : 50

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-blue" />
        Depth Chart
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[80px]" preserveAspectRatio="none">
        {/* Bid area */}
        <path d={bidFill} fill="rgba(34, 197, 94, 0.15)" stroke="#22c55e" strokeWidth="0.5" />
        {/* Ask area */}
        <path d={askFill} fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" strokeWidth="0.5" />
        {/* Current price line */}
        {currentPrice && (
          <line
            x1={priceX} y1="0" x2={priceX} y2={H}
            stroke="#8b95a7" strokeWidth="0.3" strokeDasharray="1,1"
          />
        )}
      </svg>

      {/* Axis labels */}
      <div className="flex justify-between text-[8px] text-gray-600 font-mono mt-0.5">
        <span>${formatPrice(minPrice, 0)}</span>
        <span className="text-gray-400">${formatPrice(currentPrice, 0)}</span>
        <span>${formatPrice(maxPrice, 0)}</span>
      </div>

      {/* Cumulative totals */}
      <div className="flex justify-between text-[9px] mt-1">
        <span className="text-accent-green">Bid: {bidPoints[bidPoints.length - 1].cumQty.toFixed(4)}</span>
        <span className="text-accent-red">Ask: {askPoints[askPoints.length - 1].cumQty.toFixed(4)}</span>
      </div>
    </div>
  )
}
