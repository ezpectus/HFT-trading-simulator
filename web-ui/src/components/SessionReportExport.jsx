import { useState } from 'react'
import { FileText, Download } from 'lucide-react'

function generateReportHTML(accounts, fills, candles, symbol, exchange) {
  const now = new Date()
  let totalPnL = 0
  let totalTrades = 0
  let totalWins = 0
  let totalLosses = 0
  let peakEquity = 0
  let maxDD = 0
  const equityCurve = []

  for (const [, acc] of Object.entries(accounts)) {
    totalPnL += acc.total_pnl || 0
    const trades = acc.trade_history || []
    totalTrades += trades.length
    const equity = acc.equity || acc.balance || 0
    if (equity > peakEquity) peakEquity = equity
    const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0
    if (dd > maxDD) maxDD = dd

    for (const trade of trades) {
      const ts = trade.timestamp || trade.time || now.getTime()
      const tradePnl = trade.realized_pnl || 0
      equityCurve.push({ t: ts, pnl: tradePnl })
      if (tradePnl > 0) totalWins++
      else if (tradePnl < 0) totalLosses++
    }
  }

  equityCurve.sort((a, b) => a.t - b.t)
  let cumulative = 0
  for (const p of equityCurve) {
    cumulative += p.pnl
    p.equity = cumulative
  }
  if (equityCurve.length === 0) {
    const candleKey = Object.keys(candles || {}).find(k => k.includes(symbol))
    const candleData = candleKey ? candles[candleKey] : []
    if (candleData && candleData.length > 1) {
      const basePrice = candleData[0][4] || candleData[0].close || 65000
      for (let i = 0; i < candleData.length; i++) {
        const c = candleData[i]
        const close = c[4] || c.close || basePrice
        equityCurve.push({ t: c[0] || c.timestamp || now.getTime() + i * 60000, pnl: 0, equity: (close - basePrice) / basePrice * 100 })
      }
    } else {
      equityCurve.push({ t: now.getTime(), pnl: 0, equity: 0 })
    }
  } else {
    equityCurve.unshift({ t: equityCurve[0].t - 1, pnl: 0, equity: 0 })
  }

  const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : '0.0'
  const grossProfit = equityCurve.filter(p => p.pnl > 0).reduce((s, p) => s + p.pnl, 0)
  const grossLoss = Math.abs(equityCurve.filter(p => p.pnl < 0).reduce((s, p) => s + p.pnl, 0))
  const profitFactor = grossLoss > 0
    ? (grossProfit / grossLoss).toFixed(2)
    : grossProfit > 0 ? '∞' : '0.00'

  const maxEquity = Math.max(...equityCurve.map(p => Math.abs(p.equity)), 1)
  const w = 100
  const h = 80
  const equityPoints = equityCurve.length > 1
    ? equityCurve.map((p, i) =>
        `${(i / (equityCurve.length - 1)) * w},${h - (p.equity / maxEquity) * h * 0.8 - h * 0.1}`
      ).join(' ')
    : `0,${h/2} ${w},${h/2}`

  const recentTrades = fills.slice(-20).map(f => `
    <tr>
      <td>${new Date(f.timestamp || Date.now()).toLocaleTimeString()}</td>
      <td>${f.symbol || symbol}</td>
      <td style="color:${f.side === 'buy' ? '#22c55e' : '#ef4444'}">${(f.side || '').toUpperCase()}</td>
      <td>${f.quantity}</td>
      <td>$${(f.price || 0).toFixed(2)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Trading Session Report — ${now.toLocaleString()}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
  h1 { color: #818cf8; border-bottom: 2px solid #312e81; padding-bottom: 10px; }
  h2 { color: #6366f1; margin-top: 30px; }
  .header { display: flex; justify-content: space-between; align-items: center; }
  .badge { background: #312e81; padding: 4px 12px; border-radius: 6px; font-size: 12px; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
  .metric-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; text-align: center; }
  .metric-value { font-size: 24px; font-weight: bold; margin: 8px 0; }
  .metric-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #1e293b; padding: 8px; text-align: left; font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid #1e293b; font-size: 12px; }
  .chart-container { background: #1e293b; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .footer { margin-top: 40px; font-size: 11px; color: #475569; border-top: 1px solid #1e293b; padding-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Trading Session Report</h1>
    <span class="badge">${now.toLocaleString()}</span>
  </div>
  <p style="color:#94a3b8">Symbol: <b>${symbol}</b> | Exchange: <b>${exchange}</b></p>

  <h2>Performance Metrics</h2>
  <div class="metrics">
    <div class="metric-card">
      <div class="metric-label">Total PnL</div>
      <div class="metric-value ${totalPnL >= 0 ? 'positive' : 'negative'}">
        ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Trades</div>
      <div class="metric-value">${totalTrades}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Win Rate</div>
      <div class="metric-value">${winRate}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Max Drawdown</div>
      <div class="metric-value negative">${(maxDD * 100).toFixed(1)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Peak Equity</div>
      <div class="metric-value">$${peakEquity.toFixed(2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Profit Factor</div>
      <div class="metric-value">${profitFactor}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Wins</div>
      <div class="metric-value positive">${totalWins}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Losses</div>
      <div class="metric-value negative">${totalLosses}</div>
    </div>
  </div>

  <h2>Equity Curve</h2>
  <div class="chart-container">
    <svg width="100%" height="120" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${equityPoints}" fill="none" stroke="#6366f1" stroke-width="0.5" />
    </svg>
  </div>

  <h2>Recent Trades</h2>
  <table>
    <thead>
      <tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th></tr>
    </thead>
    <tbody>${recentTrades || '<tr><td colspan="5" style="text-align:center;color:#475569">No trades yet</td></tr>'}</tbody>
  </table>

  <div class="footer">
    Generated by HFT Trading System Lite — ${now.toISOString()}
  </div>
</body>
</html>`
}

export default function SessionReportExport({ accounts, fills, candles, symbol, exchange }) {
  const [generating, setGenerating] = useState(false)

  const handleExport = () => {
    setGenerating(true)
    const html = generateReportHTML(accounts, fills, candles, symbol, exchange)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session_report_${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
    setGenerating(false)
  }

  const handlePrint = () => {
    setGenerating(true)
    const html = generateReportHTML(accounts, fills, candles, symbol, exchange)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) {
      w.focus()
      setTimeout(() => { w.print(); URL.revokeObjectURL(url); setGenerating(false) }, 500)
    } else {
      URL.revokeObjectURL(url)
      setGenerating(false)
    }
  }

  let totalPnL = 0
  let totalTrades = 0
  for (const [, acc] of Object.entries(accounts || {})) {
    totalPnL += acc.total_pnl || 0
    totalTrades += acc.trade_history?.length || 0
  }

  return (
    <div className="bg-bg-700 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
        <FileText size={12} className="text-accent-blue" />
        Session Report Export
      </div>

      <div className="grid grid-cols-2 gap-1 mb-2 text-[9px]">
        <div className="bg-bg-600/50 rounded p-1.5 text-center">
          <div className="text-gray-600">PnL</div>
          <div className={`font-mono font-bold ${totalPnL >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-600/50 rounded p-1.5 text-center">
          <div className="text-gray-600">Trades</div>
          <div className="font-mono font-bold text-gray-200">{totalTrades}</div>
        </div>
      </div>

      <div className="space-y-1">
        <button
          onClick={handlePrint}
          disabled={generating}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
        >
          <FileText size={10} />
          {generating ? 'Generating...' : 'Print / Save as PDF'}
        </button>
        <button
          onClick={handleExport}
          disabled={generating}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded bg-bg-600 text-gray-400 hover:bg-bg-500 disabled:opacity-50"
        >
          <Download size={10} />
          Export HTML Report
        </button>
      </div>
    </div>
  )
}
