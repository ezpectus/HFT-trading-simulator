# Project Overview — Trading System Lite

> Based on PROJECT_MEGA_ANALYSIS.txt (Aug 21, 2026).
> **Status: 7/10** — ~75% real code, ~25% AI slop.

---

## What is this?

An educational trading system simulator. 4 components + Web UI. Zero real money, zero risk. 50 simulated crypto symbols via Geometric Brownian Motion. Signal interval = 60s (MFT, not real HFT — despite the name).

## Architecture

```
Exchange Simulator (Python, :8765)
  │ GBM candles → WebSocket
  ▼
AI Signal Bot (Python, :8766)
  │ Strategies → Ensemble → Risk → Signals
  │ WebSocket + SHM ring buffer
  ▼
HFT Trade Bot (C++20)
  │ Fast path: Signal Engine V2/V3 (< 1ms, stack-allocated)
  │ Slow path: AI signals from Python (60s interval)
  │ FFI →
  ▼
HFT Executor (Rust) — logs orders, doesn't send them (TODO)
  │
Web UI (React, :3000) — dashboard, 204 panels
```

## Components

| Component | Language | ~Lines | Status |
|-----------|----------|--------|--------|
| exchange_simulator | Python | ~5000 | Real — GBM, correlated symbols, order book, news events |
| ai-signal-bot | Python | ~15000 | Mixed — 75% real, 25% slop |
| hft-trade-bot | C++20 | ~8000 | Real — high quality HFT code |
| hft-executor | Rust | ~464 | Facade — FFI works, no order sending |
| web-ui | React | ~3000 | Real |
| fpga_orderbook | VHDL | ~281 | Slop — not synthesizable, "10GHz" fantasy |
| helm/k8s/terraform | YAML | ~500 | Correct structure, never deployed |

## What's Real (20+ modules)

**Strategies:**
- TrendFollowing — EMA crossover + ADX filter, ATR-based SL/TP
- MeanReversion — RSI + Bollinger Bands, mean reversion entry
- FFTCycle — Fourier analysis for cycle detection
- EnsembleVoter — majority/weighted voting across strategies
- StatisticalArbitrage — cointegration (ADF test) + Kalman filter hedge ratio + z-score
- MarketMaking — Avellaneda-Stoikov (2008), reservation price + optimal spread + inventory skew
- Sentiment — event-driven (FOMC, CPI, NFP, hacks, listings), pre/post-event positioning
- MLEnsemble — LightGBM/XGBoost + HMM regime detection + IsolationForest anomaly filtering

**C++ Engine:**
- Signal Engine V2 — 6 indicators (EMA, RSI, ADX, VWAP, OBI, Pressure), O(1) incremental, stack-allocated, cache-line aligned, branchless
- Signal Engine V3 — online HMM (4 states: trending up/down, ranging, volatile), forward recursion in log-space, Viterbi decoding, regime gating
- Bot loop — proper init sequence, signal handlers, thread pinning, SPSC queue, latency histograms

**Risk:**
- VaR — historical, parametric, Monte Carlo
- Kelly Criterion — position sizing with half/quarter Kelly
- Markowitz / Black-Litterman / Risk Parity — portfolio optimization
- Stress Tests — 2008, COVID, FTX, LUNA scenarios
- RiskManager — trailing stop, breakeven, partial TP, max hold time

**Backtesting:**
- Full engine — candle replay, SL/TP, fees (0.075%), slippage (2 bps), equity curve
- Metrics — Sharpe, Sortino, Calmar, max drawdown, win rate, profit factor
- Walk-forward analysis, strategy optimizer (grid search)

**ML (real):**
- rl_trader.py — PPO on PyTorch: ActorCritic network, GAE, PPO clip objective, gradient clipping, entropy bonus
- automl.py — Optuna integration (TPESampler, MedianPruner)
- llm_engine/engine.py — OpenAI/Anthropic/Ollama client for signal explanations
- feature_store.py — Redis-backed feature serving with fallback
- model_registry.py — semver, A/B testing, rollback

**Research (52 models, mathematically correct):**
- Cameron-Martin, Girsanov, Ito, Fokker-Planck, Malliavin
- Black-Scholes Greeks hedging with P&L decomposition
- Almgren-Chriss execution, Hawkes processes, Copula, Wavelet

**Infrastructure:**
- Exchange simulator — GBM, correlated symbols, multi-exchange, order book, news events, funding rates
- WebSocket server — protocol v2, SHM publishing, Prometheus metrics, rate limiting, delta compression
- Docker Compose — 4 services with healthchecks
- Helm charts — 8-service K8s deployment
- SHM IPC — lock-free ring buffer, Python ↔ C++

## What's Slop (6 modules)

| Module | Claims | Actually is | Fix |
|--------|--------|-------------|-----|
| `lstm_model.py` | LSTM neural network | Linear regression `np.dot(X, W) + b` | Rewrite with PyTorch or delete |
| `transformer_model.py` | Multi-head Transformer | Single-head linear layer, PE unused, only last layer trains | Rewrite or delete |
| `rl_agent.py` | DQN + PPO | Linear model `np.dot(state, weights)` | Delete, use `rl_trader.py` |
| `dpdk_transport.py` | DPDK kernel bypass | Plain Python socket (`_DPDK_AVAILABLE = False`) | Delete or rename |
| `fpga_orderbook.vhd` | FPGA order book, 10GHz, sub-100ns | Non-synthesizable VHDL, "10GHz" physically impossible | Delete or mark TODO |
| `hft-executor` (Rust) | Sub-microsecond order execution | Serializes to JSON, logs, never sends | Implement WebSocket send |

**Slop patterns:**
- "simplified implementation" in class names
- "In production, this would use PyTorch..." disclaimers
- Hardcoded return values (`{'loss': 0.1, 'val_loss': 0.12}`)
- 27+ files with identical "Ported from UI-only X.jsx" headers (batch LLM generation)
- Docstring overkill on trivial functions

## Key Numbers

- 50 trading symbols, 5m timeframe, 60s signal interval
- ~33,000 total lines of code
- 105 autonomous AI sprints
- 52 math models ported from UI to trading logic
- 204 dashboard panels, 227 React components
- 2487 Python tests (0 failed, 17 skipped)

## Key Ports

| Service | Port |
|---------|------|
| Exchange Simulator | 8765 |
| AI Signal Bot (WebSocket) | 8766 |
| HFT Trade Bot (metrics) | 9091 |
| Web UI | 3000 |
| Prometheus | 9090 |
| Grafana | 3001 |
| Alertmanager | 9093 |

## Key Config (`ai-signal-bot/config/settings.yaml`)

- Risk: 2% per trade, 8% daily drawdown, 65% min confidence, 1.5 min R:R
- SL: 2%, TP: 4%, max position: 10%
- Ensemble: majority mode, min 2 votes
- Enabled strategies: trend, meanrev, fft, statarb, sentiment
- Disabled: market_making, ml_ensemble
- Paper trading: true, initial equity: $10,000

## Documentation

| File | Description |
|------|-------------|
| `PROJECT_MEGA_ANALYSIS.txt` | Full code audit (Russian, 1235 lines) |
| `docs/PROJECT_OVERVIEW.md` | Short overview (English) |
| `docs/ARCHITECTURE.md` | Architecture document |
| `docs/future_development.md` | Development roadmap |
| `docs/theory/*.md` | Theory docs (RU + EN, 6 topics each) |

## Development Priorities

1. Fix slop modules (delete or rewrite lstm, transformer, rl_agent, dpdk, fpga)
2. Implement Rust executor WebSocket send
3. Rename "HFT" to "MFT" or reduce signal interval to < 1s
4. Clean up README (remove excess badges, marketing language)
5. Remove "Ported from UI-only" headers from 27+ files
