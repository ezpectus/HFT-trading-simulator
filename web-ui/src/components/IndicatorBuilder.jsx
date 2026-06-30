import { useState, useMemo } from 'react'
import { Plus, X, LineChart, Settings2 } from 'lucide-react'
import { calcSMA, calcEMA, calcRSI, calcBollingerBands } from '../utils/indicators'

const INDICATOR_DEFS = [
  { id: 'sma', label: 'SMA', fn: calcSMA, params: [{ id: 'period', label: 'Period', default: 20, min: 2, max: 200 }], color: '#3b82f6' },
  { id: 'ema', label: 'EMA', fn: calcEMA, params: [{ id: 'period', label: 'Period', default: 12, min: 2, max: 200 }], color: '#8b5cf6' },
  { id: 'rsi', label: 'RSI', fn: calcRSI, params: [{ id: 'period', label: 'Period', default: 14, min: 2, max: 100 }], color: '#f59e0b' },
  { id: 'bb', label: 'Bollinger', fn: calcBollingerBands, params: [
    { id: 'period', label: 'Period', default: 20, min: 5, max: 100 },
    { id: 'stdDev', label: 'Std Dev', default: 2, min: 0.5, max: 4, step: 0.5 },
  ], color: '#10b981' },
]

export default function IndicatorBuilder({ candles, onIndicatorsChange }) {
  const [indicators, setIndicators] = useState([])
  const [showAdd, setShowAdd] = useState(false)

  const computed = useMemo(() => {
    const closes = candles.map(c => c.close)
    const times = candles.map(c => c.time)
    const results = []

    for (const ind of indicators) {
      const def = INDICATOR_DEFS.find(d => d.id === ind.type)
      if (!def) continue

      const paramValues = ind.params
      if (ind.type === 'bb') {
        const { upper, middle, lower } = def.fn(closes, paramValues.period, paramValues.stdDev)
        results.push({
          id: ind.id,
          type: ind.type,
          label: `BB(${paramValues.period},${paramValues.stdDev})`,
          color: ind.color,
          lines: [
            { name: 'upper', data: upper.map((v, i) => ({ time: times[i], value: v })).filter(p => !isNaN(p.value)) },
            { name: 'middle', data: middle.map((v, i) => ({ time: times[i], value: v })).filter(p => !isNaN(p.value)) },
            { name: 'lower', data: lower.map((v, i) => ({ time: times[i], value: v })).filter(p => !isNaN(p.value)) },
          ],
        })
      } else {
        const values = def.fn(closes, paramValues.period)
        results.push({
          id: ind.id,
          type: ind.type,
          label: `${def.label}(${paramValues.period})`,
          color: ind.color,
          lines: [
            { name: 'main', data: values.map((v, i) => ({ time: times[i], value: v })).filter(p => !isNaN(p.value)) },
          ],
        })
      }
    }

    return results
  }, [candles, indicators])

  useMemo(() => {
    onIndicatorsChange?.(computed)
  }, [computed, onIndicatorsChange])

  const addIndicator = (def) => {
    const params = {}
    for (const p of def.params) {
      params[p.id] = p.default
    }
    setIndicators(prev => [...prev, {
      id: Date.now() + Math.random(),
      type: def.id,
      params,
      color: def.color,
    }])
    setShowAdd(false)
  }

  const removeIndicator = (id) => {
    setIndicators(prev => prev.filter(i => i.id !== id))
  }

  const updateParam = (id, paramId, value) => {
    setIndicators(prev => prev.map(i =>
      i.id === id ? { ...i, params: { ...i.params, [paramId]: Number(value) } } : i
    ))
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase">
          <LineChart size={12} className="text-accent-green" />
          Custom Indicators
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 transition-colors"
        >
          <Plus size={10} />
          Add
        </button>
      </div>

      {/* Add menu */}
      {showAdd && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {INDICATOR_DEFS.map(def => (
            <button
              key={def.id}
              onClick={() => addIndicator(def)}
              className="px-2 py-1 text-[10px] rounded bg-bg-600 text-gray-300 hover:bg-bg-500 transition-colors"
              style={{ borderLeft: `2px solid ${def.color}` }}
            >
              {def.label}
            </button>
          ))}
        </div>
      )}

      {/* Active indicators */}
      {indicators.length === 0 && !showAdd && (
        <div className="text-[10px] text-gray-600 italic">No indicators added</div>
      )}

      {indicators.map(ind => {
        const def = INDICATOR_DEFS.find(d => d.id === ind.type)
        if (!def) return null
        return (
          <div key={ind.id} className="bg-bg-600 rounded p-2 mb-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: ind.color }} />
                <span className="text-[10px] font-medium text-gray-300">{ind.label}</span>
              </div>
              <button
                onClick={() => removeIndicator(ind.id)}
                className="text-gray-600 hover:text-accent-red transition-colors"
              >
                <X size={10} />
              </button>
            </div>
            <div className="flex gap-2">
              {def.params.map(p => (
                <div key={p.id} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500">{p.label}</span>
                  <input
                    type="number"
                    min={p.min}
                    max={p.max}
                    step={p.step || 1}
                    value={ind.params[p.id]}
                    onChange={e => updateParam(ind.id, p.id, e.target.value)}
                    className="w-12 bg-bg-700 text-gray-200 text-[10px] rounded px-1 py-0.5 border border-bg-500 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
