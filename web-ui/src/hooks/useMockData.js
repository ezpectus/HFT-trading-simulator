import { useEffect, useRef, useState, useCallback } from 'react'
import {
  generateInitialSnapshot,
  generateCandles,
  generateOrderBook,
  generateSignal,
  generateFill,
  generateNewsEvent,
  maybeUpdatePosition,
  MOCK_SYMBOLS,
  MOCK_EXCHANGES,
} from '../utils/mockData'

const IS_MOCK = import.meta.env.VITE_MOCK_MODE === 'true' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('mock-mode') === 'true')

/**
 * Mock exchange data hook — replaces useExchangeData when in mock mode.
 * Simulates a live market feed with periodic updates.
 */
export function useMockExchangeData() {
  const [candles, setCandles] = useState([])
  const [prices, setPrices] = useState({})
  const [accounts, setAccounts] = useState({})
  const [fills, setFills] = useState([])
  const [orderbooks, setOrderbooks] = useState({})
  const [fundingRates] = useState({})
  const [candlesToFunding] = useState(8)
  const [newsEvent, setNewsEvent] = useState(null)
  const [weekendMode] = useState(false)
  const [replayPaused, setReplayPaused] = useState(false)
  const [tradingActive, setTradingActive] = useState(true)
  const candleMap = useRef(new Map())
  const intervalRef = useRef(null)
  const accountsRef = useRef({})
  const pricesRef = useRef({})

  // Initialize with snapshot
  useEffect(() => {
    const snapshot = generateInitialSnapshot()
    for (const c of snapshot.candles) {
      candleMap.current.set(`${c.exchange}|${c.symbol}|${c.timestamp}`, c)
    }
    const all = Array.from(candleMap.current.values())
      .sort((a, b) => a.timestamp - b.timestamp)
    setCandles(all.slice(-500))
    setPrices(snapshot.prices)
    setAccounts(snapshot.accounts)
    setOrderbooks(snapshot.orderbooks)
    accountsRef.current = snapshot.accounts

    // Periodic updates every 2 seconds
    intervalRef.current = setInterval(() => {
      // Generate new candle for each symbol/exchange
      const newCandles = []
      const newPrices = {}
      const newOrderbooks = {}

      for (const exchange of MOCK_EXCHANGES) {
        for (const symbol of MOCK_SYMBOLS) {
          const key = `${exchange}|${symbol}`
          const lastPrice = pricesRef.current[key] || 100
          const newCandle = generateCandles(symbol, exchange, 1, 60)[0]
          newCandle.timestamp = Math.floor(Date.now() / 1000)
          newCandle.open = lastPrice
          newCandles.push(newCandle)
          newPrices[key] = newCandle.close
          newOrderbooks[key] = generateOrderBook(symbol, exchange, newCandle.close)

          // Maybe generate a fill
          if (Math.random() < 0.3) {
            const fill = generateFill(symbol, exchange, newCandle.close, accountsRef.current)
            setFills(prev => [fill, ...prev].slice(0, 50))
          }

          // Maybe update positions
          accountsRef.current = maybeUpdatePosition(
            accountsRef.current, symbol, exchange, newCandle.close
          )
        }
      }

      // Update candles
      for (const c of newCandles) {
        candleMap.current.set(`${c.exchange}|${c.symbol}|${c.timestamp}`, c)
      }
      const allCandles = Array.from(candleMap.current.values())
        .sort((a, b) => a.timestamp - b.timestamp)
      // Keep last 500 per symbol
      if (allCandles.length > 500 * MOCK_SYMBOLS.length * MOCK_EXCHANGES.length) {
        const toRemove = allCandles.slice(0, allCandles.length - 500 * MOCK_SYMBOLS.length * MOCK_EXCHANGES.length)
        for (const c of toRemove) {
          candleMap.current.delete(`${c.exchange}|${c.symbol}|${c.timestamp}`)
        }
      }
      setCandles(allCandles.slice(-500))
      pricesRef.current = { ...pricesRef.current, ...newPrices }
      setPrices({ ...pricesRef.current })
      setOrderbooks(prev => ({ ...prev, ...newOrderbooks }))
      setAccounts({ ...accountsRef.current })

      // Random news event (5% chance)
      if (Math.random() < 0.05) {
        setNewsEvent(generateNewsEvent())
      }
    }, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const submitOrder = useCallback((order) => {
    const fill = generateFill(order.symbol, order.exchange || 'binance',
      pricesRef.current[`${order.exchange || 'binance'}|${order.symbol}`] || 100, accountsRef.current)
    setFills(prev => [fill, ...prev].slice(0, 50))
    return true
  }, [])

  const closePosition = useCallback((exchange, symbol) => {
    if (accountsRef.current[exchange]?.positions?.[symbol]) {
      delete accountsRef.current[exchange].positions[symbol]
      setAccounts({ ...accountsRef.current })
    }
    return true
  }, [])

  const sendSpeedChange = useCallback(() => true, [])
  const sendConfigUpdate = useCallback(() => true, [])
  const toggleReplay = useCallback(() => {
    setReplayPaused(prev => !prev)
  }, [])
  const scrubReplay = useCallback(() => {}, [])
  const startTrading = useCallback(() => setTradingActive(true), [])
  const stopTrading = useCallback(() => setTradingActive(false), [])

  return {
    candles, prices, accounts, arbitrage: null, fills, orderbooks,
    fundingRates, candlesToFunding, newsEvent, weekendMode, replayPaused, tradingActive,
    connected: true, latency: 0, reconnects: 0,
    submitOrder, closePosition, sendSpeedChange, sendConfigUpdate,
    toggleReplay, scrubReplay, startTrading, stopTrading,
  }
}

/**
 * Mock signal data hook — replaces useSignalData when in mock mode.
 */
export function useMockSignalData() {
  const [signals, setSignals] = useState([])
  const [regime, setRegime] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    // Generate initial signals
    const initialSignals = []
    for (let i = 0; i < 10; i++) {
      const symbol = MOCK_SYMBOLS[Math.floor(Math.random() * MOCK_SYMBOLS.length)]
      const exchange = MOCK_EXCHANGES[Math.floor(Math.random() * MOCK_EXCHANGES.length)]
      initialSignals.push(generateSignal(symbol, exchange, 100))
    }
    setSignals(initialSignals)

    // Periodic new signals
    intervalRef.current = setInterval(() => {
      const symbol = MOCK_SYMBOLS[Math.floor(Math.random() * MOCK_SYMBOLS.length)]
      const exchange = MOCK_EXCHANGES[Math.floor(Math.random() * MOCK_EXCHANGES.length)]
      const sig = generateSignal(symbol, exchange, 100)
      setSignals(prev => [sig, ...prev].slice(0, 50))

      // Occasionally update regime
      if (Math.random() < 0.1) {
        setRegime({
          type: 'market_regime',
          regime: ['trending', 'ranging', 'volatile', 'calm'][Math.floor(Math.random() * 4)],
          confidence: 50 + Math.random() * 40,
        })
      }
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return {
    signals, regime, backtestResult: null, circuitBreaker: null,
    connected: true, sendSignalMessage: () => true, latency: 0,
  }
}

export { IS_MOCK }
