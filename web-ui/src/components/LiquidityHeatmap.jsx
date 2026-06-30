import { useMemo, useRef, useEffect, useState } from 'react'
import { Droplets } from 'lucide-react'
import { formatPrice } from '../utils/format'

const MAX_SNAPSHOTS = 20

export default function LiquidityHeatmap({ orderbookData, currentPrice }) {
  const snapshotsRef = useRef([])
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!orderbookData) return
    const bids = (orderbookData.bids || []).slice(0, 15)
    const asks = (orderbookData.asks || []).slice(0, 15)
    if (bids.length === 0 || asks.length === 0) return

    const snap = {
      time: Date.now(),
      pools: [
        ...bids.map(b => ({ price: b.price, qty: b.quantity, side: 'bid' })),
        ...asks.map(a => ({ price: a.price, qty: a.quantity, side: 'ask' })),
      ],
    }

    snapshotsRef.current = [...snapshotsRef.current.slice(-MAX_SNAPSHOTS + 1), snap]
    forceUpdate(n => n + 1)
  }, [orderbookData])

  const heatmap = useMemo(() => {
    const snaps = snapshotsRef.current
    if (snaps.length < 2) return null

    // Use latest snapshot to define price range
    const latest = snaps[snaps.length - 1]
    const allPrices = latest.pools.map(p => p.price).sort((a, b) => a - b)
    if (allPrices.length === 0) return null

    const minP = allPrices[0]
    const maxP = allPrices[allPrices.length - 1]
    const range = maxP - minP || 1

    // Grid: rows = price levels, cols = snapshots
    const ROWS = 15
    const grid = []

    for (let r = 0; r < ROWS; r++) {
      const rowLow = minP + (r / ROWS) * range
      const rowHigh = minP + ((r + 1) / ROWS) * range
      const cells = []

      for (let c = 0; c < snaps.length; c++) {
        const snap = snaps[c]
        let bidLiq = 0, askLiq = 0
        for (const pool of snap.pools) {
          if (pool.price >= rowLow && pool.price < rowHigh) {
            if (pool.side === 'bid') bidLiq += pool.qty
            else askLiq += pool.qty
          }
        }
        cells.push({ bidLiq, askLiq, total: bidLiq + askLiq })
      }
      grid.push({ rowLow, rowHigh, mid: (rowLow + rowHigh) / 2, cells })
    }

    const maxLiq = Math.max(...grid.flatMap(r => r.cells.map(c => c.total)), 0.001)

    // Identify persistent pools (high liquidity across multiple snapshots)
    const pools = []
    for (const row of grid) {
      const persistence = row.cells.filter(c => c.total > maxLiq * 0.3).length
      if (persistence >= snaps.length * 0.5) {
        pools.push({
          price: row.mid,
          persistence: persistence / snaps.length,
          avgLiq: row.cells.reduce((s, c) => s + c.total, 0) / row.cells.length,
          dominantSide: row.cells.reduce((s, c) => s + (c.bidLiq - c.askLiq), 0) > 0 ? 'bid' : 'ask',
        })
      }
    }

    return { grid, maxLiq, pools, cols: snaps.length, minP, maxP }
  }, [snapshotsRef.current.length, orderbookData])

  if (!heatmap) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Droplets size={12} className="text-accent-blue" />
          Liquidity Heatmap
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Collecting data...</div>
      </div>
    )
  }

  const { grid, maxLiq, pools, cols } = heatmap

  function liqColor(total, maxLiq) {
    if (total === 0) return 'bg-bg-600/20'
    const t = total / maxLiq
    if (t > 0.7) return 'bg-accent-blue'
    if (t > 0.4) return 'bg-accent-blue/60'
    if (t > 0.2) return 'bg-accent-blue/30'
    return 'bg-accent-blue/10'
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Droplets size={12} className="text-accent-blue" />
        Liquidity Heatmap
        <span className="text-gray-600 ml-auto">{cols} snapshots</span>
      </div>

      {/* Heatmap grid */}
      <div className="flex gap-0.5 mb-2">
        {/* Price axis */}
        <div className="flex flex-col justify-between">
          {grid.map((row, i) => (
            <div key={i} className="text-[7px] font-mono text-gray-600 text-right w-10 h-[10px] leading-[10px]">
              {formatPrice(row.mid, 0)}
            </div>
          ))}
        </div>

        {/* Heat cells */}
        <div className="flex-1 space-y-0.5">
          {grid.map((row, ri) => (
            <div key={ri} className="flex gap-0.5 h-[10px]">
              {row.cells.map((cell, ci) => (
                <div
                  key={ci}
                  className={'flex-1 rounded-sm ' + liqColor(cell.total, maxLiq)}
                  title={`$${formatPrice(row.mid, 0)}: liq ${cell.total.toFixed(4)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Persistent pools */}
      {pools.length > 0 && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1">Persistent Liquidity Pools</div>
          <div className="space-y-0.5">
            {pools.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[8px] bg-bg-600/40 rounded px-1.5 py-0.5">
                <span className={'w-1.5 h-1.5 rounded-full ' + (p.dominantSide === 'bid' ? 'bg-accent-green' : 'bg-accent-red')} />
                <span className="font-mono text-gray-300">${formatPrice(p.price, 0)}</span>
                <span className="text-gray-600">{p.avgLiq.toFixed(3)} avg</span>
                <span className="text-accent-blue ml-auto">{(p.persistence * 100).toFixed(0)}% persistent</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-between text-[7px] text-gray-600">
        <div className="flex items-center gap-1">
          <span>Low</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-2 bg-bg-600/20 rounded-sm" />
            <div className="w-3 h-2 bg-accent-blue/10 rounded-sm" />
            <div className="w-3 h-2 bg-accent-blue/30 rounded-sm" />
            <div className="w-3 h-2 bg-accent-blue/60 rounded-sm" />
            <div className="w-3 h-2 bg-accent-blue rounded-sm" />
          </div>
          <span>High</span>
        </div>
        <span>Liquidity density</span>
      </div>
    </div>
  )
}
