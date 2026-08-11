import { useExchange } from '../../contexts/ExchangeContext'

// Coinbase-specific theme utilities and components
export function useCoinbaseTheme() {
  const { theme } = useExchange()
  return theme
}

export function CoinbaseThemeProvider({ children }) {
  const { theme } = useExchange()
  
  return (
    <div 
      className="coinbase-theme"
      style={{
        '--coinbase-primary': theme.primary,
        '--coinbase-primary-dark': theme.primaryDark,
        '--coinbase-background': theme.background,
        '--coinbase-surface': theme.surface,
        '--coinbase-text': theme.text,
        '--coinbase-text-secondary': theme.textSecondary,
        '--coinbase-success': theme.success,
        '--coinbase-danger': theme.danger,
        '--coinbase-warning': theme.warning,
        '--coinbase-border': theme.border,
        '--coinbase-grid': theme.grid,
        '--coinbase-accent': theme.accent,
      }}
    >
      {children}
    </div>
  )
}

// Coinbase-specific styled components
export function CoinbaseButton({ children, variant = 'primary', className = '', ...props }) {
  const { theme } = useExchange()
  
  const baseStyles = 'px-4 py-2 rounded font-medium transition-all text-sm'
  const variants = {
    primary: `text-white hover:opacity-90`,
    secondary: `bg-[#121212] text-white hover:bg-[#2A2A2A]`,
    success: `text-white hover:opacity-90`,
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

export function CoinbaseCard({ children, className = '', ...props }) {
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

export function CoinbasePriceDisplay({ price, change, className = '' }) {
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
