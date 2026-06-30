import { useMemo } from 'react'
import { Grid3x3, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { calcRSI, calcEMA, calcSMA, calcATR, calcMACD } from '../utils/indicators'

export default function SignalMatrixHeatmap({ candles, signals, fills, symbols, exchange }) {
  const data = useMemo(() => {
    if (!symbols || symbols.length === 0) return null

    const indicators = [
      { id: 'rsi', name: 'RSI(14)', fn: (closes) => {
        const rsi = calcRSI(closes, 14)
        const v = rsi[rsi.length - 1]
        if (isNaN(v)) return { signal: 'neutral', strength: 0 }
        return { signal: v > 55 ? 'bull' : v < 45 ? 'bear' : 'neutral', strength: Math.abs(v - 50) / 50 }
      }},
      { id: 'macd', name: 'MACD', fn: (closes) => {
        const macd = calcMACD(closes)
        if (!macd.macd || macd.macd.length === 0) return { signal: 'neutral', strength: 0 }
        const hist = macd.macd[macd.macd.length - 1] - macd.signal[macd.signal.length - 1]
        if (isNaN(hist)) return { signal: 'neutral', strength: 0 }
        return { signal: hist > 0 ? 'bull' : hist < 0 ? 'bear' : 'neutral', strength: Math.min(Math.abs(hist) / Math.abs(macd.macd[macd.macd.length - 1] || 1), 1) }
      }},
      { id: 'ema', name: 'EMA 9/21', fn: (closes) => {
        if (closes.length < 21) return { signal: 'neutral', strength: 0 }
        const ema9 = calcEMA(closes, 9)
        const ema21 = calcEMA(closes, 21)
        const diff = ema9[ema9.length - 1] - ema21[ema21.length - 1]
        if (isNaN(diff)) return { signal: 'neutral', strength: 0 }
        return { signal: diff > 0 ? 'bull' : diff < 0 ? 'bear' : 'neutral', strength: Math.min(Math.abs(diff) / closes[closes.length - 1] * 100, 1) }
      }},
      { id: 'sma', name: 'Price/SMA50', fn: (closes) => {
        if (closes.length < 10) return { signal: 'neutral', strength: 0 }
        const sma = calcSMA(closes, Math.min(50, closes.length))
        const last = sma[sma.length - 1]
        if (isNaN(last)) return { signal: 'neutral', strength: 0 }
        const diff = closes[closes.length - 1] - last
        return { signal: diff > 0 ? 'bull' : diff < 0 ? 'bear' : 'neutral', strength: Math.min(Math.abs(diff) / last * 100, 1) }
      }},
      { id: 'atr', name: 'ATR Vol', fn: (closes, highs, lows) => {
        const atr = calcATR(highs, lows, closes, 14)
        const valid = atr.filter(v => !isNaN(v))
        if (valid.length === 0) return { signal: 'neutral', strength: 0 }
        const last = valid[valid.length - 1]
        const avg = valid.reduce((s, v) => s + v, 0) / valid.length
        const ratio = avg > 0 ? last / avg : 1
        return { signal: ratio > 1.5 ? 'bear' : ratio < 0.7 ? 'bull' : 'neutral', strength: Math.min(Math.abs(ratio - 1), 1) }
      }},
      { id: 'mom', name: 'Momentum', fn: (closes) => {
        if (closes.length < 10) return { signal: 'neutral', strength: 0 }
        const roc = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100
        return { signal: roc > 1 ? 'bull' : roc < -1 ? 'bear' : 'neutral', strength: Math.min(Math.abs(roc) / 5, 1) }
      }},
      { id: 'vol', name: 'Volume', fn: (closes, highs, lows, volumes) => {
        if (volumes.length < 15) return { signal: 'neutral', strength: 0 }
        const recent = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5
        const older = volumes.slice(-15, -5).reduce((s, v) => s + v, 0) / 10
        const ratio = older > 0 ? recent / older : 1
        return { signal: ratio > 1.3 ? 'bull' : ratio < 0.7 ? 'bear' : 'neutral', strength: Math.min(Math.abs(ratio - 1), 1) }
      }},
      { id: 'sig', name: 'Signals', fn: (closes, highs, lows, volumes, sym) => {
        const symSignals = (signals || []).filter(s => s.symbol === sym).slice(-5)
        if (symSignals.length === 0) return { signal: 'neutral', strength: 0 }
        const bulls = symSignals.filter(s => s.direction === 'BUY' || s.direction === 'LONG').length
        const score = bulls / symSignals.length
        return { signal: score > 0.6 ? 'bull' : score < 0.4 ? 'bear' : 'neutral', strength: Math.abs(score - 0.5) * 2 }
      }},
    ]

    // Build matrix: rows = indicators, cols = symbols
    const matrix = []
    const symList = []
    const symColors = []

    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-60)
      if (symCandles.length < 20) continue

      const closes = symCandles.map(c => c.close)
      const highs = symCandles.map(c => c.high)
      const lows = symCandles.map(c => c.low)
      const volumes = symCandles.map(c => c.volume || 0)

      symList.push(sym)
    }

    if (symList.length === 0) return null

    // Re-filter with data
    const symData = {}
    for (const sym of symbols) {
      const symCandles = candles
        .filter(c => c.exchange === exchange && c.symbol === sym)
        .slice(-60)
      if (symCandles.length < 20) continue
      symData[sym] = {
        closes: symCandles.map(c => c.close),
        highs: symCandles.map(c => c.high),
        lows: symCandles.map(c => c.low),
        volumes: symCandles.map(c => c.volume || 0),
      }
    }

    const validSyms = Object.keys(symData)
    if (validSyms.length === 0) return null

    for (const ind of indicators) {
      const row = []
      for (const sym of validSyms) {
        const d = symData[sym]
        const result = ind.fn(d.closes, d.highs, d.lows, d.volumes, sym)
        row.push({ ...result, indicator: ind.name, symbol: sym })
      }
      matrix.push({ indicator: ind.name, cells: row })
    }

    // Per-symbol aggregate
    const symScores = validSyms.map(sym => {
      const cells = matrix.map(row => row.cells.find(c => c.symbol === sym))
      const bull = cells.filter(c => c.signal === 'bull').reduce((s, c) => s + c.strength, 0)
      const bear = cells.filter(c => c.signal === 'bear').reduce((s, c) => s + c.strength, 0)
      const net = ((bull - bear) / (bull + bear + cells.filter(c => c.signal === 'neutral').reduce((s, c) => s + c.strength, 0) || 1)) * 100
      return { symbol: sym, net, bull, bear }
    })

    return {
      indicators, matrix, validSyms, symScores,
      shortNames: validSyms.map(s => s.split('/')[0]),
    }
  }, [candles, signals, fills, symbols, exchange])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Grid3x3 size={12} className="text-accent-blue" />
          Signal Matrix
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need symbols with 20+ candles</div>
      </div>
    )
  }

  const { matrix, validSyms, symScores, shortNames } = data
  const cellW = 36
  const labelW = 70
  const gridW = labelW + cellW * validSyms.length

  function cellColor(signal, strength) {
    if (signal === 'bull') return `rgba(34,197,94,${0.2 + strength * 0.8})`
    if (signal === 'bear') return `rgba(239,68,68,${0.2 + strength * 0.8})`
    return `rgba(71,85,105,${0.15 + strength * 0.3})`
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Grid3x3 size={12} className="text-accent-blue" />
        Signal Matrix Heatmap
      </div>

      {/* Heatmap */}
      <div className="mb-2 flex justify-center overflow-x-auto">
        <svg width={gridW + 4} height={matrix.length * 20 + 24}>
          {/* Column headers */}
          {shortNames.map((name, j) => (
            <text
              key={'col-' + j}
              x={labelW + j * cellW + cellW / 2}
              y={14}
              fill="#94a3b8"
              fontSize={7}
              textAnchor="middle"
              fontWeight="bold"
            >
              {name}
            </text>
          ))}

          {/* Rows */}
          {matrix.map((row, i) => (
            <g key={'row-' + i}>
              <text
                x={labelW - 4}
                y={i * 20 + 20 + 4}
                fill="#94a3b8"
                fontSize={7}
                textAnchor="end"
              >
                {row.indicator}
              </text>
              {row.cells.map((cell, j) => (
                <g key={`cell-${i}-${j}`}>
                  <rect
                    x={labelW + j * cellW + 1}
                    y={i * 20 + 16}
                    width={cellW - 2}
                    height={18}
                    rx={2}
                    fill={cellColor(cell.signal, cell.strength)}
                  />
                  {cell.signal === 'bull' && (
                    <path
                      d={`M${labelW + j * cellW + cellW / 2 - 3},${i * 20 + 24} L${labelW + j * cellW + cellW / 2},${i * 20 + 20} L${labelW + j * cellW + cellW / 2 + 3},${i * 20 + 24}`}
                      stroke="#0f172a"
                      strokeWidth={1}
                      fill="none"
                    />
                  )}
                  {cell.signal === 'bear' && (
                    <path
                      d={`M${labelW + j * cellW + cellW / 2 - 3},${i * 20 + 28} L${labelW + j * cellW + cellW / 2},${i * 20 + 32} L${labelW + j * cellW + cellW / 2 + 3},${i * 20 + 28}`}
                      stroke="#0f172a"
                      strokeWidth={1}
                      fill="none"
                    />
                  )}
                  {cell.signal === 'neutral' && (
                    <line
                      x1={labelW + j * cellW + cellW / 2 - 3}
                      y1={i * 20 + 26}
                      x2={labelW + j * cellW + cellW / 2 + 3}
                      y2={i * 20 + 26}
                      stroke="#475569"
                      strokeWidth={1}
                    />
                  )}
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>

      {/* Per-symbol aggregate */}
      <div className="pt-1.5 border-t border-bg-600">
        <div className="text-[8px] text-gray-600 mb-0.5">Aggregate Score:</div>
        <div className="space-y-0.5">
          {symScores.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
              <span className="text-gray-400 w-12">{s.symbol.split('/')[0]}</span>
              <div className="flex-1 h-1.5 bg-bg-600 rounded-full overflow-hidden mx-2">
                <div
                  className={'h-full rounded-full ' + (s.net > 10 ? 'bg-accent-green' : s.net < -10 ? 'bg-accent-red' : 'bg-gray-500')}
                  style={{ width: `${Math.abs(s.net)}%`, marginLeft: s.net < 0 ? `${100 - Math.abs(s.net)}%` : '0' }}
                />
              </div>
              <span className={'font-mono w-8 text-right ' + (s.net > 10 ? 'text-accent-green' : s.net < -10 ? 'text-accent-red' : 'text-gray-400')}>
                {s.net >= 0 ? '+' : ''}{s.net.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        8 indicators × {validSyms.length} symbols. Green = bullish, Red = bearish, Gray = neutral. Intensity = signal strength.
      </div>
    </div>
  )
}
