import { useExchange } from '../../contexts/ExchangeContext'
import { BinanceCard } from './BinanceTheme'

// Binance-specific layout component
export default function BinanceLayout({ children, className = '' }) {
  const { layout } = useExchange()
  
  return (
    <div 
      className={`binance-layout flex flex-col gap-2 ${className}`}
      style={{
        backgroundColor: layout.compactMode ? '#0B0E11' : '#0B0E11',
      }}
    >
      {children}
    </div>
  )
}

// Binance header layout
export function BinanceHeader({ left, center, right }) {
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

// Binance order book layout (right side)
export function BinanceOrderBookLayout({ orderBook, recentTrades }) {
  const { theme } = useExchange()
  
  return (
    <BinanceCard className="flex flex-col h-full">
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
      {recentTrades && (
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
    </BinanceCard>
  )
}

// Binance order form layout (bottom)
export function BinanceOrderFormLayout({ orderForm }) {
  const { theme } = useExchange()
  
  return (
    <BinanceCard className="p-4">
      <div 
        className="text-xs font-medium mb-3"
        style={{ color: theme.text }}
      >
        Place Order
      </div>
      {orderForm}
    </BinanceCard>
  )
}

// Binance chart layout (main area)
export function BinanceChartLayout({ chart, depthChart }) {
  const { theme, layout } = useExchange()
  
  return (
    <div className="flex flex-col gap-2 h-full">
      <BinanceCard className="flex-1 overflow-hidden">
        {chart}
      </BinanceCard>
      {layout.showDepthChart && depthChart && (
        <BinanceCard className="h-48 overflow-hidden">
          {depthChart}
        </BinanceCard>
      )}
    </div>
  )
}
