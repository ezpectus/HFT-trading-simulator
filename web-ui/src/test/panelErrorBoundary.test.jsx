/**
 * Tests for PanelErrorBoundary component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState, useEffect } from 'react'
import PanelErrorBoundary from '../components/PanelErrorBoundary'

function GoodChild() {
  return <div data-testid="child">Working component</div>
}

function BadChild() {
  throw new Error('Test error')
}

function ToggleChild({ shouldThrow }) {
  if (shouldThrow) throw new Error('Toggle error')
  return <div data-testid="child">Working</div>
}

describe('PanelErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <PanelErrorBoundary panelName="Test Panel">
        <GoodChild />
      </PanelErrorBoundary>
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('renders error UI when child throws', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PanelErrorBoundary panelName="Test Panel">
        <BadChild />
      </PanelErrorBoundary>
    )
    expect(screen.getByText(/Test Panel/)).toBeDefined()
    spy.mockRestore()
  })

  it('shows retry button on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PanelErrorBoundary panelName="Test Panel">
        <BadChild />
      </PanelErrorBoundary>
    )
    expect(screen.getByText(/Retry/i)).toBeDefined()
    spy.mockRestore()
  })

  it('shows disable button after 3 errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <PanelErrorBoundary panelName="Test Panel" key="boundary">
        <BadChild />
      </PanelErrorBoundary>
    )
    // Click retry 3 times to trigger disable
    for (let i = 0; i < 3; i++) {
      const retryBtn = screen.queryByText(/Retry/i)
      if (retryBtn) fireEvent.click(retryBtn)
    }
    // After 3 errors, should show disable option
    expect(screen.getByText(/Disable/i)).toBeDefined()
    spy.mockRestore()
  })
})
