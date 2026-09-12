import { memo, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { ICONS, statusColor, StatCard, Label, SectionTitle } from '../utils/ui-helpers'

function statusIcon(status) {
  const s = (status || '').toUpperCase()
  if (s === 'FILLED') return ICONS.green()
  if (s === 'PENDING') return ICONS.yellow()
  return ICONS.red()
}

const STATUS_MAP = {
  filled: 'text-accent-green',
  pending: 'text-accent-yellow',
  default: 'text-accent-red',
}

const FillAnalytics = memo(function FillAnalytics({ fills }) {
  const stats = useMemo(() => {
    const list = fills || []
    const filled = list.filter(f => (f.status || '').toUpperCase() === 'FILLED').length
    const partial = list.filter(f => f.filled_quantity > 0 && f.filled_quantity < f.quantity).length
    const rejected = list.filter(f => (f.status || '').toUpperCase() === 'REJECTED').length
    const n = list.length || 1
    const fillRate = (filled / n) * 100
    const timed = list.filter(f => f.timestamp && f.received_at)
    const avgLatency = timed.length
      ? timed.reduce((s, f) => s + Math.max(0, f.received_at - f.timestamp * 1000), 0) / timed.length
      : 0
    const totalFees = list.reduce((s, f) => s + (f.fee || 0), 0)
    const avgSlip = list.length ? list.reduce((s, f) => s + (f.slippage || 0), 0) / list.length : 0
    return { filled, partial, rejected, fillRate, avgLatency, totalFees, avgSlip, n: list.length }
  }, [fills])

  const list = fills || []

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={BarChart3} title="Fill Analytics" right={<span className="text-[10px] text-gray-600">{stats.n} orders</span>} />

      {stats.n === 0 ? (
        <div className="text-gray-500 text-[10px] p-2">No fills yet — submit an order or wait for trading activity</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-1">
            <StatCard label="Fill Rate" value={`${stats.fillRate.toFixed(0)}%`} color="text-accent-green" />
            <StatCard label="Partial" value={`${((stats.partial / Math.max(1, stats.n)) * 100).toFixed(0)}%`} color="text-accent-yellow" />
            <StatCard label="Avg Latency" value={`${stats.avgLatency.toFixed(0)}ms`} color="text-gray-300" />
            <StatCard label="Rejected" value={stats.rejected} color="text-accent-red" />
          </div>

          {/* Fill quality distribution */}
          <div className="p-2 bg-bg-700 border border-bg-600 rounded">
            <Label className="mb-1">Fill Quality</Label>
            <div className="flex h-4 rounded overflow-hidden">
              <div className="bg-accent-green flex items-center justify-center" style={{ width: `${stats.fillRate}%` }}>
                <span className="text-[7px] text-white">{stats.filled} filled</span>
              </div>
              <div className="bg-accent-yellow flex items-center justify-center" style={{ width: `${(stats.partial / Math.max(1, stats.n)) * 100}%` }}>
                <span className="text-[7px] text-white">{stats.partial} partial</span>
              </div>
              <div className="bg-accent-red flex items-center justify-center" style={{ width: `${(stats.rejected / Math.max(1, stats.n)) * 100}%` }}>
                <span className="text-[7px] text-white">{stats.rejected} rej</span>
              </div>
            </div>
            <div className="flex gap-3 mt-1 text-[9px] text-gray-500 font-mono">
              <span>Fees: ${stats.totalFees.toFixed(2)}</span>
              <span>Avg slip: {stats.avgSlip.toFixed(4)}</span>
            </div>
          </div>

          {/* Fill details */}
          <div>
            <Label className="mb-1">Recent Fills</Label>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {list.map((f, i) => {
                const isPartial = f.filled_quantity > 0 && f.filled_quantity < f.quantity
                const lat = f.timestamp && f.received_at ? Math.max(0, f.received_at - f.timestamp * 1000) : null
                return (
                  <div key={f.id || i} className="py-0.5 px-1.5 bg-bg-700">
                    <div className="flex items-center gap-2">
                      {statusIcon(f.status)}
                      <span className="text-[9px] text-gray-300 w-12 truncate">{(f.symbol || '').replace('/USDT', '')}</span>
                      <span className={`text-[9px] font-mono w-10 ${(f.side || '').toUpperCase() === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{f.side}</span>
                      <span className="text-[9px] font-mono text-gray-400 w-16">{f.filled_quantity}/{f.quantity}</span>
                      <span className="text-[9px] font-mono text-gray-300 w-16">${f.filled_price || f.price || '—'}</span>
                      <span className="text-[9px] font-mono text-gray-500 w-12 text-right">{lat != null ? `${lat.toFixed(0)}ms` : '—'}</span>
                      <span className={`text-[8px] uppercase ${statusColor((f.status || '').toLowerCase(), STATUS_MAP)} w-10 text-right`}>{f.status}</span>
                    </div>
                    {isPartial && (
                      <div className="text-[8px] text-accent-yellow pl-4 mt-0.5">
                        Partial fill: {((f.filled_quantity / f.quantity) * 100).toFixed(0)}% of requested quantity
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
            <span>{stats.filled} full fills / {stats.partial} partial / {stats.rejected} rejected</span>
            <span>Avg latency: {stats.avgLatency.toFixed(0)}ms</span>
          </div>
        </>
      )}
    </div>
  )
})

export default memo(FillAnalytics)
