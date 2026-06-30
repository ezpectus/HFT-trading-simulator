import { useMemo } from 'react'
import { TrendingUp, Activity, BarChart3 } from 'lucide-react'
import { formatPrice, formatPct } from '../utils/format'

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

// GARCH(1,1): σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
// MLE via gradient descent on log-likelihood: L = -½ Σ [ln(σ²_t) + ε²_t/σ²_t]
// Persistence = α + β (stationarity requires < 1)
// Half-life of variance shocks: h = ln(0.5) / ln(α + β)
// Unconditional variance: ω / (1 - α - β)
function calcGARCH(returns, p = 1, q = 1, maxIter = 100) {
  if (returns.length < 30) return null

  const n = returns.length
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const centered = returns.map(r => r - mean)
  const variance0 = centered.reduce((s, r) => s + r * r, 0) / n

  let omega = variance0 * 0.1
  let alpha = 0.1
  let beta = 0.85

  const condVar = new Array(n).fill(variance0)

  for (let iter = 0; iter < maxIter; iter++) {
    const gradOmega = new Array(n).fill(0)
    const gradAlpha = new Array(n).fill(0)
    const gradBeta = new Array(n).fill(0)

    for (let i = 1; i < n; i++) {
      const prevVar = condVar[i - 1]
      const prevRet2 = centered[i - 1] * centered[i - 1]
      condVar[i] = omega + alpha * prevRet2 + beta * prevVar

      if (condVar[i] < 1e-10) condVar[i] = 1e-10

      const invVar = 1 / condVar[i]
      const resid = centered[i]
      const dVar_dOmega = 1 + beta * (i > 1 ? gradOmega[i - 1] : 0)
      const dVar_dAlpha = prevRet2 + beta * (i > 1 ? gradAlpha[i - 1] : 0)
      const dVar_dBeta = prevVar + beta * (i > 1 ? gradBeta[i - 1] : 0)

      gradOmega[i] = dVar_dOmega
      gradAlpha[i] = dVar_dAlpha
      gradBeta[i] = dVar_dBeta

      const factor = 0.5 * (invVar - invVar * invVar * resid * resid)
      omega += 0.01 * factor * dVar_dOmega
      alpha += 0.01 * factor * dVar_dAlpha
      beta += 0.01 * factor * dVar_dBeta

      omega = Math.max(1e-8, omega)
      alpha = Math.max(1e-6, Math.min(0.999, alpha))
      beta = Math.max(1e-6, Math.min(0.999, beta))

      if (alpha + beta > 0.999) {
        const scale = 0.999 / (alpha + beta)
        alpha *= scale
        beta *= scale
      }
    }
  }

  const forecast = omega + alpha * centered[n - 1] * centered[n - 1] + beta * condVar[n - 1]
  const persistence = alpha + beta
  const halfLife = persistence > 0 && persistence < 1 ? Math.log(0.5) / Math.log(persistence) : Infinity

  const volSeries = condVar.map(v => Math.sqrt(v) * Math.sqrt(252) * 100)

  return {
    omega, alpha, beta,
    persistence,
    halfLife,
    forecastVol: Math.sqrt(forecast) * Math.sqrt(252) * 100,
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
    unconditionalVar: omega / (1 - persistence),
  }
}

// EWMA volatility: σ²_t = λ·σ²_{t-1} + (1-λ)·ε²_t
// λ (decay factor) = 0.94 (RiskMetrics default)
// Annualized: σ_annual = σ_daily × √252
function calcEWMAVol(returns, lambda = 0.94) {
  if (returns.length < 10) return null
  const n = returns.length
  const mean = returns.reduce((s, r) => s + r, 0) / n
  const centered = returns.map(r => r - mean)

  let ewmaVar = centered[0] * centered[0]
  const volSeries = [Math.sqrt(ewmaVar) * Math.sqrt(252) * 100]

  for (let i = 1; i < n; i++) {
    ewmaVar = lambda * ewmaVar + (1 - lambda) * centered[i] * centered[i]
    volSeries.push(Math.sqrt(ewmaVar) * Math.sqrt(252) * 100)
  }

  return {
    lambda,
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
  }
}

// Parkinson volatility (high-low estimator):
// σ² = (1 / (4·n·ln2)) · Σ ln²(H_t / L_t)
// Less biased than close-to-close, captures intraday range
// Annualized: σ_annual = σ_daily × √252
function calcParkinsonVol(highs, lows, period = 20) {
  if (highs.length < period) return null
  const n = highs.length
  const volSeries = []

  for (let i = period - 1; i < n; i++) {
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > 0 && lows[j] > 0) {
        const hl = Math.log(highs[j] / lows[j])
        sumSq += hl * hl
      }
    }
    const parkVar = sumSq / (4 * period * Math.LN2)
    volSeries.push(Math.sqrt(parkVar) * Math.sqrt(252) * 100)
  }

  return {
    currentVol: volSeries[volSeries.length - 1],
    volSeries,
  }
}

export default function GARCHVolatility({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-120)
    if (symCandles.length < 35) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const returns = calcLogReturns(closes)

    const garch = calcGARCH(returns)
    const ewma = calcEWMAVol(returns, 0.94)
    const ewmaShort = calcEWMAVol(returns, 0.9)
    const parkinson = calcParkinsonVol(highs, lows, 20)

    if (!garch || !ewma || !parkinson) return null

    const garchSlice = garch.volSeries.slice(-60)
    const ewmaSlice = ewma.volSeries.slice(-60)
    const parkSlice = parkinson.volSeries.slice(-60)

    const allVols = [...garchSlice, ...ewmaSlice, ...parkSlice].filter(v => !isNaN(v) && v > 0)
    const minVol = Math.min(...allVols) * 0.9
    const maxVol = Math.max(...allVols) * 1.1
    const volRange = maxVol - minVol || 1

    const volRegime = garch.currentVol < minVol + volRange * 0.33 ? 'LOW' :
                      garch.currentVol > minVol + volRange * 0.66 ? 'HIGH' : 'MEDIUM'

    const volChange = garch.forecastVol - garch.currentVol
    const volTrend = volChange > 0.5 ? 'RISING' : volChange < -0.5 ? 'FALLING' : 'STABLE'

    const n = Math.min(garchSlice.length, ewmaSlice.length, parkSlice.length)

    return {
      garch, ewma, ewmaShort, parkinson,
      garchSlice, ewmaSlice, parkSlice,
      minVol, maxVol, volRange,
      volRegime, volTrend, volChange,
      n, lastPrice: closes[closes.length - 1],
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <BarChart3 size={12} className="text-accent-orange" />
          GARCH Volatility
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 35+ candles</div>
      </div>
    )
  }

  const { garch, ewma, parkinson, garchSlice, ewmaSlice, parkSlice, minVol, maxVol, volRange, volRegime, volTrend, n } = data

  const toY = (v) => 100 - ((v - minVol) / volRange) * 85 - 7.5
  const toX = (i) => (i / Math.max(n - 1, 1)) * 100

  const garchPath = garchSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
  const ewmaPath = ewmaSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
  const parkPath = parkSlice.slice(-n).map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')

  const regimeColor = volRegime === 'LOW' ? 'text-accent-green' : volRegime === 'HIGH' ? 'text-accent-red' : 'text-accent-yellow'
  const trendColor = volTrend === 'RISING' ? 'text-accent-red' : volTrend === 'FALLING' ? 'text-accent-green' : 'text-gray-400'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <BarChart3 size={12} className="text-accent-orange" />
        GARCH(1,1) Volatility Forecaster
      </div>

      {/* Model parameters */}
      <div className="grid grid-cols-4 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">α (ARCH)</span>
          <div className="font-mono text-gray-400">{garch.alpha.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">β (GARCH)</span>
          <div className="font-mono text-gray-400">{garch.beta.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Persist.</span>
          <div className="font-mono text-gray-400">{garch.persistence.toFixed(3)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Half-life</span>
          <div className="font-mono text-gray-400">{isFinite(garch.halfLife) ? garch.halfLife.toFixed(1) + 'd' : '∞'}</div>
        </div>
      </div>

      {/* Volatility estimates */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600 flex items-center gap-0.5"><TrendingUp size={7} /> GARCH Forecast</span>
          <div className="font-mono text-accent-orange">{garch.forecastVol.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">EWMA (λ=0.94)</span>
          <div className="font-mono text-accent-blue">{ewma.currentVol.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Parkinson (H/L)</span>
          <div className="font-mono text-accent-teal">{parkinson.currentVol.toFixed(2)}%</div>
        </div>
      </div>

      {/* Regime + trend */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Regime:</span>
          <span className={'font-bold ' + regimeColor}>{volRegime}</span>
        </div>
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Trend:</span>
          <span className={'font-bold ' + trendColor}>{volTrend}</span>
        </div>
        <div className="flex items-center gap-2 text-[8px]">
          <span className="text-gray-600">Uncond. Vol:</span>
          <span className="font-mono text-gray-400">{(Math.sqrt(garch.unconditionalVar) * Math.sqrt(252) * 100).toFixed(2)}%</span>
        </div>
      </div>

      {/* Chart */}
      <div className="pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Activity size={7} /> Volatility Comparison (annualized %):</div>
        <svg viewBox="0 0 100 100" className="w-full h-[100px]">
          <line x1={0} y1={toY(minVol + volRange * 0.33)} x2={100} y2={toY(minVol + volRange * 0.33)} stroke="#334155" strokeWidth={0.3} strokeDasharray="2,1" />
          <line x1={0} y1={toY(minVol + volRange * 0.66)} x2={100} y2={toY(minVol + volRange * 0.66)} stroke="#334155" strokeWidth={0.3} strokeDasharray="2,1" />
          <path d={parkPath} fill="none" stroke="#14b8a6" strokeWidth={0.8} opacity={0.6} />
          <path d={ewmaPath} fill="none" stroke="#3b82f6" strokeWidth={0.8} opacity={0.7} />
          <path d={garchPath} fill="none" stroke="#f97316" strokeWidth={1.2} />
        </svg>
        <div className="flex justify-between text-[7px] mt-0.5">
          <span className="text-accent-orange">━ GARCH</span>
          <span className="text-accent-blue">━ EWMA</span>
          <span className="text-accent-teal">━ Parkinson</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        GARCH(1,1): ω={garch.omega.toFixed(6)}, α+β={garch.persistence.toFixed(3)} {garch.persistence < 1 ? '(stationary)' : '(non-stationary!)'}. Forecast: {garch.forecastVol.toFixed(2)}% annualized vol.
      </div>
    </div>
  )
}
