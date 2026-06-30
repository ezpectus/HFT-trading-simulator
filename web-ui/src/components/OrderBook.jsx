import { useMemo, useState } from 'react'
import { BookOpen, BarChart3, Flame } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function OrderBook({ exchange, symbol, currentPrice, orderbookData }) {
  const [heatmapMode, setHeatmapMode] = useState(true)
  // Use real order book data from WebSocket if available, otherwise generate synthetic
  const { bids, asks, spreadBps, bidDepth, askDepth, imbalance } = useMemo(() => {
    if (orderbookData && orderbookData.bids?.length && orderbookData.asks?.length) {
      const realBids = []
      const realAsks = []
      let cumBid = 0, cumAsk = 0

      for (const b of orderbookData.bids.slice(0, 15)) {
        cumBid += b.quantity
        realBids.push({ price: b.price, qty: b.quantity, total: cumBid })
      }
      for (const a of orderbookData.asks.slice(0, 15)) {
        cumAsk += a.quantity
        realAsks.push({ price: a.price, qty: a.quantity, total: cumAsk })
      }

      const bestBid = realBids[0]?.price || currentPrice
      const bestAsk = realAsks[0]?.price || currentPrice
      const spread = bestAsk - bestBid
      const bps = currentPrice > 0 ? (spread / currentPrice) * 10000 : 0
      const imb = cumBid + cumAsk > 0 ? (cumBid - cumAsk) / (cumBid + cumAsk) : 0

      return { bids: realBids, asks: realAsks, spreadBps: bps, bidDepth: cumBid, askDepth: cumAsk, imbalance: imb }
    }

    // Fallback: synthetic order book from current price
    if (!currentPrice) return { bids: [], asks: [], spreadBps: 0, bidDepth: 0, askDepth: 0, imbalance: 0 }

    const depth = 15
    const halfSpread = currentPrice * 0.0002
    const synBids = []
    const synAsks = []
    let cumBid = 0, cumAsk = 0

    for (let i = 0; i < depth; i++) {
      const bidPrice = currentPrice - halfSpread * (1 + i * 1.1)
      const askPrice = currentPrice + halfSpread * (1 + i * 1.1)
      const decay = Math.pow(0.92, i)
      const bidQty = (0.5 + Math.random() * 0.5) * decay * 2
      const askQty = (0.5 + Math.random() * 0.5) * decay * 2
      cumBid += bidQty
      cumAsk += askQty
      synBids.push({ price: bidPrice, qty: bidQty, total: cumBid })
      synAsks.push({ price: askPrice, qty: askQty, total: cumAsk })
    }

    const imb = cumBid + cumAsk > 0 ? (cumBid - cumAsk) / (cumBid + cumAsk) : 0
    return { bids: synBids, asks: synAsks, spreadBps: (halfSpread * 2 / currentPrice) * 10000, bidDepth: cumBid, askDepth: cumAsk, imbalance: imb }
  }, [currentPrice, orderbookData])

  const maxTotal = Math.max(
    ...bids.map(b => b.total),
    ...asks.map(a => a.total),
    1
  )

  const maxQty = Math.max(
    ...bids.map(b => b.qty),
    ...asks.map(a => a.qty),
    0.1
  )

  const imbPct = (imbalance * 100).toFixed(1)
  const imbColor = imbalance > 0.1 ? 'text-accent-green' : imbalance < -0.1 ? 'text-accent-red' : 'text-gray-400'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-bg-600">
        <BookOpen size={16} className="text-accent-blue" />
        <span className="text-sm font-medium">Order Book</span>
        <button
          onClick={() => setHeatmapMode(!heatmapMode)}
          className={'ml-auto p-0.5 rounded transition-colors ' + (heatmapMode ? 'text-accent-orange bg-bg-600' : 'text-gray-500 hover:bg-bg-600')}
          title="Toggle depth heatmap"
        >
          <Flame size={12} />
        </button>
        <span className="text-xs text-gray-500">{spreadBps.toFixed(1)} bps</span>
      </div>

      {/* Depth imbalance bar */}
      <div className="px-3 py-1 border-b border-bg-600">
        <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
          <span className="flex items-center gap-1">
            <BarChart3 size={10} />
            Depth Imbalance
          </span>
          <span className={`font-mono ${imbColor}`}>
            {imbPct > 0 ? '+' : ''}{imbPct}% {imbalance > 0.1 ? '← BID' : imbalance < -0.1 ? 'ASK →' : 'BAL'}
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-bg-600">
          <div className="bg-accent-green/60" style={{ width: `${(bidDepth / (bidDepth + askDepth)) * 100}%` }} />
          <div className="bg-accent-red/60" style={{ width: `${(askDepth / (bidDepth + askDepth)) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 font-mono mt-0.5">
          <span className="text-accent-green/70">{formatVolume(bidDepth)}</span>
          <span className="text-accent-red/70">{formatVolume(askDepth)}</span>
        </div>
      </div>

      {/* Header row */}
      <div className="flex px-3 py-1 text-xs text-gray-500 border-b border-bg-600">
        <span className="w-1/3">Price</span>
        <span className="w-1/3 text-right">Size</span>
        <span className="w-1/3 text-right">Total</span>
      </div>

      {/* Asks (reversed: highest at top) */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse">
        {asks.slice(0, 10).map((ask, i) => (
          <OrderBookRow key={`ask-${i}`} row={ask} maxTotal={maxTotal} maxQty={maxQty} side="ask" heatmap={heatmapMode} />
        ))}
      </div>

      {/* Spread / mid price */}
      <div className="px-3 py-1 border-y border-bg-600 bg-bg-700 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-accent-blue">
          ${formatPrice(currentPrice)}
        </span>
        <span className="text-[10px] text-gray-500">
          spread ${formatPrice(Math.abs((asks[0]?.price || 0) - (bids[0]?.price || 0)), 2)}
        </span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-y-auto">
        {bids.slice(0, 10).map((bid, i) => (
          <OrderBookRow key={`bid-${i}`} row={bid} maxTotal={maxTotal} maxQty={maxQty} side="bid" heatmap={heatmapMode} />
        ))}
      </div>
    </div>
  )
}

function OrderBookRow({ row, maxTotal, maxQty, side, heatmap }) {
  const totalPct = (row.total / maxTotal) * 100
  const qtyPct = (row.qty / maxQty) * 100
  const bgColor = side === 'bid' ? 'bg-accent-green' : 'bg-accent-red'
  const textColor = side === 'bid' ? 'text-accent-green' : 'text-accent-red'

  // Heatmap intensity: 0-1 based on qty relative to max
  const heatIntensity = Math.min(1, row.qty / maxQty)

  return (
    <div className="relative flex px-3 py-0.5 text-xs font-mono hover:bg-bg-700">
      {/* Cumulative depth bar (background) */}
      <div
        className={'absolute top-0 right-0 h-full opacity-10 ' + bgColor}
        style={{ width: totalPct + '%' }}
      />
      {/* Per-level qty bar */}
      <div
        className={'absolute top-0 right-0 h-full ' + bgColor}
        style={{
          width: qtyPct + '%',
          opacity: heatmap ? 0.15 + heatIntensity * 0.5 : 0.2,
        }}
      />
      {heatmap && heatIntensity > 0.5 && (
        <div
          className="absolute top-0 right-0 h-full"
          style={{
            width: qtyPct + '%',
            background: side === 'bid'
              ? 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.15))'
              : 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.15))',
          }}
        />
      )}
      <span className={'w-1/3 relative ' + textColor}>{formatPrice(row.price)}</span>
      <span className={'w-1/3 text-right relative ' + (heatmap && heatIntensity > 0.6 ? 'text-white font-bold' : 'text-gray-300')}>{formatVolume(row.qty)}</span>
      <span className="w-1/3 text-right text-gray-500 relative">{formatVolume(row.total)}</span>
    </div>
  )
}
