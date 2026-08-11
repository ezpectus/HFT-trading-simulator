# Configuration Reference

This document provides a comprehensive reference for all configuration files in the HFT Trading System.

## Overview

The system uses YAML configuration files across multiple components. Each component has its own configuration file with specific settings for that component's behavior.

## Configuration Files

### Global Configuration

#### `shared_config.yaml`

Global system configuration shared across all components.

```yaml
# Global symbols list (50+ cryptocurrency pairs)
symbols:
  - BTC/USDT
  - ETH/USDT
  - SOL/USDT
  - BNB/USDT
  - ADA/USDT
  - AVAX/USDT
  - DOT/USDT
  - LINK/USDT
  - MATIC/USDT
  - UNI/USDT
  - XRP/USDT
  - LTC/USDT
  - ATOM/USDT
  - NEAR/USDT
  - FTM/USDT
  - APE/USDT
  - SAND/USDT
  - MANA/USDT
  - AXS/USDT
  - ENJ/USDT
  - GALA/USDT
  - IMX/USDT
  - GMT/USDT
  - BCH/USDT
  - ETC/USDT
  - XLM/USDT
  - ALGO/USDT
  - VET/USDT
  - THETA/USDT
  - ICP/USDT
  - HBAR/USDT
  - EOS/USDT
  - TRX/USDT
  - XMR/USDT
  - DASH/USDT
  - ZEC/USDT
  - KSM/USDT
  - ACA/USDT
  - GLM/USDT
  - MASK/USDT
  - LDO/USDT
  - STG/USDT
  - RPL/USDT
  - FXS/USDT
  - CRV/USDT
  - AAVE/USDT
  - COMP/USDT
  - MKR/USDT
  - SNX/USDT
  - YFI/USDT

# Exchanges configuration
exchanges:
  - id: binance
    name: Binance
    fee_pct: 0.1
    slippage_bps: 5
  - id: bybit
    name: Bybit
    fee_pct: 0.075
    slippage_bps: 8
  - id: okx
    name: OKX
    fee_pct: 0.08
    slippage_bps: 10
```

### Exchange Simulator Configuration

#### `exchange_simulator/config.yaml`

Configuration for the exchange simulator component.

```yaml
# Exchange-specific settings
exchanges:
  binance:
    fee_pct: 0.1
    slippage_bps: 5
    volatility_multiplier: 1.0
    symbols:
      - BTC/USDT
      - ETH/USDT
      - SOL/USDT
      # ... (all 50+ symbols)
  
  bybit:
    fee_pct: 0.075
    slippage_bps: 8
    volatility_multiplier: 1.1
    symbols:
      - BTC/USDT
      - ETH/USDT
      - SOL/USDT
      # ... (all 50+ symbols)
  
  okx:
    fee_pct: 0.08
    slippage_bps: 10
    volatility_multiplier: 0.9
    symbols:
      - BTC/USDT
      - ETH/USDT
      - SOL/USDT
      # ... (all 50+ symbols)

# Initial prices for symbols
initial_prices:
  BTC/USDT: 50000.0
  ETH/USDT: 3000.0
  SOL/USDT: 150.0
  BNB/USDT: 400.0
  ADA/USDT: 0.5
  # ... (all 50+ symbols)

# Volatility settings
volatility:
  BTC/USDT: 0.02
  ETH/USDT: 0.025
  SOL/USDT: 0.03
  # ... (all 50+ symbols)

# Market simulation settings
market:
  base_volatility: 0.02
  jump_intensity: 0.01
  jump_frequency: 0.001
  regime_switching: true
  fat_tail_dof: 5

# Price feed settings
price_feed:
  enabled: true
  hybrid_mode: true
  apis:
    - name: binance
      enabled: true
      priority: 1
      rate_limit: 1200
    - name: coinbase
      enabled: true
      priority: 2
      rate_limit: 1000
  cache_ttl: 5
  failover_enabled: true

# Audit logging settings
audit:
  enabled: true
  max_memory_entries: 10000
  log_file_path: logs/audit.log
  enable_file_logging: true
  enable_callbacks: true

# WebSocket server settings
websocket:
  host: 0.0.0.0
  port: 8765
  delta_updates: true
  symbol_subscription: true
  rate_limit_per_client: 100
```

### AI Signal Bot Configuration

#### `ai-signal-bot/config/settings.yaml`

Configuration for the AI signal bot component.

```yaml
# Trading settings
trading:
  symbols:
    - BTC/USDT
    - ETH/USDT
    - SOL/USDT
  max_open_positions: 10
  position_size_pct: 0.1
  leverage: 10

# Signal generation settings
signal:
  indicators:
    ema_periods: [9, 21, 50]
    rsi_period: 14
    adx_period: 14
  confidence_threshold: 0.7
  regime_filter: true

# Risk management settings
risk:
  max_drawdown_pct: 0.2
  daily_loss_limit_pct: 0.05
  position_size_method: kelly
  kelly_fraction: 0.25

# Backtesting settings
backtest:
  enabled: true
  lookback_days: 365
  commission_pct: 0.1
  slippage_bps: 5
```

### HFT Trade Bot Configuration

#### `hft-trade-bot/config/config.yaml`

Configuration for the C++ HFT trade bot component.

```yaml
# Trading symbols (50+ symbols)
trading:
  symbols:
    - BTC/USDT
    - ETH/USDT
    - SOL/USDT
    - BNB/USDT
    - ADA/USDT
    - AVAX/USDT
    - DOT/USDT
    - LINK/USDT
    - MATIC/USDT
    - UNI/USDT
    # ... (all 50+ symbols)
  max_open_positions: 10
  leverage: 10

# Signal Engine V2 settings
signal_engine_v2:
  enabled: true
  indicators:
    ema:
      periods: [9, 21, 50]
    rsi:
      period: 14
    adx:
      period: 14
    vwap:
      enabled: true
    obi:
      levels: [5, 10, 20]
  confidence_threshold: 0.7

# Pressure Model settings
pressure_model:
  enabled: true
  toxicity_threshold: 0.7
  microprice_deviation_threshold: 0.001

# Smart Order Router V2 settings
smart_order_router_v2:
  enabled: true
  strategy: best_price
  latency_tracking: true
  anti_toxic_backoff: true

# Adaptive Order Selector V2 settings
adaptive_order_selector_v2:
  enabled: true
  confidence_threshold: 0.8
  spread_threshold: 0.001

# Risk management settings
risk:
  max_drawdown_pct: 0.2
  daily_loss_limit_pct: 0.05
  position_size_method: kelly
  kelly_fraction: 0.25
  var_confidence: 0.95
  cvar_confidence: 0.95

# SHM IPC settings
shm:
  signals_channel: /hft_signals
  fills_channel: /hft_fills
  market_channel: /hft_market
  kill_switch_channel: /hft_kill_switch
  heartbeat_channel: /hft_heartbeat

# WebSocket settings
websocket:
  exchange_port: 8765
  signal_port: 8766
  auto_reconnect: true
  reconnect_delay_ms: 1000
  max_reconnect_delay_ms: 30000
```

### Web UI Configuration

#### `web-ui/.env.example`

Environment variables for the web UI.

```bash
# API endpoints
VITE_EXCHANGE_WS_URL=ws://localhost:8765
VITE_SIGNAL_WS_URL=ws://localhost:8766

# Mock mode
VITE_MOCK_MODE=false

# Default settings
VITE_DEFAULT_EXCHANGE=binance
VITE_DEFAULT_SYMBOL=BTC/USDT
VITE_DEFAULT_TIMEFRAME=1h

# Feature flags
VITE_ENABLE_ADVANCED_ORDERS=true
VITE_ENABLE_AUDIT_LOGS=true
VITE_ENABLE_EXCHANGE_CLONES=true
```

## Configuration Validation

The system includes configuration validation to ensure settings are correct before startup.

### Exchange Simulator

```python
from exchange_simulator.config_validator import validate_config

config = load_config('exchange_simulator/config.yaml')
errors = validate_config(config)

if errors:
    print(f"Configuration errors: {errors}")
    sys.exit(1)
```

### HFT Trade Bot

```cpp
#include "config.h"

Config config = Config::load("config/config.yaml");
if (!config.validate()) {
    std::cerr << "Configuration validation failed" << std::endl;
    return 1;
}
```

## Hot Reload

Some components support configuration hot reload without restart.

### Exchange Simulator

```python
# Send hot reload command via WebSocket
{
    "type": "config_reload",
    "config": {
        "volatility": 0.03
    }
}
```

## Best Practices

### 1. Use Environment-Specific Configs

```yaml
# config.prod.yaml
trading:
  max_open_positions: 50
  leverage: 20

# config.test.yaml
trading:
  max_open_positions: 5
  leverage: 5
```

### 2. Validate on Startup

Always validate configuration before starting components to fail fast on errors.

### 3. Document Changes

Update this reference when adding new configuration options.

### 4. Use Defaults

Provide sensible defaults for all configuration options.

### 5. Separate Secrets

Never commit API keys or secrets to configuration files. Use environment variables or secret management.

```yaml
# Bad
api_key: "sk_live_1234567890"

# Good
api_key: ${API_KEY}
```

## Troubleshooting

### Configuration Not Loading

1. Check file path is correct
2. Verify YAML syntax is valid
3. Check file permissions
4. Review validation errors

### Symbols Not Appearing

1. Verify symbols are in `shared_config.yaml`
2. Check exchange-specific symbol lists
3. Ensure symbols are enabled in component configs

### Price Feed Not Working

1. Check `price_feed.enabled: true`
2. Verify API credentials
3. Check rate limit settings
4. Review API status

## References

- [Shared Config](../shared_config.yaml)
- [Exchange Simulator Config](../exchange_simulator/config.yaml)
- [AI Signal Bot Config](../ai-signal-bot/config/settings.yaml)
- [HFT Trade Bot Config](../hft-trade-bot/config/config.yaml)
- [Web UI Env Example](../web-ui/.env.example)
