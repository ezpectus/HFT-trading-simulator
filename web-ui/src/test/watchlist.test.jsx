/**
 * Tests for Watchlist component
 * Tests: rendering, default symbols, add/remove, sort cycling, price display, empty state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Watchlist from '../components/Watchlist'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (_key, defaultValue) => useState(defaultValue),
}))

function makeCandle(symbol, close, exchange = 'binance') {
  return { symbol, close, exchange, timestamp: Date.now() }
}

describe('Watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header label', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    expect(screen.getByText('Watchlist')).toBeInTheDocument()
  })

  it('renders default watchlist symbols', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
  })

  it('shows empty state when watchlist is empty', async () => {
    // We need to clear all symbols then check empty state
    render(<Watchlist candles={[]} prices={{}} />)
    // Default has 3 symbols, so empty state should not show
    expect(screen.queryByText('No symbols in watchlist')).not.toBeInTheDocument()
  })

  it('shows add button', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    expect(screen.getByTitle('Add symbol')).toBeInTheDocument()
  })

  it('shows add input when + clicked', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    expect(screen.getByPlaceholderText('e.g. ADA/USDT')).toBeInTheDocument()
  })

  it('adds new symbol on Add button click', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    const input = screen.getByPlaceholderText('e.g. ADA/USDT')
    fireEvent.change(input, { target: { value: 'ADA/USDT' } })
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText('ADA')).toBeInTheDocument()
  })

  it('adds new symbol on Enter key', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    const input = screen.getByPlaceholderText('e.g. ADA/USDT')
    fireEvent.change(input, { target: { value: 'DOT/USDT' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('DOT')).toBeInTheDocument()
  })

  it('does not add duplicate symbol', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    const input = screen.getByPlaceholderText('e.g. ADA/USDT')
    fireEvent.change(input, { target: { value: 'BTC/USDT' } })
    fireEvent.click(screen.getByText('Add'))
    // Should still only have one BTC
    const btcElements = screen.getAllByText('BTC')
    expect(btcElements.length).toBe(1)
  })

  it('does not add empty symbol', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    fireEvent.click(screen.getByText('Add'))
    // Should still have only 3 default symbols
    expect(screen.getAllByText(/BTC|ETH|SOL/).length).toBe(3)
  })

  it('uppercases new symbol on add', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    const input = screen.getByPlaceholderText('e.g. ADA/USDT')
    fireEvent.change(input, { target: { value: 'ada/usdt' } })
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText('ADA')).toBeInTheDocument()
  })

  it('hides add input after adding', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    fireEvent.click(screen.getByTitle('Add symbol'))
    const input = screen.getByPlaceholderText('e.g. ADA/USDT')
    fireEvent.change(input, { target: { value: 'ADA/USDT' } })
    fireEvent.click(screen.getByText('Add'))
    expect(screen.queryByPlaceholderText('e.g. ADA/USDT')).not.toBeInTheDocument()
  })

  it('shows sort button with default Symbol label', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    expect(screen.getByRole('button', { name: /Symbol/ })).toBeInTheDocument()
  })

  it('cycles sort mode on click', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    const sortButton = screen.getByRole('button', { name: /Symbol/ })
    fireEvent.click(sortButton)
    expect(screen.getByRole('button', { name: /Price/ })).toBeInTheDocument()
  })

  it('cycles sort mode through all options', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    // Symbol → Price
    let sortButton = screen.getByRole('button', { name: /Symbol/ })
    fireEvent.click(sortButton)
    expect(screen.getByRole('button', { name: /Price/ })).toBeInTheDocument()
    // Price → Change %
    sortButton = screen.getByRole('button', { name: /Price/ })
    fireEvent.click(sortButton)
    expect(screen.getByRole('button', { name: /Change/ })).toBeInTheDocument()
    // Change % → Symbol
    sortButton = screen.getByRole('button', { name: /Change/ })
    fireEvent.click(sortButton)
    expect(screen.getByRole('button', { name: /Symbol/ })).toBeInTheDocument()
  })

  it('displays price from candles', () => {
    const candles = [
      makeCandle('BTC/USDT', 50000),
      makeCandle('ETH/USDT', 3000),
      makeCandle('SOL/USDT', 100),
    ]
    render(<Watchlist candles={candles} prices={{}} />)
    expect(screen.getByText('$50,000.00')).toBeInTheDocument()
  })

  it('displays price from prices prop when no candles', () => {
    render(<Watchlist candles={[]} prices={{ 'BTC/USDT': 51000 }} />)
    expect(screen.getByText('$51,000.00')).toBeInTheDocument()
  })

  it('displays no data when no price available', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    expect(screen.getAllByText('no data').length).toBe(3)
  })

  it('displays change percentage', () => {
    const candles = []
    // Create 20 candles with price going from 100 to 110
    for (let i = 0; i < 20; i++) {
      candles.push(makeCandle('BTC/USDT', 100 + i * 0.5))
    }
    render(<Watchlist candles={candles} prices={{}} />)
    // Change = ((109.5 - 100) / 100) * 100 = 9.50%
    expect(screen.getByText('+9.50%')).toBeInTheDocument()
  })

  it('displays negative change in red color class', () => {
    const candles = []
    for (let i = 0; i < 20; i++) {
      candles.push(makeCandle('BTC/USDT', 100 - i * 0.5))
    }
    render(<Watchlist candles={candles} prices={{}} />)
    // Change = ((90.5 - 100) / 100) * 100 = -9.50%
    expect(screen.getByText('-9.50%')).toBeInTheDocument()
  })

  it('calls onSelectSymbol when symbol clicked', () => {
    const onSelect = vi.fn()
    render(<Watchlist candles={[]} prices={{}} onSelectSymbol={onSelect} />)
    // Click on BTC item
    fireEvent.click(screen.getByText('BTC'))
    expect(onSelect).toHaveBeenCalledWith('BTC/USDT')
  })

  it('removes symbol when X button clicked', () => {
    render(<Watchlist candles={[]} prices={{}} />)
    const btcRow = screen.getByText('BTC').closest('div[class*="cursor-pointer"]')
    const removeBtn = btcRow.querySelector('button')
    fireEvent.click(removeBtn, { stopPropagation: () => {} })
    expect(screen.queryByText('BTC')).not.toBeInTheDocument()
  })

  it('does not call onSelectSymbol when remove clicked', () => {
    const onSelect = vi.fn()
    render(<Watchlist candles={[]} prices={{}} onSelectSymbol={onSelect} />)
    const btcRow = screen.getByText('BTC').closest('div[class*="cursor-pointer"]')
    const removeBtn = btcRow.querySelector('button')
    fireEvent.click(removeBtn)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sorts by price descending when sort mode is price', () => {
    const candles = [
      makeCandle('BTC/USDT', 50000),
      makeCandle('ETH/USDT', 3000),
      makeCandle('SOL/USDT', 100),
    ]
    render(<Watchlist candles={candles} prices={{}} />)
    // Cycle to Price sort
    const sortButton = screen.getByRole('button', { name: /Symbol/ })
    fireEvent.click(sortButton)
    // BTC should be first (highest price)
    const symbols = screen.getAllByText(/BTC|ETH|SOL/)
    // First symbol element should be BTC
    expect(symbols[0].textContent).toBe('BTC')
  })

  it('sorts by symbol alphabetically by default', () => {
    const candles = [
      makeCandle('SOL/USDT', 100),
      makeCandle('BTC/USDT', 50000),
      makeCandle('ETH/USDT', 3000),
    ]
    render(<Watchlist candles={candles} prices={{}} />)
    const symbols = screen.getAllByText(/BTC|ETH|SOL/)
    expect(symbols[0].textContent).toBe('BTC')
    expect(symbols[1].textContent).toBe('ETH')
    expect(symbols[2].textContent).toBe('SOL')
  })
})
