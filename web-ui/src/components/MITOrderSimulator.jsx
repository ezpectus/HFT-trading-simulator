import { useMemo, useState } from 'react'
import { Target, TrendingUp, TrendingDown, Send, Clock } from 'lucide-react'
import { formatPrice } from '../utils/format'
import { calcATR } from '../utils/indicators'

export default function MITOrderSimulator({ candles, accounts, currentPrice, symbol, exchange, onSubmit }) {
  const [side, setSide] = useState('BUY')
  const [touchPrice, setTouchPrice] = useState('')
  const [quantity, setQuantity] = useState('0.1')
  const [autoCalc, setAutoCalc] = useState(true)
  const [atrMult, setAtrMult] = useState(1)

  const analysis = useMemo(() => {
    const symCandles = candles
      .filter(c => c.exchange === exchange && c.symbol === symbol)
      .slice(-50)
    if (symCandles.length < 15) return null

    const highs = symCandles.map(c => c.high)
    const lows = symCandles.map(c => c.low)
    const closes = symCandles.map(c => c.close)
    const atr = calcATR(highs, lows, closes, 14)
    const validAtr = atr.filter(v => !isNaN(v))
    const lastAtr = validAtr.length > 0 ? validAtr[validAtr.length - 1] : 0

    const recentHigh = Math.max(...symCandles.slice(-20).map(c => c.high))
    const recentLow = Math.min(...symCandles.slice(-20).map(c => c.low))

    // Suggested touch prices
    const buyTouch = currentPrice - lastAtr * atrMult
    const sellTouch = currentPrice + lastAtr * atrMult

    // Distance from current price
    const targetPrice = parseFloat(touchPrice) || (side === 'BUY' ? buyTouch : sellTouch)
    const distance = Math.abs(targetPrice - currentPrice)
    const distancePct = currentPrice > 0 ? (distance / currentPrice) * 100 : 0

    // Probability estimation (simplified: based on ATR range)
    const probTouch = lastAtr > 0 ? Math.min(distance / (lastAtr * 2), 1) * 100 : 50

    // Risk: if price touches and reverses
    const stopLoss = side === 'BUY' ? targetPrice - lastAtr * 0.5 : targetPrice + lastAtr * 0.5
    const takeProfit = side === 'BUY' ? targetPrice + lastAtr * 2 : targetPrice - lastAtr * 2
    const risk = Math.abs(targetPrice - stopLoss)
    const reward = Math.abs(takeProfit - targetPrice)
    const rr = risk > 0 ? reward / risk : 0

    // Account check
    const acc = accounts?.[exchange]
    const balance = acc?.balance || 0
    const qty = parseFloat(quantity) || 0
    const orderValue = targetPrice * qty
    const sufficientBalance = balance >= orderValue

    return {
      lastAtr, recentHigh, recentLow,
      buyTouch, sellTouch,
      targetPrice, distance, distancePct,
      probTouch, stopLoss, takeProfit, risk, reward, rr,
      balance, orderValue, sufficientBalance,
    }
  }, [candles, accounts, currentPrice, symbol, exchange, side, touchPrice, quantity, atrMult])

  const handleSubmit = () => {
    if (!analysis || !onSubmit) return
    const target = autoCalc
      ? (side === 'BUY' ? analysis.buyTouch : analysis.sellTouch)
      : parseFloat(touchPrice)
    if (!target || isNaN(target)) return

    onSubmit({
      exchange,
      symbol,
      side,
      order_type: 'MIT',
      quantity: parseFloat(quantity) || 0,
      touch_price: target,
      stop_loss: analysis.stopLoss,
      take_profit: analysis.takeProfit,
    })
  }

  if (!analysis) {
    return (
      <div className="bg-bg-700 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
          <Target size={12} className="text-accent-purple" />
          MIT Order Simulator
        </div>
        <div className="text-[10px] text-gray-600 italic py-2 text-center">Need 15+ candles</div>
      </div>
    )
  }

  const { lastAtr, recentHigh, recentLow, buyTouch, sellTouch, targetPrice, distance, distancePct, probTouch, stopLoss, takeProfit, risk, reward, rr, balance, orderValue, sufficientBalance } = analysis

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <Target size={12} className="text-accent-purple" />
        MIT Order Simulator
      </div>

      {/* Side selector */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setSide('BUY')}
          className={'flex-1 py-1 text-[10px] font-medium rounded transition-colors ' +
            (side === 'BUY' ? 'bg-accent-green text-white' : 'bg-bg-600 text-gray-400')}
        >
          Buy MIT
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={'flex-1 py-1 text-[10px] font-medium rounded transition-colors ' +
            (side === 'SELL' ? 'bg-accent-red text-white' : 'bg-bg-600 text-gray-400')}
        >
          Sell MIT
        </button>
      </div>

      {/* ATR multiplier */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[8px] text-gray-600">ATR Mult:</span>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.5}
          value={atrMult}
          onChange={e => setAtrMult(parseFloat(e.target.value))}
          className="flex-1 h-1"
        />
        <span className="text-[8px] font-mono text-gray-400 w-6">{atrMult}x</span>
      </div>

      {/* Touch price input */}
      <div className="mb-2">
        <div className="flex items-center gap-1 mb-1">
          <input
            type="checkbox"
            checked={autoCalc}
            onChange={e => setAutoCalc(e.target.checked)}
            className="w-3 h-3"
          />
          <span className="text-[8px] text-gray-500">Auto-calculate from ATR</span>
        </div>
        {!autoCalc && (
          <input
            type="number"
            value={touchPrice}
            onChange={e => setTouchPrice(e.target.value)}
            placeholder={side === 'BUY' ? buyTouch.toFixed(2) : sellTouch.toFixed(2)}
            className="w-full bg-bg-800 text-[10px] text-gray-300 rounded px-2 py-1 border border-bg-600 focus:border-accent-blue outline-none"
          />
        )}
        {autoCalc && (
          <div className="bg-bg-800 rounded px-2 py-1 text-[10px] font-mono text-gray-300">
            {formatPrice(side === 'BUY' ? buyTouch : sellTouch)}
          </div>
        )}
      </div>

      {/* Quantity */}
      <div className="mb-2">
        <input
          type="number"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          step="0.01"
          className="w-full bg-bg-800 text-[10px] text-gray-300 rounded px-2 py-1 border border-bg-600 focus:border-accent-blue outline-none"
          placeholder="Quantity"
        />
      </div>

      {/* Analysis */}
      <div className="space-y-0.5 mb-2">
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Current Price</span>
          <span className="font-mono text-gray-400">{formatPrice(currentPrice)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Touch Price</span>
          <span className={'font-mono ' + (side === 'BUY' ? 'text-accent-green' : 'text-accent-red')}>
            {formatPrice(targetPrice)} ({distancePct.toFixed(2)}%)
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Touch Probability</span>
          <span className={'font-mono ' + (probTouch > 60 ? 'text-accent-green' : probTouch < 30 ? 'text-accent-red' : 'text-accent-yellow')}>
            {probTouch.toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Stop Loss</span>
          <span className="font-mono text-accent-red">{formatPrice(stopLoss)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Take Profit</span>
          <span className="font-mono text-accent-green">{formatPrice(takeProfit)}</span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">R:R Ratio</span>
          <span className={'font-mono ' + (rr > 2 ? 'text-accent-green' : rr > 1 ? 'text-accent-yellow' : 'text-accent-red')}>
            1:{rr.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[8px] bg-bg-800 rounded px-1.5 py-0.5">
          <span className="text-gray-600">Order Value</span>
          <span className={'font-mono ' + (sufficientBalance ? 'text-gray-400' : 'text-accent-red')}>
            ${formatPrice(orderValue)} {!sufficientBalance && '(insufficient)'}
          </span>
        </div>
      </div>

      {/* Range context */}
      <div className="bg-bg-800 rounded px-2 py-1 mb-2">
        <div className="text-[8px] text-gray-600 mb-0.5">20-bar Range:</div>
        <div className="flex justify-between text-[8px] font-mono">
          <span className="text-accent-red">L: {formatPrice(recentLow)}</span>
          <span className="text-accent-green">H: {formatPrice(recentHigh)}</span>
        </div>
        <div className="text-[8px] text-gray-700 mt-0.5">ATR(14): {formatPrice(lastAtr)}</div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!sufficientBalance || !onSubmit}
        className={'w-full py-1.5 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1 ' +
          (side === 'BUY'
            ? 'bg-accent-green text-white hover:bg-accent-green/80 disabled:opacity-50'
            : 'bg-accent-red text-white hover:bg-accent-red/80 disabled:opacity-50')}
      >
        <Send size={10} />
        Place {side === 'BUY' ? 'Buy' : 'Sell'} MIT @ {formatPrice(targetPrice)}
      </button>

      <div className="mt-1 pt-1 border-t border-bg-600 text-[8px] text-gray-600">
        Market-if-Touched: triggers market order when price touches target. Good for breakout entries and pullback buys.
      </div>
    </div>
  )
}
