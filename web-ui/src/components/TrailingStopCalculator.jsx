import { useMemo, useState } from 'react'
import { Crosshair, TrendingUp, TrendingDown, Shield } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { calcATR, calcEMA } from '../utils/indicators'

export default function TrailingStopCalculator({ candles, accounts, currentPrice, symbol, exchange }) {
  const [method, setMethod] = useState('atr')
  const [atrMult, setAtrMult] = useState(2)
  const [chandelierPeriod, setChandelierPeriod] = useState(22)
  const [side, setSide] = useState('long')

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-60)
    if (symCandles.length < 25 || !currentPrice) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)

    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : currentPrice * 0.02

    // Method 1: ATR Trailing Stop
    const atrStopLong = currentPrice - lastAtr * atrMult
    const atrStopShort = currentPrice + lastAtr * atrMult

    // Method 2: Chandelier Exit (based on highest high/lowest low)
    const period = Math.min(chandelierPeriod, symCandles.length)
    const recentHighs = highs.slice(-period)
    const recentLows = lows.slice(-period)
    const highestHigh = Math.max(...recentHighs)
    const lowestLow = Math.min(...recentLows)
    const chandelierLong = highestHigh - lastAtr * atrMult
    const chandelierShort = lowestLow + lastAtr * atrMult

    // Method 3: EMA Trailing
    const ema = calcEMA(closes, 21)
    const lastEma = ema[ema.length - 1]
    const emaBuffer = lastAtr * 0.5
    const emaStopLong = lastEma - emaBuffer
    const emaStopShort = lastEma + emaBuffer

    // Method 4: Percentage trailing
    const pctStopLong = currentPrice * (1 - 0.03)
    const pctStopShort = currentPrice * (1 + 0.03)

    // Select active method
    let stopLoss
    if (method === 'atr') stopLoss = side === 'long' ? atrStopLong : atrStopShort
    else if (method === 'chandelier') stopLoss = side === 'long' ? chandelierLong : chandelierShort
    else if (method === 'ema') stopLoss = side === 'long' ? emaStopLong : emaStopShort
    else if (method === 'pct') stopLoss = side === 'long' ? pctStopLong : pctStopShort

    const stopDistance = Math.abs(currentPrice - stopLoss)
    const stopDistancePct = (stopDistance / currentPrice) * 100

    // Risk per unit
    const riskPerUnit = stopDistance

    // Position from accounts
    let hasPosition = false
    let posEntry = 0
    let posQty = 0
    let posSide = ''
    for (const acc of Object.values(accounts || {})) {
      for (const pos of Object.values(acc.positions || {})) {
        if (pos.symbol === symbol) {
          hasPosition = true
          posEntry = pos.entry_price
          posQty = pos.quantity
          posSide = pos.side === 'LONG' || pos.side === 'BUY' ? 'long' : 'short'
        }
      }
    }

    // If has position, calculate P&L at stop
    const posPnlAtStop = hasPosition
      ? (posSide === 'long' ? (stopLoss - posEntry) : (posEntry - stopLoss)) * posQty
      : 0

    // Historical ATR for volatility check
    const atrSeries = validAtr.slice(-20)
    const avgAtr = atrSeries.length > 0 ? atrSeries.reduce((s, v) => s + v, 0) / atrSeries.length : 0
    const atrRatio = avgAtr > 0 ? lastAtr / avgAtr : 1

    // All methods summary
    const allMethods = [
      { name: 'ATR', stop: side === 'long' ? atrStopLong : atrStopShort, dist: Math.abs(currentPrice - (side === 'long' ? atrStopLong : atrStopShort)) },
      { name: 'Chandelier', stop: side === 'long' ? chandelierLong : chandelierShort, dist: Math.abs(currentPrice - (side === 'long' ? chandelierLong : chandelierShort)) },
      { name: 'EMA 21', stop: side === 'long' ? emaStopLong : emaStopShort, dist: Math.abs(currentPrice - (side === 'long' ? emaStopLong : emaStopShort)) },
      { name: '3% Fixed', stop: side === 'long' ? pctStopLong : pctStopShort, dist: Math.abs(currentPrice - (side === 'long' ? pctStopLong : pctStopShort)) },
    ]

    return {
      stopLoss, stopDistance, stopDistancePct, riskPerUnit,
      lastAtr, atrRatio, lastEma, highestHigh, lowestLow,
      hasPosition, posEntry, posQty, posSide, posPnlAtStop,
      allMethods,
    }
  }, [candles, accounts, currentPrice, symbol, exchange, method, atrMult, chandelierPeriod, side])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Crosshair size={12} className="text-accent-blue" />
          Trailing Stop Calculator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { stopLoss, stopDistance, stopDistancePct, lastAtr, atrRatio, lastEma, highestHigh, lowestLow, hasPosition, posEntry, posQty, posSide, posPnlAtStop, allMethods } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Crosshair size={12} className="text-accent-blue" />
        Trailing Stop Calculator
      </div>

      {/* Side toggle */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setSide('long')}
          className={'flex-1 py-1 text-[10px] rounded ' + (side === 'long' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-600 text-gray-500')}
        >
          <TrendingUp size={10} className="inline mr-0.5" />
          Long
        </button>
        <button
          onClick={() => setSide('short')}
          className={'flex-1 py-1 text-[10px] rounded ' + (side === 'short' ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-600 text-gray-500')}
        >
          <TrendingDown size={10} className="inline mr-0.5" />
          Short
        </button>
      </div>

      {/* Method selector */}
      <div className="mb-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
        >
          <option value="atr">ATR Trailing</option>
          <option value="chandelier">Chandelier Exit</option>
          <option value="ema">EMA 21 + Buffer</option>
          <option value="pct">3% Fixed</option>
        </select>
      </div>

      {/* ATR multiplier (for ATR/Chandelier) */}
      {(method === 'atr' || method === 'chandelier') && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[8px] text-gray-600">ATR Multiplier:</span>
          <input
            type="number"
            value={atrMult}
            step="0.1"
            min="0.5"
            max="5"
            onChange={e => setAtrMult(Number(e.target.value) || 2)}
            className="w-14 bg-bg-800 border border-bg-600 rounded px-1 py-0.5 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
      )}

      {/* Results */}
      <div className="bg-bg-800 rounded px-2 py-1.5 mb-2">
        <div className="text-[8px] text-gray-600">Trailing Stop</div>
        <div className={'text-sm font-mono font-bold ' + (side === 'long' ? 'text-accent-red' : 'text-accent-red')}>
          {formatPrice(stopLoss)}
        </div>
        <div className="text-[8px] text-gray-500">{stopDistancePct.toFixed(2)}% away</div>
      </div>

      {/* All methods comparison */}
      <div className="space-y-0.5 mb-2">
        <div className="text-[8px] text-gray-600">All methods:</div>
        {allMethods.map((m, i) => (
          <div key={i} className="flex justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
            <span className="text-gray-500">{m.name}</span>
            <span className="font-mono text-gray-400">{formatPrice(m.stop)} ({((m.dist / currentPrice) * 100).toFixed(2)}%)</span>
          </div>
        ))}
      </div>

      {/* ATR info */}
      <div className="grid grid-cols-2 gap-1 text-[8px] mb-2">
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">ATR(14)</span>
          <div className="font-mono text-gray-300">{formatPrice(lastAtr)}</div>
        </div>
        <div className="bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">ATR Ratio</span>
          <div className={'font-mono ' + (atrRatio > 1.5 ? 'text-accent-yellow' : 'text-gray-400')}>{atrRatio.toFixed(2)}x</div>
        </div>
      </div>

      {/* Position info */}
      {hasPosition && (
        <div className="bg-bg-800 rounded px-2 py-1.5 mb-2">
          <div className="text-[8px] text-gray-600 mb-0.5">Your Position ({posSide})</div>
          <div className="grid grid-cols-2 gap-1 text-[8px]">
            <div>
              <span className="text-gray-600">Entry</span>
              <div className="font-mono text-gray-300">{formatPrice(posEntry)}</div>
            </div>
            <div>
              <span className="text-gray-600">P&L at Stop</span>
              <div className={'font-mono ' + (posPnlAtStop >= 0 ? 'text-accent-green' : 'text-accent-red')}>
                {posPnlAtStop >= 0 ? '+' : ''}{posPnlAtStop.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        ATR-based trailing adapts to volatility. Chandelier uses recent high/low. EMA follows trend.
      </div>
    </div>
  )
}
