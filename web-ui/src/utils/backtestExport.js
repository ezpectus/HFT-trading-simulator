export function exportBacktestCSV(result) {
  if (!result?.results) return
  const rows = [['Strategy', 'Return%', 'Trades', 'WinRate%', 'ProfitFactor', 'MaxDD%', 'Sharpe', 'FinalBalance']]
  for (const [name, r] of Object.entries(result.results)) {
    rows.push([name, r.total_return_pct, r.total_trades, r.win_rate, r.profit_factor, r.max_drawdown_pct, r.sharpe_ratio, r.final_balance])
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `backtest_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function buildShareLink(result, symbol, config) {
  if (!result?.results) return null
  const summary = {
    v: 1,
    sym: symbol,
    cfg: { s: config.strategy, c: config.candles, b: config.balance },
    res: Object.entries(result.results).map(([name, r]) => ({
      n: name,
      ret: r.total_return_pct,
      tr: r.total_trades,
      wr: r.win_rate,
      pf: r.profit_factor,
      dd: r.max_drawdown_pct,
      sh: r.sharpe_ratio,
      fb: r.final_balance,
    })),
  }
  const encoded = btoa(JSON.stringify(summary))
  return `${window.location.origin}${window.location.pathname}#bt=${encoded}`
}
