import { useRef, useCallback } from 'react'

function fmtNum(v, decimals = 2) {
  return (typeof v === 'number' ? v : 0).toFixed(decimals)
}

const PANEL_CONFIG = {
  chart: { title: 'Chart — Trading Sim', width: 800, height: 500 },
  orderbook: { title: 'Order Book — Trading Sim', width: 400, height: 600 },
  account: { title: 'Account — Trading Sim', width: 400, height: 500 },
  signals: { title: 'AI Signals — Trading Sim', width: 500, height: 600 },
  arbitrage: { title: 'Arbitrage — Trading Sim', width: 500, height: 400 },
  performance: { title: 'Performance — Trading Sim', width: 600, height: 500 },
}

export function useDetachablePanels() {
  const popupsRef = useRef({})
  const channelRef = useRef(null)

  const getChannel = useCallback(() => {
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel('trading-sim-panel')
    }
    return channelRef.current
  }, [])

  const detachPanel = useCallback((panelId, data) => {
    const config = PANEL_CONFIG[panelId]
    if (!config) return

    // Close existing popup for this panel
    if (popupsRef.current[panelId] && !popupsRef.current[panelId].closed) {
      popupsRef.current[panelId].close()
    }

    const left = window.screenX + window.innerWidth + 10
    const top = window.screenY

    const popup = window.open('', panelId, `width=${config.width},height=${config.height},left=${left},top=${top}`)
    if (!popup) {
      alert('Popup blocked. Please allow popups for detachable panels.')
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
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { text-align: left; color: #64748b; padding: 4px; border-bottom: 1px solid #1e2433; }
      td { padding: 3px 4px; border-bottom: 1px solid #161b26; }
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

    // Send initial data
    const ch = getChannel()
    ch.postMessage({ panelId, type: 'init', data })

    // Update popup content
    updatePopupContent(popup, panelId, data)
  }, [getChannel])

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

    const createTable = (headers, rows) => {
      const table = doc.createElement('table')
      const thead = doc.createElement('thead')
      const htr = doc.createElement('tr')
      for (const h of headers) {
        const th = doc.createElement('th')
        th.textContent = h
        htr.appendChild(th)
      }
      thead.appendChild(htr)
      const tbody = doc.createElement('tbody')
      for (const row of rows) {
        const tr = doc.createElement('tr')
        for (const cell of row) {
          const td = doc.createElement('td')
          if (cell.cls) td.className = cell.cls
          td.textContent = cell.text
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(thead)
      table.appendChild(tbody)
      return table
    }

    if (panelId === 'orderbook') {
      const ob = data.orderbookData
      if (!ob) { el.textContent = 'No data'; return }
      const spreadCard = createCard('Spread', '$' + fmtNum(data.currentPrice, 2) || '--')
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
    } else if (panelId === 'account') {
      const acc = data.account
      if (!acc) { el.textContent = 'No data'; return }
      el.appendChild(createCard('Balance', '$' + fmtNum(acc.balance, 2)))
      el.appendChild(createCard('Equity', '$' + fmtNum(acc.equity, 2)))
      el.appendChild(createCard('Total PnL', (acc.total_pnl >= 0 ? '+' : '') + '$' + fmtNum(acc.total_pnl, 2), acc.total_pnl >= 0 ? 'green' : 'red'))
      el.appendChild(createCard('Open Positions (' + Object.keys(acc.positions || {}).length + ')', ''))
      const rows = Object.values(acc.positions || {}).map(p => [
        { text: p.symbol },
        { text: p.side, cls: p.side === 'LONG' ? 'green' : 'red' },
        { text: fmtNum(p.quantity, 4) },
        { text: (p.unrealized_pnl >= 0 ? '+' : '') + '$' + fmtNum(p.unrealized_pnl, 2), cls: p.unrealized_pnl >= 0 ? 'green' : 'red' },
      ])
      el.appendChild(createTable(['Symbol', 'Side', 'Qty', 'uPnL'], rows))
    } else if (panelId === 'signals') {
      const sigs = data.signals || []
      el.appendChild(createCard('Signals (' + sigs.length + ')', ''))
      const rows = sigs.slice(0, 20).map(s => [
        { text: s.symbol || '' },
        { text: s.direction, cls: s.direction === 'LONG' ? 'green' : 'red' },
        { text: fmtNum((s.confidence || 0) * 100, 0) + '%' },
        { text: s.strategy || '' },
      ])
      el.appendChild(createTable(['Symbol', 'Dir', 'Conf', 'Strategy'], rows))
    } else if (panelId === 'arbitrage') {
      const arbs = data.arbitrage?.active || []
      el.appendChild(createCard('Active Arbitrage (' + arbs.length + ')', ''))
      const rows = arbs.slice(0, 10).map(a => [
        { text: a.symbol },
        { text: a.buy_exchange },
        { text: a.sell_exchange },
        { text: fmtNum(a.spread_bps, 1) + 'bps', cls: 'green' },
        { text: '$' + fmtNum(a.estimated_profit, 2) },
      ])
      el.appendChild(createTable(['Symbol', 'Buy', 'Sell', 'Spread', 'Profit'], rows))
    } else if (panelId === 'performance') {
      const m = data.metrics || {}
      el.appendChild(createCard('Total Balance', '$' + fmtNum(m.totalBalance, 2)))
      el.appendChild(createCard('Total PnL', ((m.totalPnl || 0) >= 0 ? '+' : '') + '$' + fmtNum(m.totalPnl, 2), (m.totalPnl || 0) >= 0 ? 'green' : 'red'))
      el.appendChild(createCard('Total Trades', String(m.totalTrades || 0)))
      el.appendChild(createCard('Win Rate', (m.totalTrades > 0 ? fmtNum((m.winningTrades || 0) / m.totalTrades * 100, 1) : '0') + '%'))
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

  return { detachPanel, updateDetached, isDetached, closeDetached, PANEL_CONFIG }
}
