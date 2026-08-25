import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DrawingTools from '../components/DrawingTools'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('DrawingTools', () => {
  it('renders tool palette with all drawing tools', () => {
    render(<DrawingTools symbol="BTC/USDT" addToast={vi.fn()} />)
    expect(screen.getByText('Drawing Tools')).toBeInTheDocument()
    expect(screen.getByText('Cursor')).toBeInTheDocument()
    expect(screen.getByText('Trend Line')).toBeInTheDocument()
    expect(screen.getByText('Horizontal')).toBeInTheDocument()
    expect(screen.getByText('Brush')).toBeInTheDocument()
  })

  it('selects a tool on click', () => {
    const addToast = vi.fn()
    render(<DrawingTools symbol="BTC/USDT" addToast={addToast} />)
    fireEvent.click(screen.getByText('Trend Line'))
    expect(addToast).toHaveBeenCalledWith('info', 'Tool: Trend Line')
  })

  it('renders color palette', () => {
    render(<DrawingTools symbol="BTC/USDT" addToast={vi.fn()} />)
    expect(screen.getByText('Color')).toBeInTheDocument()
  })

  it('shows active tool and symbol info', () => {
    render(<DrawingTools symbol="ETH/USDT" addToast={vi.fn()} />)
    expect(screen.getByText('Active Tool')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('handles clear button', () => {
    const addToast = vi.fn()
    render(<DrawingTools symbol="BTC/USDT" addToast={addToast} />)
    const clearBtn = screen.getByText('Clear')
    fireEvent.click(clearBtn)
    expect(addToast).toHaveBeenCalledWith('warning', 'Cleared all drawings for BTC/USDT')
  })
})
