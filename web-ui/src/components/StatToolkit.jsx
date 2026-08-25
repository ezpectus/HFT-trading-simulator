import { memo, useMemo } from 'react'
import { Sigma, TrendingUp, BarChart3, Activity } from 'lucide-react'
import { formatPrice, formatPct } from '../utils/format'
import { EmptyState } from './LoadingSkeleton'
import { Label } from '../utils/ui-helpers'

function computeStats(values) {
  if (!values || values.length === 0) return null
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const std = Math.sqrt(variance)
  const sorted = [...values].sort((a, b) => a - b)
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
  const min = sorted[0]
  const max = sorted[n - 1]
  const range = max - min
  const skewness = std > 0 ? values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n : 0
  const kurtosis = std > 0 ? values.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3 : 0
  const q1 = sorted[Math.floor(n * 0.25)]
  const q3 = sorted[Math.floor(n * 0.75)]
  const iqr = q3 - q1
  return { n, mean, std, median, min, max, range, skewness, kurtosis, q1, q3, iqr, variance }
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-gray-600">{label}</span>
      <span className={`text-[10px] font-mono ${color || 'text-gray-400'}`}>{value}</span>
    </div>
  )
}

const StatToolkit = memo(function StatToolkit({ candles, symbol }) {
  const prices = useMemo(() => {
    if (!candles || candles.length === 0) return []
    return candles.map(c => c.close).filter(p => p != null && !isNaN(p))
  }, [candles])

  const returns = useMemo(() => {
    if (prices.length < 2) return []
    const r = []
    for (let i = 1; i < prices.length; i++) {
      r.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    return r
  }, [prices])

  const priceStats = useMemo(() => computeStats(prices), [prices])
  const returnStats = useMemo(() => computeStats(returns), [returns])

  const sharpe = useMemo(() => {
    if (!returnStats || returnStats.std === 0) return null
    return (returnStats.mean / returnStats.std) * Math.sqrt(252)
  }, [returnStats])

  const volAnnualized = useMemo(() => {
    if (!returnStats) return null
    return returnStats.std * Math.sqrt(252)
  }, [returnStats])

  if (!priceStats) {
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs">
        <div className="flex items-center gap-1.5 mb-2">
          <Sigma size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Statistical Toolkit</span>
        </div>
        <EmptyState icon={Sigma} title="No data" subtitle="Statistics will appear when candle data is available" />
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sigma size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Statistical Toolkit</span>
        </div>
        <span className="text-[10px] text-gray-600">{symbol}</span>
      </div>

      {/* Price Statistics */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <BarChart3 size={11} className="text-accent-blue" />
          <Label>Price Statistics</Label>
        </div>
        <StatRow label="Count" value={priceStats.n} />
        <StatRow label="Mean" value={`$${formatPrice(priceStats.mean)}`} />
        <StatRow label="Median" value={`$${formatPrice(priceStats.median)}`} />
        <StatRow label="Std Dev" value={`$${formatPrice(priceStats.std)}`} />
        <StatRow label="Min" value={`$${formatPrice(priceStats.min)}`} color="text-accent-red" />
        <StatRow label="Max" value={`$${formatPrice(priceStats.max)}`} color="text-accent-green" />
        <StatRow label="Range" value={`$${formatPrice(priceStats.range)}`} />
        <StatRow label="Q1 / Q3" value={`$${formatPrice(priceStats.q1)} / $${formatPrice(priceStats.q3)}`} />
        <StatRow label="IQR" value={`$${formatPrice(priceStats.iqr)}`} />
      </div>

      {/* Return Statistics */}
      {returnStats && (
        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp size={11} className="text-accent-green" />
            <Label>Return Statistics</Label>
          </div>
          <StatRow label="Mean Return" value={formatPct(returnStats.mean * 100, 4)} />
          <StatRow label="Std Dev" value={formatPct(returnStats.std * 100, 4)} />
          <StatRow label="Variance" value={returnStats.variance.toFixed(8)} />
          <StatRow label="Skewness" value={returnStats.skewness.toFixed(4)} color={returnStats.skewness > 0 ? 'text-accent-green' : 'text-accent-red'} />
          <StatRow label="Kurtosis" value={returnStats.kurtosis.toFixed(4)} color={Math.abs(returnStats.kurtosis) > 3 ? 'text-accent-yellow' : 'text-gray-400'} />
        </div>
      )}

      {/* Risk Metrics */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-accent-yellow" />
          <Label>Risk Metrics</Label>
        </div>
        {sharpe != null && (
          <StatRow label="Sharpe Ratio" value={sharpe.toFixed(3)} color={sharpe > 1 ? 'text-accent-green' : sharpe > 0 ? 'text-accent-yellow' : 'text-accent-red'} />
        )}
        {volAnnualized != null && (
          <StatRow label="Volatility (Ann.)" value={formatPct(volAnnualized * 100, 2)} color="text-accent-yellow" />
        )}
        {returnStats && (
          <>
            <StatRow label="Best Return" value={formatPct(Math.max(...returns) * 100, 2)} color="text-accent-green" />
            <StatRow label="Worst Return" value={formatPct(Math.min(...returns) * 100, 2)} color="text-accent-red" />
            <StatRow label="Positive %" value={formatPct((returns.filter(r => r > 0).length / returns.length) * 100, 1)} />
          </>
        )}
      </div>
    </div>
  )
})

export default memo(StatToolkit)
