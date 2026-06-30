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
  "type": "subscribe"
}
```
Client subscribes to market data stream. Server responds with a snapshot.

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
  "message": "Unknown exchange: invalid_name"
}
```

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

---

## Message Type Summary

| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| 8765 | C→S | `subscribe` | Subscribe to market data |
| 8765 | C→S | `order` | Submit order |
| 8765 | C→S | `close_position` | Close open position |
| 8765 | S→C | `snapshot` | Initial market state + order books |
| 8765 | S→C | `candles` | Streaming candle + price + order book + account data |
| 8765 | S→C | `fill` | Order fill confirmation |
| 8765 | S→C | `arbitrage_scan` | Active arbitrage opportunities |
| 8765 | S→C | `error` | Error message |
| 8766 | C→S | `subscribe` | Subscribe to AI signals |
| 8766 | C→S | `run_backtest` | Request backtest execution |
| 8766 | S→C | `signal` | Validated trading signal |
| 8766 | S→C | `signal_history` | Historical signals on connect |
| 8766 | S→C | `market_regime` | FFT regime update |
| 8766 | S→C | `backtest_result` | Backtest results with equity curves |

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
