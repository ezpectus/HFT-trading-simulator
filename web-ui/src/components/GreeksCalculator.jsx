import { useState, useMemo } from 'react'
import { Sigma, Info } from 'lucide-react'

// Black-Scholes Greeks calculation
function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

function normPDF(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
}

function calcGreeks(S, K, T, r, sigma, type) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
  }

  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)

  const isCall = type === 'call'

  const price = isCall
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)

  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1
  const gamma = normPDF(d1) / (S * sigma * Math.sqrt(T))
  const theta = isCall
    ? (-S * normPDF(d1) * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365
    : (-S * normPDF(d1) * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365
  const vega = S * normPDF(d1) * Math.sqrt(T) / 100
  const rho = isCall
    ? K * T * Math.exp(-r * T) * normCDF(d2) / 100
    : -K * T * Math.exp(-r * T) * normCDF(-d2) / 100

  return { price, delta, gamma, theta, vega, rho }
}

export default function GreeksCalculator({ currentPrice }) {
  const [type, setType] = useState('call')
  const [strike, setStrike] = useState(currentPrice || 65000)
  const [daysToExpiry, setDaysToExpiry] = useState(30)
  const [volatility, setVolatility] = useState(50)
  const [riskFreeRate, setRiskFreeRate] = useState(5)

  const greeks = useMemo(() => {
    const S = currentPrice || strike
    const T = daysToExpiry / 365
    const r = riskFreeRate / 100
    const sigma = volatility / 100
    return calcGreeks(S, strike, T, r, sigma, type)
  }, [currentPrice, strike, daysToExpiry, volatility, riskFreeRate, type])

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Sigma size={12} className="text-accent-purple" />
        Greeks Calculator (Black-Scholes)
      </div>

      {/* Type selector */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setType('call')}
          className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
            (type === 'call' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-400')}
        >
          CALL
        </button>
        <button
          onClick={() => setType('put')}
          className={'flex-1 py-1 text-[10px] rounded transition-colors ' +
            (type === 'put' ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-600 text-gray-400')}
        >
          PUT
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Spot Price</span>
          <input
            type="number"
            value={currentPrice || strike}
            readOnly
            className="bg-bg-800/50 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-500 font-mono"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Strike</span>
          <input
            type="number"
            value={strike}
            onChange={e => setStrike(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Days to Expiry</span>
          <input
            type="number"
            value={daysToExpiry}
            onChange={e => setDaysToExpiry(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Volatility (%)</span>
          <input
            type="number"
            value={volatility}
            onChange={e => setVolatility(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Risk-free Rate (%)</span>
          <input
            type="number"
            value={riskFreeRate}
            onChange={e => setRiskFreeRate(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple"
          />
        </label>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-1.5">
        <GreekStat label="Price" value={`$${greeks.price.toFixed(2)}`} color="text-gray-200" />
        <GreekStat label="Delta" value={greeks.delta.toFixed(4)} color={greeks.delta >= 0 ? 'text-accent-green' : 'text-accent-red'} />
        <GreekStat label="Gamma" value={greeks.gamma.toFixed(6)} color="text-accent-blue" />
        <GreekStat label="Theta" value={`${greeks.theta.toFixed(4)}/day`} color="text-accent-red" />
        <GreekStat label="Vega" value={`${greeks.vega.toFixed(4)}/%`} color="text-accent-yellow" />
        <GreekStat label="Rho" value={`${greeks.rho.toFixed(4)}/%`} color="text-accent-purple" />
      </div>

      <div className="mt-2 pt-1.5 border-t border-bg-600 flex items-start gap-1 text-[8px] text-gray-600">
        <Info size={9} className="shrink-0 mt-0.5" />
        <span>Black-Scholes model. Vega/Rho per 1% change. Theta per day.</span>
      </div>
    </div>
  )
}

function GreekStat({ label, value, color }) {
  return (
    <div className="bg-bg-600/50 rounded px-2 py-1">
      <div className="text-[8px] text-gray-600 uppercase">{label}</div>
      <div className={`text-[11px] font-mono font-medium ${color}`}>{value}</div>
    </div>
  )
}
