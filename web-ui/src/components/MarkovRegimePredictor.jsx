import { useMemo } from 'react'
import { Shuffle, TrendingUp, Activity } from 'lucide-react'
import { formatPrice } from '../utils/format'

// Regime classification from rolling return statistics:
// vol = std(returns), mean = avg(returns), skew = E[(r-μ)³/σ³]
// CALM: vol < 0.005, RANGING: |mean| < 0.0005, TRENDING_UP/DOWN: |mean| > 0.0005
// VOLATILE: vol > 0.02, TRENDING_VOL: vol > 0.02 AND |mean| > 0.001
function classifyRegime(returns) {
  if (returns.length < 5) return 'UNKNOWN'
  const vol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length)
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const skew = returns.length > 10 ? calcSkewness(returns) : 0

  if (vol > 0.02 && Math.abs(mean) > 0.001) return 'TRENDING_VOL'
  if (vol > 0.02) return 'VOLATILE'
  if (vol < 0.005) return 'CALM'
  if (mean > 0.0005) return 'TRENDING_UP'
  if (mean < -0.0005) return 'TRENDING_DOWN'
  return 'RANGING'
}

// Skewness: γ₁ = E[(r - μ)³] / σ³  (3rd standardized moment)
function calcSkewness(returns) {
  const n = returns.length
  if (n < 10) return 0
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  const skew = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n
  return skew
}

// Excess Kurtosis: γ₂ = E[(r - μ)⁴] / σ⁴ - 3  (4th standardized moment, normal = 0)
function calcKurtosis(returns) {
  const n = returns.length
  if (n < 10) return 0
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3
}

// Markov transition matrix estimation:
// P_{ij} = Count(X_t=i, X_{t+1}=j) / Count(X_t=i)
// Stationary distribution via power iteration: π_{n+1} = π_n · P
// Converges when |π_{n+1} - π_n| < ε for all states
function buildTransitionMatrix(regimeSequence) {
  const regimes = ['CALM', 'RANGING', 'TRENDING_UP', 'TRENDING_DOWN', 'VOLATILE', 'TRENDING_VOL']
  const idx = {}
  regimes.forEach((r, i) => { idx[r] = i })

  const counts = regimes.map(() => new Array(regimes.length).fill(0))
  const totals = new Array(regimes.length).fill(0)

  for (let i = 0; i < regimeSequence.length - 1; i++) {
    const from = idx[regimeSequence[i]]
    const to = idx[regimeSequence[i + 1]]
    if (from !== undefined && to !== undefined) {
      counts[from][to]++
      totals[from]++
    }
  }

  const matrix = counts.map((row, i) =>
    row.map((c) => totals[i] > 0 ? c / totals[i] : 0)
  )

  const stationary = new Array(regimes.length).fill(1 / regimes.length)
  for (let iter = 0; iter < 100; iter++) {
    const next = new Array(regimes.length).fill(0)
    for (let i = 0; i < regimes.length; i++) {
      for (let j = 0; j < regimes.length; j++) {
        next[j] += stationary[i] * matrix[i][j]
      }
    }
    let converged = true
    for (let i = 0; i < regimes.length; i++) {
      if (Math.abs(next[i] - stationary[i]) > 1e-8) converged = false
      stationary[i] = next[i]
    }
    if (converged) break
  }

  return { regimes, matrix, stationary, totals }
}

// Next-regime prediction: P(X_{t+1}=j | X_t=i) = P_{ij}
// Returns probability distribution over all 6 regimes
function predictNextRegime(matrix, regimes, currentRegime) {
  const idx = regimes.indexOf(currentRegime)
  if (idx < 0) return null
  return matrix[idx].map((prob, j) => ({ regime: regimes[j], prob }))
}

export default function MarkovRegimePredictor({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-120)
    if (symCandles.length < 40) return null

    const closes = symCandles.map(c => c.close)
    const returns = []
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0 && closes[i] > 0) {
        returns.push(Math.log(closes[i] / closes[i - 1]))
      }
    }

    const windowSize = 10
    const regimeSequence = []
    for (let i = windowSize; i <= returns.length; i++) {
      const window = returns.slice(i - windowSize, i)
      regimeSequence.push(classifyRegime(window))
    }

    if (regimeSequence.length < 10) return null

    const { regimes, matrix, stationary, totals } = buildTransitionMatrix(regimeSequence)

    const currentRegime = regimeSequence[regimeSequence.length - 1]
    const predictions = predictNextRegime(matrix, regimes, currentRegime)

    const skew = calcSkewness(returns)
    const kurt = calcKurtosis(returns)

    const topPrediction = predictions ? predictions.sort((a, b) => b.prob - a.prob)[0] : null

    return {
      regimes, matrix, stationary,
      currentRegime,
      predictions,
      topPrediction,
      regimeSequence,
      skew, kurt,
      returns,
      lastPrice: closes[closes.length - 1],
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Shuffle size={12} className="text-accent-teal" />
          Markov Regime Predictor
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 40+ candles</div>
      </div>
    )
  }

  const { regimes, matrix, stationary, currentRegime, predictions, topPrediction, skew, kurt, regimeSequence } = data

  const regimeColors = {
    CALM: 'text-accent-green',
    RANGING: 'text-accent-yellow',
    TRENDING_UP: 'text-accent-blue',
    TRENDING_DOWN: 'text-accent-red',
    VOLATILE: 'text-accent-orange',
    TRENDING_VOL: 'text-accent-purple',
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Shuffle size={12} className="text-accent-teal" />
        Markov Chain Regime Predictor
      </div>

      {/* Current regime */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex items-center justify-between">
        <span className="text-[8px] text-gray-600">Current Regime:</span>
        <span className={'text-[10px] font-bold ' + (regimeColors[currentRegime] || 'text-gray-400')}>
          {currentRegime.replace('_', ' ')}
        </span>
      </div>

      {/* Distribution stats */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Skewness</span>
          <div className="font-mono text-gray-400">{skew.toFixed(3)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Kurtosis</span>
          <div className="font-mono text-gray-400">{kurt.toFixed(3)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Samples</span>
          <div className="font-mono text-gray-400">{regimeSequence.length}</div>
        </div>
      </div>

      {/* Next regime prediction */}
      {predictions && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5">
            <TrendingUp size={7} /> Next Regime Probabilities:
          </div>
          <div className="space-y-px">
            {predictions.sort((a, b) => b.prob - a.prob).map((p, i) => (
              <div key={i} className="flex items-center gap-1 text-[8px]">
                <span className={'font-mono w-20 ' + (regimeColors[p.regime] || 'text-gray-400')}>
                  {p.regime.replace('_', ' ')}
                </span>
                <div className="flex-1 h-2 bg-bg-600 rounded-full overflow-hidden">
                  <div
                    className={'h-full rounded-full ' + (
                      p.regime === 'CALM' ? 'bg-accent-green' :
                      p.regime === 'RANGING' ? 'bg-accent-yellow' :
                      p.regime === 'TRENDING_UP' ? 'bg-accent-blue' :
                      p.regime === 'TRENDING_DOWN' ? 'bg-accent-red' :
                      p.regime === 'VOLATILE' ? 'bg-accent-orange' :
                      'bg-accent-purple'
                    )}
                    style={{ width: `${p.prob * 100}%` }}
                  />
                </div>
                <span className="font-mono text-gray-500 w-8 text-right">{(p.prob * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transition matrix heatmap (SVG) */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5">
          <Activity size={7} /> Transition Matrix Heatmap:
        </div>
        <svg viewBox="0 0 100 72" className="w-full h-[90px]">
          {/* Column labels (to regimes) */}
          {regimes.map((r, j) => (
            <text key={'col-' + j} x={16 + j * 13 + 6.5} y={5} fill="currentColor"
              className={regimeColors[r] || 'text-gray-500'} fontSize={2.2} fontFamily="monospace" textAnchor="middle">
              {r.slice(0, 4)}
            </text>
          ))}
          {/* Row labels (from regimes) + heatmap cells */}
          {regimes.map((fromRegime, i) => (
            <g key={'row-' + i}>
              <text x={14} y={10 + i * 10 + 6} fill="currentColor"
                className={regimeColors[fromRegime] || 'text-gray-500'} fontSize={2.2} fontFamily="monospace" textAnchor="end">
                {fromRegime.slice(0, 4)}
              </text>
              {matrix[i].map((prob, j) => {
                const intensity = Math.min(prob, 1)
                const opacity = intensity > 0.5 ? 0.7 : intensity > 0.25 ? 0.4 : intensity > 0.1 ? 0.2 : 0.05
                const textColor = prob > 0.25 ? '#ffffff' : '#64748b'
                return (
                  <g key={'cell-' + i + '-' + j}>
                    <rect x={16 + j * 13} y={10 + i * 10} width={12} height={9}
                      fill="#14b8a6" opacity={opacity} rx={0.5} />
                    <text x={16 + j * 13 + 6} y={10 + i * 10 + 6} fill={textColor}
                      fontSize={2.2} fontFamily="monospace" textAnchor="middle">
                      {(prob * 100).toFixed(0)}
                    </text>
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Stationary distribution */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Stationary Distribution (long-run):</div>
        <div className="flex gap-px">
          {stationary.map((prob, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="h-8 bg-bg-600 rounded-sm overflow-hidden flex flex-col justify-end">
                <div
                  className={'rounded-sm ' + (
                    regimes[i] === 'CALM' ? 'bg-accent-green' :
                    regimes[i] === 'RANGING' ? 'bg-accent-yellow' :
                    regimes[i] === 'TRENDING_UP' ? 'bg-accent-blue' :
                    regimes[i] === 'TRENDING_DOWN' ? 'bg-accent-red' :
                    regimes[i] === 'VOLATILE' ? 'bg-accent-orange' :
                    'bg-accent-purple'
                  )}
                  style={{ height: `${prob * 100}%` }}
                />
              </div>
              <div className="text-[6px] text-gray-600 mt-0.5">{(prob * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        6-state Markov chain. Transition matrix estimated from rolling regime classification. Stationary dist via power iteration. Predict: {topPrediction ? `${topPrediction.regime.replace('_',' ')} (${(topPrediction.prob*100).toFixed(0)}%)` : 'N/A'}.
      </div>
    </div>
  )
}
