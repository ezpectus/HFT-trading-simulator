import { useExchange } from '../../contexts/ExchangeContext'

// Binance-specific theme utilities and components
export function useBinanceTheme() {
  const { theme } = useExchange()
  return theme
}

export function BinanceThemeProvider({ children }) {
  const { theme } = useExchange()
  
  return (
    <div 
      className="binance-theme"
      style={{
        '--binance-primary': theme.primary,
        '--binance-primary-dark': theme.primaryDark,
        '--binance-background': theme.background,
        '--binance-surface': theme.surface,
        '--binance-text': theme.text,
        '--binance-text-secondary': theme.textSecondary,
        '--binance-success': theme.success,
        '--binance-danger': theme.danger,
        '--binance-warning': theme.warning,
        '--binance-border': theme.border,
        '--binance-grid': theme.grid,
        '--binance-accent': theme.accent,
      }}
    >
      {children}
    </div>
  )
}

// Binance-specific styled components
export function BinanceButton({ children, variant = 'primary', className = '', ...props }) {
  const { theme } = useExchange()
  
  const baseStyles = 'px-4 py-2 rounded font-medium transition-all text-sm'
  const variants = {
    primary: `text-black hover:opacity-90`,
    secondary: `bg-bg-700 text-white hover:bg-bg-600`,
    success: `text-black hover:opacity-90`,
    danger: `text-white hover:opacity-90`,
  }
  
  const variantStyles = variants[variant] || variants.primary
  const bgStyles = variant === 'primary' || variant === 'success' 
    ? { backgroundColor: variant === 'success' ? theme.success : theme.primary }
    : {}
  
  return (
    <button
      className={`${baseStyles} ${variantStyles} ${className}`}
      style={bgStyles}
      {...props}
    >
      {children}
    </button>
  )
}

export function BinanceCard({ children, className = '', ...props }) {
  const { theme } = useExchange()
  
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        backgroundColor: theme.surface,
        border: `1px solid ${theme.border}`,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function BinancePriceDisplay({ price, change, className = '' }) {
  const { theme } = useExchange()
  const isPositive = change >= 0
  
  return (
    <div className={className}>
      <span className="text-lg font-bold" style={{ color: theme.text }}>
        ${price?.toFixed(2) || '0.00'}
      </span>
      {change !== undefined && (
        <span 
          className="ml-2 text-sm"
          style={{ color: isPositive ? theme.success : theme.danger }}
        >
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </span>
      )}
    </div>
  )
}
