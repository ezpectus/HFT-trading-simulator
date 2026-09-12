import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDetachedPanelSync } from '../hooks/useDetachedPanelSync'

function setup(detached = []) {
  const updateDetached = vi.fn()
  const detachPanel = vi.fn()
  const props = {
    exchange: {
      orderbooks: { 'sim|BTC/USDT': { bids: [[1, 1]] } },
      accounts: { sim: { balance: 100 } },
      arbitrage: [{ pair: 'X' }],
    },
    signals: { signals: [{ id: 1 }] },
    chartCandles: [{ time: 1, close: 5 }],
    currentPrice: 42,
    selectedExchange: 'sim',
    selectedSymbol: 'BTC/USDT',
    isDetached: (id) => detached.includes(id),
    updateDetached,
    detachPanel,
  }
  return { props, updateDetached, detachPanel }
}

describe('useDetachedPanelSync', () => {
  it('pushes live orderbook+price to detached orderbook panel', () => {
    const { props, updateDetached } = setup(['orderbook'])
    renderHook(() => useDetachedPanelSync(props))
    expect(updateDetached).toHaveBeenCalledWith('orderbook', {
      orderbookData: { bids: [[1, 1]] },
      currentPrice: 42,
    })
  })

  it('pushes account to detached account panel', () => {
    const { props, updateDetached } = setup(['account'])
    renderHook(() => useDetachedPanelSync(props))
    expect(updateDetached).toHaveBeenCalledWith('account',
      { account: { balance: 100 } })
  })

  it('attached panels get no updates', () => {
    const { props, updateDetached } = setup([])
    renderHook(() => useDetachedPanelSync(props))
    expect(updateDetached).not.toHaveBeenCalled()
  })

  it('detach handler snapshots current data', () => {
    const { props, detachPanel } = setup([])
    const { result } = renderHook(() => useDetachedPanelSync(props))
    result.current('orderbook')
    expect(detachPanel).toHaveBeenCalledWith('orderbook', expect.objectContaining({
      orderbookData: { bids: [[1, 1]] },
      currentPrice: 42,
    }))
  })
})
