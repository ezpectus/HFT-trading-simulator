// HTML report export for PerformanceDashboard — opens a print window
// with aggregate metrics + trade table (user prints/saves as PDF).

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

export function exportPDF(accounts, metrics, allTrades, sharpe, sortino) {
  const win = window.open('', '_blank')
  if (!win) return

  const totalBalance = metrics.totalBalance || 0
  const totalPnl = metrics.totalPnl || 0
  const totalTrades = metrics.totalTrades || 0
  const winRate = totalTrades > 0 ? ((metrics.winningTrades || 0) / totalTrades * 100).toFixed(1) : 0

  const rows = allTrades.slice(0, 50).map(t => `
    <tr>
      <td>${escapeHtml(t.symbol)}</td>
      <td>${escapeHtml(t.exchange)}</td>
      <td style="color:${t.side === 'BUY' ? '#0ecb81' : '#f6465d'}">${escapeHtml(t.side)}</td>
      <td>$${(t.entry_price || 0).toFixed(2)}</td>
      <td>$${(t.exit_price || 0).toFixed(2)}</td>
      <td>${t.quantity || 0}</td>
      <td style="color:${(t.pnl || 0) >= 0 ? '#0ecb81' : '#f6465d'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</td>
      <td>${escapeHtml(t.reason) || 'MANUAL'}</td>
    </tr>
  `).join('')

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Trading Sim Performance Report</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f1521; color: #e2e8f0; padding: 40px; }
        h1 { color: #3b82f6; border-bottom: 2px solid #1e2433; padding-bottom: 10px; }
        h2 { color: #8b95a7; font-size: 14px; text-transform: uppercase; margin-top: 30px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #161b26; border-radius: 8px; padding: 15px; }
        .card .label { font-size: 11px; color: #848e9c; text-transform: uppercase; }
        .card .value { font-size: 22px; font-weight: bold; margin-top: 5px; }
        .green { color: #0ecb81; } .red { color: #f6465d; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th { text-align: left; color: #848e9c; border-bottom: 1px solid #1e2433; padding: 8px; }
        td { border-bottom: 1px solid #161b26; padding: 6px 8px; }
        .footer { margin-top: 30px; color: #5e6673; font-size: 11px; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>Trading Sim — Performance Report</h1>
      <p style="color:#848e9c">Generated: ${new Date().toLocaleString()}</p>

      <div class="summary">
        <div class="card"><div class="label">Total Balance</div><div class="value green">$${totalBalance.toFixed(2)}</div></div>
        <div class="card"><div class="label">Total PnL</div><div class="value ${totalPnl >= 0 ? 'green' : 'red'}">${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</div></div>
        <div class="card"><div class="label">Total Trades</div><div class="value">${totalTrades}</div></div>
        <div class="card"><div class="label">Win Rate</div><div class="value">${winRate}%</div></div>
      </div>

      <div class="summary">
        <div class="card"><div class="label">Sharpe Ratio</div><div class="value">${isFinite(sharpe) ? sharpe.toFixed(3) : '∞'}</div></div>
        <div class="card"><div class="label">Sortino Ratio</div><div class="value">${isFinite(sortino) ? sortino.toFixed(3) : '∞'}</div></div>
        <div class="card"><div class="label">Max Drawdown</div><div class="value red">${(metrics.maxDrawdown || 0).toFixed(2)}%</div></div>
        <div class="card"><div class="label">Total Fees</div><div class="value">$${(metrics.totalFees || 0).toFixed(2)}</div></div>
      </div>

      <h2>Trade History (last 50)</h2>
      <table>
        <thead><tr><th>Symbol</th><th>Exchange</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>PnL</th><th>Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">Trading System Lite — Performance Report</div>
      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `)
  win.document.close()
}
