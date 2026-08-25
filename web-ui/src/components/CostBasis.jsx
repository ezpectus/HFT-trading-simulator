import { memo, useMemo } from 'react'
import { Calculator, TrendingUp, TrendingDown, BookOpen } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { pnlColor, StatCard } from '../utils/ui-helpers'

const MOCK_POSITIONS = [
  { symbol: 'BTC/USDT', qty: 0.85, avgCost: 42150, currentPrice: 44100, unrealized: 1657.5, realized: 320, lots: [{ qty: 0.5, price: 41800, date: '2024-08-20' }, { qty: 0.35, price: 42650, date: '2024-08-22' }] },
  { symbol: 'ETH/USDT', qty: 12.5, avgCost: 2280, currentPrice: 2350, unrealized: 875.0, realized: 150, lots: [{ qty: 8.0, price: 2250, date: '2024-08-18' }, { qty: 4.5, price: 2333, date: '2024-08-23' }] },
  { symbol: 'SOL/USDT', qty: 150, avgCost: 92.5, currentPrice: 96.2, unrealized: 555.0, realized: 0, lots: [{ qty: 150, price: 92.5, date: '2024-08-21' }] },
  { symbol: 'AVAX/USDT', qty: -80, avgCost: 30.2, currentPrice: 28.5, unrealized: 136.0, realized: -45, lots: [{ qty: -80, price: 30.2, date: '2024-08-24' }] },
  { symbol: 'LINK/USDT', qty: 200, avgCost: 13.8, currentPrice: 14.2, unrealized: 80.0, realized: 0, lots: [{ qty: 120, price: 13.5, date: '2024-08-19' }, { qty: 80, price: 14.25, date: '2024-08-22' }] },
]

const CostBasis = memo(function CostBasis() {
  const stats = useMemo(() => {
    const totalUnrealized = MOCK_POSITIONS.reduce((s, p) => s + p.unrealized, 0)
    const totalRealized = MOCK_POSITIONS.reduce((s, p) => s + p.realized, 0)
    const totalCost = MOCK_POSITIONS.reduce((s, p) => s + Math.abs(p.qty * p.avgCost), 0)
    const totalValue = MOCK_POSITIONS.reduce((s, p) => s + Math.abs(p.qty * p.currentPrice), 0)
    const totalPnl = totalUnrealized + totalRealized
    const roi = (totalPnl / totalCost) * 100
    return { totalUnrealized, totalRealized, totalCost, totalValue, totalPnl, roi }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Calculator size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Cost Basis Tracker</span>
        </div>
        <span className="text-[10px] text-gray-600">WAC method</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Unrealized" value={`${stats.totalUnrealized >= 0 ? '+' : ''}$${stats.totalUnrealized.toFixed(0)}`} color={pnlColor(stats.totalUnrealized)} compact />
        <StatCard label="Realized" value={`${stats.totalRealized >= 0 ? '+' : ''}$${stats.totalRealized.toFixed(0)}`} color={pnlColor(stats.totalRealized)} compact />
        <StatCard label="Total PnL" value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(0)}`} color={pnlColor(stats.totalPnl)} compact />
        <StatCard label="ROI" value={`${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`} color={pnlColor(stats.roi)} compact />
      </div>

      {/* Positions table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Positions</div>
        <div className="space-y-0.5">
          {MOCK_POSITIONS.map(p => (
            <div key={p.symbol} className="py-1 px-1.5 bg-bg-700">
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
                <span className={`text-[9px] font-mono w-12 text-right ${pnlColor(p.realized)}`}>
                  {p.realized >= 0 ? '+' : ''}${p.realized}
                </span>
              </div>
              {/* Lot details */}
              <div className="mt-0.5 pl-4 space-y-0.5">
                {p.lots.map((lot, i) => (
                  <div key={i} className="flex items-center gap-2 text-[8px] text-gray-600">
                    <BookOpen size={8} />
                    <span>{lot.qty > 0 ? '+' : ''}{lot.qty} @ ${formatPrice(lot.price)}</span>
                    <span>{lot.date}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Sym / Qty / AvgCost / Current / Unreal / Real</span>
        </div>
      </div>

      {/* Cost basis summary */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Portfolio Summary</div>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <div>
            <span className="text-gray-600">Total Cost Basis:</span>{' '}
            <span className="text-gray-300 font-mono">${stats.totalCost.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-gray-600">Market Value:</span>{' '}
            <span className="text-gray-300 font-mono">${stats.totalValue.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-gray-600">Unrealized PnL:</span>{' '}
            <span className={`font-mono ${pnlColor(stats.totalUnrealized)}`}>
              {stats.totalUnrealized >= 0 ? '+' : ''}${stats.totalUnrealized.toFixed(0)}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Realized PnL:</span>{' '}
            <span className={`font-mono ${pnlColor(stats.totalRealized)}`}>
              {stats.totalRealized >= 0 ? '+' : ''}${stats.totalRealized.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <TrendingUp size={9} className="text-accent-green" />
          {MOCK_POSITIONS.filter(p => p.unrealized >= 0).length} profitable
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown size={9} className="text-accent-red" />
          {MOCK_POSITIONS.filter(p => p.unrealized < 0).length} at loss
        </span>
      </div>
    </div>
  )
})

export default memo(CostBasis)
