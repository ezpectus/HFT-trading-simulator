# WebSocket Protocol

This document describes all WebSocket message types exchanged between the three system components.

## Theory: Why WebSocket instead of HTTP polling or REST?

### WebSocket vs HTTP for real-time trading

**HTTP polling:** Client requests data from server every N seconds.
- Latency: N/2 average (half the polling interval)
- Overhead: HTTP headers (~500 bytes) per request
- Connections: new TCP connection per request (or keep-alive)
- Server push: impossible — client must poll

**WebSocket:** Persistent bidirectional connection.
- Latency: ~1ms (message push, no polling delay)
- Overhead: ~2-10 bytes per frame (no HTTP headers after handshake)
- Connections: one TCP connection, reused
- Server push: native — server pushes data immediately

**For trading:** WebSocket is the only viable option. HTTP polling
with 1s interval = 500ms average latency = too slow for HFT.
WebSocket = ~1ms push latency.

### Protocol design principles

**1. Message-based, not stream-based:**
Each message is a self-contained JSON object with a `type` field.
Easy to parse, route, debug. Alternative: binary protocol (faster,
but harder to debug). This project: JSON for dev, MessagePack
optionally for production.

**2. Protocol versioning:**
`protocol_version: 2` in subscribe message. Server can support
multiple versions. Client and server negotiate version on connect.

**3. Snapshot + updates pattern:**
- `snapshot`: Full state at subscribe time (all candles, order book)
- `update`: Incremental changes (new candle, order book delta)
- This is **delta encoding** — instead of sending full state each time,
  only changes. Saves bandwidth, reduces latency.

**4. Sync/reconnect pattern:**
`sync_state` with `last_timestamp` → server sends missed data.
Handles network disconnections gracefully. Critical for trading —
a missed candle = a missed signal = a missed trade.

**5. Encoding negotiation:**
`encoding: "json"` (default) or `"msgpack"` (binary).
JSON: human-readable, easy debug. MessagePack: 3-5x faster,
30-40% smaller. Production → MessagePack. Dev → JSON.

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
  "encoding": "json",
  "symbols": ["BTC/USDT", "ETH/USDT"]
}
```
Client subscribes to market data stream. Server responds with a `welcome` message, then a `snapshot`.

- `protocol_version`: Protocol version for feature negotiation (default: 2)
- `encoding`: `"json"` (default) or `"msgpack"` for binary MessagePack frames
- `symbols`: Optional list of symbols to receive data for. If omitted, client receives all symbols.

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "symbols": ["ETH/USDT", "SOL/USDT"]
}
```
Remove symbols from the client's subscription set. Only affects future broadcasts — no response message is sent.

- `symbols`: List of symbols to unsubscribe from (required)

#### Welcome
```json
{
  "type": "welcome",
  "protocol_version": 2,
  "server": "exchange_simulator",
  "trading_active": true
}
```
Sent immediately on connect (before any `subscribe`), followed by a `snapshot`.

#### Sync State (reconnect)
```json
{
  "type": "sync_state",
  "last_timestamp": 1704067500
}
```
On reconnect, send `sync_state` with the last received timestamp to get missed data.

#### Auth (control plane)
```json
{ "type": "auth", "token": "<EXCHANGE_CONTROL_TOKEN>" }
```
When the server is started with `EXCHANGE_CONTROL_TOKEN` set, control commands
(`order`, `close_position`, `cancel_order`, `cancel_all_orders`, `start_trading`,
`stop_trading`, `update_config`, `set_speed`, `replay`) are rejected with an
`error` until the socket authenticates. Replies `auth_ok` on success,
`auth_failed` otherwise. Market-data messages (`subscribe`, `snapshot`,
`options_chain`, `ping`, …) never require auth. When no token is configured the
control plane is open and `auth` is accepted as a no-op.

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
  "take_profit": 70000.0,
  "client_order_id": "sig_42"
}
```
Submit a market or limit order. Server responds with a fill notification.
A `LIMIT` order priced off-market rests as `PENDING` and fills at its limit
price once the market reaches it.

`client_order_id` (optional) is an idempotency key scoped per exchange:
re-sending a message with the same `client_order_id` returns the **original**
order with `"deduplicated": true` instead of filling twice — the dedup table is
bounded to the last 10,000 keys per server.

#### Cancel Order
```json
{ "type": "cancel_order", "exchange": "binance", "order_id": "binance-7" }
```
Cancel a pending (resting) order. Replies `order_cancelled` with the cancelled
order (also broadcast to other clients) or `error` if no pending order has that
id. Works while trading is stopped.

#### Cancel All Orders
```json
{ "type": "cancel_all_orders", "exchange": "binance", "symbol": "BTC/USDT" }
```
Cancel every pending order on the exchange; `symbol` is optional and filters
to one market. Replies `orders_cancelled` (`{exchange, count, order_ids}`),
broadcast to other clients. Works while trading is stopped — this is the
kill-switch path.

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

#### Replay Control
```json
{
  "type": "replay",
  "action": "pause" | "resume" | "scrub",
  "offset": 100
}
```
Control market replay. `pause`/`resume` halt and resume the simulation (`offset` ignored). `scrub` rewinds `offset` candles and immediately replies with `replay_candles`.

#### Config Update (hot-reload)
```json
{
  "type": "update_config",
  "updates": {
    "volatility": { "BTC/USDT": 0.8 },
    "fees": { "binance": 0.0005 },
    "slippage": { "binance": 3.0 },
    "leverage": { "binance": 10 }
  }
}
```
Hot-reload simulator parameters without restart. The payload is a flat `updates`
map: `volatility` (`{symbol: value}`), `fees`/`slippage` (`{exchange: fee_pct /
slippage_bps}` — a single fee, no maker/taker split), `leverage`
(`{exchange: int}`). No bounds are enforced. Acknowledged with `config_updated`.

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

#### Start / Stop Trading
```json
{ "type": "start_trading" }
{ "type": "stop_trading" }
```
Globally enable/disable order submission for **all** clients. Replies with
`trading_state` to the requester and broadcasts `trading_state` to every
connected client. While stopped, `order` requests get an `error` reply.

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
  "seq": 42,
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
  "orderbook_deltas": {
    "binance|BTC/USDT": {
      "exchange": "binance",
      "symbol": "BTC/USDT",
      "bids": [ { "p": 65099.0, "q": 1.2 } ],
      "asks": [ { "p": 65101.0, "q": 0.0 } ]
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
  },
  "funding_rates": { "binance": 0.0004 },
  "candles_to_funding": 42,
  "news_event": null,
  "weekend_mode": false,
  "trading_active": true
}
```

Every `candles` broadcast also carries `funding_rates` (per-exchange 8h rate
fractions), `candles_to_funding` (countdown), `news_event` (object or null),
`weekend_mode` (bool) and `trading_active` (bool) — these fields are always
present even though older revisions of this doc omitted them.

**Sequence Numbers:** The `seq` field is a monotonically increasing integer. Clients can use it to detect missed messages and request `sync_state` on gaps.

**Order Book Deltas:** When `orderbook_deltas` is present, only changed price levels are sent (compact `p`/`q` keys). A level with `q: 0.0` indicates removal. Full snapshots are sent for new connections and when no previous state exists.

**Selective Subscription:** If a client subscribes with a specific `symbols` list, the server filters `candles`, `prices`, `orderbooks`, and `orderbook_deltas` to only include subscribed symbols.

**Compression:** All connections use `permessage-deflate` compression. The server and client negotiate this automatically during the WebSocket handshake.

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
Error message. Note: no `code` field is emitted today — match on `message`.

#### Fills Batch
```json
{
  "type": "fills_batch",
  "orders": [ { ... }, { ... } ]
}
```
Batched fill notifications — the array key is `orders` (each entry is an
`order.to_dict()`), **not** `fills`.

#### Position Update
No dedicated `position` message exists — positions are delivered inside
`accounts` in `snapshot`/`candles` broadcasts (`account.positions` list).

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

#### Speed Set (direct ack)
```json
{
  "type": "speed_set",
  "speed": 2
}
```
Direct reply to the requesting client after a `set_speed` request.
**No broadcast exists** — other clients are not notified of the speed change
(there is no `speed_change` message; older doc revisions invented it).

#### Config Updated (direct ack)
```json
{
  "type": "config_updated",
  "updates": { "volatility": { "BTC/USDT": 0.8 }, ... }
}
```
Direct reply to the requesting client after an `update_config` request,
echoing the applied `updates` map. Not broadcast to other clients.

#### Replay State
```json
{
  "type": "replay_state",
  "paused": true
}
```
Sent after a `replay` `pause`/`resume` action reflects the new simulation state.

#### Replay Candles
```json
{
  "type": "replay_candles",
  "candles": [ ... ],
  "offset": 100,
  "timestamp": 1704067500
}
```
Historical candles returned in response to a `replay` `scrub` action.

#### Audit Logs (broadcast)
```json
{
  "type": "audit_logs",
  "logs": [
    {
      "id": "evt_abc123",
      "event_type": "order_submitted",
      "timestamp": 1704067500,
      "exchange": "binance",
      "symbol": "BTC/USDT",
      "user_id": "system",
      "session_id": "",
      "order_id": "ord_1",
      "position_id": "",
      "old_value": 0.0,
      "new_value": 0.0,
      "reason": "",
      "metadata": {},
      "ip_address": "",
      "user_agent": ""
    }
  ]
}
```
Queued audit-log events (see `AuditLog` in `exchange_simulator/models.py`) drained and broadcast each tick while events are pending.

---

## Port 8766: AI Signal Bot Signal Publisher

### HFT Bot / Web UI → AI Signal Bot

#### Auth (optional — required only when server has `api.auth_token` configured)
```json
{
  "type": "auth",
  "token": "<shared secret>"
}
```
Sent as the first frame on connect when the server is configured with a token
(`api.auth_token` in `settings.yaml` or `AI_BOT_AUTH_TOKEN` env). Server replies
`{"type": "auth_ok"}` or `{"type": "auth_failed"}` and drops the connection on
failure. When no token is configured the handshake is skipped entirely; a
post-connect `auth` ping still answers `auth_ok` with `"required": false`.

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

#### Optimize Portfolio
```json
{
  "type": "optimize_portfolio",
  "method": "max_sharpe",
  "assets": [
    { "symbol": "BTC/USDT", "candles_data": [ { "close": 64000, ... }, ... ] },
    { "symbol": "ETH/USDT", "candles_data": [ ... ] }
  ],
  "current_weights": [0.5, 0.5],
  "portfolio_value": 10000,
  "views": [
    { "assets": ["BTC/USDT"], "weights": [1], "expected_return": 0.001, "confidence": 0.7 }
  ]
}
```
Run portfolio optimization over client-supplied candles. `method` is one of
`max_sharpe`, `min_variance`, `risk_parity`, `black_litterman`. Optional:
`current_weights` + `portfolio_value` adds rebalancing orders to the response;
`views` is Black-Litterman only. Server responds with `portfolio_result`.

#### Volatility Surface
```json
{
  "type": "vol_surface",
  "model": "svi",
  "forward": 64000,
  "points": [
    { "strike": 60000, "maturity_days": 30, "iv": 0.62 },
    { "strike": 64000, "maturity_days": 30, "iv": 0.55 }
  ],
  "eval_strikes": [58000, 60000, 62000, 64000]
}
```
Calibrate an implied-vol model to market IV points. `model` is `svi` or `sabr`
(`beta` optional, default 0.5). `eval_strikes` optionally picks the output grid
(median maturity). Server responds with `vol_surface_result`.

#### CVaR Analysis
```json
{
  "type": "cvar_analysis",
  "returns": [0.01, -0.02, 0.005],
  "confidence": 0.95,
  "method": "historical",
  "time_horizon": 1.0
}
```
Tail-risk analysis via `src/risk/cvar.py`. `method` is `historical`,
`parametric`, or `monte_carlo`. Send `returns[]` or `candles_data[]` (close
prices → returns computed server-side). Responds with `cvar_result` including
tail measures (skewness/kurtosis/tail index/max drawdown) and CVaR under
stressed-shock scenarios.

#### Stress Test
```json
{
  "type": "stress_test",
  "positions": [ { "symbol": "BTC/USDT", "qty": 0.5, "price": 64000 } ],
  "portfolio_value": 42000,
  "scenario": "crisis_2008",
  "custom_shocks": [0.9]
}
```
Portfolio stress scenarios via `src/risk/stress_test.py`. `scenario` is
`crisis_2008|covid_crash|ftx_collapse` (omit to run all three); `custom_shocks`
(per-position price multipliers) appends a custom scenario. Responds with
`stress_test_result`.

#### Position Size
```json
{
  "type": "position_size",
  "direction": "LONG",
  "price": 64000,
  "volatility": 0.02,
  "account_value": 10000,
  "risk_per_trade": 0.01,
  "method": "volatility"
}
```
Dynamic sizing via `src/risk/position_sizing.py`. `method` is `volatility`,
`risk_parity`, or `kelly` (`volatility`/`kelly` require `volatility` as a
fraction, e.g. ATR/price). `direction` is `LONG|SHORT|HOLD` (HOLD → zero size).
Responds with `position_size_result`.

#### Hawkes Fit
```json
{
  "type": "hawkes_fit",
  "events": [0.5, 1.2, 1.4, 5.0, 9.3]
}
```
Self-exciting point-process MLE fit via `src/technical_analysis/hawkes_funcs.py`.
`events` is 5–5000 event times (any consistent origin; normalized server-side).
Responds with `hawkes_result`: fitted μ/α/β, branching ratio, log-likelihood,
and the conditional intensity path.

#### Funding Arb Scan
```json
{
  "type": "funding_arb_scan",
  "funding_rates": { "binance": 0.0005 },
  "prices": { "binance": { "BTC/USDT": 64000 } },
  "symbols": ["BTC/USDT"]
}
```
Funding-rate arbitrage detection via `src/strategies/funding_arb_detector.py`.
`funding_rates` is per-exchange 8h rate fractions. Omit `funding_rates`/`prices`
to use the bot's live simulator feed (spot ≡ perp by design in the sim — the
scan reports spot_perp opportunities when funding exceeds the detector
threshold). Responds with `funding_arb_result`.

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

#### Portfolio Result
```json
{
  "type": "portfolio_result",
  "method": "max_sharpe",
  "weights": { "BTC/USDT": 0.62, "ETH/USDT": 0.38 },
  "expected_return": 0.0012,
  "volatility": 0.021,
  "sharpe_ratio": 1.45,
  "risk_contributions": { "BTC/USDT": 0.71, "ETH/USDT": 0.29 },
  "orders": [ { "symbol": "BTC/USDT", "side": "buy", "quantity": 0.02 } ]
}
```
Returned in response to `optimize_portfolio`. `risk_contributions` only for
`risk_parity`; `orders` only when `current_weights` + `portfolio_value` were
sent. On bad input: `{"type": "portfolio_result", "error": "<reason>"}`.

#### Vol Surface Result
```json
{
  "type": "vol_surface_result",
  "model": "svi",
  "params": { "a": 0.01, "b": 0.1, "rho": -0.2, "m": 0.0, "sigma": 0.3 },
  "fitted": [ { "strike": 60000, "maturity_days": 30, "iv_model": 0.60 } ],
  "points": 12,
  "calibrated": true
}
```
Returned in response to `vol_surface`. On bad input or failed calibration:
`{"type": "vol_surface_result", "error": "<reason>"}`.

#### CVaR Result
```json
{
  "type": "cvar_result",
  "var": -0.018,
  "cvar": -0.031,
  "confidence_level": 0.95,
  "method": "historical",
  "n_observations": 120,
  "tail": { "skewness": -0.4, "kurtosis": 2.1, "tail_index": 3.2, "max_drawdown": -0.12 },
  "scenarios": { "crisis_2008": { "cvar": -0.062, "var": -0.036, "shock_multiplier": 2.0 } }
}
```
On bad input: `{"type": "cvar_result", "error": "<reason>"}`.

#### Stress Test Result
```json
{
  "type": "stress_test_result",
  "results": [ { "scenario": "2008 Financial Crisis", "value_before": 42000,
    "value_after": 21000, "pnl": -21000, "pnl_pct": -0.5,
    "margin_requirement": 10500, "liquidity_impact": 0.02, "passed": false } ],
  "summary": { "total_scenarios": 3, "passed_scenarios": 0, "pass_rate": 0.0,
    "worst_pnl_percentage": -0.5, "overall_passed": false }
}
```
On bad input: `{"type": "stress_test_result", "error": "<reason>"}`.

#### Position Size Result
```json
{
  "type": "position_size_result",
  "position_size": 0.25,
  "position_value": 16000,
  "risk_amount": 100,
  "leverage": 1.0,
  "method": "volatility"
}
```
On bad input: `{"type": "position_size_result", "error": "<reason>"}`.

#### Hawkes Result
```json
{
  "type": "hawkes_result",
  "params": { "mu": 0.1, "alpha": 0.5, "beta": 1.0, "branching_ratio": 0.5, "log_lik": -42.1 },
  "n_events": 24,
  "horizon": 100.0,
  "intensity_path": [ { "t": 1.0, "intensity": 0.62 } ]
}
```
On bad input: `{"type": "hawkes_result", "error": "<reason>"}`.

#### Funding Arb Result
```json
{
  "type": "funding_arb_result",
  "opportunities": [ { "type": "spot_perp", "symbol": "BTC/USDT",
    "exchanges": ["binance"], "funding_rate": 0.0005,
    "expected_daily_return": 0.0015, "cost_estimate": 0.001,
    "net_expected_return": 0.0005, "confidence": 72.0 } ],
  "scanned_exchanges": 1,
  "scanned_symbols": 1
}
```
On bad input: `{"type": "funding_arb_result", "error": "<reason>"}`.

#### Auth Result
```json
{ "type": "auth_ok", "required": true }
{ "type": "auth_failed" }
```
Answer to an `auth` frame.

#### Circuit Breaker Status
```json
{
  "type": "circuit_breaker_status",
  "state": "CLOSED",
  "consecutive_failures": 0,
  "consecutive_successes": 3,
  "total_trips": 2,
  "total_blocks": 14,
  "failure_threshold": 5,
  "cooldown_seconds": 60,
  "timestamp": 1704067500
}
```
Pushed on connect and broadcast periodically while the publisher runs. `state` is `CLOSED` | `OPEN` | `HALF_OPEN`; `OPEN` means signals are being blocked.

---

## Message Type Summary

| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| 8765 | C→S | `auth` | Control-plane token (required when `EXCHANGE_CONTROL_TOKEN` set) |
| 8765 | C→S | `subscribe` | Subscribe to market data (with protocol_version, encoding) |
| 8765 | C→S | `sync_state` | Request missed data on reconnect |
| 8765 | C→S | `order` | Submit order (optional `client_order_id` idempotency key) |
| 8765 | C→S | `cancel_order` | Cancel one pending order by `order_id` |
| 8765 | C→S | `cancel_all_orders` | Cancel all pending orders (optional `symbol` filter) |
| 8765 | C→S | `close_position` | Close open position |
| 8765 | C→S | `set_speed` | Set simulation speed (0/1/2/5) |
| 8765 | C→S | `update_config` | Hot-reload simulator parameters (flat `updates` map) |
| 8765 | C→S | `start_trading` / `stop_trading` | Globally enable/disable order submission |
| 8765 | C→S | `options_chain` | Request options chain with Greeks |
| 8765 | C→S | `ping` | Latency measurement |
| 8765 | C→S | `replay` | Replay control (pause/resume/scrub+offset) |
| 8765 | S→C | `welcome` | Server info on connect |
| 8765 | S→C | `snapshot` | Initial market state + order books + accounts |
| 8765 | S→C | `candles` | Streaming candle + price + order book + account data |
| 8765 | S→C | `auth_ok` / `auth_failed` | Control-plane auth result |
| 8765 | S→C | `fill` | Order fill confirmation (`deduplicated: true` on idempotent resubmit) |
| 8765 | S→C | `order_cancelled` | Single pending order cancelled |
| 8765 | S→C | `orders_cancelled` | Bulk cancel ack (`count` + `order_ids`) |
| 8765 | S→C | `fills_batch` | Batched fill notifications (`orders` key) |
| 8765 | S→C | `trading_state` | Trading active/stopped broadcast |
| 8765 | S→C | `arbitrage_scan` | Active arbitrage opportunities |
| 8765 | S→C | `config_updated` | Direct ack echoing applied `updates` (not broadcast) |
| 8765 | S→C | `options_chain` | Options chain with Greeks (response) |
| 8765 | S→C | `speed_set` | Direct ack to `set_speed` request |
| 8765 | S→C | `replay_state` | Replay paused/resumed state |
| 8765 | S→C | `replay_candles` | Historical candles after `scrub` |
| 8765 | S→C | `audit_logs` | Queued audit events (broadcast while pending) |
| 8765 | S→C | `pong` | Latency response |
| 8765 | S→C | `error` | Error message |
| 8766 | C→S | `auth` | Token handshake (when `api.auth_token` configured) |
| 8766 | C→S | `subscribe` | Subscribe to AI signals |
| 8766 | C→S | `run_backtest` | Request backtest execution |
| 8766 | C→S | `compare_backtests` | Request backtest comparison |
| 8766 | C→S | `optimize_portfolio` | Portfolio optimization (Markowitz/RP/BL + rebalance) |
| 8766 | C→S | `vol_surface` | SVI/SABR implied-vol calibration |
| 8766 | C→S | `cvar_analysis` | VaR/CVaR + tail measures + stressed scenarios |
| 8766 | C→S | `stress_test` | Portfolio stress scenarios (2008/COVID/FTX/custom) |
| 8766 | C→S | `position_size` | Dynamic sizing (volatility/risk-parity/kelly) |
| 8766 | C→S | `hawkes_fit` | Hawkes MLE fit + conditional intensity path |
| 8766 | C→S | `funding_arb_scan` | Funding-rate arbitrage detection |
| 8766 | S→C | `auth_ok` / `auth_failed` | Auth handshake result |
| 8766 | S→C | `signal` | Validated trading signal |
| 8766 | S→C | `signal_history` | Historical signals on connect |
| 8766 | S→C | `market_regime` | FFT regime update |
| 8766 | S→C | `backtest_result` | Backtest results with equity curves |
| 8766 | S→C | `comparison_result` | Backtest comparison with significance tests |
| 8766 | S→C | `portfolio_result` | Optimization weights/metrics/orders (or `error`) |
| 8766 | S→C | `vol_surface_result` | Calibrated SVI/SABR params + fitted IVs (or `error`) |
| 8766 | S→C | `cvar_result` | VaR/CVaR + tail + scenario results (or `error`) |
| 8766 | S→C | `stress_test_result` | Scenario PnL/margin/liquidity + summary (or `error`) |
| 8766 | S→C | `position_size_result` | Size/value/risk/leverage (or `error`) |
| 8766 | S→C | `hawkes_result` | Fitted params + intensity path (or `error`) |
| 8766 | S→C | `funding_arb_result` | Arbitrage opportunities (or `error`) |
| 8766 | S→C | `circuit_breaker_status` | Breaker state on connect + periodic |

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

Clients can request binary MessagePack frames by sending `encoding: "msgpack"` in the `subscribe` message. The negotiated encoding is honored on **every** send — point-sends (`snapshot`, `sync_state`, other `_send_json` replies) and the high-rate broadcasts (`candles`, `fills_batch`, `audit_logs`, arbitrage) alike (fixed in S212).

| Encoding | Format | Wire frame |
|----------|--------|------------|
| `json` (default) | UTF-8 JSON | **Text** frame |
| `msgpack` | MessagePack | **Binary** frame |

Frame type discriminates the encoding: clients should parse text frames as JSON and binary frames as MessagePack (msgpack must be installed server-side for `msgpack` to take effect — otherwise the server falls back to JSON). Both encodings carry the same message structure; only the wire format differs.

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

---

## Reconnection & Backoff

**Source:** `ai-signal-bot/src/communication/ws_client.py`

The AI Signal Bot WebSocket client implements exponential backoff with jitter for automatic reconnection:

### Backoff Algorithm

```
initial_delay = 1.0s
max_delay = 60.0s
jitter = delay * (0.75 + random() * 0.5)   # range: [75%, 125%] of base delay

On ConnectionClosed or OSError:
    actual_wait = jitter(delay)
    sleep(actual_wait)
    delay = min(delay * 2, max_delay)      # exponential increase, capped

On successful reconnect:
    delay = initial_delay                   # reset to 1.0s
    reconnect_count += 1
    notify reconnect_handler()              # e.g., MetricsExporter.record_ws_reconnect()
```

### Backoff Timeline Example

| Attempt | Base Delay | Jitter Range | Actual Wait |
|---------|-----------|--------------|-------------|
| 1 | 1.0s | 0.75s – 1.25s | ~1.0s |
| 2 | 2.0s | 1.50s – 2.50s | ~2.0s |
| 3 | 4.0s | 3.00s – 5.00s | ~4.0s |
| 4 | 8.0s | 6.00s – 10.00s | ~8.0s |
| 5 | 16.0s | 12.00s – 20.00s | ~16.0s |
| 6 | 32.0s | 24.00s – 40.00s | ~32.0s |
| 7+ | 60.0s | 45.00s – 75.00s | ~60.0s |

### Why Jitter?

Without jitter, all disconnected clients reconnect at the same intervals — causing **thundering herd** on the server. Jitter spreads reconnection attempts across a time window, preventing server overload.

### Graceful Shutdown

On SIGTERM/SIGINT, the client stops reconnection attempts and closes cleanly:

- **AI Signal Bot** (`run.py`): `signal.signal(SIGTERM, _signal_handler)` → sets `_running = False` → listen loop cancels → WebSocket closes
- **Exchange Simulator** (`__main__.py`): `loop.add_signal_handler(SIGTERM, ...)` → sets `_shutdown_event` → closes all client connections
