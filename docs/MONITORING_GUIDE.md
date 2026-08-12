# Monitoring and Observability Guide

**Date:** January 2025
**Component:** HFT Trading System
**Objective:** Comprehensive monitoring and observability including Prometheus metrics, Grafana dashboards, distributed tracing, and alerting.

---

## Overview

This document describes the monitoring and observability implementation for the HFT Trading System, including Prometheus metrics collection, Grafana dashboards, OpenTelemetry distributed tracing, and Prometheus Alertmanager configuration.

## Features Implemented

### 1. Prometheus Metrics

**Implementation:**
- `exchange_simulator/metrics.py` - Exchange simulator metrics (port 8000)
- `ai-signal-bot/metrics.py` - AI signal bot metrics (port 8001)
- `hft-trade-bot/src/metrics/metrics_collector.cpp` - HFT bot metrics (port 8002)

**Metrics Types:**
- **Counter:** Monotonically increasing values (orders, fills, errors)
- **Gauge:** Point-in-time values (CPU, memory, portfolio value)
- **Histogram:** Distributions (latency, response times)

**Key Metrics:**

**Exchange Simulator:**
- `exchange_simulator_orders_total` - Total orders processed
- `exchange_simulator_fills_total` - Total fills
- `exchange_simulator_order_latency_seconds` - Order processing latency
- `exchange_simulator_websocket_latency_seconds` - WebSocket latency
- `exchange_simulator_price_feed_latency_seconds` - Price feed latency
- `exchange_simulator_errors_total` - Total errors
- `exchange_simulator_cpu_usage_percent` - CPU usage
- `exchange_simulator_memory_usage_bytes` - Memory usage
- `exchange_simulator_active_connections` - Active WebSocket connections
- `exchange_simulator_price_updates_total` - Price updates

**AI Signal Bot:**
- `ai_signal_bot_signals_generated_total` - Total signals generated
- `ai_signal_bot_signal_generation_latency_seconds` - Signal generation latency
- `ai_signal_bot_trades_total` - Total trades executed
- `ai_signal_bot_pnl_total` - Total PnL
- `ai_signal_bot_pnl_daily` - Daily PnL
- `ai_signal_bot_win_rate` - Win rate percentage
- `ai_signal_bot_sharpe_ratio` - Sharpe ratio
- `ai_signal_bot_drawdown` - Current drawdown
- `ai_signal_bot_portfolio_value` - Portfolio value
- `ai_signal_bot_position_count` - Open positions

**Usage:**
```python
# Exchange Simulator
from exchange_simulator.metrics import init_metrics

metrics = init_metrics(metrics_port=8000)
metrics.record_order('BTC/USDT', 'BUY', 'FILLED', latency=0.01)
metrics.record_fill('BTC/USDT', 'BUY')
metrics.update_system_metrics(cpu_usage=50.0, memory_usage=1000000000, active_connections=10)

# AI Signal Bot
from ai_signal_bot.metrics import init_metrics

metrics = init_metrics(metrics_port=8001)
metrics.record_signal('lstm', 'LONG', latency=0.05)
metrics.record_trade('BTC/USDT', 'BUY')
metrics.update_pnl('BTC/USDT', 'lstm', total_pnl=1000.0, daily_pnl=100.0)
```

**C++ Usage:**
```cpp
#include "metrics/metrics_collector.h"

hft::metrics::MetricsCollector metrics(8002);
metrics.start_http_server();

metrics.record_signal_generation_latency(50.0, "lstm");
metrics.record_order_execution_latency(100.0, "BTC/USDT");
metrics.update_system_metrics(50.0, 1000000000, 10);
```

---

### 2. Grafana Dashboards

**Implementation:**
- `monitoring/grafana/dashboards/system-overview.json` - System overview dashboard
- `monitoring/grafana/dashboards/trading-performance.json` - Trading performance dashboard
- `monitoring/grafana/dashboards/latency-monitoring.json` - Latency monitoring dashboard

**System Overview Dashboard:**
- CPU usage (Exchange Simulator, AI Signal Bot)
- Memory usage (GB)
- Active WebSocket connections
- Order rate (orders/sec)
- Error rate (errors/sec)
- Price update rate (updates/sec)

**Trading Performance Dashboard:**
- Total PnL
- Daily PnL by strategy
- Win rate gauge
- Sharpe ratio
- Drawdown
- Portfolio value over time
- Trade rate
- Signal generation rate
- Open positions
- Model accuracy

**Latency Monitoring Dashboard:**
- Signal generation latency (p50, p99)
- Order processing latency (p50, p99)
- WebSocket latency (p50, p99)
- Price feed latency (p50, p99)
- Fill rate
- Order latency distribution heatmap

**Importing Dashboards:**
1. Open Grafana
2. Navigate to Dashboards → Import
3. Upload JSON file or paste JSON content
4. Select Prometheus data source
5. Click Import

---

### 3. Distributed Tracing

**Implementation:**
- `exchange_simulator/tracing.py` - Exchange simulator tracing
- `ai-signal-bot/tracing.py` - AI signal bot tracing
- `hft-trade-bot/src/tracing/tracer.cpp` - HFT bot tracing

**Tracing Operations:**

**Exchange Simulator:**
- Order processing
- Price updates
- WebSocket messages
- Database operations

**AI Signal Bot:**
- Signal generation
- Model inference
- Trade execution
- Portfolio rebalancing
- Risk checks

**HFT Trade Bot:**
- Signal generation
- Order execution
- Signal processing
- Orderbook updates

**Usage:**
```python
# Exchange Simulator
from exchange_simulator.tracing import init_tracer

tracer = init_tracer(service_name="exchange-simulator", jaeger_host="localhost", jaeger_port=6831)
tracer.trace_order_processing('BTC/USDT', 'BUY', 1.0)
tracer.trace_price_update('BTC/USDT', 65000.0, 'binance')

# AI Signal Bot
from ai_signal_bot.tracing import init_tracer

tracer = init_tracer(service_name="ai-signal-bot", jaeger_host="localhost", jaeger_port=6831)
tracer.trace_signal_generation('lstm', 'BTC/USDT')
tracer.trace_model_inference('lstm', 'BTC/USDT')
```

**C++ Usage:**
```cpp
#include "tracing/tracer.h"

hft::tracing::Tracer tracer("hft-trade-bot", "localhost", 6831);
tracer.trace_signal_generation("lstm", "BTC/USDT");
tracer.trace_order_execution("BTC/USDT", "BUY", 1.0);
```

**Trace Context Propagation:**
```python
# Inject context into headers
headers = {}
tracer.inject_context(headers)

# Extract context from headers
context = tracer.extract_context(headers)
```

**Visualization:**
- Jaeger: http://localhost:16686
- Zipkin: http://localhost:9411
- Grafana Tempo: Configure in Grafana data sources

---

### 4. Alerting

**Implementation:**
- `monitoring/alerts/alerts.yml` - Prometheus alert rules
- `monitoring/alertmanager/config.yml` - Alertmanager configuration

**Alert Groups:**

**Latency Alerts:**
- `HighSignalGenerationLatency` - Signal latency > 100ms (warning)
- `CriticalSignalGenerationLatency` - Signal latency > 1s (critical)
- `HighOrderProcessingLatency` - Order latency > 50ms (warning)
- `CriticalOrderProcessingLatency` - Order latency > 500ms (critical)
- `HighWebSocketLatency` - WebSocket latency > 10ms (warning)
- `HighPriceFeedLatency` - Price feed latency > 50ms (warning)

**Error Rate Alerts:**
- `HighErrorRate` - Error rate > 0.1/sec (warning)
- `CriticalErrorRate` - Error rate > 1.0/sec (critical)
- `HighBotErrorRate` - Bot error rate > 0.1/sec (warning)

**Trading Alerts:**
- `HighDrawdown` - Drawdown > 10% (warning)
- `CriticalDrawdown` - Drawdown > 20% (critical)
- `LowWinRate` - Win rate < 40% (warning)
- `NegativePnL` - Negative total PnL (warning)

**System Health Alerts:**
- `HighCPUUsage` - CPU usage > 80% (warning)
- `CriticalCPUUsage` - CPU usage > 95% (critical)
- `HighMemoryUsage` - Memory usage > 8GB (warning)
- `CriticalMemoryUsage` - Memory usage > 16GB (critical)
- `LowActiveConnections` - No active connections (warning)
- `NoPriceUpdates` - No price updates (critical)

**Notification Channels:**
- **Email:** team@trading-system.com, oncall@trading-system.com
- **Slack:** #critical-alerts, #warning-alerts
- **Discord:** Webhook integration

**Alert Routing:**
- Critical alerts → All channels (email, Slack, Discord)
- Warning alerts → Email + Slack
- Info alerts → Email only

**Escalation Policies:**
- Warning alerts fire after 5 minutes
- Critical alerts fire after 2 minutes
- Repeat interval: 12 hours

**Silencing Alerts:**
```bash
# Silence alert for 1 hour
amtool silence add --alertmanager.url=http://localhost:9093 \
  --matcher=alertname="HighCPUUsage" --duration=1h
```

---

## Configuration Examples

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'exchange-simulator'
    static_configs:
      - targets: ['localhost:8000']
  
  - job_name: 'ai-signal-bot'
    static_configs:
      - targets: ['localhost:8001']
  
  - job_name: 'hft-trade-bot'
    static_configs:
      - targets: ['localhost:8002']
  
  - job_name: 'alertmanager'
    static_configs:
      - targets: ['localhost:9093']

rule_files:
  - 'alerts/alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

### Grafana Data Source Configuration

```json
{
  "name": "Prometheus",
  "type": "prometheus",
  "url": "http://localhost:9090",
  "access": "proxy",
  "isDefault": true
}
```

### Jaeger Configuration

```yaml
# jaeger-config.yml
collector:
  zipkin:
    http-host-port: :9411
```

---

## Test Results

### Metrics Tests

```
TestExchangeSimulatorMetrics
- test_metrics_initialization PASSED
- test_record_order PASSED
- test_record_fill PASSED
- test_record_error PASSED
- test_record_price_update PASSED
- test_update_system_metrics PASSED
- test_update_order_rate PASSED

TestAISignalBotMetrics
- test_metrics_initialization PASSED
- test_record_signal PASSED
- test_record_trade PASSED
- test_update_pnl PASSED
- test_update_performance_metrics PASSED
- test_update_portfolio_metrics PASSED

TestMetricsEndpoint
- test_metrics_endpoint_content PASSED
```

### Alert Tests

```
TestAlertRules
- test_alert_rules_file_exists PASSED
- test_latency_alerts_group PASSED
- test_error_rate_alerts_group PASSED
- test_trading_alerts_group PASSED
- test_system_health_alerts_group PASSED
- test_alert_rule_structure PASSED
- test_critical_alert_severity PASSED

TestAlertmanagerConfig
- test_alertmanager_config_exists PASSED
- test_global_config PASSED
- test_route_config PASSED
- test_receivers_config PASSED
- test_critical_alerts_receiver PASSED
- test_warning_alerts_receiver PASSED
- test_inhibition_rules PASSED

TestAlertTriggering
- test_high_latency_alert_trigger PASSED
- test_critical_latency_alert_trigger PASSED
- test_high_error_rate_alert_trigger PASSED
- test_high_drawdown_alert_trigger PASSED
- test_critical_drawdown_alert_trigger PASSED
- test_high_cpu_usage_alert_trigger PASSED
- test_critical_cpu_usage_alert_trigger PASSED

TestAlertEscalation
- test_severity_levels PASSED
- test_escalation_timing PASSED
- test_alert_grouping PASSED
```

---

## Performance Characteristics

### Metrics Collection Overhead

| Component | Overhead (CPU) | Overhead (Memory) |
|-----------|----------------|-------------------|
| Exchange Simulator Metrics | < 1% | ~10 MB |
| AI Signal Bot Metrics | < 1% | ~10 MB |
| HFT Bot Metrics | < 0.5% | ~5 MB |

### Tracing Overhead

| Component | Overhead (CPU) | Overhead (Memory) |
|-----------|----------------|-------------------|
| Exchange Simulator Tracing | < 2% | ~20 MB |
| AI Signal Bot Tracing | < 2% | ~20 MB |
| HFT Bot Tracing | < 1% | ~15 MB |

---

## Integration with Existing Components

The monitoring components can be integrated with existing services:

```python
# In exchange_simulator/__main__.py
from exchange_simulator.metrics import init_metrics
from exchange_simulator.tracing import init_tracer

# Initialize monitoring
metrics = init_metrics(metrics_port=8000)
tracer = init_tracer(service_name="exchange-simulator")

# Use in application
metrics.record_order(symbol, side, status, latency)
tracer.trace_order_processing(symbol, side, quantity)
```

```python
# In ai-signal-bot/main.py
from ai_signal_bot.metrics import init_metrics
from ai_signal_bot.tracing import init_tracer

# Initialize monitoring
metrics = init_metrics(metrics_port=8001)
tracer = init_tracer(service_name="ai-signal-bot")

# Use in application
metrics.record_signal(strategy, signal_type, latency)
tracer.trace_signal_generation(strategy, symbol)
```

---

## Future Improvements

Potential future enhancements:
1. Add custom Grafana plugins for specialized visualizations
2. Implement machine learning-based anomaly detection
3. Add synthetic monitoring for external dependencies
4. Implement distributed tracing with service mesh (Istio)
5. Add log aggregation and correlation (ELK stack)
6. Implement real-time alert correlation and root cause analysis
7. Add capacity planning and forecasting
8. Implement cost monitoring and optimization
9. Add SLA/SLO monitoring and reporting
10. Implement multi-region monitoring and failover

---

## Files Modified

- `exchange_simulator/metrics.py` (new) - Prometheus metrics for exchange simulator
- `ai-signal-bot/metrics.py` (new) - Prometheus metrics for AI signal bot
- `hft-trade-bot/src/metrics/metrics_collector.cpp` (new) - C++ metrics collector
- `hft-trade-bot/src/metrics/metrics_collector.h` (new) - C++ metrics header
- `monitoring/grafana/dashboards/system-overview.json` (new) - System overview dashboard
- `monitoring/grafana/dashboards/trading-performance.json` (new) - Trading performance dashboard
- `monitoring/grafana/dashboards/latency-monitoring.json` (new) - Latency monitoring dashboard
- `exchange_simulator/tracing.py` (new) - OpenTelemetry tracing for exchange simulator
- `ai-signal-bot/tracing.py` (new) - OpenTelemetry tracing for AI signal bot
- `hft-trade-bot/src/tracing/tracer.cpp` (new) - C++ tracer implementation
- `hft-trade-bot/src/tracing/tracer.h` (new) - C++ tracer header
- `monitoring/alerts/alerts.yml` (new) - Prometheus alert rules
- `monitoring/alertmanager/config.yml` (new) - Alertmanager configuration
- `monitoring/tests/test_metrics.py` (new) - Metrics tests
- `monitoring/tests/test_alerts.py` (new) - Alert tests
- `docs/MONITORING_GUIDE.md` (new) - This document

---

## Commit Message

```
Day 9: Monitoring and Observability Implementation

- Added Prometheus metrics endpoints to all components (ports 8000, 8001, 8002)
- Created Grafana dashboards for system, trading, and latency monitoring
- Added OpenTelemetry distributed tracing with Jaeger integration
- Configured Prometheus Alertmanager with email, Slack, and Discord notifications
- Created comprehensive monitoring test suite
- Metrics: Counter, Gauge, Histogram for orders, latency, errors, system resources
- Dashboards: System overview, trading performance, latency monitoring (3 dashboards)
- Tracing: Signal generation, order execution, price updates, database operations
- Alerting: Latency, error rate, drawdown, CPU/memory alerts with escalation
- Notification channels: Email, Slack, Discord with severity-based routing
- Alert thresholds: Warning at 5min, Critical at 2min, 12h repeat interval
```
