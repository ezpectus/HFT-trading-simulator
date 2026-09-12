import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FundingRateHistory from '../components/FundingRateHistory'

describe('FundingRateHistory arb scan', () => {
  const props = {
    fundingRates: { binance: 0.0005, okx: 0.0002 }, candlesToFunding: 40,
    prices: { binance: { 'BTC/USDT': 64000 } }, symbols: ['BTC/USDT'],
    sendSignalMessage: vi.fn(() => true),
    fundingArbResult: null, signalsConnected: true,
  }

  it('sends funding_arb_scan with live rates + prices', () => {
    const send = vi.fn(() => true)
    render(<FundingRateHistory {...props} sendSignalMessage={send} />)
    fireEvent.click(screen.getByText('Scan funding arbitrage (backend)'))
    const msg = send.mock.calls[0][0]
    expect(msg.type).toBe('funding_arb_scan')
    expect(msg.funding_rates.binance).toBe(0.0005)
    expect(msg.prices.binance['BTC/USDT']).toBe(64000)
  })

  it('renders opportunities', () => {
    const arb = {
      type: 'funding_arb_result',
      opportunities: [{
        type: 'spot_perp', symbol: 'BTC/USDT', exchanges: ['binance'],
        funding_rate: 0.0005, expected_daily_return: 0.0015,
        cost_estimate: 0.001, net_expected_return: 0.0005,
        confidence: 72, details: {}, timestamp: 1,
      }],
      scanned_exchanges: 2, scanned_symbols: 1,
    }
    render(<FundingRateHistory {...props} fundingArbResult={arb} />)
    fireEvent.click(screen.getByText('Scan funding arbitrage (backend)'))
    expect(screen.getByText(/spot_perp/)).toBeInTheDocument()
    expect(screen.getByText(/conf 72/)).toBeInTheDocument()
  })
})

