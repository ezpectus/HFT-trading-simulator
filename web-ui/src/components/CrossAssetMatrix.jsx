import { memo, useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'

const ASSETS = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOT', 'MATIC', 'ATOM']

const MOCK_CORR = [
  [1.00, 0.82, 0.65, 0.58, 0.52, 0.48, 0.45, 0.42],
  [0.82, 1.00, 0.72, 0.68, 0.62, 0.55, 0.50, 0.48],
  [0.65, 0.72, 1.00, 0.78, 0.45, 0.38, 0.42, 0.35],
  [0.58, 0.68, 0.78, 1.00, 0.42, 0.35, 0.38, 0.32],
  [0.52, 0.62, 0.45, 0.42, 1.00, 0.68, 0.72, 0.65],
  [0.48, 0.55, 0.38, 0.35, 0.68, 1.00, 0.75, 0.70],
  [0.45, 0.50, 0.42, 0.38, 0.72, 0.75, 1.00, 0.78],
  [0.42, 0.48, 0.35, 0.32, 0.65, 0.70, 0.78, 1.00],
]

const MOCK_RETURNS = [
  { asset: 'BTC', return: 12.5, vol: 45.2, sharpe: 1.85 },
  { asset: 'ETH', return: 18.2, vol: 52.8, sharpe: 2.15 },
  { asset: 'SOL', return: 25.8, vol: 68.5, sharpe: 2.35 },
  { asset: 'AVAX', return: 8.5, vol: 58.2, sharpe: 0.92 },
  { asset: 'LINK', return: 6.2, vol: 42.5, sharpe: 0.85 },
  { asset: 'DOT', return: -2.8, vol: 48.5, sharpe: -0.35 },
  { asset: 'MATIC', return: 15.2, vol: 55.8, sharpe: 1.72 },
  { asset: 'ATOM', return: 4.5, vol: 38.2, sharpe: 0.78 },
]

function corrColor(corr) {
  if (corr >= 0.8) return 'text-accent-red bg-accent-red/20'
  if (corr >= 0.6) return 'text-accent-orange bg-accent-orange/15'
  if (corr >= 0.4) return 'text-accent-yellow bg-accent-yellow/10'
  if (corr >= 0.2) return 'text-gray-400 bg-bg-600'
  return 'text-accent-blue bg-accent-blue/10'
}

const CrossAssetMatrix = memo(function CrossAssetMatrix() {
  const stats = useMemo(() => {
    let highCorr = 0
    let lowCorr = 0
    let total = 0
    for (let i = 0; i < MOCK_CORR.length; i++) {
      for (let j = i + 1; j < MOCK_CORR.length; j++) {
        total++
        if (MOCK_CORR[i][j] >= 0.7) highCorr++
        if (MOCK_CORR[i][j] < 0.4) lowCorr++
      }
    }
    const avgReturn = MOCK_RETURNS.reduce((s, r) => s + r.return, 0) / MOCK_RETURNS.length
    const bestAsset = MOCK_RETURNS.reduce((max, r) => r.return > max.return ? r : max, MOCK_RETURNS[0])
    const worstAsset = MOCK_RETURNS.reduce((min, r) => r.return < min.return ? r : min, MOCK_RETURNS[0])
    return { highCorr, lowCorr, total, avgReturn, bestAsset, worstAsset }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Grid3x3 size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Cross-Asset Matrix</span>
        </div>
        <span className="text-[10px] text-gray-600">{ASSETS.length} assets</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">High Corr</div>
          <span className="text-sm font-mono text-accent-red">{stats.highCorr}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Low Corr</div>
          <span className="text-sm font-mono text-accent-green">{stats.lowCorr}</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Avg Return</div>
          <span className="text-sm font-mono text-accent-green">{stats.avgReturn.toFixed(1)}%</span>
        </div>
        <div className="p-1.5 bg-bg-700 border border-bg-600">
          <div className="text-[9px] text-gray-600">Best</div>
          <span className="text-[10px] font-mono text-accent-green truncate">{stats.bestAsset.asset}</span>
        </div>
      </div>

      {/* Correlation matrix */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Correlation Matrix (30d)</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[8px] text-gray-600 p-0.5"></th>
                {ASSETS.map(a => (
                  <th key={a} className="text-[7px] text-gray-600 text-center p-0.5">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_CORR.map((row, i) => (
                <tr key={i}>
                  <td className="text-[7px] text-gray-500 p-0.5 font-mono">{ASSETS[i]}</td>
                  {row.map((corr, j) => (
                    <td key={j} className="p-0.5">
                      <div className={`text-center text-[8px] font-mono rounded py-0.5 ${corrColor(corr)}`}>
                        {corr.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[7px] text-gray-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red/20" />&gt;0.8</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-orange/15" />&gt;0.6</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow/10" />&gt;0.4</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-blue/10" />&lt;0.2</span>
        </div>
      </div>

      {/* Asset returns */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Asset Performance (30d)</div>
        <div className="space-y-0.5">
          {MOCK_RETURNS.map(r => (
            <div key={r.asset} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-12">{r.asset}</span>
              <span className={`text-[9px] font-mono w-12 ${r.return >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {r.return >= 0 ? '+' : ''}{r.return.toFixed(1)}%
              </span>
              <span className="text-[9px] font-mono text-gray-400 w-12">{r.vol.toFixed(1)}%</span>
              <span className={`text-[9px] font-mono w-10 ${r.sharpe >= 1.5 ? 'text-accent-green' : r.sharpe >= 1 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                {r.sharpe.toFixed(2)}
              </span>
              {r.return >= 0 ? <TrendingUp size={9} className="text-accent-green" /> : <TrendingDown size={9} className="text-accent-red" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Asset / Return / Vol / Sharpe</span>
        </div>
      </div>
    </div>
  )
})

export default CrossAssetMatrix
