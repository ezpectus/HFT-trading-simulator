import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'
import { IS_MOCK } from './useMockData'

const WS_EXCHANGE = import.meta.env.VITE_WS_EXCHANGE || 'ws://localhost:8765'
const WS_SIGNALS = import.meta.env.VITE_WS_SIGNALS || 'ws://localhost:8766'
// Shared secret for the signal publisher handshake — matches the bot's
// api.auth_token / AI_BOT_AUTH_TOKEN. Empty = server-side auth disabled.
const SIGNAL_TOKEN = import.meta.env.VITE_SIGNAL_TOKEN || ''
// Control-plane token for the exchange simulator — matches the server's
// EXCHANGE_CONTROL_TOKEN. Empty = control commands unauthenticated (dev).
const EXCHANGE_TOKEN = import.meta.env.VITE_EXCHANGE_TOKEN || ''

/**
 * Main exchange data hook — connects to exchange simulator.
 * Manages candles, prices, accounts, order books, and arbitrage data.
 */
export function useExchangeData() {
  const [candles, setCandles] = useState([])
  const [prices, setPrices] = useState({})
  const [accounts, setAccounts] = useState({})
  const [arbitrage, setArbitrage] = useState(null)
  const [fills, setFills] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [orderbooks, setOrderbooks] = useState({})
  const [fundingRates, setFundingRates] = useState({})
  const [candlesToFunding, setCandlesToFunding] = useState(null)
  const [newsEvent, setNewsEvent] = useState(null)
  const [weekendMode, setWeekendMode] = useState(false)
  const [replayPaused, setReplayPaused] = useState(false)
  const [tradingActive, setTradingActive] = useState(true)
  const [optionsChain, setOptionsChain] = useState(null)
  const [lastError, setLastError] = useState(null)
  const [openOrders, setOpenOrders] = useState({})
  const lastTimestampRef = useRef(0)
  const candleMap = useRef(new Map())
  // client_order_id -> {resolve, timer} for submitOrder ack correlation
  const pendingAcks = useRef(new Map())
  // seq gap detection — a dropped broadcast leaves orderbook_deltas applying
  // onto a stale book; on gap we request sync_state (S151)
  const lastSeqRef = useRef(0)
  const lastResyncReqRef = useRef(0)
  const sendExchangeRef = useRef(null)

  const handleExchangeMessage = useCallback((data) => {
    // The sim's order ack is a `fill` message carrying order.status:
    // PENDING = resting, FILLED/REJECTED/CANCELLED = terminal.
    const trackOrderStatus = (order) => {
      if (!order?.id || !order?.exchange) return
      const key = `${order.exchange}|${order.id}`
      if (order.status === 'PENDING') {
        setOpenOrders(prev => (key in prev ? prev : { ...prev, [key]: order }))
      } else {
        setOpenOrders(prev => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    }

    const resolveAck = (order) => {
      const cid = order?.client_order_id
      const pending = cid && pendingAcks.current.get(cid)
      if (pending) {
        pendingAcks.current.delete(cid)
        clearTimeout(pending.timer)
        pending.resolve(order)
      }
    }

    switch (data.type) {
      case 'snapshot':
      case 'candles':
      case 'sync_state': {
        // Only `candles` broadcasts carry seq — on a gap, resync from the
        // last *contiguous* timestamp (must run before the ts update below).
        if (typeof data.seq === 'number') {
          const last = lastSeqRef.current
          if (last && data.seq > last + 1) {
            const now = Date.now()
            if (now - lastResyncReqRef.current > 5000) {
              lastResyncReqRef.current = now
              sendExchangeRef.current?.({
                type: 'sync_state',
                last_timestamp: lastTimestampRef.current,
              })
            }
          }
          lastSeqRef.current = data.seq
        }
        if (data.timestamp) {
          lastTimestampRef.current = Math.max(lastTimestampRef.current, data.timestamp)
        }
        if (data.candles) {
          // Merge candles into map by exchange+symbol+timestamp
          for (const c of data.candles) {
            const key = `${c.exchange}|${c.symbol}|${c.timestamp}`
            candleMap.current.set(key, c)
          }
          // Sort + trim when map grows beyond cap
          if (candleMap.current.size > 500) {
            const all = Array.from(candleMap.current.values())
              .sort((a, b) => a.timestamp - b.timestamp)
            // Keep last 500
            const toKeep = all.slice(-500)
            candleMap.current.clear()
            for (const c of toKeep) {
              const key = `${c.exchange}|${c.symbol}|${c.timestamp}`
              candleMap.current.set(key, c)
            }
            setCandles(toKeep)
          } else {
            // Incremental update: sort by timestamp before setting state
            const all = Array.from(candleMap.current.values())
              .sort((a, b) => a.timestamp - b.timestamp)
            setCandles(all)
          }
        }
        if (data.prices) setPrices(data.prices)
        if (data.accounts) setAccounts(data.accounts)
        if (data.orderbooks) setOrderbooks(data.orderbooks)
        if (data.orderbook_deltas) {
          setOrderbooks(prev => {
            const next = { ...prev }
            for (const [key, delta] of Object.entries(data.orderbook_deltas)) {
              const existing = next[key]
              if (!existing) continue  // Need full snapshot first
              const updated = { ...existing }
              const applyDeltas = (side, changes) => {
                const levels = [...updated[side]]
                for (const ch of changes) {
                  const idx = levels.findIndex(l => l.price === ch.p)
                  if (ch.q > 0) {
                    if (idx >= 0) {
                      levels[idx] = { price: ch.p, quantity: ch.q }
                    } else {
                      levels.push({ price: ch.p, quantity: ch.q })
                    }
                  } else if (idx >= 0) {
                    levels.splice(idx, 1)
                  }
                }
                levels.sort((a, b) =>
                  side === 'bids' ? b.price - a.price : a.price - b.price
                )
                return levels
              }
              if (delta.bids) updated.bids = applyDeltas('bids', delta.bids)
              if (delta.asks) updated.asks = applyDeltas('asks', delta.asks)
              next[key] = updated
            }
            return next
          })
        }
        if (data.funding_rates) setFundingRates(data.funding_rates)
        if (data.candles_to_funding != null) setCandlesToFunding(data.candles_to_funding)
        if (data.news_event !== undefined) setNewsEvent(data.news_event)
        if (data.weekend_mode !== undefined) setWeekendMode(data.weekend_mode)
        if (data.trading_active !== undefined) setTradingActive(data.trading_active)
        if (data.open_orders) {
          // Authoritative resting-order set — replaces, not merges, so orders
          // cancelled while disconnected don't linger.
          const flat = {}
          for (const orders of Object.values(data.open_orders)) {
            for (const o of orders) flat[`${o.exchange}|${o.id}`] = o
          }
          setOpenOrders(flat)
        }
        break
      }
      case 'fill': {
        setFills(prev => [{ ...data.order, received_at: Date.now() }, ...prev].slice(0, 50))
        trackOrderStatus(data.order)
        resolveAck(data.order)
        break
      }
      case 'fills_batch': {
        // Engine-generated fills (SL/TP, liquidations, arb executions) arrive
        // batched — without this case they were silently dropped by `default:`.
        if (Array.isArray(data.orders) && data.orders.length) {
          const now = Date.now()
          setFills(prev => [...data.orders.map(o => ({ ...o, received_at: now })), ...prev].slice(0, 50))
          for (const o of data.orders) {
            trackOrderStatus(o)
            resolveAck(o)
          }
        }
        break
      }
      case 'order_cancelled': {
        const order = data.order
        if (order?.id) {
          setOpenOrders(prev => {
            const key = `${order.exchange}|${order.id}`
            if (!(key in prev)) return prev
            const next = { ...prev }
            delete next[key]
            return next
          })
        }
        break
      }
      case 'orders_cancelled': {
        if (Array.isArray(data.order_ids) && data.order_ids.length) {
          const ids = new Set(data.order_ids.map(id => `${data.exchange}|${id}`))
          setOpenOrders(prev => {
            const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k)))
            return Object.keys(next).length === Object.keys(prev).length ? prev : next
          })
        }
        break
      }
      case 'error': {
        // Server rejections (rate-limit, trading-stopped, bad order fields) —
        // surfaced via lastError → useNotifications toast.
        setLastError({ message: data.message || 'Exchange error', at: Date.now() })
        break
      }
      case 'arbitrage_scan': {
        setArbitrage(data)
        break
      }
      case 'options_chain': {
        setOptionsChain(data)
        break
      }
      case 'replay_state': {
        setReplayPaused(data.paused || false)
        break
      }
      case 'trading_state': {
        setTradingActive(data.trading_active !== false)
        break
      }
      case 'replay_candles': {
        if (data.candles) {
          for (const c of data.candles) {
            const key = `${c.exchange}|${c.symbol}|${c.timestamp}`
            candleMap.current.set(key, c)
          }
          const all = Array.from(candleMap.current.values())
            .sort((a, b) => a.timestamp - b.timestamp)
          setCandles(all.slice(-500))
        }
        break
      }
      case 'audit_logs': {
        if (Array.isArray(data.logs) && data.logs.length) {
          setAuditLogs(prev => [...data.logs, ...prev].slice(0, 200))
        }
        break
      }
      default:
        break
    }
  }, [])

  const { connected: exchangeConnected, send: sendExchange, latency: exchangeLatency, reconnects: exchangeReconnects, connect: exchangeConnect, nextReconnectIn: exchangeNextReconnect } = useWebSocket(WS_EXCHANGE, {
    onMessage: handleExchangeMessage,
    onOpen: () => { lastSeqRef.current = 0 },  // server restarts its counter — reset baseline
    authToken: EXCHANGE_TOKEN || undefined,
    syncOnReconnect: true,
    getLastTimestamp: () => lastTimestampRef.current,
    autoConnect: !IS_MOCK,  // mock mode — never open the real socket
  })

  useEffect(() => {
    sendExchangeRef.current = sendExchange
  })

  const submitOrder = useCallback((order) => {
    // client_order_id is stamped at send time so a queued/replayed message
    // (sendExchange queues while disconnected) dedupes server-side on flush —
    // and the sim echoes it back in the fill ack, which resolves the promise.
    const cid = order.client_order_id || `ui_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const sent = sendExchange({ type: 'order', ...order, client_order_id: cid })
    // Resolves with the acked order, or null if no ack within 5s. S236: the
    // 5s window only applies when the message actually went on the wire — a
    // queued message will send on reconnect with the SAME cid, so the ack may
    // still arrive and server-side dedup still applies. Timing it out at 5s
    // while it sat queued told the UI "no response" for an order that was
    // about to be sent — and a user retry with a fresh cid bypassed dedup
    // into a double order.
    return new Promise((resolve) => {
      const pending = { resolve, timer: null }
      pendingAcks.current.set(cid, pending)
      if (sent) {
        pending.timer = setTimeout(() => {
          pendingAcks.current.delete(cid)
          resolve(null)
        }, 5000)
      }
    })
  }, [sendExchange])

  // Orders queued while offline carry no ack timer — once the socket is back,
  // useWebSocket's onopen flush has already put them on the wire (with the
  // same cid, so server dedup still applies), so start their 5s window here.
  useEffect(() => {
    if (!exchangeConnected) return
    pendingAcks.current.forEach((pending, cid) => {
      if (pending.timer === null) {
        pending.timer = setTimeout(() => {
          pendingAcks.current.delete(cid)
          pending.resolve(null)
        }, 5000)
      }
    })
  }, [exchangeConnected])

  const cancelOrder = useCallback((exchange, orderId) => {
    return sendExchange({ type: 'cancel_order', exchange, order_id: orderId })
  }, [sendExchange])

  const cancelAllOrders = useCallback((exchange, symbol) => {
    const msg = { type: 'cancel_all_orders', exchange }
    if (symbol) msg.symbol = symbol
    return sendExchange(msg)
  }, [sendExchange])

  const closePosition = useCallback((exchange, symbol) => {
    return sendExchange({ type: 'close_position', exchange, symbol })
  }, [sendExchange])

  const requestOptionsChain = useCallback((symbol, strikes, expiries) => {
    const msg = { type: 'options_chain', symbol }
    if (strikes) msg.strikes = strikes
    if (expiries) msg.expiries = expiries
    return sendExchange(msg)
  }, [sendExchange])

  const sendSpeedChange = useCallback((speed) => {
    return sendExchange({ type: 'set_speed', speed })
  }, [sendExchange])

  const sendConfigUpdate = useCallback((updates) => {
    return sendExchange({ type: 'update_config', updates })
  }, [sendExchange])

  const toggleReplay = useCallback(() => {
    const action = replayPaused ? 'resume' : 'pause'
    return sendExchange({ type: 'replay', action })
  }, [sendExchange, replayPaused])

  const startTrading = useCallback(() => {
    return sendExchange({ type: 'start_trading' })
  }, [sendExchange])

  const stopTrading = useCallback(() => {
    return sendExchange({ type: 'stop_trading' })
  }, [sendExchange])

  const scrubReplay = useCallback((offset) => {
    return sendExchange({ type: 'replay', action: 'scrub', offset })
  }, [sendExchange])

  return {
    candles,
    prices,
    accounts,
    arbitrage,
    fills,
    auditLogs,
    orderbooks,
    fundingRates,
    candlesToFunding,
    newsEvent,
    weekendMode,
    replayPaused,
    tradingActive,
    optionsChain,
    lastError,
    openOrders,
    connected: exchangeConnected,
    latency: exchangeLatency,
    reconnects: exchangeReconnects,
    connect: exchangeConnect,
    nextReconnectIn: exchangeNextReconnect,
    submitOrder,
    cancelOrder,
    cancelAllOrders,
    closePosition,
    requestOptionsChain,
    sendSpeedChange,
    sendConfigUpdate,
    toggleReplay,
    scrubReplay,
    startTrading,
    stopTrading,
  }
}

/**
 * AI Signal data hook — connects to AI Signal Bot publisher.
 * @param {object} options - { onBacktestResult }
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
      case 'comparison_result':
        setBacktestResult(data)
        break
      case 'portfolio_result':
        setPortfolioResult(data)
        break
      case 'vol_surface_result':
        setVolSurfaceResult(data)
        break
      case 'cvar_result':
        setCvarResult(data)
        break
      case 'stress_test_result':
        setStressTestResult(data)
        break
      case 'position_size_result':
        setPositionSizeResult(data)
        break
      case 'hawkes_result':
        setHawkesResult(data)
        break
      case 'funding_arb_result':
        setFundingArbResult(data)
        break
      case 'auth_ok':
        setAuthState('ok')
        break
      case 'auth_failed':
        setAuthState('failed')
        break
      default:
        break
    }
  }, [])

  const { connected, send, latency: signalLatency, connect: signalConnect, nextReconnectIn: signalNextReconnect } = useWebSocket(WS_SIGNALS, {
    onMessage: handleSignalMessage,
    authToken: SIGNAL_TOKEN || undefined,
    onOpen: () => { if (SIGNAL_TOKEN) setAuthState('pending') },
    autoConnect: !IS_MOCK,  // mock mode — never open the real socket
  })

  return { signals, regime, backtestResult, circuitBreaker, portfolioResult, volSurfaceResult, cvarResult, stressTestResult, positionSizeResult, hawkesResult, fundingArbResult, authState, connected, sendSignalMessage: send, latency: signalLatency, connect: signalConnect, nextReconnectIn: signalNextReconnect }
}
