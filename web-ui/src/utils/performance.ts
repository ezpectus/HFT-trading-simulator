/** Performance metrics calculations from account and trade data. */

interface AccountData {
  balance?: number
  equity?: number
  total_pnl?: number
  pnl?: number
  total_fees?: number
  fees?: number
  total_trades?: number
  winning_trades?: number
  positions?: unknown[]
}

interface ExchangeRef {
  id: string
  pnl: number
}

export interface AggregateMetrics {
  totalBalance: number
  totalEquity: number
  totalPnl: number
  totalFees: number
  totalTrades: number
  avgWinRate: number
  totalPositions: number
  bestExchange: ExchangeRef | null
  worstExchange: ExchangeRef | null
  exchangeCount?: number
}

export function calcAggregateMetrics(accounts: Record<string, AccountData>): AggregateMetrics {
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
  let best: ExchangeRef | null = null, worst: ExchangeRef | null = null

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

interface Fill {
  received_at?: number
  timestamp?: number
  fee?: number
  quantity?: number
  price?: number
  side?: string
}

interface EquityPoint {
  time: number
  value: number
}

export function buildEquityCurve(fills: Fill[], initialBalance: number = 10000): EquityPoint[] {
  if (!fills || fills.length === 0) {
    return [{ time: 0, value: initialBalance }]
  }

  const sorted = [...fills].sort((a, b) => {
    const ta = a.received_at || a.timestamp || 0
    const tb = b.received_at || b.timestamp || 0
    return ta - tb
  })

  let balance = initialBalance
  const curve: EquityPoint[] = [{ time: 0, value: initialBalance }]

  for (const fill of sorted) {
    const fee = fill.fee || 0
    balance -= fee
    curve.push({
      time: fill.received_at || fill.timestamp || Date.now(),
      value: balance,
    })
  }

  return curve
}

export function calcDrawdown(equityCurve: EquityPoint[]): { time: number; drawdown: number }[] {
  if (!equityCurve || equityCurve.length === 0) return []

  let peak = equityCurve[0].value
  const drawdowns: { time: number; drawdown: number }[] = []

  for (const point of equityCurve) {
    peak = Math.max(peak, point.value)
    const dd = peak > 0 ? ((peak - point.value) / peak) * 100 : 0
    drawdowns.push({ time: point.time, drawdown: dd })
  }

  return drawdowns
}

export function formatMetric(value: number | null | undefined, type: string = 'number'): string {
  if (value === null || value === undefined || isNaN(value as number)) return '-'

  switch (type) {
    case 'usd':
      return `$${(value as number).toFixed(2)}`
    case 'pct':
      return `${(value as number).toFixed(2)}%`
    case 'int':
      return Math.round(value as number).toString()
    default:
      return (value as number).toFixed(4)
  }
}

interface TradeWithPnl {
  pnl?: number
}

export function calcSharpeRatio(trades: TradeWithPnl[]): number {
  if (!trades || trades.length < 2) return 0

  const pnls = trades.map(t => t.pnl || 0)
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length
  const variance = pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0
  return (mean / stdDev) * Math.sqrt(252)
}

export function calcSortinoRatio(trades: TradeWithPnl[]): number {
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
