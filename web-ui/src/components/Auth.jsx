import { memo, useState, useCallback } from 'react'
import { Lock, LogIn, LogOut, Shield, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { WS_EXCHANGE, readAuthToken } from '../hooks/useExchangeData'

const AUTH_TOKEN_KEY = 'trading-sim-auth-token'
const ENV_TOKEN = import.meta.env.VITE_EXCHANGE_TOKEN || ''
const PROBE_TIMEOUT_MS = 5000

/**
 * Control-plane authentication (replaces the accept-anything
 * username/password facade). The exchange server gates control commands
 * behind EXCHANGE_CONTROL_TOKEN: this panel probes the real socket with
 * {type:'auth', token}, and only marks Authenticated on a real `auth_ok`.
 * The stored token is picked up by useExchangeData via the
 * `auth-token-changed` event (live reconnect).
 */
const Auth = memo(function Auth({ addToast }) {
  const [session, setSession] = useLocalStorage(AUTH_TOKEN_KEY, '')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [status, setStatus] = useState('idle') // idle | probing | failed

  const notifyTokenChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('auth-token-changed'))
  }, [])

  const handleLogin = useCallback(() => {
    const candidate = token.trim()
    if (!candidate) {
      addToast?.('warning', 'Control token required')
      return
    }
    setStatus('probing')

    let settled = false
    let ws
    const settle = (ok, message) => {
      if (settled) return
      settled = true
      try { ws?.close() } catch { /* ignore */ }
      if (ok) {
        setSession(candidate)
        setToken('')
        setStatus('idle')
        notifyTokenChanged()
        addToast?.('success', 'Authenticated — token active for control commands')
      } else {
        setStatus('failed')
        addToast?.('error', message)
      }
    }

    try {
      ws = new WebSocket(WS_EXCHANGE)
    } catch {
      settle(false, 'Could not open WebSocket to exchange')
      return
    }
    const timer = setTimeout(() => settle(false, 'Auth probe timed out — is the simulator up?'), PROBE_TIMEOUT_MS)
    const done = (ok, msg) => { clearTimeout(timer); settle(ok, msg) }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: candidate }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'auth_ok') done(true)
        else if (msg.type === 'auth_failed') done(false, 'Server rejected the token')
      } catch { /* non-JSON frame — ignore */ }
    }
    ws.onerror = () => done(false, 'WebSocket error — is the simulator up?')
    ws.onclose = () => done(false, 'Socket closed before auth completed')
  }, [token, setSession, addToast, notifyTokenChanged])

  const handleLogout = useCallback(() => {
    setSession('')
    setStatus('idle')
    notifyTokenChanged()
    addToast?.('info', ENV_TOKEN ? 'Token cleared — build-time env token still applies' : 'Token cleared')
  }, [setSession, addToast, notifyTokenChanged])

  const stored = session || readAuthToken()

  if (stored) {
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-accent-green" />
            <span className="text-sm font-medium">Authentication</span>
          </div>
          <span className="text-[10px] text-accent-green">Authenticated</span>
        </div>

        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1.5 mb-1">
            <KeyRound size={12} className="text-gray-400" />
            <span className="text-[11px] text-gray-300 font-mono">
              {stored.slice(0, 4)}{'•'.repeat(Math.max(0, Math.min(stored.length - 4, 12)))}
            </span>
          </div>
          <div className="text-[10px] text-gray-600">
            Control token verified by the server and applied to the live socket.
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
        >
          <LogOut size={12} />
          Clear token
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Lock size={14} className="text-accent-yellow" />
          <span className="text-sm font-medium">Authentication</span>
        </div>
        <span className="text-[10px] text-gray-600">
          {ENV_TOKEN ? 'env token active' : 'no token'}
        </span>
      </div>

      <div className="relative">
        <KeyRound size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          type={showToken ? 'text' : 'password'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Control token (EXCHANGE_CONTROL_TOKEN)"
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          className="w-full pl-7 pr-8 py-1.5 text-[11px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
        />
        <button
          onClick={() => setShowToken(!showToken)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
        >
          {showToken ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      </div>

      {status === 'failed' && (
        <div className="text-[10px] text-accent-red">Authentication failed — check the token.</div>
      )}

      <button
        onClick={handleLogin}
        disabled={status === 'probing'}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors disabled:opacity-50"
      >
        <LogIn size={12} />
        {status === 'probing' ? 'Verifying…' : 'Verify & apply token'}
      </button>
    </div>
  )
})

export default memo(Auth)
