import { TrendingUp, ArrowRight } from 'lucide-react'
import { formatPrice, formatUsd } from '../utils/format'

export default function ArbitragePanel({ arbitrage }) {
  if (!arbitrage || !arbitrage.active?.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <TrendingUp size={24} className="mx-auto mb-2 opacity-50" />
        No active arbitrage opportunities
      </div>
    )
  }

  const stats = arbitrage.stats || {}

  return (
    <div className="p-2 space-y-2">
      {/* Stats */}
      <div className="bg-bg-700 rounded-lg p-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Detected" value={stats.total_detected || 0} />
          <Stat label="Closed" value={stats.total_closed || 0} />
          <Stat label="Best Spread" value={`${(stats.best_spread_bps || 0).toFixed(1)} bps`} />
          <Stat label="Est. Profit" value={formatUsd(stats.total_estimated_profit || 0)} color="text-accent-green" />
        </div>
      </div>

      {/* Active opportunities */}
      <div className="text-xs font-medium text-gray-400 px-1">
        Active ({arbitrage.active_count || 0})
      </div>

      <div className="space-y-1">
        {arbitrage.active.map((arb, i) => (
          <div key={i} className="bg-bg-700 rounded p-2 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-200">{arb.symbol}</span>
              <span className="text-accent-green font-mono">
                {arb.spread_bps?.toFixed(1)} bps
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <div className="flex-1">
                <div className="text-gray-500 text-[10px]">Buy</div>
                <div className="text-accent-green">{arb.buy_exchange}</div>
                <div className="text-gray-300">${formatPrice(arb.buy_price)}</div>
              </div>
              <ArrowRight size={14} className="text-gray-600" />
              <div className="flex-1">
                <div className="text-gray-500 text-[10px]">Sell</div>
                <div className="text-accent-red">{arb.sell_exchange}</div>
                <div className="text-gray-300">${formatPrice(arb.sell_price)}</div>
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500 font-mono">
              <span>Max Qty: {arb.max_quantity?.toFixed(4)}</span>
              <span>Est. Profit: {formatUsd(arb.estimated_profit)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[10px] uppercase">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  )
}
