import { memo, useMemo } from 'react'
import { FlaskConical, CheckCircle, TrendingUp, Users } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_EXPERIMENTS = [
  {
    id: 'exp-001',
    name: 'Aggressive vs Conservative Entry',
    variantA: { label: 'Aggressive', trades: 145, winRate: 58.6, pnl: 2340, sharpe: 1.42 },
    variantB: { label: 'Conservative', trades: 89, winRate: 64.0, pnl: 1850, sharpe: 1.68 },
    status: 'running',
    confidence: 0.87,
    winner: 'B',
  },
  {
    id: 'exp-002',
    name: '5m vs 15m Signal Interval',
    variantA: { label: '5 min', trades: 312, winRate: 52.3, pnl: 980, sharpe: 0.91 },
    variantB: { label: '15 min', trades: 128, winRate: 56.7, pnl: 1450, sharpe: 1.24 },
    status: 'completed',
    confidence: 0.92,
    winner: 'B',
  },
  {
    id: 'exp-003',
    name: 'Kelly vs Fixed Position Sizing',
    variantA: { label: 'Kelly', trades: 198, winRate: 55.1, pnl: 2100, sharpe: 1.35 },
    variantB: { label: 'Fixed 2%', trades: 198, winRate: 55.1, pnl: 1650, sharpe: 1.12 },
    status: 'completed',
    confidence: 0.78,
    winner: 'A',
  },
  {
    id: 'exp-004',
    name: 'Trend + MeanRev vs Trend Only',
    variantA: { label: 'Combined', trades: 267, winRate: 54.3, pnl: 1890, sharpe: 1.18 },
    variantB: { label: 'Trend Only', trades: 145, winRate: 51.7, pnl: 720, sharpe: 0.82 },
    status: 'running',
    confidence: 0.65,
    winner: null,
  },
]

function VariantBar({ variant, isWinner }) {
  return (
    <div className={`p-1.5 rounded ${isWinner ? 'bg-accent-green/10 border border-accent-green/30' : 'bg-bg-600 border border-bg-500'}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-gray-300">{variant.label}</span>
        {isWinner && <CheckCircle size={10} className="text-accent-green" />}
      </div>
      <div className="grid grid-cols-4 gap-1 text-[9px]">
        <div>
          <span className="text-gray-600">Trades</span>
          <div className="font-mono text-gray-300">{variant.trades}</div>
        </div>
        <div>
          <span className="text-gray-600">Win%</span>
          <div className="font-mono text-gray-300">{variant.winRate.toFixed(1)}</div>
        </div>
        <div>
          <span className="text-gray-600">PnL</span>
          <div className={`font-mono ${variant.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {variant.pnl >= 0 ? '+' : ''}{variant.pnl}
          </div>
        </div>
        <div>
          <span className="text-gray-600">Sharpe</span>
          <div className="font-mono text-gray-300">{variant.sharpe.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

const ABTesting = memo(function ABTesting() {
  const stats = useMemo(() => {
    const running = MOCK_EXPERIMENTS.filter(e => e.status === 'running').length
    const completed = MOCK_EXPERIMENTS.filter(e => e.status === 'completed').length
    const totalTrades = MOCK_EXPERIMENTS.reduce((s, e) => s + e.variantA.trades + e.variantB.trades, 0)
    return { running, completed, totalTrades, total: MOCK_EXPERIMENTS.length }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">A/B Testing</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.running} running</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Experiments" value={stats.total} color="text-gray-300" />
        <StatCard label="Completed" value={stats.completed} color="text-accent-green" />
        <StatCard label="Total Trades" value={stats.totalTrades} color="text-accent-blue" />
      </div>

      {/* Experiments */}
      <div className="space-y-1.5">
        {MOCK_EXPERIMENTS.map(exp => (
          <div key={exp.id} className="p-2 bg-bg-700 border border-bg-600">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-300 truncate flex-1">{exp.name}</span>
              <span className={`text-[8px] px-1 rounded ${
                exp.status === 'running' ? 'bg-accent-yellow/20 text-accent-yellow' : 'bg-accent-green/20 text-accent-green'
              }`}>
                {exp.status.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <VariantBar variant={exp.variantA} isWinner={exp.winner === 'A'} />
              <VariantBar variant={exp.variantB} isWinner={exp.winner === 'B'} />
            </div>
            <div className="flex items-center justify-between mt-1 text-[9px]">
              <span className="text-gray-600">Confidence: {(exp.confidence * 100).toFixed(0)}%</span>
              <div className="flex items-center gap-1">
                {exp.winner ? (
                  <>
                    <TrendingUp size={9} className="text-accent-green" />
                    <span className="text-accent-green">
                      Winner: {exp.winner === 'A' ? exp.variantA.label : exp.variantB.label}
                    </span>
                  </>
                ) : (
                  <span className="text-accent-yellow">Inconclusive</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <Users size={9} />
          {stats.totalTrades} total samples
        </span>
        <span className="flex items-center gap-1">
          <FlaskConical size={9} />
          {stats.completed}/{stats.total} concluded
        </span>
      </div>
    </div>
  )
})

export default ABTesting
