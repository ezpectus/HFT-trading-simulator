/** Performance metrics calculations from account and trade data. */

/**
 * Calculate performance metrics from account data.
 * @param {Object} accounts - Account data per exchange
 * @returns {Object} Aggregated metrics
 */
export function calcAggregateMetrics(accounts) {
  if (!accounts || Object.keys(accounts).length === 0) {
    return {
      totalBalance: 0,
      totalEquity: 0,
      totalPnl: 0,
      totalFees: 0,
      totalTrades: 0,
      avgWinRate: 0,
      totalPositions: 0,
      bestExchange: null,
      worstExchange: null,
    }
  }

  const entries = Object.entries(accounts)
  let totalBalance = 0, totalEquity = 0, totalPnl = 0, totalFees = 0
  let totalTrades = 0, totalWins = 0, totalPositions = 0
  let best = null, worst = null

  for (const [id, acc] of entries) {
    const balance = acc.balance || 0
    const equity = acc.equity || balance
    const pnl = acc.total_pnl || acc.pnl || 0
    const fees = acc.total_fees || acc.fees || 0
    const trades = acc.total_trades || 0
    const wins = acc.winning_trades || 0
    const positions = acc.positions?.length || 0

    totalBalance += balance
    totalEquity += equity
    totalPnl += pnl
    totalFees += fees
    totalTrades += trades
    totalWins += wins
    totalPositions += positions

    if (!best || pnl > best.pnl) best = { id, pnl }
    if (!worst || pnl < worst.pnl) worst = { id, pnl }
  }

  return {
    totalBalance,
    totalEquity,
    totalPnl,
    totalFees,
    totalTrades,
    avgWinRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
    totalPositions,
    bestExchange: best,
    worstExchange: worst,
    exchangeCount: entries.length,
  }
}

/**
 * Build equity curve from fills history.
 * @param {Array} fills - Order fills
 * @param {number} initialBalance - Starting balance
 * @returns {Array} Equity curve points [{ time, value }]
 */
export function buildEquityCurve(fills, initialBalance = 10000) {
  if (!fills || fills.length === 0) {
    return [{ time: 0, value: initialBalance }]
  }

  // Sort fills by time (oldest first)
  const sorted = [...fills].sort((a, b) => {
    const ta = a.received_at || a.timestamp || 0
    const tb = b.received_at || b.timestamp || 0
    return ta - tb
  })

  let balance = initialBalance
  const curve = [{ time: 0, value: initialBalance }]

  for (const fill of sorted) {
    // Estimate PnL from fill (simplified: use fee as cost, price difference for closes)
    const fee = fill.fee || 0
    const qty = fill.quantity || 0
    const price = fill.price || 0
    const side = fill.side || 'BUY'

    // Simple: deduct fees, track notional
    balance -= fee
    curve.push({
      time: fill.received_at || fill.timestamp || Date.now(),
      value: balance,
    })
  }

  return curve
}

/**
 * Calculate drawdown series from equity curve.
 * @param {Array} equityCurve - [{ time, value }]
 * @returns {Array} Drawdown percentages [{ time, drawdown }]
 */
export function calcDrawdown(equityCurve) {
  if (!equityCurve || equityCurve.length === 0) return []

  let peak = equityCurve[0].value
  const drawdowns = []

  for (const point of equityCurve) {
    peak = Math.max(peak, point.value)
    const dd = peak > 0 ? ((peak - point.value) / peak) * 100 : 0
    drawdowns.push({ time: point.time, drawdown: dd })
  }

  return drawdowns
}

/**
 * Format a metric value with appropriate precision.
 */
export function formatMetric(value, type = 'number') {
  if (value === null || value === undefined || isNaN(value)) return '-'

  switch (type) {
    case 'usd':
      return `$${value.toFixed(2)}`
    case 'pct':
      return `${value.toFixed(2)}%`
    case 'int':
      return Math.round(value).toString()
    default:
      return value.toFixed(4)
  }
}

/**
 * Calculate Sharpe ratio from trade PnL history.
 * @param {Array} trades - Trade history with pnl field
 * @returns {number} Sharpe ratio (annualized, assuming 252 trading days)
 */
export function calcSharpeRatio(trades) {
  if (!trades || trades.length < 2) return 0

  const pnls = trades.map(t => t.pnl || 0)
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length
  const variance = pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0
  return (mean / stdDev) * Math.sqrt(252)
}

/**
 * Calculate Sortino ratio from trade PnL history.
 * Only considers downside deviation (negative returns).
 * @param {Array} trades - Trade history with pnl field
 * @returns {number} Sortino ratio (annualized)
 */
export function calcSortinoRatio(trades) {
  if (!trades || trades.length < 2) return 0

  const pnls = trades.map(t => t.pnl || 0)
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length
  const downsidePnls = pnls.filter(v => v < 0)
  
  if (downsidePnls.length === 0) return mean > 0 ? Infinity : 0
  
  const downsideVariance = downsidePnls.reduce((s, v) => s + v * v, 0) / pnls.length
  const downsideDev = Math.sqrt(downsideVariance)

  if (downsideDev === 0) return 0
  return (mean / downsideDev) * Math.sqrt(252)
}
