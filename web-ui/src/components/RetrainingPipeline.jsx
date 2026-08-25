import { memo, useMemo } from 'react'
import { Database, Cpu, RefreshCw, AlertTriangle } from 'lucide-react'
import { ICONS, statusColor } from '../utils/ui-helpers'

const MOCK_PIPELINES = [
  { id: 1, name: 'TrendFollowing Model', status: 'idle', lastRun: '2h ago', nextRun: 'in 4h', accuracy: 0.82, drift: 0.05, version: 'v2.3.1' },
  { id: 2, name: 'MeanReversion Model', status: 'running', lastRun: 'running now', nextRun: '—', accuracy: 0.75, drift: 0.12, version: 'v2.1.0' },
  { id: 3, name: 'Sentiment Classifier', status: 'completed', lastRun: '15m ago', nextRun: 'in 5h', accuracy: 0.78, drift: 0.03, version: 'v1.8.2' },
  { id: 4, name: 'Regime Detector', status: 'failed', lastRun: '1h ago', nextRun: 'retry pending', accuracy: 0.68, drift: 0.18, version: 'v1.5.0' },
  { id: 5, name: 'Volatility Forecaster', status: 'idle', lastRun: '30m ago', nextRun: 'in 3h', accuracy: 0.71, drift: 0.08, version: 'v2.0.1' },
]

const MOCK_STEPS = [
  { name: 'Data Collection', status: 'completed', duration: '45s' },
  { name: 'Feature Engineering', status: 'completed', duration: '2m 15s' },
  { name: 'Train/Test Split', status: 'completed', duration: '5s' },
  { name: 'Model Training', status: 'running', duration: '3m 28s' },
  { name: 'Validation', status: 'pending', duration: '—' },
  { name: 'Deploy', status: 'pending', duration: '—' },
]

function statusIcon(status) {
  if (status === 'completed') return ICONS.green()
  if (status === 'running') return ICONS.spinning()
  if (status === 'failed') return ICONS.red()
  return ICONS.gray()
}

const STATUS_MAP = {
  completed: 'text-accent-green',
  running: 'text-accent-blue',
  failed: 'text-accent-red',
  default: 'text-gray-500',
}

function driftColor(drift) {
  if (drift < 0.05) return 'text-accent-green'
  if (drift < 0.10) return 'text-accent-yellow'
  return 'text-accent-red'
}

const RetrainingPipeline = memo(function RetrainingPipeline() {
  const stats = useMemo(() => {
    const running = MOCK_PIPELINES.filter(p => p.status === 'running').length
    const completed = MOCK_PIPELINES.filter(p => p.status === 'completed').length
    const failed = MOCK_PIPELINES.filter(p => p.status === 'failed').length
    const avgAcc = MOCK_PIPELINES.reduce((s, p) => s + p.accuracy, 0) / MOCK_PIPELINES.length
    const highDrift = MOCK_PIPELINES.filter(p => p.drift > 0.10).length
    return { running, completed, failed, avgAcc, highDrift }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <RefreshCw size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Retraining Pipeline</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.running} running</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Running</div>
          <span className="text-sm font-mono text-accent-blue">{stats.running}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Completed</div>
          <span className="text-sm font-mono text-accent-green">{stats.completed}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Failed</div>
          <span className="text-sm font-mono text-accent-red">{stats.failed}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Acc</div>
          <span className="text-sm font-mono text-gray-300">{(stats.avgAcc * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Pipeline list */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Models</div>
        <div className="space-y-0.5">
          {MOCK_PIPELINES.map(p => (
            <div key={p.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                {statusIcon(p.status)}
                <span className="text-[10px] text-gray-300 flex-1 truncate">{p.name}</span>
                <span className="text-[8px] text-gray-600 font-mono">{p.version}</span>
                <span className={`text-[8px] uppercase ${statusColor(p.status, STATUS_MAP)} w-16 text-center`}>{p.status}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-4 text-[9px]">
                <span className="text-gray-500">Acc: <span className="text-gray-300 font-mono">{(p.accuracy * 100).toFixed(0)}%</span></span>
                <span className="text-gray-500">Drift: <span className={`font-mono ${driftColor(p.drift)}`}>{(p.drift * 100).toFixed(1)}%</span></span>
                <span className="text-gray-600">Last: {p.lastRun}</span>
                <span className="text-gray-600">Next: {p.nextRun}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current pipeline steps */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Cpu size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">MeanReversion Pipeline Steps</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[8px] text-gray-600 font-mono w-4">{i + 1}</span>
              {statusIcon(step.status)}
              <span className="text-[10px] text-gray-300 flex-1">{step.name}</span>
              <span className={`text-[9px] font-mono ${statusColor(step.status, STATUS_MAP)}`}>{step.duration}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drift alert */}
      {stats.highDrift > 0 && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
          <AlertTriangle size={11} className="text-accent-yellow" />
          <span className="text-[10px] text-accent-yellow">
            {stats.highDrift} model(s) with high drift — retraining recommended
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <Database size={9} />
        <span>Auto-retrain triggered when drift {'>'} 10%</span>
      </div>
    </div>
  )
})

export default RetrainingPipeline
