import { useExchange } from '../../contexts/ExchangeContext'
import { BybitCard } from './BybitTheme'

// Bybit-specific layout component (compact mode)
export default function BybitLayout({ children, className = '' }) {
  const { layout } = useExchange()
  
  return (
    <div 
      className={`bybit-layout flex flex-col gap-1 ${className}`}
      style={{
        backgroundColor: layout.compactMode ? '#050505' : '#050505',
      }}
    >
      {children}
    </div>
  )
}

// Bybit header layout (more compact)
export function BybitHeader({ left, center, right }) {
  const { theme } = useExchange()
  
  return (
    <div 
      className="flex items-center justify-between px-3 py-2 border-b"
      style={{ 
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
    >
      <div className="flex-1 text-sm">{left}</div>
      <div className="flex-1 text-center text-sm">{center}</div>
      <div className="flex-1 text-right text-sm">{right}</div>
    </div>
  )
}

// Bybit order book layout (right side, compact)
export function BybitOrderBookLayout({ orderBook, recentTrades }) {
  const { theme } = useExchange()
  
  return (
    <BybitCard className="flex flex-col h-full">
      <div 
        className="px-2 py-1.5 text-xs font-medium border-b"
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
          className="px-2 py-1.5 text-xs font-medium border-t"
          style={{ 
            color: theme.text,
            borderColor: theme.border,
          }}
        >
          Recent Trades
        </div>
      )}
    </BybitCard>
  )
}

// Bybit order form layout (right side, compact)
export function BybitOrderFormLayout({ orderForm }) {
  const { theme } = useExchange()
  
  return (
    <BybitCard className="p-3">
      <div 
        className="text-xs font-medium mb-2"
        style={{ color: theme.text }}
      >
        Place Order
      </div>
      {orderForm}
    </BybitCard>
  )
}

// Bybit chart layout (main area)
export function BybitChartLayout({ chart, depthChart }) {
  const { theme, layout } = useExchange()
  
  return (
    <div className="flex flex-col gap-1 h-full">
      <BybitCard className="flex-1 overflow-hidden">
        {chart}
      </BybitCard>
      {layout.showDepthChart && depthChart && (
        <BybitCard className="h-40 overflow-hidden">
          {depthChart}
        </BybitCard>
      )}
    </div>
  )
}
