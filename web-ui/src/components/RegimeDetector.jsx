import { memo, useMemo } from 'react'
import { Radio, Activity, Waves, TrendingUp, TrendingDown } from 'lucide-react'
import { Bar, Label } from '../utils/ui-helpers'

const MOCK_REGIMES = [
  { name: 'Trending Up', probability: 0.65, icon: 'up', color: 'text-accent-green', bg: 'bg-accent-green' },
  { name: 'High Volatility', probability: 0.42, icon: 'waves', color: 'text-accent-yellow', bg: 'bg-accent-yellow' },
  { name: 'Mean Reverting', probability: 0.28, icon: 'activity', color: 'text-accent-blue', bg: 'bg-accent-blue' },
  { name: 'Trending Down', probability: 0.15, icon: 'down', color: 'text-accent-red', bg: 'bg-accent-red' },
  { name: 'Ranging', probability: 0.22, icon: 'activity', color: 'text-gray-400', bg: 'bg-gray-500' },
  { name: 'Crisis', probability: 0.05, icon: 'waves', color: 'text-accent-red', bg: 'bg-accent-red' },
]

const MOCK_HISTORY = [
  { period: 'W-1', regime: 'Trending Up', duration: 4 },
  { period: 'W-2', regime: 'High Volatility', duration: 3 },
  { period: 'W-3', regime: 'Mean Reverting', duration: 5 },
  { period: 'W-4', regime: 'Trending Up', duration: 7 },
  { period: 'W-5', regime: 'Ranging', duration: 3 },
  { period: 'W-6', regime: 'Trending Up', duration: 5 },
]

const MOCK_INDICATORS = [
  { name: 'Hurst Exponent', value: 0.62, signal: 'Trending', color: 'text-accent-green' },
  { name: 'Volatility Regime', value: 1.85, signal: 'Elevated', color: 'text-accent-yellow' },
  { name: 'ADF Statistic', value: -2.1, signal: 'Non-stationary', color: 'text-accent-orange' },
  { name: 'Skewness', value: 0.32, signal: 'Right-skewed', color: 'text-accent-blue' },
  { name: 'Kurtosis', value: 4.2, signal: 'Fat tails', color: 'text-accent-yellow' },
  { name: 'Autocorrelation', value: 0.18, signal: 'Momentum', color: 'text-accent-green' },
]

function regimeIcon(icon) {
  if (icon === 'up') return <TrendingUp size={12} className="text-accent-green" />
  if (icon === 'down') return <TrendingDown size={12} className="text-accent-red" />
  if (icon === 'waves') return <Waves size={12} className="text-accent-yellow" />
  return <Activity size={12} className="text-gray-400" />
}

const RegimeDetector = memo(function RegimeDetector({ symbol }) {
  const currentRegime = useMemo(() => {
    return MOCK_REGIMES.reduce((max, r) => r.probability > max.probability ? r : max, MOCK_REGIMES[0])
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radio size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Regime Detector</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol ?? 'BTC/USDT'}</span>
      </div>

      {/* Current regime */}
      <div className="p-2 bg-bg-700 border border-bg-600 rounded">
        <Label className="mb-1">Current Regime</Label>
        <div className="flex items-center gap-2">
          {regimeIcon(currentRegime.icon)}
          <span className={`text-sm font-medium ${currentRegime.color}`}>{currentRegime.name}</span>
          <span className="text-sm font-mono text-gray-400 ml-auto">{(currentRegime.probability * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Regime probabilities */}
      <div>
        <Label className="mb-1">Regime Probabilities</Label>
        <div className="space-y-0.5">
          {MOCK_REGIMES.map(regime => (
            <div key={regime.name} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              {regimeIcon(regime.icon)}
              <span className="text-[10px] text-gray-300 w-28 truncate">{regime.name}</span>
              <Bar value={regime.probability * 100} max={100} color={regime.bg} />
              <span className={`text-[9px] font-mono w-10 text-right ${regime.color}`}>
                {(regime.probability * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Regime indicators */}
      <div>
        <Label className="mb-1">Statistical Indicators</Label>
        <div className="grid grid-cols-2 gap-1">
          {MOCK_INDICATORS.map(ind => (
            <div key={ind.name} className="p-1.5 bg-bg-700 border border-bg-600">
              <div className="text-[9px] text-gray-600 truncate">{ind.name}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[11px] font-mono text-gray-300">{ind.value.toFixed(2)}</span>
                <span className={`text-[9px] ${ind.color}`}>{ind.signal}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regime history */}
      <div>
        <Label className="mb-1">Recent Regime History</Label>
        <div className="flex items-center gap-1">
          {MOCK_HISTORY.map((h, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="text-[8px] text-gray-600 mb-0.5">{h.period}</div>
              <div className="text-[8px] text-gray-400 truncate px-0.5 py-1 bg-bg-700 rounded" title={h.regime}>
                {h.regime.split(' ')[0]}
              </div>
              <div className="text-[7px] text-gray-600 mt-0.5">{h.duration}d</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default memo(RegimeDetector)
