import { useMemo, useState } from 'react'
import { LineChart, Info } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function PortfolioOptimizer({ candles, symbols, exchange }) {
  const [riskFreeRate, setRiskFreeRate] = useState(2)

  const result = useMemo(() => {
    const symData = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .map(c => c.close)
      if (symCandles.length < 20) return null
      symData[sym] = symCandles
    }

    const n = symbols.length
    const minLen = Math.min(...Object.values(symData).map(d => d.length))
    const closes = {}
    for (const sym of symbols) closes[sym] = symData[sym].slice(-minLen)

    // Calculate returns
    const returns = {}
    for (const sym of symbols) {
      returns[sym] = []
      for (let i = 1; i < minLen; i++) {
        if (closes[sym][i - 1] > 0) {
          returns[sym].push((closes[sym][i] - closes[sym][i - 1]) / closes[sym][i - 1])
        }
      }
    }

    const numReturns = returns[symbols[0]].length
    if (numReturns < 10) return null

    // Mean returns (annualized: 252 trading days, but we use candle count)
    const meanReturns = {}
    for (const sym of symbols) {
      meanReturns[sym] = returns[sym].reduce((s, v) => s + v, 0) / numReturns
    }

    // Covariance matrix
    const cov = {}
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const si = symbols[i], sj = symbols[j]
        let covSum = 0
        for (let k = 0; k < numReturns; k++) {
          covSum += (returns[si][k] - meanReturns[si]) * (returns[sj][k] - meanReturns[sj])
        }
        cov[`${si}|${sj}`] = covSum / numReturns
      }
    }

    // Generate efficient frontier: try different weight combinations
    const frontier = []
    const steps = 50
    for (let s = 0; s <= steps; s++) {
      // Generate weights that sum to 1
      const weights = []
      const t = s / steps
      // Simple parametric weights: shift allocation from first to last symbol
      for (let i = 0; i < n; i++) {
        const w = n === 1 ? 1 : Math.max(0, 1 - Math.abs(i / (n - 1) - t) * 2)
        weights.push(w)
      }
      const sum = weights.reduce((a, b) => a + b, 0) || 1
      const normWeights = weights.map(w => w / sum)

      // Portfolio return
      let portReturn = 0
      for (let i = 0; i < n; i++) portReturn += normWeights[i] * meanReturns[symbols[i]]
      portReturn *= 252 // annualized

      // Portfolio variance
      let portVar = 0
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          portVar += normWeights[i] * normWeights[j] * cov[`${symbols[i]}|${symbols[j]}`]
        }
      }
      portVar *= 252 // annualized
      const portVol = Math.sqrt(Math.abs(portVar))

      // Sharpe ratio
      const rf = riskFreeRate / 100
      const sharpe = portVol > 0 ? (portReturn - rf) / portVol : 0

      frontier.push({
        return: portReturn * 100,
        vol: portVol * 100,
        sharpe,
        weights: normWeights.map((w, i) => ({ sym: symbols[i], w })),
      })
    }

    // Find max Sharpe (tangency portfolio)
    const maxSharpe = frontier.reduce((best, p) => p.sharpe > best.sharpe ? p : best, frontier[0])
    const minVol = frontier.reduce((min, p) => p.vol < min.vol ? p : min, frontier[0])

    // Equal weight portfolio
    const eqWeights = symbols.map(() => 1 / n)
    let eqReturn = 0, eqVar = 0
    for (let i = 0; i < n; i++) {
      eqReturn += eqWeights[i] * meanReturns[symbols[i]]
      for (let j = 0; j < n; j++) {
        eqVar += eqWeights[i] * eqWeights[j] * cov[`${symbols[i]}|${symbols[j]}`]
      }
    }
    eqReturn *= 252
    eqVar *= 252
    const eqVol = Math.sqrt(Math.abs(eqVar))

    return {
      frontier,
      maxSharpe,
      minVol,
      equalWeight: { return: eqReturn * 100, vol: eqVol * 100, sharpe: eqVol > 0 ? (eqReturn * 100 - riskFreeRate) / (eqVol * 100) : 0 },
    }
  }, [candles, symbols, exchange, riskFreeRate])

  if (!result) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <LineChart size={12} className="text-accent-blue" />
          Portfolio Optimizer
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data (need 20+ candles per symbol)</div>
      </div>
    )
  }

  const { maxSharpe, minVol, equalWeight } = result
  const maxRet = Math.max(...result.frontier.map(p => p.return))
  const maxVol = Math.max(...result.frontier.map(p => p.vol))

  // SVG dimensions
  const W = 100, H = 60
  const xScale = (v) => (v / maxVol) * W
  const yScale = (r) => H - (r / maxRet) * H

  const frontierPath = result.frontier
    .sort((a, b) => a.vol - b.vol)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.vol)} ${yScale(p.return)}`)
    .join(' ')

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <LineChart size={12} className="text-accent-blue" />
        Portfolio Optimizer (Markowitz)
      </div>

      {/* Efficient frontier chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[80px]" preserveAspectRatio="none">
        {/* Grid lines */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#161b26" strokeWidth="0.3" />
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke="#161b26" strokeWidth="0.3" />
        {/* Frontier */}
        <path d={frontierPath} fill="none" stroke="#3b82f6" strokeWidth="0.8" />
        {/* Max Sharpe point */}
        <circle cx={xScale(maxSharpe.vol)} cy={yScale(maxSharpe.return)} r="1.5" fill="#22c55e" />
        {/* Min vol point */}
        <circle cx={xScale(minVol.vol)} cy={yScale(minVol.return)} r="1.5" fill="#eab308" />
        {/* Equal weight point */}
        <circle cx={xScale(equalWeight.vol)} cy={yScale(equalWeight.return)} r="1.2" fill="#8b95a7" />
      </svg>

      {/* Axis labels */}
      <div className="flex justify-between text-[8px] text-gray-600 font-mono mb-2">
        <span>Vol →</span>
        <span>↑ Return</span>
      </div>

      {/* Risk-free rate input */}
      <div className="mb-2">
        <label className="flex items-center gap-1.5 text-[9px] text-gray-600">
          Risk-free Rate:
          <input
            type="number"
            step="0.5"
            value={riskFreeRate}
            onChange={e => setRiskFreeRate(Number(e.target.value))}
            className="w-12 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none"
          />
          <span>%</span>
        </label>
      </div>

      {/* Optimal portfolios */}
      <div className="space-y-1.5">
        <PortfolioRow
          label="Max Sharpe"
          color="text-accent-green"
          dotColor="bg-accent-green"
          data={maxSharpe}
        />
        <PortfolioRow
          label="Min Volatility"
          color="text-accent-yellow"
          dotColor="bg-accent-yellow"
          data={minVol}
        />
        <PortfolioRow
          label="Equal Weight"
          color="text-gray-400"
          dotColor="bg-gray-500"
          data={equalWeight}
        />
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 flex items-start gap-1 text-[8px] text-gray-600">
        <Info size={9} className="shrink-0 mt-0.5" />
        <span>Efficient frontier from candle returns. Green = max Sharpe, Yellow = min vol, Gray = equal weight.</span>
      </div>
    </div>
  )
}

function PortfolioRow({ label, color, dotColor, data }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
        <div><span className="text-gray-600">Ret</span> <span className={data.return >= 0 ? 'text-accent-green' : 'text-accent-red'}>{data.return.toFixed(1)}%</span></div>
        <div><span className="text-gray-600">Vol</span> <span className="text-gray-300">{data.vol.toFixed(1)}%</span></div>
        <div><span className="text-gray-600">Shrp</span> <span className="text-gray-300">{data.sharpe.toFixed(2)}</span></div>
      </div>
      {data.weights && (
        <div className="mt-0.5 text-[8px] text-gray-600">
          {data.weights.map(w => `${w.sym.split('/')[0]}: ${(w.w * 100).toFixed(0)}%`).join(' · ')}
        </div>
      )}
    </div>
  )
}
