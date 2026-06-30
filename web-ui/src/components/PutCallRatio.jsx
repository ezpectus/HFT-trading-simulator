import { useMemo } from 'react'
import { Scale, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function PutCallRatio({ fills, candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symFills = (fills || []).filter(f => f.symbol === symbol && f.status === 'FILLED')
    if (symFills.length < 5) return null

    // Simulate put/call from fill directions
    // BUY = "call" (bullish), SELL = "put" (bearish)
    const recent = symFills.slice(-30)
    const buys = recent.filter(f => f.side === 'BUY').length
    const sells = recent.filter(f => f.side === 'SELL').length
    const ratio = sells > 0 ? buys / sells : buys > 0 ? 99 : 1

    // Rolling P/C ratio over time
    const window = 10
    const rollingRatios = []
    for (let i = window; i <= recent.length; i++) {
      const slice = recent.slice(i - window, i)
      const b = slice.filter(f => f.side === 'BUY').length
      const s = slice.filter(f => f.side === 'SELL').length
      rollingRatios.push({
        idx: i,
        ratio: s > 0 ? b / s : b > 0 ? 99 : 1,
        buys: b,
        sells: s,
      })
    }

    // Volume-weighted P/C
    const buyVol = recent.filter(f => f.side === 'BUY').reduce((s, f) => s + (f.filled_quantity || 0), 0)
    const sellVol = recent.filter(f => f.side === 'SELL').reduce((s, f) => s + (f.filled_quantity || 0), 0)
    const volRatio = sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 99 : 1

    // Large vs small order P/C
    const medianQty = recent.map(f => f.filled_quantity || 0).sort((a, b) => a - b)[Math.floor(recent.length / 2)] || 0
    const largeOrders = recent.filter(f => (f.filled_quantity || 0) > medianQty)
    const largeBuys = largeOrders.filter(f => f.side === 'BUY').length
    const largeSells = largeOrders.filter(f => f.side === 'SELL').length
    const largeRatio = largeSells > 0 ? largeBuys / largeSells : largeBuys > 0 ? 99 : 1

    // Small orders
    const smallOrders = recent.filter(f => (f.filled_quantity || 0) <= medianQty)
    const smallBuys = smallOrders.filter(f => f.side === 'BUY').length
    const smallSells = smallOrders.filter(f => f.side === 'SELL').length
    const smallRatio = smallSells > 0 ? smallBuys / smallSells : smallBuys > 0 ? 99 : 1

    // Smart money vs retail proxy
    const smartMoneyRatio = largeRatio
    const retailRatio = smallRatio

    // Sentiment
    let sentiment = 'Neutral'
    let sentimentColor = 'text-gray-400'
    if (ratio > 2) { sentiment = 'Extremely Bullish'; sentimentColor = 'text-accent-green' }
    else if (ratio > 1.3) { sentiment = 'Bullish'; sentimentColor = 'text-accent-green' }
    else if (ratio < 0.5) { sentiment = 'Extremely Bearish'; sentimentColor = 'text-accent-red' }
    else if (ratio < 0.75) { sentiment = 'Bearish'; sentimentColor = 'text-accent-red' }

    // Divergence: smart money vs retail
    const divergence = smartMoneyRatio - retailRatio
    let divLabel = 'Aligned'
    let divColor = 'text-gray-500'
    if (Math.abs(divergence) > 0.5) {
      if (divergence > 0) { divLabel = 'Smart money accumulating'; divColor = 'text-accent-green' }
      else { divLabel = 'Smart money distributing'; divColor = 'text-accent-red' }
    }

    return {
      ratio, buys, sells, volRatio, buyVol, sellVol,
      largeRatio, smallRatio, smartMoneyRatio, retailRatio,
      rollingRatios, sentiment, sentimentColor,
      divergence, divLabel, divColor,
    }
  }, [fills, candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Scale size={12} className="text-accent-teal" />
          Put/Call Ratio
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 5+ fills</div>
      </div>
    )
  }

  const { ratio, buys, sells, volRatio, buyVol, sellVol, largeRatio, smallRatio, rollingRatios, sentiment, sentimentColor, divergence, divLabel, divColor } = data

  // SVG sparkline
  const w = 280, h = 40
  const maxR = Math.max(...rollingRatios.map(r => Math.min(r.ratio, 5)), 2)
  const xStep = w / Math.max(rollingRatios.length - 1, 1)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Scale size={12} className="text-accent-teal" />
        Put/Call Ratio (Sim)
      </div>

      {/* Main ratio */}
      <div className="bg-bg-800 rounded px-2 py-2 mb-2 text-center">
        <div className="text-[8px] text-gray-600">Buy/Sell Ratio</div>
        <div className={'text-xl font-bold ' + sentimentColor}>{ratio > 10 ? '10+' : ratio.toFixed(2)}</div>
        <div className={'text-[10px] font-medium ' + sentimentColor}>{sentiment}</div>
        <div className="text-[8px] text-gray-500 mt-0.5">
          {buys} buys / {sells} sells
        </div>
      </div>

      {/* Rolling ratio sparkline */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Rolling P/C (window=10):</div>
        <svg width={w} height={h} className="w-full">
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#334155" strokeWidth={0.5} strokeDasharray="2,2" />
          {rollingRatios.map((r, i) => {
            const x = i * xStep
            const y = h - (Math.min(r.ratio, maxR) / maxR) * (h - 2) - 1
            const color = r.ratio > 1.3 ? '#22c55e' : r.ratio < 0.75 ? '#ef4444' : '#64748b'
            return (
              <g key={i}>
                {i > 0 && (
                  <line
                    x1={(i - 1) * xStep}
                    y1={h - (Math.min(rollingRatios[i - 1].ratio, maxR) / maxR) * (h - 2) - 1}
                    x2={x}
                    y2={y}
                    stroke="#475569"
                    strokeWidth={0.5}
                  />
                )}
                <circle cx={x} cy={y} r={1.5} fill={color} />
              </g>
            )
          })}
        </svg>
        <div className="flex justify-between text-[7px] text-gray-700">
          <span className="text-accent-red">Bearish &lt;0.75</span>
          <span>1.0</span>
          <span className="text-accent-green">Bullish &gt;1.3</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-0.5 mb-2">
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-500">Volume-weighted</span>
          <span className="font-mono text-gray-400">{volRatio > 10 ? '10+' : volRatio.toFixed(2)}</span>
          <span className="text-gray-600">{formatPrice(buyVol)} / {formatPrice(sellVol)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-500">Smart money (large)</span>
          <span className={'font-mono ' + (largeRatio > 1.3 ? 'text-accent-green' : largeRatio < 0.75 ? 'text-accent-red' : 'text-gray-400')}>
            {largeRatio > 10 ? '10+' : largeRatio.toFixed(2)}
          </span>
          <span className="text-gray-600">B/S ratio</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-500">Retail (small)</span>
          <span className={'font-mono ' + (smallRatio > 1.3 ? 'text-accent-green' : smallRatio < 0.75 ? 'text-accent-red' : 'text-gray-400')}>
            {smallRatio > 10 ? '10+' : smallRatio.toFixed(2)}
          </span>
          <span className="text-gray-600">B/S ratio</span>
        </div>
      </div>

      {/* Divergence */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-1 flex items-center gap-1">
        <Activity size={9} className="text-accent-yellow shrink-0" />
        <span className={'text-[8px] ' + divColor}>{divLabel}</span>
        <span className="text-gray-700 ml-auto">Δ {divergence >= 0 ? '+' : ''}{divergence.toFixed(2)}</span>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Simulated P/C from fill direction. Smart money = large orders, Retail = small. Divergence = potential reversal signal.
      </div>
    </div>
  )
}
