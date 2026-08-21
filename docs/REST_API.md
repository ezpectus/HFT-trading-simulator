# REST API Reference

This document describes the REST API endpoints for the HFT Trading System components.

## Theory: REST API design and why REST + WebSocket

### REST vs WebSocket — complementary, not competing

**REST (HTTP):** Request-response. Stateless. Good for:
- One-time queries (get symbols, get account, get history)
- Commands (submit order, cancel order)
- Health checks

**WebSocket:** Persistent bidirectional. Good for:
- Real-time streams (candles, order book, fills)
- Push notifications (signals, alerts)

**This project uses both:** REST for queries/commands, WebSocket
for real-time data. This is the standard pattern (Binance, Coinbase,
CME all use REST + WS).

### REST principles (Fielding, 2000)

**REST = Representational State Transfer:**
1. **Stateless:** Each request is self-contained. Server does not store
   client state between requests. Scale horizontally (any server
   handles any request).
2. **Client-Server:** Separation of concerns. UI does not know storage.
3. **Cacheable:** Responses explicitly cacheable or not. `Cache-Control`
   headers. Reduces latency, server load.
4. **Uniform interface:** Resources identified by URL. HTTP methods
   (GET/POST/PUT/DELETE) have semantic meaning.
5. **Layered:** Client does not know how many layers are between it
   and the server. Load balancer, cache, API gateway — transparent.

### API versioning — theory

**`/api/v1/...`:** Version in URL. Breaking changes = new version
(`/api/v2/...`). Old version maintained for backward compatibility.

**Why versioning:** API consumers (Web UI, external tools) should not
break on server update. v1 → v2 migration period.

### HTTP status codes for trading API

| Code | Meaning | Trading context |
|------|---------|-----------------|
| 200 | OK | Successful query, order submitted |
| 201 | Created | Order created, position opened |
| 400 | Bad Request | Invalid order params, missing field |
| 401 | Unauthorized | Missing/invalid API key |
| 403 | Forbidden | Insufficient margin, risk limit exceeded |
| 404 | Not Found | Symbol not found, order not found |
| 409 | Conflict | Duplicate order, position already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server bug, unexpected failure |
| 503 | Service Unavailable | Exchange down, maintenance |

### Idempotency — theory

**Idempotency:** Same request twice = same result. Critical for
trading: network failure → retry → do not want double order.

**Solution:** Client-generated `client_order_id`. Server checks:
if `client_order_id` already exists → return original result, do not
create new order. Prevents duplicate execution on retry.

## Base URLs

| Component | Base URL |
|-----------|----------|
| Exchange Simulator | `http://localhost:8765/api/v1` |
| AI Signal Bot | `http://localhost:8766/api/v1` |
| HFT Trade Bot | `http://localhost:9091/api/v1` |

---

## Exchange Simulator API

### Health Check

**GET** `/health`

Returns the health status of the exchange simulator.

```json
{
  "status": "healthy",
  "version": "3.0.0",
  "timestamp": "2026-08-11T20:00:00Z",
  "services": {
    "websocket": "running",
    "price_feed": "running",
    "order_matching": "running"
  }
}
```

### Get Symbols

**GET** `/symbols`

Returns the list of available trading symbols.

```json
{
  "symbols": [
    {
      "id": "BTC/USDT",
      "base": "BTC",
      "quote": "USDT",
      "tick_size": 0.01,
      "min_qty": 0.001,
      "max_qty": 1000.0,
      "price_precision": 2,
      "qty_precision": 3
    }
  ]
}
```

### Get Order Book

**GET** `/orderbook/{symbol}`

Returns the current order book for a symbol.

**Parameters:**
- `symbol` (path): Trading symbol (e.g., `BTC/USDT`)

```json
{
  "symbol": "BTC/USDT",
  "bids": [
    {"price": 65000.0, "quantity": 1.5},
    {"price": 64990.0, "quantity": 2.0}
  ],
  "asks": [
    {"price": 65010.0, "quantity": 1.0},
    {"price": 65020.0, "quantity": 1.5}
  ],
  "timestamp": "2026-08-11T20:00:00Z"
}
```

### Create Order

**POST** `/orders`

Submit a new order to the exchange.

**Request Body:**
```json
{
  "symbol": "BTC/USDT",
  "side": "BUY",
  "order_type": "LIMIT",
  "quantity": 0.1,
  "price": 65000.0,
  "time_in_force": "GTC",
  "leverage": 10
}
```

**Response:**
```json
{
  "order_id": "ord_abc123",
  "status": "OPEN",
  "symbol": "BTC/USDT",
  "side": "BUY",
  "quantity": 0.1,
  "price": 65000.0,
  "created_at": "2026-08-11T20:00:00Z"
}
```

### Get Order

**GET** `/orders/{order_id}`

Retrieve order details.

**Parameters:**
- `order_id` (path): Order ID

```json
{
  "order_id": "ord_abc123",
  "status": "FILLED",
  "filled_quantity": 0.1,
  "average_fill_price": 65000.0,
  "fee": 0.26,
  "updated_at": "2026-08-11T20:00:01Z"
}
```

### Cancel Order

**DELETE** `/orders/{order_id}`

Cancel an open order.

**Parameters:**
- `order_id` (path): Order ID

```json
{
  "order_id": "ord_abc123",
  "status": "CANCELLED",
  "cancelled_at": "2026-08-11T20:00:05Z"
}
```

### Get Account

**GET** `/account`

Returns account information including balance and positions.

```json
{
  "balance": 10000.0,
  "currency": "USDT",
  "positions": [
    {
      "symbol": "BTC/USDT",
      "side": "LONG",
      "quantity": 0.1,
      "entry_price": 65000.0,
      "current_price": 65100.0,
      "unrealized_pnl": 10.0,
      "leverage": 10
    }
  ],
  "open_orders": 5
}
```

### Get Trades

**GET** `/trades`

Retrieve trade history.

**Query Parameters:**
- `symbol` (optional): Filter by symbol
- `limit` (optional): Number of trades to return (default: 100)
- `offset` (optional): Pagination offset

```json
{
  "trades": [
    {
      "trade_id": "trd_xyz789",
      "order_id": "ord_abc123",
      "symbol": "BTC/USDT",
      "side": "BUY",
      "quantity": 0.1,
      "price": 65000.0,
      "fee": 0.26,
      "timestamp": "2026-08-11T20:00:00Z"
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

### Get Candles

**GET** `/candles/{symbol}`

Retrieve historical candle data.

**Path Parameters:**
- `symbol`: Trading symbol

**Query Parameters:**
- `interval`: 1m, 5m, 15m, 1h, 4h, 1d
- `limit`: Number of candles (default: 100)
- `start_time`: Start timestamp (optional)
- `end_time`: End timestamp (optional)

```json
{
  "symbol": "BTC/USDT",
  "interval": "1h",
  "candles": [
    {
      "timestamp": "2026-08-11T19:00:00Z",
      "open": 64900.0,
      "high": 65100.0,
      "low": 64800.0,
      "close": 65050.0,
      "volume": 150.5
    }
  ]
}
```

---

## AI Signal Bot API

### Health Check

**GET** `/health`

```json
{
  "status": "healthy",
  "version": "3.0.0",
  "strategies_running": 5,
  "signals_generated_today": 1250
}
```

### Get Strategies

**GET** `/strategies`

Returns list of available strategies and their status.

```json
{
  "strategies": [
    {
      "id": "trend_following",
      "name": "Trend Following",
      "status": "ACTIVE",
      "confidence": 0.75,
      "signals_today": 250,
      "win_rate": 0.65
    },
    {
      "id": "mean_reversion",
      "name": "Mean Reversion",
      "status": "ACTIVE",
      "confidence": 0.68,
      "signals_today": 200,
      "win_rate": 0.62
    }
  ]
}
```

### Get Signals

**GET** `/signals`

Retrieve generated trading signals.

**Query Parameters:**
- `symbol` (optional): Filter by symbol
- `strategy` (optional): Filter by strategy
- `limit` (optional): Number of signals (default: 50)

```json
{
  "signals": [
    {
      "signal_id": "sig_123",
      "symbol": "BTC/USDT",
      "side": "BUY",
      "strategy": "trend_following",
      "confidence": 0.85,
      "entry_price": 65000.0,
      "take_profit": 66000.0,
      "stop_loss": 64500.0,
      "timestamp": "2026-08-11T20:00:00Z"
    }
  ]
}
```

### Toggle Strategy

**POST** `/strategies/{strategy_id}/toggle`

Enable or disable a strategy.

**Request Body:**
```json
{
  "strategy_id": "trend_following",
  "action": "ENABLE"
}
```

### Run Backtest

**GET** `/backtest`

Run a backtest for a strategy.

**Query Parameters:**
- `strategy`: Strategy ID
- `symbol`: Symbol
- `start_date`: Start date
- `end_date`: End date

```json
{
  "strategy": "trend_following",
  "symbol": "BTC/USDT",
  "start_date": "2026-01-01",
  "end_date": "2026-08-11",
  "total_trades": 150,
  "winning_trades": 98,
  "losing_trades": 52,
  "win_rate": 0.653,
  "total_pnl": 2500.0,
  "sharpe_ratio": 1.45,
  "max_drawdown": -0.08
}
```

---

## HFT Trade Bot API

### Health Check

**GET** `/health`

```json
{
  "status": "healthy",
  "version": "3.0.0",
  "latency_p50_ms": 0.5,
  "latency_p95_ms": 1.2,
  "latency_p99_ms": 2.5,
  "orders_per_second": 100
}
```

### Get Performance

**GET** `/performance`

Returns performance metrics.

```json
{
  "total_trades": 5000,
  "winning_trades": 3200,
  "losing_trades": 1800,
  "win_rate": 0.64,
  "total_pnl": 15000.0,
  "average_pnl_per_trade": 3.0,
  "sharpe_ratio": 2.1,
  "sortino_ratio": 2.8,
  "max_drawdown": -0.05,
  "calmar_ratio": 3.5
}
```

### Get Positions

**GET** `/positions`

Returns current open positions.

```json
{
  "positions": [
    {
      "symbol": "BTC/USDT",
      "side": "LONG",
      "quantity": 0.5,
      "entry_price": 65000.0,
      "current_price": 65100.0,
      "unrealized_pnl": 50.0,
      "leverage": 10,
      "margin_required": 3250.0
    }
  ]
}
```

### Kill Switch

**POST** `/kill_switch`

Emergency stop - closes all positions and cancels orders.

**Request Body:**
```json
{
  "action": "ACTIVATE",
  "reason": "Manual emergency stop"
}
```

**Response:**
```json
{
  "status": "ACTIVATED",
  "timestamp": "2026-08-11T20:00:00Z",
  "positions_closed": 5,
  "orders_cancelled": 12
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "Symbol not found",
    "details": {}
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_SYMBOL` | Symbol not found or invalid |
| `INSUFFICIENT_BALANCE` | Not enough balance for order |
| `INVALID_ORDER_TYPE` | Unsupported order type |
| `ORDER_NOT_FOUND` | Order ID not found |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

---

## Rate Limiting

| Endpoint | Rate Limit |
|----------|------------|
| `/orders` (POST) | 100 requests/minute |
| `/orders/{order_id}` (GET) | 200 requests/minute |
| `/orderbook/{symbol}` (GET) | 300 requests/minute |
| `/trades` (GET) | 100 requests/minute |
| All other endpoints | 1000 requests/minute |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets
