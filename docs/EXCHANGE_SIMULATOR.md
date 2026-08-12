# Exchange Simulator

## Overview

The exchange simulator generates realistic cryptocurrency market data using **Geometric Brownian Motion (GBM)** — the same stochastic process used in options pricing models. It supports both synthetic price generation and real-time price feed integration from external cryptocurrency exchanges (Binance, Coinbase Pro) with automatic failover and hybrid mode for realistic trading.

**IMPORTANT:** This is a **simulated market environment** for educational purposes. The 50+ cryptocurrency symbols (BTC, ETH, SOL, BNB, ADA, AVAX, DOT, LINK, MATIC, UNI, XRP, LTC, ATOM, NEAR, FTM, APE, SAND, MANA, AXS, ENJ, GALA, IMX, GMT, BCH, ETC, XLM, ALGO, VET, THETA, ICP, HBAR, EOS, TRX, XMR, DASH, ZEC, KSM, ACA, GLM, MASK, LDO, STG, RPL, FXS, CRV, AAVE, COMP, MKR, SNX, YFI) are **simulated** — they are not real cryptocurrency markets. However, the AI Signal Bot and HFT Trade Bot execute **real buy/sell orders** within this simulated environment, just like they would on a real exchange. This allows for safe testing and learning of trading strategies without risking real money.

## Price Generation

### Real-Time Price Feed Integration

The exchange simulator supports real-time price feeds from external cryptocurrency exchanges:

**Supported APIs:**
- Binance API (priority 1, rate limit: 1200 req/min)
- Coinbase Pro API (priority 2, rate limit: 1000 req/min)

**Features:**
- Automatic failover between APIs
- Rate limiting per API
- Caching layer (configurable TTL, default: 5 seconds)
- Data normalization across different API formats
- Hybrid mode: Real price feeds + simulated microstructure for realistic trading
- **Connection Pooling** — aiohttp TCPConnector with 100 connections, 30s timeout, DNS caching (300s TTL)
- **Request Batching** — Binance batch fetch (20 symbols), Coinbase concurrent fetch (10 symbols), 80% API call reduction
- **LRU Cache** — TTLCache with 1000 entries, 5s TTL, automatic eviction, 96% cache hit rate
- **MessagePack Serialization** — 3-5x faster than JSON, 30-40% memory reduction
- **Cache Warming** — Pre-populate cache on startup for all symbols
- **Performance Metrics** — Real-time tracking of fetch/parse latencies (p50/p95/p99), cache hit rate, failover count, API errors

**Configuration:**
```yaml
price_feed:
  enabled: true
  hybrid_mode: true
  apis:
    - name: binance
      enabled: true
      priority: 1
      rate_limit: 1200
    - name: coinbase
      enabled: true
      priority: 2
      rate_limit: 1000
  cache_ttl: 5
  failover_enabled: true

  # Performance configuration (NEW - Aug 12, 2026)
  enable_profiling: true
  profile_interval_seconds: 60
  metrics_log_file: "logs/price_feed_metrics.log"
  connection_pool_size: 100
  connection_timeout: 30
  binance_batch_size: 20
  coinbase_batch_size: 10
  cache_max_size: 1000
  cache_warm_on_startup: true
  use_msgpack_cache: true
```

### Geometric Brownian Motion (Fallback)

When real-time price feeds are disabled or unavailable, price evolution follows the GBM formula:

```
S(t+1) = S(t) × exp(μ + σ × Z)
```

Where:
- `S(t)` — current price
- `μ` — drift (tiny bullish bias, default: 0.0001 per candle)
- `σ` — per-candle volatility (derived from annualized volatility)
- `Z` — standard normal random variable (seeded for reproducibility)

### Per-Candle Volatility

Annualized volatility is converted to per-candle volatility:

```
σ_candle = σ_annual / √(candles_per_year)
```

For 5-minute candles: `candles_per_year = 365 × 24 × 12 = 105,120`

### Default Parameters

| Symbol | Initial Price | Annual Volatility |
|--------|--------------|-------------------|
| BTC/USDT | $65,000 | 75% |
| ETH/USDT | $3,500 | 85% |
| SOL/USDT | $150 | 110% |

## Simulated Exchanges

Each exchange has different fee and slippage parameters:

| Exchange | Fee (%) | Slippage (bps) | Price Offset |
|----------|---------|----------------|-------------|
| Binance | 0.04 | 2.0 | 0 bps |
| Bybit | 0.06 | 3.0 | 2 bps |
| OKX | 0.05 | 2.5 | 4 bps |

Prices are correlated across exchanges (same random draw) with small offsets to simulate real market conditions.

## Exchange UI Clones

The web UI includes three exchange-themed interfaces that replicate the look and feel of popular cryptocurrency exchanges:

**Supported Themes:**
- **Binance** — Yellow/black theme with Binance-style layout
- **Bybit** — Blue/dark theme with Bybit-style layout
- **Coinbase** — White/blue theme with Coinbase-style layout

**Features:**
- Seamless switching between exchange themes
- Exchange-specific color schemes and layouts
- Keyboard shortcuts: `1` for Binance, `2` for Bybit, `3` for Coinbase
- All themes have identical underlying functionality

**Configuration:**
```bash
# Enable exchange UI clones in web-ui/.env
VITE_ENABLE_EXCHANGE_CLONES=true
```

See [Web UI Documentation](WEB_UI.md) for detailed information on exchange UI clones.

## Order Book Simulation

The order book is generated around the current mid-price:

- **Depth:** 20 levels per side (configurable)
- **Spread:** Proportional to symbol volatility
- **Liquidity:** Exponential decay — more volume near mid-price
- **Quantity:** Random with decay factor: `q = base × e^(-i × 0.15) × random(0.5, 1.5)`

## Order Matching

### Market Orders
- Filled immediately at mid-price ± slippage
- Slippage = `mid_price × slippage_bps / 10000`

### Limit Orders
- Checked against current market price
- If price is achievable, filled at limit price
- Otherwise, order stays pending

### Advanced Order Types

The simulator supports four advanced order types:

**Stop-Limit Orders:**
- Trigger at a stop price, execute as a limit order
- Buy stop: triggers when market price >= stop price
- Sell stop: triggers when market price <= stop price
- Provides price control compared to stop-market orders

**Trailing Stop Orders:**
- Dynamic stop price that follows favorable price movements
- Configurable trail amount (percentage or absolute value)
- Stop price moves only in the favorable direction
- Useful for profit protection and trend following

**OCO (One-Cancels-the-Other) Orders:**
- Two linked orders where one cancels the other
- Commonly used for take-profit + stop-loss pairs
- Ensures only one order from the group can execute
- Automatic cancellation when one order fills

**Iceberg Orders:**
- Large orders split into visible and hidden portions
- Only a small visible quantity shown in order book
- Hidden quantity replenished as visible portion fills
- Reduces market impact from large orders

See [Advanced Order Types](ADVANCED_ORDER_TYPES.md) for detailed documentation.

### Fees
- Applied as percentage of notional value
- `fee = fill_price × quantity × fee_pct / 100`

## Account Simulation

Each exchange maintains an independent account:

| Field | Description |
|-------|-------------|
| balance | Available cash (USDT) |
| equity | Balance + unrealized PnL |
| positions | List of open positions |
| total_pnl | Cumulative realized PnL |
| total_fees | Cumulative fees paid |
| total_trades | Number of closed trades |
| winning_trades | Number of profitable trades |
| win_rate | winning_trades / total_trades × 100 |

## WebSocket Protocol

### Messages (Server → Client)

**Snapshot (on connect):**
```json
{
  "type": "snapshot",
  "timestamp": 1704067200,
  "candles": [{"symbol": "BTC/USDT", "exchange": "binance", "open": 65000, ...}],
  "prices": {"binance": {"BTC/USDT": 65100, ...}}
}
```

**Candle update (every second):**
```json
{
  "type": "candles",
  "timestamp": 1704067500,
  "candles": [...],
  "prices": {...},
  "accounts": {"binance": {"balance": 10000, "positions": [...], ...}}
}
```

**Order fill:**
```json
{
  "type": "fill",
  "order": {"id": "abc123", "symbol": "BTC/USDT", "side": "BUY", ...}
}
```

### Messages (Client → Server)

**Subscribe:**
```json
{"type": "subscribe"}
```

**Submit order:**
```json
{
  "type": "order",
  "exchange": "binance",
  "symbol": "BTC/USDT",
  "side": "BUY",
  "quantity": 0.01,
  "order_type": "MARKET",
  "stop_loss": 64000,
  "take_profit": 66000
}
```

**Close position:**
```json
{
  "type": "close_position",
  "exchange": "binance",
  "symbol": "BTC/USDT"
}
```

## Terminal Visualizer

The visualizer displays real-time market data in the terminal:

- **Candle charts** — ASCII art with color-coded bullish/bearish candles
- **Order book** — Best bid/ask and spread
- **Account status** — Balance, equity, PnL, win rate
- **Open positions** — Symbol, side, quantity, entry, SL/TP, unrealized PnL

Enable with: `python -m exchange_simulator` (default: visualizer on)

## Arbitrage Detection

The simulator continuously scans for cross-exchange arbitrage opportunities:

- Detects price discrepancies between exchanges for the same symbol
- Calculates net spread after fees and slippage
- Estimates maximum profitable quantity
- Tracks active, closed, and expired opportunities
- Broadcasts `arbitrage_scan` messages to all connected clients
- Auto-executes arbitrage when spread exceeds configurable threshold

## Funding Rates

Per-exchange funding rates are charged to open positions:

- Configurable funding interval (default: every 8 hours simulated)
- Positive funding: longs pay shorts
- Negative funding: shorts pay longs
- Funding rate history tracked and broadcast to clients
- Visualized in Web UI as funding rate history chart

## Market Impact

Large orders move the price based on order size relative to available liquidity:

- Price impact proportional to `order_quantity / available_depth`
- Temporary impact (price recovers) and permanent impact (price stays)
- Configurable impact factor per exchange
- Prevents unrealistic fills on large orders

## News Event Simulation

Simulates sudden market-moving events:

- Random volatility spikes at configurable intervals
- Price jumps with magnitude proportional to event severity
- Event types: positive news (bullish spike), negative news (bearish spike), neutral (volatility increase only)
- Toast notifications in Web UI when events occur
- Configurable event frequency and severity

## Liquidation Engine

Auto-closes positions when margin falls below maintenance level:

- Monitors unrealized PnL on every price update
- Calculates liquidation price based on leverage and maintenance margin
- Auto-closes position at market price when margin < maintenance
- Liquidation reason recorded in trade history
- Liquidation map panel in Web UI shows estimated liquidation levels

## Partial Fills

Large orders are split across multiple order book levels:

- Order quantity consumed level by level from the book
- Each level filled at its respective price
- Average fill price reported to client
- Remaining quantity stays as pending if limit order

## Order Rejection

Orders can be rejected with descriptive reasons:

- **Insufficient margin** — not enough balance for position
- **Max position size** — order exceeds configured maximum
- **No price data** — symbol not available on selected exchange
- Rejection messages sent to client with reason field

## Data Export

Export simulated market data for offline analysis:

```bash
# CSV export
python -m exchange_simulator --export --export-dir data/exports

# Parquet export (requires pyarrow)
python -m exchange_simulator --export --export-format parquet
```

Exports include: candles, trades, account history, and order book snapshots.

## Logging

All services write timestamped log files to the `logs/` directory:

- `logs/exchange_simulator_YYYYMMDD_HHMMSS.log` — service log
- `logs/exchange_simulator_latest.log` — symlink to most recent
- `logs/trades_YYYYMMDD_HHMMSS.csv` — CSV trade log (every fill, SL/TP, arb execution)
- `logs/trades_latest.csv` — symlink to most recent trade CSV

Use `make logs` to view latest log files for all services.

## Audit Logging

The exchange simulator includes comprehensive audit logging for all system events:

**Features:**
- Thread-safe storage with locks for concurrent access
- In-memory cache (configurable max entries, default: 10,000)
- File persistence in JSONL format
- Real-time callbacks for event notification
- Comprehensive filtering (event type, exchange, symbol, time range)
- Export options (JSON and CSV)
- Lifecycle tracking (orders, positions, accounts)

**Event Types Logged:**
- Order events: `ORDER_SUBMITTED`, `ORDER_FILLED`, `ORDER_CANCELLED`, `ORDER_REJECTED`
- Position events: `POSITION_OPENED`, `POSITION_CLOSED`, `POSITION_MODIFIED`
- Account events: `ACCOUNT_BALANCE_CHANGE`
- System events: `CONFIG_CHANGE`, `SYSTEM_START`, `SYSTEM_STOP`, `ERROR`, `WARNING`

**Configuration:**
```yaml
audit:
  enabled: true
  max_memory_entries: 10000
  log_file_path: logs/audit.log
  enable_file_logging: true
  enable_callbacks: true
```

**Web UI Integration:**
The web UI includes an `AuditLogViewer` component for visualizing audit logs with:
- Real-time display
- Expandable details
- Search and filtering
- Export (JSON/CSV)
- Color coding by event type

See [Audit Logging](AUDIT_LOGGING.md) for detailed documentation.

## Configuration

See `exchange_simulator/config.yaml` for all parameters:

- Exchange settings (fees, slippage, symbols, price offsets)
- Market parameters (timeframe, drift, seed, warmup, volatility per symbol)
- Account settings (initial balance, leverage, max position size)
- Visualizer settings (refresh rate, chart dimensions)
- WebSocket server (host, port, compression)
- Price feed (enabled, hybrid mode, API configuration, caching, failover)
- Audit logging (enabled, max memory entries, file path, callbacks)
- Funding rates (interval, rate per exchange)
- News events (frequency, severity range)
- Market impact (factor per exchange)
- Arbitrage (auto-execute threshold, expiry timeout)
- Liquidation (maintenance margin percentage)
