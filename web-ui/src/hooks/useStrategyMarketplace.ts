import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'trading-sim-strategy-marketplace'
const SCHEMA_VERSION = 1

export interface StrategyPackage {
  id: string
  name: string
  author: string
  version: string
  description: string
  tags: string[]
  rules: Array<{
    id: number
    condition: string
    value?: number
    action: string
    qty?: number
  }>
  indicators: Array<{
    type: string
    params: Record<string, number>
  }>
  riskParams: {
    maxPositionSize: number
    stopLossPct: number
    takeProfitPct: number
    maxOpenPositions: number
  }
  createdAt: string
  updatedAt: string
  schemaVersion: number
}

const DEFAULT_STRATEGIES: StrategyPackage[] = [
  {
    id: 'rsi-oversold-bounce',
    name: 'RSI Oversold Bounce',
    author: 'system',
    version: '1.0.0',
    description: 'Buy when RSI < 30, sell when RSI > 70. Classic mean reversion.',
    tags: ['mean-reversion', 'rsi', 'beginner'],
    rules: [
      { id: 1, condition: 'rsi_below', value: 30, action: 'buy', qty: 0.1 },
      { id: 2, condition: 'rsi_above', value: 70, action: 'sell', qty: 0.1 },
    ],
    indicators: [
      { type: 'RSI', params: { period: 14 } },
    ],
    riskParams: {
      maxPositionSize: 0.5,
      stopLossPct: 2.0,
      takeProfitPct: 4.0,
      maxOpenPositions: 3,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  },
  {
    id: 'ema-crossover-trend',
    name: 'EMA Crossover Trend',
    author: 'system',
    version: '1.0.0',
    description: 'Follow trend via EMA fast/slow crossover. Buy on golden cross, sell on death cross.',
    tags: ['trend-following', 'ema', 'beginner'],
    rules: [
      { id: 1, condition: 'ema_cross_up', action: 'buy', qty: 0.2 },
      { id: 2, condition: 'ema_cross_down', action: 'sell', qty: 0.2 },
    ],
    indicators: [
      { type: 'EMA', params: { fast: 12, slow: 26 } },
    ],
    riskParams: {
      maxPositionSize: 1.0,
      stopLossPct: 3.0,
      takeProfitPct: 6.0,
      maxOpenPositions: 2,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  },
  {
    id: 'volume-spike-breakout',
    name: 'Volume Spike Breakout',
    author: 'system',
    version: '1.0.0',
    description: 'Buy on volume spike > 3x average with 5-candle price change > 5%.',
    tags: ['breakout', 'volume', 'intermediate'],
    rules: [
      { id: 1, condition: 'volume_spike', value: 3, action: 'buy', qty: 0.15 },
      { id: 2, condition: 'price_change_5', value: 5, action: 'sell', qty: 0.15 },
    ],
    indicators: [
      { type: 'Volume', params: { avgPeriod: 20 } },
    ],
    riskParams: {
      maxPositionSize: 0.8,
      stopLossPct: 2.5,
      takeProfitPct: 5.0,
      maxOpenPositions: 5,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  },
]

export function useStrategyMarketplace() {
  const [strategies, setStrategies] = useState<StrategyPackage[]>([])
  const [importedStrategies, setImportedStrategies] = useState<StrategyPackage[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setImportedStrategies(parsed)
      }
    } catch (e) {
      console.warn('[StrategyMarketplace] Failed to load:', e)
    }
    setStrategies(DEFAULT_STRATEGIES)
  }, [])

  const saveImported = useCallback((next: StrategyPackage[]) => {
    setImportedStrategies(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (e) {
      console.warn('[StrategyMarketplace] Failed to save:', e)
    }
  }, [])

  const exportStrategy = useCallback((strategy: StrategyPackage): string => {
    return JSON.stringify(strategy, null, 2)
  }, [])

  const importStrategy = useCallback((jsonStr: string): { ok: boolean; error?: string; strategy?: StrategyPackage } => {
    try {
      const parsed = JSON.parse(jsonStr)
      if (!parsed.name || !parsed.rules || !Array.isArray(parsed.rules)) {
        return { ok: false, error: 'Invalid strategy format: missing name or rules' }
      }
      if (parsed.schemaVersion && parsed.schemaVersion > SCHEMA_VERSION) {
        return { ok: false, error: `Schema version ${parsed.schemaVersion} not supported (max: ${SCHEMA_VERSION})` }
      }
      const strategy: StrategyPackage = {
        ...parsed,
        id: parsed.id || `imported-${Date.now()}`,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
      }
      const exists = importedStrategies.find(s => s.id === strategy.id)
      const next = exists
        ? importedStrategies.map(s => s.id === strategy.id ? strategy : s)
        : [...importedStrategies, strategy]
      saveImported(next)
      return { ok: true, strategy }
    } catch (e) {
      return { ok: false, error: `JSON parse error: ${(e as Error).message}` }
    }
  }, [importedStrategies, saveImported])

  const downloadStrategy = useCallback((strategy: StrategyPackage) => {
    const json = JSON.stringify(strategy, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `strategy_${strategy.id}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const uploadStrategy = useCallback((file: File): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = importStrategy(String(reader.result))
        resolve({ ok: result.ok, error: result.error })
      }
      reader.onerror = () => resolve({ ok: false, error: 'File read error' })
      reader.readAsText(file)
    })
  }, [importStrategy])

  const deleteImported = useCallback((id: string) => {
    saveImported(importedStrategies.filter(s => s.id !== id))
  }, [importedStrategies, saveImported])

  const allStrategies = [...strategies, ...importedStrategies]

  return {
    builtinStrategies: strategies,
    importedStrategies,
    allStrategies,
    exportStrategy,
    importStrategy,
    downloadStrategy,
    uploadStrategy,
    deleteImported,
  }
}
