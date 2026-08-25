import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ApiClient from '../components/ApiClient'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (key, defaultValue) => {
    const [value, setValue] = vi.requireActual('react').useState(defaultValue)
    return [value, setValue]
  },
}))

const mockExchange = { connected: true }
const mockSignals = { connected: true }

describe('ApiClient', () => {
  it('renders endpoint list with status badges', () => {
    render(<ApiClient exchange={mockExchange} signals={mockSignals} addToast={vi.fn()} />)
    expect(screen.getByText('API Client')).toBeInTheDocument()
    expect(screen.getByText('Exchange WS')).toBeInTheDocument()
    expect(screen.getByText('Signal Bot WS')).toBeInTheDocument()
    expect(screen.getByText('REST Candles')).toBeInTheDocument()
    expect(screen.getByText(/Connected/i)).toBeInTheDocument()
  })

  it('shows correct connected count based on WS status', () => {
    render(<ApiClient exchange={mockExchange} signals={mockSignals} addToast={vi.fn()} />)
    expect(screen.getByText('2/6 connected')).toBeInTheDocument()
  })

  it('handles disconnected state', () => {
    render(<ApiClient exchange={{ connected: false }} signals={{ connected: false }} addToast={vi.fn()} />)
    expect(screen.getByText('0/6 connected')).toBeInTheDocument()
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0)
  })

  it('renders API credential inputs', () => {
    render(<ApiClient exchange={mockExchange} signals={mockSignals} addToast={vi.fn()} />)
    expect(screen.getByPlaceholderText('API Key')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('API Secret')).toBeInTheDocument()
    expect(screen.getByText('Save Credentials')).toBeInTheDocument()
  })

  it('renders cURL example section', () => {
    render(<ApiClient exchange={mockExchange} signals={mockSignals} addToast={vi.fn()} />)
    expect(screen.getByText('cURL Example')).toBeInTheDocument()
    expect(screen.getByText(/curl -X GET/)).toBeInTheDocument()
  })

  it('handles null data gracefully', () => {
    render(<ApiClient exchange={null} signals={null} addToast={vi.fn()} />)
    expect(screen.getByText('API Client')).toBeInTheDocument()
    expect(screen.getByText('0/6 connected')).toBeInTheDocument()
  })
})
