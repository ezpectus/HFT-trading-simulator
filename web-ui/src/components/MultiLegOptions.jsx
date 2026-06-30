import { useState, useMemo } from 'react'
import { Layers, Plus, Minus, Info } from 'lucide-react'
import { formatPrice } from '../utils/format'

const STRATEGIES = [
  { id: 'straddle', label: 'Long Straddle', legs: [
    { type: 'call', side: 'buy', label: 'Buy Call' },
    { type: 'put', side: 'buy', label: 'Buy Put' },
  ]},
  { id: 'strangle', label: 'Long Strangle', legs: [
    { type: 'call', side: 'buy', label: 'Buy Call (OTM)' },
    { type: 'put', side: 'buy', label: 'Buy Put (OTM)' },
  ]},
  { id: 'iron_condor', label: 'Iron Condor', legs: [
    { type: 'call', side: 'sell', label: 'Sell Call (ATM)' },
    { type: 'call', side: 'buy', label: 'Buy Call (OTM)' },
    { type: 'put', side: 'sell', label: 'Sell Put (ATM)' },
    { type: 'put', side: 'buy', label: 'Buy Put (OTM)' },
  ]},
  { id: 'butterfly', label: 'Call Butterfly', legs: [
    { type: 'call', side: 'buy', label: 'Buy 1 Call (ITM)' },
    { type: 'call', side: 'sell', label: 'Sell 2 Calls (ATM)' },
    { type: 'call', side: 'buy', label: 'Buy 1 Call (OTM)' },
  ]},
]

// Simple option price estimation (intrinsic + time value approximation)
function estimateOptionPrice(spot, strike, type, daysToExpiry, volPct) {
  const intrinsic = type === 'call'
    ? Math.max(0, spot - strike)
    : Math.max(0, strike - spot)
  const timeValue = spot * (volPct / 100) * Math.sqrt(daysToExpiry / 365) * 0.4
  return intrinsic + timeValue
}

export default function MultiLegOptions({ currentPrice }) {
  const [strategy, setStrategy] = useState('straddle')
  const [spot, setSpot] = useState(currentPrice || 65000)
  const [daysToExpiry, setDaysToExpiry] = useState(30)
  const [volPct, setVolPct] = useState(50)
  const [strikes, setStrikes] = useState({ leg0: 65000, leg1: 60000, leg2: 70000, leg3: 55000 })

  const strat = STRATEGIES.find(s => s.id === strategy)

  const analysis = useMemo(() => {
    const legs = strat.legs.map((leg, i) => {
      const strike = strikes[`leg${i}`] || spot
      const price = estimateOptionPrice(spot, strike, leg.type, daysToExpiry, volPct)
      const cost = leg.side === 'buy' ? price : -price
      return {
        ...leg,
        strike,
        price,
        cost,
        index: i,
      }
    })

    const totalCost = legs.reduce((s, l) => s + l.cost, 0)

    // Calculate payoff at expiry for various spot prices
    const payoffPoints = []
    const range = spot * 0.3
    for (let p = -20; p <= 20; p++) {
      const testSpot = spot + (p / 20) * range
      let payoff = 0
      for (const leg of legs) {
        const intrinsic = leg.type === 'call'
          ? Math.max(0, testSpot - leg.strike)
          : Math.max(0, leg.strike - testSpot)
        payoff += leg.side === 'buy' ? intrinsic - leg.price : leg.price - intrinsic
      }
      payoffPoints.push({ spot: testSpot, payoff })
    }

    // Find breakevens
    const breakevens = []
    for (let i = 1; i < payoffPoints.length; i++) {
      const prev = payoffPoints[i - 1]
      const curr = payoffPoints[i]
      if ((prev.payoff < 0 && curr.payoff >= 0) || (prev.payoff > 0 && curr.payoff <= 0)) {
        // Linear interpolation
        const t = Math.abs(prev.payoff) / (Math.abs(prev.payoff) + Math.abs(curr.payoff) || 1)
        const be = prev.spot + t * (curr.spot - prev.spot)
        breakevens.push(be)
      }
    }

    // Max profit / loss
    const maxProfit = Math.max(...payoffPoints.map(p => p.payoff))
    const maxLoss = Math.min(...payoffPoints.map(p => p.payoff))

    return { legs, totalCost, payoffPoints, breakevens, maxProfit, maxLoss }
  }, [strat, strikes, spot, daysToExpiry, volPct])

  // SVG payoff diagram
  const W = 100, H = 50
  const payoffs = analysis.payoffPoints
  const minPayoff = Math.min(...payoffs.map(p => p.payoff), -1)
  const maxPayoff = Math.max(...payoffs.map(p => p.payoff), 1)
  const minSpot = payoffs[0].spot
  const maxSpot = payoffs[payoffs.length - 1].spot
  const xScale = (s) => ((s - minSpot) / (maxSpot - minSpot)) * W
  const yScale = (p) => H - ((p - minPayoff) / (maxPayoff - minPayoff)) * H
  const zeroY = yScale(0)

  const payoffPath = payoffs.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.spot)} ${yScale(p.payoff)}`).join(' ')

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Layers size={12} className="text-accent-purple" />
        Multi-Leg Options
      </div>

      {/* Strategy selector */}
      <div className="grid grid-cols-2 gap-1 mb-2">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => setStrategy(s.id)}
            className={'py-1 text-[9px] rounded transition-colors ' +
              (strategy === s.id ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-600 text-gray-400 hover:bg-bg-500')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Spot</span>
          <input type="number" value={spot} onChange={e => setSpot(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Days</span>
          <input type="number" value={daysToExpiry} onChange={e => setDaysToExpiry(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[8px] text-gray-600">Vol %</span>
          <input type="number" value={volPct} onChange={e => setVolPct(Number(e.target.value))}
            className="bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-purple" />
        </label>
      </div>

      {/* Legs */}
      <div className="space-y-0.5 mb-2">
        {analysis.legs.map(leg => (
          <div key={leg.index} className="flex items-center gap-1.5 bg-bg-600/50 rounded px-1.5 py-1">
            <span className={'text-[9px] ' + (leg.side === 'buy' ? 'text-accent-green' : 'text-accent-red')}>
              {leg.side === 'buy' ? <Plus size={9} className="inline" /> : <Minus size={9} className="inline" />}
              {' '}{leg.label}
            </span>
            <input
              type="number"
              value={strikes[`leg${leg.index}`]}
              onChange={e => setStrikes(prev => ({ ...prev, [`leg${leg.index}`]: Number(e.target.value) }))}
              className="w-16 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none"
            />
            <span className="text-[8px] text-gray-600">@ ${leg.price.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Payoff diagram */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[60px]" preserveAspectRatio="none">
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#3b82f6" strokeWidth="0.3" strokeDasharray="1" />
        <path d={payoffPath} fill="none" stroke="#a855f7" strokeWidth="0.8" />
        {analysis.breakevens.map((be, i) => (
          <circle key={i} cx={xScale(be)} cy={zeroY} r="1" fill="#eab308" />
        ))}
      </svg>

      {/* Results */}
      <div className="grid grid-cols-3 gap-2 text-[9px] mt-1">
        <div>
          <div className="text-gray-600">Net Cost</div>
          <div className={'font-mono ' + (analysis.totalCost >= 0 ? 'text-accent-red' : 'text-accent-green')}>
            ${analysis.totalCost.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Max Profit</div>
          <div className="font-mono text-accent-green">
            {analysis.maxProfit > 999 ? '∞' : `$${analysis.maxProfit.toFixed(0)}`}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Max Loss</div>
          <div className="font-mono text-accent-red">
            {analysis.maxLoss < -999 ? '-∞' : `$${analysis.maxLoss.toFixed(0)}`}
          </div>
        </div>
      </div>

      {/* Breakevens */}
      {analysis.breakevens.length > 0 && (
        <div className="mt-1 text-[8px] text-gray-600">
          Breakevens: {analysis.breakevens.map(be => `$${formatPrice(be)}`).join(' · ')}
        </div>
      )}
    </div>
  )
}
