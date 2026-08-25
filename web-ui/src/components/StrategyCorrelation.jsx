import { memo, useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'

const STRATEGIES = ['Trend', 'MeanRev', 'StatArb', 'Sentiment', 'Funding', 'MarketMaker']

const MOCK_CORR = [
  [1.00, 0.32, 0.15, 0.45, 0.08, -0.12],
  [0.32, 1.00, 0.28, 0.22, 0.18, 0.35],
  [0.15, 0.28, 1.00, 0.12, 0.42, 0.48],
  [0.45, 0.22, 0.12, 1.00, 0.05, -0.08],
  [0.08, 0.18, 0.42, 0.05, 1.00, 0.25],
  [-0.12, 0.35, 0.48, -0.08, 0.25, 1.00],
]

const MOCK_RETURNS = [
  { strategy: 'Trend', return: 12.5, sharpe: 1.85, maxDD: -8.2 },
  { strategy: 'MeanRev', return: 8.3, sharpe: 1.42, maxDD: -5.5 },
  { strategy: 'StatArb', return: 15.2, sharpe: 2.15, maxDD: -3.8 },
  { strategy: 'Sentiment', return: 6.8, sharpe: 0.95, maxDD: -12.1 },
  { strategy: 'Funding', return: 9.5, sharpe: 1.68, maxDD: -2.5 },
  { strategy: 'MarketMaker', return: 4.2, sharpe: 1.12, maxDD: -1.8 },
]

function corrColor(corr) {
  if (corr >= 0.5) return 'text-accent-red bg-accent-red/20'
  if (corr >= 0.3) return 'text-accent-orange bg-accent-orange/15'
  if (corr >= 0.1) return 'text-accent-yellow bg-accent-yellow/10'
  if (corr >= -0.1) return 'text-gray-400 bg-bg-600'
  if (corr >= -0.3) return 'text-accent-blue bg-accent-blue/10'
  return 'text-accent-green bg-accent-green/15'
}

const StrategyCorrelation = memo(function StrategyCorrelation() {
  const stats = useMemo(() => {
    let highCorr = 0
    let diversifying = 0
    for (let i = 0; i < MOCK_CORR.length; i++) {
      for (let j = i + 1; j < MOCK_CORR.length; j++) {
        if (MOCK_CORR[i][j] >= 0.5) highCorr++
        if (MOCK_CORR[i][j] < 0) diversifying++
      }
    }
    const avgReturn = MOCK_RETURNS.reduce((s, r) => s + r.return, 0) / MOCK_RETURNS.length
    const avgSharpe = MOCK_RETURNS.reduce((s, r) => s + r.sharpe, 0) / MOCK_RETURNS.length
    return { highCorr, diversifying, avgReturn, avgSharpe }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Grid3x3 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Strategy Correlation</span>
        </div>
        <span className="text-[10px] text-gray-600">{STRATEGIES.length} strategies</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">High Corr</div>
          <span className="text-sm font-mono text-accent-red">{stats.highCorr}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Diversifying</div>
          <span className="text-sm font-mono text-accent-green">{stats.diversifying}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Return</div>
          <span className="text-sm font-mono text-accent-green">{stats.avgReturn.toFixed(1)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Sharpe</div>
          <span className="text-sm font-mono text-gray-300">{stats.avgSharpe.toFixed(2)}</span>
        </div>
      </div>

      {/* Correlation matrix */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Correlation Matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[8px] text-gray-600 p-1"></th>
                {STRATEGIES.map(s => (
                  <th key={s} className="text-[8px] text-gray-600 text-center p-1">{s.slice(0, 4)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_CORR.map((row, i) => (
                <tr key={i}>
                  <td className="text-[8px] text-gray-500 p-1 font-mono">{STRATEGIES[i].slice(0, 4)}</td>
                  {row.map((corr, j) => (
                    <td key={j} className="p-0.5">
                      <div className={`text-center text-[9px] font-mono rounded py-1 ${corrColor(corr)}`}>
                        {corr.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[8px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/20" />High</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/10" />Low</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green/15" />Negative</span>
        </div>
      </div>

      {/* Strategy returns */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Strategy Performance</div>
        <div className="space-y-0.5">
          {MOCK_RETURNS.map(r => (
            <div key={r.strategy} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-20 truncate">{r.strategy}</span>
              <span className={`text-[9px] font-mono w-12 ${r.return >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {r.return >= 0 ? '+' : ''}{r.return.toFixed(1)}%
              </span>
              <span className="text-[9px] font-mono text-accent-blue w-12">{r.sharpe.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-accent-red w-12">{r.maxDD.toFixed(1)}%</span>
              {r.return >= 0 ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Strategy / Return / Sharpe / MaxDD</span>
        </div>
      </div>
    </div>
  )
})

export default StrategyCorrelation
