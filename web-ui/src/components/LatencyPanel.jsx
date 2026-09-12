import { memo, useMemo, useRef } from 'react'
import { Activity, Zap, Server, Wifi } from 'lucide-react'
import { WarningBanner, Label, SectionTitle } from '../utils/ui-helpers'

function statusColor(ms, good = 10, warn = 50) {
  if (ms <= good) return 'text-accent-green'
  if (ms <= warn) return 'text-accent-yellow'
  return 'text-accent-red'
}

function statusBg(ms, good = 10, warn = 50) {
  if (ms <= good) return 'bg-accent-green'
  if (ms <= warn) return 'bg-accent-yellow'
  return 'bg-accent-red'
}

const MAX_SAMPLES = 60

/**
 * Latency Monitor — real WS round-trip latency measured by useWebSocket
 * (server timestamp → client receive time), accumulated into a rolling
 * history for percentiles and the sparkline.
 */
const LatencyPanel = memo(function LatencyPanel({ exchange }) {
  const wsLatency = exchange?.latency ?? 0
  const connected = exchange?.connected ?? false

  // Rolling sample history — appended on each render where latency changed
  const historyRef = useRef([])
  const lastVal = historyRef.current[historyRef.current.length - 1]
  if (connected && wsLatency > 0 && wsLatency !== lastVal) {
    historyRef.current = [...historyRef.current.slice(-(MAX_SAMPLES - 1)), wsLatency]
  }
  const samples = historyRef.current

  const stats = useMemo(() => {
    if (!samples.length) return null
    const sorted = [...samples].sort((a, b) => a - b)
    return {
      wsAvg: samples.reduce((s, v) => s + v, 0) / samples.length,
      wsMin: sorted[0],
      wsMax: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    }
  }, [samples])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Zap} title="Latency Monitor" iconColor="text-accent-yellow" right={<div className="flex items-center gap-1"><Wifi size={11} className={connected ? 'text-accent-green' : 'text-accent-red'} /><span className={`text-[10px] ${connected ? 'text-accent-green' : 'text-accent-red'}`}>{connected ? 'Connected' : 'Disconnected'}</span></div>} />

      {/* Current latency */}
      <div className="grid grid-cols-3 gap-1">
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Wifi size={10} className="text-accent-blue" />
            <span className="text-[9px] text-gray-600">WS RTT</span>
          </div>
          <span className={`text-sm font-mono font-bold ${statusColor(wsLatency)}`}>
            {wsLatency.toFixed(1)}ms
          </span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Server size={10} className="text-accent-purple" />
            <span className="text-[9px] text-gray-600">Avg</span>
          </div>
          <span className={`text-sm font-mono font-bold ${stats ? statusColor(stats.wsAvg) : 'text-gray-500'}`}>
            {stats ? `${stats.wsAvg.toFixed(1)}ms` : '—'}
          </span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Activity size={10} className="text-accent-green" />
            <span className="text-[9px] text-gray-600">Samples</span>
          </div>
          <span className="text-sm font-mono font-bold text-gray-300">
            {samples.length}
          </span>
        </div>
      </div>

      {!stats ? (
        <div className="text-gray-500 text-[10px] p-2">Collecting latency samples from the live WebSocket feed…</div>
      ) : (
        <>
          {/* Percentiles */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <Label className="mb-1">WS Latency Percentiles</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-gray-600">p50</span>
                <span className="text-[11px] font-mono text-accent-green">{stats.p50.toFixed(1)}ms</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-gray-600">p95</span>
                <span className="text-[11px] font-mono text-accent-yellow">{stats.p95.toFixed(1)}ms</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-gray-600">p99</span>
                <span className="text-[11px] font-mono text-accent-red">{stats.p99.toFixed(1)}ms</span>
              </div>
            </div>
          </div>

          {/* Sparkline */}
          <div className="p-2 bg-bg-700 border border-bg-600">
            <Label className="mb-1">WS Latency Trend (live)</Label>
            <div className="flex items-end gap-0.5 h-12">
              {samples.map((v, i) => (
                <div
                  key={i}
                  className={`flex-1 ${statusBg(v)} opacity-70`}
                  style={{ height: `${(v / (stats.wsMax || 1)) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-gray-600">
              <span>{stats.wsMin.toFixed(1)}ms min</span>
              <span>{stats.wsMax.toFixed(1)}ms max</span>
            </div>
          </div>

          {/* Slow spike alert */}
          {stats.wsMax > 50 && (
            <WarningBanner icon={Zap} color="text-accent-yellow">
              Latency spike: {stats.wsMax.toFixed(1)}ms max observed
            </WarningBanner>
          )}
        </>
      )}

      <div className="text-[8px] text-gray-600 pt-1 border-t border-bg-600">
        Measured: server message timestamp → browser receive. Order-path hops are not instrumented server-side.
      </div>
    </div>
  )
})

export default memo(LatencyPanel)
