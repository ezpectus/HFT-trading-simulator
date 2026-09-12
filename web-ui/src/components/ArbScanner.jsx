import { memo, useMemo } from 'react'
import { Search, Zap, TrendingUp, AlertTriangle } from 'lucide-react'
import { StatCard, Label, SectionTitle, WarningBanner } from '../utils/ui-helpers'

/**
 * Arbitrage Scanner — live opportunities from the exchange simulator's
 * arbitrage_scan broadcast (cross-exchange best-bid/best-ask spreads).
 */
const ArbScanner = memo(function ArbScanner({ arbitrage }) {
  const data = useMemo(() => {
    const active = arbitrage?.active || []
    const stats = arbitrage?.stats || {}
    const totalProfit = active.reduce((s, o) => s + (o.estimated_profit || 0), 0)
    const avgSpread = active.length
      ? active.reduce((s, o) => s + (o.spread_bps || 0), 0) / active.length
      : 0
    const best = active.length
      ? active.reduce((m, o) => (o.spread_bps > m.spread_bps ? o : m), active[0])
      : null
    // Per-pair breakdown of detected opportunities
    const byPair = {}
    for (const o of active) {
      const k = `${o.buy_exchange}→${o.sell_exchange}`
      byPair[k] = (byPair[k] || 0) + 1
    }
    return { active, stats, totalProfit, avgSpread, best, byPair }
  }, [arbitrage])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Search} title="Arbitrage Scanner" right={<span className="text-[10px] text-gray-600">{data.active.length} active</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Active" value={data.active.length} color="text-accent-green" />
        <StatCard label="Est Profit" value={`$${data.totalProfit.toFixed(2)}`} color="text-accent-green" />
        <StatCard label="Avg Spread" value={`${data.avgSpread.toFixed(1)}bp`} color="text-gray-300" />
        <StatCard label="Best" value={data.best ? `${data.best.spread_bps.toFixed(1)}bp` : '—'} color="text-accent-yellow" />
      </div>

      {/* Opportunities */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Zap size={11} className="text-gray-500" />
          <Label>Opportunities</Label>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {data.active.length === 0 && (
            <div className="text-gray-500 text-[10px] p-2">No active arbitrage — spreads below threshold or scanner not connected</div>
          )}
          {data.active.map((opp, i) => (
            <div key={`${opp.symbol}-${opp.buy_exchange}-${opp.sell_exchange}-${i}`} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                <span className="text-[8px] px-1 rounded bg-accent-green/20 text-accent-green w-12 text-center">
                  OPEN
                </span>
                <span className="text-[9px] text-gray-500 w-20 truncate">{opp.symbol}</span>
                <span className="text-[10px] text-gray-300 flex-1 truncate">
                  {opp.buy_exchange} → {opp.sell_exchange}
                </span>
                <span className="text-[9px] font-mono text-accent-green w-12 text-right">+{opp.spread_bps.toFixed(1)}bp</span>
                <span className="text-[9px] font-mono text-gray-400 w-14 text-right">${opp.estimated_profit.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-4 text-[8px] text-gray-600 font-mono">
                <span>Buy @{opp.buy_price?.toFixed(2)}</span>
                <span>Sell @{opp.sell_price?.toFixed(2)}</span>
                <span>MaxQty: {opp.max_quantity}</span>
                <span>Net: ${opp.net_spread?.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lifetime scan stats */}
      {data.stats.total_detected != null && (
        <div>
          <Label className="mb-1">Scanner Stats (session)</Label>
          <div className="grid grid-cols-4 gap-1 font-mono text-[9px]">
            <div className="bg-bg-700 p-1.5"><div className="text-gray-500">Detected</div><div className="text-gray-300">{data.stats.total_detected}</div></div>
            <div className="bg-bg-700 p-1.5"><div className="text-gray-500">Closed</div><div className="text-gray-300">{data.stats.total_closed || 0}</div></div>
            <div className="bg-bg-700 p-1.5"><div className="text-gray-500">Expired</div><div className="text-gray-300">{data.stats.total_expired || 0}</div></div>
            <div className="bg-bg-700 p-1.5"><div className="text-gray-500">Best bps</div><div className="text-accent-yellow">{data.stats.best_spread_bps?.toFixed(1) || 0}</div></div>
          </div>
        </div>
      )}

      {data.active.length > 0 && (
        <WarningBanner icon={TrendingUp} color="text-accent-green">
          {data.active.length} active opportunities — est. ${data.totalProfit.toFixed(2)} total profit
        </WarningBanner>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <AlertTriangle size={9} />
          Profits net of fees & slippage
        </span>
        <span>Source: exchange simulator arb detector</span>
      </div>
    </div>
  )
})

export default memo(ArbScanner)
