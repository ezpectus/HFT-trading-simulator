import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'
import { IS_MOCK } from './useMockData'
import { isFlagEnabled } from '../featureFlags'

const WS_SIGNALS = import.meta.env.VITE_WS_SIGNALS || 'ws://localhost:8766'
// Shared secret for the signal publisher handshake — matches the bot's
// api.auth_token / AI_BOT_AUTH_TOKEN. Empty = server-side auth disabled.
const SIGNAL_TOKEN = import.meta.env.VITE_SIGNAL_TOKEN || ''

/**
 * Signal data hook — connects to the ai-signal-bot.
 * Manages signals, market regime, backtest/risk results, circuit breaker.
 */
export function useSignalData(options = {}) {
  const [signals, setSignals] = useState([])
  const [regime, setRegime] = useState(null)
  const [backtestResult, setBacktestResult] = useState(null)
  const [circuitBreaker, setCircuitBreaker] = useState(null)
  const [portfolioResult, setPortfolioResult] = useState(null)
  const [volSurfaceResult, setVolSurfaceResult] = useState(null)
  const [cvarResult, setCvarResult] = useState(null)
  const [stressTestResult, setStressTestResult] = useState(null)
  const [positionSizeResult, setPositionSizeResult] = useState(null)
  const [hawkesResult, setHawkesResult] = useState(null)
  const [fundingArbResult, setFundingArbResult] = useState(null)
  const [authState, setAuthState] = useState(SIGNAL_TOKEN ? 'pending' : 'disabled')
  const onBacktestResultRef = useRef(options.onBacktestResult)

  // Pure store-and-forget result messages — setState functions are stable,
  // so a ref'd map replaces the nine identical `case 'x_result': setX(data)`
  // branches (S327). 'backtest_result' stays in the switch: it also fires
  // the onBacktestResult callback.
  const resultSetters = useRef({
    comparison_result: setBacktestResult,
    portfolio_result: setPortfolioResult,
    vol_surface_result: setVolSurfaceResult,
    cvar_result: setCvarResult,
    stress_test_result: setStressTestResult,
    position_size_result: setPositionSizeResult,
    hawkes_result: setHawkesResult,
    funding_arb_result: setFundingArbResult,
  })

  useEffect(() => {
    onBacktestResultRef.current = options.onBacktestResult
  })

  const handleSignalMessage = useCallback((data) => {
    switch (data.type) {
      case 'signal_history':
        setSignals(data.signals || [])
        break
      case 'signal':
        setSignals(prev => [data, ...prev].slice(0, 50))
        break
      case 'market_regime':
        setRegime(data)
        break
      case 'circuit_breaker_status':
        setCircuitBreaker({
          tripped: data.state === 'OPEN',
          state: data.state,
          consecutiveLosses: data.consecutive_failures || 0,
          totalTrips: data.total_trips || 0,
          totalBlocks: data.total_blocks || 0,
        })
        break
      case 'backtest_result':
        setBacktestResult(data)
        onBacktestResultRef.current?.(data)
        break
      case 'auth_ok':
        setAuthState('ok')
        break
      case 'auth_failed':
        setAuthState('failed')
        break
      default:
        resultSetters.current[data.type]?.(data)
        break
    }
  }, [])

  const { connected, send, latency: signalLatency, connect: signalConnect, nextReconnectIn: signalNextReconnect } = useWebSocket(WS_SIGNALS, {
    label: 'signal',
    onMessage: handleSignalMessage,
    authToken: SIGNAL_TOKEN || undefined,
    onOpen: () => { if (SIGNAL_TOKEN) setAuthState('pending') },
    autoConnect: !IS_MOCK && isFlagEnabled('auto-reconnect'),
  })

  return { signals, regime, backtestResult, circuitBreaker, portfolioResult, volSurfaceResult, cvarResult, stressTestResult, positionSizeResult, hawkesResult, fundingArbResult, authState, connected, sendSignalMessage: send, latency: signalLatency, connect: signalConnect, nextReconnectIn: signalNextReconnect }
}
