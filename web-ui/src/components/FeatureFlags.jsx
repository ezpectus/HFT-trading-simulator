import { memo, useCallback } from 'react'
import { ToggleLeft, ToggleRight, Flag, Layers } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const DEFAULT_FLAGS = [
  { id: 'mock-mode', name: 'Mock Mode', description: 'Use simulated data instead of live WS', enabled: false, category: 'core' },
  { id: 'sound-alerts', name: 'Sound Alerts', description: 'Play sounds on fills and signals', enabled: true, category: 'core' },
  { id: 'auto-reconnect', name: 'Auto Reconnect', description: 'Automatically reconnect on WS disconnect', enabled: true, category: 'core' },
  { id: 'advanced-panels', name: 'Advanced Panels', description: 'Show math/research panels in sidebar', enabled: false, category: 'ui' },
  { id: 'detachable-panels', name: 'Detachable Panels', description: 'Allow panels to be detached to separate windows', enabled: true, category: 'ui' },
  { id: 'ml-ensemble', name: 'ML Ensemble', description: 'Enable ML ensemble strategy signals', enabled: false, category: 'strategy' },
  { id: 'market-making', name: 'Market Making', description: 'Enable market making strategy', enabled: false, category: 'strategy' },
  { id: 'funding-arb', name: 'Funding Arbitrage', description: 'Detect funding rate arbitrage opportunities', enabled: true, category: 'strategy' },
  { id: 'circuit-breaker', name: 'Circuit Breaker', description: 'Auto-stop trading on consecutive losses', enabled: true, category: 'risk' },
  { id: 'trailing-stop', name: 'Trailing Stop', description: 'Use trailing stop for open positions', enabled: true, category: 'risk' },
]

const CATEGORIES = ['core', 'ui', 'strategy', 'risk']

const FeatureFlags = memo(function FeatureFlags({ addToast }) {
  const [flags, setFlags] = useLocalStorage('trading-feature-flags', DEFAULT_FLAGS)

  const toggleFlag = useCallback((id) => {
    setFlags(prev => prev.map(f => {
      if (f.id === id) {
        addToast?.('info', `${f.name}: ${!f.enabled ? 'enabled' : 'disabled'}`)
        return { ...f, enabled: !f.enabled }
      }
      return f
    }))
  }, [setFlags, addToast])

  const enabledCount = flags.filter(f => f.enabled).length

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flag size={14} className="text-accent-yellow" />
          <span className="text-sm font-medium">Feature Flags</span>
        </div>
        <span className="text-[10px] text-gray-600">{enabledCount}/{flags.length} enabled</span>
      </div>

      {CATEGORIES.map(cat => {
        const catFlags = flags.filter(f => f.category === cat)
        if (catFlags.length === 0) return null
        return (
          <div key={cat}>
            <div className="flex items-center gap-1 mb-1">
              <Layers size={10} className="text-gray-600" />
              <span className="text-[10px] text-gray-600 uppercase">{cat}</span>
            </div>
            <div className="space-y-0.5">
              {catFlags.map(flag => (
                <button
                  key={flag.id}
                  onClick={() => toggleFlag(flag.id)}
                  className="w-full flex items-center justify-between p-1.5 bg-bg-700 hover:bg-bg-600 transition-colors"
                >
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-[11px] text-gray-300 truncate">{flag.name}</span>
                    <span className="text-[9px] text-gray-600 truncate">{flag.description}</span>
                  </div>
                  {flag.enabled ? (
                    <ToggleRight size={20} className="text-accent-green shrink-0" />
                  ) : (
                    <ToggleLeft size={20} className="text-gray-600 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
})

export default FeatureFlags
