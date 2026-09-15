import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderFlowAbsorption from '../components/OrderFlowAbsorption'
import { generateInitialSnapshot } from '../utils/mockData'

const snapshot = generateInitialSnapshot()
const candles = snapshot.candles.filter(c => c.exchange === 'binance' && c.symbol === 'BTCUSDT')

describe('OrderFlowAbsorption', () => {
  it('renders with object-shaped orderbook levels (wire format)', () => {
    const { container } = render(
      <OrderFlowAbsorption
        candles={snapshot.candles} fills={[]} orderbooks={snapshot.orderbooks}
        symbol="BTCUSDT" exchange="binance"
      />
    )
    expect(screen.getByText('Order Flow Absorption Detector')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('shows empty state with insufficient candles', () => {
    render(
      <OrderFlowAbsorption
        candles={candles.slice(0, 5)} fills={[]} orderbooks={{}}
        symbol="BTCUSDT" exchange="binance"
      />
    )
    expect(screen.getByText('Not enough data')).toBeInTheDocument()
  })
})
