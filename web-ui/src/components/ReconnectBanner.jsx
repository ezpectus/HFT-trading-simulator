import { AlertCircle, X, WifiOff, Zap } from 'lucide-react'
import { useState, useEffect } from 'react'

/**
 * Reconnect banner — shows when a WebSocket connection drops.
 * Features:
 *   - Animated SVG countdown ring
 *   - Pulsing disconnect icon
 *   - Attempt counter
 *   - Manual reconnect button with hover glow
 *   - Auto-dismiss on reconnect
 *   - Color-coded by urgency (green→yellow→red as countdown decreases)
 */
export function ReconnectBanner({ label, connected, nextReconnectIn, onReconnect, onDismiss, attemptCount = 0 }) {
  const [dismissed, setDismissed] = useState(false)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (connected) {
      setDismissed(false)
      return
    }
    const interval = setInterval(() => setPulse(p => !p), 800)
    return () => clearInterval(interval)
  }, [connected])

  if (connected || dismissed) return null

  const seconds = nextReconnectIn ?? 0
  const maxSeconds = 30
  const progress = Math.min(seconds / maxSeconds, 1)
  const circumference = 2 * Math.PI * 14
  const dashOffset = circumference * (1 - progress)

  const urgency = seconds <= 3 ? 'red' : seconds <= 10 ? 'orange' : 'yellow'
  const urgencyColor = { red: '#FF1744', orange: '#FF9800', yellow: '#FFB300' }[urgency]
  const bgColor = { red: 'rgba(255,23,68,0.12)', orange: 'rgba(255,152,0,0.10)', yellow: 'rgba(255,179,0,0.08)' }[urgency]
  const borderColor = { red: 'rgba(255,23,68,0.35)', orange: 'rgba(255,152,0,0.30)', yellow: 'rgba(255,179,0,0.25)' }[urgency]

  return (
    <div
      className="reconnect-banner"
      style={{ background: bgColor, borderColor, animation: 'reconnectSlideIn 0.3s ease-out' }}
    >
      {/* Pulsing icon + countdown ring */}
      <div className="rb-icon-wrapper">
        <svg width="32" height="32" viewBox="0 0 32 32" className="rb-countdown-ring">
          <circle
            cx="16" cy="16" r="14"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="2"
          />
          <circle
            cx="16" cy="16" r="14"
            fill="none"
            stroke={urgencyColor}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 16 16)"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="rb-icon-center" style={{ color: urgencyColor }}>
          {nextReconnectIn !== null ? (
            <span className="rb-countdown-num">{seconds}</span>
          ) : (
            <WifiOff size={14} style={{ opacity: pulse ? 1 : 0.4, transition: 'opacity 0.4s' }} />
          )}
        </div>
      </div>

      {/* Label + status */}
      <div className="rb-content">
        <div className="rb-label">
          <AlertCircle size={12} style={{ display: 'inline', marginRight: 4, opacity: 0.7 }} />
          <span className="rb-service-name">{label}</span>
        </div>
        <div className="rb-status">
          {nextReconnectIn !== null ? (
            <>Reconnecting in <b style={{ color: urgencyColor }}>{seconds}s</b></>
          ) : (
            <>Disconnected — waiting to retry</>
          )}
          {attemptCount > 0 && (
            <span className="rb-attempts"> (attempt #{attemptCount})</span>
          )}
        </div>
      </div>

      {/* Reconnect button */}
      <button
        onClick={() => {
          setDismissed(false)
          onReconnect?.()
        }}
        className="rb-reconnect-btn"
        style={{ '--rb-glow': urgencyColor }}
        title="Reconnect now"
      >
        <Zap size={13} />
        <span>Reconnect</span>
      </button>

      {onDismiss && (
        <button
          onClick={() => setDismissed(true)}
          className="rb-dismiss-btn"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      )}

      <style>{`
        @keyframes reconnectSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .reconnect-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px;
          border: 1px solid;
          border-radius: 8px;
          font-size: 12px;
        }
        .rb-icon-wrapper {
          position: relative;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
        }
        .rb-countdown-ring {
          position: absolute;
          top: 0;
          left: 0;
        }
        .rb-icon-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
        }
        .rb-countdown-num {
          font-variant-numeric: tabular-nums;
          min-width: 14px;
          text-align: center;
        }
        .rb-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .rb-label {
          font-weight: 600;
          color: #e0e0e8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rb-status {
          color: #888899;
          font-size: 11px;
        }
        .rb-attempts {
          color: #666680;
          font-size: 10px;
        }
        .rb-reconnect-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          color: #ccc;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .rb-reconnect-btn:hover {
          background: var(--rb-glow, #FF1744);
          color: #fff;
          border-color: var(--rb-glow, #FF1744);
          box-shadow: 0 0 12px var(--rb-glow, #FF1744);
        }
        .rb-dismiss-btn {
          color: rgba(255,255,255,0.3);
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          flex-shrink: 0;
          transition: color 0.2s;
        }
        .rb-dismiss-btn:hover {
          color: rgba(255,255,255,0.7);
        }
      `}</style>
    </div>
  )
}
