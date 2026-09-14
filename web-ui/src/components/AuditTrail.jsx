import { memo, useMemo, useState } from 'react'
import { History, Filter, Plus, DollarSign, Zap } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const ICON_MAP = {
  dollar: DollarSign,
  plus: Plus,
  signal: Zap,
}

function actionColor(action) {
  if (action.includes('SELL') || action.includes('SHORT')) return 'text-accent-red'
  if (action.includes('BUY') || action.includes('LONG') || action.includes('FILL')) return 'text-accent-green'
  if (action.includes('SIGNAL')) return 'text-accent-yellow'
  return 'text-accent-blue'
}

const fmtTs = (ms) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

/**
 * Audit Trail — real activity log built from order fills and strategy
 * signals. Config-change/user-action entries require a backend audit feed.
 */
const AuditTrail = memo(function AuditTrail({ fills, signals }) {
  const [filter, setFilter] = useState('ALL')

  const entries = useMemo(() => {
    const out = []
    for (const f of fills || []) {
      out.push({
        id: `fill-${f.id}`,
        ts: f.received_at ?? (f.timestamp ? f.timestamp * 1000 : 0),
        user: f.exchange || '?',
        action: 'ORDER_FILL',
        resource: f.symbol,
        newValue: `${f.side} ${f.filled_quantity ?? f.quantity} @ ${f.filled_price ?? f.price}`,
        icon: 'dollar',
      })
    }
    for (const s of signals || []) {
      out.push({
        id: `sig-${s.timestamp}-${s.strategy}-${s.symbol}`,
        ts: s.timestamp ? s.timestamp * 1000 : 0,
        user: s.strategy || '?',
        action: 'SIGNAL',
        resource: `${s.symbol} (${s.exchange})`,
        newValue: `${s.direction} conf ${s.confidence}%`,
        icon: 'signal',
      })
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 100)
  }, [fills, signals])

  const users = useMemo(() => {
    const u = [...new Set(entries.map(e => e.user))]
    return ['ALL', ...u]
  }, [entries])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return entries
    return entries.filter(e => e.user === filter)
  }, [entries, filter])

  const stats = useMemo(() => {
    const fills_ = entries.filter(e => e.action === 'ORDER_FILL').length
    const signals_ = entries.filter(e => e.action === 'SIGNAL').length
    return { fills: fills_, signals: signals_, total: entries.length }
  }, [entries])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Audit Trail</span>
        </div>
        <span className="text-[10px] text-gray-600">{filtered.length} entries</span>
      </div>

      {entries.length === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No activity yet — fills and signals appear here as they occur</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-1">
            <StatCard label="Fills" value={stats.fills} color="text-accent-green" compact />
            <StatCard label="Signals" value={stats.signals} color="text-accent-yellow" compact />
            <StatCard label="Total" value={stats.total} color="text-gray-300" compact />
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <Filter size={10} className="text-gray-600" />
            {users.map(u => (
              <button
                key={u}
                onClick={() => setFilter(u)}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  filter === u ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          {/* Audit entries */}
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {filtered.map(entry => {
              const Icon = ICON_MAP[entry.icon] || Plus
              return (
                <div key={entry.id} className="py-1 px-1.5 bg-bg-700">
                  <div className="flex items-center gap-1.5">
                    <Icon size={10} className="text-gray-500 shrink-0" />
                    <span className="text-[9px] text-gray-600 font-mono shrink-0">{fmtTs(entry.ts)}</span>
                    <span className="text-[9px] text-accent-blue shrink-0">{entry.user}</span>
                    <span className={`text-[9px] font-mono shrink-0 ${actionColor(entry.action + ' ' + (entry.newValue || ''))}`}>
                      {entry.action}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                    <span className="text-[10px] text-gray-300 truncate flex-1">{entry.resource}</span>
                    {entry.newValue && (
                      <span className="text-[9px] text-accent-green font-mono">{entry.newValue}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span>{stats.total} events this session</span>
            <span>Live session log</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(AuditTrail)
