import { useRef, useCallback } from 'react'

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

    // Write minimal HTML shell
    popup.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${config.title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #0f1521; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; overflow: hidden; }
          #root { width: 100vw; height: 100vh; }
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
        </style>
      </head>
      <body>
        <div class="header">
          <span>${config.title}</span>
          <span style="cursor:pointer" onclick="window.close()">[x]</span>
        </div>
        <div class="content" id="content">Loading...</div>
      </body>
      </html>
    `)
    popup.document.close()

    // Send initial data
    const ch = getChannel()
    ch.postMessage({ panelId, type: 'init', data })

    // Update popup content
    updatePopupContent(popup, panelId, data)
  }, [getChannel])

  const updatePopupContent = useCallback((popup, panelId, data) => {
    if (!popup || popup.closed) return
    const el = popup.document.getElementById('content')
    if (!el) return

    if (panelId === 'orderbook') {
      const ob = data.orderbookData
      if (!ob) { el.innerHTML = '<p style="color:#64748b">No data</p>'; return }
      const bids = (ob.bids || []).slice(0, 15).map(b =>
        `<div class="ob-row bid"><span>${b.quantity.toFixed(4)}</span><span>$${b.price.toFixed(2)}</span></div>`
      ).join('')
      const asks = (ob.asks || []).slice(0, 15).map(a =>
        `<div class="ob-row ask"><span>$${a.price.toFixed(2)}</span><span>${a.quantity.toFixed(4)}</span></div>`
      ).join('')
      el.innerHTML = `<div style="margin-bottom:8px"><span class="label">Spread</span> <span class="value">$${data.currentPrice?.toFixed(2) || '--'}</span></div><div class="asks">${asks}</div><div style="border-top:1px solid #1e2433;margin:4px 0"></div><div class="bids">${bids}</div>`
    } else if (panelId === 'account') {
      const acc = data.account
      if (!acc) { el.innerHTML = '<p style="color:#64748b">No data</p>'; return }
      const positions = (acc.positions || []).map(p =>
        `<tr><td>${p.symbol}</td><td class="${p.side === 'LONG' ? 'green' : 'red'}">${p.side}</td><td>${p.quantity.toFixed(4)}</td><td class="${p.unrealized_pnl >= 0 ? 'green' : 'red'}">${p.unrealized_pnl >= 0 ? '+' : ''}$${p.unrealized_pnl.toFixed(2)}</td></tr>`
      ).join('')
      el.innerHTML = `
        <div class="card"><div class="label">Balance</div><div class="value">$${acc.balance.toFixed(2)}</div></div>
        <div class="card"><div class="label">Equity</div><div class="value">$${acc.equity.toFixed(2)}</div></div>
        <div class="card"><div class="label">Total PnL</div><div class="value ${acc.total_pnl >= 0 ? 'green' : 'red'}">${acc.total_pnl >= 0 ? '+' : ''}$${acc.total_pnl.toFixed(2)}</div></div>
        <div class="card"><div class="label">Open Positions (${acc.positions?.length || 0})</div></div>
        <table><thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>uPnL</th></tr></thead><tbody>${positions}</tbody></table>
      `
    } else if (panelId === 'signals') {
      const sigs = data.signals || []
      const rows = sigs.slice(0, 20).map(s =>
        `<tr><td>${s.symbol || ''}</td><td class="${s.direction === 'LONG' ? 'green' : 'red'}">${s.direction}</td><td>${(s.confidence * 100).toFixed(0)}%</td><td>${s.strategy || ''}</td></tr>`
      ).join('')
      el.innerHTML = `<div class="card"><div class="label">Signals (${sigs.length})</div></div><table><thead><tr><th>Symbol</th><th>Dir</th><th>Conf</th><th>Strategy</th></tr></thead><tbody>${rows}</tbody></table>`
    } else if (panelId === 'arbitrage') {
      const arbs = data.arbitrage?.active || []
      const rows = arbs.slice(0, 10).map(a =>
        `<tr><td>${a.symbol}</td><td>${a.buy_exchange}</td><td>${a.sell_exchange}</td><td class="green">${a.spread_bps.toFixed(1)}bps</td><td>$${a.estimated_profit.toFixed(2)}</td></tr>`
      ).join('')
      el.innerHTML = `<div class="card"><div class="label">Active Arbitrage (${arbs.length})</div></div><table><thead><tr><th>Symbol</th><th>Buy</th><th>Sell</th><th>Spread</th><th>Profit</th></tr></thead><tbody>${rows}</tbody></table>`
    } else if (panelId === 'performance') {
      const m = data.metrics || {}
      el.innerHTML = `
        <div class="card"><div class="label">Total Balance</div><div class="value">$${(m.totalBalance || 0).toFixed(2)}</div></div>
        <div class="card"><div class="label">Total PnL</div><div class="value ${(m.totalPnl || 0) >= 0 ? 'green' : 'red'}">${(m.totalPnl || 0) >= 0 ? '+' : ''}$${(m.totalPnl || 0).toFixed(2)}</div></div>
        <div class="card"><div class="label">Total Trades</div><div class="value">${m.totalTrades || 0}</div></div>
        <div class="card"><div class="label">Win Rate</div><div class="value">${m.totalTrades > 0 ? ((m.winningTrades || 0) / m.totalTrades * 100).toFixed(1) : 0}%</div></div>
      `
    } else if (panelId === 'chart') {
      const candles = data.candles || []
      if (candles.length === 0) { el.innerHTML = '<p style="color:#64748b">No candles</p>'; return }
      const last = candles[candles.length - 1]
      const prev = candles[candles.length - 2] || last
      const change = ((last.close - prev.close) / prev.close * 100).toFixed(2)
      el.innerHTML = `
        <div class="card"><div class="label">${data.symbol || ''} — ${data.exchange || ''}</div></div>
        <div class="card"><div class="label">Price</div><div class="value">$${last.close.toFixed(2)}</div></div>
        <div class="card"><div class="label">Change</div><div class="value ${change >= 0 ? 'green' : 'red'}">${change >= 0 ? '+' : ''}${change}%</div></div>
        <div class="card"><div class="label">OHLC</div><div style="font-size:12px">O:${last.open} H:${last.high} L:${last.low} C:${last.close}</div></div>
        <div class="card"><div class="label">Volume</div><div class="value">${last.volume.toFixed(0)}</div></div>
        <div class="card"><div class="label">Candles</div><div class="value">${candles.length}</div></div>
      `
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
