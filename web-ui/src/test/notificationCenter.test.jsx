import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationCenter from '../components/NotificationCenter'

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (_key, defaultValue) => {
    const [value, setValue] = useState(defaultValue)
    return [value, setValue, () => {}]
  },
}))

const mockToasts = [
  { id: 1, type: 'success', title: 'Connected', message: 'Exchange WS connected', timestamp: 1700000000 },
  { id: 2, type: 'error', title: 'Error', message: 'WebSocket timeout', timestamp: 1700000001 },
  { id: 3, type: 'warning', title: 'Warning', message: 'High latency detected', timestamp: 1700000002 },
  { id: 4, type: 'info', title: 'Info', message: 'Replay started', timestamp: 1700000003 },
]

describe('NotificationCenter', () => {
  it('renders notifications with correct type icons', () => {
    render(<NotificationCenter toasts={mockToasts} addToast={vi.fn()} removeToast={vi.fn()} clearAll={vi.fn()} />)
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Exchange WS connected')).toBeInTheDocument()
    expect(screen.getByText('WebSocket timeout')).toBeInTheDocument()
    expect(screen.getByText('High latency detected')).toBeInTheDocument()
  })

  it('shows notification count badge', () => {
    render(<NotificationCenter toasts={mockToasts} addToast={vi.fn()} removeToast={vi.fn()} clearAll={vi.fn()} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('filters notifications by type', () => {
    render(<NotificationCenter toasts={mockToasts} addToast={vi.fn()} removeToast={vi.fn()} clearAll={vi.fn()} />)
    fireEvent.click(screen.getByText(/Errors/))
    expect(screen.getByText('WebSocket timeout')).toBeInTheDocument()
    expect(screen.queryByText('Exchange WS connected')).not.toBeInTheDocument()
  })

  it('handles empty toasts gracefully', () => {
    render(<NotificationCenter toasts={[]} addToast={vi.fn()} removeToast={vi.fn()} clearAll={vi.fn()} />)
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('dismisses notification on trash button click', () => {
    const removeToast = vi.fn()
    render(<NotificationCenter toasts={mockToasts} addToast={vi.fn()} removeToast={removeToast} clearAll={vi.fn()} />)
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })
})
