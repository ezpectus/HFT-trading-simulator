import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import IndicatorBuilder from '../components/IndicatorBuilder'

const CANDLES = Array.from({ length: 60 }, (_, i) => ({
  time: 1000 + i, open: 100, high: 101, low: 99,
  close: 100 + Math.sin(i / 5) * 5, volume: 10,
}))

describe('IndicatorBuilder', () => {
  it('shows empty state and add menu', () => {
    render(<IndicatorBuilder candles={CANDLES} onIndicatorsChange={() => {}} />)
    expect(screen.getByText('Custom Indicators')).toBeInTheDocument()
    expect(screen.getByText('No indicators added')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add'))
    expect(screen.getByText('SMA')).toBeInTheDocument()
    expect(screen.getByText('Bollinger')).toBeInTheDocument()
  })

  it('reports computed indicators via effect, not during render (regression)', async () => {
    const onChange = vi.fn()
    render(<IndicatorBuilder candles={CANDLES} onIndicatorsChange={onChange} />)
    // effect fires after mount with the empty computation
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]))

    fireEvent.click(screen.getByText('Add'))
    fireEvent.click(screen.getByText('SMA'))
    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)[0]
      expect(last).toHaveLength(1)
      expect(last[0].label).toBe('SMA(20)')
      expect(last[0].lines[0].data.length).toBeGreaterThan(0)
      for (const p of last[0].lines[0].data) {
        expect(Number.isFinite(p.value)).toBe(true)
        expect(Number.isFinite(p.time)).toBe(true)
      }
    })
  })

  it('removes an indicator and reports the empty list', async () => {
    const onChange = vi.fn()
    const { container } = render(<IndicatorBuilder candles={CANDLES} onIndicatorsChange={onChange} />)
    fireEvent.click(screen.getByText('Add'))
    fireEvent.click(screen.getByText('EMA'))
    await waitFor(() => expect(onChange.mock.calls.at(-1)[0]).toHaveLength(1))

    fireEvent.click(container.querySelector('.hover\\:text-accent-red'))
    await waitFor(() => expect(onChange.mock.calls.at(-1)[0]).toHaveLength(0))
  })
})
