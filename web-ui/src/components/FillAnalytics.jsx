import { memo, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { ICONS, statusColor, StatCard, Label, SectionTitle } from '../utils/ui-helpers'
import { MOCK_FILLS } from '../utils/mock-data'

function statusIcon(status) {
  if (status === 'filled') return ICONS.green()
  if (status === 'partial') return ICONS.yellow()
  return ICONS.red()
}

const STATUS_MAP = {
  filled: 'text-accent-green',
  partial: 'text-accent-yellow',
  default: 'text-accent-red',
}

const FillAnalytics = memo(function FillAnalytics() {
  const stats = useMemo(() => {
    const filled = MOCK_FILLS.filter(f => f.status === 'filled').length
    const partial = MOCK_FILLS.filter(f => f.status === 'partial').length
    const rejected = MOCK_FILLS.filter(f => f.status === 'rejected').length
    const fillRate = (filled / MOCK_FILLS.length) * 100
    const avgLatency = MOCK_FILLS.filter(f => f.status !== 'rejected').reduce((s, f) => s + f.latency, 0) / (MOCK_FILLS.length - rejected)
    const partialRate = (partial / MOCK_FILLS.length) * 100
    return { filled, partial, rejected, fillRate, avgLatency, partialRate }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={BarChart3} title="Fill Analytics" right={<span className="text-[10px] text-gray-600">{MOCK_FILLS.length} orders</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Fill Rate" value={`${stats.fillRate.toFixed(0)}%`} color="text-accent-green" />
        <StatCard label="Partial" value={`${stats.partialRate.toFixed(0)}%`} color="text-accent-yellow" />
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
          <div className="bg-accent-yellow flex items-center justify-center" style={{ width: `${stats.partialRate}%` }}>
            <span className="text-[7px] text-white">{stats.partial} partial</span>
          </div>
          <div className="bg-accent-red flex items-center justify-center" style={{ width: `${(stats.rejected / MOCK_FILLS.length) * 100}%` }}>
            <span className="text-[7px] text-white">{stats.rejected} rej</span>
          </div>
        </div>
      </div>

      {/* Fill details */}
      <div>
        <Label className="mb-1">Recent Fills</Label>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {MOCK_FILLS.map(f => (
            <div key={f.id} className="py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                {statusIcon(f.status)}
                <span className="text-[9px] text-gray-300 w-12 truncate">{f.symbol.replace('/USDT', '')}</span>
                <span className={`text-[9px] font-mono w-10 ${f.side === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{f.side}</span>
                <span className="text-[9px] font-mono text-gray-400 w-16">{f.fillQty}/{f.reqQty}</span>
                <span className="text-[9px] font-mono text-gray-300 w-16">${f.fillPrice || '—'}</span>
                <span className="text-[9px] font-mono text-gray-500 w-12 text-right">{f.latency}ms</span>
                <span className={`text-[8px] uppercase ${statusColor(f.status, STATUS_MAP)} w-10 text-right`}>{f.status}</span>
              </div>
              {f.partialFill && (
                <div className="text-[8px] text-accent-yellow pl-4 mt-0.5">
                  Partial fill: {((f.fillQty / f.reqQty) * 100).toFixed(0)}% of requested quantity
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span>{stats.filled} full fills / {stats.partial} partial / {stats.rejected} rejected</span>
        <span>Avg latency: {stats.avgLatency.toFixed(0)}ms</span>
      </div>
    </div>
  )
})

export default memo(FillAnalytics)
