# Monitoring Guide

Guide to the monitoring and observability stack: Prometheus, Grafana, Alertmanager, distributed tracing, and health checks.

---

## Theory: Observability — three pillars and why each matters

### Monitoring vs Observability

**Monitoring:** You know what happened (after the fact). Alerts,
dashboards. Reactive.

**Observability:** You know why it happened (can debug). Metrics +
logs + traces. Proactive + reactive.

**Observability = Monitoring + Debugging capability**

### Three pillars of observability

| Pillar | What | Tool | Cardinality | Use case |
|--------|------|------|-------------|----------|
| **Metrics** | Numeric time series | Prometheus | Low (aggregated) | "P99 latency = 500us", "signals/sec = 10" |
| **Logs** | Discrete events | structlog (JSON) | High (per-event) | "Order BTC/USDT BUY 0.05 filled at 65000" |
| **Traces** | Request flow | OpenTelemetry + Jaeger | Medium (per-request) | "Signal → Risk → Order → Fill: 45ms total" |

**Why all three?** Metrics show WHAT (latency spike). Logs show
WHEN (which order). Traces show WHERE (which component). Without
all three — you cannot debug.

### Prometheus pull model — theory

**Pull (Prometheus):** Server scrapes `/metrics` endpoint every 15s.
- Server controls rate (backpressure)
- No agent on target (just HTTP endpoint)
- Service discovery (knows what to scrape)
- Simpler security (no inbound from services)

**Push (StatsD/Datadog):** Services push metrics to agent.
- Lower latency (push immediately, don't wait 15s)
- No scrape configuration
- But: agent needed on each host, potential for push storms

**For trading:** Pull is sufficient. 15s interval is fine for system
health. Latency-sensitive metrics (P99) use histograms, not real-time.

### Histogram vs Summary

**Histogram:** Fixed buckets (10us, 50us, 100us, 500us, 1ms).
`histogram_quantile()` computes percentiles. Aggregatable across
instances. **Use for P50/P95/P99.**

**Summary:** Client-side percentiles. Cannot aggregate. Higher
client overhead. **Use for P99.9 when bucket boundaries are unknown.**

### Alert design — theory

**Alert fatigue:** Too many alerts → developers ignore them.
Solution: alert only on actionable, sustained conditions.

- `for: 5m` — condition must persist 5 minutes. Prevents flapping.
- Severity: Critical (page), Warning (ticket), Info (log).
- Runbook: Every alert has a runbook (what to do).

**For trading:**
- `CircuitBreakerOpen: for 0m` — immediate. Trading stopped.
- `HighLatency: P99 > 1ms for 5m` — sustained. Not a transient spike.
- `HighDrawdown: > 5% for 1m` — financial risk. Short window.

## Overview

The system provides full observability through:

- **Prometheus** — metrics scraping (counters, histograms, gauges)
- **Grafana** — 5 pre-built dashboards for real-time visualization
- **Alertmanager** — alert routing to email, Slack, Discord
- **OpenTelemetry** — distributed tracing with Jaeger export
- **eBPF** — kernel-level system observability with minimal overhead
- **Health checks** — HTTP endpoints for Kubernetes liveness/readiness
- **Structured logging** — JSON logs with correlation IDs via structlog

### Why Observability?

In a distributed trading system with 4+ components, you need to know:
- **Is the system healthy?** — health checks + Grafana dashboards
- **Are signals being generated?** — Prometheus counters
- **What's the latency?** — Histogram percentiles (P50/P95/P99)
- **Where is time spent?** — Jaeger distributed traces
- **Are we losing money?** — Real-time PnL and drawdown gauges
- **Is the system under stress?** — eBPF kernel-level metrics

Without observability, you're flying blind. In trading, undetected issues
mean lost money — sometimes millions in minutes.

**Monitoring directory:** `monitoring/`

---

## Prometheus

### Configuration

**Source:** `monitoring/prometheus.yml`

Scrape targets:

| Service | Port | Path | Interval |
|---------|------|------|----------|
| Exchange Simulator | 8775 | /metrics | 15s |
| AI Signal Bot | 9090 | /metrics | 15s |
| HFT Trade Bot | 9091 | /metrics | 15s |

### Metrics Exported

**Source:** `ai-signal-bot/src/monitoring/metrics.py` (MetricsExporter class)

**AI Signal Bot metrics (`ai_signal_bot_*`):**

| Metric | Type | Description |
|--------|------|-------------|
| `ai_signal_bot_signals_sent_total` | Counter | Total signals broadcast |
| `ai_signal_bot_signals_blocked_total` | Counter | Signals blocked by circuit breaker |
| `ai_signal_bot_circuit_breaker_state` | Gauge | Breaker state (0=closed, 1=open, 2=half_open) |
| `ai_signal_bot_circuit_breaker_trips_total` | Counter | Total circuit breaker trips |
| `ai_signal_bot_ws_clients_connected` | Gauge | Connected WebSocket clients |
| `ai_signal_bot_errors_total` | Counter | Total errors |
| `ai_signal_bot_drawdown` | Gauge | Current drawdown fraction |
| `ai_signal_bot_win_rate` | Gauge | Win rate (0-1) |
| `ai_signal_bot_pnl_total` | Gauge | Cumulative PnL |
| `ai_signal_bot_uptime_seconds` | Gauge | Uptime in seconds |
| `trading_ws_reconnects_total` | Counter | Total WebSocket reconnections |

**Trading metrics (`trading_*`):**

| Metric | Type | Description |
|--------|------|-------------|
| `trading_signals_total` | Counter | Signals by symbol/direction |
| `trading_fills_total` | Counter | Order fills by exchange/symbol/side |
| `trading_orders_sent_total` | Counter | Orders sent by exchange/symbol/side/type |
| `trading_orders_rejected_total` | Counter | Orders rejected by exchange/reason |
| `trading_current_pnl` | Gauge | Current unrealized PnL (USD) |
| `trading_daily_pnl` | Gauge | Daily realized PnL (USD) |
| `trading_total_equity` | Gauge | Total account equity (USD) |
| `trading_drawdown_pct` | Gauge | Drawdown percentage from peak |
| `trading_open_positions` | Gauge | Number of open positions |
| `trading_signal_latency_seconds` | Histogram | Signal generation latency |
| `trading_order_latency_seconds` | Histogram | Order-to-fill latency by exchange |
| `trading_shm_round_trip_seconds` | Histogram | SHM signal-to-fill round-trip |

**Exchange Simulator metrics (`exchange_*`):**

| Metric | Type | Description |
|--------|------|-------------|
| `exchange_connected_clients` | Gauge | Connected WebSocket clients |
| `exchange_candle_count` | Counter | Total candles generated |
| `exchange_trading_active` | Gauge | Trading active (1=yes, 0=stopped) |
| `exchange_ws_connections_total` | Counter | Total WebSocket connections |
| `exchange_ws_disconnections_total` | Counter | Total WebSocket disconnections |
| `exchange_balance` | Gauge | Account balance by exchange |
| `exchange_equity` | Gauge | Account equity by exchange |
| `exchange_orders_submitted_total` | Counter | Orders submitted by exchange |
| `exchange_orders_filled_total` | Counter | Orders filled by exchange |
| `exchange_orders_rejected_total` | Counter | Orders rejected by exchange |
| `exchange_price` | Gauge | Current price by symbol |

### Running Prometheus

```bash
# Using Docker
docker run -d \
  -p 9090:9090 \
  -v $(pwd)/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $(pwd)/monitoring/alerts.yml:/etc/prometheus/alerts.yml \
  prom/prometheus

# Or via docker-compose
docker-compose up prometheus
```

---

## Grafana Dashboards

**Source:** `monitoring/grafana/dashboards/`

| Dashboard | File | Description |
|-----------|------|-------------|
| **System Overview** | `system-overview.json` | CPU, memory, connections, uptime |
| **Trading Overview** | `trading-overview.json` | Signals, fills, P&L, drawdown |
| **Trading Performance** | `trading-performance.json` | Sharpe, win rate, equity curve |
| **Latency Monitoring** | `latency-monitoring.json` | p50/p95/p99/p999 latency percentiles |
| **AI Signal Bot Metrics** | `ai_signal_bot_metrics.json` | Per-strategy signal quality |

### Data Source

**Source:** `monitoring/grafana/datasources/datasources.yml`

Prometheus data source auto-provisioned at `http://prometheus:9090`.

### Running Grafana

```bash
docker run -d \
  -p 3001:3000 \
  -v $(pwd)/monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards \
  -v $(pwd)/monitoring/grafana/datasources:/etc/grafana/provisioning/datasources \
  grafana/grafana
```

Access at `http://localhost:3001` (admin/admin).

---

## Alertmanager

### Alert Rules

**Source:** `monitoring/alerts.yml`

| Alert | Severity | Trigger | For |
|-------|----------|---------|-----|
| CircuitBreakerTripped | critical | breaker state == 1 | 10s |
| CircuitBreakerHalfOpen | warning | breaker state == 2 | 30s |
| HighSignalBlockRate | warning | blocked rate > 0.5/s | 2m |
| NoSignalsSent | warning | no signals in 5m | 5m |
| NoWsClients | critical | ws_clients == 0 | 1m |
| HighBotErrorRate | warning | error rate > 0.1/s | 5m |
| CriticalBotErrorRate | critical | error rate > 1.0/s | 2m |
| HighDrawdown | warning | drawdown > 8% | 5m |
| CriticalDrawdown | critical | drawdown > 15% | 2m |
| LowWinRate | warning | win rate < 0.4 | 30m |
| NegativePnL | warning | PnL < 0 | 10m |
| HighOrderRejectionRate | warning | rejection rate > 10% | 5m |
| LowFillRate | warning | fill rate < 80% | 10m |
| EquityDrop | warning | equity < 95% of balance | 5m |
| CandleGenerationStalled | critical | no new candles in 5m | 5m |
| TradingStopped | warning | trading_active == 0 | 1m |
| SignalBotDown | critical | up == 0 | 30s |
| ExchangeSimulatorDown | critical | up == 0 | 30s |
| HftBotDown | critical | up == 0 | 30s |
| HighWsReconnectionRate | warning | disconnections > 0.5/s | 5m |
| NoWsClientsConnected | warning | connected_clients == 0 | 2m |

### Notification Channels

**Source:** `monitoring/alertmanager/config.yml`

| Severity | Channels |
|----------|----------|
| Critical | Email (on-call) + Slack (#trading-critical) |
| Warning | Email + Slack (#trading-warnings) |
| Info | Email only |

**Alertmanager config** uses `${ENV_VAR}` placeholders — render with `envsubst` before passing to Alertmanager. Required env vars: `SMTP_SMARTHOST`, `SMTP_FROM`, `SMTP_AUTH_USERNAME`, `SMTP_AUTH_PASSWORD`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_ONCALL`, `SLACK_WEBHOOK_URL`, `SLACK_CHANNEL_CRITICAL`, `SLACK_CHANNEL_WARNING`.

### Running Alertmanager

```bash
docker run -d \
  -p 9093:9093 \
  -v $(pwd)/monitoring/alertmanager/config.yml:/etc/alertmanager/config.yml \
  prom/alertmanager
```

---

## Distributed Tracing

**Source:** `ai-signal-bot/src/observability/tracing.py`

OpenTelemetry integration with Jaeger export:

- **Service names:** `ai-signal-bot`, `exchange-simulator`
- **Export endpoint:** `http://jaeger:4317` (gRPC)
- **Trace propagation:** W3C TraceContext headers
- **Sampling:** Configurable (default: always sample)

```python
from src.observability.tracing import setup_tracing, get_tracer

setup_tracing(service_name="ai-signal-bot", endpoint="http://jaeger:4317")
tracer = get_tracer(__name__)

with tracer.start_as_current_span("generate_signals") as span:
    span.set_attribute("symbol", symbol)
    span.set_attribute("strategy", strategy_name)
```

### Running Jaeger

```bash
docker run -d -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one:latest
```

Access Jaeger UI at `http://localhost:16686`.

---

## Health Checks

### AI Signal Bot

**Source:** `ai-signal-bot/src/monitoring/health_server.py` + `ai-signal-bot/src/monitoring/metrics.py`

| Endpoint | Port | Purpose |
|----------|------|---------|
| `GET /health` | 8080 | Liveness — registered health checks (liveness + readiness) |
| `GET /metrics` | 9090 | Prometheus metrics scraping |
| `GET /health` | 9090 | Simple health (returns `{"status":"ok"}`) |

**HealthServer** (port 8080) registers checks via `HealthChecker`:

```python
from src.monitoring.health_server import HealthServer
from src.observability.health_checks import HealthChecker

health = HealthServer(port=8080)
health.register_check("liveness", health_checker.check_liveness)
health.register_check("readiness", health_checker.check_readiness)
await health.start()
```

**MetricsExporter** (port 9090) also serves `/health` for simpler probes.

### Exchange Simulator

**Source:** `exchange_simulator/websocket_server.py` (inline aiohttp server on port+10)

| Endpoint | Port | Purpose |
|----------|------|---------|
| `GET /health` | 8775 | Overall health (status, clients, trading_active) |
| `GET /live` | 8775 | Liveness probe (always 200 if process running) |
| `GET /ready` | 8775 | Readiness probe (200 if running + trading active, 503 otherwise) |
| `GET /metrics` | 8775 | Prometheus metrics scraping |

### Web UI

**Source:** `web-ui/nginx.conf`

| Endpoint | Port | Purpose |
|----------|------|---------|
| `GET /health` | 3000 | Static health check (returns `{"status":"ok"}`) |

### HFT Trade Bot

| Endpoint | Port | Purpose |
|----------|------|---------|
| `GET /health` | 9091 | C++ health server |

### Docker Compose Healthchecks

All services in `docker-compose.yml`, `docker-compose.prod.yml`, and `docker-compose.staging.yml`
use HTTP-based healthchecks (not TCP):

```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8775/health', timeout=5)"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

### Kubernetes Probes

Helm templates (`helm/templates/ai-signal-bot.yaml`, `helm/templates/exchange-simulator.yaml`)
use `httpGet` probes (not `tcpSocket`):

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 9090
  initialDelaySeconds: 15
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health
    port: 9090
  initialDelaySeconds: 10
  periodSeconds: 10
```

---

## Graceful Shutdown

Both the AI Signal Bot and Exchange Simulator handle SIGTERM/SIGINT for clean shutdown:

**AI Signal Bot** (`run.py:465-470`):
```python
def _signal_handler(signum, frame):
    logger.info("Received signal %s, initiating graceful shutdown...", signum)
    bot._running = False

signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)
```

**Exchange Simulator** (`exchange_simulator/__main__.py:133-136`):
```python
loop = asyncio.get_running_loop()
for sig in (signal.SIGTERM, signal.SIGINT):
    loop.add_signal_handler(sig, server._shutdown_event.set)
```

On SIGTERM, the bot:
1. Stops the main signal generation loop
2. Cancels background tasks (listen loop)
3. Stops SignalPublisher, MetricsExporter, HealthServer
4. Closes LLM engine and WebSocket connection
5. Shuts down tracing
6. Exits with code 0

---

## WebSocket Reconnection

**Source:** `ai-signal-bot/src/communication/ws_client.py`

The WebSocket client implements exponential backoff with jitter:

- Initial delay: 1.0s
- Max delay: 60.0s
- Jitter: `delay * (0.75 + random() * 0.5)` — range [75%, 125%] of base delay
- On `ConnectionClosed` or `OSError`: delay doubles (capped at 60s)
- On successful reconnect: delay resets to 1.0s
- Reconnect counter increments and notifies handler (e.g., `MetricsExporter.record_ws_reconnect`)

---

## eBPF Monitoring

**Source:** `monitoring/ebpf_monitor.py`

**Why eBPF?** Traditional monitoring uses application-level metrics, which miss
kernel-level events. eBPF (Extended Berkeley Packet Filter) runs sandboxed programs
in the Linux kernel with near-zero overhead, capturing system events that are
invisible to application-level monitoring.

**What it tracks:**

| Metric | Description | Why it matters |
|--------|-------------|----------------|
| Syscall latency | Time spent in kernel syscalls | Detects I/O bottlenecks |
| Network packet latency | Packet processing time | Detects network issues |
| CPU cache misses | L1/L2/L3 cache miss rate | Detects poor data locality |
| Memory allocations | Allocation rate and size | Detects memory pressure |
| Thread scheduling latency | Time waiting for CPU | Detects contention |
| File I/O latency | Disk read/write latency | Detects storage bottlenecks |

**Overhead:** <0.1% CPU — safe for production HFT systems.

```bash
# Run eBPF monitor (requires Linux with BPF support)
sudo python monitoring/ebpf_monitor.py --interval 5
```

---

## Structured Logging

**Source:** `ai-signal-bot/src/observability/logging.py`

**Why structured logging?** Plain text logs are hard to parse and search. Structured
logging (JSON format) enables:

- **Log aggregation** — ship to ELK, Loki, or Datadog
- **Correlation IDs** — trace a single request across services
- **Field-level search** — filter by `symbol`, `strategy`, `confidence`, etc.
- **Machine parsing** — automated alerting on log patterns

**Implementation:** Uses `structlog` with JSON renderer:

```json
{"event": "signal_generated", "symbol": "BTC/USDT", "direction": "LONG",
 "confidence": 78.5, "strategy": "trend_following", "timestamp": "2026-08-21T15:30:00Z",
 "correlation_id": "abc-123-def"}
```

Fallback to standard logging if `structlog` is not installed.

---

## Docker Compose

The full monitoring stack is in `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    volumes: ["./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml"]

  grafana:
    image: grafana/grafana
    ports: ["3001:3000"]
    volumes: ["./monitoring/grafana:/etc/grafana/provisioning"]

  alertmanager:
    image: prom/alertmanager
    ports: ["9093:9093"]
    volumes: ["./monitoring/alertmanager/config.yml:/etc/alertmanager/config.yml"]

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports: ["16686:16686", "4317:4317"]
```

Start the full stack:

```bash
docker-compose up -d prometheus grafana alertmanager jaeger
```

---

## Testing

| Test File | Coverage |
|-----------|----------|
| `monitoring/tests/test_metrics.py` | MetricsExporter, counter/gauge/histogram |
| `monitoring/tests/test_alerts.py` | Alert rule syntax, Alertmanager config |
| `ai-signal-bot/tests/unit/test_health_server.py` | Health endpoints, custom checks |

---

## See Also

- [Architecture](ARCHITECTURE.md) — Monitoring in system architecture
- [Deployment](DEPLOYMENT.md) — Docker Compose, Helm, Kubernetes

---

## Hands-On Guide (No Theory, Just Clicks)

> This section is for people who have never used Prometheus or Grafana before.
> Step-by-step: what to click, what to see, what it means.

### Step 1: Start Everything

```bash
# From project root:
docker compose up

# Or just monitoring (if app services are already running):
docker compose up prometheus grafana
```

After startup, you have 6 services:

| URL | What | Login |
|-----|------|-------|
| http://localhost:3000 | Web UI (trading dashboard) | — |
| http://localhost:3001 | **Grafana** (charts and graphs) | admin / admin |
| http://localhost:9099 | **Prometheus** (raw metrics) | — |
| http://localhost:8765 | Exchange Simulator | — |
| http://localhost:8766 | AI Signal Bot | — |
| http://localhost:9091 | HFT Trade Bot health | — |

### Step 2: Grafana — What to Look At

1. Open `http://localhost:3001` in your browser
2. Login: `admin`, password: `admin` (skip password change on first login)
3. Left sidebar → icon with 4 squares → **Dashboards**
4. You'll see **5 pre-loaded dashboards**:

**Trading Overview** (the main one):
- How many signals generated (signals_sent_total)
- How many blocked by circuit breaker
- How many WebSocket clients connected
- Bot uptime

**Latency Monitoring**:
- p50/p95/p99/p999 latency per component
- If C++ p99 > 1ms — something is wrong
- If Python p99 > 100ms — that's normal

**System Overview**:
- CPU usage, memory, active connections
- If memory keeps growing — memory leak

**Trading Performance**:
- PnL (profit/loss)
- Drawdown (how deep in the red)
- Win rate (% of profitable trades)

**AI Signal Bot Metrics**:
- Signals per strategy
- Circuit breaker state (0=ok, 1=stopped, 2=half-open)

### Step 3: Prometheus — Raw Metrics

1. Open `http://localhost:9099`
2. The search bar is a **PromQL** query input
3. Try these queries:

```promql
# Total signals sent:
ai_signal_bot_signals_sent_total

# Total signals blocked by circuit breaker:
ai_signal_bot_signals_blocked_total

# Current WebSocket clients:
ai_signal_bot_ws_clients_connected

# Bot uptime in seconds:
ai_signal_bot_uptime_seconds

# All AI Signal Bot metrics (see what's available):
{__name__=~"ai_signal_bot_.*"}
```

4. **Status → Targets** tab — shows which services are reachable:
   - `UP` = service responds on /metrics
   - `DOWN` = service is down or not started

### Step 4: What Each Metric Type Means

| Type | Meaning | Example |
|------|---------|---------|
| **Counter** | Only goes up (total count) | Signals sent: 1500 |
| **Gauge** | Goes up and down (current value) | WS clients right now: 3 |
| **Histogram** | Distribution (percentiles) | p99 latency = 500us |

### Step 5: Troubleshooting

**Prometheus shows DOWN for a target:**
```bash
# Check if the service responds:
curl http://localhost:8775/metrics    # Exchange Simulator
curl http://localhost:9090/metrics    # AI Signal Bot

# If empty — metrics endpoint is not running in that service
```

**Grafana shows no data:**
1. Check Prometheus targets (Status → Targets in Prometheus)
2. In Grafana: Configuration (gear icon) → Data Sources → Prometheus → Test
3. If Prometheus is not running — Grafana can't get data

**No dashboards in Grafana:**
1. Check that `monitoring/grafana/dashboards/` has `.json` files
2. Check that `dashboards.yml` exists in that folder
3. In Grafana: Dashboards → Import → Upload .json file manually

**Port 3001 already in use:**
```bash
# Find what's using port 3001:
netstat -ano | findstr :3001

# Or change the port in docker-compose.yml:
# ports: ["3002:3000"]  # Grafana on 3002 instead
```

### Step 6: Creating Your Own Dashboard

1. In Grafana → Dashboards → **New Dashboard**
2. Click **Add Panel**
3. In the query bar, type a PromQL query, e.g.:
   ```promql
   rate(ai_signal_bot_signals_sent_total[5m])
   ```
   This shows signals per second over the last 5 minutes.
4. Choose visualization type (Graph, Stat, Gauge, etc.)
5. Click **Apply** → **Save Dashboard**

### Quick Reference: PromQL Cheat Sheet

```promql
# Counter rate (per second over 5 min):
rate(metric_name[5m])

# Increase over 1 hour:
increase(metric_name[1h])

# Average over 10 min:
avg_over_time(metric_name[10m])

# p99 latency from histogram:
histogram_quantile(0.99, rate(metric_name_bucket[5m]))

# Filter by label:
metric_name{label="value"}
# Example:
ai_signal_bot_signals_sent_total{strategy="trend_following"}

# Sum across all labels:
sum(metric_name)

# Top 5 by value:
topk(5, metric_name)
```
