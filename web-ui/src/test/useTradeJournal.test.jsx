/**
 * Tests for useTradeJournal hook and tradeKey utility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTradeJournal, tradeKey } from '../hooks/useTradeJournal'

// Mock useLocalStorage to avoid actual localStorage interactions
vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((key, initial) => {
    let value = initial
    const setValue = (updater) => {
      if (typeof updater === 'function') {
        value = updater(value)
      } else {
        value = updater
      }
    }
    const stateRef = { current: value }
    const getter = () => stateRef.current
    const setter = (v) => {
      stateRef.current = typeof v === 'function' ? v(stateRef.current) : v
    }
    // Return a tuple-like that updates both ref and local
    return [
      new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return undefined
          return stateRef.current
        }
      }),
      (updater) => {
        stateRef.current = typeof updater === 'function' ? updater(stateRef.current) : updater
      }
    ]
  })
}))

describe('tradeKey', () => {
  it('generates key from trade properties', () => {
    const trade = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      closed_at: 1704067200,
      entry_price: 50000.0,
    }
    expect(tradeKey(trade)).toBe('binance|BTC/USDT|1704067200|50000')
  })

  it('generates different keys for different trades', () => {
    const trade1 = { exchange: 'binance', symbol: 'BTC/USDT', closed_at: 100, entry_price: 50000 }
    const trade2 = { exchange: 'okx', symbol: 'BTC/USDT', closed_at: 100, entry_price: 50000 }
    expect(tradeKey(trade1)).not.toBe(tradeKey(trade2))
  })
})

describe('useTradeJournal', () => {
  // Use real localStorage for these tests
  beforeEach(() => {
    vi.unmock('../hooks/useLocalStorage')
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns notes, saveNote, getNote, deleteNote, exportJournalCSV', () => {
    const { result } = renderHook(() => useTradeJournal())
    expect(typeof result.current.saveNote).toBe('function')
    expect(typeof result.current.getNote).toBe('function')
    expect(typeof result.current.deleteNote).toBe('function')
    expect(typeof result.current.exportJournalCSV).toBe('function')
    expect(result.current.data).toBeDefined()
  })

  it('saveNote stores a note for a trade key', () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('BTC|123', 'Good entry'))
    expect(result.current.getNote('BTC|123')).toBe('Good entry')
  })

  it('saveNote trims whitespace', () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('ETH|456', '  spaced note  '))
    expect(result.current.getNote('ETH|456')).toBe('spaced note')
  })

  it('saveNote with empty text deletes the note', () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('SOL|789', 'Initial note'))
    expect(result.current.getNote('SOL|789')).toBe('Initial note')
    act(() => result.current.saveNote('SOL|789', ''))
    expect(result.current.getNote('SOL|789')).toBe('')
  })

  it('saveNote with whitespace-only text deletes the note', () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('SOL|789', 'Initial'))
    act(() => result.current.saveNote('SOL|789', '   '))
    expect(result.current.getNote('SOL|789')).toBe('')
  })

  it('getNote returns empty string for missing key', () => {
    const { result } = renderHook(() => useTradeJournal())
    expect(result.current.getNote('nonexistent')).toBe('')
  })

  it('deleteNote removes a note', () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('BTC|100', 'Keep this'))
    expect(result.current.getNote('BTC|100')).toBe('Keep this')
    act(() => result.current.deleteNote('BTC|100'))
    expect(result.current.getNote('BTC|100')).toBe('')
  })

  it('deleteNote on missing key does not throw', () => {
    const { result } = renderHook(() => useTradeJournal())
    expect(() => act(() => result.current.deleteNote('nonexistent'))).not.toThrow()
  })

  it('exportJournalCSV creates a download link', async () => {
    const { result } = renderHook(() => useTradeJournal())
    act(() => result.current.saveNote('binance|BTC/USDT|1704067200|50000', 'Test note'))

    const mockClick = vi.fn()
    const mockAnchor = { href: '', download: '', click: mockClick }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)

    const trades = [{
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'LONG',
      entry_price: 50000,
      exit_price: 51000,
      quantity: 0.5,
      pnl: 500,
      reason: 'TP',
      closed_at: 1704067200,
    }]

    act(() => result.current.exportJournalCSV(trades))

    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(mockClick).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalled()
    expect(mockAnchor.download).toContain('trade_journal_')

    createElementSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})
