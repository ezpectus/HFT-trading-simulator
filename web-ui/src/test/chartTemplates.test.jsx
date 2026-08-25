import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChartTemplates from '../components/ChartTemplates'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

describe('ChartTemplates', () => {
  it('renders template grid with builtin templates', () => {
    render(<ChartTemplates symbol="BTC/USDT" addToast={vi.fn()} />)
    expect(screen.getByText('Chart Templates')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByText('Scalper')).toBeInTheDocument()
    expect(screen.getByText('Swing Trader')).toBeInTheDocument()
  })

  it('selects template on click', () => {
    const addToast = vi.fn()
    render(<ChartTemplates symbol="BTC/USDT" addToast={addToast} />)
    fireEvent.click(screen.getByText('Scalper'))
    expect(addToast).toHaveBeenCalledWith('info', 'Chart template: Scalper')
  })

  it('shows active template and symbol info', () => {
    render(<ChartTemplates symbol="ETH/USDT" addToast={vi.fn()} />)
    expect(screen.getByText('Active Template')).toBeInTheDocument()
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument()
  })

  it('handles null addToast gracefully', () => {
    render(<ChartTemplates symbol="BTC/USDT" addToast={null} />)
    expect(screen.getByText('Chart Templates')).toBeInTheDocument()
  })
})
