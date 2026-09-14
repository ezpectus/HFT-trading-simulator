import { useEffect, useRef } from 'react'

/**
 * Centralized toast notification effects for connection changes, fills, signals, and news.
 * Extracted from App.jsx to reduce component complexity.
 *
 * @param {object} params
 * @param {object} params.exchange - Exchange data object from useExchangeData/useMockExchangeData
 * @param {object} params.signals - Signal data object from useSignalData/useMockSignalData
 * @param {function} params.addToast - Toast add function from useToastStore
 * @param {function} params.playSound - Sound play function from useSoundAlerts
 */
export function useNotifications({ exchange, signals, addToast, playSound }) {
  const prevExConn = useRef(false)
  const prevSigConn = useRef(false)
  // Head-identity refs — fills/signals are capped at 50 (.slice(0,50) in
  // useExchangeData), so a length-diff dies permanently at the cap.
  const prevFillHead = useRef(null)
  const prevSignalHead = useRef(null)
  const prevNewsRef = useRef(null)
  const prevErrorRef = useRef(null)

  // Connection change notifications
  useEffect(() => {
    if (exchange.connected && !prevExConn.current) {
      addToast('success', 'Exchange Simulator connected')
      playSound('connect')
    } else if (!exchange.connected && prevExConn.current) {
      addToast('error', 'Exchange Simulator disconnected')
      playSound('disconnect')
    }
    prevExConn.current = exchange.connected
  }, [exchange.connected, addToast, playSound])

  useEffect(() => {
    if (signals.connected && !prevSigConn.current) {
      addToast('success', 'AI Signal Bot connected')
      playSound('connect')
    } else if (!signals.connected && prevSigConn.current) {
      addToast('warning', 'AI Signal Bot disconnected — retrying...')
      playSound('disconnect')
    }
    prevSigConn.current = signals.connected
  }, [signals.connected, addToast, playSound])

  // Notify on new fills (bot trades)
  useEffect(() => {
    const recentFill = exchange.fills[0]
    const headKey = recentFill && (recentFill.id ?? `${recentFill.received_at}-${recentFill.symbol}-${recentFill.filled_price}`)
    if (headKey && prevFillHead.current !== null && headKey !== prevFillHead.current && recentFill.status === 'FILLED') {
      addToast('info', `Fill: ${recentFill.side} ${recentFill.filled_quantity} ${recentFill.symbol} @ $${recentFill.filled_price} (${recentFill.exchange})`, 4000)
      playSound('fill')
    }
    prevFillHead.current = headKey
  }, [exchange.fills, addToast, playSound])

  // Surface server-side rejections (rate-limit, trading-stopped, bad fields)
  useEffect(() => {
    const err = exchange.lastError
    if (err && err.at !== prevErrorRef.current) {
      addToast('error', err.message, 5000)
      playSound('disconnect')
    }
    prevErrorRef.current = err ? err.at : prevErrorRef.current
  }, [exchange.lastError, addToast, playSound])

  // Notify on strong AI signals
  useEffect(() => {
    const sig = signals.signals[0]
    const headKey = sig && `${sig.timestamp}-${sig.symbol}-${sig.direction}-${sig.confidence}`
    if (headKey && prevSignalHead.current !== null && headKey !== prevSignalHead.current && sig.confidence >= 75) {
      addToast('info', `Strong signal: ${sig.direction} ${sig.symbol} (${sig.confidence?.toFixed(0)}% confidence)`, 4000)
      playSound('alert')
    }
    prevSignalHead.current = headKey
  }, [signals.signals, addToast, playSound])

  // News event notification
  useEffect(() => {
    const news = exchange.newsEvent
    if (news && (!prevNewsRef.current || prevNewsRef.current.symbol !== news.symbol || prevNewsRef.current.remaining < news.remaining)) {
      addToast('warning', `News event: ${news.symbol} ${news.intensity}x volatility spike (${news.direction})`, 5000)
      playSound('alert')
    }
    prevNewsRef.current = news
  }, [exchange.newsEvent, addToast, playSound])
}
