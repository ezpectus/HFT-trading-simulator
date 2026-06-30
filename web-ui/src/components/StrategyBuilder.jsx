import { useState, useEffect } from 'react'
import { FlaskConical, Plus, X, Play, Save } from 'lucide-react'

const CONDITIONS = [
  { id: 'price_above', label: 'Price above', param: 'value', unit: '$' },
  { id: 'price_below', label: 'Price below', param: 'value', unit: '$' },
  { id: 'rsi_above', label: 'RSI above', param: 'value', unit: '' },
  { id: 'rsi_below', label: 'RSI below', param: 'value', unit: '' },
  { id: 'ema_cross_up', label: 'EMA fast crosses above slow', param: 'none', unit: '' },
  { id: 'ema_cross_down', label: 'EMA fast crosses below slow', param: 'none', unit: '' },
  { id: 'volume_spike', label: 'Volume spike >', param: 'multiplier', unit: 'x avg' },
  { id: 'price_change_5', label: '5-candle change >', param: 'percent', unit: '%' },
]

const ACTIONS = [
  { id: 'buy', label: 'BUY', color: 'text-accent-green' },
  { id: 'sell', label: 'SELL', color: 'text-accent-red' },
  { id: 'close_all', label: 'CLOSE ALL', color: 'text-accent-yellow' },
  { id: 'alert', label: 'ALERT', color: 'text-accent-blue' },
]

const SAVED_KEY = 'trading-sim-strategies'

export default function StrategyBuilder({ currentPrice }) {
  const [rules, setRules] = useState([
    { id: Date.now(), condition: 'rsi_below', value: 30, action: 'buy', qty: 0.1 }
  ])
  const [savedStrategies, setSavedStrategies] = useState([])
  const [name, setName] = useState('My Strategy')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_KEY)
      if (saved) setSavedStrategies(JSON.parse(saved))
    } catch (e) {
      console.warn('[StrategyBuilder] Failed to load strategies:', e)
    }
  }, [])

  const addRule = () => {
    setRules([...rules, { id: Date.now(), condition: 'price_above', value: currentPrice || 65000, action: 'sell', qty: 0.1 }])
  }

  const removeRule = (id) => {
    setRules(rules.filter(r => r.id !== id))
  }

  const updateRule = (id, field, value) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const saveStrategy = () => {
    const entry = { id: Date.now(), name, rules, timestamp: new Date().toISOString() }
    const next = [...savedStrategies, entry].slice(-10)
    setSavedStrategies(next)
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)) } catch (e) {
      console.warn('[StrategyBuilder] Failed to save strategy:', e)
    }
  }

  const loadStrategy = (id) => {
    const s = savedStrategies.find(s => s.id === id)
    if (s) {
      setRules(s.rules)
      setName(s.name)
    }
  }

  const deleteStrategy = (id) => {
    const next = savedStrategies.filter(s => s.id !== id)
    setSavedStrategies(next)
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)) } catch (e) {
      console.warn('[StrategyBuilder] Failed to delete strategy:', e)
    }
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <FlaskConical size={12} className="text-accent-purple" />
        Strategy Builder
      </div>

      {/* Strategy name */}
      <div className="flex gap-1 mb-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple"
          placeholder="Strategy name"
        />
        <button
          onClick={saveStrategy}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-accent-purple/20 text-accent-purple hover:bg-accent-purple/30"
        >
          <Save size={10} />
          Save
        </button>
      </div>

      {/* Rules */}
      <div className="space-y-1.5 mb-2">
        {rules.map((rule, i) => {
          const cond = CONDITIONS.find(c => c.id === rule.condition)
          return (
            <div key={rule.id} className="bg-bg-600/50 rounded p-1.5">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[8px] text-gray-600 font-mono">#{i + 1}</span>
                <span className="text-[8px] text-gray-500">IF</span>
                <select
                  value={rule.condition}
                  onChange={e => updateRule(rule.id, 'condition', e.target.value)}
                  className="flex-1 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 outline-none"
                >
                  {CONDITIONS.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <button onClick={() => removeRule(rule.id)} className="text-gray-600 hover:text-accent-red">
                  <X size={10} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                {cond?.param !== 'none' && (
                  <input
                    type="number"
                    step="0.1"
                    value={rule.value}
                    onChange={e => updateRule(rule.id, 'value', Number(e.target.value))}
                    className="w-16 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none"
                  />
                )}
                {cond?.unit && <span className="text-[8px] text-gray-600">{cond.unit}</span>}
                <span className="text-[8px] text-gray-500 ml-auto">THEN</span>
                <select
                  value={rule.action}
                  onChange={e => updateRule(rule.id, 'action', e.target.value)}
                  className="bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] outline-none"
                >
                  {ACTIONS.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                {(rule.action === 'buy' || rule.action === 'sell') && (
                  <input
                    type="number"
                    step="0.01"
                    value={rule.qty}
                    onChange={e => updateRule(rule.id, 'qty', Number(e.target.value))}
                    className="w-12 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[9px] text-gray-200 font-mono outline-none"
                    title="Quantity"
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add rule button */}
      <button
        onClick={addRule}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 transition-colors mb-2"
      >
        <Plus size={10} />
        Add Rule
      </button>

      {/* Saved strategies */}
      {savedStrategies.length > 0 && (
        <div className="border-t border-bg-600 pt-2">
          <div className="text-[8px] text-gray-600 uppercase mb-1">Saved Strategies</div>
          <div className="space-y-0.5 max-h-[80px] overflow-y-auto scrollbar-thin">
            {savedStrategies.map(s => (
              <div key={s.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-bg-600/50 group">
                <button
                  onClick={() => loadStrategy(s.id)}
                  className="flex-1 text-left text-[9px] text-gray-400 hover:text-gray-200"
                >
                  {s.name} <span className="text-gray-600">({s.rules.length} rules)</span>
                </button>
                <button
                  onClick={() => deleteStrategy(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red"
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
