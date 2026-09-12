import { memo, useMemo } from 'react'
import { Box, Layers, Eye } from 'lucide-react'
import { StatCard, NoDataFeed } from '../utils/ui-helpers'

function imbalanceColor(imb) {
  if (imb >= 0.55) return 'text-accent-green'
  if (imb <= 0.45) return 'text-accent-red'
  return 'text-gray-400'
}

const LiquidityMap3D = memo(function LiquidityMap3D({ currentPrice, orderbooks, exchange, symbol }) {
  const book = orderbooks?.[`${exchange}|${symbol}`]

  const { levels, zones, stats } = useMemo(() => {
    if (!book?.bids?.length || !book?.asks?.length) {
      return { levels: [], zones: [], stats: null }
    }

    // Merge book levels into a symmetric ladder around mid price.
    const bids = book.bids.slice(0, 12)
    const asks = book.asks.slice(0, 12)
    const mid = (bids[0].price + asks[0].price) / 2

    // Bucket both sides onto shared price rows (bucket = spread/2 or 0.05% of mid)
    const step = Math.max(asks[0].price - bids[0].price, mid * 0.0005)
    const rows = new Map()
    for (const b of bids) {
      const k = Math.round(b.price / step) * step
      const r = rows.get(k) ?? { priceLevel: k, bidVol: 0, askVol: 0 }
      r.bidVol += b.quantity
      rows.set(k, r)
    }
    for (const a of asks) {
      const k = Math.round(a.price / step) * step
      const r = rows.get(k) ?? { priceLevel: k, bidVol: 0, askVol: 0 }
      r.askVol += a.quantity
      rows.set(k, r)
    }

    const lv = [...rows.values()]
      .sort((a, b) => a.priceLevel - b.priceLevel)
      .map(r => ({
        ...r,
        depth: r.bidVol + r.askVol,
        imbalance: (r.bidVol + r.askVol) > 0 ? r.bidVol / (r.bidVol + r.askVol) : 0.5,
      }))

    const totalBid = lv.reduce((s, l) => s + l.bidVol, 0)
    const totalAsk = lv.reduce((s, l) => s + l.askVol, 0)
    const totalDepth = totalBid + totalAsk
    const maxDepth = lv.length ? Math.max(...lv.map(l => l.depth)) : 0
    const overallImb = totalDepth > 0 ? totalBid / totalDepth : 0.5

    // Zones = biggest single-side levels on each side
    const z = []
    const maxBid = lv.reduce((m, l) => (l.bidVol > (m?.bidVol ?? 0) ? l : m), null)
    const maxAsk = lv.reduce((m, l) => (l.askVol > (m?.askVol ?? 0) ? l : m), null)
    if (maxBid) z.push({ zone: 'Bid Wall', price: maxBid.priceLevel, volume: maxBid.bidVol, type: 'support' })
    if (maxAsk) z.push({ zone: 'Ask Wall', price: maxAsk.priceLevel, volume: maxAsk.askVol, type: 'resistance' })

    return { levels: lv, zones: z, stats: { totalBid, totalAsk, totalDepth, maxDepth, overallImb } }
  }, [book])

  const midPrice = book?.bids?.[0] && book?.asks?.[0]
    ? (book.bids[0].price + book.asks[0].price) / 2
    : currentPrice

  if (!stats) {
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
        <div className="flex items-center gap-1.5">
          <Box size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Liquidity Map 3D</span>
        </div>
        <NoDataFeed feed={`live order book for ${symbol} on ${exchange}`} />
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Box size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Liquidity Map 3D</span>
        </div>
        <span className="text-[10px] text-gray-600">{midPrice != null ? `$${midPrice.toLocaleString()}` : '—'}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Bid Depth" value={stats.totalBid.toFixed(1)} color="text-accent-green" compact />
        <StatCard label="Ask Depth" value={stats.totalAsk.toFixed(1)} color="text-accent-red" compact />
        <StatCard label="Imbalance" value={`${(stats.overallImb * 100).toFixed(0)}%`} color={imbalanceColor(stats.overallImb)} compact />
        <StatCard label="Max Depth" value={stats.maxDepth.toFixed(1)} color="text-accent-purple" compact />
      </div>

      {/* 3D-style depth visualization */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="flex items-center gap-1 mb-1">
          <Layers size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Depth Profile</span>
        </div>
        <div className="space-y-0.5">
          {levels.map(l => (
            <div key={l.priceLevel} className="flex items-center gap-1">
              <span className={`text-[8px] font-mono w-14 ${Math.abs(l.priceLevel - midPrice) < (levels[1]?.priceLevel - levels[0]?.priceLevel || 1) / 2 ? 'text-accent-yellow font-bold' : 'text-gray-500'}`}>
                ${l.priceLevel.toLocaleString()}
              </span>
              <div className="flex-1 flex items-center gap-0.5">
                <div className="flex-1 flex justify-end">
                  <div className="bg-accent-green opacity-60" style={{ width: `${Math.min(100, (l.bidVol / Math.max(stats.maxDepth, 1e-9)) * 100)}%`, height: '10px' }} />
                </div>
                <div className="w-1" />
                <div className="flex-1">
                  <div className="bg-accent-red opacity-60" style={{ width: `${Math.min(100, (l.askVol / Math.max(stats.maxDepth, 1e-9)) * 100)}%`, height: '10px' }} />
                </div>
              </div>
              <span className={`text-[8px] font-mono w-10 text-right ${imbalanceColor(l.imbalance)}`}>
                {(l.imbalance * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1 text-[8px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green opacity-60" />Bids</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red opacity-60" />Asks</span>
        </div>
      </div>

      {/* Liquidity zones */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Eye size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Liquidity Zones</span>
        </div>
        <div className="space-y-0.5">
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className={`text-[8px] px-1 rounded ${z.type === 'support' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'} w-16 text-center`}>
                {z.type === 'support' ? 'SUPPORT' : 'RESIST'}
              </span>
              <span className="text-[10px] text-gray-300 flex-1">{z.zone}</span>
              <span className="text-[9px] font-mono text-gray-400">${z.price.toLocaleString()}</span>
              <span className="text-[9px] font-mono text-accent-purple">{z.volume.toFixed(1)} {symbol?.split('/')?.[0] ?? ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>Overall: {stats.overallImb > 0.5 ? 'bid-heavy (bullish)' : 'ask-heavy (bearish)'}</span>
        <span>Total depth: {stats.totalDepth.toFixed(1)} {symbol?.split('/')?.[0] ?? ''}</span>
      </div>
    </div>
  )
})

export default LiquidityMap3D
