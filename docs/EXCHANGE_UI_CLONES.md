# Exchange UI Clones

This document describes the exchange-themed UI clones implemented in the HFT Trading System Web UI.

## Overview

The system includes three exchange-themed UI clones that replicate the look and feel of popular cryptocurrency exchanges while maintaining the underlying functionality of the HFT Trading System. This provides users with a familiar trading interface while leveraging the system's advanced features.

## Supported Exchanges

- **Binance** - Dark theme with yellow accents, compact layout
- **Bybit** - Dark theme with blue accents, minimal design
- **Coinbase** - Light/dark theme with blue accents, clean interface

## Architecture

### Exchange Context

The `ExchangeContext` provides global exchange state management:

```jsx
// src/contexts/ExchangeContext.jsx
const EXCHANGE_THEMES = {
  binance: {
    primary: '#FCD535',
    secondary: '#1E2329',
    background: '#161A1E',
    text: '#EAECEF',
    textSecondary: '#848E9C',
    border: '#2B3139',
    success: '#0ECB81',
    danger: '#F6465D',
  },
  bybit: {
    primary: '#F0B90B',
    secondary: '#191919',
    background: '#0B0E11',
    text: '#EAECEF',
    textSecondary: '#848E9C',
    border: '#2A2A2A',
    success: '#00E396',
    danger: '#FF453A',
  },
  coinbase: {
    primary: '#0052FF',
    secondary: '#FFFFFF',
    background: '#F5F7F9',
    text: '#050F2E',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    success: '#10B981',
    danger: '#EF4444',
  },
}
```

### Exchange Selector

The `ExchangeSelector` component allows users to switch between exchanges:

```jsx
import { ExchangeSelector } from './components/ExchangeSelector'

function App() {
  return (
    <ExchangeProvider>
      <ExchangeSelector />
      {/* Rest of app */}
    </ExchangeProvider>
  )
}
```

## Binance UI Clone

### Theme

- **Primary Color**: Yellow (#FCD535)
- **Background**: Dark (#161A1E)
- **Layout**: Compact, information-dense
- **Typography**: System fonts, small text sizes

### Components

#### BinanceTheme
```jsx
import { BinanceThemeProvider, useBinanceTheme } from './exchanges/binance/BinanceTheme'

function MyComponent() {
  const theme = useBinanceTheme()
  return <div style={{ backgroundColor: theme.background }}>...</div>
}
```

#### BinanceLayout
- Header with exchange logo and navigation
- Three-column layout: Order Book | Chart | Order Form
- Bottom panel for positions and trade history

#### BinanceOrderForm
- Order type selector: Market, Limit, Stop-Limit, Trailing Stop, Iceberg
- Side toggle: Buy/Sell with color coding
- Price and quantity inputs
- Percentage-based quantity selection (25%, 50%, 75%, 100%)
- Advanced options: Stop Loss, Take Profit
- Order summary with estimated total

#### BinanceOrderBook
- Real-time order book display
- Bid/ask depth visualization
- Spread calculation and display
- Color-coded price levels

### Usage

```jsx
import { BinanceLayout, BinanceOrderForm, BinanceOrderBook } from './exchanges/binance'

function BinanceView() {
  return (
    <BinanceThemeProvider>
      <BinanceLayout>
        <BinanceOrderBook />
        <BinanceOrderForm />
      </BinanceLayout>
    </BinanceThemeProvider>
  )
}
```

## Bybit UI Clone

### Theme

- **Primary Color**: Yellow (#F0B90B)
- **Background**: Dark (#0B0E11)
- **Layout**: Minimal, clean
- **Typography**: System fonts, very compact

### Components

#### BybitTheme
```jsx
import { BybitThemeProvider, useBybitTheme } from './exchanges/bybit/BybitTheme'

function MyComponent() {
  const theme = useBybitTheme()
  return <div style={{ backgroundColor: theme.background }}>...</div>
}
```

#### BybitLayout
- Minimal header with exchange branding
- Two-column layout: Order Book + Chart | Order Form
- Collapsible panels for positions and history

#### BybitOrderForm
- Compact order type selector
- Minimal input fields
- Quick-trade buttons
- Real-time price display

#### BybitOrderBook
- Simplified order book display
- Depth bars with minimal styling
- Essential spread information

### Usage

```jsx
import { BybitLayout, BybitOrderForm, BybitOrderBook } from './exchanges/bybit'

function BybitView() {
  return (
    <BybitThemeProvider>
      <BybitLayout>
        <BybitOrderBook />
        <BybitOrderForm />
      </BybitLayout>
    </BybitThemeProvider>
  )
}
```

## Coinbase UI Clone

### Theme

- **Primary Color**: Blue (#0052FF)
- **Background**: Light (#F5F7F9) with dark mode support
- **Layout**: Clean, spacious
- **Typography**: System fonts, larger text sizes

### Components

#### CoinbaseTheme
```jsx
import { CoinbaseThemeProvider, useCoinbaseTheme } from './exchanges/coinbase/CoinbaseTheme'

function MyComponent() {
  const theme = useCoinbaseTheme()
  return <div style={{ backgroundColor: theme.background }}>...</div>
}
```

#### CoinbaseLayout
- Clean header with navigation
- Centered layout with generous spacing
- Bottom panel for account information

#### CoinbaseOrderForm
- Large, clear input fields
- Prominent buy/sell buttons
- Clear order type selection
- Detailed order summary

#### CoinbaseOrderBook
- Clean order book display
- Subtle depth visualization
- Clear spread information

### Usage

```jsx
import { CoinbaseLayout, CoinbaseOrderForm, CoinbaseOrderBook } from './exchanges/coinbase'

function CoinbaseView() {
  return (
    <CoinbaseThemeProvider>
      <CoinbaseLayout>
        <CoinbaseOrderBook />
        <CoinbaseOrderForm />
      </CoinbaseLayout>
    </CoinbaseThemeProvider>
  )
}
```

## Advanced Order Type Support

All exchange UI clones support the advanced order types implemented in the system:

### Stop-Limit Orders

```jsx
// Binance example
{orderType === 'stop_limit' && (
  <>
    <input placeholder="Stop Price" value={stopPrice} onChange={setStopPrice} />
    <input placeholder="Limit Price" value={price} onChange={setPrice} />
  </>
)}
```

### Trailing Stop Orders

```jsx
// Bybit example
{orderType === 'trailing_stop' && (
  <>
    <input placeholder="Trail Amount" value={trailAmount} onChange={setTrailAmount} />
    <label>
      <input type="checkbox" checked={trailPercentage} onChange={setTrailPercentage} />
      Use Percentage
    </label>
  </>
)}
```

### Iceberg Orders

```jsx
// Coinbase example
{orderType === 'iceberg' && (
  <>
    <input placeholder="Visible Quantity" value={icebergVisible} onChange={setIcebergVisible} />
    <input placeholder="Hidden Quantity" value={icebergHidden} onChange={setIcebergHidden} />
    <input placeholder="Slice Size" value={icebergSlice} onChange={setIcebergSlice} />
  </>
)}
```

## Switching Between Exchanges

### Programmatic Switch

```jsx
import { useExchange } from './contexts/ExchangeContext'

function ExchangeSwitcher() {
  const { selectedExchange, setSelectedExchange } = useExchange()
  
  return (
    <select value={selectedExchange} onChange={(e) => setSelectedExchange(e.target.value)}>
      <option value="binance">Binance</option>
      <option value="bybit">Bybit</option>
      <option value="coinbase">Coinbase</option>
    </select>
  )
}
```

### Using ExchangeSelector Component

```jsx
import { ExchangeSelector } from './components/ExchangeSelector'

function App() {
  return <ExchangeSelector />
}
```

## Customization

### Adding a New Exchange

1. Create theme configuration in `ExchangeContext.jsx`
2. Create exchange-specific components in `src/exchanges/{exchange}/`
3. Implement required components: Theme, Layout, OrderForm, OrderBook
4. Add exchange to selector options

### Custom Themes

```jsx
// Custom theme example
const customTheme = {
  primary: '#FF0000',
  secondary: '#000000',
  background: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#888888',
  border: '#333333',
  success: '#00FF00',
  danger: '#FF0000',
}
```

## Performance Considerations

- **Lazy Loading**: Exchange components are lazy-loaded to reduce initial bundle size
- **Theme Caching**: Theme values are memoized to prevent unnecessary re-renders
- **CSS Variables**: Themes use CSS variables for efficient style updates
- **Component Reuse**: Shared components where possible to reduce code duplication

## Accessibility

- **Keyboard Navigation**: All exchange UIs support keyboard navigation
- **ARIA Labels**: Proper ARIA labels for screen readers
- **Color Contrast**: WCAG AA compliant color contrast ratios
- **Focus Indicators**: Clear focus indicators for keyboard users

## Testing

### Unit Tests

```jsx
import { render, screen } from '@testing-library/react'
import { BinanceOrderForm } from './exchanges/binance/BinanceOrderForm'

test('renders order type selector', () => {
  render(<BinanceOrderForm />)
  expect(screen.getByText('Market')).toBeInTheDocument()
})
```

### Integration Tests

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ExchangeProvider, ExchangeSelector } from './contexts/ExchangeContext'

test('switches between exchanges', () => {
  render(
    <ExchangeProvider>
      <ExchangeSelector />
    </ExchangeProvider>
  )
  
  fireEvent.click(screen.getByText('Bybit'))
  expect(screen.getByText('Bybit')).toHaveClass('active')
})
```

## References

- [Exchange Context](../web-ui/src/contexts/ExchangeContext.jsx)
- [Exchange Selector](../web-ui/src/components/ExchangeSelector.jsx)
- [Binance Components](../web-ui/src/exchanges/binance/)
- [Bybit Components](../web-ui/src/exchanges/bybit/)
- [Coinbase Components](../web-ui/src/exchanges/coinbase/)
- [Advanced Order Types](ADVANCED_ORDER_TYPES.md)
