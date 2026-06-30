import { useState, useMemo } from 'react'
import { Calculator, Plus, Trash2, FunctionSquare, AlertCircle } from 'lucide-react'
import { calcSMA, calcEMA, calcRSI, calcATR, calcBollingerBands, calcMACD } from '../utils/indicators'

const AVAILABLE_FUNCTIONS = [
  { name: 'SMA', params: ['closes', 'period'], desc: 'Simple Moving Average' },
  { name: 'EMA', params: ['closes', 'period'], desc: 'Exponential Moving Average' },
  { name: 'RSI', params: ['closes', 'period'], desc: 'Relative Strength Index' },
  { name: 'ATR', params: ['highs', 'lows', 'closes', 'period'], desc: 'Average True Range' },
  { name: 'BB', params: ['closes', 'period', 'stdDev'], desc: 'Bollinger Bands' },
  { name: 'MACD', params: ['closes', 'fast', 'slow', 'signal'], desc: 'MACD' },
]

const OPERATORS = ['+', '-', '*', '/', '(', ')']

function tokenize(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    if (expr[i] === ' ') { i++; continue }
    if (OPERATORS.includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i] })
      i++
    } else if (expr[i] >= '0' && expr[i] <= '9' || expr[i] === '.') {
      let num = ''
      while (i < expr.length && (expr[i] >= '0' && expr[i] <= '9' || expr[i] === '.')) {
        num += expr[i]; i++
      }
      tokens.push({ type: 'num', value: parseFloat(num) })
    } else if (expr[i] >= 'A' && expr[i] <= 'Z' || expr[i] >= 'a' && expr[i] <= 'z' || expr[i] === '_') {
      let name = ''
      while (i < expr.length && (expr[i] >= 'A' && expr[i] <= 'Z' || expr[i] >= 'a' && expr[i] <= 'z' || expr[i] === '_' || expr[i] >= '0' && expr[i] <= '9')) {
        name += expr[i]; i++
      }
      if (expr[i] === '(') {
        tokens.push({ type: 'func', value: name })
      } else {
        tokens.push({ type: 'var', value: name })
      }
    } else if (expr[i] === ',') {
      tokens.push({ type: 'comma', value: ',' })
      i++
    } else {
      i++
    }
  }
  return tokens
}

function parseExpression(tokens, pos, ctx) {
  return parseAddSub(tokens, pos, ctx)
}

function parseAddSub(tokens, pos, ctx) {
  let { result, pos: newPos } = parseMulDiv(tokens, pos, ctx)
  while (newPos < tokens.length && (tokens[newPos].type === 'op' && (tokens[newPos].value === '+' || tokens[newPos].value === '-'))) {
    const op = tokens[newPos].value
    newPos++
    const right = parseMulDiv(tokens, newPos, ctx)
    result = { type: 'binop', op, left: result, right: right.result }
    newPos = right.pos
  }
  return { result, pos: newPos }
}

function parseMulDiv(tokens, pos, ctx) {
  let { result, pos: newPos } = parsePrimary(tokens, pos, ctx)
  while (newPos < tokens.length && (tokens[newPos].type === 'op' && (tokens[newPos].value === '*' || tokens[newPos].value === '/'))) {
    const op = tokens[newPos].value
    newPos++
    const right = parsePrimary(tokens, newPos, ctx)
    result = { type: 'binop', op, left: result, right: right.result }
    newPos = right.pos
  }
  return { result, pos: newPos }
}

function parsePrimary(tokens, pos, ctx) {
  if (pos >= tokens.length) throw new Error('Unexpected end of expression')
  const token = tokens[pos]

  if (token.type === 'num') {
    return { result: { type: 'num', value: token.value }, pos: pos + 1 }
  }
  if (token.type === 'var') {
    if (!ctx.vars.hasOwnProperty(token.value)) throw new Error(`Unknown variable: ${token.value}`)
    return { result: { type: 'var', name: token.value }, pos: pos + 1 }
  }
  if (token.type === 'op' && token.value === '(') {
    const inner = parseExpression(tokens, pos + 1, ctx)
    if (inner.pos >= tokens.length || tokens[inner.pos].value !== ')') {
      throw new Error('Missing closing parenthesis')
    }
    return { result: inner.result, pos: inner.pos + 1 }
  }
  if (token.type === 'func') {
    const funcName = token.value
    if (!ctx.functions[funcName]) throw new Error(`Unknown function: ${funcName}`)
    pos++
    if (pos >= tokens.length || tokens[pos].value !== '(') throw new Error(`Expected ( after ${funcName}`)
    pos++
    const args = []
    if (tokens[pos] && tokens[pos].value !== ')') {
      const first = parseExpression(tokens, pos, ctx)
      args.push(first.result)
      pos = first.pos
      while (pos < tokens.length && tokens[pos].type === 'comma') {
        pos++
        const next = parseExpression(tokens, pos, ctx)
        args.push(next.result)
        pos = next.pos
      }
    }
    if (pos >= tokens.length || tokens[pos].value !== ')') throw new Error(`Missing ) for ${funcName}`)
    return { result: { type: 'func', name: funcName, args }, pos: pos + 1 }
  }
  throw new Error(`Unexpected token: ${token.value}`)
}

function evalAST(node, ctx) {
  if (node.type === 'num') {
    const n = node.value
    return new Array(ctx.len).fill(n)
  }
  if (node.type === 'var') {
    return ctx.vars[node.name]
  }
  if (node.type === 'binop') {
    const left = evalAST(node.left, ctx)
    const right = evalAST(node.right, ctx)
    const result = new Array(ctx.len)
    for (let i = 0; i < ctx.len; i++) {
      const l = left[i] || 0
      const r = right[i] || 0
      if (isNaN(l) || isNaN(r)) { result[i] = NaN; continue }
      result[i] = node.op === '+' ? l + r : node.op === '-' ? l - r : node.op === '*' ? l * r : node.op === '/' ? (r !== 0 ? l / r : NaN) : NaN
    }
    return result
  }
  if (node.type === 'func') {
    const args = node.args.map(a => evalAST(a, ctx))
    const fn = ctx.functions[node.name]
    return fn(...args)
  }
  throw new Error('Unknown node type')
}

export default function IndicatorFormulaParser({ candles, symbol, exchange }) {
  const [formula, setFormula] = useState('EMA(closes, 9) - EMA(closes, 21)')
  const [error, setError] = useState(null)

  const result = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-100)
    if (symCandles.length < 30) return null

    const closes = symCandles.map(c => c.close)
    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const volumes = symCandles.map(c => c.volume || 0)
    const n = closes.length

    const ctx = {
      len: n,
      vars: { closes, highs, lows, volumes, open: symCandles.map(c => c.open) },
      functions: {
        SMA: (arr, p) => calcSMA(arr, Math.round(p) || 20),
        EMA: (arr, p) => calcEMA(arr, Math.round(p) || 9),
        RSI: (arr, p) => calcRSI(arr, Math.round(p) || 14),
        ATR: (h, l, c, p) => calcATR(h, l, c, Math.round(p) || 14),
        BB: (arr, p, sd) => {
          const bb = calcBollingerBands(arr, Math.round(p) || 20, sd || 2)
          return bb.upper
        },
        MACD: (arr, f, s, sig) => {
          const m = calcMACD(arr, Math.round(f) || 12, Math.round(s) || 26, Math.round(sig) || 9)
          return m.macd
        },
        MAX: (arr, p) => {
          const period = Math.round(p) || 20
          const res = new Array(arr.length).fill(NaN)
          for (let i = period - 1; i < arr.length; i++) {
            res[i] = Math.max(...arr.slice(i - period + 1, i + 1))
          }
          return res
        },
        MIN: (arr, p) => {
          const period = Math.round(p) || 20
          const res = new Array(arr.length).fill(NaN)
          for (let i = period - 1; i < arr.length; i++) {
            res[i] = Math.min(...arr.slice(i - period + 1, i + 1))
          }
          return res
        },
        ABS: (arr) => arr.map(v => Math.abs(v)),
        CROSS: (a, b) => {
          const res = new Array(a.length).fill(0)
          for (let i = 1; i < a.length; i++) {
            if (a[i - 1] <= b[i - 1] && a[i] > b[i]) res[i] = 1
            else if (a[i - 1] >= b[i - 1] && a[i] < b[i]) res[i] = -1
          }
          return res
        },
      },
    }

    try {
      const tokens = tokenize(formula)
      const parsed = parseExpression(tokens, 0, ctx)
      if (parsed.pos < tokens.length) throw new Error('Unexpected trailing tokens')
      const values = evalAST(parsed.result, ctx)
      setError(null)

      const validValues = values.filter(v => !isNaN(v))
      if (validValues.length === 0) return { values: [], error: 'No valid values' }

      const last = values[values.length - 1]
      const prev = values[values.length - 2] || last
      const min = Math.min(...validValues)
      const max = Math.max(...validValues)
      const change = ((last - prev) / Math.abs(prev || 1)) * 100

      // Signal: last value vs 0 or vs previous
      let signal = 'neutral'
      if (last > 0 && prev <= 0) signal = 'bull_cross'
      else if (last < 0 && prev >= 0) signal = 'bear_cross'
      else if (last > prev) signal = 'bull'
      else if (last < prev) signal = 'bear'

      return { values, last, prev, min, max, change, signal, n }
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [candles, symbol, exchange, formula])

  const examples = [
    'EMA(closes, 9) - EMA(closes, 21)',
    'RSI(closes, 14) - 50',
    'MACD(closes, 12, 26, 9)',
    'closes - SMA(closes, 50)',
    'BB(closes, 20, 2) - closes',
    'ATR(highs, lows, closes, 14) / closes * 100',
  ]

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calculator size={12} className="text-accent-teal" />
        Custom Indicator Formula
      </div>

      {/* Formula input */}
      <div className="mb-2">
        <textarea
          value={formula}
          onChange={e => setFormula(e.target.value)}
          rows={2}
          className="w-full bg-bg-800 text-[10px] font-mono text-gray-300 rounded px-2 py-1 border border-bg-600 focus:border-accent-teal outline-none resize-none"
          placeholder="e.g. EMA(closes, 9) - EMA(closes, 21)"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-accent-red/10 border border-accent-red/20 rounded px-2 py-1 mb-2 flex items-center gap-1">
          <AlertCircle size={10} className="text-accent-red shrink-0" />
          <span className="text-[8px] text-accent-red">{error}</span>
        </div>
      )}

      {/* Examples */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">Examples (click to use):</div>
        <div className="flex flex-wrap gap-1">
          {examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setFormula(ex)}
              className="text-[7px] bg-bg-600 hover:bg-bg-500 text-gray-400 rounded px-1.5 py-0.5 transition-colors"
            >
              {ex.length > 25 ? ex.slice(0, 25) + '...' : ex}
            </button>
          ))}
        </div>
      </div>

      {/* Available functions */}
      <div className="mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5 flex items-center gap-0.5">
          <FunctionSquare size={7} /> Functions:
        </div>
        <div className="grid grid-cols-2 gap-px">
          {AVAILABLE_FUNCTIONS.map(f => (
            <div key={f.name} className="bg-bg-800 rounded px-1.5 py-0.5 text-[7px]">
              <span className="text-accent-teal font-mono">{f.name}</span>
              <span className="text-gray-600">({f.params.join(', ')})</span>
            </div>
          ))}
          <div className="bg-bg-800 rounded px-1.5 py-0.5 text-[7px]">
            <span className="text-accent-teal font-mono">MAX/MIN</span>
            <span className="text-gray-600">(arr, period)</span>
          </div>
          <div className="bg-bg-800 rounded px-1.5 py-0.5 text-[7px]">
            <span className="text-accent-teal font-mono">CROSS</span>
            <span className="text-gray-600">(a, b)</span>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && !error && (
        <>
          <div className="grid grid-cols-4 gap-1 mb-2 text-[8px]">
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Current</span>
              <div className="font-mono text-gray-300">{result.last.toFixed(4)}</div>
            </div>
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Change</span>
              <div className={'font-mono ' + (result.change >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {result.change >= 0 ? '+' : ''}{result.change.toFixed(2)}%
              </div>
            </div>
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Min</span>
              <div className="font-mono text-gray-500">{result.min.toFixed(4)}</div>
            </div>
            <div className="bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-600">Max</span>
              <div className="font-mono text-gray-500">{result.max.toFixed(4)}</div>
            </div>
          </div>

          {/* Signal */}
          <div className="bg-bg-800 rounded px-2 py-1 mb-2 flex items-center justify-between">
            <span className="text-[8px] text-gray-600">Signal:</span>
            <span className={'text-[10px] font-bold ' +
              (result.signal === 'bull' || result.signal === 'bull_cross' ? 'text-accent-green' :
               result.signal === 'bear' || result.signal === 'bear_cross' ? 'text-accent-red' : 'text-gray-400')}>
              {result.signal === 'bull_cross' ? 'Bullish Cross' :
               result.signal === 'bear_cross' ? 'Bearish Cross' :
               result.signal === 'bull' ? 'Bullish' :
               result.signal === 'bear' ? 'Bearish' : 'Neutral'}
            </span>
          </div>

          {/* Sparkline */}
          <div className="pt-1.5 border-t border-bg-600">
            <div className="text-[8px] text-gray-600 mb-0.5">Value History:</div>
            <svg width={280} height={40} className="w-full">
              <line x1={0} y1={20} x2={280} y2={20} stroke="#334155" strokeWidth={0.5} strokeDasharray="2,2" />
              {(() => {
                const vals = result.values.filter(v => !isNaN(v)).slice(-30)
                if (vals.length < 2) return null
                const range = result.max - result.min || 1
                const xStep = 280 / Math.max(vals.length - 1, 1)
                return vals.map((v, i) => {
                  const x = i * xStep
                  const y = 38 - ((v - result.min) / range) * 34
                  return (
                    <g key={i}>
                      {i > 0 && (
                        <line
                          x1={(i - 1) * xStep}
                          y1={38 - ((vals[i - 1] - result.min) / range) * 34}
                          x2={x}
                          y2={y}
                          stroke={v > vals[i - 1] ? '#22c55e' : '#ef4444'}
                          strokeWidth={0.8}
                        />
                      )}
                      <circle cx={x} cy={y} r={1} fill="#64748b" />
                    </g>
                  )
                })
              })()}
            </svg>
          </div>
        </>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Custom parser: supports +, -, *, /, parentheses, variables (closes, highs, lows, volumes, open) and indicator functions.
      </div>
    </div>
  )
}
