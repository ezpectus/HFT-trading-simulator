import { useMemo } from 'react'
import { Target, TrendingUp, TrendingDown, CheckCircle, XCircle } from 'lucide-react'

/**
 * Signal Performance Tracker — matches AI signals to subsequent fills
 * and tracks hit rate, average return, and per-direction performance.
 */
export default function SignalPerformance({ signals, fills }) {
  const stats = useMemo(() => {
    if (!signals.length || !fills.length) return null

    // Group signals by symbol+direction, find fills within 10 candles
    let matched = 0
    let correct = 0
    let wrong = 0
    let totalReturn = 0
    const byDirection = { LONG: { total: 0, correct: 0 }, SHORT: { total: 0, correct: 0 } }

    for (const sig of signals) {
      const dir = sig.direction?.toUpperCase()
      if (dir !== 'LONG' && dir !== 'SHORT') continue

      // Find a fill for this symbol within 60s after signal
      const sigTime = sig.timestamp || sig.received_at || 0
      const matchingFill = fills.find(f => {
        const fillTime = f.received_at || f.timestamp || 0
        const timeDiff = fillTime - sigTime
        return f.symbol === sig.symbol && timeDiff >= 0 && timeDiff < 60000
      })

      if (matchingFill) {
        matched++
        const fillSide = matchingFill.side?.toUpperCase()
        const isCorrect = (dir === 'LONG' && fillSide === 'BUY') || (dir === 'SHORT' && fillSide === 'SELL')

        byDirection[dir].total++
        if (isCorrect) {
          correct++
          byDirection[dir].correct++
          totalReturn += 1
        } else {
          wrong++
          totalReturn -= 1
        }
      }
    }

    const hitRate = matched > 0 ? (correct / matched * 100) : 0
    const longHitRate = byDirection.LONG.total > 0 ? (byDirection.LONG.correct / byDirection.LONG.total * 100) : 0
    const shortHitRate = byDirection.SHORT.total > 0 ? (byDirection.SHORT.correct / byDirection.SHORT.total * 100) : 0

    return {
      totalSignals: signals.length,
      matched,
      correct,
      wrong,
      hitRate,
      longHitRate,
      shortHitRate,
      longTotal: byDirection.LONG.total,
      shortTotal: byDirection.SHORT.total,
      avgReturn: matched > 0 ? (totalReturn / matched) : 0,
    }
  }, [signals, fills])

  if (!stats || stats.matched === 0) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Target size={12} className="text-accent-purple" />
          Signal Performance
        </div>
        <div className="text-center text-gray-600 text-[10px] py-2">
          No matched signals yet
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
          <Target size={12} className="text-accent-purple" />
          Signal Performance
        </div>
        <span className="text-[10px] text-gray-600">{stats.matched}/{stats.totalSignals} matched</span>
      </div>

      {/* Hit rate gauge */}
      <div className="flex items-center gap-3 mb-2">
        <div className="relative w-12 h-12 shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-bg-600" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
              className={stats.hitRate >= 60 ? 'text-accent-green' : stats.hitRate >= 40 ? 'text-accent-yellow' : 'text-accent-red'}
              strokeDasharray={`${stats.hitRate * 0.94} 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className={'absolute inset-0 flex items-center justify-center text-[10px] font-bold ' +
            (stats.hitRate >= 60 ? 'text-accent-green' : stats.hitRate >= 40 ? 'text-accent-yellow' : 'text-accent-red')}>
            {stats.hitRate.toFixed(0)}%
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px]">
            <CheckCircle size={10} className="text-accent-green" />
            <span className="text-gray-400">{stats.correct} correct</span>
            <XCircle size={10} className="text-accent-red ml-1" />
            <span className="text-gray-400">{stats.wrong} wrong</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-gray-500">Avg return:</span>
            <span className={stats.avgReturn >= 0 ? 'text-accent-green' : 'text-accent-red'}>
              {stats.avgReturn >= 0 ? '+' : ''}{stats.avgReturn.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Per-direction breakdown */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-bg-800 rounded px-2 py-1">
          <div className="flex items-center gap-1 text-gray-500 mb-0.5">
            <TrendingUp size={9} className="text-accent-green" />
            LONG
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{stats.longCorrect || 0}/{stats.longTotal}</span>
            <span className={stats.longHitRate >= 60 ? 'text-accent-green' : stats.longHitRate >= 40 ? 'text-accent-yellow' : 'text-accent-red'}>
              {stats.longHitRate.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="bg-bg-800 rounded px-2 py-1">
          <div className="flex items-center gap-1 text-gray-500 mb-0.5">
            <TrendingDown size={9} className="text-accent-red" />
            SHORT
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{stats.shortCorrect || 0}/{stats.shortTotal}</span>
            <span className={stats.shortHitRate >= 60 ? 'text-accent-green' : stats.shortHitRate >= 40 ? 'text-accent-yellow' : 'text-accent-red'}>
              {stats.shortHitRate.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
