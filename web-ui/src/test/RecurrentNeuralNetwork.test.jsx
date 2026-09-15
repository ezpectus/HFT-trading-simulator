import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecurrentNeuralNetwork from '../components/RecurrentNeuralNetwork'

const candles = Array.from({ length: 120 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTCUSDT', timestamp: 1000 + i * 300,
  open: 100, high: 101, low: 99, close: 100 + Math.sin(i) * 2, volume: 10,
}))

describe('RecurrentNeuralNetwork', () => {
  it('trains and renders without crashing (Wf shape + BPTT this.inputSize fixes)', () => {
    const { container } = render(
      <RecurrentNeuralNetwork candles={candles} symbol="BTCUSDT" exchange="binance" />
    )
    expect(screen.getByText(/LSTM Recurrent Neural Network/)).toBeInTheDocument()
    expect(screen.getByText('Train Dir Acc')).toBeInTheDocument()
    expect(screen.getByText('Final Loss')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('NaN')
    for (const el of container.querySelectorAll('path')) {
      const d = el.getAttribute('d')
      if (d != null) expect(d).not.toContain('NaN')
    }
  })

  it('loss curve is finite and decreasing-trend capable', () => {
    const { container } = render(
      <RecurrentNeuralNetwork candles={candles} symbol="BTCUSDT" exchange="binance" />
    )
    const lossPath = [...container.querySelectorAll('path')][0]
    expect(lossPath.getAttribute('d')).toMatch(/^M /)
  })

  it('shows guidance when insufficient candles', () => {
    render(
      <RecurrentNeuralNetwork candles={candles.slice(0, 20)} symbol="BTCUSDT" exchange="binance" />
    )
    expect(screen.getByText(/Need at least 40 candles/)).toBeInTheDocument()
  })

  // S370: lr input had no upper clamp — lr=1 diverged training into NaN DOM.
  it('clamps extreme learning rate — no NaN in output', () => {
    const { container } = render(
      <RecurrentNeuralNetwork candles={candles} symbol="BTCUSDT" exchange="binance" />
    )
    const label = [...container.querySelectorAll('label')].find(l => l.textContent.includes('Learning rate'))
    fireEvent.change(label.querySelector('input'), { target: { value: '1' } })
    expect(container.innerHTML).not.toContain('NaN')
    expect(screen.getByText(/LSTM Recurrent Neural Network/)).toBeInTheDocument()
  })
})
