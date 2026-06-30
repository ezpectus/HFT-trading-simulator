/**
 * Mock data generator — produces realistic market data for demo mode.
 *
 * Generates:
 * - Candles (GBM with jumps, multiple symbols/exchanges)
 * - Order books (depth profile, random updates)
 * - Signals (random strategy signals)
 * - Fills (random order fills)
 * - Positions (open/close randomly)
 * - News events (random headlines)
 * - Account balance (starts at 10000, fluctuates)
 */

export const MOCK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'ADAUSDT']
export const MOCK_EXCHANGES = ['binance', 'bybit', 'okx']

const NEWS_HEADLINES = [
  { title: 'Fed signals possible rate pause', impact: 'positive', severity: 'medium' },
  { title: 'Major exchange announces new listing', impact: 'positive', severity: 'low' },
  { title: 'Regulatory concerns in EU markets', impact: 'negative', severity: 'medium' },
  { title: 'Institutional inflow reaches record high', impact: 'positive', severity: 'high' },
  { title: 'Large whale wallet movement detected', impact: 'neutral', severity: 'low' },
  { title: 'DeFi TVL crosses new milestone', impact: 'positive', severity: 'low' },
  { title: 'Market liquidation cascade underway', impact: 'negative', severity: 'high' },
  { title: 'Options expiry may increase volatility', impact: 'neutral', severity: 'medium' },
  { title: 'Mining difficulty adjusts upward', impact: 'neutral', severity: 'low' },
  { title: 'Central bank considers digital currency pilot', impact: 'positive', severity: 'medium' },
]

const STRATEGIES = [
  'trend_following', 'mean_reversion', 'market_making',
  'stat_arb', 'sentiment', 'ml_ensemble',
]

const BASE_PRICES = {
  BTCUSDT: 65000, ETHUSDT: 3500, SOLUSDT: 145, DOGEUSDT: 0.12, ADAUSDT: 0.45,
}

function gaussianRandom(mean = 0, std = 1) {
  const u1 = Math.random(), u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * std
}

/**
 * Generate initial candle history (GBM with occasional jumps).
 * @param {string} symbol
 * @param {string} exchange
 * @param {number} count - Number of candles
 * @param {number} intervalSec - Seconds per candle
 * @returns {Array} Candle objects
 */
export function generateCandles(symbol, exchange, count = 500, intervalSec = 60) {
  const basePrice = BASE_PRICES[symbol] || 100
  const vol = 0.002 // Per-candle volatility
  const jumpProb = 0.02 // 2% chance of jump per candle
  const jumpSize = 0.01 // 1% jump

  const candles = []
  let price = basePrice
  const now = Math.floor(Date.now() / 1000)
  const startTime = now - count * intervalSec

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * intervalSec
    const open = price

    // GBM: dS = S * (drift + vol * dW)
    let ret = gaussianRandom(0, vol)
    if (Math.random() < jumpProb) {
      ret += (Math.random() - 0.5) * jumpSize * 2
    }

    const close = open * Math.exp(ret)
    const high = Math.max(open, close) * (1 + Math.abs(gaussianRandom(0, vol * 0.5)))
    const low = Math.min(open, close) * (1 - Math.abs(gaussianRandom(0, vol * 0.5)))
    const volume = Math.abs(gaussianRandom(100, 30))

    candles.push({
      exchange, symbol, timestamp,
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: Math.max(1, Number(volume.toFixed(2))),
    })

    price = close
  }

  return candles
}

/**
 * Generate an order book snapshot.
 */
export function generateOrderBook(symbol, exchange, midPrice) {
  const levels = 20
  const spread = midPrice * 0.0005 // 5 bps spread
  const bids = []
  const asks = []

  for (let i = 0; i < levels; i++) {
    const depthFactor = 1 + i * 0.0003
    const bidPrice = midPrice - spread / 2 - midPrice * depthFactor * 0.001
    const askPrice = midPrice + spread / 2 + midPrice * depthFactor * 0.001
    const size = Math.abs(gaussianRandom(5, 2)) * (1 + i * 0.1)

    bids.push({ price: Number(bidPrice.toFixed(6)), size: Number(size.toFixed(4)) })
    asks.push({ price: Number(askPrice.toFixed(6)), size: Number(size.toFixed(4)) })
  }

  return {
    exchange, symbol,
    bids, asks,
    spread: asks[0].price - bids[0].price,
    midPrice,
    timestamp: Date.now(),
  }
}

/**
 * Generate a random trading signal.
 */
export function generateSignal(symbol, exchange, price) {
  const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)]
  const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT'
  const confidence = 50 + Math.random() * 45

  return {
    type: 'signal',
    symbol, exchange, strategy, direction,
    confidence: Number(confidence.toFixed(1)),
    price: Number(price.toFixed(6)),
    timestamp: Date.now() / 1000,
    indicators: {
      rsi: Number((30 + Math.random() * 40).toFixed(1)),
      adx: Number((15 + Math.random() * 35).toFixed(1)),
      ema_cross: Math.random() > 0.5 ? 'bullish' : 'bearish',
    },
  }
}

/**
 * Generate a random fill.
 */
export function generateFill(symbol, exchange, price, accounts) {
  const side = Math.random() > 0.5 ? 'BUY' : 'SELL'
  const qty = Number((0.01 + Math.random() * 0.5).toFixed(4))
  const order = {
    exchange, symbol, side,
    price: Number(price.toFixed(6)),
    quantity: qty,
    filled_qty: qty,
    order_id: `mock-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: Date.now() / 1000,
    type: 'market',
    status: 'filled',
  }
  return order
}

/**
 * Generate a random news event.
 */
export function generateNewsEvent() {
  const headline = NEWS_HEADLINES[Math.floor(Math.random() * NEWS_HEADLINES.length)]
  return {
    type: 'news',
    ...headline,
    timestamp: Date.now() / 1000,
  }
}

/**
 * Generate initial accounts.
 */
export function generateAccounts() {
  const accounts = {}
  for (const ex of MOCK_EXCHANGES) {
    accounts[ex] = {
      balance: 10000,
      equity: 10000 + (Math.random() - 0.5) * 200,
      margin: 0,
      free_margin: 10000,
      unrealized_pnl: (Math.random() - 0.5) * 100,
      realized_pnl: (Math.random() - 0.5) * 50,
      positions: {},
    }
  }
  return accounts
}

/**
 * Generate a random position update.
 */
export function maybeUpdatePosition(accounts, symbol, exchange, price) {
  const acct = accounts[exchange]
  if (!acct) return accounts

  const hasPosition = !!acct.positions[symbol]
  // 10% chance to open/close
  if (Math.random() < 0.1) {
    if (hasPosition) {
      // Close position
      const pos = acct.positions[symbol]
      const pnl = (price - pos.entry_price) * pos.quantity * (pos.side === 'BUY' ? 1 : -1)
      acct.realized_pnl += pnl
      acct.balance += pnl
      delete acct.positions[symbol]
    } else {
      // Open position
      acct.positions[symbol] = {
        symbol, exchange,
        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
        quantity: Number((0.01 + Math.random() * 0.1).toFixed(4)),
        entry_price: Number(price.toFixed(6)),
        unrealized_pnl: 0,
      }
    }
  }

  // Update unrealized PnL for existing positions
  for (const sym in acct.positions) {
    const pos = acct.positions[sym]
    const basePrice = BASE_PRICES[sym] || price
    pos.unrealized_pnl = (basePrice - pos.entry_price) * pos.quantity * (pos.side === 'BUY' ? 1 : -1)
  }

  acct.equity = acct.balance + Object.values(acct.positions).reduce((s, p) => s + p.unrealized_pnl, 0)
  acct.unrealized_pnl = Object.values(acct.positions).reduce((s, p) => s + p.unrealized_pnl, 0)
  acct.free_margin = acct.equity - acct.margin

  return { ...accounts }
}

/**
 * Generate all initial mock data (snapshot).
 */
export function generateInitialSnapshot() {
  const candles = []
  const prices = {}
  const orderbooks = {}
  const accounts = generateAccounts()

  for (const exchange of MOCK_EXCHANGES) {
    for (const symbol of MOCK_SYMBOLS) {
      const symCandles = generateCandles(symbol, exchange, 500)
      candles.push(...symCandles)
      const lastPrice = symCandles[symCandles.length - 1].close
      prices[`${exchange}|${symbol}`] = lastPrice
      orderbooks[`${exchange}|${symbol}`] = generateOrderBook(symbol, exchange, lastPrice)
    }
  }

  return {
    type: 'snapshot',
    candles,
    prices,
    accounts,
    orderbooks,
    funding_rates: {},
    candles_to_funding: 8,
    news_event: null,
    weekend_mode: false,
    timestamp: Date.now() / 1000,
  }
}
