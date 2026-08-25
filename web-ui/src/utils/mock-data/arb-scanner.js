export const MOCK_OPPORTUNITIES = [
  { id: 1, type: 'Triangular', path: 'BTC → ETH → USDT → BTC', profit: 0.85, capital: 10000, estProfit: 85, latency: 120, confidence: 0.92, status: 'active' },
  { id: 2, type: 'Cross-Exchange', path: 'BTC: Binance → OKX', profit: 0.32, capital: 50000, estProfit: 160, latency: 85, confidence: 0.85, status: 'active' },
  { id: 3, type: 'Funding', path: 'BTC Perp: Binance (0.012%)', profit: 0.45, capital: 100000, estProfit: 450, latency: 0, confidence: 0.78, status: 'active' },
  { id: 4, type: 'Triangular', path: 'ETH → SOL → USDT → ETH', profit: 0.28, capital: 25000, estProfit: 70, latency: 95, confidence: 0.75, status: 'active' },
  { id: 5, type: 'Cross-Exchange', path: 'SOL: Bybit → Binance', profit: 0.15, capital: 30000, estProfit: 45, latency: 110, confidence: 0.65, status: 'fading' },
  { id: 6, type: 'Statistical', path: 'BTC-ETH spread z=2.5', profit: 1.20, capital: 20000, estProfit: 240, latency: 0, confidence: 0.82, status: 'active' },
  { id: 7, type: 'Triangular', path: 'AVAX → LINK → USDT → AVAX', profit: 0.12, capital: 15000, estProfit: 18, latency: 150, confidence: 0.55, status: 'fading' },
  { id: 8, type: 'Cross-Exchange', path: 'ETH: OKX → Bybit', profit: 0.08, capital: 40000, estProfit: 32, latency: 90, confidence: 0.48, status: 'closing' },
]

export const MOCK_SCAN_STATS = [
  { exchange: 'Binance', opps: 12, avgProfit: 0.42, scanned: 450 },
  { exchange: 'OKX', opps: 8, avgProfit: 0.35, scanned: 380 },
  { exchange: 'Bybit', opps: 5, avgProfit: 0.28, scanned: 320 },
]
