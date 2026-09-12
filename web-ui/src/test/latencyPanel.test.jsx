import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LatencyPanel from '../components/LatencyPanel'

describe('LatencyPanel', () => {
  it('renders WS RTT and sample count cards', () => {
    render(<LatencyPanel exchange={{ latency: 15, connected: true }} />)
    expect(screen.getByText('Latency Monitor')).toBeInTheDocument()
    expect(screen.getByText('WS RTT')).toBeInTheDocument()
    expect(screen.getByText('Avg')).toBeInTheDocument()
    expect(screen.getByText('Samples')).toBeInTheDocument()
  })

  it('shows percentile breakdown after samples arrive', () => {
    render(<LatencyPanel exchange={{ latency: 10, connected: true }} />)
    expect(screen.getByText('WS Latency Percentiles')).toBeInTheDocument()
    expect(screen.getByText('p50')).toBeInTheDocument()
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getByText('p99')).toBeInTheDocument()
  })

  it('accumulates real latency samples across renders', () => {
    const { rerender } = render(<LatencyPanel exchange={{ latency: 10, connected: true }} />)
    rerender(<LatencyPanel exchange={{ latency: 20, connected: true }} />)
    rerender(<LatencyPanel exchange={{ latency: 30, connected: true }} />)
    // 3 samples collected
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not render fabricated network hops', () => {
    render(<LatencyPanel exchange={{ latency: 10, connected: true }} />)
    expect(screen.queryByText('Client → Gateway')).not.toBeInTheDocument()
    expect(screen.queryByText('Total Round Trip')).not.toBeInTheDocument()
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
