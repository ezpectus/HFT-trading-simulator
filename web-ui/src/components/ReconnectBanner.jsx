import { RefreshCw, AlertCircle, X } from 'lucide-react'
import { useState } from 'react'

/**
 * Reconnect banner — shows when a WebSocket connection drops.
 * Displays countdown timer and manual reconnect button.
 */
export function ReconnectBanner({ label, connected, nextReconnectIn, onReconnect, onDismiss }) {
  const [dismissed, setDismissed] = useState(false)

  if (connected || dismissed) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-red-400">
      <AlertCircle size={14} className="shrink-0" />
      <span className="flex-1">
        <span className="font-medium">{label}</span>
        {' — '}
        {nextReconnectIn !== null ? (
          <span>Reconnecting in {nextReconnectIn}s…</span>
        ) : (
          <span>Disconnected</span>
        )}
      </span>
      <button
        onClick={() => {
          setDismissed(false)
          onReconnect?.()
        }}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
        title="Reconnect now"
      >
        <RefreshCw size={12} />
        Reconnect
      </button>
      {onDismiss && (
        <button
          onClick={() => setDismissed(true)}
          className="text-red-400/50 hover:text-red-400 transition-colors"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
