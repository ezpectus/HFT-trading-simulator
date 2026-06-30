import { useMemo } from 'react'
import { CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { formatPrice, formatVolume, formatTime, colorForSide } from '../utils/format'
import VirtualList from './VirtualList'

export default function FillsPanel({ fills }) {
  const stats = useMemo(() => {
    const filled = fills.filter(f => f.status === 'FILLED')
    const buyFills = filled.filter(f => f.side === 'BUY')
    const sellFills = filled.filter(f => f.side === 'SELL')
    const totalVolume = filled.reduce((s, f) => s + f.filled_quantity, 0)
    const totalNotional = filled.reduce((s, f) => s + f.filled_price * f.filled_quantity, 0)
    const totalFees = filled.reduce((s, f) => s + f.fee, 0)
    const buyVolume = buyFills.reduce((s, f) => s + f.filled_quantity, 0)
    const sellVolume = sellFills.reduce((s, f) => s + f.filled_quantity, 0)
    const buySellRatio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? Infinity : 0

    return {
      total: filled.length,
      buys: buyFills.length,
      sells: sellFills.length,
      totalVolume,
      totalNotional,
      totalFees,
      buyVolume,
      sellVolume,
      buySellRatio,
    }
  }, [fills])

  if (!fills.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <CheckCircle size={24} className="mx-auto mb-2 opacity-50" />
        No fills yet
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {/* Stats summary */}
      <div className="bg-bg-700 rounded-lg p-2.5 mb-2">
        <div className="text-[10px] text-gray-500 uppercase mb-1.5">Fill Statistics</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500 text-[10px]">Total Fills</div>
            <div className="font-mono text-gray-200">{stats.total}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Volume</div>
            <div className="font-mono text-gray-200">{formatVolume(stats.totalVolume)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Notional</div>
            <div className="font-mono text-gray-200">${formatPrice(stats.totalNotional, 0)}</div>
          </div>
        </div>
        {/* Buy/Sell ratio bar */}
        <div className="mt-2">
          <div className="flex justify-between text-[10px] mb-0.5">
            <span className="text-accent-green flex items-center gap-0.5">
              <TrendingUp size={10} /> {stats.buys} buys ({formatVolume(stats.buyVolume)})
            </span>
            <span className="text-accent-red flex items-center gap-0.5">
              {stats.sells} sells ({formatVolume(stats.sellVolume)}) <TrendingDown size={10} />
            </span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-bg-600">
            <div className="bg-accent-green/60" style={{ width: `${(stats.buys / Math.max(stats.total, 1)) * 100}%` }} />
            <div className="bg-accent-red/60" style={{ width: `${(stats.sells / Math.max(stats.total, 1)) * 100}%` }} />
          </div>
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-gray-500 font-mono">
          <span>Fees: ${formatPrice(stats.totalFees, 4)}</span>
          <span>B/S: {isFinite(stats.buySellRatio) ? stats.buySellRatio.toFixed(2) : '∞'}</span>
        </div>
      </div>

      {/* Fill list */}
      <div className="text-xs font-medium text-gray-400 mb-1 px-1">
        Recent Fills ({fills.length})
      </div>
      <VirtualList
        items={fills}
        itemHeight={64}
        maxHeight={400}
        renderItem={(fill, i) => {
          const isFilled = fill.status === 'FILLED'
          return (
            <div className="bg-bg-700 rounded p-2 text-xs mx-px">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {isFilled ? (
                    <CheckCircle size={14} className="text-accent-green" />
                  ) : (
                    <XCircle size={14} className="text-accent-red" />
                  )}
                  <span className={`font-semibold ${colorForSide(fill.side)}`}>
                    {fill.side}
                  </span>
                  <span className="text-gray-300">{fill.symbol}</span>
                  <span className="text-gray-500 text-[10px]">{fill.exchange}</span>
                </div>
                <span className="text-gray-500 text-[10px]">{formatTime(fill.timestamp)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
                <div>
                  <span className="text-gray-500">Qty: </span>
                  <span className="text-gray-300">{fill.filled_quantity}</span>
                </div>
                <div>
                  <span className="text-gray-500">Price: </span>
                  <span className="text-gray-300">${formatPrice(fill.filled_price)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Fee: </span>
                  <span className="text-gray-300">${formatPrice(fill.fee)}</span>
                </div>
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
