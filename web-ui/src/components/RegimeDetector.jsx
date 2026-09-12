import { memo, useMemo } from 'react'
import { Radio, Activity, Waves, TrendingUp, TrendingDown } from 'lucide-react'
import { Bar, Label } from '../utils/ui-helpers'
import { selectCandles } from '../utils/candles'

const REGIME_META = {
  TRENDING: { icon: 'up', color: 'text-accent-green', bg: 'bg-accent-green' },
  RANGING: { icon: 'activity', color: 'text-accent-blue', bg: 'bg-accent-blue' },
  MIXED: { icon: 'waves', color: 'text-accent-yellow', bg: 'bg-accent-yellow' },
}

function regimeIcon(icon) {
  if (icon === 'up') return <TrendingUp size={12} className="text-accent-green" />
  if (icon === 'down') return <TrendingDown size={12} className="text-accent-red" />
  if (icon === 'waves') return <Waves size={12} className="text-accent-yellow" />
  return <Activity size={12} className="text-gray-400" />
}

/** Real statistics from the candle stream (last 60 bars). */
function computeIndicators(cds) {
  if (!cds || cds.length < 20) return null
  const closes = cds.slice(-60).map(c => c.close)
  const rets = []
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]))
  const n = rets.length
  if (n < 10) return null

  const mean = rets.reduce((a, v) => a + v, 0) / n
  const m2 = rets.reduce((a, v) => a + (v - mean) ** 2, 0) / n
  const vol = Math.sqrt(m2) * 100 // per-bar vol %
  const m3 = rets.reduce((a, v) => a + (v - mean) ** 3, 0) / n
  const m4 = rets.reduce((a, v) => a + (v - mean) ** 4, 0) / n
  const skew = m2 > 0 ? m3 / m2 ** 1.5 : 0
  const kurt = m2 > 0 ? m4 / m2 ** 2 : 0

  // Lag-1 autocorrelation of returns
  let num = 0
  for (let i = 1; i < n; i++) num += (rets[i] - mean) * (rets[i - 1] - mean)
  const ac1 = m2 > 0 ? num / ((n - 1) * m2) : 0

  // Trend: linear regression slope of closes, normalized
  const m = closes.length
  const sx = (m * (m - 1)) / 2, sxx = (m * (m - 1) * (2 * m - 1)) / 6
  const sy = closes.reduce((a, v) => a + v, 0), sxy = closes.reduce((a, v, i) => a + v * i, 0)
  const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1)
  const meanClose = sy / m
  const slopePct = meanClose > 0 ? (slope * m / meanClose) * 100 : 0

  return { vol, skew, kurt, ac1, slopePct, n }
}

/**
 * Regime Detector — live market_regime broadcast (TRENDING/RANGING/MIXED,
 * FFT spectral classifier) plus real return statistics from candles.
 */
const RegimeDetector = memo(function RegimeDetector({ symbol, exchange, candles, regime }) {
  const ind = useMemo(
    () => computeIndicators(selectCandles(candles, exchange, symbol)),
    [candles, exchange, symbol]
  )

  const meta = REGIME_META[regime?.regime] ?? null
  // Confidence proxy from broadcast scores (trend_score & cycle_strength are 0..1)

  const indCards = ind ? [
    { name: 'Realized Vol', value: `${ind.vol.toFixed(2)}%`, signal: ind.vol > 1.5 ? 'Elevated' : ind.vol > 0.5 ? 'Normal' : 'Quiet', color: ind.vol > 1.5 ? 'text-accent-yellow' : 'text-accent-green' },
    { name: 'Trend Slope', value: `${ind.slopePct.toFixed(2)}%`, signal: ind.slopePct > 0.5 ? 'Rising' : ind.slopePct < -0.5 ? 'Falling' : 'Flat', color: ind.slopePct > 0.5 ? 'text-accent-green' : ind.slopePct < -0.5 ? 'text-accent-red' : 'text-gray-400' },
    { name: 'Skewness', value: ind.skew.toFixed(2), signal: ind.skew > 0.3 ? 'Right-skewed' : ind.skew < -0.3 ? 'Left-skewed' : 'Symmetric', color: 'text-accent-blue' },
    { name: 'Kurtosis', value: ind.kurt.toFixed(1), signal: ind.kurt > 4 ? 'Fat tails' : 'Thin tails', color: ind.kurt > 4 ? 'text-accent-yellow' : 'text-gray-400' },
    { name: 'Autocorr(1)', value: ind.ac1.toFixed(2), signal: Math.abs(ind.ac1) > 0.15 ? (ind.ac1 > 0 ? 'Momentum' : 'Mean-rev') : 'Weak', color: Math.abs(ind.ac1) > 0.15 ? 'text-accent-green' : 'text-gray-400' },
    { name: 'Sample', value: `${ind.n} bars`, signal: 'returns', color: 'text-gray-500' },
  ] : null

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radio size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Regime Detector</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? '—'}</span>
      </div>

      {/* Current regime — from signal bot broadcast */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <Label className="mb-1">Current Regime (FFT classifier)</Label>
        {regime && meta ? (
          <div className="flex items-center gap-2">
            {regimeIcon(meta.icon)}
            <span className={`text-sm font-medium ${meta.color}`}>{regime.regime}</span>
            <span className="text-sm font-mono text-gray-400 ml-auto">
              trend {regime.trend_score?.toFixed(2)} · cycle {regime.cycle_strength?.toFixed(2)}
            </span>
          </div>
        ) : (
          <div className="text-gray-500 text-[10px]">No regime broadcast yet — waiting for signal bot market_regime messages</div>
        )}
      </div>

      {/* Broadcast scores */}
      {regime && (
        <div>
          <Label className="mb-1">Classifier Scores</Label>
          <div className="space-y-0.5">
            {[
              { name: 'Trend Score', v: Math.abs(regime.trend_score ?? 0), color: 'bg-accent-green' },
              { name: 'Cycle Strength', v: Math.abs(regime.cycle_strength ?? 0), color: 'bg-accent-blue' },
            ].map(s => (
              <div key={s.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
                <span className="text-[10px] text-gray-300 w-28 truncate">{s.name}</span>
                <Bar value={s.v * 100} max={100} color={s.color} />
                <span className="text-[9px] font-mono w-10 text-right text-gray-400">{(s.v * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real statistical indicators */}
      <div>
        <Label className="mb-1">Statistical Indicators (from candles)</Label>
        {indCards ? (
          <div className="grid grid-cols-2 gap-1">
            {indCards.map(i => (
              <div key={i.name} className="p-1.5 bg-bg-700 border border-bg-600">
                <div className="text-[9px] text-gray-600 truncate">{i.name}</div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] font-mono text-gray-300">{i.value}</span>
                  <span className={`text-[9px] ${i.color}`}>{i.signal}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-[10px] p-2">Need ≥20 candles — collecting stream data</div>
        )}
      </div>
    </div>
  )
})

export default memo(RegimeDetector)
