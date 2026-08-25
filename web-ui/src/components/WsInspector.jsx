import { memo, useMemo, useState, useEffect, useCallback } from 'react'
import { MessageSquare, Search, Pause, Play, Trash2, ArrowDown, Radio, Server } from 'lucide-react'
import { EmptyState } from './LoadingSkeleton'

const MAX_MESSAGES = 100

const WsInspector = memo(function WsInspector({ exchange, signals }) {
  const [messages, setMessages] = useState([])
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  const addMessage = useCallback((source, data) => {
    if (paused) return
    setMessages(prev => [{
      id: Date.now() + Math.random(),
      source,
      type: data.type || 'unknown',
      symbol: data.symbol || '',
      timestamp: data.timestamp || Date.now() / 1000,
      size: JSON.stringify(data).length,
      preview: JSON.stringify(data).slice(0, 120),
    }, ...prev].slice(0, MAX_MESSAGES))
  }, [paused])

  useEffect(() => {
    if (!exchange?.candles?.length) return
    addMessage('exchange', { type: 'candles', symbol: exchange.candles[0]?.symbol, timestamp: Date.now() / 1000 })
  }, [exchange?.candles?.length, addMessage])

  useEffect(() => {
    if (!signals?.signals?.length) return
    addMessage('signal', { type: 'signal', symbol: signals.signals[0]?.symbol, timestamp: Date.now() / 1000 })
  }, [signals?.signals?.length, addMessage])

  const filtered = useMemo(() => {
    if (!search) return messages
    const q = search.toLowerCase()
    return messages.filter(m =>
      m.type.toLowerCase().includes(q) ||
      m.source.toLowerCase().includes(q) ||
      m.symbol.toLowerCase().includes(q)
    )
  }, [messages, search])

  const stats = useMemo(() => {
    const exchangeMsgs = messages.filter(m => m.source === 'exchange').length
    const signalMsgs = messages.filter(m => m.source === 'signal').length
    const avgSize = messages.length > 0
      ? Math.round(messages.reduce((s, m) => s + m.size, 0) / messages.length)
      : 0
    return { exchangeMsgs, signalMsgs, avgSize, total: messages.length }
  }, [messages])

  const sourceIcon = (source) => source === 'exchange' ? Server : Radio
  const sourceColor = (source) => source === 'exchange' ? 'text-accent-blue' : 'text-accent-purple'

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-accent-blue" />
          <span className="text-sm font-medium">WS Inspector</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused(!paused)}
            className={`p-0.5 transition-colors ${paused ? 'text-accent-yellow' : 'text-gray-500 hover:text-gray-300'}`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-0.5 text-gray-500 hover:text-accent-red transition-colors"
            title="Clear"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-0.5 transition-colors ${autoScroll ? 'text-accent-green' : 'text-gray-600'}`}
            title="Auto-scroll"
          >
            <ArrowDown size={12} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 p-2 bg-bg-700 border border-bg-600">
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Exchange</span>
          <span className="text-[11px] text-accent-blue">{stats.exchangeMsgs}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Signal</span>
          <span className="text-[11px] text-accent-purple">{stats.signalMsgs}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Avg Size</span>
          <span className="text-[11px] text-gray-300">{stats.avgSize}b</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-gray-600">Total</span>
          <span className="text-[11px] text-gray-300">{stats.total}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter messages..."
          className="w-full pl-6 pr-2 py-1 text-[10px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
        />
      </div>

      {/* Message list */}
      <div className="space-y-0.5 max-h-[250px] overflow-y-auto scrollbar-thin">
        {filtered.length > 0 ? (
          filtered.map(msg => {
            const Icon = sourceIcon(msg.source)
            return (
              <div key={msg.id} className="flex items-center gap-1.5 px-1.5 py-1 bg-bg-700 hover:bg-bg-600 transition-colors">
                <Icon size={10} className={sourceColor(msg.source)} />
                <span className="text-[9px] text-gray-600 w-16 shrink-0">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false })}
                </span>
                <span className={`text-[9px] w-16 shrink-0 ${sourceColor(msg.source)}`}>{msg.source}</span>
                <span className="text-[9px] text-gray-400 w-20 shrink-0 truncate">{msg.type}</span>
                {msg.symbol && <span className="text-[9px] text-gray-500 w-16 shrink-0 truncate">{msg.symbol}</span>}
                <span className="text-[9px] text-gray-700 truncate flex-1">{msg.preview}</span>
              </div>
            )
          })
        ) : (
          <EmptyState icon={MessageSquare} title="No messages" subtitle={paused ? "Paused — click play to resume" : "Waiting for WS messages..."} />
        )}
      </div>
    </div>
  )
})

export default WsInspector
