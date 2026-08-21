# Monitoring Guide

Guide to the monitoring and observability stack: Prometheus, Grafana, Alertmanager, distributed tracing, and health checks.

---

## Overview

The system provides full observability through:

- **Prometheus** — metrics scraping (counters, histograms, gauges)
- **Grafana** — 5 pre-built dashboards for real-time visualization
- **Alertmanager** — alert routing to email, Slack, Discord
- **OpenTelemetry** — distributed tracing with Jaeger export
- **Health checks** — HTTP endpoints for Kubernetes liveness/readiness

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

**Source:** `ai-signal-bot/src/monitoring/metrics.py`

| Metric | Type | Description |
|--------|------|-------------|
| `ai_signal_bot_signals_generated_total` | Counter | Total signals by strategy |
| `ai_signal_bot_signal_generation_latency_seconds` | Histogram | Signal generation latency |
| `ai_signal_bot_fills_total` | Counter | Order fills by symbol |
| `ai_signal_bot_pnl_current` | Gauge | Current P&L |
| `ai_signal_bot_drawdown_current` | Gauge | Current drawdown |
| `exchange_simulator_order_latency_seconds` | Histogram | Order processing latency |
| `exchange_simulator_orders_total` | Counter | Total orders processed |
| `exchange_simulator_active_connections` | Gauge | Active WebSocket connections |

### Running Prometheus

```bash
# Using Docker
docker run -d \
  -p 9090:9090 \
  -v $(pwd)/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $(pwd)/monitoring/alerts/alerts.yml:/etc/prometheus/alerts.yml \
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

**Source:** `monitoring/alerts/alerts.yml`

| Alert | Severity | Trigger | For |
|-------|----------|---------|-----|
| HighSignalGenerationLatency | warning | p99 > 100ms | 5m |
| CriticalSignalGenerationLatency | critical | p99 > 1s | 2m |
| HighOrderProcessingLatency | warning | p99 > 50ms | 5m |
| CriticalOrderProcessingLatency | critical | p99 > 500ms | 2m |
| HighDrawdown | warning | drawdown > 5% | 1m |
| CriticalDrawdown | critical | drawdown > 8% | 30s |
| HighErrorRate | warning | error rate > 5% | 5m |
| CriticalErrorRate | critical | error rate > 10% | 1m |
| ConnectionFailures | warning | failed connections > 10 | 2m |
| HighMemoryUsage | warning | memory > 80% | 5m |

### Notification Channels

**Source:** `monitoring/alertmanager/config.yml`

| Severity | Channels |
|----------|----------|
| Critical | Email + Slack + Discord |
| Warning | Slack + Email |
| Info | Slack |

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

**Source:** `ai-signal-bot/src/monitoring/health_server.py`

HTTP health endpoints for Kubernetes probes:

| Endpoint | Purpose | Check |
|----------|---------|-------|
| `GET /health` | Overall health | All subsystems |
| `GET /health/exchange` | Exchange connectivity | WebSocket connection alive |
| `GET /health/database` | Database connection | SQLite/PostgreSQL reachable |
| `GET /health/shm` | SHM IPC status | Shared memory segments active |

```python
from src.monitoring.health_server import HealthServer

health = HealthServer(port=8080)
await health.start()
# Registers custom checks:
health.register_check("exchange", check_exchange_connection)
health.register_check("database", check_db_connection)
```

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
