# HTTP API Reference

The system does **not** expose a REST command API. All trading commands and
market data flow over **WebSocket** (see `docs/WEBSOCKET_PROTOCOL.md` / the
`ws_message_handler.py` dispatch table). The HTTP surface of each component
is limited to health probes and metrics.

## Component endpoints

### Exchange Simulator — port 8775

Registered in `exchange_simulator/websocket_server.py:204-207`.

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Overall health (status, connected clients, trading_active) |
| `GET /live` | Liveness probe — 200 while the process runs |
| `GET /ready` | Readiness probe — 200 when trading is active, 503 otherwise |
| `GET /metrics` | Prometheus exposition format (`ws_prometheus.py`) |

```json
{"status": "healthy", "connected_clients": 3, "trading_active": true, "timestamp": 1234567890.0}
```

### AI Signal Bot

Two HTTP servers (`src/monitoring/`):

**HealthServer — port 8080** (`health_server.py:124-129`):

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Overall system health |
| `GET /health/exchange` | Exchange connectivity |
| `GET /health/database` | DB connection check |
| `GET /health/shm` | Shared-memory IPC status |
| `GET /ready` | Readiness probe |
| `GET /live` | Liveness probe |

**MetricsExporter — port 9090** (`metrics.py:355-356`):

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics` | Prometheus exposition format |
| `GET /health` | Simple `{"status": "ok"}` |

### HFT Trade Bot — port 9091

Raw socket server (`src/monitoring/health_server.h:123-125`):

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health JSON from SystemMonitor |
| `GET /metrics` | Metrics — **JSON, not Prometheus format** (see audit S069) |

## Not implemented

The following do **not** exist and were removed from this document
(audit S074 — they described an API that was never built):

- `POST /orders`, `GET/DELETE /orders/{id}`, `GET /orderbook/{symbol}`,
  `GET /account`, `GET /trades`, `GET /candles/{symbol}` — order management
  and market data go over the simulator WebSocket (`ws://host:8765`),
  not REST.
- `GET /strategies`, `GET /signals`, `POST /strategies/{id}/toggle`,
  `GET /backtest` — strategy/signal data is pushed over the signals
  WebSocket (`ws://host:8766`); backtests run via the `run_backtest`
  WS message or `run_backtest.py`.
- `GET /performance`, `GET /positions`, `POST /kill_switch` on the HFT
  bot — positions are internal to the C++ process; the kill switch is
  triggered via SHM, not HTTP.
- The rate-limit table and error-code registry described a REST layer
  that does not exist.
