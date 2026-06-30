import { useMemo } from 'react'
import { Shield, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { formatVolume, formatPrice } from '../utils/format'

export default function OrderFlowAbsorption({ candles, fills, orderbooks, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-30)
    if (symCandles.length < 10) return null

    // Get fills for this symbol
    const symFills = (fills || [])
      .filter(f => f.symbol === symbol && f.exchange === exchange && f.status === 'FILLED')
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Analyze each candle for absorption patterns
    const absorptionEvents = []
    for (let i = 0; i < symCandles.length; i++) {
      const c = symCandles[i]
      const cTime = c.time || c.timestamp || 0
      const cEnd = cTime + 300

      // Get fills in this candle period
      const candleFills = symFills.filter(f => {
        const fTime = f.timestamp || 0
        return fTime >= cTime && fTime <= cEnd
      })

      let buyVol = 0, sellVol = 0
      for (const f of candleFills) {
        const qty = f.filled_quantity || f.quantity || 0
        if (f.side === 'BUY') buyVol += qty
        else sellVol += qty
      }

      // Fallback estimate
      if (buyVol === 0 && sellVol === 0) {
        const vol = c.volume || 0
        if (c.close >= c.open) { buyVol = vol * 0.6; sellVol = vol * 0.4 }
        else { sellVol = vol * 0.6; buyVol = vol * 0.4 }
      }

      const delta = buyVol - sellVol
      const totalVol = buyVol + sellVol
      const deltaPct = totalVol > 0 ? (delta / totalVol) * 100 : 0

      // Absorption detection:
      // 1. Price barely moves but volume is high → absorption
      // 2. Large delta but small body → absorption
      const bodySize = Math.abs(c.close - c.open) / c.open * 100
      const wickSize = (Math.abs(c.high - c.low) - Math.abs(c.close - c.open)) / c.open * 100
      const avgBody = symCandles.slice(Math.max(0, i - 10), i).reduce((s, x) => s + Math.abs(x.close - x.open) / x.open * 100, 0) / Math.min(10, i) || 0.5
      const avgVol = symCandles.slice(Math.max(0, i - 10), i).reduce((s, x) => s + (x.volume || 0), 0) / Math.min(10, i) || 1

      const isHighVolume = (c.volume || 0) > avgVol * 1.5
      const isSmallBody = bodySize < avgBody * 0.5
      const isLargeWick = wickSize > bodySize * 2
      const hasLargeDelta = Math.abs(deltaPct) > 30

      // Bullish absorption: high sell volume but price doesn't drop (buyers absorbing)
      const bullishAbsorption = isHighVolume && delta < 0 && isSmallBody && c.close >= c.open * 0.998
      // Bearish absorption: high buy volume but price doesn't rise (sellers absorbing)
      const bearishAbsorption = isHighVolume && delta > 0 && isSmallBody && c.close <= c.open * 1.002

      if (bullishAbsorption || bearishAbsorption) {
        absorptionEvents.push({
          idx: i,
          type: bullishAbsorption ? 'bullish' : 'bearish',
          label: bullishAbsorption ? 'Bullish Absorption' : 'Bearish Absorption',
          volume: c.volume || 0,
          delta,
          deltaPct,
          bodySize,
          wickSize,
          price: c.close,
          description: bullishAbsorption
            ? 'Sellers hitting bids but price holds — buyers absorbing'
            : 'Buyers lifting offers but price holds — sellers absorbing',
        })
      }
    }

    // Order book imbalance from current book
    const obKey = `${exchange}|${symbol}`
    const ob = orderbooks?.[obKey]
    let obImbalance = null
    if (ob) {
      const bids = (ob.bids || []).slice(0, 10)
      const asks = (ob.asks || []).slice(0, 10)
      const bidVol = bids.reduce((s, [p, q]) => s + q, 0)
      const askVol = asks.reduce((s, [p, q]) => s + q, 0)
      const total = bidVol + askVol
      obImbalance = {
        bidVol, askVol,
        bidPct: total > 0 ? (bidVol / total) * 100 : 50,
        askPct: total > 0 ? (askVol / total) * 100 : 50,
        imbalance: total > 0 ? (bidVol - askVol) / total * 100 : 0,
      }
    }

    // Chart
    const slice = symCandles.slice(-20)
    const minP = Math.min(...slice.map(c => c.low))
    const maxP = Math.max(...slice.map(c => c.high))
    const range = maxP - minP || 1
    const toY = (v) => 100 - ((v - minP) / range) * 80 - 10

    const candleBars = slice.map((c, i) => {
      const x = (i / slice.length) * 100
      const w = 100 / slice.length * 0.7
      const isBull = c.close >= c.open
      return {
        x: x + (100 / slice.length) * 0.15, w,
        bodyY: toY(Math.max(c.open, c.close)),
        bodyH: Math.abs(toY(c.open) - toY(c.close)) || 0.5,
        wickTop: toY(c.high), wickBot: toY(c.low),
        isBull,
      }
    })

    // Absorption markers
    const sliceStart = symCandles.length - 20
    const markers = absorptionEvents.map(a => {
      const relIdx = a.idx - sliceStart
      if (relIdx < 0 || relIdx >= slice.length) return null
      return {
        x: (relIdx / slice.length) * 100,
        y: a.type === 'bullish' ? toY(symCandles[a.idx].low) : toY(symCandles[a.idx].high),
        type: a.type,
      }
    }).filter(Boolean)

    const recentEvents = absorptionEvents.slice(-4)

    return {
      candleBars, markers, recentEvents,
      obImbalance,
      totalEvents: absorptionEvents.length,
      bullEvents: absorptionEvents.filter(a => a.type === 'bullish').length,
      bearEvents: absorptionEvents.filter(a => a.type === 'bearish').length,
    }
  }, [candles, fills, orderbooks, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shield size={12} className="text-accent-teal" />
          Order Flow Absorption
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { candleBars, markers, recentEvents, obImbalance, totalEvents, bullEvents, bearEvents } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shield size={12} className="text-accent-teal" />
        Order Flow Absorption Detector
      </div>

      {/* Chart */}
      <svg viewBox="0 0 100 100" className="w-full h-[45px]" preserveAspectRatio="none">
        {candleBars.map((b, i) => (
          <g key={i}>
            <line x1={b.x + b.w / 2} y1={b.wickTop} x2={b.x + b.w / 2} y2={b.wickBot}
              stroke={b.isBull ? '#22c55e' : '#ef4444'} strokeWidth="0.3" />
            <rect x={b.x} y={b.bodyY} width={b.w} height={b.bodyH}
              fill={b.isBull ? '#22c55e' : '#ef4444'} fillOpacity="0.5" />
          </g>
        ))}
        {markers.map((m, i) => (
          <g key={'m' + i}>
            <circle cx={m.x} cy={m.y} r="1.5" fill={m.type === 'bullish' ? '#22c55e' : '#ef4444'} />
            <text x={m.x + 2} y={m.y + 1} fontSize="2.5" fill={m.type === 'bullish' ? '#22c55e' : '#ef4444'}>
              ABS
            </text>
          </g>
        ))}
      </svg>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 mt-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Total</span>
          <div className="font-mono text-gray-300">{totalEvents}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Bullish</span>
          <div className="font-mono text-accent-green">{bullEvents}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Bearish</span>
          <div className="font-mono text-accent-red">{bearEvents}</div>
        </div>
      </div>

      {/* Order book imbalance */}
      {obImbalance && (
        <div className="mt-2 bg-bg-800 rounded px-2 py-1.5">
          <div className="text-[8px] text-gray-600 mb-1">Order Book Imbalance:</div>
          <div className="flex h-2 rounded-full overflow-hidden mb-1">
            <div className="bg-accent-green" style={{ width: `${obImbalance.bidPct}%` }} />
            <div className="bg-accent-red" style={{ width: `${obImbalance.askPct}%` }} />
          </div>
          <div className="flex justify-between text-[7px]">
            <span className="text-accent-green">Bids: {obImbalance.bidPct.toFixed(0)}%</span>
            <span className="text-accent-red">Asks: {obImbalance.askPct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <div className="mt-2">
          <div className="text-[8px] text-gray-600 mb-1">Recent absorption:</div>
          <div className="space-y-0.5">
            {recentEvents.map((a, i) => (
              <div key={i} className="bg-bg-800 rounded px-1.5 py-0.5">
                <div className="flex items-center gap-1 text-[8px]">
                  {a.type === 'bullish' ? <TrendingUp size={8} className="text-accent-green" /> : <TrendingDown size={8} className="text-accent-red" />}
                  <span className={a.type === 'bullish' ? 'text-accent-green' : 'text-accent-red'}>{a.label}</span>
                  <span className="text-gray-500 ml-auto">Δ{a.delta >= 0 ? '+' : ''}{a.delta.toFixed(0)}</span>
                </div>
                <div className="text-[7px] text-gray-600 mt-0.5">{a.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Absorption = large volume but price doesn't move. Indicates institutional limit orders absorbing market orders.
      </div>
    </div>
  )
}
