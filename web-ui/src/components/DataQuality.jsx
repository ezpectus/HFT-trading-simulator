import { memo, useMemo } from 'react'
import { ShieldCheck, Database, Activity } from 'lucide-react'
import { formatVolume } from '../utils/format'
import { ICONS, statusColor, StatCard, Label, SectionTitle } from '../utils/ui-helpers'
import { groupCandles } from '../utils/candles'

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

const EXPECTED_INTERVAL_S = 60 // sim candles are 1-minute
const STALE_AFTER_S = 180      // >3 bars since last candle = stale

/**
 * Data Quality — real checks on the live candle stream for the
 * selected exchange: completeness, staleness, gaps, OHLC sanity.
 */
const DataQuality = memo(function DataQuality({ candles, exchange, symbol }) {
  const { checks, symStats, stats } = useMemo(() => {
    const bySym = groupCandles(candles, exchange)
    const now = Date.now() / 1000

    const symStats = Object.entries(bySym).map(([sym, cds]) => {
      const sorted = [...cds].sort((a, b) => a.timestamp - b.timestamp)
      const last = sorted[sorted.length - 1]
      const age = last ? Math.round(now - last.timestamp) : null
      let gaps = 0, badOhlc = 0, zeroVol = 0
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].timestamp - sorted[i - 1].timestamp > EXPECTED_INTERVAL_S * 1.5) gaps++
      }
      for (const c of sorted) {
        if (c.high < c.low || c.close > c.high || c.close < c.low) badOhlc++
        if (!c.volume) zeroVol++
      }
      const status = age == null ? 'stale' : age > STALE_AFTER_S ? 'stale' : gaps > 0 || badOhlc > 0 ? 'degraded' : 'healthy'
      return { symbol: sym, count: sorted.length, candleAge: age, gaps, badOhlc, zeroVol, volume: last?.volume || 0, status }
    }).sort((a, b) => a.symbol.localeCompare(b.symbol))

    const sel = bySym[symbol]
    const checks = [
      { id: 'connected', name: `Stream active (${exchange})`, status: symStats.length > 0 ? 'pass' : 'fail', detail: `${symStats.length} symbols` },
      { id: 'freshness', name: 'Candle freshness', status: symStats.every(s => (s.candleAge ?? 1e9) <= STALE_AFTER_S) ? 'pass' : 'warn', detail: `${symStats.filter(s => (s.candleAge ?? 0) > STALE_AFTER_S).length} stale` },
      { id: 'gaps', name: 'Timestamp continuity', status: symStats.every(s => s.gaps === 0) ? 'pass' : 'warn', detail: `${symStats.reduce((a, s) => a + s.gaps, 0)} gaps` },
      { id: 'ohlc', name: 'OHLC sanity', status: symStats.every(s => s.badOhlc === 0) ? 'pass' : 'fail', detail: `${symStats.reduce((a, s) => a + s.badOhlc, 0)} bad bars` },
      { id: 'volume', name: 'Volume present', status: symStats.every(s => s.zeroVol === 0) ? 'pass' : 'warn', detail: `${symStats.reduce((a, s) => a + s.zeroVol, 0)} zero-vol` },
      { id: 'selected', name: `${symbol || 'selected'} data`, status: (sel?.length || 0) > 0 ? 'pass' : 'warn', detail: `${sel?.length || 0} candles` },
    ]

    const passed = checks.filter(c => c.status === 'pass').length
    const warned = checks.filter(c => c.status === 'warn').length
    const failed = checks.filter(c => c.status === 'fail').length
    const healthy = symStats.filter(s => s.status === 'healthy').length
    const stale = symStats.filter(s => s.status === 'stale').length
    const score = Math.round((passed / checks.length) * 100)
    return { checks, symStats, stats: { passed, warned, failed, healthy, stale, score, total: checks.length } }
  }, [candles, exchange, symbol])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={ShieldCheck} title="Data Quality" right={<span className={`text-sm font-mono font-bold ${statusColor(stats.score >= 80 ? 'pass' : stats.score >= 60 ? 'warn' : 'fail', STATUS_MAP)}`}>{stats.score}%</span>} />

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
          {checks.map(check => (
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
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {symStats.map(sym => (
            <div key={sym.symbol} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              {statusIcon(sym.status)}
              <span className="text-[10px] text-gray-300 w-20 truncate">{sym.symbol.replace('/USDT', '')}</span>
              <span className="text-[9px] text-gray-600 w-16">Age: {sym.candleAge ?? '—'}s</span>
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
          {stats.healthy}/{symStats.length} symbols healthy
        </span>
        <span>{stats.stale} stale</span>
      </div>
    </div>
  )
})

export default memo(DataQuality)
