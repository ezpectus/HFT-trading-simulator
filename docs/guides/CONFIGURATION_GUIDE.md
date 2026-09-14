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
| `shared_config.yaml` | All | Canonical cross-component reference (symbols, exchanges, risk, ports) — enforced by `scripts/test_config_consistency.py`, not read at runtime |
| `exchange_simulator/config.yaml` | Exchange Simulator | Market simulation parameters |
| `ai-signal-bot/config/settings.yaml` | AI Signal Bot | Strategies, risk, indicators, database |
| `hft-trade-bot/config/config.yaml` | HFT Trade Bot | Signal Engine V2/V3, order routing, latency |
| `web-ui/.env` | Web UI | WebSocket URLs, mock mode |

---

## 1. Shared Configuration (`shared_config.yaml`)

Canonical reference for values that must stay in sync across all components
(symbols, exchanges, risk limits, ports). Components do **not** read this file
at runtime — each has its own config; `scripts/test_config_consistency.py`
(wired into `pre-commit-check.py`) verifies the component configs match it.

**Note:** `shared_config.yaml` is **not loaded at runtime** — it is the canonical
reference consumed by `scripts/test_config_consistency.py` (the pre-commit
consistency gate). It currently carries only the sections the gate compares:
`symbols`, `exchanges`, `risk`, `websocket`. The `system`, `default_exchange`,
`timeframe`, and `account` sections were removed in audit S316 — nothing read
them.

### Symbols

49 cryptocurrency pairs — must match across all components:

```yaml
symbols:
  - BTC/USDT
  - ETH/USDT
  - SOL/USDT
  # ... 49 total pairs through MINA/USDT
```

### Exchanges

```yaml
exchanges:
  - binance
  - bybit
  - okx
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

### WebSocket Ports

| Service | Port | Metrics Port |
|---------|------|-------------|
| Exchange Simulator | 8765 | 8775 |
| AI Signal Bot | 8766 | 9090 |
| HFT Trade Bot | — | 9091 |
| Web UI | 3000 | — |

---

## 2. Exchange Simulator (`exchange_simulator/config.yaml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `exchanges.<name>.fee_pct` | `0.04`–`0.06` | Trading fee in percent (single fee — no maker/taker split) |
| `exchanges.<name>.slippage_bps` | `2.0`–`3.0` | Simulated slippage in basis points |
| `initial_prices.<symbol>` | per-symbol | Starting reference price; also defines the symbol list |
| `market.timeframe` / `market.timeframe_seconds` | `5m` / `300` | Candle interval |
| `market.drift` | `0.0001` | Per-candle drift bias |
| `market.warmup_candles` | `200` | History generated before trading starts |
| `market.order_book_depth` | `20` | Book levels per side |
| `account.initial_balance` | `10000.0` | Starting balance per exchange |
| `account.leverage` | `10` | Default leverage (1–50) |
| `websocket.host` | `localhost` | WebSocket bind address |
| `websocket.port` | `8765` | WebSocket port (Prometheus metrics on port+10) |
| `metrics.enabled` | `true` | Health/metrics HTTP server |

Note: tick interval, compression and protocol encoding are hardcoded in
`websocket_server.py` — not configurable keys.

---

## 3. AI Signal Bot (`ai-signal-bot/config/settings.yaml`)

### Trading Parameters

| Setting | Default | Description |
|---------|---------|-------------|
| `trading.signal_interval_seconds` | `60` | Signal analysis loop interval |
| `trading.max_open_positions` | `10` | Concurrent positions |
| `trading.paper_trading` | `true` | If true, no real orders are sent |

### Network

| Setting | Default | Description |
|---------|---------|-------------|
| `network.ws_connect_timeout` | `10` | WebSocket connect timeout (seconds) |
| `network.ws_recv_timeout` | `30` | WebSocket recv/idle watchdog (seconds) |
| `network.rest_timeout` | `15` | REST API timeout (seconds, ccxt) |

### Risk Management

| Setting | Default | Description |
|---------|---------|-------------|
| `risk.max_risk_per_trade_pct` | `2.0` | Max loss per trade as % of balance |
| `risk.max_daily_drawdown_pct` | `8.0` | Stop trading if daily loss exceeds this |
| `risk.min_confidence` | `65` | Minimum signal confidence (0-100) |
| `risk.min_rr_ratio` | `1.5` | Minimum risk:reward ratio |
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
  enabled: false                 # --metrics flag or this key enables
  port: 9090                     # Prometheus scrape port (helm aiSignalBot.ports.metrics)
  host: "localhost"              # AI_BOT_BIND_HOST env overrides
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
  obi_levels_5: 5               # OBI depth buckets — note: parsed keys are
  obi_levels_10: 10             # obi_levels_5/10/20, NOT a single `obi_levels`
  obi_levels_20: 20             # (the scalar form in config.yaml is dead — S159)
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
| `VITE_WS_EXCHANGE` | `ws://localhost:8765` | Exchange simulator WebSocket |
| `VITE_WS_SIGNALS` | `ws://localhost:8766` | AI signal bot WebSocket |
| `VITE_SIGNAL_TOKEN` | — | Auth token — must match the bot's `api.auth_token` / `AI_BOT_AUTH_TOKEN` |
| `VITE_MOCK_MODE` | `false` | Enable mock data mode (no backend needed) |

### Mock Mode

```bash
cp web-ui/.env.mock web-ui/.env
# Or set directly:
VITE_MOCK_MODE=true npm run dev
```

---

## 6. Environment Variables

Only a small set of variables is read at runtime (verified against `os.environ`
/`os.getenv` call sites — config files hold everything else):

### Exchange Simulator

```bash
LOG_FORMAT=text          # or "json"
```

### AI Signal Bot

```bash
WS_URL=ws://localhost:8765          # override exchange WebSocket URL
AI_BOT_AUTH_TOKEN=...               # signal publisher auth (matches VITE_SIGNAL_TOKEN)
ALERT_WEBHOOK_URL=...               # generic alert webhook
ALERT_DISCORD_WEBHOOK=...           # Discord alerts
ALERT_TELEGRAM_TOKEN=...            # Telegram bot token
ALERT_TELEGRAM_CHAT_ID=...          # Telegram chat id
OPENAI_API_KEY=...                  # LLM signal explanations (optional)
ANTHROPIC_API_KEY=...               # LLM fallback (optional)
EXCHANGE_API_KEY=...                # live-trading path only (paper_trading: false + ccxt)
EXCHANGE_API_SECRET=...
```

### Web UI (build-time, Vite)

```bash
VITE_WS_EXCHANGE=wss://api.example.com/ws
VITE_WS_SIGNALS=wss://api.example.com/signal
```

### Production (.env.prod)

```bash
# Copy template
cp .env.prod.example .env.prod

# Key variables to set (see .env.prod.example comments — REQUIRED ones are
# guarded by ${VAR:?} in docker-compose.prod.yml):
GRAFANA_PASSWORD=your_secure_password   # REQUIRED
VITE_WS_EXCHANGE=wss://your.domain/ws-exchange   # REQUIRED — browser-facing
VITE_WS_SIGNALS=wss://your.domain/ws-signals     # REQUIRED — browser-facing
AI_BOT_AUTH_TOKEN=...        # shared with VITE_SIGNAL_TOKEN (empty = auth off)
OPENAI_API_KEY=...           # optional LLM explanations
ALERT_DISCORD_WEBHOOK=...    # optional ops alerts
```

---

## 7. Monitoring Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_FORMAT` | `text` | Log format: `text` (dev) or `json` (prod) — read by exchange simulator |
| `WS_URL` | `ws://localhost:8765` | Exchange WebSocket URL override (AI signal bot) |
| `SHM_MARKET_ENABLED` | `0` | Enable SHM market data publisher (exchange sim) |
| `SHM_MARKET_NAME` | `/hft_market` | SHM segment name |
| `SHM_MARKET_MAX_SYMBOLS` | `10` | Max symbols in SHM segment |
| `GRAFANA_USER` | `admin` | Grafana admin username (compose `GF_SECURITY_ADMIN_*`) |
| `GRAFANA_PASSWORD` | *(required)* | Grafana admin password (`:?` — prod compose fails without it) |

Alert channels are configured in `ai-signal-bot/config/settings.yaml`
(`alerting.*`) and use the `ALERT_*` variables listed in section 6.

### Health Endpoints

| Service | Endpoint | Port | Purpose |
|---------|----------|------|---------|
| Exchange Simulator | `/health`, `/live`, `/ready`, `/metrics` | 8775 | Health + liveness + readiness + Prometheus |
| AI Signal Bot | `/health` | 8080 | HealthChecker (liveness + readiness) |
| AI Signal Bot | `/health`, `/metrics` | 9090 | MetricsExporter |
| HFT Trade Bot | `/health` | 9091 | C++ health server |
| Web UI | `/health` | 3000 | nginx static health |

### Prometheus (`monitoring/prometheus.yml`)

Scrape targets:

| Service | Port | Path | Interval |
|---------|------|------|----------|
| Exchange Simulator | 8775 | /metrics | 15s |
| AI Signal Bot | 9090 | /metrics | 15s |
| HFT Trade Bot | 9091 | /metrics | 15s |

### Alertmanager (`monitoring/alertmanager.yml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `group_wait` | `30s` | Wait before sending first notification |
| `group_interval` | `5m` | Wait before sending subsequent notifications |
| `repeat_interval` | `4h` (`1h` for critical) | Re-send unresolved alerts after this |

Grouping: by `alertname`, `severity`, `service` (all 22 rules carry these
labels). Inhibition: a firing `critical` suppresses `warning` for the same
`alertname`+`instance`.

The `default` receiver is empty — alerts are visible/silenceable in the
Alertmanager UI (`localhost:9093` in dev) but nothing is sent until you add a
receiver (`webhook_configs` / `telegram_configs` examples in the file's
comments).

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
