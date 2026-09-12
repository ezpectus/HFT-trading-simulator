import { memo, useEffect, useRef, useState } from 'react'
import { Gauge, Cpu, MemoryStick, AlertTriangle, Zap } from 'lucide-react'
import { statusColor, statusBg, Bar, WarningBanner, SectionTitle } from '../utils/ui-helpers'
import {
  initPerformanceMonitoring, getMetrics, getPanelMetrics,
  getPerformanceBudgets, checkBudgets,
} from '../utils/performanceMonitor'

const STATUS_MAP = { ok: 'text-accent-green', warn: 'text-accent-yellow', default: 'text-accent-red' }
const STATUS_BG_MAP = { ok: 'bg-accent-green/20', warn: 'bg-accent-yellow/20', default: 'bg-accent-red/20' }

function vitalStatus(value, budget) {
  if (value == null) return 'ok'
  if (value <= budget * 0.8) return 'ok'
  if (value <= budget) return 'warn'
  return 'critical'
}

/**
 * Dashboard Profiler — REAL metrics only.
 * Web Vitals (LCP/FID/CLS/TTFB/FCP) from performanceMonitor, per-panel
 * render timings from <Profiler> wrappers in PanelContainer, FPS measured
 * via requestAnimationFrame, heap via performance.memory (Chromium only).
 */
const DashboardProfiler = memo(function DashboardProfiler() {
  const [, setTick] = useState(0)
  const [fps, setFps] = useState(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true
      initPerformanceMonitoring()
    }
    const t = setInterval(() => setTick(x => x + 1), 2000)
    return () => clearInterval(t)
  }, [])

  // Real FPS via rAF
  useEffect(() => {
    let frames = 0, last = performance.now(), raf
    const loop = (now) => {
      frames++
      if (now - last >= 1000) {
        setFps(Math.round(frames * 1000 / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const metrics = getMetrics()
  const budgets = getPerformanceBudgets()
  const panels = getPanelMetrics()
  const violations = checkBudgets()

  const mem = performance.memory
    ? { used: performance.memory.usedJSHeapSize / 1048576, limit: performance.memory.jsHeapSizeLimit / 1048576 }
    : null

  const vitalCards = [
    { metric: 'LCP', value: metrics.LCP, budget: budgets.LCP, unit: 'ms' },
    { metric: 'INP', value: metrics.INP, budget: budgets.INP, unit: 'ms' },
    { metric: 'CLS', value: metrics.CLS, budget: budgets.CLS, unit: '' },
    { metric: 'TTFB', value: metrics.TTFB, budget: budgets.TTFB, unit: 'ms' },
    { metric: 'FCP', value: metrics.FCP, budget: budgets.FCP, unit: 'ms' },
    { metric: 'FPS', value: fps, budget: 60, unit: 'fps' },
  ]

  const slowest = panels[0] ?? null
  const criticalCount = panels.filter(p => p.avgRender > 20).length

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Gauge} title="Dashboard Profiler" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">{panels.length} panels measured</span>} />

      {/* Real Web Vitals + FPS */}
      <div className="grid grid-cols-3 gap-1">
        {vitalCards.map(m => {
          const status = m.metric === 'FPS'
            ? (m.value == null ? 'ok' : m.value >= 50 ? 'ok' : m.value >= 30 ? 'warn' : 'critical')
            : vitalStatus(m.value, m.budget)
          return (
            <div key={m.metric} className="p-1.5 bg-bg-700 border border-bg-600">
              <div className="text-[9px] text-gray-600 truncate">{m.metric}</div>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-mono ${statusColor(status, STATUS_MAP)}`}>
                  {m.value == null ? '—' : `${m.metric === 'CLS' ? m.value.toFixed(3) : Math.round(m.value)}${m.unit}`}
                </span>
                <span className="text-[8px] text-gray-600">/{m.budget}{m.unit}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Real per-panel render times */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Cpu size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Panel Performance (measured)</span>
        </div>
        {panels.length === 0 ? (
          <div className="text-gray-500 text-[10px] p-2">No panel renders measured yet</div>
        ) : (
          <div className="space-y-0.5">
            {panels.slice(0, 12).map(p => {
              const status = p.avgRender > 20 ? 'critical' : p.avgRender > 10 ? 'warn' : 'ok'
              return (
                <div key={p.id} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                  <span className="text-[10px] text-gray-300 w-24 truncate">{p.id}</span>
                  <span className={`text-[9px] font-mono w-12 text-right ${statusColor(status, STATUS_MAP)}`}>
                    {p.avgRender.toFixed(1)}ms
                  </span>
                  <span className="text-[9px] font-mono text-gray-400 w-14 text-right">{p.mountTime.toFixed(0)}ms</span>
                  <span className={`text-[9px] font-mono w-10 text-right ${p.renders > 50 ? 'text-accent-yellow' : 'text-gray-400'}`}>
                    {p.renders}rr
                  </span>
                  <span className={`text-[8px] uppercase px-1 rounded ${statusBg(status, STATUS_BG_MAP)} ${statusColor(status, STATUS_MAP)} w-14 text-center`}>
                    {status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Panel / Avg Render / Mount / Rerenders</span>
        </div>
      </div>

      {/* Real heap (Chromium) */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <MemoryStick size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">JS Heap</span>
        </div>
        {mem ? (
          <div className="flex items-center gap-2">
            <Bar value={mem.used} max={mem.limit} color="bg-accent-blue" height="h-3" />
            <span className="text-[10px] font-mono text-gray-300">{mem.used.toFixed(0)}MB / {mem.limit.toFixed(0)}MB</span>
          </div>
        ) : (
          <div className="text-gray-500 text-[10px]">performance.memory unavailable (non-Chromium browser)</div>
        )}
      </div>

      {/* Budget violations */}
      {violations.length > 0 && (
        <WarningBanner icon={AlertTriangle} color="text-accent-yellow">
          {violations.length} vital(s) over budget — worst: {violations[0].name} ({violations[0].value.toFixed(0)}ms / {violations[0].budget}ms)
        </WarningBanner>
      )}
      {criticalCount > 0 && (
        <WarningBanner icon={AlertTriangle} color="text-accent-red">
          {criticalCount} slow panel(s){slowest ? ` — ${slowest.id} avg ${slowest.avgRender.toFixed(1)}ms` : ''}
        </WarningBanner>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Zap size={9} />
          {panels.reduce((s, p) => s + p.renders, 0)} renders measured
        </span>
        <span>{violations.length} budget violations</span>
      </div>
    </div>
  )
})

export default memo(DashboardProfiler)
