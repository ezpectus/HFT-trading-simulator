import { useMemo } from 'react'
import { Grid3x3, AlertTriangle } from 'lucide-react'
import { formatPrice } from '../utils/format'

function correlation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 10) return 0
  const aS = a.slice(-n), bS = b.slice(-n)
  const mA = aS.reduce((s, v) => s + v, 0) / n
  const mB = bS.reduce((s, v) => s + v, 0) / n
  let cov = 0, vA = 0, vB = 0
  for (let i = 0; i < n; i++) {
    const da = aS[i] - mA, db = bS[i] - mB
    cov += da * db; vA += da * da; vB += db * db
  }
  if (vA === 0 || vB === 0) return 0
  return cov / Math.sqrt(vA * vB)
}

export default function PositionCorrelation({ accounts, candles, exchange }) {
  const matrix = useMemo(() => {
    const acc = accounts?.[exchange]
    if (!acc?.positions || acc.positions.length < 2) return null

    const positions = acc.positions.filter(p => p.quantity > 0)
    if (positions.length < 2) return null

    // Get price series for each position's symbol
    const priceSeries = {}
    for (const p of positions) {
      const symCandles = candles.filter(c => c.exchange === exchange && c.symbol === p.symbol).map(c => c.close)
      if (symCandles.length >= 10) priceSeries[p.symbol] = symCandles
    }

    const symbols = positions.map(p => p.symbol).filter(s => priceSeries[s])
    if (symbols.length < 2) return null

    // Build correlation matrix
    const corrMatrix = {}
    for (let i = 0; i < symbols.length; i++) {
      for (let j = 0; j < symbols.length; j++) {
        if (i === j) {
          corrMatrix[`${symbols[i]}|${symbols[j]}`] = 1
        } else if (j > i) {
          const c = correlation(priceSeries[symbols[i]], priceSeries[symbols[j]])
          corrMatrix[`${symbols[i]}|${symbols[j]}`] = c
          corrMatrix[`${symbols[j]}|${symbols[i]}`] = c
        }
      }
    }

    // Portfolio risk: weighted correlation
    const weights = {}
    let totalExposure = 0
    for (const p of positions) {
      if (priceSeries[p.symbol]) {
        const exposure = p.quantity * (priceSeries[p.symbol][priceSeries[p.symbol].length - 1] || 0)
        weights[p.symbol] = exposure
        totalExposure += exposure
      }
    }
    for (const s of symbols) {
      weights[s] = totalExposure > 0 ? weights[s] / totalExposure : 0
    }

    // Weighted average correlation
    let weightedCorr = 0
    let pairs = 0
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const c = corrMatrix[`${symbols[i]}|${symbols[j]}`]
        weightedCorr += c * weights[symbols[i]] * weights[symbols[j]]
        pairs++
      }
    }
    const avgCorr = pairs > 0 ? weightedCorr / pairs : 0

    // Risk concentration
    const highCorrPairs = []
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const c = corrMatrix[`${symbols[i]}|${symbols[j]}`]
        if (Math.abs(c) > 0.7) {
          highCorrPairs.push({ a: symbols[i], b: symbols[j], corr: c })
        }
      }
    }

    return { symbols, corrMatrix, avgCorr, highCorrPairs, positions }
  }, [accounts, candles, exchange])

  if (!matrix) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-orange" />
          Position Correlation
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 2+ open positions</div>
      </div>
    )
  }

  const { symbols, corrMatrix, avgCorr, highCorrPairs } = matrix

  function corrColor(c) {
    if (c > 0.7) return 'bg-accent-red/60 text-white'
    if (c > 0.3) return 'bg-accent-orange/40 text-gray-100'
    if (c > -0.3) return 'bg-bg-600 text-gray-400'
    if (c > -0.7) return 'bg-accent-blue/40 text-gray-100'
    return 'bg-accent-green/40 text-gray-100'
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-orange" />
        Position Correlation
      </div>

      {/* Average correlation */}
      <div className="flex items-center justify-between bg-bg-600/50 rounded px-2 py-1.5 mb-2">
        <span className="text-[9px] text-gray-500">Avg Portfolio Correlation</span>
        <span className={'text-sm font-mono font-bold ' + (avgCorr > 0.5 ? 'text-accent-red' : avgCorr > 0.2 ? 'text-accent-yellow' : 'text-accent-green')}>
          {avgCorr.toFixed(2)}
        </span>
      </div>

      {/* Warning */}
      {highCorrPairs.length > 0 && (
        <div className="flex items-center gap-1.5 bg-accent-red/10 border border-accent-red/20 rounded px-2 py-1 mb-2">
          <AlertTriangle size={11} className="text-accent-red shrink-0" />
          <span className="text-[8px] text-accent-red">
            {highCorrPairs.length} high-correlation pair(s) detected — diversification risk
          </span>
        </div>
      )}

      {/* Correlation matrix */}
      <table className="w-full text-[8px] mb-2">
        <thead>
          <tr>
            <th></th>
            {symbols.map(s => (
              <th key={s} className="text-center text-gray-600 px-0.5">{s.split('/')[0].slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map(s1 => (
            <tr key={s1}>
              <td className="text-gray-500 pr-1">{s1.split('/')[0].slice(0, 3)}</td>
              {symbols.map(s2 => {
                const c = corrMatrix[`${s1}|${s2}`]
                return (
                  <td key={s2} className="text-center p-0.5">
                    <span className={'inline-block w-full py-0.5 rounded font-mono ' + corrColor(c)}>
                      {c.toFixed(2)}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* High correlation pairs */}
      {highCorrPairs.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[8px] text-gray-600 uppercase">High Correlation Pairs</div>
          {highCorrPairs.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] bg-bg-600/30 rounded px-1.5 py-0.5">
              <span className="text-gray-400">{p.a.split('/')[0]}</span>
              <span className="text-gray-600">↔</span>
              <span className="text-gray-400">{p.b.split('/')[0]}</span>
              <span className={'ml-auto font-mono ' + (p.corr > 0 ? 'text-accent-red' : 'text-accent-green')}>
                {p.corr.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
