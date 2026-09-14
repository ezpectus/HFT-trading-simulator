import { memo, useMemo } from 'react'
import { Calculator, TrendingUp, TrendingDown, BookOpen } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { pnlColor, StatCard } from '../utils/ui-helpers'

/**
 * Cost Basis Tracker — positions from live account state (entry_price is the
 * simulator's weighted-average cost), unrealized from live prices, realized
 * from trade_history pnl, lot history from recent fills.
 */
const CostBasis = memo(function CostBasis({ fills, accounts, prices }) {
  const data = useMemo(() => {
    const positions = []
    const realizedBySymbol = new Map()
    let totalRealized = 0
    for (const [ex, acc] of Object.entries(accounts || {})) {
      for (const t of acc.trade_history || []) {
        realizedBySymbol.set(t.symbol, (realizedBySymbol.get(t.symbol) || 0) + (t.pnl || 0))
        totalRealized += t.pnl || 0
      }
      // positions is a LIST of position dicts, not a map
      for (const pos of acc.positions || []) {
        const sym = pos.symbol
        const qty = (pos.quantity ?? 0) * (pos.side === 'SELL' ? -1 : 1)
        const cur = prices?.[`${ex}|${sym}`] ?? pos.entry_price
        const unrealized = pos.unrealized_pnl ?? (cur - pos.entry_price) * qty
        const lots = (fills || [])
          .filter(f => f.exchange === ex && f.symbol === sym)
          .slice(0, 10)
          .map(f => ({
            qty: (f.filled_quantity ?? f.quantity ?? 0) * (f.side === 'SELL' ? -1 : 1),
            price: f.filled_price ?? f.price,
            date: f.timestamp ? new Date(f.timestamp * 1000).toLocaleTimeString() : '',
          }))
        positions.push({
          symbol: sym, exchange: ex, qty, avgCost: pos.entry_price, currentPrice: cur,
          unrealized, stopLoss: pos.stop_loss, takeProfit: pos.take_profit, lots,
        })
      }
    }
    if (!positions.length && totalRealized === 0) return null

    const totalUnrealized = positions.reduce((s, p) => s + p.unrealized, 0)
    const totalCost = positions.reduce((s, p) => s + Math.abs(p.qty * p.avgCost), 0)
    const totalValue = positions.reduce((s, p) => s + Math.abs(p.qty * p.currentPrice), 0)
    const totalPnl = totalUnrealized + totalRealized
    const roi = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
    return { positions, totalUnrealized, totalRealized, totalCost, totalValue, totalPnl, roi }
  }, [accounts, prices, fills])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Calculator size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Cost Basis Tracker</span>
        </div>
        <span className="text-[10px] text-gray-600">WAC method</span>
      </div>

      {!data ? (
        <div className="text-gray-500 text-[10px] p-2">No open positions — cost basis appears after fills</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Unrealized" value={`${data.totalUnrealized >= 0 ? '+' : ''}$${data.totalUnrealized.toFixed(0)}`} color={pnlColor(data.totalUnrealized)} compact />
            <StatCard label="Realized" value={`${data.totalRealized >= 0 ? '+' : ''}$${data.totalRealized.toFixed(0)}`} color={pnlColor(data.totalRealized)} compact />
            <StatCard label="Total PnL" value={`${data.totalPnl >= 0 ? '+' : ''}$${data.totalPnl.toFixed(0)}`} color={pnlColor(data.totalPnl)} compact />
            <StatCard label="ROI" value={`${data.roi >= 0 ? '+' : ''}${data.roi.toFixed(1)}%`} color={pnlColor(data.roi)} compact />
          </div>

          {/* Positions table */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Positions</div>
            <div className="space-y-0.5">
              {data.positions.map(p => (
                <div key={`${p.exchange}|${p.symbol}`} className="py-1 px-1.5 bg-bg-700">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-300 w-16 truncate">{p.symbol.replace('/USDT', '')}</span>
                    <span className={`text-[9px] font-mono w-12 ${p.qty >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {p.qty > 0 ? '+' : ''}{p.qty}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 w-16">${formatPrice(p.avgCost)}</span>
                    <span className="text-[9px] font-mono text-gray-300 w-16">${formatPrice(p.currentPrice)}</span>
                    <span className={`text-[9px] font-mono w-14 text-right ${pnlColor(p.unrealized)}`}>
                      {p.unrealized >= 0 ? '+' : ''}${p.unrealized.toFixed(0)}
                    </span>
                  </div>
                  {(p.stopLoss > 0 || p.takeProfit > 0) && (
                    <div className="mt-0.5 pl-4 flex items-center gap-3 text-[8px] text-gray-600">
                      <BookOpen size={8} />
                      {p.stopLoss > 0 && <span>SL ${formatPrice(p.stopLoss)}</span>}
                      {p.takeProfit > 0 && <span>TP ${formatPrice(p.takeProfit)}</span>}
                    </div>
                  )}
                  {/* Recent fills for this position */}
                  {p.lots.length > 0 && (
                    <div className="mt-0.5 pl-4 space-y-0.5">
                      {p.lots.map((lot, i) => (
                        <div key={i} className="flex items-center gap-2 text-[8px] text-gray-600">
                          <span>{lot.qty > 0 ? '+' : ''}{lot.qty} @ ${formatPrice(lot.price)}</span>
                          <span>{lot.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Sym / Qty / AvgCost / Current / Unreal</span>
            </div>
          </div>

          {/* Cost basis summary */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="text-[10px] text-gray-600 uppercase mb-1">Portfolio Summary</div>
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div>
                <span className="text-gray-600">Total Cost Basis:</span>{' '}
                <span className="text-gray-300 font-mono">${data.totalCost.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-gray-600">Market Value:</span>{' '}
                <span className="text-gray-300 font-mono">${data.totalValue.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-gray-600">Unrealized PnL:</span>{' '}
                <span className={`font-mono ${pnlColor(data.totalUnrealized)}`}>
                  {data.totalUnrealized >= 0 ? '+' : ''}${data.totalUnrealized.toFixed(0)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Realized PnL:</span>{' '}
                <span className={`font-mono ${pnlColor(data.totalRealized)}`}>
                  {data.totalRealized >= 0 ? '+' : ''}${data.totalRealized.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingUp size={9} className="text-accent-green" />
              {data.positions.filter(p => p.unrealized >= 0).length} profitable
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown size={9} className="text-accent-red" />
              {data.positions.filter(p => p.unrealized < 0).length} at loss
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(CostBasis)
