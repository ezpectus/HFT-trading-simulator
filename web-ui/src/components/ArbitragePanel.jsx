import { memo, useState, useMemo } from 'react'
import { TrendingUp, ArrowRight, Search } from 'lucide-react'
import { formatPrice, formatUsd } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'
import { useDebounce } from '../hooks/useDebounce'

function ArbitragePanel({ arbitrage }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const filteredActive = useMemo(() => {
    if (!arbitrage?.active) return []
    if (!debouncedSearch) return arbitrage.active
    const q = debouncedSearch.toUpperCase()
    return arbitrage.active.filter(a =>
      a.symbol?.toUpperCase().includes(q) ||
      a.buy_exchange?.toUpperCase().includes(q) ||
      a.sell_exchange?.toUpperCase().includes(q)
    )
  }, [arbitrage, debouncedSearch])

  if (!arbitrage || !arbitrage.active?.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No active arbitrage opportunities"
        subtitle="Cross-exchange spreads will appear here when detected"
      />
    )
  }

  const stats = arbitrage.stats || {}

  return (
    <div className="p-2 space-y-2">
      {/* Stats */}
      <div className="bg-bg-700  p-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Detected" value={stats.total_detected || 0} />
          <Stat label="Closed" value={stats.total_closed || 0} />
          <Stat label="Best Spread" value={`${(stats.best_spread_bps || 0).toFixed(1)} bps`} />
          <Stat label="Est. Profit" value={formatUsd(stats.total_estimated_profit || 0)} color="text-accent-green" />
        </div>
      </div>

      {/* Active opportunities */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-gray-400">
          Active ({filteredActive.length}{debouncedSearch ? `/${arbitrage.active_count || 0}` : ''})
        </span>
        <div className="relative">
          <Search size={10} className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-16 bg-bg-600 border border-bg-500  pl-4 pr-1 py-0.5 text-[9px] text-gray-200 outline-none focus:border-accent-blue"
            aria-label="Search arbitrage by symbol or exchange"
          />
        </div>
      </div>

      <div className="space-y-1">
        {filteredActive.map((arb) => (
          <div key={arb.symbol} className="bg-bg-700  p-2 text-xs">
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

export default memo(ArbitragePanel)
