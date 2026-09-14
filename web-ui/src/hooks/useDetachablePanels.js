import { isFlagEnabled } from '../featureFlags'
import { useToastStore } from '../stores/useToastStore'
import { useRef, useCallback, useEffect } from 'react'

function fmtNum(v, decimals = 2) {
  return (typeof v === 'number' ? v : 0).toFixed(decimals)
}

// Only panels wrapped in <DetachablePanel> (App.jsx: chart, orderbook) can
// actually detach — the other ids had renderers but no UI path to reach them.
const PANEL_CONFIG = {
  chart: { title: 'Chart — Trading Sim', width: 800, height: 500 },
  orderbook: { title: 'Order Book — Trading Sim', width: 400, height: 600 },
}

export function useDetachablePanels() {
  const popupsRef = useRef({})

  const detachPanel = useCallback((panelId, data) => {
    const config = PANEL_CONFIG[panelId]
    if (!config) return
    if (!isFlagEnabled('detachable-panels')) return

    // Close existing popup for this panel
    if (popupsRef.current[panelId] && !popupsRef.current[panelId].closed) {
      popupsRef.current[panelId].close()
    }

    const left = window.screenX + window.innerWidth + 10
    const top = window.screenY

    const popup = window.open('', panelId, `width=${config.width},height=${config.height},left=${left},top=${top}`)
    if (!popup) {
      useToastStore.getState().addToast('warning', 'Popup blocked — allow popups to detach panels')
      return
    }

    popupsRef.current[panelId] = popup

    // Build DOM via createElement (no document.write / innerHTML injection)
    const doc = popup.document
    doc.title = config.title

    // <style>
    const style = doc.createElement('style')
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0f1521; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; overflow: hidden; }
      .header { padding: 6px 10px; background: #161b26; border-bottom: 1px solid #1e2433; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
      .content { padding: 8px; overflow: auto; height: calc(100vh - 30px); }
      .ob-row { display: flex; justify-content: space-between; padding: 2px 6px; font-size: 10px; }
      .bid { color: #22c55e; } .ask { color: #ef4444; }
      .card { background: #161b26; border-radius: 6px; padding: 10px; margin-bottom: 6px; }
      .label { font-size: 9px; color: #64748b; text-transform: uppercase; }
      .value { font-size: 16px; font-weight: bold; }
      .green { color: #22c55e; } .red { color: #ef4444; }
    `
    doc.head.appendChild(style)

    // Header bar
    const header = doc.createElement('div')
    header.className = 'header'
    const titleSpan = doc.createElement('span')
    titleSpan.textContent = config.title
    const closeSpan = doc.createElement('span')
    closeSpan.textContent = '[x]'
    closeSpan.style.cursor = 'pointer'
    closeSpan.addEventListener('click', () => popup.close())
    header.appendChild(titleSpan)
    header.appendChild(closeSpan)
    doc.body.appendChild(header)

    // Content container
    const content = doc.createElement('div')
    content.className = 'content'
    content.id = 'content'
    content.textContent = 'Loading...'
    doc.body.appendChild(content)

    // Initial render — popup content is written via direct same-origin DOM
    // access (no cross-context channel needed).
    updatePopupContent(popup, panelId, data)
  }, [])

  const updatePopupContent = useCallback((popup, panelId, data) => {
    if (!popup || popup.closed) return
    const doc = popup.document
    const el = doc.getElementById('content')
    if (!el) return

    // Clear previous content
    while (el.firstChild) el.removeChild(el.firstChild)

    const createCard = (label, valueText, valueClass = '') => {
      const card = doc.createElement('div')
      card.className = 'card'
      const lbl = doc.createElement('div')
      lbl.className = 'label'
      lbl.textContent = label
      const val = doc.createElement('div')
      val.className = 'value ' + valueClass
      val.textContent = valueText
      card.appendChild(lbl)
      card.appendChild(val)
      return card
    }

    if (panelId === 'orderbook') {
      const ob = data.orderbookData
      if (!ob) { el.textContent = 'No data'; return }
      const spreadVal = ob.bids?.length && ob.asks?.length ? fmtNum(ob.asks[0].price - ob.bids[0].price, 2) : '--'
      const spreadCard = createCard('Spread', '$' + spreadVal)
      el.appendChild(spreadCard)
      const asksDiv = doc.createElement('div')
      for (const a of (ob.asks || []).slice(0, 15)) {
        const row = doc.createElement('div')
        row.className = 'ob-row ask'
        const s1 = doc.createElement('span'); s1.textContent = '$' + fmtNum(a.price, 2)
        const s2 = doc.createElement('span'); s2.textContent = fmtNum(a.quantity, 4)
        row.appendChild(s1); row.appendChild(s2)
        asksDiv.appendChild(row)
      }
      el.appendChild(asksDiv)
      const sep = doc.createElement('div')
      sep.style.cssText = 'border-top:1px solid #1e2433;margin:4px 0'
      el.appendChild(sep)
      const bidsDiv = doc.createElement('div')
      for (const b of (ob.bids || []).slice(0, 15)) {
        const row = doc.createElement('div')
        row.className = 'ob-row bid'
        const s1 = doc.createElement('span'); s1.textContent = fmtNum(b.quantity, 4)
        const s2 = doc.createElement('span'); s2.textContent = '$' + fmtNum(b.price, 2)
        row.appendChild(s1); row.appendChild(s2)
        bidsDiv.appendChild(row)
      }
      el.appendChild(bidsDiv)
    } else if (panelId === 'chart') {
      const candles = data.candles || []
      if (candles.length === 0) { el.textContent = 'No candles'; return }
      const last = candles[candles.length - 1]
      const prev = candles[candles.length - 2] || last
      const change = ((last.close - prev.close) / prev.close * 100).toFixed(2)
      el.appendChild(createCard((data.symbol || '') + ' — ' + (data.exchange || ''), ''))
      el.appendChild(createCard('Price', '$' + fmtNum(last.close, 2)))
      el.appendChild(createCard('Change', (change >= 0 ? '+' : '') + change + '%', change >= 0 ? 'green' : 'red'))
      const ohlcCard = doc.createElement('div')
      ohlcCard.className = 'card'
      const ohlcLabel = doc.createElement('div'); ohlcLabel.className = 'label'; ohlcLabel.textContent = 'OHLC'
      const ohlcVal = doc.createElement('div'); ohlcVal.style.fontSize = '12px'
      ohlcVal.textContent = 'O:' + last.open + ' H:' + last.high + ' L:' + last.low + ' C:' + last.close
      ohlcCard.appendChild(ohlcLabel); ohlcCard.appendChild(ohlcVal)
      el.appendChild(ohlcCard)
      el.appendChild(createCard('Volume', fmtNum(last.volume, 0)))
      el.appendChild(createCard('Candles', String(candles.length)))
    }
  }, [])

  const updateDetached = useCallback((panelId, data) => {
    const popup = popupsRef.current[panelId]
    if (popup && !popup.closed) {
      updatePopupContent(popup, panelId, data)
    }
  }, [updatePopupContent])

  const isDetached = useCallback((panelId) => {
    return popupsRef.current[panelId] != null && !popupsRef.current[panelId].closed
  }, [])

  const closeDetached = useCallback((panelId) => {
    if (popupsRef.current[panelId]) {
      popupsRef.current[panelId].close()
      delete popupsRef.current[panelId]
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const id of Object.keys(popupsRef.current)) {
        try { popupsRef.current[id].close() } catch { /* popup already closed */ }
        delete popupsRef.current[id]
      }
    }
  }, [])

  return { detachPanel, updateDetached, isDetached, closeDetached, PANEL_CONFIG }
}
