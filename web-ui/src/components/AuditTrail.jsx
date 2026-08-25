import { memo, useMemo, useState } from 'react'
import { History, User, Edit, Trash2, Plus, Settings, DollarSign, Shield } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_AUDIT_ENTRIES = [
  { id: 1, ts: '2024-08-25 12:45', user: 'admin', action: 'CONFIG_UPDATE', resource: 'risk.max_position_size', oldValue: '0.10', newValue: '0.08', icon: 'settings' },
  { id: 2, ts: '2024-08-25 12:30', user: 'trader1', action: 'ORDER_SUBMIT', resource: 'BTC/USDT', oldValue: null, newValue: 'BUY 0.5 @ 44100', icon: 'dollar' },
  { id: 3, ts: '2024-08-25 12:15', user: 'admin', action: 'STRATEGY_ENABLE', resource: 'MeanReversion', oldValue: 'disabled', newValue: 'enabled', icon: 'plus' },
  { id: 4, ts: '2024-08-25 11:50', user: 'trader2', action: 'ORDER_CANCEL', resource: 'ETH/USDT #ord_8a3f', oldValue: 'PENDING', newValue: 'CANCELLED', icon: 'trash' },
  { id: 5, ts: '2024-08-25 11:30', user: 'admin', action: 'CONFIG_UPDATE', resource: 'signal.min_confidence', oldValue: '0.60', newValue: '0.65', icon: 'settings' },
  { id: 6, ts: '2024-08-25 11:00', user: 'system', action: 'CIRCUIT_BREAKER', resource: 'trading_engine', oldValue: 'ACTIVE', newValue: 'HALTED', icon: 'shield' },
  { id: 7, ts: '2024-08-25 10:45', user: 'trader1', action: 'ORDER_SUBMIT', resource: 'SOL/USDT', oldValue: null, newValue: 'SELL 50 @ 96.2', icon: 'dollar' },
  { id: 8, ts: '2024-08-25 10:30', user: 'admin', action: 'STRATEGY_DISABLE', resource: 'MarketMaking', oldValue: 'enabled', newValue: 'disabled', icon: 'edit' },
  { id: 9, ts: '2024-08-25 10:15', user: 'system', action: 'CIRCUIT_BREAKER', resource: 'trading_engine', oldValue: 'HALTED', newValue: 'ACTIVE', icon: 'shield' },
  { id: 10, ts: '2024-08-25 09:00', user: 'admin', action: 'CONFIG_UPDATE', resource: 'risk.daily_drawdown', oldValue: '0.10', newValue: '0.08', icon: 'settings' },
]

const ICON_MAP = {
  settings: Settings,
  dollar: DollarSign,
  plus: Plus,
  trash: Trash2,
  edit: Edit,
  shield: Shield,
}

function actionColor(action) {
  if (action.includes('CANCEL') || action.includes('DISABLE')) return 'text-accent-red'
  if (action.includes('ENABLE') || action.includes('SUBMIT')) return 'text-accent-green'
  if (action.includes('UPDATE')) return 'text-accent-yellow'
  if (action.includes('CIRCUIT')) return 'text-accent-orange'
  return 'text-accent-blue'
}

const AuditTrail = memo(function AuditTrail() {
  const [filter, setFilter] = useState('ALL')

  const users = useMemo(() => {
    const u = [...new Set(MOCK_AUDIT_ENTRIES.map(e => e.user))]
    return ['ALL', ...u]
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return MOCK_AUDIT_ENTRIES
    return MOCK_AUDIT_ENTRIES.filter(e => e.user === filter)
  }, [filter])

  const stats = useMemo(() => {
    const configChanges = MOCK_AUDIT_ENTRIES.filter(e => e.action === 'CONFIG_UPDATE').length
    const orders = MOCK_AUDIT_ENTRIES.filter(e => e.action.includes('ORDER')).length
    const circuitBreaks = MOCK_AUDIT_ENTRIES.filter(e => e.action === 'CIRCUIT_BREAKER').length
    return { configChanges, orders, circuitBreaks, total: MOCK_AUDIT_ENTRIES.length }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Audit Trail</span>
        </div>
        <span className="text-[10px] text-gray-600">{filtered.length} entries</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Config Changes" value={stats.configChanges} color="text-accent-yellow" compact />
        <StatCard label="Orders" value={stats.orders} color="text-accent-green" compact />
        <StatCard label="Circuit Breaks" value={stats.circuitBreaks} color="text-accent-red" compact />
      </div>

      {/* User filter */}
      <div className="flex items-center gap-1 flex-wrap">
        <User size={10} className="text-gray-600" />
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
          const Icon = ICON_MAP[entry.icon] || Edit
          return (
            <div key={entry.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-1.5">
                <Icon size={10} className="text-gray-500 shrink-0" />
                <span className="text-[9px] text-gray-600 font-mono shrink-0">{entry.ts}</span>
                <span className="text-[9px] text-accent-blue shrink-0">{entry.user}</span>
                <span className={`text-[9px] font-mono shrink-0 ${actionColor(entry.action)}`}>
                  {entry.action}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                <span className="text-[10px] text-gray-300 truncate flex-1">{entry.resource}</span>
                {entry.oldValue && (
                  <span className="text-[9px] text-accent-red font-mono line-through">{entry.oldValue}</span>
                )}
                {entry.newValue && (
                  <span className="text-[9px] text-accent-green font-mono">{entry.newValue}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>{stats.total} total audit events</span>
        <span>Retention: 90 days</span>
      </div>
    </div>
  )
})

export default memo(AuditTrail)
