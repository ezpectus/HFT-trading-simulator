import { useState, useMemo, useCallback } from 'react'
import { Trash2, Sliders, Code, Play, Save } from 'lucide-react'

const PRESETS = [
  {
    name: 'EMA Cross',
    formula: 'ema(close, 9) - ema(close, 21)',
    params: { fast: 9, slow: 21 },
  },
  {
    name: 'RSI Divergence',
    formula: 'rsi(close, 14) - 70',
    params: { period: 14, overbought: 70 },
  },
  {
    name: 'Volume Z-Score',
    formula: '(volume - sma(volume, 20)) / stddev(volume, 20)',
    params: { period: 20 },
  },
  {
    name: 'Price Momentum',
    formula: '(close - close[n]) / close[n] * 100',
    params: { n: 10 },
  },
  {
    name: 'Volatility Ratio',
    formula: 'atr(high, low, close, 14) / close * 100',
    params: { period: 14 },
  },
]

const FUNCTIONS = [
  { name: 'sma', args: 'values, period', desc: 'Simple Moving Average' },
  { name: 'ema', args: 'values, period', desc: 'Exponential Moving Average' },
  { name: 'rsi', args: 'values, period', desc: 'Relative Strength Index' },
  { name: 'stddev', args: 'values, period', desc: 'Standard Deviation' },
  { name: 'min', args: 'values, period', desc: 'Rolling Minimum' },
  { name: 'max', args: 'values, period', desc: 'Rolling Maximum' },
  { name: 'atr', args: 'high, low, close, period', desc: 'Average True Range' },
  { name: 'macd', args: 'values, fast, slow, signal', desc: 'MACD Line' },
]

const VARIABLES = [
  { name: 'open', desc: 'Open prices array' },
  { name: 'high', desc: 'High prices array' },
  { name: 'low', desc: 'Low prices array' },
  { name: 'close', desc: 'Close prices array' },
  { name: 'volume', desc: 'Volume array' },
  { name: 'close[n]', desc: 'Close n bars ago' },
]

export default function CustomIndicatorPlugin({ candles, symbol }) {
  const [indicators, setIndicators] = useState([])
  const [name, setName] = useState('My Indicator')
  const [formula, setFormula] = useState('ema(close, 9) - ema(close, 21)')
  const [params, setParams] = useState({})
  const [color, setColor] = useState('#a855f7')
  const [showOverlay, setShowOverlay] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState([])

  const candleData = useMemo(() => {
    if (!candles || !candles[symbol]) return null
    return candles[symbol]
  }, [candles, symbol])

  const computeSMA = (values, period) => {
    const result = []
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) { result.push(null); continue }
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += values[j]
      result.push(sum / period)
    }
    return result
  }

  const computeEMA = (values, period) => {
    const k = 2 / (period + 1)
    const result = []
    let ema = values[0] || 0
    for (let i = 0; i < values.length; i++) {
      ema = i === 0 ? values[0] : values[i] * k + ema * (1 - k)
      result.push(ema)
    }
    return result
  }

  const computeRSI = (values, period) => {
    const result = []
    for (let i = 0; i < values.length; i++) {
      if (i < period) { result.push(50); continue }
      let gains = 0, losses = 0
      for (let j = i - period + 1; j <= i; j++) {
        const diff = values[j] - values[j - 1]
        if (diff > 0) { gains += diff } else { losses -= diff }
      }
      const rs = losses === 0 ? 100 : gains / losses
      result.push(100 - 100 / (1 + rs))
    }
    return result
  }

  const computeStdDev = (values, period) => {
    const result = []
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) { result.push(0); continue }
      const slice = values.slice(i - period + 1, i + 1)
      const mean = slice.reduce((a, b) => a + b, 0) / period
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
      result.push(Math.sqrt(variance))
    }
    return result
  }

  const computeATR = (high, low, close, period) => {
    const tr = []
    for (let i = 0; i < close.length; i++) {
      if (i === 0) { tr.push(high[i] - low[i]); continue }
      tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])))
    }
    return computeEMA(tr, period)
  }

  const evaluate = useCallback(() => {
    if (!candleData || candleData.length === 0) {
      setError('No candle data available')
      setResult([])
      return
    }

    try {
      setError('')
      const close = candleData.map(c => c.close)
      const high = candleData.map(c => c.high)
      const low = candleData.map(c => c.low)
      const volume = candleData.map(c => c.volume)
      const open = candleData.map(c => c.open)

      const ctx = {
        close, high, low, volume, open,
        sma: computeSMA,
        ema: computeEMA,
        rsi: computeRSI,
        stddev: computeStdDev,
        atr: computeATR,
        min: (arr, p) => arr.map((_, i) => i < p - 1 ? null : Math.min(...arr.slice(i - p + 1, i + 1))),
        max: (arr, p) => arr.map((_, i) => i < p - 1 ? null : Math.max(...arr.slice(i - p + 1, i + 1))),
        macd: (v, f, s, _sig) => {
          const emaF = computeEMA(v, f)
          const emaS = computeEMA(v, s)
          return emaF.map((val, i) => val - emaS[i])
        },
      }

      const n = parseInt(Object.keys(params)[0]?.match(/\d+/)?.[0] || '10')

      const fn = new Function(...Object.keys(ctx), 'n', `"use strict"; return (${formula});`)
      const values = fn(...Object.values(ctx), n)

      if (!Array.isArray(values)) {
        setError('Formula must return an array')
        return
      }

      setResult(values.slice(-50))
    } catch (e) {
      setError(e.message)
      setResult([])
    }
  }, [candleData, formula, params])

  const addIndicator = () => {
    setIndicators(prev => [...prev, { name, formula, color, showOverlay, id: Date.now() }])
  }

  const removeIndicator = (id) => {
    setIndicators(prev => prev.filter(i => i.id !== id))
  }

  const loadPreset = (preset) => {
    setName(preset.name)
    setFormula(preset.formula)
    setParams(preset.params)
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Sliders size={12} className="text-accent-purple" />
        Custom Indicator Plugin
        <span className="text-gray-600 ml-auto">{symbol || 'No symbol'}</span>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-0.5 mb-2">
        {PRESETS.map(p => (
          <button key={p.name}
            onClick={() => loadPreset(p)}
            className="px-1.5 py-0.5 text-[8px] rounded bg-bg-600 text-gray-600 hover:text-accent-purple">
            {p.name}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="space-y-1.5 mb-2">
        <div className="flex gap-1">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Indicator name"
            className="flex-1 bg-bg-800 border border-bg-600 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-accent-purple" />
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-7 h-6 bg-bg-800 border border-bg-600 rounded cursor-pointer" />
          <label className="flex items-center gap-0.5 text-[8px] text-gray-500">
            <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} />
            Overlay
          </label>
        </div>
        <div className="relative">
          <Code size={10} className="absolute left-1.5 top-1.5 text-gray-600" />
          <textarea value={formula} onChange={e => setFormula(e.target.value)}
            placeholder="Formula: e.g. ema(close, 9) - ema(close, 21)"
            className="w-full bg-bg-800 border border-bg-600 rounded pl-6 pr-1.5 py-1 text-[9px] font-mono text-gray-200 outline-none focus:border-accent-purple resize-none"
            rows={2} />
        </div>
      </div>

      {/* Functions reference */}
      <details className="mb-2">
        <summary className="text-[8px] text-gray-600 cursor-pointer hover:text-gray-400">
          Available functions & variables
        </summary>
        <div className="mt-1 space-y-0.5">
          <div className="text-[8px] text-gray-600 uppercase">Functions</div>
          <div className="grid grid-cols-2 gap-0.5">
            {FUNCTIONS.map(f => (
              <div key={f.name} className="text-[8px] text-gray-500">
                <span className="text-accent-blue font-mono">{f.name}({f.args})</span>
                <span className="text-gray-600"> — {f.desc}</span>
              </div>
            ))}
          </div>
          <div className="text-[8px] text-gray-600 uppercase mt-1">Variables</div>
          <div className="grid grid-cols-2 gap-0.5">
            {VARIABLES.map(v => (
              <div key={v.name} className="text-[8px] text-gray-500">
                <span className="text-accent-green font-mono">{v.name}</span>
                <span className="text-gray-600"> — {v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-1 mb-2">
        <button onClick={evaluate}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] rounded bg-accent-blue/20 text-accent-blue">
          <Play size={9} /> Run
        </button>
        <button onClick={addIndicator}
          className="flex items-center gap-0.5 px-2 py-0.5 text-[9px] rounded bg-accent-green/20 text-accent-green">
          <Save size={9} /> Save
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-[9px] text-accent-red bg-accent-red/10 rounded px-1.5 py-1 mb-2">
          {error}
        </div>
      )}

      {/* Result preview */}
      {result.length > 0 && (
        <div className="mb-2">
          <div className="text-[8px] text-gray-600 uppercase mb-0.5">Last 5 values</div>
          <div className="flex gap-1">
            {result.slice(-5).map((v, i) => (
              <span key={i} className="text-[9px] font-mono text-gray-400 bg-bg-600/40 rounded px-1.5 py-0.5">
                {v != null ? v.toFixed(4) : 'null'}
              </span>
            ))}
          </div>
          {/* Mini chart */}
          <div className="relative h-[60px] bg-bg-800 rounded border border-bg-600 mt-1 overflow-hidden">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 60">
              {(() => {
                const valid = result.filter(v => v != null)
                if (valid.length < 2) return null
                const min = Math.min(...valid)
                const max = Math.max(...valid)
                const range = max - min || 1
                const pts = result.map((v, i) => {
                  if (v == null) return null
                  const x = (i / (result.length - 1)) * 200
                  const y = 60 - ((v - min) / range) * 60
                  return `${x},${y}`
                }).filter(Boolean).join(' ')
                return <polyline points={pts} fill="none" stroke={color} strokeWidth="1" />
              })()}
            </svg>
          </div>
        </div>
      )}

      {/* Saved indicators */}
      {indicators.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[8px] text-gray-600 uppercase">Saved Indicators</div>
          {indicators.map(ind => (
            <div key={ind.id} className="flex items-center gap-1.5 bg-bg-600/40 rounded p-1">
              <div className="w-2 h-2 rounded-full" style={{ background: ind.color }} />
              <span className="text-[9px] text-gray-300">{ind.name}</span>
              <span className="text-[8px] text-gray-600 truncate flex-1">{ind.formula}</span>
              {ind.showOverlay && <span className="text-[7px] text-accent-blue">overlay</span>}
              <button onClick={() => removeIndicator(ind.id)} className="text-gray-600 hover:text-accent-red">
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
