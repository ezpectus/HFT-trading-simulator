import { useMemo } from 'react'
import { ShieldAlert, Eye, TrendingUp } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function SpoofingDetector({ orderbookData, currentPrice }) {
  const analysis = useMemo(() => {
    if (!orderbookData) return null

    const bids = orderbookData.bids || []
    const asks = orderbookData.asks || []
    if (bids.length < 3 || asks.length < 3) return null

    // Calculate average order size
    const allOrders = [...bids, ...asks]
    const avgSize = allOrders.reduce((s, o) => s + o.quantity, 0) / allOrders.length
    const threshold = avgSize * 5 // 5x average = suspicious

    // Detect large orders far from mid price (likely spoofing)
    const suspiciousBids = []
    const suspiciousAsks = []

    for (const b of bids) {
      const distPct = currentPrice > 0 ? Math.abs(b.price - currentPrice) / currentPrice * 100 : 0
      if (b.quantity > threshold && distPct > 0.1) {
        suspiciousBids.push({
          price: b.price,
          quantity: b.quantity,
          ratio: b.quantity / avgSize,
          distance: distPct,
        })
      }
    }

    for (const a of asks) {
      const distPct = currentPrice > 0 ? Math.abs(a.price - currentPrice) / currentPrice * 100 : 0
      if (a.quantity > threshold && distPct > 0.1) {
        suspiciousAsks.push({
          price: a.price,
          quantity: a.quantity,
          ratio: a.quantity / avgSize,
          distance: distPct,
        })
      }
    }

    // Layering detection: multiple large orders at adjacent levels
    const bidLayering = detectLayering(bids, avgSize)
    const askLayering = detectLayering(asks, avgSize)

    // Overall spoofing score
    const totalSuspicious = suspiciousBids.length + suspiciousAsks.length
    let score = 0
    score += totalSuspicious * 15
    score += bidLayering * 10
    score += askLayering * 10
    score = Math.min(100, score)

    let signal, signalColor
    if (score > 60) { signal = 'HIGH SPOOFING RISK'; signalColor = 'text-accent-red' }
    else if (score > 30) { signal = 'MODERATE RISK'; signalColor = 'text-accent-yellow' }
    else if (score > 10) { signal = 'LOW RISK'; signalColor = 'text-gray-400' }
    else { signal = 'CLEAN'; signalColor = 'text-accent-green' }

    // Pressure direction from spoofing
    let pressure = 'NEUTRAL'
    let pressureColor = 'text-gray-400'
    if (suspiciousBids.length > suspiciousAsks.length + 1) {
      pressure = 'FAKE BID WALL (bearish)'
      pressureColor = 'text-accent-red'
    } else if (suspiciousAsks.length > suspiciousBids.length + 1) {
      pressure = 'FAKE ASK WALL (bullish)'
      pressureColor = 'text-accent-green'
    }

    return {
      suspiciousBids: suspiciousBids.sort((a, b) => b.ratio - a.ratio).slice(0, 3),
      suspiciousAsks: suspiciousAsks.sort((a, b) => b.ratio - a.ratio).slice(0, 3),
      bidLayering,
      askLayering,
      score,
      signal,
      signalColor,
      pressure,
      pressureColor,
      avgSize,
    }
  }, [orderbookData, currentPrice])

  if (!analysis) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <ShieldAlert size={12} className="text-accent-red" />
          Spoofing Detector
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No order book data</div>
      </div>
    )
  }

  const { suspiciousBids, suspiciousAsks, bidLayering, askLayering, score, signal, signalColor, pressure, pressureColor } = analysis

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <ShieldAlert size={12} className="text-accent-red" />
        Spoofing Detector
      </div>

      {/* Signal */}
      <div className={`text-center text-[11px] font-bold ${signalColor} mb-2`}>{signal}</div>

      {/* Score bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[8px] text-gray-600 mb-0.5">
          <span>Risk Score</span>
          <span>{score}/100</span>
        </div>
        <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden">
          <div
            className={'h-full rounded-full ' + (score > 60 ? 'bg-accent-red' : score > 30 ? 'bg-accent-yellow' : 'bg-accent-green')}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Pressure direction */}
      {pressure !== 'NEUTRAL' && (
        <div className={`text-center text-[9px] font-medium ${pressureColor} mb-2`}>
          {pressure}
        </div>
      )}

      {/* Suspicious orders */}
      {(suspiciousBids.length > 0 || suspiciousAsks.length > 0) && (
        <div className="space-y-1 mb-2">
          <div className="text-[8px] text-gray-600 uppercase">Large Orders (5x+ avg, far from mid)</div>
          {suspiciousBids.map((o, i) => (
            <SuspiciousRow key={`b${i}`} order={o} side="bid" />
          ))}
          {suspiciousAsks.map((o, i) => (
            <SuspiciousRow key={`a${i}`} order={o} side="ask" />
          ))}
        </div>
      )}

      {/* Layering */}
      {(bidLayering > 0 || askLayering > 0) && (
        <div className="grid grid-cols-2 gap-2 text-[9px] mb-2">
          <div className="bg-bg-600/50 rounded px-2 py-1">
            <div className="text-gray-600">Bid Layering</div>
            <div className={bidLayering > 1 ? 'text-accent-red font-mono' : 'text-gray-300 font-mono'}>
              {bidLayering} clusters
            </div>
          </div>
          <div className="bg-bg-600/50 rounded px-2 py-1">
            <div className="text-gray-600">Ask Layering</div>
            <div className={askLayering > 1 ? 'text-accent-red font-mono' : 'text-gray-300 font-mono'}>
              {askLayering} clusters
            </div>
          </div>
        </div>
      )}

      {suspiciousBids.length === 0 && suspiciousAsks.length === 0 && bidLayering === 0 && askLayering === 0 && (
        <div className="text-[10px] text-gray-600 italic py-1 text-center">No suspicious patterns</div>
      )}

      <div className="mt-1.5 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Detects large orders 5x+ avg size far from mid price. Layering = multiple large orders at adjacent levels.
      </div>
    </div>
  )
}

function detectLayering(orders, avgSize) {
  const threshold = avgSize * 3
  let clusters = 0
  let inCluster = false

  for (let i = 0; i < orders.length; i++) {
    if (orders[i].quantity > threshold) {
      if (!inCluster) {
        inCluster = true
      }
    } else {
      if (inCluster) {
        clusters++
        inCluster = false
      }
    }
  }
  if (inCluster) clusters++
  return clusters
}

function SuspiciousRow({ order, side }) {
  const isBid = side === 'bid'
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-bg-600/50">
      <div className={'w-1.5 h-1.5 rounded-full ' + (isBid ? 'bg-accent-green' : 'bg-accent-red')} />
      <span className={'text-[9px] font-mono ' + (isBid ? 'text-accent-green' : 'text-accent-red')}>
        ${formatPrice(order.price)}
      </span>
      <span className="text-[9px] text-gray-400">{order.quantity.toFixed(4)}</span>
      <span className="text-[8px] text-accent-yellow">{order.ratio.toFixed(1)}x</span>
      <span className="text-[8px] text-gray-600 ml-auto">{order.distance.toFixed(2)}% away</span>
    </div>
  )
}
