import { useExchange } from '../../contexts/ExchangeContext'
import { CoinbaseCard } from './CoinbaseTheme'

export default function CoinbaseOrderBook({ orderbookData, currentPrice }) {
  const { theme } = useExchange()
  
  if (!orderbookData || !orderbookData.bids || !orderbookData.asks) {
    return (
      <CoinbaseCard className="p-4 text-center" style={{ color: theme.textSecondary }}>
        Loading order book...
      </CoinbaseCard>
    )
  }

  const bids = orderbookData.bids.slice(0, 10)
  const asks = orderbookData.asks.slice(0, 10)
  const maxBidQty = Math.max(...bids.map(b => b.quantity))
  const maxAskQty = Math.max(...asks.map(a => a.quantity))

  const spread = asks[0]?.price - bids[0]?.price
  const spreadPercent = currentPrice > 0 ? (spread / currentPrice) * 100 : 0

  return (
    <CoinbaseCard className="flex flex-col h-full">
      {/* Header */}
      <div 
        className="px-3 py-2 text-xs font-medium border-b flex justify-between items-center"
        style={{ 
          color: theme.text,
          borderColor: theme.border,
        }}
      >
        <span>Order Book</span>
        <span style={{ color: theme.textSecondary }}>
          Spread: {spread?.toFixed(2)} ({spreadPercent?.toFixed(3)}%)
        </span>
      </div>

      {/* Column headers */}
      <div 
        className="px-3 py-1 text-xs flex justify-between border-b"
        style={{ 
          color: theme.textSecondary,
          borderColor: theme.border,
        }}
      >
        <span className="w-1/3">Price (USDT)</span>
        <span className="w-1/3 text-right">Amount</span>
        <span className="w-1/3 text-right">Total</span>
      </div>

      {/* Asks (sells) - red, reversed to show highest at top */}
      <div className="flex-1 overflow-y-auto">
        {[...asks].reverse().map((ask, i) => {
          const widthPercent = (ask.quantity / maxAskQty) * 100
          return (
            <div 
              key={`ask-${i}`}
              className="px-3 py-1 text-xs flex justify-between items-center relative"
              style={{ color: theme.danger }}
            >
              <div 
                className="absolute right-0 top-0 bottom-0 opacity-10"
                style={{ 
                  width: `${widthPercent}%`,
                  backgroundColor: theme.danger,
                }}
              />
              <span className="w-1/3 relative z-10">{ask.price.toFixed(2)}</span>
              <span className="w-1/3 text-right relative z-10">{ask.quantity.toFixed(4)}</span>
              <span className="w-1/3 text-right relative z-10">
                {(ask.price * ask.quantity).toFixed(2)}
              </span>
            </div>
          )
        })}

        {/* Current price spread */}
        <div 
          className="px-3 py-2 text-xs text-center border-y"
          style={{ 
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          {currentPrice?.toFixed(2) || '0.00'}
        </div>

        {/* Bids (buys) - green */}
        {bids.map((bid, i) => {
          const widthPercent = (bid.quantity / maxBidQty) * 100
          return (
            <div 
              key={`bid-${i}`}
              className="px-3 py-1 text-xs flex justify-between items-center relative"
              style={{ color: theme.success }}
            >
              <div 
                className="absolute right-0 top-0 bottom-0 opacity-10"
                style={{ 
                  width: `${widthPercent}%`,
                  backgroundColor: theme.success,
                }}
              />
              <span className="w-1/3 relative z-10">{bid.price.toFixed(2)}</span>
              <span className="w-1/3 text-right relative z-10">{bid.quantity.toFixed(4)}</span>
              <span className="w-1/3 text-right relative z-10">
                {(bid.price * bid.quantity).toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div 
        className="px-3 py-2 text-xs border-t"
        style={{ 
          color: theme.textSecondary,
          borderColor: theme.border,
        }}
      >
        <div className="flex justify-between">
          <span>Max Bid: {bids[0]?.price?.toFixed(2) || '0.00'}</span>
          <span>Min Ask: {asks[0]?.price?.toFixed(2) || '0.00'}</span>
        </div>
      </div>
    </CoinbaseCard>
  )
}
