import { memo, useMemo, useState } from 'react'
import { Sliders, Play, CheckCircle, TrendingUp, Clock } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_TRIALS = [
  { id: 1, params: 'lr=0.01, bs=64, layers=3', score: 0.82, sharpe: 1.85, status: 'completed' },
  { id: 2, params: 'lr=0.005, bs=128, layers=2', score: 0.75, sharpe: 1.42, status: 'completed' },
  { id: 3, params: 'lr=0.02, bs=32, layers=4', score: 0.68, sharpe: 0.95, status: 'completed' },
  { id: 4, params: 'lr=0.001, bs=256, layers=2', score: 0.71, sharpe: 1.28, status: 'completed' },
  { id: 5, params: 'lr=0.015, bs=64, layers=3', score: 0.85, sharpe: 2.05, status: 'completed' },
  { id: 6, params: 'lr=0.008, bs=96, layers=3', score: 0.79, sharpe: 1.62, status: 'completed' },
  { id: 7, params: 'lr=0.012, bs=48, layers=4', score: 0.88, sharpe: 2.28, status: 'best' },
  { id: 8, params: 'lr=0.003, bs=192, layers=2', score: 0.66, sharpe: 0.82, status: 'completed' },
  { id: 9, params: 'lr=0.018, bs=64, layers=3', score: 0.73, sharpe: 1.35, status: 'completed' },
  { id: 10, params: 'lr=0.006, bs=128, layers=4', score: 0.81, sharpe: 1.78, status: 'running' },
]

const MOCK_PARAM_RANGES = [
  { name: 'learning_rate', min: 0.001, max: 0.02, best: 0.012, type: 'log' },
  { name: 'batch_size', min: 32, max: 256, best: 48, type: 'int' },
  { name: 'num_layers', min: 2, max: 4, best: 4, type: 'int' },
  { name: 'dropout', min: 0.1, max: 0.5, best: 0.3, type: 'float' },
]

function scoreColor(score) {
  if (score >= 0.85) return 'text-accent-green'
  if (score >= 0.75) return 'text-accent-yellow'
  if (score >= 0.65) return 'text-accent-orange'
  return 'text-accent-red'
}

const HyperoptUI = memo(function HyperoptUI() {
  const [running, setRunning] = useState(false)

  const stats = useMemo(() => {
    const completed = MOCK_TRIALS.filter(t => t.status !== 'running').length
    const best = MOCK_TRIALS.reduce((max, t) => t.score > max.score ? t : max, MOCK_TRIALS[0])
    const avgScore = MOCK_TRIALS.filter(t => t.status !== 'running').reduce((s, t) => s + t.score, 0) / completed
    return { completed, best, avgScore, total: MOCK_TRIALS.length }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sliders size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Hyperparameter Optimization</span>
        </div>
        <button
          onClick={() => setRunning(!running)}
          className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-colors ${running ? 'bg-accent-red/20 text-accent-red' : 'bg-accent-green/20 text-accent-green'}`}
        >
          <Play size={9} />
          {running ? 'Stop' : 'Start'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Trials" value={`${stats.completed}/${stats.total}`} color="text-gray-300" compact />
        <StatCard label="Best Score" value={stats.best.score.toFixed(2)} color="text-accent-green" compact />
        <StatCard label="Avg Score" value={stats.avgScore.toFixed(2)} color="text-gray-300" compact />
        <StatCard label="Best Sharpe" value={stats.best.sharpe.toFixed(2)} color="text-accent-blue" compact />
      </div>

      {/* Best trial */}
      <div className="p-2 bg-accent-green/10 border border-accent-green/30 rounded">
        <div className="flex items-center gap-1.5">
          <CheckCircle size={11} className="text-accent-green" />
          <span className="text-[10px] text-accent-green uppercase">Best Trial #{stats.best.id}</span>
        </div>
        <div className="text-[10px] text-gray-300 mt-0.5 font-mono">{stats.best.params}</div>
        <div className="flex items-center gap-3 mt-0.5 text-[9px]">
          <span className="text-gray-400">Score: <span className="text-accent-green font-mono">{stats.best.score.toFixed(2)}</span></span>
          <span className="text-gray-400">Sharpe: <span className="text-accent-blue font-mono">{stats.best.sharpe.toFixed(2)}</span></span>
        </div>
      </div>

      {/* Parameter ranges */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Parameter Ranges</div>
        <div className="space-y-0.5">
          {MOCK_PARAM_RANGES.map(p => (
            <div key={p.name} className="py-0.5 px-1.5 bg-bg-700">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-300 font-mono">{p.name}</span>
                <span className="text-[9px] text-gray-500">best: <span className="text-accent-green font-mono">{p.best}</span></span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px] text-gray-600 font-mono">{p.min}</span>
                <div className="flex-1 h-1.5 bg-bg-600 rounded-full relative">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-accent-green rounded-full"
                    style={{ left: `${((p.best - p.min) / (p.max - p.min)) * 100}%` }}
                  />
                </div>
                <span className="text-[8px] text-gray-600 font-mono">{p.max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trial history */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <TrendingUp size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Trial History</span>
        </div>
        <div className="bg-bg-900 border border-bg-600 rounded max-h-32 overflow-y-auto">
          {MOCK_TRIALS.map(t => (
            <div key={t.id} className="flex items-center gap-2 py-0.5 px-2 border-b border-bg-800">
              <span className="text-[9px] text-gray-600 font-mono w-6">#{t.id}</span>
              <span className="text-[9px] text-gray-400 font-mono flex-1 truncate">{t.params}</span>
              <span className={`text-[9px] font-mono w-10 text-right ${scoreColor(t.score)}`}>{t.score.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-accent-blue w-12 text-right">{t.sharpe.toFixed(2)}</span>
              {t.status === 'best' && <CheckCircle size={9} className="text-accent-green shrink-0" />}
              {t.status === 'running' && <Clock size={9} className="text-accent-yellow shrink-0 animate-pulse" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default memo(HyperoptUI)
