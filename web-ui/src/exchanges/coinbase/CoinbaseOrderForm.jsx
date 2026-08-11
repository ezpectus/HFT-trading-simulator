import { useState } from 'react'
import { useExchange } from '../../contexts/ExchangeContext'
import { CoinbaseButton, CoinbaseCard } from './CoinbaseTheme'

export default function CoinbaseOrderForm({ 
  symbol, 
  currentPrice, 
  onSubmit, 
  connected, 
  tradingActive,
  balance 
}) {
  const { theme } = useExchange()
  const [side, setSide] = useState('buy')
  const [orderType, setOrderType] = useState('market')
  const [price, setPrice] = useState(currentPrice?.toFixed(2) || '')
  const [quantity, setQuantity] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [stopPrice, setStopPrice] = useState('')
  const [trailAmount, setTrailAmount] = useState('')
  const [trailPercentage, setTrailPercentage] = useState(true)
  const [icebergVisible, setIcebergVisible] = useState('')
  const [icebergHidden, setIcebergHidden] = useState('')
  const [icebergSlice, setIcebergSlice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!connected || !tradingActive) return
    
    const orderData = {
      symbol,
      side,
      order_type: orderType.toUpperCase(),
      quantity: parseFloat(quantity),
      price: orderType === 'limit' ? parseFloat(price) : undefined,
    }

    if (orderType === 'stop_limit') {
      orderData.stop_price = parseFloat(stopPrice)
      orderData.limit_price = parseFloat(price)
    } else if (orderType === 'trailing_stop') {
      orderData.trail_amount = parseFloat(trailAmount)
      orderData.trail_percentage = trailPercentage
    } else if (orderType === 'iceberg') {
      orderData.visible_quantity = parseFloat(icebergVisible)
      orderData.hidden_quantity = parseFloat(icebergHidden)
      orderData.slice_size = parseFloat(icebergSlice)
    }

    onSubmit(orderData)
  }

  const estimatedTotal = (parseFloat(quantity) || 0) * (parseFloat(price) || currentPrice || 0)

  return (
    <CoinbaseCard className="p-4">
      {/* Side selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-2 rounded font-medium transition-all ${
            side === 'buy' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
          style={{
            backgroundColor: side === 'buy' ? theme.success : '#121212',
          }}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-2 rounded font-medium transition-all ${
            side === 'sell' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
          style={{
            backgroundColor: side === 'sell' ? theme.danger : '#121212',
          }}
        >
          Sell
        </button>
      </div>

      {/* Order type selector */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {['market', 'limit', 'stop_limit', 'trailing_stop', 'iceberg'].map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
              orderType === type ? 'text-white' : 'text-gray-400'
            }`}
            style={{
              backgroundColor: orderType === type ? theme.primary : '#121212',
            }}
          >
            {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Price input (limit and stop-limit) */}
      {(orderType === 'limit' || orderType === 'stop_limit') && (
        <div className="mb-3">
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
            {orderType === 'stop_limit' ? 'Limit Price (USDT)' : 'Price (USDT)'}
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-3 py-2 rounded text-sm"
            style={{
              backgroundColor: '#2A2A2A',
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Stop price input (stop-limit) */}
      {orderType === 'stop_limit' && (
        <div className="mb-3">
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
            Stop Price (USDT)
          </label>
          <input
            type="number"
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            className="w-full px-3 py-2 rounded text-sm"
            style={{
              backgroundColor: '#2A2A2A',
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Trailing stop inputs */}
      {orderType === 'trailing_stop' && (
        <div className="mb-3 space-y-2">
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Trail Amount
            </label>
            <input
              type="number"
              value={trailAmount}
              onChange={(e) => setTrailAmount(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="1.0"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="trailPercentage"
              checked={trailPercentage}
              onChange={(e) => setTrailPercentage(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="trailPercentage" className="text-xs" style={{ color: theme.textSecondary }}>
              Use Percentage
            </label>
          </div>
        </div>
      )}

      {/* Iceberg order inputs */}
      {orderType === 'iceberg' && (
        <div className="mb-3 space-y-2">
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Visible Quantity
            </label>
            <input
              type="number"
              value={icebergVisible}
              onChange={(e) => setIcebergVisible(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="0.1"
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Hidden Quantity
            </label>
            <input
              type="number"
              value={icebergHidden}
              onChange={(e) => setIcebergHidden(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="1.0"
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Slice Size
            </label>
            <input
              type="number"
              value={icebergSlice}
              onChange={(e) => setIcebergSlice(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="0.1"
            />
          </div>
        </div>
      )}

      {/* Quantity input */}
      <div className="mb-3">
        <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
          Quantity ({symbol?.split('/')[0] || 'BTC'})
        </label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm"
          style={{
            backgroundColor: '#2A2A2A',
            border: `1px solid ${theme.border}`,
            color: theme.text,
          }}
          placeholder="0.00"
        />
      </div>

      {/* Percentage buttons */}
      <div className="flex gap-1 mb-4">
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            onClick={() => {
              const maxQty = (balance || 0) / (currentPrice || 1)
              setQuantity(((maxQty * pct) / 100).toFixed(6))
            }}
            className="flex-1 py-1 rounded text-xs"
            style={{
              backgroundColor: '#2A2A2A',
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Estimated total */}
      <div className="flex justify-between items-center mb-4 text-xs" style={{ color: theme.textSecondary }}>
        <span>Estimated Total</span>
        <span style={{ color: theme.text }}>
          {estimatedTotal.toFixed(2)} USDT
        </span>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-xs mb-3"
        style={{ color: theme.primary }}
      >
        {showAdvanced ? '▼ Less' : '▶ Advanced'}
      </button>

      {/* Advanced options */}
      {showAdvanced && (
        <div className="mb-4 p-3 rounded" style={{ backgroundColor: '#121212' }}>
          <div className="mb-2">
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Stop Loss
            </label>
            <input
              type="number"
              className="w-full px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Take Profit
            </label>
            <input
              type="number"
              className="w-full px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: '#2A2A2A',
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      {/* Submit button */}
      <CoinbaseButton
        variant={side === 'buy' ? 'success' : 'danger'}
        className="w-full"
        onClick={handleSubmit}
        disabled={!connected || !tradingActive}
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {symbol?.split('/')[0] || 'BTC'}
      </CoinbaseButton>

      {/* Balance display */}
      <div className="mt-3 text-center text-xs" style={{ color: theme.textSecondary }}>
        Available: {balance?.toFixed(2) || '0.00'} USDT
      </div>
    </CoinbaseCard>
  )
}
