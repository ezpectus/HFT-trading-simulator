let _id = 0
const nextId = () => ++_id

export function createMockSignal(overrides = {}) {
  return {
    id: nextId(),
    strategy: 'TrendFollowing',
    symbol: 'BTC/USDT',
    direction: 'LONG',
    confidence: 0.75,
    entryPrice: 44000,
    currentPrice: 44100,
    pnl: 0.5,
    status: 'open',
    timestamp: '12:30',
    ...overrides,
  }
}

export function createMockFill(overrides = {}) {
  return {
    id: nextId(),
    orderId: `ord_${Math.random().toString(36).slice(2, 6)}`,
    symbol: 'BTC/USDT',
    side: 'BUY',
    reqQty: 1.0,
    fillQty: 1.0,
    reqPrice: 44000,
    fillPrice: 44002,
    partialFill: false,
    latency: 45,
    venue: 'Binance',
    status: 'filled',
    ...overrides,
  }
}

export function createMockPosition(overrides = {}) {
  return {
    id: nextId(),
    symbol: 'BTC/USDT',
    side: 'LONG',
    qty: 0.5,
    entryPrice: 43800,
    currentPrice: 44100,
    pnl: 150,
    pnlPercent: 0.68,
    status: 'open',
    ...overrides,
  }
}

export function createMockOpportunity(overrides = {}) {
  return {
    id: nextId(),
    type: 'Triangular',
    path: 'BTC → ETH → USDT → BTC',
    profit: 0.85,
    capital: 10000,
    estProfit: 85,
    latency: 120,
    confidence: 0.92,
    status: 'active',
    ...overrides,
  }
}

export function createMockPair(overrides = {}) {
  return {
    id: nextId(),
    pairA: 'BTC/USDT',
    pairB: 'ETH/USDT',
    corr: 0.85,
    spread: 1.2,
    zScore: 2.1,
    status: 'open',
    pnl: 245,
    ...overrides,
  }
}

export function createMockPacket(overrides = {}) {
  return {
    id: nextId(),
    ts: '12:45:32.100',
    dir: 'IN',
    proto: 'WS',
    size: 342,
    src: 'ws.binance.com:443',
    type: 'trade',
    status: 'ok',
    ...overrides,
  }
}

export function createMockPipeline(overrides = {}) {
  return {
    id: nextId(),
    name: 'TrendFollowing Model',
    status: 'idle',
    lastRun: '2h ago',
    nextRun: 'in 4h',
    accuracy: 0.82,
    drift: 0.05,
    version: 'v2.3.1',
    ...overrides,
  }
}

export function resetMockId() {
  _id = 0
}
