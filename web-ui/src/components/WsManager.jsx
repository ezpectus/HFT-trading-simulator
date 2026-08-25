import { memo, useMemo, useState, useEffect } from 'react'
import { Wifi, RefreshCw, Activity, Radio, Server, Clock, Zap, AlertTriangle } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

function StatusDot({ connected }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'}`}
      style={{ animation: connected ? 'none' : 'pulse 1.5s infinite' }}
    />
  )
}

function ConnectionCard({ label, icon: Icon, connected, latency, reconnects, nextReconnectIn, onReconnect }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!connected) {
      setElapsed(0)
      const interval = setInterval(() => setElapsed(e => e + 1), 1)
      return () => clearInterval(interval)
    }
  }, [connected])

  const latencyColor = latency == null ? 'text-gray-600'
    : latency < 50 ? 'text-accent-green'
    : latency < 200 ? 'text-accent-yellow'
    : 'text-accent-red'

  return (
    <div className={`p-2 border ${connected ? 'border-bg-600' : 'border-accent-red/30'} bg-bg-700`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className={connected ? 'text-accent-green' : 'text-accent-red'} />
          <span className="text-xs font-medium text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusDot connected={connected} />
          <span className={`text-[10px] ${connected ? 'text-accent-green' : 'text-accent-red'}`}>
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div className="flex flex-col">
          <span className="text-gray-600">Latency</span>
          <span className={latencyColor}>
            {latency != null ? `${latency}ms` : '--'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600">Reconnects</span>
          <span className="text-gray-400">{reconnects ?? 0}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-600">Down Time</span>
          <span className="text-gray-400">{connected ? '0s' : `${elapsed}s`}</span>
        </div>
      </div>

      {!connected && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-accent-yellow flex items-center gap-1">
            <Clock size={9} />
            {nextReconnectIn != null ? `Reconnect in ${nextReconnectIn}s` : 'Waiting...'}
          </span>
          {onReconnect && (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-accent-blue hover:bg-accent-blue/10 transition-colors"
            >
              <RefreshCw size={9} />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const WsManager = memo(function WsManager({ exchange, signals, toasts, addToast }) {
  const [stats, setStats] = useState({ exchangeMsgs: 0, signalMsgs: 0, errors: 0 })

  useEffect(() => {
    if (!exchange?.candles?.length) return
    setStats(prev => ({ ...prev, exchangeMsgs: prev.exchangeMsgs + 1 }))
  }, [exchange?.candles?.length])

  useEffect(() => {
    if (!signals?.signals?.length) return
    setStats(prev => ({ ...prev, signalMsgs: prev.signalMsgs + 1 }))
  }, [signals?.signals?.length])

  const errorToasts = useMemo(() => {
    return (toasts || []).filter(t => t.type === 'error').slice(0, 5)
  }, [toasts])

  const handleReconnect = (label) => {
    addToast?.('info', `${label} reconnect initiated`)
  }

  const exConnected = exchange?.connected ?? false
  const sigConnected = signals?.connected ?? false
  const bothConnected = exConnected && sigConnected

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Wifi size={14} className={bothConnected ? 'text-accent-green' : 'text-accent-yellow'} />
          <span className="text-sm font-medium">WebSocket Manager</span>
        </div>
        <span className={`text-[10px] ${bothConnected ? 'text-accent-green' : 'text-accent-yellow'}`}>
          {bothConnected ? 'All Connected' : 'Partial'}
        </span>
      </div>

      <ConnectionCard
        label="Exchange Simulator"
        icon={Server}
        connected={exConnected}
        latency={exchange?.latency}
        reconnects={exchange?.reconnects}
        nextReconnectIn={exchange?.nextReconnectIn}
        onReconnect={() => handleReconnect('Exchange')}
      />

      <ConnectionCard
        label="AI Signal Bot"
        icon={Radio}
        connected={sigConnected}
        latency={signals?.latency}
        reconnects={signals?.reconnects}
        nextReconnectIn={signals?.nextReconnectIn}
        onReconnect={() => handleReconnect('Signal Bot')}
      />

      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Activity size={11} className="text-accent-blue" />
          <span className="text-[11px] font-medium text-gray-400">Message Stats</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div className="flex flex-col">
            <span className="text-gray-600">Exchange Msgs</span>
            <span className="text-accent-blue">{stats.exchangeMsgs}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-600">Signal Msgs</span>
            <span className="text-accent-purple">{stats.signalMsgs}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-600">Errors</span>
            <span className="text-accent-red">{errorToasts.length}</span>
          </div>
        </div>
      </div>

      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap size={11} className="text-accent-yellow" />
          <span className="text-[11px] font-medium text-gray-400">Trading Status</span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Trading Active</span>
            <span className={exchange?.tradingActive ? 'text-accent-green' : 'text-accent-red'}>
              {exchange?.tradingActive ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Replay Paused</span>
            <span className={exchange?.replayPaused ? 'text-accent-yellow' : 'text-gray-400'}>
              {exchange?.replayPaused ? 'Paused' : 'Running'}
            </span>
          </div>
        </div>
      </div>

      {errorToasts.length > 0 && (
        <div className="p-2 bg-bg-700 border border-accent-red/20">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={11} className="text-accent-red" />
            <span className="text-[11px] font-medium text-gray-400">Recent Errors</span>
          </div>
          <div className="space-y-0.5">
            {errorToasts.map((t, i) => (
              <div key={i} className="text-[10px] text-gray-500 truncate">
                {t.message || t.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {bothConnected && errorToasts.length === 0 && stats.exchangeMsgs === 0 && stats.signalMsgs === 0 && (
        <EmptyState icon={Wifi} title="All connections healthy" subtitle="Waiting for message data..." />
      )}
    </div>
  )
})

export default memo(WsManager)
