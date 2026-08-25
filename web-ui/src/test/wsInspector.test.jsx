import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WsInspector from '../components/WsInspector'

describe('WsInspector', () => {
  it('renders inspector with stats and controls', () => {
    render(<WsInspector exchange={{ candles: [] }} signals={{ signals: [] }} />)
    expect(screen.getByText('WS Inspector')).toBeInTheDocument()
    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('Signal')).toBeInTheDocument()
  })

  it('handles null exchange and signals gracefully', () => {
    render(<WsInspector exchange={null} signals={null} />)
    expect(screen.getByText('WS Inspector')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<WsInspector exchange={null} signals={null} />)
    expect(screen.getByText('No messages')).toBeInTheDocument()
  })
})
