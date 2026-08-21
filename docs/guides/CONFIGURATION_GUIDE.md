# Configuration Guide

Complete guide to configuring the HFT Trading System. All config files use YAML
format and are validated at startup.

## Theory: How configuration affects system behavior

### Key parameters and their theoretical meaning

**Risk parameters:**
- `max_risk_per_trade: 0.02` — Half-Kelly. Balance growth vs safety.
  Too high = risk of ruin. Too low = underutilization.
- `max_daily_drawdown: 0.08` — Circuit breaker. Stop trading at 8%
  daily loss. Prevents emotional revenge trading.
- `min_confidence: 0.65` — Signal quality filter. 65% = 2:1 odds.
  Below = noise, not actionable.
- `min_rr_ratio: 1.5` — Risk:Reward. Expected value positive if
  win_rate x (R:R) > (1 - win_rate). R:R=1.5, win_rate=40% → EV=0.

**Strategy parameters:**
- `ema_fast: 9, ema_slow: 21` — Standard fast/slow crossover.
  9/21 = responsive. 50/200 = slow, trend filter.
- `rsi_oversold: 30, rsi_overbought: 70` — Standard RSI levels.
  30/70 = conservative. 20/80 = aggressive (fewer, stronger signals).
- `adx_threshold: 25` — ADX > 25 = trending. Below = ranging.
  Filter prevents whipsaw in sideways market.

**Ensemble parameters:**
- `mode: majority` — Majority voting. Condorcet theorem.
- `min_votes: 2` — Min 2 of 5 strategies agree. Balance quality
  vs quantity. 1 = too many false signals. 3 = too few signals.

### Config validation — fail fast principle

Invalid config → crash at startup. Better than trading with wrong
parameters. `__post_init__` validates ranges, types, relationships.

---

## Configuration Files Overview

| File | Component | Purpose |
|------|-----------|---------|
| `shared_config.yaml` | All | Global shared settings (symbols, exchanges, risk, ports) |
| `exchange_simulator/config/settings.yaml` | Exchange Simulator | Market simulation parameters |
| `ai-signal-bot/config/settings.yaml` | AI Signal Bot | Strategies, risk, indicators, database |
| `hft-trade-bot/config/config.yaml` | HFT Trade Bot | Signal Engine V2/V3, order routing, latency |
| `web-ui/.env` | Web UI | WebSocket URLs, mock mode |

---

## 1. Shared Configuration (`shared_config.yaml`)

Global settings shared across all components. Individual component configs may
override these values.

### System

```yaml
system:
  name: "HFT Trading System"
  version: "3.0.0"
  mode: "paper_trading"  # paper_trading | live (live not implemented)
```

### Symbols

50 cryptocurrency pairs — must match across all components:

```yaml
symbols:
  - BTC/USDT
  - ETH/USDT
  - SOL/USDT
  # ... 50 total pairs through MINA/USDT
```

### Exchanges

```yaml
exchanges:
  - binance
  - bybit
  - okx
default_exchange: binance
```

### Global Risk Parameters

| Setting | Default | Description |
|---------|---------|-------------|
| `max_risk_per_trade_pct` | 2.0 | Max loss per trade as % of balance |
| `max_daily_drawdown_pct` | 8.0 | Stop trading if daily loss exceeds this |
| `min_confidence` | 65.0 | Minimum signal confidence (0-100) |
| `min_rr_ratio` | 1.5 | Minimum risk:reward ratio |
| `max_open_positions` | 10 | Concurrent positions across all symbols |
| `max_position_size_pct` | 10.0 | Max notional per position as % of balance |

### Timeframe

```yaml
timeframe: "5m"              # 1m | 3m | 5m | 15m | 30m | 1h | 4h | 1d
timeframe_seconds: 300       # Numeric equivalent (5m = 300s)
```

**Must match** across exchange simulator and all bots for consistent candle data.

### Account

```yaml
account:
  initial_balance: 10000.0   # Starting USDT balance per exchange
  currency: "USDT"
  leverage: 10               # Default leverage (1-50)
```

### WebSocket Ports

| Service | Port | Metrics Port |
|---------|------|-------------|
| Exchange Simulator | 8765 | 8775 |
| AI Signal Bot | 8766 | 9090 |
| HFT Trade Bot | — | 9091 |
| Web UI | 3000 | — |

---

## 2. Exchange Simulator (`exchange_simulator/config/settings.yaml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `host` | `localhost` | WebSocket server bind address |
| `port` | `8765` | WebSocket server port |
| `compression` | `deflate` | WebSocket permessage-deflate compression |
| `max_symbols` | `50` | Maximum number of trading symbols |
| `tick_interval_ms` | `1000` | Market data broadcast interval |
| `encoding` | `json` | Message encoding (`json` or `msgpack`) |

### Exchange Fees and Slippage

```yaml
exchanges:
  binance:
    maker_fee_bps: 2.0       # 0.02% maker fee
    taker_fee_bps: 5.0       # 0.05% taker fee
    slippage_bps: 3.0        # 0.03% slippage
  bybit:
    maker_fee_bps: 1.0
    taker_fee_bps: 4.5
    slippage_bps: 2.5
  okx:
    maker_fee_bps: 1.5
    taker_fee_bps: 5.0
    slippage_bps: 3.0
```

---

## 3. AI Signal Bot (`ai-signal-bot/config/settings.yaml`)

### Trading Parameters

| Setting | Default | Description |
|---------|---------|-------------|
| `trading.timeframe` | `5m` | Candle interval (must match exchange simulator) |
| `trading.signal_interval_ms` | `1` | Loop poll interval in ms (0 = no wait, 1 = sub-ms HFT) |
| `trading.max_open_positions` | `10` | Concurrent positions |
| `trading.paper_trading` | `true` | If true, no real orders are sent |

### Risk Management

| Setting | Default | Description |
|---------|---------|-------------|
| `risk.max_risk_per_trade_pct` | `2.0` | Max loss per trade as % of balance |
| `risk.max_daily_drawdown_pct` | `8.0` | Stop trading if daily loss exceeds this |
| `risk.min_confidence` | `65` | Minimum signal confidence (0-100) |
| `risk.min_rr_ratio` | `1.5` | Minimum risk:reward ratio |
| `risk.stop_loss_pct` | `2.0` | Default stop loss percentage |
| `risk.take_profit_pct` | `4.0` | Default take profit percentage |
| `risk.max_position_size_pct` | `10.0` | Max position size as % of equity |

### Strategy Configuration

```yaml
strategies:
  trend_following:
    enabled: true
    ema_fast: 9                  # Fast EMA period
    ema_slow: 21                 # Slow EMA period
    adx_threshold: 25.0          # Min ADX to confirm trend

  mean_reversion:
    enabled: true
    rsi_oversold: 30             # Buy when RSI below this
    rsi_overbought: 70           # Sell when RSI above this
    bb_period: 20                # Bollinger Bands lookback
    bb_std: 2.0                  # Bollinger Bands std deviations

  fft_cycle:
    enabled: true
    min_data: 64                 # Min candles for FFT

  statistical_arbitrage:
    enabled: true
    min_data: 100                # Min candles for cointegration
    zscore_entry: 2.0            # Enter when z-score exceeds this
    zscore_exit: 0.5             # Exit when z-score reverts
    recompute_interval: 50       # Recompute cointegration every N steps

  market_making:
    enabled: false               # Off by default
    gamma: 0.1                   # Risk aversion (Avellaneda-Stoikov)
    sigma: 0.02                  # Volatility (annualized)
    max_inventory: 5.0           # Max position size
    min_spread: 0.0001           # Minimum spread

  sentiment:
    enabled: true
    fade_threshold: 0.7          # Fade if sentiment > this
    decay_rate: 0.95             # Sentiment decay per second

  ml_ensemble:
    enabled: false               # Off by default (needs scikit-learn)
    lookback: 200                # Feature lookback window
    prediction_horizon: 5        # Predict return N candles ahead
```

### Ensemble Voting

```yaml
strategies:
  ensemble:
    mode: "majority"             # "majority" or "weighted"
    min_votes: 2                 # Min strategies agreeing to emit signal
```

- **Majority mode** — Signal emitted if ≥ N strategies agree on direction
- **Weighted mode** — Weighted voting by confidence score

### Technical Indicators

| Setting | Default | Description |
|---------|---------|-------------|
| `indicators.rsi_period` | `14` | RSI lookback period |
| `indicators.macd_fast` | `12` | MACD fast EMA period |
| `indicators.macd_slow` | `26` | MACD slow EMA period |
| `indicators.macd_signal` | `9` | MACD signal line EMA period |
| `indicators.atr_period` | `14` | ATR period (used for SL/TP sizing) |
| `indicators.adx_period` | `14` | ADX trend strength period |

### Database

```yaml
database:
  path: "data/trading.db"        # SQLite — signals, trades, equity
```

### Logging

```yaml
logging:
  level: "INFO"                  # DEBUG | INFO | WARNING | ERROR
  file: "logs/ai_signal_bot.log"
  trades_csv: "logs/trades.csv"
  signals_csv: "logs/signals.csv"
```

### Metrics (Prometheus)

```yaml
metrics:
  enabled: false                 # Enable with --metrics flag
  port: 8080
  host: "localhost"
```

---

## 4. HFT Trade Bot (`hft-trade-bot/config/config.yaml`)

### Signal Engine V2 (C++ Native)

```yaml
signal_engine_v2:
  enabled: true
  ema_fast_period: 21           # Fast EMA for crossover
  ema_slow_period: 50           # Slow EMA for crossover
  rsi_period: 14                # RSI lookback
  adx_period: 14                # ADX trend strength
  obi_levels: 20                # Order book levels for OBI
  atr_period: 14                # ATR for volatility-based SL/TP
  sl_atr_mult: 1.5              # SL = entry ± 1.5×ATR
  tp_atr_mult: 3.0              # TP = entry ± 3.0×ATR
  cooldown_ms: 5000             # Min time between signals (per symbol)
  buy_threshold: 0.3            # Composite score > 0.3 → BUY
  sell_threshold: -0.3          # Composite score < -0.3 → SELL
  min_confidence: 60            # Reject signals below this
```

**Indicator weights:** EMA(21/50) 0.25, RSI(14) 0.15, OBI(5/10/20) 0.20,
VWAP deviation 0.10, ADX(14) 0.10, Pressure 0.20

### Signal Engine V3 (HMM Regime Detection)

```yaml
signal_engine_v3:
  enabled: false                # Off by default — opt-in
```

When enabled, V3 replaces V2 in the `analyze()` call path. Adds online HMM
with log-space forward recursion and Viterbi decoding for regime detection.

### Pressure Model (L2 Microstructure)

```yaml
pressure_model:
  toxic_size_threshold: 5.0     # Trades > 5× median = toxic
  obi_threshold: 0.15           # |OBI| > 0.15 = significant
  pressure_threshold: 0.2       # |pressure| > 0.2 = significant
```

### Smart Order Router V2

```yaml
smart_order_router:
  enabled: true
  strategy: 3                   # 0=BestPrice, 1=LowestLatency,
                                # 2=LowestFees, 3=BestEffective,
                                # 4=DepthAware
  toxic_threshold: 5            # Skip exchange with ≥5 toxic events
```

### Adaptive Order Type Selection

```yaml
adaptive_order_selector:
  enabled: true
  high_confidence: 80           # ≥80 + tight spread → IOC
  low_confidence: 60            # <60 or wide spread → PostOnly
  emergency_confidence: 95      # ≥95 → FOK (urgent)
  gtd_seconds: 30               # GTD order expiry
```

### Latency Optimization

```yaml
latency_optimization:
  thread_pinning_enabled: false # Pin thread to dedicated CPU core
  execution_core_id: 0          # CPU core ID (0-indexed)
  latency_histogram_enabled: true # Track P50/P95/P99/P99.9
```

### V1 Fallback Strategies

Used when `signal_engine_v2.enabled = false`:

```yaml
hft_strategies:
  fast_ema_enabled: true
  fast_ema_period: 9
  slow_ema_period: 21
  obi_enabled: true
  vwap_enabled: true
  pressure_model_enabled: true
  fft_enabled: true
  fft_min_candles: 64
```

### AI Signal Bot Connection (Slow Path)

```yaml
ai_signal_bot:
  enabled: true                 # If false, only V2 native engine
  websocket_url: "ws://localhost:8766"
```

---

## 5. Web UI (`web-ui/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_EXCHANGE_WS_URL` | `ws://localhost:8765` | Exchange simulator WebSocket |
| `VITE_SIGNAL_WS_URL` | `ws://localhost:8766` | AI signal bot WebSocket |
| `VITE_MOCK_MODE` | `false` | Enable mock data mode (no backend needed) |

### Mock Mode

```bash
cp web-ui/.env.mock web-ui/.env
# Or set directly:
VITE_MOCK_MODE=true npm run dev
```

---

## 6. Environment Variables

Override config values with environment variables for production deployment:

### Exchange Simulator

```bash
EXCHANGE_HOST=0.0.0.0
EXCHANGE_PORT=8765
EXCHANGE_COMPRESSION=deflate
```

### AI Signal Bot

```bash
SIGNAL_BOT_RISK_PER_TRADE=1.5
SIGNAL_BOT_MIN_CONFIDENCE=70.0
SIGNAL_BOT_DAILY_DRAWDOWN=5.0
```

### Web UI

```bash
VITE_EXCHANGE_WS_URL=wss://api.example.com/ws
VITE_SIGNAL_WS_URL=wss://api.example.com/signal
```

### Production (.env.prod)

```bash
# Copy template
cp .env.prod.example .env.prod

# Key variables to set:
POSTGRES_PASSWORD=your_secure_password
REDIS_PASSWORD=your_secure_password
GRAFANA_ADMIN_PASSWORD=your_secure_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASSWORD=your_app_password
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

---

## 7. Monitoring Configuration

### Prometheus (`monitoring/prometheus.yml`)

Scrape targets:

| Service | Port | Path | Interval |
|---------|------|------|----------|
| Exchange Simulator | 8775 | /metrics | 15s |
| AI Signal Bot | 9090 | /metrics | 15s |
| HFT Trade Bot | 9091 | /metrics | 15s |

### Alertmanager (`monitoring/alertmanager/config.yml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `group_wait` | `10s` | Wait before sending first notification |
| `group_interval` | `10s` | Wait before sending subsequent notifications |
| `repeat_interval` | `12h` | Re-send unresolved alerts after this |

Routes by severity:
- **critical** → email + Slack + Discord
- **warning** → email + Slack
- **info** → Slack only

Inhibition: `critical` alerts suppress `warning` alerts for the same service.

---

## Configuration Tips

- **Start with defaults** — the system works out of the box with paper trading
- **Change symbols** — edit `shared_config.yaml` and component configs must match
- **Reduce risk** — lower `max_risk_per_trade_pct` and `max_position_size_pct`
- **Enable ML** — set `ml_ensemble.enabled: true` (requires scikit-learn)
- **Enable market making** — set `market_making.enabled: true` (needs inventory management)
- **Faster signals** — reduce `signal_interval_ms` (default: 1ms for HFT mode)
- **Production** — use environment variables, not config files, for secrets

---

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [Trading Guide](./TRADING_GUIDE.md)
- [Development Guide](./DEVELOPMENT_GUIDE.md)
- [Monitoring Guide](../MONITORING_GUIDE.md)
- [Deployment Guide](../DEPLOYMENT.md)
