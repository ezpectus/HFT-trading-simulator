import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { lazy } from 'react'
import { generateInitialSnapshot } from '../utils/mockData'

const BayesianPricePredictor = lazy(() => import('../components/BayesianPricePredictor'))

describe('BayesianPricePredictor', () => {
  const snap = generateInitialSnapshot()
  const populated = { candles: snap.candles, symbol: 'BTCUSDT', exchange: 'binance' }

  it('renders predictions on populated data', async () => {
    render(
      <Suspense fallback={null}>
        <BayesianPricePredictor {...populated} />
      </Suspense>,
    )
    expect(await screen.findByText(/Bayesian Price Predictor/, {}, { timeout: 10000 }))
      .toBeTruthy()
  }, 30000)

  // S371: betaPath's useMemo sat below the !data early return, so switching
  // to a candle-less selection dropped a hook → "Rendered fewer hooks than
  // expected" crash. Hooks must be stable across the data→empty→data cycle.
  it('survives the populated → empty → populated cycle', async () => {
    const { rerender } = render(
      <Suspense fallback={null}>
        <BayesianPricePredictor {...populated} />
      </Suspense>,
    )
    await screen.findByText(/Bayesian Price Predictor/, {}, { timeout: 10000 })

    rerender(
      <Suspense fallback={null}>
        <BayesianPricePredictor candles={[]} symbol="BTCUSDT" exchange="binance" />
      </Suspense>,
    )
    expect(await screen.findByText(/Need at least 30 candles/i, {}, { timeout: 10000 }))
      .toBeTruthy()

    rerender(
      <Suspense fallback={null}>
        <BayesianPricePredictor {...populated} />
      </Suspense>,
    )
    expect(await screen.findByText(/Bayesian Price Predictor/, {}, { timeout: 10000 }))
      .toBeTruthy()
  }, 30000)
})
