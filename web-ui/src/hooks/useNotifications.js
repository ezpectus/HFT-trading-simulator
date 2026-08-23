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
  const prevFillCount = useRef(0)
  const prevSignalCount = useRef(0)
  const prevNewsRef = useRef(null)

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
    const newFills = exchange.fills.length - prevFillCount.current
    if (newFills > 0 && prevFillCount.current > 0) {
      const recentFill = exchange.fills[0]
      if (recentFill && recentFill.status === 'FILLED') {
        addToast('info', `Fill: ${recentFill.side} ${recentFill.filled_quantity} ${recentFill.symbol} @ $${recentFill.filled_price} (${recentFill.exchange})`, 4000)
        playSound('fill')
      }
    }
    prevFillCount.current = exchange.fills.length
  }, [exchange.fills, addToast])

  // Notify on strong AI signals
  useEffect(() => {
    if (signals.signals.length > prevSignalCount.current && prevSignalCount.current > 0) {
      const sig = signals.signals[0]
      if (sig && sig.confidence >= 75) {
        addToast('info', `Strong signal: ${sig.direction} ${sig.symbol} (${sig.confidence?.toFixed(0)}% confidence)`, 4000)
        playSound('alert')
      }
    }
    prevSignalCount.current = signals.signals.length
  }, [signals.signals, addToast])

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
