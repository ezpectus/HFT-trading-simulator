import { memo, useMemo } from 'react'
import { Receipt, TrendingDown, DollarSign } from 'lucide-react'

const MOCK_EXECUTIONS = [
  { id: 1, symbol: 'BTC/USDT', side: 'BUY', qty: 0.5, price: 44100, slippage: 2.5, fee: 11.0, impact: 8.5, totalCost: 22.0, venue: 'Binance' },
  { id: 2, symbol: 'ETH/USDT', side: 'SELL', qty: 3.2, price: 2350, slippage: 1.8, fee: 3.8, impact: 4.2, totalCost: 12.5, venue: 'OKX' },
  { id: 3, symbol: 'SOL/USDT', side: 'BUY', qty: 50, price: 96.2, slippage: 0.5, fee: 2.4, impact: 1.8, totalCost: 6.5, venue: 'Bybit' },
  { id: 4, symbol: 'BTC/USDT', side: 'SELL', qty: 0.3, price: 44250, slippage: 3.2, fee: 6.6, impact: 12.5, totalCost: 22.4, venue: 'Binance' },
  { id: 5, symbol: 'AVAX/USDT', side: 'BUY', qty: 120, price: 28.5, slippage: 1.2, fee: 1.7, impact: 3.5, totalCost: 7.0, venue: 'OKX' },
  { id: 6, symbol: 'LINK/USDT', side: 'BUY', qty: 80, price: 14.2, slippage: 0.8, fee: 0.6, impact: 1.2, totalCost: 2.6, venue: 'Binance' },
  { id: 7, symbol: 'ETH/USDT', side: 'BUY', qty: 2.0, price: 2348, slippage: 1.5, fee: 2.4, impact: 3.8, totalCost: 8.2, venue: 'Bybit' },
  { id: 8, symbol: 'DOT/USDT', side: 'SELL', qty: 200, price: 6.8, slippage: 2.1, fee: 0.7, impact: 4.5, totalCost: 7.8, venue: 'Binance' },
]

const MOCK_COST_BREAKDOWN = [
  { component: 'Slippage', value: 142.5, pct: 45, color: 'bg-accent-red' },
  { component: 'Exchange Fees', value: 89.2, pct: 28, color: 'bg-accent-yellow' },
  { component: 'Market Impact', value: 68.3, pct: 22, color: 'bg-accent-orange' },
  { component: 'Other', value: 15.0, pct: 5, color: 'bg-gray-600' },
]

const TCA = memo(function TCA() {
  const stats = useMemo(() => {
    const totalCost = MOCK_EXECUTIONS.reduce((s, e) => s + e.totalCost, 0)
    const totalSlippage = MOCK_EXECUTIONS.reduce((s, e) => s + e.slippage, 0)
    const avgSlippage = totalSlippage / MOCK_EXECUTIONS.length
    const totalFee = MOCK_EXECUTIONS.reduce((s, e) => s + e.fee, 0)
    const totalImpact = MOCK_EXECUTIONS.reduce((s, e) => s + e.impact, 0)
    const totalNotional = MOCK_EXECUTIONS.reduce((s, e) => s + e.qty * e.price, 0)
    const costBps = (totalCost / totalNotional) * 10000
    return { totalCost, avgSlippage, totalFee, totalImpact, costBps }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Receipt size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Transaction Cost Analysis</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_EXECUTIONS.length} fills</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Total Cost</div>
          <span className="text-sm font-mono text-accent-red">${stats.totalCost.toFixed(1)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Slip</div>
          <span className="text-sm font-mono text-accent-yellow">{stats.avgSlippage.toFixed(2)}bps</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Cost bps</div>
          <span className="text-sm font-mono text-accent-orange">{stats.costBps.toFixed(1)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Fees</div>
          <span className="text-sm font-mono text-gray-300">${stats.totalFee.toFixed(1)}</span>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Cost Breakdown</div>
        <div className="flex h-4 rounded overflow-hidden mb-2">
          {MOCK_COST_BREAKDOWN.map(c => (
            <div key={c.component} className={c.color} style={{ width: `${c.pct}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {MOCK_COST_BREAKDOWN.map(c => (
            <div key={c.component} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded ${c.color}`} />
              <span className="text-[9px] text-gray-400 flex-1">{c.component}</span>
              <span className="text-[9px] font-mono text-gray-300">${c.value.toFixed(1)}</span>
              <span className="text-[9px] text-gray-600">{c.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Execution details */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Recent Executions</div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {MOCK_EXECUTIONS.map(ex => (
            <div key={ex.id} className="grid grid-cols-7 gap-1 py-0.5 px-1.5 bg-bg-700 items-center">
              <span className="text-[9px] text-gray-300 truncate">{ex.symbol.replace('/USDT', '')}</span>
              <span className={`text-[9px] font-mono ${ex.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{ex.side}</span>
              <span className="text-[9px] font-mono text-gray-400">{ex.qty}</span>
              <span className="text-[9px] font-mono text-accent-yellow">{ex.slippage.toFixed(1)}bp</span>
              <span className="text-[9px] font-mono text-gray-400">${ex.fee.toFixed(1)}</span>
              <span className="text-[9px] font-mono text-accent-orange">${ex.impact.toFixed(1)}</span>
              <span className="text-[9px] font-mono text-accent-red">${ex.totalCost.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Sym</span><span>Side</span><span>Qty</span><span>Slip</span><span>Fee</span><span>Impact</span><span>Total</span>
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
    </div>
  )
})

export default TCA
