# Deployment Guide

This document provides comprehensive deployment instructions for the HFT Trading System with all new features from Phases 1-7.

## Theory: Deployment strategies and why different environments

### Dev / Staging / Prod — why three?

**Dev (Docker Compose):** Single-host, minimal resources. For
development and testing. Fast iteration. No redundancy.

**Staging (Docker Compose prod config):** Mirror of prod, but with
mock data. For integration testing before prod deploy.

**Prod (Kubernetes + Helm):** Multi-host, self-healing, rolling
updates. High availability. Resource limits per pod.

### Docker vs Kubernetes — when to use which?

**Docker Compose (dev):**
- Single host, simple, fast startup
- `docker-compose up` = everything works
- No self-healing, no auto-scaling
- Sufficient for development

**Kubernetes (prod):**
- Multi-host, fault-tolerant
- Pod crashes → auto-restart
- Node fails → pods rescheduled
- Rolling updates: zero-downtime deploy
- HPA: auto-scale based on CPU/memory
- Resource quotas: guaranteed resources per service

### Blue-green vs Rolling deployment

**Rolling (Kubernetes default):** Gradually replace old pods with
new. Zero downtime, but old + new versions coexist briefly.

**Blue-green:** Two identical environments (blue = current, green =
new). Switch traffic all at once. Instant rollback (switch back).
Requires 2x resources.

**For trading:** Rolling is simpler and sufficient. Blue-green is for
critical updates (e.g., strategy change) where old + new coexistence
is problematic (double signals).

### Infrastructure as Code

> Note: this repo no longer ships Terraform modules — the stack is
> stateless (SQLite inside the signal-bot container). The notes below
> are general guidance if you manage your own infra.

**Why IaC, not manual console?**
- **Reproducibility:** `terraform apply` = identical environment
- **Version control:** Infrastructure changes tracked in git
- **Rollback:** `git revert` + `terraform apply`

## Overview

The HFT Trading System consists of 4 main components:
- **Exchange Simulator** - Python-based simulated exchange with 49 symbols
- **AI Signal Bot** - Python-based AI signal generation
- **HFT Trade Bot** - C++20 high-frequency trading engine
- **Web UI** - React-based trading dashboard

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+ recommended) or Windows 10+
- **Python**: 3.12+
- **Node.js**: 22+
- **C++ Compiler**: GCC 13+ or Clang 17+ with C++20 support
- **Docker**: 20.10+ (for containerized deployment)
- **Docker Compose**: 2.0+
- **RAM**: 8GB minimum, 16GB recommended
- **CPU**: 4 cores minimum, 8 cores recommended
- **Disk**: 20GB free space

### Software Dependencies

**Python:**
```bash
pip install -r exchange_simulator/requirements.txt
pip install -r ai-signal-bot/requirements.txt
```

**Node.js:**
```bash
cd web-ui
npm install
```

**C++:**
```bash
cd hft-trade-bot
# Install build dependencies (Ubuntu)
sudo apt-get install cmake build-essential libspdlog-dev nlohmann-json3-dev libyaml-cpp-dev libboost-dev libssl-dev libwebsocketpp-dev libfmt-dev
```

## Deployment Options

### Option 1: Docker Deployment (Recommended)

Docker deployment provides isolation, reproducibility, and easy scaling.

#### 1. Build Docker Images

```bash
# Build all images
docker-compose build

# Or build individual components
docker-compose build exchange-simulator
docker-compose build ai-signal-bot
docker-compose build hft-trade-bot
docker-compose build web-ui
```

#### 2. Configure Environment

Create `.env` file in project root:

```bash
# Exchange Simulator
EXCHANGE_SIMULATOR_HOST=0.0.0.0
EXCHANGE_SIMULATOR_PORT=8765

# AI Signal Bot
AI_SIGNAL_BOT_HOST=0.0.0.0
AI_SIGNAL_BOT_PORT=8766

# Web UI
WEB_UI_PORT=3000

# Database
DATABASE_PATH=./data/trading.db

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
```

#### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

#### 4. Verify Deployment

```bash
# Check exchange simulator (health/metrics on port 8775)
curl http://localhost:8775/health
curl http://localhost:8775/live
curl http://localhost:8775/ready
curl http://localhost:8775/metrics

# Check AI signal bot (health on port 8080, metrics on port 9090)
curl http://localhost:8080/health
curl http://localhost:9090/health
curl http://localhost:9090/metrics

# Check HFT trade bot
curl http://localhost:9091/health

# Check web UI
curl http://localhost:3000/health

# Check Prometheus targets (all should be UP)
curl http://localhost:9099/api/v1/targets | jq '.data.activeTargets[].health'
```

### Option 2: Native Deployment

For development or production without Docker.

#### 1. Exchange Simulator

```bash
cd exchange_simulator

# Install dependencies
pip install -r requirements.txt

# Configure
cp config.yaml config.prod.yaml
# Edit config.prod.yaml with production settings

# Run
python -m exchange_simulator --config config.prod.yaml
```

#### 2. AI Signal Bot

```bash
cd ai-signal-bot

# Install dependencies
pip install -r requirements.txt

# Configure
cp config/settings.yaml config/settings.prod.yaml
# Edit settings.prod.yaml with production settings

# Run
python -m ai_signal_bot --config config/settings.prod.yaml
```

#### 3. HFT Trade Bot

```bash
cd hft-trade-bot

# Build
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Configure
cp ../config/config.yaml ../config/config.prod.yaml
# Edit config.prod.yaml with production settings

# Run
./hft_trade_bot --config ../config/config.prod.yaml
```

#### 4. Web UI

```bash
cd web-ui

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with production settings

# Build for production
npm run build

# Serve with nginx or similar
npm run preview
```

### Option 3: Kubernetes (Helm)

**Why Kubernetes?** For production deployments requiring auto-scaling, self-healing,
rolling updates, and centralized management across multiple nodes.

#### 1. Configure Helm Values

```bash
# Edit values for your environment
vi helm/values.yaml
```

Key values:

| Setting | Default | Description |
|---------|---------|-------------|
| `exchangeSimulator.enabled` | true | Enable exchange simulator |
| `aiSignalBot.enabled` | true | Enable AI signal bot |
| `hftTradeBot.enabled` | true | Enable HFT trade bot |
| `webUi.enabled` | true | Enable web UI |
| `prometheus.enabled` | true | Enable Prometheus |
| `grafana.enabled` | true | Enable Grafana |

#### 2. Deploy with Helm

```bash
# Install the chart
helm install hft ./helm

# Or with custom values
helm install hft ./helm -f my-values.yaml

# Upgrade
helm upgrade hft ./helm

# Uninstall
helm uninstall hft
```

#### 3. Verify Kubernetes Deployment

```bash
kubectl get pods
kubectl get services
kubectl logs -f deployment/hft-ai-signal-bot
```

#### 4. Health Probes

Helm templates configure `httpGet` liveness and readiness probes (not `tcpSocket`):

| Service | Probe | Path | Port |
|---------|-------|------|------|
| Exchange Simulator | liveness + readiness | `/health` | 8775 |
| AI Signal Bot | liveness | `/live` | 8080 |
| AI Signal Bot | readiness | `/ready` | 8080 |
| HFT Trade Bot | liveness + readiness | `/health` | 9091 |

Docker Compose healthchecks in all 3 compose files use HTTP endpoints:

| Service | Healthcheck | Start period |
|---------|-------------|--------------|
| Exchange Simulator | `http://localhost:8775/health` | 10s |
| AI Signal Bot | `http://localhost:8080/ready` | 15s |
| HFT Trade Bot | `http://localhost:9091/health` | 10s |
| Web UI | `http://localhost:3000/health` | 5s |
| Prometheus | `http://localhost:9090/-/healthy` | 10s |
| Alertmanager | `http://localhost:9093/-/healthy` | 10s |

#### 5. Graceful Shutdown

Both AI Signal Bot and Exchange Simulator handle SIGTERM for clean shutdown:
- **AI Signal Bot** (`run.py`): `signal.signal(SIGTERM, _signal_handler)` → stops main loop, cancels tasks, closes connections
- **Exchange Simulator** (`__main__.py`): `loop.add_signal_handler(SIGTERM, ...)` → sets shutdown event, closes WebSocket clients

Kubernetes sends SIGTERM with 30s grace period. Docker Compose sends SIGTERM with 10s timeout.

### Option 4: Terraform (AWS) — REMOVED

The `terraform/` directory (EKS + RDS PostgreSQL + ElastiCache modules) was
removed in the S109 cleanup: the stack is now fully stateless — the signal bot
persists to embedded SQLite (`data/trading.db`) and no external database or
cache is provisioned. For cloud deployment use Option 3 (Helm) against your own
cluster, or manage infra with your own IaC.

### Option 5: CI/CD Pipeline

GitHub Actions automates deployment on merge to main:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Push/PR | Lint, test, build, upload coverage |
| `deploy.yml` | Tag push | Build Docker images, push to registry, deploy Web UI to Netlify |
| `codeql.yml` | Schedule | Security analysis |

**How `deploy.yml` works end-to-end:**

1. Every `main`/`master` push builds the four services (`Dockerfile.prod`) and
   pushes `ghcr.io/ezpectus/hft-tradebot--lite-version/<service>:latest`.
2. A `v*.*.*` git tag additionally pushes semver tags (`v2.0.0` → `:2.0.0`)
   and runs the `deploy` job: it copies `docker-compose.prod.yml`, the
   monitoring/ and service config files, and `Makefile.prod` to
   `/opt/hft/` on `DEPLOY_HOST`, then runs
   `IMAGE_TAG=<tag> docker compose pull && up -d` — the `image:` refs in
   `docker-compose.prod.yml` resolve to the just-pushed ghcr images.
3. Web UI deploys to Netlify on the same trigger.

Server prerequisites (one-time): `docker login ghcr.io` if the package is not
public, and a real `/opt/hft/.env.prod` (see `.env.prod.example`) — the
workflow copies the example, not secrets.

`docker-compose.hub.yml` runs the same `:latest` ghcr images locally without
building — `docker compose -f docker-compose.hub.yml up`.

See `.github/workflows/` for workflow definitions.

## Configuration

### Production Configuration

**Exchange Simulator (`exchange_simulator/config.prod.yaml`):**
```yaml
# Enable production features
websocket:
  host: 0.0.0.0
  port: 8765

# Enable audit logging
audit:
  enabled: true
  max_memory_entries: 100000
  log_file_path: /var/log/hft/audit.log
  enable_file_logging: true
```

**AI Signal Bot (`ai-signal-bot/config/settings.prod.yaml`):**
```yaml
# Production trading settings
trading:
  max_open_positions: 50
  paper_trading: false  # Set to true for paper trading

# Risk management
risk:
  max_daily_drawdown_pct: 5.0
  max_risk_per_trade_pct: 1.0
```

**HFT Trade Bot (`hft-trade-bot/config/config.prod.yaml`):**
```yaml
# Production settings
trading:
  max_open_positions: 50
  paper_trading: false

# Performance tuning
latency_optimization:
  enable_thread_pinning: true
  enable_spinlocks: true
```

### Environment Variables

**Web UI (`.env`):**
```bash
VITE_WS_EXCHANGE=ws://your-server.com:8765
VITE_WS_SIGNALS=ws://your-server.com:8766
VITE_SIGNAL_TOKEN=            # optional — must match the bot's api.auth_token
```

**AI Signal Bot (`settings.yaml` / env):**
```bash
AI_BOT_AUTH_TOKEN=            # optional shared secret — enables WS handshake +
                              # Bearer auth on /health* (/live, /ready stay open)
AI_BOT_BIND_HOST=0.0.0.0      # WS bind host (127.0.0.1 for direct host runs)
```

## Monitoring

### Prometheus Metrics

All components expose Prometheus metrics:

**Exchange Simulator:** `http://localhost:8775/metrics` (+ `/health`, `/live`, `/ready`)
**AI Signal Bot:** `http://localhost:9090/metrics` (+ real health on `:8080/health`)
**HFT Trade Bot:** `http://localhost:9091/health` (+ metrics)

### Grafana Dashboards

Five provisioned dashboards load automatically from `monitoring/grafana/dashboards/`:
- `ai_signal_bot_metrics.json`
- `latency-monitoring.json`
- `system-overview.json`
- `trading-overview.json`
- `trading-performance.json`

### Key Metrics to Monitor

**Exchange Simulator:**
- Order submission rate
- Order fill rate
- WebSocket connection count
- Price update latency
- Audit log size

**AI Signal Bot:**
- Signal generation rate
- Signal confidence distribution
- Position count
- PnL
- Drawdown

**HFT Trade Bot:**
- Order execution latency
- Signal processing latency
- Position count
- Risk metrics
- System health

### Alerting

Configure alerts in `monitoring/alerts.yml`:

```yaml
groups:
  - name: ai-signal-bot
    rules:
      - alert: CircuitBreakerTripped
        expr: ai_signal_bot_circuit_breaker_state == 1
        for: 10s
        labels:
          severity: critical
          service: ai-signal-bot
        annotations:
          summary: "Circuit breaker is OPEN — signals blocked"
```

Firing alerts route to **Alertmanager** (`alerting:` in `prometheus.yml`,
config `monitoring/alertmanager.yml`) — grouped by severity/service; add a
receiver there for notifications.

## Health Checks

### Exchange Simulator

Health/metrics HTTP server runs on **port 8775** (the WS port 8765 does not
serve HTTP):

```bash
curl http://localhost:8775/health
```

Response:
```json
{
  "status": "healthy",
  "clients": 2,
  "trading_active": true
}
```

`/live` always returns `{"status":"alive"}`; `/ready` returns 200/503 based on
`trading_active`.

### AI Signal Bot

The real health server runs on **port 8080** (8766 is WebSocket-only):

```bash
curl http://localhost:8080/health    # aggregate: all registered checks
curl http://localhost:8080/ready     # 200/503 readiness
curl http://localhost:8080/live      # liveness
```

`/health` returns the `HealthChecker` aggregate — `{"healthy": bool, "checks":
{exchange, database, shm, ...}}` — with HTTP 200 or 503. Detail endpoints:
`/health/exchange`, `/health/database`, `/health/shm`.

### HFT Trade Bot

```bash
curl http://localhost:9091/health    # JSON: {"status":{...},"metrics":{...}}
curl http://localhost:9091/metrics   # Prometheus text exposition
```

`/health` returns 200 or 503 based on the bot's internal `HealthStatus`.

## Scaling

### Horizontal Scaling

**Exchange Simulator:**
- Deploy multiple instances behind a load balancer
- Use shared state (e.g., Redis — not shipped, requires new code) for order book synchronization
- Configure WebSocket sticky sessions

**AI Signal Bot:**
- Deploy multiple instances for different symbol groups
- Use shared database for signal coordination
- Configure signal deduplication

**HFT Trade Bot:**
- Deploy single instance per exchange (low latency requirement)
- Use SHM for inter-process communication
- Configure failover backup instances

### Vertical Scaling

**Increase resources:**
```yaml
# docker-compose.yml
services:
  exchange-simulator:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

## Security

### API Keys

Store API keys in environment variables or secret management:

```bash
# Never commit to git
export BINANCE_API_KEY="your_key"
export BINANCE_API_SECRET="your_secret"
```

### Network Security

- Use TLS/SSL for all external connections
- Configure firewall rules
- Use VPN for internal communication
- Enable rate limiting

### Audit Logging

Audit logs are enabled by default. Configure retention:

```yaml
audit:
  enabled: true
  log_file_path: /var/log/hft/audit.log
  max_memory_entries: 100000
  retention_days: 90
```

## Backup and Recovery

### Database Backup

```bash
# Backup SQLite database
cp data/trading.db backup/trading_$(date +%Y%m%d).db

# Automated backup
0 2 * * * cp data/trading.db backup/trading_$(date +\%Y\%m\%d).db
```

### Configuration Backup

```bash
# Backup all configs
tar -czf backup/config_$(date +%Y%m%d).tar.gz \
  shared_config.yaml \
  exchange_simulator/config.yaml \
  ai-signal-bot/config/settings.yaml \
  hft-trade-bot/config/config.yaml
```

### Audit Log Backup

```bash
# Rotate audit logs
mv logs/audit.log logs/audit_$(date +%Y%m%d).log
```

## Rollback Procedures

### Quick Rollback

```bash
# Stop current deployment
docker-compose down

# Restore previous version
git checkout <previous-tag>
docker-compose up -d
```

### Database Rollback

```bash
# Stop services
docker-compose down

# Restore database
cp backup/trading_YYYYMMDD.db data/trading.db

# Restart services
docker-compose up -d
```

### Configuration Rollback

```bash
# Restore previous config
cp backup/config_YYYYMMDD.tar.gz .
tar -xzf config_YYYYMMDD.tar.gz

# Restart services
docker-compose restart
```

## Troubleshooting

### Common Issues

**High Latency:**
- Check system resources (CPU, memory)
- Verify network connectivity
- Review audit logs for bottlenecks
- Check rate limiting settings

**Connection Issues:**
- Verify WebSocket endpoints
- Check firewall rules
- Review service logs
- Test with `curl` or `wscat`

**Memory Issues:**
- Increase memory limits
- Check for memory leaks
- Review audit log size
- Optimize symbol count

### Log Locations

**Exchange Simulator:** `logs/exchange_simulator.log`
**AI Signal Bot:** `logs/ai_signal_bot.log`
**HFT Trade Bot:** `logs/hft_trade_bot.log`
**Web UI:** Browser console
**Audit Logs:** `logs/audit.log`

### Getting Help

- Check documentation in `docs/`
- Review GitHub issues
- Check audit logs for errors
- Enable debug logging for detailed information

## Performance Tuning

### Exchange Simulator

```yaml
# Increase WebSocket buffer size
websocket:
  buffer_size: 65536

# Optimize order book depth
market:
  order_book_depth: 10  # Reduce from 20
```

### HFT Trade Bot

```yaml
# Enable thread pinning
latency_optimization:
  enable_thread_pinning: true
  enable_spinlocks: true

# Optimize SHM
shm:
  ring_buffer_size: 8192  # Increase from 4096
```

## References

- [Architecture Documentation](ARCHITECTURE.md)
- [Configuration Guide](guides/CONFIGURATION_GUIDE.md)
- [Quick Start Guide](guides/QUICK_START.md)
- [Docker Compose Configuration](../docker-compose.yml)
- [Monitoring Configuration](../monitoring/prometheus.yml)
