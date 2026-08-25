import { memo, useMemo } from 'react'
import { Gauge, Cpu, MemoryStick, AlertTriangle, Zap } from 'lucide-react'
import { statusColor, statusBg, Bar, WarningBanner, SectionTitle } from '../utils/ui-helpers'

const MOCK_PANELS = [
  { name: 'CandleChart', renderTime: 12.5, mountTime: 45.2, rerenders: 8, cpu: 2.1, status: 'ok' },
  { name: 'OrderBook', renderTime: 8.3, mountTime: 22.1, rerenders: 15, cpu: 1.8, status: 'ok' },
  { name: 'TradeTape', renderTime: 5.2, mountTime: 12.5, rerenders: 22, cpu: 0.9, status: 'ok' },
  { name: 'RiskPanel', renderTime: 3.8, mountTime: 8.2, rerenders: 5, cpu: 0.5, status: 'ok' },
  { name: 'Heatmap', renderTime: 18.5, mountTime: 65.3, rerenders: 12, cpu: 3.2, status: 'warn' },
  { name: 'LatencyPanel', renderTime: 2.1, mountTime: 5.8, rerenders: 3, cpu: 0.3, status: 'ok' },
  { name: 'MLInsights', renderTime: 25.3, mountTime: 120.5, rerenders: 4, cpu: 4.5, status: 'warn' },
  { name: 'BacktestPanel', renderTime: 45.2, mountTime: 250.0, rerenders: 2, cpu: 8.2, status: 'critical' },
]

const MOCK_METRICS = [
  { metric: 'Total Render Time', value: 120.9, unit: 'ms', target: 100, status: 'warn' },
  { metric: 'FPS', value: 52, unit: 'fps', target: 60, status: 'warn' },
  { metric: 'Memory Usage', value: 145, unit: 'MB', target: 200, status: 'ok' },
  { metric: 'Bundle Size', value: 2.8, unit: 'MB', target: 3.0, status: 'ok' },
  { metric: 'Time to Interactive', value: 1.2, unit: 's', target: 2.0, status: 'ok' },
  { metric: 'Layout Shifts', value: 0.05, unit: 'CLS', target: 0.1, status: 'ok' },
]

const STATUS_MAP = {
  ok: 'text-accent-green',
  warn: 'text-accent-yellow',
  default: 'text-accent-red',
}

const STATUS_BG_MAP = {
  ok: 'bg-accent-green/20',
  warn: 'bg-accent-yellow/20',
  default: 'bg-accent-red/20',
}

const DashboardProfiler = memo(function DashboardProfiler() {
  const stats = useMemo(() => {
    const totalRender = MOCK_PANELS.reduce((s, p) => s + p.renderTime, 0)
    const totalMount = MOCK_PANELS.reduce((s, p) => s + p.mountTime, 0)
    const totalRerenders = MOCK_PANELS.reduce((s, p) => s + p.rerenders, 0)
    const slowest = MOCK_PANELS.reduce((max, p) => p.renderTime > max.renderTime ? p : max, MOCK_PANELS[0])
    const critical = MOCK_PANELS.filter(p => p.status === 'critical').length
    const warnings = MOCK_PANELS.filter(p => p.status === 'warn').length
    return { totalRender, totalMount, totalRerenders, slowest, critical, warnings }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Gauge} title="Dashboard Profiler" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">{MOCK_PANELS.length} panels</span>} />

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-1">
        {MOCK_METRICS.map(m => (
          <div key={m.metric} className="p-1.5 bg-bg-700 border border-bg-600">
            <div className="text-[9px] text-gray-600 truncate">{m.metric}</div>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-mono ${statusColor(m.status, STATUS_MAP)}`}>
                {m.value}{m.unit}
              </span>
              <span className="text-[8px] text-gray-600">/{m.target}{m.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Panel performance table */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Cpu size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Panel Performance</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_PANELS.map(p => (
            <div key={p.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-24 truncate">{p.name}</span>
              <span className={`text-[9px] font-mono w-12 text-right ${p.renderTime > 20 ? 'text-accent-red' : p.renderTime > 10 ? 'text-accent-yellow' : 'text-accent-green'}`}>
                {p.renderTime.toFixed(1)}ms
              </span>
              <span className="text-[9px] font-mono text-gray-400 w-14 text-right">{p.mountTime.toFixed(0)}ms</span>
              <span className={`text-[9px] font-mono w-10 text-right ${p.rerenders > 15 ? 'text-accent-yellow' : 'text-gray-400'}`}>
                {p.rerenders}rr
              </span>
              <span className="text-[9px] font-mono text-gray-500 w-10 text-right">{p.cpu.toFixed(1)}%</span>
              <span className={`text-[8px] uppercase px-1 rounded ${statusBg(p.status, STATUS_BG_MAP)} ${statusColor(p.status, STATUS_MAP)} w-14 text-center`}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Panel / Render / Mount / Rerenders / CPU</span>
        </div>
      </div>

      {/* Memory usage */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <MemoryStick size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Memory Usage</span>
        </div>
        <div className="flex items-center gap-2">
          <Bar value={72} max={100} color="bg-accent-blue" height="h-3" />
          <span className="text-[10px] font-mono text-gray-300">145MB / 200MB</span>
        </div>
      </div>

      {/* Alerts */}
      {stats.critical > 0 && (
        <WarningBanner icon={AlertTriangle} color="text-accent-red">
          {stats.critical} critical panel(s) — {stats.slowest.name} is slowest ({stats.slowest.renderTime.toFixed(1)}ms)
        </WarningBanner>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Zap size={9} />
          Total render: {stats.totalRender.toFixed(1)}ms
        </span>
        <span>{stats.warnings} warnings, {stats.critical} critical</span>
      </div>
    </div>
  )
})

export default DashboardProfiler
