import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'

export default function ExchangeBreakdown({ accounts }) {
  const [exSortMode, setExSortMode] = useState('pnl')

  if (!accounts || Object.keys(accounts).length === 0) return null

  return (
    <div className="bg-bg-700 p-3 border border-bg-600">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">Per-Exchange Breakdown</span>
        <button
          onClick={() => setExSortMode(m => m === 'pnl' ? 'winRate' : m === 'winRate' ? 'balance' : 'pnl')}
          className="flex items-center gap-0.5 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
          title={`Sort by ${exSortMode === 'pnl' ? 'PnL' : exSortMode === 'winRate' ? 'Win Rate' : 'Balance'}`}
        >
          <ArrowUpDown size={10} />
          {exSortMode === 'pnl' ? 'PnL' : exSortMode === 'winRate' ? 'Win%' : 'Balance'}
        </button>
      </div>
      <div className="space-y-1.5">
        {Object.entries(accounts)
          .map(([id, acc]) => ({ id, acc, pnl: acc.total_pnl || acc.pnl || 0, winRate: acc.total_trades > 0 ? ((acc.winning_trades || 0) / acc.total_trades) * 100 : 0, balance: acc.balance || 0 }))
          .sort((a, b) => exSortMode === 'winRate' ? b.winRate - a.winRate : exSortMode === 'balance' ? b.balance - a.balance : b.pnl - a.pnl)
          .map(({ id, acc, pnl, winRate }) => (
            <div key={id} className="flex items-center justify-between text-xs">
              <span className="text-gray-300 capitalize">{id}</span>
              <div className="flex gap-3">
                <span className="text-gray-400">${(acc.balance || 0).toFixed(2)}</span>
                <span className={pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </span>
                <span className="text-gray-500">{winRate.toFixed(1)}%</span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
