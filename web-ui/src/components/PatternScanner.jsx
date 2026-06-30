import { useMemo } from 'react'
import { Scan, CandlestickChart } from 'lucide-react'
import { formatPrice } from '../utils/format'

function detectPatterns(candles) {
  if (candles.length < 3) return []
  const patterns = []
  const c = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const prev2 = candles[candles.length - 3]

  const body = Math.abs(c.close - c.open)
  const range = c.high - c.low || 0.001
  const upperWick = c.high - Math.max(c.open, c.close)
  const lowerWick = Math.min(c.open, c.close) - c.low
  const bodyRatio = body / range

  // Doji
  if (bodyRatio < 0.1) {
    patterns.push({ name: 'Doji', type: 'neutral', strength: 1 })
  }

  // Hammer
  if (lowerWick > body * 2 && upperWick < body * 0.5 && bodyRatio < 0.4) {
    patterns.push({ name: 'Hammer', type: 'bullish', strength: 2 })
  }

  // Shooting Star
  if (upperWick > body * 2 && lowerWick < body * 0.5 && bodyRatio < 0.4) {
    patterns.push({ name: 'Shooting Star', type: 'bearish', strength: 2 })
  }

  // Bullish Engulfing
  if (prev.close < prev.open && c.close > c.open && c.close > prev.open && c.open < prev.close) {
    patterns.push({ name: 'Bullish Engulfing', type: 'bullish', strength: 3 })
  }

  // Bearish Engulfing
  if (prev.close > prev.open && c.close < c.open && c.close < prev.open && c.open > prev.close) {
    patterns.push({ name: 'Bearish Engulfing', type: 'bearish', strength: 3 })
  }

  // Morning Star (3-candle)
  if (prev2.close < prev2.open && Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && c.close > c.open && c.close > prev2.open) {
    patterns.push({ name: 'Morning Star', type: 'bullish', strength: 3 })
  }

  // Evening Star (3-candle)
  if (prev2.close > prev2.open && Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && c.close < c.open && c.close < prev2.open) {
    patterns.push({ name: 'Evening Star', type: 'bearish', strength: 3 })
  }

  // Marubozu (no wicks)
  if (bodyRatio > 0.9) {
    patterns.push({ name: c.close > c.open ? 'Bullish Marubozu' : 'Bearish Marubozu', type: c.close > c.open ? 'bullish' : 'bearish', strength: 2 })
  }

  // Three White Soldiers
  if (candles.length >= 3) {
    const last3 = candles.slice(-3)
    if (last3.every(c => c.close > c.open) && last3[2].close > last3[1].close && last3[1].close > last3[0].close) {
      patterns.push({ name: 'Three White Soldiers', type: 'bullish', strength: 3 })
    }
    if (last3.every(c => c.close < c.open) && last3[2].close < last3[1].close && last3[1].close < last3[0].close) {
      patterns.push({ name: 'Three Black Crows', type: 'bearish', strength: 3 })
    }
  }

  return patterns
}

export default function PatternScanner({ candles, symbols, exchange }) {
  const scanResults = useMemo(() => {
    const results = []
    for (const sym of symbols) {
      const symCandles = candles.filter(c => c.exchange === exchange && c.symbol === sym)
      if (symCandles.length < 3) continue
      const patterns = detectPatterns(symCandles)
      const lastPrice = symCandles[symCandles.length - 1]?.close || 0
      if (patterns.length > 0) {
        results.push({ symbol: sym, patterns, lastPrice })
      }
    }
    return results
  }, [candles, symbols, exchange])

  const totalPatterns = scanResults.reduce((s, r) => s + r.patterns.length, 0)
  const bullishCount = scanResults.reduce((s, r) => s + r.patterns.filter(p => p.type === 'bullish').length, 0)
  const bearishCount = scanResults.reduce((s, r) => s + r.patterns.filter(p => p.type === 'bearish').length, 0)

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Scan size={12} className="text-accent-purple" />
        Pattern Scanner
        <span className="text-gray-600 ml-auto">{totalPatterns} found</span>
      </div>

      {scanResults.length === 0 ? (
        <div className="text-[10px] text-gray-600 italic py-2 text-center">No patterns detected</div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 mb-2 text-[9px]">
            <div className="bg-accent-green/10 rounded px-2 py-1">
              <span className="text-gray-600">Bullish</span>
              <span className="text-accent-green font-mono ml-2">{bullishCount}</span>
            </div>
            <div className="bg-accent-red/10 rounded px-2 py-1">
              <span className="text-gray-600">Bearish</span>
              <span className="text-accent-red font-mono ml-2">{bearishCount}</span>
            </div>
          </div>

          {/* Results per symbol */}
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto scrollbar-thin">
            {scanResults.map(r => (
              <div key={r.symbol} className="bg-bg-600/50 rounded p-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <CandlestickChart size={10} className="text-gray-500" />
                  <span className="text-[10px] font-medium text-gray-300">{r.symbol.split('/')[0]}</span>
                  <span className="text-[8px] text-gray-600 ml-auto">${formatPrice(r.lastPrice)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.patterns.map((p, i) => (
                    <span
                      key={i}
                      className={'px-1.5 py-0.5 text-[8px] rounded font-medium ' +
                        (p.type === 'bullish' ? 'bg-accent-green/20 text-accent-green' :
                         p.type === 'bearish' ? 'bg-accent-red/20 text-accent-red' :
                         'bg-gray-500/20 text-gray-400')}
                    >
                      {p.name} {'★'.repeat(p.strength)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-2 pt-1.5 border-t border-bg-600 text-[8px] text-gray-600">
        Scans last 3 candles for: Doji, Hammer, Shooting Star, Engulfing, Morning/Evening Star, Marubozu, 3 Soldiers/Crows. ★ = strength.
      </div>
    </div>
  )
}
