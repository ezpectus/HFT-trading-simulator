import { memo } from 'react'
import { CloudLightning, AlertTriangle, TrendingDown, Shield } from 'lucide-react'
import { StatCard, WarningBanner, SectionTitle } from '../utils/ui-helpers'

const MOCK_SCENARIOS = [
  { id: 1, name: '2008 Financial Crisis', crashPct: -38.6, duration: 540, recoveryDays: 1200, portfolioImpact: -28.5, var95: -18.2, status: 'tested' },
  { id: 2, name: 'COVID Crash (Mar 2020)', crashPct: -32.5, duration: 33, recoveryDays: 150, portfolioImpact: -22.8, var95: -15.5, status: 'tested' },
  { id: 3, name: 'FTX Collapse (Nov 2022)', crashPct: -25.2, duration: 5, recoveryDays: 90, portfolioImpact: -15.3, var95: -12.8, status: 'tested' },
  { id: 4, name: 'LUNA Death Spiral', crashPct: -99.9, duration: 3, recoveryDays: 0, portfolioImpact: -8.5, var95: -25.0, status: 'tested' },
  { id: 5, name: 'Flash Crash (10min)', crashPct: -15.2, duration: 0.007, recoveryDays: 1, portfolioImpact: -5.8, var95: -8.2, status: 'tested' },
  { id: 6, name: 'Custom: 50% BTC Drop', crashPct: -50.0, duration: 30, recoveryDays: 180, portfolioImpact: -35.2, var95: -22.5, status: 'custom' },
]

const MOCK_HEDGES = [
  { hedge: 'BTC Put Options (20% OTM)', cost: 0.8, protection: 12.5, efficiency: 15.6 },
  { hedge: 'Short ETH/BTC Ratio', cost: 0.3, protection: 5.2, efficiency: 17.3 },
  { hedge: 'USDC Allocation (20%)', cost: 0.0, protection: 8.5, efficiency: 0 },
  { hedge: 'Inverse ETF (3x)', cost: 1.2, protection: 18.5, efficiency: 15.4 },
  { hedge: 'Gold Correlation', cost: 0.1, protection: 2.5, efficiency: 25.0 },
]

function impactColor(impact) {
  if (impact > -10) return 'text-accent-yellow'
  if (impact > -20) return 'text-accent-orange'
  return 'text-accent-red'
}

const STATS = {
  worstImpact: Math.min(...MOCK_SCENARIOS.map(s => s.portfolioImpact)),
  worstScenario: MOCK_SCENARIOS.reduce((min, s) => s.portfolioImpact < min.portfolioImpact ? s : min, MOCK_SCENARIOS[0]),
  avgImpact: MOCK_SCENARIOS.reduce((s, sc) => s + sc.portfolioImpact, 0) / MOCK_SCENARIOS.length,
  maxVar: Math.min(...MOCK_SCENARIOS.map(s => s.var95)),
}

const BlackSwanTester = memo(function BlackSwanTester() {
  const stats = STATS

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={CloudLightning} title="Black Swan Tester" iconColor="text-accent-red" right={<span className="text-[10px] text-gray-600">{MOCK_SCENARIOS.length} scenarios</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Worst Impact" value={`${stats.worstImpact.toFixed(1)}%`} color="text-accent-red" compact />
        <StatCard label="Avg Impact" value={`${stats.avgImpact.toFixed(1)}%`} color="text-accent-orange" compact />
        <StatCard label="Max VaR95" value={`${stats.maxVar.toFixed(1)}%`} color="text-accent-red" compact />
        <StatCard label="Survival" value="PASS" color="text-accent-green" compact />
      </div>

      {/* Scenario results */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase mb-1">Stress Test Scenarios</div>
        <div className="space-y-0.5">
          {MOCK_SCENARIOS.map(s => (
            <div key={s.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                <span className={`text-[8px] px-1 rounded ${s.status === 'custom' ? 'bg-accent-purple/20 text-accent-purple' : 'bg-bg-600 text-gray-500'} w-12 text-center`}>
                  {s.status.toUpperCase()}
                </span>
                <span className="text-[10px] text-gray-300 flex-1 truncate">{s.name}</span>
                <span className="text-[9px] font-mono text-accent-red w-12 text-right">{s.crashPct.toFixed(1)}%</span>
                <span className={`text-[9px] font-mono w-12 text-right ${impactColor(s.portfolioImpact)}`}>
                  {s.portfolioImpact.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-4 text-[8px] text-gray-600">
                <span>Duration: {s.duration < 1 ? `${(s.duration * 1440).toFixed(0)}min` : `${s.duration}d`}</span>
                <span>Recovery: {s.recoveryDays === 0 ? 'never' : `${s.recoveryDays}d`}</span>
                <span>VaR95: <span className="text-accent-red">{s.var95.toFixed(1)}%</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hedge analysis */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Shield size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-600 uppercase">Hedge Analysis</span>
        </div>
        <div className="space-y-0.5">
          {MOCK_HEDGES.map(h => (
            <div key={h.hedge} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 flex-1 truncate">{h.hedge}</span>
              <span className="text-[9px] font-mono text-accent-yellow w-12 text-right">{h.cost.toFixed(1)}%</span>
              <span className="text-[9px] font-mono text-accent-green w-12 text-right">+{h.protection.toFixed(1)}%</span>
              <span className="text-[9px] font-mono text-accent-blue w-12 text-right">{h.efficiency.toFixed(1)}x</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-gray-600 px-1.5">
          <span>Hedge / Cost / Protection / Efficiency</span>
        </div>
      </div>

      {/* Worst case alert */}
      <WarningBanner icon={AlertTriangle} color="text-accent-red">
        Worst case: {stats.worstScenario.name} ({stats.worstImpact.toFixed(1)}% portfolio impact)
      </WarningBanner>

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <TrendingDown size={9} className="text-accent-red" />
          Portfolio survives all tested scenarios
        </span>
        <span>Best hedge: Inverse ETF (18.5% protection)</span>
      </div>
    </div>
  )
})

export default BlackSwanTester
