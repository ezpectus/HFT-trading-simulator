import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { Webhook, Plus, X, Check, TestTube } from 'lucide-react'

const IS_DEV = import.meta.env?.DEV ?? false

const WEBHOOK_KEY = 'trading-sim-webhooks'

const EVENT_TYPES = [
  { id: 'fill', label: 'Order Filled' },
  { id: 'sl_tp', label: 'SL/TP Hit' },
  { id: 'liquidation', label: 'Liquidation' },
  { id: 'price_alert', label: 'Price Alert' },
  { id: 'daily_summary', label: 'Daily Summary' },
]

export default memo(function AlertWebhook({ fills, toasts }) {
  const [webhooks, setWebhooks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newName, setNewName] = useState('')
  const [newEvents, setNewEvents] = useState(['fill'])
  const [testStatus, setTestStatus] = useState({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WEBHOOK_KEY)
      if (saved) setWebhooks(JSON.parse(saved))
    } catch (e) {
      if (IS_DEV) console.warn('[AlertWebhook] Failed to load webhooks:', e)
    }
  }, [])

  const saveWebhooks = (list) => {
    setWebhooks(list)
    try { localStorage.setItem(WEBHOOK_KEY, JSON.stringify(list)) } catch (e) {
      if (IS_DEV) console.warn('[AlertWebhook] Failed to save webhooks:', e)
    }
  }

  const addWebhook = () => {
    if (!newUrl.trim()) return
    const entry = {
      id: Date.now(),
      name: newName || 'Webhook',
      url: newUrl.trim(),
      events: newEvents,
      enabled: true,
    }
    saveWebhooks([...webhooks, entry])
    setNewUrl('')
    setNewName('')
    setNewEvents(['fill'])
    setShowAdd(false)
  }

  const removeWebhook = (id) => {
    saveWebhooks(webhooks.filter(w => w.id !== id))
  }

  const toggleWebhook = (id) => {
    saveWebhooks(webhooks.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w))
  }

  const testWebhook = async (id) => {
    const hook = webhooks.find(w => w.id === id)
    if (!hook) return
    setTestStatus({ ...testStatus, [id]: 'sending' })
    try {
      await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Test alert from Trading System Lite — webhook "${hook.name}" is working!`,
          username: 'Trading Sim',
        }),
      })
      setTestStatus({ ...testStatus, [id]: 'ok' })
      setTimeout(() => setTestStatus(s => ({ ...s, [id]: undefined })), 3000)
    } catch {
      setTestStatus({ ...testStatus, [id]: 'error' })
      setTimeout(() => setTestStatus(s => ({ ...s, [id]: undefined })), 3000)
    }
  }

  // ---- real dispatcher — fills/toasts were accepted and ignored ----
  const webhooksRef = useRef([])
  webhooksRef.current = webhooks

  const dispatch = useCallback((event, text) => {
    for (const hook of webhooksRef.current) {
      if (!hook.enabled || !hook.events.includes(event)) continue
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, username: 'Trading Sim' }),
      }).catch(() => { /* fire-and-forget: endpoint down ≠ UI error */ })
    }
  }, [])

  const seenFillsRef = useRef(null)
  const dayFillsRef = useRef({ date: '', count: 0, notional: 0 })
  useEffect(() => {
    if (!Array.isArray(fills)) return
    // First run marks the pre-existing fill list as seen — those are history,
    // not new events; alerting on them would spam hooks on every page load.
    if (seenFillsRef.current === null) {
      seenFillsRef.current = new Set(fills.map(f => f.id ?? JSON.stringify(f)))
      return
    }
    for (const f of fills) {
      const key = f.id ?? JSON.stringify(f)
      if (seenFillsRef.current.has(key)) continue
      seenFillsRef.current.add(key)
      if (f.status && f.status !== 'FILLED') continue
      const today = new Date().toISOString().slice(0, 10)
      if (dayFillsRef.current.date !== today) dayFillsRef.current = { date: today, count: 0, notional: 0 }
      dayFillsRef.current.count += 1
      dayFillsRef.current.notional += (f.filled_price ?? 0) * (f.filled_quantity ?? 0)
      const reason = f.close_reason || ''
      const event = /LIQUIDATION/i.test(reason) ? 'liquidation'
        : (reason || f.order_type === 'TRAILING_STOP') ? 'sl_tp' : 'fill'
      dispatch(event,
        `${event === 'fill' ? 'Order filled' : event === 'sl_tp' ? 'SL/TP hit' : 'LIQUIDATION'}: ${f.side || ''} ${f.filled_quantity ?? f.quantity ?? ''} ${f.symbol || ''} @ ${f.filled_price ?? f.price ?? '?'} (${f.exchange || ''})`)
    }
    // cap the dedup set
    if (seenFillsRef.current.size > 500) seenFillsRef.current = new Set([...seenFillsRef.current].slice(-200))

  }, [fills, dispatch])

  const seenToastsRef = useRef(new Set())
  useEffect(() => {
    if (!Array.isArray(toasts)) return
    for (const t of toasts) {
      if (seenToastsRef.current.has(t.id)) continue
      seenToastsRef.current.add(t.id)
      if (typeof t.message === 'string' && t.message.startsWith('Price Alert Triggered')) {
        dispatch('price_alert', t.message)
      }
    }
  }, [toasts, dispatch])

  // Daily summary at UTC midnight — count + notional accumulated above in
  // the new-fill loop.
  useEffect(() => {
    const timer = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10)
      const day = dayFillsRef.current
      if (day.date && day.date !== today && day.count > 0) {
        dispatch('daily_summary',
          `Daily summary ${day.date}: ${day.count} fills, notional ~${day.notional.toFixed(2)}`)
        dayFillsRef.current = { date: today, count: 0, notional: 0 }
      }
    }, 60000)
    return () => clearInterval(timer)
  }, [dispatch])

  const toggleEvent = (eventId) => {
    setNewEvents(prev => prev.includes(eventId) ? prev.filter(e => e !== eventId) : [...prev, eventId])
  }

  return (
    <div className="bg-bg-700  p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Webhook size={12} className="text-accent-blue" />
        Alert Webhooks
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(!showAdd)}
          aria-label="Add new webhook"
          className="text-gray-500 hover:text-accent-blue"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-bg-600/50  p-2 mb-2 space-y-1.5">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Discord #alerts)"
            className="w-full bg-bg-800 border border-bg-600  px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
          />
          <input
            type="text"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="Webhook URL (https://discord.com/api/webhooks/...)"
            className="w-full bg-bg-800 border border-bg-600  px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
          {/* Event types */}
          <div className="flex flex-wrap gap-1">
            {EVENT_TYPES.map(ev => (
              <button
                key={ev.id}
                onClick={() => toggleEvent(ev.id)}
                className={'px-1.5 py-0.5 text-[8px]  transition-colors ' +
                  (newEvents.includes(ev.id) ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-600 text-gray-500')}
              >
                {ev.label}
              </button>
            ))}
          </div>
          <button
            onClick={addWebhook}
            className="w-full py-1 text-[10px]  bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
          >
            Add Webhook
          </button>
        </div>
      )}

      {/* Webhook list */}
      {webhooks.length === 0 && !showAdd ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">
          No webhooks configured
        </div>
      ) : (
        <div className="space-y-1">
          {webhooks.map(hook => (
            <div key={hook.id} className="bg-bg-600/50  p-1.5 group">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleWebhook(hook.id)}
                  aria-label={`${hook.enabled ? 'Disable' : 'Enable'} webhook ${hook.name}`}
                  className={`w-3 h-3 rounded-full shrink-0 ${hook.enabled ? 'bg-accent-green' : 'bg-bg-500'}`}
                  title={hook.enabled ? 'Enabled' : 'Disabled'}
                />
                <span className="text-[10px] text-gray-300 flex-1 truncate">{hook.name}</span>
                <button
                  onClick={() => testWebhook(hook.id)}
                  className="text-gray-500 hover:text-accent-blue"
                  title="Send test"
                >
                  {(() => {
                    const s = testStatus[hook.id]
                    if (s === 'sending') return '⏳'
                    if (s === 'ok') return <Check size={10} className="text-accent-green" />
                    if (s === 'error') return <span className="text-[8px] text-accent-red">!</span>
                    return <TestTube size={10} />
                  })()}
                </button>
                <button
                  onClick={() => removeWebhook(hook.id)}
                  aria-label={`Remove webhook ${hook.name}`}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {hook.events.map(ev => {
                  const eventLabel = EVENT_TYPES.find(e => e.id === ev)?.label || ev
                  return (
                    <span key={ev} className="px-1 py-0.5 text-[7px]  bg-bg-600 text-gray-500">
                      {eventLabel}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Discord/Telegram webhooks. Click test to verify. Persist in localStorage.
      </div>
    </div>
  )
})
