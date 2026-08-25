import { memo, useMemo } from 'react'
import { Activity, Zap, TrendingDown, Server, Wifi } from 'lucide-react'

const MOCK_LATENCY_POINTS = Array.from({ length: 20 }, (_, i) => ({
  t: i,
  ws: 12 + Math.sin(i * 0.5) * 5 + Math.random() * 3,
  order: 45 + Math.cos(i * 0.3) * 15 + Math.random() * 5,
  data: 8 + Math.random() * 2,
}))

const MOCK_HOPS = [
  { hop: 'Client → Gateway', latency: 2.1, status: 'good' },
  { hop: 'Gateway → Matching Engine', latency: 0.8, status: 'good' },
  { hop: 'Matching Engine → Risk Check', latency: 1.2, status: 'good' },
  { hop: 'Risk Check → Order Submit', latency: 3.5, status: 'warning' },
  { hop: 'Order Submit → Fill Confirm', latency: 8.7, status: 'warning' },
  { hop: 'Fill → WS Broadcast', latency: 1.1, status: 'good' },
  { hop: 'WS Broadcast → UI Render', latency: 5.3, status: 'warning' },
]

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

const LatencyPanel = memo(function LatencyPanel({ exchange }) {
  const wsLatency = exchange?.latency ?? 0
  const connected = exchange?.connected ?? false

  const stats = useMemo(() => {
    const wsPoints = MOCK_LATENCY_POINTS.map(p => p.ws)
    const orderPoints = MOCK_LATENCY_POINTS.map(p => p.order)
    const allPoints = [...wsPoints, ...orderPoints]
    return {
      wsAvg: wsPoints.reduce((s, v) => s + v, 0) / wsPoints.length,
      wsMin: Math.min(...wsPoints),
      wsMax: Math.max(...wsPoints),
      orderAvg: orderPoints.reduce((s, v) => s + v, 0) / orderPoints.length,
      orderMin: Math.min(...orderPoints),
      orderMax: Math.max(...orderPoints),
      p50: allPoints.sort((a, b) => a - b)[Math.floor(allPoints.length * 0.5)],
      p95: allPoints.sort((a, b) => a - b)[Math.floor(allPoints.length * 0.95)],
      p99: allPoints.sort((a, b) => a - b)[Math.floor(allPoints.length * 0.99)],
    }
  }, [])

  const totalHops = MOCK_HOPS.reduce((s, h) => s + h.latency, 0)
  const slowestHop = MOCK_HOPS.reduce((max, h) => h.latency > max.latency ? h : max, MOCK_HOPS[0])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-accent-yellow" />
          <span className="text-sm font-medium">Latency Monitor</span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi size={11} className={connected ? 'text-accent-green' : 'text-accent-red'} />
          <span className={`text-[10px] ${connected ? 'text-accent-green' : 'text-accent-red'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Current latency */}
      <div className="grid grid-cols-3 gap-1">
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Wifi size={10} className="text-accent-blue" />
            <span className="text-[9px] text-gray-600">WS</span>
          </div>
          <span className={`text-sm font-mono font-bold ${statusColor(wsLatency)}`}>
            {wsLatency.toFixed(1)}ms
          </span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Server size={10} className="text-accent-purple" />
            <span className="text-[9px] text-gray-600">Order</span>
          </div>
          <span className={`text-sm font-mono font-bold ${statusColor(stats.orderAvg)}`}>
            {stats.orderAvg.toFixed(1)}ms
          </span>
        </div>
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-0.5">
            <Activity size={10} className="text-accent-green" />
            <span className="text-[9px] text-gray-600">Data</span>
          </div>
          <span className="text-sm font-mono font-bold text-accent-green">
            8.2ms
          </span>
        </div>
      </div>

      {/* Percentiles */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Latency Percentiles</div>
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
        <div className="text-[10px] text-gray-600 uppercase mb-1">WS Latency Trend</div>
        <div className="flex items-end gap-0.5 h-12">
          {MOCK_LATENCY_POINTS.map((p, i) => (
            <div
              key={i}
              className={`flex-1 ${statusBg(p.ws)} opacity-70`}
              style={{ height: `${(p.ws / stats.wsMax) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600">
          <span>{stats.wsMin.toFixed(1)}ms min</span>
          <span>{stats.wsMax.toFixed(1)}ms max</span>
        </div>
      </div>

      {/* Network hops */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Network Hops</div>
        <div className="space-y-0.5">
          {MOCK_HOPS.map((hop, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] text-gray-600 w-4">{i + 1}</span>
                <span className="text-[10px] text-gray-400 truncate">{hop.hop}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] font-mono ${statusColor(hop.latency, 2, 5)}`}>
                  {hop.latency.toFixed(1)}ms
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ${hop.status === 'good' ? 'bg-accent-green' : 'bg-accent-yellow'}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1 px-1.5 text-[10px]">
          <span className="text-gray-600">Total Round Trip</span>
          <span className={`font-mono font-bold ${statusColor(totalHops, 15, 30)}`}>
            {totalHops.toFixed(1)}ms
          </span>
        </div>
      </div>

      {/* Slowest hop alert */}
      {slowestHop.latency > 5 && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
          <TrendingDown size={11} className="text-accent-yellow" />
          <span className="text-[10px] text-accent-yellow">
            Slowest: {slowestHop.hop} ({slowestHop.latency.toFixed(1)}ms)
          </span>
        </div>
      )}
    </div>
  )
})

export default LatencyPanel
