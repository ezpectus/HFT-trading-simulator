import { describe, it, expect } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import WsInspector from '../components/WsInspector'
import { publishWsFrame } from '../hooks/useWebSocket'

function emit(source, data, size = 42) {
  act(() => {
    publishWsFrame({ label: source, data, size, receivedAt: Date.now() })
  })
}

describe('WsInspector', () => {
  it('renders inspector with stats and controls', () => {
    render(<WsInspector />)
    expect(screen.getByText('WS Inspector')).toBeInTheDocument()
    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('Signal')).toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(<WsInspector />)
    expect(screen.getByText('No messages')).toBeInTheDocument()
  })

  it('lists real published frames with type, source and size', () => {
    render(<WsInspector />)
    emit('exchange', { type:'candles', symbol:'BTC/USDT' }, 512)
    emit('signal', { type:'signal', symbol:'ETH/USDT' }, 96)
    expect(screen.getByText('candles')).toBeInTheDocument()
    expect(screen.getAllByText('signal').length).toBeGreaterThan(0)
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument()
    // stats row counts both streams
    expect(screen.getByText('1', { selector: '.text-accent-blue' })).toBeInTheDocument()
  })

  it('search filters frames by type/symbol/source', () => {
    render(<WsInspector />)
    emit('exchange', { type:'candles', symbol:'BTC/USDT' })
    emit('signal', { type:'signal', symbol:'ETH/USDT' })
    fireEvent.change(screen.getByPlaceholderText('Filter messages...'), { target: { value: 'candles' } })
    expect(screen.getByText('candles')).toBeInTheDocument()
    expect(screen.queryByText('ETH/USDT')).not.toBeInTheDocument()
  })
})
