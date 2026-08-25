import { memo } from 'react'
import { Search, Zap, TrendingUp, AlertTriangle } from 'lucide-react'
import { statusColor, statusBg, StatCard, Label, SectionTitle, Bar, WarningBanner } from '../utils/ui-helpers'
import { MOCK_OPPORTUNITIES, MOCK_SCAN_STATS } from '../utils/mock-data'

const STATUS_COLOR_MAP = { active: 'text-accent-green', fading: 'text-accent-yellow', closing: 'text-accent-red', default: 'text-gray-400' }
const STATUS_BG_MAP = { active: 'bg-accent-green/20', fading: 'bg-accent-yellow/20', closing: 'bg-accent-red/20', default: 'bg-gray-600/20' }

const STATS = {
  active: MOCK_OPPORTUNITIES.filter(o => o.status === 'active').length,
  totalEstProfit: MOCK_OPPORTUNITIES.filter(o => o.status === 'active').reduce((s, o) => s + o.estProfit, 0),
  avgProfit: MOCK_OPPORTUNITIES.reduce((s, o) => s + o.profit, 0) / MOCK_OPPORTUNITIES.length,
  best: MOCK_OPPORTUNITIES.reduce((max, o) => o.profit > max.profit ? o : max, MOCK_OPPORTUNITIES[0]),
}

const ArbScanner = memo(function ArbScanner() {

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Search} title="Arbitrage Scanner" right={<span className="text-[10px] text-gray-600">{STATS.active} active</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Active" value={STATS.active} color="text-accent-green" />
        <StatCard label="Est Profit" value={`$${STATS.totalEstProfit}`} color="text-accent-green" />
        <StatCard label="Avg Spread" value={`${STATS.avgProfit.toFixed(2)}%`} color="text-gray-300" />
        <StatCard label="Best" value={`${STATS.best.profit.toFixed(2)}%`} color="text-accent-yellow" />
      </div>

      {/* Opportunities */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Zap size={11} className="text-gray-500" />
          <Label>Opportunities</Label>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {MOCK_OPPORTUNITIES.map(opp => (
            <div key={opp.id} className="py-1 px-1.5 bg-bg-700">
              <div className="flex items-center gap-2">
                <span className={`text-[8px] px-1 rounded ${statusBg(opp.status, STATUS_BG_MAP)} ${statusColor(opp.status, STATUS_COLOR_MAP)} w-12 text-center`}>
                  {opp.status.toUpperCase()}
                </span>
                <span className="text-[9px] text-gray-500 w-20 truncate">{opp.type}</span>
                <span className="text-[10px] text-gray-300 flex-1 truncate">{opp.path}</span>
                <span className="text-[9px] font-mono text-accent-green w-12 text-right">+{opp.profit.toFixed(2)}%</span>
                <span className="text-[9px] font-mono text-gray-400 w-14 text-right">${opp.estProfit}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-4 text-[8px] text-gray-600">
                <span>Capital: ${opp.capital.toLocaleString()}</span>
                <span>Latency: {opp.latency}ms</span>
                <span>Confidence: <span className={opp.confidence >= 0.7 ? 'text-accent-green' : 'text-accent-yellow'}>{(opp.confidence * 100).toFixed(0)}%</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Exchange scan stats */}
      <div>
        <Label className="mb-1">Exchange Scan Stats</Label>
        <div className="space-y-0.5">
          {MOCK_SCAN_STATS.map(e => (
            <div key={e.exchange} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-16">{e.exchange}</span>
              <span className="text-[9px] font-mono text-accent-green w-10">{e.opps} opps</span>
              <span className="text-[9px] font-mono text-gray-400 w-16">{e.avgProfit.toFixed(2)}% avg</span>
              <Bar value={e.opps} max={12} color="bg-accent-blue" height="h-1.5" />
              <span className="text-[9px] text-gray-600 w-12 text-right">{e.scanned} scans</span>
            </div>
          ))}
        </div>
      </div>

      {STATS.active > 0 && (
        <WarningBanner icon={TrendingUp} color="text-accent-green">
          {STATS.active} active opportunities — est. ${STATS.totalEstProfit} total profit
        </WarningBanner>
      )}

      <div className="flex items-center justify-between text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <span className="flex items-center gap-1">
          <AlertTriangle size={9} />
          Profits net of fees & slippage
        </span>
        <span>Scan interval: 500ms</span>
      </div>
    </div>
  )
})

export default ArbScanner
