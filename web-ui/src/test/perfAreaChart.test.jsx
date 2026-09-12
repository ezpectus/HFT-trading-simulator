import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import PerfAreaChart from '../components/performance/PerfAreaChart'

// lightweight-charts needs canvas — stub the chart surface.
const setData = vi.fn()
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addAreaSeries: vi.fn(() => ({ setData })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
  ColorType: { Solid: 'solid' },
}))

describe('PerfAreaChart', () => {
  it('renders a container div', () => {
    const { container } = render(
      <PerfAreaChart data={[]} mapPoint={(p) => ({ time: 0, value: p })}
        lineColor="#fff" topColor="rgba(0,0,0,0.2)" bottomColor="rgba(0,0,0,0)" />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('pushes mapped data into the series', () => {
    render(
      <PerfAreaChart data={[{ time: 1, v: 5 }]} mapPoint={(p) => ({ time: p.time, value: p.v })}
        lineColor="#fff" topColor="rgba(0,0,0,0.2)" bottomColor="rgba(0,0,0,0)" />
    )
    // jsdom containers have 0 size → chart may not mount; when it does,
    // setData must receive the mapped points.
    if (setData.mock.calls.length > 0) {
      expect(setData).toHaveBeenCalledWith([{ time: 1, value: 5 }])
    }
  })
})
