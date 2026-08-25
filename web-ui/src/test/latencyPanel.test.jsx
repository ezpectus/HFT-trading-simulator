import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LatencyPanel from '../components/LatencyPanel'

describe('LatencyPanel', () => {
  it('renders latency stats with WS, Order, Data cards', () => {
    render(<LatencyPanel exchange={{ latency: 15, connected: true }} />)
    expect(screen.getByText('Latency Monitor')).toBeInTheDocument()
    expect(screen.getByText('WS')).toBeInTheDocument()
    expect(screen.getByText('Order')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('shows percentile breakdown (p50, p95, p99)', () => {
    render(<LatencyPanel exchange={{ latency: 10, connected: true }} />)
    expect(screen.getByText('Latency Percentiles')).toBeInTheDocument()
    expect(screen.getByText('p50')).toBeInTheDocument()
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getByText('p99')).toBeInTheDocument()
  })

  it('renders network hops with total round trip', () => {
    render(<LatencyPanel exchange={{ latency: 10, connected: true }} />)
    expect(screen.getByText('Network Hops')).toBeInTheDocument()
    expect(screen.getByText('Client → Gateway')).toBeInTheDocument()
    expect(screen.getByText('Total Round Trip')).toBeInTheDocument()
  })

  it('shows disconnected state when not connected', () => {
    render(<LatencyPanel exchange={{ latency: 0, connected: false }} />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('handles null exchange gracefully', () => {
    render(<LatencyPanel exchange={null} />)
    expect(screen.getByText('Latency Monitor')).toBeInTheDocument()
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })
})
