import { memo, useMemo } from 'react'
import { Search, Zap, TrendingUp, AlertTriangle } from 'lucide-react'
import { statusColor, statusBg, StatCard, Label } from '../utils/ui-helpers'

const MOCK_OPPORTUNITIES = [
  { id: 1, type: 'Triangular', path: 'BTC → ETH → USDT → BTC', profit: 0.85, capital: 10000, estProfit: 85, latency: 120, confidence: 0.92, status: 'active' },
  { id: 2, type: 'Cross-Exchange', path: 'BTC: Binance → OKX', profit: 0.32, capital: 50000, estProfit: 160, latency: 85, confidence: 0.85, status: 'active' },
  { id: 3, type: 'Funding', path: 'BTC Perp: Binance (0.012%)', profit: 0.45, capital: 100000, estProfit: 450, latency: 0, confidence: 0.78, status: 'active' },
  { id: 4, type: 'Triangular', path: 'ETH → SOL → USDT → ETH', profit: 0.28, capital: 25000, estProfit: 70, latency: 95, confidence: 0.75, status: 'active' },
  { id: 5, type: 'Cross-Exchange', path: 'SOL: Bybit → Binance', profit: 0.15, capital: 30000, estProfit: 45, latency: 110, confidence: 0.65, status: 'fading' },
  { id: 6, type: 'Statistical', path: 'BTC-ETH spread z=2.5', profit: 1.20, capital: 20000, estProfit: 240, latency: 0, confidence: 0.82, status: 'active' },
  { id: 7, type: 'Triangular', path: 'AVAX → LINK → USDT → AVAX', profit: 0.12, capital: 15000, estProfit: 18, latency: 150, confidence: 0.55, status: 'fading' },
  { id: 8, type: 'Cross-Exchange', path: 'ETH: OKX → Bybit', profit: 0.08, capital: 40000, estProfit: 32, latency: 90, confidence: 0.48, status: 'closing' },
]

const STATUS_COLOR_MAP = { active: 'text-accent-green', fading: 'text-accent-yellow', closing: 'text-accent-red', default: 'text-gray-400' }
const STATUS_BG_MAP = { active: 'bg-accent-green/20', fading: 'bg-accent-yellow/20', closing: 'bg-accent-red/20', default: 'bg-gray-600/20' }

const MOCK_SCAN_STATS = [
  { exchange: 'Binance', opps: 12, avgProfit: 0.42, scanned: 450 },
  { exchange: 'OKX', opps: 8, avgProfit: 0.35, scanned: 380 },
  { exchange: 'Bybit', opps: 5, avgProfit: 0.28, scanned: 320 },
]

const ArbScanner = memo(function ArbScanner() {
  const stats = useMemo(() => {
    const active = MOCK_OPPORTUNITIES.filter(o => o.status === 'active').length
    const totalEstProfit = MOCK_OPPORTUNITIES.filter(o => o.status === 'active').reduce((s, o) => s + o.estProfit, 0)
    const avgProfit = MOCK_OPPORTUNITIES.reduce((s, o) => s + o.profit, 0) / MOCK_OPPORTUNITIES.length
    const best = MOCK_OPPORTUNITIES.reduce((max, o) => o.profit > max.profit ? o : max, MOCK_OPPORTUNITIES[0])
    return { active, totalEstProfit, avgProfit, best }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Search size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Arbitrage Scanner</span>
        </div>
        <span className="text-[10px] text-gray-600">{stats.active} active</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Active" value={stats.active} color="text-accent-green" />
        <StatCard label="Est Profit" value={`$${stats.totalEstProfit}`} color="text-accent-green" />
        <StatCard label="Avg Spread" value={`${stats.avgProfit.toFixed(2)}%`} color="text-gray-300" />
        <StatCard label="Best" value={`${stats.best.profit.toFixed(2)}%`} color="text-accent-yellow" />
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
              <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden">
                <div className="h-full bg-accent-blue opacity-70" style={{ width: `${(e.opps / 12) * 100}%` }} />
              </div>
              <span className="text-[9px] text-gray-600 w-12 text-right">{e.scanned} scans</span>
            </div>
          ))}
        </div>
      </div>

      {stats.active > 0 && (
        <div className="flex items-center gap-1.5 p-1.5 bg-accent-green/10 border border-accent-green/30">
          <TrendingUp size={11} className="text-accent-green" />
          <span className="text-[10px] text-accent-green">
            {stats.active} active opportunities — est. ${stats.totalEstProfit} total profit
          </span>
        </div>
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
