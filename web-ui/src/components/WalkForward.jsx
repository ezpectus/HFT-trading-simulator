import { useState, useMemo } from 'react'
import { GitCompare, Play, TrendingUp, TrendingDown } from 'lucide-react'
import { formatUsd } from '../utils/format'

export default function WalkForward({ accounts }) {
  const [windowSize, setWindowSize] = useState(10)
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)

  const allTrades = useMemo(() => {
    const trades = []
    for (const acc of Object.values(accounts || {})) {
      for (const t of (acc.trade_history || [])) trades.push(t)
    }
    return trades.sort((a, b) => (a.closed_at || 0) - (b.closed_at || 0))
  }, [accounts])

  const runAnalysis = () => {
    if (allTrades.length < windowSize * 2) return
    setRunning(true)

    setTimeout(() => {
      const segments = []
      const totalTrades = allTrades.length

      // Walk forward: train on window, test on next window
      for (let i = 0; i + windowSize < totalTrades; i += windowSize) {
        const trainSet = allTrades.slice(i, i + windowSize)
        const testEnd = Math.min(i + windowSize * 2, totalTrades)
        const testSet = allTrades.slice(i + windowSize, testEnd)

        // "Train" metrics
        const trainPnL = trainSet.reduce((s, t) => s + (t.pnl || 0), 0)
        const trainWins = trainSet.filter(t => (t.pnl || 0) > 0).length
        const trainWinRate = trainWins / trainSet.length * 100

        // "Test" metrics
        const testPnL = testSet.reduce((s, t) => s + (t.pnl || 0), 0)
        const testWins = testSet.filter(t => (t.pnl || 0) > 0).length
        const testWinRate = testSet.length > 0 ? testWins / testSet.length * 100 : 0

        // Degradation: how much worse is test vs train
        const pnlDegradation = trainPnL !== 0 ? ((testPnL - trainPnL) / Math.abs(trainPnL)) * 100 : 0
        const winRateDegradation = testWinRate - trainWinRate

        segments.push({
          index: segments.length,
          trainStart: i,
          trainEnd: i + windowSize,
          testStart: i + windowSize,
          testEnd,
          trainPnL,
          testPnL,
          trainWinRate,
          testWinRate,
          pnlDegradation,
          winRateDegradation,
          trainCount: trainSet.length,
          testCount: testSet.length,
        })
      }

      // Overall robustness
      const avgDegradation = segments.reduce((s, seg) => s + seg.pnlDegradation, 0) / segments.length
      const consistentSegments = segments.filter(s => s.testPnL > 0).length
      const robustnessScore = Math.max(0, Math.min(100, (consistentSegments / segments.length) * 100 + avgDegradation / 2))

      setResults({ segments, avgDegradation, consistentSegments, totalSegments: segments.length, robustnessScore })
      setRunning(false)
    }, 50)
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <GitCompare size={12} className="text-accent-blue" />
        Walk-Forward Analysis
      </div>

      {allTrades.length < 10 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          Need at least 10 trades ({allTrades.length} available)
        </div>
      ) : (
        <>
          {/* Window size selector */}
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1 text-[9px] text-gray-600">
              Window:
              <input
                type="number"
                min="5"
                value={windowSize}
                onChange={e => setWindowSize(Math.max(5, Number(e.target.value)))}
                className="w-12 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none"
              />
              trades
            </label>
            <button
              onClick={runAnalysis}
              disabled={running || allTrades.length < windowSize * 2}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
            >
              <Play size={10} />
              {running ? 'Running...' : 'Run'}
            </button>
          </div>

          {results && (
            <>
              {/* Robustness score */}
              <div className="bg-bg-600/50 rounded px-2 py-1.5 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-500">Robustness Score</span>
                  <span className={'text-sm font-bold ' + (results.robustnessScore > 60 ? 'text-accent-green' : results.robustnessScore > 30 ? 'text-accent-yellow' : 'text-accent-red')}>
                    {results.robustnessScore.toFixed(0)}/100
                  </span>
                </div>
                <div className="h-1.5 bg-bg-600 rounded-full overflow-hidden mt-1">
                  <div
                    className={'h-full rounded-full ' + (results.robustnessScore > 60 ? 'bg-accent-green' : results.robustnessScore > 30 ? 'bg-accent-yellow' : 'bg-accent-red')}
                    style={{ width: `${results.robustnessScore}%` }}
                  />
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2 mb-2 text-[9px]">
                <div className="bg-bg-600/50 rounded px-2 py-1">
                  <div className="text-gray-600">Consistent Segments</div>
                  <div className="font-mono text-gray-300">{results.consistentSegments}/{results.totalSegments}</div>
                </div>
                <div className="bg-bg-600/50 rounded px-2 py-1">
                  <div className="text-gray-600">Avg Degradation</div>
                  <div className={'font-mono ' + (results.avgDegradation >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                    {results.avgDegradation >= 0 ? '+' : ''}{results.avgDegradation.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Segment results */}
              <div className="max-h-[120px] overflow-y-auto scrollbar-thin space-y-0.5">
                {results.segments.map(seg => (
                  <div key={seg.index} className="bg-bg-600/30 rounded px-1.5 py-1 text-[8px]">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-gray-500">Seg {seg.index + 1}</span>
                      <span className="text-gray-600">train {seg.trainCount} · test {seg.testCount}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 font-mono">
                      <div>
                        <span className="text-gray-600">Tr PnL</span>
                        <div className={seg.trainPnL >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                          {seg.trainPnL >= 0 ? '+' : ''}{formatUsd(seg.trainPnL)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Te PnL</span>
                        <div className={seg.testPnL >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                          {seg.testPnL >= 0 ? '+' : ''}{formatUsd(seg.testPnL)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Tr WR</span>
                        <div className="text-gray-300">{seg.trainWinRate.toFixed(0)}%</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Te WR</span>
                        <div className="text-gray-300">{seg.testWinRate.toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!results && !running && (
            <div className="text-[10px] text-gray-600 italic py-2 text-center">
              Click "Run" to validate strategy robustness
            </div>
          )}
        </>
      )}
    </div>
  )
}
