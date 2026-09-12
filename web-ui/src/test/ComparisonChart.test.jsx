import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import ComparisonChart from '../components/backtest/ComparisonChart'

const addLineSeries = vi.fn(() => ({ setData: vi.fn() }))
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries,
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

describe('ComparisonChart', () => {
  it('renders a container', () => {
    const { container } = render(<ComparisonChart curves={[]} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with named curve data without crashing', () => {
    const curves = { trend: [100, 110], fft: [100, 95] }
    const { container } = render(<ComparisonChart curves={curves} />)
    expect(container.firstChild).toBeTruthy()
  })
})
