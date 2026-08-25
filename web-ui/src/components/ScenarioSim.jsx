import { memo, useMemo } from 'react'
import { Beaker, AlertTriangle, Zap, RotateCcw } from 'lucide-react'
import { formatPrice, formatVolume } from '../utils/format'

const MOCK_SCENARIOS = [
  { id: 'crash-20', name: 'Market Crash (-20%)', priceChange: -20, volSpike: 3.5, liquidations: 'High', fillRate: 45, slippage: 2.8 },
  { id: 'crash-10', name: 'Correction (-10%)', priceChange: -10, volSpike: 2.0, liquidations: 'Medium', fillRate: 68, slippage: 1.2 },
  { id: 'pump-20', name: 'Pump (+20%)', priceChange: 20, volSpike: 2.8, liquidations: 'Low', fillRate: 72, slippage: 1.5 },
  { id: 'flash-crash', name: 'Flash Crash (-5% / 1min)', priceChange: -5, volSpike: 5.0, liquidations: 'Extreme', fillRate: 25, slippage: 4.5 },
  { id: 'vol-spike', name: 'Volatility Spike (3x)', priceChange: 0, volSpike: 3.0, liquidations: 'Low', fillRate: 85, slippage: 0.8 },
  { id: 'liquidation-cascade', name: 'Liquidation Cascade', priceChange: -8, volSpike: 4.2, liquidations: 'Extreme', fillRate: 35, slippage: 3.2 },
]

const MOCK_PORTFOLIO_IMPACT = [
  { scenario: 'crash-20', equity: -18500, marginCall: true, maxDD: 22.5, recoveryTime: 45 },
  { scenario: 'crash-10', equity: -8200, marginCall: false, maxDD: 11.2, recoveryTime: 12 },
  { scenario: 'pump-20', equity: 12400, marginCall: false, maxDD: 0, recoveryTime: 0 },
  { scenario: 'flash-crash', equity: -4800, marginCall: false, maxDD: 6.8, recoveryTime: 3 },
  { scenario: 'vol-spike', equity: -1200, marginCall: false, maxDD: 2.1, recoveryTime: 1 },
  { scenario: 'liquidation-cascade', equity: -11200, marginCall: true, maxDD: 15.3, recoveryTime: 28 },
]

function severityColor(change) {
  if (change <= -15) return 'text-accent-red'
  if (change <= -5) return 'text-accent-orange'
  if (change <= 0) return 'text-accent-yellow'
  return 'text-accent-green'
}

function liquidationColor(level) {
  if (level === 'Extreme') return 'text-accent-red'
  if (level === 'High') return 'text-accent-orange'
  if (level === 'Medium') return 'text-accent-yellow'
  return 'text-accent-green'
}

const ScenarioSim = memo(function ScenarioSim({ currentPrice }) {
  const price = currentPrice ?? 50000

  const worstCase = useMemo(() => {
    const worst = MOCK_PORTFOLIO_IMPACT.reduce((min, p) => p.equity < min.equity ? p : min, MOCK_PORTFOLIO_IMPACT[0])
    return worst
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Beaker size={14} className="text-accent-purple" />
          <span className="text-sm font-medium">Scenario Simulator</span>
        </div>
        <span className="text-[10px] text-gray-600">Base: ${formatPrice(price)}</span>
      </div>

      {/* Worst case summary */}
      <div className="p-2 bg-accent-red/10 border border-accent-red/30 rounded">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle size={11} className="text-accent-red" />
          <span className="text-[10px] text-accent-red uppercase">Worst Case</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-[9px] text-gray-600">Equity Impact</span>
            <div className="text-sm font-mono text-accent-red">${formatVolume(worstCase.equity)}</div>
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Max Drawdown</span>
            <div className="text-sm font-mono text-accent-red">{worstCase.maxDD.toFixed(1)}%</div>
          </div>
          <div>
            <span className="text-[9px] text-gray-600">Recovery</span>
            <div className="text-sm font-mono text-accent-yellow">{worstCase.recoveryTime}d</div>
          </div>
        </div>
        {worstCase.marginCall && (
          <div className="flex items-center gap-1 mt-1">
            <Zap size={9} className="text-accent-red" />
            <span className="text-[9px] text-accent-red">Margin call triggered</span>
          </div>
        )}
      </div>

      {/* Scenario table */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Scenarios</div>
        <div className="space-y-0.5">
          {MOCK_SCENARIOS.map(scn => {
            const impact = MOCK_PORTFOLIO_IMPACT.find(p => p.scenario === scn.id)
            const newPrice = price * (1 + scn.priceChange / 100)
            return (
              <div key={scn.id} className="py-1 px-1.5 bg-bg-700">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-300 truncate">{scn.name}</span>
                  <span className={`text-[10px] font-mono ${severityColor(scn.priceChange)}`}>
                    {scn.priceChange >= 0 ? '+' : ''}{scn.priceChange}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px]">
                  <div>
                    <span className="text-gray-600">Price</span>
                    <div className="font-mono text-gray-400">${formatPrice(newPrice, 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Vol</span>
                    <div className="font-mono text-accent-yellow">{scn.volSpike.toFixed(1)}x</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Liq</span>
                    <div className={`font-mono ${liquidationColor(scn.liquidations)}`}>{scn.liquidations}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Slip</span>
                    <div className="font-mono text-accent-orange">{scn.slippage.toFixed(1)}%</div>
                  </div>
                </div>
                {impact && (
                  <div className="flex items-center justify-between mt-0.5 pt-0.5 border-t border-bg-600">
                    <span className={`text-[9px] font-mono ${impact.equity >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      Equity: {impact.equity >= 0 ? '+' : ''}{formatVolume(impact.equity)}
                    </span>
                    <span className="text-[9px] text-gray-600">
                      DD: {impact.maxDD.toFixed(1)}% | {impact.recoveryTime}d recovery
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Fill rate bars */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="text-[10px] text-gray-600 uppercase mb-1">Order Fill Rate Under Stress</div>
        <div className="space-y-0.5">
          {MOCK_SCENARIOS.map(scn => (
            <div key={scn.id} className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500 w-24 truncate">{scn.name}</span>
              <div className="flex-1 h-2 bg-bg-600 rounded overflow-hidden">
                <div
                  className={`h-full ${scn.fillRate > 70 ? 'bg-accent-green' : scn.fillRate > 50 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
                  style={{ width: `${scn.fillRate}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-gray-400 w-8 text-right">{scn.fillRate}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <RotateCcw size={9} />
        <span>Simulations use historical volatility patterns</span>
      </div>
    </div>
  )
})

export default ScenarioSim
