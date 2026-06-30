import { useMemo } from 'react'
import { Grid3x3 } from 'lucide-react'

/**
 * Calculate Pearson correlation between two price series.
 */
function correlation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0

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
  if (corr > 0.7) return 'bg-accent-green/80 text-white'
  if (corr > 0.3) return 'bg-accent-green/40 text-gray-200'
  if (corr > -0.3) return 'bg-bg-600 text-gray-400'
  if (corr > -0.7) return 'bg-accent-red/40 text-gray-200'
  return 'bg-accent-red/80 text-white'
}

export default function CorrelationMatrix({ candles, exchange, symbols }) {
  const matrix = useMemo(() => {
    const closes = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .map(c => c.close)
      closes[sym] = symCandles
    }

    const result = []
    for (let i = 0; i < symbols.length; i++) {
      const row = []
      for (let j = 0; j < symbols.length; j++) {
        if (i === j) {
          row.push(1)
        } else if (closes[symbols[i]] && closes[symbols[j]]) {
          row.push(correlation(closes[symbols[i]], closes[symbols[j]]))
        } else {
          row.push(0)
        }
      }
      result.push(row)
    }
    return result
  }, [candles, exchange, symbols])

  const shortNames = symbols.map(s => s.split('/')[0])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-purple" />
        Correlation Matrix
      </div>

      <table className="w-full">
        <thead>
          <tr>
            <th></th>
            {shortNames.map(name => (
              <th key={name} className="text-[9px] text-gray-500 font-medium pb-1 px-0.5 text-center">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="text-[9px] text-gray-500 font-medium pr-1 text-right">
                {shortNames[i]}
              </td>
              {row.map((corr, j) => (
                <td key={j} className="p-0.5">
                  <div
                    className={'text-[9px] font-mono text-center rounded py-1 ' + corrColor(corr)}
                    title={`${shortNames[i]} vs ${shortNames[j]}: ${corr.toFixed(3)}`}
                  >
                    {corr.toFixed(2)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1.5 text-[8px] text-gray-600 flex items-center justify-between">
        <span>1m returns, last 100 candles</span>
        <span>
          <span className="text-accent-green">■</span> pos
          <span className="text-accent-red ml-1">■</span> neg
        </span>
      </div>
    </div>
  )
}
