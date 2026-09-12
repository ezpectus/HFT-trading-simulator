import { memo, useMemo } from 'react'
import { Receipt, TrendingDown, DollarSign } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

/**
 * Transaction Cost Analysis — real fills from the exchange simulator.
 * Each fill carries: filled_price, slippage (abs price diff vs mid), fee (quote ccy).
 */
const TCA = memo(function TCA({ fills }) {
  const { execs, stats, breakdown } = useMemo(() => {
    const execs = (fills || []).map((f, i) => {
      const qty = f.filled_quantity || f.quantity || 0
      const price = f.filled_price || f.price || 0
      const slipAbs = Math.abs(f.slippage || 0) * qty            // $ cost of slippage
      const mid = f.filled_price ? f.filled_price - (f.slippage || 0) : price
      const slipBps = mid > 0 ? Math.abs(f.slippage || 0) / mid * 10000 : 0
      const fee = f.fee || 0
      return {
        id: f.id || i, symbol: f.symbol, side: (f.side || '').toUpperCase(),
        qty, price, slippage: slipBps, fee, impact: slipAbs,
        totalCost: fee + slipAbs, venue: f.exchange,
      }
    })
    const totalCost = execs.reduce((s, e) => s + e.totalCost, 0)
    const avgSlippage = execs.length ? execs.reduce((s, e) => s + e.slippage, 0) / execs.length : 0
    const totalFee = execs.reduce((s, e) => s + e.fee, 0)
    const totalImpact = execs.reduce((s, e) => s + e.impact, 0)
    const totalNotional = execs.reduce((s, e) => s + e.qty * e.price, 0)
    const costBps = totalNotional > 0 ? (totalCost / totalNotional) * 10000 : 0
    const total = totalFee + totalImpact
    const breakdown = total > 0 ? [
      { component: 'Slippage', value: totalImpact, pct: (totalImpact / total) * 100, color: 'bg-accent-red' },
      { component: 'Exchange Fees', value: totalFee, pct: (totalFee / total) * 100, color: 'bg-accent-yellow' },
    ] : []
    return { execs, stats: { totalCost, avgSlippage, totalFee, totalImpact, costBps }, breakdown }
  }, [fills])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Receipt size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Transaction Cost Analysis</span>
        </div>
        <span className="text-[10px] text-gray-600">{execs.length} fills</span>
      </div>

      {execs.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No fills yet — execution costs appear after orders fill</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Total Cost" value={`$${stats.totalCost.toFixed(1)}`} color="text-accent-red" compact />
            <StatCard label="Avg Slip" value={`${stats.avgSlippage.toFixed(2)}bps`} color="text-accent-yellow" compact />
            <StatCard label="Cost bps" value={stats.costBps.toFixed(1)} color="text-accent-orange" compact />
            <StatCard label="Fees" value={`$${stats.totalFee.toFixed(1)}`} color="text-gray-300" compact />
          </div>

          {/* Cost breakdown */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <div className="text-[10px] text-gray-600 uppercase mb-1">Cost Breakdown</div>
            <div className="flex h-4 rounded overflow-hidden mb-2">
              {breakdown.map(c => (
                <div key={c.component} className={c.color} style={{ width: `${c.pct}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {breakdown.map(c => (
                <div key={c.component} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded ${c.color}`} />
                  <span className="text-[9px] text-gray-400 flex-1">{c.component}</span>
                  <span className="text-[9px] font-mono text-gray-300">${c.value.toFixed(1)}</span>
                  <span className="text-[9px] text-gray-600">{c.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Execution details */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase mb-1">Recent Executions</div>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {execs.map(ex => (
                <div key={ex.id} className="grid grid-cols-7 gap-1 py-0.5 px-1.5 bg-bg-700 items-center">
                  <span className="text-[9px] text-gray-300 truncate">{(ex.symbol || '').replace('/USDT', '')}</span>
                  <span className={`text-[9px] font-mono ${ex.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{ex.side}</span>
                  <span className="text-[9px] font-mono text-gray-400">{ex.qty}</span>
                  <span className="text-[9px] font-mono text-accent-yellow">{ex.slippage.toFixed(1)}bp</span>
                  <span className="text-[9px] font-mono text-gray-400">${ex.fee.toFixed(2)}</span>
                  <span className="text-[9px] font-mono text-accent-orange">${ex.impact.toFixed(2)}</span>
                  <span className="text-[9px] font-mono text-accent-red">${ex.totalCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mt-0.5 text-[8px] text-gray-600 px-1.5">
              <span>Sym</span><span>Side</span><span>Qty</span><span>Slip</span><span>Fee</span><span>Slip$</span><span>Total</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span className="flex items-center gap-1">
              <TrendingDown size={9} />
              Slippage is {stats.avgSlippage > 2 ? 'elevated' : 'normal'}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={9} />
              {stats.costBps.toFixed(1)} bps total cost
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(TCA)
