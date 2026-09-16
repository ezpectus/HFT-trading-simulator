/**
 * Tests for Toast component and useToastStore (the live toast path — the
 * local-state useToasts duplicate was removed in).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastContainer } from '../components/Toast'
import { useToastStore } from '../stores/useToastStore'

beforeEach(() => {
  useToastStore.getState().clearAll()
})

function TestWrapper() {
  const { toasts, addToast, removeToast, clearAll } = useToastStore()
  return (
    <div>
      <button onClick={() => addToast('success', 'Success message')}>Add Success</button>
      <button onClick={() => addToast('error', 'Error message')}>Add Error</button>
      <button onClick={() => addToast('warning', 'Warning message', 0)}>Add Warning No Auto</button>
      <button onClick={() => addToast('info', 'Info message', 100)}>Add Info Quick</button>
      <ToastContainer toasts={toasts} onRemove={removeToast} onClearAll={clearAll} />
    </div>
  )
}

describe('Toast', () => {
  it('renders success toast', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Success'))
    expect(screen.getByText('Success message')).toBeDefined()
  })

  it('renders error toast', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Error'))
    expect(screen.getByText('Error message')).toBeDefined()
  })

  it('renders warning toast without auto-dismiss', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Warning No Auto'))
    expect(screen.getByText('Warning message')).toBeDefined()
  })

  it('auto-dismisses after duration', () => {
    vi.useFakeTimers()
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Info Quick'))
    expect(screen.getByText('Info message')).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText('Info message')).toBeNull()
    vi.useRealTimers()
  })

  it('can be manually dismissed', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Warning No Auto'))
    expect(screen.getByText('Warning message')).toBeDefined()
    const dismissBtn = screen.getByLabelText('Dismiss notification')
    fireEvent.click(dismissBtn)
    expect(screen.queryByText('Warning message')).toBeNull()
  })

  it('has role=alert for accessibility', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Success'))
    const alert = screen.getByRole('alert')
    expect(alert).toBeDefined()
  })

  it('does not show Clear all button with single toast', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Success'))
    expect(screen.queryByLabelText('Clear all notifications')).toBeNull()
  })

  it('shows Clear all button with multiple toasts', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Success'))
    fireEvent.click(screen.getByText('Add Error'))
    expect(screen.getByLabelText('Clear all notifications')).toBeDefined()
  })

  it('clearAll removes all toasts', () => {
    render(<TestWrapper />)
    fireEvent.click(screen.getByText('Add Success'))
    fireEvent.click(screen.getByText('Add Error'))
    fireEvent.click(screen.getByText('Add Warning No Auto'))
    expect(screen.getByText('Success message')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Clear all notifications'))
    expect(screen.queryByText('Success message')).toBeNull()
    expect(screen.queryByText('Error message')).toBeNull()
    expect(screen.queryByText('Warning message')).toBeNull()
  })

  it('does not show Clear all when onClearAll not provided', () => {
    function NoClearWrapper() {
      const { toasts, addToast, removeToast } = useToastStore()
      return (
        <div>
          <button onClick={() => addToast('success', 'A')}>AddA</button>
          <button onClick={() => addToast('error', 'B')}>AddB</button>
          <ToastContainer toasts={toasts} onRemove={removeToast} />
        </div>
      )
    }
    render(<NoClearWrapper />)
    fireEvent.click(screen.getByText('AddA'))
    fireEvent.click(screen.getByText('AddB'))
    expect(screen.queryByLabelText('Clear all notifications')).toBeNull()
  })
})
