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

### Infrastructure as Code (Terraform)

**Why IaC, not manual AWS console?**
- **Reproducibility:** `terraform apply` = identical environment
- **Version control:** Infrastructure changes tracked in git
- **DRY:** Modules (EKS, RDS, ElastiCache) reused across envs
- **Rollback:** `git revert` + `terraform apply`

## Overview

The HFT Trading System consists of 4 main components:
- **Exchange Simulator** - Python-based simulated exchange with 50+ symbols
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
# Check exchange simulator
curl http://localhost:8765/health

# Check AI signal bot
curl http://localhost:8766/health

# Check web UI
curl http://localhost:3000
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
| `postgresql.enabled` | true | Enable PostgreSQL (prod) |
| `redis.enabled` | true | Enable Redis (feature store) |
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

### Option 4: Terraform (AWS)

**Why Terraform?** Provisions cloud infrastructure (EKS, RDS, ElastiCache) as code,
enabling reproducible, version-controlled infrastructure.

#### 1. Initialize Terraform

```bash
cd terraform/environments/dev
terraform init
```

#### 2. Review the Plan

```bash
terraform plan
```

Resources provisioned:

| Resource | Type | Purpose |
|----------|------|---------|
| EKS Cluster | `aws_eks_cluster` | Kubernetes cluster for containers |
| EKS Node Group | `aws_eks_node_group` | Worker nodes |
| RDS PostgreSQL | `aws_db_instance` | Production database |
| ElastiCache Redis | `aws_elasticache_cluster` | ML feature store, cache |
| S3 Bucket | `aws_s3_bucket` | Backup storage |
| IAM Roles | `aws_iam_role` | Service permissions |

#### 3. Apply

```bash
terraform apply
```

#### 4. Configure kubectl

```bash
aws eks update-kubeconfig --name hft-dev-cluster
kubectl get nodes
```

#### 5. Deploy Application

```bash
helm install hft ./helm
```

### Option 5: CI/CD Pipeline

GitHub Actions automates deployment on merge to main:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Push/PR | Lint, test, build, upload coverage |
| `deploy.yml` | Tag push | Build Docker images, push to registry, deploy Web UI to Netlify |
| `codeql.yml` | Schedule | Security analysis |

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

# Enable price feed
price_feed:
  enabled: true
  hybrid_mode: true
  apis:
    binance:
      enabled: true
      priority: 1
      rate_limit: 1200
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
VITE_ENABLE_ADVANCED_ORDERS=true
VITE_ENABLE_AUDIT_LOGS=true
VITE_ENABLE_EXCHANGE_CLONES=true
VITE_ENABLE_SYMBOL_SEARCH=true
```

## Monitoring

### Prometheus Metrics

All components expose Prometheus metrics:

**Exchange Simulator:** `http://localhost:8765/health` (health check)
**AI Signal Bot:** `http://localhost:8766/health` (health check)
**HFT Trade Bot:** `http://localhost:9091/health` (health check)

### Grafana Dashboards

Import the provided Grafana dashboards:
- `monitoring/grafana/dashboards/exchange-simulator.json`
- `monitoring/grafana/dashboards/ai-signal-bot.json`
- `monitoring/grafana/dashboards/hft-trade-bot.json`

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
  - name: hft_alerts
    rules:
      - alert: HighLatency
        expr: hft_order_latency_ms > 50
        for: 5m
        annotations:
          summary: "High order latency detected"
      
      - alert: HighDrawdown
        expr: hft_drawdown_pct > 5
        for: 1m
        annotations:
          summary: "High drawdown detected"
```

## Health Checks

### Exchange Simulator

```bash
curl http://localhost:8765/health
```

Response:
```json
{
  "status": "healthy",
  "version": "2.2.0",
  "uptime": 3600,
  "connections": 5,
  "symbols": 50
}
```

### AI Signal Bot

```bash
curl http://localhost:8766/health
```

Response:
```json
{
  "status": "healthy",
  "version": "2.2.0",
  "uptime": 3600,
  "signals_generated": 150,
  "active_positions": 3
}
```

### HFT Trade Bot

```bash
curl http://localhost:9091/health
```

Response:
```bash
HFT Trade Bot v2.0.0 - Healthy
Uptime: 3600s
Active Positions: 3
Orders Processed: 150
```

## Scaling

### Horizontal Scaling

**Exchange Simulator:**
- Deploy multiple instances behind a load balancer
- Use shared state (Redis) for order book synchronization
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

# Enable caching
price_feed:
  cache_ttl: 10  # Increase from 5
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
- [Configuration Reference](CONFIGURATION_REFERENCE.md)
- [Setup Guide](SETUP.md)
- [Docker Compose Configuration](../docker-compose.yml)
- [Monitoring Configuration](../monitoring/prometheus.yml)
