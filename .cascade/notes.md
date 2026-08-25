# Cascade Notes — HFT Trading System

## Project Context

- **Project:** HFT Trading System — educational crypto HFT simulator
- **Version:** 3.0.0
- **Stack:** Python 3.12 (simulator, signal bot), C++20 (trade bot), Rust (executor), React 18 (web UI)
- **Components:** Exchange Simulator, AI Signal Bot, HFT Trade Bot, hft-executor, Web UI
- **Текущая фаза:** РЕФАКТОРИНГ (22 авг – 1 сен 2026)
- **План:** docs/REFACTORING_PLAN_10DAYS.md

## Reliability Phase — COMPLETE (verified 25 Aug 2026)

All 11 tasks from `.cascade/RELIABILITY_PLAN.md` verified in real code:

| Task | Status | Verified in |
|------|--------|-------------|
| 1. Exchange Sim health+metrics | DONE | `websocket_server.py:175-213` — /health, /live, /ready, /metrics on :8775 |
| 2. docker-compose HTTP healthchecks | DONE | All 3 compose files — HTTP, not TCP |
| 3. Helm HTTP probes | DONE | `helm/templates/*.yaml` — httpGet, not tcpSocket |
| 4. HealthAggregator | N/A | Deprecated, replaced by HealthChecker + HealthServer |
| 5. Observability v2 | DONE | `run.py:38-39,463,475` — HealthChecker, setup_tracing, shutdown_tracing |
| 6. Web UI /health | DONE | `nginx.conf:24-28` — returns 200 |
| 7. Alertmanager config | DONE | `monitoring/alertmanager/config.yml` — ${ENV_VAR} substitution |
| 8. Graceful shutdown | DONE | `run.py:465-470` + `exchange_simulator/__main__.py:133-136` |
| 9. WS retry/backoff | DONE | `ws_client.py:116-159` — exp backoff 1s→60s + jitter ±25% |
| 10. Metrics gaps | DONE | `metrics.py:162-207` — ai_signal_bot_* metrics added |
| 11. Alert rules vs metrics | DONE | `alerts.yml` metric names match `metrics.py` exports |

### Key ports
- Exchange Sim health/metrics: :8775
- AI Bot HealthServer: :8080
- AI Bot MetricsExporter: :9090
- HFT Bot health: :9091
- Web UI health: :3000

## Refactoring Targets (найдено при аудите)

### Дедупликация (Day 2-3)
- `compute_returns` — идентичная функция в 20+ research модулях
- `quantize` — дубликат в info_bottleneck.py и transfer_entropy.py
- Возможны другие дубликаты — нужно проверить

### Упрощение (Day 4-9)
- `research/__init__.py` — 307 строк ручных экспортов + __all__
- `backtester.py` — 506 строк
- `strategies.py` — 472 строки (несколько классов в одном файле)
- `signal_publisher.py` — 453 строки
- `fix_client.py` — 447 строк

### Аудит (Day 5)
- 32 research модуля — проверить какие реально используются
- ML модули — lstm_model.py, transformer_model.py помечены как SLOP

## Known Issues (архив — из предыдущей фазы)

1. README.md badges inflated — FIXED
2. 40+ models exist ONLY as UI (.jsx), NOT in trading logic — FIXED (52 ported)
3. CUDA/ONNX — dead code — REMOVED (Sprint 43)
4. ML models not trained (code exists, no weights) — known limitation
5. Quantum models — 0% — not planned
6. Broker integration — 5% (FIX framework exists, not connected)
7. Real HFT features — 10% (no co-location, DMA, PTP, GPS, tick data)

## Architecture Patterns

- **Communication:** WebSocket (simulator ↔ UI), SHM IPC (bot ↔ C++), FIX 4.4 (C++ framework), FFI (C++ ↔ Rust)
- **Strategies:** 10 Python + 3 auxiliary = 13 total
- **C++ Strategies:** 6
- **ML:** LSTM, Transformer, RL (PPO/DQN), AutoML, Price Predictor — NOT trained
- **Risk:** VaR, CVaR, Kelly, stress test, position sizing
- **Portfolio:** Markowitz, Black-Litterman, risk parity
- **Trading logic models:** 52 (ported from UI)
- **Test files:** 208 (118 Python + 46 C++ + 44 JS)

## Useful Commands (пользователь запускает сам)

```bash
# Run tests
cd ai-signal-bot && python -m pytest tests/

# Run specific test
cd ai-signal-bot && python -m pytest tests/test_hawkes.py -v

# Run exchange simulator
python -m exchange_simulator

# Run AI signal bot
python ai-signal-bot/run.py

# Run web UI
cd web-ui && npm run dev
```

## Workflow Rules

- **ТОЛЬКО IDE** — терминал запрещён (кроме git commit/push)
- **ТЕСТЫ** — пользователь запускает сам
- **КОММИТ** — пользователь делает сам
- **ЧЕСТНОСТЬ** — не врать в документации
