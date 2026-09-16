import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VariationalAutoencoder from '../components/VariationalAutoencoder'

const mkCandles = (exchange, symbol) =>
  Array.from({ length: 150 }, (_, i) => ({
    exchange, symbol, timestamp: 1704067200 + i * 300,
    open: 100 + i * 0.1, high: 101 + i * 0.1,
    low: 99 + i * 0.1, close: 100 + i * 0.1, volume: 100,
  }))

const baseProps = {
  candles: mkCandles('binance', 'BTC/USDT'),
  symbol: 'BTC/USDT',
  exchange: 'binance',
}

const inputFor = (container, labelText) => {
  const label = [...container.querySelectorAll('label')].find(l => l.textContent.includes(labelText))
  return label.querySelector('input')
}

describe('VariationalAutoencoder', () => {
  it('renders loss/latent/recon charts with finite geometry', () => {
    const { container } = render(<VariationalAutoencoder {...baseProps} />)
    expect(screen.getByText(/Variational Autoencoder/)).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('NaN')
  })

  // decoder backprop indexed Wout as [hidden][input] though it is
  // [input][hidden] — square defaults (8,8) masked it. Asymmetric dims
  // (windowSize=4 or hiddenDim=4) produced TypeError / NaN geometry.
  it('handles asymmetric dims (window≠hidden) without crash or NaN', () => {
    const { container } = render(<VariationalAutoencoder {...baseProps} />)
    fireEvent.change(inputFor(container, 'Window'), { target: { value: '1' } }) // clamps to 4
    expect(container.innerHTML).not.toContain('NaN')
    fireEvent.change(inputFor(container, 'Hidden dim'), { target: { value: '1' } }) // clamps to 4
    expect(container.innerHTML).not.toContain('NaN')
    expect(screen.getByText(/Variational Autoencoder/)).toBeInTheDocument()
  })
})
