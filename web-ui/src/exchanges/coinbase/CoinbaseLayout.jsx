import { useExchange } from '../../contexts/ExchangeContext'
import { CoinbaseCard } from './CoinbaseTheme'

// Coinbase-specific layout component
export default function CoinbaseLayout({ children, className = '' }) {
  const { layout } = useExchange()
  
  return (
    <div 
      className={`coinbase-layout flex flex-col gap-2 ${className}`}
      style={{
        backgroundColor: layout.compactMode ? '#000000' : '#000000',
      }}
    >
      {children}
    </div>
  )
}

// Coinbase header layout
export function CoinbaseHeader({ left, center, right }) {
  const { theme } = useExchange()
  
  return (
    <div 
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{ 
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
    >
      <div className="flex-1">{left}</div>
      <div className="flex-1 text-center">{center}</div>
      <div className="flex-1 text-right">{right}</div>
    </div>
  )
}

// Coinbase order book layout (right side)
export function CoinbaseOrderBookLayout({ orderBook, recentTrades }) {
  const { theme, layout } = useExchange()
  
  return (
    <CoinbaseCard className="flex flex-col h-full">
      <div 
        className="px-3 py-2 text-xs font-medium border-b"
        style={{ 
          color: theme.text,
          borderColor: theme.border,
        }}
      >
        Order Book
      </div>
      <div className="flex-1 overflow-hidden">
        {orderBook}
      </div>
      {!layout.showRecentTrades && recentTrades && (
        <div 
          className="px-3 py-2 text-xs font-medium border-t"
          style={{ 
            color: theme.text,
            borderColor: theme.border,
          }}
        >
          Recent Trades
        </div>
      )}
    </CoinbaseCard>
  )
}

// Coinbase order form layout (bottom)
export function CoinbaseOrderFormLayout({ orderForm }) {
  const { theme } = useExchange()
  
  return (
    <CoinbaseCard className="p-4">
      <div 
        className="text-xs font-medium mb-3"
        style={{ color: theme.text }}
      >
        Place Order
      </div>
      {orderForm}
    </CoinbaseCard>
  )
}

// Coinbase chart layout (main area)
export function CoinbaseChartLayout({ chart, depthChart }) {
  const { theme, layout } = useExchange()
  
  return (
    <div className="flex flex-col gap-2 h-full">
      <CoinbaseCard className="flex-1 overflow-hidden">
        {chart}
      </CoinbaseCard>
      {layout.showDepthChart && depthChart && (
        <CoinbaseCard className="h-48 overflow-hidden">
          {depthChart}
        </CoinbaseCard>
      )}
    </div>
  )
}
