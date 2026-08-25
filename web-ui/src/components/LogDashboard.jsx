import { memo, useMemo, useState } from 'react'
import { ScrollText, Filter, AlertTriangle, Info, XCircle, CheckCircle } from 'lucide-react'
import { StatCard } from '../utils/ui-helpers'

const MOCK_LOGS = [
  { id: 1, ts: '12:45:32', level: 'INFO', source: 'SignalBot', msg: 'Signal generated: BTC/USDT LONG confidence=0.82' },
  { id: 2, ts: '12:45:33', level: 'INFO', source: 'OrderManager', msg: 'Order submitted: BUY 0.5 BTC/USDT @ 44100' },
  { id: 3, ts: '12:45:34', level: 'WARN', source: 'RiskManager', msg: 'Position size exceeds 80% of max limit' },
  { id: 4, ts: '12:45:35', level: 'INFO', source: 'WsClient', msg: 'WebSocket reconnected to binance stream' },
  { id: 5, ts: '12:45:36', level: 'ERROR', source: 'ExchangeClient', msg: 'Order rejected: INSUFFICIENT_BALANCE' },
  { id: 6, ts: '12:45:37', level: 'INFO', source: 'Strategy', msg: 'TrendFollowing: EMA crossover detected for ETH/USDT' },
  { id: 7, ts: '12:45:38', level: 'WARN', source: 'DataCollector', msg: 'Candle gap detected: SOL/USDT 5m timeframe' },
  { id: 8, ts: '12:45:39', level: 'INFO', source: 'SignalBot', msg: 'Signal generated: ETH/USDT SHORT confidence=0.67' },
  { id: 9, ts: '12:45:40', level: 'ERROR', source: 'RiskManager', msg: 'Daily drawdown limit reached: 8.2% > 8.0%' },
  { id: 10, ts: '12:45:41', level: 'INFO', source: 'OrderManager', msg: 'Order filled: BUY 0.5 BTC/USDT @ 44098.5' },
  { id: 11, ts: '12:45:42', level: 'INFO', source: 'Portfolio', msg: 'Rebalance check: 6 positions, $89.2k total exposure' },
  { id: 12, ts: '12:45:43', level: 'WARN', source: 'WsClient', msg: 'Latency spike: 145ms on binance stream' },
  { id: 13, ts: '12:45:44', level: 'INFO', source: 'Strategy', msg: 'MeanReversion: RSI oversold for AVAX/USDT' },
  { id: 14, ts: '12:45:45', level: 'INFO', source: 'SignalBot', msg: 'Signal generated: SOL/USDT LONG confidence=0.71' },
  { id: 15, ts: '12:45:46', level: 'ERROR', source: 'ExchangeClient', msg: 'API rate limit exceeded: 1200/1200 requests' },
]

function levelIcon(level) {
  if (level === 'ERROR') return <XCircle size={10} className="text-accent-red" />
  if (level === 'WARN') return <AlertTriangle size={10} className="text-accent-yellow" />
  return <CheckCircle size={10} className="text-accent-green" />
}

function levelColor(level) {
  if (level === 'ERROR') return 'text-accent-red'
  if (level === 'WARN') return 'text-accent-yellow'
  return 'text-accent-green'
}

const FILTERS = ['ALL', 'INFO', 'WARN', 'ERROR']

const LogDashboard = memo(function LogDashboard() {
  const [filter, setFilter] = useState('ALL')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return MOCK_LOGS
    return MOCK_LOGS.filter(l => l.level === filter)
  }, [filter])

  const counts = useMemo(() => ({
    info: MOCK_LOGS.filter(l => l.level === 'INFO').length,
    warn: MOCK_LOGS.filter(l => l.level === 'WARN').length,
    error: MOCK_LOGS.filter(l => l.level === 'ERROR').length,
  }), [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ScrollText size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">Log Dashboard</span>
        </div>
        <span className="text-[10px] text-gray-600">{filtered.length} entries</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1">
        <StatCard label="Info" value={counts.info} color="text-accent-green" compact />
        <StatCard label="Warnings" value={counts.warn} color="text-accent-yellow" compact />
        <StatCard label="Errors" value={counts.error} color="text-accent-red" compact />
      </div>

      {/* Filter buttons */}
      <div className="flex items-center gap-1">
        <Filter size={10} className="text-gray-600" />
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              filter === f ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div className="bg-bg-900 border border-bg-600 rounded max-h-64 overflow-y-auto">
        {filtered.map(log => (
          <div key={log.id} className="flex items-start gap-1.5 py-0.5 px-2 border-b border-bg-800 hover:bg-bg-800">
            <span className="text-[9px] text-gray-600 font-mono shrink-0 w-16">{log.ts}</span>
            {levelIcon(log.level)}
            <span className={`text-[9px] font-mono shrink-0 w-12 ${levelColor(log.level)}`}>{log.level}</span>
            <span className="text-[9px] text-gray-500 shrink-0 w-24 truncate">{log.source}</span>
            <span className="text-[10px] text-gray-300 truncate flex-1">{log.msg}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[9px] text-gray-600 pt-1 border-t border-bg-600">
        <Info size={9} />
        <span>Showing latest {filtered.length} of {MOCK_LOGS.length} log entries</span>
      </div>
    </div>
  )
})

export default LogDashboard
