import { useMemo } from 'react'
import { Scale, ArrowUp, ArrowDown } from 'lucide-react'

export default function OrderFlowImbalance({ orderbookData, currentPrice }) {
  const imbalance = useMemo(() => {
    if (!orderbookData) return null

    const bids = orderbookData.bids || []
    const asks = orderbookData.asks || []
    if (bids.length === 0 || asks.length === 0) return null

    const bidVol = bids.reduce((s, b) => s + b.quantity, 0)
    const askVol = asks.reduce((s, a) => s + a.quantity, 0)
    const totalVol = bidVol + askVol
    if (totalVol === 0) return null

    const bidPct = (bidVol / totalVol) * 100
    const askPct = (askVol / totalVol) * 100
    const ratio = bidVol / askVol
    const delta = bidVol - askVol

    // Top 5 levels depth
    const topBids = bids.slice(0, 5)
    const topAsks = asks.slice(0, 5)
    const topBidVol = topBids.reduce((s, b) => s + b.quantity, 0)
    const topAskVol = topAsks.reduce((s, a) => s + a.quantity, 0)
    const topRatio = topAskVol > 0 ? topBidVol / topAskVol : 0

    // Spread analysis
    const bestBid = bids[0]?.price || 0
    const bestAsk = asks[0]?.price || 0
    const spread = bestAsk - bestBid
    const spreadPct = currentPrice > 0 ? (spread / currentPrice) * 100 : 0

    // Signal
    let signal, signalColor
    if (ratio > 2.0) { signal = 'STRONG BUY PRESSURE'; signalColor = 'text-accent-green' }
    else if (ratio > 1.3) { signal = 'BUY BIAS'; signalColor = 'text-accent-green' }
    else if (ratio < 0.5) { signal = 'STRONG SELL PRESSURE'; signalColor = 'text-accent-red' }
    else if (ratio < 0.77) { signal = 'SELL BIAS'; signalColor = 'text-accent-red' }
    else { signal = 'BALANCED'; signalColor = 'text-gray-400' }

    return {
      bidVol, askVol, bidPct, askPct, ratio, delta,
      topBidVol, topAskVol, topRatio,
      spread, spreadPct,
      signal, signalColor,
    }
  }, [orderbookData, currentPrice])

  if (!imbalance) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Scale size={12} className="text-accent-blue" />
          Order Flow Imbalance
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No order book data</div>
      </div>
    )
  }

  const { bidPct, askPct, ratio, delta, topRatio, spread, spreadPct, signal, signalColor } = imbalance

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Scale size={12} className="text-accent-blue" />
        Order Flow Imbalance
      </div>

      {/* Signal */}
      <div className={`text-center text-[11px] font-bold ${signalColor} mb-2`}>
        {signal}
      </div>

      {/* Bid/Ask balance bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[9px] mb-0.5">
          <span className="text-accent-green flex items-center gap-0.5">
            <ArrowDown size={9} /> Bids {bidPct.toFixed(1)}%
          </span>
          <span className="text-accent-red flex items-center gap-0.5">
            Asks {askPct.toFixed(1)}% <ArrowUp size={9} />
          </span>
        </div>
        <div className="flex h-3 rounded-sm overflow-hidden">
          <div className="bg-accent-green/60" style={{ width: `${bidPct}%` }} />
          <div className="bg-accent-red/60" style={{ width: `${askPct}%` }} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">B/A Ratio</div>
          <div className={'font-mono ' + (ratio > 1 ? 'text-accent-green' : 'text-accent-red')}>
            {ratio.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Delta</div>
          <div className={'font-mono ' + (delta >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(4)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Top5 Ratio</div>
          <div className={'font-mono ' + (topRatio > 1 ? 'text-accent-green' : 'text-accent-red')}>
            {topRatio.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded px-2 py-1">
          <div className="text-gray-600">Spread</div>
          <div className="font-mono text-gray-400">
            {spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
          </div>
        </div>
      </div>
    </div>
  )
}
