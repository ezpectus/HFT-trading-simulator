import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppShortcuts } from '../hooks/useAppShortcuts'
import { useUIStore } from '../stores/useUIStore'

const press = (key, opts = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))

describe('useAppShortcuts', () => {
  beforeEach(() => {
    renderHook(() => useAppShortcuts())
  })

  it('digit keys switch exchange', () => {
    const { EXCHANGES } = useUIStore.getState()
    press('1')
    expect(useUIStore.getState().selectedExchange).toBe(EXCHANGES[0])
    press('2')
    expect(useUIStore.getState().selectedExchange).toBe(EXCHANGES[1])
  })

  it('q/w/e switch symbol', () => {
    const { SYMBOLS } = useUIStore.getState()
    press('q')
    expect(useUIStore.getState().selectedSymbol).toBe(SYMBOLS[0])
    press('e')
    expect(useUIStore.getState().selectedSymbol).toBe(SYMBOLS[2])
  })

  it('space toggles sim speed', () => {
    const before = useUIStore.getState().simSpeed
    press(' ')
    expect(useUIStore.getState().simSpeed).toBe(before === 0 ? 1 : 0)
  })

  it('letter keys switch tabs', () => {
    press('t')
    expect(useUIStore.getState().activeTab).toBe('performance')
    press('s')
    expect(useUIStore.getState().activeTab).toBe('signals')
  })

  it('shift+\\ toggles sidebar', () => {
    const before = useUIStore.getState().sidebarCollapsed
    press('\\', { shiftKey: true })
    expect(useUIStore.getState().sidebarCollapsed).toBe(!before)
  })
})
