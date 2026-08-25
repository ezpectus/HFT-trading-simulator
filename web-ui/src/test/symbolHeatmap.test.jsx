import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SymbolHeatmap from '../components/SymbolHeatmap'

const mockCandles = [
  { symbol: 'BTC/USDT', exchange: 'binance', timestamp: 1, open: 42000, high: 42500, low: 41800, close: 43000, volume: 1200000 },
  { symbol: 'BTC/USDT', exchange: 'binance', timestamp: 2, open: 43000, high: 43200, low: 42800, close: 43500, volume: 900000 },
  { symbol: 'ETH/USDT', exchange: 'binance', timestamp: 1, open: 2400, high: 2450, low: 2380, close: 2380, volume: 500000 },
  { symbol: 'ETH/USDT', exchange: 'binance', timestamp: 2, open: 2380, high: 2400, low: 2350, close: 2360, volume: 400000 },
  { symbol: 'SOL/USDT', exchange: 'binance', timestamp: 1, open: 95, high: 96, low: 94, close: 98, volume: 300000 },
  { symbol: 'SOL/USDT', exchange: 'binance', timestamp: 2, open: 98, high: 99, low: 97, close: 97, volume: 250000 },
]

const mockSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

const mockPrices = {
  binance: { 'BTC/USDT': 43500, 'ETH/USDT': 2360, 'SOL/USDT': 97 },
}

describe('SymbolHeatmap', () => {
  it('renders heatmap cells for all symbols', () => {
    render(
      <SymbolHeatmap
        candles={mockCandles}
        prices={mockPrices}
        symbols={mockSymbols}
        exchange="binance"
      />
    )
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('SOL')).toBeInTheDocument()
  })

  it('handles empty data gracefully', () => {
    render(
      <SymbolHeatmap
        candles={[]}
        prices={{}}
        symbols={[]}
        exchange="binance"
      />
    )
    expect(screen.getByText(/no symbol data/i)).toBeInTheDocument()
  })

  it('calls onSelectSymbol when a cell is clicked', () => {
    const onSelect = vi.fn()
    render(
      <SymbolHeatmap
        candles={mockCandles}
        prices={mockPrices}
        symbols={mockSymbols}
        exchange="binance"
        onSelectSymbol={onSelect}
      />
    )
    const btcCell = screen.getByText('BTC').closest('div[class*="cursor-pointer"]') || screen.getByText('BTC').parentElement
    fireEvent.click(btcCell)
    expect(onSelect).toHaveBeenCalledWith('BTC/USDT')
  })

  it('cycles sort mode when sort button is clicked', () => {
    render(
      <SymbolHeatmap
        candles={mockCandles}
        prices={mockPrices}
        symbols={mockSymbols}
        exchange="binance"
      />
    )
    const sortButton = screen.getByTitle(/sort:/i)
    expect(sortButton).toHaveTextContent('Change %')
    fireEvent.click(sortButton)
    expect(sortButton).toHaveTextContent('Volume')
  })

  it('filters symbols by category', () => {
    render(
      <SymbolHeatmap
        candles={mockCandles}
        prices={mockPrices}
        symbols={mockSymbols}
        exchange="binance"
      />
    )
    const majorsBtn = screen.getByText('Majors')
    fireEvent.click(majorsBtn)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.queryByText('SOL')).not.toBeInTheDocument()
  })
})
