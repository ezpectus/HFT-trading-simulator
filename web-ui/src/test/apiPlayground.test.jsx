import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ApiPlayground from '../components/ApiPlayground'

describe('ApiPlayground', () => {
  it('renders endpoint list with methods', () => {
    render(<ApiPlayground />)
    expect(screen.getByText('API Playground')).toBeInTheDocument()
    expect(screen.getByText('/api/v1/signals')).toBeInTheDocument()
    expect(screen.getByText('/api/v1/orders')).toBeInTheDocument()
    expect(screen.getAllByText('GET').length).toBeGreaterThan(0)
    expect(screen.getAllByText('POST').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('DELETE')).toBeInTheDocument()
  })

  it('shows placeholder when no endpoint selected', () => {
    render(<ApiPlayground />)
    expect(screen.getByText('Select an endpoint to send a request')).toBeInTheDocument()
  })

  it('sends request and shows response on click', async () => {
    vi.useFakeTimers()
    render(<ApiPlayground />)
    const btn = screen.getByText('/api/v1/signals').closest('button')
    fireEvent.click(btn)
    expect(screen.getByText('Sending request...')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows endpoint description when selected', () => {
    render(<ApiPlayground />)
    const btn = screen.getByText('/api/v1/signals').closest('button')
    fireEvent.click(btn)
    expect(screen.getByText('Get active signals')).toBeInTheDocument()
  })
})
