import { useMemo, useRef, useEffect, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { formatPrice } from '../utils/format'

const MAX_HISTORY = 30

export default function OrderBookHeatmap({ orderbookData, currentPrice }) {
  const historyRef = useRef([])
  const [, forceUpdate] = useState(0)

  // Record order book snapshots
  useEffect(() => {
    if (!orderbookData) return
    const bids = (orderbookData.bids || []).slice(0, 10)
    const asks = (orderbookData.asks || []).slice(0, 10)
    if (bids.length === 0 || asks.length === 0) return

    const snapshot = {
      time: Date.now(),
      bids: bids.map(b => ({ price: b.price, qty: b.quantity })),
      asks: asks.map(a => ({ price: a.price, qty: a.quantity })),
      midPrice: currentPrice || (bids[0].price + asks[0].price) / 2,
    }

    historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), snapshot]
    forceUpdate(n => n + 1)
  }, [orderbookData, currentPrice])

  const heatmap = useMemo(() => {
    const history = historyRef.current
    if (history.length < 2) return null

    // Use latest snapshot to define price levels
    const latest = history[history.length - 1]
    const allPrices = [
      ...latest.bids.map(b => b.price),
      ...latest.asks.map(a => a.price),
    ].sort((a, b) => a - b)

    if (allPrices.length === 0) return null

    const minPrice = allPrices[0]
    const maxPrice = allPrices[allPrices.length - 1]
    const priceRange = maxPrice - minPrice || 1

    // Build grid: rows = price levels (10), cols = time snapshots
    const ROWS = 10
    const grid = []

    for (let r = 0; r < ROWS; r++) {
      const rowMin = minPrice + (r / ROWS) * priceRange
      const rowMax = minPrice + ((r + 1) / ROWS) * priceRange
      const cells = []

      for (let c = 0; c < history.length; c++) {
        const snap = history[c]
        let vol = 0
        for (const b of snap.bids) {
          if (b.price >= rowMin && b.price < rowMax) vol += b.qty
        }
        for (const a of snap.asks) {
          if (a.price >= rowMin && b.price < rowMax) vol += a.qty
        }
        cells.push(vol)
      }
      grid.push({ rowMin, rowMax, cells })
    }

    // Find max volume for color scaling
    const maxVol = Math.max(...grid.flatMap(r => r.cells), 0.001)

    return { grid, maxVol, minPrice, maxPrice, cols: history.length }
  }, [historyRef.current.length, orderbookData])

  if (!heatmap) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-orange" />
          Order Book Heatmap
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Collecting data...</div>
      </div>
    )
  }

  const { grid, maxVol, minPrice, maxPrice, cols } = heatmap

  function volColor(vol) {
    if (vol === 0) return 'bg-bg-600/30'
    const intensity = Math.min(1, vol / maxVol)
    if (intensity > 0.7) return 'bg-accent-orange'
    if (intensity > 0.4) return 'bg-accent-orange/60'
    if (intensity > 0.2) return 'bg-accent-orange/30'
    return 'bg-accent-orange/10'
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-orange" />
        Order Book Heatmap
      </div>

      {/* Heatmap grid */}
      <div className="flex gap-0.5">
        {/* Price axis */}
        <div className="flex flex-col gap-0.5 justify-between py-0">
          {grid.map((row, i) => (
            <div key={i} className="text-[7px] font-mono text-gray-600 text-right w-10">
              {formatPrice((row.rowMin + row.rowMax) / 2, 0)}
            </div>
          ))}
        </div>

        {/* Heat cells */}
        <div className="flex-1 space-y-0.5">
          {grid.map((row, ri) => (
            <div key={ri} className="flex gap-0.5">
              {row.cells.map((vol, ci) => (
                <div
                  key={ci}
                  className={'flex-1 h-3 rounded-sm ' + volColor(vol)}
                  title={`$${formatPrice((row.rowMin + row.rowMax) / 2, 0)}: vol ${vol.toFixed(4)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[7px] text-gray-600 mt-1 ml-12">
        <span>← {cols} snapshots →</span>
      </div>

      {/* Legend */}
      <div className="mt-2 pt-1.5 border-t border-bg-600 flex items-center justify-between text-[8px] text-gray-600">
        <div className="flex items-center gap-1">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-2 bg-bg-600/30 rounded-sm" />
            <div className="w-3 h-2 bg-accent-orange/10 rounded-sm" />
            <div className="w-3 h-2 bg-accent-orange/30 rounded-sm" />
            <div className="w-3 h-2 bg-accent-orange/60 rounded-sm" />
            <div className="w-3 h-2 bg-accent-orange rounded-sm" />
          </div>
          <span>High</span>
        </div>
        <span>Volume intensity</span>
      </div>
    </div>
  )
}
