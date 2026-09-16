import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GaussianProcessRegression from '../components/GaussianProcessRegression'

const CANDLES = Array.from({ length: 80 }, (_, i) => ({
  exchange: 'binance', symbol: 'BTC/USDT', timestamp: 1000 + i * 300,
  open: 100 + Math.sin(i / 6) * 4, high: 102 + Math.sin(i / 6) * 4,
  low: 98 + Math.sin(i / 6) * 4, close: 100 + Math.sin(i / 6) * 4, volume: 10,
}))

describe('GaussianProcessRegression', () => {
  it('shows the insufficient-data gate below nTrain+nPredict+5', () => {
    render(<GaussianProcessRegression candles={CANDLES.slice(0, 30)} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Need at least/)).toBeInTheDocument()
  })

  it('renders GP fit + forecast with finite SVG geometry', () => {
    const { container } = render(
      <GaussianProcessRegression candles={CANDLES} symbol="BTC/USDT" exchange="binance" />
    )
    expect(screen.getByText(/Gaussian Process Regression/)).toBeInTheDocument()
    for (const el of container.querySelectorAll('path, line, circle')) {
      for (const attr of ['d', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy']) {
        const v = el.getAttribute(attr)
        if (v != null) expect(v).not.toContain('NaN')
      }
    }
  })

  it('auto-optimize converges without a render loop (regression)', () => {
    // pre-fix this wrote state inside useMemo with the setters in the dep
    // array — the grid search ran twice per change and termination relied
    // on float equality. Now it runs once in useEffect.
    render(<GaussianProcessRegression candles={CANDLES} symbol="BTC/USDT" exchange="binance" />)
    expect(screen.getByText(/Gaussian Process Regression/)).toBeInTheDocument()
  })
})
