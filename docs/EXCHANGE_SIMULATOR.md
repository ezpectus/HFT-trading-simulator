# Exchange Simulator

## Overview

The exchange simulator generates realistic cryptocurrency market data using **Geometric Brownian Motion (GBM)** — the same stochastic process used in options pricing models. No real exchange API is called; all data is synthetic.

## Price Generation

### Geometric Brownian Motion

Price evolution follows the GBM formula:

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

## Configuration

See `exchange_simulator/config.yaml` for all parameters:

- Exchange settings (fees, slippage, symbols, price offsets)
- Market parameters (timeframe, drift, seed, warmup, volatility per symbol)
- Account settings (initial balance, leverage, max position size)
- Visualizer settings (refresh rate, chart dimensions)
- WebSocket server (host, port, compression)
- Funding rates (interval, rate per exchange)
- News events (frequency, severity range)
- Market impact (factor per exchange)
- Arbitrage (auto-execute threshold, expiry timeout)
- Liquidation (maintenance margin percentage)
