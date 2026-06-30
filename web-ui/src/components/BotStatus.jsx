import { Bot, Cpu, Radio, TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react'
import { formatPrice, formatTime, colorForSide } from '../utils/format'

export default function BotStatus({ signals, fills, accounts, signalConnected, exchangeConnected }) {
  // Derive bot activity from signals + fills
  const recentFills = fills.slice(0, 5)
  const recentSignals = signals.slice(0, 5)

  // Count active positions across all exchanges
  let totalPositions = 0
  let totalBalance = 0
  let totalEquity = 0
  let totalPnl = 0
  let totalTrades = 0

  for (const acc of Object.values(accounts || {})) {
    totalPositions += acc.positions?.length || 0
    totalBalance += acc.balance || 0
    totalEquity += acc.equity || 0
    totalPnl += acc.total_pnl || 0
    totalTrades += acc.total_trades || 0
  }

  // Combine signals + fills into activity feed
  const activity = []
  for (const sig of recentSignals) {
    activity.push({
      type: 'signal',
      time: sig.timestamp,
      side: sig.direction,
      symbol: sig.symbol,
      detail: `${sig.confidence?.toFixed(0)}% conf`,
      reason: sig.reason,
    })
  }
  for (const fill of recentFills) {
    if (fill.status === 'FILLED') {
      activity.push({
        type: 'fill',
        time: fill.timestamp,
        side: fill.side,
        symbol: fill.symbol,
        detail: `${fill.filled_quantity} @ $${formatPrice(fill.filled_price)}`,
        exchange: fill.exchange,
      })
    }
  }
  activity.sort((a, b) => b.time - a.time)

  return (
    <div className="p-2 space-y-2">
      {/* Bot status cards */}
      <div className="grid grid-cols-2 gap-2">
        {/* AI Signal Bot */}
        <div className={`bg-bg-700 rounded-lg p-2.5 ${signalConnected ? 'ring-1 ring-accent-green/30' : 'ring-1 ring-accent-red/30'}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bot size={14} className={signalConnected ? 'text-accent-green' : 'text-accent-red'} />
            <span className="text-xs font-medium">AI Signal Bot</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={signalConnected ? 'text-accent-green' : 'text-accent-red'}>
                {signalConnected ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Signals sent</span>
              <span className="text-gray-300 font-mono">{signals.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Port</span>
              <span className="text-gray-400 font-mono">8766</span>
            </div>
          </div>
        </div>

        {/* HFT Trade Bot */}
        <div className={`bg-bg-700 rounded-lg p-2.5 ${exchangeConnected ? 'ring-1 ring-accent-green/30' : 'ring-1 ring-accent-red/30'}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Cpu size={14} className={exchangeConnected ? 'text-accent-green' : 'text-accent-red'} />
            <span className="text-xs font-medium">HFT Trade Bot</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={exchangeConnected ? 'text-accent-green' : 'text-accent-red'}>
                {exchangeConnected ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fills</span>
              <span className="text-gray-300 font-mono">{fills.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Port</span>
              <span className="text-gray-400 font-mono">8765</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="text-[10px] text-gray-500 uppercase mb-1.5">Portfolio Overview</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500 text-[10px]">Balance</div>
            <div className="font-mono text-gray-200">${formatPrice(totalBalance)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Equity</div>
            <div className="font-mono text-gray-200">${formatPrice(totalEquity)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">PnL</div>
            <div className={`font-mono ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{formatPrice(totalPnl)}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Positions</div>
            <div className="font-mono text-accent-blue">{totalPositions}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Trades</div>
            <div className="font-mono text-gray-300">{totalTrades}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px]">Exchanges</div>
            <div className="font-mono text-gray-300">{Object.keys(accounts || {}).length}</div>
          </div>
        </div>
      </div>

      {/* Combined activity feed */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-1 px-1 flex items-center gap-1">
          <Activity size={12} />
          Bot Activity
        </div>
        {!activity.length ? (
          <div className="text-center text-gray-500 text-xs py-4">
            <Zap size={18} className="mx-auto mb-1 opacity-50" />
            Waiting for bot activity...
          </div>
        ) : (
          <div className="space-y-1">
            {activity.slice(0, 15).map((item, i) => {
              const isSignal = item.type === 'signal'
              const isLong = item.side === 'LONG' || item.side === 'BUY'
              const isShort = item.side === 'SHORT' || item.side === 'SELL'
              const Icon = isSignal ? Radio : isLong ? TrendingUp : TrendingDown

              return (
                <div key={i} className="bg-bg-700 rounded p-2 text-xs flex items-center gap-2">
                  <Icon size={12} className={colorForSide(item.side)} />
                  <span className={`font-semibold ${colorForSide(item.side)}`}>
                    {item.side}
                  </span>
                  <span className="text-gray-300">{item.symbol}</span>
                  <span className="text-gray-500 text-[10px] flex-1 truncate">{item.detail}</span>
                  <span className="text-gray-600 text-[10px]">{formatTime(item.time)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
