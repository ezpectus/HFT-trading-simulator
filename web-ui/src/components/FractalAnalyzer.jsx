import { useMemo } from 'react'
import { Waves, Activity, GitBranch } from 'lucide-react'
import { formatPrice } from '../utils/format'

// Hurst Exponent via R/S (Rescaled Range) analysis:
// For each lag n: R(n)/S(n) = c · n^H
// R = max(cumsum) - min(cumsum), S = std(segment)
// H = slope of log(R/S) vs log(n) via linear regression
// H > 0.5: persistent (trending), H < 0.5: anti-persistent (mean-reverting), H ≈ 0.5: random walk
function hurstExponent(series) {
  const n = series.length
  if (n < 30) return null

  const lags = []
  for (let k = 2; k <= Math.min(n / 2, 30); k++) {
    lags.push(k)
  }
  if (lags.length < 5) return null

  const logLags = []
  const logRS = []

  for (const lag of lags) {
    const segments = Math.floor(n / lag)
    if (segments < 1) continue

    let totalRS = 0
    let validSegments = 0

    for (let s = 0; s < segments; s++) {
      const segment = series.slice(s * lag, (s + 1) * lag)
      if (segment.length < 2) continue

      const mean = segment.reduce((a, b) => a + b, 0) / segment.length
      const deviations = segment.map(v => v - mean)
      const cumulative = [0]
      for (let i = 0; i < deviations.length; i++) {
        cumulative.push(cumulative[i] + deviations[i])
      }

      const R = Math.max(...cumulative) - Math.min(...cumulative)
      const S = Math.sqrt(deviations.reduce((a, b) => a + b * b, 0) / segment.length)

      if (S > 0 && R > 0) {
        totalRS += R / S
        validSegments++
      }
    }

    if (validSegments > 0) {
      logLags.push(Math.log(lag))
      logRS.push(Math.log(totalRS / validSegments))
    }
  }

  if (logLags.length < 3) return null

  const meanX = logLags.reduce((a, b) => a + b, 0) / logLags.length
  const meanY = logRS.reduce((a, b) => a + b, 0) / logRS.length

  let num = 0, den = 0
  for (let i = 0; i < logLags.length; i++) {
    num += (logLags[i] - meanX) * (logRS[i] - meanY)
    den += (logLags[i] - meanX) ** 2
  }
  const H = den > 0 ? num / den : 0.5

  return { H, logLags, logRS, slope: H }
}

// Fractal Dimension: D = 2 - H
// D ≈ 1.5 (random walk), D < 1.5 (trending), D > 1.5 (mean-reverting)
function fractalDimension(series) {
  const h = hurstExponent(series)
  if (!h) return null
  return { ...h, FD: 2 - h.H }
}

// Detrended Fluctuation Analysis (DFA):
// 1. Build cumulative profile: y(i) = Σ(x_k - x̄) for k=0..i
// 2. Segment into windows of size n, fit linear trend in each
// 3. F(n) = sqrt( (1/N) Σ (y_i - linear_fit_i)² )
// 4. α = slope of log(F(n)) vs log(n)
// α ≈ 0.5 (uncorrelated), α > 0.5 (long-range correlated), α < 0.5 (anti-correlated)
function detrendedFluctuationAnalysis(series) {
  const n = series.length
  if (n < 30) return null

  const profile = []
  let cumSum = 0
  const mean = series.reduce((a, b) => a + b, 0) / n
  for (let i = 0; i < n; i++) {
    cumSum += series[i] - mean
    profile.push(cumSum)
  }

  const windowSizes = [4, 8, 16, 32, 64].filter(w => w < n / 2)
  if (windowSizes.length < 3) return null

  const logN = []
  const logF = []

  for (const w of windowSizes) {
    const segments = Math.floor(n / w)
    let totalFluctuation = 0
    let validSegs = 0

    for (let s = 0; s < segments; s++) {
      const segment = profile.slice(s * w, (s + 1) * w)
      if (segment.length < 3) continue

      const x = segment.map((_, i) => i)
      const meanX = x.reduce((a, b) => a + b, 0) / x.length
      const meanY = segment.reduce((a, b) => a + b, 0) / segment.length

      let num = 0, den = 0
      for (let i = 0; i < x.length; i++) {
        num += (x[i] - meanX) * (segment[i] - meanY)
        den += (x[i] - meanX) ** 2
      }
      const slope = den > 0 ? num / den : 0
      const intercept = meanY - slope * meanX

      let rss = 0
      for (let i = 0; i < segment.length; i++) {
        const fitted = intercept + slope * x[i]
        rss += (segment[i] - fitted) ** 2
      }
      totalFluctuation += Math.sqrt(rss / segment.length)
      validSegs++
    }

    if (validSegs > 0) {
      logN.push(Math.log(w))
      logF.push(Math.log(totalFluctuation / validSegs))
    }
  }

  if (logN.length < 3) return null

  const meanX = logN.reduce((a, b) => a + b, 0) / logN.length
  const meanY = logF.reduce((a, b) => a + b, 0) / logF.length

  let num = 0, den = 0
  for (let i = 0; i < logN.length; i++) {
    num += (logN[i] - meanX) * (logF[i] - meanY)
    den += (logN[i] - meanX) ** 2
  }
  const alpha = den > 0 ? num / den : 0.5

  return { alpha, logN, logF }
}

// Autocorrelation Function (ACF):
// ρ(k) = Σ_{t} (x_t - x̄)(x_{t+k} - x̄) / [ (N-k) · σ² ]
// 95% confidence interval: ±1.96 / √N (Bartlett's formula)
function calcAutocorrelation(series, maxLag = 20) {
  const n = series.length
  if (n < maxLag + 5) return []
  const mean = series.reduce((a, b) => a + b, 0) / n
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  if (variance === 0) return []

  const acf = []
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += (series[i] - mean) * (series[i + lag] - mean)
    }
    acf.push(sum / ((n - lag) * variance))
  }
  return acf
}

export default function FractalAnalyzer({ candles, symbol, exchange }) {
  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 35) return null

    const closes = symCandles.map(c => c.close)
    const returns = []
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0 && closes[i] > 0) {
        returns.push(Math.log(closes[i] / closes[i - 1]))
      }
    }

    if (returns.length < 30) return null

    const hurst = hurstExponent(returns)
    const fd = fractalDimension(returns)
    const dfa = detrendedFluctuationAnalysis(returns)
    const acf = calcAutocorrelation(returns, 15)

    if (!hurst) return null

    let behavior = 'RANDOM WALK'
    let behaviorColor = 'text-gray-400'
    if (hurst.H > 0.55) { behavior = 'PERSISTENT (trending)'; behaviorColor = 'text-accent-blue' }
    else if (hurst.H < 0.45) { behavior = 'ANTI-PERSISTENT (mean-reverting)'; behaviorColor = 'text-accent-green' }

    let efficiency = 'moderate'
    if (hurst.H > 0.7 || hurst.H < 0.3) efficiency = 'strong'
    else if (hurst.H > 0.6 || hurst.H < 0.4) efficiency = 'moderate'
    else efficiency = 'weak'

    const acfConfidence = 1.96 / Math.sqrt(returns.length)

    return {
      hurst, fd, dfa, acf, acfConfidence,
      behavior, behaviorColor, efficiency,
      returns, lastPrice: closes[closes.length - 1],
    }
  }, [candles, symbol, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Waves size={12} className="text-accent-purple" />
          Fractal Dimension Analyzer
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 35+ candles</div>
      </div>
    )
  }

  const { hurst, fd, dfa, acf, acfConfidence, behavior, behaviorColor, efficiency } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Waves size={12} className="text-accent-purple" />
        Hurst Exponent + Fractal Dimension
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[8px]">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Hurst (H)</span>
          <div className="font-mono text-accent-purple text-[11px]">{hurst.H.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Fractal Dim.</span>
          <div className="font-mono text-accent-teal text-[11px]">{fd.FD.toFixed(4)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">DFA α</span>
          <div className="font-mono text-accent-orange text-[11px]">{dfa ? dfa.alpha.toFixed(4) : 'N/A'}</div>
        </div>
      </div>

      {/* Behavior classification */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex items-center justify-between">
        <span className="text-[8px] text-gray-600">Behavior:</span>
        <span className={'text-[10px] font-bold ' + behaviorColor}>{behavior}</span>
      </div>

      {/* Efficiency */}
      <div className="flex items-center justify-between mb-2 text-[8px]">
        <span className="text-gray-600">Signal efficiency:</span>
        <span className={
          efficiency === 'strong' ? 'text-accent-green font-bold' :
          efficiency === 'moderate' ? 'text-accent-yellow font-bold' :
          'text-gray-500 font-bold'
        }>
          {efficiency.toUpperCase()}
        </span>
      </div>

      {/* R/S plot */}
      <div className="pt-1.5 border-t border-bg-600 mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><GitBranch size={7} /> R/S Analysis (log-log):</div>
        <svg viewBox="0 0 100 50" className="w-full h-[50px]">
          {(() => {
            const xs = hurst.logLags
            const ys = hurst.logRS
            if (xs.length < 3) return null
            const minX = Math.min(...xs), maxX = Math.max(...xs)
            const minY = Math.min(...ys), maxY = Math.max(...ys)
            const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
            const toX = (v) => ((v - minX) / rangeX) * 95 + 2.5
            const toY = (v) => 45 - ((v - minY) / rangeY) * 40 + 2.5

            const points = xs.map((x, i) => `${toX(x).toFixed(1)},${toY(ys[i]).toFixed(1)}`).join(' ')
            const x1 = toX(minX), y1 = toY(minY)
            const x2 = toX(maxX), y2 = toY(minY + hurst.slope * (maxX - minX))

            return (
              <>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a855f7" strokeWidth={0.5} strokeDasharray="2,1" />
                <polyline points={points} fill="none" stroke="#64748b" strokeWidth={0.8} />
                {xs.map((x, i) => (
                  <circle key={i} cx={toX(x)} cy={toY(ys[i])} r={0.8} fill="#a855f7" />
                ))}
              </>
            )
          })()}
        </svg>
        <div className="text-[7px] text-gray-600 text-center">Slope = H = {hurst.H.toFixed(3)}</div>
      </div>

      {/* Autocorrelation */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5"><Activity size={7} /> Autocorrelation Function:</div>
        <svg viewBox="0 0 100 40" className="w-full h-[40px]">
          <line x1={0} y1={20} x2={100} y2={20} stroke="#334155" strokeWidth={0.3} />
          <line x1={0} y1={20 - (acfConfidence / 1) * 15} x2={100} y2={20 - (acfConfidence / 1) * 15} stroke="#ef4444" strokeWidth={0.2} strokeDasharray="1,1" />
          <line x1={0} y1={20 + (acfConfidence / 1) * 15} x2={100} y2={20 + (acfConfidence / 1) * 15} stroke="#ef4444" strokeWidth={0.2} strokeDasharray="1,1" />
          {acf.map((val, i) => {
            const x = (i / Math.max(acf.length - 1, 1)) * 95 + 2.5
            const barH = Math.abs(val) * 15
            const y = val >= 0 ? 20 - barH : 20
            return (
              <g key={i}>
                <rect x={x - 1} y={y} width={2} height={barH} fill={val >= 0 ? '#3b82f6' : '#ef4444'} opacity={0.7} />
              </g>
            )
          })}
        </svg>
        <div className="flex justify-between text-[7px] text-gray-600">
          <span>lag 0</span>
          <span className="text-accent-red">--- 95% CI</span>
          <span>lag {acf.length - 1}</span>
        </div>
      </div>

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        H={hurst.H.toFixed(3)}: {hurst.H > 0.55 ? 'trending (long memory)' : hurst.H < 0.45 ? 'mean-reverting' : 'random walk'}. FD={fd.FD.toFixed(3)} (2-H). DFA α={dfa ? dfa.alpha.toFixed(3) : 'N/A'}.
      </div>
    </div>
  )
}
