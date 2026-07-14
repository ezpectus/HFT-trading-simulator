/**
 * Client-side Strategy Backtesting Engine
 *
 * Replays historical candle data through custom strategy rules
 * (from Strategy Builder) and computes P&L metrics.
 *
 * No backend required — runs entirely in the browser using
 * candle data from the exchange simulator.
 */

/**
 * @typedef {Object} Candle
 * @property {number} time - timestamp
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 */

/**
 * @typedef {Object} Rule
 * @property {string} condition - price_above | price_below | rsi_above | rsi_below | ema_cross_up | ema_cross_down | volume_spike | price_change_5
 * @property {number} value - threshold value
 * @property {string} action - buy | sell | close_all | alert
 * @property {number} qty - quantity
 */

/**
 * @typedef {Object} BacktestTrade
 * @property {number} entryTime
 * @property {number} exitTime
 * @property {string} side - LONG | SHORT
 * @property {number} entryPrice
 * @property {number} exitPrice
 * @property {number} qty
 * @property {number} pnl
 * @property {number} pnlPct
 * @property {string} exitReason - SIGNAL_EXIT | END | CLOSE_ALL
 */

/**
 * @typedef {Object} BacktestResult
 * @property {number} initialBalance
 * @property {number} finalBalance
 * @property {number} totalReturnPct
 * @property {number} totalTrades
 * @property {number} winningTrades
 * @property {number} losingTrades
 * @property {number} winRate
 * @property {number} avgWin
 * @property {number} avgLoss
 * @property {number} profitFactor
 * @property {number} maxDrawdownPct
 * @property {number} sharpeRatio
 * @property {number} sortinoRatio
 * @property {number} calmarRatio
 * @property {number[]} equityCurve
 * @property {BacktestTrade[]} trades
 * @property {number} maxDrawdownDuration
 * @property {number} recoveryFactor
 */

// === Indicator calculations ===

function ema(values, period) {
  const k = 2 / (period + 1)
  const result = []
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      result.push(prev)
    } else {
      prev = values[i] * k + prev * (1 - k)
      result.push(prev)
    }
  }
  return result
}

function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(50)
  if (closes.length < period + 1) return result
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

function avgVolume(volumes, period = 20) {
  const result = new Array(volumes.length).fill(0)
  for (let i = 0; i < volumes.length; i++) {
    const start = Math.max(0, i - period + 1)
    let sum = 0
    for (let j = start; j <= i; j++) sum += volumes[j]
    result[i] = sum / (i - start + 1)
  }
  return result
}

// === Condition evaluator ===

function evaluateConditions(candles, i, indicators, rules) {
  const candle = candles[i]
  const closes = candles.map(c => c.close)
  const emaFast = indicators.emaFast
  const emaSlow = indicators.emaSlow
  const rsiVals = indicators.rsi
  const volAvg = indicators.volAvg

  const triggered = []

  for (const rule of rules) {
    let matched = false
    switch (rule.condition) {
      case 'price_above':
        matched = candle.close > rule.value
        break
      case 'price_below':
        matched = candle.close < rule.value
        break
      case 'rsi_above':
        matched = rsiVals[i] > rule.value
        break
      case 'rsi_below':
        matched = rsiVals[i] < rule.value
        break
      case 'ema_cross_up':
        if (i > 0) {
          matched = emaFast[i] > emaSlow[i] && emaFast[i - 1] <= emaSlow[i - 1]
        }
        break
      case 'ema_cross_down':
        if (i > 0) {
          matched = emaFast[i] < emaSlow[i] && emaFast[i - 1] >= emaSlow[i - 1]
        }
        break
      case 'volume_spike':
        matched = volAvg[i] > 0 && candle.volume > volAvg[i] * rule.value
        break
      case 'price_change_5':
        if (i >= 5) {
          const change = ((candle.close - closes[i - 5]) / closes[i - 5]) * 100
          matched = change > rule.value
        }
        break
      default:
        break
    }
    if (matched) triggered.push(rule)
  }

  return triggered
}

// === Main backtest runner ===

/**
 * Run a backtest on historical candle data with custom strategy rules.
 *
 * @param {Candle[]} candles - Historical candle data
 * @param {Rule[]} rules - Strategy rules from Strategy Builder
 * @param {Object} options - Backtest configuration
 * @param {number} options.initialBalance - Starting balance (default 10000)
 * @param {number} options.feePct - Fee per trade as percentage (default 0.075)
 * @param {number} options.positionSizePct - Position size as % of balance (default 10)
 * @param {number} options.emaFastPeriod - EMA fast period (default 9)
 * @param {number} options.emaSlowPeriod - EMA slow period (default 21)
 * @param {number} options.rsiPeriod - RSI period (default 14)
 * @returns {BacktestResult} Backtest results with P&L metrics
 */
export function runBacktest(candles, rules, options = {}) {
  const {
    initialBalance = 10000,
    feePct = 0.075,
    positionSizePct = 0.1,
    emaFastPeriod = 9,
    emaSlowPeriod = 21,
    rsiPeriod = 14,
  } = options

  if (!candles || candles.length < 30) {
    return {
      error: 'Need at least 30 candles to backtest',
      initialBalance,
      finalBalance: initialBalance,
      totalReturnPct: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      equityCurve: [initialBalance],
      trades: [],
      maxDrawdownDuration: 0,
      recoveryFactor: 0,
    }
  }

  // Precompute indicators
  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const indicators = {
    emaFast: ema(closes, emaFastPeriod),
    emaSlow: ema(closes, emaSlowPeriod),
    rsi: rsi(closes, rsiPeriod),
    volAvg: avgVolume(volumes, 20),
  }

  // State
  let balance = initialBalance
  let position = null // { side, entryPrice, qty, entryTime }
  const trades = []
  const equityCurve = []
  let peakEquity = initialBalance
  let maxDrawdown = 0
  let maxDrawdownDuration = 0
  let currentDrawdownDuration = 0

  // Returns per candle for Sharpe/Sortino
  const returns = []

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]

    // Evaluate rules
    const triggered = evaluateConditions(candles, i, indicators, rules)

    for (const rule of triggered) {
      switch (rule.action) {
        case 'buy': {
          if (!position) {
            const qty = (balance * positionSizePct) / candle.close
            const fee = (qty * candle.close * feePct) / 100
            balance -= fee
            position = {
              side: 'LONG',
              entryPrice: candle.close,
              qty,
              entryTime: candle.time,
            }
          }
          break
        }
        case 'sell': {
          if (!position) {
            const qty = (balance * positionSizePct) / candle.close
            const fee = (qty * candle.close * feePct) / 100
            balance -= fee
            position = {
              side: 'SHORT',
              entryPrice: candle.close,
              qty,
              entryTime: candle.time,
            }
          }
          break
        }
        case 'close_all': {
          if (position) {
            const exitPrice = candle.close
            const pnl = position.side === 'LONG'
              ? (exitPrice - position.entryPrice) * position.qty
              : (position.entryPrice - exitPrice) * position.qty
            const fee = (position.qty * exitPrice * feePct) / 100
            balance += pnl - fee
            trades.push({
              entryTime: position.entryTime,
              exitTime: candle.time,
              side: position.side,
              entryPrice: position.entryPrice,
              exitPrice,
              qty: position.qty,
              pnl: pnl - fee,
              pnlPct: ((pnl - fee) / (position.entryPrice * position.qty)) * 100,
              exitReason: 'CLOSE_ALL',
            })
            position = null
          }
          break
        }
        case 'alert':
          // No action on portfolio
          break
        default:
          break
      }
    }

    // Mark-to-market equity
    let equity = balance
    if (position) {
      const unrealized = position.side === 'LONG'
        ? (candle.close - position.entryPrice) * position.qty
        : (position.entryPrice - candle.close) * position.qty
      equity += unrealized
    }

    equityCurve.push(equity)

    // Track returns
    if (i > 0) {
      const prevEquity = equityCurve[i - 1]
      if (prevEquity > 0) {
        returns.push((equity - prevEquity) / prevEquity)
      }
    }

    // Drawdown tracking
    if (equity > peakEquity) {
      peakEquity = equity
      currentDrawdownDuration = 0
    } else {
      currentDrawdownDuration++
      const dd = (peakEquity - equity) / peakEquity
      if (dd > maxDrawdown) {
        maxDrawdown = dd
        maxDrawdownDuration = currentDrawdownDuration
      }
    }
  }

  // Close any remaining position at the last candle
  if (position) {
    const lastCandle = candles[candles.length - 1]
    const exitPrice = lastCandle.close
    const pnl = position.side === 'LONG'
      ? (exitPrice - position.entryPrice) * position.qty
      : (position.entryPrice - exitPrice) * position.qty
    const fee = (position.qty * exitPrice * feePct) / 100
    balance += pnl - fee
    trades.push({
      entryTime: position.entryTime,
      exitTime: lastCandle.time,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      qty: position.qty,
      pnl: pnl - fee,
      pnlPct: ((pnl - fee) / (position.entryPrice * position.qty)) * 100,
      exitReason: 'END',
    })
    position = null
  }

  // Compute metrics
  const finalBalance = balance
  const totalReturnPct = ((finalBalance - initialBalance) / initialBalance) * 100
  const winningTrades = trades.filter(t => t.pnl > 0)
  const losingTrades = trades.filter(t => t.pnl <= 0)
  const totalTrades = trades.length
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length
    : 0
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length)
    : 0
  const grossProfit = winningTrades.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999.99 : 0)
  const maxDrawdownPct = maxDrawdown * 100

  // Sharpe ratio (annualized, assuming 5m candles: 365*24*12 = 105120 candles/year)
  const candlesPerYear = 105120
  const periodsPerYear = candlesPerYear
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0
  const stdReturn = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0
  const sharpeRatio = stdReturn > 0
    ? (avgReturn / stdReturn) * Math.sqrt(periodsPerYear)
    : 0

  // Sortino ratio (only downside deviation)
  const downsideReturns = returns.filter(r => r < 0)
  const downsideDev = downsideReturns.length > 1
    ? Math.sqrt(downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length)
    : 0
  const sortinoRatio = downsideDev > 0
    ? (avgReturn / downsideDev) * Math.sqrt(periodsPerYear)
    : 0

  // Calmar ratio (annualized return / max drawdown)
  const annualizedReturn = totalReturnPct * (periodsPerYear / candles.length)
  const calmarRatio = maxDrawdownPct > 0 ? annualizedReturn / maxDrawdownPct : 0

  // Recovery factor
  const recoveryFactor = maxDrawdownPct > 0
    ? (finalBalance - initialBalance) / (initialBalance * maxDrawdown)
    : 0

  return {
    initialBalance,
    finalBalance,
    totalReturnPct,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdownPct,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    equityCurve,
    trades,
    maxDrawdownDuration,
    recoveryFactor,
  }
}
