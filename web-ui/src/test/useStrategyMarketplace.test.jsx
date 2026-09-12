/**
 * Tests for useStrategyMarketplace — builtin seeding, import validation,
 * localStorage persistence of user strategies.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStrategyMarketplace } from '../hooks/useStrategyMarketplace'

const LS_KEY = 'trading-sim-strategy-marketplace'

describe('useStrategyMarketplace', () => {
  beforeEach(() => localStorage.clear())

  it('seeds builtin strategies when storage is empty', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    expect(result.current.builtinStrategies.length).toBeGreaterThan(0)
    expect(result.current.builtinStrategies.every(s => s.author === 'system')).toBe(true)
    expect(result.current.allStrategies.length).toBe(result.current.builtinStrategies.length)
  })

  it('imports a valid strategy and persists it', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    const pkg = {
      name: 'Custom Strat', rules: [{ id: 1, condition: 'rsi_below', value: 20, action: 'buy' }],
      schemaVersion: 1,
    }
    let res
    act(() => { res = result.current.importStrategy(JSON.stringify(pkg)) })
    expect(res.ok).toBe(true)
    expect(res.strategy.name).toBe('Custom Strat')
    expect(result.current.importedStrategies).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(LS_KEY))).toHaveLength(1)
  })

  it('rejects malformed JSON, missing fields, and future schema versions', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    let res
    act(() => { res = result.current.importStrategy('{bad') })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/parse error/i)

    act(() => { res = result.current.importStrategy('{"name": "no rules"}') })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/missing name or rules/i)

    act(() => {
      res = result.current.importStrategy(JSON.stringify({
        name: 'x', rules: [{}], schemaVersion: 999,
      }))
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/schema version/i)
  })

  it('re-import of same id replaces instead of duplicating', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    const pkg = { id: 's1', name: 'v1', rules: [{}], schemaVersion: 1 }
    act(() => { result.current.importStrategy(JSON.stringify(pkg)) })
    act(() => { result.current.importStrategy(JSON.stringify({ ...pkg, name: 'v2' })) })
    expect(result.current.importedStrategies).toHaveLength(1)
    expect(result.current.importedStrategies[0].name).toBe('v2')
  })

  it('deleteImported removes only the target', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    act(() => {
      result.current.importStrategy(JSON.stringify({ id: 'a', name: 'a', rules: [{}], schemaVersion: 1 }))
    })
    act(() => {
      result.current.importStrategy(JSON.stringify({ id: 'b', name: 'b', rules: [{}], schemaVersion: 1 }))
    })
    act(() => result.current.deleteImported('a'))
    expect(result.current.importedStrategies.map(s => s.id)).toEqual(['b'])
  })

  it('exportStrategy round-trips through importStrategy', () => {
    const { result } = renderHook(() => useStrategyMarketplace())
    const builtin = result.current.builtinStrategies[0]
    const json = result.current.exportStrategy(builtin)
    let res
    act(() => { res = result.current.importStrategy(json) })
    expect(res.ok).toBe(true)
    expect(res.strategy.id).toBe(builtin.id)
  })
})
