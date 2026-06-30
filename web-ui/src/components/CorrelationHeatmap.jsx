import { useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react'

function correlation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 5) return 0
  const aSlice = a.slice(-n)
  const bSlice = b.slice(-n)
  const meanA = aSlice.reduce((s, v) => s + v, 0) / n
  const meanB = bSlice.reduce((s, v) => s + v, 0) / n
  let cov = 0, varA = 0, varB = 0
  for (let i = 0; i < n; i++) {
    const da = aSlice[i] - meanA
    const db = bSlice[i] - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  if (varA === 0 || varB === 0) return 0
  return cov / Math.sqrt(varA * varB)
}

function corrColor(corr) {
  if (corr > 0.7) return '#22c55e'
  if (corr > 0.3) return '#4ade80'
  if (corr > 0.1) return '#86efac'
  if (corr > -0.1) return '#475569'
  if (corr > -0.3) return '#fca5a5'
  if (corr > -0.7) return '#f87171'
  return '#ef4444'
}

function corrOpacity(corr) {
  return 0.15 + Math.abs(corr) * 0.85
}

export default function CorrelationHeatmap({ candles, symbols, exchange }) {
  const data = useMemo(() => {
    if (!symbols || symbols.length < 2) return null

    const closesBySymbol = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-50)
      if (symCandles.length >= 10) {
        closesBySymbol[sym] = symCandles.map(c => c.close)
      }
    }

    const symList = Object.keys(closesBySymbol)
    if (symList.length < 2) return null

    // Build correlation matrix
    const matrix = []
    for (let i = 0; i < symList.length; i++) {
      const row = []
      for (let j = 0; j < symList.length; j++) {
        if (i === j) {
          row.push({ corr: 1, label: '1.00' })
        } else {
          const c = correlation(closesBySymbol[symList[i]], closesBySymbol[symList[j]])
          row.push({ corr: c, label: c.toFixed(2) })
        }
      }
      matrix.push(row)
    }

    // Find strongest correlations (excluding diagonal)
    const pairs = []
    for (let i = 0; i < symList.length; i++) {
      for (let j = i + 1; j < symList.length; j++) {
        pairs.push({
          a: symList[i].split('/')[0],
          b: symList[j].split('/')[0],
          symA: symList[i],
          symB: symList[j],
          corr: matrix[i][j].corr,
        })
      }
    }
    pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))

    // Average correlation
    const avgCorr = pairs.length > 0
      ? pairs.reduce((s, p) => s + p.corr, 0) / pairs.length
      : 0

    // Diversification score (lower avg correlation = better diversification)
    const divScore = Math.max(0, Math.min(100, (1 - Math.abs(avgCorr)) * 100))

    return {
      symList, matrix, pairs, avgCorr, divScore,
      shortNames: symList.map(s => s.split('/')[0]),
    }
  }, [candles, symbols, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-purple" />
          Correlation Heatmap
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 2+ symbols with 10+ candles</div>
      </div>
    )
  }

  const { symList, matrix, pairs, avgCorr, divScore, shortNames } = data
  const cellSize = 32
  const labelSize = 28
  const gridSize = cellSize * symList.length

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-purple" />
        Correlation Heatmap
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Avg Correlation</span>
          <div className={'font-mono ' + (avgCorr > 0.5 ? 'text-accent-orange' : avgCorr < 0.2 ? 'text-accent-green' : 'text-gray-400')}>
            {avgCorr.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Diversification</span>
          <div className={'font-mono ' + (divScore > 70 ? 'text-accent-green' : divScore > 40 ? 'text-accent-yellow' : 'text-accent-red')}>
            {divScore.toFixed(0)}/100
          </div>
        </div>
      </div>

      {/* Heatmap matrix */}
      <div className="mb-2 flex justify-center">
        <svg width={labelSize + gridSize + 4} height={labelSize + gridSize + 4}>
          {/* Column labels */}
          {shortNames.map((name, j) => (
            <text
              key={'col-' + j}
              x={labelSize + j * cellSize + cellSize / 2}
              y={labelSize - 4}
              fill="#94a3b8"
              fontSize={7}
              textAnchor="middle"
            >
              {name}
            </text>
          ))}

          {/* Row labels */}
          {shortNames.map((name, i) => (
            <text
              key={'row-' + i}
              x={labelSize - 4}
              y={labelSize + i * cellSize + cellSize / 2 + 2}
              fill="#94a3b8"
              fontSize={7}
              textAnchor="end"
            >
              {name}
            </text>
          ))}

          {/* Cells */}
          {matrix.map((row, i) =>
            row.map((cell, j) => (
              <g key={`cell-${i}-${j}`}>
                <rect
                  x={labelSize + j * cellSize + 1}
                  y={labelSize + i * cellSize + 1}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  rx={3}
                  fill={i === j ? '#1e293b' : corrColor(cell.corr)}
                  opacity={i === j ? 0.5 : corrOpacity(cell.corr)}
                />
                <text
                  x={labelSize + j * cellSize + cellSize / 2}
                  y={labelSize + i * cellSize + cellSize / 2 + 2}
                  fill={Math.abs(cell.corr) > 0.5 ? '#0f172a' : '#e2e8f0'}
                  fontSize={7}
                  fontWeight={i === j ? 'bold' : 'normal'}
                  textAnchor="middle"
                >
                  {cell.label}
                </text>
              </g>
            ))
          )}
        </svg>
      </div>

      {/* Color legend */}
      <div className="flex items-center justify-between text-[7px] text-gray-600 mb-2">
        <span>-1.0</span>
        <div className="flex-1 h-2 mx-1 rounded-full" style={{
          background: 'linear-gradient(to right, #ef4444, #f87171, #fca5a5, #475569, #86efac, #4ade80, #22c55e)'
        }} />
        <span>+1.0</span>
      </div>

      {/* Strongest pairs */}
      <div className="pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-0.5">Correlation Pairs:</div>
        <div className="space-y-0.5">
          {pairs.slice(0, 5).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-400">{p.a} / {p.b}</span>
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.abs(p.corr) * 100}%`, backgroundColor: corrColor(p.corr) }}
                  />
                </div>
                <span className={'font-mono w-8 text-right ' + (p.corr > 0.3 ? 'text-accent-green' : p.corr < -0.3 ? 'text-accent-red' : 'text-gray-400')}>
                  {p.corr.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Pearson correlation of closing prices. Green = correlated, Red = inverse. Low avg = better diversification.
      </div>
    </div>
  )
}
