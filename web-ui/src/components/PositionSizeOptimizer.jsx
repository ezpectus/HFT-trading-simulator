import { useMemo, useState } from 'react'
import { Calculator, Shield, AlertTriangle } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { calcATR } from '../utils/indicators'

export default function PositionSizeOptimizer({ candles, accounts, currentPrice, symbol, exchange }) {
  const [riskPct, setRiskPct] = useState(1)
  const [stopMethod, setStopMethod] = useState('atr')
  const [manualStop, setManualStop] = useState('')
  const [leverage, setLeverage] = useState(1)

  const data = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15 || !currentPrice) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)

    // ATR-based stop
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : currentPrice * 0.02

    // Stop loss calculation
    let stopLoss
    if (stopMethod === 'atr') {
      stopLoss = currentPrice - lastAtr * 1.5
    } else if (stopMethod === 'atr2') {
      stopLoss = currentPrice - lastAtr * 2
    } else if (stopMethod === 'pct1') {
      stopLoss = currentPrice * 0.99
    } else if (stopMethod === 'pct2') {
      stopLoss = currentPrice * 0.98
    } else if (stopMethod === 'manual') {
      stopLoss = parseFloat(manualStop) || currentPrice * 0.98
    } else {
      stopLoss = currentPrice - lastAtr * 1.5
    }

    const stopDistance = currentPrice - stopLoss
    const stopDistancePct = (stopDistance / currentPrice) * 100

    // Get account balance
    let accountBalance = 10000
    let accountEquity = 10000
    if (accounts) {
      const acc = Object.values(accounts)[0]
      if (acc) {
        accountBalance = acc.balance || 10000
        accountEquity = acc.equity || accountBalance
      }
    }

    // Risk amount
    const riskAmount = accountEquity * (riskPct / 100)

    // Position size = risk amount / stop distance
    const positionSize = stopDistance > 0 ? riskAmount / stopDistance : 0
    const positionValue = positionSize * currentPrice
    const marginRequired = positionValue / leverage

    // Take profit targets (1:1, 1:2, 1:3 risk/reward)
    const tp1 = currentPrice + stopDistance * 1
    const tp2 = currentPrice + stopDistance * 2
    const tp3 = currentPrice + stopDistance * 3

    // Risk/reward check
    const marginPct = (marginRequired / accountEquity) * 100
    const isOverleveraged = marginPct > 50
    const isStopTooWide = stopDistancePct > 5

    // Kelly criterion (simplified)
    const winRate = 0.5 // assumption
    const kelly = winRate - (1 - winRate) / 3 // R:R = 3
    const kellySize = accountEquity * kelly * 0.5 // half Kelly

    return {
      stopLoss, stopDistance, stopDistancePct,
      riskAmount, positionSize, positionValue, marginRequired,
      tp1, tp2, tp3,
      marginPct, isOverleveraged, isStopTooWide,
      accountEquity, lastAtr, kellySize,
    }
  }, [candles, accounts, currentPrice, symbol, exchange, riskPct, stopMethod, manualStop, leverage])

  if (!data) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Calculator size={12} className="text-accent-green" />
          Position Size Optimizer
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Not enough data</div>
      </div>
    )
  }

  const { stopLoss, stopDistance, stopDistancePct, riskAmount, positionSize, positionValue, marginRequired, tp1, tp2, tp3, marginPct, isOverleveraged, isStopTooWide, accountEquity, lastAtr, kellySize } = data

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Calculator size={12} className="text-accent-green" />
        Position Size Optimizer
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div>
          <label className="text-[8px] text-gray-600">Risk %</label>
          <input
            type="number"
            value={riskPct}
            step="0.1"
            min="0.1"
            max="10"
            onChange={e => setRiskPct(Number(e.target.value) || 1)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
        <div>
          <label className="text-[8px] text-gray-600">Leverage</label>
          <input
            type="number"
            value={leverage}
            step="1"
            min="1"
            max="100"
            onChange={e => setLeverage(Number(e.target.value) || 1)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
      </div>

      <div className="mb-2">
        <label className="text-[8px] text-gray-600">Stop Method</label>
        <select
          value={stopMethod}
          onChange={e => setStopMethod(e.target.value)}
          className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[10px] text-gray-200 outline-none focus:border-accent-blue"
        >
          <option value="atr">ATR (1.5x)</option>
          <option value="atr2">ATR (2x)</option>
          <option value="pct1">1% Fixed</option>
          <option value="pct2">2% Fixed</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {stopMethod === 'manual' && (
        <div className="mb-2">
          <input
            type="number"
            value={manualStop}
            onChange={e => setManualStop(e.target.value)}
            placeholder={formatPrice(currentPrice * 0.98)}
            className="w-full bg-bg-800 border border-bg-600 rounded px-1.5 py-1 text-[10px] text-gray-200 font-mono outline-none focus:border-accent-blue"
          />
        </div>
      )}

      {/* Results */}
      <div className="space-y-1">
        <div className="bg-bg-800 rounded px-2 py-1.5">
          <div className="text-[8px] text-gray-600">Position Size</div>
          <div className="text-sm font-mono font-bold text-accent-green">{positionSize.toFixed(4)}</div>
          <div className="text-[8px] text-gray-500">≈ ${positionValue.toFixed(2)} notional</div>
        </div>

        <div className="grid grid-cols-2 gap-1 text-[8px]">
          <div className="bg-bg-800 rounded px-1.5 py-1">
            <span className="text-gray-600">Risk $</span>
            <div className="font-mono text-accent-red">${riskAmount.toFixed(2)}</div>
          </div>
          <div className="bg-bg-800 rounded px-1.5 py-1">
            <span className="text-gray-600">Margin</span>
            <div className="font-mono text-gray-300">${marginRequired.toFixed(2)}</div>
          </div>
          <div className="bg-bg-800 rounded px-1.5 py-1">
            <span className="text-gray-600">Stop</span>
            <div className="font-mono text-accent-red">{formatPrice(stopLoss)}</div>
          </div>
          <div className="bg-bg-800 rounded px-1.5 py-1">
            <span className="text-gray-600">Stop %</span>
            <div className="font-mono text-gray-400">{stopDistancePct.toFixed(2)}%</div>
          </div>
        </div>

        {/* TP targets */}
        <div className="bg-bg-800 rounded px-2 py-1.5">
          <div className="text-[8px] text-gray-600 mb-1">Take Profit Targets</div>
          <div className="grid grid-cols-3 gap-1 text-[8px]">
            <div>
              <span className="text-gray-600">1:1</span>
              <div className="font-mono text-accent-green">{formatPrice(tp1)}</div>
            </div>
            <div>
              <span className="text-gray-600">1:2</span>
              <div className="font-mono text-accent-green">{formatPrice(tp2)}</div>
            </div>
            <div>
              <span className="text-gray-600">1:3</span>
              <div className="font-mono text-accent-green">{formatPrice(tp3)}</div>
            </div>
          </div>
        </div>

        {/* Kelly suggestion */}
        <div className="bg-bg-800 rounded px-2 py-1 flex justify-between text-[8px]">
          <span className="text-gray-600">Half-Kelly size</span>
          <span className="font-mono text-gray-400">{kellySize.toFixed(4)} ({(kellySize * currentPrice).toFixed(0)}$)</span>
        </div>
      </div>

      {/* Warnings */}
      {(isOverleveraged || isStopTooWide) && (
        <div className="mt-2 bg-accent-red/10 border border-accent-red/20 rounded px-1.5 py-1 space-y-0.5">
          {isOverleveraged && (
            <div className="flex items-center gap-1">
              <AlertTriangle size={8} className="text-accent-red shrink-0" />
              <span className="text-[8px] text-accent-red">Margin uses {marginPct.toFixed(0)}% of equity — overleveraged</span>
            </div>
          )}
          {isStopTooWide && (
            <div className="flex items-center gap-1">
              <AlertTriangle size={8} className="text-accent-red shrink-0" />
              <span className="text-[8px] text-accent-red">Stop is {stopDistancePct.toFixed(1)}% wide — reduce size or tighten stop</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Size = (equity × risk%) / stop distance. Always risk ≤2% per trade.
      </div>
    </div>
  )
}
