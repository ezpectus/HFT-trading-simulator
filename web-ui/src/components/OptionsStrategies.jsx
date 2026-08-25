import { memo, useState, useMemo } from 'react'
import { Layers, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

function OptionsStrategies() {
  const [strategy, setStrategy] = useState('straddle')
  const [params, setParams] = useState({
    S: 100,           // Stock price
    K: 100,           // Strike price (for straddle)
    K_call: 105,      // Call strike (for strangle)
    K_put: 95,        // Put strike (for strangle)
    K_call_high: 110, // High call strike (for iron condor)
    K_call_low: 105,  // Low call strike (for iron condor)
    K_put_high: 95,   // High put strike (for iron condor)
    K_put_low: 90,    // Low put strike (for iron condor)
    K_low: 90,        // Low strike (for butterfly)
    K_middle: 100,    // Middle strike (for butterfly)
    K_high: 110,      // High strike (for butterfly)
    T: 0.25,         // Time to expiration
    sigma: 0.2,      // Volatility
    r: 0.05,          // Risk-free rate
  })

  const [long, setLong] = useState(true)

  // Calculate strategy results
  const results = useMemo(() => {
    const { S, T, sigma, r } = params
    
    // Black-Scholes pricing helper
    const d1 = (logS, K) => (Math.log(logS / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T))
    const d2 = (d1_val) => d1_val - sigma * Math.sqrt(T)
    const cdf = (x) => 0.5 * (1 + Math.erf(x / Math.sqrt(2)))
    const callPrice = (K) => S * cdf(d1(S, K)) - K * Math.exp(-r * T) * cdf(d2(d1(S, K)))
    const putPrice = (K) => K * Math.exp(-r * T) * cdf(-d2(d1(S, K))) - S * cdf(-d1(S, K))

    let maxProfit, maxLoss, breakEvens, payoffAtExpiry

    if (strategy === 'straddle') {
      const callPrice = callPrice(params.K)
      const putPrice = putPrice(params.K)
      const position = long ? 1 : -1
      const totalPremium = position * (callPrice + putPrice)

      maxProfit = long ? Infinity : totalPremium
      maxLoss = long ? -totalPremium : Infinity
      breakEvens = [params.K - totalPremium, params.K + totalPremium]

      payoffAtExpiry = []
      for (let price = params.K * 0.5; price <= params.K * 1.5; price += 1) {
        const callPayoff = position * Math.max(0, price - params.K)
        const putPayoff = position * Math.max(0, params.K - price)
        payoffAtExpiry.push({ price, payoff: callPayoff + putPayoff - totalPremium })
      }
    } else if (strategy === 'strangle') {
      const callPrice = callPrice(params.K_call)
      const putPrice = putPrice(params.K_put)
      const position = long ? 1 : -1
      const totalPremium = position * (callPrice + putPrice)

      maxProfit = long ? Infinity : totalPremium
      maxLoss = long ? -totalPremium : Infinity
      breakEvens = [params.K_put - totalPremium, params.K_call + totalPremium]

      payoffAtExpiry = []
      const minPrice = Math.min(params.K_put, params.K_call) * 0.5
      const maxPrice = Math.max(params.K_put, params.K_call) * 1.5
      for (let price = minPrice; price <= maxPrice; price += 1) {
        const callPayoff = position * Math.max(0, price - params.K_call)
        const putPayoff = position * Math.max(0, params.K_put - price)
        payoffAtExpiry.push({ price, payoff: callPayoff + putPayoff - totalPremium })
      }
    } else if (strategy === 'iron_condor') {
      const callHighPrice = callPrice(params.K_call_high)
      const callLowPrice = callPrice(params.K_call_low)
      const putHighPrice = putPrice(params.K_put_high)
      const putLowPrice = putPrice(params.K_put_low)

      const netPremium = (putLowPrice - putHighPrice) + (callHighPrice - callLowPrice)
      maxProfit = netPremium
      const putSpreadWidth = params.K_put_high - params.K_put_low
      const callSpreadWidth = params.K_call_high - params.K_call_low
      maxLoss = -Math.max(putSpreadWidth, callSpreadWidth) + netPremium
      breakEvens = [params.K_put_low - netPremium, params.K_call_high + netPremium]

      payoffAtExpiry = []
      const minPrice = Math.min(params.K_put_low, params.K_put_high) * 0.5
      const maxPrice = Math.max(params.K_call_high, params.K_call_low) * 1.5
      for (let price = minPrice; price <= maxPrice; price += 1) {
        const putSpreadPayoff = Math.max(0, params.K_put_low - price) - Math.max(0, params.K_put_high - price)
        const callSpreadPayoff = Math.max(0, price - params.K_call_high) - Math.max(0, price - params.K_call_low)
        payoffAtExpiry.push({ price, payoff: putSpreadPayoff + callSpreadPayoff + netPremium })
      }
    } else if (strategy === 'butterfly') {
      const callLowPrice = callPrice(params.K_low)
      const callMiddlePrice = callPrice(params.K_middle)
      const callHighPrice = callPrice(params.K_high)

      let netPremium
      if (long) {
        netPremium = callLowPrice - 2 * callMiddlePrice + callHighPrice
      } else {
        netPremium = -callLowPrice + 2 * callMiddlePrice - callHighPrice
      }

      if (long) {
        maxProfit = params.K_middle - params.K_low - netPremium
        maxLoss = -netPremium
      } else {
        maxProfit = -netPremium
        maxLoss = -(params.K_middle - params.K_low) - netPremium
      }

      if (long) {
        breakEvens = [params.K_low + netPremium, params.K_high - netPremium]
      } else {
        breakEvens = [params.K_low - netPremium, params.K_high + netPremium]
      }

      payoffAtExpiry = []
      for (let price = params.K_low * 0.5; price <= params.K_high * 1.5; price += 1) {
        let payoff
        if (long) {
          payoff = Math.max(0, price - params.K_low) - 2 * Math.max(0, price - params.K_middle) + Math.max(0, price - params.K_high) - netPremium
        } else {
          payoff = -Math.max(0, price - params.K_low) + 2 * Math.max(0, price - params.K_middle) - Math.max(0, price - params.K_high) - netPremium
        }
        payoffAtExpiry.push({ price, payoff })
      }
    }

    return { maxProfit, maxLoss, breakEvens, payoffAtExpiry }
  }, [strategy, params, long])

  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }))
  }

  const renderStrategyParams = () => {
    switch (strategy) {
      case 'straddle':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Strike Price (K)</label>
              <input
                type="number"
                value={params.K}
                onChange={(e) => handleParamChange('K', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>
        )
      case 'strangle':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Call Strike</label>
              <input
                type="number"
                value={params.K_call}
                onChange={(e) => handleParamChange('K_call', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Put Strike</label>
              <input
                type="number"
                value={params.K_put}
                onChange={(e) => handleParamChange('K_put', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>
        )
      case 'iron_condor':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Call High Strike</label>
              <input
                type="number"
                value={params.K_call_high}
                onChange={(e) => handleParamChange('K_call_high', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Call Low Strike</label>
              <input
                type="number"
                value={params.K_call_low}
                onChange={(e) => handleParamChange('K_call_low', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Put High Strike</label>
              <input
                type="number"
                value={params.K_put_high}
                onChange={(e) => handleParamChange('K_put_high', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Put Low Strike</label>
              <input
                type="number"
                value={params.K_put_low}
                onChange={(e) => handleParamChange('K_put_low', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>
        )
      case 'butterfly':
        return (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Low Strike</label>
              <input
                type="number"
                value={params.K_low}
                onChange={(e) => handleParamChange('K_low', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Middle Strike</label>
              <input
                type="number"
                value={params.K_middle}
                onChange={(e) => handleParamChange('K_middle', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">High Strike</label>
              <input
                type="number"
                value={params.K_high}
                onChange={(e) => handleParamChange('K_high', e.target.value)}
                className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={16} className="text-accent-blue" />
        <h3 className="text-sm font-semibold text-gray-200">Options Strategies</h3>
      </div>

      {/* Strategy Selector */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Strategy</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
        >
          <option value="straddle">Straddle</option>
          <option value="strangle">Strangle</option>
          <option value="iron_condor">Iron Condor</option>
          <option value="butterfly">Butterfly</option>
        </select>
      </div>

      {/* Position Type */}
      {strategy !== 'iron_condor' && (
        <div>
          <label className="text-[10px] text-gray-500 block mb-1">Position</label>
          <select
            value={long ? 'long' : 'short'}
            onChange={(e) => setLong(e.target.value === 'long')}
            className="w-full bg-bg-700 border border-bg-600  px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-accent-blue"
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
      )}

      {/* Common Parameters */}
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
      </div>

      {/* Strategy-Specific Parameters */}
      {renderStrategyParams()}

      {/* Results */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-700  p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingUp size={12} />
            Max Profit
          </div>
          <div className="text-lg font-mono text-accent-green">
            {results.maxProfit === Infinity ? '∞' : `$${results.maxProfit.toFixed(2)}`}
          </div>
        </div>
        <div className="bg-bg-700  p-3">
          <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1">
            <TrendingDown size={12} />
            Max Loss
          </div>
          <div className="text-lg font-mono text-accent-red">
            {results.maxLoss === Infinity ? '∞' : `$${results.maxLoss.toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Break-evens */}
      <div className="bg-bg-700  p-3">
        <div className="text-[10px] text-gray-500 uppercase mb-2 flex items-center gap-1">
          <AlertTriangle size={12} />
          Break-even Points
        </div>
        <div className="flex gap-2">
          {results.breakEvens.map((be, i) => (
            <div key={i} className="bg-bg-600  px-2 py-1">
              <span className="text-xs font-mono text-gray-200">${be.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(OptionsStrategies)
