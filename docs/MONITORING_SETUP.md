# Monitoring Setup Guide

This document provides comprehensive instructions for setting up monitoring for the HFT Trading System.

## Overview

The HFT Trading System uses Prometheus for metrics collection and Grafana for visualization. All components expose Prometheus metrics endpoints for monitoring system health, performance, and trading activity.

## Components

- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and alerting
- **Node Exporter** - System-level metrics (CPU, memory, disk)
- **cAdvisor** - Container metrics (for Docker deployments)

## Quick Start

### Docker Deployment

The easiest way to set up monitoring is using Docker Compose with the provided monitoring stack.

```bash
# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Access Grafana
# URL: http://localhost:3001
# Default credentials: admin/admin
```

### Manual Installation

#### 1. Install Prometheus

**Ubuntu/Debian:**
```bash
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64
sudo cp prometheus promtool /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus
```

**Configuration (`/etc/prometheus/prometheus.yml`):**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'exchange-simulator'
    static_configs:
      - targets: ['localhost:8775']
  
  - job_name: 'ai-signal-bot'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'hft-trade-bot'
    static_configs:
      - targets: ['localhost:9091']
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
```

**Start Prometheus:**
```bash
sudo prometheus --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --web.console.templates=/etc/prometheus/consoles \
  --web.console.libraries=/etc/prometheus/console_libraries
```

#### 2. Install Grafana

**Ubuntu/Debian:**
```bash
wget https://dl.grafana.com/oss/release/grafana_10.2.0_amd64.deb
sudo dpkg -i grafana_10.2.0_amd64.deb
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

**Access Grafana:**
- URL: http://localhost:3000
- Default credentials: admin/admin

#### 3. Add Prometheus Data Source

1. Navigate to Configuration → Data Sources
2. Click "Add data source"
3. Select "Prometheus"
4. Set URL to `http://localhost:9090`
5. Click "Save & Test"

#### 4. Import Dashboards

Import the provided dashboards from `monitoring/grafana/dashboards/`:

- `exchange-simulator.json` - Exchange simulator metrics
- `ai-signal-bot.json` - AI signal bot metrics
- `hft-trade-bot.json` - HFT trade bot metrics
- `system-overview.json` - System-wide overview

## Metrics Reference

### Exchange Simulator Metrics

**Trading Metrics:**
- `hft_orders_submitted_total` - Total orders submitted
- `hft_orders_filled_total` - Total orders filled
- `hft_orders_rejected_total` - Total orders rejected
- `hft_order_fill_rate` - Order fill rate (0-1)
- `hft_order_latency_ms` - Order processing latency

**WebSocket Metrics:**
- `hft_websocket_connections` - Active WebSocket connections
- `hft_websocket_messages_sent_total` - Total messages sent
- `hft_websocket_messages_received_total` - Total messages received

**Price Feed Metrics:**
- `hft_price_updates_total` - Total price updates
- `hft_price_update_latency_ms` - Price update latency
- `hft_api_failures_total` - API failures by provider

**Audit Log Metrics:**
- `hft_audit_log_entries_total` - Total audit log entries
- `hft_audit_log_size_bytes` - Audit log size in bytes

### AI Signal Bot Metrics

**Signal Metrics:**
- `hft_signals_generated_total` - Total signals generated
- `hft_signal_confidence` - Signal confidence distribution
- `hft_signal_regime` - Current market regime

**Position Metrics:**
- `hft_positions_open` - Number of open positions
- `hft_positions_closed_total` - Total positions closed
- `hft_position_pnl` - Position PnL

**Risk Metrics:**
- `hft_drawdown_pct` - Current drawdown percentage
- `hft_daily_loss_pct` - Daily loss percentage
- `hft_risk_limit_breaches_total` - Risk limit breaches

### HFT Trade Bot Metrics

**Execution Metrics:**
- `hft_orders_executed_total` - Total orders executed
- `hft_execution_latency_ms` - Order execution latency
- `hft_fill_rate` - Order fill rate

**Signal Processing Metrics:**
- `hft_signals_processed_total` - Total signals processed
- `hft_signal_processing_latency_ms` - Signal processing latency

**System Metrics:**
- `hft_cpu_usage_pct` - CPU usage percentage
- `hft_memory_usage_bytes` - Memory usage in bytes
- `hft_shm_buffer_usage_pct` - SHM buffer usage percentage

## Alerting

### Configure Alertmanager

**Installation:**
```bash
wget https://github.com/prometheus/alertmanager/releases/download/v0.26.0/alertmanager-0.26.0.linux-amd64.tar.gz
tar xvfz alertmanager-0.26.0.linux-amd64.tar.gz
sudo cp alertmanager-0.26.0.linux-amd64/alertmanager /usr/local/bin/
sudo mkdir -p /etc/alertmanager
```

**Configuration (`/etc/alertmanager/alertmanager.yml`):**
```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:5001/'
```

**Add to Prometheus:**
```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

### Alert Rules

**File: `/etc/prometheus/alerts.yml`**
```yaml
groups:
  - name: hft_alerts
    interval: 30s
    rules:
      # Latency Alerts
      - alert: HighOrderLatency
        expr: hft_order_latency_ms > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High order latency detected"
          description: "Order latency is {{ $value }}ms for 5 minutes"
      
      - alert: CriticalOrderLatency
        expr: hft_order_latency_ms > 100
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical order latency detected"
          description: "Order latency is {{ $value }}ms for 1 minute"
      
      # Drawdown Alerts
      - alert: HighDrawdown
        expr: hft_drawdown_pct > 5
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "High drawdown detected"
          description: "Drawdown is {{ $value }}%"
      
      - alert: CriticalDrawdown
        expr: hft_drawdown_pct > 10
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Critical drawdown detected"
          description: "Drawdown is {{ $value }}%"
      
      # Connection Alerts
      - alert: LowWebSocketConnections
        expr: hft_websocket_connections < 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "No WebSocket connections"
          description: "WebSocket connections dropped to {{ $value }}"
      
      # API Alerts
      - alert: HighAPIFailureRate
        expr: rate(hft_api_failures_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API failure rate"
          description: "API failure rate is {{ $value }}/sec"
      
      # System Alerts
      - alert: HighCPUUsage
        expr: hft_cpu_usage_pct > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}%"
      
      - alert: HighMemoryUsage
        expr: hft_memory_usage_bytes / 1024 / 1024 / 1024 > 8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}GB"
```

**Load Alert Rules:**
```bash
promtool check config /etc/prometheus/prometheus.yml
```

## Dashboard Customization

### Creating Custom Dashboards

1. Navigate to Dashboards → Create → New Dashboard
2. Add panels with queries
3. Configure visualization
4. Save dashboard

### Example Queries

**Order Fill Rate:**
```promql
rate(hft_orders_filled_total[5m]) / rate(hft_orders_submitted_total[5m])
```

**Average Order Latency:**
```promql
avg(hft_order_latency_ms)
```

**Signal Confidence Distribution:**
```promql
histogram_quantile(0.95, hft_signal_confidence)
```

**Drawdown Over Time:**
```promql
hft_drawdown_pct
```

## Log Aggregation

### Loki Setup

**Docker Compose:**
```yaml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yaml
  
  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./promtail-config.yml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
```

**Add Loki to Grafana:**
1. Configuration → Data Sources → Add data source
2. Select "Loki"
3. Set URL to `http://localhost:3100`
4. Click "Save & Test"

## Performance Monitoring

### Key Performance Indicators

**Latency:**
- Order submission latency: < 50ms
- Price update latency: < 10ms
- Signal processing latency: < 5ms

**Throughput:**
- Orders per second: > 100
- Price updates per second: > 1000
- Signals per minute: > 10

**Availability:**
- Uptime: > 99.9%
- WebSocket connection success rate: > 99%
- API success rate: > 99%

### Performance Tuning

**Prometheus:**
```yaml
# Increase retention
global:
  external_labels:
    monitor: 'hft-monitor'
  scrape_interval: 15s
  evaluation_interval: 15s

# Configure storage
storage:
  tsdb:
    retention.time: 30d
```

**Grafana:**
```ini
[database]
# Increase retention
log_retention_days = 30
```

## Troubleshooting

### Metrics Not Appearing

**Check Prometheus Targets:**
```bash
curl http://localhost:9090/api/v1/targets
```

**Check Component Health:**
```bash
curl http://localhost:8775/metrics  # Exchange simulator
curl http://localhost:9090/metrics  # AI signal bot
curl http://localhost:9091/metrics  # HFT trade bot
```

### Alerts Not Firing

**Check Alertmanager:**
```bash
curl http://localhost:9093/api/v1/alerts
```

**Check Prometheus Alerts:**
```bash
curl http://localhost:9090/api/v1/alerts
```

### High Memory Usage

**Reduce Metrics Retention:**
```yaml
storage:
  tsdb:
    retention.time: 7d
```

**Reduce Scrape Interval:**
```yaml
scrape_configs:
  - job_name: 'exchange-simulator'
    scrape_interval: 30s
```

## Security

### Authentication

**Prometheus Basic Auth:**
```yaml
global:
  external_labels:
    monitor: 'hft-monitor'

# Add basic auth
basic_auth_users:
  admin: $2b$12$...
```

**Grafana Authentication:**
```ini
[auth]
# Enable LDAP
auth.proxy = true
auth.proxy.header_name = X-WEBAUTH-USER
```

### TLS/SSL

**Enable HTTPS:**
```yaml
global:
  tls_config:
    cert_file: /etc/prometheus/certs/server.crt
    key_file: /etc/prometheus/certs/server.key
```

## Backup and Recovery

### Prometheus Backup

```bash
# Backup data
tar -czf prometheus-backup-$(date +%Y%m%d).tar.gz /var/lib/prometheus

# Automated backup
0 2 * * * tar -czf /backup/prometheus-$(date +\%Y\%m\%d).tar.gz /var/lib/prometheus
```

### Grafana Backup

```bash
# Backup database
cp /var/lib/grafana/grafana.db /backup/grafana-$(date +%Y%m%d).db

# Backup dashboards
grafana-cli admin export-dashboard > /backup/dashboards-$(date +%Y%m%d).json
```

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
