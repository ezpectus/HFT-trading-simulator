import { memo, useMemo } from 'react'
import { GitCommit, TrendingUp, TrendingDown, CheckCircle, XCircle } from 'lucide-react'

const MOCK_WINDOWS = [
  { id: 1, trainStart: '2024-01-01', trainEnd: '2024-03-31', testStart: '2024-04-01', testEnd: '2024-04-30', trainReturn: 15.2, testReturn: 8.5, trainSharpe: 1.85, testSharpe: 1.12, status: 'pass' },
  { id: 2, trainStart: '2024-02-01', trainEnd: '2024-04-30', testStart: '2024-05-01', testEnd: '2024-05-31', trainReturn: 12.8, testReturn: 6.2, trainSharpe: 1.65, testSharpe: 0.95, status: 'pass' },
  { id: 3, trainStart: '2024-03-01', trainEnd: '2024-05-31', testStart: '2024-06-01', testEnd: '2024-06-30', trainReturn: 18.5, testReturn: -2.3, trainSharpe: 2.10, testSharpe: -0.32, status: 'fail' },
  { id: 4, trainStart: '2024-04-01', trainEnd: '2024-06-30', testStart: '2024-07-01', testEnd: '2024-07-31', trainReturn: 14.1, testReturn: 5.8, trainSharpe: 1.72, testSharpe: 0.88, status: 'pass' },
  { id: 5, trainStart: '2024-05-01', trainEnd: '2024-07-31', testStart: '2024-08-01', testEnd: '2024-08-31', trainReturn: 16.3, testReturn: 9.1, trainSharpe: 1.92, testSharpe: 1.25, status: 'pass' },
  { id: 6, trainStart: '2024-06-01', trainEnd: '2024-08-31', testStart: '2024-09-01', testEnd: '2024-09-30', trainReturn: 11.5, testReturn: 3.2, trainSharpe: 1.48, testSharpe: 0.52, status: 'pass' },
]

function statusIcon(status) {
  return status === 'pass' ? <CheckCircle size={10} className="text-accent-green" /> : <XCircle size={10} className="text-accent-red" />
}

const WalkForwardViewer = memo(function WalkForwardViewer() {
  const stats = useMemo(() => {
    const passed = MOCK_WINDOWS.filter(w => w.status === 'pass').length
    const failed = MOCK_WINDOWS.filter(w => w.status === 'fail').length
    const passRate = (passed / MOCK_WINDOWS.length) * 100
    const avgTestReturn = MOCK_WINDOWS.reduce((s, w) => s + w.testReturn, 0) / MOCK_WINDOWS.length
    const avgTestSharpe = MOCK_WINDOWS.reduce((s, w) => s + w.testSharpe, 0) / MOCK_WINDOWS.length
    const overfitScore = MOCK_WINDOWS.reduce((s, w) => s + (w.trainReturn - w.testReturn) / w.trainReturn, 0) / MOCK_WINDOWS.length
    return { passed, failed, passRate, avgTestReturn, avgTestSharpe, overfitScore }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitCommit size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Walk-Forward Analysis</span>
        </div>
        <span className="text-[10px] text-gray-600">{MOCK_WINDOWS.length} windows</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Pass Rate</div>
          <span className={`text-sm font-mono ${stats.passRate >= 70 ? 'text-accent-green' : 'text-accent-yellow'}`}>
            {stats.passRate.toFixed(0)}%
          </span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Test Ret</div>
          <span className={`text-sm font-mono ${stats.avgTestReturn >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {stats.avgTestReturn >= 0 ? '+' : ''}{stats.avgTestReturn.toFixed(1)}%
          </span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Sharpe</div>
          <span className="text-sm font-mono text-accent-blue">{stats.avgTestSharpe.toFixed(2)}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Overfit</div>
          <span className={`text-sm font-mono ${stats.overfitScore < 0.5 ? 'text-accent-green' : stats.overfitScore < 0.7 ? 'text-accent-yellow' : 'text-accent-red'}`}>
            {(stats.overfitScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Windows table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Walk-Forward Windows</div>
        <div className="space-y-0.5">
          {MOCK_WINDOWS.map(w => (
            <div key={w.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                {statusIcon(w.status)}
                <span className="text-[9px] text-gray-500 font-mono">W{w.id}</span>
                <span className="text-[9px] text-gray-400 font-mono flex-1">
                  {w.testStart} → {w.testEnd}
                </span>
                <span className={`text-[9px] font-mono w-14 text-right ${w.testReturn >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {w.testReturn >= 0 ? '+' : ''}{w.testReturn.toFixed(1)}%
                </span>
                <span className="text-[9px] font-mono text-accent-blue w-12 text-right">{w.testSharpe.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-4 text-[8px] text-gray-600">
                <span>Train: {w.trainStart}→{w.trainEnd}</span>
                <span>Train Ret: <span className={w.trainReturn >= 0 ? 'text-accent-green' : 'text-accent-red'}>{w.trainReturn.toFixed(1)}%</span></span>
                <span>Train Sharpe: <span className="text-gray-400">{w.trainSharpe.toFixed(2)}</span></span>
                <span className={w.trainReturn - w.testReturn > 10 ? 'text-accent-red' : 'text-gray-500'}>
                  Decay: {((w.trainReturn - w.testReturn) / w.trainReturn * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Train vs Test comparison */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Train vs Test Return</div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_WINDOWS.map(w => (
            <div key={w.id} className="flex-1 flex flex-col items-center">
              <div className="flex items-end gap-0.5 h-12">
                <div className="w-1.5 bg-accent-blue" style={{ height: `${(Math.abs(w.trainReturn) / 20) * 100}%` }} />
                <div className={`w-1.5 ${w.testReturn >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`} style={{ height: `${(Math.abs(w.testReturn) / 20) * 100}%` }} />
              </div>
              <span className="text-[7px] text-gray-600 mt-0.5">W{w.id}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[8px]">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-blue" />Train</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green" />Test</span>
        </div>
      </div>

      {stats.overfitScore > 0.5 && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-yellow/10 border border-accent-yellow/30">
          <TrendingDown size={11} className="text-accent-yellow" />
          <span className="text-[10px] text-accent-yellow">
            Overfit score {(stats.overfitScore * 100).toFixed(0)}% — consider simplifying model
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <TrendingUp size={9} />
          {stats.passed} passed, {stats.failed} failed
        </span>
        <span>6-month walk-forward, 3mo train / 1mo test</span>
      </div>
    </div>
  )
})

export default WalkForwardViewer
