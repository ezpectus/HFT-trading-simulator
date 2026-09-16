import { memo, useCallback, useEffect, useState } from 'react'
import { ToggleLeft, ToggleRight, Flag, Layers } from 'lucide-react'
import { FEATURE_FLAGS, isFlagEnabled, setFlag } from '../featureFlags'

const CATEGORIES = ['core', 'ui', 'risk']

// every toggle writes the real key its consumer reads — no orphan blob.
// Server-side strategy toggles (ml-ensemble, market-making, funding-arb,
// circuit-breaker) were removed: they are backend config, not UI features.
const FeatureFlags = memo(function FeatureFlags({ addToast }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(FEATURE_FLAGS.map(f => [f.id, isFlagEnabled(f.id)])))

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail?.id) setState(prev => ({ ...prev, [e.detail.id]: !!e.detail.enabled }))
    }
    window.addEventListener('feature-flag-changed', onChange)
    return () => window.removeEventListener('feature-flag-changed', onChange)
  }, [])

  const toggleFlag = useCallback((flag) => {
    const next = !state[flag.id]
    setFlag(flag.id, next)
    setState(prev => ({ ...prev, [flag.id]: next }))

    addToast?.('info',
      `${flag.name}: ${next ? 'enabled' : 'disabled'}${flag.needsReload ? ' — applies on reload' : ''}`)
  }, [state, addToast])

  const enabledCount = FEATURE_FLAGS.filter(f => state[f.id]).length

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flag size={14} className="text-accent-yellow" />
          <span className="text-sm font-medium">Feature Flags</span>
        </div>
        <span className="text-[10px] text-gray-600">{enabledCount}/{FEATURE_FLAGS.length} enabled</span>
      </div>

      {CATEGORIES.map(cat => {
        const catFlags = FEATURE_FLAGS.filter(f => f.category === cat)
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
                  onClick={() => toggleFlag(flag)}
                  className="w-full flex items-center justify-between p-1.5 bg-bg-700 hover:bg-bg-600 transition-colors"
                >
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-[11px] text-gray-300 truncate">{flag.name}</span>
                    <span className="text-[9px] text-gray-600 truncate">
                      {flag.description}{flag.needsReload ? ' (reload required)' : ''}
                    </span>
                  </div>
                  {state[flag.id] ? (
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

export default memo(FeatureFlags)
