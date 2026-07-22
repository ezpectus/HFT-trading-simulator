import { Clock, CandlestickChart, Bot, Activity, Wifi, Percent, Flame, Moon, DollarSign, ShieldAlert, ShieldCheck } from 'lucide-react'
import { formatTime } from '../utils/format'

export default function StatusBar({ exchange, signals, selectedExchange, selectedSymbol, candleCount, exchangeLatency, signalLatency }) {
  const totalPositions = Object.values(exchange.accounts || {}).reduce(
    (s, a) => s + Object.keys(a.positions || {}).length, 0
  )
  const totalTrades = Object.values(exchange.accounts || {}).reduce(
    (s, a) => s + (a.total_trades || 0), 0
  )
  const totalBalance = Object.values(exchange.accounts || {}).reduce(
    (s, a) => s + (a.balance || 0), 0
  )
  const totalPnl = Object.values(exchange.accounts || {}).reduce(
    (s, a) => s + (a.unrealized_pnl || 0), 0
  )

  const pnlBreakdown = Object.entries(exchange.accounts || {})
    .map(([id, a]) => `${id}: $${(a.unrealized_pnl || 0).toFixed(2)} (${Object.keys(a.positions || {}).length} pos)`)
    .join('\n')

  const simTime = exchange.candles.length > 0
    ? exchange.candles[exchange.candles.length - 1].timestamp
    : null

  const fundingRate = exchange.fundingRates?.[selectedExchange]
  const candlesToFunding = exchange.candlesToFunding

  return (
    <footer className="flex items-center gap-2 px-2 py-1 bg-bg-800 border-t border-bg-600 text-[10px] text-gray-500 shrink-0 font-mono overflow-x-auto scrollbar-thin sm:gap-4 sm:px-3" role="contentinfo" aria-label="System status bar">
      {/* Sim time */}
      <div className="flex items-center gap-1" aria-label={`Simulation time: ${simTime ? formatTime(simTime) : 'not available'}`}>
        <Clock size={11} aria-hidden="true" />
        <span>{simTime ? formatTime(simTime) : '--:--:--'}</span>
      </div>

      <div className="w-px h-3 bg-bg-600" />

      {/* Candles */}
      <div className="flex items-center gap-1" aria-label={`${candleCount} candles generated`}>
        <CandlestickChart size={11} aria-hidden="true" />
        <span>{candleCount} candles</span>
      </div>

      <div className="w-px h-3 bg-bg-600" />

      {/* Selected market */}
      <div className="flex items-center gap-1" aria-label={`Selected market: ${selectedExchange} ${selectedSymbol}`}>
        <span className="text-gray-400 capitalize">{selectedExchange}</span>
        <span>·</span>
        <span className="text-gray-400">{selectedSymbol}</span>
      </div>

      {/* Funding rate */}
      {fundingRate != null && (
        <>
          <div className="w-px h-3 bg-bg-600" />
          <div className="flex items-center gap-1" title={`Funding rate for ${selectedExchange}`}>
            <Percent size={11} />
            <span className={fundingRate >= 0 ? 'text-accent-green' : 'text-accent-red'}>
              {(fundingRate * 100).toFixed(4)}%
            </span>
            {candlesToFunding != null && (
              <span className="text-gray-600">({candlesToFunding}c)</span>
            )}
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* Bot activity */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Bot size={11} className={signals.connected ? 'text-accent-green' : 'text-gray-600'} />
          <span>AI: {signals.signals.length} sigs</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity size={11} className={exchange.connected ? 'text-accent-green' : 'text-gray-600'} />
          <span>{exchange.fills.length} fills</span>
        </div>
      </div>

      {/* Circuit breaker status */}
      {signals.circuitBreaker?.tripped && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent-red/20 text-accent-red" title={`Circuit breaker tripped (${signals.circuitBreaker.consecutiveLosses} consecutive losses)`}>
          <ShieldAlert size={11} />
          <span className="text-[10px] font-medium">CB TRIPPED</span>
        </div>
      )}
      {signals.circuitBreaker && !signals.circuitBreaker.tripped && signals.circuitBreaker.consecutiveLosses > 0 && (
        <div className="flex items-center gap-1 text-accent-yellow" title={`Circuit breaker warming: ${signals.circuitBreaker.consecutiveLosses} consecutive losses`}>
          <ShieldCheck size={11} />
          <span className="text-[10px]">CB:{signals.circuitBreaker.consecutiveLosses}</span>
        </div>
      )}

      <div className="w-px h-3 bg-bg-600" />

      {/* News event indicator */}
      {exchange.newsEvent && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-red/20 text-accent-red animate-pulse">
          <Flame size={11} />
          <span className="text-[10px] font-medium">
            NEWS: {exchange.newsEvent.symbol} {exchange.newsEvent.intensity}x vol ({exchange.newsEvent.remaining}c)
          </span>
        </div>
      )}

      {/* Weekend mode indicator */}
      {exchange.weekendMode && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-600 text-gray-400">
          <Moon size={11} />
          <span className="text-[10px] font-medium">Weekend (low vol)</span>
        </div>
      )}

      {/* Portfolio */}
      <div className="flex items-center gap-3">
        <span>Pos: <span className="text-gray-400">{totalPositions}</span></span>
        <span>Trades: <span className="text-gray-400">{totalTrades}</span></span>
        <span>Balance: <span className="text-gray-300">${(totalBalance || 0).toFixed(0)}</span></span>
        {totalPnl !== 0 && (
          <span className="flex items-center gap-0.5" title={pnlBreakdown || undefined}>
            <DollarSign size={10} className={totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'} />
            <span className={totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      <div className="w-px h-3 bg-bg-600" />

      {/* Connection dots + latency */}
      <div className="flex items-center gap-2">
        {exchange.reconnects > 0 && (
          <span className="text-[9px] text-accent-yellow" title="WebSocket reconnections">
            ↻{exchange.reconnects}
          </span>
        )}
        {(() => {
          const exConn = exchange.connected
          const aiConn = signals.connected
          const bothConnected = exConn && aiConn
          const worstLatency = Math.max(exchangeLatency || 0, signalLatency || 0)
          const quality = !bothConnected ? 'offline' : worstLatency < 50 ? 'excellent' : worstLatency < 200 ? 'good' : 'poor'
          const qualityColor = quality === 'offline' ? 'text-accent-red' : quality === 'excellent' ? 'text-accent-green' : quality === 'good' ? 'text-accent-yellow' : 'text-accent-red'
          const qualityLabel = quality === 'offline' ? 'OFFLINE' : quality === 'excellent' ? 'EXCELLENT' : quality === 'good' ? 'GOOD' : 'POOR'
          return (
            <span className={`text-[9px] font-medium ${qualityColor}`} title={`Connection quality: ${qualityLabel}`}>
              {qualityLabel}
            </span>
          )
        })()}
        <div className="flex items-center gap-1">
          <Wifi size={10} className={exchange.connected ? 'text-accent-green' : 'text-accent-red'} />
          <span>EX</span>
          {exchangeLatency != null && exchange.connected && (
            <span className={
              exchangeLatency < 50 ? 'text-accent-green' :
              exchangeLatency < 200 ? 'text-accent-yellow' : 'text-accent-red'
            }>
              {exchangeLatency}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Wifi size={10} className={signals.connected ? 'text-accent-green' : 'text-gray-600'} />
          <span>AI</span>
          {signalLatency != null && signals.connected && (
            <span className={
              signalLatency < 50 ? 'text-accent-green' :
              signalLatency < 200 ? 'text-accent-yellow' : 'text-accent-red'
            }>
              {signalLatency}ms
            </span>
          )}
        </div>
      </div>
    </footer>
  )
}
