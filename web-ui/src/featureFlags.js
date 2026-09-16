import { useEffect, useState } from 'react'

// Single source of truth for feature flags (the old FeatureFlags
// panel wrote a `trading-feature-flags` blob that nothing read). Each flag
// maps to the REAL localStorage key its consumer already reads, and toggles
// dispatch `feature-flag-changed` so mounted consumers update live.

export const FEATURE_FLAGS = [
  {
    id: 'mock-mode', name: 'Mock Mode', category: 'core',
    description: 'Use simulated data instead of live WS',
    key: 'mock-mode', default: false, needsReload: true,
  },
  {
    id: 'sound-alerts', name: 'Sound Alerts', category: 'core',
    description: 'Play sounds on fills and signals',
    key: 'trading-sim-sound', default: true,
  },
  {
    id: 'auto-reconnect', name: 'Auto Reconnect', category: 'core',
    description: 'Automatically reconnect on WS disconnect',
    key: 'trading-sim-auto-reconnect', default: true, needsReload: true,
  },
  {
    id: 'advanced-panels', name: 'Advanced Panels', category: 'ui',
    description: 'Show math/research panels in sidebar',
    key: 'trading-sim-advanced-panels', default: false,
  },
  {
    id: 'detachable-panels', name: 'Detachable Panels', category: 'ui',
    description: 'Allow panels to be detached to separate windows',
    key: 'trading-sim-detachable-panels', default: true,
  },
  {
    id: 'trailing-stop', name: 'Trailing Stop', category: 'risk',
    description: 'Offer TRAILING_STOP in the order form',
    key: 'trading-sim-order-trailing-stop', default: true,
  },
]

const FLAG_BY_ID = Object.fromEntries(FEATURE_FLAGS.map(f => [f.id, f]))

export function isFlagEnabled(id) {
  const f = FLAG_BY_ID[id]
  if (!f) return false
  try {
    const v = localStorage.getItem(f.key)
    return v === null ? f.default : v === 'true'
  } catch {
    return f.default
  }
}

export function setFlag(id, enabled) {
  const f = FLAG_BY_ID[id]
  if (!f) return
  try {
    localStorage.setItem(f.key, String(enabled))
  } catch { /* storage may be unavailable */ }
  window.dispatchEvent(new CustomEvent('feature-flag-changed', { detail: { id, enabled } }))
}

/** React binding — live-updates on `feature-flag-changed`. */
export function useFeatureFlag(id) {
  const [enabled, setEnabled] = useState(() => isFlagEnabled(id))
  useEffect(() => {
    const onChange = (e) => {
      if (e.detail?.id === id) setEnabled(!!e.detail.enabled)
    }
    window.addEventListener('feature-flag-changed', onChange)
    return () => window.removeEventListener('feature-flag-changed', onChange)
  }, [id])
  const set = (v) => { setFlag(id, v); setEnabled(v) }
  return [enabled, set]
}
