import { useState, useMemo } from 'react'
import { Plus, Trash2, Calculator } from 'lucide-react'

function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

function bsPrice(S, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return Math.max(0, isCall ? S - K : K - S)
  }
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return isCall
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
}

const STRATEGIES = [
  { id: 'long_call', name: 'Long Call', legs: [{ type: 'call', action: 'buy', qty: 1 }] },
  { id: 'long_put', name: 'Long Put', legs: [{ type: 'put', action: 'buy', qty: 1 }] },
  { id: 'covered_call', name: 'Covered Call', legs: [{ type: 'call', action: 'sell', qty: 1 }] },
  { id: 'protective_put', name: 'Protective Put', legs: [{ type: 'put', action: 'buy', qty: 1 }] },
  { id: 'bull_call_spread', name: 'Bull Call Spread', legs: [
    { type: 'call', action: 'buy', qty: 1, strikeOffset: -0.02 },
    { type: 'call', action: 'sell', qty: 1, strikeOffset: 0.02 },
  ]},
  { id: 'bear_put_spread', name: 'Bear Put Spread', legs: [
    { type: 'put', action: 'buy', qty: 1, strikeOffset: 0.02 },
    { type: 'put', action: 'sell', qty: 1, strikeOffset: -0.02 },
  ]},
  { id: 'straddle', name: 'Long Straddle', legs: [
    { type: 'call', action: 'buy', qty: 1 },
    { type: 'put', action: 'buy', qty: 1 },
  ]},
  { id: 'strangle', name: 'Long Strangle', legs: [
    { type: 'call', action: 'buy', qty: 1, strikeOffset: 0.03 },
    { type: 'put', action: 'buy', qty: 1, strikeOffset: -0.03 },
  ]},
  { id: 'iron_condor', name: 'Iron Condor', legs: [
    { type: 'put', action: 'buy', qty: 1, strikeOffset: -0.06 },
    { type: 'put', action: 'sell', qty: 1, strikeOffset: -0.03 },
    { type: 'call', action: 'sell', qty: 1, strikeOffset: 0.03 },
    { type: 'call', action: 'buy', qty: 1, strikeOffset: 0.06 },
  ]},
  { id: 'butterfly', name: 'Call Butterfly', legs: [
    { type: 'call', action: 'buy', qty: 1, strikeOffset: -0.03 },
    { type: 'call', action: 'sell', qty: 2, strikeOffset: 0 },
    { type: 'call', action: 'buy', qty: 1, strikeOffset: 0.03 },
  ]},
]

export default function OptionsStrategySimulator({ currentPrice }) {
  const [spot, setSpot] = useState(currentPrice || 65000)
  const [daysToExpiry, setDaysToExpiry] = useState(30)
  const [volatility, setVolatility] = useState(50)
  const [riskFreeRate, setRiskFreeRate] = useState(5)
  const [strategyId, setStrategyId] = useState('bull_call_spread')
  const [legs, setLegs] = useState(STRATEGIES[4].legs)

  const T = daysToExpiry / 365
  const r = riskFreeRate / 100
  const sigma = volatility / 100

  const strategy = useMemo(() => STRATEGIES.find(s => s.id === strategyId), [strategyId])
  void strategy

  const selectStrategy = (id) => {
    const s = STRATEGIES.find(x => x.id === id)
    if (!s) return
    setStrategyId(id)
    setLegs(s.legs.map(leg => ({
      ...leg,
      strike: spot * (1 + (leg.strikeOffset || 0)),
      strikeOffset: leg.strikeOffset || 0,
    })))
  }

  const updateLeg = (idx, field, value) => {
    setLegs(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addLeg = () => {
    setLegs(prev => [...prev, { type: 'call', action: 'buy', qty: 1, strike: spot }])
  }

  const removeLeg = (idx) => {
    setLegs(prev => prev.filter((_, i) => i !== idx))
  }

  const legResults = useMemo(() => {
    return legs.map(leg => {
      const K = leg.strike || spot
      const isCall = leg.type === 'call'
      const price = bsPrice(spot, K, T, r, sigma, isCall)
      const cost = leg.action === 'buy' ? price : -price
      return {
        ...leg,
        K,
        optionPrice: price,
        totalCost: cost * (leg.qty || 1),
      }
    })
  }, [legs, spot, T, r, sigma])

  const netCost = legResults.reduce((sum, l) => sum + l.totalCost, 0)

  const pnlProfile = useMemo(() => {
    const points = []
    const range = spot * 0.2
    const steps = 41
    for (let i = 0; i < steps; i++) {
      const priceAtExpiry = spot * (1 - range / spot) + (2 * range / (steps - 1)) * i
      let pnl = -netCost
      for (const leg of legResults) {
        const intrinsic = leg.type === 'call'
          ? Math.max(0, priceAtExpiry - leg.K)
          : Math.max(0, leg.K - priceAtExpiry)
        if (leg.action === 'sell') {
          pnl += intrinsic * (leg.qty || 1)
        } else {
          pnl -= intrinsic * (leg.qty || 1)
        }
      }
      points.push({ price: priceAtExpiry, pnl })
    }
    return points
  }, [legResults, netCost, spot])

  const maxProfit = Math.max(...pnlProfile.map(p => p.pnl))
  const maxLoss = Math.min(...pnlProfile.map(p => p.pnl))
  const breakevens = pnlProfile.filter((p, i) => {
    if (i === 0 || i === pnlProfile.length - 1) return false
    const prev = pnlProfile[i - 1]
    return (prev.pnl < 0 && p.pnl >= 0) || (prev.pnl > 0 && p.pnl <= 0)
  })

  const pnlColor = (v) => v > 0 ? 'text-accent-green' : v < 0 ? 'text-accent-red' : 'text-gray-400'

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calculator size={12} className="text-accent-purple" />
        Options Strategy P&L Simulator
      </div>

      {/* Market params */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Spot Price</span>
          <input type="number" value={spot} onChange={e => setSpot(+e.target.value)}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Days to Expiry</span>
          <input type="number" value={daysToExpiry} onChange={e => setDaysToExpiry(+e.target.value)}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Volatility (%)</span>
          <input type="number" value={volatility} onChange={e => setVolatility(+e.target.value)}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Risk-free Rate (%)</span>
          <input type="number" value={riskFreeRate} onChange={e => setRiskFreeRate(+e.target.value)}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple" />
        </label>
      </div>

      {/* Strategy presets */}
      <div className="flex flex-wrap gap-0.5 mb-2">
        {STRATEGIES.map(s => (
          <button key={s.id}
            onClick={() => selectStrategy(s.id)}
            className={'px-1.5 py-0.5 text-[8px] rounded ' +
              (strategyId === s.id ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-600 text-gray-600')}>
            {s.name}
          </button>
        ))}
      </div>

      {/* Legs */}
      <div className="space-y-1 mb-2">
        {legResults.map((leg, idx) => (
          <div key={idx} className="flex items-center gap-1 bg-bg-600/40 rounded p-1">
            <select value={leg.action} onChange={e => updateLeg(idx, 'action', e.target.value)}
              className="bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
            <select value={leg.type} onChange={e => updateLeg(idx, 'type', e.target.value)}
              className="bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none">
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
            <input type="number" value={leg.strike || 0} onChange={e => updateLeg(idx, 'strike', +e.target.value)}
              className="w-20 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none"
              placeholder="Strike" />
            <input type="number" value={leg.qty || 1} onChange={e => updateLeg(idx, 'qty', +e.target.value)}
              className="w-12 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none"
              placeholder="Qty" />
            <span className="text-[9px] text-gray-500 ml-auto">
              @ {leg.optionPrice.toFixed(2)}
            </span>
            <span className={'text-[9px] font-mono ' + pnlColor(leg.totalCost)}>
              {leg.totalCost >= 0 ? '+' : ''}{leg.totalCost.toFixed(2)}
            </span>
            <button onClick={() => removeLeg(idx)} className="text-gray-600 hover:text-accent-red">
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        <button onClick={addLeg} className="flex items-center gap-0.5 text-[9px] text-gray-500 hover:text-accent-purple">
          <Plus size={10} /> Add Leg
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-bg-600/40 rounded p-1.5">
          <div className="text-[8px] text-gray-600 uppercase">Net Cost</div>
          <div className={'text-[11px] font-mono ' + pnlColor(netCost)}>
            {netCost >= 0 ? '+' : ''}{netCost.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-600/40 rounded p-1.5">
          <div className="text-[8px] text-gray-600 uppercase">Max Profit</div>
          <div className="text-[11px] font-mono text-accent-green">
            {maxProfit > 99999 ? '∞' : `+${maxProfit.toFixed(2)}`}
          </div>
        </div>
        <div className="bg-bg-600/40 rounded p-1.5">
          <div className="text-[8px] text-gray-600 uppercase">Max Loss</div>
          <div className="text-[11px] font-mono text-accent-red">
            {maxLoss < -99999 ? '-∞' : maxLoss.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Breakevens */}
      {breakevens.length > 0 && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 uppercase mb-0.5">Breakeven{breakevens.length > 1 ? 's' : ''}</div>
          <div className="flex gap-1">
            {breakevens.map((b, i) => (
              <span key={i} className="text-[9px] text-gray-400 font-mono bg-bg-600/40 rounded px-1.5 py-0.5">
                {b.price.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* P&L Chart */}
      <div className="relative h-[120px] bg-bg-800 rounded border border-bg-600 overflow-hidden">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 120">
          {/* Zero line */}
          {(() => {
            const zeroY = 120 - ((0 - maxLoss) / (maxProfit - maxLoss)) * 120
            return <line x1="0" y1={zeroY} x2="400" y2={zeroY} stroke="#444" strokeWidth="0.5" strokeDasharray="2,2" />
          })()}
          {/* P&L curve */}
          {(() => {
            const minPrice = pnlProfile[0]?.price || 0
            const maxPrice = pnlProfile[pnlProfile.length - 1]?.price || 1
            const points = pnlProfile.map(p => {
              const x = ((p.price - minPrice) / (maxPrice - minPrice)) * 400
              const y = 120 - ((p.pnl - maxLoss) / (maxProfit - maxLoss)) * 120
              return `${x},${y}`
            }).join(' ')
            const fillColor = netCost < 0 ? 'rgba(168,85,247,0.1)' : 'rgba(34,197,94,0.1)'
            const strokeColor = netCost < 0 ? '#a855f7' : '#22c55e'
            return (
              <>
                <polygon points={`0,120 ${points} 400,120`} fill={fillColor} />
                <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="1.5" />
              </>
            )
          })()}
        </svg>
        <div className="absolute bottom-0 left-0 text-[7px] text-gray-600 p-0.5">
          {(pnlProfile[0]?.price || 0).toFixed(0)}
        </div>
        <div className="absolute bottom-0 right-0 text-[7px] text-gray-600 p-0.5">
          {(pnlProfile[pnlProfile.length - 1]?.price || 0).toFixed(0)}
        </div>
      </div>
      <div className="text-[8px] text-gray-600 text-center mt-0.5">Price at Expiry →</div>
    </div>
  )
}
