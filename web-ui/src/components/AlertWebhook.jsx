import { useState, useEffect, useCallback } from 'react'
import { Bell, Webhook, Plus, X, Check, TestTube } from 'lucide-react'

const WEBHOOK_KEY = 'trading-sim-webhooks'

const EVENT_TYPES = [
  { id: 'fill', label: 'Order Filled' },
  { id: 'sl_tp', label: 'SL/TP Hit' },
  { id: 'liquidation', label: 'Liquidation' },
  { id: 'price_alert', label: 'Price Alert' },
  { id: 'daily_summary', label: 'Daily Summary' },
]

export default function AlertWebhook({ fills, toasts }) {
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
      console.warn('[AlertWebhook] Failed to load webhooks:', e)
    }
  }, [])

  const saveWebhooks = (list) => {
    setWebhooks(list)
    try { localStorage.setItem(WEBHOOK_KEY, JSON.stringify(list)) } catch (e) {
      console.warn('[AlertWebhook] Failed to save webhooks:', e)
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
    } catch (e) {
      setTestStatus({ ...testStatus, [id]: 'error' })
      setTimeout(() => setTestStatus(s => ({ ...s, [id]: undefined })), 3000)
    }
  }

  const toggleEvent = (eventId) => {
    setNewEvents(prev => prev.includes(eventId) ? prev.filter(e => e !== eventId) : [...prev, eventId])
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Webhook size={12} className="text-accent-blue" />
        Alert Webhooks
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-gray-500 hover:text-accent-blue"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-bg-600/50 rounded p-2 mb-2 space-y-1.5">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Discord #alerts)"
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
          />
          <input
            type="text"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="Webhook URL (https://discord.com/api/webhooks/...)"
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
          {/* Event types */}
          <div className="flex flex-wrap gap-1">
            {EVENT_TYPES.map(ev => (
              <button
                key={ev.id}
                onClick={() => toggleEvent(ev.id)}
                className={'px-1.5 py-0.5 text-[8px] rounded transition-colors ' +
                  (newEvents.includes(ev.id) ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-600 text-gray-500')}
              >
                {ev.label}
              </button>
            ))}
          </div>
          <button
            onClick={addWebhook}
            className="w-full py-1 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
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
            <div key={hook.id} className="bg-bg-600/50 rounded p-1.5 group">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleWebhook(hook.id)}
                  className={'w-3 h-3 rounded-full shrink-0 ' + (hook.enabled ? 'bg-accent-green' : 'bg-bg-500')}
                  title={hook.enabled ? 'Enabled' : 'Disabled'}
                />
                <span className="text-[10px] text-gray-300 flex-1 truncate">{hook.name}</span>
                <button
                  onClick={() => testWebhook(hook.id)}
                  className="text-gray-500 hover:text-accent-blue"
                  title="Send test"
                >
                  {testStatus[hook.id] === 'sending' ? '⏳' :
                   testStatus[hook.id] === 'ok' ? <Check size={10} className="text-accent-green" /> :
                   testStatus[hook.id] === 'error' ? <span className="text-[8px] text-accent-red">!</span> :
                   <TestTube size={10} />}
                </button>
                <button
                  onClick={() => removeWebhook(hook.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {hook.events.map(ev => {
                  const eventLabel = EVENT_TYPES.find(e => e.id === ev)?.label || ev
                  return (
                    <span key={ev} className="px-1 py-0.5 text-[7px] rounded bg-bg-600 text-gray-500">
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
}
