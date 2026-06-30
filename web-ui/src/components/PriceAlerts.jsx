import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, BellRing, Plus, X, TrendingUp, TrendingDown, Volume2, VolumeX } from 'lucide-react'
import { formatPrice } from '../utils/format'

export default function PriceAlerts({ currentPrice, symbol, exchange, onAlert }) {
  const [alerts, setAlerts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [direction, setDirection] = useState('above')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const triggeredRef = useRef(new Set())
  const audioCtxRef = useRef(null)

  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const now = ctx.currentTime
      // Two-tone beep
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = i === 0 ? 880 : 660
        osc.type = 'sine'
        gain.gain.setValueAtTime(0, now + i * 0.15)
        gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.12)
        osc.start(now + i * 0.15)
        osc.stop(now + i * 0.15 + 0.12)
      }
    } catch (e) {
      console.warn('[PriceAlerts] Sound playback failed:', e)
    }
  }, [soundEnabled])

  // Check alerts against current price
  useEffect(() => {
    if (!currentPrice) return
    for (const alert of alerts) {
      if (triggeredRef.current.has(alert.id)) continue
      const hit = alert.direction === 'above'
        ? currentPrice >= alert.threshold
        : currentPrice <= alert.threshold
      if (hit) {
        triggeredRef.current.add(alert.id)
        playAlertSound()
        onAlert(alert)
      }
    }
  }, [currentPrice, alerts, onAlert])

  // Clean up triggered alerts for removed ones
  useEffect(() => {
    const validIds = new Set(alerts.map(a => a.id))
    for (const id of triggeredRef.current) {
      if (!validIds.has(id)) triggeredRef.current.delete(id)
    }
  }, [alerts])

  const addAlert = () => {
    const t = parseFloat(threshold)
    if (isNaN(t) || t <= 0) return
    const id = Date.now() + Math.random()
    setAlerts(prev => [...prev, {
      id,
      threshold: t,
      direction,
      symbol,
      exchange,
      created: Date.now(),
    }])
    setThreshold('')
    setShowForm(false)
  }

  const removeAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
    triggeredRef.current.delete(id)
  }

  const activeAlerts = alerts.filter(a => !triggeredRef.current.has(a.id))
  const triggeredAlerts = alerts.filter(a => triggeredRef.current.has(a.id))

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
          <BellRing size={12} className="text-accent-yellow" />
          Price Alerts
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
          >
            <Plus size={10} />
            Add
          </button>
        </div>
      </div>

      {/* Add alert form */}
      {showForm && (
        <div className="mb-2 p-2 bg-bg-800 rounded space-y-1.5">
          <div className="text-[10px] text-gray-500">
            Alert when {symbol} on {exchange} goes:
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setDirection('above')}
              className={'flex-1 py-1 text-[10px] rounded ' + (direction === 'above' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-500')}
            >
              <TrendingUp size={10} className="inline mr-0.5" />
              Above
            </button>
            <button
              onClick={() => setDirection('below')}
              className={'flex-1 py-1 text-[10px] rounded ' + (direction === 'below' ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-600 text-gray-500')}
            >
              <TrendingDown size={10} className="inline mr-0.5" />
              Below
            </button>
          </div>
          <input
            type="number"
            step="0.01"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            placeholder={currentPrice ? formatPrice(currentPrice) : 'Price...'}
            className="w-full px-2 py-1 text-xs bg-bg-600 rounded border border-bg-500 text-gray-200 focus:outline-none focus:border-accent-blue"
            autoFocus
          />
          <button
            onClick={addAlert}
            className="w-full py-1 text-[10px] rounded bg-accent-blue text-white hover:bg-blue-600 transition-colors"
          >
            Set Alert
          </button>
        </div>
      )}

      {/* Active alerts */}
      {activeAlerts.length === 0 && triggeredAlerts.length === 0 ? (
        <div className="text-center text-gray-600 text-[10px] py-2">
          <Bell size={16} className="mx-auto mb-1 opacity-30" />
          No alerts set
        </div>
      ) : (
        <div className="space-y-1">
          {activeAlerts.map(alert => {
            const distance = Math.abs(currentPrice - alert.threshold)
            const distancePct = currentPrice > 0 ? (distance / currentPrice * 100) : 0
            const isAbove = alert.direction === 'above'
            return (
              <div key={alert.id} className="flex items-center gap-1.5 text-[10px] bg-bg-800 rounded px-2 py-1">
                {isAbove ? (
                  <TrendingUp size={10} className="text-accent-green shrink-0" />
                ) : (
                  <TrendingDown size={10} className="text-accent-red shrink-0" />
                )}
                <span className="text-gray-400">{isAbove ? '≥' : '≤'}</span>
                <span className="font-mono text-gray-200">${formatPrice(alert.threshold)}</span>
                <span className="text-gray-600 flex-1 truncate">
                  {distancePct.toFixed(2)}% away
                </span>
                <button
                  onClick={() => removeAlert(alert.id)}
                  className="text-gray-600 hover:text-accent-red shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}

          {/* Triggered alerts */}
          {triggeredAlerts.map(alert => (
            <div key={alert.id} className="flex items-center gap-1.5 text-[10px] bg-accent-yellow/10 rounded px-2 py-1 ring-1 ring-accent-yellow/20">
              <BellRing size={10} className="text-accent-yellow shrink-0 animate-pulse" />
              <span className="font-mono text-accent-yellow">${formatPrice(alert.threshold)}</span>
              <span className="text-gray-500 flex-1">Triggered!</span>
              <button
                onClick={() => removeAlert(alert.id)}
                className="text-gray-600 hover:text-accent-red shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
