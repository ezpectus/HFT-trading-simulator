import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'

const WS_EXCHANGE = import.meta.env.VITE_WS_EXCHANGE || 'ws://localhost:8765'
const WS_SIGNALS = import.meta.env.VITE_WS_SIGNALS || 'ws://localhost:8766'

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
  const [orderbooks, setOrderbooks] = useState({})
  const [fundingRates, setFundingRates] = useState({})
  const [candlesToFunding, setCandlesToFunding] = useState(null)
  const [newsEvent, setNewsEvent] = useState(null)
  const [weekendMode, setWeekendMode] = useState(false)
  const [replayPaused, setReplayPaused] = useState(false)
  const lastTimestampRef = useRef(0)
  const candleMap = useRef(new Map())

  const handleExchangeMessage = useCallback((data) => {
    switch (data.type) {
      case 'snapshot':
      case 'candles':
      case 'sync_state': {
        if (data.timestamp) {
          lastTimestampRef.current = Math.max(lastTimestampRef.current, data.timestamp)
        }
        if (data.candles) {
          // Merge candles into map by exchange+symbol+timestamp
          for (const c of data.candles) {
            const key = `${c.exchange}|${c.symbol}|${c.timestamp}`
            candleMap.current.set(key, c)
          }
          // Convert to sorted array (newest last)
          const all = Array.from(candleMap.current.values())
            .sort((a, b) => a.timestamp - b.timestamp)
          // Keep last 500 to avoid memory growth
          if (all.length > 500) {
            const toRemove = all.slice(0, all.length - 500)
            for (const c of toRemove) {
              candleMap.current.delete(`${c.exchange}|${c.symbol}|${c.timestamp}`)
            }
            setCandles(all.slice(-500))
          } else {
            setCandles(all)
          }
        }
        if (data.prices) setPrices(data.prices)
        if (data.accounts) setAccounts(data.accounts)
        if (data.orderbooks) setOrderbooks(data.orderbooks)
        if (data.funding_rates) setFundingRates(data.funding_rates)
        if (data.candles_to_funding != null) setCandlesToFunding(data.candles_to_funding)
        if (data.news_event !== undefined) setNewsEvent(data.news_event)
        if (data.weekend_mode !== undefined) setWeekendMode(data.weekend_mode)
        break
      }
      case 'fill': {
        setFills(prev => [{ ...data.order, received_at: Date.now() }, ...prev].slice(0, 50))
        break
      }
      case 'arbitrage_scan': {
        setArbitrage(data)
        break
      }
      case 'replay_state': {
        setReplayPaused(data.paused || false)
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
      default:
        break
    }
  }, [])

  const { connected: exchangeConnected, send: sendExchange, latency: exchangeLatency, reconnects: exchangeReconnects } = useWebSocket(WS_EXCHANGE, {
    onMessage: handleExchangeMessage,
    syncOnReconnect: true,
    getLastTimestamp: () => lastTimestampRef.current,
  })

  const submitOrder = useCallback((order) => {
    return sendExchange({ type: 'order', ...order })
  }, [sendExchange])

  const closePosition = useCallback((exchange, symbol) => {
    return sendExchange({ type: 'close_position', exchange, symbol })
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

  const scrubReplay = useCallback((offset) => {
    return sendExchange({ type: 'replay', action: 'scrub', offset })
  }, [sendExchange])

  return {
    candles,
    prices,
    accounts,
    arbitrage,
    fills,
    orderbooks,
    fundingRates,
    candlesToFunding,
    newsEvent,
    weekendMode,
    replayPaused,
    connected: exchangeConnected,
    latency: exchangeLatency,
    reconnects: exchangeReconnects,
    submitOrder,
    closePosition,
    sendSpeedChange,
    sendConfigUpdate,
    toggleReplay,
    scrubReplay,
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
      case 'backtest_result':
        setBacktestResult(data)
        onBacktestResultRef.current?.(data)
        break
      default:
        break
    }
  }, [])

  const { connected, send, latency: signalLatency } = useWebSocket(WS_SIGNALS, {
    onMessage: handleSignalMessage,
  })

  return { signals, regime, backtestResult, connected, sendSignalMessage: send, latency: signalLatency }
}
