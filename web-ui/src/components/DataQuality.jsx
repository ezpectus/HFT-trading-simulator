import { memo, useMemo } from 'react'
import { ShieldCheck, Database, Activity } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { ICONS, statusColor, StatCard, Label } from '../utils/ui-helpers'

const MOCK_CHECKS = [
  { id: 'candles-fresh', name: 'Candle Freshness', status: 'pass', detail: 'Last candle 2s ago', threshold: '< 10s' },
  { id: 'fills-integrity', name: 'Fills Integrity', status: 'pass', detail: '0 missing fill IDs', threshold: '0 gaps' },
  { id: 'orderbook-sync', name: 'Orderbook Sync', status: 'warn', detail: '3 stale symbols', threshold: '0 stale' },
  { id: 'ws-latency', name: 'WS Latency', status: 'pass', detail: 'Avg 12ms', threshold: '< 50ms' },
  { id: 'price-staleness', name: 'Price Staleness', status: 'fail', detail: '5 symbols > 30s stale', threshold: '0 stale' },
  { id: 'volume-anomaly', name: 'Volume Anomaly', status: 'warn', detail: '2 symbols with 0 volume', threshold: '0 symbols' },
  { id: 'gap-detection', name: 'Gap Detection', status: 'pass', detail: 'No gaps detected', threshold: '0 gaps' },
  { id: 'duplicate-check', name: 'Duplicate Trades', status: 'pass', detail: '0 duplicates', threshold: '0 dups' },
]

const MOCK_SYMBOLS = [
  { symbol: 'BTC/USDT', candleAge: 2, volume: 15420, gaps: 0, status: 'healthy' },
  { symbol: 'ETH/USDT', candleAge: 1, volume: 8930, gaps: 0, status: 'healthy' },
  { symbol: 'SOL/USDT', candleAge: 3, volume: 4210, gaps: 0, status: 'healthy' },
  { symbol: 'AVAX/USDT', candleAge: 45, volume: 0, gaps: 2, status: 'stale' },
  { symbol: 'LINK/USDT', candleAge: 1, volume: 3120, gaps: 0, status: 'healthy' },
  { symbol: 'DOT/USDT', candleAge: 35, volume: 0, gaps: 1, status: 'stale' },
  { symbol: 'MATIC/USDT', candleAge: 2, volume: 8240, gaps: 0, status: 'healthy' },
  { symbol: 'ATOM/USDT', candleAge: 4, volume: 1890, gaps: 0, status: 'degraded' },
]

function statusIcon(status) {
  if (status === 'pass' || status === 'healthy') return ICONS.green()
  if (status === 'warn' || status === 'degraded') return ICONS.yellow()
  return ICONS.red()
}

const STATUS_MAP = {
  pass: 'text-accent-green',
  healthy: 'text-accent-green',
  warn: 'text-accent-yellow',
  degraded: 'text-accent-yellow',
  default: 'text-accent-red',
}

const DataQuality = memo(function DataQuality() {
  const stats = useMemo(() => {
    const passed = MOCK_CHECKS.filter(c => c.status === 'pass').length
    const warned = MOCK_CHECKS.filter(c => c.status === 'warn').length
    const failed = MOCK_CHECKS.filter(c => c.status === 'fail').length
    const healthy = MOCK_SYMBOLS.filter(s => s.status === 'healthy').length
    const stale = MOCK_SYMBOLS.filter(s => s.status === 'stale').length
    const score = Math.round((passed / MOCK_CHECKS.length) * 100)
    return { passed, warned, failed, healthy, stale, score, total: MOCK_CHECKS.length }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Data Quality</span>
        </div>
        <span className={`text-sm font-mono font-bold ${statusColor(stats.score >= 80 ? 'pass' : stats.score >= 60 ? 'warn' : 'fail', STATUS_MAP)}`}>
          {stats.score}%
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Passed" value={stats.passed} color="text-accent-green" />
        <StatCard label="Warnings" value={stats.warned} color="text-accent-yellow" />
        <StatCard label="Failed" value={stats.failed} color="text-accent-red" />
      </div>

      {/* Health checks */}
      <div>
        <Label className="mb-1">Health Checks</Label>
        <div className="space-y-0.5">
          {MOCK_CHECKS.map(check => (
            <div key={check.id} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              {statusIcon(check.status)}
              <span className="text-[10px] text-gray-300 flex-1 truncate">{check.name}</span>
              <span className={`text-[9px] ${statusColor(check.status, STATUS_MAP)}`}>{check.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Symbol status */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Database size={11} className="text-gray-500" />
          <Label>Symbol Status</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_SYMBOLS.map(sym => (
            <div key={sym.symbol} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              {statusIcon(sym.status)}
              <span className="text-[10px] text-gray-300 w-20 truncate">{sym.symbol.replace('/USDT', '')}</span>
              <span className="text-[9px] text-gray-600 w-16">Age: {sym.candleAge}s</span>
              <span className="text-[9px] text-gray-500 w-16">Vol: {sym.volume > 0 ? formatVolume(sym.volume) : '—'}</span>
              <span className={`text-[9px] w-8 text-right ${sym.gaps > 0 ? 'text-accent-red' : 'text-gray-600'}`}>
                {sym.gaps} gaps
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Activity size={9} />
          {stats.healthy}/{MOCK_SYMBOLS.length} symbols healthy
        </span>
        <span>{stats.stale} stale</span>
      </div>
    </div>
  )
})

export default DataQuality
