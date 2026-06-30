import { useState, useMemo } from 'react'
import { ShoppingCart, Loader2, Calculator, AlertTriangle } from 'lucide-react'
import { formatPrice } from '../utils/format'

const EXCHANGE_FEES = { binance: 0.04, bybit: 0.06, okx: 0.05 }
const EXCHANGE_SLIPPAGE = { binance: 2.0, bybit: 3.0, okx: 2.5 }
const DEFAULT_LEVERAGE = 10
const MAINTENANCE_MARGIN_RATE = 0.005 // 0.5%

export default function OrderForm({ exchange, symbol, currentPrice, onSubmit, connected, balance }) {
  const [side, setSide] = useState('BUY')
  const [orderType, setOrderType] = useState('MARKET')
  const [quantity, setQuantity] = useState('0.01')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastMsg, setLastMsg] = useState(null)
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE)
  const [showRiskCalc, setShowRiskCalc] = useState(false)

  const availBalance = balance || 10000

  const setQtyFromBalance = (pct) => {
    if (!currentPrice || currentPrice <= 0) return
    const notional = availBalance * pct / 100
    const qty = notional / currentPrice
    setQuantity(qty.toFixed(4))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!connected) return

    setSubmitting(true)
    const order = {
      exchange,
      symbol,
      side,
      quantity: parseFloat(quantity),
      order_type: orderType,
    }
    if (stopLoss) order.stop_loss = parseFloat(stopLoss)
    if (takeProfit) order.take_profit = parseFloat(takeProfit)

    const ok = onSubmit(order)
    setLastMsg(ok ? { type: 'success', text: 'Order submitted' } : { type: 'error', text: 'Not connected' })
    setTimeout(() => setSubmitting(false), 500)
    setTimeout(() => setLastMsg(null), 3000)
  }

  const notional = (parseFloat(quantity) || 0) * currentPrice

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-bg-600">
        <ShoppingCart size={16} className="text-accent-blue" />
        <span className="text-sm font-medium">Place Order</span>
        <span className="text-xs text-gray-500 ml-auto">{exchange} · {symbol}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-3 flex flex-col gap-2">
        {/* Side toggle */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${
              side === 'BUY'
                ? 'bg-accent-green text-white'
                : 'bg-bg-600 text-gray-400 hover:bg-bg-500'
            }`}
          >
            BUY / LONG
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${
              side === 'SELL'
                ? 'bg-accent-red text-white'
                : 'bg-bg-600 text-gray-400 hover:bg-bg-500'
            }`}
          >
            SELL / SHORT
          </button>
        </div>

        {/* Order type */}
        <div className="flex gap-1">
          {['MARKET', 'LIMIT'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1 text-xs font-medium rounded ${
                orderType === t ? 'bg-bg-500 text-white' : 'bg-bg-600 text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Quantity */}
        <div>
          <label className="text-xs text-gray-500">Quantity</label>
          <input
            type="number"
            step="0.001"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-full bg-bg-600 text-gray-200 text-sm rounded px-2 py-1.5 border border-bg-500 focus:outline-none focus:border-accent-blue font-mono"
          />
          {/* Quick size buttons */}
          <div className="flex gap-1 mt-1">
            {[25, 50, 75, 100].map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => setQtyFromBalance(pct)}
                className="flex-1 py-0.5 text-[10px] font-medium rounded bg-bg-600 text-gray-400 hover:bg-bg-500 hover:text-gray-200 transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Notional + fees */}
        <div className="text-xs text-gray-500 font-mono space-y-0.5">
          <div>Notional: ${formatPrice(notional)}</div>
          <div className="flex justify-between">
            <span>Fee ({EXCHANGE_FEES[exchange] || 0.05}%):</span>
            <span className="text-gray-400">${formatPrice(notional * (EXCHANGE_FEES[exchange] || 0.05) / 100, 4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Slippage ({EXCHANGE_SLIPPAGE[exchange] || 2.5}bps):</span>
            <span className="text-gray-400">${formatPrice(notional * (EXCHANGE_SLIPPAGE[exchange] || 2.5) / 10000, 4)}</span>
          </div>
          <div className="flex justify-between border-t border-bg-600 pt-0.5">
            <span>Total cost:</span>
            <span className="text-gray-300">
              ${formatPrice(notional * ((EXCHANGE_FEES[exchange] || 0.05) / 100 + (EXCHANGE_SLIPPAGE[exchange] || 2.5) / 10000), 4)}
            </span>
          </div>
        </div>

        {/* SL / TP */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Stop Loss</label>
            <input
              type="number"
              step="0.01"
              placeholder={currentPrice ? formatPrice(currentPrice * 0.98) : ''}
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              className="w-full bg-bg-600 text-gray-200 text-sm rounded px-2 py-1.5 border border-bg-500 focus:outline-none focus:border-accent-red font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Take Profit</label>
            <input
              type="number"
              step="0.01"
              placeholder={currentPrice ? formatPrice(currentPrice * 1.04) : ''}
              value={takeProfit}
              onChange={e => setTakeProfit(e.target.value)}
              className="w-full bg-bg-600 text-gray-200 text-sm rounded px-2 py-1.5 border border-bg-500 focus:outline-none focus:border-accent-green font-mono"
            />
          </div>
        </div>

        {/* Leverage selector */}
        <div>
          <label className="text-xs text-gray-500">Leverage: <span className="text-accent-yellow font-mono">{leverage}x</span></label>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={leverage}
            onChange={e => setLeverage(parseInt(e.target.value))}
            className="w-full accent-accent-yellow"
          />
        </div>

        {/* Risk Calculator toggle */}
        <button
          type="button"
          onClick={() => setShowRiskCalc(!showRiskCalc)}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Calculator size={10} />
          {showRiskCalc ? 'Hide' : 'Show'} Risk Calculator
        </button>

        {/* Risk Calculator panel */}
        {showRiskCalc && currentPrice > 0 && (() => {
          const qty = parseFloat(quantity) || 0
          const entryPrice = currentPrice
          const notionalVal = qty * entryPrice
          const marginRequired = notionalVal / leverage
          const fee = notionalVal * (EXCHANGE_FEES[exchange] || 0.05) / 100
          const slPrice = stopLoss ? parseFloat(stopLoss) : entryPrice * 0.98
          const tpPrice = takeProfit ? parseFloat(takeProfit) : entryPrice * 1.04
          const isLong = side === 'BUY'
          const slDistPct = Math.abs((slPrice - entryPrice) / entryPrice * 100)
          const tpDistPct = Math.abs((tpPrice - entryPrice) / entryPrice * 100)
          const slLoss = isLong ? (slPrice - entryPrice) * qty : (entryPrice - slPrice) * qty
          const tpProfit = isLong ? (tpPrice - entryPrice) * qty : (entryPrice - tpPrice) * qty
          const riskReward = Math.abs(slLoss) > 0 ? Math.abs(tpProfit / slLoss) : 0
          const liqPrice = isLong
            ? entryPrice * (1 - 1/leverage + MAINTENANCE_MARGIN_RATE)
            : entryPrice * (1 + 1/leverage - MAINTENANCE_MARGIN_RATE)
          const marginPct = availBalance > 0 ? (marginRequired / availBalance * 100) : 0
          const marginDanger = marginPct > 80

          return (
            <div className="bg-bg-700 rounded p-2 space-y-1 text-[10px] font-mono">
              <div className="flex justify-between">
                <span className="text-gray-500">Margin Required</span>
                <span className={marginDanger ? 'text-accent-red' : 'text-gray-300'}>
                  ${formatPrice(marginRequired)} ({marginPct.toFixed(1)}% of balance)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Liquidation Price</span>
                <span className="text-accent-red">${formatPrice(liqPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SL Distance</span>
                <span className="text-gray-300">{slDistPct.toFixed(2)}% → ${formatPrice(slLoss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">TP Distance</span>
                <span className="text-accent-green">{tpDistPct.toFixed(2)}% → ${formatPrice(tpProfit)}</span>
              </div>
              <div className="flex justify-between border-t border-bg-600 pt-1">
                <span className="text-gray-500">Risk/Reward</span>
                <span className={riskReward >= 2 ? 'text-accent-green' : riskReward >= 1 ? 'text-accent-yellow' : 'text-accent-red'}>
                  1:{riskReward.toFixed(2)}
                </span>
              </div>
              {marginDanger && (
                <div className="flex items-center gap-1 text-accent-red pt-1">
                  <AlertTriangle size={10} />
                  High margin usage — liquidation risk!
                </div>
              )}
            </div>
          )
        })()}

        {/* Submit */}
        <button
          type="submit"
          disabled={!connected || submitting}
          className={`py-2 text-sm font-semibold rounded transition-all ${
            side === 'BUY'
              ? 'bg-accent-green hover:bg-green-600 text-white'
              : 'bg-accent-red hover:bg-red-600 text-white'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin mx-auto" />
          ) : (
            `${side} ${quantity} ${symbol}`
          )}
        </button>

        {lastMsg && (
          <div className={`text-xs ${lastMsg.type === 'success' ? 'text-accent-green' : 'text-accent-red'}`}>
            {lastMsg.text}
          </div>
        )}
      </form>
    </div>
  )
}
