import { memo } from 'react'
import { GitCompare, TrendingUp, TrendingDown, Zap, AlertTriangle } from 'lucide-react'
import { statusColor, statusBg, StatCard } from '../utils/ui-helpers'
import { MOCK_PAIRS } from '../utils/mock-data'

const STATUS_MAP = {
  open: 'text-accent-green',
  signal: 'text-accent-yellow',
  default: 'text-gray-500',
}

const STATUS_BG_MAP = {
  open: 'bg-accent-green/20',
  signal: 'bg-accent-yellow/20',
  default: 'bg-bg-600',
}

function zScoreColor(z) {
  if (Math.abs(z) >= 2.5) return 'text-accent-red'
  if (Math.abs(z) >= 2) return 'text-accent-yellow'
  return 'text-gray-400'
}

const STATS = {
  openCount: MOCK_PAIRS.filter(p => p.status === 'open').length,
  signalCount: MOCK_PAIRS.filter(p => p.status === 'signal').length,
  totalPnl: MOCK_PAIRS.filter(p => p.status === 'open').reduce((s, p) => s + p.pnl, 0),
  avgCorr: MOCK_PAIRS.reduce((s, p) => s + p.corr, 0) / MOCK_PAIRS.length,
}

const PairsArb = memo(function PairsArb() {

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitCompare size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Pairs Arbitrage</span>
        </div>
        <span className="text-[10px] text-gray-600">{STATS.openCount} open</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Open" value={STATS.openCount} color="text-accent-green" />
        <StatCard label="Signals" value={STATS.signalCount} color="text-accent-yellow" />
        <StatCard label="Open PnL" value={`${STATS.totalPnl >= 0 ? '+' : ''}${STATS.totalPnl}`} color={STATS.totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <StatCard label="Avg Corr" value={STATS.avgCorr.toFixed(2)} color="text-gray-300" />
      </div>

      {/* Pairs table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Pairs</div>
        <div className="space-y-0.5">
          {MOCK_PAIRS.map(pair => (
            <div key={pair.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-300 w-24 truncate">{pair.pairA.replace('/USDT', '')} / {pair.pairB.replace('/USDT', '')}</span>
                <span className="text-[9px] font-mono text-gray-400 w-10">{pair.corr.toFixed(2)}</span>
                <span className={`text-[9px] font-mono w-10 ${pair.spread >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {pair.spread >= 0 ? '+' : ''}{pair.spread.toFixed(1)}%
                </span>
                <span className={`text-[9px] font-mono w-10 ${zScoreColor(pair.zScore)}`}>
                  z={pair.zScore.toFixed(1)}
                </span>
                <span className={`text-[8px] px-1 rounded ${statusBg(pair.status, STATUS_BG_MAP)} ${statusColor(pair.status, STATUS_MAP)} w-12 text-center`}>
                  {pair.status.toUpperCase()}
                </span>
                <span className={`text-[9px] font-mono w-12 text-right ${pair.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {pair.pnl >= 0 ? '+' : ''}{pair.pnl}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Pair / Corr / Spread / Z-Score / Status / PnL</span>
        </div>
      </div>

      {/* Signal alerts */}
      {STATS.signalCount > 0 && (
        <div className="space-y-0.5">
          {MOCK_PAIRS.filter(p => p.status === 'signal').map(pair => (
            <div key={pair.id} className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
              <Zap size={11} className="text-accent-yellow shrink-0" />
              <span className="text-[10px] text-accent-yellow">
                {pair.pairA.replace('/USDT', '')}/{pair.pairB.replace('/USDT', '')} z-score {pair.zScore.toFixed(1)} — {' '}
                {pair.zScore > 0 ? 'short spread' : 'long spread'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <AlertTriangle size={9} />
          |z| {'>'} 2.0 = entry signal
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={9} className="text-accent-green" />
          <TrendingDown size={9} className="text-accent-red" />
          Mean reversion strategy
        </span>
      </div>
    </div>
  )
})

export default PairsArb
