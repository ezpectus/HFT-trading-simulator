export const MOCK_CHECKS = [
  { id: 'candles-fresh', name: 'Candle Freshness', status: 'pass', detail: 'Last candle 2s ago', threshold: '< 10s' },
  { id: 'fills-integrity', name: 'Fills Integrity', status: 'pass', detail: '0 missing fill IDs', threshold: '0 gaps' },
  { id: 'orderbook-sync', name: 'Orderbook Sync', status: 'warn', detail: '3 stale symbols', threshold: '0 stale' },
  { id: 'ws-latency', name: 'WS Latency', status: 'pass', detail: 'Avg 12ms', threshold: '< 50ms' },
  { id: 'price-staleness', name: 'Price Staleness', status: 'fail', detail: '5 symbols > 30s stale', threshold: '0 stale' },
  { id: 'volume-anomaly', name: 'Volume Anomaly', status: 'warn', detail: '2 symbols with 0 volume', threshold: '0 symbols' },
  { id: 'gap-detection', name: 'Gap Detection', status: 'pass', detail: 'No gaps detected', threshold: '0 gaps' },
  { id: 'duplicate-check', name: 'Duplicate Trades', status: 'pass', detail: '0 duplicates', threshold: '0 dups' },
]

export const MOCK_SYMBOLS = [
  { symbol: 'BTC/USDT', candleAge: 2, volume: 15420, gaps: 0, status: 'healthy' },
  { symbol: 'ETH/USDT', candleAge: 1, volume: 8930, gaps: 0, status: 'healthy' },
  { symbol: 'SOL/USDT', candleAge: 3, volume: 4210, gaps: 0, status: 'healthy' },
  { symbol: 'AVAX/USDT', candleAge: 45, volume: 0, gaps: 2, status: 'stale' },
  { symbol: 'LINK/USDT', candleAge: 1, volume: 3120, gaps: 0, status: 'healthy' },
  { symbol: 'DOT/USDT', candleAge: 35, volume: 0, gaps: 1, status: 'stale' },
  { symbol: 'MATIC/USDT', candleAge: 2, volume: 8240, gaps: 0, status: 'healthy' },
  { symbol: 'ATOM/USDT', candleAge: 4, volume: 1890, gaps: 0, status: 'degraded' },
]
