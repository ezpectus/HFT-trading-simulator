import { useMemo } from 'react'
import { Fish, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

export default function WhaleAlerts({ fills, candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symFills = (fills || [])
      .filter(f => (!symbol || f.symbol === symbol) && (!exchange || f.exchange === exchange))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

    if (symFills.length === 0) return null

    // Determine whale threshold: 3x average fill size
    const avgSize = symFills.reduce((s, f) => s + (f.filled_quantity || f.quantity || 0), 0) / symFills.length
    const whaleThreshold = avgSize * 3

    const whaleFills = symFills
      .filter(f => (f.filled_quantity || f.quantity || 0) >= whaleThreshold)
      .slice(0, 10)

    if (whaleFills.length === 0) return null

    // Analyze whale activity
    const whaleBuys = whaleFills.filter(f => f.side === 'BUY')
    const whaleSells = whaleFills.filter(f => f.side === 'SELL')
    const totalWhaleVolume = whaleFills.reduce((s, f) => s + (f.filled_quantity || f.quantity || 0), 0)
    const buyVolume = whaleBuys.reduce((s, f) => s + (f.filled_quantity || f.quantity || 0), 0)
    const sellVolume = whaleSells.reduce((s, f) => s + (f.filled_quantity || f.quantity || 0), 0)

    const buySellRatio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? Infinity : 0

    // Net flow
    const netFlow = buyVolume - sellVolume
    const flowDirection = netFlow > 0 ? 'accumulation' : 'distribution'
    const flowColor = netFlow > 0 ? 'text-accent-green' : 'text-accent-red'

    // Largest single fill
    const largest = whaleFills.reduce((max, f) => {
      const qty = f.filled_quantity || f.quantity || 0
      return qty > (max.filled_quantity || max.quantity || 0) ? f : max
    }, whaleFills[0])

    // Recent candle volume context
    const symCandles = (candles || [])
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-20)
    const avgCandleVol = symCandles.length > 0
      ? symCandles.reduce((s, c) => s + (c.volume || 0), 0) / symCandles.length
      : 0

    // Whale impact: whale volume as % of candle volume
    const whaleImpactPct = avgCandleVol > 0 ? (totalWhaleVolume / avgCandleVol) * 100 : 0

    // Timeline visualization
    const timeline = whaleFills.slice(0, 8).reverse().map(f => {
      const qty = f.filled_quantity || f.quantity || 0
      return {
        side: f.side,
        qty,
        price: f.filled_price || f.price || 0,
        time: f.timestamp,
        sizeRatio: Math.min(qty / (largest.filled_quantity || largest.quantity || 1), 1),
      }
    })

    return {
      whaleFills: whaleFills.slice(0, 6),
      whaleBuys: whaleBuys.length,
      whaleSells: whaleSells.length,
      totalWhaleVolume,
      buyVolume,
      sellVolume,
      buySellRatio,
      netFlow,
      flowDirection,
      flowColor,
      largest,
      whaleImpactPct,
      timeline,
      whaleThreshold,
    }
  }, [fills, candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Fish size={12} className="text-accent-purple" />
          Whale Alerts
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No whale activity detected</div>
      </div>
    )
  }

  const { whaleFills, whaleBuys, whaleSells, totalWhaleVolume, buyVolume, sellVolume, buySellRatio, netFlow, flowDirection, flowColor, largest, whaleImpactPct, timeline, whaleThreshold } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Fish size={12} className="text-accent-purple" />
        Whale Alert Monitor
      </div>

      {/* Flow summary */}
      <div className={'rounded px-2 py-1 mb-2 text-center ' + (netFlow >= 0 ? 'bg-accent-green/10' : 'bg-accent-red/10')}>
        <span className={'text-[10px] font-bold ' + flowColor}>
          {netFlow >= 0 ? '↑' : '↓'} {flowDirection.toUpperCase()}
        </span>
        <span className="text-[8px] text-gray-500 ml-1.5">
          Net: {formatVolume(Math.abs(netFlow))}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1 py-0.5">
          <span className="text-gray-600">Buys</span>
          <div className="font-mono text-accent-green">{whaleBuys}</div>
        </div>
        <div className="bg-bg-800 rounded px-1 py-0.5">
          <span className="text-gray-600">Sells</span>
          <div className="font-mono text-accent-red">{whaleSells}</div>
        </div>
        <div className="bg-bg-800 rounded px-1 py-0.5">
          <span className="text-gray-600">B/S Ratio</span>
          <div className="font-mono text-gray-300">{buySellRatio === Infinity ? '∞' : buySellRatio.toFixed(2)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1 py-0.5">
          <span className="text-gray-600">Impact</span>
          <div className={'font-mono ' + (whaleImpactPct > 20 ? 'text-accent-yellow' : 'text-gray-400')}>
            {whaleImpactPct.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-1">Recent whale fills:</div>
        <div className="flex items-end gap-0.5 h-[30px]">
          {timeline.map((t, i) => (
            <div
              key={i}
              className="flex-1 rounded-t transition-all"
              style={{
                height: `${t.sizeRatio * 100}%`,
                backgroundColor: t.side === 'BUY' ? '#22c55e' : '#ef4444',
                opacity: 0.6 + t.sizeRatio * 0.4,
                minHeight: '4px',
              }}
              title={`${t.side} ${formatVolume(t.qty)} @ ${formatPrice(t.price)}`}
            />
          ))}
        </div>
      </div>

      {/* Whale fill list */}
      <div className="space-y-0.5">
        {whaleFills.map((f, i) => {
          const qty = f.filled_quantity || f.quantity || 0
          const price = f.filled_price || f.price || 0
          const isBuy = f.side === 'BUY'
          return (
            <div key={i} className="flex items-center gap-1 text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
              {isBuy ? <TrendingUp size={7} className="text-accent-green shrink-0" /> : <TrendingDown size={7} className="text-accent-red shrink-0" />}
              <span className={'font-mono ' + (isBuy ? 'text-accent-green' : 'text-accent-red')}>{f.side}</span>
              <span className="font-mono text-gray-300">{formatVolume(qty)}</span>
              <span className="text-gray-600">@</span>
              <span className="font-mono text-gray-400">{formatPrice(price)}</span>
              <span className="text-gray-700 ml-auto">{f.exchange}</span>
            </div>
          )
        })}
      </div>

      {whaleImpactPct > 20 && (
        <div className="mt-1.5 bg-accent-yellow/10 border border-accent-yellow/20 rounded px-1.5 py-0.5 flex items-center gap-1">
          <AlertCircle size={9} className="text-accent-yellow shrink-0" />
          <span className="text-[8px] text-accent-yellow">
            High whale impact: {whaleImpactPct.toFixed(0)}% of avg candle volume
          </span>
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Threshold: 3x avg fill size ({formatVolume(whaleThreshold)}). Watch for absorption & reversal.
      </div>
    </div>
  )
}
