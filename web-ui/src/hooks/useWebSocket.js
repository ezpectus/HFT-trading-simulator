import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Ring buffer for capped message storage.
 * Prevents unbounded memory growth from high-frequency WebSocket messages.
 * @param {number} maxSize - Maximum number of entries to retain
 */
function createRingBuffer(maxSize = 5000) {
  const buffer = new Array(maxSize)
  let head = 0
  let count = 0

  return {
    push(item) {
      buffer[head] = item
      head = (head + 1) % maxSize
      if (count < maxSize) count++
    },
    toArray() {
      if (count < maxSize) return buffer.slice(0, count)
      return [...buffer.slice(head), ...buffer.slice(0, head)]
    },
    get size() { return count },
    clear() { head = 0; count = 0; buffer.fill(undefined) },
  }
}

/**
 * Generic WebSocket hook with auto-reconnect, per-message deflate,
 * message batching, and ring buffer memory cap.
 * @param {string} url - WebSocket URL
 * @param {object} options
 * @param {function} options.onMessage - Called for each (debatched) message
 * @param {function} options.onOpen
 * @param {function} options.onClose
 * @param {boolean} options.autoConnect - Default true
 * @param {boolean} options.syncOnReconnect - Request missed data on reconnect
 * @param {function} options.getLastTimestamp - Returns last seen timestamp for sync
 * @param {number} options.maxBufferSize - Ring buffer max entries (default 5000)
 * @param {number} options.batchInterval - Batching window in ms (default 50)
 * @param {string[]} options.batchTypes - Message types to batch (e.g. ['orderbook','candle'])
 * @param {boolean} options.perMessageDeflate - Enable compression (default true)
 */
export function useWebSocket(url, options = {}) {
  const {
    onMessage, onOpen, onClose, autoConnect = true,
    syncOnReconnect = false, getLastTimestamp,
    maxBufferSize = 5000,
    batchInterval = 50,
    batchTypes = [],
    perMessageDeflate = true,
  } = options

  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const pingTimer = useRef(null)
  const lastPingRef = useRef(0)
  const reconnectCount = useRef(0)
  const backoffRef = useRef(1000)
  const ringBufferRef = useRef(createRingBuffer(maxBufferSize))
  const batchQueueRef = useRef([])
  const batchTimerRef = useRef(null)
  const lastTimestampRef = useRef(0)

  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [latency, setLatency] = useState(null)
  const [reconnects, setReconnects] = useState(0)
  const [bufferSize, setBufferSize] = useState(0)

  const handlersRef = useRef({ onMessage, onOpen, onClose, getLastTimestamp })

  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, getLastTimestamp }
  })

  // Flush batched messages to the onMessage handler
  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
    }
    const queue = batchQueueRef.current
    if (queue.length === 0) return

    // Merge batched messages by type: latest wins for same type+symbol
    const merged = new Map()
    for (const msg of queue) {
      const key = msg.type + (msg.symbol ? `:${msg.symbol}` : '')
      merged.set(key, msg)
    }

    for (const msg of merged.values()) {
      handlersRef.current.onMessage?.(msg)
    }

    batchQueueRef.current = []
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // Clear any pending reconnect timer
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }

    try {
      // Per-message deflate: negotiate compression via WebSocket subprotocol
      // Browsers negotiate permessage-deflate automatically when supported.
      // We pass it as a hint; the server must also support it.
      const ws = new WebSocket(url, perMessageDeflate ? ['permessage-deflate'] : undefined)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setError(null)
        backoffRef.current = 1000
        reconnectCount.current += 1
        if (reconnectCount.current > 1) {
          setReconnects(reconnectCount.current - 1)
        }

        if (syncOnReconnect && reconnectCount.current > 1) {
          // Reconnection sync: request missed data since last timestamp
          const lastTs = handlersRef.current.getLastTimestamp?.() || lastTimestampRef.current || 0
          ws.send(JSON.stringify({ type: 'sync_state', last_timestamp: lastTs }))
        } else {
          ws.send(JSON.stringify({ type: 'subscribe' }))
        }

        // Start ping interval for latency measurement
        pingTimer.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            lastPingRef.current = Date.now()
            wsRef.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, 5000)
        handlersRef.current.onOpen?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Measure latency only for pong responses
          if (data.type === 'pong' && lastPingRef.current > 0) {
            setLatency(Date.now() - lastPingRef.current)
            lastPingRef.current = 0
          }

          // Track latest timestamp for reconnection sync
          const ts = data.timestamp || data.received_at || data.time || 0
          if (ts > lastTimestampRef.current) lastTimestampRef.current = ts

          // Store in ring buffer (memory cap)
          ringBufferRef.current.push(data)
          setBufferSize(ringBufferRef.current.size)

          // Check if this message type should be batched
          const shouldBatch = batchTypes.length > 0 && batchTypes.includes(data.type)

          if (shouldBatch) {
            // Queue for batching — high-frequency updates are merged
            batchQueueRef.current.push(data)
            if (!batchTimerRef.current) {
              batchTimerRef.current = setTimeout(flushBatch, batchInterval)
            }
          } else {
            // Non-batchable message: flush pending batch first, then deliver immediately
            if (batchQueueRef.current.length > 0) flushBatch()
            handlersRef.current.onMessage?.(data)
          }
        } catch (e) {
          console.error('[useWebSocket] Failed to parse message:', e, event.data?.slice(0, 200))
        }
      }

      ws.onerror = (_e) => {
        setError(`WebSocket error: ${url} (reconnect #${reconnectCount.current})`)
      }

      ws.onclose = () => {
        setConnected(false)
        setLatency(null)
        if (pingTimer.current) clearInterval(pingTimer.current)
        // Flush any pending batched messages before disconnect
        flushBatch()
        handlersRef.current.onClose?.()
        if (autoConnect) {
          const delay = backoffRef.current
          backoffRef.current = Math.min(backoffRef.current * 2, 30000)
          reconnectTimer.current = setTimeout(() => connect(), delay)
        }
      }
    } catch (e) {
      setError(e.message)
      if (autoConnect) {
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, 30000)
        reconnectTimer.current = setTimeout(() => connect(), delay)
      }
    }
  }, [url, autoConnect, perMessageDeflate, batchInterval, flushBatch])

  // Memoize batchTypes to prevent unnecessary reconnects
  const batchTypesKey = batchTypes.join(',')

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    if (pingTimer.current) clearInterval(pingTimer.current)
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    flushBatch()
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setLatency(null)
  }, [flushBatch])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data))
      return true
    }
    return false
  }, [])

  // Get buffered messages (ring buffer contents)
  const getBufferedMessages = useCallback(() => {
    return ringBufferRef.current.toArray()
  }, [])

  // Clear the ring buffer
  const clearBuffer = useCallback(() => {
    ringBufferRef.current.clear()
    setBufferSize(0)
  }, [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pingTimer.current) clearInterval(pingTimer.current)
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
      flushBatch()
      wsRef.current?.close()
    }
  }, [connect, autoConnect, flushBatch, batchTypesKey])

  return {
    connected, error, send, connect, disconnect, latency, reconnects,
    bufferSize, getBufferedMessages, clearBuffer,
  }
}
