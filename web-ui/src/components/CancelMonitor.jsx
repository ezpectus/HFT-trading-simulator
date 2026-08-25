import { memo, useMemo, useState } from 'react'
import { XCircle, Filter, AlertTriangle, Clock } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_CANCELS = [
  { id: 1, orderId: 'ord_8a3f', symbol: 'BTC/USDT', side: 'BUY', reason: 'Price moved', latency: 3200, ts: '12:45:32', source: 'user' },
  { id: 2, orderId: 'ord_9b2e', symbol: 'ETH/USDT', side: 'SELL', reason: 'Timeout', latency: 5000, ts: '12:45:28', source: 'system' },
  { id: 3, orderId: 'ord_1c5d', symbol: 'SOL/USDT', side: 'BUY', reason: 'Insufficient liquidity', latency: 1800, ts: '12:45:20', source: 'system' },
  { id: 4, orderId: 'ord_3f8a', symbol: 'AVAX/USDT', side: 'BUY', reason: 'User cancelled', latency: 450, ts: '12:45:15', source: 'user' },
  { id: 5, orderId: 'ord_5e1b', symbol: 'LINK/USDT', side: 'SELL', reason: 'Risk limit hit', latency: 2200, ts: '12:45:10', source: 'risk' },
  { id: 6, orderId: 'ord_7d4c', symbol: 'BTC/USDT', side: 'SELL', reason: 'Price moved', latency: 2800, ts: '12:45:05', source: 'system' },
  { id: 7, orderId: 'ord_2a9f', symbol: 'DOT/USDT', side: 'BUY', reason: 'Timeout', latency: 5000, ts: '12:44:58', source: 'system' },
  { id: 8, orderId: 'ord_6b3e', symbol: 'ETH/USDT', side: 'BUY', reason: 'Circuit breaker', latency: 100, ts: '12:44:50', source: 'risk' },
]

const FILTERS = ['ALL', 'user', 'system', 'risk']

const CANCEL_REASONS = [
  { reason: 'Price moved', count: 2, pct: 25 },
  { reason: 'Timeout', count: 2, pct: 25 },
  { reason: 'Insufficient liquidity', count: 1, pct: 12.5 },
  { reason: 'User cancelled', count: 1, pct: 12.5 },
  { reason: 'Risk limit hit', count: 1, pct: 12.5 },
  { reason: 'Circuit breaker', count: 1, pct: 12.5 },
]

const CancelMonitor = memo(function CancelMonitor() {
  const [filter, setFilter] = useState('ALL')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return MOCK_CANCELS
    return MOCK_CANCELS.filter(c => c.source === filter)
  }, [filter])

  const stats = useMemo(() => {
    const totalCancels = MOCK_CANCELS.length
    const userCancels = MOCK_CANCELS.filter(c => c.source === 'user').length
    const systemCancels = MOCK_CANCELS.filter(c => c.source === 'system').length
    const riskCancels = MOCK_CANCELS.filter(c => c.source === 'risk').length
    const avgLatency = MOCK_CANCELS.reduce((s, c) => s + c.latency, 0) / MOCK_CANCELS.length
    return { totalCancels, userCancels, systemCancels, riskCancels, avgLatency }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XCircle size={14} className="text-accent-red" />
          <span className="text-sm font-medium">Cancel Monitor</span>
        </div>
        <span className="text-[10px] text-gray-600">{filtered.length} cancels</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Total" value={stats.totalCancels} color="text-accent-red" compact />
        <StatCard label="User" value={stats.userCancels} color="text-gray-300" compact />
        <StatCard label="System" value={stats.systemCancels} color="text-accent-yellow" compact />
        <StatCard label="Risk" value={stats.riskCancels} color="text-accent-orange" compact />
      </div>

      {/* Cancel reasons breakdown */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Cancel Reasons</div>
        <div className="space-y-0.5">
          {CANCEL_REASONS.map(r => (
            <div key={r.reason} className="flex items-center gap-2">
              <span className="text-[9px] text-gray-400 flex-1 truncate">{r.reason}</span>
              <div className="w-20 h-2 bg-bg-600 rounded-full overflow-hidden">
                <div className="h-full bg-accent-red opacity-70" style={{ width: `${r.pct}%` }} />
              </div>
              <span className="text-[9px] font-mono text-gray-500 w-6 text-right">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1">
        <Filter size={10} className="text-gray-600" />
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors uppercase ${
              filter === f ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Cancel list */}
      <div className="bg-bg-900 border border-bg-600 rounded max-h-40 overflow-y-auto">
        {filtered.map(c => (
          <div key={c.id} className="py-0.5 px-2 border-b border-bg-800">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-600 font-mono shrink-0 w-16">{c.ts}</span>
              <span className="text-[9px] text-gray-300 w-12 truncate">{c.symbol.replace('/USDT', '')}</span>
              <span className={`text-[9px] font-mono w-10 ${c.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{c.side}</span>
              <span className="text-[9px] text-gray-400 flex-1 truncate">{c.reason}</span>
              <span className={`text-[8px] uppercase px-1 rounded ${
                c.source === 'user' ? 'bg-bg-600 text-gray-400' :
                c.source === 'system' ? 'bg-accent-yellow/20 text-accent-yellow' :
                'bg-accent-orange/20 text-accent-orange'
              }`}>{c.source}</span>
              <span className="text-[9px] text-gray-600 font-mono w-12 text-right">{c.latency}ms</span>
            </div>
          </div>
        ))}
      </div>

      {stats.riskCancels > 0 && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-orange/10 border border-accent-orange/30">
          <AlertTriangle size={11} className="text-accent-orange" />
          <span className="text-[10px] text-accent-orange">
            {stats.riskCancels} risk-triggered cancels — review risk parameters
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Clock size={9} />
          Avg cancel latency: {stats.avgLatency.toFixed(0)}ms
        </span>
        <span>Cancel rate: {(stats.totalCancels / (stats.totalCancels + 20) * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
})

export default CancelMonitor
