import { useExchange } from '../../contexts/ExchangeContext'

// Bybit-specific theme utilities and components
export function useBybitTheme() {
  const { theme } = useExchange()
  return theme
}

export function BybitThemeProvider({ children }) {
  const { theme } = useExchange()
  
  return (
    <div 
      className="bybit-theme"
      style={{
        '--bybit-primary': theme.primary,
        '--bybit-primary-dark': theme.primaryDark,
        '--bybit-background': theme.background,
        '--bybit-surface': theme.surface,
        '--bybit-text': theme.text,
        '--bybit-text-secondary': theme.textSecondary,
        '--bybit-success': theme.success,
        '--bybit-danger': theme.danger,
        '--bybit-warning': theme.warning,
        '--bybit-border': theme.border,
        '--bybit-grid': theme.grid,
        '--bybit-accent': theme.accent,
      }}
    >
      {children}
    </div>
  )
}

// Bybit-specific styled components
export function BybitButton({ children, variant = 'primary', className = '', ...props }) {
  const { theme } = useExchange()
  
  const baseStyles = 'px-4 py-2 rounded font-medium transition-all text-sm'
  const variants = {
    primary: `text-black hover:opacity-90`,
    secondary: `bg-[#191919] text-white hover:bg-[#2A2A2A]`,
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

export function BybitCard({ children, className = '', ...props }) {
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

export function BybitPriceDisplay({ price, change, className = '' }) {
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
