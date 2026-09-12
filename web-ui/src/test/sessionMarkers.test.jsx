import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SessionMarkers from '../components/SessionMarkers'

describe('SessionMarkers', () => {
  it('renders all four trading sessions', () => {
    render(<SessionMarkers fills={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('Trading Sessions')).toBeInTheDocument()
    for (const name of ['Sydney', 'Tokyo', 'London', 'New York']) {
      // The currently-active session may render its name twice (highlight + list)
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('shows active overlap indicator', () => {
    render(<SessionMarkers fills={[]} symbol="BTC/USDT" />)
    expect(screen.getByText('Active Overlap')).toBeInTheDocument()
  })

  it('handles null fills gracefully', () => {
    render(<SessionMarkers fills={null} symbol="BTC/USDT" />)
    expect(screen.getByText('Trading Sessions')).toBeInTheDocument()
  })

  it('shows session time ranges', () => {
    render(<SessionMarkers fills={[]} symbol="BTC/USDT" />)
    expect(screen.getAllByText(/UTC/).length).toBeGreaterThanOrEqual(1)
  })
})
