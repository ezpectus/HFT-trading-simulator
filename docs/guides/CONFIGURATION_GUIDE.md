# Configuration Guide

**Last Updated:** August 20, 2026

Complete guide to configuring the HFT Trading System.

## Exchange Simulator Configuration

**File:** `exchange_simulator/config/settings.yaml`

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `host` | `localhost` | WebSocket server bind address |
| `port` | `8765` | WebSocket server port |
| `compression` | `deflate` | WebSocket permessage-deflate compression |
| `max_symbols` | `50` | Maximum number of trading symbols |
| `tick_interval_ms` | `1000` | Market data broadcast interval |
| `encoding` | `json` | Message encoding (`json` or `msgpack`) |

### Symbol Configuration

Symbols are defined in the config file:

```yaml
symbols:
  - BTC/USDT
  - ETH/USDT
  - SOL/USDT
  # ... up to 50 symbols
```

### Exchange Configuration

```yaml
exchanges:
  binance:
    maker_fee_bps: 2.0
    taker_fee_bps: 5.0
    slippage_bps: 3.0
  bybit:
    maker_fee_bps: 1.0
    taker_fee_bps: 4.5
    slippage_bps: 2.5
  okx:
    maker_fee_bps: 1.5
    taker_fee_bps: 5.0
    slippage_bps: 3.0
```

## AI Signal Bot Configuration

**File:** `ai-signal-bot/config/settings.yaml`

### Trading Parameters

| Setting | Default | Description |
|---------|---------|-------------|
| `risk_per_trade_pct` | `2.0` | Percentage of equity risked per trade |
| `daily_drawdown_limit_pct` | `8.0` | Maximum daily drawdown before stop |
| `min_confidence` | `65.0` | Minimum signal confidence to act |
| `min_rr_ratio` | `1.5` | Minimum risk-to-reward ratio |
| `stop_loss_pct` | `2.0` | Default stop loss percentage |
| `take_profit_pct` | `4.0` | Default take profit percentage |
| `max_position_pct` | `10.0` | Maximum position size as % of equity |

### Strategy Configuration

```yaml
strategies:
  trend_following:
    enabled: true
    ema_fast: 9
    ema_slow: 21
  mean_reversion:
    enabled: true
    bb_period: 20
    bb_std: 2.0
  fft_cycle:
    enabled: true
    cycle_length: 50
  statistical_arbitrage:
    enabled: true
    zscore_threshold: 2.0
  sentiment:
    enabled: true
    news_weight: 0.3
  market_making:
    enabled: false
  ml_ensemble:
    enabled: false
```

### Ensemble Configuration

```yaml
ensemble:
  mode: majority  # majority or weighted
  min_votes: 2    # minimum strategy votes to generate signal
```

### WebSocket Client Configuration

```yaml
websocket:
  exchange_url: "ws://localhost:8765"
  signal_url: "ws://localhost:8766"
  compression: deflate
  reconnect_attempts: 5
  reconnect_delay_min: 1.0
  reconnect_delay_max: 30.0
```

## Web UI Configuration

**File:** `web-ui/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_EXCHANGE_WS_URL` | `ws://localhost:8765` | Exchange simulator WebSocket URL |
| `VITE_SIGNAL_WS_URL` | `ws://localhost:8766` | AI signal bot WebSocket URL |
| `VITE_MOCK_MODE` | `false` | Enable mock data mode |

## C++ HFT Trade Bot Configuration

**File:** `hft-trade-bot/config/config.yaml`

### Performance Settings

```yaml
performance:
  simd: true           # Enable AVX2 SIMD instructions
  lock_free: true      # Use lock-free data structures
  shm_ipc: true        # Use shared memory IPC
  thread_pinning: true # Pin hot-path threads to CPU cores
```

### Risk Limits

```yaml
risk:
  max_order_size: 10.0
  max_open_positions: 5
  daily_loss_limit: 500.0
  latency_budget_us: 100
```

## Environment Variables

For production deployment, use environment variables to override config:

```bash
# Exchange Simulator
EXCHANGE_HOST=0.0.0.0
EXCHANGE_PORT=8765
EXCHANGE_COMPRESSION=deflate

# AI Signal Bot
SIGNAL_BOT_RISK_PER_TRADE=1.5
SIGNAL_BOT_MIN_CONFIDENCE=70.0

# Web UI
VITE_EXCHANGE_WS_URL=wss://api.example.com/ws
```

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [Trading Guide](./TRADING_GUIDE.md)
- [Development Guide](./DEVELOPMENT_GUIDE.md)
