import { memo, useState, useMemo } from 'react'
import { Calculator, TrendingUp, TrendingDown, Activity } from 'lucide-react'

function OptionsPricing() {
  const [params, setParams] = useState({
    S: 100,      // Stock price
    K: 100,      // Strike price
    T: 0.25,     // Time to expiration (years)
    sigma: 0.2,   // Volatility
    r: 0.05,     // Risk-free rate
  })

  const [optionType, setOptionType] = useState('call')

  // Calculate Black-Scholes price and Greeks
  const results = useMemo(() => {
    const { S, K, T, sigma, r } = params
    
    // Calculate d1 and d2
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T))
    const d2 = d1 - sigma * Math.sqrt(T)
    
    // CDF function
    const cdf = (x) => 0.5 * (1 + Math.erf(x / Math.sqrt(2)))
    const pdf = (x) => Math.exp(-0.5 * x ** 2) / Math.sqrt(2 * Math.pi)
    
    // Calculate option price
    let price
    if (optionType === 'call') {
      price = S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2)
    } else {
      price = K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1)
    }
    price = Math.max(0, price)
    
    // Calculate Greeks
    const delta = optionType === 'call' ? cdf(d1) : cdf(d1) - 1
    const gamma = pdf(d1) / (S * sigma * Math.sqrt(T))
    const vega = S * pdf(d1) * Math.sqrt(T) / 100
    
    let theta
    if (optionType === 'call') {
      theta = -(S * pdf(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * cdf(d2)
    } else {
      theta = -(S * pdf(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * cdf(-d2)
    }
    
    let rho
    if (optionType === 'call') {
      rho = K * T * Math.exp(-r * T) * cdf(d2) / 100
    } else {
      rho = -K * T * Math.exp(-r * T) * cdf(-d2) / 100
    }
    
    return { price, delta, gamma, theta, vega, rho }
  }, [params, optionType])

  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }))
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={16} className="text-accent-blue" />
        <h3 className="text-sm font-semibold text-gray-200">Options Pricing Calculator</h3>
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Stock Price (S)</label>
          <input
            type="number"
            value={params.S}
            onChange={(e) => handleParamChange('S', e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Strike Price (K)</label>
          <input
            type="number"
            value={params.K}
            onChange={(e) => handleParamChange('K', e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Time to Expiry (T)</label>
          <input
            type="number"
            step="0.01"
            value={params.T}
            onChange={(e) => handleParamChange('T', e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Volatility (σ)</label>
          <input
            type="number"
            step="0.01"
            value={params.sigma}
            onChange={(e) => handleParamChange('sigma', e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Risk-Free Rate (r)</label>
          <input
            type="number"
            step="0.01"
            value={params.r}
            onChange={(e) => handleParamChange('r', e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Option Type</label>
          <select
            value={optionType}
            onChange={(e) => setOptionType(e.target.value)}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          >
            <option value="call">Call</option>
            <option value="put">Put</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="bg-bg-700  p-3">
        <div className="text-[10px] text-gray-500 uppercase mb-2">Option Price</div>
        <div className="text-2xl font-mono text-accent-green">
          ${results.price.toFixed(2)}
        </div>
      </div>

      {/* Greeks */}
      <div className="bg-bg-700  p-3">
        <div className="text-[10px] text-gray-500 uppercase mb-2 flex items-center gap-1">
          <Activity size={12} />
          Greeks
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500 text-[10px]">Delta</div>
            <div className="font-mono text-gray-200">{results.delta.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Gamma</div>
            <div className="font-mono text-gray-200">{results.gamma.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Theta</div>
            <div className="font-mono text-gray-200">{results.theta.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Vega</div>
            <div className="font-mono text-gray-200">{results.vega.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Rho</div>
            <div className="font-mono text-gray-200">{results.rho.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* Moneyness */}
      <div className="bg-bg-700  p-3">
        <div className="text-[10px] text-gray-500 uppercase mb-2">Moneyness</div>
        <div className="flex items-center gap-2">
          {params.S > params.K ? (
            <>
              <TrendingUp size={14} className="text-accent-green" />
              <span className="text-xs text-accent-green">In the Money (ITM)</span>
            </>
          ) : params.S < params.K ? (
            <>
              <TrendingDown size={14} className="text-accent-red" />
              <span className="text-xs text-accent-red">Out of the Money (OTM)</span>
            </>
          ) : (
            <>
              <Activity size={14} className="text-gray-400" />
              <span className="text-xs text-gray-400">At the Money (ATM)</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(OptionsPricing)
