# WebSocket Protocol

This document describes all WebSocket message types exchanged between the three system components.

## Connections

| Source | Destination | URL | Purpose |
|--------|------------|-----|---------|
| AI Signal Bot | Exchange Simulator | `ws://localhost:8765` | Market data, order execution |
| HFT Trade Bot | Exchange Simulator | `ws://localhost:8765` | Market data, order execution |
| HFT Trade Bot | AI Signal Bot | `ws://localhost:8766` | AI signal reception |
| Web UI | Exchange Simulator | `ws://localhost:8765` | Market data, order book, order execution |
| Web UI | AI Signal Bot | `ws://localhost:8766` | AI signals, backtest execution |

---

## Port 8765: Exchange Simulator

### Client → Simulator

#### Subscribe
```json
{
  "type": "subscribe",
  "protocol_version": 2,
  "encoding": "json"
}
```
Client subscribes to market data stream. Server responds with a `welcome` message, then a `snapshot`.

- `protocol_version`: Protocol version for feature negotiation (default: 2)
- `encoding`: `"json"` (default) or `"msgpack"` for binary MessagePack frames

#### Welcome
```json
{
  "type": "welcome",
  "protocol_version": 2,
  "server_name": "exchange_simulator",
  "trading_active": true
}
```
Server responds to `subscribe` with server info and current trading state.

#### Sync State (reconnect)
```json
{
  "type": "sync_state",
  "last_timestamp": 1704067500
}
```
On reconnect, send `sync_state` with the last received timestamp to get missed data.

#### Order
```json
{
  "type": "order",
  "exchange": "binance",
  "symbol": "BTC/USDT",
  "side": "BUY",
  "quantity": 0.05,
  "order_type": "MARKET",
  "stop_loss": 63000.0,
  "take_profit": 70000.0
}
```
Submit a market or limit order. Server responds with a fill notification.

#### Close Position
```json
{
  "type": "close_position",
  "exchange": "binance",
  "symbol": "BTC/USDT"
}
```
Request to close an open position at market price.

#### Set Simulation Speed
```json
{
  "type": "set_speed",
  "speed": 2
}
```
Set simulation speed. Valid values: `0` (pause), `1` (normal), `2` (2x), `5` (5x). All clients receive the speed change.

#### Config Update (hot-reload)
```json
{
  "type": "config_update",
  "config": {
    "volatility": { "BTC/USDT": 0.8 },
    "fees": { "binance": { "maker": 0.0005, "taker": 0.0007 } }
  }
}
```
Hot-reload simulator parameters without restart. Supports volatility, fees, slippage, and other configurable parameters.

#### Options Chain Request
```json
{
  "type": "options_chain",
  "symbol": "BTC/USDT"
}
```
Request options chain with Greeks (Black-Scholes pricing). Server responds with `options_chain` result.

#### Ping
```json
{
  "type": "ping"
}
```
Latency measurement. Server responds with `pong`.

### Simulator → Client

#### Snapshot (initial)
```json
{
  "type": "snapshot",
  "timestamp": 1704067200,
  "candles": [
    {
      "symbol": "BTC/USDT",
      "exchange": "binance",
      "timestamp": 1704067200,
      "open": 65000.0,
      "high": 65100.0,
      "low": 64900.0,
      "close": 65050.0,
      "volume": 1250.5
    }
  ],
  "prices": {
    "binance": { "BTC/USDT": 65050.0, "ETH/USDT": 3500.0, "SOL/USDT": 150.0 }
  },
  "orderbooks": {
    "binance|BTC/USDT": {
      "exchange": "binance",
      "symbol": "BTC/USDT",
      "bids": [
        { "price": 65049.0, "quantity": 1.234 },
        { "price": 65048.0, "quantity": 0.567 }
      ],
      "asks": [
        { "price": 65051.0, "quantity": 0.890 },
        { "price": 65052.0, "quantity": 0.456 }
      ]
    }
  }
}
```

#### Candles (streaming)
```json
{
  "type": "candles",
  "timestamp": 1704067500,
  "candles": [ { ... } ],
  "prices": {
    "binance": { "BTC/USDT": 65100.0 },
    "bybit": { "BTC/USDT": 65105.0 },
    "okx": { "BTC/USDT": 65098.0 }
  },
  "orderbooks": {
    "binance|BTC/USDT": {
      "exchange": "binance",
      "symbol": "BTC/USDT",
      "bids": [ { "price": 65099.0, "quantity": 1.2 }, ... ],
      "asks": [ { "price": 65101.0, "quantity": 0.8 }, ... ]
    }
  },
  "accounts": {
    "binance": {
      "balance": 10000.0,
      "equity": 10050.0,
      "total_pnl": 50.0,
      "total_fees": 2.5,
      "total_trades": 5,
      "win_rate": 60.0,
      "positions": [ { ... } ]
    }
  }
}
```

#### Fill (order confirmation)
```json
{
  "type": "fill",
  "order": {
    "id": "ord_123",
    "symbol": "BTC/USDT",
    "exchange": "binance",
    "side": "BUY",
    "order_type": "MARKET",
    "quantity": 0.05,
    "filled_quantity": 0.05,
    "filled_price": 65050.0,
    "fee": 0.04,
    "status": "FILLED"
  }
}
```

#### Arbitrage Scan
```json
{
  "type": "arbitrage_scan",
  "active": [
    {
      "symbol": "BTC/USDT",
      "buy_exchange": "binance",
      "sell_exchange": "bybit",
      "buy_price": 65050.0,
      "sell_price": 65120.0,
      "net_spread": 45.0,
      "spread_bps": 6.9,
      "max_quantity": 1.5,
      "estimated_profit": 67.5,
      "timestamp": 1704067500
    }
  ],
  "stats": {
    "total_detected": 12,
    "total_closed": 8,
    "total_expired": 3,
    "total_estimated_profit": 450.0,
    "best_spread_bps": 15.2
  },
  "active_count": 1
}
```

#### Error
```json
{
  "type": "error",
  "message": "Unknown exchange: invalid_name",
  "code": "UNKNOWN_EXCHANGE"
}
```
Error message. `code` is optional.

#### Fills Batch
```json
{
  "type": "fills_batch",
  "fills": [ { ... }, { ... } ]
}
```
Batched fill notifications — multiple fills in one message for efficiency.

#### Position Update
```json
{
  "type": "position",
  "symbol": "BTC/USDT",
  "exchange": "binance",
  "side": "LONG",
  "quantity": 0.5,
  "entry_price": 65050.0,
  "unrealized_pnl": 25.0,
  "leverage": 10
}
```
Position update after fill or price change.

#### Trading State
```json
{
  "type": "trading_state",
  "trading_active": false,
  "reason": "Manual stop via UI"
}
```
Broadcast when trading is started/stopped. All clients should block order submission when `trading_active` is false.

#### Pong
```json
{
  "type": "pong"
}
```
Response to `ping` for latency measurement.

#### Options Chain Response
```json
{
  "type": "options_chain",
  "symbol": "BTC/USDT",
  "calls": [
    { "strike": 66000, "expiry": "2024-12-27", "price": 1200.0, "delta": 0.65, "gamma": 0.0001, "theta": -15.2, "vega": 45.3, "rho": 12.1 }
  ],
  "puts": [
    { "strike": 66000, "expiry": "2024-12-27", "price": 800.0, "delta": -0.35, "gamma": 0.0001, "theta": -12.1, "vega": 45.3, "rho": -8.5 }
  ]
}
```
Options chain with Black-Scholes Greeks (delta, gamma, theta, vega, rho).

#### Speed Change (broadcast)
```json
{
  "type": "speed_change",
  "speed": 2,
  "timestamp": 1704067500
}
```
Broadcast to all clients when simulation speed changes. Speed: 0=paused, 1=normal, 2=2x, 5=5x.

#### Config Updated (broadcast)
```json
{
  "type": "config_updated",
  "config": { ... },
  "timestamp": 1704067500
}
```
Broadcast to all clients when config is hot-reloaded.

---

## Port 8766: AI Signal Bot Signal Publisher

### HFT Bot / Web UI → AI Signal Bot

#### Subscribe
```json
{
  "type": "subscribe",
  "client": "hft_trade_bot"
}
```

#### Run Backtest
```json
{
  "type": "run_backtest",
  "strategy": "all",
  "candles": 500,
  "balance": 10000,
  "symbol": "BTC/USDT",
  "initial_price": 65000,
  "volatility": 0.75,
  "trailing_stop": false,
  "breakeven": false
}
```
Request a backtest run. `strategy` can be `"all"`, `"trend"`, `"mean_reversion"`, `"fft"`, or `"ensemble"`. Server responds with a `backtest_result` message.

#### Compare Backtests
```json
{
  "type": "compare_backtests",
  "backtests": [
    { "name": "Trend Following", "total_return_pct": 12.5, "sharpe_ratio": 1.85, ... },
    { "name": "Mean Reversion", "total_return_pct": 8.2, "sharpe_ratio": 1.42, ... }
  ]
}
```
Request comparison of multiple backtest results. Server responds with `comparison_result`.

### AI Signal Bot → HFT Bot / Web UI

#### Signal (real-time broadcast)
```json
{
  "type": "signal",
  "symbol": "BTC/USDT",
  "direction": "LONG",
  "confidence": 78.5,
  "strategy": "ensemble_voter",
  "entry_price": 65050.0,
  "stop_loss": 63500.0,
  "take_profit": 69000.0,
  "rr_ratio": 2.6,
  "reason": "Trend+FFT agreement: TRENDING regime, bullish slope",
  "signal_id": 42,
  "timestamp": 1704067500
}
```

#### Signal History (on connect)
```json
{
  "type": "signal_history",
  "signals": [ { ... }, { ... } ],
  "count": 15
}
```
Sent once when a new client connects. Contains the last 20 validated signals.

#### Market Regime (FFT)
```json
{
  "type": "market_regime",
  "symbol": "BTC/USDT",
  "regime": "TRENDING",
  "trend_score": 0.45,
  "cycle_strength": 0.72,
  "timestamp": 1704067500
}
```
Broadcast when FFT cycle analysis detects a regime change.

#### Backtest Result
```json
{
  "type": "backtest_result",
  "strategy": "all",
  "symbol": "BTC/USDT",
  "candles": 500,
  "results": {
    "Trend Following": {
      "total_return_pct": 12.5,
      "total_trades": 15,
      "winning_trades": 9,
      "losing_trades": 6,
      "win_rate": 60.0,
      "avg_win": 45.2,
      "avg_loss": -22.1,
      "profit_factor": 3.06,
      "max_drawdown_pct": 5.2,
      "sharpe_ratio": 1.85,
      "final_balance": 11250.0,
      "equity_curve": [10000, 10045, 10089, ...],
      "signals_generated": 20,
      "signals_valid": 15
    }
  }
}
```
Returned in response to a `run_backtest` request. Contains results for each strategy with equity curve and metrics.

#### Comparison Result
```json
{
  "type": "comparison_result",
  "metrics": { "Trend Following": { ... }, "Mean Reversion": { ... } },
  "equity_curves": { "Trend Following": [...], "Mean Reversion": [...] },
  "significance_tests": [ { ... } ],
  "best": { "name": "Trend Following", "total_return_pct": 12.5 }
}
```
Returned in response to `compare_backtests`. Includes statistical significance tests and best strategy.

---

## Message Type Summary

| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| 8765 | C→S | `subscribe` | Subscribe to market data (with protocol_version, encoding) |
| 8765 | C→S | `sync_state` | Request missed data on reconnect |
| 8765 | C→S | `order` | Submit order |
| 8765 | C→S | `close_position` | Close open position |
| 8765 | C→S | `set_speed` | Set simulation speed (0/1/2/5) |
| 8765 | C→S | `config_update` | Hot-reload simulator parameters |
| 8765 | C→S | `options_chain` | Request options chain with Greeks |
| 8765 | C→S | `ping` | Latency measurement |
| 8765 | S→C | `welcome` | Server info on connect |
| 8765 | S→C | `snapshot` | Initial market state + order books + accounts |
| 8765 | S→C | `candles` | Streaming candle + price + order book + account data |
| 8765 | S→C | `fill` | Order fill confirmation |
| 8765 | S→C | `fills_batch` | Batched fill notifications |
| 8765 | S→C | `position` | Position update |
| 8765 | S→C | `trading_state` | Trading active/stopped broadcast |
| 8765 | S→C | `arbitrage_scan` | Active arbitrage opportunities |
| 8765 | S→C | `speed_change` | Simulation speed changed (broadcast) |
| 8765 | S→C | `config_updated` | Config hot-reloaded (broadcast) |
| 8765 | S→C | `options_chain` | Options chain with Greeks (response) |
| 8765 | S→C | `pong` | Latency response |
| 8765 | S→C | `error` | Error message |
| 8766 | C→S | `subscribe` | Subscribe to AI signals |
| 8766 | C→S | `run_backtest` | Request backtest execution |
| 8766 | C→S | `compare_backtests` | Request backtest comparison |
| 8766 | S→C | `signal` | Validated trading signal |
| 8766 | S→C | `signal_history` | Historical signals on connect |
| 8766 | S→C | `market_regime` | FFT regime update |
| 8766 | S→C | `backtest_result` | Backtest results with equity curves |
| 8766 | S→C | `comparison_result` | Backtest comparison with significance tests |

---

## Data Types

### Candle
| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Trading pair (e.g. "BTC/USDT") |
| exchange | string | Exchange ID (binance, bybit, okx) |
| timestamp | int | Unix timestamp (seconds) |
| open | float | Open price |
| high | float | High price |
| low | float | Low price |
| close | float | Close price |
| volume | float | Trade volume |

### Account Status
| Field | Type | Description |
|-------|------|-------------|
| balance | float | Available balance (USDT) |
| equity | float | Balance + unrealized PnL |
| total_pnl | float | Cumulative realized PnL |
| total_fees | float | Cumulative fees paid |
| total_trades | int | Total number of trades |
| win_rate | float | Win rate percentage |
| positions | array | Open positions |

### Position
| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Trading pair |
| side | string | "BUY" (long) or "SELL" (short) |
| quantity | float | Position size |
| entry_price | float | Entry price |
| stop_loss | float | Stop loss price |
| take_profit | float | Take profit price |
| unrealized_pnl | float | Current unrealized PnL |

### Signal
| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Trading pair |
| direction | string | "LONG", "SHORT", or "NEUTRAL" |
| confidence | float | Signal confidence (0-95) |
| strategy | string | Strategy name |
| entry_price | float | Suggested entry price |
| stop_loss | float | Stop loss price |
| take_profit | float | Take profit price |
| rr_ratio | float | Risk/reward ratio |
| reason | string | Human-readable reason |
| timestamp | int | Unix timestamp |

### Order Book
| Field | Type | Description |
|-------|------|-------------|
| exchange | string | Exchange ID |
| symbol | string | Trading pair |
| bids | array | Bid levels (price, quantity) — sorted descending |
| asks | array | Ask levels (price, quantity) — sorted ascending |

### Order Book Level
| Field | Type | Description |
|-------|------|-------------|
| price | float | Price level |
| quantity | float | Quantity at this level |

### Backtest Result (per strategy)
| Field | Type | Description |
|-------|------|-------------|
| total_return_pct | float | Total return percentage |
| total_trades | int | Number of closed trades |
| winning_trades | int | Profitable trades |
| losing_trades | int | Unprofitable trades |
| win_rate | float | Win rate percentage |
| avg_win | float | Average profit per winning trade |
| avg_loss | float | Average loss per losing trade |
| profit_factor | float | Gross profit / gross loss |
| max_drawdown_pct | float | Maximum drawdown percentage |
| sharpe_ratio | float | Annualized Sharpe ratio |
| final_balance | float | Final account balance |
| equity_curve | array | Balance at each candle |
| signals_generated | int | Total signals generated |
| signals_valid | int | Signals that passed validation |

### Closed Trade
| Field | Type | Description |
|-------|------|-------------|
| symbol | string | Trading pair |
| exchange | string | Exchange ID |
| side | string | "BUY" (long) or "SELL" (short) |
| quantity | float | Position size |
| entry_price | float | Entry price |
| exit_price | float | Exit price |
| pnl | float | Realized PnL |
| fee | float | Fee paid |
| reason | string | Close reason: "MANUAL", "STOP_LOSS", "TAKE_PROFIT", "LIQUIDATION" |
| entry_time | int | Entry timestamp |
| exit_time | int | Exit timestamp |

---

## Connection Resilience

All WebSocket clients implement exponential backoff auto-reconnect:

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6+ | 30s (cap) |

On reconnect, clients re-send `subscribe` to get a fresh snapshot.

---

## Compression

WebSocket per-message deflate compression is supported to reduce bandwidth for large order book and candle payloads.

---

## Mock Mode (Web UI)

When `VITE_MOCK_MODE=true` is set, the Web UI generates synthetic data locally without connecting to any WebSocket server. All message types are simulated client-side for standalone demo purposes.

---

## Message Encoding

Clients can request binary MessagePack frames instead of JSON by sending `encoding: "msgpack"` in the `subscribe` message. This reduces bandwidth by ~40-60% for large order book and candle payloads.

| Encoding | Format | Use Case |
|----------|--------|----------|
| `json` (default) | UTF-8 JSON text | Debugging, web clients |
| `msgpack` | Binary frames | Production, bandwidth-sensitive |

Both encodings carry the same message structure — only the wire format differs. The server tracks per-client encoding preference.

---

## Order Types Reference

| Type | Description | Behavior |
|------|-------------|----------|
| `MARKET` | Market order | Fills at best available price |
| `LIMIT` | Limit order | Fills at specified price or better |
| `IOC` | Immediate or Cancel | Fills what's available, cancels rest |
| `FOK` | Fill or Kill | Fills entirely or cancels |
| `GTD` | Good Till Date | Expires at specified time |
| `POST_ONLY` | Post-Only | Never matches (maker only) |

---

## Connection Lifecycle

```
Client                          Server
  │                               │
  ├── subscribe ──────────────────►
  │                               │
  ◄───────────────── welcome ─────┤
  ◄───────────────── snapshot ────┤
  │                               │
  ◄───────────────── candles ─────┤  (streaming)
  ◄───────────────── orderbook ───┤
  │                               │
  ├── order ──────────────────────►
  │                               │
  ◄───────────────── fill ────────┤
  ◄───────────────── position ────┤
  │                               │
  ├── ping ───────────────────────►
  ◄───────────────── pong ────────┤
  │                               │
  │  (disconnected)               │
  ├── sync_state ─────────────────►
  ◄───────────────── snapshot ────┤  (missed data)
  │                               │
```
