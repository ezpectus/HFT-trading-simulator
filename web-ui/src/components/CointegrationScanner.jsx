import { useMemo } from 'react'
import { Link2, GitCompare, AlertCircle } from 'lucide-react'
import { formatPrice } from '../utils/format'

// Log returns: r_t = ln(P_t / P_{t-1})
function calcLogReturns(closes) {
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }
  return returns
}

// Augmented Dickey-Fuller (ADF) test on OLS residuals:
// Δε_t = ρ·ε_{t-1} + u_t,  H0: ρ = 0 (unit root, not cointegrated)
// t-statistic = ρ / SE(ρ), compare to critical values
// If t < -2.86 (5% level), reject H0 → residuals stationary → cointegrated
function calcADF(residuals) {
  if (residuals.length < 30) return null
  const n = residuals.length
  const lag = 1

  let deltaY = []
  let lagY = []
  for (let i = lag; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }

  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m

  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const rho = den > 0 ? num / den : 0

  const residuals2 = []
  for (let i = 0; i < m; i++) {
    residuals2.push(deltaY[i] - meanY - rho * (lagY[i] - meanLag))
  }
  const rss = residuals2.reduce((s, v) => s + v * v, 0)
  const se = den > 0 ? Math.sqrt(rss / (m - 2) / den) : 0
  const tStat = se > 0 ? rho / se : 0

  const criticalValues = { '1%': -3.43, '5%': -2.86, '10%': -2.57 }
  let isStationary = false
  let significance = 'none'
  if (tStat < criticalValues['1%']) { isStationary = true; significance = '99%' }
  else if (tStat < criticalValues['5%']) { isStationary = true; significance = '95%' }
  else if (tStat < criticalValues['10%']) { isStationary = true; significance = '90%' }

  return { tStat, criticalValues, isStationary, significance, rho }
}

// Half-life of mean reversion (Ornstein-Uhlenbeck):
// Δε_t = φ·ε_{t-1} + u_t,  half-life = -ln(2) / ln(1 + φ)
// φ < 0 → mean-reverting; φ ≥ 0 → no mean reversion (half-life = ∞)
function calcHalfLife(residuals) {
  if (residuals.length < 20) return null
  const n = residuals.length
  const deltaY = []
  const lagY = []
  for (let i = 1; i < n; i++) {
    deltaY.push(residuals[i] - residuals[i - 1])
    lagY.push(residuals[i - 1])
  }
  const m = deltaY.length
  const meanY = deltaY.reduce((s, v) => s + v, 0) / m
  const meanLag = lagY.reduce((s, v) => s + v, 0) / m

  let num = 0, den = 0
  for (let i = 0; i < m; i++) {
    num += (lagY[i] - meanLag) * (deltaY[i] - meanY)
    den += (lagY[i] - meanLag) ** 2
  }
  const phi = den > 0 ? num / den : 0

  if (phi >= 0) return Infinity
  const halfLife = -Math.log(2) / Math.log(1 + phi)
  return Math.max(0, halfLife)
}

// Engle-Granger Step 1: OLS regression y = α + β·x + ε
// ε_t = y_t - (α + β·x_t)  → residuals for ADF test
// R² = 1 - SS_res/SS_tot,  Z-score = ε_last / σ_ε
function linearRegression(y, x) {
  const n = Math.min(y.length, x.length)
  if (n < 5) return null

  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY)
    den += (x[i] - meanX) ** 2
  }
  const beta = den > 0 ? num / den : 0
  const alpha = meanY - beta * meanX

  const residuals = []
  for (let i = 0; i < n; i++) {
    residuals.push(y[i] - (alpha + beta * x[i]))
  }

  const ssRes = residuals.reduce((s, v) => s + v * v, 0)
  const ssTot = y.slice(0, n).reduce((s, v) => s + (v - meanY) ** 2, 0)
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

  const stdResidual = Math.sqrt(ssRes / Math.max(n - 2, 1))
  const zScore = residuals.length > 0 ? residuals[residuals.length - 1] / stdResidual : 0

  return { alpha, beta, residuals, rSquared, stdResidual, zScore, n }
}

// Pearson correlation: ρ = Cov(A,B) / (σ_A · σ_B)
function calcCorrelation(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 5) return 0
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n
  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  return den > 0 ? num / den : 0
}

export default function CointegrationScanner({ candles, symbols, exchange }) {
  const pairs = useMemo(() => {
    if (!candles || candles.length < 50 || !symbols || symbols.length < 2) return []

    const results = []
    const minLen = 60

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symA = symbols[i]
        const symB = symbols[j]

        const candlesA = candles
          .filter(c => c.exchange === exchange && c.symbol === symA)
          .slice(-minLen)
          .map(c => c.close)
        const candlesB = candles
          .filter(c => c.exchange === exchange && c.symbol === symB)
          .slice(-minLen)
          .map(c => c.close)

        if (candlesA.length < 30 || candlesB.length < 30) continue

        const n = Math.min(candlesA.length, candlesB.length)
        const closesA = candlesA.slice(-n)
        const closesB = candlesB.slice(-n)

        const correlation = calcCorrelation(closesA, closesB)

        const reg = linearRegression(closesA, closesB)
        if (!reg) continue

        const adf = calcADF(reg.residuals)
        if (!adf) continue

        const halfLife = calcHalfLife(reg.residuals)

        const spreadStd = reg.stdResidual
        const currentSpread = reg.residuals[reg.residuals.length - 1]
        const zScore = spreadStd > 0 ? currentSpread / spreadStd : 0

        let signal = 'neutral'
        if (adf.isStationary) {
          if (zScore > 2) signal = 'short_A_long_B'
          else if (zScore < -2) signal = 'long_A_short_B'
          else if (Math.abs(zScore) > 1) signal = 'watch'
        }

        results.push({
          symA, symB,
          correlation,
          beta: reg.beta,
          rSquared: reg.rSquared,
          adfTStat: adf.tStat,
          isCointegrated: adf.isStationary,
          significance: adf.significance,
          halfLife,
          zScore,
          currentSpread,
          spreadStd,
          signal,
          alpha: reg.alpha,
        })
      }
    }

    return results.sort((a, b) => {
      if (a.isCointegrated && !b.isCointegrated) return -1
      if (!a.isCointegrated && b.isCointegrated) return 1
      return Math.abs(b.zScore) - Math.abs(a.zScore)
    })
  }, [candles, symbols, exchange])

  const cointegratedPairs = pairs.filter(p => p.isCointegrated)
  const topSignal = pairs.find(p => p.signal !== 'neutral' && p.isCointegrated)

  if (pairs.length === 0) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <GitCompare size={12} className="text-accent-purple" />
          Cointegration Scanner
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 50+ candles for 2+ symbols</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <GitCompare size={12} className="text-accent-purple" />
        Cointegration Pairs Scanner
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Pairs Tested</span>
          <div className="font-mono text-gray-400">{pairs.length}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Cointegrated</span>
          <div className={'font-mono ' + (cointegratedPairs.length > 0 ? 'text-accent-green' : 'text-gray-500')}>{cointegratedPairs.length}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Active Signal</span>
          <div className={'font-mono ' + (topSignal ? 'text-accent-yellow' : 'text-gray-500')}>{topSignal ? 'YES' : 'NONE'}</div>
        </div>
      </div>

      {/* Top signal alert */}
      {topSignal && (
        <div className="bg-accent-yellow/10 border border-accent-yellow/20 rounded px-2 py-1 mb-2 flex items-center gap-1">
          <AlertCircle size={10} className="text-accent-yellow shrink-0" />
          <span className="text-[8px] text-accent-yellow">
            {topSignal.signal === 'short_A_long_B'
              ? `Short ${topSignal.symA} / Long ${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`
              : topSignal.signal === 'long_A_short_B'
              ? `Long ${topSignal.symA} / Short ${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`
              : `Watch ${topSignal.symA}/${topSignal.symB} (z=${topSignal.zScore.toFixed(2)})`}
          </span>
        </div>
      )}

      {/* Pairs table */}
      <div className="space-y-1">
        {pairs.slice(0, 6).map((p, i) => (
          <div key={i} className="bg-bg-800 rounded px-2 py-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <Link2 size={9} className={p.isCointegrated ? 'text-accent-green' : 'text-gray-600'} />
                <span className="text-[9px] font-mono text-gray-300">{p.symA} / {p.symB}</span>
                {p.isCointegrated && (
                  <span className="text-[7px] bg-accent-green/10 text-accent-green rounded px-1">
                    {p.significance}
                  </span>
                )}
              </div>
              <span className={'text-[8px] font-mono ' + (
                p.signal === 'long_A_short_B' ? 'text-accent-green' :
                p.signal === 'short_A_long_B' ? 'text-accent-red' :
                p.signal === 'watch' ? 'text-accent-yellow' : 'text-gray-600'
              )}>
                z={p.zScore.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[7px] font-mono text-gray-500">
              <span>ρ={p.correlation.toFixed(2)}</span>
              <span>β={p.beta.toFixed(3)}</span>
              <span>R²={p.rSquared.toFixed(2)}</span>
              <span>HL={isFinite(p.halfLife) ? p.halfLife.toFixed(0) + 'd' : '∞'}</span>
            </div>
            <div className="text-[7px] font-mono text-gray-600 mt-0.5">
              ADF t={p.adfTStat.toFixed(2)} {p.isCointegrated ? '(stationary)' : '(not coint.)'}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Engle-Granger 2-step: OLS regression → ADF test on residuals. Stationary residuals = cointegrated pair. Z-score on spread for entry/exit signals.
      </div>
    </div>
  )
}
