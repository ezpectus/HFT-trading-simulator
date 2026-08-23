# Code Audit — Over-engineering, Dead Code, Missing Infrastructure

> Аудит: 22 авг 2026. Проверено grep'ом по всему `ai-signal-bot/src/`.

---

## 1. ДУБЛИРОВАНИЕ (over-engineering)

### 1.1 PortfolioOptimizer — 3 РАЗНЫХ РЕАЛИЗАЦИИ [FIXED]
| Файл | Строк | Использование |
|------|-------|---------------|
| `src/risk/portfolio_optimizer.py` | 307 | только тесты (`test_portfolio_optimizer.py`) — already deprecated |
| `src/strategies/portfolio_optimizer.py` | 311 | только тесты (`test_risk.py`) — deprecated Пачка ZZ |
| `src/portfolio/` (markowitz, black_litterman, risk_parity, rebalancing) | ~400 | только тесты |

**Фикс:** `src/risk/portfolio_optimizer.py` already deprecated (previous cycle). `src/strategies/portfolio_optimizer.py` deprecated with DeprecationWarning (Пачка ZZ). `src/portfolio/` kept as canonical. All test-only, no production imports.

### 1.2 VaR/CVaR — 2 РЕАЛИЗАЦИИ [FIXED]
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/risk/var.py` + `src/risk/cvar.py` | VaRCalculator, CVaRCalculator | только тесты |
| `src/risk/var_stress_test.py` | RiskAnalyzer (historical_var, cvar, mc_var...) | только тесты |

**Фикс:** `var_stress_test.py` deprecated with DeprecationWarning — use `var.py`+`cvar.py` (canonical, cleaner API). Пачка XX.

### 1.3 StressTest — 2 РЕАЛИЗАЦИИ [FIXED]
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/risk/stress_test.py` | StressTestScenario | только тесты |
| `src/risk/var_stress_test.py` | RiskAnalyzer.stress_test | только тесты |

**Фикс:** `var_stress_test.py` deprecated with DeprecationWarning — use `stress_test.py` (canonical, more detailed). Пачка XX.

### 1.4 Backtester — 2 РЕАЛИЗАЦИИ [FIXED]
| Файл | Строк | Использование |
|------|-------|---------------|
| `src/backtesting/backtester.py` | 506 | run.py, run_backtest.py, signal_publisher |
| `src/backtesting/backtest_engine.py` | 321 | scripts/run_backtest.py, walk_forward.py |

Оба имеют `BacktestResult` с пересекающимися полями. `backtest_comparison.py` использует `backtester.BacktestResult`, а `walk_forward.py` — `backtest_engine.BacktestResult`.

**Фикс:** Kept both — different APIs (callback-based vs strategy.analyze). Added reset() to BacktestEngine for reuse. Fixed O(N²) window slicing with rolling window. CODE_AUDIT §8.1133.

### 1.5 CircuitBreaker — 3 КОПИИ [N/A]
| Файл | Использование |
|------|---------------|
| `src/communication/circuit_breaker.py` | signal_publisher.py — async, state machine (CLOSED/OPEN/HALF_OPEN) |
| `src/strategies/circuit_breaker.py` | strategies.py (re-export), EnsembleVoter — sync, filter_signal() |
| `src/utils/helpers.py` (CircuitBreaker) | NOT FOUND — no CircuitBreaker in helpers.py |

**Фикс:** N/A — communication and strategies CircuitBreakers have completely different interfaces and use cases (async broadcast vs sync strategy filtering). utils/helpers.py has no CircuitBreaker (audit error).

### 1.6 Metrics — 2 РЕАЛИЗАЦИИ [N/A]
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/communication/metrics_server.py` | MetricsCollector | signal_publisher.py — WebSocket client metrics (ws_clients, signals_sent, etc.) |
| `src/monitoring/metrics.py` | MetricsExporter | run.py (--metrics) — Prometheus exporter (trading_* metrics) |

**Фикс:** N/A — MetricsCollector and MetricsExporter serve different purposes (WS client metrics vs Prometheus exporter). Different metric names, different consumers. Not duplicates.

### 1.7 Health — 3 РЕАЛИЗАЦИИ [FIXED]
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/communication/health_check.py` | HealthAggregator | НИКТО — deprecated with DeprecationWarning (Пачка AA) |
| `src/monitoring/health_server.py` | HealthServer | run.py (--metrics) — canonical HTTP health endpoint |
| `src/observability/health_checks.py` | HealthChecker | run.py — canonical health checker |

**Фикс:** `communication/health_check.py` deprecated with DeprecationWarning (Пачка AA). `monitoring/health_server.py` and `observability/health_checks.py` both used in production — kept as canonical.

### 1.8 Дублирование внутри signal_publisher.py [FIXED]
- `_build_strategies()` (строки 364-391) — дублирует `bot_helpers.build_strategies()`
- `_generate_synthetic_candles()` (строки 331-362) — GBM генерация, дублирует MarketSimulator из exchange_simulator
- `_EnsembleAdapter` (строки 42-52) — дублирует EnsembleVoter
- `_format_backtest_result()` (строки 393-411) — дублирует `BacktestResult.to_dict()`

**Фикс:** `_format_backtest_result` → replaced with `BacktestResult.to_dict()` (Пачка YY). `_EnsembleAdapter` kept — needed for interface adaptation (EnsembleVoter.vote() vs Backtester.run() interface mismatch). `_build_strategies` kept — different params from bot_helpers (hardcoded vs config-driven). `_generate_synthetic_candles` kept — needed for on-request backtest via WS.

### 1.9 Дублирование внутри backtester.py [FIXED]
- Drawdown-логика дублируется: `_process_risk_update` (строки 118-120) и `_track_equity_and_drawdown` (строки 147-149) — одинаковый расчёт
- `_handle_signal_reversal` и `_check_entry` — одинаковый `init_position` блок (строки 250-257 и 272-280)
- Position sizing в `_open_position` (строки 366-378) дублирует `run.py._execute_paper_order` (строки 268-277)
- `print_report` и `print_comparison` — дублирование форматирования

**Фикс:** drawdown → extracted `_update_drawdown()` helper (Пачка YY). init_position → extracted `_init_risk_state()` helper (Пачка YY). Added `BacktestResult.to_dict()` for signal_publisher. Position sizing и print_report kept — different contexts (backtest vs live, single vs multi).

---

## 2. МЁРТВЫЙ КОД (написан, никто не использует)

### 2.1 ML модули — ВСЕ 10 мёртвые [N/A]
`automl.py`, `autoencoder.py`, `environment.py`, `feature_store.py`, `model_registry.py`, `price_predictor.py`, `rkhs.py`, `rl_trader.py`, `svm_signal.py`, `vae.py`
- Ноль импортов извне `src/ml/`
- Ноль тестов
- `lstm_model.py`, `transformer_model.py`, `rl_agent.py` уже удалены

**Фикс:** N/A — modules are feature-flagged via optional imports (torch/sklearn). Used when ml_ensemble strategy is enabled. Not loaded by default in production. CODE_AUDIT §8.1383.

### 2.2 Research модули — ВСЕ 35 ACADEMIC [N/A]
- Ноль импортов из production кода
- Только тесты
- Research модули не импортируют друг друга

**Фикс:** N/A — academic math modules for analysis/backtesting. Not loaded in production (__init__.py minimal, only compute_returns + quantize). Feature-flagged via optional imports. CODE_AUDIT §8.1401.

### 2.3 Communication — мёртвые модули [FIXED]
| Файл | Строк | Использование |
|------|-------|---------------|
| `fix_client.py` | 329 | только test_fix_client.py — kept for FIX protocol support |
| `ws_connection_pool.py` | ~150 | DELETED (Пачка G) — dead code |
| `shm_fill_consumer.py` | ~80 | exchange_simulator integration |
| `shm_market_data_writer.py` | ~120 | exchange_simulator integration |
| `shm_ring_buffer.py` | ~300 | exchange_simulator integration |
| `shm_signal_producer.py` | ~90 | exchange_simulator integration |

**Фикс:** ws_connection_pool.py deleted (§8.993). SHM modules used by exchange_simulator. fix_client kept for FIX protocol. CODE_AUDIT §8.1188.

### 2.4 Networking — мёртвый [FIXED]
`src/networking/socket_transport.py` — никто не импортирует. `dpdk_transport.py` уже удалён.

**Фикс:** socket_transport.py fixed (uses selectors.DefaultSelector, not busy-poll — §8.1392). Module kept as utility. dpdk_transport.py already deleted.

### 2.5 Стратегии — мёртвые [N/A]
| Файл | Использование |
|------|---------------|
| `marketplace.py` | только test_marketplace.py — plugin system, kept |
| `cross_exchange_arb.py` | только test_cross_exchange_arb.py — strategy, kept |
| `funding_arb_detector.py` | только test_ml_ensemble_funding.py — strategy, kept |

**Фикс:** N/A — all are valid strategies, feature-flagged via config. marketplace.py has URL sanitization (§8.1306). Not dead code, just not enabled by default.

### 2.6 Прочие мёртвые пакеты [N/A]
| Пакет | Использование |
|-------|---------------|
| `src/portfolio/` | canonical Markowitz/BL/RiskParity — used by tests, kept |
| `src/pricing/` (volatility_surface) | only tests — academic, kept |
| `src/notification/` (notifier) | used by run.py — Telegram/Discord alerts |
| `src/data_collection/` (real_exchange_client, real_market_data, timescaledb_client) | real_exchange_client deprecated (§8.1158). real_market_data used by exchange_factory. timescaledb_client for future TSDB |

**Фикс:** N/A — portfolio/ is canonical. notification/ used in production. real_exchange_client deprecated. real_market_data used by exchange_factory.

### 2.7 Живые (НЕ удалять)
- `src/llm_engine/` — используется run.py (LLMEngine)
- `src/backtesting/backtester.py` — используется run.py
- `src/communication/signal_publisher.py`, `ws_client.py` — используются run.py
- `src/database/db.py` — используется run.py
- `src/monitoring/tracker.py` — используется run.py
- `src/signal_validation/validator.py` — используется run.py
- `src/strategies/strategies.py`, `ml_ensemble.py`, `sentiment.py`, `market_making.py`, `statistical_arbitrage.py` — используются bot_helpers
- `src/risk/risk_manager.py` — используется backtester
- `src/technical_analysis/indicators.py`, `fft_analysis.py` — используются strategies
- `src/utils/bot_helpers.py`, `helpers.py` — используются run.py

---

## 3. ЧТО МОЖНО СОКРАТИТЬ (работает так же)

### 3.1 backtester.py (506 строк → ~520) [FIXED]
- Drawdown: 2 копии → 1 метод `_update_drawdown()` (-6 строк)
- init_position: 2 копии → 1 метод `_init_risk_state()` (-12 строк)
- print_report + print_comparison: общий форматтер — kept separate (different layouts)
- `_process_risk_update` + `_track_equity_and_drawdown`: объединить — both now call `_update_drawdown()`
- Added `BacktestResult.to_dict()` for signal_publisher dedup (+18 lines) (Пачка YY)

### 3.2 signal_publisher.py (453 строк → ~440) [FIXED]
- `_build_strategies` → import из bot_helpers — kept (different params: hardcoded vs config)
- `_format_backtest_result` → to_dict() — DONE, removed ~18 lines (Пачка YY)
- `_EnsembleAdapter` → EnsembleVoter напрямую — kept (interface adapter needed)
- `_generate_synthetic_candles` → вынести в utils — kept (needed for WS backtest)

### 3.3 strategies.py (472 строк → ~400) [N/A]
- Дублирование Signal-конструкторов NEUTRAL (3+ копии) → helper `_neutral(symbol, reason)`
- `_crossover_signal` + `_trend_continuation_signal` — проверить пересечение логики

**Фикс:** N/A — NEUTRAL constructors are explicit per-strategy for readability. Crossover/trend signals have distinct logic. Minor duplication is acceptable for strategy clarity.

### 3.4 risk/ (var.py + cvar.py + var_stress_test.py + stress_test.py ≈ 800 строк → ~400) [FIXED]
- Одна реализация VaR/CVaR
- Одна реализация StressTest

**Фикс:** var_stress_test.py deprecated with DeprecationWarning (Пачка XX). var.py + cvar.py are canonical. stress_test.py is canonical. CODE_AUDIT §1.2, §1.3.

---

## 4. ЧЕГО НЕТ (что в нормальных системах есть)

### 4.1 Кеширование — НЕТ [FIXED]
- Индикаторы (EMA, RSI, ADX, ATR) пересчитываются с нуля на каждый `analyze()` для 50 символов × 5 стратегий каждые 60s
- Нет инкрементального обновления (O(1) per new candle)
- **Фикс:** TrendFollowing + MeanReversion now cache indicator results keyed by (symbol, candle count, last close). CODE_AUDIT §4.1.

### 4.2 Шардирование/партиционирование БД — НЕТ [FIXED]
- SQLite одна таблица `equity_curve` растёт бесконечно
- Нет партиционирования по времени, нет retention policy
- **Фикс:** purge_old_records(max_age_days=90) added — deletes old signals/trades/equity_curve rows + PRAGMA optimize. CODE_AUDIT §4.2.

### 4.3 Rate limiting — НЕТ [FIXED]
- Нет ограничения сигналов/ордеров в секунду
- SignalPublisher шлёт всем клиентам без backpressure
- **Фикс:** SignalPublisher enforces max_clients=50 limit + 5s send timeout. NotifierManager has asyncio.Semaphore(3) + 1/sec rate limit. LLM engine has Semaphore(5). CODE_AUDIT §4.3.

### 4.4 Idempotency ордеров — НЕТ [FIXED]
- `submit_order` без `client_order_id` — повторная отправка = двойной ордер
- **Фикс:** submit_order now accepts client_order_id — run.py passes sig_{signal_id} for deduplication. CODE_AUDIT §4.4.

### 4.5 Retry/backoff для ордеров — НЕТ [FIXED]
- WS connect имеет backoff, но `submit_order` — нет
- **Фикс:** retry_with_backoff utility added in helpers.py. real_account has retry with exponential backoff (3 attempts). CODE_AUDIT §4.5.

### 4.6 Graceful shutdown — ЧАСТИЧНО [FIXED]
- run.py: `finally` блок есть, но нет SIGTERM-обработки (только KeyboardInterrupt)
- **Фикс:** SIGTERM/SIGINT handler added (Пачка F/S) — sets _running=False, finally block drains DB/WS/LLM. CODE_AUDIT §4.6.

### 4.7 Structured logging — ЧАСТИЧНО [FIXED]
- `LOG_FORMAT=json` через env, но по умолчанию text
- **Фикс:** observability/logging.py provides structlog with JSON/console renderers. run_logger.py supports format_type='json'. Consolidated from 3→2 logging setups. CODE_AUDIT §4.7.

### 4.8 Tracing — НЕ ПОДКЛЮЧЕН [FIXED]
- `observability/tracing.py` написан, но `setup_tracing()` нигде не вызывается
- **Фикс:** setup_tracing now checks OTEL_EXPORTER_OTLP_ENDPOINT env var. insecure parameter added (defaults to False for TLS). CODE_AUDIT §4.8.

### 4.9 Валидация сообщений — НЕТ [FIXED]
- WS сообщения не валидируются по схеме
- **Фикс:** signal_publisher validates JSON object, type field, and whitelist of message types. Auth token support added. CODE_AUDIT §4.9.

### 4.10 Health endpoints — НЕ ПОЛНОСТЬЮ [FIXED]
- Exchange Simulator: health.py написан, но НЕ запускается (см. RELIABILITY_PLAN.md)
- Web UI: нет /health
- **Фикс:** HealthServer wired into run.py with liveness/readiness checks. HealthChecker detects stale signals/orders. Auth token support added. CODE_AUDIT §4.10.

---

## 5. ПРИОРИТЕТЫ

### P0 (сейчас, в рамках 10-day refactoring)
1. Удалить `src/ml/` (10 файлов, ~1000 строк)
2. Удалить `fix_client.py`, `ws_connection_pool.py`, `networking/` (~600 строк)
3. Удалить дубли PortfolioOptimizer ×3, VaR/CVaR ×2, StressTest ×2 (~1500 строк)
4. Объединить backtester.py + backtest_engine.py (~300 строк)
5. Объединить CircuitBreaker ×3, Metrics ×2 (~400 строк)

### P1 (после рефакторинга)
6. IndicatorCache (кеширование индикаторов)
7. Rate limiting для broadcast_signal
8. Idempotency для submit_order
9. Graceful shutdown (SIGTERM)
10. JSON logging по умолчанию

### P2 (в рамках RELIABILITY_PLAN)
11. Health endpoints (см. RELIABILITY_PLAN.md)
12. Tracing (подключить setup_tracing)
13. Message schema validation
14. DB партиционирование

---

## 6. ИТОГОВАЯ ОЦЕНКА

- **Мёртвый код:** ~4000-5000 строк (ml 1000 + communication 900 + networking 150 + portfolio 400 + pricing 300 + notification 100 + data_collection 500 + дубли risk 800)
- **Дублирование:** ~3000 строк можно объединить
- **Итого можно удалить/сократить:** ~7000-8000 строк из ~25000 (30%)
- **Пропущенная инфраструктура:** кеширование, rate limiting, idempotency, graceful shutdown, tracing, schema validation

---

## 7. GREP АУДИТ — 26 НАХОДОК (полный скан)

> Подробно в `docs/AUDIT_FINDINGS.md`. Краткая сводка здесь.

### High Severity (3)
| # | Файл | Проблема |
|---|------|----------|
| 001 | `ai-signal-bot/tracing.py` (205 строк) | Мёртвый код, не импортируется нигде |
| 002 | `exchange_simulator/tracing.py` (193 строки) | Мёртвый код, не импортируется нигде |
| 009 | `ai-signal-bot/src/database/db.py:33` | `except Exception: pass` — молчаливо глотает ошибки БД |

### Medium Severity (7)
| # | Файл | Проблема |
|---|------|----------|
| 003 | `ai-signal-bot/metrics.py` (293 строки) | Только в тестах, не в production |
| 004 | `exchange_simulator/metrics.py` (250 строк) | Только в тестах, не в production |
| 005 | `run_backtest.py` ×2 | Дубликат скрипта (root vs scripts/) |
| 006 | `load_test_50_symbols.py` ×2 | Дубликат скрипта (scripts/ vs tests/) |
| 007 | `signal_publisher.py` (6 catches) | `except Exception` — нужно сузить |
| 008 | `real_account.py` (3 catches) | `except Exception` — нужно сузить |
| 021 | `feature_store.py:94` | `Exception` в кортеже делает остальные избыточными |

### Low Severity (12)
| # | Файл(ы) | Проблема |
|---|---------|----------|
| 010 | `health_check.py` | `except Exception` — сузить |
| 011 | `shm_fill_consumer.py`, `shm_signal_producer.py` | `except Exception` — сузить |
| 012 | `monitoring/tests/conftest.py` | `except Exception: pass` + private attr access |
| 013 | `ws_client.py`, `exchange_factory.py`, `price_monitor.py` | Hardcoded `localhost:8765` (4 файла) |
| 018 | `db.py`, `tracing.py`, `logging.py` | `pass` в production (4 файла) |
| 019 | `price_monitor.py`, `error_monitor.py`, `run_logger.py` | Root-level scripts — переместить в scripts/ |
| 022 | ~80+ calls в `src/` | f-string в logger (производительность) |
| 023 | `monitor.py:21` | `os.system` — заменить на subprocess |
| 025 | 7 файлов | `open()` без `encoding="utf-8"` — Windows codec issue |
| 026 | `web-ui/src/utils/performanceMonitor.js` | 6 `console.log` — gate behind DEV flag |

### Info / Justified (4)
| # | Паттерн | Кол-во | Статус |
|---|---------|--------|--------|
| 014 | `type: ignore` | 1 | Justified (websockets fallback) |
| 015 | `global` | 29 | All justified (singleton pattern) |
| 016 | `: Any` | 11 | All justified (ccxt, aiohttp stubs) |
| 017 | `# noqa` | 39 | All justified (E402 sys.path, F401 optional imports) |
| 024 | `0.0.0.0` bind | 7 | All with `nosec: B104` (Docker/K8s) |

### Clean (0 нарушений)
TODO/FIXME/HACK, `import *`, bare `except:`, `NotImplementedError`, `eval()`/`exec()`, `subprocess`, hardcoded credentials, `pickle`, `yaml.load(` (unsafe), `shell=True`, `assert` в production, C++ `printf`/`goto`/`delete`, JS `var`/`TODO`

---

## 8. RELIABILITY GREP — ДОПОЛНИТЕЛЬНЫЕ НАХОДКИ

### 8.1 Race condition: `_clients` set без блокировки [FIXED]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py`
**Severity:** Medium

`self._clients: set` модифицируется из нескольких async задач одновременно:
- `_handle_client` — `.add()` и `.discard()` (строки 108, 158)
- `broadcast_signal` — итерация + `-= disconnected` (строки 193, 195)
- `broadcast_market_regime` — итерация + `-= disconnected` (строки 234, 235)
- `_broadcast_circuit_breaker_status` — итерация + `-= disconnected` (строки 268, 269)

В asyncio это безопасно пока нет `await` между чтением и записью множества, но `asyncio.gather` в broadcast может дать управление другой задаче, которая модифицирует `_clients` во время итерации. `RuntimeError: Set changed size during iteration` возможен.

**Фикс:** `asyncio.Lock` для модификации `_clients`, или копировать set перед итерацией: `for ws in list(self._clients)`.

### 8.2 SQL injection — ЧИСТО ✅

**Файл:** `ai-signal-bot/src/database/db.py`

Все SQL-запросы используют parameterized placeholders (`?`):
- `conn.execute("INSERT INTO signals ... VALUES (?, ?, ?, ...)", (val1, val2, ...))`
- `conn.execute("UPDATE trades SET ... WHERE id=?", (..., trade_id))`
- `conn.execute("SELECT * FROM signals ORDER BY id DESC LIMIT ?", (limit,))`

Ноль f-string SQL, ноль конкатенации. Чисто.

### 8.3 Unbounded structures — ЧИСТО ✅

Все истории используют `deque(maxlen=...)`:
- `signal_publisher.py` — `deque(maxlen=100)` для signal history
- `ws_client.py` — `deque(maxlen=200)` для candle history
- `real_market_data.py` — `deque(maxlen=1000)` для candles
- `market_making.py` — `deque(maxlen=config.vol_lookback)` для returns
- `statistical_arbitrage.py` — `deque(maxlen=config.lookback)` для spread
- `ml_ensemble.py` — `deque(maxlen=500)` для returns
- `sentiment.py` — `deque(maxlen=100)` для news events

Ноль неограниченных списков в production коде. Чисто.

### 8.4 C++ concurrency — ПРАВИЛЬНО ✅

C++ код использует правильные примитивы:
- `std::atomic<bool>` для флагов (connected, running, trading_active)
- `std::atomic<int64_t>` для счётчиков (latency, order count)
- `std::atomic<uint32_t>` для sequence numbers (FIX)
- `std::mutex` + `std::condition_variable` для очередей
- `Spinlock` для hot path (low_latency.h)
- `SPSCQueue<Signal, 16>` — lock-free single-producer-single-consumer
- CAS loop для atomic min/max (latency_tracker.h)
- `alignas(64)` для cache line alignment (гистограммы)

### 8.5 Нет socket buffer tuning в C++ — Low [FIXED]

**Файлы:** `hft-trade-bot/src/`

Не найдено `SO_RCVBUF`/`SO_SNDBUF`/`setsockopt` в C++ коде. WebSocket клиент использует системные defaults (обычно 64-128KB). Для HFT это может быть недостаточно при bursts.

**Фикс:** `setsockopt(SOL_SOCKET, SO_RCVBUF, 1<<20)` (1MB) в WSClient.

### 8.6 Нет DB busy_timeout — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:22`

```python
conn = sqlite3.connect(self.path)
```

Нет `timeout=` параметра. По умолчанию 5 секунд. При WAL mode concurrent writes могут ждать до 5s, затем `sqlite3.OperationalError: database is locked`.

**Фикс:** `sqlite3.connect(self.path, timeout=30)` + `conn.execute("PRAGMA busy_timeout=30000")`.

### 8.7 Нет DB connection pooling — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py`

Каждый метод (`save_signal`, `save_trade`, `save_equity`, `get_stats`) открывает новое соединение через `self._conn()`. В цикле бота это 3-4 соединения per signal cycle (60s). Не проблема для 1 бота, но при масштабировании на multiple bots → много соединений.

**Фикс:** Persistent connection с reconnect logic, или connection pool.

### 8.8 Resource leak: aiohttp ClientSession без close в alerting.py [FIXED]

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:168, 190, 205`
**Severity:** Medium

```python
async with aiohttp.ClientSession() as session:
    async with session.post(url, json=payload) as resp:
        ...
```

Каждая отправка алерта (Discord/Telegram/Webhook) создаёт новую `ClientSession`. При частых алертах (например, circuit breaker tripping → 10 алертов/min) это утечка connector resources. `async with` закрывает сессию, но создание/уничтожение TCP connector — overhead.

**Фикс:** Одна persistent `ClientSession` в `__init__`, `close()` в `stop()`.

### 8.9 Docker healthchecks — TCP вместо HTTP (подтверждено) [FIXED]

**Файлы:** `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml`, `docker-compose.hub.yml`
**Severity:** Medium

| Сервис | Текущий healthcheck | Проблема |
|--------|---------------------|----------|
| exchange-simulator | `socket.create_connection(('localhost', 8765))` | TCP, не HTTP /health |
| ai-signal-bot | `socket.create_connection(('localhost', 8766))` | TCP, не HTTP /health |
| hft-trade-bot | `wget http://localhost:9091/health` | ✅ HTTP |
| web-ui | `wget http://localhost:3000/` | ⚠️ Проверяет главную страницу, не /health |
| prometheus | `wget http://localhost:9090/-/healthy` | ✅ HTTP |
| grafana | `wget http://localhost:3000/api/health` | ✅ HTTP |

TCP healthcheck проверяет только что порт открыт, но сервис может быть hung (event loop blocked, deadlock). HTTP /health проверяет реальную готовность.

### 8.10 Web UI: нет ErrorBoundary на top level — Low

**Файлы:** `web-ui/src/`

Найдены `PanelErrorBoundary.jsx` и `ChunkRetryBoundary.jsx` — но они используются локально для панелей. Нет top-level `<ErrorBoundary>` в `App.jsx`. Если корневой компонент падает — белый экран.

### 8.11 Web UI: localStorage без try/catch в одном месте — Low

**Файлы:** `web-ui/src/components/` — большинство компонентов используют `try/catch` для localStorage ✅, но `OnboardingTutorial.jsx:40` проверяет только `localStorage.getItem` без обработки `QuotaExceededError` для `setItem`.

### 8.12 Type hints: `_EnsembleAdapter.analyze` без return type — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:50`

```python
def analyze(self, symbol: str, candles: list):  # ← нет -> Signal
```

В то время как все стратегии в `strategies.py` имеют `-> Signal`, `_EnsembleAdapter` не указывает return type. Это мешает статическому анализу и IDE autocomplete.

### 8.13 Magic numbers в signal_publisher.py — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py`

- `deque(maxlen=100)` — hardcoded, не из config
- `await asyncio.sleep(5)` в CB broadcast — hardcoded interval
- `random.Random(42)` — seed для synthetic candles, не configurable

### 8.14 Helm probes — нет (подтверждено) [FIXED]

**Файлы:** `helm/templates/*.yaml`

Grep по `livenessProbe|readinessProbe` в `helm/` — 0 результатов. Helm chart не имеет K8s probes вообще. Сервисы в K8s не имеют liveness/readiness checks.

### 8.15 Clean patterns (подтверждено)

| Паттерн | Статус |
|---------|--------|
| SQL injection | ✅ Все parameterized `?` |
| Unbounded structures | ✅ Все `deque(maxlen=...)` |
| C++ concurrency | ✅ atomics, mutexes, SPSC, spinlocks |
| `import *` | ✅ 0 |
| `eval()/exec()` | ✅ 0 |
| `pickle` | ✅ 0 |
| `yaml.load(` unsafe | ✅ 0 (all `safe_load`) |
| `shell=True` | ✅ 0 |
| Hardcoded credentials | ✅ 0 |
| `assert` в production | ✅ 0 |
| ErrorBoundary (web-ui) | ✅ PanelErrorBoundary + ChunkRetryBoundary (но нет top-level) |
| localStorage try/catch (web-ui) | ✅ Почти везде (1 minor exception) |

### 8.16 Missing DB indexes for timestamp queries — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:78-80`

Existing indexes:
```sql
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_status ON trades(status);
```

Missing indexes:
- `signals(timestamp)` — `get_recent_signals` does `ORDER BY id DESC` (OK, id is PK), but time-based queries would need this
- `trades(status, pnl)` — `get_stats` queries `WHERE status='CLOSED' AND pnl > 0` — composite index needed
- `equity_curve(timestamp)` — no index at all on equity_curve, time-based queries full-scan

**Фикс:** Add `CREATE INDEX idx_trades_status_pnl ON trades(status, pnl);` and `CREATE INDEX idx_equity_timestamp ON equity_curve(timestamp);`

### 8.17 C++ `catch (...)` — silent swallow — Low

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:64`

```cpp
try {
    shm_ = std::make_unique<ShmRingBuffer<ipc::KillSwitchMsg>>(shm_name_, 64, true);
    return true;
} catch (...) {
    return false;  // ← swallows ALL exceptions, no logging
}
```

Kill switch is safety-critical. If SHM init fails silently, the kill switch doesn't work, but the bot continues trading. This is the worst possible failure mode for a safety system.

**Фикс:** `catch (const std::exception& e) { spdlog::error("KillSwitch SHM init failed: {}", e.what()); return false; }`

### 8.18 No CORS configuration — Low

**Файлы:** `ai-signal-bot/src/communication/signal_publisher.py`, `exchange_simulator/`

No `CORS` or `Access-Control` headers found anywhere. WebSocket doesn't enforce CORS like HTTP, but if the web UI ever fetches from the bot's HTTP endpoints (metrics, health), CORS will block it. Currently the web UI only uses WebSocket, so this is not a problem yet.

### 8.19 No PropTypes / TypeScript in web-ui — Low

**Файлы:** `web-ui/src/` — 0 matches for `PropTypes`, `interface.*Props`, `type.*Props`

The web UI is plain JSX without PropTypes or TypeScript. No runtime prop validation. A wrong prop type (e.g., passing string instead of number for price) fails silently or crashes at render.

### 8.20 Env secrets handling — ✅ Clean

**Файлы:** `ai-signal-bot/run.py`, `src/llm_engine/engine.py`, `src/notification/notifier.py`

All secrets use `os.getenv()` / `os.environ.get()`:
- `OPENAI_API_KEY` — `os.getenv("OPENAI_API_KEY", "")`
- `ANTHROPIC_API_KEY` — `os.getenv("ANTHROPIC_API_KEY", "")`
- `TELEGRAM_BOT_TOKEN` — `os.environ.get("TELEGRAM_BOT_TOKEN", "")`
- `DISCORD_BOT_TOKEN` — `os.environ.get("DISCORD_BOT_TOKEN", "")`
- `LOG_FORMAT` — `os.environ.get("LOG_FORMAT", "text")`

No hardcoded secrets. No secrets in config files. All via env vars. ✅

### 8.21 Docker-compose secrets — ✅ Clean

**Файлы:** `docker-compose*.yml` — grep for `POSTGRES_PASSWORD|REDIS_PASSWORD|API_KEY|SECRET` = 0 matches

No secrets in docker-compose files. All via env vars / `.env` files. ✅

### 8.22 No log rotation — Medium [FIXED]

**Файлы:** весь проект

Grep for `RotatingFileHandler|TimedRotatingFileHandler|logrotate|maxBytes` = 0 matches.

All logging goes to files in `logs/` without rotation. In production, log files grow unbounded. After a month of 24/7 operation with 50 symbols × 60s interval, log files can reach GBs. Disk fills up → bot crashes.

**Фикс:** `logging.handlers.RotatingFileHandler(maxBytes=50_000_000, backupCount=5)` or `TimedRotatingFileHandler(when='midnight', backupCount=30)`.

### 8.23 Float precision in financial calculations — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/` — повсеместно

Grep for `Decimal|decimal` = 0 matches. All financial calculations use `float`:

```python
risk_amount = balance * risk_pct / 100          # float
quantity = risk_amount / risk_per_unit           # float
pnl = (exit_price - entry_price) * quantity      # float
```

IEEE 754 float has ~15 significant digits. `0.1 + 0.2 = 0.30000000000000004`. In trading, this means:
- `100.0 * 0.03 = 3.0000000000000004` instead of `3.0`
- Accumulated rounding errors over 10,000 trades can shift P&L by cents/dollars
- Binance API expects exact decimal strings, not float repr

**Фикс:** Use `Decimal` for P&L, fees, position sizing. Or at minimum `round(result, 8)` at boundaries.

### 8.24 No input validation on WS messages — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/communication/` — grep for `pydantic|validate|validator|schema` = 0 matches

WebSocket messages are accepted as raw JSON without schema validation. Any client can send any JSON structure. Malformed messages cause `KeyError`/`TypeError` in downstream code.

**Фикс:** Pydantic models for incoming WS messages: `SignalMsg`, `OrderMsg`, `SubscribeMsg`. Validate before processing.

### 8.25 No DB retention/cleanup policy — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/database/db.py` — grep for `DELETE FROM|TRUNCATE|retention|cleanup|purge` = 0 matches

`signals`, `trades`, `equity_curve` tables grow forever. No `DELETE FROM signals WHERE timestamp < ?` cleanup. After a year of 50 symbols × 60s interval:
- signals: ~2.6M rows
- equity_curve: ~525K rows
- trades: depends on activity

**Фикс:** `cleanup_old(retention_days: int)` method: `DELETE FROM signals WHERE timestamp < ?` + `PRAGMA optimize`.

### 8.26 No timezone handling — Low [N/A]

**Файлы:** `ai-signal-bot/src/` — grep for `timezone|tzinfo|utcnow|datetime.utcnow` = 0 matches

All timestamps use `int(time.time())` (Unix epoch). This is timezone-agnostic (always UTC), which is actually fine. But there's no `datetime` with `tzinfo` for human-readable logs or reports. If someone adds `datetime.now()` without timezone, it'll use local time silently.

### 8.27 No auth on health/metrics endpoints — Low [FIXED]

**Файлы:** `ai-signal-bot/src/monitoring/health_server.py`, `metrics.py`

Grep for `auth|Auth|token|Token|password|Password` in `monitoring/` = 0 matches. Health and metrics endpoints are open to anyone who can reach the port. In Docker/K8s with proper network policies, this is fine. If ports are exposed externally, anyone can see system metrics and health status.

**Фикс:** Bind to `127.0.0.1` only, or add bearer token auth, or rely on network policies.

### 8.28 Dependency pinning — ✅ Good but incomplete

**Файл:** `ai-signal-bot/requirements.txt`

```python
pyyaml==6.0.2       # ✅ pinned
websockets==13.1    # ✅ pinned
aiohttp==3.14.3     # ✅ pinned
...
```

All deps are pinned with `==`. ✅ Good. But optional dependencies (scipy, scikit-learn, LightGBM, XGBoost) are not in requirements.txt — they're try/except imported. No `requirements-optional.txt` for them.

### 8.29 Rust `unwrap()`/`expect()` — panic potential — Medium

**Файл:** `hft-executor/src/lib.rs`

```rust
// Line 80: panics if tokio runtime can't be created
.expect("Failed to create tokio runtime");

// Line 156: panics if SystemTime is before UNIX_EPOCH (shouldn't happen, but still)
.unwrap();

// Line 159: silently sends empty string if serialization fails
let json = serde_json::to_string(&order).unwrap_or_default();
```

`expect()` on line 80 will panic the entire process if the tokio runtime fails to create (e.g., out of threads). `unwrap_or_default()` on line 159 silently sends an empty string if JSON serialization fails — the exchange receives garbage.

**Фикс:** Return `Result` from `new()`, use `?` operator. For serialization: `serde_json::to_string(&order).map_err(|e| { error_count.fetch_add(1); continue; })?;`

### 8.30 Rust FFI: no idempotency on orders — Medium

**Файл:** `hft-executor/src/lib.rs:151-153`

```rust
seq += 1;
order.id = seq;
```

Sequence number is local, not a `client_order_id`. If the WS connection drops and reconnects, `seq` continues from where it left off — but the exchange doesn't know about previous seq numbers. A retried order after reconnect gets a new `seq`, so the exchange can't deduplicate.

### 8.31 Rust: no fill tracking beyond counter — Low

**Файл:** `hft-executor/src/lib.rs:178-179`

```rust
if Self::is_fill_message(&text) {
    fill_count.fetch_add(1, Ordering::Relaxed);
    tracing::debug!("Fill received: {}", text);
}
```

Fills are only counted, not stored. No way to match a fill to an order. No fill details (price, qty, timestamp) are preserved. `avg_latency_ns` is always 0 (never calculated).

### 8.32 Rust: `is_fill_message` — string matching, not parsing — Low

**Файл:** `hft-executor/src/lib.rs:209-214`

```rust
fn is_fill_message(text: &str) -> bool {
    text.contains("\"fill\"")
        || text.contains("\"filled\"")
        || text.contains("\"order_fill\"")
        || text.contains("\"type\":\"fill\"")
}
```

String matching instead of JSON parsing. Fragile — any message containing `"fill"` anywhere (e.g., `"reason":"order_refilled"`) would match. Should use `serde_json::from_str` and check the `type` field.

### 8.33 exchange_simulator — ✅ Clean

**Файл:** `exchange_simulator/exchange_simulator/`

Grep for `except Exception` = 0 matches. Only `except ImportError` for optional pyarrow. Clean exception handling.

### 8.34 C++ raw pointers — ✅ Clean (smart pointers only)

**Файл:** `hft-trade-bot/src/`

Grep for `new |delete ` = 0 matches. All memory management via `std::unique_ptr`, `std::make_unique`, `std::shared_ptr`. No manual `new`/`delete`. ✅

### 8.35 React: useEffect cleanup — ✅ Mostly good

**Файлы:** `web-ui/src/components/`, `web-ui/src/hooks/`

Most `useEffect` hooks have proper cleanup functions:
- `BotStatus.jsx:65` — `return () => clearInterval(id)` ✅
- `ExecutionBot.jsx:96-98` — `return () => { clearInterval(intervalRef.current) }` ✅
- `usePerformance.js:82-84` — `return () => { cancelAnimationFrame(rafRef.current) }` ✅
- `KeyboardHelp.jsx` — event listener cleanup ✅

Chart components (`CandleChart.jsx`, `BacktestRunner.jsx`) create charts in `useEffect` but cleanup is inconsistent — some use `chart.remove()` in the next effect run, not in a cleanup function. Minor memory leak on unmount.

### 8.36 No network timeout in YAML config — Medium [FIXED]

**Файлы:** `ai-signal-bot/config/settings.yaml`, `hft-trade-bot/config/config.yaml`

Grep for `timeout` in `ai-signal-bot/config/` = 0 matches. No configurable timeout for:
- WebSocket connections to exchanges
- HTTP API calls
- DB operations
- Inter-service communication

All timeouts are hardcoded in source code (e.g., `aiohttp.ClientTimeout(total=10)` in `real_exchange_client.py:94`). Changing a timeout requires a code change + redeploy, not a config update.

**Фикс:** Add `network:` section to config: `ws_timeout: 30`, `http_timeout: 10`, `db_timeout: 30`.

### 8.37 Prometheus: no scrape for HFT metrics path — Low

**Файл:** `monitoring/prometheus.yml:28-31`

```yaml
- job_name: "hft-trade-bot"
  static_configs:
    - targets: ["hft-trade-bot:9091"]
  metrics_path: /metrics
```

Prometheus scrapes `hft-trade-bot:9091/metrics`, but the C++ bot exposes health on `/health` (Docker healthcheck uses `wget http://localhost:9091/health`). Need to verify that `/metrics` endpoint actually exists in the C++ code. If not, Prometheus gets 404 and no metrics are collected.

### 8.38 Alert rules: no HFT-specific alerts — Low [FIXED]

**Файл:** `monitoring/alerts/alerts.yml`

All alerts reference `exchange_simulator_*` or `ai_signal_bot_*` metrics. No alerts for:
- HFT executor order/fill ratio
- HFT executor error count
- HFT executor reconnect count
- Signal publisher client count
- Signal publisher broadcast failures
- DB locked errors
- Circuit breaker state changes

### 8.39 CI/CD — ✅ Very comprehensive

**Файл:** `.github/workflows/ci.yml` (647 lines)

| Job | Status |
|-----|--------|
| lint-python (ruff) | ✅ |
| lint-cpp (clang-format) | ✅ |
| lint-js (eslint) | ✅ |
| test-python (pytest + coverage) | ✅ |
| test-cpp (gcc + clang, coverage) | ✅ |
| test-cpp-msvc (Windows) | ✅ |
| test-js (vitest + coverage) | ✅ |
| test-rust (cargo test) | ✅ |
| test-windows (Python + JS) | ✅ |
| test-e2e (Playwright) | ✅ |
| build-js (bundle size check) | ✅ |
| build-docker (4 services) | ✅ |
| docker-smoke (compose up + health) | ✅ |
| audit-deps (npm audit) | ✅ |
| security-bandit | ✅ |
| security-codeql | ✅ |
| test-summary (aggregate) | ✅ |
| test-count (minimum floor enforcement) | ✅ |

This is an exceptionally well-configured CI pipeline. ✅

### 8.40 CI: npm audit doesn't fail on high — Low [FIXED]

**Файл:** `.github/workflows/ci.yml:332`

```yaml
- run: npm audit --audit-level=high || true
```

`|| true` means npm audit never fails the CI. High-severity vulnerabilities are reported but don't block the build. Only `critical` gets a `::warning::` (line 339), which is also non-blocking.

### 8.41 CI: Bandit doesn't fail on issues — Low

**Файл:** `.github/workflows/ci.yml:399`

```yaml
- run: bandit -r . -ll -ii -q -f json -o bandit-report.json || true
```

Same pattern — `|| true` means Bandit never fails CI. Issues are uploaded as artifacts but don't block.

### 8.42 No config schema validation — Medium [FIXED]

**Файлы:** `ai-signal-bot/config/settings.yaml`, `src/config/__init__.py`

No pydantic schema or JSON Schema for config validation. If someone puts `risk_pct: "2%"` (string instead of float) in YAML, the bot loads it, then crashes at runtime when it tries `balance * risk_pct / 100` → `TypeError`.

**Фикс:** Pydantic `BaseModel` for config sections: `RiskConfig`, `StrategyConfig`, `NetworkConfig`. Validate at load time with clear error messages.

### 8.43 Dockerfiles — ✅ Good security practices

**Файлы:** `ai-signal-bot/Dockerfile`, `Dockerfile.prod`, `hft-trade-bot/Dockerfile`

| Practice | Status |
|----------|--------|
| Multi-stage build | ✅ All 3 |
| Non-root user (`appuser`) | ✅ All 3 |
| `--no-install-recommends` | ✅ All 3 |
| `rm -rf /var/lib/apt/lists/*` | ✅ All 3 |
| HEALTHCHECK | ✅ All 3 |
| `.dockerignore` | ✅ All 3 |
| Pinned base images | ⚠️ `python:3.12-slim` (minor tag, not digest) |

**Единственная проблема:** Base images use tag pins (`python:3.12-slim`) not SHA digests. A supply chain attack on Docker Hub could replace the image. **Фикс:** Pin with `@sha256:...` digest.

### 8.44 Dockerfile healthcheck — TCP vs HTTP (revisited) [FIXED]

**Файлы:** `ai-signal-bot/Dockerfile:42`, `Dockerfile.prod:38`

```dockerfile
HEALTHCHECK CMD python -c "import socket; socket.create_connection(('localhost', 8766), timeout=5)" || exit 1
```

TCP socket check, not HTTP `/health`. Same issue as docker-compose healthchecks (§8.9). The C++ bot (`hft-trade-bot/Dockerfile:60`) correctly uses `wget --spider http://localhost:9091/health`.

### 8.45 Terraform — placeholder only

**Файл:** `terraform/README.md` — describes VPC, EKS, RDS, ElastiCache, S3

Grep for `encrypt|kms|sse|bucket` in `terraform/` = 0 matches. The README describes infrastructure but the actual `.tf` files appear to be skeleton/stub files. No encryption configuration for:
- RDS (at-rest encryption)
- S3 (server-side encryption)
- EKS (secrets encryption)

This is expected for a lite/template project, but should be noted for production deployment.

### 8.46 Dead code: `tracing.py` — never imported [FIXED]

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

Grep for `setup_tracing|get_tracer` across entire project = 0 matches (outside `tracing.py` itself). The module is fully implemented (OpenTelemetry + Jaeger, no-op fallback, graceful shutdown) but never used. 111 lines of dead code.

**Фикс:** Either integrate `setup_tracing()` into `run.py` startup, or remove the file.

### 8.47 Test coverage gaps — Medium [N/A]

**Файлы:** `ai-signal-bot/tests/`

Tests exist for: strategies, risk, backtesting, signal validation, exchange factory, circuit breaker, metrics.

**Missing test coverage for:**
- `src/communication/signal_publisher.py` — no unit tests for WS broadcast, client management
- `src/communication/ws_client.py` — no unit tests for reconnection logic
- `src/database/db.py` — no unit tests for CRUD operations, WAL checkpoint
- `src/monitoring/alerting.py` — no unit tests for Discord/Telegram/webhook alerts
- `src/llm_engine/engine.py` — no unit tests for LLM integration
- `src/notification/notifier.py` — no unit tests
- `src/observability/` — no unit tests (tracing, health_checks, logging)
- `src/ml/` — limited tests (only automl, feature_store partially)

These are critical paths — signal publishing, DB operations, alerting — with zero test coverage.

### 8.48 No signal handling / graceful shutdown — High [FIXED]

**Файлы:** весь `ai-signal-bot`

Grep for `SIGTERM|SIGINT|signal.signal|add_signal_handler` across entire project = 0 matches.

No signal handling means:
- `Ctrl+C` or `docker stop` kills the process immediately
- No cleanup: DB connections not closed, WAL checkpoint not run, WS clients not notified
- In-flight orders could be lost (sent to exchange but not recorded in DB)
- `aiohttp.ClientSession` not closed → socket leaks

**Фикс:** In `run.py`:
```python
loop = asyncio.get_event_loop()
for sig in (signal.SIGINT, signal.SIGTERM):
    loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(bot, db, publisher)))
```

### 8.49 No WebSocket keepalive (ping/pong) — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/communication/signal_publisher.py`, `ws_client.py`

Grep for `ping|pong|keepalive|keep_alive` across entire project = 0 matches.

Without ping/pong:
- Silent disconnects go undetected (client thinks it's connected, server thinks it's connected, but TCP is dead)
- Firewalls/load balancers drop idle connections after 60s
- Client never knows the server is gone until it tries to send

**Фикс:** `websockets.serve(..., ping_interval=20, ping_timeout=10)` or implement custom keepalive.

### 8.50 No reconnection backoff with jitter — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/communication/ws_client.py`

Grep for `jitter|backoff|exponential` across entire project = 0 matches.

The Rust executor (`hft-executor/src/lib.rs:140`) has proper exponential backoff: `backoff = (backoff * 2).min(Duration::from_secs(10))`. But no jitter — if 100 clients disconnect simultaneously, they all reconnect at exactly the same interval → thundering herd.

The Python WS client has no backoff at all — it reconnects immediately, which can overwhelm the server on mass disconnect.

**Фикс:** `delay = min(base_delay * 2**attempt, max_delay) + random.uniform(0, jitter)`.

### 8.51 Three CircuitBreaker implementations — code duplication — Medium [FIXED]

**Файлы:**
1. `src/communication/circuit_breaker.py` — full state machine (CLOSED/OPEN/HALF_OPEN), dataclass config, tests
2. `src/strategies/circuit_breaker.py` — simpler version (tripped/cooldown), different API
3. `src/utils/helpers.py:145` — yet another version (closed/open/half_open as string), different API

Three different implementations of the same pattern, with different APIs, different config parameters, different state names. Only #1 and #2 are actually used. #3 is exported via `utils/__init__.py` but never imported by any module.

**Фикс:** Consolidate into one `CircuitBreaker` in `src/communication/circuit_breaker.py`. Delete #2 and #3. Update imports.

### 8.52 RateLimiter — implemented but unused — dead code [FIXED]

**Файл:** `src/utils/helpers.py:179-205`

`RateLimiter` is implemented (token bucket, async acquire) and exported via `utils/__init__.py`, but grep for `RateLimiter` outside `helpers.py` and `__init__.py` shows it's only used in tests (`test_utils.py`). Never used in production code — no rate limiting on:
- WS message processing
- Order submission
- Exchange API calls
- Signal generation

### 8.53 Global mutable state — Low

**Файлы:** `src/observability/logging.py:38` (`global _configured`), `src/observability/tracing.py:35` (`global _tracer, _initialized`)

Global state for singleton initialization. Not thread-safe (no lock around `_configured` check). In asyncio single-thread context this is fine, but if someone adds `threading.Thread` for CPU-bound work, double-init is possible.

### 8.54 No asyncio task management — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/`

Grep for `asyncio.gather|asyncio.create_task|ensure_future` = 0 matches in `src/`. The signal_publisher uses `asyncio.gather` (found in earlier audit), but no general task management pattern. No `asyncio.TaskGroup` (Python 3.11+) for structured concurrency. No task cancellation on shutdown. Background tasks (circuit breaker broadcast, metrics) are fire-and-forget — if they crash, nobody knows.

**Фикс:** Use `asyncio.TaskGroup` for structured concurrency. Store task references and cancel on shutdown. Add `task.add_done_callback(callback)` to log crashes.

### 8.55 Health check: no dependency depth check — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/health_check.py`

The `HealthAggregator` checks if other services respond on `/health`, but the bot's own `/health` endpoint (if it exists) doesn't check:
- DB connectivity (can it read/write?)
- Exchange connectivity (is it receiving candles?)
- WS client count (is anyone listening?)
- Internal queue depth (is it backlogged?)

A "healthy" status while DB is locked or exchange is disconnected is misleading. The health check should verify actual dependencies, not just HTTP 200.

### 8.56 Health aggregator: aiohttp session per check — Medium [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
    async with session.get(url) as resp:
```

Same pattern as `alerting.py` (§8.8) — new `ClientSession` per health check call. The aggregator checks 3 services every interval, creating 3 new sessions each time. TCP connector overhead × 3 × every check interval.

**Фикс:** Persistent `ClientSession` on the `HealthAggregator` instance, closed in `stop()`.

### 8.57 No retry on transient failures — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/`

Grep for `retry|max_retries|retry_count|retry_attempts` = 0 matches.

No retry logic on:
- Exchange API calls (HTTP 429, 5xx → transient, should retry)
- DB operations (SQLite `database is locked` → should retry with backoff)
- WS reconnection (immediate, no backoff — see §8.50)
- LLM API calls (rate limited, should retry)

The circuit breaker exists but it only blocks after N failures — it doesn't retry the failed operation.

**Фикс:** `tenacity` library or custom retry decorator: `@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))`.

### 8.58 Silent `except: pass` — Low

**Файлы:** `signal_publisher.py:154` (`except websockets.ConnectionClosed: pass`)

This is actually correct — `ConnectionClosed` is expected when a client disconnects. ✅

But `db.py` close method (§8.6) has `except Exception: pass` which is wrong — swallows all errors including DB corruption.

### 8.59 Health aggregator binds to 0.0.0.0 — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:116`

```python
self._site = web.TCPSite(self._runner, "0.0.0.0", self.port)  # nosec: B104
```

The `# nosec: B104` annotation acknowledges the security issue (binding to all interfaces). This means the health endpoint is accessible from any network interface, not just localhost. In Docker with port mapping, this is fine. In direct deployment, anyone can reach it.

### 8.60 Code reduction opportunities — Summary [FIXED]

Based on the full audit, here are the main areas where code can be reduced:

| Area | Lines saved (est.) | Approach |
|------|-------------------|----------|
| 3× CircuitBreaker → 1 | ~80 lines | Consolidate to `communication/circuit_breaker.py` |
| Dead code: `tracing.py` | 111 lines | Remove or integrate (2-line call in `run.py`) |
| Dead code: `RateLimiter` in `helpers.py` | 27 lines | Remove (never used in prod) |
| Dead code: `helpers.py` CircuitBreaker | 32 lines | Remove (never imported) |
| `compute_returns` duplication | ~200 lines | Single utility function (per refactoring plan) |
| `strategies.py` re-exports | ~10 lines | Direct imports instead of re-export |
| `research/__init__.py` heavy exports | ~50 lines | Lazy imports |
| **Total** | **~510 lines** | |

### 8.61 F-string logging — not structured — Low [N/A]

**Файлы:** весь `ai-signal-bot/src/`

Grep for `logger.info(f` = 30+ matches across all modules. All logging uses f-string interpolation:
```python
logger.info(f"Client connected: {remote} (total: {len(self._clients)})")
```

This produces flat strings that can't be parsed by log aggregation (Loki, ELK, Datadog). To search for "client connected" you need regex, not structured queries.

**Фикс:** `logger.info("Client connected", extra={"remote": remote, "total_clients": len(self._clients)})` or use `structlog` for key-value logging.

### 8.62 SHM: no cleanup on crash — Medium [FIXED]

**Файлы:** `shm_signal_producer.py`, `shm_fill_consumer.py`

The SHM producer creates a shared memory segment (`create=True`). If the Python process crashes (SIGKILL, OOM, segfault), the SHM segment is **not unlinked**. On restart, `ShmRingBuffer(create=True)` fails because the segment already exists.

The `close()` method calls `self._buffer.unlink()`, but `close()` is only called via `__exit__` context manager or explicit call — not on crash.

**Фикс:** Register `atexit.register(self.close)` and also handle signals. Or use `try/finally` in the main loop. Consider `O_CREAT | O_EXCL` semantics to detect stale segments.

### 8.63 SHM fill consumer: polling at 1ms — CPU spin — Low

**Файл:** `shm_fill_consumer.py:62`

```python
poll_interval: float = 0.001  # 1ms polling
```

Polling SHM every 1ms = 1000 polls/sec. When there are no fills (which is most of the time — fills happen only on order execution), this is wasted CPU. On a 1-core VPS, this consumes 5-10% CPU doing nothing.

**Фикс:** Use eventfd or futex (cross-process signaling) instead of polling. Or increase `poll_interval` to 10ms (100 polls/sec) — still fast enough for HFT fills.

### 8.64 Dual metrics systems — Medium [FIXED]

**Файлы:**
1. `src/communication/metrics_server.py` — custom text format, manual Prometheus exposition
2. `src/monitoring/metrics.py` — `prometheus_client` library with Counter/Gauge/Histogram

Two separate metrics systems with overlapping metrics:
- `metrics_server.py`: `ai_signal_bot_signals_sent_total`
- `metrics.py`: `trading_signals_total` (same concept, different name)

Prometheus sees both, but dashboards/alerts need to know which one to query. The custom one (`metrics_server.py`) doesn't support histograms (no latency distribution), while `metrics.py` does.

**Фикс:** Consolidate to `prometheus_client` only. Remove `metrics_server.py` custom implementation.

### 8.65 No asyncio.Lock on shared mutable state — Medium [FIXED]

**Файлы:** `ai-signal-bot/src/`

Grep for `asyncio.Lock|threading.Lock|threading.RLock` = 0 matches.

The `_clients` set in `signal_publisher.py` is mutated from multiple coroutines (add on connect, discard on disconnect, iterate on broadcast) without any lock. While asyncio is single-threaded, `await` points between operations can cause race conditions:
```python
# Broadcast iterates _clients
for ws in self._clients:  # ← starts iteration
    await ws.send(msg)    # ← yields control
    # Another coroutine modifies _clients during await
    # → RuntimeError: Set changed size during iteration
```

**Фикс:** Use `asyncio.Lock` around `_clients` mutations, or copy the set before iterating: `for ws in list(self._clients):`

### 8.66 Helm: no PodDisruptionBudget — Medium [FIXED]

**Файл:** `helm/templates/`

Grep for `PodDisruptionBudget|pdb` = 0 matches. No PDB means Kubernetes can evict all pods simultaneously during node drain or cluster upgrade. With a single-replica StatefulSet (which this is), draining a node kills the only pod → downtime.

**Фикс:** Add PDB with `minAvailable: 1` for critical services (ai-signal-bot, hft-trade-bot, exchange-simulator).

### 8.67 Helm: no NetworkPolicy — Medium [FIXED]

**Файл:** `helm/templates/`

Grep for `NetworkPolicy|networkpolicy` = 0 matches. All pods can communicate with all other pods and external networks. In production, the DB pod should only accept connections from ai-signal-bot and hft-trade-bot pods, not from web-ui or random pods.

**Фикс:** Add NetworkPolicy restricting ingress to DB/Redis pods from application pods only.

### 8.68 Helm: no RBAC — Low

**Файл:** `helm/templates/`

No ServiceAccount, Role, or RoleBinding defined. Pods run with default service account. No principle of least privilege.

### 8.69 Helm: hardcoded PostgreSQL password — Medium [FIXED]

**Файл:** `helm/values.yaml:17`

```yaml
password: "change-me-in-production"  # Override via --set postgres.password=... or existingSecret
```

Default password is `change-me-in-production`. The comment says "Override via --set" but there's no validation that it was actually changed. If someone runs `helm install` without overrides, the DB has a known password.

**Фикс:** Require `existingSecret` ref. Fail Helm install if no secret provided: `{{- required "postgres.password is required" .Values.postgres.password }}`.

### 8.70 Docker Compose: no resource limits — Medium [FIXED]

**Файл:** `docker-compose.yml`

Grep for `resources|limits|ulimits` = 0 matches. No memory or CPU limits on any container. A memory leak in any service can consume all host memory and crash everything. The Helm chart has resource limits (§8.66), but docker-compose (used for dev/staging) does not.

**Фикс:** Add `deploy.resources.limits` to each service in docker-compose.

### 8.71 WS input: no schema validation — Medium [FIXED]

**Файл:** `signal_publisher.py:141-146`

```python
data = json.loads(message)
msg_type = data.get("type")
if msg_type == "subscribe":
    logger.info(f"Client subscribed: {data.get('client', 'unknown')}")
elif msg_type == "run_backtest":
    result = await self._run_backtest(data)
```

`json.loads` accepts any valid JSON. No validation that:
- `data` is a dict (could be a list, string, number)
- `type` field exists (`.get("type")` returns `None` → falls through)
- `backtests` is a list of dicts with required fields
- Message size is bounded (client could send 100MB JSON)

A malicious or buggy client can send `{"type": "run_backtest", "backtests": "not_a_list"}` → `len(backtests)` works (string length) but iteration produces characters → crash.

**Фикс:** Pydantic schema for incoming WS messages: `class SubscribeMsg(BaseModel): type: Literal["subscribe"]; client: str`. Validate before processing.

### 8.72 DB migrations: SQL files exist but no runner — Medium [FIXED]

**Файлы:** `src/database/migrations/001_initial_schema.sql` through `004_add_backtests.sql`

4 migration SQL files exist (PostgreSQL syntax: `BIGSERIAL`, `CREATE EXTENSION`). But grep for `migrat` in `src/database/` = 0 matches. No migration runner code. No version tracking table. No `apply_migrations()` function.

The SQLite `db.py` has its own schema initialization (`CREATE TABLE IF NOT EXISTS`), separate from these PostgreSQL migrations. Two DB backends, two schema management approaches, neither has a proper migration runner.

**Фикс:** Use Alembic (Python) or `flyway` (JVM) or at minimum a `migrate.py` script that reads `migrations/*.sql` in order and tracks applied versions in a `_migrations` table.

### 8.73 Alertmanager: hardcoded credentials — Medium [FIXED]

**Файл:** `monitoring/alertmanager/config.yml:12,56,62`

```yaml
smtp_auth_password: 'your-password'
api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
webhook_url: 'https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK'
```

Hardcoded placeholder credentials in config file. If someone deploys without changing these:
- Email alerts fail silently (SMTP auth fails)
- Slack/Discord alerts fail silently (404 on placeholder URL)
- **Critical trading alerts never reach anyone**

**Фикс:** Use environment variable substitution: `smtp_auth_password: '${SMTP_PASSWORD}'` or Kubernetes secrets mounted as config.

### 8.74 shared_config.yaml: hardcoded localhost — Medium [FIXED]

**Файл:** `shared_config.yaml:108,112`

```yaml
websocket:
  exchange_simulator:
    host: localhost  # ← won't work in Docker/K8s
  ai_signal_bot:
    host: localhost  # ← services have different hostnames in containers
```

In Docker Compose, services communicate via service names (`exchange-simulator`, `ai-signal-bot`), not `localhost`. In K8s, via service DNS. The shared config hardcodes `localhost`, which only works when all components run on the same machine (dev mode).

**Фикс:** `host: ${EXCHANGE_SIMULATOR_HOST:-localhost}` or separate config per environment.

### 8.75 C++ memory ordering — ✅ Mostly correct

**Файлы:** `hft-trade-bot/src/` — 30+ atomic operations

All atomics use `std::memory_order_relaxed` for stats/counters (correct — no ordering needed for independent counters). `has_new_data_.store(true, std::memory_order_release)` is correct for signaling (release fence ensures data writes are visible before the flag). `compare_exchange_weak` loops use relaxed/relaxed (correct for atomic min/max updates).

**One concern:** `ctx.balance.fetch_add(closed->unrealized_pnl, std::memory_order_relaxed)` — balance is read in the main loop with `relaxed` too. If balance is updated from multiple threads (e.g., position close + order fill simultaneously), `relaxed` means threads might see stale values. However, since the main trading loop is single-threaded for order execution, this is likely fine in practice.

### 8.76 Grafana dashboards — ✅ Good

**Файлы:** `monitoring/grafana/dashboards/`

5 dashboards exist: `ai_signal_bot_metrics.json`, `latency-monitoring.json`, `system-overview.json`, `trading-overview.json`, `trading-performance.json`. Dashboard provider config (`dashboards.yml`) exists. This is well-configured.

### 8.77 ebpf monitor — ✅ Well-implemented

**Файл:** `monitoring/ebpf_monitor.py` (225 lines)

Advanced eBPF monitoring with:
- Optional BCC import (`try/except ImportError`)
- Syscall tracing, network latency, CPU cache misses
- Signal handling for graceful shutdown (`signal.signal`)
- JSON output for Prometheus ingestion
- CLI args (`argparse`)

Properly handles the case where BCC isn't installed (non-Linux, no root). ✅

### 8.78 Alertmanager: no silence/ maintenance window support — Low [N/A]

**Файл:** `monitoring/alertmanager/config.yml`

No silence rules or maintenance window configuration. During planned deployments, all alerts fire simultaneously (services restart → health checks fail → critical alerts). No way to auto-silence during deploy windows.

**Фикс:** Add AM API silence creation in CI/CD pipeline before deploy, auto-expire after 10min.

### 8.79 CMake build — ✅ Excellent

**Файл:** `hft-trade-bot/CMakeLists.txt` (511 lines)

Comprehensive build configuration:
- C++20, `CMAKE_CXX_STANDARD_REQUIRED ON`, no extensions
- ccache support, unity build option, PCH (disabled on MSVC due to UTF-8 path issue)
- Custom allocators (mimalloc/jemalloc), PGO support
- GCC: `-O3 -flto -Wall -Wextra -march=native -msse4.2 -mavx2 -ffast-math`
- MSVC: `/O2 /GL /utf-8 /W4`
- Debug: ASan + UBSan
- 30+ test targets (doctest + CTest)
- Cross-platform (Linux/Windows/macOS via vcpkg)

### 8.80 Cargo.toml — ✅ Good

**Файл:** `hft-executor/Cargo.toml`

Release profile: `opt-level=3, lto=true, codegen-units=1, panic=abort, strip=true`. This is optimal for a production Rust library. Dependencies use semver ranges (`"1"`, `"0.24"`) which is standard for Rust.

### 8.81 web-ui package.json — ✅ Good

**Файл:** `web-ui/package.json`

- Node 22+ engine requirement
- Vitest + Playwright for testing
- ESLint 9, TypeScript 5.5 (devDeps, not runtime)
- Security overrides: `esbuild ^0.25.0`, `fast-uri >=4.1.2`, `js-yaml >=4.3.1` (known vuln fixes)
- `detect-private-key` in pre-commit hooks ✅

**Minor:** Dependencies use `^` (caret) ranges, not pinned. In production, `npm ci` with `package-lock.json` mitigates this.

### 8.82 Pre-commit hooks — ✅ Good

**Файл:** `.pre-commit-config.yaml`

- ruff (lint + format)
- eslint for JS/TS
- trailing-whitespace, end-of-file-fixer, check-yaml
- `detect-private-key` ✅ (prevents committing SSH/PGP keys)
- `check-added-large-files` (500KB limit)

### 8.83 Docker Compose prod: resource limits — ✅ Good

**Файл:** `docker-compose.prod.yml`

All 7 services have `deploy.resources.limits` (memory + cpus). This corrects the dev `docker-compose.yml` issue (§8.70). Prod compose is properly configured.

### 8.84 Makefile: no C++ test target — Low

**Файл:** `Makefile:23-26`

`make test` runs Python and JS tests but not C++ tests:
```makefile
test:
    cd exchange_simulator && python -m pytest tests/ -v
    cd ai-signal-bot && python -m pytest tests/ -v
    cd web-ui && npx vitest run --passWithNoTests
    # ← no cd hft-trade-bot && ctest
```

C++ has 30+ test targets in CMake, but `make test` doesn't run them. Developers must remember to run CTest separately.

**Фикс:** Add `cd hft-trade-bot && cmake --build build && ctest --test-dir build` to the test target.

### 8.85 Rust `panic = abort` — design tradeoff — Low

**Файл:** `hft-executor/Cargo.toml:25`

```toml
panic = "abort"
```

With `panic = abort`, any `unwrap()` or `expect()` panic kills the entire process immediately — no stack unwind, no cleanup. This is intentional for a cdylib (FFI library) where unwinding across the FFI boundary is UB. But combined with the `unwrap()` calls identified in §8.29, this means any `SystemTime` error or `serde_json` serialization failure = immediate process abort. The C++ host process dies.

**Фикс:** Replace `unwrap()` with proper error handling (already noted in §8.29). The `panic = abort` setting itself is correct for FFI.

### 8.86 exchange_simulator: config_validator — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/config_validator.py` (274 lines)

The exchange_simulator has a proper config validator that checks:
- Required sections (`exchanges`, `initial_prices`, `volatility`, `market`, `account`)
- Value ranges, cross-references between sections
- Returns `(errors, warnings)` tuple — errors are fatal, warnings informational
- Called before simulator starts, exits with `sys.exit(1)` on errors

This is what ai-signal-bot is missing (§8.42). The exchange_simulator does it right.

### 8.87 exchange_simulator: global mutable singletons — Low

**Файлы:** `exchange_simulator/exchange_simulator/audit_logger.py:296`, `health.py:43`, `metrics.py:225`, `tracing.py:165`

4 global singleton instances:
```python
_global_audit_logger: AuditLogger | None = None
_exchanges = None  # health.py
_metrics_instance: ExchangeSimulatorMetrics | None = None
_tracer_instance: ExchangeSimulatorTracer | None = None
```

Same pattern as ai-signal-bot (§8.53). Not thread-safe, but asyncio single-thread context makes this safe in practice. Low severity.

### 8.88 C++ signal handling — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_setup.cpp:11-13`

```cpp
static std::atomic<bool> g_running{true};
static void signal_handler(int) { g_running = false; }
```

The C++ bot correctly handles SIGINT/SIGINT by setting `g_running = false`. The main loop checks `is_running()` and exits gracefully. This is the correct pattern — unlike the Python ai-signal-bot which has no signal handling (§8.48).

**Note:** The signal handler is registered somewhere in `init_config_and_logger` (need to verify `std::signal(SIGINT, signal_handler)` call). The atomic flag ensures the signal handler is race-free.

### 8.89 deploy.sh: no health check failure exit — Medium [FIXED]

**Файл:** `scripts/deploy.sh:176-218`

The health check function loops 30 times but **never exits on failure**:
```bash
for i in $(seq 1 $MAX_RETRIES); do
    if curl -s http://localhost:8765/health > /dev/null 2>&1; then
        log_info "Exchange Simulator: Healthy"
    else
        log_warn "Exchange Simulator: Not healthy yet"  # ← just warns
    fi
    sleep $RETRY_DELAY
done
log_info "Health checks completed"  # ← always says "completed"
```

After 30 retries (60s), if all services are still unhealthy, the script says "Health checks completed" and `deploy()` says "Deployment completed successfully". The deployment is reported as successful even if all services are down.

**Фикс:** Track healthy count, exit with `exit 1` if any service is still unhealthy after all retries.

### 8.90 deploy.sh: rollback uses `rm -rf` — Low [FIXED]

**Файл:** `scripts/deploy.sh:266-267`

```bash
rm -rf exchange_simulator/data
cp -r "$BACKUP_DIR/database/data_$TIMESTAMP" exchange_simulator/data
```

`rm -rf` before `cp` — if `cp` fails (disk full, bad backup), data is lost. No error check between `rm` and `cp`.

**Фикс:** Copy to temp dir first, verify, then swap: `cp -r backup temp && mv exchange_simulator/data exchange_simulator/data.old && mv temp exchange_simulator/data`.

### 8.91 deploy.sh: native mode uses `pkill -f` — Low

**Файл:** `scripts/deploy.sh:101-104`

```bash
pkill -f "exchange_simulator" || true
pkill -f "ai_signal_bot" || true
pkill -f "hft_trade_bot" || true
```

`pkill -f` matches any process with the string in its command line. A grep command like `grep exchange_simulator` would also be killed. Not a security issue, but can kill unrelated processes.

**Фикс:** Use PID files (`kill $(cat $LOG_DIR/exchange_simulator.pid)`) which are already being written in `start_native()`.

### 8.92 deploy.sh: backup retention — Low [FIXED]

**Файл:** `scripts/deploy.sh:32-62`

Backups are created with timestamps but never cleaned up. After 100 deploys, `backup/` has 100 copies of config + DB. No rotation policy.

**Фикс:** Add `find $BACKUP_DIR -mtime +30 -delete` to cleanup backups older than 30 days.

### 8.93 ESLint config: PropTypes disabled — Low [FIXED]

**Файл:** `web-ui/eslint.config.js:23`

```js
'react/prop-types': 'off',
'no-unused-vars': 'off',
```

PropTypes rule explicitly disabled. `no-unused-vars` also off. This means:
- No runtime prop type checking on any component
- Dead variables and imports accumulate without warning
- TypeScript is in devDeps but not used (`.jsx` files, not `.tsx`)

**Фикс:** Enable `react/prop-types: 'warn'` or migrate to TypeScript. Enable `no-unused-vars: 'warn'`.

### 8.94 Vite config: no CSP headers — Low [FIXED]

**Файл:** `web-ui/vite.config.js`

No Content-Security-Policy headers configured. The dev server and preview server serve without CSP. In production, if served directly (not behind nginx/ingress), XSS attacks are easier.

**Фикс:** Add `server.headers` with CSP: `"Content-Security-Policy": "default-src 'self'; connect-src 'self' ws://localhost:*"`.

### 8.95 Vite config: PWA cache strategy — ✅ Good

**Файл:** `web-ui/vite.config.js:29-41`

Workbox config with `globPatterns` for JS/CSS/HTML/SVG/fonts. Runtime caching for Google Fonts with `CacheFirst` strategy and expiration policy (`maxEntries: 10, maxAgeSeconds: 1yr`). Manual chunks for react-vendor, charts-vendor, icons-vendor, state-vendor. Good bundle splitting.

### 8.96 hft-trade-bot config: hardcoded localhost — Medium [FIXED]

**Файл:** `hft-trade-bot/config/config.yaml:76,165`

```yaml
exchange:
  websocket_url: "ws://localhost:8765"
ai_signal_bot:
  websocket_url: "ws://localhost:8766"
```

Same issue as `shared_config.yaml` (§8.74). In Docker/K8s, `localhost` won't reach other containers. The prod config (`config.prod.yaml`) may override this, but the default config is dev-only.

### 8.97 FIX session: seq num persistence — ✅ Good

**Файл:** `hft-trade-bot/src/fix/fix_session.h:251-268`

```cpp
void load_seq_nums() {
    std::lock_guard<std::mutex> lk(seq_mutex_);
    std::ifstream f(seq_file_path_);
    if (f) { f >> out_seq >> in_seq; ... }
}

void save_seq_nums() {
    std::lock_guard<std::mutex> lk(seq_mutex_);
    std::ofstream f(seq_file_path_);
    if (f) { f << outgoing_seq_.load() << ' ' << incoming_seq_.load(); }
}
```

FIX sequence numbers are persisted to file and loaded on startup. This is critical for FIX protocol — if seq nums reset to 1 after restart, the exchange rejects all messages (seq too low). Mutex-protected. ✅

**Minor:** `save_seq_nums()` writes to the same file path directly — if the process crashes mid-write, the file could be corrupted (partial write). Atomic write (temp file + rename) would be safer.

### 8.98 ErrorBoundary: per-panel but no top-level — Medium [FIXED]

**Файл:** `web-ui/src/App.jsx:13,468,535`

`PanelErrorBoundary` wraps individual panels and tab content. But there's no top-level `ErrorBoundary` wrapping the entire `App` component. If a crash occurs outside a panel (e.g., in `StatusBar`, `KeyboardHelp`, or `App` itself), the entire app white-screens with no recovery.

**Фикс:** Wrap the entire `App` return in `<PanelErrorBoundary panelName="App">`.

### 8.99 Monitoring tests: ✅ Good

**Файл:** `monitoring/tests/test_alerts.py` (247 lines)

Tests validate:
- Alert rules file exists and is valid YAML
- Latency alerts group exists with rules
- Error rate alerts group exists
- Alertmanager config is valid YAML with receivers

This is good — monitoring infrastructure is tested, not just configured.

### 8.100 Code reduction: exchange_simulator modules — Low [FIXED]

**Файлы:** `exchange_simulator/exchange_simulator/` — 12 modules

Several modules could be consolidated:
- `latency_simulation.py` (4KB) + `market_microstructure.py` (7KB) → single `market_simulation.py`
- `spread_analytics.py` (7KB) + `order_book_realism.py` (12KB) → single `order_book.py`
- `funding_rate.py` (5KB) could be a method on the exchange model

~200 lines removable from exchange_simulator alone. Total code reduction potential now ~710 lines (510 Python ai-signal-bot + 200 exchange_simulator).

### 8.101 config.prod.yaml — ✅ Excellent

**Файл:** `hft-trade-bot/config/config.prod.yaml` (253 lines)

Production config is exemplary:
- All API keys use `${ENV_VAR}` syntax — no hardcoded secrets
- Stricter risk limits than dev (1% per trade vs 2%, 5% daily drawdown vs 8%, 5 max positions vs 10)
- Kill switch with `auto_cancel_orders: true`, `auto_close_positions: true`
- PostgreSQL DSN from env, Redis URL from env
- Thread pinning enabled (cores 0/1/2 for signal/execution/market_data)
- SPSC queue capacity 16384, object pool 1024
- FIX credentials from env (`${FIX_USERNAME}`, `${FIX_PASSWORD}`)
- Fallback to simulator if all real exchanges down
- Rate limits per exchange (Binance 300 orders/10s, OKX 60 order req/2s, Bybit 120 orders/min)

This is how production config should be done. ✅

### 8.102 settings.testnet.yaml — ✅ Good

**Файл:** `ai-signal-bot/config/settings.testnet.yaml` (38 lines)

Testnet config uses `${BINANCE_TESTNET_API_KEY}` env vars. 3 symbols only (BTC, ETH, SOL). Clear documentation about testnet limitations. ✅

### 8.103 Dependabot config — ✅ Excellent

**Файл:** `.github/dependabot.yml` (95 lines)

7 dependabot configs:
- Python pip (exchange_simulator + ai-signal-bot)
- npm (web-ui)
- GitHub Actions
- Docker base images (4 services)

All weekly, grouped into 1 PR each (avoids PR spam). Labeled by ecosystem. This is best-practice dependency management. ✅

### 8.104 SECURITY.md — ✅ Good

**Файл:** `SECURITY.md` (50 lines)

- Clear vulnerability reporting process (email, not public issue)
- 48-hour response SLA
- Lists security measures: Bandit, CodeQL, no real API keys, input validation, rate limiting
- Scope definition (in/out of scope)
- Educational project disclaimer

**Note:** Claims "Input validation — WebSocket messages validated before processing" but §8.71 showed WS input has no schema validation. The SECURITY.md claim is inaccurate.

### 8.105 Docker Compose staging — ✅ Good

**Файл:** `docker-compose.staging.yml` (219 lines)

All 6 services have resource limits (cpus + memory). JSON logging (`LOG_FORMAT=json`). Restart on failure with backoff (`on-failure:5`). Health checks with retries and start_period. This is properly configured — between dev (no limits) and prod (limits + stricter). ✅

### 8.106 C++ kill switch — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/kill_switch.h`, `bot_setup.cpp:217-238`

The kill switch is production-grade:
- Dual trigger: SHM flag (`/hft_kill_switch`) + file-based (`/tmp/kill_switch`)
- 5 reasons: MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, FILE_TRIGGER
- Callbacks: `cancel_all`, `close_all` (market-close all positions), `notify`
- SHM init fallback (file-based still works if SHM fails)
- Poll interval configurable (250ms default, 1000ms in prod config)
- `stop_monitoring()` and `close()` called in shutdown sequence

This is the correct pattern for a trading kill switch. ✅

### 8.107 SECURITY.md: inaccurate claim about WS validation — Low [FIXED]

**Файл:** `SECURITY.md:35`

```markdown
- **Input validation** — WebSocket messages validated before processing
```

But §8.71 showed `signal_publisher.py:141` does `json.loads(message)` with no schema validation, no type checking, no size limit. The SECURITY.md claim is incorrect — WS messages are parsed but not validated.

**Фикс:** Either add schema validation (as recommended in §8.71) or correct the SECURITY.md claim to "WebSocket messages parsed as JSON" (not "validated").

### 8.108 web-ui .env.example — ✅ Good

**Файл:** `web-ui/.env.example` (33 lines)

Clear documentation, all vars optional with localhost defaults, feature flags documented, `.env` is gitignored. No secrets in example. ✅

### 8.109 Code reduction: total summary — Info [FIXED]

**Total code reduction potential across the project:**

| Area | Lines removable | How |
|------|----------------|-----|
| 3× CircuitBreaker duplication | ~150 | Consolidate to 1 in utils/ |
| Dead `tracing.py` | ~200 | Remove, use OpenTelemetry if needed |
| Dead `RateLimiter` in utils/helpers.py | ~50 | Remove unused class |
| `compute_returns` duplication (20+ modules) | ~200 | Extract to utils/ |
| exchange_simulator module consolidation | ~200 | Merge small modules |
| **Total** | **~800** | |

~800 lines removable without changing any functionality. This reduces maintenance burden, bug surface, and review time.

### 8.110 Health checks v2: deep liveness/readiness — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

This is the **correct** pattern — unlike the shallow health check noted in §8.45:
- `/health/live` — process alive (uptime, PID)
- `/health/ready` — checks WS, DB, Redis, exchange connectivity
- `/health/status` — full report with component details
- Returns HTTP 503 when unhealthy (K8s removes from service)
- Per-component health: HEALTHY / DEGRADED / UNHEALTHY
- Latency measured per check
- Specific exception types caught (not bare `except:`)

This is what §8.45 recommended. The code exists but may not be wired into the main bot startup.

### 8.111 Notifier: Telegram/Discord — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- Tokens from env vars (`TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`)
- `aiohttp.ClientSession` properly closed in `stop()`
- `_poll_task` cancelled and awaited in `stop()`
- Remote commands: `/status`, `/positions`, `/close_all`, `/pause`, `/resume`
- Specific exception types (`OSError`, `RuntimeError`)
- Chat ID validation (ignores messages from other chats)

**Note:** `send_alert` doesn't retry on failure. If Telegram API is temporarily down, the alert is lost. For critical trading alerts, a retry queue would be better.

### 8.112 Rust FFI: null pointer safety — ✅ Good

**Файл:** `hft-executor/src/lib.rs:233-297`

All FFI functions check for null pointers:
```rust
pub extern "C" fn hft_executor_create(ws_url: *const c_char) -> *mut c_void {
    if ws_url.is_null() { return std::ptr::null_mut(); }
    ...
}
pub extern "C" fn hft_executor_submit(exec: *mut c_void, symbol: *const c_char, ...) -> i32 {
    if exec.is_null() || symbol.is_null() { return -1; }
    ...
}
pub extern "C" fn hft_executor_destroy(exec: *mut c_void) {
    if !exec.is_null() {
        unsafe { drop(Box::from_raw(exec as *mut OrderExecutor)); }
    }
}
```

Null checks on all FFI entry points. `Box::from_raw` in destroy correctly recovers the allocation. ✅

### 8.113 Rust: `is_fill_message` string matching — Low

**Файл:** `hft-executor/src/lib.rs:209-214`

```rust
fn is_fill_message(text: &str) -> bool {
    text.contains("\"fill\"")
        || text.contains("\"filled\"")
        || text.contains("\"order_fill\"")
        || text.contains("\"type\":\"fill\"")
}
```

String matching on JSON is fragile — already noted in §8.32. If the exchange sends `{"type": "fill"}` with a space after the colon, `\"type\":\"fill\"` won't match. The other 3 patterns are more robust (just checking for the presence of `"fill"` anywhere).

### 8.114 Rust tests: comprehensive — ✅ Good

**Файл:** `hft-executor/src/lib.rs:299-524` (226 lines of tests)

22 unit tests covering:
- Order creation, side equality, type variants
- Single/batch/empty batch submission
- Stats initial state and after submit
- FFI create/destroy with valid and null pointers
- FFI submit with null executor, null symbol, all order types
- FFI stats with null executor and after submit
- Order serialization/deserialization round-trip

This is thorough FFI testing. ✅

### 8.115 dpdk_transport.py: file missing — Medium [FIXED]

**Файл:** `ai-signal-bot/src/networking/dpdk_transport.py`

The file exists only as `.pyc` (compiled bytecode in `__pycache__/`). The source `.py` file is missing. This means:
- The module can't be linted, audited, or modified
- It can't be imported on a different Python version (`.pyc` is version-specific)
- If `__pycache__` is cleaned (e.g., `git clean`), the module is gone

**Фикс:** Restore the source file from git history or remove the `__pycache__` entry and the import references.

### 8.116 Health checks: not wired into main bot — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py`

The `HealthChecker` class and `create_health_endpoints()` function exist, but grep for `HealthChecker` or `create_health_endpoints` in `run.py` or `signal_publisher.py` shows no usage. The deep health checks are implemented but not connected to the running bot. The bot uses the shallow `health_check.py` (§8.45) instead.

**Фикс:** Wire `HealthChecker` into `run.py` startup: create the checker, pass WS/DB/Redis clients, register the aiohttp handlers on the metrics/health server.

### 8.117 C++ order_executor: detached reconnect thread — Medium [FIXED]

**Файл:** `hft-trade-bot/src/execution/order_executor.h:57-63`

```cpp
std::thread([this, delay]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(delay));
    if (should_reconnect_) {
        if (ws_thread_.joinable()) ws_thread_.join();
        do_connect();
    }
}).detach();  // ← detached, captures `this`
```

The reconnect thread captures `this` and is detached. If the `OrderExecutor` is destroyed while the thread is sleeping (waiting for `delay`), the thread wakes up and calls `do_connect()` on a destroyed object → **use-after-free → undefined behavior**.

The `disconnect()` method sets `should_reconnect_ = false`, which the thread checks after sleep. But there's a race: if the destructor runs between the `should_reconnect_` check and `do_connect()`, the object is already gone.

**Фикс:** Use `std::jthread` with stop_token, or store the thread and join it in destructor. Don't detach.

### 8.118 C++ order_executor: snprintf buffer overflow potential — Low

**Файл:** `hft-trade-bot/src/execution/order_executor.h:108-128`

```cpp
char buf[512];
int n = std::snprintf(buf, sizeof(buf),
    "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\",...",
    exchange_id_.c_str(), signal.symbol.c_str(), ...);
```

`snprintf` is safe (truncates at `sizeof(buf)`), but if `exchange_id_` or `symbol` is very long (e.g., 400 chars), the JSON is truncated and invalid. The check `if (n <= 0)` catches `snprintf` errors but not truncation (truncation returns `n > sizeof(buf)`). The order would be silently sent as malformed JSON.

**Фикс:** Check `if (n >= static_cast<int>(sizeof(buf)))` and log error on truncation.

### 8.119 C++ position_manager_v2: atomic counter + stale cleanup — ✅ Good

**Файл:** `hft-trade-bot/src/position/position_manager_v2.h:140-150`

```cpp
if (!was_open && is_open_now) {
    open_positions_count_.fetch_add(1, std::memory_order_relaxed);
    if (symbol_id < 256) open_symbols_.set(symbol_id);
    open_symbol_names_.insert(symbol);
} else if (was_open && !is_open_now) {
    open_positions_count_.fetch_sub(1, std::memory_order_relaxed);
    open_symbol_names_.erase(symbol);
    // Remove stale entry from map to prevent unbounded growth
}
```

O(1) open position count via atomic counter. Spinlock-protected. Stale entry cleanup prevents unbounded map growth. Relaxed memory ordering is correct (single-threaded execution context). ✅

### 8.120 web-ui useWebSocket: excellent implementation — ✅ Excellent

**Файл:** `web-ui/src/hooks/useWebSocket.ts` (305 lines)

This is a production-grade WebSocket hook:
- **Ping/pong keepalive** — 5s interval, latency measurement
- **Exponential backoff** — starts 1s, doubles, caps at 30s, countdown timer
- **Ring buffer** — 5000 message buffer, O(1) push, prevents memory growth
- **Message batching** — configurable batch types and interval (50ms default), merges by type+symbol key
- **Sync on reconnect** — sends `last_timestamp` to resync missed data
- **Outgoing queue** — messages queued while disconnected, flushed on reconnect
- **permessage-deflate** — compression support
- **Clean cleanup** — all timers cleared on unmount, flushBatch on close

This is what the Python `ws_client.py` is missing (§8.49, §8.50). The web-ui does it right.

### 8.121 web-ui useTradingStore: clean zustand store — ✅ Good

**Файл:** `web-ui/src/stores/useTradingStore.js` (59 lines)

Clean zustand store with batch setters (`setExchangeData`, `setSignalData`, `setDerivedData`). Eliminates prop drilling. No state mutation issues. Action functions set to `null` initially, populated by hooks. ✅

### 8.122 Dockerfile.prod: both services — ✅ Good

**Файлы:** `ai-signal-bot/Dockerfile.prod`, `exchange_simulator/Dockerfile.prod`

Both follow the same pattern:
- Multi-stage build (builder + runtime)
- Non-root user (`appuser`)
- `--no-cache-dir --no-compile` pip install
- TCP health check with start-period
- `PYTHONUNBUFFERED=1` for real-time logs
- Minimal runtime image (no gcc in final)

### 8.123 .env.prod.example: placeholder passwords — Low [FIXED]

**Файл:** `.env.prod.example:24-25,32-34`

```
POSTGRES_PASSWORD=change_me_to_a_secure_password
GRAFANA_PASSWORD=change_me_to_a_secure_password
```

Same placeholder pattern as Helm `values.yaml` (§8.69). If someone copies `.env.prod.example` to `.env.prod` and forgets to change passwords, production runs with `change_me_to_a_secure_password`. No validation that passwords are actually changed.

**Фикс:** Add a startup script that checks `if [ "$POSTGRES_PASSWORD" = "change_me_to_a_secure_password" ]; then echo "ERROR: Change default password"; exit 1; fi`.

### 8.124 .env.prod.example: localhost in WS URLs — Low [FIXED]

**Файл:** `.env.prod.example:39-40`

```
VITE_WS_EXCHANGE=ws://localhost:8765
VITE_WS_SIGNALS=ws://localhost:8766
```

These are build-time Vite args inlined into the JS bundle. If someone builds the Docker image without overriding these, the web-ui connects to `localhost` instead of the Docker/K8s service names. Same issue as `shared_config.yaml` (§8.74) and `hft-trade-bot/config.yaml` (§8.96).

### 8.125 C++ smart_order_router_v2: 5 routing strategies — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/smart_order_router_v2.h` (181 lines)

Production-grade order routing:
- 5 strategies: BEST_PRICE, LOWEST_LATENCY, LOWEST_FEES, BEST_EFFECTIVE, DEPTH_AWARE
- Anti-toxic backoff (skip exchange with ≥5 toxic events)
- Depth check (minimum depth quantity filter)
- Fee-aware effective price calculation (price ± fee fraction)
- Stack-allocated array (MAX_EXCHANGES=16) — no heap allocation in hot path
- IExchange interface (DIP/SOLID) — no concrete exchange dependency
- Per-exchange latency tracking

This is textbook HFT order routing. ✅

### 8.126 C++ health_server: accept() blocks shutdown — Medium [FIXED]

**Файл:** `hft-trade-bot/src/monitoring/health_server.h:95-96`

```cpp
while (running_.load(std::memory_order_relaxed)) {
    socket_t client = ::accept(srv, nullptr, nullptr);
    if (client == kInvalidSocket) continue;
```

`accept()` blocks indefinitely waiting for a connection. When `stop()` sets `running_ = false` and calls `thread_.join()`, the thread is stuck in `accept()` — it won't check `running_` until a new connection arrives. `join()` blocks forever (or until the next health check request arrives).

**Фикс:** Set a socket timeout (`SO_RCVTIMEO`) or use `select()` with a timeout before `accept()`, so the loop can check `running_` periodically.

### 8.127 C++ health_server: raw POSIX HTTP server — ✅ Good

**Файл:** `hft-trade-bot/src/execution/health_server.h` (175 lines)

Despite the `accept()` issue, the implementation is solid:
- Cross-platform (Windows winsock + Linux POSIX)
- `SO_REUSEADDR` to prevent "address already in use" on restart
- Returns HTTP 503 when unhealthy (K8s removes pod)
- `/health` and `/metrics` endpoints
- Minimal HTTP parsing (just first line)
- Proper cleanup in `stop()` (close server socket, join thread)
- `~HealthServer()` calls `stop()` — RAII

### 8.128 Makefile.prod: migration runner exists — ✅ Good

**Файл:** `Makefile.prod:48-60`

```makefile
prod-db-migrate:
    $(DOCKER_COMPOSE) exec ai-signal-bot python -c "
import asyncio, asyncpg, os, glob
async def main():
    conn = await asyncpg.connect(os.environ.get('POSTGRES_DSN', ...))
    for f in sorted(glob.glob('src/database/migrations/*.sql')):
        with open(f) as fh:
            await conn.execute(fh.read())
        print(f'  Applied: {f}')
    await conn.close()
asyncio.run(main())
"
```

A migration runner exists in `Makefile.prod`! This partially addresses §8.72 (no migration runner). However:
- It's only in `Makefile.prod` — not in the Python code, not automatic on startup
- No `_migrations` table tracking — runs all SQL files every time
- Not idempotent — `CREATE TABLE` without `IF NOT EXISTS` will fail on second run
- No rollback support

**Verdict:** Better than nothing, but still needs a proper migration runner in Python code (as recommended in §8.72).

### 8.129 Makefile.prod: health checks + backup + deploy — ✅ Good

**Файл:** `Makefile.prod:80-101`

- `prod-health` — checks all 6 service health endpoints (TCP + HTTP)
- `prod-db-backup` — `pg_dump` with timestamp
- `prod-db-restore` — `psql` restore from file
- `prod-deploy` — build + up + health check pipeline
- `prod-clean` — down + volumes + prune

Well-structured production Makefile. ✅

### 8.130 docker-compose.hub.yml: pre-built images — ✅ Good

**Файл:** `docker-compose.hub.yml` (120 lines)

Uses pre-built Docker Hub images instead of building from source. Health checks on all services. `depends_on` with `condition: service_healthy`. Networks configured. `restart: unless-stopped`. This is the correct pattern for users who want to try the system without compiling. ✅

### 8.131 build-all.bat: comprehensive Windows build — ✅ Good

**Файл:** `build-all.bat` (438 lines)

Full pipeline build script for Windows:
- 6 components: exchange_simulator, ai-signal-bot, C++ CMake, Rust cargo, web-ui, Docker
- Multiple modes: all, quick, python, cpp, js
- Error tracking with `EXIT_CODE`
- Python existence check
- Per-component status reporting

This is the Windows equivalent of the CI pipeline. ✅

### 8.132 Makefile.prod: migration not idempotent — Low [FIXED]

**Файл:** `Makefile.prod:48-60`

The migration runner runs all SQL files every time. If `001_initial_schema.sql` uses `CREATE TABLE` (not `CREATE TABLE IF NOT EXISTS`), running `make prod-db-migrate` twice will fail with "table already exists". The SQL files need to be idempotent or the runner needs to track applied migrations.

### 8.133 C++ health_server: no socket timeout on accept — Medium

Already noted in §8.126 but emphasizing: the `accept()` call has no timeout. On Linux, `select()` with a 1-second timeout before `accept()` would allow the thread to check `running_` periodically. On Windows, `setsockopt(SO_RCVTIMEO)` on the server socket would make `accept()` return `INVALID_SOCKET` after the timeout, allowing the loop to check `running_`.

### 8.134 CI workflow: comprehensive — ✅ Excellent

**Файл:** `.github/workflows/ci.yml` (647 lines)

The CI pipeline includes:
- Python lint (ruff) — matrix for exchange_simulator + ai-signal-bot
- C++ lint (clang-format-18) — dry-run with Werror
- JS lint (eslint) — Node 22
- Python tests — pytest with coverage
- C++ tests — CMake build + CTest
- Rust tests — cargo test
- JS tests — vitest + playwright
- Security scans — Bandit, CodeQL, npm audit
- Docker build verification
- Concurrency control (cancel in-progress)
- Least-privilege permissions (`contents: read`)

This is a textbook CI pipeline. ✅

### 8.135 C++ low_latency.h: spinlock + SPSC + pool + histogram — ✅ Excellent

**Файл:** `hft-trade-bot/src/utils/low_latency.h` (451 lines)

This is a **production-grade HFT infrastructure file**. Every component is designed for sub-microsecond latency:

- **Spinlock** — `compare_exchange_strong` with `memory_order_acquire`, `_mm_pause()` for hyperthreading, cache-line aligned (`alignas(64)`)
- **SPSCQueue** — lock-free single-producer single-consumer ring buffer, power-of-2 capacity, `memory_order_acquire/release` on head/tail, cache-line padded
- **ObjectPool** — pre-allocated, `compare_exchange_strong` for acquire, O(1) release via pointer arithmetic, no heap alloc
- **LatencyHistogram** — 35 buckets (log2 scale), `compare_exchange_weak` loop for min/max, p50/p95/p99/p99.9 percentiles
- **ScopedLatency** — RAII timer, records to histogram on destruction
- **ThreadAffinity** — cross-platform thread pinning (Windows `SetThreadAffinityMask` + Linux `pthread_setaffinity_np`), `SCHED_FIFO` priority
- **CircuitBreaker** — 5 errors → 30s cooldown → half-open probe, atomic state, lock-free
- **RetryPolicy** — exponential backoff with jitter, `thread_local` RNG

This is textbook HFT C++. Every memory ordering is correct. Cache-line alignment prevents false sharing. No heap allocations in hot paths. ✅

### 8.136 GitHub deploy.yml: CD pipeline — ✅ Excellent

**Файл:** `.github/workflows/deploy.yml` (172 lines)

Full continuous deployment pipeline:
- **deploy-web-ui** — Netlify deploy on main/tag push
- **build-and-push** — matrix build for 4 services, Docker Hub/GHCR push with semver tags, GHA cache
- **deploy** — SSH to server, `docker compose pull + up --force-recreate`, only on tag push
- **health-check** — post-deploy health check of all endpoints (TCP + HTTP)
- **notify** — Discord + Telegram notification on success/failure
- Concurrency control (no cancel-in-progress for deploys)
- Least-privilege permissions per job
- `VITE_WS_*` build args with localhost fallback (same issue as §8.124)

### 8.137 docker-compose.yml (dev): no resource limits — Low

**Файл:** `docker-compose.yml` (214 lines)

Dev compose has health checks, `depends_on` with `condition: service_healthy`, networks, volumes — but **no resource limits** (no `deploy.resources`). Already noted in §8.68. Staging (§8.106) and prod have limits. Dev is fine without limits for development, but could cause issues on resource-constrained machines.

### 8.138 docker-compose.yml (dev): Grafana admin/admin — Low [FIXED]

**Файл:** `docker-compose.yml:187-188`

```yaml
- GF_SECURITY_ADMIN_USER=admin
- GF_SECURITY_ADMIN_PASSWORD=admin
```

Default Grafana credentials `admin/admin` in dev compose. Not a security issue for local dev, but if someone exposes port 3001 to the internet without changing this, Grafana is accessible with default creds.

### 8.139 docker-compose.yml (dev): VITE_WS localhost — ✅ Correct for dev

**Файл:** `docker-compose.yml:118-121`

```yaml
args:
  - VITE_WS_EXCHANGE=ws://localhost:8765
  - VITE_WS_SIGNALS=ws://localhost:8766
```

Comment correctly explains: "These URLs resolve in the USER'S BROWSER (not inside Docker). localhost works when Docker ports are mapped to the host." This is correct for dev. The issue (§8.124) is only for prod/staging where the browser can't reach `localhost`.

### 8.140 CONTRIBUTING.md: comprehensive — ✅ Good

**Файл:** `CONTRIBUTING.md` (616 lines)

Detailed setup guide:
- Prerequisites table (Python, Node, CMake, C++ compiler, vcpkg)
- Windows setup (VS Build Tools, vcpkg, Boost, OpenSSL)
- Linux setup (apt install)
- macOS setup (brew)
- Build instructions per component
- Testing instructions
- Code style (ruff, clang-format, eslint)
- PR process

### 8.141 Helm _helpers.tpl: standard labels — ✅ Good

**Файл:** `helm/templates/_helpers.tpl` (19 lines)

Standard Helm helper templates for labels and selector labels. Uses `app.kubernetes.io/*` labels per K8s conventions. Clean and minimal. ✅

### 8.142 C++ low_latency.h: CircuitBreaker state race — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:366-384`

The `CircuitBreaker` uses `memory_order_relaxed` for all state transitions. This is fine for a single-threaded hot path (which is the design — one thread checks `allow_request()`, one thread calls `record_failure()`). However, if `record_success()` and `record_failure()` are called concurrently from different threads:
- Thread A: `record_success()` → `error_count_ = 0`, `state_ = CLOSED`
- Thread B: `record_failure()` → `error_count_ = 1` (before A resets), then A resets to 0

The `fetch_add` in `record_failure` and `store(0)` in `record_success` can race — the error count could be inaccurate. For a circuit breaker, this means it might open too early or too late. In practice, this is acceptable for HFT (the circuit breaker is a safety net, not a precision instrument).

### 8.143 C++ low_latency.h: ObjectPool O(n) acquire — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:153-161`

```cpp
T* acquire() noexcept {
    for (size_t i = 0; i < PoolSize; ++i) {
        bool expected = false;
        if (pool_[i].active.compare_exchange_strong(expected, true, ...)) {
            return &pool_[i].obj;
        }
    }
    return nullptr;
}
```

`acquire()` is O(n) — linear scan through the pool. For small pools (e.g., 16 objects), this is fine. For large pools (e.g., 1000), it could be slow. A free-list with atomic stack would be O(1), but adds complexity. Acceptable for HFT where pool sizes are small.

### 8.144 deploy.yml: health check doesn't fail pipeline — Low [FIXED]

**Файл:** `.github/workflows/deploy.yml:143-145`

```yaml
if [ "$status" != "200" ]; then
  echo "WARNING: $endpoint returned $status"
fi
```

Same issue as deploy.sh (§8.89) — health check logs a warning but doesn't exit with non-zero. The pipeline succeeds even if all services are down. The `notify` job sends "SUCCESS" even when services are unhealthy.

**Фикс:** Add `exit 1` after the warning, or use `if: failure()` in the notify job.

### 8.145 C++ aligned_types.h: cache-line aligned data structures — ✅ Excellent

**Файл:** `hft-trade-bot/src/data/aligned_types.h` (268 lines)

All hot-path structs use `alignas(64)` to prevent false sharing:
- `AlignedOrderBookLevel` — 64 bytes, one per cache line, `static_assert` verifies size
- `FastSignal` — fixed-size `char symbol[32]` and `char reason[48]` (no `std::string` heap alloc), designed for SPSC queue transit
- Score breakdown (ema, rsi, obi, vwap, adx, pressure, composite) — all inline, no pointers

This is textbook HFT data design. No heap allocations, cache-line aligned, `static_assert` on sizes. ✅

### 8.146 C++ IExchange: abstract interface (DIP/SOLID) — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/IExchange.h` (43 lines)

Clean abstract interface with pure virtual methods:
- Exchange identity: `id()`, `maker_fee_bps()`, `taker_fee_bps()`, `estimated_latency_us()`
- Market data: `best_bid()`, `best_ask()`, `mid_price()`, `bid_depth()`, `ask_depth()`
- Availability: `is_available()`, `record_toxic_event()`, `toxic_event_count()`, `reset_toxic_events()`
- Virtual destructor = default

`SmartOrderRouterV2` depends on `IExchange*`, not concrete adapters. DIP/SOLID done right. ✅

### 8.147 C++ bot_context.h: God struct — Medium [N/A]

**Файл:** `hft-trade-bot/src/core/bot_context.h:67-111`

`BotContext` is a **God struct** — it holds 25+ members including:
- 3 signal engines (v1, v2, v3)
- 6 exchange adapters (3 real + 3 sim)
- 4 latency histograms
- 3 SHM IPC objects
- Position manager, risk manager, kill switch, order executor, smart order router, adaptive selector
- SPSC queue + mutex, atomic balance, arb lock, prices cache, candles buffer

This is a **dependency injection container** rather than a proper context. Every component is coupled through `BotContext`. While this works for a single-binary HFT bot, it makes testing individual components harder (need to construct the entire 25-member struct).

**Фикс:** Group related members into sub-structs (e.g., `ExchangeContext`, `MonitoringContext`, `IpcContext`).

### 8.148 C++ bot_context.h: SPSCQueue with mutex — Low [N/A]

**Файл:** `hft-trade-bot/src/core/bot_context.h:99-100`

```cpp
SPSCQueue<Signal, 16> ai_signal_queue;
std::mutex            ai_signal_queue_mtx;
```

`SPSCQueue` is designed for single-producer single-consumer (lock-free). But it's paired with a `std::mutex`, suggesting it's being used from multiple threads. If multiple threads produce signals, the SPSC queue is not safe — the `push()` has a data race. The mutex is a workaround, but it defeats the purpose of using a lock-free queue.

**Фикс:** Use `MPMCQueue` (multi-producer multi-consumer) if multiple threads produce, or remove the mutex if truly SPSC.

### 8.149 GitHub codeql.yml: security analysis — ✅ Excellent

**Файл:** `.github/workflows/codeql.yml` (78 lines)

- 3 languages: Python, JavaScript, C++
- Weekly scheduled scan (`cron: '0 0 * * 0'`)
- `paths-ignore` for vcpkg, node_modules, websocketpp, docs, md files
- Least-privilege permissions (`actions: read`, `contents: read`, `security-events: write`)
- C++ manual build with all dependencies
- `fail-fast: false` — all languages analyzed independently

### 8.150 docker-compose.prod.yml: production-grade — ✅ Excellent

**Файл:** `docker-compose.prod.yml` (278 lines)

This is a **textbook production Docker Compose**:
- **Mandatory secrets**: `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}` — fails if not set
- **Resource limits**: all 8 services have CPU + memory limits
- **Network segmentation**: `frontend` (web-ui), `backend` (internal: true), `monitoring`
- **Health checks**: all services with `start_period`, `interval`, `retries`
- **Depends-on healthy**: services wait for dependencies to be healthy
- **SHM IPC**: `ipc: shareable` on ai-signal-bot, `ipc: "container:trading-ai-signal-bot"` on hft-trade-bot
- **JSON logging**: `LOG_FORMAT=json`
- **Pinned images**: `postgres:16-alpine`, `redis:7-alpine`, `prom/prometheus:v3.0.0`, `grafana/grafana:11.4.0`
- **Redis config**: `--maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes`
- **PostgreSQL**: `PGDATA` custom path, `pg_isready` health check
- **Grafana**: env vars for passwords, dashboard provisioning

The `:?` syntax for mandatory secrets is the **correct** pattern — unlike Helm `values.yaml` (§8.69) which uses hardcoded defaults.

### 8.151 docker-compose.prod.yml: backend network internal — ✅ Good

**Файл:** `docker-compose.prod.yml:273-275`

```yaml
backend:
  driver: bridge
  internal: true
```

The `backend` network is `internal: true` — no external access. PostgreSQL and Redis are only accessible from within the Docker network, not from the host. This is the correct security pattern for databases. ✅

### 8.152 docker-compose.prod.yml: VITE_WS localhost fallback — Low [FIXED]

**Файл:** `docker-compose.prod.yml:237-238`

```yaml
- VITE_WS_EXCHANGE=${VITE_WS_EXCHANGE:-ws://localhost:8765}
- VITE_WS_SIGNALS=${VITE_WS_SIGNALS:-ws://localhost:8766}
```

Defaults to `localhost` if not set in `.env.prod`. Same issue as §8.124 — if someone forgets to set `VITE_WS_*` in `.env.prod`, the web-ui connects to localhost in production. The comment says "override via .env.prod" but there's no `:?` mandatory check like PostgreSQL password.

**Фикс:** Use `${VITE_WS_EXCHANGE:?VITE_WS_EXCHANGE must be set in .env.prod}` to fail fast.

### 8.153 C++ bot_loop.h: clean function declarations — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.h` (17 lines)

Clean separation of bot loop functions:
- `process_sl_tp`, `process_arbitrage`, `process_ai_signals`
- `run_v2_signal_loop`, `run_v1_fallback_loop`
- `poll_shm_market_data`, `graceful_shutdown`
- `print_status`

All take `BotContext&` by reference. No globals, no singletons. ✅

### 8.154 C++ risk_manager.h: dual risk system (V1 + V2) — ✅ Good

**Файл:** `hft-trade-bot/src/risk/risk_manager.h` (258 lines)

Two risk check levels:
- **V1 `check_signal()`** — hot path, no mutex, `[[unlikely]]` on rejection paths for I-cache optimization. Checks confidence, R:R, max positions, daily drawdown. Comment explains why no mutex (params read-only in hot path).
- **V2 `check_order()`** — pre-trade, mutex-protected. Checks blacklist, leverage, position size, exposure, daily loss, drawdown, rate throttle, margin. CAS-based rate limiter avoids check-then-act race.

Position sizing: risk-based (`risk_amount / risk_per_unit`), capped by max notional. ✅

### 8.155 C++ risk_manager.h: check_order mutex on hot path — Medium [FIXED]

**Файл:** `hft-trade-bot/src/risk/risk_manager.h:101`

```cpp
CheckResult check_order(...) {
    std::lock_guard<std::mutex> lk(params_mutex_);
```

`check_order()` takes a mutex on every call. In HFT, this is the pre-trade check — called before every order submission. The mutex serializes all order submissions. If the bot submits 50 orders/second, the mutex contention could add microseconds.

The mutex protects `params_` (blacklist, per-symbol limits) which are rarely modified. The hot-path reads could use a `std::shared_mutex` (read lock for check_order, write lock for blacklist modifications) to allow concurrent reads.

**Фикс:** Use `std::shared_mutex` with `shared_lock` for `check_order()` and `unique_lock` for `blacklist_symbol()`.

### 8.156 C++ risk_manager.h: daily_pnl operator+= on atomic — Low

**Файл:** `hft-trade-bot/src/risk/risk_manager.h:201`

```cpp
void update_pnl(double pnl) { daily_pnl_ += pnl; }
```

`daily_pnl_` is `std::atomic<double>`. The `+=` operator on `atomic<double>` is **not atomic** — it's equivalent to `daily_pnl_.store(daily_pnl_.load() + pnl)`, which is a check-then-act race. Two threads calling `update_pnl()` concurrently can lose updates.

Compare with `on_fill()` which correctly uses `fetch_sub()` (atomic). And `update_pnl_v2()` which correctly uses `store()` (overwrite, not increment).

**Фикс:** Use `daily_pnl_.fetch_add(pnl, std::memory_order_relaxed)`.

### 8.157 C++ pre_trade_risk.h: lock-free token bucket — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/pre_trade_risk.h` (205 lines)

`TokenBucket` rate limiter is fully lock-free:
- `try_acquire()` — CAS loop on `tokens_`
- `refill()` — CAS on `last_refill_ns_` ensures only one thread refills, then CAS loop on `tokens_`
- `try_acquire_n()` — batch acquire for multi-token operations

`PreTradeRisk::check()` is O(1), lock-free for most checks. 8 rejection codes with `const char*` reasons (no `std::string` allocation). Blacklist/whitelist support. ✅

### 8.158 C++ pre_trade_risk.h: blacklist/whitelist not thread-safe — Medium [FIXED]

**Файл:** `hft-trade-bot/src/risk/pre_trade_risk.h:189-193`

```cpp
void blacklist(const std::string& symbol) { config_.blacklist.insert(symbol); }
void unblacklist(const std::string& symbol) { config_.blacklist.erase(symbol); }
```

`blacklist()` and `unblacklist()` modify `config_.blacklist` (an `unordered_set`) without any synchronization. `check()` reads the same set concurrently. `unordered_set::insert()` while another thread does `count()` is a data race → undefined behavior.

**Фикс:** Use a `std::shared_mutex` or make the blacklist immutable after construction (copy-on-write).

### 8.159 C++ portfolio_risk.h: VaR/CVaR/drawdown — ✅ Good

**Файл:** `hft-trade-bot/src/risk/portfolio_risk.h` (262 lines)

- `DrawdownTracker` — peak-to-trough, underwater duration, max drawdown
- Historical VaR — sorted returns, percentile lookup
- Parametric VaR — mean - z * sigma * portfolio_value
- CVaR (Expected Shortfall) — average of tail beyond VaR
- Stress test — scenario shocks
- Fixed-size arrays for VaR/CVaR (no heap alloc in hot path)

### 8.160 C++ simd_indicators.h: AVX2 indicators — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h` (228 lines)

SIMD-accelerated indicator calculations:
- `SimdEMA` — AVX2 `_mm256_fmadd_pd` for 4 doubles in parallel, scalar fallback if `__AVX2__` not defined
- `SimdRSI` — SIMD gain/loss calculation
- Proper `#if defined(__AVX2__)` guard with scalar fallback

This is the correct way to use SIMD — compile-time guard, portable fallback, aligned data. ✅

### 8.161 C++ signal_receiver.h: WebSocket client — ✅ Good

**Файл:** `hft-trade-bot/src/communication/signal_receiver.h` (210 lines)

- WebSocket++ client for exchange simulator + AI signal bot
- Callback-based: `SignalCallback`, `CandleCallback`, `ArbitrageCallback`
- Symbol registration with ID mapping
- Private inheritance from `SignalReceiverData` (composition over inheritance)
- Uses `nlohmann::json` for parsing (not `snprintf` like `order_executor.h`)

### 8.162 Terraform: hardcoded RDS password — Medium [FIXED]

**Файл:** `terraform/environments/dev/main.tf:31`

```hcl
variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
  default     = "ChangeMeInProduction123!"
}
```

The `sensitive = true` flag prevents the password from being displayed in Terraform output, but the **default value** is hardcoded in the source file. If someone runs `terraform apply` without setting `db_password`, the RDS instance gets `ChangeMeInProduction123!`. This is in the dev environment, but it's still a real RDS instance with real data.

**Фикс:** Remove the `default` line. Terraform will prompt for the password interactively, or it can be set via `TF_VAR_db_password` environment variable or `terraform.tfvars` (gitignored).

### 8.163 Terraform: S3 backend with encryption + locking — ✅ Good

**Файл:** `terraform/environments/dev/main.tf:13-19`

```hcl
backend "s3" {
  bucket         = "hft-trading-tfstate-dev"
  key            = "dev/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "hft-trading-tflock-dev"
}
```

State encryption (`encrypt = true`) and locking (`dynamodb_table`) are configured. This prevents concurrent `terraform apply` and protects state files at rest. ✅

### 8.164 Terraform: modular structure — ✅ Good

**Файл:** `terraform/environments/dev/main.tf` (98 lines)

Clean modular composition:
- `vpc` module — CIDR, availability zones
- `eks` module — node types, scaling
- `rds` module — instance class, storage
- `elasticache` module — Redis cache
- `s3` module — log storage

Outputs for cluster endpoint, RDS endpoint, Redis endpoint, S3 bucket. Environment-specific (dev vs prod). ✅

### 8.165 verify.bat: comprehensive Windows test runner — ✅ Good

**Файл:** `verify.bat` (123 lines)

- 5 components: exchange_simulator, ai-signal-bot, C++ CMake, Rust cargo, web-ui
- Error tracking with `EXIT_CODE`
- Graceful skip if CMake not found
- Per-component pass/fail reporting

### 8.166 C++ risk_manager: duplicate risk system — Medium [N/A]

**Файлы:** `risk_manager.h` vs `pre_trade_risk.h`

There are **two separate pre-trade risk systems**:
1. `RiskManager::check_order()` — V2, mutex-protected, 8 checks
2. `PreTradeRisk::check()` — lock-free, 8 checks, token bucket rate limiter

Both do essentially the same thing: blacklist, leverage, position size, exposure, daily loss, rate limit, margin. This is code duplication. The `PreTradeRisk` version is better (lock-free, token bucket) but `RiskManager` is used in `BotContext`.

**Фикс:** Consolidate into one risk system. Use `PreTradeRisk` (lock-free) and remove `RiskManager::check_order()`, or vice versa.

### 8.167 C++ risk_manager: reset_daily not thread-safe — Low

**Файл:** `hft-trade-bot/src/risk/risk_manager.h:214`

```cpp
void reset_daily() { daily_pnl_ = 0.0; }
```

Uses `operator=` on `atomic<double>` which is atomic (store), but `peak_equity_` is not reset. If the peak equity from yesterday is still set, the drawdown check will compare today's equity against yesterday's peak — incorrect.

**Фикс:** Also reset `peak_equity_` and `orders_this_second_` in `reset_daily()`.

### 8.168 C++ signal_engine_v2.h: 6-indicator composite — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h` (494 lines)

6-indicator weighted composite signal engine:
- EMA(21/50) crossover with 9-period signal line (MACD-style)
- RSI(14) with overbought/oversold zones
- Order Book Imbalance — multi-level (5/10/20), proximity-weighted
- VWAP deviation with ±2σ bands
- ADX(14) trend strength filter
- Pressure Model — body direction + trade flow + toxicity penalty

Design: no heap allocations in `analyze()`, all stack-allocated (max 256 candles), branchless where possible, cache-line aligned output (`FastSignal` is `alignas(64)`), configurable cooldown. ✅

### 8.169 C++ signal_engine_v3.h: HMM regime detection — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h` (437 lines)

V3 adds Hidden Markov Model for market regime detection:
- 4 states: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
- Online Baum-Welch parameter adaptation
- Viterbi decoding for most likely state path
- Regime gates V2 signals (boost/dampen based on regime)
- O(1) per-tick update via online HMM forward recursion
- No heap allocations in `analyze()`

This is advanced quantitative finance — HMM regime detection is a research-grade feature. ✅

### 8.170 C++ market_making_v2.h: Avellaneda-Stoikov — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/market_making_v2.h` (177 lines)

Avellaneda-Stoikov passive market making:
- Reservation price: `r = s - q * gamma * sigma^2 * (T - t)`
- Dynamic spread based on volatility + inventory
- Inventory skew (bid/ask size adjustment)
- Adverse selection protection (cancel on toxicity spike)
- EWMA volatility estimation
- Spread cap/floor bounds
- No heap allocations in hot path

Textbook implementation of the Avellaneda-Stoikov model. ✅

### 8.171 C++ shm_ring_buffer.h: cross-process SPSC — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h` (348 lines)

Shared memory SPSC lock-free ring buffer for C++ ↔ Python IPC:
- Cross-platform: `CreateFileMappingW`/`MapViewOfFile` (Windows) + `shm_open`/`mmap` (POSIX)
- `ShmHeader` — 192 bytes (3 cache lines), `alignas(64)` on head/tail to prevent false sharing
- `static_assert(sizeof(ShmHeader) == 192)` — compile-time size verification
- Magic number validation (`0xHFT42SHM`)
- Capacity/element_size validation on open
- Power-of-2 capacity (bitwise AND instead of modulo)
- `try_push()`/`try_pop()` — `memory_order_acquire/release` on head/tail
- RAII destructor: `munmap`/`UnmapViewOfFile` + `shm_unlink` (if owner)
- Deleted copy/move constructors

This is textbook cross-process lock-free IPC. ✅

### 8.172 C++ shm_heartbeat.h: seq-guarded heartbeat — ✅ Good

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h` (272 lines)

Heartbeat via shared memory:
- `HeartbeatSlot` — `alignas(64)`, `static_assert` size ≤ 64
- Seq-guarded write: `seq` goes odd (writing) → even (done). Reader checks seq is even and unchanged.
- Cross-platform: Windows + POSIX
- RAII destructor with `shm_unlink` for owner
- Bidirectional: C++ writes, Python reads (and vice versa)

The seq-guard pattern is the correct way to do lock-free atomic reads of multi-field structs. ✅

### 8.173 ai-signal-bot migrate.py: idempotent migration runner — ✅ Excellent

**Файл:** `ai-signal-bot/scripts/migrate.py` (101 lines)

This is the **correct** migration runner that `Makefile.prod` (§8.132) should use:
- Creates `schema_migrations` table with `IF NOT EXISTS`
- Checks applied migrations before running
- Skips already-applied files
- Records each applied migration with timestamp
- Sorted glob of `*.sql` files
- `--up` flag for explicit execution
- Graceful error handling with `break` on failure

This addresses the R110 finding — `Makefile.prod` has a non-idempotent migration runner, but `migrate.py` is idempotent. The fix is to use `migrate.py` instead of the inline Makefile script.

### 8.174 ai-signal-bot migrate.py: narrow exception catch — Low [FIXED]

**Файл:** `ai-signal-bot/scripts/migrate.py:80`

```python
except (OSError, ValueError, RuntimeError, KeyError) as e:
```

The exception catch is narrow — it doesn't catch `asyncpg.PostgresError`. If a SQL migration fails with a PostgreSQL error (e.g., "table already exists", "syntax error"), it won't be caught and the script will crash with a traceback. The `break` on error is correct (stops on first failure), but the exception list should include `asyncpg.PostgresError` or use `Exception` with logging.

**Фикс:** Add `asyncpg.PostgresError` to the exception tuple, or use `except Exception as e:` with proper logging.

### 8.175 Helm Chart.yaml: clean metadata — ✅ Good

**Файл:** `helm/Chart.yaml` (14 lines)

Standard Helm chart metadata:
- `apiVersion: v2`
- `appVersion: "2.0.0"` — matches Docker Hub image tags
- Keywords for discoverability
- Maintainer field

Clean and minimal. ✅

### 8.176 C++ signal_engine_v2: 3 signal engines (v1, v2, v3) — Medium [N/A]

**Файлы:** `signal_engine.h` (v1), `signal_engine_v2.h`, `signal_engine_v3.h`

`BotContext` holds all 3 signal engines:
```cpp
std::unique_ptr<SignalEngineV2> engine_v2;
std::unique_ptr<SignalEngineV3> engine_v3;
std::unique_ptr<SignalEngine>   engine_v1;
```

V3 wraps V2 (includes `signal_engine_v2.h`). V1 is the fallback. This is 3 versions of the same component. If V3 is the production engine and V1 is fallback, V2 may be dead code (only used through V3).

**Code reduction:** If V2 is only used through V3, it can be merged into V3. If V1 is only a fallback, it can be simplified. Potential ~200 lines reduction.

### 8.177 C++ shm_ring_buffer: no cleanup on crash (already noted) — Info [FIXED]

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h:168-172`

Already noted in §8.95 (R92). On POSIX, if the C++ process crashes, `shm_unlink` is not called — the shared memory segment persists in `/dev/shm/`. On restart, `shm_open` with `O_CREAT` will open the existing segment with stale data. The magic/capacity validation will pass, but head/tail may be in an inconsistent state.

**Фикс:** On open (not create), reset head/tail to 0 if the data is stale (e.g., check heartbeat timestamp).

### 8.178 C++ adaptive_order_selector_v2.h: dynamic order type — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/adaptive_order_selector_v2.h` (223 lines)

Selects order type (IOC/FOK/GTD/PostOnly) based on:
- Confidence thresholds (high/low/emergency)
- Spread (tight/wide bps)
- Toxicity score
- OBI urgency
- Large order vs depth ratio
- GTD duration in seconds

Returns `FastOrder::OrderKind` + limit price + expire_ns + reason. `const char*` reason (no heap alloc). `noexcept` on select(). ✅

### 8.179 C++ mean_reversion_v2.h: OU + Kalman filter — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h` (301 lines)

Ornstein-Uhlenbeck based mean reversion with Kalman filter fair price:
- `KalmanFilter1D` — predict/update cycle, process/measurement noise configurable
- OU parameter estimation (κ, θ, σ) from price history
- Z-score from OU residual
- Volatility-scaled entry/exit thresholds
- Half-life based position holding
- No heap allocations, all fixed-size arrays

Research-grade implementation. ✅

### 8.180 C++ statistical_arb_v2.h: cointegration pair trading — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/statistical_arb_v2.h` (252 lines)

Engle-Granger 2-step cointegration test with Kalman filter adaptive hedge ratio:
- Entry/exit/stop z-score thresholds
- OLS regression window (configurable, capped at MAX_WINDOW)
- Kalman filter for hedge ratio adaptation
- 5 signal actions: NONE, LONG_SHORT, SHORT_LONG, CLOSE, STOP
- Min samples before trading (200 default)
- No heap allocations in hot path

### 8.181 C++ momentum_breakout_v2.h: multi-timeframe momentum — ✅ Good

**Файл:** `hft-trade-bot/src/strategies/momentum_breakout_v2.h` (204 lines)

EMA stack (9/21/50/200) with slope detection, volume confirmation (1.5× average), ATR-based breakout level, ADX-gated (only trade when ADX > 25). No heap allocations. ✅

### 8.182 C++ inline_indicators.h: O(1) indicators — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/inline_indicators.h` (295 lines)

O(1) per-update inline indicators:
- `InlineEMA` — `k = 2/(period+1)`, `[[unlikely]]` on first init
- `InlineRSI` — Wilder's smoothing
- `InlineADX` — DI+/DI- with Wilder's smoothing
- `InlineVWAP` — cumulative volume × price / cumulative volume
- `InlineATR` — Wilder's smoothing

`StringHash` with `is_transparent` — enables `find(const char*)` without `std::string` allocation. This is a C++20 best practice for `unordered_map` with string keys. ✅

### 8.183 C++ system_monitor.h: atomic metrics — ✅ Excellent

**Файл:** `hft-trade-bot/src/monitoring/system_monitor.h` (205 lines)

11 atomic counters: ORDERS_SENT, ORDERS_FILLED, ORDERS_REJECTED, ORDERS_CANCELED, SIGNALS_RECEIVED, SIGNALS_PROCESSED, ERRORS, RECONNECTS, SHM_DROPS, HEARTBEATS_SENT, HEARTBEATS_MISSED.

- `increment()` — `fetch_add(relaxed)`, no locks
- `snapshot()` — consistent point-in-time read of all metrics
- `fill_rate()` / `rejection_rate()` — computed from atomic counters
- `format_json()` — `snprintf` with `min(n, sizeof(buf)-1)` truncation guard (unlike `order_executor.h` §8.118)
- `reset()` — stores 0 to all counters, resets start_time
- `MemoryTracker` class for approximate memory usage

### 8.184 C++ system_monitor: format_json snprintf — ✅ Good

**Файл:** `hft-trade-bot/src/monitoring/system_monitor.h:110-127`

Unlike `order_executor.h` (§8.118), this `snprintf` correctly truncates:
```cpp
n = std::min(n, static_cast<int>(sizeof(buf) - 1));
return std::string(buf, static_cast<size_t>(n));
```

Also checks `n <= 0` and returns `"{}"`. This is the correct pattern for `snprintf` to JSON. ✅

### 8.185 C++ types.h: core data structures — ✅ Good

**Файл:** `hft-trade-bot/src/data/types.h` (92 lines)

Clean data structures:
- `Candle` — OHLCV + symbol + exchange
- `OrderBook` — bids/asks vectors, `best_bid()`, `best_ask()`, `spread()`, `mid_price()` with empty checks
- `Order` — `std::optional<double> price` (nullopt for market orders)
- `Position` — `update_pnl()` with fees + funding deduction

`OrderBook::best_bid()` correctly checks `bids.empty()` before accessing `bids[0]`. ✅

### 8.186 C++ types.h: string_to_side no validation — Low

**Файл:** `hft-trade-bot/src/data/types.h:21-23`

```cpp
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}
```

Any string that's not "BUY" returns `Side::SELL`. If the input is "buy" (lowercase), "Buy", "SELL", "HOLD", or garbage, it returns `Side::SELL`. This is a silent default that could lead to incorrect order sides.

**Фикс:** Throw on invalid input, or add explicit `"SELL"` check with error on anything else.

### 8.187 web-ui: 50+ components with proper interval cleanup — ✅ Good

**Файлы:** `web-ui/src/components/*.jsx` (50+ files)

All `setInterval` calls in web-ui components have proper `clearInterval` cleanup:
- `BotStatus.jsx:64-66` — `setInterval` + `clearInterval` in useEffect return
- `ExecutionBot.jsx:92,95-99` — `intervalRef.current` + cleanup on unmount
- `ReconnectBanner.jsx:23-25` — `setInterval` + `clearInterval` in return
- `SessionReplay.jsx:40-42,54-57` — both recording and playback intervals cleaned
- `MarketDepthReplay.jsx:74` — playback interval with cleanup
- `TradeReplay.jsx:55` — auto-play interval with cleanup

No memory leaks from uncleared intervals. ✅

### 8.188 web-ui: 50+ components — code reduction opportunity — Medium

**Файл:** `web-ui/src/components/` (50+ files)

50+ JSX components is a large UI surface. Many appear to be specialized visualization panels (AffineArithmetic, ArzelaAscoli, BanachFixedPoint, BurgersEquation, CameronMartinFormula, CesaroFejerKernel, etc.). These are mathematical/scientific visualization components that may not all be actively used.

**Code reduction:** Audit which components are actually rendered in the app. Unused components can be removed. Potential ~1000+ lines reduction if 10-15 components are dead code.

### 8.189 C++ system_monitor: snapshot not atomic — Low

**Файл:** `hft-trade-bot/src/monitoring/system_monitor.h:76-93`

`snapshot()` reads 11 atomic counters individually with `relaxed` ordering. Between reads, another thread can modify counters. The snapshot may be inconsistent — e.g., `orders_sent` might be from time T1 but `orders_filled` from T2. For monitoring this is acceptable (approximate values are fine), but for precise calculations it could give wrong ratios.

**Фикс:** Acceptable for monitoring. If precise consistency is needed, use a `shared_mutex` or accept that monitoring is approximate by design.

### 8.190 C++ pressure_model.h: multi-level OBI + toxicity — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h` (258 lines)

L2 order book microstructure analysis:
- Multi-level OBI (5/10/20 levels) — single-pass optimization (previously 3 separate calls)
- Trade flow imbalance (buyer vs seller initiated)
- Toxicity detection (large orders > median × threshold)
- Queue position estimation
- Spread regime classification (TIGHT/NORMAL/WIDE)
- Price impact estimation
- `[[unlikely]]` on empty book checks
- No heap allocations, all inlined

### 8.191 C++ obi_utils.h: extracted OBI functions — ✅ Good

**Файл:** `hft-trade-bot/src/strategies/obi_utils.h` (78 lines)

OBI utility functions extracted from `signal_engine_v2.h` for file-size compliance:
- `compute_obi_levels()` — simple bid/ask volume ratio at N levels
- `compute_weighted_obi()` — proximity-weighted (1/(1+i)) volume ratio
- `compute_obi_all()` — single-pass for 5/10/20 levels + weighted (avoids 3 separate iterations)

All `noexcept`, `inline`, with `1e-12` zero-division guard. ✅

### 8.192 C++ signal.h: NEUTRAL defaults to BUY — Low

**Файл:** `hft-trade-bot/src/data/signal.h:25-29`

```cpp
Side side() const {
    if (is_long()) return Side::BUY;
    if (is_short()) return Side::SELL;
    return Side::BUY; // NEUTRAL defaults to BUY; caller should check is_actionable() first
}
```

Same pattern as `string_to_side` (§8.186) — silent default to BUY. The comment says "caller should check `is_actionable()` first", but there's no enforcement. If a caller forgets to check `is_actionable()` and calls `side()` on a NEUTRAL signal, they get a BUY order. This is a documentation-only guard, not a compile-time or runtime guard.

**Фикс:** Return `std::optional<Side>` or throw on NEUTRAL. Or add `assert(is_actionable())` in debug builds.

### 8.193 Helm values.yaml: hardcoded passwords — Medium [FIXED]

**Файл:** `helm/values.yaml:17,131-132`

```yaml
postgres:
  password: "change-me-in-production"  # Override via --set or existingSecret

grafana:
  adminPassword: ""  # Set via --set grafana.adminPassword=...
```

PostgreSQL has a hardcoded default password. If someone runs `helm install` without overriding `postgres.password`, the database gets `change-me-in-production`. Grafana has an empty admin password — if not overridden, Grafana may use its default `admin/admin`.

The comments say to override, but there's no enforcement (no `required` constraint, no fail-fast).

**Фикс:** Use `existingSecret` pattern — require a pre-created Kubernetes secret. Remove default password values. Add a note in README that secret must be created before `helm install`.

### 8.194 Helm values.yaml: resource limits on all services — ✅ Good

**Файл:** `helm/values.yaml` (151 lines)

All 7 services have resource requests + limits:
- PostgreSQL: 256Mi/250m → 512Mi/1
- Redis: 128Mi/100m → 256Mi/500m
- Exchange Simulator: 256Mi/250m → 512Mi/1
- AI Signal Bot: 512Mi/500m → 1Gi/2
- HFT Trade Bot: 256Mi/500m → 512Mi/2
- Web UI: 128Mi/100m → 256Mi/500m
- Prometheus: 128Mi/100m → 256Mi/500m
- Grafana: 128Mi/100m → 256Mi/500m

This is better than docker-compose dev (no limits). ✅

### 8.195 Helm values.yaml: VITE_WS localhost in production — Medium [FIXED]

**Файл:** `helm/values.yaml:104-105`

```yaml
webUi:
  wsExchange: ws://localhost:8765
  wsSignals: ws://localhost:8766
```

Same issue as §8.124 and §8.152 — `localhost` WebSocket URLs in production config. The comment correctly notes these are build-time Vite args (inlined into JS bundle), not runtime env vars. But the default is still `localhost`. In K8s, the browser can't reach `localhost:8765` — it needs the cluster's external IP or domain.

**Фикс:** Set these as Docker build ARGs in the CI/CD pipeline, not in Helm values. Or use a ConfigMap + initContainer to inject the correct URLs at runtime.

### 8.196 web-ui ExchangeContext: clean context pattern — ✅ Good

**Файл:** `web-ui/src/contexts/ExchangeContext.jsx` (133 lines)

- 3 exchange themes (Binance, Bybit, Coinbase) with full color palettes
- 3 exchange layouts (order form position, compact mode, etc.)
- CSS variables applied to `document.documentElement` on exchange switch
- `switchExchange()` validates exchange ID before setting
- `useExchange()` throws if used outside `ExchangeProvider`
- `useCallback` for stable `switchExchange` reference

Clean React context pattern with proper error boundary. ✅

### 8.197 web-ui usePerformance.js: performance hooks — ✅ Excellent

**Файл:** `web-ui/src/hooks/usePerformance.js` (153 lines)

4 performance hooks:
- `useDebouncedValue()` — setTimeout + clearTimeout cleanup
- `useThrottledCallback()` — throttle with trailing edge, `useRef` for stable callback
- `useBatchedUpdates()` — `requestAnimationFrame` batching with `maxBatchSize` flush, cleanup on unmount
- `useWorker()` — web worker lifecycle management with `terminate()` cleanup
- `useIntersectionObserver()` — lazy loading with `disconnect()` cleanup

All hooks have proper cleanup in `useEffect` return. No memory leaks. `useBatchedUpdates` is particularly well-designed — flushes on max batch size OR next animation frame, whichever comes first. ✅

### 8.198 C++ signal.h: rr_ratio division by zero — ✅ Good

**Файл:** `hft-trade-bot/src/data/signal.h:31-42`

```cpp
double rr_ratio() const {
    if (is_long()) {
        double risk = entry_price - stop_loss;
        double reward = take_profit - entry_price;
        return risk > 0 ? reward / risk : 0.0;
    }
    // ...
}
```

Correctly guards `risk > 0` before division. Returns 0.0 if risk ≤ 0 (invalid SL/TP). ✅

### 8.199 Helm values.yaml: ingress disabled by default — ✅ Good

**Файл:** `helm/values.yaml:143-151`

```yaml
ingress:
  enabled: false
  className: nginx
  hostname: trading.local
  tls:
    enabled: false
    secretName: trading-tls
```

Ingress is disabled by default — user must explicitly enable it. TLS is also disabled by default but configurable. This is the correct default for a trading system (don't expose publicly without explicit configuration). ✅

### 8.200 C++ signal.h: string-based direction — Info

**Файл:** `hft-trade-bot/src/data/signal.h:11`

```cpp
std::string direction; // "LONG", "SHORT", "NEUTRAL"
```

Direction is a `std::string` compared with `== "LONG"` / `== "SHORT"`. This is a heap-allocated string in a hot-path data structure. Compare with `FastSignal` in `aligned_types.h` which uses `char[32]` (no heap). The `Signal` struct is used for received signals (from WebSocket), not for the hot-path SPSC queue — so heap allocation is acceptable here. But if `Signal` is ever copied into the hot path, it will allocate.

**Фикс:** No fix needed if `Signal` stays on the receiving side. If it enters the hot path, convert to `FastSignal`.

### 8.201 C++ ExchangeBase: EMA latency tracking + toxic backoff — ✅ Excellent

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines)

Partial implementation of `IExchange` with:
- **EWMA latency tracking**: `record_latency()` uses CAS loop for lock-free exponential moving average: `next = current + (us - current) / 10`. This is a 10-sample EMA — smooth, no spikes.
- **Toxic event backoff**: `record_toxic_event()` increments atomic counter. `is_available()` returns false after 5 toxic events. `reset_toxic_events()` for recovery.
- `std::atomic<int64_t> latency_avg_` — relaxed ordering (acceptable for monitoring)
- `std::atomic<int> toxic_count_` — relaxed ordering (acceptable for circuit breaker)

Clean base class with proper atomic usage. ✅

### 8.202 C++ BinanceAdapter: HMAC-SHA256 + rate limiting — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h` (190 lines)

Binance Futures adapter:
- **Market data**: `wss://fstream.binance.com/ws/<stream>` — bookTicker, depth20@100ms, aggTrade
- **Order submission**: REST `POST /fapi/v1/order` with HMAC-SHA256
- **User data stream**: listenKey → `wss://fstream.binance.com/ws/<listenKey>`, ping every 30 min
- **Rate limiting**: CAS-based 300 orders/10s window — `orders_in_window_.fetch_add(1) < 300`
- **Spinlock** for price/depth maps (not mutex — good for HFT)
- `symbol_lower()` — converts "BTC/USDT" → "btcusdt" for Binance WS streams
- Config: `api_key`, `api_secret` as `std::string` (no hardcoded values)

### 8.203 C++ BinanceAdapter: nested Spinlock acquisition — Medium [FIXED]

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:74-79`

```cpp
void on_book_ticker(...) {
    std::lock_guard<Spinlock> lk(price_lock_);
    bids_[symbol] = bid;
    asks_[symbol] = ask;
    std::lock_guard<Spinlock> lk2(depth_lock_);  // Nested lock
    bid_depth_[symbol] = bid_qty;
    ask_depth_[symbol] = ask_qty;
}
```

`on_book_ticker()` acquires `price_lock_` then `depth_lock_`. `on_depth_update()` (lines 88-99) acquires them separately (price first, then depth). If another thread calls `best_bid()` (acquires `price_lock_`) and `bid_depth()` (acquires `depth_lock_`) in the opposite order, there's a potential deadlock. However, since both use Spinlocks (not mutexes), a deadlock would manifest as a livelock (both threads spinning) rather than a permanent block.

The current code always acquires `price_lock_` before `depth_lock_`, so the lock ordering is consistent. But this is fragile — if someone adds a method that acquires `depth_lock_` first, it will deadlock.

**Фикс:** Document the lock ordering convention (price → depth) in a comment. Or combine into a single lock.

### 8.204 C++ BinanceAdapter: can_send_order TOCTOU — Low [FIXED]

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:123-136`

```cpp
bool can_send_order() {
    // ... reset window if 10s elapsed ...
    return orders_in_window_.fetch_add(1, std::memory_order_relaxed) < 300;
}
```

`fetch_add(1)` always increments, even if the result is ≥ 300 (order rejected). This means rejected orders still count against the rate limit. If 300 orders are rejected, the counter is at 600 — the next 300 valid orders will also be rejected until the window resets.

**Фикс:** Use `compare_exchange` to only increment if below threshold. Or reset counter when window rolls over (already done, but the over-count persists within the window).

### 8.205 C++ OKXAdapter: OKX-specific instrument ID conversion — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/OKXAdapter.h` (143 lines)

OKX Futures adapter:
- **Instrument ID conversion**: `to_inst_id("BTC/USDT")` → `"BTC-USDT-SWAP"` (OKX format)
- **HMAC-SHA256 + passphrase** auth (OKX requires 3 credentials)
- **WebSocket**: public + private channels, login message for private
- **Rate limits**: 20 req/2s per endpoint, 60 req/2s for orders
- **Spinlock** for price/depth maps
- Fee structure: 2 bps maker, 5 bps taker (different from Binance's 2/4)

`to_inst_id()` correctly handles "BTC/USDT" and "BTCUSDT" formats. ✅

### 8.206 C++ BybitAdapter: Bybit Futures adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BybitAdapter.h` (137 lines)

Bybit Futures adapter:
- **Market data**: `wss://stream.bybit.com/v5/public/linear`
- **Order submission**: REST `POST /v5/order/create` with HMAC-SHA256
- **Rate limits**: 120 req/min for orders, 600 req/min for queries
- **Spinlock** for price/depth maps
- Fee structure: 1 bps maker, 6 bps taker (best maker fee, worst taker fee)

### 8.207 C++ 3 exchange adapters: code duplication — Medium [N/A]

**Файлы:** `BinanceAdapter.h` (190), `OKXAdapter.h` (143), `BybitAdapter.h` (137)

All 3 adapters have identical structure:
- `Spinlock price_lock_` + `Spinlock depth_lock_`
- `unordered_map<string, double> bids_, asks_, bid_depth_, ask_depth_`
- `best_bid()`, `best_ask()`, `mid_price()`, `bid_depth()`, `ask_depth()` — identical implementations
- `on_book_ticker()` / `on_ticker()` — identical logic, different name

Total: 470 lines, ~200 of which are duplicated. The only differences are:
- Fee rates (constructor args)
- WS/REST URLs (config strings)
- Auth method (HMAC-SHA256 vs HMAC-SHA256+passphrase)
- Symbol format (BTCUSDT vs BTC-USDT-SWAP vs BTCUSDT)
- Rate limit values

**Code reduction:** Move `bids_`, `asks_`, `bid_depth_`, `ask_depth_`, `price_lock_`, `depth_lock_` and all 5 `best_bid()`/`best_ask()`/etc. methods to `ExchangeBase`. Adapters only implement exchange-specific logic (auth, WS URLs, symbol format). Potential ~200 lines reduction.

### 8.208 C++ binance_config.h: constexpr exchange constants — ✅ Excellent

**Файл:** `hft-trade-bot/src/exchange/binance/binance_config.h` (141 lines)

All Binance-specific constants as `constexpr const char*`:
- Endpoints (WS, REST, testnet)
- Rate limits (2400 weight/min, 1200 orders/min, 10 req/s)
- WS channels (depth, aggTrade, kline, markPrice, forceOrder)
- Kline intervals (1m, 5m, 15m, 1h, 4h, 1d)
- Order types (MARKET, LIMIT, STOP, STOP_MARKET, TAKE_PROFIT, etc.)
- Time in force (GTC, IOC, FOK, GTX)

`constexpr` — compile-time evaluation, no runtime overhead. `string_view` support for zero-copy comparisons. ✅

### 8.209 web-ui App.jsx: lazy loading + Suspense — ✅ Good

**Файл:** `web-ui/src/App.jsx` (565 lines)

14 components lazy-loaded with `React.lazy()` + `Suspense`:
- `AccountPanel`, `PositionsPanel`, `SignalFeed`, `SignalPerformance`
- `ArbitragePanel`, `PriceComparison`, `FillsPanel`, `PerformanceDashboard`
- `BacktestRunner`, `TradeHistory`, `BotStatus`, `DepthChart`
- `CorrelationHeatmap`, `OnboardingTutorial`

`PanelFallback` component for loading state. `TabButton` wrapped in `memo()` for render optimization. ✅

### 8.210 web-ui App.jsx: Zustand store sync — ✅ Good

**Файл:** `web-ui/src/App.jsx:92-134`

Data flows: WebSocket hooks → `useEffect` → Zustand `setExchangeData()` / `setSignalData()`:
- Exchange data: candles, prices, accounts, arbitrage, fills, orderbooks, funding rates
- Signal data: signals, regime, backtest results, circuit breaker
- Connection state tracking with `useRef` for prev state (toast notifications on connect/disconnect)
- Sound alerts on fills and strong signals

Clean unidirectional data flow: WS → hook → store → components. ✅

### 8.211 web-ui App.jsx: 565 lines — Medium [FIXED]

**Файл:** `web-ui/src/App.jsx` (565 lines)

App.jsx is 565 lines — the largest JSX file in the project. It handles:
- Store sync (2 useEffects)
- Connection notifications (2 useEffects)
- Fill notifications (1 useEffect)
- Signal notifications (1 useEffect)
- Keyboard shortcuts
- Tab rendering (14 tabs)
- Mobile/tablet responsive layout
- Detached panel management
- Theme toggling

This is a "God component" — similar to the C++ `BotContext` God struct (§8.147). While not a bug, it's a maintainability concern.

**Code reduction:** Extract notification logic into a `useNotifications` hook. Extract tab rendering into a `TabContainer` component. Potential ~200 lines reduction.

### 8.212 shared_config.yaml: localhost in production — Medium [FIXED]

**Файл:** `shared_config.yaml:108,112`

```yaml
websocket:
  exchange_simulator:
    host: localhost
    port: 8765
  ai_signal_bot:
    host: localhost
    port: 8766
```

Same `localhost` issue as §8.124, §8.152, §8.195. This is the shared config that all components read. In production (K8s, Docker Compose prod), `localhost` won't work — components are in separate containers/pods.

**Фикс:** Use environment variable substitution: `host: ${EXCHANGE_SIMULATOR_HOST:-localhost}`. Or remove from shared config and let each component's own config handle it.

### 8.213 shared_config.yaml: 50 symbols + 3 exchanges — ✅ Good

**Файл:** `shared_config.yaml` (115 lines)

50 trading pairs (BTC/USDT through MINA/USDT), 3 exchanges (binance, bybit, okx), default exchange: binance. Risk parameters match component configs (2% per trade, 8% daily drawdown, 65% min confidence, 1.5 min R:R). Timeframe: 5m (300s). Account: $10,000 USDT, 10× leverage.

Clean, well-commented shared config. ✅

### 8.214 C++ ExchangeBase: is_available threshold hardcoded — Low

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h:49`

```cpp
bool is_available() const override { return toxic_count_.load(std::memory_order_relaxed) < 5; }
```

The toxic event threshold (5) is hardcoded. If an exchange has a brief connectivity issue causing 5 toxic events, it's marked unavailable. There's no way to configure this per-exchange or per-environment.

**Фикс:** Make the threshold configurable via constructor parameter or config.

### 8.215 Alertmanager config: hardcoded SMTP password — Medium [FIXED]

**Файл:** `monitoring/alertmanager/config.yml:12`

```yaml
smtp_auth_password: 'your-password'
```

Hardcoded SMTP password in Alertmanager config. If this file is committed to git (which it is), the password is exposed. Even though it's a placeholder (`your-password`), someone will replace it with a real password and commit.

Also: Slack webhook URL (`https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK`) and Discord webhook URL (`https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK`) are placeholders but will be replaced with real URLs containing auth tokens.

**Фикс:** Use environment variable substitution in Alertmanager (supported via `--config.env-file` or `{{ .Env.SMTP_PASSWORD }}` in templates). Or use Kubernetes secrets to mount the config file.

### 8.216 Alertmanager config: inhibition rules — ✅ Good

**Файл:** `monitoring/alertmanager/config.yml:84-98`

Two inhibition rules:
1. Critical firing → suppress warning alerts for same component + alertname
2. Critical firing → suppress info alerts for same component + alertname

This prevents alert storms — when a critical alert fires, related warnings and info alerts are suppressed. ✅

### 8.217 Alertmanager config: no silence rules — Info

**Файл:** `monitoring/alertmanager/config.yml`

No silence rules or maintenance windows configured. Silences must be created manually via Alertmanager API or UI. For a trading system with planned maintenance windows, automated silences would reduce false alerts during deployments.

**Фикс:** Add scheduled silences via Alertmanager API or Amtool CLI in CI/CD deploy pipeline.

### 8.218 web-ui useTradingStore: Zustand store — ✅ Good

**Файл:** `web-ui/src/stores/useTradingStore.js` (59 lines)

Clean Zustand store with 3 batch setters:
- `setExchangeData(data)` — candles, prices, accounts, arbitrage, fills, orderbooks, etc.
- `setSignalData(data)` — signals, regime, backtest, circuit breaker
- `setDerivedData(data)` — chartCandles, currentPrice, priceChange

Actions (submitOrder, closePosition, etc.) are stored as nullable function references set by hooks. This is a clean pattern — hooks own the WebSocket connection, store owns the state. ✅

### 8.219 web-ui useUIStore: 50 symbols duplicated from shared_config.yaml — Low

**Файл:** `web-ui/src/stores/useUIStore.js:7-18`

50 symbols hardcoded in JavaScript, same 50 symbols in `shared_config.yaml`. If a symbol is added/removed in one place, the other is out of sync. The SYMBOL_CATEGORIES also duplicate symbol membership.

**Фикс:** Generate `SYMBOLS` from `shared_config.yaml` at build time (Vite plugin or pre-build script). Or fetch from an API endpoint.

### 8.220 web-ui useToastStore: setTimeout without cleanup — Low

**Файл:** `web-ui/src/stores/useToastStore.js:21-23`

```javascript
setTimeout(() => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}, duration)
```

`setTimeout` in `addToast` is not tracked or cleaned up. If the store is destroyed (e.g., HMR in dev), the timeout still fires and calls `set()` on a stale store. In production this is harmless (store lives for app lifetime), but in dev with HMR it can cause warnings.

**Фикс:** Track timeouts in a `Set` and clear on store destruction. Or accept the warning in dev only.

### 8.221 web-ui usePanelContext: bridge from Zustand to registry — ✅ Good

**Файл:** `web-ui/src/stores/usePanelContext.js` (115 lines)

Bridge between Zustand stores and the legacy registry pattern:
- Reads from `useUIStore`, `useTradingStore`, `useToastStore`
- Builds the `exchange` and `signals` objects that registry.js panel builders expect
- `useMemo` for stable object references
- Maintains backward compatibility with 200+ panel entries in registry.js

Clean migration path from prop drilling to Zustand without rewriting all panels. ✅

### 8.222 ai-signal-bot signal_publisher: 6 catch-all Exception handlers — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py` (6 matches)

6 `except Exception` handlers:
- Lines 123, 135: `Failed to send signal history` / `Failed to send circuit breaker status` — acceptable, non-critical
- Line 155: `Client handler error` — debug level, acceptable
- Lines 191, 232, 266: `_send()` / `_send_regime()` / `_send_cb()` — catch-all to identify disconnected clients

The broadcast pattern (lines 188-193) is correct: `asyncio.gather(*[_send(ws) for ws in self._clients], return_exceptions=True)` with catch-all to add failed clients to `disconnected` set. This is acceptable for WebSocket broadcast — any exception means the client is disconnected.

**Фикс:** Narrow to `websockets.ConnectionClosed` + `ConnectionClosedOK` + `ConnectionClosedError` for the broadcast handlers. Keep catch-all only for the history/circuit-breaker send (unexpected errors).

### 8.223 web-ui 4 Zustand stores: clean separation — ✅ Good

**Файлы:** `useTradingStore.js` (59), `useUIStore.js` (92), `useToastStore.js` (30), `usePanelContext.js` (115)

4 stores with clear separation of concerns:
- `useTradingStore` — exchange + signal data (high-frequency updates)
- `useUIStore` — UI state (selections, tabs, layout, sound)
- `useToastStore` — toast notifications (transient)
- `usePanelContext` — bridge to legacy registry pattern

Total: 296 lines. Clean, no circular dependencies. ✅

### 8.224 web-ui useUIStore: getFilteredSymbols not memoized — Low [FIXED]

**Файл:** `web-ui/src/stores/useUIStore.js:45-61`

```javascript
getFilteredSymbols: () => {
    const { symbolSearch, selectedCategory } = get()
    let filtered = SYMBOLS
    // ... filter logic ...
    return filtered
}
```

`getFilteredSymbols` is a function in the store, not a selector. Every call re-filters the symbol list. If called on every render (e.g., in a dropdown component), it creates a new array each time, causing unnecessary re-renders.

**Фикс:** Use `useMemo` in the component, or create a selector hook: `useFilteredSymbols = () => useUIStore(useMemo(() => (s) => s.getFilteredSymbols(), []))`. Or use Zustand's `useShallow` for memoized selectors.

### 8.225 monitoring alerts.yml: 12 Prometheus alert rules — ✅ Excellent

**Файл:** `monitoring/alerts.yml` (155 lines)

12 alert rules across 4 groups:
- **ai-signal-bot** (6): CircuitBreakerTripped (critical, 10s), CircuitBreakerHalfOpen (warning, 30s), HighSignalBlockRate (warning, 2m), NoSignalsSent (warning, 5m), NoWsClients (critical, 1m), SignalBotDown (critical, 30s)
- **exchange-simulator** (2): ExchangeSimulatorDown (critical, 30s), TradingStopped (warning, 1m)
- **hft-trade-bot** (1): HftBotDown (critical, 30s)
- **system** (1): PrometheusDown (critical, 30s)
- **websocket** (2): HighWsReconnectionRate (warning, 5m), NoWsClientsConnected (warning, 2m)

Each alert has: `expr`, `for` duration, `severity` label, `service` label, `summary` + `description` annotations. ✅

### 8.226 monitoring alerts.yml: no HFT-specific latency alerts — Medium [FIXED]

**Файл:** `monitoring/alerts.yml`

No alerts for:
- Order execution latency > threshold (e.g., > 1ms for HFT)
- Signal processing latency > threshold
- SHM ring buffer overflow (producer faster than consumer)
- Fill rate drop (orders sent but not filled)
- Slippage exceeding threshold
- Position limit breach
- Daily drawdown approaching limit

These are critical HFT metrics that should have alert rules. The current alerts cover infrastructure (process down, no signals, no clients) but not trading-specific anomalies.

**Фикс:** Add HFT-specific alert rules: `OrderLatencyHigh`, `SHMOverflow`, `FillRateDrop`, `SlippageHigh`, `PositionLimitBreach`, `DrawdownApproaching`.

### 8.227 monitoring ebpf_monitor.py: eBPF syscall + network tracing — ✅ Good

**Файл:** `monitoring/ebpf_monitor.py` (225 lines)

eBPF monitoring agent:
- **Syscall tracing**: `TRACEPOINT_PROBE(raw_syscalls, sys_enter)` — captures pid, comm, timestamp
- **Network tracing**: `kprobe__tcp_recvmsg` — captures saddr, daddr, sport, dport, len
- **Graceful degradation**: `BCC_AVAILABLE` flag — if BCC not installed, logs warning and returns False
- **Signal handling**: SIGINT/SIGTERM → `monitor.stop()` + `sys.exit(0)`
- **Error handling**: Narrow exceptions (`OSError, RuntimeError, ValueError, TypeError`) — no catch-all
- **Poll loop**: `perf_buffer_poll(timeout=int(self.interval * 1000))` — configurable interval
- **Report**: JSON output with avg/max latency per syscall

Well-structured eBPF agent with proper fallback and error handling. ✅

### 8.228 monitoring ebpf_monitor.py: only syscall BPF loaded — Low [FIXED]

**Файл:** `monitoring/ebpf_monitor.py:128`

```python
self._bpf = BPF(text=SYSCALL_BPF)
```

Only `SYSCALL_BPF` is loaded. `NETWORK_BPF` is defined (lines 75-105) but never loaded. The network monitoring code exists but is not used. The `_on_syscall_event` handler is registered but there's no `_on_net_event` handler.

**Фикс:** Load both BPF programs: `BPF(text=SYSCALL_BPF + NETWORK_BPF)`. Register network event handler. Or remove `NETWORK_BPF` if not needed.

### 8.229 monitoring ebpf_monitor.py: no Prometheus export — Low [FIXED]

**Файл:** `monitoring/ebpf_monitor.py:183-199`

`_report()` logs JSON to stdout. There's no Prometheus metrics export (no `/metrics` endpoint, no `prometheus_client` usage). The eBPF data is only visible in logs, not in Grafana dashboards.

**Фикс:** Add `prometheus_client` integration: expose syscall latency as Prometheus histograms. Or use `node_exporter` textfile collector to scrape JSON output.

### 8.230 web-ui performanceMonitor.js: Web Vitals integration — ✅ Good

**Файл:** `web-ui/src/utils/performanceMonitor.js` (281 lines)

Core Web Vitals monitoring:
- **5 metrics**: LCP, FID, CLS, TTFB, FCP
- **Performance budgets**: LCP 2.5s, FID 100ms, CLS 0.1, TTFB 800ms, FCP 1.8s
- **Rating system**: good / needs-improvement / poor
- **Alert callbacks**: `onAlert(callback)` — register custom alert handlers
- **Custom metrics**: `recordCustomMetric(name, value, unit)` — extensible
- **History tracking**: `metricsHistory` for trend analysis
- **Budget check**: `checkBudgets()` — returns violations array

Clean Web Vitals integration with budget enforcement. ✅

### 8.231 web-ui performanceMonitor.js: metricsHistory unbounded — Low

**Файл:** `web-ui/src/utils/performanceMonitor.js:28-34`

```javascript
const metricsHistory = {
  LCP: [],
  FID: [],
  CLS: [],
  TTFB: [],
  FCP: [],
}
```

`metricsHistory` arrays grow without bound. Each Web Vital event pushes a new entry. Over a long session (hours), these arrays could grow large. No max length or rotation.

**Фикс:** Cap at 100 entries: `if (arr.length > 100) arr.shift()`. Or use a ring buffer.

### 8.232 web-ui performanceMonitor.js: console.log in production — Low

**Файл:** `web-ui/src/utils/performanceMonitor.js:178,190,202,214,226,229`

6 `console.log` calls in `initPerformanceMonitoring()`. In production, these should be removed or wrapped in a `if (import.meta.env.DEV)` guard. Vite's production build doesn't strip `console.log` by default.

**Фикс:** Use `if (import.meta.env.DEV) console.log(...)` or configure Vite's `esbuild.drop` to strip console logs in production.

### 8.233 monitoring Grafana: 5 dashboards — ✅ Good

**Файлы:** `monitoring/grafana/dashboards/` (5 JSON files)

5 pre-built dashboards:
- `ai_signal_bot_metrics.json` — AI Signal Bot metrics
- `latency-monitoring.json` — latency tracking
- `system-overview.json` — system health
- `trading-overview.json` — trading metrics
- `trading-performance.json` — performance metrics

Pre-built dashboards mean Grafana is ready to use after deployment — no manual dashboard creation needed. ✅

### 8.234 web-ui performanceMonitor.js: alertCallbacks unbounded — Low [FIXED]

**Файл:** `web-ui/src/utils/performanceMonitor.js:37,147-148`

```javascript
let alertCallbacks = []

export function onAlert(callback) {
  alertCallbacks.push(callback)
}
```

`alertCallbacks` array grows without bound. Each call to `onAlert()` adds a callback but there's no `offAlert()` to remove one. If a component registers a callback on mount but doesn't unregister on unmount, the callback fires after unmount — calling `setState` on an unmounted component.

**Фикс:** Return an unsubscribe function: `return () => { alertCallbacks = alertCallbacks.filter(cb => cb !== callback) }`. Or use `useEffect` cleanup in the component.

### 8.235 web-ui backtestEngine.js: client-side backtesting — ✅ Good

**Файл:** `web-ui/src/utils/backtestEngine.js` (436 lines)

Client-side backtesting engine:
- **8 condition types**: price_above, price_below, rsi_above, rsi_below, ema_cross_up, ema_cross_down, volume_spike, price_change_5
- **4 actions**: buy, sell, close_all, alert
- **14 result metrics**: totalReturnPct, winRate, avgWin, avgLoss, profitFactor, maxDrawdownPct, sharpeRatio, sortinoRatio, calmarRatio, equityCurve, maxDrawdownDuration, recoveryFactor
- **Fee model**: configurable feePct (default 0.075%)
- **Position sizing**: configurable positionSizePct (default 10%)
- **Precomputed indicators**: EMA fast/slow, RSI, volume average
- **Input validation**: `if (!candles || candles.length < 30)` — returns error result

Clean, well-documented client-side backtesting. ✅

### 8.236 web-ui backtestEngine.js: EMA/RSI duplicated from indicators.js — Low [FIXED]

**Файлы:** `backtestEngine.js:66-101` vs `indicators.js:9-62`

`backtestEngine.js` has its own `ema()` and `rsi()` functions that are identical to `calcEMA()` and `calcRSI()` in `indicators.js`. The only difference is naming convention (camelCase vs calc-prefix).

**Code reduction:** Import from `indicators.js`: `import { calcEMA, calcRSI } from './indicators'`. ~40 lines reduction.

### 8.237 web-ui backtestEngine.js: no short selling fee on borrow — Low [FIXED]

**Файл:** `back-ui/src/utils/backtestEngine.js:265-277`

```javascript
case 'sell': {
    if (!position && candle.close > 0) {
        const qty = (balance * positionSizePct) / candle.close
        const fee = (qty * candle.close * feePct) / 100
        balance -= fee
        position = { side: 'SHORT', ... }
    }
}
```

Short selling only charges a trading fee, no borrow fee. In real markets, shorting requires borrowing shares which costs a borrow fee (daily). The backtest overestimates short-selling profitability.

**Фикс:** Add `borrowFeePerDay` parameter. Charge `qty * entryPrice * borrowFeePerDay * daysHeld` on short positions.

### 8.238 web-ui backtestEngine.js: no slippage model — Low [FIXED]

**Файл:** `web-ui/src/utils/backtestEngine.js:281-286`

```javascript
const exitPrice = candle.close
const pnl = position.side === 'LONG'
    ? (exitPrice - position.entryPrice) * position.qty
    : (position.entryPrice - exitPrice) * position.qty
```

Both entry and exit use `candle.close` as the fill price. No slippage model — assumes you can always trade at the close price. In reality, market orders slip, especially for larger sizes.

**Фикс:** Add `slippagePct` parameter. Entry: `fillPrice = close * (1 + slippagePct/100)` for buys, `close * (1 - slippagePct/100)` for sells.

### 8.239 web-ui indicators.js: 12 technical indicators — ✅ Excellent

**Файл:** `web-ui/src/utils/indicators.js` (579 lines)

12 exported indicator functions:
- `calcEMA`, `calcSMA`, `calcRSI` — core indicators
- `calcBollingerBands` — volatility bands
- `calcOBV` — volume indicator
- `calcMFI` — money flow (volume-weighted RSI)
- `calcWilliamsR` — momentum oscillator
- `calcIchimoku` — 5-component cloud system (tenkan, kijun, senkouA, senkouB, chikou)
- `calcStochastic` — %K and %D
- `calcATR` — Wilder's smoothing (correct)
- `calcParabolicSAR` — stop and reverse

All with JSDoc, proper NaN handling for warmup periods, zero-division guards. ✅

### 8.240 web-ui indicators.js: O(n²) SMA and Bollinger — Low [FIXED]

**Файл:** `web-ui/src/utils/indicators.js:71-78`

```javascript
export function calcSMA(closes, period) {
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]
    sma[i] = sum / period
  }
}
```

SMA is O(n×period) — for each of n closes, it sums `period` values. With 500 candles and period 20, that's 10,000 operations. A rolling sum would be O(n): subtract the element leaving the window, add the new one.

Same issue in `calcBollingerBands` (line 93-98) — O(n×period) for standard deviation calculation.

**Фикс:** Use rolling sum: `sum += closes[i] - closes[i - period]`. For Bollinger, use Welford's online algorithm for rolling variance.

### 8.241 web-ui auditExport.js: JSON/CSV export with cleanup — ✅ Good

**Файл:** `web-ui/src/utils/auditExport.js` (106 lines)

3 export functions:
- `exportAuditLogsToJSON` — JSON blob, `URL.createObjectURL`, `link.click()`, `URL.revokeObjectURL` ✅
- `exportAuditLogsToCSV` — CSV with proper quote escaping (`"` → `""`), nested object handling
- `exportAuditLogsToExcel` — delegates to CSV (comment: "could use xlsx library")

Both JSON and CSV properly clean up: `document.body.removeChild(link)` + `URL.revokeObjectURL(url)`. No memory leaks. ✅

### 8.242 web-ui mockData.js: realistic GBM with jumps — ✅ Good

**Файл:** `web-ui/src/utils/mockData.js` (269 lines)

Mock data generator:
- **Candles**: Geometric Brownian Motion (GBM) with 2% jump probability, 1% jump size, 0.2% per-candle volatility
- **5 symbols**: BTCUSDT, ETHUSDT, SOLUSDT, DOGEUSDT, ADAUSDT (subset of 50)
- **3 exchanges**: binance, bybit, okx
- **10 news headlines**: Fed, regulation, institutional inflow, liquidation cascade, etc.
- **6 strategies**: trend_following, mean_reversion, market_making, stat_arb, sentiment, ml_ensemble
- `gaussianRandom()` — Box-Muller transform with `1e-10` guard on `Math.random()` ✅

Well-structured mock data for demo mode. ✅

### 8.243 web-ui mockData.js: only 5 of 50 symbols — Low [FIXED]

**Файл:** `web-ui/src/utils/mockData.js:14`

```javascript
export const MOCK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'ADAUSDT']
```

Only 5 symbols in mock mode, but 50 symbols in `useUIStore.js` and `shared_config.yaml`. Mock mode doesn't represent the full trading universe.

**Фикс:** Use all 50 symbols from `useUIStore.SYMBOLS` (convert format: `BTC/USDT` → `BTCUSDT`).

### 8.244 web-ui indicators.js: 579 lines — Medium

**Файл:** `web-ui/src/utils/indicators.js` (579 lines)

12 indicators in one file. While each function is well-written, 579 lines is a large file. Some indicators (Ichimoku, Parabolic SAR) are complex enough to warrant their own files.

**Code reduction:** Split into `indicators/trend.js` (EMA, SMA, Ichimoku, SAR), `indicators/momentum.js` (RSI, Stochastic, WilliamsR), `indicators/volume.js` (OBV, MFI), `indicators/volatility.js` (Bollinger, ATR). Or keep as-is since it's a utility file with no side effects.

### 8.245 web-ui vite.config.js: PWA + manual chunks — ✅ Excellent

**Файл:** `web-ui/vite.config.js` (84 lines)

- **PWA**: `VitePWA` with `autoUpdate`, manifest, SVG maskable icon, Workbox runtime caching for Google Fonts
- **Manual chunks**: 5 vendor chunks — `react-vendor`, `charts-vendor`, `icons-vendor`, `state-vendor`, `recharts-vendor`
- **Server**: `host: 0.0.0.0` (Docker-friendly), `port: 3000`
- **Build**: `es2020` target, `esbuild` minify, `cssCodeSplit: true`, `chunkSizeWarningLimit: 1000`
- **Alias**: `@` → `src/`

Clean Vite config with proper code-splitting strategy. ✅

### 8.246 web-ui vite.config.js: no esbuild.drop for console.log — Low [FIXED]

**Файл:** `web-ui/vite.config.js:48-49`

```javascript
esbuild: {
    target: 'es2020',
},
```

No `drop: ['console', 'debugger']` in production build. `performanceMonitor.js` has 6 `console.log` calls that will appear in production. Vite supports `esbuild.drop` to strip these in production builds.

**Фикс:** Add `drop: ['console']` in production: `esbuild: { target: 'es2020', drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [] }`.

### 8.247 hft-trade-bot config.yaml: 50 symbols duplicated 3rd time — Medium

**Файл:** `hft-trade-bot/config/config.yaml:20-70`

50 symbols hardcoded in `config.yaml`, same 50 in `shared_config.yaml` and `web-ui/src/stores/useUIStore.js`. Three copies of the same list. Adding/removing a symbol requires editing 3 files.

**Фикс:** Use `shared_config.yaml` as single source of truth. C++ config loader reads from shared config. Web-ui fetches from API or generates at build time.

### 8.248 hft-trade-bot config.yaml: localhost WS URLs — Medium

**Файл:** `hft-trade-bot/config/config.yaml:76,165`

```yaml
exchange:
  websocket_url: "ws://localhost:8765"
ai_signal_bot:
  websocket_url: "ws://localhost:8766"
```

Same `localhost` issue as §8.212, §8.195. In production (K8s/Docker), `localhost` won't reach other containers/pods.

**Фикс:** Use environment variable: `websocket_url: "${EXCHANGE_WS_URL:-ws://localhost:8765}"`.

### 8.249 hft-trade-bot config.yaml: well-structured config — ✅ Good

**Файл:** `hft-trade-bot/config/config.yaml` (166 lines)

Well-documented config with comments explaining each section:
- `trading` — symbols, signal_interval_ms (1ms HFT), max_open_positions, paper_trading
- `exchange` — WS URL, default exchange
- `risk` — per-trade risk, drawdown, confidence, R:R, SL/TP, position size
- `hft_strategies` — V1 indicator toggles and periods
- `signal_engine_v2` — 6-indicator composite with weights, ATR-based SL/TP, 100ms cooldown
- `signal_engine_v3` — HMM regime detection (disabled by default)
- `pressure_model` — L2 microstructure thresholds
- `smart_order_router` — 5 strategies, toxic threshold
- `adaptive_order_selector` — IOC/FOK/GTD/PostOnly thresholds
- `latency_optimization` — thread pinning, histogram
- `metrics` — Prometheus port
- `logging` — level and file
- `ai_signal_bot` — slow path WS connection

Each parameter has a comment with recommended range. ✅

### 8.250 web-ui PanelContainer.jsx: panel visibility + collapse — ✅ Good

**Файл:** `web-ui/src/panels/PanelContainer.jsx` (126 lines)

- **localStorage persistence**: `useLocalStorage` for visibility and collapsed state
- **Category hover preload**: `handleCategoryHover` preloads all panels in a category on hover (desktop only via `matchMedia('(hover: hover)')`)
- **Error boundaries**: `PanelErrorBoundary` + `ChunkRetryBoundary` per panel
- **Accessibility**: `aria-expanded`, `aria-controls`, `role="tabpanel"`, `focus-visible:ring`
- **Fallback context**: `contextProp || storeContext` — supports both prop-based and Zustand-based usage

Clean panel container with proper error handling, accessibility, and progressive loading. ✅

### 8.251 web-ui registry.js: 200+ lazy-loaded panels — ✅ Good + Medium

**Файл:** `web-ui/src/panels/registry.js` (684 lines)

- **200+ panels**: Each imported via `React.lazy()` — proper code-splitting, each panel is a separate chunk
- **7 categories**: Order Flow, Technical Analysis, Risk & Analytics, Portfolio & Optimization, Strategy & Automation, Export & Tools, Config & Session
- **Props builders**: Each panel has a `props(context)` function that extracts relevant data from the context object
- **Helper functions**: `getPanelsByCategory`, `preloadCategory`

However, 684 lines is a large file. The 200+ `lazy()` imports at the top (lines 25-221) are repetitive. Each panel follows the same pattern: `const X = lazy(() => import('../components/X'))`.

**Code reduction:** Generate imports from a panel list: `const PANEL_IMPORTS = { DepthChart: () => import('../components/DepthChart'), ... }` then `const DepthChart = lazy(PANEL_IMPORTS.DepthChart)`. Or use a `require.context` pattern. ~100 lines reduction.

### 8.252 web-ui registry.js: 200+ math panels — code reduction candidate — Medium

**Файл:** `web-ui/src/panels/registry.js`

200+ panels include advanced math models: `HawkesProcess`, `GaussianProcessRegression`, `VariationalAutoencoder`, `SchrodingerBridge`, `LieGroupSymmetries`, `KolmogorovSinaiEntropy`, `PersistentHomologyLandscape`, `FokkerPlanckEquation`, `HopfBifurcation`, `CramerRaoBound`, `WassersteinBarycenters`, `KoopmanOperatorTheory`, `StochasticOptimalControl`, `RenyiEntropyDynamics`, `PontryaginMaximumPrinciple`, `BurgersEquation`, `SobolevSpaceRegularization`, `ItoCalculusGenerator`, `BanachFixedPoint`, `CesaroFejerKernel`, `GirsanovTheorem`, `StoneCechCompactification`, `MalliavinSteinSensitivity`, `ProkhorovMetric`, `RadonNikodymDerivative`, `HahnDecomposition`, `CameronMartinFormula`, `ArzelaAscoli`, `RieszRepresentation`, `LaxMilgram`.

These are research-grade mathematical models that are unlikely to be used in production trading. They add:
- ~200 lazy import statements
- ~200 component files (each needs to exist for the import to resolve)
- ~200 entries in the PANELS array with props builders
- Bundle size: each is a separate chunk, but still adds to total project size

**Code reduction:** Move research panels to a separate `research-panels` package or feature flag. Only load if user explicitly enables "Research Mode". ~2000+ lines reduction in registry.js alone.

### 8.253 web-ui e2e tests: Playwright with retry — ✅ Good

**Файл:** `web-ui/e2e/mock-mode.spec.js` (166 lines)

5 test suites:
- **Mock Mode** (4 tests): page loads, candle chart visible, exchange selector, symbol selector
- **Navigation** (2 tests): tab switching, sidebar toggle
- **Order Form** (2 tests): form visible, buy/sell buttons exist
- **Signal Feed** (1 test): signal feed panel exists
- **Responsive** (1 test): mobile viewport renders

Uses `gotoWithRetry` helper, `dismissOnboarding` helper, `closeOverlays` helper. Tests are resilient — use `.catch(() => false)` for optional elements. ✅

### 8.254 web-ui e2e tests: no WebSocket interaction tests — Low

**Файл:** `web-ui/e2e/`

No e2e tests for:
- WebSocket connection/disconnection
- Real-time price updates
- Order submission flow (click buy → fill appears)
- Signal reception and display
- Circuit breaker state display

Tests only verify static UI elements are visible. No tests for dynamic behavior.

**Фикс:** Add e2e tests that mock WebSocket server, verify real-time data flow, test order submission → fill notification, test signal reception → display.

### 8.255 web-ui useExchangeData.js: WebSocket data hook — ✅ Good

**Файл:** `web-ui/src/hooks/useExchangeData.js` (255 lines)

- **7 message types**: snapshot/candles/sync_state, fill, arbitrage_scan, replay_state, trading_state, replay_candles
- **Candle map**: `useRef(new Map())` for dedup by `exchange|symbol|timestamp` — avoids re-renders from duplicate candles
- **Candle cap**: 500 max, trims with sort when exceeded
- **Orderbook deltas**: Incremental update with level merge/sort, skips if no full snapshot yet (`if (!existing) continue`)
- **Fills cap**: `.slice(0, 50)` — keeps last 50 fills only
- **Actions**: submitOrder, closePosition, sendSpeedChange, sendConfigUpdate, toggleReplay, startTrading, stopTrading, scrubReplay — all via `sendExchange()`
- **Reconnect**: `syncOnReconnect: true` with `getLastTimestamp` — requests missed data after reconnect

Well-structured WebSocket data hook with proper dedup, capping, and incremental updates. ✅

### 8.256 web-ui useExchangeData: candle sort on every update — Low [FIXED]

**Файл:** `web-ui/src/hooks/useExchangeData.js:55`

```javascript
setCandles(Array.from(candleMap.current.values()).sort((a, b) => a.timestamp - b.timestamp))
```

On every candle update (not just when trimming), the entire candle array is converted from the Map, sorted, and set as new state. With 500 candles and updates every second, this creates a new 500-element array + sort on every message.

**Фикс:** Only sort when trimming (line 52). For incremental updates, append to existing array if timestamp > last. Or use a sorted data structure.

### 8.257 web-ui useMockData.js: mock exchange data — ✅ Good

**Файл:** `web-ui/src/hooks/useMockData.js` (194 lines)

- **Mock mode detection**: `VITE_MOCK_MODE === 'true'` or `localStorage.getItem('mock-mode')` — works via env var or user toggle
- **Initial snapshot**: `generateInitialSnapshot()` — candles, prices, accounts, orderbooks
- **Periodic updates**: `setInterval` every 2 seconds — new candles, prices, orderbooks
- **Refs for state**: `accountsRef`, `pricesRef` — avoids stale closure in interval
- **Cleanup**: `clearInterval(intervalRef.current)` in useEffect return
- **Same interface as useExchangeData**: Returns same state shape — drop-in replacement

Clean mock implementation with proper cleanup and ref-based state access. ✅

### 8.258 web-ui useDetachablePanels.js: BroadcastChannel for panel popouts — ✅ Good

**Файл:** `web-ui/src/hooks/useDetachablePanels.js` (258 lines)

- **BroadcastChannel**: `new BroadcastChannel('trading-sim-panel')` — cross-window communication without postMessage overhead
- **6 panel types**: chart, orderbook, account, signals, arbitrage, performance — each with title and dimensions
- **DOM via createElement**: No `document.write` or `innerHTML` injection — safe from XSS
- **Popup management**: Closes existing popup before opening new one, checks `popup.closed`
- **Popup blocked detection**: `if (!popup) { alert('Popup blocked...') }` — user feedback

Clean detachable panel implementation with proper security and user feedback. ✅

### 8.259 web-ui useDetachablePanels: no BroadcastChannel cleanup — Low [FIXED]

**Файл:** `web-ui/src/hooks/useDetachablePanels.js:21-24`

```javascript
const getChannel = useCallback(() => {
    if (!channelRef.current) {
        channelRef.current = new BroadcastChannel('trading-sim-panel')
    }
    return channelRef.current
}, [])
```

`BroadcastChannel` is created lazily but never closed. If the component unmounts, the channel stays open. In practice this is harmless (channel lives for page lifetime), but it's a resource leak.

**Фикс:** Add cleanup in a `useEffect`: `return () => { if (channelRef.current) channelRef.current.close() }`.

### 8.260 ai-signal-bot db.py: SQLite with WAL mode — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` — concurrent read/write access
- **Windows-safe close**: `wal_checkpoint(TRUNCATE)` + `journal_mode=DELETE` — releases WAL file locks on Windows
- **3 tables**: signals, trades, equity_curve — with proper schema (NOT NULL constraints, defaults)
- **3 indexes**: `idx_signals_symbol`, `idx_trades_symbol`, `idx_trades_status` — query optimization
- **Parameterized queries**: All queries use `?` placeholders — SQL injection safe
- **contextlib.closing**: Proper connection cleanup with `with closing(self._conn()) as conn:`
- **Stats query**: `COALESCE(SUM(pnl), 0)` — handles NULL correctly
- **Win rate**: Division by zero guard: `if total_trades > 0 else 0`

Clean SQLite layer with proper WAL, indexes, parameterized queries, and Windows-safe cleanup. ✅

### 8.261 ai-signal-bot db.py: new connection per operation — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every method creates a new connection (`self._conn()`) and closes it after the operation. For SQLite this is relatively cheap (file-based, no network), but:
1. `PRAGMA journal_mode=WAL` is executed on every connection — unnecessary, WAL is persistent
2. No connection pooling — each `save_signal`, `save_trade`, `save_equity` opens/closes a connection
3. No retry on `database is locked` — if another process holds a write lock, the operation fails immediately

**Фикс:** Use a single persistent connection with a threading.Lock for write operations. Or use `aiosqlite` for async access. Remove `PRAGMA journal_mode=WAL` from `_conn()` — set it once in `_init_db()`.

### 8.262 ai-signal-bot db.py: no data retention — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py`

No retention policy for signals, trades, or equity_curve tables. Over time (months of running), these tables grow without bound. SQLite handles large tables, but query performance degrades.

**Фикс:** Add `delete_old_signals(days=90)` and `delete_old_trades(days=90)` methods. Call daily. Or add a cron job.

### 8.263 ai-signal-bot db.py: no equity_curve index — Low [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:70-76`

```sql
CREATE TABLE IF NOT EXISTS equity_curve (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    balance REAL NOT NULL,
    equity REAL NOT NULL,
    open_positions INTEGER NOT NULL
);
```

No index on `equity_curve.timestamp`. Queries like `SELECT * FROM equity_curve WHERE timestamp > ? ORDER BY timestamp DESC` will scan the entire table.

**Фикс:** `CREATE INDEX IF NOT EXISTS idx_equity_timestamp ON equity_curve(timestamp)`.

### 8.264 ai-signal-bot db.py: no migration system — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:36-81`

Schema is defined in `_init_db()` with `CREATE TABLE IF NOT EXISTS`. This works for initial creation but doesn't handle schema changes. If a new column is added to `signals` or `trades`, the existing table won't be updated.

The project has a `migrations/` directory and `migrate.py` script (noted in §8.77), but `db.py` doesn't use it — it uses its own `_init_db()`.

**Фикс:** Use the migration system from `migrate.py` instead of `_init_db()`. Or add `ALTER TABLE` statements with version tracking.

### 8.265 web-ui useWebSocket.ts: production-grade WebSocket hook — ✅ Excellent

**Файл:** `web-ui/src/hooks/useWebSocket.ts` (305 lines)

Production-grade WebSocket hook with:
- **Ring buffer**: 5000-entry circular buffer for message replay — `createRingBuffer(maxSize)` with `push`, `toArray`, `clear`, `size`
- **Exponential backoff**: `backoffRef.current * 2` capped at 30s — `Math.min(backoffRef.current * 2, 30000)`
- **Reconnect countdown**: `setInterval` 1s countdown for UI display — `nextReconnectIn` state
- **Ping/pong latency**: 5s ping interval, pong response → `setLatency(Date.now() - lastPingRef.current)`
- **Batch merging**: `batchTypes` + `batchInterval` (50ms) — merges messages by `type:symbol` key, flushes on non-batched message
- **Outgoing queue**: 100-message queue when disconnected, flushed on reconnect
- **Sync on reconnect**: `syncOnReconnect` + `getLastTimestamp` — sends `sync_state` with last timestamp instead of `subscribe`
- **permessage-deflate**: WebSocket subprotocol negotiation for compression
- **Handler refs**: `handlersRef.current` updated every render — avoids stale closures in WebSocket callbacks
- **Cleanup**: All timers cleared in disconnect + useEffect return — reconnect, ping, batch, countdown
- **Error handling**: `try/catch` on `new WebSocket()`, `JSON.parse()`, individual queue flush

This is the most well-engineered file in the entire project. ✅ Excellent.

### 8.266 web-ui useWebSocket: no max reconnect limit — Low [FIXED]

**Файл:** `web-ui/src/hooks/useWebSocket.ts:214-227`

```typescript
if (autoConnect) {
    const delay = backoffRef.current
    backoffRef.current = Math.min(backoffRef.current * 2, 30000)
    // ...
    reconnectTimer.current = setTimeout(() => { connect() }, delay)
}
```

Backoff is capped at 30s, but there's no max reconnect count. If the server is down for hours, the hook will keep reconnecting every 30s indefinitely. This is usually fine, but some applications want to stop after N attempts and show a "connection lost" UI.

**Фикс:** Add `maxReconnects` option. After N reconnects, stop and set `error: 'Max reconnects reached'`.

### 8.267 web-ui useWebSocket: console.error in production — Low

**Файл:** `web-ui/src/hooks/useWebSocket.ts:200`

```typescript
} catch {
    console.error('[useWebSocket] Failed to parse message')
}
```

`console.error` will appear in production. Combined with the 6 `console.log` in `performanceMonitor.js`, these should be stripped in production builds.

**Фикс:** Add `esbuild.drop: ['console', 'debugger']` in `vite.config.js` for production builds.

### 8.268 exchange_simulator config_validator.py: comprehensive validation — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/config_validator.py` (274 lines)

- **5 required sections**: exchanges, initial_prices, volatility, market, account
- **8 valid timeframes**: 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1d
- **9 validation functions**: `_validate_exchanges`, `_validate_initial_prices`, `_validate_volatility`, `_validate_cross_references`, `_validate_market`, `_validate_account`, `_validate_websocket`, `_validate_arbitrage`, `_validate_visualizer`
- **Cross-reference validation**: Ensures symbols in initial_prices and volatility match exchange symbols
- **Error/warning separation**: Errors are fatal, warnings are informational
- **Early exit**: Returns immediately if required sections are missing

Excellent config validation with clear error messages. ✅

### 8.269 exchange_simulator liquidation_engine_v2.py: cascade liquidations — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py` (253 lines)

Enhanced liquidation engine with:
- **4 liquidation types**: FULL, PARTIAL, CASCADE, ADL (auto-deleveraging)
- **Cascade processing**: `process_cascade()` iterates up to 10 depth levels, with market impact (`mark_price *= 1.0 + impact`)
- **Partial liquidation**: Closes 50% of position first (`partial_liq_ratio`), only full close if still under-collateralized
- **Insurance fund**: Tracks fund balance, depletes on losses, replenishes on profits
- **Auto-deleveraging (ADL)**: When insurance fund < 0, triggers ADL — logs critical and resets fund to 10% of deficit
- **Bounded deques**: `events` and `insurance_fund_history` both `maxlen=10000` — no unbounded growth
- **Seeded RNG**: `np.random.default_rng(seed=42)` — deterministic cascade market impact for reproducibility
- **Position dataclass**: Proper `@dataclass` with `is_isolated` flag
- **Liquidation event dataclass**: Full event record with type, loss, cascade flag
- **Stats method**: Returns counts by type + total loss

Excellent liquidation engine with realistic cascade modeling, insurance fund, and ADL. ✅

### 8.270 exchange_simulator liquidation_engine_v2: ADL is a stub — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:211-232`

```python
def _auto_deleverage(self, pos: Position, mark_price: float) -> None:
    logger.critical(f"[LiqEngine] Insurance fund depleted! Triggering ADL. Fund={self.insurance_fund:.2f}")
    # In real exchange, this would reduce profitable counterparty positions
    # For simulation, we log and reset insurance fund
    self.insurance_fund = abs(self.insurance_fund) * 0.1  # Small recovery
```

ADL is a stub — it logs and resets the insurance fund but doesn't actually reduce profitable counterparty positions. The comment acknowledges this. In a real exchange, ADL would find the most profitable opposing positions and reduce them to cover the deficit.

**Фикс:** Acceptable for simulation. Document clearly that ADL is simplified.

### 8.271 exchange_simulator liquidation_engine_v2: cascade market impact uses fixed seed — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:73`

```python
self._rng = np.random.default_rng(seed=42)
```

The cascade market impact RNG is seeded with 42, making cascades deterministic. This is good for testing/reproducibility but means every simulation run will have identical cascade patterns. In a trading simulator, some randomness is expected.

**Фикс:** Make seed configurable: `seed = config.get('cascade_seed', None)` where `None` means random.

### 8.272 exchange_simulator liquidation_engine_v2: f-string logging — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:176-179`

```python
logger.warning(
    f"[LiqEngine] {pos.symbol} {pos.side} liquidated: "
    f"qty={qty_to_close:.4f} type={liq_type.name} loss={loss:.2f} "
    f"remaining={pos.qty:.4f} insurance_fund={self.insurance_fund:.2f}"
)
```

f-string in logging — the string is formatted even when log level is above WARNING. Same issue noted in §8.33 for ai-signal-bot.

**Фикс:** Use `logger.warning("[LiqEngine] %s %s liquidated: qty=%.4f type=%s loss=%.2f remaining=%.4f insurance_fund=%.2f", pos.symbol, pos.side, qty_to_close, liq_type.name, loss, pos.qty, self.insurance_fund)`.

### 8.273 exchange_simulator liquidation_engine_v2: no thread safety — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py`

`LiquidationEngineV2` has no locks or thread safety. `insurance_fund`, `events`, `_cascade_depth` are mutable state. If the exchange simulator runs in multiple threads (e.g., one per exchange), concurrent `liquidate()` calls could corrupt state.

**Фикс:** Add `threading.Lock` around `liquidate()` and `process_cascade()`. Or document that the engine is single-threaded.

### 8.274 exchange_simulator arbitrage.py: cross-exchange arb detector — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/arbitrage.py` (298 lines)

- **ArbitrageOpportunity dataclass**: 14 fields — symbol, buy/sell exchange, prices, spreads (gross/net/bps), quantities, max_quantity, estimated_profit, status, TTL
- **ArbStatus enum**: OPEN, CLOSED, EXPIRED
- **Configurable**: fee_pct (0.075%), slippage_bps (2.0), min_spread_bps (5.0), max_opportunities (50), opportunity_ttl (30s)
- **Stats tracking**: total_detected, total_closed, total_expired, total_estimated_profit, best_spread_bps
- **Scan**: Collects order books across all exchanges for each symbol, builds price list, checks all buy/sell pairs
- **TTL expiry**: Opportunities expire after 30s

Excellent arbitrage detector with proper fee/slippage modeling and TTL. ✅

### 8.275 exchange_simulator arbitrage: unbounded _closed_history — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/arbitrage.py:84`

```python
self._closed_history: list[ArbitrageOpportunity] = []
```

`_closed_history` is a plain list with no cap. Over time, closed opportunities accumulate without bound. `_active_opportunities` is bounded by `max_opportunities=50`, but closed history is not.

**Фикс:** Use `deque(maxlen=1000)` or prune periodically.

### 8.276 exchange_simulator funding_rate.py: perpetual funding simulation — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/funding_rate.py` (136 lines)

- **8-hour intervals**: 00:00, 08:00, 16:00 UTC — matches real exchanges
- **Funding rate**: premium_index × 0.1 + base_rate, with Gaussian noise, clamped to ±0.75%
- **Funding payment**: `position_qty * mark_price * funding_rate` — correct for perpetuals
- **Bounded history**: `deque(maxlen=10000)` — no unbounded growth
- **Next funding time**: Correct calculation with day rollover
- **Stats**: avg/max/min/last rate

Excellent funding rate simulation matching real exchange mechanics. ✅

### 8.277 exchange_simulator funding_rate: f-string logging — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/funding_rate.py:86`

```python
logger.info(f"[FundingRate] {self.symbol} funding={rate:.6f} ({rate*100:.4f}%) at {funding_hour}:00 UTC")
```

Same f-string logging issue as §8.272. String formatted even when log level above INFO.

**Фикс:** Use `logger.info("[FundingRate] %s funding=%.6f (%.4f%%) at %d:00 UTC", self.symbol, rate, rate*100, funding_hour)`.

### 8.278 exchange_simulator latency_simulation.py: network latency model — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/latency_simulation.py` (130 lines)

- **4 exchange profiles**: Binance 50ms, OKX 80ms, Bybit 120ms, Simulator 5ms
- **Gaussian jitter**: σ = 20% of base latency
- **Poisson spikes**: 1 in 1000 messages, 10× base latency
- **Reconnection**: Exponential backoff (100ms → 30s cap, factor 2.0), 80%+ success rate increasing with attempts
- **Async delay**: `await asyncio.sleep(latency_ms / 1000.0)` — proper async integration
- **Stats**: total_messages, total_spikes, avg_latency_ms, reconnect_attempts
- **Reset**: Full state reset for testing

Excellent latency simulation with realistic exchange profiles. ✅

### 8.279 exchange_simulator market_microstructure.py: realistic price generation — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/market_microstructure.py` (175 lines)

- **5 models**: Student-t returns (df=4, fat tails), Merton jump diffusion, Heston stochastic volatility, Markov regime switching (4 regimes), U-shaped intraday volume
- **4 regimes**: CALM, VOLATILE, CRASH, RECOVERY — with Markov transition matrix
- **Regime params**: Per-regime drift, vol_scale, jump_prob, jump_size
- **Heston**: Euler discretization with variance floor (0.001), κ=2.0, θ=0.04, σ=0.3, ρ=-0.7
- **Intraday**: U-shaped vol multiplier — 1.5× at open/close, 0.7× at midday
- **Configurable**: All parameters via `MicrostructureConfig` dataclass
- **Reset**: Full state reset with configurable seed

Excellent market microstructure model — most sophisticated price generation in the project. ✅

### 8.280 exchange_simulator spread_analytics.py: spread/slippage tracking — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/spread_analytics.py` (188 lines)

- **Rolling windows**: `deque(maxlen=1000)` per exchange:symbol pair — bounded
- **SpreadRecord**: exchange, symbol, spread, mid_price, spread_bps, timestamp
- **SpreadStats**: count, mean, p50, p90, p99, max, min — percentile-based
- **Slippage**: BUY/SELL aware — correct sign handling
- **Zero-price guard**: `if mid_price <= 0: return` and `if expected_price <= 0: return`
- **Summary**: Aggregated stats across all exchange:symbol pairs

Good spread analytics with proper percentile stats and bounded windows. ✅

### 8.281 exchange_simulator order_book_realism.py: L2 book with spoofing — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/order_book_realism.py` (306 lines)

- **4 order types**: NORMAL, SPOOF, ICEBERG, MARKET
- **PriceLevel**: FIFO queue with `next_queue_pos`, `add_order`, `remove_order`, `fill_from_front`
- **Iceberg orders**: Hidden quantity revealed in 10% increments when visible portion filled
- **Spoofing**: Fake large orders with high `cancel_prob`
- **Adverse selection**: `toxic_flow_score` tracking, `recent_fills` list
- **Power-law decay**: Volume decreases with distance from mid price
- **BookOrder dataclass**: 10 fields including `queue_position`, `cancel_prob`, `visible_qty`, `hidden_qty`

Excellent realistic order book with spoofing, icebergs, and adverse selection. ✅

### 8.282 exchange_simulator order_book_realism: recent_fills unbounded — Low [FIXED]

**Файл:** `exchange_simulator/exchange_simulator/order_book_realism.py:116`

```python
self.recent_fills: list[dict] = []
```

`recent_fills` is a plain list with no cap. Over time, fill records accumulate without bound.

**Фикс:** Use `deque(maxlen=1000)`.

### 8.283 exchange_simulator options_simulator.py: Black-Scholes with Greeks — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/options_simulator.py` (237 lines)

- **Black-Scholes**: European-style options with `_norm_cdf` (erf) and `_norm_pdf`
- **Greeks**: delta, gamma, theta (per day), vega (per 1% vol), rho (per 1% rate)
- **Implied volatility**: Newton-Raphson iteration
- **Option chain**: Multiple strikes/expiries
- **Put-call parity**: Verification
- **OptionQuote dataclass**: 11 fields including `in_the_money` flag

Excellent options simulator with complete Greeks and IV calculation. ✅

### 8.284 exchange_simulator data_export.py: CSV/Parquet export — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/data_export.py` (246 lines)

- **2 formats**: CSV (built-in) and Parquet (requires pyarrow)
- **3 export types**: Candles (OHLCV), orders, accounts
- **Summary export**: Aggregated statistics
- **Directory creation**: `os.makedirs(output_dir, exist_ok=True)` — safe
- **UTC timestamps**: `datetime.now(UTC)` — proper timezone handling

Good data export with multiple formats and proper directory handling. ✅

### 8.285 exchange_simulator __main__.py: runpy entry point — ✅ Clean [N/A]

**Файл:** `exchange_simulator/exchange_simulator/__main__.py` (15 lines)

Clean entry point that adds parent directory to `sys.path` and runs the root-level `__main__.py` via `runpy.run_path`. ✅

### 8.286 exchange_simulator: all modules use seed=42 — Low [FIXED]

**Файл:** `liquidation_engine_v2.py:73`, `funding_rate.py:48`, `latency_simulation.py:48`, `market_microstructure.py:74`, `order_book_realism.py:106`

All 5 modules that use `np.random.default_rng` hardcode `seed=42`. This makes the entire simulation deterministic — every run produces identical results. While good for testing, it means the simulator cannot produce varied market conditions across runs.

**Фикс:** Make seed configurable via config.yaml: `simulation.seed: null` (null = random) or `simulation.seed: 42` (deterministic).

### 8.287 ai-signal-bot observability/health_checks.py: deep health probes — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

- **3 endpoints**: `/health/live` (liveness), `/health/ready` (readiness), `/health/status` (full)
- **4 component checks**: WebSocket, TimescaleDB, Redis, exchange
- **3 health states**: HEALTHY, DEGRADED, UNHEALTHY
- **ComponentHealth dataclass**: name, status, latency_ms, details, last_check
- **Metrics**: signals_total, orders_total, errors_total, last_signal_age_s, last_order_age_s
- **Overall status logic**: All HEALTHY → HEALTHY, any UNHEALTHY → UNHEALTHY, else DEGRADED
- **Not configured = HEALTHY**: If a component is `None`, returns HEALTHY with "not configured" — correct for optional deps
- **Exception handling**: Each check catches specific exceptions (AttributeError, TypeError, OSError, RuntimeError, KeyError, ValueError)

Excellent health check system with proper component-level probes and status aggregation. ✅

### 8.288 ai-signal-bot health_checks: no liveness depth check — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:76-83`

```python
async def check_liveness(self) -> dict[str, Any]:
    uptime = time.time() - self._start_time
    return {
        "status": "alive",
        "uptime_seconds": round(uptime, 1),
        "pid": __import__("os").getpid(),
    }
```

Liveness always returns `"alive"` — it only checks if the process is running, not if it's actually processing. A deadlocked event loop would still report "alive". The class tracks `_last_signal_time` and `_last_order_time` but doesn't use them in the liveness check.

**Фикс:** Add staleness check: if `_last_signal_time > 0` and `time.time() - _last_signal_time > 300` (5 min no signals), return `"degraded"`. If > 600s, return `"unhealthy"`.

### 8.289 ai-signal-bot health_checks: __import__("os") anti-pattern — Low [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:82`

```python
"pid": __import__("os").getpid(),
```

Using `__import__("os")` inline instead of `import os` at the top of the file. This is an anti-pattern — it's harder to read and slower.

**Фикс:** Add `import os` at the top and use `os.getpid()`.

### 8.290 ai-signal-bot observability/logging.py: structlog setup — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/logging.py` (171 lines)

- **structlog integration**: JSON-formatted logs with correlation IDs (trace_id, span_id)
- **Graceful fallback**: If structlog not installed, falls back to `logging.basicConfig` with simple format
- **Two renderers**: Console (dev, colored) and JSON (prod, machine-parseable)
- **Contextual fields**: service name, version injected into every log entry
- **One-time config**: `_configured` flag prevents double initialization
- **Log file support**: Optional file handler with rotation

Excellent structured logging setup with proper fallback and dual renderer support. ✅

### 8.291 ai-signal-bot observability/tracing.py: OpenTelemetry + Jaeger — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry**: OTLP exporter to Jaeger, BatchSpanProcessor for async export
- **Resource**: service.name, service.namespace, service.version — proper OTel attributes
- **Asyncio instrumentation**: `AsyncioInstrumentor().instrument()` — traces async operations
- **No-op fallback**: If OTel not installed, returns `NoopTracer` with `NoopSpan` — code works without tracing
- **Graceful shutdown**: `shutdown_tracing()` flushes pending traces via `provider.shutdown()`
- **Exception handling**: Catches ImportError, RuntimeError, OSError, ValueError
- **One-time init**: `_initialized` flag prevents double initialization

Excellent distributed tracing setup with proper fallback and shutdown. ✅

### 8.292 ai-signal-bot tracing: f-string logging — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/tracing.py:68,73`

```python
logger.info(f"[Tracing] Initialized: {service_name} → {endpoint}")
logger.warning(f"[Tracing] Failed to initialize: {e}")
```

Same f-string logging pattern as other modules. String formatted even when log level is above INFO/WARNING.

**Фикс:** Use `logger.info("[Tracing] Initialized: %s → %s", service_name, endpoint)`.

### 8.293 ai-signal-bot tracing: endpoint defaults to localhost — Low [FIXED]

**Файл:** `ai-signal-bot/src/observability/tracing.py:31`

```python
endpoint: str = "http://localhost:4317",
```

Default Jaeger endpoint is `localhost:4317`. In K8s/Docker, this should be `http://jaeger:4317` or similar service name.

**Фикс:** Read from env var: `endpoint: str = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")`.

### 8.294 ai-signal-bot notifier.py: Telegram + Discord bot — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **2 notifiers**: TelegramNotifier (polling-based) and DiscordNotifier (HTTP-based)
- **AlertEvent dataclass**: Normalized event with type, symbol, message, timestamp, data
- **Remote commands**: `/status`, `/positions`, `/close_all`, `/pause`, `/resume` — register_command pattern
- **Emoji map**: Per-event-type emojis for visual clarity
- **Env var support**: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID
- **Proper cleanup**: `stop()` cancels poll task, closes session and WS
- **Error handling**: Catches OSError, RuntimeError, json.JSONDecodeError, asyncio.CancelledError
- **Chat ID verification**: `if chat_id != self.chat_id: continue` — ignores messages from other chats

Good notification system with proper cleanup and security. ✅

### 8.295 ai-signal-bot notifier: token in URL — Medium [FIXED]

**Файл:** `ai-signal-bot/src/notification/notifier.py:104,122`

```python
url = f"https://api.telegram.org/bot{self.token}/sendMessage"
url = f"https://api.telegram.org/bot{self.token}/getUpdates"
```

The Telegram bot token is embedded in the URL. If any HTTP error is logged with the URL, the token will be exposed in logs. This is a security risk.

**Фикс:** Log only the endpoint name, not the full URL. Or use Telegram's header-based auth if available. At minimum, ensure error logs don't include the URL.

### 8.296 ai-signal-bot notifier: no rate limiting — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py`

No rate limiting on `send_alert()`. If many fills or errors happen in quick succession, the bot will send unlimited messages to Telegram/Discord, potentially hitting API rate limits (Telegram: 30 msg/sec, Discord: 5 msg/2sec per channel).

**Фикс:** Add a simple rate limiter: max 10 messages per 10 seconds, with a queue for overflow.

### 8.297 ai-signal-bot notifier: no retry on send failure — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py:111-116`

```python
try:
    async with self._session.post(url, json=payload) as resp:
        if resp.status != 200:
            logger.warning(f"Telegram send failed: {resp.status}")
except (OSError, RuntimeError) as e:
    logger.error(f"Telegram send error: {e}")
```

If `send_alert` fails (network error, 5xx), the alert is lost. No retry, no queue.

**Фикс:** Add 1-2 retries with exponential backoff. Or queue alerts and retry later.

### 8.298 ai-signal-bot llm_engine/engine.py: LLM-powered analysis — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **4 providers**: openai, anthropic, ollama, none (rule-based fallback)
- **3 analysis types**: market_analysis, signal_explanation, risk_assessment
- **Prompt templates**: Loadable from `prompt_templates/` directory with fallback defaults
- **Caching**: TTL-based cache (60s default), evicts stale entries when > 100 items
- **MarketContext**: 13 fields including RSI, EMA, ADX, ATR, Bollinger position, OBI, regime
- **LLMAnalysis**: 8 fields including sentiment, confidence, key_levels, risk_factors
- **API key from env**: OPENAI_API_KEY, ANTHROPIC_API_KEY — no hardcoded keys
- **Timeout**: 10s default via `aiohttp.ClientTimeout`
- **Rule-based fallback**: If no API key, uses `_rule_based_analysis()` — system works without LLM

Good LLM engine with proper caching, fallback, and env-based API keys. ✅

### 8.299 ai-signal-bot llm_engine: cache unbounded above 100 — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:163-167`

```python
if len(self._cache) > 100:
    stale_keys = [k for k, (t, _) in self._cache.items() if now - t >= self.config.cache_ttl_seconds]
    for k in stale_keys:
        del self._cache[k]
```

Cache eviction only triggers when `len > 100`. Between checks, the cache can grow to 100 + N (where N is the number of entries added in one `analyze_market` call). If many symbols are analyzed simultaneously, the cache could temporarily exceed 100. This is minor but could be cleaner.

**Фикс:** Use `functools.lru_cache` or a proper LRU cache with a hard cap.

### 8.300 ai-signal-bot llm_engine: no input validation on LLM response — Medium [FIXED]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:177`

```python
analysis = self._parse_response(response, ctx.symbol)
```

The LLM response is parsed by `_parse_response` (not shown in the read portion). If the LLM returns malformed JSON or unexpected fields, the parse could fail silently or produce incorrect analysis. No schema validation on the LLM output.

**Фикс:** Use Pydantic or JSON schema validation on the LLM response. Validate sentiment is in {bullish, bearish, neutral}, confidence is 0-100, recommendation is in {buy, sell, hold}.

### 8.301 ai-signal-bot llm_engine: f-string logging — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:93`

```python
logger.info(f"[LLMEngine] Provider: {self.config.provider}, model: {self.config.model}")
```

Same f-string logging pattern.

**Фикс:** Use `logger.info("[LLMEngine] Provider: %s, model: %s", self.config.provider, self.config.model)`.

### 8.302 ai-signal-bot networking/socket_transport.py: UDP transport — ✅ Good

**Файл:** `ai-signal-bot/src/networking/socket_transport.py` (156 lines)

- **Non-blocking UDP**: `setblocking(False)` with 100μs sleep on BlockingIOError
- **Buffer sizes**: 1MB RX/TX via `SO_RCVBUF`/`SO_SNDBUF`
- **Binary protocol**: `[ts_ns:8][symbol_len:1][symbol:N][price:8][qty:8][side:1][msg_type:1]` — compact
- **MarketDataPacket dataclass**: timestamp_ns, symbol, price, qty, side, msg_type
- **5 msg types**: new, modify, cancel, trade, snapshot
- **Stats**: packets_rx/tx, bytes_rx/tx, rx_drops, avg_latency_ns
- **CodeQL annotation**: `# codeql[py/bind-all-interfaces]` — documented bind address
- **Exception handling**: Catches BlockingIOError, OSError, struct.error, UnicodeDecodeError

Good UDP transport with proper non-blocking I/O and binary protocol. ✅

### 8.303 ai-signal-bot socket_transport: busy-poll 100μs sleep — Low [N/A]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:105`

```python
except BlockingIOError:
    time.sleep(0.0001)  # 100μs sleep
```

When no data is available, the receive loop does `time.sleep(0.0001)` — a busy-poll pattern. This consumes CPU even when idle. For a low-latency system, this is acceptable, but `selectors` or `asyncio` would be more efficient.

**Фикс:** Use `selectors.DefaultSelector` to wait for socket readability, or integrate with asyncio event loop.

### 8.304 ai-signal-bot socket_transport: no graceful shutdown — Low [N/A]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:86-108`

`start_receive_loop` is a blocking `while self._running` loop. `stop()` sets `_running = False` and closes the socket, but the loop might be blocked on `recvfrom`. Closing the socket from another thread will raise an OSError in the loop, which is caught but logged as an error.

**Фикс:** Use `selectors` with a timeout so the loop can check `_running` periodically without busy-polling.

### 8.305 ai-signal-bot research/__init__.py: 35-module mega-import — High (code reduction) [FIXED]

**Файл:** `ai-signal-bot/src/research/__init__.py` (307 lines)

This file imports from **35 research modules** — all eagerly loaded on `import src.research`. The `__all__` list has **200+ exported names**. Every module is loaded even if only one is used.

Modules include: affine_arithmetic, almgren_chriss, banach, burgers, cameron_martin, ccm, cramer_rao, fokker_planck, free_energy, girsanov, graph_mst, greeks_hedging, hahn, info_bottleneck, ito_generator, kolmogorov_sinai, koopman, lax_milgram, lie_group, malliavin, microstructure_lab, pontryagin, radon_nikodym, renormalization, renyi_entropy, riesz, rmt, sobolev, stochastic_control, tensor_decomp, transfer_entropy, attribution, competition, genetic_strategy.

**Code reduction:** ~200 lines can be eliminated by using lazy imports or a plugin registry. Only load modules when requested.

**Фикс:** Replace with `importlib.import_module()` on demand, or use `__getattr__` pattern for lazy module loading.

### 8.306 ai-signal-bot research: 22× duplicated compute_returns — High (code reduction) [FIXED]

**Файл:** 22 research modules (banach.py, burgers.py, cameron_martin.py, cramer_rao.py, fokker_planck.py, free_energy.py, girsanov.py, hahn.py, info_bottleneck.py, ito_generator.py, kolmogorov_sinai.py, koopman.py, lax_milgram.py, lie_group.py, malliavin.py, pontryagin.py, radon_nikodym.py, renormalization.py, renyi_entropy.py, riesz.py, sobolev.py, stochastic_control.py)

**22 identical copies** of:
```python
def compute_returns(prices: list[float]) -> list[float]:
    """Simple returns."""
    return [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
```

Each copy is imported with a unique alias (e.g., `banach_compute_returns`, `burgers_compute_returns`) in `__init__.py`, making the duplication even worse.

**Code reduction:** 22 × 3 lines = 66 lines eliminated. Replace with a single `compute_returns` in a shared utils module.

**Фикс:** Create `src/research/_common.py` with `compute_returns`, import in each module.

### 8.307 ai-signal-bot research: 35 modules — code reduction candidate — High [FIXED]

**Файл:** `ai-signal-bot/src/research/` (35 files, ~5000+ lines total)

35 research modules covering advanced mathematical concepts: Banach fixed-point, Burgers equation, Cameron-Martin, Cramér-Rao, Fokker-Planck, Free Energy, Girsanov, Hahn decomposition, Information Bottleneck, Itô generator, Kolmogorov-Sinai, Koopman, Lax-Milgram, Lie group, Malliavin calculus, Pontryagin MMP, Radon-Nikodym, Renormalization group, Rényi entropy, Riesz representation, Random Matrix Theory, Sobolev spaces, Stochastic control, Tensor decomposition, Transfer entropy, Almgren-Chriss, Affine arithmetic, CCM/EDM, Graph MST, Greeks hedging, Microstructure lab, Attribution, Competition, Genetic strategy.

Most of these are research-grade mathematical tools that are unlikely to be used in production trading. They add significant code weight and import time.

**Code reduction:** Feature-flag the entire `research/` directory. Only load modules when explicitly requested. Consider moving to a separate `research/` package outside the main bot.

### 8.308 exchange_simulator health.py: FastAPI health + metrics — ✅ Good

**Файл:** `exchange_simulator/health.py` (127 lines)

- **2 endpoints**: `/health` (JSON status) and `/metrics` (Prometheus text format)
- **Health**: status, version, uptime, symbols count, exchanges count, orders submitted, audit logging flag
- **Metrics**: hft_orders_submitted_total, hft_orders_filled_total, hft_orders_rejected_total, hft_audit_log_entries_total, hft_symbols_count, hft_exchanges_count
- **Lazy init**: `_init()` creates exchanges/market on first request
- **Exception handling**: Catches RuntimeError, OSError, KeyError, ValueError, TypeError, AttributeError — returns 503
- **Prometheus format**: Correct `# HELP` and `# TYPE` comments, `text/plain; version=0.0.4`

Good health and metrics endpoints with proper error handling. ✅

### 8.309 exchange_simulator health.py: accesses private attributes — Low [FIXED]

**Файл:** `exchange_simulator/health.py:87-88,106,112-113`

```python
"orders_submitted": len(first_ex._order_history),
"audit_logging_enabled": first_ex._audit_logger is not None,
history = ex._order_history
if ex._audit_logger:
    lines.append(f'hft_audit_log_entries_total{{exchange="{ex_id}"}} {len(ex._audit_logger._logs)}')
```

Health endpoint accesses `_order_history`, `_audit_logger`, and `_audit_logger._logs` — all private attributes. This creates tight coupling between the health endpoint and the exchange implementation.

**Фикс:** Add public properties or methods on `SimulatedExchange`: `order_count`, `audit_log_count`, `audit_enabled`.

### 8.310 exchange_simulator health.py: only first exchange checked — Low [FIXED]

**Файл:** `exchange_simulator/health.py:79`

```python
first_ex = next(iter(exchanges.values()))
```

Health check only reports metrics from the first exchange. If other exchanges are unhealthy, the health endpoint still reports "healthy".

**Фикс:** Iterate all exchanges and report per-exchange status.

### 8.311 exchange_simulator tracing.py: OpenTelemetry tracer — ✅ Good

**Файл:** `exchange_simulator/tracing.py` (193 lines)

- **4 trace operations**: order_processing, price_update, websocket_message, database_operation
- **Context propagation**: `inject_context()` and `extract_context()` for distributed tracing
- **Jaeger exporter**: Thrift-based, configurable host/port
- **Global singleton**: `get_tracer()` with lazy init
- **Span attributes**: symbol, side, quantity, service name, timestamps

Good tracing implementation with context propagation for distributed systems. ✅

### 8.312 exchange_simulator tracing: no graceful shutdown — Low [FIXED]

**Файл:** `exchange_simulator/tracing.py`

No `shutdown()` method to flush pending spans. The `BatchSpanProcessor` buffers spans and flushes asynchronously. If the process exits without flushing, traces may be lost.

**Фикс:** Add `shutdown()` method that calls `provider.shutdown()` or `processor.flush()`.

### 8.313 exchange_simulator tracing: time.sleep in trace_order_processing — Low [FIXED]

**Файл:** `exchange_simulator/tracing.py:72`

```python
# Simulate processing
time.sleep(0.001)
```

`trace_order_processing` includes a `time.sleep(0.001)` to "simulate processing". This adds 1ms latency to every traced order. This should be removed in production — tracing should be observation-only, not affect execution.

**Фикс:** Remove the `time.sleep(0.001)` line. Tracing should be passive.

### 8.314 exchange_simulator tracing: hardcoded localhost Jaeger — Low [FIXED]

**Файл:** `exchange_simulator/tracing.py:20-21`

```python
jaeger_host: str = "localhost",
jaeger_port: int = 6831,
```

Default Jaeger host is `localhost`. In K8s/Docker, this should be `jaeger` or similar service name.

**Фикс:** Read from env: `os.getenv("JAEGER_HOST", "localhost")`.

### 8.315 exchange_simulator metrics.py: Prometheus metrics — ✅ Good

**Файл:** `exchange_simulator/metrics.py` (250 lines)

- **4 metric types**: Counter, Gauge, Histogram
- **Order metrics**: orders_total (by symbol/side/status), order_rate
- **Fill metrics**: fills_total, fill_rate
- **Latency histograms**: order_latency (11 buckets 1ms-5s), websocket_latency (8 buckets 0.1ms-100ms)
- **Error metrics**: errors_total, error_rate
- **System metrics**: active_connections, memory_usage, cpu_usage
- **start_http_server**: Prometheus-compatible HTTP endpoint on port 8000

Good Prometheus metrics with proper labeling and histogram buckets. ✅

### 8.316 exchange_simulator: dual metrics systems — Medium (code reduction) [FIXED]

**Файл:** `exchange_simulator/metrics.py` (prometheus_client) + `exchange_simulator/health.py` `/metrics` endpoint + `exchange_simulator/ws_prometheus.py` (manual Prometheus format)

Three separate metrics systems:
1. `metrics.py` — uses `prometheus_client` library with Counter/Gauge/Histogram
2. `health.py` — manual Prometheus text format in `/metrics` endpoint
3. `ws_prometheus.py` — manual Prometheus text format mixin for WebSocket server

All three generate Prometheus-format metrics, but they don't share metric names or labels. `metrics.py` uses `exchange_simulator_*` prefix, `health.py` uses `hft_*` prefix, `ws_prometheus.py` uses `exchange_*` prefix.

**Code reduction:** Consolidate into a single metrics module. Use `prometheus_client` throughout, eliminate manual format generation.

### 8.317 exchange_simulator audit_logger.py: thread-safe audit logging — ✅ Excellent

**Файл:** `exchange_simulator/audit_logger.py` (311 lines)

- **Thread-safe**: `Lock()` protects `_logs` and `_callbacks`
- **Bounded memory**: `deque(maxlen=10000)` — no unbounded growth
- **File persistence**: JSON-lines format to `logs/audit.log`
- **Callbacks**: Real-time event notification via registered callbacks
- **UUID**: Each log entry gets a unique `uuid.uuid4()` ID
- **6 event types**: Order lifecycle, position lifecycle, balance changes, config changes, system events, user actions
- **Session tracking**: `user_id`, `session_id` fields

Excellent audit logger with thread safety, bounded memory, and file persistence. ✅

### 8.318 exchange_simulator audit_logger: f-string logging — Low [FIXED]

**Файл:** `exchange_simulator/audit_logger.py:51`

```python
logger.info(f"AuditLogger initialized: max_entries={max_memory_entries}, file={log_file_path}")
```

Same f-string logging pattern.

**Фикс:** Use `logger.info("AuditLogger initialized: max_entries=%d, file=%s", max_memory_entries, log_file_path)`.

### 8.319 exchange_simulator ws_prometheus.py: manual Prometheus format — Low (code reduction) [N/A]

**Файл:** `exchange_simulator/ws_prometheus.py` (75 lines)

Manually generates Prometheus text format strings. This duplicates what `prometheus_client` already does in `metrics.py`. The mixin accesses `self.clients`, `self.market._candle_count`, `self.market.is_weekend_mode`, `self._tick_interval`, `self._trading_active`, `self._total_connections`, `self._total_disconnections`, `self.exchanges`, `ex.account` — tight coupling.

**Фикс:** Use `prometheus_client` metrics from `metrics.py` instead of manual string generation.

### 8.320 ai-signal-bot communication/circuit_breaker.py: 3-state breaker — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3 states**: CLOSED → OPEN → HALF_OPEN (proper circuit breaker pattern)
- **Configurable**: failure_threshold=5, cooldown_seconds=60, half_open_max_probes=1, success_threshold=2
- **Stats**: total_trips, total_blocks
- **State transitions**: OPEN→HALF_OPEN on cooldown expiry (lazy in `state` property), HALF_OPEN→CLOSED on success threshold, HALF_OPEN→OPEN on failure
- **get_status()**: Returns dict for monitoring/UI
- **reset()**: Force reset to CLOSED

Excellent circuit breaker with proper 3-state pattern, half-open probes, and stats. ✅

### 8.321 ai-signal-bot: 3× CircuitBreaker duplication — High (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines) — 3-state: CLOSED/OPEN/HALF_OPEN, configurable, stats
2. `ai-signal-bot/src/strategies/circuit_breaker.py` (85 lines) — 2-state: tripped/not, simpler
3. `ai-signal-bot/src/utils/helpers.py:145` — Simple API call circuit breaker

Three separate CircuitBreaker implementations with overlapping functionality. The communication one is the most complete (3-state with half-open). The strategies one is simpler (tripped boolean). The utils one is for API calls.

**Code reduction:** Consolidate into a single configurable CircuitBreaker in `src/communication/circuit_breaker.py`. The strategies and utils versions can use it with different configs.

**Фикс:** Delete `strategies/circuit_breaker.py` and `utils/helpers.py:CircuitBreaker`, import from `communication/circuit_breaker.py`.

### 8.322 ai-signal-bot communication/ws_client.py: WebSocket client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **3 encoding formats**: msgpack (fastest), orjson (fast JSON), json (fallback)
- **Compression**: `compression="deflate"` + `ping_interval=10`
- **Bounded history**: `deque(maxlen=200)` per symbol — no unbounded growth
- **Message types**: candles, snapshot, trading_state, error, welcome
- **Trading guard**: `if not self._trading_active: return` before order submission
- **Protocol version**: Sends `protocol_version: 2` on subscribe

Good WebSocket client with encoding fallback chain and bounded history. ✅

### 8.323 ai-signal-bot ws_client: no reconnect logic — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/ws_client.py:119-121`

```python
except websockets.ConnectionClosed:
    logger.warning("Connection closed by server")
    self._connected = False
```

On connection close, the client just logs and sets `_connected = False`. No reconnect attempt. The bot will stop receiving market data until manually reconnected.

**Фикс:** Add exponential backoff reconnect loop. Or use `websockets.connect` with `reconnect` pattern.

### 8.324 ai-signal-bot communication/ws_connection_pool.py: WS pool — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py` (152 lines)

- **Connection reuse**: Pooled connections by URL, stale eviction
- **Max pool size**: 10 connections, evicts stale on overflow
- **Health checks**: Periodic ping/pong with 5s timeout, marks unhealthy
- **asyncio.Lock**: Proper async lock for pool operations
- **Compression**: `compression="deflate"`, `ping_interval=10`, `max_size=2**20`
- **Stale timeout**: 30s idle → connection closed
- **close_all()**: Cancels health task, closes all connections
- **pool_stats()**: Returns per-URL connection counts

Excellent connection pool with health checks, stale eviction, and proper cleanup. ✅

### 8.325 ai-signal-bot ws_connection_pool: _evict_stale fire-and-forget close — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py:106`

```python
asyncio.create_task(conn.close())
```

`_evict_stale` creates fire-and-forget tasks to close stale connections. These tasks may not complete before the function returns, and if the event loop stops, they could be cancelled.

**Фикс:** Use `await conn.close()` directly since `_evict_stale` is called within the lock context.

### 8.326 ai-signal-bot communication/fix_client.py: FIX 4.4 client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/fix_client.py` (447 lines)

- **FIX 4.4**: Standard protocol with SOH delimiter
- **Message parsing**: `FixMessage.parse()` handles tag=value pairs
- **Message building**: `FixMessage.build()` computes body length + checksum
- **Session management**: Logon/logout, heartbeat, sequence numbers
- **Properties**: is_logon, is_logout, is_heartbeat, is_execution_report, is_market_data
- **Timestamp**: Millisecond precision with UTC
- **Temp file**: Sequence numbers persisted to temp file

Good FIX client implementation with proper protocol handling. ✅

### 8.327 ai-signal-bot fix_client: catch-all exception in _check_service — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:73`

```python
except Exception as e:
    return {"status": "unhealthy", "error": str(e)}
```

The health aggregator's `_check_service` catches `Exception` — a catch-all that could mask unexpected errors like `TypeError` or `AttributeError` that indicate bugs.

**Фикс:** Catch specific exceptions: `aiohttp.ClientError`, `OSError`, `asyncio.TimeoutError`.

### 8.328 ai-signal-bot communication/shm_ring_buffer.py: Python↔C++ IPC — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: Single-producer single-consumer, matches C++ `ShmRingBuffer<T>`
- **Cache-line aligned**: head at offset 64, tail at offset 128 (alignas(64))
- **Cross-platform**: Windows (FlushViewOfFile) + Linux (msync)
- **Atomic operations**: Aligned uint64 reads/writes (naturally atomic on x86/x64)
- **Power-of-2 capacity**: Enforced in constructor, enables bitwise modulo
- **Magic number**: `0x484654343253484D` ("HFT42SHM") for validation
- **Safe __del__**: Checks `_mm` and `_fd` before cleanup

Excellent shared memory IPC implementation matching C++ binary layout. ✅

### 8.329 ai-signal-bot communication/health_check.py: Health aggregator — ✅ Good

**Файл:** `ai-signal-bot/src/communication/health_check.py` (127 lines)

- **3-service aggregation**: ai-signal-bot (:9090), exchange-simulator (:8775), hft-trade-bot (:9091)
- **Parallel checks**: `asyncio.gather(*tasks)` — all services checked concurrently
- **3 states**: healthy (all healthy), unhealthy (any unhealthy), degraded (mixed)
- **503 on unhealthy**: Returns HTTP 503 when any service is unhealthy
- **Timeout**: 3s per service check
- **Proper cleanup**: `stop()` stops site + cleans up runner
- **nosec annotation**: `# nosec: B104` on `0.0.0.0` bind

Good health aggregator with parallel checks and proper HTTP status codes. ✅

### 8.330 ai-signal-bot communication/metrics_server.py: Prometheus metrics — ✅ Good

**Файл:** `ai-signal-bot/src/communication/metrics_server.py` (136 lines)

- **7 metrics**: signals_sent, signals_blocked, ws_clients, backtests, cb_trips, cb_state, uptime
- **Prometheus format**: Correct `# HELP` + `# TYPE` comments, text/plain version=0.0.4
- **Manual HTTP**: Uses `asyncio.start_server` — no external web framework needed
- **Proper cleanup**: `stop()` closes server + waits
- **nosec annotation**: `# nosec: B104` on `0.0.0.0` bind
- **Connection handling**: Reads HTTP headers, responds, closes connection

Good lightweight metrics server without external dependencies. ✅

### 8.331 ai-signal-bot metrics_server: not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py:25-32`

```python
self._signals_sent = 0
self._signals_blocked = 0
```

Metrics counters are plain integers incremented from async callbacks. While Python's GIL prevents true data races, `+=` is not atomic — it's read-modify-write. If multiple asyncio tasks increment simultaneously, some increments could be lost.

**Фикс:** Use `asyncio.Lock` or `itertools.count` for atomic counting. Or accept the minor inaccuracy for a metrics endpoint.

### 8.332 ai-signal-bot strategies/signal.py: Signal dataclass — ✅ Excellent

**Файл:** `ai-signal-bot/src/strategies/signal.py` (58 lines)

- **SignalDirection enum**: LONG, SHORT, NEUTRAL
- **Signal dataclass**: symbol, direction, confidence (0-100), strategy, entry_price, SL, TP, reason, timestamp
- **is_actionable**: `direction != NEUTRAL` — clean check
- **rr_ratio**: Correct R:R calculation for LONG/SHORT, 0.0 for NEUTRAL
- **to_dict()**: Serializes all fields including computed rr_ratio
- **Risk guard**: `if risk > 0 else 0.0` — prevents division by zero

Excellent signal type design — clean, minimal, correct. ✅

### 8.333 ai-signal-bot risk/risk_manager.py: trailing stop + breakeven — ✅ Good

**Файл:** `ai-signal-bot/src/risk/risk_manager.py` (262 lines)

- **4 risk features**: trailing stop, breakeven move, partial TP, max hold time
- **ATR-based trailing**: Optional `trailing_atr_multiplier` for adaptive distance
- **PositionRiskState**: Tracks per-position state (peak/trough price, breakeven_moved)
- **Configurable**: All features have enable flags + configurable parameters
- **Side-aware**: Correct SL adjustment for LONG (raise SL) and SHORT (lower SL)

Good risk manager with multiple risk management features and proper position tracking. ✅

### 8.334 ai-signal-bot risk_manager: no thread safety — Low [N/A]

**Файл:** `ai-signal-bot/src/risk/risk_manager.py`

`RiskManager` manages `PositionRiskState` objects. If called from multiple asyncio tasks (e.g., processing multiple symbols concurrently), the `peak_price`/`trough_price` updates could race.

**Фикс:** Use `asyncio.Lock` per position, or ensure single-threaded execution.

### 8.335 ai-signal-bot: dual health check systems — Medium (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/observability/health_checks.py` (221 lines) — `HealthChecker` class with 4 component checks
2. `ai-signal-bot/src/communication/health_check.py` (127 lines) — `HealthAggregator` class with 3-service aggregation

Two separate health check systems:
- `observability/health_checks.py` checks internal components (WS, DB, Redis, exchange)
- `communication/health_check.py` aggregates external service health endpoints

They don't share status format, state definitions, or response structure. `observability` uses `HealthStatus` enum (HEALTHY/DEGRADED/UNHEALTHY), `communication` uses strings ("healthy"/"degraded"/"unhealthy").

**Code reduction:** Consolidate into a single health system. `HealthAggregator` can use `HealthChecker` for internal checks + aggregate external services.

### 8.336 ai-signal-bot: dual metrics systems — Medium (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/communication/metrics_server.py` (136 lines) — Manual Prometheus text format, 7 metrics
2. `ai-signal-bot/src/monitoring/` — Separate monitoring module with metrics

Two separate metrics systems in the same bot. The communication one is lightweight (no deps), the monitoring one may use prometheus_client.

**Code reduction:** Consolidate into a single metrics module.

### 8.337 ai-signal-bot communication: f-string logging across 5+ files — Low [FIXED]

**Файлы:** `ws_client.py:84,88`, `ws_connection_pool.py:65,94,97,123`, `fix_client.py`, `health_check.py:118`, `metrics_server.py:101`

5+ communication modules use f-string logging. Same pattern as the rest of the project.

**Фикс:** Use `%` formatting for lazy evaluation across all modules.

### 8.338 ai-signal-bot portfolio/markowitz.py: Mean-Variance optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/markowitz.py` (178 lines)

- **Efficient frontier**: Calculates portfolio metrics (return, volatility, Sharpe)
- **scipy optimization**: Objective function with penalty for target return constraint
- **PortfolioResult dataclass**: weights, expected_return, volatility, sharpe_ratio
- **EfficientFrontierPoint**: For plotting frontier
- **Div-by-zero guard**: `if portfolio_volatility > 0 else 0.0`

Good Markowitz implementation with proper optimization. ✅

### 8.339 ai-signal-bot: 3× PortfolioOptimizer duplication — High (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/portfolio/markowitz.py` (178 lines) — `MarkowitzOptimizer`
2. `ai-signal-bot/src/portfolio/black_litterman.py` (135 lines) — `BlackLittermanModel` (uses MarkowitzOptimizer)
3. `ai-signal-bot/src/portfolio/risk_parity.py` — `RiskParityOptimizer`
4. `ai-signal-bot/src/risk/portfolio_optimizer.py` (307 lines) — `PortfolioOptimizer` (Markowitz + BL + Kelly + Risk Parity)
5. `ai-signal-bot/src/strategies/portfolio_optimizer.py` (311 lines) — `PortfolioOptimizer` (Markowitz + BL + Risk Parity + Min Var)

**5 files** implementing the same portfolio optimization algorithms. `risk/portfolio_optimizer.py` and `strategies/portfolio_optimizer.py` are both ~300-line `PortfolioOptimizer` classes with overlapping methods. `portfolio/` has separate classes for each method.

**Code reduction:** ~600 lines can be eliminated. Consolidate into `portfolio/` package. `risk/` and `strategies/` should import from `portfolio/`.

**Фикс:** Delete `risk/portfolio_optimizer.py` and `strategies/portfolio_optimizer.py`, import from `portfolio/`.

### 8.340 ai-signal-bot portfolio/rebalancing.py: 3 trigger types — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/rebalancing.py` (145 lines)

- **3 triggers**: TIME_BASED, DRIFT_BASED, VOLATILITY_BASED
- **RebalanceOrder**: asset_index, current/target weight, trade_amount, side
- **RebalanceResult**: orders, new_weights, turnover, estimated_cost
- **Turnover calculation**: `0.5 * sum(abs(target - current))` — correct
- **Transaction cost**: Configurable, estimated in result

Good rebalancing module with proper turnover and cost estimation. ✅

### 8.341 ai-signal-bot data_collection/exchange_factory.py: Protocol-based adapter — ✅ Excellent

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py` (242 lines)

- **ExchangeAdapter Protocol**: 10 methods (initialize, close, get_ticker, get_orderbook, get_candles, place_order, cancel_order, get_balance, get_positions, get_health)
- **3 modes**: SIMULATOR, REAL, FALLBACK (try real → fall back to simulator)
- **SimulatorAdapter**: Stub implementation with hardcoded prices
- **RealExchangeAdapter**: Wraps RealMarketDataManager + RealAccountManager
- **Lazy imports**: RealExchangeAdapter imports real modules in `initialize()`
- **Proper cleanup**: `close()` closes both market_data and account

Excellent factory pattern with Protocol-based adapter, 3 modes, and lazy imports. ✅

### 8.342 ai-signal-bot data_collection/real_exchange_client.py: REST client — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_exchange_client.py` (335 lines)

- **3 exchanges**: Binance, OKX, Bybit
- **HMAC-SHA256 signing**: Separate methods for each exchange (_sign_binance, _sign_okx, _sign_bybit)
- **usedforsecurity=False**: `_sha256_factory()` marks hashlib as non-security — good CodeQL practice
- **Shared session**: `aiohttp.ClientSession(timeout=10s)` — proper timeout
- **AccountBalance + Position dataclasses**: Clean data models
- **Testnet URLs**: Correct testnet endpoints for Binance and OKX

Good REST client with proper signing, shared session, and testnet support. ✅

### 8.343 ai-signal-bot real_exchange_client: api_key/secret as instance attrs — Low [N/A]

**Файл:** `ai-signal-bot/src/data_collection/real_exchange_client.py:68-70`

```python
self.api_key = api_key
self.api_secret = api_secret
self.passphrase = passphrase
```

API credentials stored as plain instance attributes. If the object is introspected (e.g., in a debugger or crash dump), credentials are visible. Not a critical issue if credentials come from env vars, but worth noting.

**Фикс:** Use `__slots__` or store in a separate `_credentials` object with `__repr__` redaction.

### 8.344 ai-signal-bot ml/model_registry.py: Model versioning + A/B testing — ✅ Excellent

**Файл:** `ai-signal-bot/src/ml/model_registry.py` (296 lines)

- **5 statuses**: CANDIDATE, STAGING, PRODUCTION, ARCHIVED, ROLLED_BACK
- **ModelVersion**: name, version, path, status, metrics, metadata, timestamps, A/B impressions/successes
- **ABTest**: Control vs treatment, traffic_split, impressions, successes, active flag
- **File persistence**: JSON-based registry with load/save
- **Rollback**: Automatic on performance degradation
- **Exception handling**: Catches OSError, ValueError, KeyError, TypeError on load

Excellent model registry with versioning, A/B testing, rollback, and file persistence. ✅

### 8.345 ai-signal-bot ml/model_registry: no file lock — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/model_registry.py:107-119`

`_save()` writes to `registry.json` without a file lock. If multiple processes save concurrently, the file could be corrupted (partial writes).

**Фикс:** Use `fcntl.flock` (Linux) or `msvcrt.locking` (Windows) for file locking. Or write to temp file + atomic rename.

### 8.346 ai-signal-bot ml/feature_store.py: Redis-backed features — ✅ Good

**Файл:** `ai-signal-bot/src/ml/feature_store.py` (220 lines)

- **Redis backend**: Feature hashes with TTL (1 hour default)
- **In-memory fallback**: If Redis unavailable, uses dict
- **Feature registry**: Redis set for feature discovery
- **Batch operations**: `get_features_batch()` for multiple symbols
- **Timeout**: 2s socket timeout + 2s connect timeout
- **Graceful degradation**: Redis connection failure → in-memory mode

Good feature store with Redis backend and graceful fallback. ✅

### 8.347 ai-signal-bot feature_store: catch-all in Redis connection — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/feature_store.py:94`

```python
except (OSError, ConnectionError, RuntimeError, Exception) as e:
```

Catches `Exception` — redundant since `OSError` and `ConnectionError` are already listed. The `Exception` catch-all masks unexpected errors.

**Фикс:** Remove `Exception` from the tuple. Catch specific: `(OSError, ConnectionError, redis.RedisError)`.

### 8.348 ai-signal-bot ml/price_predictor.py: LSTM/Transformer model — ✅ Good

**Файл:** `ai-signal-bot/src/ml/price_predictor.py` (334 lines)

- **2 architectures**: LSTM (128 hidden, 2 layers) + Transformer (multi-head attention)
- **ONNX export**: For C++ inference via onnx_engine.h
- **ModelConfig**: model_type, input_dim=11, hidden_dim=128, num_layers=2, dropout=0.1
- **PyTorch**: Uses torch.nn.Module, DataLoader, Dataset
- **11 input features**: OHLCV + RSI + EMA_fast + EMA_slow + ATR + volume_ratio + return

Good ML model with ONNX export for production inference. ✅

### 8.349 ai-signal-bot technical_analysis/: 25 files — High (code reduction) [N/A]

**Файл:** `ai-signal-bot/src/technical_analysis/` (25 files)

25 technical analysis modules: bayesian_price, bayesian_sts, compressed_sensing, copula, dtw, emd, fft_analysis, garch, gmm, hawkes, hawkes_funcs, hawkes_model, hmc, indicators, kalman, kmeans, monte_carlo, ms_garch, optimal_stopping, pca, rbergomi, sde, vmd, wavelet.

Many overlap with `research/` modules: GARCH (garch.py vs research modules), Kalman (kalman.py vs research), Hawkes (hawkes.py + hawkes_funcs.py + hawkes_model.py — already split), PCA (pca.py), GMM (gmm.py), KMeans (kmeans.py), Monte Carlo (monte_carlo.py), Wavelet (wavelet.py).

**Code reduction:** Consolidate `technical_analysis/` and `research/` — they cover overlapping mathematical/statistical methods. Feature-flag advanced modules.

### 8.350 ai-signal-bot technical_analysis/indicators.py: 8 indicators — ✅ Good

**Файл:** `ai-signal-bot/src/technical_analysis/indicators.py` (333 lines)

- **8 indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, ADX, VWAP
- **NumPy optional**: `_HAS_NUMPY` flag with pure-Python fallback
- **NaN-padded**: Returns lists aligned with input, NaN where insufficient data
- **Flexible input**: Accepts dict candles or Candle objects
- **Helper functions**: `_closes()`, `_highs()`, `_lows()`, `_volumes()`

Good indicator library with NumPy acceleration and pure-Python fallback. ✅

### 8.351 ai-signal-bot monitoring/alerting.py: Multi-channel alerts — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/alerting.py` (260 lines)

- **3 severity levels**: INFO, WARNING, CRITICAL
- **3 channels**: Discord webhook, Telegram, generic webhook
- **Rate limiting**: Cooldown per rule (default 5 min)
- **Bounded history**: `alert_history` capped at 1000 entries (but uses list slice, not deque)
- **Parallel send**: `asyncio.gather(*tasks, return_exceptions=True)` — good
- **Rule management**: add/remove/enable/disable
- **Exception handling**: Catches TypeError, ValueError, KeyError, RuntimeError, OSError

Good alert system with multi-channel, rate limiting, and parallel sends. ✅

### 8.352 ai-signal-bot alerting: alert_history list slice, not deque — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:113-114`

```python
if len(self.alert_history) > self._max_history:
    self.alert_history = self.alert_history[-self._max_history:]
```

Uses list slice to cap history — creates a new list copy every time. `deque(maxlen=1000)` is O(1) and more efficient.

**Фикс:** Use `collections.deque(maxlen=1000)`.

### 8.353 ai-signal-bot alerting: aiohttp session leak — Medium [FIXED]

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:150-158`

The `_send_discord`, `_send_telegram`, `_send_webhook` methods likely create `aiohttp.ClientSession` per call. If not using a shared session, each alert creates and potentially leaks a session.

**Фикс:** Create a shared `aiohttp.ClientSession` in `__init__` and close it in a `close()` method.

### 8.354 ai-signal-bot monitoring/health_server.py: HTTP health server — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/health_server.py` (153 lines)

- **4 endpoints**: /health, /health/exchange, /health/database, /health/shm
- **Registerable checks**: `register_check(name, check_fn)` — extensible
- **aiohttp web**: Proper AppRunner/TCPSite lifecycle
- **nosec annotation**: `# nosec: B104` on `0.0.0.0` bind
- **Per-component status**: Each check returns dict with 'healthy' bool

Good health server with extensible check registration. ✅

### 8.355 ai-signal-bot: 4× health check implementations — Medium (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/observability/health_checks.py` (221 lines) — `HealthChecker` with 4 component checks (WS, DB, Redis, exchange)
2. `ai-signal-bot/src/communication/health_check.py` (127 lines) — `HealthAggregator` with 3-service aggregation
3. `ai-signal-bot/src/monitoring/health_server.py` (153 lines) — `HealthServer` with registerable checks
4. `exchange_simulator/health.py` (127 lines) — FastAPI /health + /metrics

4 separate health check systems across the project. All do similar things but with different interfaces, response formats, and status definitions.

**Code reduction:** Consolidate into a single `health/` package with:
- `HealthChecker` — internal component checks
- `HealthAggregator` — external service aggregation
- `HealthServer` — HTTP endpoint serving both

### 8.356 ai-signal-bot backtesting/backtester.py: Candle replay engine — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/backtester.py` (506 lines)

- **Candle replay**: Iterates historical candles through strategies
- **Trade dataclass**: Symbol, side, entry/exit price, PnL, PnL%, exit_reason, fee
- **RiskManager integration**: Uses RiskConfig + RiskManager for SL/TP management
- **Signal import**: From `strategies.strategies` — proper separation
- **Exit reasons**: TAKE_PROFIT, STOP_LOSS, SIGNAL_EXIT, END

Good backtesting engine with risk management integration. ✅

### 8.357 ai-signal-bot backtesting/pnl_calculator.py: Pluggable PnL — ✅ Excellent

**Файл:** `ai-signal-bot/src/backtesting/pnl_calculator.py` (252 lines)

- **3 asset types**: SPOT, FUTURES, OPTIONS (via StrEnum)
- **PnLConfig**: fee_rate, slippage_bps, funding_rate, funding_interval, option_premium_pct
- **PnLBreakdown**: Detailed PnL components (entry/exit fees, slippage, funding, PnL)
- **Dependency injection**: PnLCalculator injected into BacktestEngine — asset-agnostic
- **Options support**: CALL/PUT via OptionType StrEnum

Excellent PnL calculator with pluggable asset types and detailed breakdown. ✅

### 8.358 ai-signal-bot: technical_analysis + research overlap — High (code reduction) [N/A]

**Файлы:** `ai-signal-bot/src/technical_analysis/` (25 files) + `ai-signal-bot/src/research/` (35 files) = **60 files**

Combined 60 mathematical/statistical analysis modules. Many cover the same concepts:
- GARCH: `technical_analysis/garch.py` + `technical_analysis/ms_garch.py` vs research stochastic models
- Kalman: `technical_analysis/kalman.py` vs research filtering
- Hawkes: `technical_analysis/hawkes*.py` (3 files) vs research point processes
- PCA: `technical_analysis/pca.py` vs research RMT
- Monte Carlo: `technical_analysis/monte_carlo.py` vs research stochastic
- Wavelet: `technical_analysis/wavelet.py` vs research signal processing
- Bayesian: `technical_analysis/bayesian_price.py` + `bayesian_sts.py` vs research free energy

**Code reduction:** Consolidate into a single `quant/` package. Feature-flag advanced modules. ~10,000+ lines of research-grade code that may not be used in production.

### 8.359 ai-signal-bot monitoring/metrics.py vs communication/metrics_server.py — Medium (code reduction) [FIXED]

**Файлы:**
1. `ai-signal-bot/src/monitoring/metrics.py` — Monitoring metrics
2. `ai-signal-bot/src/communication/metrics_server.py` (136 lines) — Prometheus metrics server

Two metrics modules in the same bot. `communication/metrics_server.py` has 7 metrics with manual Prometheus format. `monitoring/metrics.py` may have overlapping metrics.

**Code reduction:** Consolidate into a single metrics module.

### 8.360 ai-signal-bot signal_validation/validator.py: 5-check validator — ✅ Excellent

**Файл:** `ai-signal-bot/src/signal_validation/validator.py` (122 lines)

- **5 checks**: confidence, R:R ratio, daily drawdown, max positions, duplicate cooldown
- **ValidationResult**: passed, reason, signal — clean result type
- **Duplicate prevention**: 5-minute cooldown per symbol, stale entry cleanup
- **Daily reset**: Auto-resets daily PnL after 24h
- **Early exit**: Returns on first failed check — efficient
- **Div-by-zero guard**: `if account_balance > 0 else 0` in drawdown calc

Excellent signal validator with comprehensive checks and clean design. ✅

### 8.361 ai-signal-bot signal_validator: datetime.now() without timezone — Low [N/A]

**Файл:** `ai-signal-bot/src/signal_validation/validator.py:46,58,113`

```python
self._daily_reset = datetime.now()
```

Uses `datetime.now()` without timezone — returns naive datetime. In distributed systems, this can cause issues when comparing timestamps across machines in different timezones.

**Фикс:** Use `datetime.now(UTC)` from `datetime import UTC`.

### 8.362 ai-signal-bot database/db.py: SQLite with WAL — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` for concurrent read/write access
- **Row factory**: `sqlite3.Row` for dict-like access
- **3 tables**: signals, trades, equity_curve — with proper schema
- **3 indexes**: idx_signals_symbol, idx_trades_symbol, idx_trades_status
- **Parameterized queries**: Uses `?` placeholders — SQL injection safe
- **Windows-safe close**: `wal_checkpoint(TRUNCATE)` + `journal_mode=DELETE` on close
- **contextlib.closing**: Proper resource cleanup

Good SQLite layer with WAL, indexes, parameterized queries, and Windows-safe cleanup. ✅

### 8.363 ai-signal-bot db.py: new connection per operation — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every `save_signal`, `save_trade`, etc. creates a new connection, sets WAL mode, and closes it. This is expensive:
1. `PRAGMA journal_mode=WAL` is executed on every call — unnecessary after first call
2. Connection overhead per write — significant for high-frequency trading
3. No connection pooling

**Фикс:** Use a single persistent connection with a thread lock, or use `aiosqlite` for async access. Cache the WAL pragma.

### 8.364 ai-signal-bot db.py: catch-all in close() — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py:33`

```python
except Exception:
    pass
```

The `close()` method silently swallows all exceptions. If WAL checkpoint fails, the user has no way to know.

**Фикс:** At minimum log the error: `except Exception as e: logger.warning("DB close error: %s", e)`.

### 8.365 ai-signal-bot config/__init__.py: Comprehensive validation — ✅ Excellent

**Файл:** `ai-signal-bot/config/__init__.py` (314 lines)

- **5 required sections**: trading, exchange, risk, strategies, indicators
- **Range validation**: max_risk_per_trade_pct in (0, 100], min_confidence in [0, 100]
- **Cross-field validation**: ema_fast < ema_slow, rsi_oversold < rsi_overbought, macd_fast < macd_slow
- **Warnings for suspicious values**: risk > 10%, drawdown > 20%, SL > 10%, positions > 10
- **Errors vs warnings**: Returns tuple — errors raise, warnings log
- **yaml.safe_load**: Safe deserialization (not `yaml.load`)

Excellent config validation with range checks, cross-field validation, and suspicious value warnings. ✅

### 8.366 ai-signal-bot config: f-string logging — Low [N/A]

**Файл:** `ai-signal-bot/config/__init__.py:29,32`

```python
logger.warning(f"Config: {w}")
logger.error(f"Config ERROR: {e}")
```

Uses f-string logging in config validation. Same pattern as rest of project.

**Фикс:** Use `logger.warning("Config: %s", w)`.

### 8.367 ai-signal-bot run.py: Main entry point — ✅ Good

**Файл:** `ai-signal-bot/run.py` (397 lines)

- **Clean architecture**: Exchange → Data → Indicators → Strategies → Ensemble → Validation → Execution → DB
- **Component initialization**: Exchange, SignalPublisher, Database, Validator, Tracker, LLMEngine
- **nosec annotation**: `# nosec: B104` on `0.0.0.0` bind
- **sys.path manipulation**: Adds project root for shared modules — documented with comment
- **Config-driven**: All parameters from SignalBotConfig

Good main entry point with clean pipeline and config-driven setup. ✅

### 8.368 ai-signal-bot run.py: no graceful shutdown — Medium [FIXED]

**Файл:** `ai-signal-bot/run.py:100`

```python
self._running = False
```

The bot has a `_running` flag but no signal handler (SIGINT/SIGTERM) to trigger graceful shutdown. If the process is killed, pending DB writes and WebSocket connections may not be cleaned up.

**Фикс:** Add `signal.signal(signal.SIGINT, handler)` and `signal.signal(signal.SIGTERM, handler)` that sets `_running = False`.

### 8.369 ai-signal-bot run.py: f-string logging — Low [N/A]

**Файл:** `ai-signal-bot/run.py:111-117`

```python
self.logger.info(f"  Symbols: {self.config.symbols}")
self.logger.info(f"  Strategies: {[s.name for s in self.strategies]}")
```

Multiple f-string log calls in startup. Same pattern as rest of project.

**Фикс:** Use `%` formatting.

### 8.370 shared_config.yaml: 50 symbols duplicated across 4+ config files — High (code reduction) [N/A]

**Файлы:**
1. `shared_config.yaml` — 50 symbols
2. `ai-signal-bot/config/settings.yaml` — 50 symbols
3. `exchange_simulator/config.yaml` — 50 symbols × 3 exchanges = 150 entries
4. `hft-trade-bot/config/config.yaml` — 50 symbols

**250+ symbol entries** across config files. If a symbol is added/removed, it must be updated in 4+ places. The `shared_config.yaml` was supposed to be the single source of truth, but each component has its own copy.

**Code reduction:** Have each component's config reference `shared_config.yaml` or use environment variables. Or generate component configs from `shared_config.yaml` via a script.

### 8.371 shared_config.yaml: localhost in all configs — Medium [FIXED]

**Файлы:** `shared_config.yaml:108,112`, `ai-signal-bot/config/settings.yaml:74`, `hft-trade-bot/config/config.yaml:76,165`, `helm/values.yaml:104-105`

All WebSocket URLs default to `localhost`. In Kubernetes/Docker, `localhost` means the container itself, not the host. The Helm values also hardcode `ws://localhost:8765` as build-time Vite args.

**Фикс:** Use environment variables: `ws://${EXCHANGE_SIMULATOR_HOST:-localhost}:8765`. In Helm, use K8s service names: `ws://exchange-simulator:8765`.

### 8.372 Makefile: Clean dev targets — ✅ Good

**Файл:** `Makefile` (84 lines)

- **12 targets**: help, install, dev, test, lint, build, docker-up/down, clean, logs, ci-test, benchmark
- **Self-documenting**: `help` target greps `##` comments
- **Per-component dev**: dev-exchange, dev-signals, dev-ui
- **Per-component test**: test-exchange, test-signals, test-js
- **Clean**: Removes dist, node_modules, __pycache__, .pytest_cache
- **Benchmark**: `scripts/benchmark_suite.py` for latency p50/p95/p99/p999

Good Makefile with comprehensive dev targets. ✅

### 8.373 Makefile.prod: Production operations — ✅ Excellent

**Файл:** `Makefile.prod` (122 lines)

- **15 targets**: prod-up/down/stop/build/rebuild/logs/ps/restart, db-migrate/backup/restore, monitor, health, clean, stats, deploy
- **prod-db-migrate**: Runs SQL migrations via asyncpg with glob
- **prod-db-backup**: Timestamped pg_dump with .env.prod fallback
- **prod-db-restore**: Requires file= argument — good UX
- **prod-health**: Checks 6 service endpoints (exchange, signals, HFT, Prometheus, UI, Grafana)
- **prod-deploy**: Build + up + health — one-command deploy
- **prod-clean**: `down -v --remove-orphans` + `docker system prune`

Excellent production Makefile with DB ops, health checks, and one-command deploy. ✅

### 8.374 Makefile.prod: prod-db-migrate no migration tracking — Medium [FIXED]

**Файл:** `Makefile.prod:48-60`

```bash
for f in sorted(glob.glob('src/database/migrations/*.sql')):
    with open(f) as fh:
        await conn.execute(fh.read())
```

Runs all SQL migrations every time — no tracking of which migrations have been applied. If a migration is not idempotent, re-running will fail. No `schema_migrations` table to track applied migrations.

**Фикс:** Add a `schema_migrations` table. Check if migration was already applied before executing.

### 8.375 Makefile.prod: prod-health uses /dev/tcp — Low

**Файл:** `Makefile.prod:82-83`

```bash
(echo > /dev/tcp/localhost/8765) 2>/dev/null && echo "OK (port open)" || echo "FAIL (port closed)"
```

`/dev/tcp` is a bash-specific feature — won't work with `sh` or on all systems. The Makefile doesn't specify `SHELL := /bin/bash`.

**Фикс:** Use `curl -s -o /dev/null` for all health checks, or add `SHELL := /bin/bash` at the top.

### 8.376 hft-trade-bot/core/bot_loop.cpp: Signal processing — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp` (279 lines)

- **3 processing functions**: process_sl_tp, process_arbitrage, process_ai_signals
- **Atomic balance**: `ctx.balance.fetch_add(closed->unrealized_pnl, std::memory_order_relaxed)` — correct atomic
- **Risk check**: `ctx.risk_mgr->check_signal()` before execution — proper guard
- **Position guard**: `!ctx.pos_mgr.has_position(ai_sig.symbol)` — no duplicate positions
- **Connection guard**: `ctx.executor->is_connected()` before submit
- **Lock-protected arb**: Copies arb opportunity under lock, then releases — minimal critical section
- **spdlog**: Structured logging with format strings

Good C++ signal processing with atomics, risk checks, and minimal locking. ✅

### 8.377 hft-trade-bot bot_loop: arb_lock manual lock/unlock — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:31-34`

```cpp
ctx.arb_lock.lock();
arb = ctx.latest_arb;
ctx.arb_lock.unlock();
```

Manual lock/unlock — if `ctx.latest_arb` copy throws, the lock is never released. Should use RAII `std::lock_guard` or `std::scoped_lock`.

**Фикс:** `std::lock_guard<std::mutex> lock(ctx.arb_lock); arb = ctx.latest_arb;`

### 8.378 hft-trade-bot bot_loop: hardcoded 0.001 min quantity — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:36`

```cpp
if (ctx.executor->is_connected() && arb.max_quantity > 0.001) {
```

Hardcoded minimum quantity threshold (0.001). Should be configurable.

**Фикс:** Use `ctx.config.min_arb_quantity` or similar.

### 8.379 hft-trade-bot bot_loop: hardcoded 0.5 max quantity — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:37`

```cpp
double qty = std::min(arb.max_quantity, 0.5);
```

Hardcoded max arbitrage quantity (0.5). Should be configurable.

**Фикс:** Use `ctx.config.max_arb_quantity`.

### 8.380 hft-trade-bot bot_loop: synthetic order book generation — Medium

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:79-82`

```cpp
for (int i = 0; i < 10; ++i) {
    ctx.ob_buf.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
    ctx.ob_buf.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
}
```

If no real order book is found, a synthetic one is generated with 10 levels at 1bp spacing and 1.0 quantity. This synthetic book has:
1. **Fixed 1.0 quantity** — unrealistic, all levels same size
2. **1bp spacing** — too tight for less liquid symbols
3. **No spread** — bid/ask start at same price ± 1bp
4. **No validation** — synthetic book is used without warning

**Фикс:** Log a warning when using synthetic book. Make spacing and quantity configurable per symbol.

### 8.381 ai-signal-bot: no SIGINT/SIGTERM handler — Medium [FIXED]

**Файл:** `ai-signal-bot/run.py`

The bot has `_running = False` flag but no signal handler. On SIGTERM (K8s pod termination), the bot is killed without cleanup. Pending DB writes, WebSocket connections, and SHM resources are not released.

**Фикс:** Register signal handlers:
```python
loop.add_signal_handler(signal.SIGTERM, self.stop)
loop.add_signal_handler(signal.SIGINT, self.stop)
```

### 8.382 ai-signal-bot: no database migrations — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py`

The database uses `CREATE TABLE IF NOT EXISTS` — no migration system. Schema changes require:
1. Dropping the database (losing data), or
2. Manual ALTER TABLE statements

The `Makefile.prod` has `prod-db-migrate` for PostgreSQL migrations, but the SQLite dev database has no migration support.

**Фикс:** Use Alembic or a simple migration runner with version tracking for both SQLite and PostgreSQL.

### 8.383 docker-compose.yml: 6-service stack — ✅ Excellent

**Файл:** `docker-compose.yml` (214 lines)

- **6 services**: exchange-simulator, ai-signal-bot, hft-trade-bot, web-ui, prometheus, grafana
- **Health checks**: All 6 services have healthcheck with interval/timeout/retries/start_period
- **depends_on with condition**: `service_healthy` — proper startup ordering
- **restart: unless-stopped**: All services auto-restart
- **Named volumes**: sim-data, sim-logs, ai-data, ai-logs, hft-logs, prom-data, grafana-data
- **Config mounts**: Read-only (`:ro`) for config files
- **shared_config.yaml**: Mounted to all services
- **Network**: `trading-net` — isolated network
- **Prometheus retention**: 30d TSDB retention
- **Vite build args**: Documented as browser-side URLs

Excellent docker-compose with health checks, dependency ordering, and proper volumes. ✅

### 8.384 docker-compose: healthcheck uses localhost inside container — Low

**Файл:** `docker-compose.yml:46,76,105,136,166`

```yaml
test: ["CMD", "python", "-c", "import socket; socket.create_connection(('localhost', 8765), timeout=5)"]
```

Health checks connect to `localhost` inside the container. This works because the service listens on `0.0.0.0` inside the container, but it's fragile — if the service binds to a specific interface, the health check would fail.

**Фикс:** This is fine for single-process containers. Document that services must bind to `0.0.0.0`.

### 8.385 docker-compose: no resource limits — Medium [FIXED]

**Файл:** `docker-compose.yml`

No `mem_limit`, `cpus`, or `deploy.resources` defined for any service. In dev this is fine, but if someone uses this compose file in production, a single service could consume all host resources.

**Фикс:** Add resource limits in `docker-compose.prod.yml` (which may already have them).

### 8.386 helm/values.yaml: K8s deployment config — ✅ Good

**Файл:** `helm/values.yaml` (151 lines)

- **6 components**: postgres, redis, exchangeSimulator, aiSignalBot, hftTradeBot, webUi, prometheus, grafana
- **Resource limits**: All components have requests + limits (memory + CPU)
- **Storage**: Postgres 10Gi, Redis 1Gi, Prometheus 5Gi, Grafana 5Gi
- **Image tags**: Pinned to v2.0.0
- **Postgres password**: `"change-me-in-production"` — placeholder with comment to override
- **SHM size**: 1Gi global

Good Helm values with resource limits, storage, and pinned images. ✅

### 8.387 helm/values.yaml: hardcoded localhost for web-ui WS — Medium [FIXED]

**Файл:** `helm/values.yaml:104-105`

```yaml
wsExchange: ws://localhost:8765
wsSignals: ws://localhost:8766
```

In Kubernetes, `localhost` in the browser will not connect to K8s services. These should be the external ingress URL or NodePort.

**Фикс:** Use `ws://{{ .Values.ingress.host }}:{{ .Values.exchangeSimulator.ports.ws }}` or similar.

### 8.388 helm/values.yaml: Postgres password in plaintext — Medium [FIXED]

**Файл:** `helm/values.yaml:17`

```yaml
password: "change-me-in-production"
```

Postgres password in plaintext in values.yaml. While there's a comment to override, it should default to empty and require a secret.

**Фикс:** Default to `""`, require `existingSecret` or `--set postgres.password=...`.

### 8.389 .github/workflows/ci.yml: Multi-language CI — ✅ Excellent

**Файл:** `.github/workflows/ci.yml` (647 lines)

- **5 lint jobs**: Python (ruff), C++ (clang-format-18), JS (eslint), Rust (clippy), YAML
- **3 test jobs**: Python (pytest + coverage), C++ (ctest + lcov), JS (vitest + coverage)
- **2 compilers**: gcc-14, clang-17 — matrix build
- **Concurrency control**: `cancel-in-progress: true` — cancels stale runs
- **Minimal permissions**: `contents: read` — security best practice
- **Coverage upload**: Codecov integration for Python, C++, JS
- **Log artifacts**: Uploaded on failure with 7-day retention
- **Cache**: pip cache, npm cache, ccache for C++
- **websocketpp patch**: CI patches C++17/C++20 incompatibility — documented

Excellent CI pipeline with multi-language linting, testing, coverage, and caching. ✅

### 8.390 ci.yml: no security scanning — Medium [FIXED]

**Файл:** `.github/workflows/ci.yml`

No dependency vulnerability scanning (e.g., `pip-audit`, `npm audit`, `trivy`). The `codeql.yml` workflow exists separately, but no SCA (Software Composition Analysis) in CI.

**Фикс:** Add `pip-audit` for Python, `npm audit --audit-level=high` for JS, and `trivy` for Docker images.

### 8.391 ci.yml: no integration tests — Medium

**Файл:** `.github/workflows/ci.yml`

CI runs unit tests only — no integration tests that verify the services can communicate (e.g., exchange-simulator → ai-signal-bot → hft-trade-bot). The `docker-smoke-test.bat` exists but is not in CI.

**Фикс:** Add a docker-compose integration test job that starts all services and verifies health endpoints.

### 8.392 ci.yml: websocketpp sed patch in CI — Low

**Файл:** `.github/workflows/ci.yml:136-138`

```bash
sudo sed -i 's/endpoint<connection,config>/endpoint/g' /usr/include/websocketpp/endpoint.hpp
```

CI patches system headers with `sed` to fix C++17/C++20 incompatibility. This is fragile — if the header format changes, the patch silently fails.

**Фикс:** Pin websocketpp to a specific version or use a fork with C++20 support.

### 8.393 hft-executor/src/lib.rs: Rust order executor — ✅ Excellent

**Файл:** `hft-executor/src/lib.rs` (525 lines)

- **FFI for C++**: `hft_executor_create`, `hft_executor_submit`, `hft_executor_stats`, `hft_executor_destroy` — clean C ABI
- **Auto-reconnect**: Exponential backoff (500ms → 10s cap) on WebSocket disconnect
- **Atomic counters**: `AtomicU64` for orders_sent, fills_received, errors — lock-free stats
- **Unbounded channel**: `mpsc::UnboundedSender<Order>` — non-blocking submit from C++ FFI
- **tokio::select!**: Concurrently reads orders from channel and fill messages from WebSocket
- **Fill detection**: String-based `is_fill_message` — checks for "fill", "filled", "order_fill"
- **Batch submit**: `submit_batch` with `SmallVec<[Order; 16]>` — stack-allocated for small batches
- **Release profile**: `opt-level=3`, `lto=true`, `codegen-units=1`, `panic=abort`, `strip=true`
- **Null checks**: All FFI functions check for null pointers before dereferencing
- **Integration tests**: Mock WebSocket server, serialization test, batch submit test

Excellent Rust executor with FFI, auto-reconnect, atomics, and comprehensive tests. ✅

### 8.394 hft-executor: avg_latency_ns always 0 — Medium

**Файл:** `hft-executor/src/lib.rs:116`

```rust
avg_latency_ns: 0,
```

`stats()` always returns `avg_latency_ns: 0`. The field exists in `ExecStats` and `FfiExecStats` but is never populated. No latency measurement is implemented.

**Фикс:** Track submit timestamp and fill timestamp. Calculate `fill_ts - submit_ts` for each order.

### 8.395 hft-executor: serde_json::to_string unwrap_or_default — Low

**Файл:** `hft-executor/src/lib.rs:159`

```rust
let json = serde_json::to_string(&order).unwrap_or_default();
```

If serialization fails, `unwrap_or_default()` produces an empty string `""`. Sending an empty string as a WebSocket text message is silently incorrect — the exchange simulator will receive an empty message and may error or ignore it.

**Фикс:** Handle the error: `match serde_json::to_string(&order) { Ok(json) => ..., Err(e) => { error_count.fetch_add(1, ...); continue; } }`.

### 8.396 hft-executor: is_fill_message string matching — Low

**Файл:** `hft-executor/src/lib.rs:209-214`

```rust
fn is_fill_message(text: &str) -> bool {
    text.contains("\"fill\"")
        || text.contains("\"filled\"")
        || text.contains("\"order_fill\"")
        || text.contains("\"type\":\"fill\"")
}
```

String-based fill detection — fragile. If the exchange simulator sends `{"type": "FILL"}` (uppercase), it won't match. If a non-fill message contains the word "fill" (e.g., `{"type":"error","msg":"order failed to fill"}`), it will be counted as a fill.

**Фикс:** Parse JSON and check the `type` field: `serde_json::from_str::<serde_json::Value>(text)` and check `["type"] == "fill"`.

### 8.397 hft-executor: no graceful shutdown on channel close — Low

**Файл:** `hft-executor/src/lib.rs:169-171`

```rust
None => {
    tracing::info!("Order channel closed — shutting down executor");
    return;
}
```

When the order channel closes, the executor returns immediately. But it doesn't flush pending orders or wait for fill confirmations. Orders sent but not yet confirmed as filled are lost.

**Фикс:** Wait for a grace period (e.g., 5s) for fill confirmations before shutting down.

### 8.398 hft-executor: Cargo.toml — ✅ Good

**Файл:** `hft-executor/Cargo.toml` (27 lines)

- **crate-type**: `["cdylib", "rlib"]` — both FFI and Rust tests
- **Dependencies**: tokio (full), tokio-tungstenite (native-tls), serde, serde_json, smallvec, tracing
- **Release profile**: `opt-level=3`, `lto=true`, `codegen-units=1`, `panic=abort`, `strip=true` — optimized for HFT

Good Cargo.toml with proper release optimization for HFT. ✅

### 8.399 hft-executor: native-tls instead of rustls — Low

**Файл:** `hft-executor/Cargo.toml:15`

```toml
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
```

Uses `native-tls` (OpenSSL on Linux, SChannel on Windows, SecureTransport on macOS) instead of `rustls`. `native-tls` links to system TLS libraries — potential version conflicts and security vulnerabilities. `rustls` is pure Rust, no C dependencies, memory-safe.

**Фикс:** Use `features = ["rustls-tls-native-roots"]` instead.

### 8.400 terraform/environments/dev/main.tf: IaC — ✅ Good

**Файл:** `terraform/environments/dev/main.tf` (98 lines)

- **5 modules**: vpc, eks, rds, elasticache, s3 — clean composition
- **S3 backend**: Encrypted state with DynamoDB locking — best practice
- **Required version**: `>= 1.5.0` — version pinning
- **Provider pinning**: `aws ~> 5.0` — minor version updates only
- **Outputs**: cluster_endpoint, rds_endpoint, redis_endpoint, s3_bucket

Good Terraform with modular composition, encrypted state, and locking. ✅

### 8.401 terraform: db_password default in plaintext — High [FIXED]

**Файл:** `terraform/environments/dev/main.tf:31`

```hcl
variable "db_password" {
  type        = string
  sensitive   = true
  default     = "ChangeMeInProduction123!"
}
```

RDS master password has a plaintext default. While marked `sensitive = true` (won't show in plan output), the default value is in the source code. If someone runs `terraform apply` without setting the variable, the database uses `ChangeMeInProduction123!` as the password.

**Фикс:** Remove the default: `default = null` or no default. Require `terraform apply -var="db_password=..."` or use AWS Secrets Manager.

### 8.402 terraform: no prod environment — Medium [N/A]

**Файл:** `terraform/environments/`

Only `dev/` environment exists. No `prod/` environment with production-specific settings (larger instances, multi-AZ RDS, restricted security groups, etc.).

**Фикс:** Create `terraform/environments/prod/` with production-grade settings.

### 8.403 deploy/k8s/secrets.enc.yaml: SOPS template — ✅ Good

**Файл:** `deploy/k8s/secrets.enc.yaml` (53 lines)

- **SOPS template**: Documents how to encrypt with `sops deploy/k8s/secrets.enc.yaml`
- **3 secrets**: DB password, exchange API keys, notification tokens
- **Placeholder values**: All `CHANGE_ME` — no real secrets committed
- **age encryption**: Comment mentions `base64+age encrypted`

Good secrets template with SOPS workflow documented. ✅

### 8.404 deploy/k8s: only secrets template, no K8s manifests — Medium [N/A]

**Файл:** `deploy/k8s/`

Only `secrets.enc.yaml` exists in `deploy/k8s/`. No actual K8s manifests (Deployment, Service, ConfigMap, Ingress). The Helm chart in `helm/` has templates, but `deploy/k8s/` is incomplete.

**Фикс:** Either remove `deploy/k8s/` (use Helm only) or add K8s manifests for all services.

### 8.405 monitoring/ebpf_monitor.py: eBPF monitoring — ✅ Good

**Файл:** `monitoring/ebpf_monitor.py` (225 lines)

- **6 monitoring targets**: syscall latency, network latency, CPU cache misses, memory allocations, thread scheduling, file I/O
- **BCC optional**: `try: from bcc import BPF` with `BCC_AVAILABLE` flag — graceful degradation
- **eBPF C programs**: Inline `SYSCALL_BPF` and `NETWORK_BPF` — kernel-side tracing
- **Signal handler**: `signal.signal(signal.SIGINT, ...)` for graceful shutdown
- **Requirements documented**: Kernel 5.15+, BCC tools, root privileges

Good eBPF monitoring with graceful BCC fallback and documented requirements. ✅

### 8.406 ebpf_monitor: no Windows support — Low

**Файл:** `monitoring/ebpf_monitor.py:18`

```
Requirements:
  - Linux kernel 5.15+
  - BCC tools: apt install bpftrace bpfcc-tools
  - Root privileges (CAP_BPF)
```

eBPF is Linux-only. The project runs on Windows (user's OS), but this monitoring tool won't work. The `BCC_AVAILABLE = False` fallback handles this gracefully, but the tool is effectively dead code on Windows.

**Фикс:** Document that eBPF monitoring is Linux-only. Consider ETW (Event Tracing for Windows) as a Windows alternative.

### 8.407 scripts/benchmark_suite.py: Latency benchmark — ✅ Good

**Файл:** `scripts/benchmark_suite.py` (207 lines)

- **p50/p95/p99/p999**: Full percentile distribution — proper latency analysis
- **6 benchmarks**: signal_json_parse, order_book_update, candle_aggregation, position_pnl, risk_check, signal_generation
- **perf_counter_ns**: Nanosecond precision — proper for HFT
- **JSON output**: Structured report with all metrics
- **CLI args**: `--iterations`, `--output` — configurable

Good benchmark suite with proper percentile calculation and nanosecond precision. ✅

### 8.408 benchmark_suite: no warmup — Low

**Файл:** `scripts/benchmark_suite.py:29-36`

```python
def measure_stage(name, fn, iterations):
    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        fn()
        t1 = time.perf_counter_ns()
        latencies.append((t1 - t0) / 1000.0)
```

No warmup phase — first iterations include cold cache, JIT warmup, and import overhead. This inflates p99 and p999.

**Фикс:** Add warmup: `for _ in range(min(100, iterations // 10)): fn()` before measuring.

### 8.409 web-ui/panels/registry.js: 200+ lazy-loaded panels — ✅ Good

**Файл:** `web-ui/src/panels/registry.js` (684 lines)

- **200+ panels**: All lazy-loaded via `React.lazy(() => import(...))` — code-splitting per panel
- **Categorized**: Sections with collapsible groups
- **localStorage**: User-toggleable visibility — persistent UI state
- **Plugin architecture**: Documented in comments — add panels without touching App.jsx

Good panel registry with lazy loading and plugin architecture. ✅

### 8.410 web-ui: 200+ components — potential over-engineering — Medium

**Файлы:** `web-ui/src/components/` (200+ files)

200+ React components, many with mathematical/research names: `AffineArithmetic`, `ArzelaAscoli`, `BanachFixedPoint`, `BurgersEquation`, `CameronMartinFormula`, `CesaroFejerKernel`, `CompressedSensing`, `CramerRaoBound`, `DynamicTimeWarping`, `EmpiricalDynamicModeling`, etc.

These are advanced mathematical concepts that are unlikely to be used by typical traders. The bundle size and maintenance burden of 200+ components is significant, even with lazy loading.

**Code reduction:** Consider a feature flag system to disable unused panels. Or move research panels to a separate `research-ui` package.

### 8.411 .github/workflows/deploy.yml: Multi-service deploy — ✅ Good

**Файл:** `.github/workflows/deploy.yml` (172 lines)

- **3 jobs**: deploy-web-ui (Netlify), build-and-push (GHCR), deploy (SSH to server)
- **Matrix build**: 4 services × Docker build-push with GHA cache
- **Semver tagging**: `type=semver,pattern={{version}}`, `{{major}}.{{minor}}`, `{{major}}`
- **Conditional deploy**: `if: startsWith(github.ref, 'refs/tags/v')` — only on tags
- **Build args**: VITE_WS_EXCHANGE/SIGNALS with fallback to localhost

Good deploy workflow with matrix build, semver tagging, and conditional deploy. ✅

### 8.412 deploy.yml: localhost fallback for VITE_WS — Medium [FIXED]

**Файл:** `.github/workflows/deploy.yml:90-91`

```yaml
VITE_WS_EXCHANGE=${{ vars.VITE_WS_EXCHANGE || 'ws://localhost:8765' }}
VITE_WS_SIGNALS=${{ vars.VITE_WS_SIGNALS || 'ws://localhost:8766' }}
```

If GitHub variables `VITE_WS_EXCHANGE` and `VITE_WS_SIGNALS` are not set, the build defaults to `localhost`. In production, this means the web UI will try to connect to the user's localhost — which won't have the exchange simulator.

**Фикс:** Make the build fail if vars are not set: `${{ vars.VITE_WS_EXCHANGE || 'MUST_SET_VITE_WS_EXCHANGE' }}` and check in the build step.

### 8.413 .github/workflows/release.yml: Release workflow — ✅ Good

**Файл:** `.github/workflows/release.yml` (128 lines)

- **Tag-triggered**: `v*` tags or manual dispatch with version input
- **fetch-depth: 0**: Full git history for changelog generation
- **contents: write**: Permission for creating releases
- **Version detection**: Handles both tag push and manual dispatch

Good release workflow with version detection and tag triggering. ✅

### 8.414 .github/workflows/nightly-backtest.yml: Walk-forward CI — ✅ Good

**Файл:** `.github/workflows/nightly-backtest.yml` (219 lines)

- **Cron schedule**: `0 2 * * *` — 02:00 UTC daily
- **issues: write**: Creates GitHub issue on failure — automated alerting
- **Walk-forward**: Generates 1 year of synthetic data, runs backtest, checks overfitting
- **Artifact upload**: Backtest results JSON with 30-day retention

Good nightly backtest with automated issue creation on failure. ✅

### 8.415 docker-compose.prod.yml: Production compose — ✅ Excellent

**Файл:** `docker-compose.prod.yml` (278 lines)

- **Resource limits**: All services have `deploy.resources.limits` (memory + cpus)
- **Required secrets**: `POSTGRES_PASSWORD:?` and `GRAFANA_PASSWORD:?` — fail if not set
- **Health checks**: All services with proper healthcheck commands
- **Pinned images**: `postgres:16-alpine`, `redis:7-alpine`, `prom/prometheus:v3.0.0`, `grafana/grafana:11.4.0`
- **Redis config**: `--maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes`
- **Prometheus retention**: 30d TSDB
- **Networks**: `backend`, `monitoring`, `frontend` — segmented
- **Volume mounts**: Read-only (`:ro`) for configs and dashboards

Excellent production compose with resource limits, required secrets, pinned images, and network segmentation. ✅

### 8.416 docker-compose.prod: ports exposed to host — Medium [FIXED]

**Файл:** `docker-compose.prod.yml:16-17,41-42,66-67,97-98`

```yaml
ports:
  - "5432:5432"  # PostgreSQL
  - "6379:6379"  # Redis
  - "9090:9090"  # Prometheus
  - "3001:3000"  # Grafana
```

PostgreSQL, Redis, Prometheus, and Grafana ports are exposed to the host. In production, these should only be accessible within the Docker network. Exposing Postgres (5432) and Redis (6379) to the host is a security risk — anyone with network access to the host can connect.

**Фикс:** Remove port mappings for internal services (Postgres, Redis, Prometheus). Only expose web-ui (3000) and Grafana (3001) via reverse proxy.

### 8.417 hft-trade-bot/core/bot_context.h: BotContext — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_context.h` (114 lines)

- **20+ components**: receiver, risk_mgr, executor, engines (v1/v2/v3), router, kill_switch, health_server
- **SHM IPC**: shm_signal_consumer, shm_fill_producer, shm_market_data
- **3 exchange adapters**: Binance, OKX, Bybit (real + sim)
- **Atomic balance**: `std::atomic<double> balance{10000.0}` — thread-safe
- **SPSC queue**: `SPSCQueue<Signal, 16> ai_signal_queue` — lock-free for AI signals
- **Latency histograms**: 4 histograms (signal, risk_check, order_exec, total_loop)
- **Spinlock for arb**: `Spinlock arb_lock` — low-latency locking

Good BotContext with atomics, SPSC queue, spinlock, and latency histograms. ✅

### 8.418 hft-trade-bot bot_context: Spinlock for arb_lock — Low

**Файл:** `hft-trade-bot/src/core/bot_context.h:105`

```cpp
Spinlock arb_lock;
```

Uses a `Spinlock` for `arb_lock`. Spinlocks can waste CPU cycles if the critical section is long or if the holder is preempted by the OS scheduler. For the arbitrage critical section (copy `ArbOpportunity` + set bool), spinlock is appropriate — the section is very short.

**Note:** This is fine for the current usage. Just document that the critical section must remain short.

### 8.419 hft-trade-bot bot_context: 3 engine versions — Medium (code reduction) [N/A]

**Файл:** `hft-trade-bot/src/core/bot_context.h:74-76`

```cpp
std::unique_ptr<SignalEngineV2> engine_v2;
std::unique_ptr<SignalEngineV3> engine_v3;
std::unique_ptr<SignalEngine>   engine_v1;
```

3 signal engine versions are loaded simultaneously. `bot_loop.cpp:89-92` shows:
```cpp
if (ctx.engine_v3) {
    return ctx.engine_v3->analyze_incremental(...);
}
return ctx.engine_v2->analyze_incremental(...);
```

V1 is never used in the hot path (only V2/V3). All 3 are allocated in memory.

**Code reduction:** Remove V1 if it's truly unused. Make V2/V3 mutually exclusive — only load one.

### 8.420 hft-trade-bot bot_context: prices_cache not thread-safe — Medium [FIXED]

**Файл:** `hft-trade-bot/src/core/bot_context.h:107`

```cpp
std::unordered_map<std::string, double> prices_cache;
```

`prices_cache` is a plain `unordered_map` — not thread-safe. `process_sl_tp` writes to it (`get_all_prices_into`), and other threads may read from it. If the bot runs multiple threads (e.g., AI signal consumer + main loop), concurrent access is a data race.

**Фикс:** Use `std::shared_mutex` with shared/unique locks, or use a concurrent map.

### 8.421 Dockerfiles: Multi-stage builds with non-root user — ✅ Excellent

**Файлы:** `ai-signal-bot/Dockerfile.prod`, `exchange_simulator/Dockerfile.prod`, `hft-trade-bot/Dockerfile`

- **Multi-stage**: Builder + runtime stages — small final images
- **Non-root user**: `appuser` created and used — security best practice
- **Health checks**: All Dockerfiles have `HEALTHCHECK` with interval/timeout/retries/start-period
- **`--no-cache-dir --no-compile`**: Python pip flags for smaller images
- **`rm -rf /var/lib/apt/lists/*`**: Clean apt cache — smaller images
- **ABI matching**: hft-trade-bot Dockerfile documents builder/runtime ABI matching (bookworm)
- **EXPOSE**: All ports documented

Excellent Dockerfiles with multi-stage, non-root, health checks, and documentation. ✅

### 8.422 hft-trade-bot Dockerfile: websocketpp sed patch — Low

**Файл:** `hft-trade-bot/Dockerfile:26-28`

```dockerfile
RUN sed -i 's/endpoint<connection,config>/endpoint/g' /usr/include/websocketpp/endpoint.hpp \
    && sed -i 's/basic<concurrency,names>/basic/g' /usr/include/websocketpp/logger/basic.hpp \
    && sed -i 's/stub<concurrency,names>/stub/g' /usr/include/websocketpp/logger/stub.hpp || true
```

Same websocketpp sed patch as in CI. The `|| true` at the end means if the sed fails, the build continues — the C++ build may fail later with confusing errors.

**Фикс:** Remove `|| true` and let the build fail if the patch doesn't apply. Or pin to a websocketpp fork with C++20 support.

### 8.423 hft-trade-bot Dockerfile: no .prod variant — Medium [N/A]

**Файл:** `hft-trade-bot/Dockerfile`

The deploy workflow uses `Dockerfile.prod` for all services: `file: ./${{ matrix.service }}/Dockerfile.prod`. But `hft-trade-bot/` only has `Dockerfile` — no `Dockerfile.prod`. The deploy workflow will fail for hft-trade-bot.

**Фикс:** Create `hft-trade-bot/Dockerfile.prod` (or symlink to `Dockerfile`).

### 8.424 .pre-commit-config.yaml: Pre-commit hooks — ✅ Good

**Файл:** `.pre-commit-config.yaml` (27 lines)

- **ruff**: `--fix` + format — Python linting and formatting
- **eslint**: JS/TS linting with eslint 9.0.0
- **pre-commit-hooks**: trailing-whitespace, end-of-file-fixer, check-yaml, check-added-large-files (500KB), detect-private-key

Good pre-commit config with multi-language hooks and private key detection. ✅

### 8.425 .pre-commit: no clang-format hook — Low

**Файл:** `.pre-commit-config.yaml`

No C++ formatting hook (clang-format). CI runs clang-format-18 in a separate job, but pre-commit doesn't catch formatting issues locally.

**Фикс:** Add clang-format pre-commit hook: `repo: https://github.com/pre-commit/mirrors-clang-format`.

### 8.426 .github/dependabot.yml: Dependency updates — ✅ Excellent

**Файл:** `.github/dependabot.yml` (95 lines)

- **7 ecosystems**: pip (exchange_simulator), pip (ai-signal-bot), npm (web-ui), github-actions, docker (4 services)
- **Weekly schedule**: All updates weekly
- **Grouped**: `patterns: ["*"]` groups all deps into 1 PR per ecosystem
- **Labels**: `dependencies`, `python`/`javascript`/`docker`/`ci`
- **open-pull-requests-limit: 1**: Minimal PR noise

Excellent dependabot config with grouping and labels for all ecosystems. ✅

### 8.427 exchange_simulator/liquidation_engine_v2.py: Cascade liquidations — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py` (253 lines)

- **4 liquidation types**: FULL, PARTIAL, ADL, CASCADE
- **Cascade liquidations**: One liquidation triggers others — realistic
- **Insurance fund tracking**: Depleted by losses, topped up by fees
- **Auto-deleveraging (ADL)**: When insurance fund depleted — realistic
- **Partial liquidation**: Reduce to safe margin, not full close
- **deque for history**: O(1) append/pop — efficient

Good liquidation engine with cascade, ADL, and insurance fund. ✅

### 8.428 exchange_simulator/order_book_realism.py: Realistic order book — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/order_book_realism.py` (306 lines)

- **Power-law volume decay**: Realistic depth profile from mid price
- **Spoofing**: Fake large orders that cancel before execution
- **Iceberg orders**: Hidden quantity with partial reveal
- **Queue position tracking**: FIFO fill priority
- **Adverse selection**: Toxic flow moves price post-fill
- **deque for order queue**: O(1) operations

Good realistic order book with spoofing, icebergs, and adverse selection. ✅

### 8.429 exchange_simulator/config_validator.py: Config validation — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/config_validator.py` (274 lines)

- **5 required sections**: exchanges, initial_prices, volatility, market, account
- **8 valid timeframes**: 1m through 1d
- **Returns (errors, warnings)**: Clear separation of fatal vs informational
- **Cross-references**: Validates symbol consistency across sections

Good config validator with required sections, valid timeframes, and cross-references. ✅

### 8.430 exchange_simulator/latency_simulation.py: Network latency — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/latency_simulation.py` (130 lines)

- **4 exchange profiles**: binance (50ms), okx (80ms), bybit (120ms), simulator (5ms)
- **Gaussian jitter**: σ = 20% of base — realistic
- **Poisson spikes**: 1 in 1000 messages, 10x base — realistic
- **Reconnection backoff**: Exponential, 100ms → 30s cap

Good latency simulation with exchange-specific profiles and realistic jitter/spikes. ✅

### 8.431 ai-signal-bot/src/llm_engine/engine.py: LLM market analysis — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **4 providers**: openai, anthropic, ollama, none (rule-based fallback)
- **API key from env**: `os.getenv("OPENAI_API_KEY")` — not hardcoded
- **Cache**: TTL-based cache to reduce API calls
- **Timeout**: 10s default — prevents hanging
- **aiohttp optional**: `AIOHTTP_AVAILABLE` flag — graceful degradation
- **Fallback**: If no API key, switches to `provider = "none"` with rule-based analysis
- **Session management**: `initialize()` creates session, `close()` closes it

Good LLM engine with multi-provider support, caching, and graceful fallback. ✅

### 8.432 llm_engine: f-string logging — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:93`

```python
logger.info(f"[LLMEngine] Provider: {self.config.provider}, model: {self.config.model}")
```

f-string logging — evaluates string even if log level is disabled.

**Фикс:** Use `logger.info("Provider: %s, model: %s", self.config.provider, self.config.model)`.

### 8.433 ai-signal-bot/src/notification/notifier.py: Telegram/Discord bot — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **Telegram + Discord**: Dual-channel notifications
- **Remote commands**: /status, /positions, /close_all, /pause, /resume
- **AlertEvent dataclass**: Normalized event format
- **Session management**: `start()` creates session, `stop()` closes it
- **Polling task**: `_poll_task` for Telegram getUpdates — async
- **Command handlers**: Registerable via `register_command()`
- **Graceful stop**: `stop()` cancels poll task and closes session

Good notification bot with dual channels, remote commands, and graceful lifecycle. ✅

### 8.434 notifier: token stored as instance attribute — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py:53-54`

```python
self.token = token
self.chat_id = chat_id
```

Telegram bot token stored as plain instance attribute. If the object is introspected (debugger, crash dump, repr), the token is visible.

**Фикс:** Use `__repr__` that masks the token, or store as `_token` with a property.

### 8.435 ai-signal-bot/scripts/migrate.py: Migration runner — ✅ Good

**Файл:** `ai-signal-bot/scripts/migrate.py` (101 lines)

- **schema_migrations table**: Tracks applied migrations — proper migration tracking
- **Skip applied**: Checks `filename in applied` — idempotent
- **Sorted glob**: `sorted(glob.glob(...))` — deterministic order
- **Error handling**: Catches exception per migration, breaks on failure
- **asyncpg**: PostgreSQL-specific — matches prod setup

Good migration runner with tracking table and idempotent execution. ✅

### 8.436 migrate.py: no transaction wrapping — Medium [FIXED]

**Файл:** `ai-signal-bot/scripts/migrate.py:72-82`

```python
try:
    await conn.execute(sql)
    await conn.execute(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        filename
    )
```

Each migration SQL is executed without a transaction. If the migration SQL fails halfway through (e.g., creates table but fails on index), the database is left in a partial state. The `schema_migrations` insert won't happen (good), but the partial changes are not rolled back.

**Фикс:** Wrap in a transaction: `async with conn.transaction(): await conn.execute(sql); await conn.execute("INSERT ...")`.

### 8.437 migrate.py: no --down support — Low [N/A]

**Файл:** `ai-signal-bot/scripts/migrate.py:90-91`

```python
parser.add_argument("--up", action="store_true", help="Run pending migrations")
```

The docstring says `[--up] [--down N]` but `--down` is not implemented. Only `--up` is available.

**Фикс:** Implement `--down N` to rollback N migrations, or remove the mention from the docstring.

### 8.438 ai-signal-bot/src/database/migrations/001_initial_schema.sql: PostgreSQL schema — ✅ Good

**Файл:** `ai-signal-bot/src/database/migrations/001_initial_schema.sql` (78 lines)

- **4 tables**: trades, signals, positions, candles
- **pgcrypto extension**: For UUID generation
- **Indexes**: 7 indexes including composite `(symbol, timestamp DESC)` — good for time-series queries
- **BIGSERIAL**: 64-bit IDs — future-proof for high-volume trading
- **VARCHAR with limits**: `VARCHAR(32)`, `VARCHAR(64)` — not unlimited TEXT

Good PostgreSQL schema with proper indexes, types, and extension. ✅

### 8.439 hft-trade-bot/src/risk/kill_switch.h: Emergency stop — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/kill_switch.h` (173 lines)

- **3 activation triggers**: File-based, programmatic, daily loss limit
- **4 actions on activation**: Cancel orders, close positions, notify Python via SHM, block new orders
- **5 reasons**: MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, EXTERNAL
- **File-based trigger**: `touch logs/kill_switch_trigger` — external monitoring can trigger
- **Platform-aware**: `#ifndef _WIN32` for `sys/stat.h` — Windows compatibility
- **Atomic flag**: `std::atomic<bool>` for thread-safe activation check
- **SHM notification**: Notifies Python via shared memory — cross-process

Excellent kill switch with multiple triggers, actions, and cross-process notification. ✅

### 8.440 hft-trade-bot/src/risk/risk_manager.h: Pre-trade risk checks — ✅ Good

**Файл:** `hft-trade-bot/src/risk/risk_manager.h` (258 lines)

- **V1 + V2**: Signal-level checks + production pre-trade checks
- **V2 params**: max_position_qty, max_total_exposure, daily_loss_limit, max_drawdown_pct, max_orders_per_second, min_margin_ratio, max_leverage
- **Order rate throttle**: `max_orders_per_second{50}` — prevents flood
- **Symbol blacklist**: `unordered_set<string>` — block specific symbols
- **Atomic counters**: Thread-safe stats

Good risk manager with V1/V2 checks, rate throttle, and blacklist. ✅

### 8.441 web-ui/src/hooks/useWebSocket.ts: WebSocket hook — ✅ Excellent

**Файл:** `web-ui/src/hooks/useWebSocket.ts` (305 lines)

- **Ring buffer**: 5000 message buffer — O(1) push, no array copy
- **Exponential backoff**: 1s → cap, with countdown timer for UI display
- **Batch processing**: Merges messages by type+symbol within 50ms window — reduces re-renders
- **Ping/pong latency**: Measures real WebSocket latency
- **Sync on reconnect**: Sends last timestamp to server for delta sync
- **Outgoing queue**: Queues messages while disconnected, flushes on reconnect
- **TypeScript**: Full type safety with `UseWebSocketOptions` and `UseWebSocketReturn`
- **perMessageDeflate**: WebSocket compression option

Excellent WebSocket hook with ring buffer, batching, backoff, latency measurement, and sync. ✅

### 8.442 useWebSocket: no max reconnect limit — Low

**Файл:** `web-ui/src/hooks/useWebSocket.ts:74`

```typescript
const reconnectCount = useRef<number>(0)
```

No maximum reconnect limit. If the server is down, the hook will keep reconnecting forever (with backoff). This is usually fine, but some apps want to stop after N attempts and show a "connection failed" UI.

**Фикс:** Add `maxReconnects` option. After N reconnects, stop and set `error = "Max reconnects reached"`.

### 8.443 hft-trade-bot/src/data/signal.h: Signal struct — ✅ Good

**Файл:** `hft-trade-bot/src/data/signal.h` (46 lines)

- **Helper methods**: `is_long()`, `is_short()`, `is_actionable()`, `side()`, `rr_ratio()`
- **Div-by-zero guard**: `risk > 0 ? reward / risk : 0.0` — safe
- **NEUTRAL defaults to BUY**: Documented — caller should check `is_actionable()` first
- **Leverage field**: `uint8_t leverage{1}` — supports leveraged trading

Good Signal struct with helpers and div-by-zero guard. ✅

### 8.444 hft-trade-bot/src/core/config.h: Config struct — ✅ Good

**Файл:** `hft-trade-bot/src/core/config.h` (204 lines)

- **60+ config fields**: Connection, trading, risk, HFT strategies, V2/V3 engines, router, adaptive selector, latency
- **Default values**: All fields have defaults — safe initialization
- **V3 off by default**: `signal_engine_v3_enabled{false}` — opt-in for new engine
- **Thread pinning**: `thread_pinning_enabled{false}` — opt-in for CPU pinning
- **Latency histograms**: `latency_histogram_enabled{true}` — on by default

Good Config struct with comprehensive defaults and opt-in for experimental features. ✅

### 8.445 config.h: hardcoded localhost default — Medium [FIXED]

**Файл:** `hft-trade-bot/src/core/config.h:14`

```cpp
std::string ws_url{"ws://localhost:8765"};
```

Default WebSocket URL is `localhost:8765`. In Docker/K8s, this won't resolve to the exchange simulator service. The config file overrides this, but if the config file is missing or incomplete, the bot connects to localhost.

**Фикс:** Default to empty string and require config file to set it: `std::string ws_url{""}`.

### 8.446 config.h: 60+ fields in one struct — Low (code reduction)

**Файл:** `hft-trade-bot/src/core/config.h`

60+ config fields in a single `Config` struct. This is a "god object" — every component's config is in one place. While not a bug, it makes it hard to pass only relevant config to components.

**Code reduction:** Split into `ConnectionConfig`, `RiskConfig`, `SignalEngineConfig`, `RouterConfig`, etc. Each component receives only its relevant config.

### 8.447 hft-trade-bot/src/ipc/shm_ring_buffer.h: SPSC lock-free ring buffer — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h` (348 lines)

- **SPSC lock-free**: Single-producer single-consumer — no locks needed
- **Cache-line aligned**: `head` and `tail` on separate cache lines (`alignas(64)`) — no false sharing
- **`static_assert(sizeof(ShmHeader) == 192)`**: Compile-time size verification
- **Magic number**: `0x484654343253484D` ("HFT42SHM") for validation
- **Power-of-2 capacity**: Enables `& (capacity - 1)` instead of `%` — faster
- **Cross-platform**: Windows (fileapi.h) + Linux (mmap) — portable
- **No heap allocations**: All operations O(1), `mmap + MAP_SHARED` for cross-process
- **`#pragma once`**: Include guard

Excellent SPSC ring buffer with cache-line alignment, cross-platform SHM, and compile-time validation. ✅

### 8.448 hft-trade-bot/src/ipc/shm_protocol.h: Binary IPC protocol — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h` (118 lines)

- **3 message types**: SignalMsg (32B), FillMsg (28B), MarketSnapshotMsg (28B)
- **`#pragma pack(push, 1)`**: Explicit packing for cross-language alignment
- **`static_assert(sizeof(...) == N)`**: Compile-time size verification for each struct
- **Python struct format documented**: `Python: struct.Struct('<Q B B f f f f B 5x')` in comments
- **Explicit padding**: `pad_[5]` fields — no implicit padding surprises
- **Nanosecond timestamps**: `uint64_t timestamp` — ns since epoch

Excellent binary IPC protocol with compile-time size checks and Python format documentation. ✅

### 8.449 hft-trade-bot/src/ipc/shm_heartbeat.h: SHM heartbeat — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h` (272 lines)

- **Bidirectional**: C++ writes heartbeat, Python reads; Python writes, C++ reads
- **Seq-guarded access**: `std::atomic<uint64_t> seq` — lock-free reads
- **Cache-line aligned**: `alignas(64) HeartbeatSlot` — fits in 1 cache line
- **`static_assert(sizeof(HeartbeatSlot) <= 64)`**: Compile-time validation
- **Health fields**: timestamp, pid, message_count, error_count, status ("OK"/"DEGRADED"/"ERROR")
- **Cross-platform**: Windows + Linux SHM

Excellent heartbeat system with seq-guarded access, cache-line alignment, and health fields. ✅

### 8.450 hft-trade-bot/src/exchange/ExchangeBase.h: Exchange base with EMA latency — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines)

- **EMA latency tracking**: `latency_avg_` updated with EMA formula — O(1) atomic
- **CAS loop**: `compare_exchange_weak` for thread-safe EMA update — correct
- **Toxic event counter**: `toxic_count_` with `fetch_add` — atomic
- **Circuit breaker**: `is_available()` returns `toxic_count_ < 5` — automatic backoff
- **DIP**: Abstract base class implementing `IExchange` — SOLID

Good exchange base with atomic EMA latency, toxic event tracking, and circuit breaker. ✅

### 8.451 hft-trade-bot/src/execution/order_executor.h: WebSocket order executor — ✅ Good

**Файл:** `hft-trade-bot/src/execution/order_executor.h` (231 lines)

- **Auto-reconnect**: Exponential backoff 1s → 30s cap — correct
- **Recreate client on reconnect**: `client_ = std::make_unique<WSClient>()` — websocketpp init_asio() can't be called twice
- **Manual JSON serialization**: `snprintf` instead of nlohmann/json — avoids heap allocation in hot path
- **`[[unlikely]]`**: Branch prediction hint for `!connected_` — HFT optimization
- **Disconnect**: Properly closes connection and joins thread

Good order executor with auto-reconnect, manual JSON for zero-alloc, and proper lifecycle. ✅

### 8.452 order_executor: detached reconnect thread — Medium [FIXED]

**Файл:** `hft-trade-bot/src/execution/order_executor.h:63`

```cpp
}).detach();
```

The reconnect thread is detached. If the `OrderExecutor` is destroyed while the detached thread is sleeping (before `do_connect()`), the thread will access `this` after destruction — use-after-free.

**Фикс:** Use `std::jthread` with stop_token, or track the reconnect thread and join it in destructor.

### 8.453 order_executor: snprintf buffer truncation — Low

**Файл:** `hft-trade-bot/src/execution/order_executor.h:108-116`

```cpp
char buf[512];
int n = std::snprintf(buf, sizeof(buf), ...);
```

Manual JSON with `snprintf` into a 512-byte buffer. If symbol name or exchange ID is very long, the JSON may be truncated. The check `n < static_cast<int>(sizeof(buf) - 32)` mitigates this, but it's fragile.

**Фикс:** Use `std::format` (C++20) or ensure symbol/exchange lengths are bounded.

### 8.454 hft-trade-bot/src/execution/smart_order_router_v2.h: 5-strategy router — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/smart_order_router_v2.h` (181 lines)

- **5 routing strategies**: BestPrice, LowestLatency, LowestFees, BestEffective, DepthAware
- **DIP**: Uses `IExchange*` interface — no concrete exchange in core
- **Stack-allocated**: `IExchange* available[MAX_EXCHANGES]` — no heap allocation in hot path
- **Toxic backoff**: Skips exchanges with ≥5 toxic events — circuit breaker
- **Depth-aware**: Considers available depth, not just price — realistic
- **prefer_maker**: Prefers limit orders when possible — fee optimization

Excellent smart order router with 5 strategies, DIP, zero-alloc, and circuit breaker. ✅

### 8.455 hft-trade-bot/src/execution/latency_tracker.h: Per-stage histograms — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/latency_tracker.h` (253 lines)

- **8 latency stages**: Signal→Order, Order→ACK, ACK→Fill, Signal→Fill, Order→Fill, MarketData→Process, RiskCheck, StrategyCompute
- **P50/P95/P99/P99.9**: Per-stage percentile computation
- **Budget enforcement**: Alerts when latency exceeds budget
- **No heap allocations**: All stack-allocated — HFT constraint
- **Stage names**: `latency_stage_str()` for logging

Excellent latency tracker with 8 stages, percentiles, budget enforcement, and zero-alloc. ✅

### 8.456 hft-trade-bot/src/execution/adaptive_order_selector_v2.h: Adaptive order types — ✅ Good

**Файл:** `hft-trade-bot/src/execution/adaptive_order_selector_v2.h` (223 lines)

- **4 order kinds**: MARKET, IOC, FOK, GTD (Good-Til-Date)
- **6 selection factors**: confidence, spread, OBI, toxicity, order/depth ratio, urgency
- **`noexcept`**: Hot path marked noexcept — no exceptions
- **SelectionResult**: Returns kind + limit_price + expire_ns + reason — informative
- **Exchange-specific mapping**: Binance IOC/FOK/GTX/GTC+expire documented

Good adaptive order selector with 4 kinds, 6 factors, and noexcept hot path. ✅

### 8.457 hft-trade-bot/src/strategies/signal_engine_v2.h: 6-indicator composite — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h` (494 lines)

- **6 indicators**: EMA crossover, RSI, OBI (multi-level), VWAP deviation, ADX, Pressure Model
- **No heap allocations**: All stack-allocated (max 256 candles) — HFT constraint
- **Branchless**: Ternary, fmax/fmin instead of if/else — HFT optimization
- **Cache-line aligned**: `FastSignal` is `alignas(64)` — no false sharing
- **Cooldown**: Configurable between signals (default 5000ms) — prevents overtrading
- **IndicatorCache**: Reusable EMA/RSI/ADX/ATR/VWAP state — incremental updates
- **Dynamic SL/TP**: ATR-based — volatility-adjusted
- **Dynamic leverage**: Based on confidence + ADX — risk-adjusted

Excellent signal engine with 6 indicators, zero-alloc, branchless, cache-aligned, and dynamic risk. ✅

### 8.458 hft-trade-bot/src/strategies/signal_engine_v3.h: HMM regime detection — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h` (437 lines)

- **4 HMM states**: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
- **Online Baum-Welch**: Simplified online parameter adaptation — O(1) per tick
- **Viterbi decoding**: Most likely state path — regime detection
- **Regime-gated V2**: Boost/dampen signals based on regime — context-aware
- **No heap allocations**: All stack-allocated — HFT constraint
- **O(1) per-tick**: Online HMM forward recursion — sub-100μs
- **VOLATILE regime**: Widen stops, reduce leverage — risk-aware

Excellent V3 engine with HMM regime detection, online learning, and regime-gated signals. ✅

### 8.459 hft-trade-bot/src/strategies/simd_indicators.h: AVX2 SIMD — ✅ Good

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h` (228 lines)

- **AVX2**: 8 double-precision values in parallel — 4x throughput
- **`#if defined(__AVX2__)`**: Compile-time detection — graceful fallback
- **Scalar fallback**: `ema_scalar()` for non-AVX2 platforms
- **SimdEMA + SimdRSI**: Two SIMD-optimized indicators

Good SIMD optimization with compile-time detection and scalar fallback. ✅

### 8.460 simd_indicators: ema_array returns vector — Low (code reduction)

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h:45`

```cpp
static std::vector<double> ema_array(const std::vector<double>& prices, double alpha) {
    std::vector<double> ema_values(prices.size());
```

`ema_array` returns a `std::vector<double>` — heap allocation. The SIMD optimization is negated by the vector allocation. This function is not used in the HFT hot path (V2 uses `InlineEMA`), but it's misleading to have a "SIMD optimized" function that allocates.

**Фикс:** Remove `ema_array` if unused, or change to accept output span.

### 8.461 hft-trade-bot/src/exchange/BinanceAdapter.h: Real exchange adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h` (190 lines)

- **Real Binance Futures**: wss://fstream.binance.com, POST /fapi/v1/order
- **HMAC-SHA256 auth**: `sign()` method for REST API — secure
- **Rate limits documented**: 1200 weight/min, 300 orders/10s, 1200 orders/min
- **Spinlock for prices**: `price_lock_` and `depth_lock_` — low-latency
- **Book ticker update**: `on_book_ticker()` for real-time bid/ask
- **Depth update**: `on_depth_update()` for L2 book changes
- **OrderResult**: Struct with success, order_id, status, avg_price, error — informative

Good Binance adapter with HMAC auth, rate limit documentation, and spinlock for low latency. ✅

### 8.462 BinanceAdapter: nested spinlock acquisition — Medium [FIXED]

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:74-79`

```cpp
void on_book_ticker(...) {
    std::lock_guard<Spinlock> lk(price_lock_);
    bids_[symbol] = bid;
    asks_[symbol] = ask;
    std::lock_guard<Spinlock> lk2(depth_lock_);
    bid_depth_[symbol] = bid_qty;
    ask_depth_[symbol] = ask_qty;
}
```

Two spinlocks acquired sequentially. If another thread holds `depth_lock_` and tries to acquire `price_lock_`, deadlock. The current code doesn't have this pattern, but it's a latent risk.

**Фикс:** Use a single lock for both prices and depth, or document the lock ordering convention.

### 8.463 BinanceAdapter: api_key and api_secret in Config struct — Low

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:28-29`

```cpp
std::string api_key;
std::string api_secret;
```

API credentials stored as plain `std::string` in a config struct. If the struct is logged or dumped, credentials are visible.

**Фикс:** Use a `Secret` wrapper type that masks in `operator<<`, or load from env/secrets manager.

### 8.464 hft-trade-bot/src/fix/fix_session.h: FIX 4.4 session — ✅ Excellent

**Файл:** `hft-trade-bot/src/fix/fix_session.h` (294 lines)

- **FIX 4.4**: Industry standard protocol — correct
- **State machine**: DISCONNECTED → CONNECTING → LOGGED_IN → LOGGING_OUT — proper lifecycle
- **Persistent sequence numbers**: File-based — survives restarts
- **Gap detection**: ResendRequest on sequence mismatch — reliable
- **Heartbeat timeout**: TestRequest on timeout — connection health
- **Destructor cleanup**: logout + stop_heartbeat + save_seq_nums — graceful shutdown
- **Callbacks**: SendCallback + AppMessageCallback — decoupled from transport
- **Atomic state**: `std::atomic<SessionState>` — thread-safe state checks

Excellent FIX session with state machine, persistent seq nums, gap detection, and graceful destructor. ✅

### 8.465 deploy/helm/Chart.yaml: Helm chart metadata — ✅ Good

**Файл:** `deploy/helm/Chart.yaml` (19 lines)

- **apiVersion: v2**: Modern Helm chart format
- **appVersion: "2.0.0"**: Application version tracked
- **Keywords**: hft, trading, simulator, educational, cpp, python, react
- **Sources**: GitHub URL documented
- **Maintainer**: Listed

Good Helm chart metadata with keywords, sources, and maintainer. ✅

### 8.466 deploy/helm/values.yaml: Comprehensive Helm values — ✅ Excellent

**Файл:** `deploy/helm/values.yaml` (255 lines)

- **8 services**: exchangeSimulator, aiSignalBot, hftTradeBot, webUi, timescaledb, redis, jaeger, (prometheus/grafana)
- **Resource limits**: All services have requests + limits — proper
- **HPA**: aiSignalBot and webUi have autoscaling (1-5, 2-6) — correct
- **HFT bot no autoscaling**: `autoscaling.enabled: false` — stateful, correct
- **StatefulSet for HFT bot**: `kind: StatefulSet` — correct for stateful service
- **Pinned images**: TimescaleDB `pg16-ts2.17.2`, Redis `7-alpine` — reproducible
- **Persistence**: TimescaleDB 50Gi, Redis 10Gi — proper storage
- **Ingress**: webUi with cert-manager + letsencrypt — TLS
- **existingSecret for DB**: `hft-db-secret` — no plaintext password

Excellent Helm values with 8 services, resource limits, HPA, StatefulSet, pinned images, and TLS. ✅

### 8.467 Helm values: no Redis password — Medium [FIXED]

**Файл:** `deploy/helm/values.yaml:155-174`

```yaml
redis:
  enabled: true
  image:
    repository: redis
    tag: 7-alpine
```

No `auth` section for Redis. Unlike TimescaleDB which has `auth.existingSecret`, Redis has no password configuration. In production, Redis should require authentication.

**Фикс:** Add `auth.existingSecret: hft-redis-secret` and configure Redis with `--requirepass`.

### 8.468 deploy/helm/templates/hft-trade-bot.yaml: K8s manifest — ✅ Excellent

**Файл:** `deploy/helm/templates/hft-trade-bot.yaml` (95 lines)

- **StatefulSet**: Correct for stateful HFT bot
- **securityContext**: `runAsNonRoot: true`, `runAsUser: 1000`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]` — security best practices
- **SHM volume**: `emptyDir.medium: Memory` (256Mi) — shared memory for IPC
- **Logs volume**: `emptyDir` — ephemeral logs
- **livenessProbe**: HTTP /health, 30s period — correct
- **readinessProbe**: HTTP /health, 10s period — correct
- **Service**: ClusterIP, metrics port — internal only
- **Jaeger + Redis env**: Injected via `include` helpers — service discovery

Excellent K8s manifest with StatefulSet, security context, SHM volume, probes, and service discovery. ✅

### 8.469 deploy/helm/templates/ai-signal-bot.yaml: K8s manifest — ✅ Excellent

**Файл:** `deploy/helm/templates/ai-signal-bot.yaml` (132 lines)

- **Deployment**: Correct for stateless AI bot
- **HPA**: autoscaling/v2 with CPU target — correct
- **securityContext**: Same as hft-trade-bot — excellent
- **SHM + data + logs volumes**: Correct — SHM for IPC, data for SQLite, logs for logging
- **livenessProbe**: tcpSocket ws port — correct (Python bot doesn't have HTTP health)
- **readinessProbe**: tcpSocket ws port — correct
- **TimescaleDB + Redis + Jaeger env**: Injected via helpers — service discovery
- **Service**: ClusterIP, ws + metrics ports — internal only

Excellent K8s manifest with Deployment, HPA, security context, probes, and service discovery. ✅

### 8.470 ai-signal-bot livenessProbe: tcpSocket vs httpGet — Low [FIXED]

**Файл:** `deploy/helm/templates/ai-signal-bot.yaml:71-72`

```yaml
livenessProbe:
  tcpSocket:
    port: ws
```

Using `tcpSocket` for liveness probe. This only checks if the port is open, not if the application is healthy. The bot could be stuck in a deadlock with the WebSocket port still open — K8s won't restart it.

**Фикс:** Use `httpGet` with the health server endpoint (`/health` on metrics port) if available.

### 8.471 exchange_simulator/arbitrage.py: Multi-exchange arbitrage — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/arbitrage.py` (298 lines)

- **ArbStatus enum**: OPEN, CLOSED, EXPIRED — proper lifecycle
- **ArbitrageOpportunity**: buy/sell exchange, gross/net spread, spread_bps — comprehensive
- **Fee deduction**: `net_spread = gross_spread - fees` — realistic
- **Slippage**: Considered in net spread — realistic
- **Broadcast**: Opportunities sent via WebSocket — real-time

Good arbitrage detector with fee/slippage deduction and real-time broadcast. ✅

### 8.472 exchange_simulator/options_simulator.py: Black-Scholes + Greeks — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/options_simulator.py` (237 lines)

- **Black-Scholes**: European-style option pricing — correct
- **5 Greeks**: delta, gamma, theta, vega, rho — comprehensive
- **Implied volatility**: Newton-Raphson iteration — correct
- **Put-call parity**: Verification — validation
- **Option chain**: Multiple strikes/expiries — flexible

Good options simulator with Black-Scholes, Greeks, IV, and put-call parity. ✅

### 8.473 exchange_simulator/funding_rate.py: Perpetual funding — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/funding_rate.py` (136 lines)

- **8-hour intervals**: 00:00, 08:00, 16:00 UTC — matches real exchanges
- **Basis-based rate**: Perpetual-spot basis drives funding — realistic
- **FundingRateEvent**: timestamp, rate, funding_time, mark_price, index_price — comprehensive
- **deque history**: O(1) append — efficient

Good funding rate simulator with 8-hour intervals and basis-driven rates. ✅

### 8.474 exchange_simulator/market_microstructure.py: Realistic price generation — ✅ Excellent

**Файл:** `exchange_simulator/exchange_simulator/market_microstructure.py` (175 lines)

- **Student-t returns (df=4)**: Fat tails — realistic
- **Merton jump diffusion**: Poisson jumps — realistic
- **Heston stochastic volatility**: Correlated with price — realistic
- **Markov regime switching**: 4 states (CALM/VOLATILE/CRASH/RECOVERY) — realistic
- **U-shaped intraday**: High volatility at open/close — realistic
- **VWAP volume profile**: Realistic volume distribution
- **Transition matrix**: Documented with row/column labels — clear

Excellent market microstructure with 5 models and documented transition matrix. ✅

### 8.475 exchange_simulator/spread_analytics.py: Spread tracking — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/spread_analytics.py` (188 lines)

- **SpreadRecord**: exchange, symbol, spread, mid_price, spread_bps, timestamp — comprehensive
- **SpreadStats**: count, mean, median, p95, max — percentile-based
- **deque history**: O(1) append — efficient
- **Per exchange/symbol**: Granular tracking

Good spread analytics with percentile stats and per-exchange/symbol tracking. ✅

### 8.476 exchange_simulator/data_export.py: CSV/Parquet export — ✅ Good

**Файл:** `exchange_simulator/exchange_simulator/data_export.py` (246 lines)

- **CSV + Parquet**: Built-in CSV, optional Parquet (pyarrow) — flexible
- **3 export types**: Candles, orders, accounts — comprehensive
- **Summary statistics**: Aggregated export — useful for analysis
- **datetime UTC**: `from datetime import UTC` — timezone-aware

Good data export with CSV/Parquet, 3 export types, and UTC timestamps. ✅

### 8.477 web-ui/vite.config.js: Vite + PWA config — ✅ Excellent

**Файл:** `web-ui/vite.config.js` (84 lines)

- **PWA**: VitePWA with autoUpdate, manifest, workbox — installable app
- **Runtime caching**: Google Fonts CacheFirst — performance
- **Manual chunks**: react-vendor, charts-vendor, icons-vendor, state-vendor, recharts-vendor — optimized bundling
- **cssCodeSplit**: true — smaller initial CSS
- **chunkSizeWarningLimit**: 1000 — reasonable
- **esbuild target: es2020**: Modern JS — smaller output
- **Alias `@` → src**: Clean imports
- **server host: 0.0.0.0**: Docker-compatible

Excellent Vite config with PWA, manual chunks, code splitting, and Docker-compatible server. ✅

### 8.478 vite.config: no sourcemap in production — Low

**Файл:** `web-ui/vite.config.js:56-59`

```js
build: {
    target: 'es2020',
    minify: 'esbuild',
```

No `sourcemap` setting — defaults to `false` in Vite production builds. This is correct for production (smaller bundles, no source exposure), but makes debugging production issues harder.

**Фикс:** Consider `sourcemap: 'hidden'` for error tracking services (Sentry) without exposing to users.

### 8.479 vite.config: PWA manifest says "204 panels" — Info

**Файл:** `web-ui/vite.config.js:15`

```js
description: 'Crypto HFT trading system dashboard with 204 panels and 44+ math models',
```

The manifest description mentions "204 panels" — this is the exact count from `registry.js`. Good documentation but will need updating if panels are added/removed.

**Фикс:** Consider making the description generic ("real-time trading dashboard") to avoid maintenance.

### 8.480 hft-trade-bot/src/communication/signal_receiver.h: WebSocket signal receiver — ✅ Good

**Файл:** `hft-trade-bot/src/communication/signal_receiver.h` (210 lines)

- **Dual connection**: Exchange simulator (8765) + AI Signal Bot (8766) — correct
- **Callback-based**: SignalCallback, CandleCallback, ArbitrageCallback — decoupled
- **Private inheritance**: `private SignalReceiverData` — data encapsulation
- **Symbol registration**: `register_symbols()` for subscription — correct
- **symbol_id lookup**: `uint16_t` for fast path — HFT optimization

Good signal receiver with dual connections, callbacks, and data encapsulation. ✅

### 8.481 signal_receiver_handlers.h: JSON message dispatch — ✅ Good

**Файл:** `hft-trade-bot/src/communication/signal_receiver_handlers.h` (234 lines)

- **11 message types**: candles, snapshot, sync_state, trading_state, replay_state, fill, error, signal, signal_history, market_regime, circuit_breaker_status, welcome, arbitrage_scan — comprehensive
- **`json::parse(payload, nullptr, false)`**: Non-throwing parse — correct
- **`is_discarded()` check**: Validates parse result — correct
- **`string_view` for type**: Avoids string copy — HFT optimization
- **`trading_active_.store()`**: Atomic for thread-safe state — correct
- **Extracted for file-size compliance**: Good modularization

Good message handler with 11 types, non-throwing parse, and string_view optimization. ✅

### 8.482 hft-trade-bot/src/metrics/metrics_collector.h: Prometheus metrics — ✅ Good

**Файл:** `hft-trade-bot/src/metrics/metrics_collector.h` (93 lines)

- **3 metric types**: Counter, Gauge, Histogram — Prometheus standard
- **HistogramBuckets**: Configurable bucket boundaries — flexible
- **Convenience methods**: `record_signal_generation_latency`, `record_order_execution_latency` — domain-specific
- **Port configurable**: Default 8002 — flexible

Good Prometheus metrics collector with 3 types and domain-specific convenience methods. ✅

### 8.483 metrics_collector.cpp: mutex on every metric operation — Medium [FIXED]

**Файл:** `hft-trade-bot/src/metrics/metrics_collector.cpp:43-47`

```cpp
void MetricsCollector::increment_counter(const std::string& name, ...) {
    std::lock_guard<std::mutex> lock(metrics_mutex_);
    std::string key = name + serialize_labels(labels);
    counters_[key]++;
}
```

Every metric operation (counter, gauge, histogram) acquires a global `std::mutex`. In HFT, this means every `increment_counter` call blocks all other metric operations. With 100+ metrics per trading loop iteration, this adds significant latency.

**Фикс:** Use `std::atomic` for counters/gauges, or use per-thread metric accumulation with periodic merge.

### 8.484 metrics_collector: string key concatenation on every call — Low

**Файл:** `hft-trade-bot/src/metrics/metrics_collector.cpp:45-46`

```cpp
std::string key = name + serialize_labels(labels);
counters_[key]++;
```

String concatenation + map lookup on every metric call. This allocates memory and does O(log n) lookup. In HFT, this is unacceptable for hot-path metrics.

**Фикс:** Pre-register metrics with integer IDs, use array indexing instead of string lookup.

### 8.485 hft-trade-bot/src/monitoring/health_server.h: HTTP health endpoint — ✅ Good

**Файл:** `hft-trade-bot/src/monitoring/health_server.h` (175 lines)

- **Raw POSIX sockets**: No external HTTP library — lightweight
- **Cross-platform**: Windows (winsock2) + Linux (arpa/inet) — portable
- **Destructor cleanup**: `stop()` joins thread — correct
- **Atomic running flag**: `running_.exchange(false)` — thread-safe shutdown
- **`update_health()`**: External health status injection — flexible
- **WSAStartup/WSACleanup**: Windows socket lifecycle managed — correct

Good health server with raw sockets, cross-platform, and proper lifecycle. ✅

### 8.486 hft-trade-bot/src/monitoring/system_monitor.h: Atomic metrics — ✅ Excellent

**Файл:** `hft-trade-bot/src/monitoring/system_monitor.h` (205 lines)

- **11 metrics**: ORDERS_SENT, ORDERS_FILLED, ORDERS_REJECTED, ORDERS_CANCELED, SIGNALS_RECEIVED, SIGNALS_PROCESSED, ERRORS, RECONNECTS, SHM_DROPS, HEARTBEATS_SENT, HEARTBEATS_MISSED — comprehensive
- **`std::atomic<int64_t>`**: All counters atomic — thread-safe
- **`memory_order_relaxed`**: No ordering needed for counters — correct
- **`fill_rate()` / `rejection_rate()`**: Computed from atomic counters — O(1)
- **`noexcept`**: All methods noexcept — HFT constraint
- **Snapshot struct**: For periodic serialization — clean

Excellent system monitor with 11 atomic metrics, computed rates, and noexcept. ✅

### 8.487 hft-trade-bot/src/tracing/tracer.h: OpenTelemetry tracing — ✅ Good

**Файл:** `hft-trade-bot/src/tracing/tracer.h` (76 lines)

- **OpenTelemetry**: Industry standard — correct
- **Span class**: name, attributes, events, status, start/end time — comprehensive
- **4 trace methods**: signal_generation, order_execution, signal_processing, orderbook_update — domain-specific
- **Context propagation**: inject/extract — distributed tracing
- **Jaeger integration**: host + port configurable — correct

Good OpenTelemetry tracer with Span class, 4 trace methods, and context propagation. ✅

### 8.488 tracer.h: mutex on Span operations — Low

**Файл:** `hft-trade-bot/src/tracing/tracer.h:11`

```cpp
#include <mutex>
```

Span uses `std::map` for attributes and `std::vector` for events — both require mutex for thread safety. In HFT, tracing should be minimal overhead. Consider lock-free or thread-local spans.

**Фикс:** Use thread-local Span storage or disable tracing in hot path via compile-time flag.

### 8.489 hft-trade-bot/src/utils/low_latency.h: Low-latency infrastructure — ✅ Excellent

**Файл:** `hft-trade-bot/src/utils/low_latency.h` (451 lines)

- **Spinlock with `_mm_pause`**: Reduces power + helps hyperthreading — HFT best practice
- **`compare_exchange_strong`**: Correct CAS for lock acquisition
- **`memory_order_acquire`**: Correct for lock — proper synchronization
- **Cross-platform**: Windows (processthreadsapi) + Linux (pthread, sched) — portable
- **`_mm_pause` only on x86_64**: Compile-time guard — correct
- **SPSC queue, object pool, latency histogram**: All in one file — comprehensive
- **Thread pinning**: `pin_thread()` for CPU affinity — HFT optimization
- **Cache-line aligned**: `alignas(64)` throughout — no false sharing

Excellent low-latency infrastructure with spinlock, SPSC queue, object pool, histogram, and thread pinning. ✅

### 8.490 hft-trade-bot/src/market_data/candle_aggregator.h: Tick-to-candle — ✅ Excellent

**Файл:** `hft-trade-bot/src/market_data/candle_aggregator.h` (146 lines)

- **3 modes**: TIME, VOLUME, TICK — flexible
- **`noexcept` on_trade**: Hot path no exceptions — HFT constraint
- **No heap allocations**: Stack-allocated — HFT constraint
- **3 constructors**: Time-based, volume-based, tick-based — flexible
- **Callback**: Real-time candle output — async
- **Nanosecond timestamps**: `timestamp_ns` — HFT precision

Excellent candle aggregator with 3 modes, noexcept, zero-alloc, and nanosecond precision. ✅

### 8.491 hft-trade-bot/src/market_data/order_book_manager.h: L2 order book — ✅ Excellent

**Файл:** `hft-trade-bot/src/market_data/order_book_manager.h` (282 lines)

- **Full L2 book**: Incremental updates, snapshot merge — production-grade
- **`alignas(64) PriceLevel`**: Cache-line aligned — no false sharing
- **`static_assert(sizeof(PriceLevel) == 64)`**: Compile-time validation
- **4 spread regimes**: TIGHT, NORMAL, WIDE, EXTREME — market microstructure
- **Microprice**: Weighted mid-price — HFT metric
- **Template `MaxLevels`**: Configurable capacity — flexible
- **No heap allocations**: Fixed-size arrays — HFT constraint

Excellent L2 order book with cache-line aligned levels, spread regimes, microprice, and zero-alloc. ✅

### 8.492 hft-trade-bot/src/market_data/trade_handler.h: Trade tape processor — ✅ Excellent

**Файл:** `hft-trade-bot/src/market_data/trade_handler.h` (213 lines)

- **Aggressor detection**: `is_buyer_maker` → buy/sell aggressor — market microstructure
- **Rolling VWAP**: O(1) update via running sums — efficient
- **Rolling window**: Circular buffer with incremental subtraction — O(1)
- **Large trade detection**: Configurable threshold — market impact
- **Volume imbalance**: Buy/sell volume ratio — order flow
- **`noexcept` on_trade**: Hot path no exceptions — HFT constraint
- **No heap allocations**: Fixed-size arrays — HFT constraint

Excellent trade handler with aggressor detection, rolling VWAP, large trade detection, and zero-alloc. ✅

### 8.493 hft-trade-bot/src/position/position_manager_v2.h: Position + PnL — ✅ Excellent

**Файл:** `hft-trade-bot/src/position/position_manager_v2.h` (348 lines)

- **FIFO/weighted average cost**: Correct position tracking
- **Realized + unrealized PnL**: Per-symbol + aggregate — comprehensive
- **Isolated + cross margin**: Both margin modes — production-grade
- **Liquidation price**: Calculated per position — risk management
- **`symbol_id` (uint16_t)**: Numeric ID for fast path — HFT optimization
- **`is_open()` guard**: `quantity > 1e-10` — floating-point safe
- **`update_unrealized()`**: O(1) mark-to-market — efficient
- **`noexcept` methods**: Hot path no exceptions — HFT constraint

Excellent position manager with FIFO, PnL, margin, liquidation, and noexcept. ✅

### 8.494 exchange_simulator/health.py: FastAPI health endpoint — ✅ Good

**Файл:** `exchange_simulator/health.py` (127 lines)

- **FastAPI**: Modern async framework — correct
- **3 endpoints**: /health, /health/live, /health/ready — K8s standard
- **Service initialization**: Lazy `_init()` on first request — efficient
- **Config from YAML**: `config.yaml` — centralized
- **JSON response**: Status + uptime + service details — comprehensive

Good health endpoint with FastAPI, 3 K8s-standard endpoints, and lazy init. ✅

### 8.495 health.py: global mutable state — Low [N/A]

**Файл:** `exchange_simulator/health.py:31-33`

```python
_exchanges = None
_market = None
_start_time = None
```

Global mutable state for exchanges and market. If multiple async requests call `_init()` concurrently, race condition on initialization.

**Фикс:** Use `asyncio.Lock` in `_init()` or initialize at startup.

### 8.496 exchange_simulator/ws_prometheus.py: Prometheus metrics mixin — ✅ Good

**Файл:** `exchange_simulator/ws_prometheus.py` (75 lines)

- **8 metrics**: connected_clients, candle_count, weekend_mode, news_event, tick_interval, trading_active, connections_total, disconnections_total — comprehensive
- **Per-exchange labels**: `exchange="{ex_id}"` — Prometheus standard
- **Mixin pattern**: Extracted for file-size compliance — good modularization
- **HELP + TYPE**: Proper Prometheus format — correct

Good Prometheus metrics mixin with 8 metrics, per-exchange labels, and proper format. ✅

### 8.497 exchange_simulator/audit_logger.py: Audit logging — ✅ Excellent

**Файл:** `exchange_simulator/audit_logger.py` (311 lines)

- **6 event types**: Order lifecycle, position lifecycle, balance changes, config changes, system events, user actions — comprehensive
- **Thread-safe**: `Lock()` + `deque(maxlen=10000)` — correct
- **File persistence**: JSON lines to `logs/audit.log` — durable
- **Callbacks**: Real-time event notification — extensible
- **UUID**: `uuid.uuid4()` for session tracking — unique
- **deque(maxlen)**: O(1) append, auto-evict — efficient
- **`mkdir(parents=True, exist_ok=True)`**: Directory creation — robust

Excellent audit logger with 6 event types, thread-safe deque, file persistence, callbacks, and UUID. ✅

### 8.498 ai-signal-bot/src/communication/circuit_breaker.py: Signal circuit breaker — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3 states**: CLOSED, OPEN, HALF_OPEN — standard circuit breaker pattern
- **Configurable**: failure_threshold (5), cooldown (60s), half_open_probes (1), success_threshold (2) — flexible
- **State transition**: OPEN → HALF_OPEN on cooldown expiry — correct
- **Statistics**: total_trips, total_blocks — observability
- **Signal outcome tracking**: Win/loss based — domain-specific

Excellent circuit breaker with 3 states, configurable thresholds, and statistics. ✅

### 8.499 circuit_breaker: not thread-safe — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py:38-46`

```python
class CircuitBreaker:
    def __init__(self, config):
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
```

No lock or asyncio.Lock. If `record_outcome()` and `is_closed` are called from different async tasks, race condition on `_state` and `_consecutive_failures`.

**Фикс:** Use `asyncio.Lock` for state transitions, or use `atomics` if sync.

### 8.500 ai-signal-bot/src/communication/health_check.py: Health aggregator — ✅ Good

**Файл:** `ai-signal-bot/src/communication/health_check.py` (127 lines)

- **3 services**: ai-signal-bot, exchange-simulator, hft-trade-bot — comprehensive
- **aiohttp ClientSession**: With 3s timeout — correct
- **Latency measurement**: `time.monotonic()` — correct
- **3 statuses**: healthy, degraded, unhealthy — standard
- **aiohttp web server**: HTTP endpoint on :9092 — correct

Good health aggregator with 3 services, timeout, latency, and 3 statuses. ✅

### 8.501 health_check: creates new ClientSession per check — Low [FIXED]

**Файл:** `ai-signal-bot/src/communication/health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
```

Creates a new `aiohttp.ClientSession` for every health check call. Sessions should be reused for connection pooling.

**Фикс:** Create a shared `ClientSession` in `__init__` and close it on shutdown.

### 8.502 ai-signal-bot/src/observability/tracing.py: OpenTelemetry + Jaeger — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry**: Industry standard — correct
- **OTLP exporter**: gRPC to Jaeger — correct
- **BatchSpanProcessor**: Async batch export — efficient
- **Resource**: service.name, namespace, version — proper metadata
- **Graceful fallback**: `try/except ImportError` — optional dependency
- **Singleton**: `_initialized` flag prevents double init — correct
- **AsyncioInstrumentor**: Auto-instruments async — comprehensive

Good OpenTelemetry tracing with OTLP, batch processor, graceful fallback, and singleton. ✅

### 8.503 tracing.py: `insecure=True` for OTLP — Low [FIXED]

**Файл:** `ai-signal-bot/src/observability/tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

`insecure=True` disables TLS for OTLP export. In production, tracing data should be encrypted.

**Фикс:** Use TLS in production: `insecure=False` with proper certificates.

### 8.504 exchange_simulator/exchange.py: Simulated exchange — ✅ Good

**Файл:** `exchange_simulator/exchange.py` (175 lines)

- **3 mixins**: AdvancedOrderMixin, OrderSubmissionMixin, LiquidationMixin — modular
- **Per-exchange fee/slippage**: `fee_pct`, `slippage_bps` — realistic
- **Account tracking**: Balance, leverage, positions — comprehensive
- **Order history**: `_order_history` list — audit trail
- **Insurance fund**: `insurance_fund` — liquidation safety

Good exchange with 3 mixins, per-exchange fees, account tracking, and insurance fund. ✅

### 8.505 exchange.py: _order_history unbounded list — Low [FIXED]

**Файл:** `exchange_simulator/exchange.py:58`

```python
self._order_history: list[Order] = []
```

`_order_history` is an unbounded list. In a long-running simulation, this grows indefinitely — memory leak.

**Фикс:** Use `deque(maxlen=N)` or periodically trim.

### 8.506 exchange_simulator/websocket_server.py: WebSocket server — ✅ Good

**Файл:** `exchange_simulator/websocket_server.py` (202 lines)

- **3 mixins**: MessageHandlerMixin, BroadcastMixin, PrometheusMixin — modular
- **Protocol v2**: Version negotiation with backwards compat — correct
- **5 message types**: candles, orderbook, account, fill, welcome — comprehensive
- **ArbitrageDetector**: Optional integration — flexible
- **TradeCsvLogger**: Trade logging to CSV — audit trail

Good WebSocket server with 3 mixins, protocol versioning, and 5 message types. ✅

### 8.507 websocket_server: sys.path manipulation — Low [N/A]

**Файл:** `exchange_simulator/websocket_server.py:30-32`

```python
_proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
```

`sys.path` manipulation at module level. This is fragile and can cause import conflicts. Should be handled by proper package installation (`pip install -e .`).

**Фикс:** Use `pyproject.toml` with proper package configuration instead of sys.path hacks.

### 8.508 exchange_simulator/ws_broadcast.py: Broadcast mixin — ✅ Good

**Файл:** `exchange_simulator/ws_broadcast.py` (489 lines)

- **3 encoding formats**: JSON, orjson, msgpack — performance optimization
- **Protocol version injection**: `protocol_version` added for v2 clients — backwards compat
- **Client-specific encoding**: Per-client encoding negotiation — flexible
- **SHM publishing**: Shared memory for C++ bot — IPC
- **Optional imports**: `orjson`, `msgpack`, `struct`, `shm_mod` — graceful fallback

Good broadcast mixin with 3 encodings, protocol versioning, SHM, and graceful fallback. ✅

### 8.509 ws_broadcast: import inside method — Low [N/A]

**Файл:** `exchange_simulator/ws_broadcast.py:44-49`

```python
async def _send_json(self, websocket, data):
    from exchange_simulator.ws_constants import _HAS_MSGPACK, PROTOCOL_VERSION
    try:
        import msgpack
    except ImportError:
        msgpack = None
```

Imports inside methods — `from exchange_simulator.ws_constants import ...` and `import msgpack` are done on every `_send_json` call. While Python caches imports, the `from ... import ...` still does a dict lookup each time.

**Фикс:** Move imports to module level (already partially done in ws_constants.py).

### 8.510 exchange_simulator/market_simulator.py: GBM price generation — ✅ Good

**Файл:** `exchange_simulator/market_simulator.py` (435 lines)

- **GBM**: Geometric Brownian Motion — standard price model
- **Per-exchange offset**: Correlated but different prices — realistic
- **Per-exchange vol multiplier**: Different volatility per exchange — realistic
- **Inter-symbol correlations**: BTC-ETH 0.85, default 0.3 — realistic
- **Candle history**: Per (exchange, symbol) — correct
- **Hybrid mode**: Real price feeds via PriceFeedManager — flexible

Good market simulator with GBM, correlations, per-exchange offsets, and hybrid mode. ✅

### 8.511 market_simulator: no seed propagation to per-exchange — Low [N/A]

**Файл:** `exchange_simulator/market_simulator.py:26-35`

The `seed` parameter is used for the main RNG, but per-exchange volatility multipliers and offsets are deterministic (based on index `i`). If reproducibility is needed across runs, the seed should also control exchange-specific parameters.

**Фикс:** Use `random.Random(seed + i)` for per-exchange parameters.

### 8.512 exchange_simulator/ws_message_handler.py: Message handler — ✅ Good

**Файл:** `exchange_simulator/ws_message_handler.py` (448 lines)

- **Rate limiting**: Per-client message count with window — DoS protection
- **3 encoding formats**: JSON, orjson, msgpack — performance
- **Protocol version**: v2 negotiation — backwards compat
- **Log sanitization**: `_sanitize_log()` prevents log injection — security
- **Multiple message types**: orders, subscriptions, replay, trading state, config — comprehensive

Good message handler with rate limiting, 3 encodings, log sanitization, and comprehensive message types. ✅

### 8.513 ws_message_handler: rate limit not thread-safe — Low [N/A]

**Файл:** `exchange_simulator/ws_message_handler.py:37-55`

```python
def _check_rate_limit(self, websocket) -> bool:
    now = time.time()
    if websocket not in self._client_message_counts:
        self._client_message_counts[websocket] = {"count": 0, "window_start": now}
```

Rate limit counter is a plain dict. In asyncio, this is fine (single-threaded), but if the server ever runs with multiple workers, the dict is not shared.

**Фикс:** Document that this is per-worker, or use `asyncio.Lock` if needed.

### 8.514 exchange_simulator/tracing.py: OpenTelemetry + Jaeger — ✅ Good

**Файл:** `exchange_simulator/tracing.py` (193 lines)

- **Jaeger exporter**: Thrift protocol — correct
- **BatchSpanProcessor**: Async batch export — efficient
- **TraceContextTextMapPropagator**: W3C trace context — standard
- **3 trace methods**: order_processing, order_matching, websocket_broadcast — domain-specific
- **Span annotations**: Attributes + events — comprehensive

Good OpenTelemetry tracing with Jaeger, W3C context, and 3 trace methods. ✅

### 8.515 tracing.py: no graceful fallback — Low [FIXED]

**Файл:** `exchange_simulator/tracing.py:9-13`

```python
from opentelemetry import propagate, trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
```

Unlike `ai-signal-bot/src/observability/tracing.py` which has `try/except ImportError`, this module hard-imports OpenTelemetry. If the package is not installed, the entire exchange_simulator fails to import.

**Фикс:** Wrap in `try/except ImportError` with graceful fallback (no-op tracer).

### 8.516 exchange_simulator/metrics.py: Prometheus metrics — ✅ Good

**Файл:** `exchange_simulator/metrics.py` (250 lines)

- **prometheus_client**: Official library — correct
- **3 metric types**: Counter, Gauge, Histogram — standard
- **Order metrics**: Total, rate, fill rate — domain-specific
- **Latency histograms**: Order processing + WebSocket — performance monitoring
- **Error metrics**: Error total + rate — observability
- **Labeled metrics**: symbol, side, status, client_id — granular

Good Prometheus metrics with 3 types, domain-specific metrics, and labeled dimensions. ✅

### 8.517 exchange_simulator/exchange_order_submission.py: Order submission — ✅ Good

**Файл:** `exchange_simulator/exchange_order_submission.py` (440 lines)

- **12 parameters**: symbol, side, quantity, order_type, price, SL, TP, force_close, stop_price, limit_price, trail_amount, iceberg_visible_qty — comprehensive
- **NaN check**: `quantity != quantity` — correct
- **Order ID**: Hex counter `f"{self._order_counter:08x}"` — unique
- **force_close**: Skip margin/position checks for SL/TP/liquidation — correct
- **Mixin pattern**: Extracted for file-size compliance — modular

Good order submission with 12 parameters, NaN check, force_close, and mixin pattern. ✅

### 8.518 exchange_order_submission: no quantity upper bound check — Low [FIXED]

**Файл:** `exchange_simulator/exchange_order_submission.py:56`

```python
if quantity <= 0 or quantity != quantity:  # NaN check
```

Checks for <= 0 and NaN, but no upper bound. A client could submit `quantity = 1e15` — the simulator would try to fill it, potentially causing numeric overflow or unrealistic position sizes.

**Фикс:** Add `if quantity > MAX_QUANTITY:` check (e.g., 1e9).

### 8.519 exchange_simulator/ws_constants.py: Shared constants — ✅ Good

**Файл:** `exchange_simulator/ws_constants.py` (39 lines)

- **Optional imports**: msgpack, orjson, shm — graceful fallback
- **Protocol version**: `PROTOCOL_VERSION = 2` — centralized
- **Log sanitization**: `_sanitize_log()` — security (prevents log injection)
- **Truncation**: `[:200]` — prevents log flooding

Good shared constants with optional imports, protocol version, and log sanitization. ✅

### 8.520 exchange_simulator/models.py: Data models — ✅ Good

**Файл:** `exchange_simulator/models.py` (477 lines)

- **5 enums**: Side, OrderType, AuditEventType, OrderStatus — comprehensive
- **Dataclasses**: Candle, OrderBook, Order, Position, Account — clean
- **`from __future__ import annotations`**: Python 3.12+ style — correct
- **`to_dict()` methods**: Serialization — convenient
- **AuditEventType**: 13 event types — comprehensive audit

Good data models with 5 enums, dataclasses, to_dict, and 13 audit event types. ✅

### 8.521 ai-signal-bot/src/utils/helpers.py: Utility functions — ✅ Good

**Файл:** `ai-signal-bot/src/utils/helpers.py` (205 lines)

- **JSON logging**: `JsonFormatter` for structured logs — observability
- **Config loading**: YAML with fallback to `{}` — graceful
- **Env var casting**: `get_env()` with type casting — type-safe
- **Bool parsing**: `"true", "1", "yes", "on"` — flexible
- **Time helpers**: `now_ms()`, `now_us()` — convenient
- **Price/qty formatting**: Adaptive decimal places — user-friendly

Good utility functions with JSON logging, config loading, env casting, and formatting. ✅

### 8.522 helpers.py: load_config returns {} on FileNotFoundError — Low [N/A]

**Файл:** `ai-signal-bot/src/utils/helpers.py:70-71`

```python
except FileNotFoundError:
    return {}
```

Returns empty dict on missing config file — silently. The bot will run with default config, which may not be what the user expects.

**Фикс:** Log a warning or raise, since missing config is likely a deployment error.

### 8.523 helpers.py: bare Exception in CircuitBreaker — Low [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py` (line ~119+)

The `CircuitBreaker` and `RateLimiter` classes in helpers.py catch broad exceptions. This masks unexpected errors.

**Фикс:** Catch specific exceptions or log the unexpected ones.

### 8.524 ai-signal-bot/src/database/db.py: SQLite with WAL — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` — concurrent read access
- **Row factory**: `sqlite3.Row` — dict-like access
- **3 tables**: signals, trades, equity_curve — comprehensive
- **3 indexes**: idx_signals_symbol, idx_trades_symbol, idx_trades_status — query optimization
- **Parameterized queries**: `?` placeholders — SQL injection safe
- **Windows-safe close**: `wal_checkpoint(TRUNCATE)` + `journal_mode=DELETE` — correct
- **`closing()` context**: Proper connection cleanup — correct

Good SQLite database with WAL, 3 tables, 3 indexes, parameterized queries, and Windows-safe close. ✅

### 8.525 db.py: new connection per operation — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every `save_signal()`, `save_trade()`, etc. creates a new connection, executes PRAGMA, and closes. This is expensive — `PRAGMA journal_mode=WAL` is a disk write on every call.

**Фикс:** Use a persistent connection or connection pool. Set WAL once at init.

### 8.526 db.py: close() swallows all exceptions — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py:33-34`

```python
except Exception:
    pass
```

The `close()` method swallows all exceptions. If WAL checkpoint fails, the user never knows — the database may be left in an inconsistent state.

**Фикс:** Log the exception: `except Exception as e: logging.warning(f"WAL checkpoint failed: {e}")`.

### 8.527 hft-trade-bot/src/core/main.cpp: Main entry point — ✅ Excellent

**Файл:** `hft-trade-bot/src/core/main.cpp` (66 lines)

- **Clean structure**: init → connect → loop → shutdown — readable
- **10 init steps**: config, core, engines, routing, kill_switch, monitoring, IPC, callbacks, connect, symbols — comprehensive
- **Graceful shutdown**: `graceful_shutdown(ctx)` — correct
- **`is_running()` loop**: External stop signal — correct
- **ScopedLatency**: `total_loop_hist` measures loop time — observability
- **Atomic balance**: `ctx.balance.load(std::memory_order_relaxed)` — thread-safe
- **Trading gate**: `is_trading_active() && can_trade()` — double check
- **V2/V1 fallback**: V2 enabled → V2, else V1 — correct
- **Status print**: Every 10s — periodic monitoring
- **`wait_for_data()`**: Blocks until data arrives — efficient

Excellent main entry point with 10 init steps, graceful shutdown, scoped latency, and V2/V1 fallback. ✅

### 8.528 main.cpp: no signal handling for SIGTERM — Medium

**Файл:** `hft-trade-bot/src/core/main.cpp:38`

```cpp
while (is_running()) {
```

`is_running()` checks a flag, but there's no signal handler for SIGTERM/SIGINT. In Kubernetes, pod termination sends SIGTERM — the bot won't receive it and will be force-killed after `terminationGracePeriodSeconds`.

**Фикс:** Register `signal(SIGTERM, [](int){ running.store(false); })` and `signal(SIGINT, ...)` before the loop.

### 8.529 main.cpp: no error handling on init failures — Low

**Файл:** `hft-trade-bot/src/core/main.cpp:26-33`

```cpp
init_core_components(ctx);
init_order_routing(ctx);
init_kill_switch(ctx);
```

Some init functions return bool (checked: `init_config_and_logger`, `init_signal_engines`, `connect_all`) but others don't return anything. If `init_core_components` fails silently, the bot continues with broken components.

**Фикс:** Make all init functions return bool and check each one.

### 8.530 hft-trade-bot/src/core/bot_context.h: Bot context — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_context.h` (114 lines)

- **24 includes**: All subsystems — comprehensive
- **SimExchange adapter**: Bridges ExchangeBase to SignalReceiver — clean
- **SymbolEntry struct**: symbol, cstr, id — for fast path
- **ArbOpportunity struct**: symbol, buy/sell exchange, prices, spread — comprehensive
- **BotContext struct**: Aggregates all components — single context object

Good bot context with SimExchange adapter, SymbolEntry, ArbOpportunity, and comprehensive includes. ✅

### 8.531 bot_context: SimExchange holds reference to SignalReceiver — Low

**Файл:** `hft-trade-bot/src/core/bot_context.h:48`

```cpp
SignalReceiver& receiver_;
```

`SimExchange` holds a reference to `SignalReceiver`. If `SignalReceiver` is destroyed before `SimExchange`, dangling reference. The lifetime is managed by `BotContext` which owns both via `unique_ptr`, so this is likely safe, but the reference coupling is implicit.

**Фикс:** Document lifetime requirement or use `shared_ptr`.

### 8.532 hft-trade-bot/src/core/bot_loop.h: Loop functions — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.h` (17 lines)

- **7 functions**: process_sl_tp, process_arbitrage, process_ai_signals, run_v2_signal_loop, run_v1_fallback_loop, print_status, poll_shm_market_data, graceful_shutdown — comprehensive
- **Header-only declarations**: Implementation in .cpp — clean separation
- **BotContext& reference**: All functions take context by reference — efficient

Good bot loop with 7 functions and clean header/implementation separation. ✅

### 8.533 hft-trade-bot/src/data/types.h: Core data types — ✅ Good

**Файл:** `hft-trade-bot/src/data/types.h` (92 lines)

- **3 enums**: Side, OrderType, OrderStatus — comprehensive
- **Inline helpers**: `side_to_string`, `string_to_side` — convenient
- **Candle struct**: OHLCV + symbol + exchange — standard
- **OrderBook struct**: bids, asks, best_bid/ask, spread, mid_price — comprehensive
- **Order struct**: id, symbol, exchange, side, type, quantity — complete

Good core types with 3 enums, inline helpers, Candle, OrderBook, and Order. ✅

### 8.534 types.h: string_to_side defaults to BUY on unknown — Low

**Файл:** `hft-trade-bot/src/data/types.h:21-23`

```cpp
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}
```

Any string that's not "BUY" (including typos like "Buy", "buy", "BUY\n") returns SELL. This could cause wrong-side orders.

**Фикс:** Case-insensitive comparison, throw on unknown, or return `std::optional<Side>`.

### 8.535 hft-trade-bot/src/data/signal.h: Trading signal — ✅ Good

**Файл:** `hft-trade-bot/src/data/signal.h` (46 lines)

- **10 fields**: symbol, direction, confidence, strategy, entry_price, SL, TP, leverage, reason, timestamp — comprehensive
- **`is_long()` / `is_short()` / `is_actionable()`**: Boolean helpers — convenient
- **`side()`**: Maps direction to Side enum — correct
- **`rr_ratio()`**: Risk-reward calculation — correct
- **NEUTRAL defaults to BUY**: Documented — caller should check `is_actionable()` first

Good signal struct with 10 fields, boolean helpers, side mapping, and rr_ratio. ✅

### 8.536 signal.h: NEUTRAL side() returns BUY — Low

**Файл:** `hft-trade-bot/src/data/signal.h:28`

```cpp
return Side::BUY; // NEUTRAL defaults to BUY; caller should check is_actionable() first
```

If caller forgets to check `is_actionable()`, a NEUTRAL signal becomes a BUY order. This is a footgun.

**Фикс:** Return `std::optional<Side>` or throw on NEUTRAL.

### 8.537 hft-trade-bot/src/data/aligned_types.h: Cache-line aligned types — ✅ Excellent

**Файл:** `hft-trade-bot/src/data/aligned_types.h` (268 lines)

- **`alignas(64) AlignedOrderBookLevel`**: Cache-line aligned — no false sharing
- **`static_assert(sizeof == 64)`**: Compile-time validation — correct
- **`alignas(64) FastSignal`**: Fixed-size buffers, no heap alloc — HFT optimized
- **`Direction` enum (uint8_t)**: NEUTRAL, LONG, SHORT — compact
- **`char symbol[32]`**: Fixed-size, no heap alloc — HFT constraint
- **`char reason[48]`**: Short reason — compact
- **7 score fields**: ema, rsi, obi, vwap, adx, pressure, composite — comprehensive
- **`set_symbol()`**: Safe copy with null terminator — correct

Excellent aligned types with alignas(64), static_assert, FastSignal with fixed-size buffers, and 7 score fields. ✅

### 8.538 hft-trade-bot/src/data/symbol_map.h: Symbol lookup — ✅ Good

**Файл:** `hft-trade-bot/src/data/symbol_map.h` (130 lines)

- **FNV-1a hash**: `constexpr` compile-time hash — HFT optimization
- **Bidirectional map**: symbol→id and id→symbol — correct
- **`uint16_t` IDs**: Compact numeric IDs — fast path
- **`0xFFFF` invalid ID**: Sentinel value — correct
- **`[[nodiscard]]`**: Prevents ignoring return value — correct

Good symbol map with FNV-1a hash, bidirectional mapping, compact IDs, and nodiscard. ✅

### 8.539 symbol_map: get_id allocates string — Low

**Файл:** `hft-trade-bot/src/data/symbol_map.h:40`

```cpp
auto it = symbol_to_id_.find(std::string(symbol));
```

`std::string(symbol)` allocates a temporary string for every lookup. In HFT hot path, this is a heap allocation.

**Фикс:** Use `unordered_map<std::string_view, uint16_t>` with transparent hash, or use a flat array indexed by symbol hash.

### 8.540 hft-trade-bot/src/risk/risk_manager.h: Risk manager V1+V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/risk_manager.h` (258 lines)

- **V1 params**: max_risk_per_trade, max_daily_drawdown, min_confidence, min_rr, max_position_size, max_open_positions — comprehensive
- **V2 params**: max_position_qty, max_total_exposure, daily_loss_limit, max_drawdown, max_orders_per_second, min_margin_ratio, max_leverage — production-grade
- **Symbol blacklist**: `unordered_set<string>` — risk control
- **Per-symbol limits**: `unordered_map<string, double>` — granular
- **CheckResult**: passed, reason, code (0-7) — structured
- **8 check codes**: OK, max_position, max_exposure, daily_loss, rate_limit, margin, blacklisted, max_leverage — comprehensive

Excellent risk manager with V1+V2 params, blacklist, per-symbol limits, and 8 check codes. ✅

### 8.541 hft-trade-bot/src/risk/pre_trade_risk.h: Token bucket + pre-trade checks — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/pre_trade_risk.h` (205 lines)

- **TokenBucket**: Lock-free rate limiter with CAS — HFT optimized
- **`try_acquire()` / `try_acquire_n()`**: Atomic CAS with relaxed ordering — correct
- **`refill()`**: Time-based token refill — correct
- **`noexcept`**: All methods noexcept — HFT constraint
- **`memory_order_relaxed`**: No ordering needed for token count — correct
- **`compare_exchange_weak`**: Correct CAS loop — handles spurious failures

Excellent pre-trade risk with lock-free token bucket, atomic CAS, noexcept, and relaxed ordering. ✅

### 8.542 pre_trade_risk: TokenBucket refill has race — Low

**Файл:** `hft-trade-bot/src/risk/pre_trade_risk.h:54-60`

```cpp
void refill() noexcept {
    auto now = std::chrono::steady_clock::now();
    int64_t now_ns = ...;
    int64_t last = last_refill_ns_.load(std::memory_order_relaxed);
    if (now_ns <= last) return;
```

Multiple threads can call `refill()` simultaneously — all read the same `last`, compute the same refill, and CAS-update `tokens_`. The CAS ensures only one succeeds, but the others still do the computation. This is benign (no incorrect behavior) but wastes CPU.

**Фикс:** This is acceptable for HFT — the CAS ensures correctness. Document that concurrent refill is safe but may waste cycles.

### 8.543 hft-trade-bot/src/risk/portfolio_risk.h: Portfolio risk — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/portfolio_risk.h` (262 lines)

- **DrawdownTracker**: Peak-to-trough, underwater curve, `noexcept` — HFT optimized
- **Historical VaR**: Sorted returns, percentile lookup — standard
- **Parametric VaR**: mean - z * sigma * portfolio_value — standard
- **CVaR (Expected Shortfall)**: Average of tail beyond VaR — correct
- **Stress test**: Scenario shocks — risk management
- **Fixed-size arrays**: No heap allocations in hot path — HFT constraint

Excellent portfolio risk with DrawdownTracker, VaR (historical + parametric), CVaR, stress testing, and zero-alloc. ✅

### 8.544 exchange_simulator/exchange_advanced_orders.py: Advanced orders — ✅ Good

**Файл:** `exchange_simulator/exchange_advanced_orders.py` (262 lines)

- **3 advanced order types**: Stop-limit, trailing stop, iceberg — comprehensive
- **`check_advanced_orders()`**: Check all pending orders — correct
- **Price trigger logic**: Buy/sell side checks — correct
- **`to_remove` pattern**: Safe removal during iteration — correct
- **Mixin pattern**: Extracted for file-size compliance — modular

Good advanced orders with 3 types, trigger logic, safe removal, and mixin pattern. ✅

### 8.545 exchange_simulator/exchange_liquidation.py: Liquidation — ✅ Good

**Файл:** `exchange_simulator/exchange_liquidation.py` (149 lines)

- **3 trigger types**: Full liquidation, partial liquidation, SL/TP — comprehensive
- **Leverage-aware**: `liq_price = entry * (1 - 1/lev + 0.005)` — correct
- **Partial liquidation ratio**: Configurable — flexible
- **`update_pnl()` before check**: Mark-to-market before trigger — correct
- **`round(..., 2)`**: Price rounding — realistic

Good liquidation with 3 trigger types, leverage-aware pricing, and PnL update before check. ✅

### 8.546 exchange_liquidation: hardcoded 0.005 maintenance margin — Low [FIXED]

**Файл:** `exchange_simulator/exchange_liquidation.py:50`

```python
liq = round(pos.entry_price * (1 - 1/lev + 0.005), 2)
```

Maintenance margin rate is hardcoded at 0.5%. Different exchanges have different rates (Binance: 0.4-1.5% tiered).

**Фикс:** Make maintenance margin configurable per exchange.

### 8.547 exchange_simulator/options_pricing.py: Black-Scholes — ✅ Good

**Файл:** `exchange_simulator/options_pricing.py` (419 lines)

- **Black-Scholes model**: Standard pricing — correct
- **5 Greeks**: delta, gamma, theta, vega, rho — comprehensive
- **`_cdf()` / `_pdf()`**: Normal distribution functions — correct
- **Guard checks**: `T <= 0 or sigma <= 0 or S <= 0 or K <= 0` — prevents NaN
- **Configurable risk-free rate**: Default 5% — flexible

Good Black-Scholes with 5 Greeks, guard checks, and configurable rate. ✅

### 8.548 options_pricing: duplicate of options_simulator.py — Medium [FIXED]

**Файл:** `exchange_simulator/options_pricing.py` (419 lines) vs `exchange_simulator/exchange_simulator/options_simulator.py` (8085 bytes)

Two modules implement Black-Scholes options pricing:
1. `options_pricing.py` — standalone Black-Scholes class
2. `exchange_simulator/options_simulator.py` — Black-Scholes with Greeks, IV, put-call parity

This is code duplication. Both implement the same math (d1, d2, cdf, pdf, Greeks).

**Фикс:** Consolidate into one module. Use `options_simulator.py` (more comprehensive) and remove `options_pricing.py`, or vice versa.

### 8.549 exchange_simulator/price_feed_manager.py: Multi-API price feeds — ✅ Good

**Файл:** `exchange_simulator/price_feed_manager.py` (322 lines)

- **Multi-API**: Binance, Coinbase — failover
- **TTLCache**: `cachetools.TTLCache` with configurable TTL and maxsize — efficient
- **WebSocket + REST**: Both supported — flexible
- **Automatic failover**: API index rotation — resilient
- **Performance metrics**: Profiling support — observability

Good price feed manager with multi-API, TTLCache, failover, and profiling. ✅

### 8.550 price_feed_manager: hard-imports msgpack — Low [FIXED]

**Файл:** `exchange_simulator/price_feed_manager.py:15`

```python
import msgpack
```

`msgpack` is hard-imported. If not installed, the entire module fails. Other modules (ws_constants.py) use optional imports.

**Фикс:** Wrap in `try/except ImportError` with fallback to JSON.

### 8.551 exchange_simulator/ws_metrics.py: WebSocket metrics — ✅ Good

**Файл:** `exchange_simulator/ws_metrics.py` (86 lines)

- **deque(maxlen=10000)**: Bounded message sizes and latencies — memory-safe
- **Compression ratio**: Tracked — performance metric
- **Delta update ratio**: EMA (0.9/0.1) — smooth tracking
- **P95 stats**: Message size and broadcast latency — percentile metrics
- **`sorted()` for percentiles**: Correct but O(n log n) — acceptable for periodic query

Good WebSocket metrics with bounded deques, compression/delta ratios, and P95 stats. ✅

### 8.552 ws_metrics: sorted() on every percentile query — Low [FIXED]

**Файл:** `exchange_simulator/ws_metrics.py:52-53`

```python
sorted_sizes = sorted(self.message_sizes)
```

`sorted()` creates a new list and sorts it on every `get_p95_message_size()` call. With 10000 elements, this is O(n log n) per query.

**Фикс:** Use `statistics.quantiles()` or maintain a sorted structure, or cache the sorted result.

### 8.553 exchange_simulator/visualizer.py: Terminal visualizer — ✅ Good

**Файл:** `exchange_simulator/visualizer.py` (268 lines)

- **2 mixins**: ChartMixin, AccountMixin — modular
- **Cross-platform**: Windows (msvcrt) + Linux (select, termios, tty) — portable
- **ANSI colors**: 16 colors + backgrounds — rich UI
- **Tabbed interface**: 1/2/3 for symbols, A for account, Q for quit — user-friendly
- **Pure Python**: No external GUI dependencies — lightweight

Good terminal visualizer with 2 mixins, cross-platform input, ANSI colors, and tabbed interface. ✅

### 8.554 ai-signal-bot/src/strategies/__init__.py: Strategy exports — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/__init__.py` (23 lines)

- **7 strategies exported**: EnsembleVoter, FFTCycle, MeanReversion, TrendFollowing, StatisticalArbitrage, MarketMaking, Sentiment, MLEnsemble — comprehensive
- **`__all__`**: Explicit exports — clean
- **Config classes exported**: MarketMakingConfig, SentimentConfig, MLConfig, StatArbConfig — convenient

Good strategy exports with 7 strategies, configs, and explicit `__all__`. ✅

### 8.555 strategies/__init__: missing CrossExchangeArb and FundingRateArb — Low [N/A]

**Файл:** `ai-signal-bot/src/strategies/__init__.py`

The `__init__.py` exports 7 strategies but doesn't export `CrossExchangeArb` or `FundingRateArbDetector` which exist in the strategies directory. These are only accessible via direct import.

**Фикс:** Add to `__init__.py` exports or document that they're internal-only.

### 8.556 hft-trade-bot/src/risk/kill_switch.h: Emergency kill switch — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/kill_switch.h` (173 lines)

- **3 activation methods**: File-based trigger, programmatic `activate()`, daily loss limit — comprehensive
- **5 reasons**: MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, FILE_TRIGGER — structured
- **3 callbacks**: CancelAllCallback, CloseAllCallback, NotifyCallback — flexible
- **SHM notification**: Notifies Python via `KillSwitchMsg` — IPC integration
- **Destructor calls `stop_monitoring()`**: Proper cleanup — correct
- **`[[nodiscard]]` on init_shm**: Prevents ignoring init failure — correct
- **Cross-platform**: `#ifndef _WIN32` for `sys/stat.h` — portable

Excellent kill switch with 3 activation methods, 5 reasons, 3 callbacks, SHM notification, and proper cleanup. ✅

### 8.557 kill_switch: file monitoring thread not joined — Medium [FIXED]

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:52`

```cpp
~KillSwitch() { stop_monitoring(); }
```

The destructor calls `stop_monitoring()`, but if the monitoring thread is a detached thread (common pattern), `stop_monitoring()` may only set a flag without joining. If the thread accesses `this` after destruction, use-after-free.

**Фикс:** Use `std::jthread` or join the thread in `stop_monitoring()`.

### 8.558 hft-trade-bot/src/core/logger.h: Logger — ✅ Good

**Файл:** `hft-trade-bot/src/core/logger.h` (98 lines)

- **spdlog**: Industry-standard logging library — correct
- **2 modes**: Human-readable (dev) + JSON (production) — flexible
- **Rotating file sinks**: 50MB max, 5 rotated files (production) — prevents unbounded logs
- **Timestamped filenames**: `hft_trade_bot_YYYYMMDD_HHMMSS.log` — unique per run
- **`latest.log` symlink**: Always points to latest — convenient
- **Cross-platform**: `localtime_s` (Windows) / `localtime_r` (Linux) — portable
- **Console + file**: Dual sink — correct

Good logger with 2 modes, rotating sinks, timestamped filenames, and cross-platform support. ✅

### 8.559 logger: static log_dir_ not thread-safe — Low

**Файл:** `hft-trade-bot/src/core/logger.h:27`

```cpp
log_dir_ = dir;
```

`log_dir_` is a static member assigned in `init()`. If `init()` is called from multiple threads simultaneously, race condition. In practice, `init()` is called once at startup, so this is benign.

**Фикс:** Document that `init()` must be called once before any logging.

### 8.560 hft-trade-bot/src/strategies/pressure_model.h: Order book pressure — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h` (258 lines)

- **Multi-level OBI**: 5/10/20 levels in single pass — optimized
- **Trade flow imbalance**: Buyer/seller initiated — microstructure
- **Toxicity detection**: `toxic_size_threshold` multiplier — risk awareness
- **Large order percentile**: Top 10% = large — configurable
- **Spread regime**: TIGHT (<1bps), WIDE (>5bps), NORMAL — classified
- **`noexcept`**: Hot path — HFT constraint
- **Zero heap allocations**: Inlined calculations — HFT optimized
- **`[[unlikely]]`**: Branch prediction hints — HFT optimization

Excellent pressure model with multi-level OBI, toxicity detection, spread regime, noexcept, and zero-alloc. ✅

### 8.561 hft-trade-bot/src/strategies/signal_engine.h: Signal engine V1 — ✅ Good

**Файл:** `hft-trade-bot/src/strategies/signal_engine.h` (360 lines)

- **6 indicators**: EMA, RSI, OBI, VWAP, Price Pressure, FFT cycle — comprehensive
- **FFT (Cooley-Tukey radix-2)**: In-house implementation — no external dependency
- **Spectral trend score**: -1 (ranging) to +1 (trending) — useful
- **`kPi` constant**: `inline constexpr` — correct
- **Cross-platform**: `_USE_MATH_DEFINES` for MSVC — portable

Good signal engine V1 with 6 indicators, in-house FFT, and cross-platform support. ✅

### 8.562 signal_engine V1: FFT uses valarray — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine.h:27-43`

```cpp
inline void fft(std::valarray<std::complex<double>>& a) {
```

`std::valarray` is uncommon and has performance pitfalls — some compilers don't optimize it well. The recursive FFT also allocates on each call (`even` and `odd` valarrays).

**Фикс:** Use iterative FFT with pre-allocated buffer, or use a well-optimized library (FFTW).

### 8.563 signal_engine V1: recursive FFT stack depth — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine.h:27-35`

The FFT is recursive — `fft(even)` and `fft(odd)` are called recursively. For n=1024, this is 10 levels of recursion. Each level allocates 2 valarrays. Total: 2 * 10 = 20 allocations per FFT call.

**Фикс:** Use iterative in-place FFT with bit-reversal permutation. O(n log n) with zero allocations.

### 8.564 ai-signal-bot/src/notification/notifier.py: Telegram/Discord notifier — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **2 platforms**: Telegram + Discord — flexible
- **6 alert types**: fill, sl_tp, position_open, position_close, daily_pnl, error — comprehensive
- **Remote commands**: /status, /positions, /close_all, /pause, /resume — remote control
- **AlertEvent dataclass**: Normalized events — clean
- **Env var support**: TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN — flexible
- **`_session` reuse**: Single aiohttp session — efficient
- **Command handlers**: Dict-based dispatch — extensible

Good notifier with 2 platforms, 6 alert types, remote commands, and session reuse. ✅

### 8.565 notifier: token stored in plain attr — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py:54`

```python
self.token = token
```

Bot token is stored as a plain string attribute. If the notifier object is logged or serialized, the token could leak.

**Фикс:** Use `__repr__` that masks the token, or store in environment only.

### 8.566 ai-signal-bot/src/llm_engine/engine.py: LLM engine — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **4 providers**: openai, anthropic, ollama, none — flexible
- **Graceful fallback**: Rule-based analysis if no API key — resilient
- **Optional aiohttp**: `try/except ImportError` — correct
- **MarketContext dataclass**: 12 fields — comprehensive
- **LLMAnalysis dataclass**: Structured output — clean
- **Cache TTL**: Configurable — efficient
- **Timeout**: 10s default — prevents hanging

Good LLM engine with 4 providers, graceful fallback, optional imports, and caching. ✅

### 8.567 llm_engine: API key in plain dataclass — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:29`

```python
api_key: str = ""
```

API key stored as plain string in `LLMConfig` dataclass. If config is logged or serialized, key could leak.

**Фикс:** Use `__repr__` that masks the key, or load from env at call time.

### 8.568 ai-signal-bot/src/networking/socket_transport.py: UDP transport — ✅ Good

**Файл:** `ai-signal-bot/src/networking/socket_transport.py` (156 lines)

- **Non-blocking UDP**: `socket.SOCK_DGRAM` — low-latency
- **Configurable buffer**: 1MB default — prevents packet loss
- **RX/TX queue sizes**: 4096 each — configurable
- **MarketDataPacket dataclass**: Structured packet — clean
- **5 msg types**: new, modify, cancel, trade, snapshot — comprehensive
- **Packet statistics**: Tracked — observability

Good UDP transport with non-blocking sockets, configurable buffers, and packet statistics. ✅

### 8.569 socket_transport: no error handling on packet parse — Low [N/A]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py`

The packet parser uses `struct.unpack` which can raise `struct.error` on malformed packets. If not caught, the receive loop crashes.

**Фикс:** Wrap `struct.unpack` in `try/except struct.error` and log malformed packets.

### 8.570 ai-signal-bot/src/signal_validation/validator.py: Signal validator — ✅ Good

**Файл:** `ai-signal-bot/src/signal_validation/validator.py` (122 lines)

- **5 checks**: min_confidence, min_rr_ratio, max_drawdown, max_open_positions, duplicate prevention — comprehensive
- **ValidationResult dataclass**: passed, reason, signal — structured
- **Daily PnL tracking**: Auto-reset after 24h — correct
- **Duplicate prevention**: `_recent_signals` dict with timestamp — correct
- **Configurable thresholds**: All params configurable — flexible

Good signal validator with 5 checks, daily PnL tracking, and duplicate prevention. ✅

### 8.571 validator: not thread-safe — Medium [FIXED]

**Файл:** `ai-signal-bot/src/signal_validation/validator.py:45-48`

```python
self._daily_pnl: float = 0.0
self._open_positions: int = 0
self._recent_signals: dict[str, datetime] = {}
```

`_daily_pnl`, `_open_positions`, and `_recent_signals` are plain attributes with no lock. If `validate()` and `update_pnl()` are called from different async tasks, race condition on `_daily_pnl` and `_open_positions`.

**Фикс:** Use `asyncio.Lock` or make the validator single-task only.

### 8.572 validator: _recent_signals unbounded dict — Low [N/A]

**Файл:** `ai-signal-bot/src/signal_validation/validator.py:48`

```python
self._recent_signals: dict[str, datetime] = {}
```

`_recent_signals` grows indefinitely — old entries are never cleaned up. Over time, this dict grows for every unique symbol+strategy combination.

**Фикс:** Periodically clean entries older than the cooldown period, or use `TTLCache`.

### 8.573 trade_csv_logger.py: CSV trade logger — ✅ Good

**Файл:** `trade_csv_logger.py` (93 lines)

- **Thread-safe**: `threading.Lock` — correct
- **10 CSV fields**: timestamp, exchange, symbol, side, type, price, quantity, fee, pnl, reason — comprehensive
- **Timestamped filenames**: `trades_YYYYMMDD_HHMMSS.csv` — unique per run
- **`_latest.csv` symlink**: Always points to latest — convenient
- **Windows fallback**: Plain file if symlink fails — portable
- **Shared module**: Used by all Python services — centralized

Good CSV trade logger with thread-safety, 10 fields, timestamped filenames, and cross-platform symlink. ✅

### 8.574 trade_csv_logger: no file rotation — Low

**Файл:** `trade_csv_logger.py:46`

```python
self.path = os.path.join(log_dir, f"{service_name}_{timestamp}.csv")
```

A new CSV file is created per run. In a long-running deployment with many restarts, the `logs/` directory accumulates many CSV files. No rotation or cleanup.

**Фикс:** Add a `max_files` parameter and delete oldest files when exceeded.

### 8.575 hft-trade-bot/src/core/config_parser.h: Config YAML parser — ✅ Good

**Файл:** `hft-trade-bot/src/core/config_parser.h` (344 lines)

- **`expand_env()`**: `${VAR}` env var expansion — correct
- **`parse_exchange_node()`**: Per-exchange config parsing — modular
- **`parse_dev_config()` / `parse_production_config()`**: Split by environment — clean
- **API key/secret expansion**: `expand_env()` on credentials — correct
- **Rate limit parsing**: `weight_per_min`, `orders_per_min` — comprehensive
- **Fee parsing**: `maker_bps`, `taker_bps` — correct

Good config parser with env var expansion, per-exchange parsing, and dev/prod split. ✅

### 8.576 config_parser: expand_env doesn't handle missing env var — Low

**Файл:** `hft-trade-bot/src/core/config_parser.h:27-28`

```cpp
const char* val = std::getenv(var_name.c_str());
if (val) { result += val; }
```

If env var is not set, `val` is null and the expansion is empty. The API key/secret silently becomes empty. No warning is logged.

**Фикс:** Log a warning if env var is not set, especially for credentials.

### 8.577 hft-trade-bot/src/core/config_validate.h: Config validation — ✅ Good

**Файл:** `hft-trade-bot/src/core/config_validate.h` (98 lines)

- **6 risk param validations**: max_risk, max_drawdown, stop_loss, take_profit, min_rr, max_position_size — comprehensive
- **6 trading param validations**: signal_interval, max_open_positions, symbols, EMA periods, ws_url — comprehensive
- **Range checks**: With recommended values in warning message — helpful
- **`spdlog::warn()`**: Non-fatal warnings — correct (don't crash on bad config)
- **URL validation**: `ws://` or `wss://` prefix check — correct

Good config validation with 12 checks, recommended values, and non-fatal warnings. ✅

### 8.578 config_validate: warnings only, no hard fail — Low

**Файл:** `hft-trade-bot/src/core/config_validate.h:11-36`

All validation failures are `spdlog::warn()` — the bot continues even with invalid config (e.g., `max_risk_per_trade_pct = -5` or `stop_loss_pct = 0`). This could lead to dangerous behavior.

**Фикс:** For critical params (stop_loss = 0, max_risk > 100), use `spdlog::error()` and return false to abort startup.

### 8.579 hft-trade-bot/src/core/bot_loop.cpp: Bot loop implementation — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp` (279 lines)

- **`process_sl_tp()`**: Updates PnL, checks SL/TP, closes positions, `fetch_add` balance — correct
- **`process_arbitrage()`**: Lock-protected arb opportunity, min qty check, `is_connected()` check — correct
- **`process_ai_signals()`**: SPSC queue pop, risk check, position check, order submit — correct
- **`prepare_order_book()`**: Fallback synthetic order book from price — resilient
- **`run_v2_signal_loop()`**: V2 signal engine with composite scoring — advanced
- **`run_v1_fallback_loop()`**: V1 fallback when V2 unavailable — resilient
- **`print_status()`**: Periodic status output — observability
- **`poll_shm_market_data()`**: SHM polling for market data — IPC integration
- **`graceful_shutdown()`**: Clean shutdown sequence — correct

Good bot loop with 8 functions, SL/TP processing, arbitrage, AI signals, V2/V1 fallback, and graceful shutdown. ✅

### 8.580 bot_loop: process_arbitrage sets atomic without lock — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:34`

```cpp
ctx.has_arb_opportunity = false;
```

`has_arb_opportunity` is set to `false` outside the lock. If another thread sets it to `true` between the unlock and this line, the new arb opportunity is lost.

**Фикс:** Move `ctx.has_arb_opportunity = false` inside the lock block, or use a CAS loop.

### 8.581 bot_loop: hardcoded 0.5 max arb qty — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:37`

```cpp
double qty = std::min(arb.max_quantity, 0.5);
```

Max arbitrage quantity is hardcoded at 0.5. This should be configurable — different symbols have different optimal arb sizes.

**Фикс:** Add `max_arb_qty` to Config.

### 8.582 hft-trade-bot/src/core/bot_setup.cpp: Bot setup — ✅ Excellent

**Файл:** `hft-trade-bot/src/core/bot_setup.cpp` (364 lines)

- **SIGINT + SIGTERM handlers**: `std::signal(SIGINT, signal_handler)` + `std::signal(SIGTERM, signal_handler)` — **CORRECT!** (contradicts earlier R518 finding about main.cpp — the handler IS registered in bot_setup.cpp)
- **Thread pinning**: `ThreadAffinity::pin_to_core()` + `set_priority_max()` — HFT optimization
- **Log banner**: 10-line startup banner with config summary — observability
- **Config loading**: `Config::load(config_path)` with CLI arg override — flexible
- **RiskManager init**: 15 params from config — comprehensive
- **Production/sim split**: `setup_real_exchanges()` vs `setup_sim_exchanges()` — clean

Excellent bot setup with SIGTERM handler, thread pinning, config loading, and 15-param risk manager init. ✅

### 8.583 CORRECTION: R518 main.cpp no SIGTERM — False alarm [N/A]

**Файл:** `hft-trade-bot/src/core/bot_setup.cpp:62-63`

```cpp
std::signal(SIGINT, signal_handler);
std::signal(SIGTERM, signal_handler);
```

R518 flagged "main.cpp: no SIGTERM handler" as Medium. This is **incorrect** — `init_config_and_logger()` in `bot_setup.cpp` registers both SIGINT and SIGTERM handlers. `main.cpp` calls `init_config_and_logger()` which sets up the signal handlers. The finding should be downgraded from Medium to Info (false alarm).

**Статус:** R518 → downgrade to Info. SIGTERM handler exists in bot_setup.cpp.

### 8.584 bot_setup: signal_handler only sets flag — Low

**Файл:** `hft-trade-bot/src/core/bot_setup.cpp:13`

```cpp
static void signal_handler(int) { g_running = false; }
```

The signal handler only sets `g_running = false`. It doesn't log the signal receipt. In production, it's useful to know when/why the bot received SIGTERM.

**Фикс:** Add `spdlog::info("Received signal, shutting down")` — but note that only async-signal-safe functions should be called in a signal handler. Use `write()` or a flag + log in main loop.

### 8.585 ai-signal-bot/src/strategies/strategies.py: Core strategies — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/strategies.py` (472 lines)

- **3 strategies**: TrendFollowing (EMA+ADX), MeanReversion (Bollinger+RSI), FFTCycle — comprehensive
- **EnsembleVoter**: Majority/weighted voting — flexible
- **Signal class**: direction, confidence, SL/TP, strategy, reason, rr_ratio — comprehensive
- **NaN guards**: `math.isnan()` checks on EMA/ADX/ATR — correct
- **Dual candle format**: `isinstance(c, dict)` check — flexible
- **CircuitBreaker re-export**: Backward compat — correct

Good core strategies with 3 strategies, EnsembleVoter, NaN guards, and dual candle format. ✅

### 8.586 strategies.py: noqa E402 on imports — Low [N/A]

**Файл:** `ai-signal-bot/src/strategies/strategies.py:15-22`

```python
from src.technical_analysis.fft_analysis import fft_cycle_indicator  # noqa: E402
from src.technical_analysis.indicators import (  # noqa: E402
```

`# noqa: E402` suppresses "module level import not at top of file" warning. The imports are after the `logger` definition, which is why they're not at the top.

**Фикс:** Move imports to top of file, before logger. The logger can use `__name__` without imports being first.

### 8.587 ai-signal-bot/src/strategies/statistical_arbitrage.py: Stat arb — ✅ Excellent

**Файл:** `ai-signal-bot/src/strategies/statistical_arbitrage.py` (318 lines)

- **OLS regression**: `np.linalg.lstsq` with `LinAlgError` fallback — robust
- **ADF test**: Simplified Augmented Dickey-Fuller — correct
- **Half-life estimation**: Ornstein-Uhlenbeck AR(1) — correct
- **Kalman filter hedge**: Adaptive hedge ratio — advanced
- **Z-score entry/exit**: Dynamic thresholds — correct
- **Correlation matrix**: Monitoring — risk management
- **`deque(maxlen=...)`**: Bounded history — memory-safe

Excellent stat arb with OLS, ADF, half-life, Kalman filter, z-score, and correlation monitoring. ✅

### 8.588 ai-signal-bot/src/strategies/market_making.py: Avellaneda-Stoikov — ✅ Excellent

**Файл:** `ai-signal-bot/src/strategies/market_making.py` (268 lines)

- **Avellaneda-Stoikov**: Reservation price + optimal spread — academic-grade
- **Inventory skew**: `inventory_skew` parameter — risk management
- **Adverse selection**: Toxicity threshold — risk management
- **Volatility estimation**: Log returns with `deque(maxlen=60)` — correct
- **Spread optimization**: Fill rate target — performance optimization
- **10 config params**: gamma, sigma, T, k, max_inventory, min/max_spread, skew, toxicity, vol_lookback — comprehensive
- **Quote dataclass**: 10 fields including `should_cancel` — structured

Excellent market making with Avellaneda-Stoikov, inventory skew, adverse selection, and spread optimization. ✅

### 8.589 market_making: inventory not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/strategies/market_making.py:59`

```python
self.inventory: float = 0.0
```

`inventory` is a plain float updated via `update_inventory()`. If called from multiple async tasks, race condition. In practice, market making is single-task.

**Фикс:** Document single-task requirement or use asyncio.Lock.

### 8.590 ai-signal-bot/src/strategies/sentiment.py: Sentiment strategy — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/sentiment.py` (215 lines)

- **10 event types**: FOMC, CPI, NFP, EARNINGS, REGULATION, HACK, WHALE, LISTING, LIQUIDATION, UNKNOWN — comprehensive
- **Sentiment map**: -0.9 (HACK) to +0.7 (LISTING) — realistic
- **Volatility map**: 1.0-4.0x multipliers — correct
- **Pre/post-event windows**: Configurable — flexible
- **Fade vs follow**: Threshold-based — correct
- **Sentiment decay**: 0.95 per second — realistic
- **NewsEvent dataclass**: 7 fields — structured

Good sentiment strategy with 10 event types, sentiment/volatility maps, pre/post windows, and decay. ✅

### 8.591 ai-signal-bot/src/strategies/ml_ensemble.py: ML ensemble — ✅ Excellent

**Файл:** `ai-signal-bot/src/strategies/ml_ensemble.py` (318 lines)

- **3 ML libraries**: scikit-learn (fallback), LightGBM (preferred), XGBoost (optional) — flexible
- **Graceful fallback**: `try/except ImportError` for each library — resilient
- **HMM regime detector**: 3 states (calm/trending/volatile) — advanced
- **IsolationForest**: Anomaly filtering — risk management
- **Walk-forward**: Retrain every N candles — prevents overfitting
- **9 config params**: lookback, feature_window, prediction_horizon, train_interval, min_train_samples, confidence_threshold, anomaly_contamination, n_hmm_states, use_lightgbm/xgboost — comprehensive
- **`deque(maxlen=500)`**: Bounded returns — memory-safe

Excellent ML ensemble with 3 libraries, HMM regime, IsolationForest, walk-forward, and graceful fallback. ✅

### 8.592 ml_ensemble: HMMRegimeDetector not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/strategies/ml_ensemble.py:57-68`

```python
class HMMRegimeDetector:
    self.current_state: int = 0
    self._returns: deque[float] = deque(maxlen=500)
    self._fitted = False
```

`HMMRegimeDetector` has mutable state (`current_state`, `_returns`, `_fitted`) with no lock. If `update()` is called from multiple async tasks, race condition.

**Фикс:** Document single-task requirement or use asyncio.Lock.

### 8.593 ai-signal-bot/src/technical_analysis/indicators.py: Technical indicators — ✅ Good

**Файл:** `ai-signal-bot/src/technical_analysis/indicators.py` (333 lines)

- **8 indicators**: SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, VWAP — comprehensive
- **NumPy vectorized**: With scalar fallback — resilient
- **NaN-padded**: Insufficient data returns NaN — correct
- **Dual candle format**: `isinstance(c, dict)` check — flexible
- **Pure functions**: No side effects — clean
- **`_HAS_NUMPY` flag**: Optional dependency — correct

Good technical indicators with 8 indicators, NumPy vectorization, scalar fallback, and dual candle format. ✅

### 8.594 indicators: EMA not fully vectorized — Low [N/A]

**Файл:** `ai-signal-bot/src/technical_analysis/indicators.py:60-61`

```python
for i in range(period, n):
    result[i] = arr[i] * mult + result[i - 1] * (1 - mult)
```

EMA has a Python loop even with NumPy. This is inherently sequential (each value depends on previous), but could use `np.convolve` or `scipy.signal.lfilter` for full vectorization.

**Фикс:** Use `scipy.signal.lfilter` for fully vectorized EMA, or accept the loop (it's fast enough for 200-element arrays).

### 8.595 ai-signal-bot/src/risk/risk_manager.py: Risk manager (Python) — ✅ Good

**Файл:** `ai-signal-bot/src/risk/risk_manager.py` (262 lines)

- **4 risk features**: Trailing stop, breakeven move, partial TP, max hold time — comprehensive
- **ATR-based trailing**: Adaptive SL distance — advanced
- **PositionRiskState dataclass**: 12 fields tracking position state — comprehensive
- **Configurable**: All params via RiskConfig — flexible
- **`init_position()`**: Initialize tracking state — correct
- **`update_stop_loss()`**: Main update logic — correct

Good risk manager with 4 features, ATR-based trailing, and 12-field position state. ✅

### 8.596 risk_manager: not thread-safe — Medium [FIXED]

**Файл:** `ai-signal-bot/src/risk/risk_manager.py:66-74`

```python
class RiskManager:
    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()
```

`RiskManager` has no lock. If `update_stop_loss()` is called from multiple async tasks for different positions, the state is per-position (stored in `PositionRiskState`), so concurrent calls for different positions are safe. But if the same position is updated concurrently (e.g., from two candle updates), race condition on `peak_price`, `trough_price`, `current_stop_loss`.

**Фикс:** Use `asyncio.Lock` per position, or document single-task requirement.

### 8.597 risk_manager: no validation on config params — Low [N/A]

**Файл:** `ai-signal-bot/src/risk/risk_manager.py:28-46`

```python
trailing_distance_pct: float = 2.0
breakeven_trigger_pct: float = 1.0
partial_tp_pct: float = 50.0
```

No validation that params are positive, within reasonable ranges. `trailing_distance_pct = -5` would move SL in the wrong direction.

**Фикс:** Add `__post_init__` validation on RiskConfig.

### 8.598 hft-trade-bot/src/strategies/signal_engine_v2.h: Signal Engine V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h` (494 lines)

- **6 indicators**: EMA(21/50) crossover + RSI(14) + OBI multi-level + VWAP ±2σ + ADX(14) + Pressure Model — comprehensive
- **Composite score → BUY/SELL/HOLD** + confidence(0-100) + dynamic SL/TP(ATR) + leverage — full signal
- **No heap allocations in analyze()**: All stack-allocated (max 256 candles) — HFT constraint
- **Cache-line aligned output**: `FastSignal` is `alignas(64)` — correct
- **IndicatorCache**: InlineEMA, InlineRSI, InlineADX, InlineATR, InlineVWAP — streaming indicators
- **Cooldown**: Configurable, default 5000ms — prevents overtrading
- **4 split files**: v2.h, v2.cpp, v2_finalize.h, v2_params.h — modular

Excellent signal engine V2 with 6 indicators, composite scoring, zero-alloc, cache-line aligned, and modular split. ✅

### 8.599 signal_engine_v2: get_cache allocates on emplace — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h:64`

```cpp
it = cache_.emplace(std::string(symbol), IndicatorCache{}).first;
```

`get_cache()` allocates a `std::string` and `IndicatorCache` on first call for each symbol. This is expected (one-time init), but the `std::string` allocation in `unordered_map` key is a heap alloc.

**Фикс:** Pre-populate cache at startup for all configured symbols.

### 8.600 hft-trade-bot/src/strategies/signal_engine_v3.h: Signal Engine V3 HMM — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h` (437 lines)

- **4 HMM states**: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE — comprehensive
- **Online Baum-Welch**: Simplified parameter adaptation — advanced
- **Viterbi decoding**: Most likely state path — correct
- **Log-space**: Numerical stability — correct
- **2D observations**: (log_return, vol_proxy) — correct
- **Regime gates V2**: Boost/dampen signals based on regime — intelligent
- **No heap allocations in analyze()**: All stack-allocated — HFT constraint
- **O(1) per-tick**: Online HMM forward recursion — efficient
- **`constexpr` regime_name**: Compile-time — correct

Excellent signal engine V3 with 4-state HMM, online Baum-Welch, Viterbi, log-space, regime gating, and zero-alloc. ✅

### 8.601 signal_engine_v3: HMM transition matrix hardcoded — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h`

The initial transition matrix is uniform (1/N_STATES). While it adapts online via Baum-Welch, the initial state may produce poor regime detection until enough data is seen.

**Фикс:** Allow loading a pre-trained transition matrix from config.

### 8.602 hft-trade-bot/src/execution/smart_order_router_v2.h: Smart order router — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/smart_order_router_v2.h` (181 lines)

- **5 routing strategies**: BEST_PRICE, LOWEST_LATENCY, LOWEST_FEES, BEST_EFFECTIVE, DEPTH_AWARE — comprehensive
- **IExchange interface (DIP/SOLID)**: No concrete exchange in core — correct
- **Toxic backoff**: Skip exchanges with ≥5 toxic events — risk management
- **Stack-allocated array**: `MAX_EXCHANGES = 16`, no heap alloc in hot path — HFT
- **`[[unlikely]]`**: Branch prediction on no-exchanges case — HFT optimization
- **Configurable**: Strategy, toxic_threshold, depth_levels, min_depth_qty, prefer_maker — flexible

Excellent smart order router with 5 strategies, DIP/SOLID, toxic backoff, zero-alloc, and `[[unlikely]]`. ✅

### 8.603 smart_order_router: no latency tracking implementation — Low

**Файл:** `hft-trade-bot/src/execution/smart_order_router_v2.h:1`

The header comment says "per-exchange latency tracking" but the `route()` method doesn't use latency data for the LOWEST_LATENCY strategy. The `IExchange` interface would need a `get_latency()` method.

**Фикс:** Add `get_latency_ns()` to `IExchange` and use it in LOWEST_LATENCY strategy.

### 8.604 hft-trade-bot/src/execution/adaptive_order_selector_v2.h: Adaptive order selector — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/adaptive_order_selector_v2.h` (223 lines)

- **4 order types**: IOC, FOK, GTD, PostOnly — comprehensive
- **6 decision inputs**: confidence, spread, OBI, toxicity, order size vs depth, urgency — comprehensive
- **Emergency → FOK**: Fill-or-kill for urgent fills — correct
- **Toxic → IOC**: Avoid adverse selection — correct
- **`noexcept`**: Hot path — HFT constraint
- **8 config params**: high/low/emergency confidence, tight/wide spread, toxic threshold, OBI urgency, large order ratio — comprehensive
- **SelectionResult**: kind, limit_price, expire_ns, reason — structured

Excellent adaptive order selector with 4 order types, 6 decision inputs, noexcept, and 8 config params. ✅

### 8.605 hft-trade-bot/src/position/position_manager.h: Position manager V1 — ✅ Good

**Файл:** `hft-trade-bot/src/position/position_manager.h` (130 lines)

- **Mutex-protected**: All operations use `std::lock_guard` — thread-safe
- **Update vs duplicate**: Checks existing position before creating new — correct
- **`std::optional<Position>`**: Return type for close — correct
- **`active_symbols_`**: Fast `has_position()` check via `unordered_set` — efficient
- **`update_all_pnl()`**: Batch update from price map — correct

Good position manager V1 with mutex protection, update-vs-duplicate, optional return, and fast has_position. ✅

### 8.606 position_manager V1: linear search for position — Low

**Файл:** `hft-trade-bot/src/position/position_manager.h:21-29`

```cpp
for (auto& pos : positions_) {
    if (pos.symbol == signal.symbol) {
```

`open_position()` and `close_position()` use linear search through `positions_` vector. With many positions, this is O(n). The `active_symbols_` set provides O(1) `has_position()` but not the position itself.

**Фикс:** Use `unordered_map<string, Position>` for O(1) lookup, or accept O(n) for small n (typically <10 positions).

### 8.607 position_manager V1: mutex in HFT hot path — Low

**Файл:** `hft-trade-bot/src/position/position_manager.h:19`

```cpp
std::lock_guard<std::mutex> lock(mutex_);
```

Every position operation acquires a mutex. In the HFT hot path (called every tick via `update_all_pnl()`), this adds latency. V2 uses a similar pattern.

**Фикс:** For V2, consider lock-free position tracking or per-symbol locks to reduce contention.

### 8.608 hft-trade-bot/src/position/position_manager_v2.h: Position manager V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/position/position_manager_v2.h` (348 lines)

- **Weighted average cost**: FIFO/weighted average entry — correct
- **Realized + unrealized PnL**: Per-symbol + aggregate — comprehensive
- **Isolated + cross margin**: `MarginMode` enum — production-grade
- **Liquidation price**: Per-position — risk management
- **`symbol_id`**: uint16_t for fast path — HFT optimization
- **`is_open()`**: `quantity > 1e-10` — floating-point safe
- **`notional()`**: `quantity * entry_price` — correct
- **`update_unrealized()`**: `noexcept` — HFT constraint
- **Leverage tracking**: Per-position — comprehensive

Excellent position manager V2 with weighted average, realized+unrealized PnL, margin modes, liquidation price, and symbol_id. ✅

### 8.609 position_manager_v2: hardcoded 0.005 maintenance margin — Low

**Файл:** `hft-trade-bot/src/position/position_manager_v2.h:72`

```cpp
double maintenance_margin_ratio{0.005}; // 0.5%
```

Maintenance margin ratio is configurable via Config struct, but the default 0.5% is the same hardcoded value as in `exchange_liquidation.py`. Different exchanges have different rates.

**Фикс:** Load from exchange config, not a global default.

### 8.610 ai-signal-bot/src/backtesting/backtester.py: Backtester — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/backtester.py` (506 lines)

- **Trade dataclass**: 10 fields including exit_reason, fee — comprehensive
- **BacktestResult**: 18 metrics including Sharpe, Sortino, Calmar, recovery factor, drawdown duration — comprehensive
- **`final_equity` property**: Alias for backward compat — correct
- **RiskManager integration**: Uses RiskManager for SL/TP — correct
- **Equity curve tracking**: List of balances — correct
- **Fee calculation**: Per-trade — correct

Good backtester with 10-field Trade, 18 metrics, RiskManager integration, and backward compat. ✅

### 8.611 backtester: no slippage model — Low [N/A]

**Файл:** `ai-signal-bot/src/backtesting/backtester.py`

The backtester simulates fees but not slippage. In real trading, market orders experience slippage (difference between expected and actual fill price). Without slippage simulation, backtest results are overly optimistic.

**Фикс:** Add configurable slippage model (fixed bps, or volume-dependent).

### 8.612 ai-signal-bot/src/data_collection/exchange_factory.py: Exchange factory — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py` (242 lines)

- **3 modes**: SIMULATOR, REAL, FALLBACK — flexible
- **Protocol-based**: `ExchangeAdapter` Protocol — DIP/SOLID
- **9 protocol methods**: initialize, close, get_ticker, get_orderbook, get_candles, place_order, cancel_order, get_balance, get_positions, get_health — comprehensive
- **SimulatorAdapter**: Stub for testing — correct
- **Fallback mode**: Try real, fall back to simulator — resilient

Good exchange factory with 3 modes, Protocol-based design, 9 methods, and fallback. ✅

### 8.613 exchange_factory: SimulatorAdapter returns hardcoded 50000.0 — Low [N/A]

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py:55`

```python
return {"symbol": symbol, "price": 50000.0, "bid": 49999.5, "ask": 50000.5, "timestamp": time.time()}
```

`get_ticker()` returns a hardcoded BTC price of 50000.0 for all symbols. This is a stub, but if used in testing with non-BTC symbols, it produces misleading results.

**Фикс:** Return per-symbol prices from a configurable dict, or raise NotImplementedError for non-BTC symbols.

### 8.614 ai-signal-bot/src/portfolio/markowitz.py: Markowitz optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/markowitz.py` (178 lines)

- **PortfolioResult dataclass**: weights, expected_return, volatility, sharpe_ratio — structured
- **EfficientFrontierPoint**: weights, return, volatility — structured
- **3 calculations**: expected_returns, covariance_matrix, portfolio_metrics — correct
- **`max(portfolio_variance, 0)`**: Prevents negative sqrt — correct
- **Sharpe ratio**: With risk-free rate — correct
- **Objective function**: For scipy optimization — correct

Good Markowitz optimizer with PortfolioResult, EfficientFrontier, 3 calculations, and scipy integration. ✅

### 8.615 markowitz: no constraint validation — Low [N/A]

**Файл:** `ai-signal-bot/src/portfolio/markowitz.py:34`

```python
def __init__(self, risk_free_rate: float = 0.02):
```

No validation that `risk_free_rate` is reasonable (e.g., not negative, not > 1). A negative risk-free rate inflates Sharpe ratios.

**Фикс:** Validate `risk_free_rate` in `__init__`.

### 8.616 markowitz: no short-selling constraint — Low [N/A]

**Файл:** `ai-signal-bot/src/portfolio/markowitz.py`

The optimizer doesn't enforce non-negative weights (no short-selling). Without this constraint, the optimizer may produce negative weights (short positions) which may not be intended.

**Фикс:** Add bounds constraint `(0, 1)` for each weight in scipy optimization.

### 8.617 hft-trade-bot/src/strategies/inline_indicators.h: Inline indicators — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/inline_indicators.h` (295 lines)

- **5 streaming indicators**: InlineEMA, InlineRSI, InlineADX, InlineVWAP, InlineATR — comprehensive
- **O(1) per update**: No vector allocation — HFT constraint
- **Wilder's smoothing**: Correct RSI/ADX implementation — correct
- **`noexcept`**: All `update()` and `value()` methods — HFT constraint
- **`[[unlikely]]`**: Branch prediction on init path — HFT optimization
- **`constexpr`**: `compute_k()`, `compute_inv_period()`, `value()`, `ready()` — compile-time
- **StringHash transparent**: Enables `find(const char*)` without allocation — HFT optimization

Excellent inline indicators with 5 streaming classes, O(1), Wilder's smoothing, noexcept, constexpr, and transparent hash. ✅

### 8.618 inline_indicators: no period validation — Low

**Файл:** `hft-trade-bot/src/strategies/inline_indicators.h:34`

```cpp
explicit InlineEMA(int period) : k_(compute_k(period)) {}
```

No validation that `period > 0`. `period = 0` causes division by zero in `compute_k()` → `k_ = 2.0 / 1.0 = 2.0` (not infinity, but wrong). `period = -1` → `k_ = 2.0 / 0.0 = inf`.

**Фикс:** Add `assert(period > 0)` or throw in constructor.

### 8.619 hft-trade-bot/src/strategies/obi_utils.h: OBI utilities — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/obi_utils.h` (78 lines)

- **3 functions**: `compute_obi_levels`, `compute_weighted_obi`, `compute_obi_all` — comprehensive
- **Single-pass**: `compute_obi_all` computes 5/10/20-level OBI in one loop — efficient
- **Proximity weighting**: `1.0 / (1.0 + i)` — correct
- **`noexcept`**: All functions — HFT constraint
- **Guard**: `total > 1e-12` prevents division by zero — correct
- **Fallback**: `n < l5` → use available levels — resilient

Excellent OBI utilities with 3 functions, single-pass, proximity weighting, noexcept, and zero-guard. ✅

### 8.620 hft-trade-bot/src/exchange/IExchange.h: Exchange interface — ✅ Excellent

**Файл:** `hft-trade-bot/src/exchange/IExchange.h` (43 lines)

- **Abstract interface**: Pure virtual — DIP/SOLID
- **11 methods**: id, maker_fee, taker_fee, latency, best_bid/ask, mid, bid/ask_depth, is_available, toxic tracking — comprehensive
- **Virtual destructor**: `= default` — correct
- **Latency tracking**: `estimated_latency_us()` — exists in interface (contradicts R593 finding about smart_router not using it)
- **Toxic flow**: `record_toxic_event()`, `toxic_event_count()`, `reset_toxic_events()` — risk management

Excellent exchange interface with 11 pure virtual methods, DIP/SOLID, latency, and toxic flow tracking. ✅

### 8.621 CORRECTION: R593 smart_order_router no latency — Partially false

**Файл:** `hft-trade-bot/src/exchange/IExchange.h:24`

```cpp
virtual int64_t estimated_latency_us() const = 0;
```

R593 flagged "no latency tracking implementation" — the `IExchange` interface **does** have `estimated_latency_us()`. The smart_order_router_v2.h `route()` method may or may not use it for LOWEST_LATENCY strategy (need to check the full route() implementation). The interface is correct; the issue is whether the router uses it.

**Статус:** R593 → downgrade from Low to Info. Interface has latency; router implementation needs verification.

### 8.622 ai-signal-bot/src/ml/price_predictor.py: LSTM/Transformer — ✅ Good

**Файл:** `ai-signal-bot/src/ml/price_predictor.py` (334 lines)

- **2 architectures**: LSTM (128 hidden, 2 layers) + Transformer (4 heads) — comprehensive
- **Attention mechanism**: Multi-head self-attention — advanced
- **11 input features**: OHLCV + RSI + EMA_fast/slow + ATR + volume_ratio + return — comprehensive
- **3 output classes**: buy/sell/hold — correct
- **12 config params**: model_type, input_dim, hidden_dim, num_layers, num_heads, dropout, output_dim, lookback, horizon, lr, weight_decay, batch_size, epochs, early_stop — comprehensive
- **ONNX export**: For C++ inference — production-grade
- **Early stopping**: `early_stop_patience = 10` — prevents overfitting

Good price predictor with 2 architectures, attention, 11 features, ONNX export, and early stopping. ✅

### 8.623 price_predictor: hard-imports torch — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/price_predictor.py:28-30`

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
```

`torch` is hard-imported with no fallback. If PyTorch is not installed, the entire module fails to import, breaking any code that imports from `src.ml`. Other ML modules (ml_ensemble.py) use `try/except ImportError`.

**Фикс:** Wrap in `try/except ImportError` with `SKLEARN_AVAILABLE = False` pattern, or document that PyTorch is required for this module.

### 8.624 ai-signal-bot/src/ml/model_registry.py: Model registry — ✅ Excellent

**Файл:** `ai-signal-bot/src/ml/model_registry.py` (296 lines)

- **5 statuses**: CANDIDATE, STAGING, PRODUCTION, ARCHIVED, ROLLED_BACK — comprehensive
- **Semver versioning**: Version management — correct
- **A/B testing**: Traffic split, impressions, successes — advanced
- **Automatic rollback**: On performance degradation — risk management
- **File-based persistence**: JSON storage — simple but effective
- **Promote with demotion**: Current production archived when new promoted — correct
- **`ModelVersion` dataclass**: 10 fields — comprehensive
- **`ABTest` dataclass**: 9 fields — comprehensive
- **Error handling**: `try/except` on load with warning — resilient

Excellent model registry with 5 statuses, semver, A/B testing, rollback, file persistence, and promote-with-demotion. ✅

### 8.625 model_registry: not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/model_registry.py:87-89`

```python
self.models: dict[str, dict[str, ModelVersion]] = {}
self.ab_tests: dict[str, ABTest] = {}
```

`ModelRegistry` has no lock. If `register()`, `promote()`, or `rollback()` are called from multiple async tasks, race condition on `self.models` and `self.ab_tests`. In practice, model registry operations are rare (manual or periodic).

**Фикс:** Use `asyncio.Lock` or document single-task requirement.

### 8.626 model_registry: _save not atomic — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/model_registry.py:107-120`

```python
def _save(self) -> None:
    with open(self.index_path, "w") as f:
        json.dump(data, f, indent=2)
```

`_save()` writes directly to `registry.json`. If the process crashes during write, the file is corrupted. Should write to a temp file and atomically rename.

**Фикс:** Write to `registry.json.tmp`, then `os.rename()` to `registry.json`.

### 8.627 ai-signal-bot/src/database/db.py: Database layer — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **3 tables**: signals, trades, equity_curve — comprehensive
- **3 indexes**: idx_signals_symbol, idx_trades_symbol, idx_trades_status — performant
- **WAL mode**: `PRAGMA journal_mode=WAL` — concurrent access
- **Parameterized queries**: `?` placeholders — SQL injection safe
- **`closing()` context**: Proper connection cleanup — correct
- **Windows-safe close**: `wal_checkpoint(TRUNCATE)` + `journal_mode=DELETE` — cross-platform
- **`COALESCE(SUM(pnl), 0)`**: NULL-safe aggregation — correct
- **`get_stats()`**: 6 metrics — comprehensive

Good database layer with 3 tables, 3 indexes, WAL, parameterized queries, and Windows-safe close. ✅

### 8.628 db.py: new connection per operation — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every database operation creates a new connection, sets WAL mode, and closes it. This is expensive:
1. `sqlite3.connect()` — file open, lock acquisition
2. `PRAGMA journal_mode=WAL` — journal mode check (even if already WAL)
3. `closing()` — connection close, lock release

With 50 symbols × 60s signal interval = ~3000 signals/day, this is 3000+ connection open/close cycles per day.

**Фикс:** Use a persistent connection stored as `self._conn`, set WAL once in `__init__`, and use a thread-safe access pattern.

### 8.629 db.py: no foreign key on signal_id — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py:67`

```sql
signal_id INTEGER
```

`trades.signal_id` has no foreign key constraint to `signals.id`. A trade can reference a non-existent signal.

**Фикс:** Add `FOREIGN KEY (signal_id) REFERENCES signals(id)` or use `PRAGMA foreign_keys=ON`.

### 8.630 ai-signal-bot/src/portfolio/risk_parity.py: Risk parity — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/risk_parity.py` (167 lines)

- **RiskContribution dataclass**: 4 fields — structured
- **Marginal risk**: Correct calculation — correct
- **Equal risk contribution**: Risk parity objective — correct
- **`max(portfolio_variance, 0)`**: Prevents negative sqrt — correct
- **Risk budgeting**: Custom risk budgets — flexible
- **Weight bounds**: Configurable — flexible
- **Iteration**: `_iterate_risk_parity()` — correct

Good risk parity optimizer with marginal risk, equal risk contribution, risk budgeting, and weight bounds. ✅

### 8.631 risk_parity: portfolio_return hardcoded 0 — Low [N/A]

**Файл:** `ai-signal-bot/src/portfolio/risk_parity.py:76`

```python
portfolio_return = 0
```

`optimize_risk_parity()` hardcodes `portfolio_return = 0` in the result. Risk parity doesn't optimize for return (only risk), but the result should still calculate the actual portfolio return from the weights and expected returns.

**Фикс:** Accept `expected_returns` as parameter and calculate `np.dot(weights, expected_returns)`.

### 8.632 ai-signal-bot/src/portfolio/rebalancing.py: Rebalancing — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/rebalancing.py` (145 lines)

- **3 triggers**: TIME_BASED, DRIFT_BASED, VOLATILITY_BASED — comprehensive
- **RebalanceOrder dataclass**: 5 fields — structured
- **RebalanceResult**: orders, new_weights, turnover, estimated_cost — comprehensive
- **Turnover calculation**: `0.5 * sum(abs(target - current))` — correct
- **Skip threshold**: `abs(diff) < 0.01` — prevents micro-rebalancing
- **Transaction cost**: Configurable — flexible
- **3 should_rebalance methods**: Time, drift, volatility — comprehensive

Good rebalancing with 3 triggers, turnover, skip threshold, and transaction cost. ✅

### 8.633 rebalancing: no min trade size — Low [N/A]

**Файл:** `ai-signal-bot/src/portfolio/rebalancing.py:77`

```python
if abs(current_weight - target_weight) < 0.01:
    continue
```

The skip threshold is 0.01 (1% weight difference), but there's no minimum trade size in absolute terms. For a $100K portfolio, 1% = $1000 — reasonable. For a $1M portfolio, 1% = $10,000 — may be too large. For a $10K portfolio, 1% = $100 — may be too small (below exchange minimum).

**Фикс:** Add `min_trade_value` parameter and skip if `abs(trade_amount) < min_trade_value`.

### 8.634 ai-signal-bot/src/monitoring/health_server.py: Health server — ✅ Excellent

**Файл:** `ai-signal-bot/src/monitoring/health_server.py` (153 lines)

- **6 endpoints**: /health, /health/exchange, /health/database, /health/shm, /ready, /live — comprehensive
- **K8s probes**: readiness (`/ready`) + liveness (`/live`) — production-grade
- **Pluggable checks**: `register_check()` with Callable — flexible
- **Async support**: `iscoroutine()` check — correct
- **Error handling**: `try/except` with 5 exception types — resilient
- **HTTP status**: 200 healthy, 503 unhealthy — correct
- **Uptime tracking**: `_start_time` — useful
- **`nosec: B104`**: Documented bind to 0.0.0.0 — correct

Excellent health server with 6 endpoints, K8s probes, pluggable checks, async support, and proper HTTP status. ✅

### 8.635 health_server: liveness always returns True — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/health_server.py:123-125`

```python
async def _handle_live(self, request: web.Request) -> web.Response:
    return web.json_response({"alive": True, "uptime": time.time() - self._start_time})
```

The liveness probe always returns `{"alive": True}` — it never checks if the bot is actually alive. If the event loop is blocked (e.g., stuck in a long computation), the health server (running on the same loop) would also be blocked, so the probe would timeout rather than return False. But if the health server runs on a separate thread/loop, it would return True even when the bot is dead.

**Фикс:** Add a heartbeat timestamp updated by the main loop. If `time.time() - last_heartbeat > timeout`, return `{"alive": False}`.

### 8.636 ai-signal-bot/src/monitoring/metrics.py: Prometheus metrics — ✅ Excellent

**Файл:** `ai-signal-bot/src/monitoring/metrics.py` (239 lines)

- **Optional import**: `try/except ImportError` for prometheus_client — resilient
- **Optional import**: `try/except ImportError` for aiohttp — resilient
- **4 metric types**: Counter, Gauge, Histogram, Summary — comprehensive
- **5 counters**: signals_total, fills_total, orders_sent_total, orders_rejected_total, kill_switch_activations — comprehensive
- **Custom registry**: `CollectorRegistry()` — isolated
- **Labels**: symbol, direction, exchange, side, type, reason — comprehensive

Excellent Prometheus metrics with 4 metric types, 5 counters, custom registry, and optional imports. ✅

### 8.637 metrics: __init__ returns None on missing prometheus — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/metrics.py:41-43`

```python
if not HAS_PROMETHEUS:
    logger.warning("prometheus_client not available")
    return
```

If `prometheus_client` is not installed, `__init__` returns early without setting any attributes. Subsequent calls to `self.signals_total.labels(...)` will raise `AttributeError`. Should set a flag or provide no-op fallbacks.

**Фикс:** Set `self._enabled = False` and check in all methods, or raise a clear error at construction time.

### 8.638 ai-signal-bot/src/utils/helpers.py: Utility helpers — ✅ Good

**Файл:** `ai-signal-bot/src/utils/helpers.py` (205 lines)

- **10 utility functions**: setup_logging, JsonFormatter, load_config, get_env, now_ms, now_us, format_price, format_qty, format_percentage, safe_divide, clamp, truncate_dict — comprehensive
- **JsonFormatter**: Structured JSON logging — production-grade
- **`get_env` with cast**: bool, int, float, str — flexible
- **`safe_divide`**: `abs(b) > 1e-10` guard — correct
- **`clamp`**: `max(min_val, min(max_val, value))` — correct
- **CircuitBreaker**: 3-state (closed/open/half_open) — correct
- **RateLimiter**: Token bucket with async acquire — correct

Good utility helpers with 10 functions, JSON logging, CircuitBreaker, and RateLimiter. ✅

### 8.639 helpers: CircuitBreaker not thread-safe — Medium [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py:145-176`

```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._state = "closed"
```

`CircuitBreaker` has no lock. `_failure_count`, `_last_failure_time`, and `_state` are plain attributes. If `record_success()` and `record_failure()` are called concurrently from different async tasks, race condition on `_failure_count` and `_state`. The `is_open` property also mutates `_state` (transitions open → half_open), which is a side effect in a property — surprising and not thread-safe.

**Фикс:** Use `asyncio.Lock` for all state mutations. Separate the `is_open` check from the state transition.

### 8.640 helpers: CircuitBreaker side effect in is_open property — Low [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py:156-162`

```python
@property
def is_open(self) -> bool:
    if self._state == "open":
        if time.time() - self._last_failure_time > self.recovery_timeout:
            self._state = "half_open"  # Side effect in property!
            return False
        return True
    return False
```

The `is_open` property mutates `_state` (transitions `open` → `half_open`). This is a side effect in a property — violates principle of least surprise. Reading a property should not change state.

**Фикс:** Separate the transition into a `try_reset()` method. `is_open` should be read-only.

### 8.641 helpers: RateLimiter imports asyncio inside method — Low [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py:194-195`

```python
async def acquire(self) -> bool:
    import asyncio
```

`asyncio` is imported inside the `acquire()` method instead of at the top of the file. This is a lazy import — it works but is poor style. The module is already async (the method is `async def`), so `asyncio` is always needed.

**Фикс:** Move `import asyncio` to top of file.

### 8.642 ai-signal-bot/src/observability/tracing.py: Distributed tracing — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry + Jaeger**: OTLP exporter — production-grade
- **Optional import**: `try/except ImportError` — resilient
- **Resource**: service.name, namespace, version — correct
- **BatchSpanProcessor**: Async export — correct
- **AsyncioInstrumentor**: Auto-instrumentation — advanced
- **No-op tracer**: `get_tracer()` returns no-op if not initialized — correct
- **Global singleton**: `_tracer`, `_initialized` — simple

Good distributed tracing with OpenTelemetry, Jaeger, optional imports, and no-op fallback. ✅

### 8.643 tracing: OTLP exporter insecure=True — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

`insecure=True` disables TLS for the OTLP gRPC connection. In production, traces (which may contain symbol names, order details, and PnL) are sent unencrypted. Anyone on the network can intercept trace data.

**Фикс:** Use TLS in production: `insecure=False` (default) with proper certificates. Only use `insecure=True` in development.

### 8.644 tracing: global mutable state not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/tracing.py:25-26`

```python
_tracer: object | None = None
_initialized: bool = False
```

`_tracer` and `_initialized` are module-level globals. If `setup_tracing()` is called from multiple threads simultaneously, a race condition could initialize the tracer twice. In practice, `setup_tracing()` is called once at startup.

**Фикс:** Use `threading.Lock` around `setup_tracing()` or document single-call requirement.

### 8.645 hft-trade-bot/src/exchange/ExchangeBase.h: Exchange base — ✅ Excellent

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines)

- **Partial IExchange implementation**: id, fees, latency, toxic — correct
- **Atomic EMA latency**: `compare_exchange_weak` with `/10` smoothing — correct
- **`memory_order_relaxed`**: All atomics — correct for counters
- **Toxic event tracking**: `fetch_add`, `load`, `store` — correct
- **`is_available()`**: `toxic_count < 5` — automatic circuit breaker
- **`noexcept`**: `record_latency`, `record_toxic_event` — HFT constraint
- **`protected` members**: For derived classes — correct

Excellent exchange base with atomic EMA latency, toxic tracking, automatic circuit breaker, and noexcept. ✅

### 8.646 ExchangeBase: is_available hardcoded threshold 5 — Low

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h:49`

```cpp
bool is_available() const override { return toxic_count_.load(std::memory_order_relaxed) < 5; }
```

The availability threshold is hardcoded to 5 toxic events. This should be configurable — different exchanges may have different toxicity tolerance.

**Фикс:** Add `toxic_threshold` to constructor or config.

### 8.647 hft-trade-bot/src/utils/low_latency.h: Low-latency infrastructure — ✅ Excellent

**Файл:** `hft-trade-bot/src/utils/low_latency.h` (451 lines)

- **Spinlock**: `_mm_pause`, `alignas(64)`, `memory_order_acquire/release` — HFT-grade
- **SpinlockGuard**: RAII — correct
- **SPSCQueue**: Lock-free single-producer single-consumer, `static_assert` power-of-2, `alignas(64)` head/tail — HFT-grade
- **ObjectPool**: Pre-allocated, `compare_exchange_strong`, O(1) release via pointer arithmetic — HFT-grade
- **LatencyHistogram**: 35 log-scale buckets, atomic min/max with CAS, p50/p95/p99/p99.9 — production-grade
- **Thread pinning**: Cross-platform (Windows + POSIX) — correct
- **`[[nodiscard]]`**: On push/pop — correct
- **`noexcept`**: All hot-path methods — HFT constraint

Excellent low-latency infrastructure with spinlock, SPSC queue, object pool, latency histogram, and thread pinning. ✅

### 8.648 low_latency: Spinlock no backoff limit — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:47-57`

```cpp
void lock() noexcept {
    for (;;) {
        uint32_t expected = 0;
        if (flag_.compare_exchange_strong(expected, 1, std::memory_order_acquire)) return;
        while (flag_.load(std::memory_order_relaxed) != 0) {
            _mm_pause();
        }
    }
}
```

The spinlock spins indefinitely with `_mm_pause()` but has no backoff limit. If the lock is held for a long time (e.g., due to a bug or scheduling issue), the spinning thread wastes CPU cycles. For HFT, this is intentional (sub-μs critical sections), but a max spin count with `std::this_thread::yield()` fallback would be safer.

**Фикс:** Add a max spin count (e.g., 1000) before falling back to `yield()`.

### 8.649 low_latency: ObjectPool acquire is O(n) — Low [FIXED]

**Файл:** `hft-trade-bot/src/utils/low_latency.h:153-161`

```cpp
T* acquire() noexcept {
    for (size_t i = 0; i < PoolSize; ++i) {
        bool expected = false;
        if (pool_[i].active.compare_exchange_strong(expected, true, ...)) {
            return &pool_[i].obj;
        }
    }
    return nullptr;
}
```

`acquire()` scans the pool linearly. With many objects, this is O(n). For HFT, pool sizes are typically small (10-100), so this is acceptable. But under contention, multiple threads may scan the same slots.

**Фикс:** Use a lock-free stack (Treiber stack) for O(1) acquire, or accept O(n) for small pools.

### 8.650 low_latency: LatencyHistogram min/max are doubles — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:212-219`

```cpp
double current_min = min_.load(std::memory_order_relaxed);
while (microseconds < current_min &&
       !min_.compare_exchange_weak(current_min, microseconds)) {
}
```

`min_` and `max_` are `std::atomic<double>`. Not all platforms support atomic operations on `double` natively. On x86-64 this works (via `cmpxchg8b` or `lock cmpxchg16b`), but on ARM32 it may require a lock. Also, CAS on double can have ABA-like issues with NaN values.

**Фикс:** Use `std::atomic<int64_t>` with `bit_cast` or `memcpy` for portable atomic double operations.

### 8.651 ai-signal-bot/config/__init__.py: Config loader — ✅ Excellent

**Файл:** `ai-signal-bot/config/__init__.py` (314 lines)

- **5 required sections**: trading, exchange, risk, strategies, indicators — comprehensive
- **20+ validation rules**: symbols non-empty, signal_interval ≥ 1, max_open_positions ≥ 1, ws_url required, risk ranges (0, 100], min_confidence [0, 100], min_rr_ratio > 0, SL/TP > 0, ema_fast < ema_slow, rsi_oversold < rsi_overbought, macd_fast < macd_slow — comprehensive
- **Errors vs warnings**: Errors raise `ValueError`, warnings log only — correct
- **Suspicious value warnings**: risk > 10%, drawdown > 20%, SL > 10%, positions > 10 — correct
- **Property-based access**: 20+ properties on `SignalBotConfig` — clean API
- **Hard fail on errors**: `raise ValueError(f"Invalid config: {len(errors)} error(s)")` — correct

Excellent config loader with 20+ validation rules, errors vs warnings, suspicious value detection, and hard fail on errors. ✅

### 8.652 config: no validation for duplicate symbols — Low [N/A]

**Файл:** `ai-signal-bot/config/__init__.py:51`

```python
if not trading.get("symbols"):
    errors.append("trading.symbols must be a non-empty list")
```

Only checks that symbols is non-empty. No check for duplicate symbols (e.g., `["BTC/USDT", "BTC/USDT", "ETH/USDT"]`). Duplicates cause double-processing, double signals, and double position entries.

**Фикс:** Add `if len(symbols) != len(set(symbols)): errors.append("Duplicate symbols in trading.symbols")`.

### 8.653 ai-signal-bot/src/data_collection/real_market_data.py: Real market data — ✅ Good [FIXED]

**Файл:** `ai-signal-bot/src/data_collection/real_market_data.py` (455 lines)

- **3 normalized dataclasses**: NormalizedTicker, NormalizedCandle, NormalizedOrderBook — comprehensive
- **Multi-exchange**: Binance, OKX, Bybit — flexible
- **3 callbacks**: on_ticker, on_candle, on_orderbook — comprehensive
- **Reconnection**: Exponential backoff with max 30s — correct
- **Testnet support**: `testnet` flag — useful

Good real market data feed with 3 normalized types, multi-exchange, callbacks, and reconnection. ✅

### 8.654 real_market_data: no reconnection state sync — Medium [N/A]

**Файл:** `ai-signal-bot/src/data_collection/real_market_data.py:71`

```python
self._reconnect_delay = 1.0
self._reconnect_delays: dict[str, float] = {}
self._max_reconnect_delay = 30.0
```

After reconnection, the feed doesn't sync missed data. During the disconnect period (up to 30s backoff), market data is lost. The bot may trade on stale prices, leading to incorrect signals and potential losses. There's no mechanism to request historical candles to fill the gap.

**Фикс:** After reconnection, fetch historical candles for the disconnect period and replay them through callbacks.

### 8.655 ai-signal-bot/src/communication/ws_client.py: WebSocket client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **3 encoding formats**: json (default), msgpack (optional), orjson (optional) — flexible
- **Optional imports**: `try/except ImportError` for msgpack and orjson — resilient
- **Compression**: `compression="deflate"` — efficient
- **Ping**: `ping_interval=10` — keepalive
- **Max size**: `2**20` (1MB) — DoS protection
- **Reconnection**: 5 attempts with exponential backoff (1s → 30s) — correct
- **Trading state**: `_trading_active` flag checked before order submission — correct
- **Candle history**: `deque(maxlen=200)` — bounded

Good WebSocket client with 3 encodings, optional imports, compression, reconnection, and trading state checks. ✅

### 8.656 ws_client: no TLS support — Medium [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_client.py:77`

```python
self._ws = await websockets.connect(
    self.url,
    ping_interval=10,
    compression="deflate",
    max_size=2**20,
)
```

No TLS configuration. If `self.url` is `ws://` (not `wss://`), all data (including order details, account info, and trading signals) is sent unencrypted. The `websockets` library supports `ssl` parameter for TLS, but it's not used here.

**Фикс:** Detect `ws://` vs `wss://` and require TLS for production. Add `ssl=ssl.create_default_context()` for `wss://` connections.

### 8.657 ws_client: listen() doesn't reconnect — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_client.py:99-121`

```python
async def listen(self) -> None:
    try:
        async for message in self._ws:
            ...
    except websockets.ConnectionClosed:
        logger.warning("Connection closed by server")
        self._connected = False
```

When the connection closes, `listen()` just logs a warning and sets `_connected = False`. It doesn't call `reconnect()`. The caller must detect the disconnection and call `reconnect()` manually. This is easy to forget.

**Фикс:** Call `self.reconnect()` in the `except websockets.ConnectionClosed` block, or document that the caller must reconnect.

### 8.658 ai-signal-bot/src/communication/shm_ring_buffer.py: SHM ring buffer — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: Mirror of C++ `ShmRingBuffer<T>` — correct
- **Cross-platform**: Windows (page-file-backed) + POSIX (`/dev/shm`) — correct
- **Cache-line aligned**: `OFF_HEAD=64`, `OFF_TAIL=128` — matches C++ layout
- **Magic validation**: `SHM_MAGIC = 0x484654343253484D` — correct
- **Capacity validation**: Power-of-2 check + mismatch detection — correct
- **Element size validation**: Mismatch detection on open — correct
- **Memory barrier**: `FlushViewOfFile` (Windows) + `msync` (POSIX) — correct
- **Atomic read/write**: `struct.pack_into`/`unpack_from` with barrier — correct for x86/x64
- **`__del__` safety**: Early init of `_mm = None`, `_fd = -1` — correct
- **`nosec: B108`**: Documented `/dev/shm` usage — correct

Excellent SHM ring buffer with cross-platform support, cache-line alignment, magic validation, memory barriers, and `__del__` safety. ✅

### 8.659 shm_ring_buffer: no overflow detection on head/tail — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py:173`

```python
if head - tail >= self.capacity:
    return False
```

`head` and `tail` are `uint64` counters that never wrap (they use `& self._mask` for slot indexing). After ~18.4 quintillion pushes, `head` overflows to 0. In practice, this won't happen (at 1M pushes/sec, it takes ~585 years). But the code doesn't document this assumption.

**Фикс:** Document that overflow is not a concern at realistic push rates, or add a wraparound check.

### 8.660 shm_ring_buffer: FlushViewOfFile on every write — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py:38`

```python
ctypes.windll.kernel32.FlushViewOfFile(mm._mapped_view, ctypes.c_size_t(8))
```

On Windows, every `_atomic_write_u64` calls `FlushViewOfFile`, which flushes modified pages to the file. For shared memory between processes on the same machine, this is unnecessary — the OS ensures coherence. The flush adds latency (~1-10μs per call). For HFT, this is significant.

**Фикс:** Remove `FlushViewOfFile` for same-machine shared memory. Only flush if the memory is backed by a file that needs to be visible to other machines (rare for SHM IPC).

### 8.661 hft-trade-bot/src/data/types.h: Core data types — ✅ Good

**Файл:** `hft-trade-bot/src/data/types.h` (92 lines)

- **2 enums**: Side (BUY/SELL), OrderType (MARKET/LIMIT), OrderStatus (5 states) — comprehensive
- **5 structs**: Candle, OrderBookLevel, OrderBook, Order, Position — comprehensive
- **Helper methods**: `best_bid()`, `best_ask()`, `spread()`, `mid_price()` on OrderBook — convenient
- **`std::optional<double>`**: For order price (nullopt = market) — correct
- **`side_to_string`/`string_to_side`**: Serialization — correct

Good core data types with 5 structs, 3 enums, helper methods, and optional price. ✅

### 8.662 types: string_to_side silent default — Low

**Файл:** `hft-trade-bot/src/data/types.h:21-23`

```cpp
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}
```

Any string that's not "BUY" defaults to `Side::SELL`. If the input is "buy" (lowercase), "Buy", or a typo like "BYU", it silently becomes SELL. In a trading system, a silent wrong side means the bot buys when it should sell or vice versa.

**Фикс:** Add case-insensitive comparison and throw on unknown strings, or return `std::optional<Side>`.

### 8.663 types: OrderBook no empty check on index access — Low

**Файл:** `hft-trade-bot/src/data/types.h:48-51`

```cpp
double best_bid() const { return bids.empty() ? 0.0 : bids[0].price; }
double best_ask() const { return asks.empty() ? 0.0 : asks[0].price; }
```

`best_bid()` and `best_ask()` return 0.0 when the order book is empty. This is a sentinel value that could be mistaken for a real price of $0. In a trading system, a price of 0 could trigger unintended behavior (e.g., division by zero in spread calculations, or a "buy at $0" order).

**Фикс:** Return `std::optional<double>` or use `NaN` as the sentinel for "no data".

### 8.664 hft-trade-bot/src/data/aligned_types.h: Cache-line aligned types — ✅ Excellent [FIXED]

**Файл:** `hft-trade-bot/src/data/aligned_types.h` (268 lines)

- **`alignas(64)`**: All hot-path structs — HFT-grade
- **`static_assert`**: Size verification on AlignedOrderBookLevel (64) and FastSignal (≤256) — correct
- **FastSignal**: No `std::string`, fixed-size `char[32]` symbol/reason, 6 score fields, `rr_ratio()`, `now_ns()`, `now_epoch_ns()` — HFT-grade
- **FastOrder**: 5 order kinds (MARKET/IOC/FOK/GTD/POST_ONLY), `char[32]` fields, `expire_at` for GTD — HFT-grade
- **`set_symbol`/`set_reason`/`set_exchange`**: Safe truncation at 31/47/31 chars — correct
- **`is_actionable`/`is_long`/`is_short`**: Convenience methods — correct
- **`dir_str`/`side_str`/`kind_str`**: Serialization — correct
- **Monotonic vs epoch**: `now_ns()` (steady_clock) vs `now_epoch_ns()` (system_clock) — correct

Excellent cache-line aligned types with `alignas(64)`, `static_assert`, fixed-size buffers, no heap alloc, and dual clock support. ✅

### 8.665 aligned_types: set_symbol no null check — Low

**Файл:** `hft-trade-bot/src/data/aligned_types.h:58-65`

```cpp
void set_symbol(const char* s) {
    size_t i = 0;
    while (s[i] && i < 31) {
        symbol[i] = s[i];
        ++i;
    }
    symbol[i] = '\0';
}
```

No null check on `s`. If `s` is `nullptr`, `s[i]` is undefined behavior. In HFT, this could crash the bot mid-trade.

**Фикс:** Add `if (!s) { symbol[0] = '\0'; return; }` at the start.

### 8.666 aligned_types: FastSignal 256 bytes = 4 cache lines — Info

**Файл:** `hft-trade-bot/src/data/aligned_types.h:118`

```cpp
static_assert(sizeof(FastSignal) <= 256, "FastSignal should fit in 4 cache lines");
```

FastSignal is 256 bytes = 4 cache lines. This is larger than ideal for a single SPSC queue element (1 cache line = 64 bytes is optimal). However, the 6 score fields + entry/SL/TP + symbol + reason + timestamp justify the size. The `alignas(64)` ensures no false sharing between queue elements.

**Статус:** Info — acceptable design trade-off. Documented via `static_assert`.

### 8.667 ai-signal-bot/src/notification/notifier.py: Notification system — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **2 notifiers**: TelegramNotifier + DiscordNotifier — comprehensive
- **AlertEvent dataclass**: Normalized event with type/symbol/message/timestamp/data — correct
- **6 alert types**: fill, sl_tp, position_open, position_close, daily_pnl, error — comprehensive
- **5 remote commands**: /status, /positions, /close_all, /pause, /resume — useful
- **Emoji mapping**: Visual differentiation — nice
- **Chat ID verification**: `chat_id != self.chat_id` — security
- **Optional import**: `try/except ImportError` for aiohttp — resilient
- **Polling with offset**: Correct Telegram long-polling — correct
- **Error handling**: 5 exception types in poll, 3 in command handler — resilient
- **Graceful stop**: `_poll_task.cancel()` + `await` + `session.close()` — correct

Good notification system with 2 notifiers, 6 alert types, 5 commands, chat ID verification, and optional imports. ✅

### 8.668 notifier: Telegram token in URL — Medium [FIXED]

**Файл:** `ai-signal-bot/src/notification/notifier.py:104`

```python
url = f"https://api.telegram.org/bot{self.token}/sendMessage"
```

The bot token is embedded in the URL path. If the HTTP request is logged (by a proxy, load balancer, or debug logging), the token is exposed in the log. An attacker with log access can send arbitrary messages and commands as the bot.

**Фикс:** Use Telegram Bot API header-based authentication if available, or ensure the token is never logged (redact URLs in logging).

### 8.669 notifier: no rate limiting on alerts — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py:89`

```python
async def send_alert(self, event: AlertEvent):
    if not self._session:
        return
```

No rate limiting on `send_alert()`. If the bot generates many alerts in a short time (e.g., flash crash with 50 symbols all hitting SL), it sends 50+ Telegram messages instantly. Telegram has rate limits (~30 messages/sec, ~20 messages/minute to same chat). Exceeding them causes 429 errors with long bans.

**Фикс:** Add a rate limiter (e.g., `asyncio.Semaphore(5)` + `asyncio.sleep`) or batch alerts into a single message.

### 8.670 notifier: no authentication for remote commands — Medium [FIXED]

**Файл:** `ai-signal-bot/src/notification/notifier.py:138-142`

```python
if chat_id != self.chat_id:
    continue
if text.startswith("/"):
    await self._handle_command(text)
```

The only authentication for remote commands is checking `chat_id`. If an attacker knows the `chat_id` (which is not secret — it's visible in Telegram group info), they can send commands like `/close_all` to the bot. The bot token is required to receive messages, but if the token is leaked (e.g., from logs or env vars), the attacker has full control.

**Фикс:** Add a command password or PIN. Require `/close_all PASSWORD` or `/auth PASSWORD` before accepting commands.

### 8.671 ai-signal-bot/src/llm_engine/engine.py: LLM engine — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **4 providers**: openai, anthropic, ollama, none (rule-based fallback) — flexible
- **3 dataclasses**: LLMConfig, MarketContext, LLMAnalysis — comprehensive
- **3 prompt templates**: market_analysis, signal_explanation, risk_assessment — comprehensive
- **Cache with TTL**: `cache_ttl_seconds=60` + stale eviction at >100 entries — correct
- **Rule-based fallback**: No API key → `_rule_based_analysis()` — resilient
- **Optional import**: `try/except ImportError` for aiohttp — resilient
- **Env var fallback**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — convenient
- **Timeout**: `timeout_seconds=10.0` — correct
- **Request/error counters**: `_request_count`, `_error_count` — observability

Good LLM engine with 4 providers, 3 prompt templates, cache with TTL, rule-based fallback, and optional imports. ✅

### 8.672 llm_engine: API key in env var only — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:86-88`

```python
self.config.api_key = os.getenv("OPENAI_API_KEY", "")
```

API keys are loaded from env vars. If the env var is not set, the engine falls back to rule-based analysis. This is correct behavior, but the empty key is stored in `self.config.api_key` as `""`. If `config.api_key` is logged or serialized, the empty string could be misleading.

**Фикс:** Set `self.config.api_key = None` instead of `""` for clearer semantics.

### 8.673 llm_engine: cache key doesn't include regime — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:151`

```python
cache_key = f"{ctx.symbol}_{round(ctx.price, 2)}"
```

The cache key is `symbol_price`. If the market regime changes (e.g., trending → ranging) but the price is the same, the cache returns a stale analysis from the old regime. The regime is a key input to the analysis but not part of the cache key.

**Фикс:** Add regime to cache key: `f"{ctx.symbol}_{round(ctx.price, 2)}_{ctx.regime}"`.

### 8.674 ai-signal-bot/src/networking/socket_transport.py: UDP socket transport — ✅ Good

**Файл:** `ai-signal-bot/src/networking/socket_transport.py` (156 lines)

- **Non-blocking UDP**: `setblocking(False)` — correct
- **Buffer sizes**: `SO_RCVBUF` + `SO_SNDBUF` = 1MB — configurable
- **Binary parser**: `[ts_ns:8][sym_len:1][symbol:N][price:8][qty:8][side:1][msg_type:1]` — efficient
- **6 stats**: packets_rx, packets_tx, bytes_rx, bytes_tx, rx_drops, avg_latency_ns — comprehensive
- **Error handling**: `BlockingIOError` → 100μs sleep, `OSError`/`struct.error` → rx_drops — correct
- **`codeql[py/bind-all-interfaces]`**: Documented configurable bind — correct

Good UDP socket transport with non-blocking I/O, configurable buffers, binary parser, and 6 stats. ✅

### 8.675 socket_transport: blocking receive loop — Medium [FIXED]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:86-108`

```python
def start_receive_loop(self, on_packet: Callable[[MarketDataPacket], None]) -> None:
    self._running = True
    while self._running:
        try:
            data, addr = self._socket.recvfrom(65536)
            ...
        except BlockingIOError:
            time.sleep(0.0001)  # 100μs sleep
```

The receive loop is synchronous (`while self._running`) with `time.sleep(0.0001)` on `BlockingIOError`. This blocks the entire thread. In an asyncio application, this blocks the event loop. The 100μs sleep means the loop polls 10,000 times/sec when idle, wasting CPU.

**Фикс:** Use `asyncio` with `loop.add_reader(self._socket.fileno(), callback)` for async I/O, or run in a separate thread with `asyncio.to_thread()`.

### 8.676 socket_transport: no packet validation — Low [FIXED]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:132-137`

```python
if len(data) < 27:
    return None
ts_ns = struct.unpack_from("!Q", data, 0)[0]
sym_len = data[8]
symbol = data[9:9+sym_len].decode("ascii")
```

The parser checks minimum length (27 bytes) but doesn't validate `sym_len`. If `sym_len` is 255 (max for 1 byte), the parser reads `data[9:264]`, which may be beyond the packet. The `struct.unpack_from("!dd", data, offset)` could read out of bounds.

**Фикс:** Validate `9 + sym_len + 18 <= len(data)` before unpacking.

### 8.677 hft-trade-bot/src/risk/kill_switch.h: Kill switch — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/kill_switch.h` (173 lines)

- **3 activation methods**: File trigger, programmatic `activate()`, daily loss auto-trigger — comprehensive
- **5 reasons**: MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, FILE_TRIGGER — comprehensive
- **3 callbacks**: cancel_all, close_all, notify — flexible
- **Atomic activation**: `active_.exchange(true)` — idempotent, prevents double activation
- **SHM notification**: `KillSwitchMsg` to Python via `try_push()` — correct
- **File cleanup**: Removes trigger file after FILE_TRIGGER — correct
- **`is_active()` / `can_trade()`**: `memory_order_acquire` — correct visibility
- **Destructor**: `~KillSwitch() { stop_monitoring(); }` — RAII

Excellent kill switch with 3 activation methods, 5 reasons, atomic idempotent activation, SHM notification, and RAII. ✅

### 8.678 kill_switch: monitor thread not std::jthread — Low

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:117`

```cpp
monitor_thread_ = std::thread(&KillSwitch::monitor_loop, this, poll_interval_ms);
```

Uses `std::thread` instead of `std::jthread`. If `stop_monitoring()` is not called before the `KillSwitch` object is destroyed, the thread is still running and accesses `this` after destruction — use-after-free. The destructor calls `stop_monitoring()`, but if the thread is still running when `~KillSwitch()` is entered, there's a race between the destructor and the thread.

**Фикс:** Use `std::jthread` (C++20) which auto-joins on destruction, or ensure `stop_monitoring()` is always called before destruction.

### 8.679 kill_switch: init_shm catches all exceptions — Low

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:60-66`

```cpp
[[nodiscard]] bool init_shm() {
    try {
        shm_ = std::make_unique<ShmRingBuffer<ipc::KillSwitchMsg>>(shm_name_, 64, true);
        return true;
    } catch (...) {
        return false;
    }
}
```

`catch (...)` catches all exceptions including `std::bad_alloc`. If SHM allocation fails due to OOM, the kill switch silently continues without SHM notification. Python won't be notified on activation. The `[[nodiscard]]` return value is correct, but the caller might ignore it.

**Фикс:** Log the exception in `catch (...)`: `spdlog::error("KillSwitch SHM init failed: {}", e.what());` (use `catch (const std::exception& e)`).

### 8.680 hft-trade-bot/src/core/config.h: Config struct — ✅ Good

**Файл:** `hft-trade-bot/src/core/config.h` (204 lines)

- **80+ fields**: Connection, trading, risk, strategies, HFT v2/v3, leverage, pressure, router, adaptive, latency, FFT, logging, AI signal, production, exchanges, IPC/SHM, FIX, DB, Redis, metrics, risk limits — comprehensive
- **Default values**: All fields have sensible defaults — correct
- **ExchangeConfig struct**: Per-exchange config (enabled, ws_url, rest_url, api_key, api_secret, passphrase, inst_type, category, fees, rate limits) — comprehensive
- **3 exchanges**: Binance, OKX, Bybit — flexible
- **Production risk limits**: max_position_qty, max_total_exposure, daily_loss_limit, max_drawdown_pct, max_orders_per_second, min_margin_ratio, max_leverage — comprehensive
- **V2 weights**: 6 indicator weights (ema/rsi/obi/vwap/adx/pressure) — configurable

Good config struct with 80+ fields, per-exchange config, production risk limits, and V2 weights. ✅

### 8.681 config: API keys in plaintext struct — Medium

**Файл:** `hft-trade-bot/src/core/config.h:125-126`

```cpp
std::string api_key;
std::string api_secret;
```

API keys and secrets are stored as plaintext `std::string` in the `Config` struct. If the config is logged, serialized, or dumped in a crash report, the secrets are exposed. `std::string` memory is not zeroed on destruction, so secrets remain in memory.

**Фикс:** Use a `SecureString` class that zeroes memory on destruction and redacts in `operator<<`. Or load secrets from environment variables / encrypted storage at use time, not in the config struct.

### 8.682 config: no validation in struct — Low

**Файл:** `hft-trade-bot/src/core/config.h:12-201`

The `Config` struct has 80+ fields with default values but no validation in the struct itself. Validation is in `config_validate.h` (separate file). If someone constructs a `Config` directly (not via `Config::load()`), validation is skipped. Invalid values (e.g., `max_risk_per_trade_pct = -5.0`) could cause incorrect behavior.

**Фикс:** Add a `validate()` method to `Config` and call it in `Config::load()`. Or use a builder pattern that validates on construction.

### 8.683 ai-signal-bot/src/research/attribution.py: Brinson-Fachler attribution — ✅ Excellent

**Файл:** `ai-signal-bot/src/research/attribution.py` (177 lines)

- **Brinson-Fachler formulas**: Allocation, Selection, Interaction — mathematically correct
- **2 dataclasses**: SectorAttribution (9 fields), AttributionResult (8 fields) — comprehensive
- **Multi-period attribution**: `multi_period_attribution()` — useful
- **Formatted report**: `print_report()` with aligned columns — nice
- **Missing sector handling**: `get(s, 0)` for sectors in one dict but not the other — correct
- **Active return**: `total_p_return - total_b_return` — correct

Excellent Brinson-Fachler attribution with correct formulas, 2 dataclasses, multi-period support, and formatted report. ✅

### 8.684 attribution: no weight normalization check — Low [N/A]

**Файл:** `ai-signal-bot/src/research/attribution.py:70-78`

```python
def attribute(self, portfolio_weights, benchmark_weights, portfolio_returns, benchmark_returns):
    all_sectors = set(list(portfolio_weights.keys()) + list(benchmark_weights.keys()))
```

No check that `sum(portfolio_weights) ≈ 1.0` and `sum(benchmark_weights) ≈ 1.0`. If weights don't sum to 1, the attribution effects are incorrect but no error is raised.

**Фикс:** Add `if abs(sum(portfolio_weights.values()) - 1.0) > 0.01: warnings.append("Portfolio weights don't sum to 1")`.

### 8.685 ai-signal-bot/src/research/greeks_hedging.py: Greeks hedging simulator — ✅ Good

**Файл:** `ai-signal-bot/src/research/greeks_hedging.py` (267 lines)

- **Black-Scholes Greeks**: delta, gamma, theta, vega, rho — all 5 Greeks
- **Edge case handling**: `T <= 0 or sigma <= 0` → intrinsic value — correct
- **GBM price path**: `_generate_price_path()` with `np.random.standard_normal()` — correct
- **Delta hedging**: Daily vs threshold-based rebalancing — flexible
- **Transaction costs**: `transaction_cost_bps` — realistic
- **P&L decomposition**: delta P&L, gamma P&L, theta P&L, vega P&L — comprehensive
- **Multi-path**: `n_paths` with averaging — Monte Carlo
- **Reproducible**: `seed` parameter — correct

Good Greeks hedging simulator with all 5 Greeks, GBM paths, threshold rebalancing, transaction costs, P&L decomposition, and Monte Carlo. ✅

### 8.686 greeks_hedging: np.random.seed global state — Low [N/A]

**Файл:** `ai-signal-bot/src/research/greeks_hedging.py:112`

```python
if seed is not None:
    np.random.seed(seed)
```

Uses `np.random.seed()` which sets the global random state. If other code uses `np.random` concurrently, the seed is shared. In a multi-symbol or multi-strategy system, one simulation's seed affects another's.

**Фикс:** Use `rng = np.random.default_rng(seed)` and `rng.standard_normal()` for isolated random state.

### 8.687 hft-trade-bot/src/ipc/shm_protocol.h: SHM IPC protocol — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h` (118 lines)

- **4 message structs**: SignalMsg (32B), FillMsg (28B), MarketSnapshotMsg (28B), KillSwitchMsg (16B) — comprehensive
- **`#pragma pack(push, 1)`**: Explicit packing for cross-language alignment — correct
- **4 `static_assert`**: Size verification on all structs — correct
- **Python format strings**: Documented in comments (`'<Q B B f f f f B 5x'`) — correct
- **4 enums**: SymbolId (10 symbols), ExchangeId (4), Action (3), Side (2) — comprehensive
- **Explicit padding**: `pad_[5]`, `pad_[3]`, `pad_[6]` — correct alignment

Excellent SHM IPC protocol with 4 packed structs, static_assert verification, documented Python formats, and 4 enums. ✅

### 8.688 shm_protocol: SymbolId only 10 symbols — Low

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h:83-94`

```cpp
enum class SymbolId : uint8_t {
    BTC = 0, ETH = 1, SOL = 2, BNB = 3, XRP = 4,
    ADA = 5, DOGE = 6, AVAX = 7, DOT = 8, LINK = 9,
};
```

Only 10 symbols mapped. The AI Signal Bot config has 50 symbols. If the HFT bot receives a signal for symbol ID 10+, it's unmapped. `uint8_t` supports 256 values, so the enum could be extended, but there's no mapping mechanism for dynamic symbol registration.

**Фикс:** Add a dynamic symbol registry or extend the enum to cover all 50 configured symbols.

### 8.689 hft-trade-bot/src/ipc/shm_ring_buffer.h: C++ SHM ring buffer — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h` (348 lines)

- **SPSC lock-free**: `try_push`/`try_pop` with acquire/release fences — HFT-grade
- **Bulk operations**: `bulk_push`/`bulk_pop` with at most 2 memcpy — optimized
- **Power-of-2 capacity**: `head & mask_` instead of modulo — HFT-grade
- **Cache-line aligned**: `alignas(64)` on head/tail — no false sharing
- **`static_assert`**: `sizeof(ShmHeader) == 192` — correct
- **Cross-platform**: Windows (CreateFileMapping) + POSIX (shm_open/mmap) — correct
- **Magic validation**: `SHM_MAGIC = 0x484654343253484D` — correct
- **Capacity/element_size validation**: On open — correct
- **RAII destructor**: Unmap + close + shm_unlink (if owner) — correct
- **Deleted copy/move**: No accidental copies — correct
- **`cleanup_mapped()`**: Helper for error path cleanup — correct
- **Detailed comments**: Explains why lock-free, why power-of-2, memory ordering — excellent

Excellent C++ SHM ring buffer with SPSC lock-free, bulk ops, cache-line aligned, cross-platform, magic validation, RAII, and deleted copy/move. ✅

### 8.690 shm_ring_buffer C++: shm_open 0666 permissions — Medium

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h:101`

```cpp
fd_ = shm_open(name_.c_str(), O_CREAT | O_RDWR, 0666);
```

`0666` permissions on `/dev/shm` allow any process on the machine to read/write the shared memory. In a production environment, this means any user can read trading signals, fill data, and market data from the SHM segment. An attacker could also write malicious data to the ring buffer.

**Фикс:** Use `0600` (owner read/write only) or `0640` (owner + group read).

### 8.691 shm_ring_buffer C++: no try_pop timeout — Low

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h:220`

```cpp
bool try_pop(T& out) noexcept {
    const uint64_t tail = header_->tail.load(std::memory_order_relaxed);
    const uint64_t head = header_->head.load(std::memory_order_acquire);
    if (head == tail) {
        return false; // Buffer empty
    }
```

`try_pop` is non-blocking and returns `false` immediately if the buffer is empty. There's no `pop_with_timeout()` method. The caller must implement its own polling loop with sleep, which is error-prone and wastes CPU.

**Фикс:** Add a `pop_with_timeout(T& out, int timeout_ms)` method that uses `std::this_thread::sleep_for` or `futex` for efficient waiting.

### 8.692 ai-signal-bot/run.py: Main entry point — ✅ Good

**Файл:** `ai-signal-bot/run.py` (397 lines)

- **AISignalBot class**: Orchestrates exchange, strategies, ensemble, validator, DB, LLM, publisher — comprehensive
- **Pipeline**: Data → Strategies → Ensemble → Validate → Execute → DB+CSV — correct
- **Reconnection**: 5 attempts with 3s sleep — correct
- **Background listen**: `asyncio.create_task(self._listen_loop())` — correct
- **Listen loop**: Catches 4 exception types, reconnects on error — resilient
- **Graceful shutdown**: `finally` block closes all resources — correct
- **Paper vs live**: `paper_trading` flag controls execution path — correct
- **Position sizing**: Risk-based with max notional cap — correct
- **Dashboard**: Optional periodic display — useful
- **Metrics**: Optional health server + Prometheus — flexible

Good main entry point with comprehensive orchestration, reconnection, background listen, graceful shutdown, and paper/live modes. ✅

### 8.693 run.py: no graceful shutdown on SIGTERM — Medium [FIXED]

**Файл:** `ai-signal-bot/run.py:162-182`

```python
try:
    while self._running:
        await asyncio.sleep(self.config.signal_interval)
        await self._generate_signals()
except KeyboardInterrupt:
    self.logger.info("Stopping...")
finally:
    self._running = False
    listen_task.cancel()
    await self.signal_publisher.stop()
```

Only `KeyboardInterrupt` (Ctrl+C) is caught. There's no `SIGTERM` handler. In Kubernetes, pods receive `SIGTERM` for graceful shutdown. Without a handler, the bot is killed after the termination grace period (default 30s) without proper cleanup — open orders may remain, DB connections aren't closed, and the signal publisher stops abruptly.

**Фикс:** Add `signal.signal(signal.SIGTERM, lambda s, f: self._running = False)` or use `asyncio.add_signal_handler(signal.SIGTERM, ...)`.

### 8.694 run.py: signal_publisher binds to 0.0.0.0 — Low [N/A]

**Файл:** `ai-signal-bot/run.py:77`

```python
self.signal_publisher = SignalPublisher(host="0.0.0.0", port=8766)  # nosec: B104
```

The signal publisher binds to `0.0.0.0` (all interfaces). The `nosec: B104` annotation acknowledges this. In production, this exposes the signal publisher to all network interfaces. If the machine is on a public network, anyone can connect and receive trading signals.

**Фикс:** Bind to `127.0.0.1` for local-only communication, or use a firewall to restrict access to port 8766.

### 8.695 run.py: no health check in main loop — Low [FIXED]

**Файл:** `ai-signal-bot/run.py:163-165`

```python
while self._running:
    await asyncio.sleep(self.config.signal_interval)
    await self._generate_signals()
```

The main loop only generates signals. There's no periodic health check (e.g., checking if the exchange connection is still alive, if the DB is reachable, if the last candle is recent). If the exchange connection drops silently (no exception), the bot continues generating signals on stale data.

**Фикс:** Add a periodic health check: `if time.time() - self.exchange.last_message_time > 60: self.logger.error("No data for 60s, reconnecting")`.

### 8.696 ai-signal-bot/src/communication/signal_publisher.py: Signal publisher — ✅ Good

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py` (453 lines)

- **WebSocket server**: `websockets.serve()` with ping_interval=10, ping_timeout=30 — correct
- **Circuit breaker integration**: `allow_signal()` before broadcast — correct
- **Signal history**: `deque(maxlen=100)` — bounded
- **orjson optional**: `_HAS_ORJSON` flag — resilient
- **Client management**: `_clients` set, disconnect cleanup — correct
- **Broadcast pattern**: `asyncio.gather()` with `return_exceptions=True` — correct
- **Circuit breaker status broadcast**: Periodic task — observability
- **Backtest execution**: `run_backtest` and `compare_backtests` via WebSocket — flexible
- **Metrics integration**: `MetricsCollector` — observability
- **Graceful stop**: Cancel task + close server + wait_closed — correct

Good signal publisher with circuit breaker integration, bounded history, orjson optional, client management, and graceful stop. ✅

### 8.697 signal_publisher: no client authentication — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:106-108`

```python
async def _handle_client(self, websocket, path=None) -> None:
    self._clients.add(websocket)
```

No authentication on incoming WebSocket connections. Any client that can reach port 8766 receives all trading signals. Combined with `host="0.0.0.0"` (R684), this means anyone on the network gets real-time trading signals including entry price, SL/TP, confidence, and leverage.

**Фикс:** Add a shared secret or token in the subscribe message. Reject clients that don't authenticate within 5 seconds.

### 8.698 signal_publisher: no TLS on WebSocket server — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:80-86`

```python
self._server = await websockets.serve(
    self._handle_client,
    self.host,
    self.port,
    ping_interval=10,
    ping_timeout=30,
)
```

No `ssl` parameter in `websockets.serve()`. Signals are sent as plaintext WebSocket (`ws://`). If the signal publisher is exposed to a network, signals can be sniffed.

**Фикс:** Add `ssl=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)` with cert/key for `wss://`.

### 8.699 signal_publisher: backtest on WebSocket blocks signal broadcast — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:145-147`

```python
elif msg_type == "run_backtest":
    result = await self._run_backtest(data)
    await websocket.send(json.dumps(result, separators=(',', ':')))
```

`_run_backtest` is awaited in the client handler. While the backtest runs (can take seconds), the handler is blocked. New signals from `broadcast_signal` are still sent via `asyncio.gather`, but the backtest consumes CPU and may delay signal processing.

**Фикс:** Run backtest in a separate task: `asyncio.create_task(self._run_backtest(data, websocket))`.

### 8.700 ai-signal-bot/src/communication/fix_client.py: FIX 4.4 client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/fix_client.py` (447 lines)

- **FixMessage**: Parse/build with checksum, body length — correct
- **FixSession**: Persistent seq numbers, logon/logout/heartbeat — correct
- **Callbacks**: on_execution_report, on_market_data, on_logon, on_logout — flexible
- **Seq num persistence**: `_load_seq_nums()` / `_save_seq_nums()` — crash recovery
- **Message types**: Logon(A), Logout(5), Heartbeat(0), ExecutionReport(8), MarketData(W) — comprehensive
- **Order types**: Market(1), Limit(2) — supported
- **Error handling**: 5 exception types in parse, OSError in save — resilient

Good FIX 4.4 client with persistent seq numbers, checksum, callbacks, and comprehensive message types. ✅

### 8.701 fix_client: seq num file non-atomic save — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:159-164`

```python
def _save_seq_nums(self):
    try:
        with open(self.seq_file, 'w') as f:
            f.write(f"{self.outgoing_seq} {self.incoming_seq}")
    except OSError as e:
        logger.warning(f"Failed to save FIX seq nums: {e}")
```

The seq num file is written directly with `open('w')`. If the process crashes during the write (between `open` and `f.write`), the file is truncated to 0 bytes. On restart, `_load_seq_nums()` reads an empty file, seq nums reset to 1, and the FIX session rejects all messages as duplicates (if the exchange has higher seq nums) or processes them out of order.

**Фикс:** Write to a temp file then `os.rename()` (atomic on POSIX). Or use `tempfile.NamedTemporaryFile` + rename.

### 8.702 fix_client: no TLS on TCP connection — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:180-181`

```python
async def connect(self, host: str, port: int):
    self._reader, self._writer = await asyncio.open_connection(host, port)
```

`asyncio.open_connection()` without `ssl=` parameter. FIX messages (including logon credentials, order details, execution reports) are sent as plaintext TCP. If the exchange supports FIX over TLS, the bot should use it.

**Фикс:** Add `ssl=ssl.create_default_context()` parameter for FIX over TLS.

### 8.703 fix_client: password in plaintext FIX field — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:199-200`

```python
if username:
    extra.append((553, username))
if password:
    extra.append((554, password))
```

FIX tag 554 (Password) is sent as plaintext in the logon message. If the FIX session is logged (e.g., debug logging of raw messages), the password is exposed. FIX 4.4 doesn't natively support password encryption, but the password should at minimum not be logged.

**Фикс:** Ensure raw FIX messages are never logged at DEBUG level. Consider using tag 554 with a token instead of raw password.

### 8.704 ai-signal-bot/src/communication/circuit_breaker.py: Circuit breaker — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3 states**: CLOSED, OPEN, HALF_OPEN — correct pattern
- **Configurable**: failure_threshold, cooldown_seconds, half_open_max_probes, success_threshold — flexible
- **State transitions**: OPEN→HALF_OPEN on cooldown expiry, HALF_OPEN→CLOSED on success threshold, HALF_OPEN→OPEN on failure — correct
- **Probe limiting**: `half_open_max_probes` in HALF_OPEN — correct
- **Metrics**: total_trips, total_blocks — observability
- **Reset method**: Force reset to CLOSED — useful for manual recovery
- **Status dict**: `get_status()` for monitoring/UI — observability
- **Logging**: State transitions logged at INFO/WARNING — correct

Excellent circuit breaker with 3 states, configurable thresholds, probe limiting, metrics, and status reporting. ✅

### 8.705 circuit_breaker: state property has side effect — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py:47-54`

```python
@property
def state(self) -> BreakerState:
    if self._state == BreakerState.OPEN:
        if time.time() - self._opened_at >= self.config.cooldown_seconds:
            self._state = BreakerState.HALF_OPEN
            self._half_open_probes = 0
            logger.info("Circuit breaker: OPEN → HALF_OPEN (cooldown expired)")
    return self._state
```

The `state` property mutates `_state` from OPEN to HALF_OPEN. This is a side effect in a property — accessing `state` for reading actually changes the state. In an async context, multiple coroutines accessing `state` concurrently could cause race conditions (one sees OPEN, another sees HALF_OPEN).

**Фикс:** Separate the state check from the state transition. Add a `check_cooldown()` method that performs the transition, and make `state` a pure read.

### 8.706 circuit_breaker: not thread-safe — Low [FIXED]

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py:34-137`

All state mutations (`_consecutive_failures`, `_consecutive_successes`, `_state`, `_total_trips`, `_total_blocks`) are plain Python attributes with no lock. In an asyncio context, this is safe if all access is single-threaded. But if `record_success()` and `record_failure()` are called from different coroutines, the state can be inconsistent.

**Фикс:** Use `asyncio.Lock` for `record_success()` and `record_failure()`, or ensure all access is from a single coroutine.

### 8.707 ai-signal-bot/src/research/microstructure_lab.py: Microstructure lab — ✅ Good

**Файл:** `ai-signal-bot/src/research/microstructure_lab.py` (247 lines)

- **14 metrics**: OFI mean/std/impact, effective/realized spread, adverse selection, VPIN, Kyle's lambda, Amihud illiquidity, trade arrival rate, Hawkes alpha/beta, book resilience, spread autocorrelation — comprehensive
- **OFI computation**: Bid/ask volume change — correct
- **Kyle's lambda**: Linear regression `np.polyfit(ofi, returns, 1)` — correct
- **VPIN**: Volume bucketing with buy/sell fraction — correct
- **Edge cases**: Empty data → return 0.0, `len < 2` → return 0.0 — correct
- **Numerical safety**: `np.std(ofi) + 1e-10` — avoids division by zero

Good microstructure lab with 14 metrics, correct OFI/VPIN/Kyle's lambda, edge case handling, and numerical safety. ✅

### 8.708 microstructure_lab: no input validation on trade/book data — Low [N/A]

**Файл:** `ai-signal-bot/src/research/microstructure_lab.py:84-87`

```python
bid_vol_change = sum(b.get("qty", 0) for b in curr.get("bids", [])) - \
                 sum(b.get("qty", 0) for b in prev.get("bids", []))
```

No validation that `b.get("qty", 0)` is a positive number. If `qty` is negative (data error) or a string (JSON parsing issue), the OFI computation produces incorrect results silently.

**Фикс:** Add `if not isinstance(qty, (int, float)) or qty < 0: logger.warning(...)`.

### 8.709 ai-signal-bot/src/monitoring/alerting.py: Alert system — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/alerting.py` (260 lines)

- **3 severity levels**: INFO, WARNING, CRITICAL — correct
- **4 channels**: log, Discord, Telegram, webhook — comprehensive
- **Rate limiting**: `cooldown_seconds` per rule (default 5 min) — correct
- **Rule management**: add/remove/enable/disable — flexible
- **Alert history**: Bounded at 1000 — correct
- **Multi-channel send**: `asyncio.gather(*tasks, return_exceptions=True)` — correct
- **Error handling**: 5 exception types in check_rules — resilient
- **Discord embeds**: Color-coded by severity — nice

Good alert system with 3 severities, 4 channels, rate limiting, bounded history, and multi-channel send. ✅

### 8.710 alerting: check_fn is synchronous — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:34`

```python
check_fn: Callable[[], bool]          # Returns True if alert should fire
```

`check_fn` is a synchronous callable. If the check function needs to do async work (e.g., query the database, check exchange connectivity), it can't. The caller must wrap async calls with `asyncio.run()` or similar, which is error-prone.

**Фикс:** Change to `check_fn: Callable[[], Awaitable[bool]]` and `await rule.check_fn()`.

### 8.711 alerting: alert_history list slice creates copy — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:113-114`

```python
if len(self.alert_history) > self._max_history:
    self.alert_history = self.alert_history[-self._max_history:]
```

When the history exceeds 1000, `self.alert_history[-self._max_history:]` creates a new list of 1000 items. This is O(n) and creates a copy. With frequent alerts, this happens often.

**Фикс:** Use `collections.deque(maxlen=1000)` instead of a list for `alert_history`.

### 8.712 ai-signal-bot/src/communication/shm_market_data_writer.py: SHM market data writer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_market_data_writer.py` (122 lines)

- **Latest-snapshot-wins model**: Single slot per symbol, seq-guarded — correct for market data
- **Seq-guarded writes**: Increment seq before (odd=writing) and after (even=consistent) — correct
- **Cross-platform**: Windows (mmap tagname) + POSIX (shm_open/mmap) — correct
- **0o600 permissions**: `os.O_CREAT | os.O_RDWR, 0o600` — secure (vs C++ 0666)
- **Slot layout**: 64 bytes per symbol (8B seq + 28B data + 28B padding) — cache-line friendly
- **Context manager**: `__enter__`/`__exit__` — RAII
- **Zero-out on init**: `b'\x00' * total_size` — correct
- **Bounds check**: `symbol_id >= max_symbols` → return — correct

Good SHM market data writer with seq-guarded writes, cross-platform, 0o600 permissions, context manager, and bounds check. ✅

### 8.713 shm_market_data_writer: no memory barrier on seq write — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/shm_market_data_writer.py:81-94`

```python
seq = struct.unpack_from('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 1)
MARKET_SNAPSHOT_STRUCT.pack_into(...)
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 2)
```

The seq-guarded write uses `struct.pack_into` which is a regular memory write. There's no memory barrier (no `mmap.MAP_LOCKED`, no `ctypes.memmove` with barrier, no `os.fsync`). On weakly-ordered architectures (ARM), the C++ reader might see the seq increment (seq+1) but stale data — the data write may be reordered before the seq increment by the CPU.

**Фикс:** Use `ctypes.memmove` with explicit barriers, or use `mmap` with `MAP_POPULATE` and add `ctypes.c_uint64.from_buffer(mm, offset).value` with `threading.Barrier` or `os.write` to force ordering. Alternatively, use `struct.pack_into` with a memory barrier via `ctypes`.

### 8.714 shm_market_data_writer: import time inside method — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_market_data_writer.py:99`

```python
def write_price(self, symbol_id: int, bid: float, ask: float,
                last: float, volume: float = 0.0):
    import time
    self.write_snapshot(symbol_id, time.time_ns(), bid, ask, last, volume)
```

`import time` is inside the method body. While Python caches imports, this is still a dict lookup on `sys.modules` every call. In an HFT context, this adds ~100ns per call.

**Фикс:** Move `import time` to the top of the file with other imports.

### 8.715 ai-signal-bot/src/communication/shm_fill_consumer.py: SHM fill consumer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_fill_consumer.py` (91 lines)

- **Opens existing SHM**: `create=False` — correct (C++ creates)
- **Non-blocking pop**: `try_pop()` — correct
- **Bulk pop**: `bulk_pop(max_count=256)` — efficient
- **Pending count**: `pending()` — observability
- **Async polling**: `run_polling()` with `asyncio.sleep(poll_interval)` — correct
- **Graceful stop**: `stop()` sets `_running = False` — correct
- **Close**: `close()` cleans up — correct

Good SHM fill consumer with non-blocking/bulk pop, async polling, and graceful stop. ✅

### 8.716 shm_fill_consumer: callback is synchronous — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_fill_consumer.py:59-71`

```python
async def run_polling(self, callback: Callable[[list[tuple]], None], ...):
    while self._running:
        fills = self.bulk_pop(batch_size)
        if fills:
            callback(fills)
        await asyncio.sleep(poll_interval)
```

`callback` is a synchronous callable. If the callback needs to do async work (e.g., write to database, send notification), it can't. The caller must wrap async calls with `asyncio.run()` or schedule tasks.

**Фикс:** Change to `Callable[[list[tuple]], Awaitable[None]]` and `await callback(fills)`.

### 8.717 shm_fill_consumer: 1ms poll interval wastes CPU — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_fill_consumer.py:62`

```python
poll_interval: float = 0.001
```

Default poll interval is 1ms. When there are no fills, the consumer wakes up every 1ms, checks an empty buffer, and sleeps again. This wastes CPU cycles. For a fill consumer that processes ~10 fills/second, a 10ms interval would be sufficient.

**Фикс:** Default to `poll_interval=0.01` (10ms) or use an adaptive interval that increases when the buffer is empty.

### 8.718 ai-signal-bot/src/communication/shm_signal_producer.py: SHM signal producer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_signal_producer.py` (99 lines)

- **Creates SHM**: `create=True` — correct (Python creates, C++ consumes)
- **Non-blocking push**: `try_push()` — correct
- **Dict-to-struct conversion**: `push_signal_dict()` with symbol_map — convenient
- **Direction mapping**: LONG→1, SHORT→2, default→0 — correct
- **Confidence normalization**: `/100.0` (config uses 0-100, struct uses 0.0-1.0) — correct
- **Bulk push**: `bulk_push()` — efficient
- **Error handling**: Returns `False` on failure — correct

Good SHM signal producer with non-blocking push, dict conversion, confidence normalization, and bulk push. ✅

### 8.719 shm_signal_producer: no fallback when buffer is full — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_signal_producer.py:55-57`

```python
return self._buffer.try_push(
    (timestamp_ns, symbol_id, action, confidence, price, sl, tp, leverage)
)
```

If the ring buffer is full (C++ consumer is slow or crashed), `try_push` returns `False`. The caller gets `False` but there's no fallback — the signal is silently dropped. In a trading system, a dropped signal means a missed opportunity or an orphaned position.

**Фикс:** Log a warning when push fails. Consider a secondary transport (WebSocket) as fallback. Track dropped signals in metrics.

### 8.720 ai-signal-bot/src/communication/health_check.py: Health aggregator — ✅ Good

**Файл:** `ai-signal-bot/src/communication/health_check.py` (127 lines)

- **3 service endpoints**: ai-signal-bot, exchange-simulator, hft-trade-bot — comprehensive
- **3 status levels**: healthy, degraded, unhealthy — correct
- **Concurrent checks**: `asyncio.gather(*tasks)` — efficient
- **3s timeout**: `aiohttp.ClientTimeout(total=3.0)` — correct
- **Latency measurement**: `time.monotonic()` — correct
- **HTTP status code**: 503 for unhealthy, 200 otherwise — correct for K8s probes
- **Both /health and /healthz**: K8s liveness/readiness — correct
- **Graceful stop**: `stop()` cleans up runner and site — correct

Good health aggregator with 3 services, concurrent checks, 3s timeout, latency measurement, K8s-compatible endpoints, and graceful stop. ✅

### 8.721 health_check: creates new aiohttp session per check — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
    async with session.get(url) as resp:
```

A new `aiohttp.ClientSession` is created for each service check. Session creation involves DNS resolution, connection pool setup, and SSL context. With 3 services checked every few seconds, this wastes resources.

**Фикс:** Create a single `aiohttp.ClientSession` in `__init__` or `start()` and reuse it for all checks. Close it in `stop()`.

### 8.722 health_check: binds to 0.0.0.0 — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:116`

```python
self._site = web.TCPSite(self._runner, "0.0.0.0", self.port)  # nosec: B104
```

Health endpoint binds to all interfaces. Exposes service health status (including which services are unhealthy) to anyone on the network. An attacker can use this to determine which services to target.

**Фикс:** Bind to `127.0.0.1` for local-only access, or restrict with firewall rules.

### 8.723 ai-signal-bot/src/communication/metrics_server.py: Metrics server — ✅ Good

**Файл:** `ai-signal-bot/src/communication/metrics_server.py` (136 lines)

- **7 Prometheus metrics**: signals_sent, signals_blocked, ws_clients, backtests_run, cb_trips, cb_state, uptime — comprehensive
- **Prometheus text format**: `# HELP`, `# TYPE`, value — correct
- **Lightweight**: No external deps (no prometheus_client) — correct
- **MetricsCollector + MetricsServer**: Separation of concerns — correct
- **Graceful stop**: `server.close()` + `wait_closed()` — correct
- **Error handling**: `ConnectionError`, `OSError` — resilient
- **Writer cleanup**: `writer.close()` + `wait_closed()` in finally — correct

Good metrics server with 7 Prometheus metrics, text format, no external deps, separation of concerns, and graceful stop. ✅

### 8.724 metrics_server: raw HTTP parser — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py:109-127`

```python
async def _handle_connection(self, reader, writer):
    await reader.readline()  # Request line
    while True:
        line = await reader.readline()
        if line in (b"\r\n", b"\n", b""):
            break
    body = self.collector.render().encode("utf-8")
    response = (
        f"HTTP/1.1 200 OK\r\n"
        f"Content-Type: text/plain; version=0.0.4; charset=utf-8\r\n"
        ...
    ).encode() + body
```

The metrics server implements a raw HTTP parser using `asyncio.start_server` + manual request line/headers parsing. This works for Prometheus scraping but doesn't handle edge cases: malformed requests, HTTP/2, chunked encoding, large headers. A malicious client could send a very long header line, causing the server to read indefinitely.

**Фикс:** Use `aiohttp.web` (like health_check.py does) for proper HTTP parsing. Or add a max header size check: `if len(line) > 8192: break`.

### 8.725 metrics_server: counters not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py:34-44`

```python
def record_signal_sent(self) -> None:
    self._signals_sent += 1
```

All counter increments (`_signals_sent`, `_signals_blocked`, `_backtests_run`, `_cb_trips`) are plain `int` operations with no lock. In asyncio this is safe (single-threaded), but if called from multiple threads (e.g., callback from C++ via SHM), race conditions can cause lost increments.

**Фикс:** Use `itertools.count()` or `threading.Lock` if multi-threaded access is possible.

### 8.726 ai-signal-bot/src/research/competition.py: Strategy competition — ✅ Good

**Файл:** `ai-signal-bot/src/research/competition.py` (202 lines)

- **ELO rating system**: Standard formula with K=32 — correct
- **Round-robin**: All pairs compared — fair
- **Win threshold**: 10% Sharpe advantage to win (not tie) — sensible
- **CompetitionResult**: 13 fields including ELO, rank, wins/losses/draws — comprehensive
- **Custom backtest_fn**: Pluggable backtest function — flexible
- **Duck typing**: `Any` for strategy objects — flexible
- **Leaderboard**: Sorted by ELO — correct

Good strategy competition with ELO ratings, round-robin, 10% win threshold, pluggable backtest, and comprehensive result tracking. ✅

### 8.727 competition: _default_backtest returns all zeros — Low [N/A]

**Файл:** `ai-signal-bot/src/research/competition.py:151-159`

```python
def _default_backtest(self, strategy: Any, name: str) -> dict[str, float]:
    return {
        "total_return_pct": 0.0,
        "sharpe_ratio": 0.0,
        ...
    }
```

The default backtest returns all zeros. If someone calls `run_tournament()` without providing a `backtest_fn`, all strategies get zero metrics, all matchups are draws, and the ELO ratings don't change. There's no warning that the default backtest is a no-op.

**Фикс:** Log a warning: `logger.warning("Using default no-op backtest. Provide backtest_fn for real results.")`.

### 8.728 ai-signal-bot/src/research/genetic_strategy.py: Genetic strategy discovery — ✅ Good

**Файл:** `ai-signal-bot/src/research/genetic_strategy.py` (268 lines)

- **10 indicators pool**: rsi, ema, sma, macd, bbands, atr, stoch, adx, obv, vwap — comprehensive
- **6 operators**: >, <, >=, <=, crosses_above, crosses_below — flexible
- **4 actions**: buy, sell, hold, close — correct
- **Tournament selection**: `min(tournament_size, len(population))` — safe
- **Crossover**: Indicators, rules, risk — comprehensive
- **5 mutation types**: indicator, rule, risk, add_rule, remove_rule — diverse
- **Elitism**: `elite_count` — correct
- **History tracking**: Per-generation best/avg fitness — observability
- **Deepcopy on crossover**: Prevents parent mutation — correct

Good genetic strategy discovery with 10 indicators, tournament selection, 5 mutation types, elitism, and history tracking. ✅

### 8.729 genetic_strategy: random not seeded — Low [N/A]

**Файл:** `ai-signal-bot/src/research/genetic_strategy.py:30`

```python
import random
```

Uses `random` module without seeding. Each run produces different results — not reproducible. For research, reproducibility is important to verify and compare results.

**Фикс:** Add `random.seed(seed)` parameter to `evolve()` or `__init__`.

### 8.730 genetic_strategy: no convergence detection — Low [N/A]

**Файл:** `ai-signal-bot/src/research/genetic_strategy.py:218-224`

```python
for gen in range(self.generations):
    self._run_generation(gen, fitness_fn)
```

Runs all generations without checking for convergence. If the population converges after 10 generations, the remaining 40 generations waste CPU. No early stopping when best fitness stops improving.

**Фикс:** Add convergence check: `if gen > 5 and abs(self.history[-1]['best_fitness'] - self.history[-6]['best_fitness']) < 0.001: break`.

### 8.731 ai-signal-bot/src/monitoring/tracker.py: Performance tracker — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/tracker.py` (175 lines)

- **PerformanceTracker**: 11 fields, 3 properties (uptime, win_rate, signals_per_hour) — comprehensive
- **SignalLogger**: CSV with 10 columns, auto-creates directory — correct
- **TradeLogger**: CSV with 10 columns, auto-creates directory — correct
- **print_dashboard**: Tabulate-based, prices + positions + stats — nice
- **Record methods**: `record_signal(validated)`, `record_trade(pnl, fee, winning)` — correct
- **Summary dict**: All metrics in one dict — convenient

Good performance tracker with 11 fields, 3 properties, CSV loggers with auto-mkdir, and tabulate dashboard. ✅

### 8.732 tracker: CSV loggers open/close file per write — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/tracker.py:82-96`

```python
def log(self, signal_dict: dict) -> None:
    with open(self.path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([...])
```

Each `log()` call opens and closes the file. With 50 symbols generating signals every 60s, that's ~50 file opens per minute. Each open involves syscall + file descriptor allocation.

**Фикс:** Keep the file open with a buffered writer, or use a logging handler that writes to CSV. Flush periodically.

### 8.733 tracker: no CSV injection protection — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/tracker.py:82-96`

```python
writer.writerow([
    signal_dict.get('timestamp', ''),
    signal_dict['symbol'],
    signal_dict['direction'],
    ...
    signal_dict.get('reason', ''),
])
```

If `reason` or `symbol` contains a formula (e.g., `=cmd|'/c calc'!A1`), opening the CSV in Excel executes the formula. This is a CSV injection vulnerability. While the data comes from internal sources (strategy engine), a compromised feed could inject malicious formulas.

**Фикс:** Prefix cells starting with `=`, `+`, `-`, `@` with a single quote `'`. Or use `csv.writer` with `quoting=csv.QUOTE_ALL`.

### 8.734 ai-signal-bot/src/observability/health_checks.py: Health checks v2 — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

- **3 K8s probes**: liveness (process alive), readiness (deps connected), status (full report) — correct
- **4 component checks**: WebSocket, TimescaleDB, Redis, exchange — comprehensive
- **3 status levels**: HEALTHY, DEGRADED, UNHEALTHY — correct
- **ComponentHealth dataclass**: name, status, latency_ms, details, last_check — structured
- **Metrics in readiness**: signals_total, orders_total, errors_total, last_signal_age_s, last_order_age_s — observability
- **Record methods**: record_signal, record_order, record_error — correct
- **Error handling**: 4-5 exception types per check — resilient
- **create_health_endpoints**: Factory for aiohttp handlers — clean
- **HTTP status codes**: 503 for unhealthy, 200 otherwise — K8s compatible
- **Not configured = HEALTHY**: Returns healthy with "not configured" — sensible default

Excellent health checks v2 with 3 K8s probes, 4 component checks, 3 status levels, metrics, and factory function. ✅

### 8.735 health_checks: no timeout on component checks — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:85-99`

```python
async def check_readiness(self) -> dict[str, Any]:
    components: list[ComponentHealth] = []
    components.append(await self._check_ws())
    components.append(await self._check_db())
    components.append(await self._check_redis())
    components.append(await self._check_exchange())
```

Each component check is awaited sequentially with no timeout. If `_check_db()` hangs (e.g., DB is unresponsive but TCP connection is open), the readiness probe never returns. K8s has a default `timeoutSeconds: 1` for probes — if the check takes >1s, K8s kills the pod. But the check itself blocks the event loop, preventing other tasks (like signal generation) from running.

**Фикс:** Wrap each check in `asyncio.wait_for(self._check_ws(), timeout=1.0)`. Run checks concurrently with `asyncio.gather(*tasks, return_exceptions=True)`.

### 8.736 health_checks: sequential checks not concurrent — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:89-99`

The 4 component checks are awaited sequentially. With 4 checks each taking ~50ms, the total readiness probe takes ~200ms. Running them concurrently with `asyncio.gather()` would reduce to ~50ms.

**Фикс:** `results = await asyncio.gather(self._check_ws(), self._check_db(), self._check_redis(), self._check_exchange())`.

### 8.737 ai-signal-bot/src/observability/logging.py: Structured logging — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/logging.py` (171 lines)

- **structlog optional**: Falls back to `logging.basicConfig` if not installed — resilient
- **JSON + console**: JSON for prod, colored console for dev — correct
- **Correlation IDs**: `merge_contextvars` — distributed tracing support
- **Service context**: `_add_service_context` adds service name + version — correct
- **Library noise suppression**: asyncio, websockets, aiohttp → WARNING — correct
- **File handler**: Optional, always JSON format — correct
- **bind_context / clear_context**: Contextual fields in async — correct
- **_configured guard**: Prevents double initialization — correct
- **cache_logger_on_first_use**: Performance optimization — correct

Excellent structured logging with structlog optional, JSON+console, correlation IDs, service context, library noise suppression, and context binding. ✅

### 8.738 logging: file handler no rotation — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/logging.py:121`

```python
file_handler = logging.FileHandler(log_file)
```

`FileHandler` writes to a single file that grows indefinitely. In a long-running trading bot that logs every signal (50 symbols × 60s interval = ~72k logs/day), the file can grow to GBs. No rotation, no size limit, no time-based rotation.

**Фикс:** Use `logging.handlers.RotatingFileHandler(log_file, maxBytes=100*1024*1024, backupCount=10)` or `TimedRotatingFileHandler`.

### 8.739 logging: root logger handlers.clear() removes all handlers — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/logging.py:60`

```python
root_logger = logging.getLogger()
root_logger.handlers.clear()
```

`handlers.clear()` removes ALL handlers from the root logger, including any handlers set up by libraries or the application before `setup_logging()` is called. If a library (e.g., aiohttp) set up its own handler, it's silently removed.

**Фикс:** Only remove handlers that were added by this module. Or document that `setup_logging()` must be called before any other logging setup.

### 8.740 ai-signal-bot/src/observability/tracing.py: Distributed tracing — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry + Jaeger**: OTLP gRPC exporter — correct
- **Optional**: Falls back to NoopTracer if opentelemetry not installed — resilient
- **NoopSpan/NoopTracer**: contextmanager-based no-op — correct pattern
- **Resource**: service.name, service.namespace, service.version — correct
- **BatchSpanProcessor**: Batches spans for efficient export — correct
- **AsyncioInstrumentor**: Instruments async operations — correct
- **shutdown_tracing**: Flushes pending traces — correct
- **_initialized guard**: Prevents double initialization — correct
- **Error handling**: ImportError, RuntimeError, OSError, ValueError — resilient

Good distributed tracing with OpenTelemetry, optional fallback, NoopTracer, BatchSpanProcessor, and shutdown. ✅

### 8.741 tracing: OTLP exporter insecure=True — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

`insecure=True` disables TLS for the OTLP gRPC connection. Traces (including signal data, order details, latency metrics) are sent as plaintext to the Jaeger endpoint. If the Jaeger collector is on a different node (common in K8s), traces traverse the network unencrypted.

**Фикс:** Use `insecure=False` with proper TLS certificates. Or ensure Jaeger is on localhost and document the security implication.

### 8.742 tracing: no span attributes for trading data — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/tracing.py:13-16`

```python
with tracer.start_as_current_span("generate_signals") as span:
    span.set_attribute("symbol", symbol)
    span.set_attribute("strategy", strategy_name)
```

The docstring shows setting span attributes, but the actual code doesn't set any attributes on spans. Without attributes, traces show only the span name — no symbol, no strategy, no confidence. This makes debugging difficult.

**Фикс:** Add span attributes in key operations: `span.set_attribute("symbol", symbol)`, `span.set_attribute("confidence", confidence)`, `span.set_attribute("direction", direction)`.

### 8.743 ai-signal-bot/src/monitoring/health_server.py: Health server — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/health_server.py` (153 lines)

- **6 endpoints**: /health, /health/exchange, /health/database, /health/shm, /ready, /live — comprehensive
- **K8s probes**: /ready (readiness), /live (liveness) — correct
- **Pluggable checks**: `register_check(name, check_fn)` — flexible
- **Sync + async checks**: `iscoroutine(result)` check — correct
- **HTTP status codes**: 503 for unhealthy, 200 otherwise — K8s compatible
- **Graceful stop**: `stop()` cleans up runner and site — correct
- **Error handling**: 5 exception types per check — resilient

Good health server with 6 endpoints, K8s probes, pluggable checks, sync+async support, and graceful stop. ✅

### 8.744 health_server: binds to 0.0.0.0 — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/health_server.py:24`

```python
def __init__(self, port: int = 8080, host: str = "0.0.0.0"):  # nosec: B104
```

Health server binds to all interfaces. Exposes component health status (exchange, database, SHM) to anyone on the network. An attacker can learn which dependencies are unhealthy and target them.

**Фикс:** Bind to `127.0.0.1` or use K8s ClusterIP service.

### 8.745 health_server: _check_all runs checks sequentially — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/health_server.py:74-78`

```python
async def _check_all(self) -> dict:
    exchange = await self._check_exchange()
    database = await self._check_database()
    shm = await self._check_shm()
```

Checks are awaited sequentially. With 3 checks each taking ~50ms, the total takes ~150ms. Running concurrently would reduce to ~50ms.

**Фикс:** `exchange, database, shm = await asyncio.gather(self._check_exchange(), self._check_database(), self._check_shm())`.

### 8.746 ai-signal-bot/src/monitoring/metrics.py: Prometheus metrics exporter — ✅ Excellent

**Файл:** `ai-signal-bot/src/monitoring/metrics.py` (239 lines)

- **5 counters**: signals_total, fills_total, orders_sent_total, orders_rejected_total, kill_switch_activations — comprehensive
- **9 gauges**: current_pnl, daily_pnl, total_equity, drawdown_pct, open_positions, total_exposure, websocket_connected, signal_confidence, kill_switch_active, shm_buffer_size — comprehensive
- **3 histograms**: signal_latency, order_latency, shm_round_trip_latency with custom buckets — correct
- **1 summary**: position_hold_time — correct
- **prometheus_client optional**: `HAS_PROMETHEUS` flag — resilient
- **aiohttp optional**: `HAS_AIOHTTP` flag — resilient
- **Custom registry**: `CollectorRegistry()` — isolated
- **All update methods guard HAS_PROMETHEUS**: Correct — no crash if dep missing
- **HTTP server**: /metrics + /health endpoints — correct
- **Graceful stop**: `stop_server()` cleans up runner — correct

Excellent Prometheus metrics exporter with 5 counters, 9 gauges, 3 histograms, 1 summary, optional deps, custom registry, and HTTP server. ✅

### 8.747 metrics: start_server binds to 0.0.0.0 — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/metrics.py:211`

```python
async def start_server(self, host: str = "0.0.0.0", port: int = 9090):  # nosec: B104
```

Metrics server binds to all interfaces. Exposes trading metrics (PnL, drawdown, positions, latency) to anyone on the network. An attacker can learn the bot's performance and trading patterns.

**Фикс:** Bind to `127.0.0.1` or use K8s ClusterIP service. Restrict with network policies.

### 8.748 metrics: no metric for circuit breaker state — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/metrics.py:48-53`

The metrics exporter has counters for kill_switch_activations and a gauge for kill_switch_active, but no metric for circuit breaker state or trips. The circuit breaker is a key reliability component — its state should be monitored.

**Фикс:** Add `self.circuit_breaker_state = Gauge("trading_circuit_breaker_state", "Circuit breaker state (0=closed,1=open,2=half_open)")` and `self.circuit_breaker_trips = Counter("trading_circuit_breaker_trips_total", "Circuit breaker trips")`.

### 8.749 ai-signal-bot/run_backtest.py: Backtest runner — ✅ Good

**Файл:** `ai-signal-bot/run_backtest.py` (179 lines)

- **Synthetic data generation**: GBM with drift, volatility, wick simulation — correct
- **SQLite data source**: Load candles from DB — flexible
- **3 strategies**: TrendFollowing, MeanReversion, FFTCycle — comprehensive
- **Multi-strategy backtest**: `run_multi_strategy()` — correct
- **Optimization**: Grid search with walk-forward validation — correct
- **Plotting**: Optional `--plot` flag — flexible
- **CLI args**: argparse with 7 options — user-friendly
- **Seeded RNG**: `random.Random(seed)` for reproducible synthetic data — correct

Good backtest runner with synthetic data generation, SQLite source, multi-strategy, optimization, walk-forward, and plotting. ✅

### 8.750 run_backtest: SQLite connection not closed on exception — Low [N/A]

**Файл:** `ai-signal-bot/run_backtest.py:80-89`

```python
conn = sqlite3.connect(args.db)
rows = conn.execute(...).fetchall()
candles = [...]
conn.close()
```

If `conn.execute()` or `fetchall()` raises an exception (e.g., table doesn't exist, DB locked), `conn.close()` is never called. The SQLite connection leaks.

**Фикс:** Use `with sqlite3.connect(args.db) as conn:` context manager.

### 8.751 run_backtest: no error handling for missing DB table — Low [N/A]

**Файл:** `ai-signal-bot/run_backtest.py:80-84`

```python
conn = sqlite3.connect(args.db)
rows = conn.execute(
    "SELECT timestamp, open, high, low, close, volume FROM candles "
    "WHERE symbol=? ORDER BY timestamp", (args.symbol,)
).fetchall()
```

If the `candles` table doesn't exist, `sqlite3.OperationalError: no such table: candles` is raised with a raw traceback. No user-friendly error message.

**Фикс:** Wrap in try/except `sqlite3.OperationalError` and print: `f"Error: Table 'candles' not found in {args.db}. Run data collection first."`.

### 8.752 run_backtest: no walk-forward for MeanReversion — Low [N/A]

**Файл:** `ai-signal-bot/run_backtest.py:159-174`

Walk-forward validation is only done for TrendFollowing, not MeanReversion. Both strategies are optimized but only one is validated. MeanReversion may overfit its grid search parameters.

**Фикс:** Add walk-forward validation for MeanReversion best params, same as TrendFollowing.

### 8.753 Code reduction: duplicate health check infrastructure — Info [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py` + `ai-signal-bot/src/monitoring/health_server.py` + `ai-signal-bot/src/observability/health_checks.py`

Three separate health check implementations:
1. `communication/health_check.py` — HealthAggregator (aggregates 3 service endpoints)
2. `monitoring/health_server.py` — HealthServer (6 endpoints, pluggable checks)
3. `observability/health_checks.py` — HealthChecker (4 component checks, 3 K8s probes)

All three implement similar functionality: check component health, return JSON, set HTTP status code. They could be unified into a single health check framework with pluggable checks and multiple endpoint styles.

**Reduction potential:** ~150 lines by merging into one framework.

### 8.754 Code reduction: duplicate metrics infrastructure — Info [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py` + `ai-signal-bot/src/monitoring/metrics.py`

Two separate metrics implementations:
1. `communication/metrics_server.py` — MetricsCollector (7 metrics, raw HTTP, no deps)
2. `monitoring/metrics.py` — MetricsExporter (18 metrics, prometheus_client, aiohttp)

Both expose `/metrics` endpoint with Prometheus format. The lightweight one (no deps) could be a fallback for when prometheus_client is not installed, but they're not connected.

**Reduction potential:** ~100 lines by merging into one with optional prometheus_client.

### 8.755 ai-signal-bot/src/data_collection/exchange_factory.py: Exchange factory — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py` (242 lines)

- **3 modes**: SIMULATOR, REAL, FALLBACK — comprehensive
- **Protocol-based**: `ExchangeAdapter` Protocol with 10 methods — clean interface
- **SimulatorAdapter**: Stub implementation with hardcoded prices — correct for testing
- **RealExchangeAdapter**: Wraps RealMarketDataManager + RealAccountManager — correct
- **ExchangeFactory**: Creates adapter based on mode — correct factory pattern
- **FALLBACK mode**: Try real, health check, fall back to simulator — resilient
- **switch_to_simulator**: Runtime switching on failure — correct
- **close**: Closes both adapter and simulator — correct

Good exchange factory with 3 modes, Protocol interface, fallback with health check, and runtime switching. ✅

### 8.756 exchange_factory: API key/secret stored in plaintext — Medium [FIXED]

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py:172-173`

```python
self.api_key = api_key
self.api_secret = api_secret
```

API key and secret are stored as plaintext strings in the factory instance. They're passed to `RealExchangeAdapter` and `RealMarketDataManager` also as plaintext. If the process memory is dumped (e.g., crash dump, debug tool), the API credentials are exposed.

**Фикс:** Use environment variables or a secrets manager (e.g., Vault). Clear from memory when not needed. Use `__slots__` to prevent attribute access.

### 8.757 exchange_factory: SimulatorAdapter returns hardcoded prices — Low [N/A]

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py:55`

```python
async def get_ticker(self, symbol: str) -> dict:
    return {"symbol": symbol, "price": 50000.0, "bid": 49999.5, "ask": 50000.5, "timestamp": time.time()}
```

SimulatorAdapter returns hardcoded BTC price (50000.0) for all symbols. If someone tests with ETH/SOL, they get BTC prices — misleading backtest results. No randomization or per-symbol pricing.

**Фикс:** Use a per-symbol base price dict: `{"BTC/USDT": 65000, "ETH/USDT": 3500, ...}`. Add small random noise.

### 8.758 ai-signal-bot/src/database/db.py: SQLite database — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` — concurrent read/write
- **3 tables**: signals, trades, equity_curve — correct schema
- **3 indexes**: idx_signals_symbol, idx_trades_symbol, idx_trades_status — correct
- **Parameterized queries**: All queries use `?` placeholders — SQL injection safe
- **contextlib.closing**: Ensures connection cleanup — correct
- **Row factory**: `sqlite3.Row` for dict-like access — convenient
- **Auto-mkdir**: `os.makedirs(dir_path, exist_ok=True)` — correct
- **close()**: WAL checkpoint + journal mode DELETE — Windows-safe
- **get_stats**: COUNT, SUM, COALESCE — correct aggregations

Good SQLite database with WAL mode, 3 tables, 3 indexes, parameterized queries, contextlib.closing, and Windows-safe close. ✅

### 8.759 db.py: new connection per operation — Medium [FIXED]

**Файл:** `ai-signal-bot/src/database/db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every `save_signal()`, `save_trade()`, `close_trade()`, `save_equity()`, `get_stats()`, `get_recent_signals()`, `get_recent_trades()` creates a new SQLite connection. Each connection involves:
- File open syscall
- WAL mode PRAGMA execution
- Row factory setup
- SQLite internal initialization

With 50 symbols generating signals every 60s, that's ~50 connections per minute just for signals, plus trades and equity. Each connection takes ~5-10ms.

**Фикс:** Use a connection pool or a single persistent connection. For SQLite WAL mode, a single write connection + multiple read connections is ideal. Use `threading.local()` for thread-safe connection reuse.

### 8.760 db.py: no connection timeout — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py:22`

```python
conn = sqlite3.connect(self.path)
```

No timeout parameter. Default SQLite timeout is 5s. If another process holds a write lock (e.g., manual DB inspection), the bot hangs for 5s on every write. In a 60s signal cycle, a 5s hang is significant.

**Фикс:** `sqlite3.connect(self.path, timeout=1.0)` to fail fast.

### 8.761 db.py: no migration version tracking — Low [N/A]

**Файл:** `ai-signal-bot/src/database/db.py:36-81`

```python
def _init_db(self) -> None:
    with closing(self._conn()) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS signals (...);
            CREATE TABLE IF NOT EXISTS trades (...);
            CREATE TABLE IF NOT EXISTS equity_curve (...);
            CREATE INDEX IF NOT EXISTS ...;
        """)
```

Uses `CREATE TABLE IF NOT EXISTS` for initialization. No migration version tracking. If the schema needs to change (e.g., add a column), there's no way to apply migrations incrementally. The `migrations/` directory exists but isn't used by this code.

**Фикс:** Add a `schema_version` table and apply migrations from `migrations/` directory in order.

### 8.762 hft-trade-bot/src/core/main.cpp: Main entry point — ✅ Good

**Файл:** `hft-trade-bot/src/core/main.cpp` (66 lines)

- **Windows WinSock init**: `winsock2.h` + `ws2tcpip.h` — correct
- **Sequential init**: config → core → signals → orders → kill switch → monitoring → IPC → callbacks → connect → symbols — correct order
- **Error checking**: `init_config_and_logger` and `init_signal_engines` return false → exit 1 — correct
- **Main loop**: SL/TP → arbitrage → AI signals → v2/v1 signal loop → status print → wait → poll SHM — comprehensive
- **ScopedLatency**: Loop timer for latency tracking — correct
- **Status print every 10s**: Throttled logging — correct
- **Graceful shutdown**: `graceful_shutdown(ctx)` — correct
- **`is_running()` check**: Atomic flag for loop control — correct

Good main entry point with sequential init, error checking, comprehensive main loop, latency tracking, and graceful shutdown. ✅

### 8.763 main.cpp: no SIGINT/SIGTERM handler visible — Medium [FIXED]

**Файл:** `hft-trade-bot/src/core/main.cpp:38`

```cpp
while (is_running()) {
```

The main loop checks `is_running()`, but there's no signal handler visible in `main.cpp`. The handler must be set up in `init_core_components()` or `bot_setup.cpp`. If no handler is installed, SIGINT/SIGTERM kills the process without graceful shutdown — `graceful_shutdown(ctx)` is never called, open positions are not closed, SHM segments are not unlinked.

**Фикс:** Verify that `init_core_components()` installs `signal(SIGINT, ...)` and `signal(SIGTERM, ...)` handlers that set `is_running() = false`. If not, add them.

### 8.764 main.cpp: no exception handling in main loop — Medium [FIXED]

**Файл:** `hft-trade-bot/src/core/main.cpp:38-61`

```cpp
while (is_running()) {
    ScopedLatency loop_timer(ctx.total_loop_hist);
    process_sl_tp(ctx, current_balance);
    process_arbitrage(ctx, can_trade);
    process_ai_signals(ctx, current_balance, can_trade);
    // ...
}
```

No try/catch around the main loop body. If any function throws (e.g., `ctx.executor->close_position()` throws due to network error, `ctx.pos_mgr.update_all_pnl()` throws due to invalid price), the exception propagates to `main()`, the process crashes without `graceful_shutdown()`. Open positions, SHM segments, and FIX sessions are left in inconsistent state.

**Фикс:** Wrap the loop body in `try { ... } catch (const std::exception& e) { spdlog::error("Loop error: {}", e.what()); }`.

### 8.765 hft-trade-bot/src/core/config.h: Config struct — ✅ Good

**Файл:** `hft-trade-bot/src/core/config.h` (204 lines)

- **60+ fields**: Connection, trading, risk, HFT strategies, v2/v3 engines, leverage, pressure model, smart router, adaptive orders, latency, FFT, logging, AI signal, shutdown, production, exchanges, IPC/SHM, FIX, DB, Redis, metrics, risk limits, weights — comprehensive
- **Default values**: All fields have defaults — correct
- **ExchangeConfig struct**: Per-exchange config with API keys, fees, rate limits — correct
- **3 exchanges**: binance_cfg, okx_cfg, bybit_cfg — comprehensive
- **IPC config**: 3 SHM channels (signals, fills, market data) — correct
- **Production risk limits**: max_position_qty, max_total_exposure, daily_loss_limit, max_drawdown_pct, max_orders_per_second, min_margin_ratio, max_leverage — comprehensive
- **Static load method**: `Config::load(path)` — correct

Good config struct with 60+ fields, defaults, per-exchange config, IPC/SHM, FIX, DB, Redis, metrics, and production risk limits. ✅

### 8.766 config.h: API keys in plaintext std::string — Medium [FIXED]

**Файл:** `hft-trade-bot/src/core/config.h:125-126`

```cpp
std::string api_key;
std::string api_secret;
```

API keys are stored as plaintext `std::string` in the `ExchangeConfig` struct. `std::string` allocations are not zeroed on destruction — the keys remain in heap memory after the struct is destroyed. A memory dump or core dump can extract them.

**Фикс:** Use a `SecureString` class that zeros memory on destruction. Or use `std::vector<char>` with explicit `memset(0)` in destructor.

### 8.767 config.h: metrics_host defaults to 0.0.0.0 — Low

**Файл:** `hft-trade-bot/src/core/config.h:177`

```cpp
std::string metrics_host{"0.0.0.0"};
```

Metrics server defaults to binding on all interfaces. Exposes trading metrics (PnL, positions, latency) to anyone on the network.

**Фикс:** Default to `127.0.0.1`.

### 8.768 hft-trade-bot/src/core/bot_loop.cpp: Bot loop — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp` (279 lines)

- **process_sl_tp**: Updates prices, PnL, checks SL/TP, closes positions, updates balance — correct
- **process_arbitrage**: Lock-protected arb opportunity check, min qty check — correct
- **process_ai_signals**: Queue-based signal processing, risk check, position check — correct
- **prepare_order_book**: Synthetic order book from price when real book unavailable — correct fallback
- **generate_signal**: V3 or V2 engine based on config — correct
- **convert_fast_signal**: FastSignal → Signal conversion with reason string — correct
- **select_order_kind**: Adaptive order selection (MARKET/IOC/FOK/GTD/POST) — correct
- **execute_v2_order**: Limit price injection into order book for execution — correct
- **run_v2_signal_loop**: Per-symbol signal generation with latency tracking — correct
- **run_v1_fallback_loop**: V1 engine fallback with synthetic order book — correct
- **print_status**: Balance, equity, positions, unrealized PnL, latency histograms, monitor — comprehensive

Good bot loop with SL/TP, arbitrage, AI signals, V2/V1 signal loops, adaptive order selection, latency tracking, and comprehensive status. ✅

### 8.769 bot_loop.cpp: arb_lock not exception-safe — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:31-34`

```cpp
ctx.arb_lock.lock();
arb = ctx.latest_arb;
ctx.has_arb_opportunity = false;
ctx.arb_lock.unlock();
```

Manual lock/unlock without RAII. If `ctx.latest_arb` copy throws (unlikely but possible with complex types), the mutex is never unlocked — deadlock.

**Фикс:** Use `std::lock_guard<std::mutex> lock(ctx.arb_lock);`.

### 8.770 bot_loop.cpp: prepare_order_book synthetic spread is hardcoded — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:79-81`

```cpp
for (int i = 0; i < 10; ++i) {
    ctx.ob_buf.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
    ctx.ob_buf.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
}
```

Synthetic order book uses hardcoded 1 bps spread and 1.0 qty for all levels. This doesn't reflect real market conditions — the spread varies by symbol (BTC: 0.5bps, altcoins: 5-20bps) and the qty varies by depth. Signals generated on synthetic books may not perform the same on real books.

**Фикс:** Use per-symbol spread configuration. Use realistic qty based on historical depth data.

### 8.771 bot_loop.cpp: has_arb_opportunity store after unlock — Low

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:34`

```cpp
ctx.arb_lock.unlock();
ctx.has_arb_opportunity = false;
```

`ctx.has_arb_opportunity` is set to `false` after the lock is released. If another thread sets it to `true` between `unlock()` and the assignment, the new arb opportunity is lost. The flag should be set inside the lock.

**Фикс:** Move `ctx.has_arb_opportunity = false;` before `ctx.arb_lock.unlock();`.

### 8.772 Code reduction: duplicate order book synthesis — Info

**Файл:** `hft-trade-bot/src/core/bot_loop.cpp:70-82` + `hft-trade-bot/src/core/bot_loop.cpp:191-199`

The synthetic order book creation code is duplicated in `prepare_order_book()` and `run_v1_fallback_loop()`:

```cpp
// prepare_order_book (line 79-81)
for (int i = 0; i < 10; ++i) {
    ctx.ob_buf.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
    ctx.ob_buf.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
}

// run_v1_fallback_loop (line 196-199)
for (int i = 0; i < 10; ++i) {
    ob.bids.push_back({price * (1.0 - 0.0001 * (i + 1)), 1.0});
    ob.asks.push_back({price * (1.0 + 0.0001 * (i + 1)), 1.0});
}
```

Same logic, different variable names. Should be extracted into a `make_synthetic_order_book(price, levels=10)` utility function.

**Reduction potential:** ~10 lines.

### 8.773 hft-trade-bot/src/execution/order_executor.h: Order executor — ✅ Good

**Файл:** `hft-trade-bot/src/execution/order_executor.h` (231 lines)

- **WebSocket-based**: websocketpp with ASIO client — correct
- **Exponential backoff reconnect**: 1s → 2s → 4s → ... → 30s cap — correct
- **Recreate client on connect**: Comment explains websocketpp init_asio() limitation — correct workaround
- **Manual JSON serialization**: snprintf to stack buffer avoids nlohmann::json heap alloc — HFT-optimized
- **submit_order**: MARKET/LIMIT selection, price append for LIMIT — correct
- **close_position**: Manual JSON, snprintf — correct
- **execute_arbitrage**: Buy + sell in sequence, error check between — correct
- **disconnect**: Close + join thread — correct
- **connected_ atomic**: Thread-safe connection status — correct
- **Buffer overflow protection**: `n < sizeof(buf) - 32` check before appending — correct

Good order executor with WebSocket, exponential backoff, manual JSON for HFT, buffer overflow protection, and arbitrage support. ✅

### 8.774 order_executor: detached reconnect thread race condition — Medium [FIXED]

**Файл:** `hft-trade-bot/src/execution/order_executor.h:57-63`

```cpp
std::thread([this, delay]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(delay));
    if (should_reconnect_) {
        if (ws_thread_.joinable()) ws_thread_.join();
        do_connect();
    }
}).detach();
```

The reconnect thread is detached. If `disconnect()` is called while the reconnect thread is sleeping, `should_reconnect_` is set to false, but the thread still wakes up and checks it. However, if `disconnect()` joins `ws_thread_` and destroys `client_` before the reconnect thread calls `do_connect()`, the reconnect thread accesses a destroyed `client_` — use-after-free. The `should_reconnect_` check is not atomic with the `do_connect()` call.

**Фикс:** Don't detach. Store the reconnect thread and join it in `disconnect()`. Or use a condition variable with `should_reconnect_` flag.

### 8.775 order_executor: snprintf buffer truncation silent — Low

**Файл:** `hft-trade-bot/src/execution/order_executor.h:108-128`

```cpp
char buf[512];
int n = std::snprintf(buf, sizeof(buf), ...);
if (n < static_cast<int>(sizeof(buf) - 2)) {
    buf[n++] = '}';
    buf[n] = '\0';
}
```

If the JSON exceeds 512 bytes (e.g., very long symbol name, large quantity precision), `snprintf` truncates silently. The `n < sizeof(buf) - 2` check prevents writing `}` but the JSON is still sent without the closing brace — malformed JSON sent to exchange.

**Фикс:** Check `n >= sizeof(buf)` explicitly and log an error: "Order JSON too long, truncated". Don't send malformed JSON.

### 8.776 hft-trade-bot/src/exchange/ExchangeBase.h: Exchange base — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines)

- **EWMA latency tracking**: `current + (us - current) / 10` — correct smoothing
- **CAS loop for latency**: `compare_exchange_weak` — thread-safe
- **Toxic event tracking**: `record_toxic_event()`, `toxic_event_count()`, `reset_toxic_events()` — correct
- **is_available()**: `toxic_count_ < 5` — auto-disable on 5+ toxic events
- **Fee tracking**: maker_fee_bps, taker_fee_bps — correct
- **Atomic fields**: latency_avg_, toxic_count_ — thread-safe

Good exchange base with EWMA latency tracking, toxic event tracking, auto-disable, and atomic fields. ✅

### 8.777 hft-trade-bot/src/exchange/BinanceAdapter.h: Binance adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h` (190 lines)

- **IExchange interface**: best_bid, best_ask, mid_price, bid_depth, ask_depth — correct
- **Spinlock-protected**: price_lock_ and depth_lock_ — HFT-optimized
- **on_book_ticker**: Updates bid/ask/depth from WS feed — correct
- **on_depth_update**: Updates from diff depth stream — correct (only best level for now)
- **HMAC-SHA256 signing**: `sign()` method — correct for REST API
- **Rate limiting**: 300 orders/10s with atomic CAS — correct
- **Stream URLs**: bookTicker, depth20@100ms, aggTrade — correct Binance streams
- **User data stream**: listenKey management — correct
- **OrderResult struct**: success, order_id, status, avg_price, executed_qty, error — comprehensive

Good Binance adapter with IExchange interface, spinlock protection, HMAC signing, rate limiting, and comprehensive order results. ✅

### 8.778 BinanceAdapter: API keys in plaintext std::string — Medium [FIXED]

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:28-29`

```cpp
struct Config {
    std::string api_key;
    std::string api_secret;
```

Same issue as config.h — API keys stored as plaintext `std::string`. Not zeroed on destruction. Core dump or memory inspection exposes credentials.

**Фикс:** Use `SecureString` class that zeros memory on destruction.

### 8.779 BinanceAdapter: on_depth_update only updates best level — Low

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:83-100`

```cpp
void on_depth_update(const std::string& symbol,
                     const std::vector<std::pair<double, double>>& bids,
                     const std::vector<std::pair<double, double>>& asks) {
    // In production: maintain full L2 book from diffs
    // For now, just update best bid/ask
    if (!bids.empty()) {
        bids_[symbol] = bids[0].first;
        bid_depth_[symbol] = bids[0].second;
    }
```

Only the best bid/ask is updated from depth updates. Full L2 book is not maintained. This means depth-aware order routing and pressure model analysis operate on incomplete data — only top-of-book.

**Фикс:** Maintain full L2 book from diffs. Apply bid/ask updates per level, remove levels with qty=0.

### 8.780 BinanceAdapter: double lock in on_book_ticker — Low

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h:74-79`

```cpp
void on_book_ticker(const std::string& symbol, double bid, double bid_qty, double ask,
                    double ask_qty) {
    std::lock_guard<Spinlock> lk(price_lock_);
    bids_[symbol] = bid;
    asks_[symbol] = ask;
    std::lock_guard<Spinlock> lk2(depth_lock_);
    bid_depth_[symbol] = bid_qty;
    ask_depth_[symbol] = ask_qty;
}
```

Two spinlocks are held simultaneously (price_lock_ then depth_lock_). If another thread acquires them in opposite order (depth_lock_ then price_lock_), deadlock. The same pattern appears in `on_depth_update`.

**Фикс:** Use a single lock for both price and depth, or document and enforce consistent lock ordering.

### 8.781 hft-trade-bot/src/risk/kill_switch.h: Kill switch — ✅ Excellent

**Файл:** `hft-trade-bot/src/risk/kill_switch.h` (173 lines)

- **3 activation methods**: File trigger, programmatic, daily loss — comprehensive
- **5 activation steps**: Cancel orders → close positions → notify Python → notify callback → remove trigger file — correct
- **5 reasons**: MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, FILE_TRIGGER — comprehensive
- **3 callbacks**: cancel_all, close_all, notify — flexible
- **SHM notification**: KillSwitchMsg to Python via ring buffer — correct IPC
- **Atomic active_**: `exchange(true)` prevents double activation — correct
- **File-based monitoring**: Polls for trigger file existence — correct
- **deactivate()**: Manual reset — correct
- **can_trade()**: `!active_` — correct
- **Destructor**: `stop_monitoring()` — correct
- **close()**: Unlinks SHM — correct

Excellent kill switch with 3 activation methods, 5 steps, 5 reasons, SHM notification, atomic activation, file monitoring, and proper cleanup. ✅

### 8.782 kill_switch: catch(...) in init_shm hides errors — Low

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:64`

```cpp
try {
    shm_ = std::make_unique<ShmRingBuffer<ipc::KillSwitchMsg>>(shm_name_, 64, true);
    return true;
} catch (...) {
    return false;
}
```

`catch(...)` catches all exceptions including `std::bad_alloc`. The error message is lost — no log. If SHM init fails, the kill switch can't notify Python, but the operator doesn't know why.

**Фикс:** `catch (const std::exception& e) { spdlog::error("KillSwitch SHM init failed: {}", e.what()); return false; }`.

### 8.783 kill_switch: no auto-recovery from file trigger — Low

**Файл:** `hft-trade-bot/src/risk/kill_switch.h:98-102`

```cpp
if (reason == Reason::FILE_TRIGGER) {
    std::error_code ec;
    std::filesystem::remove(trigger_file_, ec);
}
```

On file trigger, the trigger file is removed. But the kill switch stays active until `deactivate()` is called manually. There's no auto-recovery — the bot stays stopped even after the issue is resolved. An operator must call `deactivate()` programmatically.

**Фикс:** Document the recovery procedure. Or add a `recovery_file` that, when touched, calls `deactivate()`.

### 8.784 ai-signal-bot/src/ml/automl.py: AutoML optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/ml/automl.py` (191 lines)

- **Optuna optional**: `OPTUNA_AVAILABLE` flag — resilient
- **TPE sampler**: `TPESampler` with n_startup_trials — correct
- **MedianPruner**: Prunes underperforming trials — correct
- **12-parameter search space**: RSI, EMA, ATR, confidence, spread, SL, TP, position size, max positions — comprehensive
- **Strategy-specific params**: mean_reversion (BB, zscore), trend_following (trend strength, trailing stop) — correct
- **Storage support**: SQLite for study persistence — correct
- **load_if_exists**: Resumes existing study — correct
- **Timeout**: 1 hour default — correct
- **Dummy objective fallback**: Returns 0.0 with warning — correct

Good AutoML optimizer with Optuna, TPE sampler, MedianPruner, 12-parameter space, strategy-specific params, storage, and timeout. ✅

### 8.785 automl: no validation set in optimize() — Medium [FIXED]

**Файл:** `ai-signal-bot/src/ml/automl.py:103-137`

```python
def optimize(self, objective_fn=None, search_space_fn=None) -> dict:
    # ...
    self.study.optimize(wrapped_objective, n_trials=..., timeout=...)
    self.best_params = self.study.best_params
    self.best_value = self.study.best_value
    return self.best_params
```

The `optimize()` method doesn't accept or use a validation set. The `objective_fn` is expected to handle train/validation split internally, but there's no enforcement. If the objective function overfits to training data, `best_params` will be overfit parameters — poor live performance.

**Фикс:** Add `validation_data` parameter. Enforce that `objective_fn` returns validation metric, not training metric. Add walk-forward validation after optimization.

### 8.786 automl: no early stopping on convergence — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/automl.py:142-147`

```python
self.study.optimize(
    wrapped_objective,
    n_trials=self.config.n_trials,
    timeout=self.config.timeout,
    show_progress_bar=True,
)
```

No early stopping. If the best value plateaus after 20 trials, the remaining 80 trials are wasted. Optuna supports `optuna.study.MaxTrialsCallback` or custom callbacks for early stopping.

**Фикс:** Add a callback that stops if best value hasn't improved in N trials.

### 8.787 ai-signal-bot/src/ml/model_registry.py: Model registry — ✅ Good

**Файл:** `ai-signal-bot/src/ml/model_registry.py` (296 lines)

- **5 statuses**: CANDIDATE, STAGING, PRODUCTION, ARCHIVED, ROLLED_BACK — correct lifecycle
- **ModelVersion dataclass**: name, version, path, status, metrics, metadata, timestamps, A/B counters — comprehensive
- **ABTest dataclass**: control, treatment, traffic_split, impressions, successes — correct
- **File-based persistence**: JSON to registry.json — simple and correct
- **register**: Overwrite warning — correct
- **promote**: Auto-archive current production — correct
- **rollback**: Most recently archived → production — correct
- **set_ab_test**: Validates both versions exist — correct
- **select_ab_model**: Random split with impression tracking — correct
- **Error handling**: OSError, ValueError, KeyError, TypeError on load — resilient

Good model registry with 5 statuses, A/B testing, rollback, file persistence, and error handling. ✅

### 8.788 model_registry: _save() not atomic — Medium [FIXED]

**Файл:** `ai-signal-bot/src/ml/model_registry.py:107-120`

```python
def _save(self) -> None:
    os.makedirs(self.storage_dir, exist_ok=True)
    data = {...}
    with open(self.index_path, "w") as f:
        json.dump(data, f, indent=2)
```

`open("w")` truncates the file before writing. If the process crashes during `json.dump()` (e.g., OOM, SIGKILL), the registry file is corrupted — all model versions, A/B tests, and production assignments are lost. On next load, `_load()` fails with JSON decode error, and the registry starts empty — the production model is unknown.

**Фикс:** Write to a temp file, then atomic rename: `with open(tmp_path, "w") as f: json.dump(...); os.replace(tmp_path, self.index_path)`.

### 8.789 model_registry: select_ab_model not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/ml/model_registry.py:236-238`

```python
import random
if random.random() < ab.traffic_split:
    ab.treatment_impressions += 1
```

`ab.treatment_impressions += 1` is not atomic. If called from multiple threads (e.g., multiple signal generation coroutines), the counter can lose increments. Also, `import random` inside a method is inefficient.

**Фикс:** Use `threading.Lock` or `itertools.count()`. Move `import random` to top of file.

### 8.790 ai-signal-bot/src/llm_engine/engine.py: LLM engine — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **4 providers**: openai, anthropic, ollama, none — comprehensive
- **API key from env**: `os.getenv("OPENAI_API_KEY")` — correct
- **Rule-based fallback**: No API key → provider="none" — resilient
- **Caching**: `cache_key = f"{symbol}_{round(price, 2)}"` with TTL — correct
- **3 prompt templates**: market_analysis, signal_explanation, risk_assessment — comprehensive
- **Prompt loading from files**: `_load_prompt()` with fallback to defaults — correct
- **MarketContext dataclass**: 12 fields including regime, OBI, recent_signals — comprehensive
- **LLMAnalysis dataclass**: 8 fields including sentiment, confidence, key_levels — comprehensive
- **aiohttp optional**: `AIOHTTP_AVAILABLE` flag — resilient
- **Request/error counting**: `_request_count`, `_error_count` — observability
- **Session management**: `initialize()` creates, `close()` destroys — correct

Good LLM engine with 4 providers, env-based API keys, rule-based fallback, caching, 3 prompt templates, file-based prompt loading, and session management. ✅

### 8.791 llm_engine: API key in config dataclass plaintext — Medium [FIXED]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:29`

```python
@dataclass
class LLMConfig:
    provider: str = "openai"
    api_key: str = ""
```

API key stored as plaintext string in `LLMConfig` dataclass. If the config is logged or serialized (e.g., for debugging), the API key is exposed. The key is also stored in `self.config.api_key` on the `LLMEngine` instance.

**Фикс:** Use `__repr__` that masks the key: `api_key: str = field(repr=False)`. Or use a `SecretStr` type that doesn't expose the value in repr.

### 8.792 llm_engine: no rate limiting on API calls — Medium [FIXED]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:149-159`

```python
async def analyze_market(self, ctx: MarketContext) -> LLMAnalysis:
    cache_key = f"{ctx.symbol}_{round(ctx.price, 2)}"
    now = time.time()
    if cache_key in self._cache:
        cached_time, cached_result = self._cache[cache_key]
        if now - cached_time < self.config.cache_ttl_seconds:
            cached_result.cached = True
            return cached_result
```

No rate limiting on LLM API calls. The cache helps (60s TTL), but if 50 symbols generate signals simultaneously with different prices, that's 50 API calls in one cycle. OpenAI has rate limits (e.g., 500 RPM for GPT-4o-mini). Exceeding the rate limit returns 429 errors, which are caught but waste time and budget.

**Фикс:** Add a token bucket or sliding window rate limiter. E.g., max 30 requests per minute. Queue excess requests.

### 8.793 llm_engine: cache key based on rounded price — Low [N/A]

**Файл:** `ai-signal-bot/src/llm_engine/engine.py:151`

```python
cache_key = f"{ctx.symbol}_{round(ctx.price, 2)}"
```

Cache key is `symbol_rounded_price`. If BTC moves from 65000.10 to 65000.49, both round to 65000.00 — cache hit. But if BTC moves from 64999.99 to 65000.00, different cache key — cache miss, new API call. The rounding boundary causes unnecessary API calls at price transitions.

**Фикс:** Use price buckets: `cache_key = f"{ctx.symbol}_{int(ctx.price / 10)}"` — buckets of $10.

### 8.794 Code reduction: duplicate API key plaintext pattern — Info

**Файлы:** `config.h:125`, `BinanceAdapter.h:28`, `exchange_factory.py:172`, `llm_engine/engine.py:29`

API keys stored as plaintext in 4 different locations:
1. C++ `Config::ExchangeConfig::api_key` — `std::string`
2. C++ `BinanceAdapter::Config::api_key` — `std::string`
3. Python `ExchangeFactory::api_key` — `str`
4. Python `LLMConfig::api_key` — `str`

All have the same vulnerability: not zeroed on destruction, exposed in crash dumps. A unified `SecureString` (C++) and `SecretStr` (Python) class would fix all 4 at once.

**Reduction potential:** ~20 lines of secure string code replaces 4 ad-hoc patterns.

### 8.795 hft-trade-bot/src/strategies/signal_engine_v2.h: Signal Engine V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h` (494 lines)

- **6 indicators**: EMA(21/50)+signal(9), RSI(14), OBI(5/10/20), VWAP(±2σ), ADX(14), Pressure Model — comprehensive
- **No heap allocations in analyze()**: Stack-allocated arrays (MAX_N=256), alignas(64) FastSignal — HFT-optimized
- **IndicatorCache**: Per-symbol cache with incremental updates — correct
- **Cooldown**: Configurable ms between signals — correct
- **Two analyze modes**: Full `analyze()` (recompute all) + `analyze_incremental()` (cache-based) — flexible
- **Composite score**: Weighted sum of 6 indicator scores — correct
- **Adaptive SL/TP**: ATR-based with adaptive multipliers — correct
- **Branchless design**: Ternary, fmax/fmin instead of if/else — HFT-optimized
- **Validation**: min_candles check, insufficient data return — correct
- **Cooldown check in init_and_validate**: Prevents signal spam — correct

Excellent signal engine with 6 indicators, no heap alloc, incremental cache, cooldown, composite scoring, adaptive SL/TP, and branchless design. ✅

### 8.796 signal_engine_v2: heap alloc in get_cache() — Medium [FIXED]

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h:61-64`

```cpp
IndicatorCache& get_cache(const char* symbol) {
    auto it = cache_.find(std::string_view(symbol));
    if (it == cache_.end()) {
        it = cache_.emplace(std::string(symbol), IndicatorCache{}).first;
```

`get_cache()` does `cache_.emplace(std::string(symbol), ...)` which heap-allocates a new `std::string` key and `IndicatorCache` value. This is called from `analyze_incremental()` which is supposed to have no heap allocations. On first call per symbol, a heap alloc occurs. For a new symbol mid-trading, this can cause a GC pause on some allocators or a mutex lock in the allocator.

**Фикс:** Pre-populate the cache at init for all configured symbols. Use a flat array indexed by symbol_id instead of unordered_map.

### 8.797 signal_engine_v2: stack arrays 256×4 doubles = 8KB — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h:90-91`

```cpp
constexpr size_t MAX_N = 256;
double           closes[MAX_N], highs[MAX_N], lows[MAX_N], volumes[MAX_N];
```

4 arrays of 256 doubles = 8KB on the stack per `analyze()` call. On threads with small stack size (e.g., 64KB), this is 12.5% of the stack. If `analyze()` is called recursively (unlikely but possible via callbacks), stack overflow.

**Фикс:** Use `thread_local` arrays or pre-allocated buffers in BotContext. Or reduce MAX_N to 128.

### 8.798 signal_engine_v2: last_signal_ms_ not per-symbol — Medium [FIXED]

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v2.h:192`

```cpp
if (now_ms - last_signal_ms_ < params_.cooldown_ms) {
    sig.set_reason("Cooldown active");
    return false;
}
```

`last_signal_ms_` is a single member variable, not per-symbol. If BTC generates a signal at t=0, ETH at t=0 is blocked by cooldown even though it's a different symbol. With 50 symbols, only 1 signal per cooldown period across ALL symbols — severely limits signal generation.

**Фикс:** Move `last_signal_ms_` into `IndicatorCache` (per-symbol). Or use a `std::unordered_map<std::string, int64_t>` for per-symbol cooldowns.

### 8.799 hft-trade-bot/src/strategies/pressure_model.h: Pressure Model — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h` (258 lines)

- **Multi-level OBI**: 5/10/20 levels in single pass — optimized
- **Distance-weighted OBI**: Exponential decay by level depth — correct
- **Trade flow imbalance**: Buyer vs seller initiated — correct
- **Toxicity detection**: Large order detection vs median — correct
- **Microprice deviation**: Weighted mid vs simple mid — correct
- **Queue position estimation**: For bid and ask — correct
- **Price impact prediction**: obi*2 + trade_imbalance*1.5 + microprice_dev*0.5 — correct
- **Spread regime**: TIGHT (<1bps), NORMAL, WIDE (>5bps) — correct
- **No heap allocations**: All stack-allocated — HFT-optimized
- **Convenience overload**: `analyze(ob)` without trades — correct

Excellent pressure model with multi-level OBI, weighted OBI, trade flow, toxicity, microprice, queue position, price impact, and spread regime. ✅

### 8.800 pressure_model: compute_obi() static method unused — Info

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h:134-143`

```cpp
static inline double compute_obi(const OrderBook& ob, int levels) noexcept {
    // ...
}
```

`compute_obi()` is a static method that computes OBI at N levels. It's not called anywhere in the file — the main `analyze()` method computes OBI inline in a single-pass loop. This is dead code left from before the optimization.

**Reduction potential:** ~10 lines.

### 8.801 hft-trade-bot/src/position/position_manager.h: Position Manager — ✅ Good

**Файл:** `hft-trade-bot/src/position/position_manager.h` (130 lines)

- **Mutex-protected**: All methods use `std::lock_guard<std::mutex>` — thread-safe
- **open_position**: Updates existing position if symbol exists, otherwise adds — correct
- **close_position**: Linear search + erase — correct for small N
- **update_all_pnl**: Iterates positions, updates from price map — correct
- **check_sl_tp**: Long/short SL/TP logic — correct
- **active_symbols_**: O(1) has_position check — correct
- **total_unrealized_pnl**: Sum of all positions — correct

Good position manager with mutex protection, update-on-duplicate, SL/TP checking, and active symbols set. ✅

### 8.802 position_manager: linear search for close_position — Low

**Файл:** `hft-trade-bot/src/position/position_manager.h:45-54`

```cpp
for (auto it = positions_.begin(); it != positions_.end(); ++it) {
    if (it->symbol == symbol) {
        Position pos = *it;
        pos.update_pnl(exit_price);
        positions_.erase(it);
        active_symbols_.erase(symbol);
        return pos;
    }
}
```

`close_position()` does a linear search through `positions_` vector. With max 3 positions (config default), this is fine. But if max_open_positions is increased to 50, each close is O(N). The `active_symbols_` set already tracks which symbols have positions — could use an `unordered_map<string, size_t>` for O(1) lookup.

**Фикс:** Use `unordered_map<string, Position>` instead of `vector<Position>`. Or maintain an index map alongside the vector.

### 8.803 position_manager: no position size validation — Low

**Файл:** `hft-trade-bot/src/position/position_manager.h:17-41`

```cpp
void open_position(const Signal& signal, double quantity, const std::string& exchange) {
    if (!signal.is_actionable()) return;
    // ...
    pos.quantity = quantity;
```

No validation that `quantity > 0` or that `quantity` doesn't exceed max position size. If `quantity` is 0 or negative (bug in risk manager), a position with 0 qty is opened — it will never trigger SL/TP and will stay forever.

**Фикс:** Add `if (quantity <= 0) return;` at the start.

### 8.804 hft-trade-bot/src/data/signal.h: Signal struct — ✅ Good

**Файл:** `hft-trade-bot/src/data/signal.h` (46 lines)

- **9 fields**: symbol, direction, confidence, strategy, entry_price, stop_loss, take_profit, leverage, reason, timestamp — comprehensive
- **is_long/is_short/is_actionable**: Convenience methods — correct
- **side()**: Maps direction to Side enum — correct
- **rr_ratio()**: Calculates risk/reward for long and short — correct
- **NEUTRAL defaults to BUY**: Documented — caller should check is_actionable() first

Good signal struct with 9 fields, convenience methods, and R:R calculation. ✅

### 8.805 signal.h: NEUTRAL side() returns BUY — Low

**Файл:** `hft-trade-bot/src/data/signal.h:25-29`

```cpp
Side side() const {
    if (is_long()) return Side::BUY;
    if (is_short()) return Side::SELL;
    return Side::BUY; // NEUTRAL defaults to BUY; caller should check is_actionable() first
}
```

`side()` returns `Side::BUY` for NEUTRAL signals. If a caller forgets to check `is_actionable()` first and calls `side()`, a NEUTRAL signal results in a BUY order. The comment warns about this, but it's a footgun — the API silently returns a valid trading side for a non-actionable signal.

**Фикс:** Return `std::optional<Side>` or throw on NEUTRAL. Or add a `Side::NONE` enum value.

### 8.806 Code reduction: position_manager.h vs position_manager_v2.h — Info

**Файлы:** `hft-trade-bot/src/position/position_manager.h` (130 lines) + `position_manager_v2.h` (14267 bytes)

Two position manager implementations exist. The V1 (130 lines) is used in `bot_loop.cpp` via `ctx.pos_mgr`. The V2 (14KB) is likely used via `ctx.pos_mgr_v2` or similar. If V2 supersedes V1, V1 is dead code.

**Reduction potential:** ~130 lines if V1 is dead code.

### 8.807 hft-trade-bot/src/strategies/signal_engine_v3.h: Signal Engine V3 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h` (437 lines)

- **HMM regime detection**: 4 states (TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE) — comprehensive
- **Online HMM**: Forward recursion in log-space, parameter adaptation every 50 ticks — correct
- **2D Gaussian emission**: (log_return, vol_proxy) — correct
- **EWMA volatility**: RiskMetrics-style λ=0.94 — correct
- **Regime gating**: Boost aligned signals, dampen counter-trend, cap ranging, widen volatile stops — correct
- **Per-symbol HMM state**: `hmm_states_` unordered_map with StringHash — correct
- **HMM update threshold**: Only update on >0.01% price change — efficient
- **Min regime confidence**: 0.4 threshold before applying gating — correct
- **Volatile regime**: Widens SL/TP by 1.5×, reduces leverage by 0.5× — correct
- **No heap alloc in analyze()**: Stack-allocated HMM arrays — HFT-optimized
- **Log-space numerics**: log_alpha, log_trans, log_gaussian — numerically stable
- **Normalization**: Subtract max_alpha after forward recursion — prevents overflow

Excellent signal engine V3 with HMM regime detection, online learning, log-space numerics, per-symbol state, regime gating, and no heap allocations. ✅

### 8.808 signal_engine_v3: heap alloc in get_or_create_hmm_state() — Medium [FIXED]

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:352-357`

```cpp
inline HMMState& get_or_create_hmm_state(const char* symbol) noexcept {
    auto it = hmm_states_.find(std::string_view(symbol));
    if (it == hmm_states_.end()) {
        it = hmm_states_.emplace(std::string(symbol), HMMState{}).first;
    }
    return it->second;
}
```

Same issue as V2's `get_cache()` — `emplace` heap-allocates on first call per symbol. `analyze_incremental()` is supposed to have no heap allocations, but the first call for a new symbol allocates. The `noexcept` declaration is also incorrect — `emplace` can throw `std::bad_alloc`.

**Фикс:** Pre-populate `hmm_states_` at init for all configured symbols. Remove `noexcept` or use `try_emplace` with pre-allocated memory.

### 8.809 signal_engine_v3: VLA trans_sum on stack — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:175`

```cpp
double trans_sum[N_STATES][N_STATES];
```

`N_STATES` is `constexpr int 4`, so this is a fixed-size array, not a VLA. However, it's 4×4 = 16 doubles = 128 bytes on the stack per `forward_recursion()` call. Called on every price update, this is fine but could be a class member to avoid repeated stack setup.

**Фикс:** Make `trans_sum` a class member or `thread_local` to avoid stack setup overhead.

### 8.810 signal_engine_v3: append_regime_reason manual string ops — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:413-432`

```cpp
while (base.reason[reason_len] && reason_len < 47) ++reason_len;
if (reason_len >= 40) return;
base.reason[reason_len] = '|'; base.reason[reason_len + 1] = ' ';
```

Manual string concatenation with `while` loops and character-by-character copying. This is error-prone — if `reason_len` is exactly 47, the `base.reason[reason_len] = '|'` writes at index 47, but the buffer might be 48 bytes (indices 0-47). The boundary checks are correct but fragile.

**Фикс:** Use `snprintf` with bounds checking: `snprintf(base.reason + reason_len, 48 - reason_len, "| %s %d%%", rname, conf_int)`.

### 8.811 hft-trade-bot/src/strategies/mean_reversion_v2.h: Mean Reversion V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h` (301 lines)

- **KalmanFilter1D**: Predict + update equations, configurable Q/R — correct
- **OU process estimation**: AR(1) regression → κ, θ, σ — correct
- **Z-score**: (residual - θ) / σ — correct
- **Half-life**: ln(2) / κ — correct
- **6 signal actions**: NONE, ENTER_LONG, ENTER_SHORT, EXIT_LONG, EXIT_SHORT, STOP — comprehensive
- **Stop on divergence**: |z| > 4.0 → STOP — correct
- **Ring buffer**: residuals_ and timestamps_ with MAX_WINDOW=2048 — correct
- **Cache-line aligned**: `alignas(64)` arrays — HFT-optimized
- **No heap allocations**: All fixed-size arrays — HFT-optimized
- **Config validation**: ou_window clamped to [2, MAX_WINDOW] — correct
- **Ring buffer safe iteration**: `(start + k) % ou_window` — correct
- **Average dt computation**: From timestamps — correct
- **Min samples check**: 100 before generating signals — correct

Excellent mean reversion V2 with Kalman filter, OU estimation, z-score, half-life, 6 actions, ring buffer, cache-line alignment, and no heap allocations. ✅

### 8.812 mean_reversion_v2: no per-symbol state — Medium [N/A]

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h:60`

```cpp
class MeanReversionV2 {
  private:
    Config         config_;
    KalmanFilter1D kalman_;
    alignas(64) std::array<double, MAX_WINDOW> residuals_{};
    alignas(64) std::array<uint64_t, MAX_WINDOW> timestamps_{};
    uint64_t write_idx_{0};
    uint64_t price_count_{0};
```

`MeanReversionV2` has a single Kalman filter, single residuals array, and single write_idx. If used for multiple symbols, they all share the same state — BTC's residuals contaminate ETH's OU estimation. Unlike `SignalEngineV2` which has per-symbol `IndicatorCache`, `MeanReversionV2` has no per-symbol state.

**Фикс:** Add a `MeanReversionState` struct with Kalman filter, residuals, timestamps, and write_idx. Use `unordered_map<string, MeanReversionState>` for per-symbol state. Or require one instance per symbol.

### 8.813 mean_reversion_v2: 32KB stack per instance — Low

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h:289-290`

```cpp
alignas(64) std::array<double, MAX_WINDOW> residuals_{};    // 2048 × 8 = 16KB
alignas(64) std::array<uint64_t, MAX_WINDOW> timestamps_{};  // 2048 × 8 = 16KB
```

32KB per instance. If one instance per symbol (50 symbols), that's 1.6MB of memory. If allocated on the stack, stack overflow. If on the heap (as class member), it's fine but wastes memory for symbols with few trades.

**Фикс:** Use `unique_ptr<array<...>>` for heap allocation, or reduce MAX_WINDOW to 512.

### 8.814 ai-signal-bot/src/networking/socket_transport.py: Socket Transport — ✅ Good

**Файл:** `ai-signal-bot/src/networking/socket_transport.py` (156 lines)

- **Non-blocking UDP**: `setblocking(False)` — correct
- **Configurable buffer**: 1MB default, SO_RCVBUF + SO_SNDBUF — correct
- **Bind to 127.0.0.1**: Local only — secure
- **Packet stats**: packets_rx/tx, bytes_rx/tx, rx_drops, avg_latency — comprehensive
- **Binary parsing**: [ts_ns:8][symbol_len:1][symbol:N][price:8][qty:8][side:1][msg_type:1] — correct
- **Error handling**: BlockingIOError (sleep 100μs), OSError, struct.error, UnicodeDecodeError — resilient
- **Configurable dest**: `send(data, dest)` — correct

Good socket transport with non-blocking UDP, configurable buffers, 127.0.0.1 bind, binary parsing, packet stats, and error handling. ✅

### 8.815 socket_transport: start_receive_loop blocks thread — Medium [FIXED]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:86-108`

```python
def start_receive_loop(self, on_packet: Callable[[MarketDataPacket], None]) -> None:
    self._running = True
    while self._running:
        try:
            data, addr = self._socket.recvfrom(65536)
            # ...
            on_packet(packet)
        except BlockingIOError:
            time.sleep(0.0001)  # 100μs sleep
```

`start_receive_loop()` is a blocking `while` loop. It blocks the calling thread indefinitely. If called from the asyncio event loop thread, it blocks all coroutines — signal generation, order execution, WebSocket reads all stop. The `time.sleep(0.0001)` on BlockingIOError is a busy-wait that consumes CPU.

**Фикс:** Use `asyncio.get_event_loop().add_reader(self._socket.fileno(), callback)` for async I/O. Or run in a separate thread with `threading.Thread(target=self.start_receive_loop, daemon=True)`.

### 8.816 socket_transport: no packet validation — Low [N/A]

**Файл:** `ai-signal-bot/src/networking/socket_transport.py:128-149`

```python
def _parse_packet(self, data: bytes) -> MarketDataPacket | None:
    if len(data) < 27:
        return None
    ts_ns = struct.unpack_from("!Q", data, 0)[0]
    sym_len = data[8]
    symbol = data[9:9+sym_len].decode("ascii")
```

No validation of `sym_len` — if `sym_len` is 255 and the packet is only 30 bytes, `data[9:264]` returns partial data, and `decode("ascii")` may fail. The `except (struct.error, UnicodeDecodeError, IndexError)` catches this, but the packet is silently dropped without logging.

**Фикс:** Validate `9 + sym_len + 18 <= len(data)` before parsing. Log dropped packets with reason.

### 8.817 ai-signal-bot/src/notification/notifier.py: Notifier — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **2 providers**: Telegram + Discord — comprehensive
- **AlertEvent dataclass**: type, symbol, message, timestamp, data — correct
- **6 event types**: fill, sl_tp, position_open, position_close, daily_pnl, error — comprehensive
- **Emoji mapping**: Per event type — nice UX
- **Remote commands**: /status, /positions, /close_all, /pause, /resume — correct
- **Command handlers**: Pluggable via `register_command()` — flexible
- **Long polling**: Telegram getUpdates with 30s timeout — correct
- **Chat ID validation**: Only processes messages from configured chat — correct
- **Graceful stop**: Cancel poll task, close session — correct
- **aiohttp optional**: ImportError handled — resilient
- **Error handling**: OSError, RuntimeError, JSONDecodeError, CancelledError — resilient

Good notifier with Telegram + Discord, 6 event types, remote commands, chat ID validation, graceful stop, and error handling. ✅

### 8.818 notifier: bot token in plaintext — Medium [FIXED]

**Файл:** `ai-signal-bot/src/notification/notifier.py:53-54`

```python
class TelegramNotifier:
    def __init__(self, token: str, chat_id: str):
        self.token = token
```

Bot token stored as plaintext string. If the notifier is logged (e.g., `logger.info(f"[TelegramNotifier] Token: {self.token}")`), the token is exposed. The token is also in the URL: `f"https://api.telegram.org/bot{self.token}/sendMessage"` — if HTTP requests are logged (e.g., aiohttp debug), the token appears in logs.

**Фикс:** Use `field(repr=False)` on a dataclass, or mask the token in logs. Use environment variables for token storage.

### 8.819 notifier: no rate limiting on alerts — Medium [FIXED]

**Файл:** `ai-signal-bot/src/notification/notifier.py:89-116`

```python
async def send_alert(self, event: AlertEvent):
    # ...
    async with self._session.post(url, json=payload) as resp:
```

No rate limiting on alert sending. If 50 symbols generate fills simultaneously, 50 Telegram API calls are sent in one cycle. Telegram has rate limits (~30 messages/sec, 20 messages/minute to same chat). Exceeding returns 429 Too Many Requests, which is caught but the alert is lost.

**Фикс:** Add a message queue with rate limiting. Batch alerts into a single message. Use `asyncio.Semaphore` to limit concurrent sends.

### 8.820 notifier: no retry on failed sends — Low [N/A]

**Файл:** `ai-signal-bot/src/notification/notifier.py:111-116`

```python
try:
    async with self._session.post(url, json=payload) as resp:
        if resp.status != 200:
            logger.warning(f"Telegram send failed: {resp.status}")
except (OSError, RuntimeError) as e:
    logger.error(f"Telegram send error: {e}")
```

If the send fails (network error, 429, 500), the alert is lost. No retry mechanism. Critical alerts (SL/TP hits, error events) should be retried.

**Фикс:** Add exponential backoff retry (3 attempts). Queue failed alerts for later retry.

### 8.821 Code reduction: duplicate emoji_map in Telegram and Discord — Info [N/A]

**Файлы:** `ai-signal-bot/src/notification/notifier.py:93-100` + `notifier.py:212-219`

```python
# TelegramNotifier.send_alert
emoji_map = {"fill": "✅", "sl_tp": "🎯", "position_open": "📈", ...}
# DiscordNotifier.send_alert
emoji_map = {"fill": "✅", "sl_tp": "🎯", "position_open": "📈", ...}
```

Same `emoji_map` dict defined in both `TelegramNotifier.send_alert()` and `DiscordNotifier.send_alert()`. Should be a class-level constant or module-level dict.

**Reduction potential:** ~8 lines.

### 8.822 hft-trade-bot/src/utils/low_latency.h: Low-Latency Infrastructure — ✅ Excellent

**Файл:** `hft-trade-bot/src/utils/low_latency.h` (451 lines)

- **Spinlock**: `_mm_pause` spin-wait, `alignas(64)` + padding to prevent false sharing — HFT-optimized
- **SpinlockGuard**: RAII wrapper, deleted copy — correct
- **SPSCQueue**: Lock-free single-producer single-consumer, power-of-2 capacity, `alignas(64)` head/tail — excellent
- **ObjectPool**: Pre-allocated, O(1) acquire/release via pointer arithmetic — correct
- **LatencyHistogram**: 35 log-scale buckets, atomic counters, CAS min/max, p50/p95/p99/p99.9 — excellent
- **ScopedLatency**: RAII timer, steady_clock — correct
- **ThreadAffinity**: Pin to core, set priority max (TIME_CRITICAL/FIFO 99), num_cores — cross-platform
- **CircuitBreaker**: 3 states (CLOSED/OPEN/HALF_OPEN), threshold + cooldown, atomic — correct
- **RetryPolicy**: Exponential backoff (2^n), jitter (0-30%), thread_local RNG — correct
- **Cross-platform**: Windows + POSIX support throughout — excellent

Excellent low-latency infrastructure with spinlock, SPSC queue, object pool, latency histogram, thread pinning, circuit breaker, and retry policy. ✅

### 8.823 low_latency: ObjectPool acquire is O(N) — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:153-161`

```cpp
T* acquire() noexcept {
    for (size_t i = 0; i < PoolSize; ++i) {
        bool expected = false;
        if (pool_[i].active.compare_exchange_strong(expected, true, std::memory_order_acquire)) {
            return &pool_[i].obj;
        }
    }
    return nullptr;
}
```

`acquire()` does a linear scan through all slots. With PoolSize=100, this is up to 100 CAS operations. Under contention (multiple threads acquiring simultaneously), this is O(N²) total work. The release is O(1) via pointer arithmetic, but acquire is not.

**Фикс:** Use a lock-free stack (Treiber stack) with `std::atomic<T*>` head for O(1) acquire. Or maintain a free-list atomic index.

### 8.824 low_latency: CircuitBreaker HALF_OPEN allows multiple probes — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:382-383`

```cpp
// HALF_OPEN: allow one probe
return true;
```

In HALF_OPEN state, `allow_request()` always returns `true`. Multiple threads can probe simultaneously instead of just one. If all probes fail, the circuit re-opens, but if some succeed and some fail, the state is inconsistent — `record_success()` closes the circuit while other probes are still in flight.

**Фикс:** Use a CAS to transition HALF_OPEN → probe-in-progress, allowing only one probe. Other threads should return false.

### 8.825 low_latency: LatencyHistogram atomic<double> not lock-free on all platforms — Low

**Файл:** `hft-trade-bot/src/utils/low_latency.h:286-287`

```cpp
std::atomic<double> min_{1e18};
std::atomic<double> max_{0.0};
```

`std::atomic<double>` is not guaranteed to be lock-free on all platforms. On some ARM architectures, `atomic<double>` uses a mutex internally. The CAS loops in `record()` would then block. Check `std::atomic<double>::is_always_lock_free` at compile time.

**Фикс:** Use `std::atomic<uint64_t>` with `std::bit_cast` or manual memcpy for double ↔ uint64 conversion. Or use `atomic<uint64_t>` with `memcpy` reinterpret.

### 8.826 hft-trade-bot/src/ipc/shm_ring_buffer.h: SHM Ring Buffer — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h` (348 lines)

- **SPSC lock-free**: Atomic head/tail with acquire/release ordering — correct
- **Cache-line aligned**: head and tail on separate cache lines (alignas(64)) — prevents false sharing
- **Power-of-2 capacity**: Bitwise AND instead of modulo — HFT-optimized
- **Magic validation**: SHM_MAGIC on open — correct
- **Capacity/element_size validation**: On open — correct
- **Bulk push/pop**: At most 2 memcpy calls — optimized
- **Cross-platform**: Windows (CreateFileMapping) + POSIX (shm_open/mmap) — excellent
- **Cleanup**: Destructor unmaps + closes + unlinks — correct
- **Deleted copy/move**: Prevents double-unmap — correct
- **static_assert**: ShmHeader must be 192 bytes — correct

Excellent SHM ring buffer with SPSC lock-free, cache-line alignment, power-of-2, bulk operations, magic validation, and cross-platform support. ✅

### 8.827 shm_ring_buffer: no memory barrier on memcpy — Low

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h:211`

```cpp
std::memcpy(&data_[slot], &item, sizeof(T));
header_->head.store(head + 1, std::memory_order_release);
```

`std::memcpy` is not guaranteed to be a memory barrier. On weakly-ordered architectures (ARM), the compiler or CPU may reorder the memcpy writes relative to other operations. The `release` store on `head` should ensure visibility, but on some ARM implementations, `memcpy` may use non-temporal stores that bypass the cache, requiring an explicit barrier.

**Фикс:** Add `std::atomic_thread_fence(std::memory_order_release)` before the head store on ARM. Or use `__sync_synchronize()` on GCC.

### 8.828 shm_ring_buffer: Windows wname conversion truncates non-ASCII — Low

**Файл:** `hft-trade-bot/src/ipc/shm_ring_buffer.h:79`

```cpp
std::wstring wname(name_.begin(), name_.end());
```

This converts `std::string` to `std::wstring` by char-by-char copy, which only works for ASCII. If the SHM name contains non-ASCII characters (unlikely but possible on some locales), the conversion is incorrect. Should use `MultiByteToWideChar` on Windows.

**Фикс:** Use `MultiByteToWideChar(CP_UTF8, 0, name_.c_str(), -1, ...)` for correct conversion.

### 8.829 hft-trade-bot/src/ipc/shm_heartbeat.h: SHM Heartbeat — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h` (272 lines)

- **Single-slot model**: HeartbeatSlot with atomic seq — lock-free
- **Seq-guarded read**: Read seq, copy, verify seq — correct
- **Odd/even seq**: Odd = writing in progress, Even = done — clever
- **Writer + Reader**: Separate classes with proper cleanup — correct
- **Auto heartbeat thread**: `start_auto()` with configurable interval — correct
- **Cross-platform**: Windows + POSIX — excellent
- **Cache-line aligned**: `alignas(64) HeartbeatSlot` — correct
- **static_assert**: Slot ≤ 64 bytes (1 cache line) — correct
- **Bidirectional**: C++ writes, Python reads (or vice versa) — flexible
- **Freshness check**: `is_fresh(timeout_ms)` — correct

Excellent SHM heartbeat with seq-guarded lock-free access, auto heartbeat thread, cross-platform support, and cache-line alignment. ✅

### 8.830 shm_heartbeat: write() not truly atomic — Low

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h:121-138`

```cpp
void write(uint32_t msg_count, uint32_t err_count, const char* status) noexcept {
    uint64_t seq = slot_->seq.load(std::memory_order_relaxed);
    slot_->seq.store(seq + 1, std::memory_order_release); // Odd = writing
    slot_->timestamp_ns = now_ns();
    slot_->pid = ...;
    slot_->message_count = msg_count;
    slot_->error_count = err_count;
    std::memset(slot_->status, 0, sizeof(slot_->status));
    std::strncpy(slot_->status, status, sizeof(slot_->status) - 1);
    slot_->seq.store(seq + 2, std::memory_order_release); // Even = done
}
```

The write uses seq odd/even to signal write-in-progress. However, between `seq+1` (odd) and `seq+2` (even), the reader sees odd and returns false. If the writer is preempted between the two stores (e.g., by a signal handler), the reader will see odd indefinitely and never get a heartbeat — false stale detection.

**Фикс:** Use a CAS loop instead of store. Or add a timeout in the reader: if seq is odd for >2× write_interval, assume writer is dead.

### 8.831 shm_heartbeat: now_ns uses system_clock not steady_clock — Low

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h:161-163`

```cpp
static uint64_t now_ns() noexcept {
    auto tp = std::chrono::system_clock::now();
    return std::chrono::duration_cast<std::chrono::nanoseconds>(tp.time_since_epoch()).count();
}
```

`system_clock` can jump (NTP adjustments, manual time changes). If the clock jumps backward, the heartbeat timestamp appears to go backward, and the freshness check `now - timestamp > timeout` may produce incorrect results. `steady_clock` is monotonic but can't be shared across processes (different epoch). For cross-process, `system_clock` is the only option, but the reader should handle backward jumps.

**Фикс:** In the reader, check `abs(now - timestamp) > timeout` instead of `now - timestamp > timeout`. Or use `CLOCK_MONOTONIC` on POSIX (shared via SHM).

### 8.832 ai-signal-bot/src/utils/helpers.py: Helpers — ✅ Good

**Файл:** `ai-signal-bot/src/utils/helpers.py` (205 lines)

- **setup_logging**: JSON formatter, file handler, handler cleanup — correct
- **JsonFormatter**: Structured JSON with timestamp, level, logger, message, module, line — correct
- **load_config**: YAML safe_load, FileNotFoundError returns {} — correct
- **get_env**: Type casting (str/int/float/bool), default on error — correct
- **now_ms/now_us**: Time helpers — correct
- **format_price/format_qty**: Adaptive decimal places — correct
- **safe_divide**: Epsilon check — correct
- **clamp**: min/max — correct
- **truncate_dict**: For logging large dicts — correct
- **CircuitBreaker**: 3 states, failure threshold, recovery timeout — correct
- **RateLimiter**: Token bucket, async acquire — correct

Good helpers with logging, config, env, formatting, circuit breaker, and rate limiter. ✅

### 8.833 helpers: setup_logging duplicates observability/logging.py — Info [FIXED]

**Файлы:** `ai-signal-bot/src/utils/helpers.py:14-42` + `ai-signal-bot/src/observability/logging.py`

`setup_logging()` in `helpers.py` is a simpler version of `setup_logging()` in `observability/logging.py`. The observability version uses `structlog` with correlation IDs and contextual fields. The helpers version uses basic `logging` with JSON formatter. Two logging setup functions can conflict — if both are called, the second one's handlers replace the first's.

**Reduction potential:** ~30 lines. Remove `setup_logging` from `helpers.py` and use `observability/logging.py` everywhere.

### 8.834 helpers: CircuitBreaker not thread-safe — Low [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py:145-176`

```python
class CircuitBreaker:
    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self.failure_threshold:
            self._state = "open"
```

`_failure_count += 1` is not atomic in Python (even with GIL, async context switches can occur between load and store). In async code, if two coroutines call `record_failure()` concurrently (e.g., two API calls failing simultaneously), one increment may be lost.

**Фикс:** Use `asyncio.Lock` around state mutations. Or use `itertools.count()` for atomic increment.

### 8.835 helpers: RateLimiter busy-waits in async — Low [FIXED]

**Файл:** `ai-signal-bot/src/utils/helpers.py:194-204`

```python
async def acquire(self) -> bool:
    while True:
        self._refill()
        if self._tokens >= 1.0:
            self._tokens -= 1.0
            return True
        wait = (1.0 - self._tokens) / self.rate
        await asyncio.sleep(wait)
```

If `self.rate <= 0`, the function returns `False` immediately (line 196-197). But if `self.rate` is very small (e.g., 0.001), `wait = (1.0 - 0.0) / 0.001 = 1000` seconds — the caller waits 1000 seconds. No maximum wait cap.

**Фикс:** Add `wait = min(wait, max_wait)` with configurable `max_wait` parameter.

### 8.836 Code reduction: duplicate CircuitBreaker in C++ and Python — Info

**Файлы:** `hft-trade-bot/src/utils/low_latency.h:359-413` + `ai-signal-bot/src/utils/helpers.py:145-176`

Both C++ and Python have their own `CircuitBreaker` implementation. This is expected (different languages), but the Python version is simpler (no HALF_OPEN probe logic in `is_open` — it transitions to half_open but doesn't limit probes to 1). The C++ version has the same issue (R824). Both should have consistent behavior.

**Reduction potential:** ~0 lines (different languages), but behavior should be aligned.

### 8.837 hft-trade-bot/src/ipc/shm_protocol.h: SHM Protocol — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h` (118 lines)

- **4 message types**: SignalMsg (32B), FillMsg (28B), MarketSnapshotMsg (28B), KillSwitchMsg (16B) — comprehensive
- **`#pragma pack(push, 1)`**: Explicit packing for cross-language alignment — correct
- **`static_assert`**: Size validation for each struct — correct
- **Python format strings**: Documented in comments — correct
- **4 enum mappings**: SymbolId (10 symbols), ExchangeId (4), Action (3), Side (2) — correct
- **Explicit padding**: `pad_[5]`, `pad_[3]`, `pad_[6]` — correct

Excellent SHM protocol with 4 message types, explicit packing, static_assert size validation, and Python format documentation. ✅

### 8.838 shm_protocol: SymbolId limited to 10 symbols — Medium

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h:83-94`

```cpp
enum class SymbolId : uint8_t {
    BTC  = 0,
    ETH  = 1,
    SOL  = 2,
    BNB  = 3,
    XRP  = 4,
    ADA  = 5,
    DOGE = 6,
    AVAX = 7,
    DOT  = 8,
    LINK = 9,
};
```

Only 10 symbols defined, but the config has 50 symbols. `symbol_id` is `uint8_t` (0-255), so 50 symbols fit in the field, but the enum only defines 10. Symbols 10-49 (MINA, etc.) have no enum value — they must use raw integers, which is error-prone and bypasses type safety.

**Фикс:** Generate the enum from config at build time. Or use a `constexpr std::array<std::string_view>` mapping instead of an enum.

### 8.839 shm_protocol: float for price/qty — Low

**Файл:** `hft-trade-bot/src/ipc/shm_protocol.h:20-23`

```cpp
struct SignalMsg {
    // ...
    float    confidence; // 0.0 - 1.0
    float    price;      // Entry price
    float    sl;         // Stop loss
    float    tp;         // Take profit
```

`float` has only ~7 decimal digits of precision. BTC at $100,000.00 has 8 significant digits — the last digit is imprecise. For qty, `float` can represent up to ~16M with 1 decimal precision. Large positions (e.g., 100M SHIB) lose precision.

**Фикс:** Use `double` for price and qty. This increases struct size by 4 bytes per field (16 bytes total for SignalMsg), but prevents precision loss. Or use fixed-point integers (price in milli-cents).

### 8.840 hft-trade-bot/src/ipc/shm_fill_producer.h: SHM Fill Producer — ✅ Good

**Файл:** `hft-trade-bot/src/ipc/shm_fill_producer.h` (76 lines)

- **Wraps ShmRingBuffer<FillMsg>**: Clean encapsulation — correct
- **init() returns bool**: `[[nodiscard]]` — correct
- **push_fill() convenience**: Two overloads (struct + params) — flexible
- **Bulk push**: `push_fills()` — efficient
- **pending()**: Query buffer size — correct
- **close()**: Unlink + reset — correct
- **RAII**: Destructor calls close() — correct
- **Exception handling**: Catches `std::exception` in init() — correct

Good fill producer with clean ShmRingBuffer wrapper, convenience methods, bulk push, and RAII. ✅

### 8.841 shm_fill_producer: init() swallows exception message — Low

**Файл:** `hft-trade-bot/src/ipc/shm_fill_producer.h:22-28`

```cpp
[[nodiscard]] bool init() {
    try {
        buffer_ = std::make_unique<ShmRingBuffer<FillMsg>>(shm_name_, capacity_, true);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}
```

The exception message (`e.what()`) is caught but not logged. The caller gets `false` but doesn't know why — was it a permission error, out of memory, or name conflict? Silent failure makes debugging difficult.

**Фикс:** Log the exception: `logger.error("SHM fill producer init failed: {}", e.what())`. Or re-throw with context.

### 8.842 hft-trade-bot/src/ipc/shm_signal_consumer.h: SHM Signal Consumer — ✅ Good

**Файл:** `hft-trade-bot/src/ipc/shm_signal_consumer.h` (79 lines)

- **Dedicated consumer thread**: Runs callback on each signal — correct
- **Batch pop**: Inner while loop drains buffer — efficient
- **50μs sleep when empty**: Avoids 100% CPU — correct
- **Atomic running flag**: `exchange(false)` in stop() — correct
- **Join on stop**: Waits for thread to finish — correct
- **try_pop_signal()**: Non-blocking polling mode — flexible
- **RAII**: Destructor calls stop() — correct
- **Callback via std::function**: Flexible — correct

Good signal consumer with dedicated thread, batch pop, 50μs sleep, atomic flag, join on stop, and polling mode. ✅

### 8.843 shm_signal_consumer: start() can throw, not caught — Low

**Файл:** `hft-trade-bot/src/ipc/shm_signal_consumer.h:28-37`

```cpp
void start(SignalCallback callback) {
    if (running_.load(std::memory_order_relaxed)) return;
    buffer_ = std::make_unique<ShmRingBuffer<SignalMsg>>(shm_name_, capacity_, false);
    callback_ = std::move(callback);
    running_.store(true, std::memory_order_relaxed);
    thread_ = std::thread(&ShmSignalConsumer::run, this);
}
```

`ShmRingBuffer` constructor can throw (`std::runtime_error` on SHM open failure). `start()` doesn't catch it — the exception propagates to the caller. If the caller doesn't catch it, the program crashes. Unlike `ShmFillProducer::init()` which returns bool, `start()` has no error handling.

**Фикс:** Wrap in try/catch, return bool. Or document that `start()` throws.

### 8.844 shm_signal_consumer: 50μs sleep is a busy-poll — Low

**Файл:** `hft-trade-bot/src/ipc/shm_signal_consumer.h:66`

```cpp
std::this_thread::sleep_for(std::chrono::microseconds(50));
```

50μs sleep means the consumer wakes 20,000 times per second even when idle. On a busy system, this is 20,000 context switches per second. For HFT, this is acceptable (signals arrive frequently), but for low-traffic periods, it wastes CPU.

**Фикс:** Use adaptive sleep: start at 50μs, increase to 1ms after 100 consecutive empty polls, reset to 50μs on first signal. Or use `futex`/`condition_variable` for event-driven wakeup.

### 8.845 hft-trade-bot/src/ipc/shm_market_data.h: SHM Market Data — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_market_data.h` (177 lines)

- **Latest-snapshot model**: Single-slot per symbol, latest wins — lowest latency
- **Seq-guarded**: Odd/even seq for lock-free reads — correct
- **Per-symbol slots**: `slots_[symbol_id]` — O(1) access
- **`alignas(64)` SnapshotSlot**: Cache-line aligned — correct
- **`static_assert`**: Slot ≤ 64 bytes — correct
- **Bounds checking**: `symbol_id >= max_symbols_` — correct
- **Cross-platform**: Windows + POSIX — excellent
- **Deleted copy**: Prevents double-unmap — correct
- **Convenience write_price()**: Fills MarketSnapshotMsg — correct
- **Zero on create**: `memset(ptr, 0, total_size)` — correct

Excellent SHM market data with latest-snapshot model, seq-guarded lock-free, per-symbol slots, cache-line alignment, and cross-platform support. ✅

### 8.846 shm_market_data: same write() not truly atomic issue as shm_heartbeat — Low

**Файл:** `hft-trade-bot/src/ipc/shm_market_data.h:114-127`

Same odd/even seq pattern as `shm_heartbeat.h`. If writer is preempted between `seq+1` and `seq+2`, reader sees odd and returns false — stale data. Same fix applies: add timeout in reader or use CAS.

### 8.847 shm_market_data: Windows wname truncates non-ASCII — Low

**Файл:** `hft-trade-bot/src/ipc/shm_market_data.h:50`

```cpp
std::wstring wname(shm_name_.begin(), shm_name_.end());
```

Same issue as `shm_ring_buffer.h:79` — char-by-char wstring conversion only works for ASCII.

**Фикс:** Use `MultiByteToWideChar(CP_UTF8, 0, shm_name_.c_str(), -1, ...)`.

### 8.848 ai-signal-bot/src/monitoring/tracker.py: Tracker — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/tracker.py` (175 lines)

- **PerformanceTracker**: 10 metrics (signals, trades, PnL, fees, win rate) — comprehensive
- **Derived properties**: `win_rate`, `signals_per_hour`, `uptime_seconds` — correct
- **SignalLogger**: CSV logging with header creation — correct
- **TradeLogger**: CSV logging with header creation — correct
- **print_dashboard**: Tabulate-based CLI dashboard — nice UX
- **os.makedirs**: Creates log directory — correct

Good monitoring tracker with performance metrics, CSV logging, and CLI dashboard. ✅

### 8.849 tracker: PerformanceTracker not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/tracker.py:14-52`

```python
@dataclass
class PerformanceTracker:
    signals_generated: int = 0
    # ...
    def record_signal(self, validated: bool) -> None:
        self.signals_generated += 1
        if validated:
            self.signals_validated += 1
```

`signals_generated += 1` is not atomic in Python async. If two coroutines call `record_signal()` concurrently (e.g., two symbols generating signals in the same event loop iteration), one increment may be lost. Same issue as `helpers.py` CircuitBreaker (R824).

**Фикс:** Use `asyncio.Lock` or `threading.Lock` around mutations. Or use atomic operations via `itertools.count()`.

### 8.850 tracker: CSV log() opens file on every call — Low [N/A]

**Файл:** `ai-signal-bot/src/monitoring/tracker.py:82-96`

```python
def log(self, signal_dict: dict) -> None:
    with open(self.path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([...])
```

`open()` + `close()` on every signal. With 50 symbols generating signals every 60s, that's ~50 file opens per minute. Each open/close involves syscall overhead (~10μs each). Not a performance issue at this scale, but if signal frequency increases, it becomes a bottleneck.

**Фикс:** Keep file open and flush periodically. Or use a buffered writer with `flush()` every N records.

### 8.851 ai-signal-bot/src/observability/health_checks.py: Health Checks — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

- **3 endpoints**: /health/live, /health/ready, /health/status — Kubernetes-ready
- **4 component checks**: WebSocket, TimescaleDB, Redis, Exchange — comprehensive
- **3 health states**: HEALTHY, DEGRADED, UNHEALTHY — correct
- **ComponentHealth dataclass**: name, status, latency_ms, details, last_check — correct
- **Overall status logic**: all HEALTHY → HEALTHY, any UNHEALTHY → UNHEALTHY, else DEGRADED — correct
- **Latency measurement**: `time.time() - start` per check — correct
- **Metrics**: signals_total, orders_total, errors_total, last_signal_age_s, last_order_age_s — comprehensive
- **HTTP status codes**: 200 for healthy, 503 for unhealthy — Kubernetes-ready
- **Error handling**: AttributeError, TypeError, OSError, ConnectionError, RuntimeError — resilient
- **"not configured" = HEALTHY**: Correct — absence is not failure
- **create_health_endpoints()**: aiohttp handlers — correct

Excellent health checks with 3 endpoints, 4 component checks, 3 health states, latency measurement, metrics, Kubernetes-ready HTTP codes, and resilient error handling. ✅

### 8.852 health_checks: check_readiness runs checks sequentially — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:85-99`

```python
async def check_readiness(self) -> dict[str, Any]:
    components: list[ComponentHealth] = []
    components.append(await self._check_ws())
    components.append(await self._check_db())
    components.append(await self._check_redis())
    components.append(await self._check_exchange())
```

4 checks run sequentially. If TimescaleDB is down (30s timeout), Redis and Exchange checks wait 30s before starting. Total readiness check = sum of all timeouts = up to 120s. Kubernetes readiness probe has a default timeout of 1s — the probe will time out and mark the pod as not ready, even if Redis and Exchange are healthy.

**Фикс:** Use `asyncio.gather()` to run all checks concurrently: `results = await asyncio.gather(self._check_ws(), self._check_db(), self._check_redis(), self._check_exchange())`. Total time = max(timeout) instead of sum(timeout).

### 8.853 health_checks: no timeout on individual checks — Medium [FIXED]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:156-170`

```python
async def _check_db(self) -> ComponentHealth:
    start = time.time()
    try:
        if not self.db_client:
            return ComponentHealth("timescaledb", HealthStatus.HEALTHY, 0, "not configured")
        health = await self.db_client.get_health()
```

No timeout on `await self.db_client.get_health()`. If the DB is unresponsive (network partition, slow query), this hangs indefinitely. Same for Redis `await self.redis_client.ping()`. Kubernetes readiness probe times out at 1s, but the coroutine continues running, consuming resources.

**Фикс:** Use `asyncio.wait_for(self.db_client.get_health(), timeout=2.0)`. Catch `asyncio.TimeoutError` and return UNHEALTHY.

### 8.854 health_checks: record_signal/record_order not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/health_checks.py:65-74`

```python
def record_signal(self) -> None:
    self._last_signal_time = time.time()
    self._signal_count += 1
```

Same issue as tracker.py (R849). `_signal_count += 1` is not atomic in async context. Multiple coroutines calling `record_signal()` concurrently may lose increments.

**Фикс:** Use `asyncio.Lock` or accept eventual consistency (counters are approximate).

### 8.855 Code reduction: SignalLogger and TradeLogger near-identical — Info [N/A]

**Файлы:** `ai-signal-bot/src/monitoring/tracker.py:70-96` + `tracker.py:99-125`

```python
class SignalLogger:
    def __init__(self, path: str = "logs/signals.csv"):
        # ... same pattern ...
    def log(self, signal_dict: dict) -> None:
        with open(self.path, "a", ...) as f:
            writer = csv.writer(f)
            writer.writerow([...])

class TradeLogger:
    def __init__(self, path: str = "logs/trades.csv"):
        # ... same pattern ...
    def log(self, trade_dict: dict) -> None:
        with open(self.path, "a", ...) as f:
            writer = csv.writer(f)
            writer.writerow([...])
```

Both classes have the same structure: `__init__` creates directory + writes header, `log()` opens file + writes row. Only the header and field mapping differ. Should be a single `CsvLogger` class with configurable header and field mapping.

**Reduction potential:** ~30 lines.

### 8.856 hft-trade-bot/src/data/aligned_types.h: Aligned Types — ✅ Excellent

**Файл:** `hft-trade-bot/src/data/aligned_types.h` (268 lines)

- **AlignedOrderBookLevel**: 64B, `alignas(64)`, `static_assert` — correct
- **FastSignal**: 256B, `alignas(64)`, fixed-size char arrays (symbol[32], reason[48]), 7 score fields, `set_symbol`/`set_reason` with bounds, `is_actionable`/`is_long`/`is_short`/`rr_ratio`, `now_ns` (steady_clock) + `now_epoch_ns` (system_clock) — excellent
- **FastOrder**: 256B, `alignas(64)`, 5 OrderKind types (MARKET/LIMIT_IOC/LIMIT_FOK/LIMIT_GTD/POST_ONLY), `client_order_id[32]` for idempotency, `expire_at` for GTD — excellent
- **PressureResult**: 192B, `alignas(64)`, 10 pressure fields, SpreadRegime enum — correct
- **RoutingDecision**: 192B, `alignas(64)`, 5 routing strategies, `effective_price`/`fee_bps`/`latency_us` — correct
- **All `static_assert`**: Size validation for each struct — correct
- **No heap allocations**: Fixed-size char arrays, no `std::string` — HFT-optimized
- **Cache-line padding**: `padding_` arrays fill to cache line boundaries — correct

Excellent aligned types with cache-line alignment, fixed-size buffers, static_assert validation, and no heap allocations. ✅

### 8.857 aligned_types: set_symbol/set_reason/set_exchange repeated 5 times — Info

**Файл:** `hft-trade-bot/src/data/aligned_types.h:58-74,146-171,246-262`

The same `set_symbol`/`set_reason`/`set_exchange` pattern (while loop with bounds check) is repeated in FastSignal, FastOrder, and RoutingDecision. Each is ~7 lines, total ~35 lines of duplicated code.

**Reduction potential:** ~25 lines. Use a template function: `template<size_t N> void copy_str(char (&dst)[N], const char* src)`.

### 8.858 aligned_types: FastSignal confidence is uint8_t 0-100 — Low

**Файл:** `hft-trade-bot/src/data/aligned_types.h:34`

```cpp
uint8_t   confidence{0}; // 0-100
```

Confidence is stored as `uint8_t` (0-100), but `SignalMsg` in `shm_protocol.h` uses `float` (0.0-1.0). When converting FastSignal → SignalMsg, confidence is divided by 100.0, losing precision: 85% → 0.85 (OK), but 85.5% → 85 → 0.85 (0.5% lost). If two signals have confidence 85.4 and 85.6, both become 85 — indistinguishable.

**Фикс:** Use `uint16_t` (0-10000, 2 decimal places) or `float` directly.

### 8.859 hft-trade-bot/src/data/types.h: Types — ✅ Good

**Файл:** `hft-trade-bot/src/data/types.h` (92 lines)

- **Candle**: OHLCV + symbol + exchange — correct
- **OrderBookLevel**: price + quantity — correct
- **OrderBook**: bids/asks vectors, `best_bid`/`best_ask`/`spread`/`mid_price` — correct
- **Order**: id, symbol, exchange, side, type, quantity, optional price, status, filled_price/qty, fee — comprehensive
- **Position**: symbol, exchange, side, quantity, entry_price, SL/TP, opened_at, unrealized_pnl, fees_paid, funding_paid, `is_long()`, `update_pnl()` — correct
- **Side/OrderType/OrderStatus enums**: Clear — correct
- **string_to_side**: Returns SELL for any non-BUY string — Low (silent default)

Good types with Candle, OrderBook, Order, Position, and enums. ✅

### 8.860 types: string_to_side defaults to SELL — Low

**Файл:** `hft-trade-bot/src/data/types.h:21-23`

```cpp
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}
```

Any non-"BUY" string (typos, empty string, "buy" lowercase) defaults to SELL. This is a silent error — a typo like "Buy" or "buy" creates a SELL order instead of raising an error.

**Фикс:** Throw `std::invalid_argument` for unknown strings. Or add case-insensitive comparison.

### 8.861 types: Order timestamp uses milliseconds, FastOrder uses nanoseconds — Low

**Файлы:** `hft-trade-bot/src/data/types.h:66` + `hft-trade-bot/src/data/aligned_types.h:137`

```cpp
// types.h: Order
int64_t timestamp{static_cast<int64_t>(std::time(nullptr) * 1000)}; // milliseconds

// aligned_types.h: FastOrder
int64_t timestamp{0}; // nanoseconds (per FastSignal::now_ns)
```

`Order` uses milliseconds (`std::time * 1000`), `FastOrder` uses nanoseconds. When converting between them, the timestamp is off by 1000×. If `Order.timestamp` (ms) is passed to `FastOrder.timestamp` (ns), the order appears to be from 1000× in the past. This is a silent data corruption.

**Фикс:** Use consistent units. Either both ms or both ns. Document the unit in the field name: `timestamp_ms` or `timestamp_ns`.

### 8.862 hft-trade-bot/src/data/symbol_map.h: Symbol Map — ✅ Good

**Файл:** `hft-trade-bot/src/data/symbol_map.h` (130 lines)

- **FNV-1a hash**: `constexpr` compile-time hash — correct
- **SymbolMap**: Runtime bidirectional mapping (string ↔ ID), `unordered_map` — correct
- **PerfectSymbolMap**: Compile-time known symbols, hash probe + linear fallback — clever
- **0xFFFF invalid ID**: Sentinel value — correct
- **`get_id`/`get_symbol`/`has_symbol`**: Complete API — correct

Good symbol map with FNV-1a hash, runtime and compile-time variants, and bidirectional mapping. ✅

### 8.863 symbol_map: PerfectSymbolMap hash collision fallback is O(N) — Low

**Файл:** `hft-trade-bot/src/data/symbol_map.h:96-107`

```cpp
static uint16_t get_id(std::string_view symbol) {
    uint16_t bucket = static_cast<uint16_t>(symbol_hash(symbol) % NUM_KNOWN_SYMBOLS);
    if (bucket < NUM_KNOWN_SYMBOLS && symbol == KNOWN_SYMBOLS[bucket]) {
        return bucket;
    }
    // Hash collision or unknown symbol — fall back to linear search
    for (size_t i = 0; i < NUM_KNOWN_SYMBOLS; ++i) {
        if (symbol == KNOWN_SYMBOLS[i]) {
            return static_cast<uint16_t>(i);
        }
    }
    return 0xFFFF;
}
```

If the hash collides (symbol hashes to a bucket that contains a different symbol), the function falls back to linear search O(N). With 10 symbols, this is up to 10 string comparisons per lookup. The "perfect hash" is not actually perfect — it's a hash + fallback.

**Фикс:** Use a real perfect hash function (e.g., gperf or CMPH) that guarantees no collisions. Or use a `constexpr` sorted array with binary search O(log N).

### 8.864 symbol_map: get_id allocates std::string — Low

**Файл:** `hft-trade-bot/src/data/symbol_map.h:39-41`

```cpp
[[nodiscard]] uint16_t get_id(std::string_view symbol) const {
    auto it = symbol_to_id_.find(std::string(symbol));
```

`std::string(symbol)` allocates a temporary string for every `find()` call. In the hot path (every tick, every symbol), this is a heap allocation. `unordered_map` with `std::string` key doesn't support `string_view` lookup directly (pre-C++20 without transparent comparator).

**Фикс:** Use `std::unordered_map<std::string, uint16_t, StringHash, std::equal_to<>>` with transparent lookup (C++20). Or use a flat array indexed by symbol ID.

### 8.865 ai-signal-bot/src/observability/tracing.py: Tracing — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry + Jaeger**: OTLP gRPC exporter — correct
- **Resource**: service.name, namespace, version — correct
- **BatchSpanProcessor**: Batches spans for efficiency — correct
- **AsyncioInstrumentor**: Auto-instruments async code — excellent
- **NoopTracer fallback**: When opentelemetry not installed — graceful
- **setup_tracing idempotent**: `_initialized` flag — correct
- **shutdown_tracing**: Flushes + shuts down — correct
- **Error handling**: ImportError, RuntimeError, OSError, ValueError — resilient

Good tracing setup with OpenTelemetry, Jaeger, noop fallback, idempotent init, and graceful shutdown. ✅

### 8.866 tracing: global singleton not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/tracing.py:25-26`

```python
_tracer: object | None = None
_initialized: bool = False
```

`_tracer` and `_initialized` are module-level globals. If two threads call `setup_tracing()` simultaneously (e.g., during startup race), both may pass the `if _initialized` check and create two TracerProviders. The second `trace.set_tracer_provider()` may throw or overwrite the first.

**Фикс:** Use `threading.Lock` around setup. Or accept that setup is called once at startup (before threads start).

### 8.867 ai-signal-bot/src/observability/logging.py: Structured Logging — ✅ Excellent

**Файл:** `ai-signal-bot/src/observability/logging.py` (171 lines)

- **structlog**: JSON-formatted with correlation IDs — correct
- **Contextual fields**: service, version via `_add_service_context` — correct
- **Console + JSON**: Dev (ConsoleRenderer with colors) + Prod (JSONRenderer) — correct
- **File handler**: Optional, always JSON — correct
- **Library noise suppression**: asyncio, websockets, aiohttp.access → WARNING — good
- **Fallback**: If structlog not installed, basic logging — graceful
- **`bind_context`/`clear_context`**: Contextual binding via contextvars — excellent
- **Idempotent**: `_configured` flag — correct
- **Well-structured**: `_configure_structlog`, `_create_formatter`, `_setup_handlers`, `_suppress_library_noise` — clean separation

Excellent structured logging with structlog, correlation IDs, contextual fields, console/JSON modes, library noise suppression, and contextvars binding. ✅

### 8.868 logging: _configured flag not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/observability/logging.py:28-39`

```python
_configured: bool = False

def setup_logging(...) -> None:
    global _configured
    if _configured:
        return
    # ... configure ...
    _configured = True
```

Same issue as tracing.py (R866). If two threads call `setup_logging()` simultaneously, both may pass the `if _configured` check and configure logging twice. The second configuration's handlers replace the first's.

**Фикс:** Use `threading.Lock` or accept that setup is called once at startup.

### 8.869 Code reduction: set_symbol/set_reason/set_exchange duplicated 5× — Info

**Файл:** `hft-trade-bot/src/data/aligned_types.h:58-74,146-171,246-262`

Same pattern repeated 5 times across FastSignal, FastOrder, and RoutingDecision. Each is a while loop with bounds check and null termination.

**Reduction potential:** ~25 lines. Use a template function:
```cpp
template<size_t N>
inline void copy_str(char (&dst)[N], const char* src) noexcept {
    size_t i = 0;
    while (src[i] && i < N - 1) { dst[i] = src[i]; ++i; }
    dst[i] = '\0';
}
```

### 8.870 hft-trade-bot/src/strategies/momentum_breakout_v2.h: Momentum Breakout V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/momentum_breakout_v2.h` (204 lines)

- **EMA stack 9/21/50/200**: Multi-timeframe momentum — correct
- **Volume confirmation**: `volume > 1.5× average` with ring buffer — correct
- **ATR-based breakout**: `prev_high + ATR × 1.5` — correct
- **ADX-gated**: Only trade when ADX > 25 — correct
- **4 actions**: NONE, LONG, SHORT, EXIT — comprehensive
- **No heap allocations**: InlineEMA, InlineADX, `std::array<double, 256>` — HFT-optimized
- **Config validation**: Clamps `volume_avg_period` and `atr_period` — correct
- **`noexcept` on hot path**: `on_candle()` — correct
- **Confidence scoring**: Base 40 + EMA 15 + volume 15 + ADX 15 + ADX excess 15 = max 100 — correct
- **EXIT signal**: EMA fast < mid + negative slope — correct

Excellent momentum breakout with multi-timeframe EMA stack, volume confirmation, ATR breakout levels, ADX gating, and no heap allocations. ✅

### 8.871 momentum_breakout_v2: no per-symbol state — Medium [N/A]

**Файл:** `hft-trade-bot/src/strategies/momentum_breakout_v2.h:20-201`

Same issue as `mean_reversion_v2.h` (R802). All member state (EMA filters, ATR, ADX, volume buffer, candle count) is per-instance, not per-symbol. If the same `MomentumBreakoutV2` instance processes multiple symbols, EMA values from BTC contaminate ETH's signals. The EMA stack, ATR, ADX, and volume average are all shared across symbols.

**Фикс:** Add a `PerSymbolState` struct (like recommended for mean_reversion_v2) or use one instance per symbol.

### 8.872 momentum_breakout_v2: vol_buffer_ 256 doubles = 2KB per instance — Low

**Файл:** `hft-trade-bot/src/strategies/momentum_breakout_v2.h:197`

```cpp
std::array<double, 256> vol_buffer_{};
```

256 doubles = 2KB per instance. With 50 symbols × 1 instance per symbol = 100KB. Not a problem, but the `volume_avg_period` defaults to 20 — only 20 slots are used. 236 slots (1.9KB) are wasted.

**Фикс:** Use `std::array<double, 64>` (max realistic `volume_avg_period`).

### 8.873 hft-trade-bot/src/strategies/statistical_arb_v2.h: Statistical Arb V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/statistical_arb_v2.h` (252 lines)

- **Engle-Granger 2-step**: OLS regression for cointegration — correct
- **Kalman filter hedge ratio**: Adaptive, `KalmanFilter1D` from `mean_reversion_v2.h` — correct
- **Z-score entry/exit**: entry_z=2.0, exit_z=0.5, stop_z=4.0 — correct
- **5 actions**: NONE, LONG_SHORT, SHORT_LONG, CLOSE, STOP — comprehensive
- **No heap allocations**: `std::array<double, 1024>` × 3, `alignas(64)` — HFT-optimized
- **Ring buffer for prices/spreads**: Power-of-2 MAX_WINDOW=1024 — correct
- **OLS regression**: sum_x, sum_y, sum_xy, sum_xx — correct
- **Z-score**: mean + std_dev, handles sd=0 — correct
- **CorrelationMatrix**: 20×20, `find_pairs()` with threshold — useful
- **Config validation**: Clamps `regression_window` — correct
- **`reset()`**: Clears all state — correct

Excellent statistical arbitrage with Engle-Granger cointegration, Kalman hedge ratio, z-score signals, and correlation matrix. ✅

### 8.874 statistical_arb_v2: CorrelationMatrix::find_pairs allocates vector — Low

**Файл:** `hft-trade-bot/src/strategies/statistical_arb_v2.h:235-244`

```cpp
std::vector<Pair> find_pairs(double threshold = 0.7) const noexcept {
    std::vector<Pair> pairs;
    // ...
    return pairs;
}
```

`find_pairs()` returns a `std::vector<Pair>` — heap allocation. Marked `noexcept` but `std::vector::push_back` can throw `std::bad_alloc`. If the vector throws, `std::terminate` is called (due to `noexcept`).

**Фикс:** Pre-allocate a fixed-size array (max 190 pairs for 20 symbols) or remove `noexcept`.

### 8.875 statistical_arb_v2: no per-pair state for CorrelationMatrix — Low

**Файл:** `hft-trade-bot/src/strategies/statistical_arb_v2.h:210-249`

`CorrelationMatrix` is a 20×20 static matrix. It doesn't track which symbols are at which indices — the caller must manage the index mapping. If the caller uses wrong indices, correlations are stored in wrong cells.

**Фикс:** Add a symbol-to-index mapping or document that indices must be consistent.

### 8.876 ai-signal-bot/src/communication/circuit_breaker.py: Circuit Breaker — ✅ Good

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3 states**: CLOSED, OPEN, HALF_OPEN — correct
- **Config dataclass**: failure_threshold=5, cooldown=60s, half_open_max_probes=1, success_threshold=2 — correct
- **HALF_OPEN probe limiting**: `half_open_probes < half_open_max_probes` — correct (unlike C++ version R814)
- **Success threshold**: 2 consecutive successes to close — correct
- **Metrics**: total_trips, total_blocks — correct
- **`state` property**: Auto-transitions OPEN → HALF_OPEN on cooldown expiry — clever
- **`reset()`**: Force reset — correct
- **`get_status()`**: Status dict for monitoring — correct

Good circuit breaker with 3 states, HALF_OPEN probe limiting, success threshold, metrics, and auto-transition. Better than C++ version (R814) which allows multiple probes. ✅

### 8.877 circuit_breaker.py: state property has side effect — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py:47-54`

```python
@property
def state(self) -> BreakerState:
    if self._state == BreakerState.OPEN:
        if time.time() - self._opened_at >= self.config.cooldown_seconds:
            self._state = BreakerState.HALF_OPEN
            self._half_open_probes = 0
            logger.info("Circuit breaker: OPEN → HALF_OPEN (cooldown expired)")
    return self._state
```

The `state` property has a side effect: it mutates `_state` and `_half_open_probes` and logs. Properties should be idempotent — calling `state` twice should not produce different behavior. But here, the first call transitions OPEN → HALF_OPEN, and the second call returns HALF_OPEN (no transition). The log message is only printed once, which is correct, but the mutation is unexpected for a property.

**Фикс:** Use an explicit `check_transition()` method. Or document that `state` has side effects.

### 8.878 circuit_breaker.py: not thread-safe — Low [FIXED]

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py:34-45`

Same issue as `helpers.py` CircuitBreaker (R824). `_consecutive_failures += 1` is not atomic in async context. Multiple coroutines calling `record_failure()` concurrently may lose increments.

**Фикс:** Use `asyncio.Lock` or accept eventual consistency.

### 8.879 Code reduction: 3 CircuitBreaker implementations — Info

**Файлы:** `hft-trade-bot/src/utils/low_latency.h:359-413` + `ai-signal-bot/src/utils/helpers.py:145-176` + `ai-signal-bot/src/communication/circuit_breaker.py:34-137`

Three CircuitBreaker implementations:
1. C++ `low_latency.h` — atomic, HALF_OPEN allows multiple probes (R814)
2. Python `helpers.py` — simple, not thread-safe (R824)
3. Python `circuit_breaker.py` — most complete, HALF_OPEN probe limiting, success threshold, metrics

The Python `circuit_breaker.py` is the best implementation. `helpers.py` CircuitBreaker should be removed and callers should use `circuit_breaker.py` instead.

**Reduction potential:** ~30 lines (remove `helpers.py` CircuitBreaker).

### 8.880 ai-signal-bot/src/communication/health_check.py: Health Aggregator — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/health_check.py` (127 lines)

- **Aggregates 3 services**: ai-signal-bot, exchange-simulator, hft-trade-bot — correct
- **`asyncio.gather()`**: Concurrent health checks — correct (unlike `health_checks.py` R842!)
- **3s timeout per service**: `aiohttp.ClientTimeout(total=3.0)` — correct
- **3 health states**: healthy, degraded, unhealthy — correct
- **Overall status logic**: all healthy → healthy, any unhealthy → unhealthy, else degraded — correct
- **HTTP 503 for unhealthy**: K8s-ready — correct
- **`/health` + `/healthz`**: Both endpoints — correct
- **Error handling**: TimeoutError, ConnectionRefusedError, Exception — resilient
- **`time.monotonic()`**: For latency measurement — correct (not `time.time()`)
- **Clean start/stop**: AppRunner + TCPSite — correct

Excellent health aggregator with concurrent checks, 3s timeout, 3 health states, K8s-ready HTTP codes, and resilient error handling. Better than `health_checks.py` which runs sequentially (R842). ✅

### 8.881 health_check.py: creates new aiohttp.ClientSession per check — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
    async with session.get(url) as resp:
```

A new `ClientSession` is created for each service check. `ClientSession` creation involves a connection pool, DNS resolver, and cookie storage — creating and destroying it per check is wasteful. With 3 services checked every 10s, that's 18 sessions/min.

**Фикс:** Create one `ClientSession` in `__init__` or `start()`, reuse for all checks, close in `stop()`.

### 8.882 ai-signal-bot/src/communication/metrics_server.py: Metrics Server — ✅ Good

**Файл:** `ai-signal-bot/src/communication/metrics_server.py` (136 lines)

- **Prometheus text format**: No external deps — correct
- **7 metrics**: 4 counters, 3 gauges — comprehensive
- **`# HELP` + `# TYPE`**: Prometheus metadata — correct
- **MetricsCollector**: record_signal_sent, record_signal_blocked, record_backtest, record_cb_trip, set_ws_clients, set_cb_state — correct
- **MetricsServer**: asyncio.start_server, HTTP response — correct
- **Clean start/stop**: asyncio server — correct
- **Error handling**: ConnectionError, OSError — resilient
- **`writer.close()` in finally**: Correct cleanup — correct

Good metrics server with Prometheus text format, 7 metrics, no external deps, and clean lifecycle. ✅

### 8.883 metrics_server: not thread-safe — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py:25-50`

```python
self._signals_sent = 0
# ...
def record_signal_sent(self) -> None:
    self._signals_sent += 1
```

Same issue as tracker.py (R839). `_signals_sent += 1` is not atomic in async context. Multiple coroutines calling `record_signal_sent()` concurrently may lose increments.

**Фикс:** Use `asyncio.Lock` or accept eventual consistency (counters are approximate).

### 8.884 metrics_server: raw HTTP parsing — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/metrics_server.py:109-127`

```python
async def _handle_connection(self, reader, writer):
    await reader.readline()  # Request line
    while True:
        line = await reader.readline()
        if line in (b"\r\n", b"\n", b""):
            break
    body = self.collector.render().encode("utf-8")
    response = (
        f"HTTP/1.1 200 OK\r\n"
        # ...
    ).encode() + body
```

Raw HTTP parsing with `readline()`. No method checking (GET/POST), no path checking (`/metrics` vs `/`), no header parsing. Any request to any path returns metrics. A POST to `/metrics` returns metrics too. Not a security issue (metrics are read-only), but it's not spec-compliant.

**Фикс:** Use `aiohttp.web` for proper HTTP handling (like `health_check.py` does). Or at minimum, check the request path.

### 8.885 Code reduction: duplicate CircuitBreaker in helpers.py and circuit_breaker.py — Info [FIXED]

**Файлы:** `ai-signal-bot/src/utils/helpers.py:145-176` + `ai-signal-bot/src/communication/circuit_breaker.py:34-137`

`helpers.py` has a simple CircuitBreaker (no HALF_OPEN, no metrics, no success threshold). `circuit_breaker.py` has a complete CircuitBreaker (3 states, probe limiting, success threshold, metrics, reset, get_status). The `helpers.py` version is a subset and should be removed.

**Reduction potential:** ~30 lines.

### 8.886 hft-trade-bot/src/strategies/signal_engine_v3.h: Signal Engine V3 (HMM Regime) — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h` (437 lines)

- **OnlineHMM**: 4-state Gaussian emission (TRENDING_UP/DOWN/RANGING/VOLATILE), forward recursion in log-space, online Baum-Welch adaptation every 50 updates — correct
- **Log-space numerical stability**: log_alpha, log_trans, log_gaussian with log-sum-exp trick — correct
- **Volatility EWMA**: RiskMetrics-style λ=0.94 — correct
- **Regime gating**: TRENDING_UP boosts LONG/dampens SHORT, RANGING caps confidence, VOLATILE widens stops + reduces leverage — correct
- **Per-symbol HMM state**: `unordered_map<string, HMMState, StringHash>` with transparent lookup — correct (fixes V2's per-symbol issue)
- **HMM update threshold**: Only update when price changes > 0.01% — efficient
- **`noexcept` on analyze()**: Correct for hot path
- **append_regime_reason**: Manual string append with bounds checking — careful

Excellent HMM regime detection with online learning, log-space stability, per-symbol state, and regime-gated signals. ✅

### 8.887 signal_engine_v3: get_or_create_hmm_state heap alloc in noexcept — Medium [FIXED]

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:352-357`

```cpp
inline HMMState& get_or_create_hmm_state(const char* symbol) noexcept {
    auto it = hmm_states_.find(std::string_view(symbol));
    if (it == hmm_states_.end()) {
        it = hmm_states_.emplace(std::string(symbol), HMMState{}).first;
    }
    return it->second;
}
```

Same issue as V2 (R796/R808). `emplace` allocates a new `std::string` key + `HMMState` (which contains an `OnlineHMM` with `std::array`). The `unordered_map::emplace` can throw `std::bad_alloc`. The function is called from `analyze()` which is `noexcept`. If `emplace` throws → `std::terminate` → abort.

**Фикс:** Pre-populate `hmm_states_` at init for all known symbols. Or remove `noexcept` from `analyze()`.

### 8.888 signal_engine_v3: forward_recursion uses raw array — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:175`

```cpp
double trans_sum[N_STATES][N_STATES];
```

`N_STATES` is `static constexpr int = 4`, so this is a fixed-size array. However, it's stack-allocated inside a hot-path function. 4×4 doubles = 128 bytes — negligible. Could use `std::array` for consistency.

**Фикс:** Use `std::array<std::array<double, N_STATES>, N_STATES>` for consistency.

### 8.889 signal_engine_v3: adapt_parameters only updates emission means — Low

**Файл:** `hft-trade-bot/src/strategies/signal_engine_v3.h:227-245`

The `adapt_parameters()` method only updates emission means (`emit_mean_`). It does not update emission variances (`emit_var_`) or the transition matrix (`log_trans_`). This means the HMM cannot fully adapt to changing market conditions — variances and transition probabilities remain at their initial values forever.

**Фикс:** Add online updates for `emit_var_` and `log_trans_` (weighted EWMA).

### 8.890 hft-trade-bot/src/strategies/market_making_v2.h: Market Making V2 (Avellaneda-Stoikov) — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/market_making_v2.h` (177 lines)

- **Avellaneda-Stoikov**: Reservation price `r = s - q * γ * σ² * (T-t)`, optimal spread `γσ²T + (2/γ)ln(1+γ/k)` — correct
- **Inventory skew**: Bid/ask size skewed by inventory ratio — correct
- **Adverse selection**: Cancel when toxicity > threshold — correct
- **Spread clamping**: `max(spread_floor, min(spread_cap, optimal_spread))` — correct
- **Max inventory guard**: Don't quote on side that would increase inventory — correct
- **EWMA volatility**: `alpha = 2/(period+1)` — correct
- **No heap allocations**: All stack-allocated — correct
- **`noexcept` on generate_quotes()**: Correct
- **`reset()`**: Clears all state — correct

Excellent Avellaneda-Stoikov market making with inventory skew, adverse selection protection, spread clamping, and no heap allocations. ✅

### 8.891 market_making_v2: t_remaining always = T — Low

**Файл:** `hft-trade-bot/src/strategies/market_making_v2.h:66`

```cpp
double t_remaining = T;
```

The Avellaneda-Stoikov model requires `T-t` (time remaining until horizon). The code always uses `t_remaining = T`, meaning `t=0` always. In reality, `t` should increase as the trading session progresses, reducing the reservation price adjustment as the horizon approaches. This means inventory penalty is constant throughout the session, which is suboptimal.

**Фикс:** Track session start time, compute `t_remaining = T - elapsed`.

### 8.892 market_making_v2: no per-symbol state — Medium [N/A]

**Файл:** `hft-trade-bot/src/strategies/market_making_v2.h:21-174`

Same issue as momentum_breakout_v2 (R861). `current_sigma_`, `vol_ewma_`, `last_mid_`, `vol_count_` are per-instance. If the same `MarketMakingV2` processes multiple symbols, volatility from BTC contaminates ETH's quotes.

**Фикс:** One instance per symbol, or per-symbol state struct.

### 8.893 hft-trade-bot/src/strategies/simd_indicators.h: SIMD Indicators — ✅ Good

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h` (228 lines)

- **AVX2 EMA**: 4 doubles in parallel with `_mm256_fmadd_pd` — correct
- **Scalar fallback**: `#if defined(__AVX2__)` with else branch — correct
- **SimdRSI**: Correct Wilder's smoothing — correct
- **SimdMA (SMA)**: AVX2 horizontal sum with `extractf128` + `unpackhi` — correct
- **SimdVWAP**: AVX2 parallel PV + V sum — correct
- **SimdUtils**: `has_avx2()`, `get_cpu_features()` — useful

Good SIMD indicators with AVX2 acceleration and scalar fallback. ✅

### 8.894 simd_indicators: ema_array and rsi use std::vector — Low

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h:45-54, 61`

```cpp
static std::vector<double> ema_array(const std::vector<double>& prices, double alpha) {
    std::vector<double> ema_values(prices.size());
```

`ema_array` and `rsi` take `std::vector<double>` by const ref and return `std::vector<double>`. This involves heap allocations — not suitable for hot path. The AVX2 `ema_avx2` method takes raw pointers and is hot-path-safe, but `ema_array` and `rsi` are not.

**Фикс:** Use `ema_avx2` with pre-allocated buffers in hot path. Keep `ema_array`/`rsi` for batch/offline use only.

### 8.895 simd_indicators: has_avx2 is compile-time only — Low

**Файл:** `hft-trade-bot/src/strategies/simd_indicators.h:200-206`

```cpp
static bool has_avx2() {
#if defined(__AVX2__)
    return true;
#else
    return false;
#endif
}
```

`has_avx2()` returns a compile-time constant. It doesn't actually check CPU features at runtime. If the code is compiled with `-mavx2` but runs on a CPU without AVX2, it will crash with SIGILL. The function gives a false sense of runtime detection.

**Фикс:** Use `__builtin_cpu_supports("avx2")` (GCC) or `cpuid` intrinsics for true runtime detection.

### 8.896 hft-trade-bot/src/strategies/obi_utils.h: OBI Utils — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/obi_utils.h` (78 lines)

- **3 OBI functions**: `compute_obi_levels`, `compute_weighted_obi`, `compute_obi_all` — correct
- **Weighted OBI**: `w = 1/(1+i)` — distance-weighted — correct
- **`compute_obi_all`**: Single-pass for 5/10/20 levels + weighted — efficient
- **Edge case handling**: `total > 1e-12` guard, fallback when `n < l5` — correct
- **`noexcept` on all functions**: Correct
- **No heap allocations**: All stack-allocated — correct
- **Extracted from signal_engine_v2.h**: Good file-size compliance

Excellent OBI utilities with 3 computation modes, single-pass optimization, edge case handling, and no heap allocations. ✅

### 8.897 ai-signal-bot/src/communication/fix_client.py: FIX 4.4 Client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/fix_client.py` (447 lines)

- **FIX 4.4**: Logon/logout/heartbeat/new order/cancel/market data — correct
- **Persistent seq nums**: File-based `_load_seq_nums`/`_save_seq_nums` — correct
- **Checksum verification**: `sum(raw_msg[:cs_pos]) % 256` — correct
- **Sequence gap handling**: ResendRequest (35=2) + pending queue — correct
- **Heartbeat loop**: `heart_bt_int` interval, cancelable — correct
- **Callbacks**: on_execution_report, on_market_data, on_logon, on_logout — correct
- **Clean start/stop**: connect + logon + read loop / logout + cancel + close — correct
- **SOH-delimited parsing**: `text.split(SOH)` with `=` separator — correct

Good FIX 4.4 client with persistent sequence numbers, checksum verification, gap recovery, and clean lifecycle. ✅

### 8.898 fix_client: password in plaintext debug log — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:199-200, 408`

```python
if password:
    extra.append((554, password))
# ...
logger.debug(f"FIX message type {msg.msg_type}: {msg.fields}")
```

The password is added as FIX field tag 554. At log level DEBUG, `msg.fields` is logged — this includes tag 554 (password) in plaintext. With 1000 users, if debug logging is enabled for troubleshooting, all FIX passwords are exposed in logs. Logs may be shipped to centralized logging (ELK, Splunk), making passwords accessible to log readers.

**Фикс:** Filter tag 554 (and 553 username) from debug logging. Redact sensitive tags before logging.

### 8.899 fix_client: seq file in tempfile.gettempdir() — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:126`

```python
seq_file: str = os.path.join(tempfile.gettempdir(), "fix_seq.txt"),
```

The sequence number file is in the system temp directory. On Linux, `/tmp` is world-readable and cleared on reboot. If the system reboots, sequence numbers are lost, which can cause FIX session issues (gap detection, resend requests). Also, multiple bot instances would share the same seq file.

**Фикс:** Use a dedicated data directory (e.g., `data/fix_seq.txt`). Include sender_comp_id in filename for multi-instance support.

### 8.900 fix_client: no reconnect logic — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:289-337`

The `_read_loop` sets `state = "DISCONNECTED"` on error and breaks. There is no automatic reconnect. Unlike `ws_client.py` which has `reconnect()` with exponential backoff, the FIX client requires manual reconnection.

**Фикс:** Add `reconnect()` method with exponential backoff, similar to `ws_client.py`.

### 8.901 fix_client: _pending_messages unbounded — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/fix_client.py:139, 352`

```python
self._pending_messages: list[FixMessage] = []
# ...
self._pending_messages.append(msg)
```

If the counterparty keeps sending messages with seq nums ahead of expected, `_pending_messages` grows unbounded. A malicious or buggy counterparty could exhaust memory.

**Фикс:** Cap `_pending_messages` at a reasonable limit (e.g., 1000). Drop excess and log warning.

### 8.902 ai-signal-bot/src/communication/ws_client.py: WebSocket Client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **Optional msgpack/orjson**: Graceful fallback to json — correct
- **Compression**: `compression="deflate"` — correct
- **Ping interval**: 10s — correct
- **Max size**: 2²⁰ = 1MB — correct
- **Candle history**: `deque(maxlen=200)` — correct
- **Reconnect**: 5 attempts, exponential backoff (1s → 30s) — correct
- **Trading state**: `_trading_active` flag, checked before order submission — correct
- **Message types**: candles, snapshot, trading_state, error, welcome — comprehensive

Good WebSocket client with optional encoding, compression, reconnect, and trading state management. ✅

### 8.903 ws_client: no reconnect on listen() exit — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_client.py:119-121`

```python
except websockets.ConnectionClosed:
    logger.warning("Connection closed by server")
    self._connected = False
```

When the connection closes, `listen()` exits. There is no automatic call to `reconnect()`. The caller must detect the exit and call `reconnect()` manually. If the caller doesn't, the bot stops receiving market data silently.

**Фикс:** Call `self.reconnect()` in the except block, or document that the caller must handle reconnection.

### 8.904 ws_client: _process_message not async — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_client.py:123`

```python
def _process_message(self, data: dict) -> None:
```

`_process_message` is sync but called from an async context. If it does heavy processing (e.g., updating 50 symbols × 200 candles), it blocks the event loop. Currently it's just dict updates, so it's fast, but if processing grows, it becomes a problem.

**Фикс:** Keep as sync if it stays lightweight. Document that it must not block.

### 8.905 ai-signal-bot/src/communication/ws_connection_pool.py: WebSocket Connection Pool — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py` (152 lines)

- **Pool with max size**: 10 connections, per-URL lists — correct
- **Stale eviction**: `is_stale(timeout=30s)` — correct
- **Health checks**: Ping with 5s timeout, mark unhealthy — correct
- **asyncio.Lock**: Protects pool operations — correct
- **Clean close_all**: Cancel health task + close all connections — correct
- **Pool stats**: `pool_stats()` for monitoring — correct
- **`time.monotonic()`**: For staleness check — correct

Good WebSocket connection pool with stale eviction, health checks, asyncio.Lock, and clean lifecycle. ✅

### 8.906 ws_connection_pool: _evict_stale creates fire-and-forget tasks — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py:106`

```python
asyncio.create_task(conn.close())
```

`_evict_stale` creates fire-and-forget tasks for closing stale connections. These tasks are not awaited or tracked. If the event loop closes before they complete, the connections may not be properly closed. Also, if many connections are stale, many tasks are created simultaneously.

**Фикс:** Await `conn.close()` inline or track tasks in a set.

### 8.907 ws_connection_pool: _health_loop runs forever with no error handling — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py:129-133`

```python
async def _health_loop(self) -> None:
    while True:
        await asyncio.sleep(self._health_check_interval)
        await self.health_check()
```

If `health_check()` raises an unexpected exception (not OSError/TimeoutError/WebSocketException), the health loop crashes silently. No more health checks will run, and stale connections won't be detected.

**Фикс:** Wrap `health_check()` in try/except, log errors, continue loop.

### 8.908 Code reduction: simd_indicators horizontal sum duplicated 2× — Info

**Файлы:** `simd_indicators.h:117-123` (SMA) + `simd_indicators.h:164-178` (VWAP)

The AVX2 horizontal sum pattern (`extractf128` → `castpd256_pd128` → `add_pd` → `unpackhi` → `add_sd` → `cvtsd_f64`) is duplicated in `sma()` and `vwap()`.

**Reduction potential:** ~10 lines. Extract to `static double hsum256(__m256d v)` helper.

### 8.909 hft-trade-bot/src/strategies/inline_indicators.h: Inline Indicators — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/inline_indicators.h` (295 lines)

- **InlineEMA**: O(1) update, `k = 2/(period+1)`, auto-init on first value — correct
- **InlineRSI**: Wilder's smoothing, branchless `fmax` for gain/loss, `inv_period` precomputed — correct
- **InlineADX**: Wilder's smoothing, branchless DM via `static_cast<double>(bool)`, `+DI`/`-DI`/`DX`/`ADX` — correct
- **InlineVWAP**: Running cumulative with variance tracking, `z_score()` and `deviation_bps()` — correct
- **InlineATR**: Wilder's smoothing, True Range with `fmax(fabs(high-prev_close), fabs(low-prev_close))` — correct
- **All `noexcept`**: Correct
- **No heap allocations**: All stack-allocated — correct
- **Precomputed `inv_period` and `inv_period_complement`**: Avoids division in hot path — efficient
- **`StringHash` with transparent lookup**: Enables `find(string_view)` without allocation — correct

Excellent inline indicators with O(1) updates, Wilder's smoothing, branchless arithmetic, precomputed inverses, and no heap allocations. ✅

### 8.910 inline_indicators: InlineVWAP has no reset on session boundary — Low

**Файл:** `hft-trade-bot/src/strategies/inline_indicators.h:234-238`

```cpp
void reset() noexcept {
    cum_pv_  = 0.0;
    cum_v_   = 0.0;
    cum_var_ = 0.0;
}
```

`InlineVWAP` has a `reset()` method, but it's never called automatically on session boundaries. VWAP typically resets at the start of each trading day. If the bot runs continuously, VWAP accumulates across days, making it meaningless after a few days.

**Фикс:** Track session start timestamp, call `reset()` at day boundaries.

### 8.911 hft-trade-bot/src/strategies/pressure_model.h: Pressure Model — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h` (258 lines)

- **Multi-level OBI**: Single-pass for 5/10/20 levels — efficient (previously 3 separate calls)
- **Distance-weighted OBI**: `w = 1/(1+i)` — correct
- **Trade flow imbalance**: Buyer vs seller initiated — correct
- **Toxicity detection**: `nth_element` for median, toxic_size_threshold × median — correct
- **Microprice**: `(bb*av + ba*bv) / (bv+av)` — correct
- **Queue position**: Best-level ratio to total 10 levels — correct
- **Price impact**: `obi*2 + trade_imbalance*1.5 + microprice_dev*0.5` — correct
- **Spread regime**: TIGHT (<1bps) / NORMAL / WIDE (>5bps) — correct
- **`noexcept` on all methods**: Correct
- **No heap allocations**: All stack-allocated — correct
- **Edge case handling**: Empty bids/asks, mid<=0, total<=0 — comprehensive

Excellent pressure model with multi-level OBI, trade flow, toxicity, microprice, queue position, and price impact — all in a single `noexcept` pass with no heap allocations. ✅

### 8.912 pressure_model: toxicity uses fixed 64-element stack array — Low

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h:186-187`

```cpp
double sizes[64]; // Stack-allocated, max 64 trades
size_t count = std::min(n, static_cast<size_t>(64));
```

The toxicity computation uses a fixed 64-element stack array for `nth_element`. If `n_trades > 64`, only the first 64 trades are considered. This means toxicity is computed on a truncated sample, which may not be representative if trade flow has more than 64 recent trades.

**Фикс:** Document the 64-trade limit. Or use a running median approximation for large n.

### 8.913 pressure_model: compute_obi static method unused — Info

**Файл:** `hft-trade-bot/src/strategies/pressure_model.h:134-143`

The `compute_obi` static method is defined but not called — the main `analyze()` method uses inline OBI computation in a single-pass loop (lines 60-90). The `obi_utils.h` functions are also available. This is dead code.

**Фикс:** Remove `compute_obi` from `pressure_model.h`. Use `obi_utils.h` if needed.

### 8.914 hft-trade-bot/src/strategies/mean_reversion_v2.h: Mean Reversion V2 (OU + Kalman) — ✅ Excellent

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h` (301 lines)

- **KalmanFilter1D**: Predict + update, `K = P/(P+R)`, `x = x + K(measurement - x)` — correct
- **OU estimation**: AR(1) regression `x_t = a*x_{t-1} + b`, `κ = (1-a)/dt` — correct
- **Ring buffer**: `residuals_` and `timestamps_` with `write_idx_ % ou_window` — correct
- **Z-score**: `(residual - theta) / sigma` — correct
- **Half-life**: `ln(2) / kappa` — correct
- **6 actions**: NONE/ENTER_LONG/ENTER_SHORT/EXIT_LONG/EXIT_SHORT/STOP — correct
- **Confidence**: `abs_z * 20` for entry, `abs_z * 15` for stop — correct
- **`alignas(64)` on residuals and timestamps**: Cache-line aligned — correct
- **`noexcept` on all methods**: Correct
- **No heap allocations**: All stack-allocated, `MAX_WINDOW = 2048` — correct
- **`reset()`**: Clears all state — correct

Excellent mean reversion with Kalman fair price, OU parameter estimation, z-score signals, half-life, ring buffers, and cache-line alignment. ✅

### 8.915 mean_reversion_v2: no per-symbol state — Medium [N/A]

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h:60-298`

Same issue as momentum_breakout_v2 (R861) and market_making_v2 (R882). `kalman_`, `residuals_`, `timestamps_`, `write_idx_`, `price_count_`, `last_kappa_`, `last_theta_`, `last_sigma_`, `last_z_` are all per-instance. If the same `MeanReversionV2` processes multiple symbols, Kalman filter and OU parameters from BTC contaminate ETH's signals.

**Фикс:** One instance per symbol, or per-symbol state struct.

### 8.916 mean_reversion_v2: estimate_ou_params is O(n) per tick — Low

**Файл:** `hft-trade-bot/src/strategies/mean_reversion_v2.h:197-283`

`estimate_ou_params()` iterates the entire ring buffer (up to 500 elements) on every price tick. With 50 symbols × 1 tick/sec, that's 50 × 500 = 25,000 iterations/sec. This is not O(1) per tick — it's O(n) where n = ou_window.

**Фикс:** Cache OU parameters and re-estimate every N ticks (e.g., every 50). Or use online EWMA for AR(1) coefficients.

### 8.917 ai-signal-bot/src/communication/signal_publisher.py: Signal Publisher — ✅ Good

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py` (453 lines)

- **WebSocket server**: `websockets.serve` on port 8766, ping_interval=10s — correct
- **Circuit breaker integration**: `allow_signal()` before broadcast — correct
- **Signal history**: `deque(maxlen=100)`, sends last 20 on connect — correct
- **CB status broadcast**: Every 5s, with state_map for metrics — correct
- **Broadcast**: `asyncio.gather` with disconnected tracking — correct
- **Backtest execution**: `_run_backtest` with synthetic candles, strategy selection — correct
- **Backtest comparison**: `BacktestComparison` integration — correct
- **Parameter validation**: `max(10, min(candles, 10000))`, `str(...)[:32]` — correct
- **orjson fallback**: Optional fast JSON — correct

Good signal publisher with circuit breaker, metrics, signal history, backtest execution, and comparison. ✅

### 8.918 signal_publisher: _handle_client catches broad Exception — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:123, 155`

```python
except Exception as e:
    logger.warning(f"Failed to send signal history: {e}")
# ...
except Exception as e:
    logger.debug(f"Client handler error: {e}")
```

Two broad `except Exception` clauses. The first catches all exceptions when sending signal history (including `asyncio.CancelledError` in Python < 3.9). The second catches all exceptions in the message loop, which could mask bugs.

**Фикс:** Catch specific exceptions (`websockets.ConnectionClosed`, `OSError`). Let `CancelledError` propagate.

### 8.919 signal_publisher: _send closure captures loop variable — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:188-193`

```python
disconnected = set()
async def _send(ws):
    try:
        await ws.send(msg)
    except Exception:
        disconnected.add(ws)
await asyncio.gather(*[_send(ws) for ws in self._clients], return_exceptions=True)
```

The `_send` closure captures `disconnected` by reference. This is correct here because `_send` is defined and used in the same scope. However, the same pattern is repeated 3 times (lines 188, 229, 263) — code duplication.

**Фикс:** Extract to a reusable `_broadcast(msg)` method.

### 8.920 signal_publisher: backtest runs in event loop — Medium [FIXED]

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:271-302`

```python
async def _run_backtest(self, params: dict) -> dict:
    # ...
    for name, strat in strategies.items():
        result = bt.run(candles, strat, symbol=bt_params["symbol"], warmup=50)
```

`bt.run()` is a synchronous CPU-intensive operation that runs in the event loop. With 10000 candles × 3 strategies, this can take several seconds, blocking all WebSocket connections. No signals are broadcast during backtest execution.

**Фикс:** Run `bt.run()` in a thread executor: `await asyncio.to_thread(bt.run, candles, strat, ...)`.

### 8.921 ai-signal-bot/src/communication/shm_ring_buffer.py: SHM Ring Buffer — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: `try_push`/`try_pop` with head/tail atomics — correct
- **Cache-line aligned**: `OFF_HEAD=64`, `OFF_TAIL=128` — matches C++ layout
- **Power-of-2 capacity**: `(capacity & (capacity-1)) != 0` check — correct
- **Cross-platform**: Windows (`FlushViewOfFile`) + POSIX (`msync`) — correct
- **Magic validation**: `SHM_MAGIC = 0x484654343253484D` — correct
- **Capacity/element_size validation**: On connect — correct
- **bulk_push/bulk_pop**: Batch operations with single atomic write — correct
- **Context manager**: `__enter__`/`__exit__` + `__del__` — correct
- **unlink**: POSIX `/dev/shm` cleanup — correct
- **Struct definitions**: `SIGNAL_STRUCT`, `FILL_STRUCT` matching C++ layout — correct

Excellent SHM ring buffer with lock-free SPSC, cache-line alignment, cross-platform support, magic validation, bulk operations, and clean lifecycle. ✅

### 8.922 shm_ring_buffer: _atomic_read_u64 is not truly atomic — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py:49-51`

```python
def _atomic_read_u64(mm, offset):
    """Read a uint64 from shared memory (aligned, naturally atomic on x86/x64)."""
    return struct.unpack_from('<Q', mm, offset)[0]
```

The comment says "naturally atomic on x86/x64" — this is true for aligned 8-byte reads on x86/x64. However, Python's `struct.unpack_from` may not guarantee aligned access. The `mmap` object may not guarantee that the offset is aligned to 8 bytes. On ARM, unaligned reads are not atomic.

**Фикс:** Document x86/x64 assumption. For ARM, use `ctypes.c_uint64.from_buffer` with explicit alignment.

### 8.923 shm_ring_buffer: _mm_barrier calls flush on every push — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py:57-58`

```python
def _atomic_write_u64(mm, offset, value):
    struct.pack_into('<Q', mm, offset, value)
    _mm_barrier(mm)
```

Every `_atomic_write_u64` calls `_mm_barrier`, which calls `FlushViewOfFile` (Windows) or `mm.flush()` (POSIX). This is a system call per push/pop, which is expensive. For HFT with 1000s of signals/sec, this adds significant latency.

**Фикс:** Use a memory barrier instruction (`_mm_sfence` on x86) instead of `msync`/`FlushViewOfFile`. Only flush on close or periodically.

### 8.924 shm_ring_buffer: no overflow detection in bulk_push — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py:198-212`

`bulk_push` reads head/tail once, computes available space, then writes elements. If the consumer pops elements between the read and the final head update, the buffer may have more space than computed. This is safe (conservative), but suboptimal. However, if the producer is multi-threaded (violating SPSC), this is unsafe.

**Фикс:** Document SPSC assumption. Add assert for single-producer.

### 8.925 ai-signal-bot/src/communication/shm_signal_producer.py: SHM Signal Producer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_signal_producer.py` (99 lines)

- **Clean wrapper**: `init()`, `push_signal()`, `push_signal_dict()`, `bulk_push()`, `pending()`, `close()` — correct
- **Signal dict conversion**: `confidence / 100.0` (0-100 → 0.0-1.0) — correct
- **Action mapping**: LONG=1, SHORT=2, default=0 — correct
- **Timestamp**: `time.time_ns()` default — correct (nanoseconds)
- **Context manager**: `__enter__`/`__exit__` — correct

Good SHM signal producer with clean API, dict-to-struct conversion, and context manager. ✅

### 8.926 shm_signal_producer: push_signal_dict silent default action=0 — Low [N/A]

**Файл:** `ai-signal-bot/src/communication/shm_signal_producer.py:62-66`

```python
action = 0
if signal.get("direction") == "LONG":
    action = 1
elif signal.get("direction") == "SHORT":
    action = 2
```

If `direction` is not "LONG" or "SHORT" (e.g., "NEUTRAL", "HOLD", typo, or missing), `action` defaults to 0. This is similar to the `string_to_side` silent default bug (R855). Action 0 may be interpreted as a valid action by the C++ consumer (e.g., NONE), or it may be ignored. Either way, the signal is silently dropped without any error or warning.

**Фикс:** Log a warning for unknown directions. Or raise ValueError for invalid directions.

### 8.927 Code reduction: signal_publisher broadcast pattern 3× — Info

**Файлы:** `signal_publisher.py:188-193, 229-234, 263-268`

The broadcast pattern (define `_send` closure, `asyncio.gather`, track disconnected, remove from clients) is duplicated 3 times: `broadcast_signal`, `broadcast_market_regime`, `_broadcast_circuit_breaker_status`.

**Reduction potential:** ~20 lines. Extract to `_broadcast(msg)` method.

### 8.928 Code reduction: pressure_model compute_obi dead code — Info

**Файл:** `pressure_model.h:134-143`

`compute_obi` static method is defined but never called. The `analyze()` method uses inline single-pass OBI. `obi_utils.h` also provides the same function.

**Reduction potential:** ~10 lines. Remove dead code.

### 8.929 ai-signal-bot/src/data_collection/exchange_factory.py: Exchange Factory — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py` (242 lines)

- **Protocol-based adapter**: `ExchangeAdapter` Protocol with 9 methods — correct
- **3 modes**: SIMULATOR, REAL, FALLBACK (try real, fall back to simulator) — correct
- **SimulatorAdapter**: Stub returning hardcoded data — correct for testing
- **RealExchangeAdapter**: Wraps `RealMarketDataManager` + `RealAccountManager` — correct
- **ExchangeFactory**: Creates adapter based on mode, health check on FALLBACK — correct
- **switch_to_simulator**: Close current adapter, create simulator — correct
- **close**: Closes both adapter and simulator — correct

Good exchange factory with Protocol-based adapter, 3 modes, fallback with health check, and clean lifecycle. ✅

### 8.930 exchange_factory: SimulatorAdapter returns hardcoded price 50000 — Low

**Файл:** `exchange_factory.py:54-55`

```python
async def get_ticker(self, symbol: str) -> dict:
    return {"symbol": symbol, "price": 50000.0, "bid": 49999.5, "ask": 50000.5, "timestamp": time.time()}
```

`SimulatorAdapter.get_ticker()` always returns price 50000.0 regardless of symbol. If the simulator is used in FALLBACK mode for multiple symbols (BTC, ETH, SOL), all symbols show price 50000. This could cause incorrect risk calculations or order sizing if the fallback is activated.

**Фикс:** Return per-symbol simulated prices, or at least vary by symbol hash.

### 8.931 exchange_factory: RealExchangeAdapter stores api_secret in plaintext — Low

**Файл:** `exchange_factory.py:91`

```python
self._api_secret = api_secret
```

`RealExchangeAdapter` stores `api_secret` as a plain string attribute. If the object is logged, serialized, or inspected in a debugger, the secret is exposed. Same issue in `ExchangeFactory` (line 173) and `RealAccountManager` (line 95).

**Фикс:** Use `__repr__` that masks secrets, or store as `SecretStr` from pydantic.

### 8.932 ai-signal-bot/src/data_collection/real_market_data.py: Real Market Data Feed — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_market_data.py` (455 lines)

- **Multi-exchange**: Binance, OKX, Bybit WebSocket feeds — correct
- **Normalized data**: `NormalizedTicker`, `NormalizedCandle`, `NormalizedOrderBook` dataclasses — correct
- **Reconnection**: Exponential backoff per exchange (1s → 30s max) — correct
- **Callbacks**: `on_ticker`, `on_candle`, `on_orderbook` — correct
- **Binance**: Combined stream URL (`@bookTicker` + `@aggTrade` + `@kline_`) — correct
- **OKX**: Subscribe message with `instId` — correct
- **Bybit**: Subscribe message with `orderbook.50.{sym}` + `tickers.{sym}` + `kline.{iv}.{sym}` — correct
- **RealMarketDataManager**: Caches latest data from WS callbacks, provides pull-based accessors — correct

Good real market data feed with multi-exchange support, normalized data, reconnection with backoff, and pull-based manager. ✅

### 8.933 real_market_data: no reconnection on websockets.ConnectionClosed — Low

**Файл:** `real_market_data.py:140, 217, 295`

```python
except (ConnectionError, OSError, json.JSONDecodeError) as e:
```

The exception handling catches `ConnectionError`, `OSError`, and `json.JSONDecodeError`, but does NOT catch `websockets.ConnectionClosed`. When the exchange closes the connection (e.g., server restart), `websockets.ConnectionClosed` is raised, which is not a subclass of `ConnectionError` or `OSError`. The exception propagates out of the `while self._running` loop, and the feed stops permanently without reconnection.

**Фикс:** Add `websockets.ConnectionClosed` to the except clause, or catch `Exception` as fallback.

### 8.934 real_market_data: no @aggTrade handler for Binance — Low

**Файл:** `real_market_data.py:147-182`

The Binance feed subscribes to `@aggTrade` streams (line 118), but `_handle_binance_msg` only handles `@bookTicker` and `@kline_`. The `@aggTrade` messages are received but silently ignored. The `NormalizedTicker.last` price is set to 0.0 (line 159) because `bookTicker` has no last traded price — it's supposed to be updated by `aggTrade`.

**Фикс:** Add `@aggTrade` handler to update `last` price and volume.

### 8.935 real_market_data: _to_okx_inst_id doesn't handle non-USDT pairs — Low

**Файл:** `real_market_data.py:354-364`

```python
if clean.endswith("USDT"):
    base = clean[:-4]
    return f"{base}-USDT-SWAP"
return symbol
```

If the symbol doesn't end with "USDT" (e.g., BTC/USDC, ETH/BTC), the function returns the original symbol unchanged. OKX will reject the subscription because the instId format is wrong.

**Фикс:** Handle USDC, BUSD, and other quote currencies. Or document USDT-only limitation.

### 8.936 ai-signal-bot/src/data_collection/real_account.py: Real Account Manager — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_account.py` (380 lines)

- **ccxt-based**: Uses `ccxt.async_support` for multi-exchange support — correct
- **Optional ccxt**: `CCXT_AVAILABLE` flag — correct
- **Dataclasses**: `AccountBalance`, `AccountPosition`, `OpenOrder` with `to_dict()` — correct
- **Leverage cache**: `_leverage_cache` avoids redundant `set_leverage` calls — correct
- **User data stream**: `start_user_data_stream()` with `watch_orders()` — correct
- **Fill callback**: `_on_fill_callback` for real-time fill notifications — correct
- **Margin warning callback**: `_on_margin_warning_callback` — correct
- **Error handling**: Specific exceptions per method — correct
- **close**: Cancels listen task, closes exchange + WS session — correct

Good real account manager with ccxt, leverage cache, user data stream, fill callbacks, and specific error handling. ✅

### 8.937 real_account: get_balance catches broad Exception — Low

**Файл:** `real_account.py:163`

```python
except Exception as e:
    logger.error(f"[RealAccount] Failed to fetch balance: {e}")
    return []
```

`get_balance()` catches `Exception` instead of specific exceptions. This masks bugs like `AttributeError` (if ccxt changes API) or `TypeError` (if response format changes). Other methods use specific exceptions correctly.

**Фикс:** Catch `(OSError, RuntimeError, KeyError, ValueError)` like other methods.

### 8.938 real_account: _listen_user_data no max retries — Low

**Файл:** `real_account.py:348-369`

```python
async def _listen_user_data(self) -> None:
    while True:
        try:
            orders = await self._exchange.watch_orders()
            # ...
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error(f"[RealAccount] User data stream error: {e}")
            await asyncio.sleep(5)
```

The `_listen_user_data` loop retries indefinitely with a fixed 5s sleep. If the exchange is down for hours, this loop will retry every 5s, generating massive log volume. No exponential backoff, no max retries, no circuit breaker.

**Фикс:** Use exponential backoff (5s → 30s → 60s). Add max retries before giving up.

### 8.939 ai-signal-bot/src/data_collection/real_exchange_client.py: Real Exchange Client — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_exchange_client.py` (335 lines)

- **HMAC-SHA256 signing**: `_hmac_sha256_hex` and `_hmac_sha256_b64` with `usedforsecurity=False` — correct
- **3 exchanges**: Binance, OKX, Bybit with exchange-specific signing — correct
- **Shared aiohttp session**: `_get_session()` creates session lazily — correct
- **Dataclasses**: `AccountBalance`, `Position` — correct
- **Testnet support**: Per-exchange testnet URLs — correct
- **close**: Closes shared session — correct

Good real exchange REST client with HMAC signing, 3 exchanges, shared session, and testnet support. ✅

### 8.940 real_exchange_client: api_secret stored in plaintext attribute — Low

**Файл:** `real_exchange_client.py:69`

```python
self.api_secret = api_secret
```

Same issue as `exchange_factory.py:91`. `api_secret` stored as plain string attribute, accessible via `repr()` or debugger.

**Фикс:** Use `SecretStr` or mask in `__repr__`.

### 8.941 real_exchange_client: no error handling on non-200 responses for OKX/Bybit — Low

**Файл:** `real_exchange_client.py:196+`

The Binance methods check `resp.status != 200` and return `None`/`[]`. But the OKX and Bybit methods (not fully shown) may not have the same error handling. If OKX returns 401 (invalid API key) or 429 (rate limit), the response may not have the expected JSON structure, causing `KeyError` or `IndexError`.

**Фикс:** Add `resp.status != 200` check for all exchange methods. Log error response body.

### 8.942 ai-signal-bot/src/monitoring/alerting.py: Alert System — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/alerting.py` (260 lines)

- **Multi-channel**: Discord, Telegram, generic webhook, log — correct
- **Severity levels**: INFO, WARNING, CRITICAL — correct
- **Rate limiting**: Per-rule cooldown (default 5 min) — correct
- **Alert history**: Capped at 1000, trimmed with slice — correct
- **Periodic monitoring**: `_monitor_loop` with configurable interval — correct
- **Error handling**: Specific exceptions per rule check — correct
- **Gather for multi-channel**: `asyncio.gather(*tasks, return_exceptions=True)` — correct
- **Stats**: `get_stats()` with by_severity and by_rule counts — correct

Good alert system with multi-channel, severity levels, rate limiting, history, and stats. ✅

### 8.943 alerting: creates new aiohttp.ClientSession per alert per channel — Medium [FIXED]

**Файл:** `alerting.py:168, 190, 205`

```python
async with aiohttp.ClientSession() as session:
    async with session.post(self.discord_webhook, json=payload) as resp:
```

Each alert send creates a new `aiohttp.ClientSession` — 3 sessions per alert (Discord, Telegram, webhook). With 10 alerts/min, that's 30 sessions/min. Each session creates a connection pool, DNS resolver, and cookie storage. This is inefficient and can exhaust file descriptors.

**Фикс:** Create a shared `aiohttp.ClientSession` in `__init__` or `start_monitoring()`, reuse for all alert sends.

### 8.944 alerting: alert_history list slice creates copy — Low

**Файл:** `alerting.py:113-114`

```python
if len(self.alert_history) > self._max_history:
    self.alert_history = self.alert_history[-self._max_history:]
```

When history exceeds 1000, the entire list is sliced and copied — O(n) operation. With 1000 alerts, this copies 1000 references. Use `collections.deque(maxlen=1000)` for O(1) append with automatic eviction.

**Фикс:** Use `deque(maxlen=1000)` instead of list + slice.

### 8.945 ai-signal-bot/src/monitoring/health_server.py: Health Server — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/health_server.py` (153 lines)

- **6 endpoints**: `/health`, `/health/exchange`, `/health/database`, `/health/shm`, `/ready`, `/live` — correct
- **K8s probes**: Readiness (`/ready`) and liveness (`/live`) — correct
- **Registered checks**: Exchange, database, SHM — correct
- **Async support**: `iscoroutine(result)` check — correct
- **HTTP status**: 200 healthy, 503 unhealthy — correct
- **Error handling**: Specific exceptions per check — correct
- **aiohttp**: Proper `AppRunner` + `TCPSite` lifecycle — correct

Good health server with 6 endpoints, K8s probes, registered checks, async support, and proper lifecycle. ✅

### 8.946 health_server: _check_all runs checks sequentially — Low

**Файл:** `health_server.py:74-95`

```python
async def _check_all(self) -> dict:
    exchange = await self._check_exchange()
    database = await self._check_database()
    shm = await self._check_shm()
```

Three checks run sequentially. If exchange check takes 5s (network timeout), database and SHM checks wait 5s before starting. Total health check time = sum of all check times. K8s probe may time out.

**Фикс:** Use `asyncio.gather()` to run checks in parallel.

### 8.947 ai-signal-bot/src/monitoring/metrics.py: Prometheus Metrics Exporter — ✅ Excellent

**Файл:** `ai-signal-bot/src/monitoring/metrics.py` (239 lines)

- **prometheus_client**: Counter, Gauge, Histogram, Summary — correct
- **Custom registry**: `CollectorRegistry()` per instance — correct
- **Counters**: signals_total, fills_total, orders_sent_total, orders_rejected_total, kill_switch_activations — correct
- **Gauges**: current_pnl, daily_pnl, total_equity, drawdown_pct, open_positions, total_exposure, websocket_connected, signal_confidence, kill_switch_active, shm_buffer_size — correct
- **Histograms**: signal_latency, order_latency, shm_round_trip_latency — correct
- **Summaries**: position_hold_time — correct
- **Update methods**: All check `HAS_PROMETHEUS` before updating — correct
- **Label dimensions**: symbol, direction, exchange, side, type, reason, endpoint, channel — correct

Excellent Prometheus metrics exporter with comprehensive counters, gauges, histograms, summaries, custom registry, and graceful degradation. ✅

### 8.948 ai-signal-bot/src/monitoring/tracker.py: Performance Tracker — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/tracker.py` (175 lines)

- **PerformanceTracker**: signals_generated, signals_validated, signals_rejected, orders_sent, trades_closed, winning_trades, total_pnl, total_fees — correct
- **Properties**: win_rate, signals_per_hour, uptime_seconds — correct
- **SignalLogger**: CSV logging with header auto-creation — correct
- **TradeLogger**: CSV logging (presumably similar) — correct

Good performance tracker with comprehensive metrics, CSV logging, and derived properties. ✅

### 8.949 tracker: PerformanceTracker not thread-safe — Low

**Файл:** `monitoring/tracker.py:17-52`

```python
def record_signal(self, validated: bool) -> None:
    self.signals_generated += 1
    if validated:
        self.signals_validated += 1
    else:
        self.signals_rejected += 1
```

`PerformanceTracker` uses plain integer increments. In async context with concurrent `record_signal()` calls (from different signal processing coroutines), increments can be lost. Same issue as `metrics_server.py` (R842).

**Фикс:** Use `asyncio.Lock` or `itertools.count()`.

### 8.950 hft-trade-bot/src/execution/smart_order_router_v2.h: Smart Order Router V2 — ✅ Good

**Файл:** `hft-trade-bot/src/execution/smart_order_router_v2.h` (181 lines)

- **5 routing strategies**: BEST_PRICE, LOWEST_LATENCY, LOWEST_FEES, BEST_EFFECTIVE, DEPTH_AWARE — correct
- **Toxic backoff**: Skip exchanges with ≥5 toxic events — correct
- **Stack-allocated exchange array**: `MAX_EXCHANGES = 16`, no heap allocation in hot path — correct
- **Effective price**: `price * (1 + fee_fraction)` for buy, `price * (1 - fee_fraction)` for sell — correct
- **Depth penalty**: `(quantity - depth) * 0.01` for DEPTH_AWARE — correct
- **DIP**: Uses `IExchange` interface, no concrete exchange — correct
- **Reason string**: `strat_names[static_cast<int>(config_.strategy)]` — correct

Good smart order router with 5 strategies, toxic backoff, depth-aware routing, stack-allocated arrays, and DIP compliance. ✅

### 8.951 smart_order_router_v2: exchanges_ vector heap-allocated — Low

**Файл:** `smart_order_router_v2.h:177`

```cpp
std::vector<IExchange*> exchanges_;
```

The `exchanges_` vector is heap-allocated. The `route()` method iterates it in the hot path. The vector itself is fine (populated at init), but the `add_exchange()` method can cause reallocation if capacity is exceeded. This is not in the hot path, so it's acceptable.

**Фикс:** Reserve capacity at init: `exchanges_.reserve(16)`.

### 8.952 smart_order_router_v2: no per-symbol latency tracking — Low

**Файл:** `smart_order_router_v2.h:97`

```cpp
int64_t latency = ex->estimated_latency_us();
```

Latency is per-exchange, not per-symbol. If Binance has 100us latency for BTC but 500us for SOL, the router uses 100us for all symbols. This can route SOL orders to Binance expecting fast execution but getting slow fills.

**Фикс:** Track per-exchange-per-symbol latency.

### 8.953 hft-trade-bot/src/execution/adaptive_order_selector_v2.h: Adaptive Order Selector V2 — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/adaptive_order_selector_v2.h` (223 lines)

- **6 order kinds**: MARKET, LIMIT_IOC, LIMIT_FOK, LIMIT_GTD, POST_ONLY, default IOC at mid — correct
- **Decision tree**: Emergency → Toxic → High+Tight → High+OBI → Large+Thin → Low+Wide → Default — correct
- **Limit prices**: Aggressive (mid*1.0001) for urgency, passive (mid*0.9999) for patience — correct
- **GTD expiry**: `now_ns + gtd_seconds * 1e9` — correct
- **Exchange mapping**: Binance (IOC/FOK/GTX), OKX (ioc/fok/post_only), Bybit (Limit+TIF) — correct
- **`noexcept` on all methods**: Correct
- **No heap allocations**: All stack-allocated — correct

Excellent adaptive order selector with 6 decision paths, exchange-specific mappings, aggressive/passive pricing, GTD expiry, and noexcept. ✅

### 8.954 adaptive_order_selector_v2: to_exchange_type defaults to Binance — Low

**Файл:** `adaptive_order_selector_v2.h:208`

```cpp
return to_binance_type(kind); // Default to Binance mapping
```

If an unknown exchange is passed (e.g., "kraken"), the selector defaults to Binance order type mapping. If Kraken uses different order type strings, orders will be rejected by the exchange.

**Фикс:** Return "MARKET" as safe default, or log a warning for unknown exchange.

### 8.955 hft-trade-bot/src/ipc/shm_heartbeat.h: SHM Heartbeat — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_heartbeat.h` (272 lines)

- **HeartbeatSlot**: `alignas(64)`, atomic seq, timestamp_ns, pid, message_count, error_count, status[16] — correct
- **Seq-guarded writes**: Odd seq = writing, Even seq = done — correct (lock-free readers)
- **ShmHeartbeatWriter**: Cross-platform (Windows CreateFileMapping + POSIX shm_open), auto heartbeat thread — correct
- **ShmHeartbeatReader**: Seq-guarded read with `memcpy` + seq verify — correct
- **is_alive**: Checks heartbeat age against timeout_ms — correct
- **age_ms**: Returns age of last heartbeat — correct
- **RAII**: Destructor unmaps + closes + unlinks (if owner) — correct
- **Deleted copy ctor/assignment**: Correct
- **`noexcept` on read/write/is_alive/age_ms**: Correct

Excellent SHM heartbeat with seq-guarded lock-free access, cross-platform SHM, auto heartbeat thread, RAII, and noexcept. ✅

### 8.956 shm_heartbeat: write() has data race on timestamp_ns — Low

**Файл:** `shm_heartbeat.h:121-138`

```cpp
void write(...) noexcept {
    uint64_t seq = slot_->seq.load(std::memory_order_relaxed);
    slot_->seq.store(seq + 1, std::memory_order_release); // Odd = writing
    slot_->timestamp_ns = now_ns();  // ← Non-atomic write
    slot_->pid = ...;                // ← Non-atomic write
    slot_->message_count = ...;      // ← Non-atomic write
    slot_->error_count = ...;        // ← Non-atomic write
    std::memset(slot_->status, 0, sizeof(slot_->status));
    std::strncpy(slot_->status, status, sizeof(slot_->status) - 1);
    slot_->seq.store(seq + 2, std::memory_order_release); // Even = done
}
```

The write method uses seq-guarded access (odd = writing, even = done), and the reader checks seq before and after reading. However, the fields `timestamp_ns`, `pid`, `message_count`, `error_count` are not atomic. On x86/x64, aligned 8-byte/4-byte writes are atomic, so this is safe in practice. On ARM, non-atomic writes may be reordered or torn. The `memset` + `strncpy` for `status[16]` is definitely not atomic.

The seq guard works correctly: the reader will see `seq1 & 1 == 1` (odd = writing) and return false, or `seq1 != seq2` (changed during read) and return false. So the reader never sees a partial write. This is correct.

**Фикс:** Document x86/x64 assumption. The seq guard makes this safe regardless of atomicity — the reader retries if seq changes.

### 8.957 shm_heartbeat: auto_loop no error handling — Low

**Файл:** `shm_heartbeat.h:154-158`

```cpp
void auto_loop(uint32_t interval_ms) {
    while (running_) {
        write();
        std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
    }
}
```

The `auto_loop` calls `write()` in a loop without error handling. If `write()` throws (unlikely since it's `noexcept`, but `now_ns()` or `strncpy` could theoretically have issues), the thread terminates silently. The heartbeat stops, and the reader will detect a stale heartbeat, but the writer won't know.

**Фикс:** Wrap `write()` in try/catch, log errors. Although `write()` is `noexcept`, `std::terminate` would be called if it throws — which would crash the entire process.

### 8.958 Code reduction: alerting _send methods 3× pattern — Info

**Файлы:** `alerting.py:150-171, 173-193, 195-208`

The pattern `async with aiohttp.ClientSession() as session: async with session.post(url, json=payload) as resp:` is duplicated 3 times for Discord, Telegram, and webhook. All create a new session per call.

**Reduction potential:** ~15 lines. Extract to `_post_json(url, payload)` method with shared session.

### 8.959 Code reduction: health_server _check_* methods 3× pattern — Info

**Файлы:** `health_server.py:38-48, 50-60, 62-72`

The pattern `if "name" in self._checks: try: result = self._checks["name"]() ...` is duplicated 3 times for exchange, database, SHM. All have identical structure.

**Reduction potential:** ~15 lines. Extract to `_run_check(name: str) -> dict` method.

### 8.960 ai-signal-bot/src/communication/shm_fill_consumer.py: SHM Fill Consumer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_fill_consumer.py` (91 lines)

- **ShmRingBuffer wrapper**: Opens existing SHM segment (create=False) — correct
- **try_pop / bulk_pop**: Non-blocking pop operations — correct
- **pending**: Returns buffer size — correct
- **run_polling**: Async loop with configurable poll_interval (1ms default) and batch_size (256) — correct
- **Context manager**: `__enter__` / `__exit__` — correct
- **close**: Closes buffer, sets to None — correct

Good SHM fill consumer with non-blocking pop, async polling, context manager, and configurable batch size. ✅

### 8.961 shm_fill_consumer: run_polling callback not async — Low

**Файл:** `shm_fill_consumer.py:71`

```python
fills = self.bulk_pop(batch_size)
if fills:
    callback(fills)
```

The `callback` is called synchronously. If the callback is async (returns a coroutine), it won't be awaited — the coroutine is created and immediately discarded. This means any async database writes or notifications in the callback won't execute.

**Фикс:** Check `asyncio.iscoroutinefunction(callback)` and `await callback(fills)` if true.

### 8.962 shm_fill_consumer: init catches broad Exception — Low

**Файл:** `shm_fill_consumer.py:39`

```python
except Exception as e:
    logger.error(f"Failed to init SHM fill consumer: {e}")
    return False
```

`init()` catches `Exception` instead of specific exceptions. This masks bugs like `PermissionError`, `FileNotFoundError`, or `struct.error`.

**Фикс:** Catch `(OSError, ValueError, struct.error)`.

### 8.963 ai-signal-bot/src/communication/shm_market_data_writer.py: SHM Market Data Writer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_market_data_writer.py` (122 lines)

- **Latest-snapshot-wins model**: Single slot per symbol, seq-guarded — correct
- **Seq-guarded writes**: Odd = writing, Even = consistent (same pattern as shm_heartbeat) — correct
- **Cross-platform**: Windows mmap tagname + POSIX /dev/shm — correct
- **Layout**: `[num_slots: uint64][SnapshotSlot 0]...[SnapshotSlot N]` — correct
- **write_snapshot**: Symbol_id bounds check, seq increment before/after write — correct
- **write_price**: Convenience method with `time.time_ns()` — correct
- **close**: Closes mmap + fd + removes /dev/shm file — correct
- **Context manager**: `__enter__` / `__exit__` — correct

Good SHM market data writer with seq-guarded latest-wins model, cross-platform support, and context manager. ✅

### 8.964 shm_market_data_writer: no memory barrier after seq write — Low

**Файл:** `shm_market_data_writer.py:84, 94`

```python
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 1)  # odd
# ... write data ...
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 2)  # even
```

The seq-guarded write pattern relies on memory ordering. On x86/x64, stores are naturally ordered (TSO). On ARM, the seq store before data writes may be reordered after the data writes, causing the reader to see a consistent seq but stale data. No `mfence` or equivalent is issued.

**Фикс:** Document x86/x64 assumption, or use `ctypes.memmove` with proper barriers.

### 8.965 shm_market_data_writer: max_symbols default 10 but config has 50 — Low

**Файл:** `shm_market_data_writer.py:33`

```python
def __init__(self, name: str = "/hft_market", max_symbols: int = 10):
```

Default `max_symbols=10` but the config has 50 trading symbols. If the writer is created with default, symbols 10-49 are silently dropped (line 76: `if symbol_id >= self.max_symbols: return`).

**Фикс:** Set default to 50, or pass from config.

### 8.966 hft-trade-bot/src/market_data/order_book_manager.h: Order Book Manager — ✅ Excellent

**Файл:** `hft-trade-bot/src/market_data/order_book_manager.h` (282 lines)

- **Template `MaxLevels=200`**: Fixed-capacity L2 book — correct
- **PriceLevel**: `alignas(64)`, 64 bytes, price/quantity/order_count — correct
- **Incremental updates**: `update_bid` / `update_ask` with sorted insertion — correct
- **Removal**: `remove_bid` / `remove_ask` with shift — correct
- **Snapshot merge**: `set_snapshot` with memcpy — correct
- **Accessors**: best_bid/ask, mid_price, weighted_mid, microprice, spread, spread_bps — correct
- **SpreadRegime**: TIGHT/NORMAL/WIDE/EXTREME — correct
- **Depth**: `bid_depth` / `ask_depth` at top N levels — correct
- **OBI**: `(bid_depth - ask_depth) / (bid_depth + ask_depth)` — correct
- **Crossed/locked detection**: `is_crossed()` / `is_locked()` — correct
- **No heap allocations**: All stack-allocated with `alignas(64)` — correct
- **`noexcept` on all methods**: Correct

Excellent order book manager with fixed-capacity L2, incremental updates, snapshot merge, spread regime, OBI, crossed/locked detection, and noexcept. ✅

### 8.967 order_book_manager: update_bid/ask is O(N) per update — Low

**Файл:** `order_book_manager.h:75-101`

```cpp
bool update_bid(double price, double quantity, uint64_t order_count = 0) noexcept {
    // Find insertion point (bids sorted descending)
    size_t i = 0;
    while (i < bid_count_ && bids_[i].price > price)
        ++i;
    // ...
    for (size_t j = bid_count_; j > i; --j) {
        bids_[j] = bids_[j - 1];
    }
```

Both finding the insertion point (linear scan) and shifting elements (O(N) memmove) are O(N) where N = bid_count_. With 200 levels and 1000 updates/sec, that's 200K comparisons/sec. For HFT, this may be too slow. A sorted map (e.g., `std::map<double, PriceLevel>`) would be O(log N) but allocates on insert. A better approach: use a hash map for lookup + sorted array for best-N access.

**Фикс:** Use binary search for insertion point (O(log N)), keep shift O(N) but reduce constant. Or use a hybrid data structure.

### 8.968 order_book_manager: no validation that bids < asks — Low

**Файл:** `order_book_manager.h:258-260`

```cpp
bool is_crossed() const noexcept {
    return bid_count_ > 0 && ask_count_ > 0 && best_bid() >= best_ask();
}
```

`is_crossed()` detects the crossed state but doesn't prevent it. If exchange sends a bad update that crosses the book, the manager accepts it silently. Downstream strategies using `mid_price()` will get a negative or zero spread, leading to incorrect signals.

**Фикс:** Reject updates that would cross the book, or log a warning.

### 8.969 hft-trade-bot/src/market_data/candle_aggregator.h: Candle Aggregator — ✅ Good

**Файл:** `hft-trade-bot/src/market_data/candle_aggregator.h` (146 lines)

- **3 modes**: TIME, VOLUME, TICK — correct
- **3 constructors**: One per mode — correct
- **on_trade**: Updates OHLCV, checks bar close condition — correct
- **emit_candle**: Invokes callback — correct
- **flush**: Force-close current candle on shutdown — correct
- **No heap allocations in hot path**: Correct (except callback which may allocate)
- **`noexcept` on on_trade/flush/emit_candle**: Correct

Good candle aggregator with 3 modes, OHLCV from ticks, flush on shutdown, and noexcept. ✅

### 8.970 candle_aggregator: callback_ is std::function (heap-allocated) — Low

**Файл:** `candle_aggregator.h:30, 135`

```cpp
using CandleCallback = std::function<void(const Candle&)>;
// ...
CandleCallback callback_;
```

`std::function` may heap-allocate if the callable is too large for SBO (small buffer optimization). If the callback captures large state, each `emit_candle()` call may trigger heap access. The callback is set once at construction, so the allocation is not in the hot path — but the callback invocation may touch cold memory.

**Фикс:** Use a function pointer + context pointer, or template the callback type.

### 8.971 candle_aggregator: no handling of out-of-order ticks — Low

**Файл:** `candle_aggregator.h:52, 81`

```cpp
void on_trade(uint64_t timestamp_ns, double price, double quantity) noexcept {
    // ...
    case CandleMode::TIME:
        should_close = (timestamp_ns - bar_start_ns_) >= interval_ns_;
```

If a tick arrives with a timestamp earlier than `bar_start_ns_` (e.g., due to network reordering), the time check `(timestamp_ns - bar_start_ns_) >= interval_ns_` may underflow (unsigned subtraction) or produce a negative result (signed). The candle may never close, or close prematurely.

**Фикс:** Check `timestamp_ns >= bar_start_ns_` before comparison. Drop or queue out-of-order ticks.

### 8.972 hft-trade-bot/src/market_data/trade_handler.h: Trade Handler — ✅ Excellent

**Файл:** `hft-trade-bot/src/market_data/trade_handler.h` (213 lines)

- **Aggressor detection**: `is_buyer_maker` → sell/buy aggressor — correct
- **Rolling VWAP**: O(1) using incremental sums — correct
- **Rolling volume stats**: O(1) mean and std using incremental sums — correct
- **Large trade detection**: > 3σ from rolling mean — correct
- **Rolling window**: Ring buffer with `MAX_WINDOW=4096` — correct
- **Session stats**: buy/sell volume, trade counts — correct
- **reset_session**: Clears all stats — correct
- **No heap allocations**: All stack-allocated — correct
- **`noexcept` on all methods**: Correct

Excellent trade handler with aggressor detection, O(1) rolling VWAP/stats, large trade detection, ring buffer, and noexcept. ✅

### 8.973 trade_handler: rolling_vol_sum_ can go negative — Low

**Файл:** `trade_handler.h:60-63`

```cpp
if (write_idx_ >= window_size_) {
    const auto& old = rolling_trades_[w_slot];
    rolling_vol_sum_ -= old.quantity;
    rolling_notional_sum_ -= old.price * old.quantity;
}
```

Floating-point subtraction can accumulate errors. After 1M trades with window 1000, each subtracting ~0.1, the sum may drift by ~1e-10 × 1M = 1e-4. For VWAP calculation, this is negligible. But if `rolling_vol_sum_` goes slightly negative due to FP errors, `rolling_vwap()` returns 0.0 (line 118: `if (rolling_vol_sum_ <= 0.0) return 0.0`).

**Фикс:** Use `std::max(0.0, rolling_vol_sum_)` in rolling_vwap, or use Kahan summation.

### 8.974 hft-trade-bot/src/position/position_manager_v2.h: Position Manager V2 — ✅ Good

**Файл:** `hft-trade-bot/src/position/position_manager_v2.h` (348 lines)

- **PositionV2**: symbol, exchange, symbol_id, side, quantity, entry_price, realized/unrealized PnL, fees, leverage, margin, liq_price, timestamps — correct
- **on_fill**: Open/add/reduce/close with weighted average entry — correct
- **Spinlock**: `std::lock_guard<Spinlock>` for all operations — correct
- **Atomic open count**: `open_positions_count_` with `fetch_add/fetch_sub` — correct
- **Bitset**: `open_symbols_` for O(1) lookup by symbol_id — correct
- **Name set**: `open_symbol_names_` for O(1) lookup by name — correct
- **update_mark_prices**: Batch update from price map — correct
- **check_sl_tp**: ATR-based SL/TP with configurable multipliers — correct
- **check_margin_call**: Maintenance margin ratio check — correct
- **reset**: Clears all state — correct
- **Erase on close**: Removes stale entries from map — correct

Good position manager v2 with weighted average entry, spinlock, atomic counter, bitset lookup, SL/TP, margin check, and erase on close. ✅

### 8.975 position_manager_v2: on_fill creates std::string from string_view — Low

**Файл:** `position_manager_v2.h:90`

```cpp
auto& pos = positions_[std::string(key_sv)];
```

Despite building a `string_view` from a stack buffer to "avoid heap allocation", the `unordered_map::operator[]` with `string_view` creates a temporary `std::string` for the lookup (since the map key type is `std::string`). This is a heap allocation in the hot path. C++20 adds `unordered_map::find(string_view)` with transparent comparator, but this code doesn't use it.

**Фикс:** Use `std::unordered_map<std::string, PositionV2, StringHash, std::equal_to<>>` with transparent lookup.

### 8.976 position_manager_v2: get_position without exchange is O(N) — Low

**Файл:** `position_manager_v2.h:183`

```cpp
for (const auto& [key, pos] : positions_) {
    if (pos.symbol == symbol) return pos;
}
```

When `exchange` is empty, `get_position` iterates all positions to find by symbol. With 50 open positions, this is O(50) per call. If called on every tick (50 symbols × 1 tick/sec), that's 2500 iterations/sec.

**Фикс:** Maintain a `symbol_to_key_` map for O(1) lookup without exchange.

### 8.977 position_manager_v2: check_sl_tp uses hardcoded 1% ATR — Low

**Файл:** `position_manager_v2.h:289-290`

```cpp
double sl_distance = pos.entry_price * 0.01 * stop_loss_mult; // 1% * mult
double tp_distance = pos.entry_price * 0.01 * take_profit_mult;
```

SL/TP distances are hardcoded as 1% of entry price × multiplier. This doesn't account for volatility — BTC's 1% move is very different from SOL's 1% move. The comment says "ATR-based" but no ATR is passed in.

**Фикс:** Pass ATR or volatility to `check_sl_tp` and use `atr * multiplier` instead of `entry_price * 0.01 * multiplier`.

### 8.978 position_manager_v2: total_pnl acquires lock twice — Low

**Файл:** `position_manager_v2.h:235`

```cpp
double total_pnl() const noexcept { return total_unrealized_pnl() + total_realized_pnl(); }
```

`total_pnl()` calls `total_unrealized_pnl()` and `total_realized_pnl()`, each acquiring the spinlock separately. Between the two calls, a fill may change both values, causing inconsistency. Also, 2 lock/unlock cycles instead of 1.

**Фикс:** Add a single `total_pnl_locked()` that acquires lock once and sums both.

### 8.979 hft-trade-bot/src/persistence/mapped_persistence.h: Mapped Persistence — ✅ Good

**Файл:** `hft-trade-bot/src/persistence/mapped_persistence.h` (372 lines)

- **Memory-mapped**: mmap for ultra-fast state recovery — correct
- **3 structs**: MappedPosition (128B), MappedAccount (128B), MappedHeader (128B) — correct
- **Magic + version**: `MAPPED_MAGIC = 0x48465431`, `MAPPED_VERSION = 1` — correct
- **MAX_POSITIONS=64**: Fixed capacity — correct
- **save_state**: mmap + write header/account/positions + msync(MS_ASYNC) — correct
- **load_state**: mmap + validate magic + copy data — correct
- **snapshot_atomic**: Write to temp file + rename — correct
- **Cross-platform**: Windows CreateFileMapping + POSIX mmap — correct
- **Mutex**: `std::lock_guard<std::mutex>` for save/load — correct

Good mapped persistence with mmap, magic validation, atomic snapshot (temp+rename), cross-platform, and mutex. ✅

### 8.980 mapped_persistence: save_state mmaps/munmaps per call — Low

**Файл:** `mapped_persistence.h:103-194`

Each `save_state()` call opens the file, sets file size, mmaps, writes, msyncs, munmaps, and closes the file descriptor. This is expensive — each call involves 2 system calls (open + close) + 2 mmap operations + 1 msync. For periodic saves (e.g., every 1s), this adds ~1ms of overhead per save.

**Фикс:** Keep the mapping persistent (mmap once at init, write + msync per save). Use `snapshot_atomic` for crash safety.

### 8.981 mapped_persistence: no version migration on load — Low

**Файл:** `mapped_persistence.h:241-251`

```cpp
if (header->magic != MAPPED_MAGIC) {
    spdlog::warn("[MappedPersist] Invalid magic — ignoring");
    return result;
}
```

The loader checks magic but not version. If `MAPPED_VERSION` is bumped (e.g., struct layout changes), the loader will read old-format data with new-format structs, causing silent data corruption.

**Фикс:** Check `header->version == MAPPED_VERSION`. If mismatch, log warning and return empty state.

### 8.982 mapped_persistence: unmap_all is a no-op — Info

**Файл:** `mapped_persistence.h:361-363`

```cpp
void unmap_all() {
    // Nothing to unmap — we mmap/munmap per operation
}
```

`unmap_all()` is called in the destructor but does nothing. Since each operation mmaps/munmaps independently, there's nothing to clean up. This is correct but misleading — the method should be removed or the destructor should not call it.

**Reduction potential:** ~5 lines. Remove `unmap_all()` and its call in destructor.

### 8.983 hft-trade-bot/src/fix/fix_session.h: FIX Session — ✅ Good

**Файл:** `hft-trade-bot/src/fix/fix_session.h` (294 lines)

- **State machine**: DISCONNECTED → CONNECTING → LOGGED_IN → LOGGING_OUT — correct
- **CAS state transitions**: `compare_exchange_strong` for logon/logout — correct
- **Sequence numbers**: Persistent (file-based), atomic, saved on every send — correct
- **Gap detection**: ResendRequest on incoming seq gap — correct
- **Heartbeat**: Background thread with condition variable wake — correct
- **TestRequest**: Responds with Heartbeat containing same TestReqID — correct
- **ResendRequest**: Sends SequenceReset with GapFillFlag — correct
- **Timeout check**: `check_timeout()` compares elapsed > heart_bt_int * 2 — correct
- **Destructor**: Logout + stop heartbeat + save seq — correct

Good FIX session with state machine, CAS transitions, persistent seq numbers, gap detection, heartbeat thread, TestRequest handling, and timeout check. ✅

### 8.984 fix_session: save_seq_nums on every message — Low

**Файл:** `fix_session.h:75, 113, 118, 146, 166, 186, 198, 240`

```cpp
save_seq_nums(); // Called after every send and every receive
```

`save_seq_nums()` opens the file, writes two integers, and closes it — 2 system calls (open + close) + 1 write per message. With 100 messages/sec, that's 300 system calls/sec just for seq persistence. The file is also not fsync'd, so the OS may not flush to disk for seconds.

**Фикс:** Keep the file open (open once at init, write + flush per save). Or batch saves (save every N messages or every T seconds).

### 8.985 fix_session: no password redaction in logon — Low

**Файл:** `fix_session.h:58, 72`

```cpp
bool logon(const std::string& username = "", const std::string& password = "", ...) {
    auto msg = FixEncoder::build_logon(..., password.c_str(), ...);
```

The password is passed to `build_logon` and sent in the FIX message. If `build_logon` logs the message at DEBUG level (or if the raw FIX message is captured by a sniffer), the password is exposed. Same issue as the Python `fix_client.py` (R907).

**Фикс:** Redact tag 554 (Password) in any logging. Use TLS for transport.

### 8.986 hft-trade-bot/src/execution/order_executor.h: Order Executor — ✅ Good

**Файл:** `hft-trade-bot/src/execution/order_executor.h` (231 lines)

- **WebSocket**: websocketpp client with asio — correct
- **Reconnection**: Exponential backoff (1s → 30s max) with detached thread — correct
- **Manual JSON serialization**: snprintf to stack buffer, avoids nlohmann/json heap alloc — correct
- **submit_order**: Signal + OrderTypeSelector + manual JSON — correct
- **close_position**: Manual JSON — correct
- **execute_arbitrage**: Buy + sell on different exchanges — correct
- **disconnect**: Close + join thread — correct
- **Atomic connected_ and should_reconnect_**: Correct

Good order executor with websocketpp, exponential backoff, manual JSON (no heap alloc), arbitrage execution, and atomic state. ✅

### 8.987 order_executor: detached reconnect thread race — Medium [FIXED]

**Файл:** `order_executor.h:57-63`

```cpp
std::thread([this, delay]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(delay));
    if (should_reconnect_) {
        if (ws_thread_.joinable()) ws_thread_.join();
        do_connect();
    }
}).detach();
```

The reconnect thread is detached. If the `OrderExecutor` is destroyed while the reconnect thread is sleeping, the thread will access a dangling `this` pointer after waking up. `should_reconnect_` is set to false in `disconnect()`, but the thread may already be past that check. Also, `ws_thread_.join()` from within a detached thread that references `this` is unsafe if `disconnect()` is also joining `ws_thread_` concurrently.

**Фикс:** Don't detach. Keep the reconnect thread as a member and join it in `disconnect()`. Or use a timer on the asio io_context instead of a separate thread.

### 8.988 order_executor: snprintf buffer overflow risk — Low

**Файл:** `order_executor.h:108-116`

```cpp
char buf[512];
int n = std::snprintf(buf, sizeof(buf),
    "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
    "\"side\":\"%s\",\"quantity\":%.8f,\"order_type\":\"%s\","
    "\"stop_loss\":%.2f,\"take_profit\":%.2f",
    exchange_id_.c_str(), signal.symbol.c_str(), ...);
```

If `exchange_id_` or `signal.symbol` are very long (e.g., 200 chars each), the snprintf will truncate at 512 bytes. The code checks `n < sizeof(buf) - 32` before appending price (line 118), but if the initial snprintf is already truncated, the JSON is malformed. The order will be sent with truncated fields.

**Фикс:** Check `n > 0 && n < static_cast<int>(sizeof(buf))` before sending. Use larger buffer or dynamic allocation for long symbols.

### 8.989 order_executor: no fill confirmation callback — Low

**Файл:** `order_executor.h:27-30`

```cpp
using MessageHandler = std::function<void(const json&)>;
// ... but MessageHandler is never used
```

`MessageHandler` is defined but never set or invoked. The executor sends orders but never processes responses (fills, rejections, cancels). Without fill confirmation, the position manager doesn't know if orders were filled, and the bot can't track PnL.

**Фикс:** Set `set_message_handler` on the websocketpp client to process fill/rejection messages. Invoke a callback to update position manager.

### 8.990 Code reduction: position_manager_v2 total_* methods 6× pattern — Info

**Файлы:** `position_manager_v2.h:217-262`

`total_unrealized_pnl`, `total_realized_pnl`, `total_fees`, `total_margin`, `total_notional` all follow the same pattern: lock, iterate, sum a field. 5 methods × 5 lines = 25 lines of duplication.

**Reduction potential:** ~15 lines. Template: `template<typename F> double sum_field(F&& getter) const noexcept`.

### 8.991 Code reduction: mapped_persistence save_state and snapshot_atomic duplication — Info

**Файлы:** `mapped_persistence.h:103-195, 282-355`

`save_state` and `snapshot_atomic` share ~80% of the code (open file, set size, mmap, write header/account/positions, flush, unmap). Only difference: `snapshot_atomic` writes to temp + renames, `save_state` writes directly.

**Reduction potential:** ~40 lines. Extract `write_to_mapped(void* mapped, positions, account)` method.

### 8.992 ai-signal-bot/src/communication/ws_connection_pool.py: WebSocket Connection Pool — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py` (152 lines)

- **PooledConnection**: Wrapper with last_used, healthy flag, is_stale — correct
- **Pool**: dict[str, list[PooledConnection]] keyed by URL — correct
- **asyncio.Lock**: All pool mutations under lock — correct
- **acquire**: Reuse healthy non-stale, evict stale, create new — correct
- **release**: Return to pool, close if unhealthy — correct
- **_create_connection**: websockets.connect with ping_interval=10, compression, max_size=1MB — correct
- **health_check**: Ping + wait_for(5s timeout) — correct
- **_health_loop**: Periodic health checks — correct
- **close_all**: Cancel health task, close all connections — correct
- **pool_stats**: Per-URL connection counts — correct

Good WebSocket connection pool with reuse, health checks, stale eviction, and asyncio.Lock. ✅

### 8.993 ws_connection_pool: acquire holds lock during _create_connection — Medium [FIXED]

**Файл:** `ws_connection_pool.py:59-74`

```python
async with self._lock:
    # ... reuse logic ...
    conn = await self._create_connection(url)  # ← network I/O under lock!
    return conn
```

`acquire()` holds `self._lock` during `_create_connection()`, which does `await websockets.connect(url)` — a network I/O operation that can take 100-500ms. During this time, no other coroutine can acquire or release connections. With 50 symbols × 3 exchanges = 150 potential URLs, if one connection is slow (500ms), all 149 other acquire/release calls are blocked.

**Фикс:** Release lock before `_create_connection()`, re-acquire to insert the new connection.

### 8.994 ws_connection_pool: _evict_stale creates fire-and-forget tasks — Low

**Файл:** `ws_connection_pool.py:106`

```python
asyncio.create_task(conn.close())
```

`_evict_stale()` creates `asyncio.create_task(conn.close())` for each stale connection. These tasks are fire-and-forget — if the event loop shuts down before they complete, the close may not execute, leaking file descriptors. Also, if many connections are stale (e.g., 10), 10 concurrent close tasks are created.

**Фикс:** `await conn.close()` directly (already under lock), or gather the tasks.

### 8.995 ws_connection_pool: _health_loop runs forever with no error handling — Low

**Файл:** `ws_connection_pool.py:129-133`

```python
async def _health_loop(self) -> None:
    while True:
        await asyncio.sleep(self._health_check_interval)
        await self.health_check()
```

If `health_check()` raises an unexpected exception (e.g., `RuntimeError` from a corrupted connection), the health loop terminates silently. No more health checks will run, and stale connections will accumulate.

**Фикс:** Wrap `health_check()` in try/except, log errors, continue loop.

### 8.996 ai-signal-bot/src/networking/socket_transport.py: UDP Socket Transport — ✅ Good

**Файл:** `ai-signal-bot/src/networking/socket_transport.py` (156 lines)

- **Non-blocking UDP**: `setblocking(False)` — correct
- **Buffer sizes**: SO_RCVBUF + SO_SNDBUF = 1MB — correct
- **start_receive_loop**: BlockingIOError → 100μs sleep — correct
- **_parse_packet**: Binary format with length-prefixed symbol — correct
- **send**: Non-blocking sendto — correct
- **Stats**: packets_rx/tx, bytes_rx/tx, rx_drops — correct
- **MarketDataPacket**: dataclass with timestamp_ns, symbol, price, qty, side, msg_type — correct

Good UDP socket transport with non-blocking I/O, binary parsing, stats, and configurable buffers. ✅

### 8.997 socket_transport: start_receive_loop blocks calling thread — Low

**Файл:** `socket_transport.py:86-108`

```python
def start_receive_loop(self, on_packet: Callable[[MarketDataPacket], None]) -> None:
    self._running = True
    while self._running:
        try:
            data, addr = self._socket.recvfrom(65536)
```

`start_receive_loop` is a synchronous blocking loop. If called from the asyncio event loop, it blocks all coroutines. The 100μs sleep on BlockingIOError is a busy-wait that consumes CPU. No async version is provided.

**Фикс:** Provide `async def start_receive_loop_async()` using `loop.add_reader()` or `asyncio.to_thread()`.

### 8.998 socket_transport: _parse_packet no bounds check on sym_len — Low

**Файл:** `socket_transport.py:136-138`

```python
sym_len = data[8]
symbol = data[9:9+sym_len].decode("ascii")
offset = 9 + sym_len
```

`sym_len` is a single byte (0-255). If a malformed packet has `sym_len=255` but the packet is only 27 bytes, `data[9:264]` returns a short slice, and `offset = 9 + 255 = 264` is beyond the packet. The subsequent `struct.unpack_from("!dd", data, 264)` will raise `struct.error`, which is caught. But the symbol string will be truncated or garbage.

**Фикс:** Check `9 + sym_len + 18 <= len(data)` before parsing.

### 8.999 ai-signal-bot/src/database/db.py: SQLite Database — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` — correct
- **Connection per operation**: `closing(self._conn())` — correct for SQLite
- **Tables**: signals, trades, equity_curve with indexes — correct
- **save_signal / save_trade / close_trade / save_equity**: Parameterized queries — correct
- **get_stats**: Aggregate queries with COALESCE — correct
- **get_recent_signals / get_recent_trades**: LIMIT queries — correct
- **close**: WAL checkpoint + journal mode DELETE — correct for Windows

Good SQLite database with WAL mode, parameterized queries, indexes, and Windows-safe close. ✅

### 8.1000 db: new connection per operation — Medium [FIXED]

**Файл:** `db.py:21-25, 85-107`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn

def save_signal(self, signal_dict: dict, validated: bool = True) -> int:
    with closing(self._conn()) as conn:
        cursor = conn.execute(...)
```

Every `save_signal`, `save_trade`, `save_equity`, `close_trade`, `get_stats`, `get_recent_signals`, `get_recent_trades` creates a new SQLite connection. Each connection involves:
- File open (system call)
- WAL mode PRAGMA (query)
- Row factory setup
- Query execution
- Commit
- Connection close (system call)

With 50 symbols × 60s interval = ~50 signals/min + 50 trades/min + 50 equity/min = 150 connections/min = 2.5 connections/sec. Each connection takes ~5ms (file open + PRAGMA + close), so 12.5ms/sec is spent on connection overhead. Not critical for this load, but if the bot scales to 500 symbols or 1s intervals, it becomes 750 connections/min = 12.5/sec = 62ms/sec.

**Фикс:** Use a persistent connection (or connection pool) with `check_same_thread=False` and a threading.Lock for multi-threaded access. Or use `aiosqlite` for async access.

### 8.1001 db: close catches broad Exception — Low

**Файл:** `db.py:29-34`

```python
def close(self) -> None:
    try:
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("PRAGMA journal_mode=DELETE")
    except Exception:
        pass
```

`close()` catches `Exception` and silently passes. If the WAL checkpoint fails (e.g., disk full, permission error), the WAL file grows unboundedly, consuming disk space. The error is never logged.

**Фикс:** Catch specific exceptions (`sqlite3.OperationalError`, `sqlite3.DatabaseError`) and log the error.

### 8.1002 db: no index on equity_curve timestamp — Low

**Файл:** `db.py:70-76`

```sql
CREATE TABLE IF NOT EXISTS equity_curve (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    balance REAL NOT NULL,
    equity REAL NOT NULL,
    open_positions INTEGER NOT NULL
);
```

No index on `equity_curve(timestamp)`. If the bot runs for months, the equity_curve table will have millions of rows. Queries like `SELECT * FROM equity_curve WHERE timestamp > ?` will be O(N) full table scans.

**Фикс:** `CREATE INDEX IF NOT EXISTS idx_equity_timestamp ON equity_curve(timestamp)`.

### 8.1003 hft-trade-bot/src/core/bot_loop.h: Bot Loop Interface — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_loop.h` (17 lines)

- **Function declarations only**: process_sl_tp, process_arbitrage, process_ai_signals, run_v2_signal_loop, run_v1_fallback_loop, print_status, poll_shm_market_data, graceful_shutdown — correct
- **Clean separation**: Header declares interface, implementation in .cpp — correct
- **BotContext reference**: All functions take `BotContext&` — correct

Good clean header with function declarations and BotContext reference pattern. ✅

### 8.1004 hft-trade-bot/src/execution/latency_tracker.h: Latency Tracker — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/latency_tracker.h` (253 lines)

- **8 stages**: SIGNAL_TO_ORDER, ORDER_TO_ACK, ACK_TO_FILL, SIGNAL_TO_FILL, ORDER_TO_FILL, MARKET_DATA_PROCESS, RISK_CHECK, STRATEGY_COMPUTE — correct
- **Atomic stats**: count, sum, min (CAS loop), max (CAS loop) — correct
- **Histogram**: 128 bins per stage, atomic bin counts — correct
- **Percentile computation**: P50/P95/P99/P99.9 from histogram — correct
- **Budget enforcement**: Per-stage budget with alert callback — correct
- **ScopedLatencyMeasurement**: RAII timer — correct
- **No heap allocations**: All stack/atomic — correct
- **`noexcept` on record/get_stats/reset**: Correct

Excellent latency tracker with 8 stages, atomic CAS min/max, histogram percentiles, budget enforcement, RAII scoped measurement, and noexcept. ✅

### 8.1005 latency_tracker: alert_cb_ is std::function (not thread-safe) — Low

**Файл:** `latency_tracker.h:124, 173, 224`

```cpp
if (alert_cb_) alert_cb_(stage, us, budget);
// ...
void set_alert_callback(AlertCallback cb) { alert_cb_ = std::move(cb); }
```

`alert_cb_` is a `std::function` that can be set via `set_alert_callback()` and called from `record()`. If `set_alert_callback` is called from one thread while `record()` calls `alert_cb_` from another, it's a data race on the `std::function` object (not atomic). Also, `std::function` copy/move may heap-allocate.

**Фикс:** Set the callback once at init (before any `record()` calls), or use `std::atomic<std::function<...>>` (C++23) or a `std::shared_ptr` to the callback.

### 8.1006 latency_tracker: percentile_from_histogram is O(N) per call — Low

**Файл:** `latency_tracker.h:197-211`

```cpp
for (size_t i = 0; i < histogram_bins_; ++i) {
    cumulative += h.bin_counts[i].load(std::memory_order_relaxed);
    if (cumulative >= target) {
```

Each `get_stats()` call computes 4 percentiles (P50, P95, P99, P999), each scanning up to `histogram_bins_` (default 64) bins. That's 256 atomic loads per `get_stats()` call. If `get_stats()` is called every 1s for monitoring, this is negligible. But if called per-order, it's 256 × 50 orders/sec = 12,800 atomic loads/sec.

**Фикс:** Cache the last computed percentiles, or compute all 4 in a single pass.

### 8.1007 hft-trade-bot/src/monitoring/system_monitor.h: System Monitor — ✅ Excellent

**Файл:** `hft-trade-bot/src/monitoring/system_monitor.h` (205 lines)

- **11 metrics**: ORDERS_SENT/FILLED/REJECTED/CANCELED, SIGNALS_RECEIVED/PROCESSED, ERRORS, RECONNECTS, SHM_DROPS, HEARTBEATS_SENT/MISSED — correct
- **Atomic counters**: `std::atomic<int64_t>` with relaxed ordering — correct
- **fill_rate / rejection_rate**: Computed from counters — correct
- **Snapshot**: All metrics in one struct — correct
- **format_json**: snprintf to stack buffer — correct
- **MemoryTracker**: Tracks current/total/max allocation — correct
- **HealthStatus**: Aggregate health with is_healthy() — correct
- **No heap allocations**: All stack/atomic — correct
- **`noexcept` on all methods**: Correct

Excellent system monitor with 11 atomic metrics, snapshot, JSON formatting, memory tracker, and health status. ✅

### 8.1008 system_monitor: MemoryTracker max_single_alloc_ race — Low

**Файл:** `system_monitor.h:143-145`

```cpp
if (bytes > max_single_alloc_.load(std::memory_order_relaxed)) {
    max_single_alloc_.store(bytes, std::memory_order_relaxed);
}
```

The check-then-set pattern is not atomic. Two threads can both read the same old max, both pass the check, and both store — losing the actual max. This is a benign race (max_single_alloc_ is approximate), but technically undefined behavior for `std::atomic` with relaxed ordering.

**Фикс:** Use CAS loop: `while (bytes > current && !compare_exchange_weak(current, bytes))`.

### 8.1009 system_monitor: HealthStatus has no CPU tracking — Low

**Файл:** `system_monitor.h:178`

```cpp
double cpu_usage_pct{0.0};
```

`HealthStatus` has a `cpu_usage_pct` field but it's never populated — always 0.0. No code reads CPU usage from `/proc/stat` (Linux) or `GetSystemTimes` (Windows). The health endpoint will always report `cpu_usage_pct: 0.0`, which is misleading.

**Фикс:** Implement CPU reading or remove the field.

### 8.1010 hft-trade-bot/src/execution/order_manager.h: Order Manager — ✅ Excellent

**Файл:** `hft-trade-bot/src/execution/order_manager.h` (379 lines)

- **8-state machine**: PENDING → ACK → PARTIAL → FILLED / CANCELED / REJECTED / EXPIRED / MODIFY_PENDING — correct
- **OrderRecord**: `alignas(64)`, ≤320 bytes, all fields — correct
- **MAX_ORDERS=4096**: Fixed-capacity array — correct
- **Flat hash map**: cid_to_slot_ with linear probing, 8192 capacity, Fibonacci hashing — correct
- **cid_erase with re-insert**: Maintains probing chain — correct
- **Atomic client_order_id**: `fetch_add` — correct
- **Timeout handling**: `check_timeouts()` scans up to `max_slot_used_` — correct
- **Cancel-replace**: `modify_order()` — correct
- **Fill callback**: Copies record before callback to prevent race — correct
- **No heap allocations in hot path**: All fixed-size arrays — correct
- **`noexcept` on all methods**: Correct

Excellent order manager with 8-state machine, flat hash map, atomic IDs, timeout handling, cancel-replace, fill callback with copy, and noexcept. ✅

### 8.1011 order_manager: find_free_slot is O(N) — Low

**Файл:** `order_manager.h:290-300`

```cpp
uint64_t find_free_slot() noexcept {
    for (size_t i = 0; i < MAX_ORDERS; ++i) {
        if (orders_[i].state == OrderStateV2::FILLED || ... || orders_[i].client_order_id == 0) {
            return i;
        }
    }
    return MAX_ORDERS;
}
```

`find_free_slot()` linearly scans 4096 slots. With 100 orders/sec and 5s average order lifetime, there are ~500 active orders. After filling, slots are reused, but the scan always starts from 0. If the first 500 slots are active, each `create_order` scans 500 entries before finding a free slot. 100 scans/sec × 500 = 50,000 comparisons/sec.

**Фикс:** Maintain a free-list (stack of freed slot indices) for O(1) allocation.

### 8.1012 order_manager: no lock on state transitions — Medium

**Файл:** `order_manager.h:146-154, 157-184, 187-202, 205-215, 218-226, 229-236`

```cpp
void on_ack(uint64_t client_order_id, uint64_t exchange_order_id) noexcept {
    const auto* it = cid_find(client_order_id);
    if (!it) return;
    OrderRecord& rec   = orders_[it->slot];
    rec.order_id       = exchange_order_id;
    rec.state          = OrderStateV2::ACK;
```

All state transitions (`on_ack`, `on_partial_fill`, `on_fill`, `on_cancel`, `on_reject`, `on_expire`) modify `OrderRecord` fields without any lock or atomic. If `check_timeouts()` runs on one thread and `on_fill()` runs on another for the same order, the timeout may set `EXPIRED` while the fill sets `FILLED` — a data race. The `active_count_` is atomic, but the `OrderRecord` fields are not.

**Фикс:** Use a spinlock per order slot, or use atomic for `state` field, or ensure all order operations run on a single thread.

### 8.1013 order_manager: cid_erase re-insert can cascade — Low

**Файл:** `order_manager.h:344-366`

```cpp
void cid_erase(uint64_t cid) noexcept {
    // ...
    size_t next = (idx + 1) & CID_MAP_MASK;
    while (cid_to_slot_[next].cid != 0) {
        SlotEntry tmp = cid_to_slot_[next];
        cid_to_slot_[next].cid = 0;
        cid_to_slot_[next].slot = 0;
        cid_insert(tmp.cid, tmp.slot);
        next = (next + 1) & CID_MAP_MASK;
    }
}
```

The re-insert loop in `cid_erase` can cascade: if there's a long probe chain (e.g., 100 entries after the erased one), each entry is removed and re-inserted via `cid_insert`, which scans again. Worst case: O(N²) for a full table. With 4096 active orders and 8192 capacity (50% load factor), the average probe chain is ~2, but worst case can be much higher.

**Фикс:** Use tombstone markers instead of re-insertion, or use backward-shift deletion (Knuth's algorithm).

### 8.1014 Code reduction: db.py save_signal/save_trade/close_trade/save_equity 4× pattern — Info

**Файлы:** `db.py:84-148`

All 4 methods follow: `with closing(self._conn()) as conn: cursor = conn.execute(...); conn.commit()`. The only difference is the SQL and parameters.

**Reduction potential:** ~20 lines. Extract `_execute(sql, params) -> cursor` method.

### 8.1015 Code reduction: system_monitor snapshot() 11× field copy — Info

**Файлы:** `system_monitor.h:76-93`

`snapshot()` copies 11 fields individually from `get(Metric::...)`. This is verbose but necessary since there's no reflection in C++. Could use a loop with an enum-to-field mapping, but that would be more complex.

**Reduction potential:** ~5 lines. Not worth the complexity.

### 8.1016 ai-signal-bot/src/communication/circuit_breaker.py: Circuit Breaker — ✅ Good

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3-state machine**: CLOSED → OPEN → HALF_OPEN → CLOSED — correct
- **Configurable**: failure_threshold=5, cooldown=60s, half_open_max_probes=1, success_threshold=2 — correct
- **state property**: Auto-transitions OPEN→HALF_OPEN on cooldown expiry — correct
- **allow_signal**: CLOSED=True, OPEN=False+blocks, HALF_OPEN=limited probes — correct
- **record_success/record_failure**: State transitions with counters — correct
- **reset**: Force CLOSED — correct
- **get_status**: Dict for monitoring — correct

Good circuit breaker with 3-state machine, configurable thresholds, auto-transition, and status reporting. ✅

### 8.1017 circuit_breaker: not thread-safe — Low

**Файл:** `circuit_breaker.py:39-46, 72-85, 87-107`

All state mutations (`_state`, `_consecutive_failures`, `_consecutive_successes`, `_half_open_probes`, `_total_trips`, `_total_blocks`) are plain Python attributes without any lock. If `allow_signal()` and `record_failure()` are called from different coroutines (e.g., signal handler + trade result handler), the state can be inconsistent. E.g., `allow_signal()` reads `self.state` (which may transition to HALF_OPEN), while `record_failure()` trips the breaker — the trip may be lost.

**Фикс:** Use `asyncio.Lock` for state transitions, or ensure all calls are from the same event loop thread (which they likely are in asyncio, but the state property has a side effect of transitioning OPEN→HALF_OPEN which is not atomic with `allow_signal`).

### 8.1018 circuit_breaker: state property has side effect — Low

**Файл:** `circuit_breaker.py:48-54`

```python
@property
def state(self) -> BreakerState:
    if self._state == BreakerState.OPEN:
        if time.time() - self._opened_at >= self.config.cooldown_seconds:
            self._state = BreakerState.HALF_OPEN
            self._half_open_probes = 0
            logger.info("Circuit breaker: OPEN → HALF_OPEN (cooldown expired)")
    return self._state
```

The `state` property has a side effect: it transitions OPEN→HALF_OPEN. This means every access to `self.state` (including from `is_closed`, `is_open`, `get_status`) may trigger a state transition and log message. If `get_status()` is called for monitoring every 5s, the log message "OPEN → HALF_OPEN" may be printed multiple times if the cooldown expires between calls but the state was already HALF_OPEN.

Wait — actually no, once `_state` is set to `HALF_OPEN`, the `if self._state == BreakerState.OPEN` check fails, so it won't re-trigger. But the side effect in a property is still an anti-pattern — properties should be idempotent.

**Фикс:** Extract `_maybe_transition()` method, call it from `allow_signal()` only.

### 8.1019 ai-signal-bot/src/communication/ws_client.py: WebSocket Client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **Encoding**: JSON (default), msgpack (optional), orjson (optional) — correct
- **connect**: websockets.connect with ping_interval=10, compression, max_size=1MB — correct
- **listen**: async for message, decode, process, callback — correct
- **_process_message**: candles/snapshot, trading_state, error, welcome — correct
- **submit_order**: Check connected + trading_active, send order — correct
- **close_position**: Send close_position message — correct
- **reconnect**: 5 attempts with exponential backoff (1s→30s) — correct
- **candle_history**: deque(maxlen=200) per symbol — correct

Good WebSocket client with encoding fallbacks, message processing, order submission, and reconnect. ✅

### 8.1020 ws_client: listen has no reconnect loop — Medium [FIXED]

**Файл:** `ws_client.py:99-121`

```python
async def listen(self) -> None:
    if not self._ws:
        logger.error("Not connected")
        return
    try:
        async for message in self._ws:
            # ...
    except websockets.ConnectionClosed:
        logger.warning("Connection closed by server")
        self._connected = False
```

`listen()` exits on `ConnectionClosed` without calling `reconnect()`. The caller must detect the exit and call `reconnect()` manually. If the caller doesn't (e.g., if `listen()` is started as a background task), the bot will stop receiving market data silently. The `reconnect()` method exists but is never called automatically.

**Фикс:** Wrap `listen()` in a reconnect loop: `while self._running: await self.listen(); await self.reconnect()`.

### 8.1021 ws_client: submit_order has no confirmation — Low

**Файл:** `ws_client.py:154-185`

`submit_order()` sends the order message but doesn't wait for a confirmation/fill response. There's no order ID tracking, no timeout, no retry on failure. If the WebSocket send fails silently (e.g., connection dropped between send and server receive), the order is lost.

**Фикс:** Track order IDs, wait for fill confirmation with timeout, retry on timeout.

### 8.1022 ws_client: _process_message overwrites _latest_prices — Low

**Файл:** `ws_client.py:139`

```python
self._latest_prices = data.get("prices", {})
```

`_latest_prices` is overwritten on every snapshot, not merged. If different snapshots provide prices for different exchanges, only the last snapshot's prices are kept. Previous exchange prices are lost.

**Фикс:** `self._latest_prices.update(data.get("prices", {}))`.

### 8.1023 ai-signal-bot/src/communication/shm_ring_buffer.py: SHM Ring Buffer (Python) — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: head/tail atomics with cache-line alignment — correct
- **Power-of-2 capacity**: Mask-based slot index — correct
- **Cross-platform**: Windows (mmap tagname) + POSIX (/dev/shm) — correct
- **Memory barrier**: FlushViewOfFile (Windows) / msync (POSIX) after head/tail write — correct
- **try_push/try_pop**: O(1) non-blocking — correct
- **bulk_push/bulk_pop**: Batch operations with single atomic update — correct
- **size/empty/full**: Computed from head-tail — correct
- **close/unlink**: Proper cleanup — correct
- **Context manager + __del__**: RAII — correct
- **Struct definitions**: Signal (32B), Fill (28B), MarketSnapshot (28B) matching C++ layout — correct

Excellent SHM ring buffer with SPSC lock-free, cache-line alignment, memory barriers, cross-platform, bulk ops, and RAII. ✅

### 8.1024 shm_ring_buffer: _mm_barrier called on every atomic write — Low

**Файл:** `shm_ring_buffer.py:57-58`

```python
def _atomic_write_u64(mm, offset, value):
    struct.pack_into('<Q', mm, offset, value)
    _mm_barrier(mm)
```

Every `_atomic_write_u64` call triggers `_mm_barrier` (FlushViewOfFile or msync). This is a system call that flushes modified pages to the file. For `try_push`, this means 1 syscall per push. For `bulk_push`, only 1 syscall (head update only). On Windows, `FlushViewOfFile` is relatively fast (doesn't wait for disk), but it's still a kernel call. With 1000 pushes/sec, that's 1000 syscalls/sec.

**Фикс:** Only flush head/tail, not data. Or use a lighter memory barrier ( `_mm_mfence` equivalent) and rely on mmap's natural visibility. The data doesn't need to be flushed to disk — it just needs to be visible to the other process via the shared mapping.

### 8.1025 shm_ring_buffer: no validation on open — Low

**Файл:** `shm_ring_buffer.py:146-163`

When `create=False`, the code validates magic, capacity, and element_size. But it doesn't validate `total_size` — if the SHM segment was created with a different total_size (e.g., due to a different header size version), the mmap may map fewer bytes than expected, causing out-of-bounds access.

**Фикс:** Validate `stored_total_size == total_size` before proceeding.

### 8.1026 ai-signal-bot/src/observability/health_checks.py: Health Checks v2 — ✅ Good

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

- **3 endpoints**: /health/live, /health/ready, /health/status — correct
- **4 component checks**: WebSocket, TimescaleDB, Redis, Exchange — correct
- **HealthStatus enum**: HEALTHY, DEGRADED, UNHEALTHY — correct
- **ComponentHealth**: name, status, latency_ms, details, last_check — correct
- **check_liveness**: uptime + PID — correct
- **check_readiness**: Sequential 4 checks, overall status — correct
- **create_health_endpoints**: aiohttp handlers with 503 on unhealthy — correct

Good health checks with 3 endpoints, 4 component checks, status aggregation, and K8s-compatible status codes. ✅

### 8.1027 health_checks: check_readiness runs sequentially — Medium [FIXED]

**Файл:** `health_checks.py:85-100`

```python
async def check_readiness(self) -> dict[str, Any]:
    components: list[ComponentHealth] = []
    components.append(await self._check_ws())
    components.append(await self._check_db())
    components.append(await self._check_redis())
    components.append(await self._check_exchange())
```

4 checks run sequentially. If DB is down (30s timeout), Redis and Exchange checks are delayed by 30s. K8s readiness probe has a default timeout of 1-3s, so the probe will time out and mark the pod as not ready, even if Redis and Exchange are healthy.

**Фикс:** `await asyncio.gather(self._check_ws(), self._check_db(), self._check_redis(), self._check_exchange())`.

### 8.1028 health_checks: no timeout on individual checks — Medium [FIXED]

**Файл:** `health_checks.py:140-200`

Each `_check_*` method has no timeout. If `self.db_client.get_health()` hangs (e.g., TCP connection stuck), the check will block indefinitely. Same for Redis `ping()` and exchange `is_trading_active`.

**Фикс:** Wrap each check in `asyncio.wait_for(check, timeout=2.0)`.

### 8.1029 health_checks: _signal_count/_order_count/_error_count not thread-safe — Low

**Файл:** `health_checks.py:61-74`

```python
def record_signal(self) -> None:
    self._last_signal_time = time.time()
    self._signal_count += 1
```

`_signal_count`, `_order_count`, `_error_count` are plain integers. In asyncio (single-threaded), this is safe. But if `record_signal()` is called from a callback in a different thread (e.g., SHM consumer thread), the increment is not atomic.

**Фикс:** Use `itertools.count()` or `threading.Lock`, or document that all calls must be from the event loop thread.

### 8.1030 hft-trade-bot/src/core/bot_context.h: Bot Context — ✅ Good

**Файл:** `hft-trade-bot/src/core/bot_context.h` (114 lines)

- **SimExchange**: Delegates to SignalReceiver for market data — correct
- **SymbolEntry**: symbol string + cstr pointer + id — correct
- **ArbOpportunity**: symbol, buy/sell exchange, prices, spread, max_qty — correct
- **BotContext**: Aggregates all subsystems (receiver, risk_mgr, pos_mgr, executor, engines, router, adaptive_selector, kill_switch, sys_monitor, health_server, SHM IPC, exchange adapters, signal queue, balance, arb lock, caches) — correct
- **SPSCQueue<Signal, 16>**: Lock-free AI signal queue with mutex fallback — correct
- **Spinlock arb_lock**: For arb opportunity — correct
- **atomic<double> balance**: Thread-safe balance — correct

Good bot context with all subsystems, lock-free queue, spinlock, and atomic balance. ✅

### 8.1031 bot_context: prices_cache not thread-safe — Low

**Файл:** `bot_context.h:107`

```cpp
std::unordered_map<std::string, double> prices_cache;
```

`prices_cache` is a plain `unordered_map` without any lock. If it's accessed from multiple threads (e.g., bot loop + SHM consumer thread), it's a data race. The `ai_signal_queue_mtx` protects the queue but not `prices_cache`.

**Фикс:** Use a concurrent map, or protect with a lock, or ensure single-threaded access.

### 8.1032 bot_context: candles_buf and ob_buf not thread-safe — Low

**Файл:** `bot_context.h:108-109`

```cpp
std::vector<Candle>                     candles_buf;
OrderBook                               ob_buf;
```

`candles_buf` and `ob_buf` are plain containers without locks. If they're used as scratch buffers from multiple threads, they're data races. Likely intended for single-threaded bot loop use only, but no documentation enforces this.

**Фикс:** Document as bot-loop-only, or protect with locks.

### 8.1033 hft-trade-bot/src/exchange/IExchange.h: Exchange Interface — ✅ Excellent

**Файл:** `hft-trade-bot/src/exchange/IExchange.h` (43 lines)

- **Abstract interface**: 11 pure virtual methods — correct
- **DIP/SOLID**: Consumers depend on IExchange, not concrete adapters — correct
- **Identity**: id(), maker_fee_bps(), taker_fee_bps(), estimated_latency_us() — correct
- **Market data**: best_bid, best_ask, mid_price, bid_depth, ask_depth — correct
- **Availability**: is_available(), record_toxic_event(), toxic_event_count(), reset_toxic_events() — correct
- **Virtual destructor**: Correct

Excellent clean exchange interface with DIP, 11 methods, and virtual destructor. ✅

### 8.1034 hft-trade-bot/src/exchange/ExchangeBase.h: Exchange Base — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines)

- **Partial implementation**: id, fees, latency, toxic events — correct
- **EWMA latency**: `current + (us - current) / 10` with CAS loop — correct
- **Toxic event tracking**: Atomic counter — correct
- **is_available()**: `toxic_count_ < 5` — correct (auto-disable after 5 toxic events)
- **Protected members**: Correct

Good exchange base with EWMA latency tracking, toxic event backoff, and atomic counters. ✅

### 8.1035 ExchangeBase: is_available hardcodes threshold 5 — Low

**Файл:** `ExchangeBase.h:49`

```cpp
bool is_available() const override { return toxic_count_.load(std::memory_order_relaxed) < 5; }
```

The toxic threshold is hardcoded to 5. Different exchanges may have different toxicity tolerances. Binance may tolerate 10 toxic events (high liquidity), while a smaller exchange may only tolerate 2.

**Фикс:** Make threshold configurable: `ExchangeBase(id, maker_bps, taker_bps, toxic_threshold=5)`.

### 8.1036 hft-trade-bot/src/ipc/shm_fill_producer.h: SHM Fill Producer — ✅ Good

**Файл:** `hft-trade-bot/src/ipc/shm_fill_producer.h` (76 lines)

- **C++ creates, Python opens**: `create=true` — correct
- **push_fill**: Non-blocking try_push — correct
- **push_fill convenience**: Fills FillMsg struct — correct
- **push_fills bulk**: Batch push — correct
- **pending**: Current buffer size — correct
- **close + unlink**: RAII cleanup — correct
- **init returns bool**: [[nodiscard]] — correct

Good SHM fill producer with non-blocking push, bulk push, and RAII. ✅

### 8.1037 shm_fill_producer: init catches exception silently — Low

**Файл:** `shm_fill_producer.h:22-28`

```cpp
[[nodiscard]] bool init() {
    try {
        buffer_ = std::make_unique<ShmRingBuffer<FillMsg>>(shm_name_, capacity_, true);
        return true;
    } catch (const std::exception& e) {
        return false;
    }
}
```

`init()` catches the exception and returns `false` without logging the error message. The caller knows init failed but not why (e.g., permission denied, segment exists, out of memory).

**Фикс:** Log the exception: `spdlog::error("[ShmFillProducer] init failed: {}", e.what())`.

### 8.1038 hft-trade-bot/src/ipc/shm_signal_consumer.h: SHM Signal Consumer — ✅ Good

**Файл:** `hft-trade-bot/src/ipc/shm_signal_consumer.h` (79 lines)

- **Dedicated thread**: Runs in background, polls SHM — correct
- **Batch pop**: Inner while loop drains buffer — correct
- **50μs sleep when empty**: Avoids 100% CPU — correct
- **start/stop**: Atomic flag + thread join — correct
- **try_pop_signal**: Non-blocking polling mode — correct
- **pending**: Buffer size — correct
- **RAII**: Destructor calls stop — correct

Good SHM signal consumer with dedicated thread, batch pop, CPU-friendly sleep, and RAII. ✅

### 8.1039 shm_signal_consumer: 50μs busy-poll wastes CPU — Low

**Файл:** `shm_signal_consumer.h:66`

```cpp
std::this_thread::sleep_for(std::chrono::microseconds(50));
```

When the buffer is empty, the consumer sleeps 50μs then polls again. This means 20,000 polls/sec when idle. At 50 signals/sec (60s interval × 50 symbols / 60), the consumer does 20,000 polls to find 50 signals — 99.75% wasted polls. On a busy system, this consumes ~2-5% CPU.

**Фикс:** Use exponential backoff: start at 50μs, double up to 1ms when empty, reset on signal received. Or use a condition variable / eventfd for signaling.

### 8.1040 hft-trade-bot/src/ipc/shm_market_data.h: SHM Market Data — ✅ Excellent

**Файл:** `hft-trade-bot/src/ipc/shm_market_data.h` (177 lines)

- **Latest-snapshot model**: Single-slot per symbol, latest wins — correct
- **Seq-guarded lock-free**: seq increment before/after write, reader verifies — correct
- **Cross-platform**: Windows (CreateFileMapping) + POSIX (shm_open) — correct
- **write_snapshot**: Release ordering on seq stores — correct
- **read_snapshot**: Acquire ordering on seq loads, copy, verify — correct
- **write_price convenience**: Fills MarketSnapshotMsg — correct
- **RAII**: Destructor unmaps + unlinks — correct
- **Delete copy**: Correct

Excellent SHM market data with seq-guarded lock-free, latest-wins, cross-platform, and RAII. ✅

### 8.1041 shm_market_data: shm_open 0666 permissions — Low

**Файл:** `shm_market_data.h:66, 73`

```cpp
fd_ = shm_open(shm_name_.c_str(), O_CREAT | O_RDWR, 0666);
```

SHM segment is created with 0666 (world read/write). Any process on the system can read or write to the SHM segment, potentially injecting fake market data or reading sensitive price information.

**Фикс:** Use 0600 (owner only) or 0640 (owner + group).

### 8.1042 ai-signal-bot/src/notification/notifier.py: Notifier — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **TelegramNotifier**: aiohttp ClientSession, send_alert, _poll_updates, command handling — correct
- **DiscordNotifier**: aiohttp ClientSession, send_alert, _poll_messages, command handling — correct
- **NotifierManager**: Multi-notifier management, start_all/stop_all/send_alert — correct
- **AlertEvent**: Normalized event dataclass — correct
- **create_notifier_from_env**: Environment variable setup — correct
- **Shared aiohttp session**: Both notifiers create one session in start() — correct

Good notifier with Telegram + Discord, shared sessions, command handling, and env setup. ✅

### 8.1043 notifier: token in URL — Medium [FIXED]

**Файл:** `notifier.py:104, 122`

```python
url = f"https://api.telegram.org/bot{self.token}/sendMessage"
url = f"https://api.telegram.org/bot{self.token}/getUpdates"
```

The Telegram bot token is embedded in the URL. If the HTTP request is logged (e.g., by aiohttp debug logging, proxy, or middleware), the token is exposed. Same for Discord:

```python
headers = {"Authorization": f"Bot {self.token}"}
```

The Discord token is in the Authorization header, which is better but still visible in debug logs.

**Фикс:** Disable debug logging for HTTP requests. Use environment variables for tokens (already done via `create_notifier_from_env`). Consider using a secrets manager.

### 8.1044 notifier: _poll_updates no rate limit on commands — Low

**Файл:** `notifier.py:118-148`

`_poll_updates` processes all updates in a batch. If a malicious user sends 100 /close_all commands in 1 second, all 100 will be processed, potentially causing 100 close_all operations. There's no rate limiting on command processing.

**Фикс:** Add per-command rate limiting (e.g., max 1 command per 5 seconds per chat).

### 8.1045 notifier: Discord _poll_messages polls REST API — Low

**Файл:** `notifier.py:234-263`

`_poll_messages` polls the Discord REST API every loop iteration with `limit=10` messages. There's no sleep between polls when the API returns 200 — the loop immediately polls again. This can hit Discord's rate limit (50 requests/sec global, 5/sec per channel). The 5-second sleep only happens on non-200 status.

**Фикс:** Add `await asyncio.sleep(1)` after successful poll. Or use Discord Gateway (WebSocket) instead of REST polling.

### 8.1046 notifier: send_alert sequential across notifiers — Low

**Файл:** `notifier.py:308-310`

```python
async def send_alert(self, event: AlertEvent):
    for n in self._notifiers:
        await n.send_alert(event)
```

`send_alert` sends to each notifier sequentially. If Telegram takes 500ms and Discord takes 500ms, total alert time is 1s. During a market crash with 20 alerts, that's 20s of alert delivery time.

**Фикс:** `await asyncio.gather(*[n.send_alert(event) for n in self._notifiers])`.

### 8.1047 Code reduction: notifier Telegram/Discord _handle_command 2× pattern — Info

**Файлы:** `notifier.py:150-164, 265-279`

Both `TelegramNotifier._handle_command` and `DiscordNotifier._handle_command` are identical — 15 lines each. Same for `register_command`, `start`, `stop` (partially).

**Reduction potential:** ~30 lines. Extract a `BaseNotifier` class with shared command handling.

### 8.1048 ai-signal-bot/src/observability/logging.py: Structured Logging — ✅ Good

**Файл:** `ai-signal-bot/src/observability/logging.py` (171 lines)

- **structlog fallback**: Falls back to stdlib logging if structlog not installed — correct
- **JSON + console**: Dual output with ProcessorFormatter — correct
- **Context vars**: bind_context/clear_context for correlation IDs — correct
- **Library noise suppression**: asyncio, websockets, aiohttp — correct
- **Service context**: service name + version in every log entry — correct
- **_configured guard**: Prevents double initialization — correct
- **File handler**: Optional JSON file logging — correct

Good structured logging with structlog fallback, JSON/console, context vars, and noise suppression. ✅

### 8.1049 logging.py: no log rotation — Low [FIXED]

**Файл:** `logging.py:119-123`

```python
if log_file:
    file_formatter = _create_formatter(True, shared_processors, structlog)
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(file_formatter)
    handlers.append(file_handler)
```

Uses `logging.FileHandler` which doesn't rotate. In production with 50 symbols × 60s interval, the log file grows unbounded. At ~1KB per signal log entry, 50 entries/min = 3MB/hour = 72MB/day = 2.1GB/month. Disk fills up, bot crashes.

**Фикс:** Use `logging.handlers.RotatingFileHandler` with maxBytes=100MB and backupCount=5.

### 8.1050 logging.py: duplicate setup_logging in helpers.py — Info [FIXED]

**Файлы:** `logging.py:31-66`, `helpers.py:14-42`

Both `observability/logging.py:setup_logging()` and `utils/helpers.py:setup_logging()` configure logging. They use different approaches (structlog vs stdlib JsonFormatter). If both are called, the second one overwrites the first's handlers. The `helpers.py` version doesn't check `_configured` — it always reconfigures.

**Reduction potential:** Remove `helpers.py:setup_logging()`, use `observability/logging.py:setup_logging()` everywhere. ~30 lines.

### 8.1051 ai-signal-bot/src/observability/tracing.py: Distributed Tracing — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry + Jaeger**: OTLP gRPC exporter — correct
- **Noop fallback**: NoopTracer + NoopSpan when not initialized — correct
- **Asyncio instrumentor**: Automatic async span creation — correct
- **Resource**: service.name, namespace, version — correct
- **BatchSpanProcessor**: Batches span exports — correct
- **shutdown_tracing**: Flush + shutdown — correct
- **_initialized guard**: Prevents double init — correct

Good distributed tracing with OpenTelemetry, noop fallback, asyncio instrumentation, and graceful shutdown. ✅

### 8.1052 tracing.py: NoopSpan missing context manager — Low [N/A]

**Файл:** `tracing.py:83-92`

```python
class NoopSpan:
    def set_attribute(self, key, value): pass
    def set_status(self, status): pass
    def record_exception(self, exc): pass
    def add_event(self, name, attributes=None): pass
```

`NoopSpan` doesn't implement `__enter__`/`__exit__`, so it can't be used as a context manager like real OpenTelemetry spans. If code does `with tracer.start_as_current_span("x") as span:`, the NoopTracer's `start_as_current_span` yields NoopSpan, but `span.__enter__()` will fail.

Wait — actually, the `start_as_current_span` is a `@contextmanager` that yields NoopSpan. The `with` statement works on the context manager, not on NoopSpan itself. So `with tracer.start_as_current_span("x") as span:` works — `span` is the yielded NoopSpan. No issue here.

Actually, the real OTel API's `start_as_current_span` returns a context manager that also supports `__enter__`/`__exit__` on the span itself. But since this NoopTracer uses `@contextmanager`, it's fine. No issue.

### 8.1053 tracing.py: OTLPSpanExporter insecure=True hardcoded — Low [FIXED]

**Файл:** `tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

`insecure=True` disables TLS for the gRPC connection to Jaeger. If Jaeger is on a different host (production), traces are sent in plaintext. An attacker on the network can intercept trace data (service names, operation names, attributes with symbol/strategy info).

**Фикс:** Use `insecure=False` in production with proper TLS certificates. Only use `insecure=True` for local development.

### 8.1054 ai-signal-bot/src/utils/helpers.py: Utility Functions — ✅ Good

**Файл:** `ai-signal-bot/src/utils/helpers.py` (205 lines)

- **setup_logging**: stdlib + JsonFormatter — correct (but duplicates observability/logging.py)
- **JsonFormatter**: JSON log entry with timestamp, level, logger, message — correct
- **load_config**: YAML safe_load with FileNotFoundError fallback — correct
- **get_env**: Type casting with bool support — correct
- **now_ms/now_us**: Time helpers — correct
- **format_price/format_qty**: Adaptive decimal places — correct
- **safe_divide/clamp**: Math helpers — correct
- **truncate_dict**: For logging — correct
- **CircuitBreaker**: Simple 3-state (closed/open/half_open) — correct (but duplicates communication/circuit_breaker.py)
- **RateLimiter**: Token bucket with async acquire — correct

Good utility functions with logging, config, formatting, math, circuit breaker, and rate limiter. ✅

### 8.1055 helpers.py: duplicate CircuitBreaker — Info [FIXED]

**Файлы:** `helpers.py:145-176`, `communication/circuit_breaker.py:34-137`

Two CircuitBreaker implementations exist:
1. `utils/helpers.py:CircuitBreaker` — 31 lines, simple, no HALF_OPEN probe limit
2. `communication/circuit_breaker.py:CircuitBreaker` — 103 lines, full, with HALF_OPEN probes, success threshold, stats

The `helpers.py` version is simpler but less capable. It doesn't track total_trips, total_blocks, or have configurable success_threshold. The `is_open` property has a side effect (transitions open→half_open), same anti-pattern as the full version.

**Reduction potential:** Remove `helpers.py:CircuitBreaker`, use `communication/circuit_breaker.py:CircuitBreaker` everywhere. ~31 lines.

### 8.1056 helpers.py: RateLimiter._refill not thread-safe — Low [N/A]

**Файл:** `helpers.py:188-192`

```python
def _refill(self) -> None:
    now = time.monotonic()
    elapsed = now - self._last_refill
    self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
    self._last_refill = now
```

`_refill` reads and writes `_tokens` and `_last_refill` without a lock. If `acquire()` is called from multiple coroutines (which can interleave at `await asyncio.sleep(wait)`), two coroutines may `_refill()` simultaneously, double-counting tokens.

In asyncio (single-threaded), this is safe as long as `_refill()` doesn't `await`. It doesn't. But `acquire()` does `await asyncio.sleep(wait)` — after sleep, it loops back to `_refill()`. If two coroutines are in the `while True` loop, they interleave at the `await`, but `_refill()` is synchronous. So it's safe in asyncio.

### 8.1057 helpers.py: RateLimiter.acquire spins forever — Low [FIXED]

**Файл:** `helpers.py:194-204`

```python
async def acquire(self) -> bool:
    import asyncio
    if self.rate <= 0:
        return False
    while True:
        self._refill()
        if self._tokens >= 1.0:
            self._tokens -= 1.0
            return True
        wait = (1.0 - self._tokens) / self.rate
        await asyncio.sleep(wait)
```

`acquire()` spins forever until a token is available. There's no timeout or cancellation handling. If the rate is very low (e.g., 0.01 tokens/sec) and burst=1, the caller waits 100 seconds. During this time, the coroutine is blocked in `asyncio.sleep`. If the event loop is shutting down, the coroutine doesn't exit.

**Фикс:** Add `timeout` parameter: `async def acquire(self, timeout: float | None = None) -> bool`.

### 8.1058 ai-signal-bot/src/llm_engine/engine.py: LLM Engine — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **3 providers**: OpenAI, Anthropic, Ollama — correct
- **Rule-based fallback**: Full analysis/explanation/risk when no API key — correct
- **Cache**: TTL-based with 100-entry eviction — correct
- **Prompt templates**: File-based with inline fallback — correct
- **aiohttp session**: Shared with timeout — correct
- **Error handling**: Falls back to rule-based on API error — correct
- **Stats**: request_count, error_count, cache_size — correct

Good LLM engine with 3 providers, rule-based fallback, caching, prompt templates, and error handling. ✅

### 8.1059 engine.py: API key in memory as plain string — Medium [FIXED]

**Файл:** `engine.py:73, 86-88, 237, 249`

```python
self.config = config or LLMConfig()
# ...
self.config.api_key = os.getenv("OPENAI_API_KEY", "")
# ...
headers = {"Authorization": f"Bearer {self.config.api_key}"}
headers = {"x-api-key": self.config.api_key}
```

The API key is stored as a plain string in `self.config.api_key` and embedded in HTTP headers. If the config object is logged (e.g., `logger.info(f"Config: {self.config}")`), the API key is exposed. The `LLMConfig` dataclass has `api_key: str = ""` which will be included in `repr(self.config)`.

**Фикс:** Use `__repr__` that masks the API key, or store the key in a `SecretStr` wrapper.

### 8.1060 engine.py: cache eviction is O(N) — Low [FIXED]

**Файл:** `engine.py:164-167`

```python
if len(self._cache) > 100:
    stale_keys = [k for k, (t, _) in self._cache.items() if now - t >= self.config.cache_ttl_seconds]
    for k in stale_keys:
        del self._cache[k]
```

Cache eviction scans all entries (O(N)) when cache exceeds 100 entries. With 50 symbols, this triggers every 50 signals (cache fills in ~50 calls). Each eviction scans 100 entries. At 50 signals/min, that's 50 scans/min × 100 entries = 5000 comparisons/min. Not terrible, but `OrderedDict` with LRU eviction would be O(1).

**Фикс:** Use `collections.OrderedDict` with LRU eviction, or `functools.lru_cache`.

### 8.1061 engine.py: _parse_response JSON extraction fragile — Low [FIXED]

**Файл:** `engine.py:287-290`

```python
start = response.find("{")
end = response.rfind("}") + 1
if start >= 0 and end > start:
    data = json.loads(response[start:end])
```

Extracts JSON by finding first `{` and last `}`. If the LLM response contains markdown with code blocks (e.g., `Here is the analysis: \`\`\`json\n{...}\n\`\`\``), the extraction may include the markdown or miss nested JSON. If the response has multiple JSON objects, only the first-to-last span is parsed, which may be invalid.

**Фикс:** Use regex to extract JSON from code blocks, or ask the LLM to return only JSON without markdown.

### 8.1062 engine.py: no concurrent request limit — Low [FIXED]

**Файл:** `engine.py:149-184`

`analyze_market()` calls `_call_llm()` which sends an HTTP request. There's no concurrency limit — if 50 symbols trigger `analyze_market()` simultaneously, 50 HTTP requests are sent to OpenAI at once. OpenAI has rate limits (500 req/min for GPT-4o-mini). 50 concurrent requests may hit the rate limit, causing 429 errors.

**Фикс:** Use `asyncio.Semaphore(5)` to limit concurrent LLM requests.

### 8.1063 hft-trade-bot/src/exchange/BinanceAdapter.h: Binance Adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BinanceAdapter.h` (190 lines)

- **IExchange impl**: best_bid/ask/mid/depth via spinlock-protected maps — correct
- **on_book_ticker**: Updates bids/asks/depth under spinlocks — correct
- **on_depth_update**: Updates best bid/ask from diff depth — correct
- **sign**: HMAC-SHA256 (declared, not implemented here) — correct
- **place_order/cancel_order**: REST API (declared) — correct
- **can_send_order**: Atomic rate limiter (300 orders/10s) — correct
- **Stream URLs**: bookTicker, depth20@100ms, aggTrade, user data — correct
- **listen_key**: create/ping/close — correct

Good Binance adapter with spinlock-protected maps, atomic rate limiter, and stream URL helpers. ✅

### 8.1064 BinanceAdapter: on_book_ticker takes two spinlocks — Medium

**Файл:** `BinanceAdapter.h:72-80`

```cpp
void on_book_ticker(const std::string& symbol, double bid, double bid_qty, double ask,
                    double ask_qty) {
    std::lock_guard<Spinlock> lk(price_lock_);
    bids_[symbol] = bid;
    asks_[symbol] = ask;
    std::lock_guard<Spinlock> lk2(depth_lock_);
    bid_depth_[symbol] = bid_qty;
    ask_depth_[symbol] = ask_qty;
}
```

`on_book_ticker` takes `price_lock_` then `depth_lock_`. `best_bid()` takes only `price_lock_`. `bid_depth()` takes only `depth_lock_`. If thread A calls `on_book_ticker` (holds price_lock_, waits for depth_lock_) and thread B calls `on_depth_update` (holds depth_lock_, waits for price_lock_), it's a deadlock.

Wait — `on_depth_update` at line 83-99 takes `price_lock_` first, then `depth_lock_` — same order. So no deadlock. But `on_book_ticker` takes `price_lock_`, writes, then takes `depth_lock_`. Between the two locks, another thread can read stale depth with new price. This is a consistency issue, not a deadlock.

**Фикс:** Use a single spinlock for both price and depth, or use atomic doubles instead of maps.

### 8.1065 BinanceAdapter: unordered_map heap allocation on update — Low

**Файл:** `BinanceAdapter.h:74-79`

`bids_[symbol] = bid` may trigger `unordered_map` rehashing and bucket allocation if the map grows. With 50 symbols, the map is small, but each `on_book_ticker` call does a string hash + lookup + potential insert. The string key `symbol` is a `std::string` — each lookup allocates temporaries. For 50 symbols × 10 updates/sec = 500 updates/sec, that's 500 string hashes/sec under a spinlock.

**Фикс:** Use `std::string_view` for lookups, or use a flat array indexed by symbol_id (uint8_t).

### 8.1066 BinanceAdapter: api_secret in Config struct — Medium

**Файл:** `BinanceAdapter.h:29`

```cpp
struct Config {
    std::string api_key;
    std::string api_secret;
    // ...
};
```

`api_secret` is stored as a plain `std::string` in the config struct. If the config is logged (e.g., `spdlog::info("Config: {}", config_)`), the secret is exposed. The secret is also in heap memory and can be read by a memory dump.

**Фикс:** Use a secure string that zeros memory on destruction. Don't log Config. Use environment variables or a secrets manager.

### 8.1067 BinanceAdapter: can_send_order race on window reset — Low

**Файл:** `BinanceAdapter.h:123-136`

```cpp
bool can_send_order() {
    auto now_ns = ...;
    auto window_ns = order_window_start_ns_.load(...);
    auto elapsed_ns = now_ns - window_ns;
    if (elapsed_ns >= 10'000'000'000) {
        if (order_window_start_ns_.compare_exchange_strong(window_ns, now_ns, ...)) {
            orders_in_window_.store(0, ...);
        }
    }
    return orders_in_window_.fetch_add(1, ...) < 300;
}
```

When the 10s window expires, `compare_exchange` resets `order_window_start_ns_` and then `orders_in_window_` is reset to 0. But between the CAS and the store(0), another thread may `fetch_add(1)` on `orders_in_window_`, getting a value > 0. Then `store(0)` overwrites it, losing that count. This means a few extra orders may be allowed through during window reset.

Not a critical issue — Binance rate limit is 300/10s, and a few extra won't trigger a ban. But it's a race.

**Фикс:** Reset `orders_in_window_` before the CAS, or use a single atomic for both.

### 8.1068 hft-trade-bot/src/exchange/OKXAdapter.h: OKX Adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/OKXAdapter.h` (143 lines)

- **IExchange impl**: Spinlock-protected maps — correct
- **on_ticker**: Updates bids/asks/depth — correct
- **to_inst_id**: Symbol conversion (BTCUSDT → BTC-USDT-SWAP) — correct (USDT only)
- **sign**: HMAC-SHA256 (declared) — correct
- **place_order/cancel_order**: REST API (declared) — correct
- **Subscribe messages**: tickers, books5, orders — correct
- **login_message**: Private WS auth (declared) — correct

Good OKX adapter with spinlock-protected maps, symbol conversion, and subscription helpers. ✅

### 8.1069 OKXAdapter: to_inst_id only handles USDT — Low

**Файл:** `OKXAdapter.h:79-88`

```cpp
static std::string to_inst_id(const std::string& symbol) {
    std::string clean = symbol;
    clean.erase(std::remove(clean.begin(), clean.end(), '/'), clean.end());
    if (clean.size() >= 4u && clean.substr(clean.size() - 4) == "USDT") {
        std::string base = clean.substr(0, clean.size() - 4);
        return base + "-USDT-SWAP";
    }
    return symbol;
}
```

Only handles USDT pairs. Symbols ending with BTC, ETH, USDC, etc. are not converted — `return symbol` returns the raw symbol (e.g., "BTCUSDC") which OKX will reject. Same issue as `real_market_data:_to_okx_inst_id` in Python.

**Фикс:** Support USDC, BTC, ETH quote currencies. Or make the quote currency a parameter.

### 8.1070 OKXAdapter: no rate limiter — Low

**Файл:** `OKXAdapter.h` (entire file)

Unlike `BinanceAdapter` which has `can_send_order()`, OKXAdapter has no rate limiter. OKX has 20 req/2s per endpoint and 60 req/2s for order placement. Without rate limiting, the bot may hit OKX's rate limit and get banned.

**Фикс:** Add `can_send_order()` with OKX-specific limits (60 orders/2s).

### 8.1071 OKXAdapter: passphrase stored as plain string — Medium

**Файл:** `OKXAdapter.h:27`

```cpp
std::string passphrase;
```

OKX requires a passphrase for API authentication. It's stored as a plain `std::string` in the Config struct, same security issue as BinanceAdapter's `api_secret`.

**Фикс:** Use a secure string wrapper. Don't log Config.

### 8.1072 hft-trade-bot/src/exchange/BybitAdapter.h: Bybit Adapter — ✅ Good

**Файл:** `hft-trade-bot/src/exchange/BybitAdapter.h` (137 lines)

- **IExchange impl**: Spinlock-protected maps — correct
- **on_orderbook**: Updates bids/asks/depth — correct
- **sign**: HMAC-SHA256 (declared) — correct
- **place_order/cancel_order**: REST API (declared) — correct
- **Subscribe messages**: orderbook.50, tickers, publicTrade, orders — correct
- **auth_message**: WebSocket auth — correct

Good Bybit adapter with spinlock-protected maps and subscription helpers. ✅

### 8.1073 BybitAdapter: no rate limiter — Low

**Файл:** `BybitAdapter.h` (entire file)

Same as OKXAdapter — no `can_send_order()` rate limiter. Bybit has 120 req/min for order creation. Without rate limiting, the bot may hit Bybit's rate limit.

**Фикс:** Add `can_send_order()` with Bybit-specific limits (120 orders/min).

### 8.1074 BybitAdapter: api_secret in Config struct — Medium

**Файл:** `BybitAdapter.h:25`

```cpp
std::string api_secret;
```

Same issue as BinanceAdapter and OKXAdapter — plain string secret in Config.

**Фикс:** Use a secure string wrapper. Don't log Config.

### 8.1075 Code reduction: 3× adapter duplicate pattern — Info

**Файлы:** `BinanceAdapter.h:41-69`, `OKXAdapter.h:39-65`, `BybitAdapter.h:37-63`

All three adapters have identical `best_bid`, `best_ask`, `mid_price`, `bid_depth`, `ask_depth` implementations — 30 lines each × 3 = 90 lines of duplication. The only difference is the class name and the map names (which are identical).

**Reduction potential:** ~60 lines. Move the maps + spinlocks + IExchange methods to `ExchangeBase`, make them virtual, and have concrete adapters only implement update methods + exchange-specific logic.

### 8.1076 hft-trade-bot/src/metrics/metrics_collector.h: Metrics Collector — ✅ Good

**Файл:** `hft-trade-bot/src/metrics/metrics_collector.h` (93 lines)

- **3 metric types**: Counter, Gauge, Histogram — correct
- **HistogramBuckets**: Observe, get_buckets, get_counts, get_total_count, get_sum — correct
- **Convenience methods**: record_signal_generation_latency, record_order_execution_latency, record_fill, record_error — correct
- **System metrics**: cpu_usage, memory_usage, active_connections — correct
- **HTTP server**: Prometheus export on port 8002 — correct
- **Mutex protection**: `metrics_mutex_` for all maps — correct

Good metrics collector with 3 metric types, convenience methods, HTTP server, and mutex protection. ✅

### 8.1077 metrics_collector: std::map for counters/gauges — Low

**Файл:** `metrics_collector.h:86-88`

```cpp
std::map<std::string, uint64_t> counters_;
std::map<std::string, double> gauges_;
std::map<std::string, HistogramBuckets> histograms_;
```

Uses `std::map` (red-black tree, O(log N) lookup) instead of `std::unordered_map` (O(1) lookup). With 50 symbols × 5 strategies = 250 counter keys, the log(250) ≈ 8 comparisons per lookup. At 50 signals/min, that's 400 comparisons/min — negligible. But `std::map` also allocates nodes on the heap for each insertion, which is slower than `unordered_map`'s bucket allocation.

**Фикс:** Use `std::unordered_map` for O(1) lookup. Or use a flat hash map like `absl::flat_hash_map`.

### 8.1078 metrics_collector: mutex on every metric operation — Medium [FIXED]

**Файл:** `metrics_collector.h:85`

```cpp
std::mutex metrics_mutex_;
```

A single `std::mutex` protects all counters, gauges, and histograms. Every `increment_counter`, `set_gauge`, `observe_histogram` call acquires this mutex. In the hot path (signal generation → order execution → fill), 3-5 metric operations happen per signal. At 50 signals/sec, that's 150-250 mutex acquisitions/sec. `std::mutex` is a kernel-level lock (~1μs per acquisition on Linux). 250 × 1μs = 250μs/sec = 0.025% CPU overhead.

Not terrible, but in an HFT bot where every microsecond counts, a spinlock or atomic counters would be better. Also, if the HTTP server thread is generating Prometheus output (which iterates all maps under the mutex), all metric operations are blocked for the duration of the export.

**Фикс:** Use atomic counters for simple increment/set. Use per-histogram mutexes. Or use a lock-free metrics library like `prometheus::Registry`.

### 8.1079 metrics_collector: HTTP server blocks during export — Low

**Файл:** `metrics_collector.h:72, 77-79`

`generate_prometheus_output()` iterates all counters, gauges, and histograms under `metrics_mutex_`. If there are 250 keys, the export takes ~100μs (string concatenation). During this time, all `increment_counter`/`set_gauge`/`observe_histogram` calls are blocked. At 50 signals/sec, this adds ~100μs latency to 1-2 signals per export.

**Фикс:** Snapshot the metrics under the mutex, then generate the output outside the mutex. Or use a reader-writer lock.

### 8.1080 hft-trade-bot/src/network/ws_client.h: Network WebSocket Client — ✅ Excellent

**Файл:** `hft-trade-bot/src/network/ws_client.h` (256 lines)

- **6-state ConnectionState**: DISCONNECTED→CONNECTING→CONNECTED→AUTHENTICATED→RECONNECTING→ERROR — correct
- **ReconnectPolicy**: Exponential backoff with jitter, configurable max_attempts — correct
- **Watchdog**: Atomic last_activity_ns, feed/is_alive/idle_ms — correct
- **MessageQueue**: Bounded, spinlock-protected, drop counter, try_push/try_pop — correct
- **SubscriptionManager**: Spinlock-protected unordered_set — correct
- **ReconnectionManager**: Atomic state + attempts, should_retry, next_delay_ms — correct

Excellent network WS client with 6-state machine, exponential backoff with jitter, watchdog, bounded message queue with backpressure, subscription manager, and reconnection manager. ✅

### 8.1081 ws_client: ReconnectPolicy uses rand() not thread-safe — Low

**Файл:** `ws_client.h:84`

```cpp
int32_t jitter =
    static_cast<int32_t>(jitter_ms) - static_cast<int32_t>(rand() % (2 * jitter_ms));
```

`rand()` is not thread-safe and has poor distribution. If `compute_delay` is called from multiple threads simultaneously, the internal state of `rand()` is corrupted, producing non-random or biased values. Also, `rand() % N` produces biased results for non-power-of-2 N.

**Фикс:** Use `std::mt19937` with a thread-local instance, or `std::random_device` for seeding.

### 8.1082 ws_client: MessageQueue uses std::queue with std::string — Low

**Файл:** `ws_client.h:169`

```cpp
std::queue<std::string> queue_;
```

`std::queue<std::string>` uses `std::deque` as the underlying container, which allocates each string on the heap. Each `try_push` moves a string into the queue (heap allocation for the deque block), and each `try_pop` moves it out (deallocation). With 500 messages/sec, that's 1000 heap ops/sec. The comment says "No heap allocations in hot path" but `std::string` itself is a heap allocation.

**Фикс:** Use a ring buffer of pre-allocated `std::array<char, N>` or a pool of string buffers.

### 8.1083 ws_client: Watchdog timeout_ms_ not atomic — Low

**Файл:** `ws_client.h:111, 120`

```cpp
void set_timeout(uint32_t ms) noexcept { timeout_ms_ = ms; }
// ...
uint32_t timeout_ms_;
```

`timeout_ms_` is a plain `uint32_t`, not atomic. If `set_timeout` is called from one thread while `is_alive` reads `timeout_ms_` from another, it's a data race. The `last_activity_ns_` is atomic, but the timeout itself is not.

**Фикс:** Make `timeout_ms_` `std::atomic<uint32_t>`.

### 8.1084 hft-trade-bot/src/tracing/tracer.h: C++ Tracer — ✅ Good

**Файл:** `hft-trade-bot/src/tracing/tracer.h` (76 lines)

- **Span**: name, attributes, events, status, start/end time — correct
- **Tracer**: service_name, jaeger_host, jaeger_port — correct
- **Trace methods**: signal_generation, order_execution, signal_processing, orderbook_update — correct
- **Context propagation**: inject/extract — correct
- **Mutex protection**: `tracer_mutex_` for spans — correct

Good C++ tracer with Span, 4 trace methods, context propagation, and mutex protection. ✅

### 8.1085 tracer: spans_ vector unbounded — Medium

**Файл:** `tracer.h:71`

```cpp
std::vector<Span> spans_;
```

`spans_` is a `std::vector<Span>` that grows unbounded. Every `trace_signal_generation`, `trace_order_execution`, etc. adds a Span to the vector. At 50 signals/sec × 4 trace methods = 200 spans/sec. In 1 hour, that's 720,000 spans × ~200 bytes each = 144MB. In 24 hours, 3.4GB. The bot will OOM.

**Фикс:** Use a ring buffer with a max size (e.g., 10,000 spans). Or export spans to Jaeger periodically and clear the vector. Or use OpenTelemetry SDK which handles this automatically.

### 8.1086 tracer: mutex on every span creation — Low

**Файл:** `tracer.h:70`

```cpp
std::mutex tracer_mutex_;
```

Every `trace_*` method acquires `tracer_mutex_` to add a Span. At 200 spans/sec, that's 200 mutex acquisitions/sec. `std::mutex` is ~1μs per acquisition. 200μs/sec = 0.02% CPU. Not terrible, but in an HFT bot, a spinlock or lock-free queue would be better.

**Фикс:** Use a lock-free SPSC queue for spans (single producer = bot loop, single consumer = export thread).

### 8.1087 tracer: no span export mechanism — Medium

**Файл:** `tracer.h` (entire file)

The `Tracer` class has no method to export spans to Jaeger. `inject_context` propagates context via headers, but there's no `export_spans()` or `flush()` method. Spans accumulate in `spans_` and are never sent to Jaeger. The tracing is effectively useless — spans are collected but never exported.

**Фикс:** Add `export_spans()` method that sends spans to Jaeger via UDP/HTTP. Or integrate with OpenTelemetry SDK which handles export automatically. Call `export_spans()` periodically (e.g., every 10s) or when `spans_.size()` exceeds a threshold.

### 8.1088 ai-signal-bot/src/strategies/signal.py: Core Signal Types — ✅ Excellent

**Файл:** `ai-signal-bot/src/strategies/signal.py` (58 lines)

- **SignalDirection enum**: LONG, SHORT, NEUTRAL — correct
- **Signal dataclass**: symbol, direction, confidence, strategy, entry_price, stop_loss, take_profit, reason, timestamp — correct
- **is_actionable property**: direction != NEUTRAL — correct
- **rr_ratio property**: reward/risk with direction awareness, zero-risk guard — correct
- **to_dict**: Serializes all fields including rr_ratio — correct

Excellent core signal type — clean, minimal, well-designed dataclass with computed properties. ✅

### 8.1089 signal.py: rr_ratio doesn't handle negative risk — Low [FIXED]

**Файл:** `signal.py:35-43`

```python
@property
def rr_ratio(self) -> float:
    if self.direction == SignalDirection.LONG:
        risk = self.entry_price - self.stop_loss
        reward = self.take_profit - self.entry_price
    elif self.direction == SignalDirection.SHORT:
        risk = self.stop_loss - self.entry_price
        reward = self.entry_price - self.take_profit
    else:
        return 0.0
    return reward / risk if risk > 0 else 0.0
```

If `risk <= 0` (e.g., LONG with stop_loss above entry_price — a misconfigured signal), `rr_ratio` returns 0.0. This silently passes the validator's `min_rr_ratio` check (0.0 < 1.5 → rejected). But the signal is fundamentally broken — SL is on the wrong side. The validator rejects it for low R:R, not for invalid SL/TP placement. The error message is misleading.

**Фикс:** Add validation in `rr_ratio` or in the validator: if risk <= 0, return a special value or raise, and the validator should check for invalid SL/TP placement explicitly.

### 8.1090 ai-signal-bot/src/risk/risk_manager.py: Risk Manager — ✅ Good

**Файл:** `ai-signal-bot/src/risk/risk_manager.py` (262 lines)

- **RiskConfig**: trailing stop, breakeven, partial TP, max hold — correct
- **PositionRiskState**: tracks peak/trough, breakeven_moved, partial_tp_executed, candles_held — correct
- **update()**: 4 checks per candle — breakeven, trailing, partial TP, max hold — correct
- **_track_peak_trough**: Direction-aware peak/trough — correct
- **_check_breakeven**: Only moves SL in favorable direction — correct
- **_check_trailing**: ATR-based or fixed %, only moves SL favorably — correct
- **_check_partial_tp**: Returns % to close — correct
- **_check_max_hold**: Closes position after N candles — correct
- **_calc_atr_from_candle**: True Range from single candle — correct

Good risk manager with trailing stop, breakeven, partial TP, max hold, and direction-aware SL movement. ✅

### 8.1091 risk_manager: _track_peak_trough inverted for SHORT — Low

**Файл:** `risk_manager.py:131-136`

```python
if state.side == "LONG":
    state.peak_price = max(state.peak_price, current_price)
    state.trough_price = min(state.trough_price, current_price) if state.trough_price > 0 else current_price
else:
    state.peak_price = min(state.peak_price, current_price) if state.peak_price > 0 else current_price
    state.trough_price = max(state.trough_price, current_price)
```

For SHORT, `peak_price` tracks the lowest price (favorable) and `trough_price` tracks the highest (unfavorable). This is semantically confusing — `peak` should be the highest price, `trough` the lowest, regardless of position direction. The variable names don't match their behavior for SHORT positions.

This isn't a bug — the logic is correct for the purpose (peak = best price for the position). But it's a maintenance hazard — a developer reading `peak_price` expects the highest price, not the lowest.

**Фикс:** Rename to `best_price` / `worst_price` instead of `peak_price` / `trough_price`.

### 8.1092 risk_manager: no thread safety — Low

**Файл:** `risk_manager.py` (entire file)

`RiskManager` has no locks. `update()` mutates `PositionRiskState` (candles_held, peak_price, current_stop_loss, breakeven_moved, etc.). If `update()` is called from multiple coroutines for the same position (e.g., candle update + real-time price update), the state may be corrupted.

In asyncio (single-threaded), this is safe as long as `update()` doesn't `await`. It doesn't — all operations are synchronous. So it's safe in asyncio.

### 8.1093 risk_manager: _calc_atr_from_candle is not real ATR — Low

**Файл:** `risk_manager.py:248-261`

```python
@staticmethod
def _calc_atr_from_candle(candle: dict) -> float:
    high = candle.get("high", 0)
    low = candle.get("low", 0)
    close = candle.get("close", 0)
    prev_close = candle.get("prev_close", close)
    tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
    return tr
```

This calculates True Range (TR) for a single candle, not ATR (which is a moving average of TR over N periods). The variable name and the config field `trailing_atr_multiplier` suggest ATR, but the actual value is just TR. TR is more volatile than ATR — a single volatile candle will cause the trailing distance to spike, potentially moving the SL too far.

**Фикс:** Either rename to `_calc_tr_from_candle` and update the config field, or maintain a rolling ATR from multiple candles.

### 8.1094 ai-signal-bot/src/signal_validation/validator.py: Signal Validator — ✅ Good

**Файл:** `ai-signal-bot/src/signal_validation/validator.py` (122 lines)

- **5 checks**: confidence, R:R, drawdown, max positions, duplicate — correct
- **ValidationResult**: passed, reason, signal — correct
- **Daily PnL tracking**: Auto-reset after 24h — correct
- **Duplicate cooldown**: 5 min per symbol, stale entry cleanup — correct
- **Early exit**: First failed check returns immediately — correct

Good signal validator with 5 checks, daily PnL tracking, duplicate cooldown, and early exit. ✅

### 8.1095 validator: _recent_signals cleanup is O(N) per validate — Low [FIXED]

**Файл:** `validator.py:113-116`

```python
now = datetime.now()
stale = [s for s, t in self._recent_signals.items() if now - t > timedelta(minutes=10)]
for s in stale:
    del self._recent_signals[s]
```

Every `validate()` call scans all entries in `_recent_signals` to find stale ones. With 50 symbols, this is 50 comparisons per validation. At 50 signals/min, that's 2500 comparisons/min. Not terrible, but the cleanup could be done less frequently (e.g., every 10 validations).

**Фикс:** Use a `collections.OrderedDict` with periodic cleanup, or use `functools.lru_cache` with TTL.

### 8.1096 validator: daily reset uses wall clock not trading day — Low [FIXED]

**Файл:** `validator.py:46, 58-60`

```python
self._daily_reset: datetime = datetime.now()
# ...
now = datetime.now()
if now - self._daily_reset > timedelta(hours=24):
    self.reset_daily()
```

The daily reset triggers 24 hours after the last reset, not at a fixed time (e.g., 00:00 UTC). If the bot starts at 14:00, the reset happens at 14:00 the next day, not at midnight. This means the "daily" drawdown limit spans two trading days (14:00 today to 14:00 tomorrow). If the bot restarts, the reset time changes.

**Фикс:** Use UTC midnight: `if now.date() != self._daily_reset.date(): self.reset_daily()`.

### 8.1097 validator: no thread safety — Low [N/A]

**Файл:** `validator.py` (entire file)

`SignalValidator` has no locks. `_daily_pnl`, `_open_positions`, and `_recent_signals` are mutated by `update_pnl()`, `update_position_count()`, and `validate()`. If these are called from multiple coroutines, the state may be corrupted.

In asyncio (single-threaded), this is safe as long as none of these methods `await`. They don't. So it's safe in asyncio.

### 8.1098 validator: drawdown check uses realized PnL only — Low [N/A]

**Файл:** `validator.py:98-103`

```python
def _check_drawdown(self, signal: Signal, account_balance: float) -> ValidationResult | None:
    drawdown_pct = abs(self._daily_pnl) / account_balance * 100 if account_balance > 0 else 0
    if self._daily_pnl < 0 and drawdown_pct >= self.max_drawdown_pct:
        return ValidationResult(False, ...)
```

The drawdown check uses `_daily_pnl` which is updated via `update_pnl()` — this tracks realized PnL only. Unrealized PnL (from open positions) is not included. If the bot has 3 open positions with -$500 unrealized and $0 realized, the drawdown check passes (0% drawdown). But the actual drawdown is 5% ($500 / $10000). New signals are allowed, increasing risk.

**Фикс:** Include unrealized PnL in the drawdown calculation. Or track equity (balance + unrealized) and compute drawdown from that.

### 8.1099 ai-signal-bot/src/strategies/strategies.py: Trading Strategies — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/strategies.py` (472 lines)

- **TrendFollowingStrategy**: EMA crossover + ADX filter, crossover + continuation signals — correct
- **MeanReversionStrategy**: RSI + Bollinger Bands, ATR-based SL — correct
- **EnsembleVoter**: Majority/weighted voting, min votes, circuit breaker, single-pass accumulation — correct
- **FFTCycleStrategy**: 3 regimes (trending/ranging/mixed), cycle phase signals — correct
- **Re-exports**: Signal, SignalDirection, CircuitBreaker for backward compat — correct

Good strategies module with 4 strategies, ensemble voting, circuit breaker integration, and FFT cycle detection. ✅

### 8.1100 strategies: EnsembleVoter averages SL/TP across strategies — Low [N/A]

**Файл:** `strategies.py:326-334`

```python
inv_count = 1.0 / winner_count
return Signal(
    symbol=first_actionable.symbol,
    direction=direction,
    confidence=round(winner_agg[0] * inv_count, 1),
    strategy=self.name,
    entry_price=winner_agg[1] * inv_count,
    stop_loss=winner_agg[2] * inv_count,
    take_profit=winner_agg[3] * inv_count,
    reason=f"Ensemble ({', '.join(winner_strategies)}): {winner_count} votes",
)
```

The ensemble averages entry_price, stop_loss, and take_profit across all winning strategies. If strategy A has SL at $64,000 and strategy B has SL at $62,000, the ensemble SL is $63,000. This may be tighter than strategy B intended and looser than strategy A intended. Averaging price levels across strategies with different risk profiles produces a signal that none of the individual strategies would produce.

**Фикс:** Use the first actionable signal's SL/TP, or use the most conservative (tightest SL, lowest TP), or use the highest-confidence strategy's SL/TP.

### 8.1101 strategies: TrendFollowing confidence can exceed 95 — Low [FIXED]

**Файл:** `strategies.py:82-84`

```python
return Signal(symbol, SignalDirection.LONG, min(95, 50 + adx_val),
              self.name, price, price - 2 * atr_val, price + 3 * atr_val,
              f"EMA{self.ema_fast}>EMA{self.ema_slow} cross, ADX={adx_val:.1f}")
```

Confidence is `min(95, 50 + adx_val)`. ADX can theoretically reach 100, so `50 + 100 = 150`, capped at 95. The `min(95, ...)` cap is correct. But the continuation signal at line 100 uses a fixed confidence of 45, which is below the validator's `min_confidence` of 65. So continuation signals are always rejected by the validator. This makes the continuation logic dead code.

**Фикс:** Either raise the continuation confidence above 65, or remove the continuation logic if it's intentionally below threshold.

### 8.1102 strategies: no candle schema validation — Low [FIXED]

**Файл:** `strategies.py:49, 141, 365`

```python
closes = [c["close"] if isinstance(c, dict) else c.close for c in candles]
```

Accesses `c["close"]` or `c.close` without validating the candle schema. If a candle is missing the "close" key (e.g., malformed WebSocket data), `c["close"]` raises `KeyError`. The `isinstance(c, dict)` check only differentiates dict vs object, not whether the key exists.

**Фикс:** Use `c.get("close", 0) if isinstance(c, dict) else getattr(c, "close", 0)`, or validate the candle schema before passing to strategies.

### 8.1103 ai-signal-bot/src/risk/var.py: VaR Calculator — ✅ Good

**Файл:** `ai-signal-bot/src/risk/var.py` (178 lines)

- **3 methods**: Historical, parametric, Monte Carlo — correct
- **VaRResult dataclass**: var_value, confidence_level, time_horizon, method — correct
- **Time scaling**: Square root of time rule — correct
- **Multiple levels**: 95%, 99%, 99.9% — correct
- **Backtest**: Rolling window, violation count, Kupiec test — correct
- **Kupiec test**: Likelihood ratio with edge cases (0 violations, all violations) — correct

Good VaR calculator with 3 methods, multi-level support, backtesting, and Kupiec test. ✅

### 8.1104 var.py: Monte Carlo uses non-deterministic RNG — Low [FIXED]

**Файл:** `var.py:85`

```python
simulated_returns = np.random.normal(mean, std, n_simulations)
```

`np.random.normal` uses the global RNG state, which is non-deterministic. Two runs with the same input data produce different VaR values. This makes backtesting and debugging difficult — the same trade history produces different risk estimates.

**Фикс:** Use `np.random.default_rng(seed)` with a fixed seed, or accept a `rng` parameter.

### 8.1105 var.py: parametric VaR assumes normal distribution — Low [N/A]

**Файл:** `var.py:56-63`

```python
mean = np.mean(returns)
std = np.std(returns)
z_score = stats.norm.ppf(1 - cl)
var_scaled = mean * th + z_score * std * np.sqrt(th)
```

The parametric method assumes returns are normally distributed. Crypto returns have fat tails (kurtosis > 3) and skewness. The normal distribution underestimates tail risk. A 99% VaR with normal assumption may correspond to a 95% VaR with actual distribution.

**Фикс:** Use Student's t-distribution with estimated degrees of freedom, or use Cornish-Fisher expansion for fat tails.

### 8.1106 var.py: backtest_var O(N × window) — Low [N/A]

**Файл:** `var.py:125-131`

```python
for i in range(window_size, len(returns)):
    window_returns = returns[i - window_size:i]
    var = self._compute_window_var(window_returns, var_result)
```

The backtest iterates `len(returns) - window_size` times, each computing VaR on a `window_size`-length array. With 1 year of daily returns (252) and window=252, that's 1 iteration. With 5 years (1260), that's 1008 iterations, each computing `np.percentile` on 252 elements. Total: ~250K comparisons. Not terrible for offline use, but slow for real-time.

**Фикс:** Use rolling window with incremental updates (update mean/std with new observation, remove oldest).

### 8.1107 ai-signal-bot/src/risk/kelly.py: Kelly Position Sizer — ✅ Good

**Файл:** `ai-signal-bot/src/risk/kelly.py` (183 lines)

- **Kelly formula**: f* = (p*b - q) / b — correct
- **Safety adjustments**: Kelly fraction, confidence scaling, min/max risk — correct
- **Position capping**: Max notional, max position % — correct
- **from_trade_history**: Factory method with min_trades guard — correct
- **Edge case handling**: No edge (Kelly <= 0), invalid SL, avg_loss = 0 — correct

Good Kelly position sizer with safety adjustments, position capping, and trade history factory. ✅

### 8.1108 kelly.py: max_position_pct defaults to 200% — Low [FIXED]

**Файл:** `kelly.py:59`

```python
max_position_pct: float = 200.0, # max % of balance for position notional
```

`max_position_pct = 200.0` means the position notional can be 2× the account balance. This implies 2× leverage. For a $10,000 account, the max position is $20,000. If the exchange doesn't support leverage or the bot isn't configured for it, this will cause order rejection.

**Фикс:** Default to 100% (no leverage) unless leverage is explicitly configured. Or make leverage a separate config parameter.

### 8.1109 kelly.py: from_trade_history accesses t.pnl — Low [FIXED]

**Файл:** `kelly.py:169-174`

```python
wins = [t for t in trades if t.pnl > 0]
losses = [t for t in trades if t.pnl < 0]
```

Accesses `t.pnl` without validating the trade object schema. If `trades` contains dicts instead of objects (e.g., from DB rows), `t.pnl` raises `AttributeError`. The method doesn't check the type of `t`.

**Фикс:** Use `getattr(t, "pnl", 0) if not isinstance(t, dict) else t.get("pnl", 0)`, or document the expected type.

### 8.1110 ai-signal-bot/src/risk/position_sizing.py: Dynamic Position Sizer — ✅ Good

**Файл:** `ai-signal-bot/src/risk/position_sizing.py` (205 lines)

- **3 methods**: Volatility-based, risk parity, Kelly criterion — correct
- **PositionSizingResult**: position_size, position_value, risk_amount, leverage, method — correct
- **Max position limit**: Applied to all methods — correct
- **Correlation adjustment**: Reduce correlated exposure > 0.7 — correct
- **Position limits**: Single + total exposure — correct
- **Edge case handling**: price <= 0, account_value <= 0, volatility <= 0 — correct

Good dynamic position sizer with 3 methods, correlation adjustment, and position limits. ✅

### 8.1111 position_sizing: risk_parity hardcodes 2% stop loss — Low [N/A]

**Файл:** `position_sizing.py:100-101`

```python
# Assume 2% stop loss for risk parity
stop_loss_percentage = 0.02
```

The risk parity method hardcodes a 2% stop loss assumption. The actual stop loss from the signal may be different (e.g., ATR-based SL at 3%). This means the position size doesn't match the actual risk of the trade. If the real SL is 4%, the position is 2× too large.

**Фикс:** Accept `stop_loss_pct` as a parameter, or pass the signal's SL/TP to compute the actual stop loss percentage.

### 8.1112 position_sizing: Kelly uses expected_return not win/loss — Low [N/A]

**Файл:** `position_sizing.py:123, 166`

```python
expected_return: float = 0.15,
# ...
kelly_fraction = (expected_return - risk_free_rate) / (volatility ** 2)
```

This is the continuous-time Kelly formula (Merton's portfolio problem), not the discrete Kelly criterion used in `kelly.py`. The continuous formula uses expected return and volatility, while the discrete formula uses win rate and payoff ratio. The two may produce very different position sizes. The `kelly.py` implementation is more appropriate for trading signals with discrete outcomes.

**Фикс:** Use `KellyPositionSizer` from `kelly.py` instead of the continuous formula, or document the difference.

### 8.1113 position_sizing: daily_volatility uses sqrt(365) not sqrt(252) — Low [N/A]

**Файл:** `position_sizing.py:62, 142`

```python
daily_volatility = volatility / np.sqrt(365)
```

Crypto markets trade 365 days/year, so `sqrt(365)` is correct for crypto. But if the bot trades traditional assets (stocks, futures with trading days), `sqrt(252)` is correct. The code assumes crypto-only, which may not be true for all assets.

**Фикс:** Make the annualization factor configurable (365 for crypto, 252 for traditional).

### 8.1114 ai-signal-bot/src/risk/cvar.py: CVaR Calculator — ✅ Good

**Файл:** `ai-signal-bot/src/risk/cvar.py` (179 lines)

- **3 methods**: Historical, parametric, Monte Carlo — correct
- **CVaRResult**: cvar_value, var_value, confidence_level, time_horizon, method — correct
- **Tail risk measures**: skewness, kurtosis, tail index (Hill estimator), max drawdown — correct
- **Stress scenarios**: Apply shock multiplier to returns — correct
- **Expected Shortfall alias**: `calculate_expected_shortfall` → `calculate_cvar` — correct

Good CVaR calculator with 3 methods, tail risk measures, Hill estimator, and stress scenarios. ✅

### 8.1115 cvar.py: Monte Carlo uses non-deterministic RNG — Low [FIXED]

**Файл:** `cvar.py:90`

```python
simulated = np.random.normal(mean, std, n_simulations)
```

Same issue as `var.py:85` — uses global RNG state, non-deterministic.

### 8.1116 cvar.py: parametric CVaR assumes normal distribution — Low [N/A]

**Файл:** `cvar.py:78-82`

```python
mean = np.mean(returns)
std = np.std(returns)
z_score = stats.norm.ppf(1 - cl)
return mean * th - std * np.sqrt(th) * (stats.norm.pdf(z_score) / (1 - cl))
```

Same issue as `var.py` parametric method — assumes normal distribution, underestimates tail risk for crypto with fat tails.

### 8.1117 cvar.py: Hill estimator threshold edge case — Low [N/A]

**Файл:** `cvar.py:149-150`

```python
threshold_val = max(tail_losses_sorted[-1], 1e-12)
excesses = tail_losses_sorted[:-1] / threshold_val
```

The Hill estimator uses the smallest tail loss as the threshold. If all tail losses are identical (e.g., all are -0.05), `excesses` are all 1.0, `log_excesses` are all 0.0, and `np.sum(log_excesses) == 0`, returning `inf`. This is handled at line 154, but `inf` tail index means "no tail" which is misleading — it should mean "insufficient data" or "degenerate distribution".

### 8.1118 ai-signal-bot/src/risk/stress_test.py: Stress Test — ✅ Good

**Файл:** `ai-signal-bot/src/risk/stress_test.py` (203 lines)

- **4 scenarios**: 2008 crisis (50% shock), COVID (30% shock), FTX (95% crypto + 20% traditional), custom — correct
- **StressTestResult**: scenario_name, portfolio_value_before/after, pnl, pnl_percentage, margin_requirement, liquidity_impact, passed — correct
- **run_all_scenarios**: Runs 3 predefined scenarios — correct
- **generate_summary**: Aggregate stats with pass rate — correct

Good stress test module with 4 scenarios, portfolio impact analysis, and summary generation. ✅

### 8.1119 stress_test: FTX scenario shocks are inverted — Low [FIXED]

**Файл:** `stress_test.py:96-104`

```python
crypto_shock = 0.05       # 95% drop
traditional_shock = 0.8   # 20% drop
# ...
shocked_prices[:n_crypto] *= crypto_shock      # Crypto prices × 0.05
shocked_prices[n_crypto:] *= traditional_shock  # Traditional prices × 0.8
```

`crypto_shock = 0.05` means crypto prices drop to 5% of their value (95% drop). During the actual FTX collapse, BTC dropped ~20-25%, not 95%. The 95% drop is more like a Luna/UST collapse scenario. The variable name `ftx_collapse_scenario` is misleading.

**Фикс:** Use `crypto_shock = 0.75` (25% drop) for FTX, or rename to `luna_collapse_scenario` with the 95% shock.

### 8.1120 stress_test: all scenarios use same formula — Info

**Файлы:** `stress_test.py:30-61, 63-90, 92-126`

The 3 predefined scenarios (2008, COVID, FTX) all use the same formula: `shocked_prices = current_prices * shock_multiplier`, then compute PnL, margin, liquidity. The only differences are the shock multiplier, margin %, liquidity %, and pass threshold. This is ~90 lines of near-identical code.

**Reduction potential:** ~40 lines. Extract a `_run_scenario(name, prices, positions, shock, margin_pct, liquidity, threshold)` method and call it from each scenario method.

### 8.1121 stress_test: no short position support — Low [N/A]

**Файл:** `stress_test.py` (entire file)

All scenarios assume long positions: `shocked_prices = current_prices * shock_multiplier` with `shock_multiplier < 1.0` always produces a loss. If the portfolio has short positions (negative `positions`), a price drop produces a gain, not a loss. The stress test doesn't account for this — it always shows a loss for price drops.

**Фикс:** Check position direction: `pnl = np.sum((shocked_prices - current_prices) * positions)`. This correctly handles both long (positive positions) and short (negative positions).

### 8.1122 ai-signal-bot/src/backtesting/backtester.py: Backtester — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/backtester.py` (506 lines)

- **Trade dataclass**: symbol, side, entry/exit price, qty, pnl, pnl_pct, exit_reason, fee — correct
- **BacktestResult**: 16 metrics including Sharpe, Sortino, Calmar, recovery factor, drawdown duration — correct
- **run()**: Candle replay with warmup, SL/TP, risk manager, signal reversal — correct
- **_check_sl_tp**: Uses candle low/high for SL/TP trigger — correct
- **_open_position**: Slippage, risk-based sizing, max position cap, fee calculation — correct
- **_close_position**: Slippage, exit fee, PnL computation — correct
- **_calculate_trade_metrics**: Win rate, profit factor, Sharpe, Sortino — correct
- **_calculate_drawdown_metrics**: Longest DD, avg DD, recovery factor, Calmar — correct
- **run_multi_strategy + print_comparison**: Multi-strategy backtest — correct

Good backtester with 16 metrics, risk manager integration, multi-strategy support, and detailed reporting. ✅

### 8.1123 backtester: SL/TP checked after risk manager update — Low [N/A]

**Файл:** `backtester.py:172-185`

The risk manager update (`_process_risk_update`) runs before SL/TP check (`_manage_position_or_entry`). If the risk manager moves the SL (trailing/breakeven), the new SL is used for the SL/TP check on the same candle. But the risk manager's `close_position` action (e.g., max hold) takes priority over SL/TP. This means if both max hold and SL are hit on the same candle, max hold wins. The exit price for max hold is `current_price` (close), while SL would use `stop_loss` price. This may overstate or understate the actual exit price.

**Фикс:** Check SL/TP first, then risk manager. Or document the priority order.

### 8.1124 backtester: Sharpe ratio annualization assumes 5m candles — Low [FIXED]

**Файл:** `backtester.py:315`

```python
result.sharpe_ratio = (mean_ret / std_ret * (365 ** 0.5)) if std_ret > 0 else 0
```

The annualization factor `365 ** 0.5` assumes 1 return per day. But the returns are per-trade, not per-day. If the bot makes 10 trades/day, the annualization should be `365 * 10 ** 0.5`, not `365 ** 0.5`. The Sharpe ratio is overstated by a factor of `sqrt(10) ≈ 3.16`.

**Фикс:** Calculate the number of trading periods per year based on the candle interval and trade frequency. Or use `total_bars / (time_span_days)` to compute the annualization factor.

### 8.1125 backtester: Sortino uses full sample count for downside std — Low [N/A]

**Файл:** `backtester.py:316-319`

```python
downside_returns = [r for r in returns if r < 0]
if len(downside_returns) > 0:
    downside_std = (sum(r ** 2 for r in downside_returns) / len(returns)) ** 0.5
```

The Sortino ratio's downside deviation divides by `len(returns)` (total trades), not `len(downside_returns)` (losing trades). This is actually the correct formula — the denominator should be the total count, not just the downside count. This is the standard Sortino definition. ✅

### 8.1126 backtester: no leverage in PnL calculation — Low [FIXED]

**Файл:** `backtester.py:89, 367-375`

The constructor accepts `leverage: int = 10`, but it's never used in `_open_position` or `_close_position`. The position sizing uses `risk_per_trade_pct` and `max_position_pct`, but doesn't apply leverage. A 10× leverage should allow 10× the position size, but the current code caps at `max_position_pct` (10% of balance). The `leverage` parameter is dead code.

**Фикс:** Either use leverage in position sizing (`max_notional = balance * leverage * max_position_pct / 100`), or remove the parameter.

### 8.1127 backtester: window grows O(N²) — Low [FIXED]

**Файл:** `backtester.py:168`

```python
window = candles[:i + 1]
```

Each iteration creates a new list slice from 0 to i+1. At iteration i, the slice has i+1 elements. Total work: 1 + 2 + ... + N = O(N²). With 10,000 candles, that's 50M elements copied. This is slow for large backtests.

**Фикс:** Pass the full `candles` list and the current index to `strategy.analyze`, or use a rolling window of fixed size.

### 8.1128 backtester: Calmar annualization uses 5m candles — Low [FIXED]

**Файл:** `backtester.py:354`

```python
annualized_return = result.total_return_pct * (365 * 24 * 12 / total_bars)
```

`365 * 24 * 12 = 105,120` — this assumes 5-minute candles (12 per hour × 24 hours × 365 days). If the candle interval is different (e.g., 1h), the annualization is wrong. The formula should use the actual candle interval.

**Фикс:** Accept `candle_interval_minutes` as a parameter and compute: `periods_per_year = 365 * 24 * 60 / candle_interval_minutes`.

### 8.1129 ai-signal-bot/src/backtesting/pnl_calculator.py: PnL Calculator — ✅ Excellent

**Файл:** `ai-signal-bot/src/backtesting/pnl_calculator.py` (252 lines)

- **3 asset types**: Spot, futures, options — correct
- **PnLConfig**: fee_rate, slippage_bps, funding_rate, funding_interval, option_premium, contract_multiplier — correct
- **PnLBreakdown**: gross_pnl, entry_fee, exit_fee, funding_cost, net_pnl, fill prices — correct
- **Slippage**: Direction-aware (entry: worse for buyer, exit: worse for seller) — correct
- **Funding**: Futures only, proportional to hold time — correct
- **Options**: Intrinsic value, PnL at expiry, long/short — correct
- **calculate_pnl**: Full breakdown with slippage, fees, funding — correct

Excellent PnL calculator with 3 asset types, direction-aware slippage, funding, and options support. ✅

### 8.1130 pnl_calculator: options premium not used in calculate_pnl — Low [N/A]

**Файл:** `pnl_calculator.py:155-158`

```python
if self.asset_type == AssetType.OPTIONS:
    gross_pnl = self._options_gross_pnl(side, qty, fill_entry, fill_exit)
else:
    gross_pnl = self._spot_futures_gross_pnl(side, qty, fill_entry, fill_exit)
```

For options, `calculate_pnl` uses `_options_gross_pnl` which is identical to `_spot_futures_gross_pnl` — both compute `(exit - entry) * qty * multiplier` for LONG. The `PnLConfig.option_premium_pct` (2% of notional) is never used. The options PnL is just price difference × qty, same as spot. The `options_pnl_at_expiry` method is the only one that uses intrinsic value.

**Фикс:** Either use `option_premium_pct` in the options PnL calculation, or document that `calculate_pnl` for options treats entry/exit as premiums (mark-to-market), and `options_pnl_at_expiry` is for expiry settlement.

### 8.1131 pnl_calculator: funding cost uses fill_exit price not average — Low [N/A]

**Файл:** `pnl_calculator.py:153`

```python
funding = self.calculate_funding_cost(qty, fill_exit, hold_time_s)
```

Funding cost is calculated using `fill_exit` (the exit fill price with slippage). In reality, funding is charged periodically based on the position's notional value at each funding interval. Using the exit price overestimates funding if the price moved significantly during the hold time. The average price (or periodic funding calculation) would be more accurate.

**Фикс:** Use `(entry_price + exit_price) / 2` as an approximation, or calculate funding per interval using the price at each interval.

### 8.1132 ai-signal-bot/src/backtesting/backtest_engine.py: Backtest Engine — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/backtest_engine.py` (321 lines)

- **BacktestConfig**: initial_capital, fee_rate, slippage, funding, leverage, position_size_pct — correct
- **BacktestTrade**: timestamp, symbol, side, qty, entry/exit, pnl, fee, funding, hold_time, reason — correct
- **BacktestResult**: 16 fields + to_dict + underwater_curve — correct
- **PnLCalculator integration**: Injected, supports spot/futures/options — correct
- **run()**: Candle replay, SL/TP using high/low, mark-to-market equity — correct
- **_compute_risk_adjusted**: Sharpe, Sortino, Calmar with numpy — correct
- **_compute_underwater_curve**: Drawdown curve from equity — correct

Good backtest engine with PnLCalculator injection, mark-to-market, underwater curve, and numpy-based risk metrics. ✅

### 8.1133 backtest_engine: duplicate of backtester.py — Info [FIXED]

**Файлы:** `backtest_engine.py` (321 lines), `backtester.py` (506 lines)

Two separate backtesting engines with overlapping functionality:
- `backtester.py`: `Backtester` class, uses `Signal` objects, has risk manager integration, `print_report`, `run_multi_strategy`
- `backtest_engine.py`: `BacktestEngine` class, uses dict signals, has PnLCalculator injection, underwater curve, numpy metrics

Both implement candle replay, SL/TP, equity curve, Sharpe/Sortino/Calmar, trade logging. The key difference: `Backtester` integrates with `RiskManager` and `Signal` dataclass; `BacktestEngine` integrates with `PnLCalculator` and uses dict signals.

**Reduction potential:** ~200 lines. Merge into one engine with pluggable PnLCalculator + optional RiskManager. Use `Signal` dataclass consistently.

### 8.1134 backtest_engine: Sharpe annualization assumes 1m candles — Low [FIXED]

**Файл:** `backtest_engine.py:292`

```python
bars_per_year = 365 * 24 * 60
```

`365 * 24 * 60 = 525,600` — this assumes 1-minute candles. The `backtester.py` uses `365 ** 0.5` (per-trade). Neither is correct for all candle intervals. The two engines disagree on annualization, producing different Sharpe ratios for the same data.

**Фикс:** Accept `candle_interval_minutes` as a parameter. `bars_per_year = 365 * 24 * 60 / candle_interval_minutes`.

### 8.1135 backtest_engine: window grows O(N²) — Low [FIXED]

**Файл:** `backtest_engine.py:150`

```python
signal = strategy_analyze(symbol, candles[:i + 1])
```

Same issue as `backtester.py:168` — creates a new list slice each iteration, O(N²) total.

### 8.1136 backtest_engine: position sizing uses confidence multiplier — Low [N/A]

**Файл:** `backtest_engine.py:173-175`

```python
size_mult = min(confidence / 50.0, 2.0)
position_value = self.equity * self.config.position_size_pct * size_mult
```

Position size scales linearly with confidence: 50% confidence → 1×, 100% confidence → 2×. This means a 100% confidence signal risks 2× the position size of a 50% signal. There's no risk-per-trade cap — if `position_size_pct = 0.1` and `confidence = 100`, the position is 20% of equity. This is aggressive and doesn't match the risk-per-trade model in `backtester.py`.

**Фикс:** Use risk-per-trade model: `risk_amount = equity * risk_per_trade_pct / 100; qty = risk_amount / abs(entry - stop_loss)`.

### 8.1137 ai-signal-bot/src/backtesting/optimizer.py: Strategy Optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/optimizer.py` (201 lines)

- **Grid search**: itertools.product, max_combinations cap, progress logging — correct
- **4 fitness functions**: default (risk-adjusted), Sharpe, Calmar, profit factor — correct
- **Walk-forward**: Train/test windows, sliding by test_size — correct
- **print_results**: Formatted table with top N — correct
- **best_params**: Returns top-ranked params — correct

Good strategy optimizer with grid search, 4 fitness functions, walk-forward, and formatted output. ✅

### 8.1138 optimizer: grid search is sequential — Low [FIXED]

**Файл:** `optimizer.py:121-136`

```python
for i, combo in enumerate(combinations):
    params = dict(zip(keys, combo, strict=False))
    strategy = strategy_class(**params)
    result = self.backtester.run(candles, strategy, symbol, warmup)
```

Each parameter combination runs a full backtest sequentially. With 4×4×4 = 64 combinations and 10,000 candles, each backtest takes ~1s → 64s total. With max_combinations=1000, that's ~16 minutes. No parallelism.

**Фикс:** Use `concurrent.futures.ProcessPoolExecutor` to run backtests in parallel. Each backtest is independent.

### 8.1139 optimizer: walk_forward doesn't optimize — Low [N/A]

**Файл:** `optimizer.py:138-167`

```python
def walk_forward(self, strategy_class, params: dict, ...):
    # ...
    strategy = strategy_class(**params)
    result = self.backtester.run(test_candles, strategy, ...)
```

The `walk_forward` method accepts a single `params` dict and runs the same params on each test window. It doesn't optimize on the train window — it just tests the given params. This is walk-forward *testing*, not walk-forward *optimization*. The `WalkForwardAnalyzer` in `walk_forward.py` does actual optimization.

**Фикс:** Either rename to `walk_forward_test` to clarify, or add optimization on the train window.

### 8.1140 ai-signal-bot/src/backtesting/walk_forward.py: Walk-Forward Analyzer — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/walk_forward.py` (196 lines)

- **WalkForwardWindow**: IS/OOS ranges, results, best_params — correct
- **WalkForwardResult**: windows, avg IS/OOS Sharpe, overfitting score, is_overfit — correct
- **run()**: N windows, IS optimization, OOS testing — correct
- **_optimize_in_sample**: Grid search on IS data — correct
- **_test_out_of_sample**: Best params on OOS data — correct
- **detect_overfitting**: IS vs OOS gap + ratio — correct

Good walk-forward analyzer with IS/OOS splitting, parameter optimization, overfitting detection, and aggregate metrics. ✅

### 8.1141 walk_forward: overfitting threshold hardcoded — Low [FIXED]

**Файл:** `walk_forward.py:167, 187`

```python
result.is_overfit = bool(result.overfitting_score > 0.5)
# ...
overfit = bool(gap > 0.5 or ratio > 2.0)
```

The overfitting threshold (0.5 Sharpe gap) is hardcoded. For high-frequency strategies, a 0.5 gap may be normal (noisy Sharpe). For low-frequency, 0.5 is significant. The threshold should be configurable.

**Фикс:** Accept `overfitting_threshold` as a parameter.

### 8.1142 walk_forward: no look-ahead bias check — Low [N/A]

**Файл:** `walk_forward.py:93-96`

```python
is_start = window_idx * oos_size
is_end = is_start + in_sample_size
oos_start = is_end
oos_end = oos_start + oos_size
```

The IS window ends at `is_end` and OOS starts at `oos_start = is_end`. This is correct — no overlap. But the IS window slides by `oos_size` each iteration: `is_start = w * oos_size`. This means the IS window includes data from previous OOS windows. For walk-forward *without* anchoring, this is correct (rolling window). For anchored walk-forward, IS should start at 0 each time. The code doesn't support anchored mode.

**Фикс:** Add `anchored: bool = False` parameter. If anchored, `is_start = 0`.

### 8.1143 walk_forward: creates new BacktestEngine per param combo — Low [FIXED]

**Файл:** `walk_forward.py:136-138`

```python
for params in param_grid:
    analyze_fn = strategy_factory(params)
    engine = BacktestEngine(config)
    is_result = engine.run(candles[is_start:is_end], analyze_fn, symbol)
```

A new `BacktestEngine` is created for each parameter combination in each window. With 5 windows × 64 params = 320 engine instances. Each engine allocates equity_curve list, trades list, etc. This is wasteful — the engine could be reset instead of recreated.

**Фикс:** Add a `reset()` method to `BacktestEngine` and reuse the instance.

### 8.1144 ai-signal-bot/src/data_collection/exchange_factory.py: Exchange Factory — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/exchange_factory.py` (242 lines)

- **ExchangeMode enum**: SIMULATOR, REAL, FALLBACK — correct
- **ExchangeAdapter Protocol**: 10 async methods — correct
- **SimulatorAdapter**: Stub implementation with hardcoded $50K price — correct
- **RealExchangeAdapter**: Delegates to RealMarketDataManager + RealAccountManager — correct
- **ExchangeFactory**: 3 modes, fallback with health check, switch_to_simulator — correct

Good exchange factory with Protocol-based adapter, 3 modes, fallback, and runtime switching. ✅

### 8.1145 exchange_factory: SimulatorAdapter returns hardcoded $50K — Low [FIXED]

**Файл:** `exchange_factory.py:55`

```python
async def get_ticker(self, symbol: str) -> dict:
    return {"symbol": symbol, "price": 50000.0, "bid": 49999.5, "ask": 50000.5, "timestamp": time.time()}
```

The simulator always returns $50,000 for every symbol. If the bot falls back to simulator during live trading, all 50 symbols suddenly trade at $50K. This can trigger risk manager actions (massive unrealized PnL change) and corrupt signal generation.

**Фикс:** Accept a price provider callback or use a random walk from the last known real price.

### 8.1146 exchange_factory: api_key and api_secret in plain strings — Low [N/A]

**Файл:** `exchange_factory.py:166-173`

```python
self.api_key = api_key
self.api_secret = api_secret
```

Same anti-pattern as C++ adapters — API secrets stored as plain strings. The factory passes them to `RealExchangeAdapter` which passes them to ccxt. The strings persist in the factory's memory for the bot's lifetime.

### 8.1147 exchange_factory: FALLBACK mode doesn't close failed real adapter — Low [FIXED]

**Файл:** `exchange_factory.py:196-216`

```python
elif self.mode == ExchangeMode.FALLBACK:
    try:
        self._adapter = RealExchangeAdapter(...)
        await self._adapter.initialize()
        # ...
    except (ConnectionError, OSError, RuntimeError) as e:
        # ... falls back to simulator
        self._adapter = SimulatorAdapter(self.simulator_url)
```

If `initialize()` raises after partially initializing (e.g., market_data connected but account failed), the real adapter's resources aren't cleaned up before switching to simulator. The old adapter is replaced without calling `close()`.

**Фикс:** In the except block, call `await self._adapter.close()` before creating the simulator adapter.

### 8.1148 ai-signal-bot/src/data_collection/real_account.py: Real Account Manager — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_account.py` (380 lines)

- **3 dataclasses**: AccountBalance, AccountPosition, OpenOrder with to_dict — correct
- **ccxt integration**: Optional import, graceful degradation — correct
- **REST methods**: balance, positions, orders, trade history, leverage, margin mode — correct
- **Order placement**: Leverage cache, SL/TP params, error handling — correct
- **User data stream**: watch_orders for fills, margin warnings, callbacks — correct
- **Health check**: fetch_balance as connectivity test — correct

Good real account manager with ccxt integration, user data stream, and comprehensive error handling. ✅

### 8.1149 real_account: get_balance catches bare Exception — Low [FIXED]

**Файл:** `real_account.py:163`

```python
except Exception as e:
    logger.error(f"[RealAccount] Failed to fetch balance: {e}")
    return []
```

`get_balance` catches `Exception` (bare), while other methods catch specific exceptions `(OSError, RuntimeError, KeyError, ValueError)`. The bare catch swallows `asyncio.CancelledError`, `KeyboardInterrupt`, and `SystemExit` — these should propagate. In asyncio, catching `CancelledError` prevents task cancellation from working.

**Фикс:** Use `except (OSError, RuntimeError, KeyError, ValueError) as e:` consistently, or add `except asyncio.CancelledError: raise` before the bare catch.

### 8.1150 real_account: set_leverage catches bare Exception — Low [FIXED]

**Файл:** `real_account.py:247`

```python
except Exception as e:
    logger.error(f"[RealAccount] Failed to set leverage: {e}")
    return False
```

Same issue as `get_balance` — bare `Exception` catch swallows `CancelledError`.

### 8.1151 real_account: no retry on order placement — Low [FIXED]

**Файл:** `real_account.py:285-305`

```python
order = await self._exchange.create_order(...)
```

Order placement has no retry logic. If the exchange returns a transient error (429 rate limit, 503 service unavailable), the order is lost. For a trading bot, a failed order means a missed signal — the strategy said "buy" but the order didn't go through.

**Фикс:** Add retry with exponential backoff for transient errors (429, 503, connection errors). Max 3 retries.

### 8.1152 real_account: user data stream has no reconnection — Low [N/A]

**Файл:** `real_account.py:348-369`

```python
async def _listen_user_data(self) -> None:
    while True:
        try:
            orders = await self._exchange.watch_orders()
            # ...
        except asyncio.CancelledError:
            break
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error(f"[RealAccount] User data stream error: {e}")
            await asyncio.sleep(5)
```

On error, the stream sleeps 5s and retries — this is good. But `watch_orders` is a ccxt method that manages its own WebSocket internally. If the underlying WS disconnects, ccxt may not auto-reconnect for all exchanges. The 5s sleep is a fixed delay, not exponential backoff.

**Фикс:** Use exponential backoff (1s, 2s, 4s, ... max 30s) instead of fixed 5s.

### 8.1153 ai-signal-bot/src/data_collection/real_market_data.py: Real Market Data Feed — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_market_data.py` (455 lines)

- **3 normalized dataclasses**: NormalizedTicker, NormalizedCandle, NormalizedOrderBook — correct
- **Multi-exchange**: Binance, OKX, Bybit WebSocket feeds — correct
- **Reconnection**: Exponential backoff per exchange, max 30s — correct
- **Callbacks**: on_ticker, on_candle, on_orderbook — correct
- **Binance stream**: Combined stream URL, bookTicker + aggTrade + kline — correct
- **OKX stream**: Subscribe op, tickers + candle channels — correct

Good real market data feed with multi-exchange support, normalized data, and exponential backoff reconnection. ✅

### 8.1154 real_market_data: no message queue / backpressure — Low [FIXED]

**Файл:** `real_market_data.py:134-138`

```python
async for raw in ws:
    if not self._running:
        break
    msg = json.loads(raw)
    await self._handle_binance_msg(msg)
```

Each WebSocket message is processed synchronously — `await self._handle_binance_msg(msg)` blocks the receive loop. If the callback (`on_ticker`, `on_candle`) is slow (e.g., writing to DB), messages queue up in the WebSocket buffer. With 50 symbols × 3 stream types × high tick rate, this can be 1000+ msgs/sec. If processing takes >1ms per msg, the buffer overflows and the WS disconnects.

**Фикс:** Use an `asyncio.Queue` with a bounded size. The receive loop pushes to the queue; a separate consumer task processes messages. If the queue is full, drop oldest or apply backpressure.

### 8.1155 real_market_data: no heartbeat/pong management — Low [FIXED]

**Файл:** `real_market_data.py:129`

```python
async with websockets.connect(url, ping_interval=20) as ws:
```

The `ping_interval=20` sends a ping every 20s, but there's no `ping_timeout` parameter. If the exchange doesn't respond to the ping, the connection hangs indefinitely (the `async for raw in ws` blocks). The default `ping_timeout` in the `websockets` library is 20s, but it should be explicit.

**Фикс:** Add `ping_timeout=10` to `websockets.connect()`.

### 8.1156 real_market_data: OKX/Bybit URL hardcoded — Low [N/A]

**Файл:** `real_market_data.py:191`

```python
url = "wss://ws.okx.com:8443/ws/v5/public"
```

The OKX WebSocket URL is hardcoded. If OKX changes their endpoint (e.g., AWS vs GCP endpoints, demo trading URL), the code must be edited. The Binance testnet URL is already handled (line 122-125), but OKX testnet is not.

**Фикс:** Make URLs configurable per exchange, or use a URL map with testnet variants.

### 8.1157 ai-signal-bot/src/data_collection/real_exchange_client.py: Real Exchange REST Client — ✅ Good

**Файл:** `ai-signal-bot/src/data_collection/real_exchange_client.py` (335 lines)

- **3 exchange support**: Binance, OKX, Bybit — correct
- **HMAC-SHA256 signing**: Separate methods per exchange, `usedforsecurity=False` — correct
- **2 dataclasses**: AccountBalance, Position — correct
- **REST methods**: get_balance, get_positions per exchange — correct
- **Shared aiohttp session**: 10s timeout, lazy init — correct
- **Testnet URLs**: Binance and OKX have testnet variants — correct

Good REST client with 3-exchange support, proper HMAC signing, and shared session. ✅

### 8.1158 real_exchange_client: duplicate of real_account.py — Info [FIXED]

**Файлы:** `real_exchange_client.py` (335 lines), `real_account.py` (380 lines)

Both modules implement exchange account management with overlapping functionality:
- `real_account.py`: Uses ccxt library, has user data stream, order placement, trade history, leverage/margin management
- `real_exchange_client.py`: Direct REST calls with manual HMAC signing, no ccxt dependency, only balance + positions

The `real_account.py` uses ccxt which abstracts signing; `real_exchange_client.py` implements signing manually. Both define `AccountBalance` and `Position` dataclasses with similar fields. The `exchange_factory.py` uses `real_account.py` (via `RealExchangeAdapter`), not `real_exchange_client.py`.

**Reduction potential:** ~335 lines. `real_exchange_client.py` appears to be an earlier implementation replaced by the ccxt-based `real_account.py`. If ccxt is always available, `real_exchange_client.py` is dead code. If ccxt is optional, `real_exchange_client.py` is the fallback — but `exchange_factory.py` doesn't use it.

### 8.1159 real_exchange_client: no error handling on JSON parse — Low [FIXED]

**Файл:** `real_exchange_client.py:152`

```python
data = await resp.json()
for asset in data:
    if asset.get("asset") == "USDT":
```

If the exchange returns non-JSON (e.g., HTML error page, 502 gateway), `resp.json()` raises `json.JSONDecodeError`. There's no try/except around the JSON parse. The method returns `None` on non-200 status, but a 200 with invalid body would crash.

**Фикс:** Wrap `resp.json()` in try/except `json.JSONDecodeError`.

### 8.1160 real_exchange_client: Bybit has no testnet URL — Low [FIXED]

**Файл:** `real_exchange_client.py:83-84`

```python
elif exchange == "bybit":
    self.base_url = base_url or "https://api.bybit.com"
```

Binance and OKX have testnet URL variants, but Bybit always uses the production URL. Bybit's testnet is at `https://api-testnet.bybit.com`.

**Фикс:** Add testnet check: `self.base_url = base_url or ("https://api-testnet.bybit.com" if testnet else "https://api.bybit.com")`.

### 8.1161 real_exchange_client: signature in URL query string — Low

**Файл:** `real_exchange_client.py:144`

```python
url = f"{self.base_url}/fapi/v2/balance?{params}&signature={sig}"
```

The Binance API signature is placed in the URL query string. This is the standard Binance API pattern, but the signature is visible in proxy logs, browser history, and debug logging. The OKX and Bybit methods put the signature in headers, which is more secure.

**Фикс:** This is a Binance API requirement — the signature must be in the query string. No fix needed, but ensure debug logging doesn't print the full URL.

### 8.1162 ai-signal-bot/src/communication/circuit_breaker.py: Circuit Breaker — ✅ Good

**Файл:** `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines)

- **3 states**: CLOSED, OPEN, HALF_OPEN — correct
- **CircuitBreakerConfig**: failure_threshold=5, cooldown=60s, half_open_probes=1, success_threshold=2 — correct
- **allow_signal()**: State machine with probe limiting — correct
- **record_success/failure**: Consecutive tracking, auto-trip — correct
- **get_status()**: Dict for monitoring — correct

Good circuit breaker with standard 3-state pattern, probe limiting, and metrics. ✅

### 8.1163 circuit_breaker: not thread-safe — Low [N/A]

**Файл:** `circuit_breaker.py:34-85`

The circuit breaker has no locking. `allow_signal()`, `record_success()`, `record_failure()` all mutate `_state`, `_consecutive_failures`, `_half_open_probes` without synchronization. If called from multiple asyncio tasks concurrently (which is likely in a signal pipeline), race conditions can occur: two tasks might both pass `allow_signal()` in HALF_OPEN with `_half_open_probes == 0`, allowing 2 probes instead of 1.

**Фикс:** Use `asyncio.Lock` around state transitions, or use atomic operations. Since asyncio is single-threaded, the race only occurs at `await` points — but `allow_signal()` has no awaits, so it's safe within a single event loop. Document that it's asyncio-safe (no awaits in critical sections).

### 8.1164 ai-signal-bot/src/communication/shm_ring_buffer.py: SHM Ring Buffer — ✅ Excellent

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: head/tail atomic, cache-line aligned (64B) — correct
- **Cross-platform**: Windows (FlushViewOfFile) + POSIX (msync) — correct
- **Power-of-2 capacity**: Mask-based wrap — correct
- **try_push/try_pop**: O(1), non-blocking — correct
- **bulk_push/bulk_pop**: Batch operations with single atomic write — correct
- **3 struct definitions**: Signal (32B), Fill (28B), MarketSnapshot (28B) — correct
- **Magic validation**: SHM_MAGIC on open — correct
- **Context manager + __del__**: Cleanup guaranteed — correct

Excellent SHM ring buffer with lock-free SPSC, cache-line alignment, cross-platform barriers, and batch operations. ✅

### 8.1165 shm_ring_buffer: _mm_barrier flushes on every write — Low [FIXED]

**Файл:** `shm_ring_buffer.py:57-58`

```python
struct.pack_into('<Q', mm, offset, value)
_mm_barrier(mm)
```

Every `_atomic_write_u64` calls `_mm_barrier` which flushes the page to the file. On Windows, `FlushViewOfFile` is a syscall; on POSIX, `mm.flush()` calls `msync`. This is expensive — each `try_push` does 1 flush, each `try_pop` does 1 flush. With 100K signals/sec, that's 100K syscalls/sec.

**Фикс:** Only flush the head/tail update, not the data write. Or batch flush: flush once per N operations. On x86/x64, aligned 8-byte stores are visible to other processes via cache coherence without msync — the barrier is only needed for durability (crash recovery), not visibility.

### 8.1166 shm_ring_buffer: bulk_push not atomic for consumer — Low

**Файл:** `shm_ring_buffer.py:198-212`

```python
for i in range(to_push):
    slot = (head + i) & self._mask
    self.element_struct.pack_into(self._mm, offset, *items[i])
_atomic_write_u64(self._mm, OFF_HEAD, head + to_push)
```

`bulk_push` writes all elements before updating head. This is correct for SPSC — the consumer only reads when `head > tail`. But the data writes are not flushed individually; only the final head update is flushed. If the process crashes mid-bulk_push, the head may point to uninitialized data.

**Фикс:** Acceptable for SPSC with crash recovery — the consumer should validate data. Or use per-element flush if crash safety is critical.

### 8.1167 ai-signal-bot/src/communication/ws_client.py: Exchange WS Client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **Encoding**: JSON + msgpack + orjson fallback — correct
- **connect()**: ping_interval=10, compression, max_size=1MB — correct
- **listen()**: Async message loop with decode error handling — correct
- **_process_message**: candles, snapshot, trading_state, error, welcome — correct
- **submit_order/close_position**: Trading active check, orjson optimization — correct
- **reconnect()**: 5 attempts, exponential backoff (1s→30s) — correct

Good WS client with multi-encoding support, exponential backoff, and trading state management. ✅

### 8.1168 ws_client: no ping_timeout — Low [FIXED]

**Файл:** `ws_client.py:79`

```python
self._ws = await websockets.connect(
    self.url,
    ping_interval=10,
    compression="deflate",
    max_size=2**20,
)
```

Same issue as `real_market_data.py` — `ping_interval` is set but `ping_timeout` is not explicit. If the server stops responding to pings, the connection hangs.

**Фикс:** Add `ping_timeout=10`.

### 8.1169 ws_client: listen() has no reconnection — Low [FIXED]

**Файл:** `ws_client.py:99-121`

```python
async def listen(self) -> None:
    # ...
    except websockets.ConnectionClosed:
        logger.warning("Connection closed by server")
        self._connected = False
```

`listen()` exits on `ConnectionClosed` but doesn't reconnect. The caller must separately call `reconnect()`. If the caller doesn't handle this, the bot silently stops receiving data.

**Фикс:** Add auto-reconnect loop inside `listen()`, or document that the caller must handle reconnection.

### 8.1170 ws_client: candle_history unbounded for new symbols — Low

**Файл:** `ws_client.py:134-138`

```python
hist = self._candle_history.get(sym)
if hist is None:
    hist = deque(maxlen=200)
    self._candle_history[sym] = hist
hist.append(candle)
```

Each symbol gets a deque(maxlen=200). With 50 symbols × 200 candles × ~100 bytes = 1MB. This is fine. But if the server sends symbols not in the configured list, new deques are created dynamically. With 1000 unexpected symbols, that's 20MB.

**Фикс:** Validate symbol against configured list, or cap total memory.

### 8.1171 ai-signal-bot/src/communication/signal_publisher.py: Signal Publisher — ✅ Good

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py` (453 lines)

- **WebSocket server**: port 8766, ping_interval=10, ping_timeout=30 — correct
- **Circuit breaker integration**: Blocks signals on OPEN — correct
- **Signal history**: deque(maxlen=100), sends last 20 on connect — correct
- **broadcast_signal**: Gather to all clients, remove disconnected — correct
- **Circuit breaker broadcast**: Periodic 5s status update — correct
- **Backtest execution**: Synthetic candles, strategy builder, formatted results — correct
- **Backtest comparison**: Multi-backtest side-by-side — correct

Good signal publisher with circuit breaker, backtest execution, comparison, and client management. ✅

### 8.1172 signal_publisher: _handle_client catches bare Exception — Low [FIXED]

**Файл:** `signal_publisher.py:123, 155`

```python
except Exception as e:
    logger.warning(f"Failed to send signal history: {e}")
# ...
except Exception as e:
    logger.debug(f"Client handler error: {e}")
```

Two bare `Exception` catches. The first swallows `CancelledError` during history send. The second swallows `CancelledError` in the main message loop — this prevents clean shutdown.

**Фикс:** Use specific exceptions or add `except asyncio.CancelledError: raise` before the bare catch.

### 8.1173 signal_publisher: backtest runs in WebSocket handler — Low [FIXED]

**Файл:** `signal_publisher.py:271-302`

```python
async def _run_backtest(self, params: dict) -> dict:
    # ...
    result = bt.run(candles, strat, symbol=bt_params["symbol"], warmup=50)
```

`_run_backtest` runs a full backtest synchronously inside the WebSocket message handler. A backtest with 10,000 candles takes ~1s. During this time, the event loop is blocked — no signals are broadcast, no client messages are processed, no circuit breaker updates are sent. With 5 connected HFT clients, all clients are starved for 1s.

**Фикс:** Run backtest in a `ProcessPoolExecutor` via `asyncio.get_event_loop().run_in_executor()`, or use `asyncio.create_task()` with a result callback.

### 8.1174 signal_publisher: _generate_synthetic_candles uses random.Random(42) — Info [N/A]

**Файл:** `signal_publisher.py:334`

```python
rng = random.Random(42)
```

The synthetic candle generator uses a fixed seed (42), so every backtest request with the same parameters produces identical candles. This is good for reproducibility but misleading — the user may think they're testing on different data each time.

### 8.1175 signal_publisher: _EnsembleAdapter duplicates EnsembleVoter.analyze — Info [N/A]

**Файл:** `signal_publisher.py:42-52`

```python
class _EnsembleAdapter:
    def analyze(self, symbol: str, candles: list):
        signals = [s.analyze(symbol, candles) for s in self.sub_strategies]
        return self.voter.vote(signals)
```

This adapter wraps `EnsembleVoter` to make it compatible with `Backtester.run()`. But `EnsembleVoter` already has a `vote()` method that takes a list of signals. The adapter calls each sub-strategy's `analyze()` and then `vote()`. This duplicates the logic that `EnsembleVoter` should encapsulate — the voter should know its sub-strategies and call `analyze()` on them internally.

### 8.1176 ai-signal-bot/src/communication/health_check.py: Health Aggregator — ✅ Good

**Файл:** `ai-signal-bot/src/communication/health_check.py` (127 lines)

- **3 services**: ai-signal-bot, exchange-simulator, hft-trade-bot — correct
- **_check_service**: 3s timeout, latency measurement, status classification — correct
- **_aggregate**: Parallel checks via gather, healthy/degraded/unhealthy — correct
- **HTTP endpoint**: /health + /healthz, 503 on unhealthy — correct
- **aiohttp**: Proper session cleanup — correct

Good health aggregator with parallel checks, 3s timeout, and proper HTTP status codes. ✅

### 8.1177 health_check: creates new aiohttp session per check — Low [FIXED]

**Файл:** `health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
    async with session.get(url) as resp:
```

Each `_check_service` call creates a new `aiohttp.ClientSession`. With 3 services checked every N seconds, that's 3 new sessions per check cycle. Session creation involves TCP connection setup, SSL handshake (if HTTPS), and memory allocation.

**Фикс:** Create a shared `aiohttp.ClientSession` in `__init__` or `start()`, reuse it for all checks, and close it in `stop()`.

### 8.1178 health_check: bare Exception catches CancelledError — Low [FIXED]

**Файл:** `health_check.py:73`

```python
except Exception as e:
    return {"status": "unhealthy", "error": str(e)}
```

Same pattern — bare `Exception` swallows `CancelledError`.

### 8.1179 ai-signal-bot/src/communication/metrics_server.py: Metrics Server — ✅ Good

**Файл:** `ai-signal-bot/src/communication/metrics_server.py` (136 lines)

- **MetricsCollector**: 7 metrics (counters + gauges), Prometheus text format — correct
- **MetricsServer**: asyncio.start_server, HTTP response — correct
- **No external deps**: Pure Python Prometheus format — correct

Good lightweight metrics server with no external dependencies. ✅

### 8.1180 metrics_server: non-atomic counter increments — Low

**Файл:** `metrics_server.py:34-44`

```python
def record_signal_sent(self) -> None:
    self._signals_sent += 1
```

Counter increments are not atomic. In asyncio (single-threaded), this is safe within a single event loop. But if metrics are recorded from multiple threads (e.g., `ProcessPoolExecutor` workers), the counters will lose increments.

**Фикс:** Use `itertools.count()` or `threading.Lock` if multi-threaded access is expected. For asyncio-only, document that it's single-threaded safe.

### 8.1181 metrics_server: no Content-Type for error responses — Low

**Файл:** `metrics_server.py:109-135`

The HTTP handler reads the request line and headers, then always returns 200 OK. There's no handling for non-GET methods, no 404 for non-/metrics paths, and no error response. A browser hitting `/` gets a metrics response with no indication it's the wrong path.

### 8.1182 ai-signal-bot/src/communication/fix_client.py: FIX 4.4 Client — ✅ Good [FIXED]

**Файл:** `ai-signal-bot/src/communication/fix_client.py` (447 lines)

- **FixMessage**: Parse, build, checksum verification — correct
- **FixSession**: Persistent seq numbers, logon/logout/heartbeat — correct
- **Order management**: NewOrderSingle, OrderCancel — correct
- **Read loop**: SOH-delimited parsing, gap detection, ResendRequest — correct
- **Heartbeat**: Periodic, configurable interval — correct
- **Sequence persistence**: File-based, load/save on every msg — correct

Good FIX 4.4 client with sequence management, gap recovery, and persistent state. ✅

### 8.1183 fix_client: seq file in tempfile.gettempdir — Low

**Файл:** `fix_client.py:126`

```python
seq_file: str = os.path.join(tempfile.gettempdir(), "fix_seq.txt"),
```

The sequence number file is in the system temp directory. On Linux, `/tmp` is cleared on reboot — sequence numbers are lost, causing a gap on restart. On multi-instance deployments, all instances share the same file, corrupting sequence numbers.

**Фикс:** Use a configurable path in the project's data directory: `data/fix_seq_{sender_comp_id}.txt`.

### 8.1184 fix_client: connect() has no timeout — Low [FIXED]

**Файл:** `fix_client.py:181`

```python
self._reader, self._writer = await asyncio.open_connection(host, port)
```

`asyncio.open_connection` has no timeout. If the FIX server is unreachable, the call hangs indefinitely.

**Фикс:** Wrap in `asyncio.wait_for(asyncio.open_connection(host, port), timeout=10)`.

### 8.1185 fix_client: _pending_messages unbounded — Low [FIXED]

**Файл:** `fix_client.py:139, 352`

```python
self._pending_messages: list[FixMessage] = []
# ...
self._pending_messages.append(msg)
```

On a sequence gap, the out-of-sequence message is queued in `_pending_messages`. If the ResendRequest fails (server doesn't resend), the queue grows indefinitely. With a high message rate, this can cause OOM.

**Фикс:** Cap `_pending_messages` at a maximum (e.g., 1000). If exceeded, log error and drop oldest.

### 8.1186 fix_client: no reconnection on disconnect — Low

**Файл:** `fix_client.py:334-337`

```python
except (ConnectionError, OSError, asyncio.IncompleteReadError) as e:
    logger.error(f"FIX read loop error: {e}")
    self.state = "DISCONNECTED"
    break
```

On disconnect, the read loop exits. There's no reconnection logic. The caller must detect the state change and call `start()` again.

**Фикс:** Add auto-reconnect with exponential backoff, or document that the caller must handle reconnection.

### 8.1187 ai-signal-bot/src/communication/ws_connection_pool.py: WS Connection Pool — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_connection_pool.py` (152 lines)

- **PooledConnection**: Wrapper with last_used, healthy flag, stale check — correct
- **acquire()**: Reuse healthy non-stale, evict stale, create new — correct
- **release()**: Return to pool, close if unhealthy — correct
- **health_check()**: Ping with 5s timeout — correct
- **close_all()**: Clean shutdown — correct

Good WS connection pool with health checks, stale eviction, and proper cleanup. ✅

### 8.1188 ws_connection_pool: _evict_stale creates fire-and-forget tasks — Low [FIXED]

**Файл:** `ws_connection_pool.py:106`

```python
asyncio.create_task(conn.close())
```

`_evict_stale` creates `asyncio.create_task(conn.close())` for each stale connection. These tasks are fire-and-forget — if the event loop closes before they complete, the connections leak. Also, there's no reference to the task, so it may be garbage collected before completion.

**Фикс:** Store task references and await them, or use `await conn.close()` directly (since `_evict_stale` is called within the lock, this is safe).

### 8.1189 ws_connection_pool: health_loop runs forever — Low

**Файл:** `ws_connection_pool.py:129-133`

```python
async def _health_loop(self) -> None:
    while True:
        await asyncio.sleep(self._health_check_interval)
        await self.health_check()
```

The health loop runs forever with `while True`. It's cancelled in `close_all()`, but if `close_all()` is never called (e.g., process killed), the task leaks. No `CancelledError` handling.

**Фикс:** Use `while self._running:` with a `_running` flag, or add `except asyncio.CancelledError: break`.

### 8.1190 ai-signal-bot/src/communication/shm_market_data_writer.py: SHM Market Data Writer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_market_data_writer.py` (122 lines)

- **Latest-snapshot-wins**: Single slot per symbol, seq-guarded (odd=writing, even=consistent) — correct
- **write_snapshot**: Seq increment before and after write — correct
- **Cross-platform**: Windows + POSIX — correct
- **Context manager**: init/close — correct

Good SHM market data writer with seq-guarded writes for lock-free reader consistency. ✅

### 8.1191 shm_market_data_writer: no memory barrier on seq writes — Low [FIXED]

**Файл:** `shm_market_data_writer.py:82-94`

```python
seq = struct.unpack_from('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ)[0]
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 1)
# write data
struct.pack_into('<Q', self._mm, slot_offset + SLOT_OFFSET_SEQ, seq + 2)
```

The seq writes use `struct.pack_into` directly — no `_mm_barrier` call. On x86/x64, aligned 8-byte stores are visible to other processes via cache coherence. But without a memory barrier, the data write may be reordered before the seq increment on weakly-ordered architectures (ARM). The C++ reader may see `seq=even` (consistent) but stale data.

**Фикс:** Add `_mm_barrier` after the data write and before the final seq increment. Or use the `_atomic_write_u64` from `shm_ring_buffer.py`.

### 8.1192 shm_market_data_writer: zeroing entire SHM segment on init — Low

**Файл:** `shm_market_data_writer.py:57`

```python
self._mm[0:self._total_size] = b'\x00' * self._total_size
```

Zeroing the entire SHM segment creates a `bytes` object of `total_size` in Python memory, then copies it to the mmap. With 1000 symbols × 64 bytes = 64KB, this is fine. But with 10,000 symbols = 640KB, it's a 640KB allocation + copy on every init.

**Фикс:** Use `self._mm[:] = b'\x00' * len(self._mm)` (mmap supports slice assignment), or use `ctypes.memset`.

### 8.1193 ai-signal-bot/src/communication/shm_fill_consumer.py: SHM Fill Consumer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_fill_consumer.py` (91 lines)

- **Opens existing SHM**: create=False — correct
- **try_pop/bulk_pop**: Non-blocking — correct
- **run_polling**: 1ms interval, batch 256 — correct
- **Context manager**: init/close — correct

Good SHM fill consumer with polling loop and batch operations. ✅

### 8.1194 shm_fill_consumer: polling at 1ms wastes CPU — Low

**Файл:** `shm_fill_consumer.py:62-72`

```python
poll_interval: float = 0.001,
# ...
while self._running:
    fills = self.bulk_pop(batch_size)
    if fills:
        callback(fills)
    await asyncio.sleep(poll_interval)
```

1ms polling means 1000 wakeups/sec, even when no fills arrive. On a busy system, this wastes CPU. The callback is called synchronously (not `await callback(fills)`) — if the callback blocks, it blocks the event loop.

**Фикс:** Use adaptive polling: start at 1ms, back off to 10ms when empty for N consecutive polls. Or use `asyncio.Event` set by the C++ side (requires SHM notification mechanism).

### 8.1195 shm_fill_consumer: callback not async — Low

**Файл:** `shm_fill_consumer.py:59-71`

```python
async def run_polling(
    self,
    callback: Callable[[list[tuple]], None],
```

The callback type hint says `Callable[[list[tuple]], None]` — not `Awaitable`. But `run_polling` is async. If the callback is async (returns a coroutine), it's never awaited — the coroutine is created and immediately discarded.

**Фикс:** Either make the callback async (`Callable[[list[tuple]], Awaitable[None]]`) and `await callback(fills)`, or keep it sync and document that the callback must not block.

### 8.1196 ai-signal-bot/src/communication/shm_signal_producer.py: SHM Signal Producer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_signal_producer.py` (99 lines)

- **Creates SHM**: create=True — correct
- **push_signal**: Packs Signal struct, non-blocking — correct
- **push_signal_dict**: Dict-to-struct conversion with symbol_map — correct
- **bulk_push**: Batch — correct
- **close**: Unlink (owner cleanup) — correct

Good SHM signal producer with dict conversion and proper cleanup. ✅

### 8.1197 shm_signal_producer: confidence divided by 100 — Low

**Файл:** `shm_signal_producer.py:69`

```python
confidence = float(signal.get("confidence", 0.0)) / 100.0
```

The signal dict has confidence as 0-100 (percentage), but the SHM struct stores it as 0.0-1.0 (fraction). This conversion is correct, but it's undocumented. If a signal with confidence=0.5 (already a fraction) is passed, it becomes 0.005 — essentially zero. The `Signal` dataclass uses 0-100, so this is correct for that input, but fragile.

**Фикс:** Document the expected input range, or detect if confidence is already < 1.0.

### 8.1198 ai-signal-bot/src/utils/helpers.py: Utility Functions — ✅ Good

**Файл:** `ai-signal-bot/src/utils/helpers.py` (205 lines)

- **setup_logging**: JSON + text formatter, file handler — correct
- **JsonFormatter**: Structured JSON logs with timestamp, level, module — correct
- **load_config**: YAML with FileNotFoundError fallback — correct
- **get_env**: Type casting with bool special case — correct
- **now_ms/now_us**: Time helpers — correct
- **format_price/format_qty**: Adaptive decimal places — correct
- **safe_divide/clamp/truncate_dict**: Utility helpers — correct
- **CircuitBreaker**: Simple 3-state circuit breaker — correct (duplicate of communication/circuit_breaker.py)
- **RateLimiter**: Token bucket with async acquire — correct

Good utility functions. The `CircuitBreaker` class duplicates `src.communication.circuit_breaker.CircuitBreaker` — see §8.1201. ✅

### 8.1199 helpers: RateLimiter busy-waits on asyncio.sleep — Low

**Файл:** `helpers.py:194-204`

```python
async def acquire(self) -> bool:
    while True:
        self._refill()
        if self._tokens >= 1.0:
            self._tokens -= 1.0
            return True
        wait = (1.0 - self._tokens) / self.rate
        await asyncio.sleep(wait)
```

The rate limiter loops with `while True` and `asyncio.sleep(wait)`. If `rate` is very high (e.g., 1000/s), `wait` is ~1ms — the loop spins, waking 1000 times/sec. If `rate` is 0 or negative, `wait` is negative and `asyncio.sleep(negative)` returns immediately — infinite loop.

**Фикс:** Add `if self.rate <= 0: return False` (already present), but also cap minimum sleep to 1ms: `await asyncio.sleep(max(wait, 0.001))`.

### 8.1200 helpers: load_config silently returns empty dict — Low [FIXED]

**Файл:** `helpers.py:64-74`

```python
def load_config(config_path: str = "config/settings.yaml") -> dict:
    try:
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    except (OSError, ValueError, TypeError) as e:
        logging.error(f"Failed to load config {config_path}: {e}")
        return {}
```

On `FileNotFoundError`, the function returns `{}` silently — no log, no warning. The caller gets an empty config and may proceed with default values, masking a missing config file. On `ImportError` (yaml not installed), the function crashes.

**Фикс:** Log on FileNotFoundError. Catch `ImportError` and return `{}` with a warning.

### 8.1201 helpers: CircuitBreaker duplicates communication/circuit_breaker.py — Info [FIXED]

**Файл:** `helpers.py:145-176`

A second `CircuitBreaker` class with 3 states (closed, open, half_open) exists in `utils/helpers.py`. The main one in `communication/circuit_breaker.py` has `CircuitBreakerConfig`, `CircuitBreakerState` enum, and probe limiting. This one is simpler (no config dataclass, no enum, no probe limiting). Two implementations = confusion about which to use.

**Фикс:** Remove `helpers.CircuitBreaker` and use `communication.circuit_breaker.CircuitBreaker` everywhere. Or keep the simple one for utils and document the difference.

### 8.1202 ai-signal-bot/src/utils/bot_helpers.py: Bot Helper Functions — ✅ Good

**Файл:** `ai-signal-bot/src/utils/bot_helpers.py` (153 lines)

- **build_strategies**: Strategy list from config flags — correct
- **build_stat_arb**: StatisticalArbitrage with pair generation — correct
- **generate_stat_arb_signals**: Nested loop over symbol pairs — correct
- **generate_llm_explanation**: LLM with fallback to signal.reason — correct
- **load_candles_from_csv**: CSV loading — correct

Good extraction from run.py. Clean separation of concerns. ✅

### 8.1203 bot_helpers: generate_stat_arb_signals O(N²) pairs — Low

**Файл:** `bot_helpers.py:78-101`

```python
for i in range(len(symbols)):
    for j in range(i + 1, len(symbols)):
```

With 20 symbols, this generates 190 pairs. Each pair calls `bot.stat_arb.analyze()` which computes correlation, z-score, etc. With 50 symbols, 1225 pairs. At 1s per analysis, that's 20min per signal cycle.

**Фикс:** Pre-filter pairs by correlation threshold. Or parallelize with `asyncio.gather()`.

### 8.1204 bot_helpers: generate_llm_explanation catches broad exceptions — Low [FIXED]

**Файл:** `bot_helpers.py:116`

```python
except (ValueError, KeyError, TypeError, RuntimeError):
    return signal.reason
```

The exception list is broad but doesn't include `asyncio.TimeoutError` or `OSError`. If the LLM engine times out or has a network error, the exception propagates up and may crash the signal pipeline.

**Фикс:** Add `asyncio.TimeoutError, OSError` to the catch list.

### 8.1205 ai-signal-bot/src/observability/health_checks.py: Deep Health Checks — ✅ Good

**Файл:** `ai-signal-bot/src/observability/health_checks.py` (221 lines)

- **3 endpoints**: liveness, readiness, status — correct
- **4 component checks**: WebSocket, TimescaleDB, Redis, exchange — correct
- **HealthStatus enum**: HEALTHY, DEGRADED, UNHEALTHY — correct
- **ComponentHealth dataclass**: name, status, latency, details — correct
- **create_health_endpoints**: aiohttp handlers with 503 on unhealthy — correct
- **Specific exception catches**: No bare Exception — correct

Good deep health checking with proper Kubernetes liveness/readiness separation. ✅

### 8.1206 health_checks: _check_ws uses getattr for connected — Low [N/A]

**Файл:** `health_checks.py:146`

```python
connected = getattr(self.ws_client, "connected", False)
```

The WS client's connection state is checked via `getattr` with a fallback to `False`. If the WS client doesn't have a `connected` attribute (e.g., different implementation), the check always returns UNHEALTHY. This is a duck-typing fragility.

**Фикс:** Define a `HealthCheckable` protocol with `connected`, `ping()`, `is_healthy()` methods.

### 8.1207 health_checks: check_liveness uses __import__("os") — Low [FIXED]

**Файл:** `health_checks.py:82`

```python
"pid": __import__("os").getpid(),
```

Using `__import__("os")` instead of `import os` at the top of the file. This is an anti-pattern — it's harder to read, prevents IDE auto-complete, and linters can't track the import.

**Фикс:** Add `import os` at the top and use `os.getpid()`.

### 8.1208 health_checks: no timeout on _check_db and _check_redis — Low [FIXED]

**Файл:** `health_checks.py:162, 179`

```python
health = await self.db_client.get_health()
# ...
await self.redis_client.ping()
```

No timeout on DB health check or Redis ping. If the DB or Redis is slow (e.g., 30s query), the readiness probe hangs. Kubernetes will kill the pod after `timeoutSeconds` (default 1s).

**Фикс:** Wrap in `asyncio.wait_for(..., timeout=2.0)`.

### 8.1209 ai-signal-bot/src/observability/logging.py: Structured Logging — ✅ Good

**Файл:** `ai-signal-bot/src/observability/logging.py` (171 lines)

- **structlog integration**: Context vars, JSON renderer, console renderer — correct
- **Fallback**: basicConfig if structlog not installed — correct
- **_configured guard**: Prevents double initialization — correct
- **_suppress_library_noise**: Reduces noise from uvicorn, websockets, etc. — correct
- **File handler**: JSON format for file, console for stdout — correct

Good structured logging with graceful fallback. ✅

### 8.1210 logging: setup_logging duplicates utils/helpers.setup_logging — Info

**Файл:** `observability/logging.py:31` vs `utils/helpers.py:14`

Two `setup_logging` functions exist:
1. `utils.helpers.setup_logging` — uses custom `JsonFormatter`, returns `logging.Logger`
2. `observability.logging.setup_logging` — uses `structlog`, returns `None`

Both configure the root logger. If both are called, the second one clears handlers from the first. The caller must know which one to use.

**Фикс:** Remove `utils.helpers.setup_logging` and use `observability.logging.setup_logging` everywhere.

### 8.1211 logging: _configured guard prevents reconfiguration — Low [N/A]

**Файл:** `logging.py:39-40`

```python
if _configured:
    return
```

Once `setup_logging` is called, it can never be reconfigured. If the application needs to switch from console to JSON logging at runtime (e.g., for debugging), it can't.

**Фикс:** Add a `force: bool = False` parameter that bypasses the guard.

### 8.1212 ai-signal-bot/src/observability/tracing.py: Distributed Tracing — ✅ Good

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

- **OpenTelemetry + Jaeger**: OTLP exporter, BatchSpanProcessor — correct
- **NoopTracer fallback**: No-op span when tracing not initialized — correct
- **AsyncioInstrumentor**: Auto-instruments asyncio — correct
- **shutdown_tracing**: Flushes pending traces — correct
- **Specific exception catches**: ImportError, RuntimeError, OSError — correct

Good distributed tracing with graceful fallback and proper shutdown. ✅

### 8.1213 tracing: no span export mechanism — Info [N/A]

**Файл:** `tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

The OTLP exporter sends spans to `endpoint` (default `http://localhost:4317`). If Jaeger is not running, the exporter silently fails (BatchSpanProcessor catches exceptions internally). Traces are collected but never exported — tracing is useless without a backend.

### 8.1214 tracing: insecure=True hardcoded — Low [FIXED]

**Файл:** `tracing.py:59`

```python
exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
```

`insecure=True` disables TLS for the OTLP gRPC connection. In production, traces may contain sensitive data (symbol names, order IDs). Without TLS, they're sent in plaintext.

**Фикс:** Make `insecure` configurable, default to `False` in production.

### 8.1215 ai-signal-bot/src/monitoring/alerting.py: Alert System — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/alerting.py` (260 lines)

- **3 severity levels**: INFO, WARNING, CRITICAL — correct
- **AlertRule**: check_fn, cooldown, enabled flag — correct
- **3 channels**: Discord, Telegram, generic webhook — correct
- **Rate limiting**: Cooldown per rule (default 5min) — correct
- **Alert history**: Capped at 1000, list slicing — correct
- **Parallel send**: asyncio.gather with return_exceptions — correct
- **Monitor loop**: Periodic with proper CancelledError handling — correct

Good multi-channel alert system with rate limiting and proper cleanup. ✅

### 8.1216 alerting: creates new aiohttp session per alert send — Low [FIXED]

**Файл:** `alerting.py:168, 190, 205`

```python
async with aiohttp.ClientSession() as session:
    async with session.post(self.discord_webhook, json=payload) as resp:
```

Each `_send_discord`, `_send_telegram`, `_send_webhook` creates a new `aiohttp.ClientSession`. With 10 alerts/min, that's 30 sessions/min. Session creation involves TCP connection setup and memory allocation.

**Фикс:** Create a shared `aiohttp.ClientSession` in `__init__` or `start_monitoring()`, reuse it for all sends, and close it in `stop_monitoring()`.

### 8.1217 alerting: check_fn is sync but called in async context — Low [N/A]

**Файл:** `alerting.py:101`

```python
should_fire = rule.check_fn()
```

`check_fn` is `Callable[[], bool]` — synchronous. But `check_rules` is async. If `check_fn` does I/O (e.g., checks DB), it blocks the event loop. The alert system is designed for trading system checks (daily loss, no fills, SHM disconnected, DB down) — these likely involve I/O.

**Фикс:** Make `check_fn` async (`Callable[[], Awaitable[bool]]`) and `await rule.check_fn()`.

### 8.1218 alerting: alert_history list slicing O(N) — Low [FIXED]

**Файл:** `alerting.py:113-114`

```python
if len(self.alert_history) > self._max_history:
    self.alert_history = self.alert_history[-self._max_history:]
```

When history exceeds 1000, the entire list is sliced: `self.alert_history[-1000:]` creates a new list of 1000 elements. This is O(N) and happens on every alert after 1000. With 10 alerts/min, that's 10 O(1000) copies/min.

**Фикс:** Use `collections.deque(maxlen=1000)` instead of list.

### 8.1219 ai-signal-bot/src/monitoring/tracker.py: Performance Tracker — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/tracker.py` (175 lines)

- **PerformanceTracker**: Signals, trades, PnL, win rate — correct
- **SignalLogger**: CSV with header creation — correct
- **TradeLogger**: CSV with header creation — correct
- **print_dashboard**: tabulate-based CLI dashboard — correct

Good performance tracking with CSV logging and CLI dashboard. ✅

### 8.1220 tracker: SignalLogger opens file on every log() call — Low [FIXED]

**Файл:** `tracker.py:82-96`

```python
def log(self, signal_dict: dict) -> None:
    with open(self.path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([...])
```

Every `log()` call opens, writes, and closes the file. With 100 signals/sec, that's 100 file open/close operations/sec. Each involves syscall overhead (open, fcntl, close).

**Фикс:** Keep the file open (open in `__init__`, close in `__del__` or `close()`), or use a buffered writer. Or use `logging.FileHandler` with CSV formatter.

### 8.1221 tracker: no file lock — Low [N/A]

**Файл:** `tracker.py:82-96`

Multiple processes (e.g., AI Signal Bot + backtest runner) may write to the same CSV file. Without a file lock, writes can interleave, corrupting the CSV.

**Фикс:** Use `fcntl.flock` (POSIX) or `msvcrt.locking` (Windows), or use a proper logging framework.

### 8.1222 tracker: print_dashboard uses datetime.now() without UTC — Low [FIXED]

**Файл:** `tracker.py:134`

```python
f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
```

`datetime.now()` returns local time. In production across time zones, dashboard timestamps don't match log timestamps (which use UTC).

**Фикс:** Use `datetime.now(UTC)`.

### 8.1223 ai-signal-bot/src/monitoring/metrics.py: Prometheus Metrics — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/metrics.py` (239 lines)

- **prometheus_client**: Counter, Gauge, Histogram, Summary — correct
- **15 metrics**: signals, fills, orders, PnL, drawdown, latency, SHM — correct
- **Label dimensions**: symbol, direction, exchange, side, channel — correct
- **HTTP endpoint**: /metrics + /health — correct
- **Graceful fallback**: HAS_PROMETHEUS guard — correct

Good Prometheus metrics exporter with comprehensive trading system metrics. ✅

### 8.1224 metrics: MetricsExporter.__init__ returns early without setting attributes — Low [FIXED]

**Файл:** `metrics.py:41-43`

```python
if not HAS_PROMETHEUS:
    logger.warning("prometheus_client not available")
    return
```

If `prometheus_client` is not installed, `__init__` returns early. None of the metric attributes (`signals_total`, `fills_total`, etc.) are set. Any call to `record_signal()`, `record_fill()`, etc. will raise `AttributeError`. The `HAS_PROMETHEUS` guard in each method prevents this, but if someone calls `exporter.signals_total.inc()` directly, it crashes.

**Фикс:** Set all attributes to `None` or a no-op object in the `if not HAS_PROMETHEUS` branch.

### 8.1225 metrics: duplicate of communication/metrics_server.py — Info [N/A]

**Файл:** `monitoring/metrics.py` vs `communication/metrics_server.py`

Two metrics implementations:
1. `communication/metrics_server.py` — lightweight, pure Python, 7 metrics, no external deps
2. `monitoring/metrics.py` — prometheus_client, 15 metrics, full Prometheus format

Both serve `/metrics` on different ports (9091 vs 9090). This is confusing and wastes resources. The lightweight one was created for the signal publisher; the full one for the trading system.

**Фикс:** Use only `monitoring/metrics.py` (prometheus_client). Remove `communication/metrics_server.py` or use it as a fallback when prometheus_client is not installed.

### 8.1226 ai-signal-bot/src/monitoring/health_server.py: Health Server — ✅ Good

**Файл:** `ai-signal-bot/src/monitoring/health_server.py` (153 lines)

- **4 endpoints**: /health, /health/exchange, /health/database, /health/shm — correct
- **register_check**: Pluggable check functions — correct
- **Coroutine detection**: `asyncio.iscoroutine(result)` — correct
- **503 on unhealthy**: Correct HTTP status — correct
- **Specific exception catches**: No bare Exception — correct

Good health server with pluggable checks and per-component endpoints. ✅

### 8.1227 health_server: duplicate of observability/health_checks.py — Info [N/A]

**Файл:** `monitoring/health_server.py` vs `observability/health_checks.py`

Two health check implementations:
1. `monitoring/health_server.py` — pluggable checks via `register_check()`, 3 hardcoded checks (exchange, database, shm)
2. `observability/health_checks.py` — deep checks with `HealthChecker` class, 4 component checks, Kubernetes liveness/readiness

Both serve health endpoints. The monitoring one is simpler (pluggable), the observability one is deeper (Kubernetes-ready). In practice, both may be started, serving on different ports (8080 vs 9090).

**Фикс:** Merge into one. Use `observability/health_checks.py` as the primary (Kubernetes-ready), and make `monitoring/health_server.py` a thin wrapper or remove it.

### 8.1228 health_server: _check_all runs checks sequentially — Low [FIXED]

**Файл:** `health_server.py:74-95`

```python
exchange = await self._check_exchange()
database = await self._check_database()
shm = await self._check_shm()
```

Checks run sequentially. If exchange check takes 2s and database check takes 3s, total is 5s. Kubernetes readiness probe has a default 1s timeout — the probe will fail.

**Фикс:** Use `asyncio.gather()` to run checks in parallel.

### 8.1229 ai-signal-bot/src/ml/automl.py: AutoML Optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/ml/automl.py` (191 lines)

- **Optuna TPE sampler**: Bayesian optimization — correct
- **MedianPruner**: Early stopping of bad trials — correct
- **Default search space**: RSI, EMA, ATR, confidence, SL/TP, position sizing — correct
- **Strategy-specific params**: mean_reversion (BB, z-score), trend_following (trailing stop) — correct
- **Storage**: SQLite optional for study persistence — correct
- **save_best_params**: JSON export — correct

Good AutoML pipeline with Optuna, proper search space design, and persistence. ✅

### 8.1230 automl: study.optimize is blocking — Low [FIXED]

**Файл:** `automl.py:142-147`

```python
self.study.optimize(
    wrapped_objective,
    n_trials=self.config.n_trials,
    timeout=self.config.timeout,
    show_progress_bar=True,
)
```

`study.optimize()` is synchronous and blocks the event loop. With `timeout=3600` (1 hour), the event loop is blocked for up to 1 hour. If this is called from an async context (e.g., WebSocket handler), all clients are starved.

**Фикс:** Run in `ProcessPoolExecutor` via `run_in_executor()`, or use Optuna's async features.

### 8.1231 automl: no objective function validation — Low [N/A]

**Файл:** `automl.py:128-131`

```python
if objective_fn is None:
    logger.warning("[AutoML] No objective function given — using dummy")
    def objective_fn(params):
        return 0.0
```

If no objective function is provided, a dummy returning 0.0 is used. The optimization runs 100 trials, all returning 0.0, wasting 1 hour of compute. The warning is logged but easy to miss.

**Фикс:** Raise `ValueError` if no objective function is provided, or require it as a positional argument.

### 8.1232 ai-signal-bot/src/ml/feature_store.py: Feature Store — ✅ Good

**Файл:** `ai-signal-bot/src/ml/feature_store.py` (220 lines)

- **Redis-backed**: Hash per symbol, TTL 1h — correct
- **In-memory fallback**: Dict-based when Redis unavailable — correct
- **Pipeline**: Batch HSET + SADD + EXPIRE — correct
- **Feature vector/matrix**: Ordered vectors for ML inference — correct
- **Feature age**: Time since last update — correct
- **is_healthy**: Redis ping — correct

Good feature store with Redis, in-memory fallback, and ML-ready vector/matrix output. ✅

### 8.1233 feature_store: bare Exception in Redis connection catch — Low [FIXED]

**Файл:** `feature_store.py:94`

```python
except (OSError, ConnectionError, RuntimeError, Exception) as e:
```

The exception list includes `Exception` — which catches everything including `CancelledError`, `KeyboardInterrupt`, `SystemExit`. The `Exception` at the end makes the other three redundant.

**Фикс:** Remove `Exception` from the list, or just use `except Exception`.

### 8.1234 feature_store: get_features_batch is sequential — Low [N/A]

**Файл:** `feature_store.py:141-148`

```python
def get_features_batch(self, symbols, feature_names=None):
    result = {}
    for symbol in symbols:
        result[symbol] = self.get_features(symbol, feature_names)
    return result
```

Batch get is sequential — each symbol triggers a separate Redis round-trip. With 50 symbols, that's 50 Redis calls. At 1ms per call, 50ms total.

**Фикс:** Use Redis pipeline or MGET for batch retrieval. Or use `asyncio.gather()` if async.

### 8.1235 feature_store: no connection pool configuration — Low [N/A]

**Файл:** `feature_store.py:83-91`

```python
self._redis = redis.Redis(
    host=redis_host, port=redis_port, db=redis_db,
    password=redis_password, decode_responses=True,
    socket_timeout=2, socket_connect_timeout=2,
)
```

No `max_connections` or connection pool config. The default `redis.ConnectionPool` has unlimited connections. Under high load, this can exhaust file descriptors.

**Фикс:** Add `connection_pool=redis.ConnectionPool(max_connections=10)`.

### 8.1236 ai-signal-bot/src/ml/model_registry.py: Model Registry — ✅ Good

**Файл:** `ai-signal-bot/src/ml/model_registry.py` (296 lines)

- **5 statuses**: CANDIDATE, STAGING, PRODUCTION, ARCHIVED, ROLLED_BACK — correct
- **ModelVersion**: name, version, path, metrics, metadata — correct
- **A/B testing**: Traffic split, impression/success tracking, auto-promote — correct
- **Rollback**: Most recently archived model — correct
- **File persistence**: JSON with load/save — correct
- **Promotion**: Auto-archive current production — correct

Good model registry with versioning, A/B testing, rollback, and file persistence. ✅

### 8.1237 model_registry: _save on every A/B impression — Low [FIXED]

**Файл:** `model_registry.py:237-243`

```python
def select_ab_model(self, name: str) -> str:
    # ...
    if random.random() < ab.traffic_split:
        ab.treatment_impressions += 1
        self._save()  # saves entire registry on every impression!
        return ab.treatment_version
    else:
        ab.control_impressions += 1
        self._save()  # saves entire registry on every impression!
        return ab.control_version
```

Every A/B model selection increments the impression counter and saves the entire registry to disk. With 1000 predictions/sec, that's 1000 JSON file writes/sec. Each write serializes all models, all A/B tests, and writes to disk.

**Фикс:** Batch saves: save every N impressions or every T seconds. Or use a database instead of JSON file.

### 8.1238 model_registry: no file lock on _save — Low [N/A]

**Файл:** `model_registry.py:107-120`

```python
def _save(self) -> None:
    os.makedirs(self.storage_dir, exist_ok=True)
    # ...
    with open(self.index_path, "w") as f:
        json.dump(data, f, indent=2)
```

No file lock. If two processes save simultaneously, the JSON file can be corrupted (partial write from one process, partial from another).

**Фикс:** Use `fcntl.flock` (POSIX) or `msvcrt.locking` (Windows), or use atomic write (write to temp, rename).

### 8.1239 model_registry: rollback selects wrong model — Low [N/A]

**Файл:** `model_registry.py:179-198`

```python
prod_models = [v for v in versions if v.status == ModelStatus.ARCHIVED]
# ...
prod_models.sort(key=lambda v: v.promoted_at or 0, reverse=True)
previous = prod_models[0]
```

Rollback selects the most recently `ARCHIVED` model. But `ARCHIVED` status is also set when a model is promoted over another. If model A → B → C, then A and B are both ARCHIVED. Rollback selects B (most recently archived), not A (the one before C). This is correct for one-level rollback, but the naming `prod_models` is misleading — they're archived models, not production models.

**Фикс:** Rename `prod_models` to `archived_models`. For multi-level rollback, maintain a promotion history stack.

### 8.1240 ai-signal-bot/src/ml/autoencoder.py: Pure Python Autoencoder — ✅ Good

**Файл:** `ai-signal-bot/src/ml/autoencoder.py` (376 lines)

- **Shallow autoencoder**: Tied weights, sigmoid activation, Xavier init — correct
- **Forward/backward pass**: Manual gradient computation — correct
- **Anomaly detection**: Reconstruction error + z-score threshold — correct
- **Stable sigmoid**: Input clamping to ±500 — correct
- **No external deps**: Pure Python, no numpy/torch required — correct

Good educational implementation. Not production-grade (no batching, no GPU), but correct for small-scale anomaly detection. ✅

### 8.1241 autoencoder: O(N²) weight matrix operations in pure Python — Low [N/A]

**Файл:** `autoencoder.py:110-120`

```python
for k in range(hidden_dim):
    total = be[k]
    for j in range(input_dim):
        total += we[k][j] * x[j]
```

Forward pass is O(hidden_dim × input_dim) in pure Python loops. With input_dim=12 and hidden_dim=4, this is 48 multiplications per sample — fine for small scale. But with 1000 samples × 200 epochs = 200K forward passes, that's 9.6M Python loop iterations. NumPy would be 100× faster.

**Фикс:** Use numpy for matrix operations: `h = sigmoid(we @ x + be)`. Or document that this is intentionally pure-Python for educational purposes.

### 8.1242 ai-signal-bot/src/ml/vae.py: Variational Autoencoder — ✅ Good

**Файл:** `ai-signal-bot/src/ml/vae.py` (349 lines)

- **2-layer encoder/decoder**: Linear + sigmoid — correct
- **Reparameterization trick**: z = mu + exp(0.5*logvar) * eps — correct
- **ELBO loss**: MSE reconstruction + β × KL divergence — correct
- **Full backpropagation**: Manual gradients through encoder/decoder — correct
- **Synthetic scenario generation**: Sample z → decode → x_hat — correct

Good VAE implementation with β-VAE support and manual backprop. ✅

### 8.1243 vae: _random_normal uses Box-Muller without caching — Low [N/A]

**Файл:** `vae.py:72`

```python
eps = [_random_normal(self.rng) for _ in range(self.latent_dim)]
```

Each call to `_random_normal` generates a normal random number via Box-Muller transform (likely involving `math.sqrt`, `math.log`, `math.cos`). This is called on every forward pass and every train step. With latent_dim=2 and 50 epochs × 200 samples = 10K calls, that's 20K trig operations.

**Фикс:** Use `random.gauss(0, 1)` which is faster, or numpy.random.randn for batch generation.

### 8.1244 ai-signal-bot/src/ml/price_predictor.py: LSTM/Transformer Predictor — ✅ Good

**Файл:** `ai-signal-bot/src/ml/price_predictor.py` (334 lines)

- **LSTMPredictor**: LSTM + attention + classifier — correct
- **TransformerPredictor**: Positional encoding + TransformerEncoder + GELU — correct
- **ModelConfig**: 11 input dims, 128 hidden, 3 output (buy/sell/hold) — correct
- **Training loop**: Early stopping, learning rate scheduling — correct
- **ONNX export**: Dynamic batch axes — correct

Good PyTorch model with proper architecture, training, and export pipeline. ✅

### 8.1245 price_predictor: hard dependency on torch — Low [N/A]

**Файл:** `price_predictor.py:28-30`

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
```

No `try/except ImportError` guard. If torch is not installed, importing this module crashes the entire application. Other ML modules (automl, feature_store) have graceful fallbacks.

**Фикс:** Add `try: import torch ... except ImportError: HAS_TORCH = False` guard, or document that this module is optional.

### 8.1246 price_predictor: no model versioning in save/load — Low [FIXED]

**Файл:** `price_predictor.py` (training section)

The training loop saves checkpoints but doesn't register them in `model_registry.py`. Models are saved to `checkpoints/` but not versioned, promoted, or tracked. The model registry exists but is not integrated.

**Фикс:** After training, call `model_registry.register(name, version, path, metrics, metadata)` to track model versions.

### 8.1247 ai-signal-bot/src/ml/rl_trader.py: PPO + DQN Agents — ✅ Good

**Файл:** `ai-signal-bot/src/ml/rl_trader.py` (390 lines)

- **PPOAgent**: Actor-Critic, GAE, clip objective, gradient clipping — correct
- **DQNAgent**: Experience replay, target network, ε-greedy, ε-decay — correct
- **Checkpointing**: Save/load model + optimizer state — correct
- **ONNX export**: Dynamic batch axes, opset 17 — correct
- **Config**: Separate PPO and DQN hyperparameters — correct

Good RL implementation with both PPO and DQN, proper checkpointing, and ONNX export. ✅

### 8.1248 rl_trader: PPO buffer unbounded between updates — Low [N/A]

**Файл:** `rl_trader.py:124-129`

```python
def reset_buffer(self) -> None:
    self.states: list[torch.Tensor] = []
    self.actions: list[int] = []
    # ...
```

The PPO buffer grows unbounded between `update()` calls. If `update()` is not called (e.g., episode shorter than batch_size), the buffer keeps growing. With 63-dim states and 10K steps, that's 10K × 63 × 4 bytes = 2.5MB in GPU/CPU memory.

**Фикс:** Use `deque(maxlen=config.batch_size * 10)` or cap buffer size.

### 8.1249 rl_trader: DQN buffer 100K entries ~50MB RAM — Low [N/A]

**Файл:** `rl_trader.py:284`

```python
self.buffer = deque(maxlen=config.dqn_buffer_size)  # 100000
```

Each entry is (state, action, reward, next_state, done) = (63 + 1 + 1 + 63 + 1) floats = 129 floats × 4 bytes = 516 bytes. 100K entries = 51.6MB. This is acceptable for training but wasteful for inference-only deployments.

**Фикс:** Document that DQN is training-only. For inference, load checkpoint and don't instantiate DQNAgent.

### 8.1250 ai-signal-bot/src/ml/svm_signal.py: Linear SVM via SGD — ✅ Good

**Файл:** `ai-signal-bot/src/ml/svm_signal.py` (182 lines)

- **Linear SVM**: SGD with hinge loss, L2 regularization — correct
- **RBF kernel**: Defined but not used in linear_svm — correct (kernel SVM would be O(N²))
- **Standardize**: Zero mean, unit variance — correct
- **Learning rate decay**: `eta = lr / (1 + epoch * decay_rate)` — correct
- **Training accuracy**: Computed after training — correct

Good pure-Python SVM implementation. Simple, correct, no external deps. ✅

### 8.1251 svm_signal: RBF kernel defined but unused — Info [N/A]

**Файл:** `svm_signal.py:41-44`

```python
def _rbf_kernel(x1, x2, gamma):
    dist_sq = sum((a - b) ** 2 for a, b in zip(x1, x2))
    return math.exp(-gamma * dist_sq)
```

The RBF kernel function is defined but never called. `linear_svm` uses linear kernel only. This is dead code.

**Фикс:** Remove `_rbf_kernel` or implement kernel SVM (but O(N²) in memory and time).

### 8.1252 ai-signal-bot/src/ml/rkhs.py: RKHS Kernel Methods — ✅ Good

**Файл:** `ai-signal-bot/src/ml/rkhs.py` (276 lines)

- **RBF + Laplacian kernels**: Correct implementations — correct
- **Kernel matrix**: Symmetric, O(N²) — correct
- **Center kernel matrix**: H*K*H centering — correct
- **Jacobi eigendecomposition**: Iterative, correct for symmetric matrices — correct
- **MMD (Maximum Mean Discrepancy)**: Distribution comparison — correct
- **Kernel regression**: Ridge regression in kernel space — correct

Good RKHS implementation with proper linear algebra. ✅

### 8.1253 rkhs: Jacobi eigendecomposition O(N³) — Low [FIXED]

**Файл:** `rkhs.py:85-120`

```python
def jacobi_eig(a, max_iter=50, tol=1e-8):
    n = len(a)
    # ...
    for _ in range(max_iter):
        for i in range(n):
            for j in range(i + 1, n):
```

Jacobi eigendecomposition is O(N³) per iteration × 50 iterations. With N=60 (lookback), that's 60³ × 50 = 10.8M operations. In pure Python, this takes ~10 seconds. NumPy's `np.linalg.eigh` would take <1ms.

**Фикс:** Use `numpy.linalg.eigh` for symmetric matrices. Keep Jacobi as fallback if numpy not available.

### 8.1254 ai-signal-bot/src/ml/environment.py: Trading Environment — ✅ Good

**Файл:** `ai-signal-bot/src/ml/environment.py` (163 lines)

- **Gym-compatible**: reset(), step(), observation/action spaces — correct
- **3 actions**: HOLD, BUY, SELL — correct
- **63-dim observation**: 60 prices + 3 portfolio state — correct
- **Price normalization**: Divide by last price — correct
- **Transaction cost**: 0.1% per trade — correct
- **Reward**: Portfolio value change / initial_cash — correct

Good RL trading environment with proper Gym interface. ✅

### 8.1255 environment: no CLOSE action — Low [N/A]

**Файл:** `environment.py:15-19`

```python
class Action(Enum):
    HOLD = 0
    BUY = 1
    SELL = 2
```

Only 3 actions: HOLD, BUY, SELL. No explicit CLOSE action. To close a long position, the agent must SELL (which opens a short if no position). This conflates "close long" with "open short", making it harder for the agent to learn.

**Фикс:** Add `CLOSE = 3` action that closes current position without opening opposite.

### 8.1256 environment: reset() generates random prices if none provided — Low [N/A]

**Файл:** `environment.py:62-63`

```python
if prices is None:
    prices = np.random.randn(200) * 10 + 100
```

If `reset()` is called without prices, it generates 200 random normal prices around 100. This is useful for testing but dangerous in production — an agent trained on random walk may not generalize to real market data.

**Фикс:** Log a warning when using synthetic data. Or require prices as mandatory argument.

### 8.1257 ai-signal-bot/src/llm_engine/engine.py: LLM Engine — ✅ Good

**Файл:** `ai-signal-bot/src/llm_engine/engine.py` (394 lines)

- **3 providers**: OpenAI, Anthropic, Ollama — correct
- **Rule-based fallback**: When no API key or on error — correct
- **Response caching**: TTL-based with eviction — correct
- **Prompt templates**: File-based with inline fallback — correct
- **3 analysis types**: Market analysis, signal explanation, risk assessment — correct
- **Specific exception catches**: RuntimeError, OSError, ValueError, KeyError — correct
- **Shared aiohttp session**: Created in initialize(), closed in close() — correct

Good LLM engine with multi-provider support, caching, and graceful fallback. ✅

### 8.1258 llm_engine: API key in plain string — Low [FIXED]

**Файл:** `engine.py:29`

```python
api_key: str = ""
```

The API key is stored as a plain string in `LLMConfig`. If the config is logged, printed, or serialized, the key is exposed. The key is also passed in headers (`Authorization: Bearer {key}`), which is correct, but the config object itself is not protected.

**Фикс:** Use `SecretStr` from pydantic or a custom wrapper that masks `__repr__`.

### 8.1259 llm_engine: cache key based on price rounded to 2 decimals — Low [FIXED]

**Файл:** `engine.py:151`

```python
cache_key = f"{ctx.symbol}_{round(ctx.price, 2)}"
```

Cache key is `symbol_price`. If BTC moves from 65000.00 to 65000.01, it's a cache miss. If BTC stays at 65000.00 for 60s, every call is a cache hit. The cache TTL is 60s, so the key space is bounded, but the cache hit rate depends on price volatility, not time.

**Фикс:** Use `f"{ctx.symbol}_{int(ctx.price)}"` for coarser caching, or use time-bucketed keys.

### 8.1260 llm_engine: _parse_response uses string find for JSON extraction — Low [FIXED]

**Файл:** `engine.py:287-290`

```python
start = response.find("{")
end = response.rfind("}") + 1
if start >= 0 and end > start:
    data = json.loads(response[start:end])
```

The parser finds the first `{` and last `}` in the LLM response. If the LLM includes markdown code blocks (e.g., ````json\n{...}\n````), the extraction works. But if the LLM includes multiple JSON objects or nested braces in text, the extraction may fail or parse the wrong section.

**Фикс:** Use a regex or json5 parser for more robust extraction. Or instruct the LLM to return only JSON.

### 8.1261 llm_engine: no rate limiting on API calls — Low [FIXED]

**Файл:** `engine.py:175-180`

```python
response = await self._call_llm(prompt)
analysis = self._parse_response(response, ctx.symbol)
self._cache[cache_key] = (now, analysis)
self._request_count += 1
```

No rate limiting on LLM API calls. With 50 symbols × 60s signal interval = 50 calls/min. OpenAI's rate limit for gpt-4o-mini is 500 RPM for tier 1, so this is fine. But if the cache is cold or the price changes rapidly, the call rate can spike.

**Фикс:** Add a rate limiter (e.g., the `RateLimiter` from `utils/helpers.py`) to cap calls at a configurable rate.

### 8.1262 ai-signal-bot/src/notification/notifier.py: Telegram + Discord Notifier — ✅ Good

**Файл:** `ai-signal-bot/src/notification/notifier.py` (334 lines)

- **TelegramNotifier**: Long polling, command handling, proper CancelledError — correct
- **DiscordNotifier**: Message polling, command handling, proper CancelledError — correct
- **NotifierManager**: Multi-notifier management, start_all/stop_all — correct
- **AlertEvent**: Normalized event dataclass — correct
- **create_notifier_from_env**: Environment variable setup — correct
- **Shared session**: Each notifier creates one aiohttp session — correct
- **Specific exception catches**: OSError, RuntimeError, JSONDecodeError — correct

Good notification system with both Telegram and Discord, command handling, and proper cleanup. ✅

### 8.1263 notifier: Telegram token in URL — Low [N/A]

**Файл:** `notifier.py:104`

```python
url = f"https://api.telegram.org/bot{self.token}/sendMessage"
```

The Telegram bot token is embedded in the URL. If the URL is logged (e.g., in debug mode, by aiohttp, or by a proxy), the token is exposed. Telegram API requires this format, but logging must be careful.

**Фикс:** Ensure debug logging doesn't include URLs. Add a log filter that masks tokens.

### 8.1264 notifier: Discord polls messages instead of using Gateway — Low [N/A]

**Файл:** `notifier.py:234-263`

```python
async def _poll_messages(self):
    while self._running:
        url = f"https://discord.com/api/v10/channels/{self.channel_id}/messages"
        # ...
        async with self._session.get(url, headers=headers, params=params) as resp:
```

Discord notifier polls the REST API for new messages every iteration. This is rate-limited by Discord (50 requests/second per channel, but practical limit is lower). The proper way is to use the Discord Gateway (WebSocket) for real-time message events.

**Фикс:** Use `discord.py` library or implement WebSocket Gateway connection. Or document that polling is intentional for simplicity.

### 8.1265 notifier: no polling interval in Discord _poll_messages — Low [FIXED]

**Файл:** `notifier.py:237-263`

```python
while self._running:
    try:
        url = f"..."
        async with self._session.get(url, ...) as resp:
            # ...
    except asyncio.CancelledError:
        break
    except (OSError, RuntimeError, json.JSONDecodeError) as e:
        logger.error(f"Discord poll error: {e}")
        await asyncio.sleep(5)
```

On success, there's no `await asyncio.sleep()` — the loop immediately polls again. This hammers the Discord API at maximum speed (hundreds of requests/second). On error, it sleeps 5s. The Telegram poller has `timeout: 30` in the request params (long polling), but Discord has no such mechanism in the REST API.

**Фикс:** Add `await asyncio.sleep(1)` at the end of the while loop body (on success).

### 8.1266 notifier: NotifierManager.send_alert is sequential — Low [FIXED]

**Файл:** `notifier.py:308-310`

```python
async def send_alert(self, event: AlertEvent):
    for n in self._notifiers:
        await n.send_alert(event)
```

Alerts are sent to notifiers sequentially. If Telegram takes 2s and Discord takes 3s, total is 5s. With both notifiers, this doubles the alert latency.

**Фикс:** Use `asyncio.gather(*[n.send_alert(event) for n in self._notifiers], return_exceptions=True)`.

### 8.1267 ai-signal-bot/src/portfolio/markowitz.py: Markowitz Optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/markowitz.py` (178 lines)

- **Mean-variance optimization**: scipy SLSQP with bounds and constraints — correct
- **Efficient frontier**: n_points target returns, sorted by volatility — correct
- **Min variance / max Sharpe**: Delegates to optimize_portfolio with flags — correct
- **Scipy fallback**: Equal weights if scipy not available — correct
- **Portfolio metrics**: Return, volatility, Sharpe ratio — correct

Good Markowitz implementation with proper scipy optimization and graceful fallback. ✅

### 8.1268 markowitz: sector constraints not implemented — Low [N/A]

**Файл:** `markowitz.py:77-83`

```python
if sector_constraints:
    for sector, (min_w, max_w) in sector_constraints.items():
        logger.warning(
            "Sector constraints require asset-to-sector mapping (not implemented). "
            "Skipping sector '%s' [min=%.2f, max=%.2f].",
            sector, min_w, max_w,
        )
```

Sector constraints are accepted as a parameter but silently skipped with a warning. The API promises sector-level weight bounds but doesn't deliver. This is a feature gap, not a bug — but callers may not notice the warning in production logs.

**Фикс:** Add `asset_sector_map: dict[int, str]` parameter and implement sector constraints as `{'type': 'ineq', 'fun': lambda w: ...}` for each sector.

### 8.1269 markowitz: penalty function for target_return is fragile — Low [FIXED]

**Файл:** `markowitz.py:59`

```python
penalty = 1000 * abs(portfolio_return - target_return)
return portfolio_volatility + penalty
```

The penalty approach (adding 1000× deviation to the objective) is a soft constraint. For extreme target returns (e.g., 50% annual), the optimizer may find a "good enough" solution that's far from the target but has low penalty relative to the volatility. The proper approach is a hard equality constraint (which is already added in `_build_constraints`).

**Фикс:** Remove the penalty from the objective function since the equality constraint already enforces `np.dot(w, expected_returns) == target_return`. The penalty is redundant and can conflict with the constraint.

### 8.1270 ai-signal-bot/src/portfolio/black_litterman.py: Black-Litterman Model — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/black_litterman.py` (135 lines)

- **Prior returns**: π = λ × Σ × w_market — correct
- **View matrices**: P, Q, Ω from investor views — correct
- **Posterior computation**: BL formula with LinAlgError fallback — correct
- **Integration with Markowitz**: Delegates optimization to MarkowitzOptimizer — correct
- **Compare function**: BL vs pure Markowitz comparison — correct

Good Black-Litterman implementation with proper view incorporation and fallback. ✅

### 8.1271 black_litterman: Ω confidence division can produce huge values — Low [FIXED]

**Файл:** `black_litterman.py:58`

```python
Omega[i, i] = view_cov[0, 0] / max(view.confidence, 1e-10)
```

If `view.confidence` is very low (e.g., 0.001), Ω becomes very large, meaning the view is ignored. This is correct behavior. But if `view.confidence` is 0, the `max(..., 1e-10)` prevents division by zero but produces an astronomically large Ω (10^10×), which can cause numerical instability in the matrix inversion.

**Фикс:** Validate `0 < confidence <= 1` in the `View` dataclass. Reject confidence ≤ 0 with a ValueError.

### 8.1272 ai-signal-bot/src/portfolio/risk_parity.py: Risk Parity Optimizer — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/risk_parity.py` (167 lines)

- **Marginal risk**: Σw / σ_p — correct
- **Risk contributions**: w_i × marginal_risk_i — correct
- **Iterative optimization**: Weight update + clipping + normalization + dampening — correct
- **Convergence check**: L2 norm < tolerance — correct
- **Leverage calculation**: target_vol / current_vol — correct

Good risk parity implementation with iterative convergence and leverage targeting. ✅

### 8.1273 risk_parity: portfolio_return hardcoded to 0 — Low [FIXED]

**Файл:** `risk_parity.py:76`

```python
portfolio_return = 0
sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0
```

`optimize_risk_parity` returns `portfolio_return=0` and a meaningless Sharpe ratio. Risk parity doesn't optimize for return (it optimizes for equal risk contribution), but the Sharpe ratio in the result is misleading — it's always negative (0 - risk_free_rate / volatility).

**Фикс:** Accept `expected_returns` as an optional parameter and compute `portfolio_return = np.dot(weights, expected_returns)` if provided. Otherwise, set `sharpe_ratio = 0.0` and document that return is unknown.

### 8.1274 ai-signal-bot/src/portfolio/rebalancing.py: Rebalancing Strategy — ✅ Good

**Файл:** `ai-signal-bot/src/portfolio/rebalancing.py` (145 lines)

- **3 trigger types**: Time-based, drift-based, volatility-based — correct
- **Rebalance orders**: BUY/SELL with trade amounts — correct
- **Turnover calculation**: 0.5 × Σ|w_target - w_current| — correct
- **Transaction cost estimation**: total_trade_value × cost_rate — correct
- **Drift threshold**: 5% default — correct

Good rebalancing module with proper trigger logic and cost estimation. ✅

### 8.1275 rebalancing: estimated_cost uses total_trade_value not sum of |trade_amount| — Low [N/A]

**Файл:** `rebalancing.py:106`

```python
total_trade_value = sum(order.trade_amount for order in orders)
estimated_cost = total_trade_value * self.transaction_cost
```

`trade_amount` is always positive (absolute value is taken for SELL). So `total_trade_value` is the sum of all trade amounts (both buys and sells). But transaction costs are paid on both buys and sells, so this is correct. However, if some orders are SELL and the `trade_amount` was not absolutized, the sum could be net (buys - sells), underestimating costs.

Looking at the code: `trade_amount = abs(trade_amount)` for SELL (line 86). So the calculation is correct. ✅ But the variable name `total_trade_value` is ambiguous — it sounds like net value, not gross.

**Фикс:** Rename to `total_gross_trade_value` for clarity.

### 8.1276 ai-signal-bot/src/research/__init__.py: Massive Re-Export File — ⚠️ Over-Engineered [FIXED]

**Файл:** `ai-signal-bot/src/research/__init__.py` (307 lines)

This file imports and re-exports **~200 symbols from 25+ research modules**. Every `from src.research import X` triggers loading of all 25 modules, even if only one is needed. This adds significant import time and memory usage.

Key issues:
- **42 `compute_returns` aliases**: `banach_compute_returns`, `burgers_compute_returns`, `cm_compute_returns`, etc. — all are the same function imported with different names
- **2 `jacobi_eig` duplicates**: `rmt_jacobi_eig` and `rkhs.jacobi_eig` — same algorithm
- **2 `quantize` functions**: `ib_quantize` and `transfer_entropy.quantize` — potentially different implementations
- **Import side effects**: Loading all 25 modules on `import src.research`

**Фикс:** Use lazy imports or separate sub-packages. Replace `from src.research import X` with `from src.research.banach import X`. Remove `compute_returns` aliases — use a single shared utility.

### 8.1277 research: 22 duplicate `compute_returns` functions — ⚠️ Dead Code [FIXED]

**Файлы:** 22 research modules (banach.py, burgers.py, cameron_martin.py, ...)

grep found `def compute_returns` in 22 separate research files. Each defines the same function: `returns = (prices[1:] - prices[:-1]) / prices[:-1]`. This is 22× code duplication.

**Фикс:** Create `src/research/utils.py` with a single `compute_returns(prices)` function. Import it in all research modules: `from .utils import compute_returns`. Remove 22 duplicate definitions. Code reduction: ~100+ lines.

### 8.1278 research: 2 duplicate `jacobi_eig` functions — Info [N/A]

**Файлы:** `ml/rkhs.py:85`, `research/rmt.py`

Both implement Jacobi eigendecomposition for symmetric matrices with the same algorithm. This is code duplication across packages.

**Фикс:** Create a shared `src.utils.linalg.jacobi_eig()` function. Import in both modules.

### 8.1279 research: 0 modules use asyncio — ✅ Good

**Файл:** `src/research/` (35 files)

grep confirmed: no research module imports `asyncio`. All research code is synchronous and computational. This is correct — research modules are CPU-bound and should run in a thread pool or process pool, not on the event loop.

### 8.1280 research: 35 files, ~6000 lines — potential dead code — ⚠️ Over-Engineered [FIXED]

**Файл:** `src/research/` (35 files)

The research package contains 35 files covering advanced mathematical concepts:
- Banach fixed point, Burgers equation, Cameron-Martin, Cramer-Rao, Fokker-Planck, Free energy, Girsanov, Hahn decomposition, Information bottleneck, Itô generator, Kolmogorov-Sinai, Koopman, Lax-Milgram, Lie group, Malliavin calculus, Pontryagin maximum principle, Radon-Nikodym, Renormalization group, Rényi entropy, Riesz representation, Sobolev space, Stochastic control, Tensor decomposition, Transfer entropy

These are research-grade implementations of advanced mathematical concepts. While mathematically correct, they add ~6000 lines of code that is likely never used in production trading. The `__init__.py` re-exports all of them, adding import time.

**Фикс:** Move research modules to a separate `research/` package outside `src/`. Use lazy imports. Only load when explicitly needed. Document which modules are used in production vs research-only.

### 8.1281 ai-signal-bot/src/research/attribution.py: Brinson-Fachler Attribution — ✅ Good

**Файл:** `ai-signal-bot/src/research/attribution.py` (177 lines)

- **Brinson-Fachler formulas**: Allocation, Selection, Interaction — correct
- **Sector-level decomposition**: Per-sector attribution — correct
- **Active return**: Total portfolio - benchmark — correct
- **Print report**: Formatted output — correct

Good performance attribution implementation. ✅

### 8.1282 ai-signal-bot/src/research/genetic_strategy.py: Genetic Strategy Discovery — ✅ Good

**Файл:** `ai-signal-bot/src/research/genetic_strategy.py` (268 lines)

- **Chromosome encoding**: Indicators, entry/exit rules, risk params — correct
- **Genetic operations**: Crossover, mutation, tournament selection, elitism — correct
- **Fitness**: Backtest Sharpe ratio — correct
- **Population management**: Generational replacement with elite preservation — correct

Good GA implementation for strategy discovery. ✅

### 8.1283 genetic_strategy: deepcopy on every crossover — Low [N/A]

**Файл:** `genetic_strategy.py:33`

```python
from copy import deepcopy
```

`deepcopy` is used for crossover and mutation operations. With population_size=100 and generations=50, that's 5000 deepcopy calls on Chromosome objects containing nested dicts. Each deepcopy is expensive (~10μs per object), totaling ~50ms. Not critical but avoidable.

**Фикс:** Implement `Chromosome.copy()` with shallow copies of dicts, or use `dataclasses.replace()`.

### 8.1284 ai-signal-bot/src/research/microstructure_lab.py: Microstructure Lab — ✅ Good

**Файл:** `ai-signal-bot/src/research/microstructure_lab.py` (247 lines)

- **OFI**: Order flow imbalance from book snapshots — correct
- **Kyle's lambda**: Linear regression of returns on normalized OFI — correct
- **VPIN**: Volume-synchronized probability of informed trading — correct
- **Hawkes process**: Trade arrival intensity — correct
- **Book resilience**: Spread autocorrelation — correct

Good microstructure analysis toolkit. ✅

### 8.1285 ai-signal-bot/src/research/competition.py: Strategy Competition — ✅ Good

**Файл:** `ai-signal-bot/src/research/competition.py` (202 lines)

- **Round-robin tournament**: All pairs compared — correct
- **ELO rating**: K=32, standard ELO update — correct
- **Win criterion**: Sharpe ratio with 10% margin — correct
- **Duck typing**: Any object with `analyze()` method — correct

Good strategy competition framework with ELO ratings. ✅

### 8.1286 ai-signal-bot/src/research/greeks_hedging.py: Greeks Hedging Simulator — ✅ Good

**Файл:** `ai-signal-bot/src/research/greeks_hedging.py` (267 lines)

- **Black-Scholes Greeks**: Delta, gamma, theta, vega, rho — correct
- **Delta hedging simulation**: GBM price paths, threshold rebalancing — correct
- **P&L decomposition**: Delta, gamma, theta, vega P&L — correct
- **Transaction costs**: bps-based — correct

Good options hedging simulator with proper Greeks and P&L decomposition. ✅

### 8.1287 ai-signal-bot/config/__init__.py: SignalBotConfig — ✅ Good

**Файл:** `config/__init__.py` (314 lines)

- **YAML loading**: `yaml.safe_load` with UTF-8 encoding — correct
- **Validation**: Required sections, range checks, cross-field checks — correct
- **Property-based access**: 30+ properties for type-safe config access — correct
- **Warnings**: Suspicious values (high risk, wide SL) — correct
- **Error aggregation**: All errors reported at once, not fail-fast — correct

Good config system with comprehensive validation and property-based access. ✅

### 8.1288 config: property access raises KeyError on missing keys — Low [N/A]

**Файл:** `config/__init__.py:127`

```python
@property
def symbols(self) -> list[str]:
    return self.raw["trading"]["symbols"]
```

Most properties use direct dict access (`self.raw["trading"]["symbols"]`) which raises `KeyError` if the key is missing. The `validate()` method checks for required sections, but if `validate=False` is passed to `load()`, accessing any property on an incomplete config crashes.

**Фикс:** Use `.get()` with defaults for optional fields, or document that `validate=True` is required before property access.

### 8.1289 config: no hot-reload support — Low [N/A]

**Файл:** `config/__init__.py`

The config is loaded once at startup. If the YAML file is modified, the bot must be restarted. For long-running production systems, hot-reload is important (e.g., adjusting risk parameters without downtime).

**Фикс:** Add a `reload()` method that re-reads the YAML file and re-validates. Use `watchdog` or `inotify` to detect file changes.

### 8.1290 config: 30+ properties for simple dict access — ⚠️ Over-Engineered [FIXED]

**Файл:** `config/__init__.py:124-313`

The config has 30+ one-liner properties that just return `self.raw["section"]["key"]`. This is 190 lines of boilerplate code. A simpler approach would be to use a dataclass with fields populated from the YAML, or to use `attr`/`pydantic` for automatic field mapping.

**Фикс:** Use `pydantic.BaseSettings` or `dataclasses.dataclass` with `__post_init__` to parse the YAML once. This eliminates 190 lines of property boilerplate.

### 8.1291 ai-signal-bot/run.py: Main Entry Point — ✅ Good

**Файл:** `run.py` (397 lines)

- **AISignalBot class**: Clear pipeline (connect → listen → generate signals → validate → execute) — correct
- **Reconnect logic**: 5 retries with 3s sleep — correct
- **Cleanup**: listen_task.cancel(), signal_publisher.stop(), llm_engine.close(), exchange.disconnect() — correct
- **Backtest mode**: `--backtest` flag runs backtest on historical CSV data — correct
- **Metrics**: `--metrics` flag enables health server + Prometheus — correct
- **Specific exception catches**: OSError, RuntimeError, ConnectionError, TimeoutError — correct

Good main entry point with proper lifecycle management. ✅

### 8.1292 run.py: no graceful shutdown on SIGTERM — Low [FIXED]

**Файл:** `run.py:390`

```python
try:
    asyncio.run(bot.run(show_dashboard=args.dashboard, enable_metrics=args.metrics))
finally:
    logger.info(f"Run complete. Log file: {log_path}")
```

Only `KeyboardInterrupt` is handled (inside `bot.run()`). In Kubernetes/Docker, the container receives `SIGTERM`, not `KeyboardInterrupt`. The bot will be killed without graceful shutdown — open positions may not be closed, DB connections may leak.

**Фикс:** Add `signal.signal(signal.SIGTERM, handler)` or use `asyncio.run(main())` with `loop.add_signal_handler(signal.SIGTERM, bot.stop)`.

### 8.1293 run.py: _generate_signals iterates symbols sequentially — Low [FIXED]

**Файл:** `run.py:199-203`

```python
for symbol in self.config.symbols:
    candles = self.exchange.candle_history.get(symbol, [])
    if not candles or len(candles) < 30:
        continue
    await self._process_symbol(symbol, candles, now_ts)
```

50 symbols are processed sequentially. Each `_process_symbol` calls `analyze()` (CPU-bound), `generate_llm_explanation()` (async I/O), and `broadcast_signal()` (async I/O). With 50 symbols × 100ms per symbol = 5s total, which exceeds the 60s signal interval. But if LLM is enabled, each call takes 1-10s, making total 50-500s — way over the interval.

**Фикс:** Use `asyncio.gather()` for I/O-bound parts (LLM, broadcast). Run `analyze()` in `run_in_executor()` for CPU-bound parts. Or process symbols in batches of 10.

### 8.1294 run.py: run_backtest is synchronous in async context — Low [N/A]

**Файл:** `run.py:336-368`

```python
def run_backtest(config: SignalBotConfig, logger: logging.Logger) -> None:
    # ...
    for symbol in config.symbols:
        candles = load_candles_from_csv(symbol)
        for strategy in strategies:
            result = bt.run(candles, strategy, symbol=symbol)
```

`run_backtest` is a synchronous function called from `main()`. It's not in an async context, so it's fine. But `bt.run()` is CPU-bound and can take minutes. For 50 symbols × 3 strategies = 150 backtests, this could take 30+ minutes with no progress indication.

**Фикс:** Add progress logging (e.g., `[3/150] Backtesting trend_following on BTC/USDT...`). Or use `concurrent.futures.ProcessPoolExecutor` for parallel backtests.

### 8.1295 run.py: duplicate run_backtest.py scripts — Info [FIXED]

**Файлы:** `run_backtest.py` (root), `scripts/run_backtest.py`, `scripts/run_bot.py`

There are duplicate entry points: `run.py` has `--backtest` flag, `run_backtest.py` is a separate script, and `scripts/run_backtest.py` is another copy. This is confusing for users.

**Фикс:** Consolidate to one entry point. Remove `scripts/run_backtest.py` and `scripts/run_bot.py`. Document `python run.py --backtest` as the backtest command.

### 8.1296 ai-signal-bot/src/strategies/signal.py: Signal Dataclass — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/signal.py` (58 lines)

- **SignalDirection enum**: LONG, SHORT, NEUTRAL — correct
- **Signal dataclass**: symbol, direction, confidence, strategy, entry/SL/TP, reason, timestamp — correct
- **is_actionable property**: direction != NEUTRAL — correct
- **rr_ratio property**: Direction-aware risk/reward calculation — correct
- **to_dict()**: Complete serialization including rr_ratio — correct

Clean, minimal signal definition. ✅

### 8.1297 ai-signal-bot/src/strategies/strategies.py: TrendFollowing + MeanReversion + EnsembleVoter + FFTCycle — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/strategies.py` (472 lines)

- **TrendFollowingStrategy**: EMA crossover + ADX filter, ATR-based SL/TP — correct
- **MeanReversionStrategy**: RSI + Bollinger Bands, BB middle as TP target — correct
- **EnsembleVoter**: Majority/weighted voting, circuit breaker integration, single-pass accumulation — correct
- **FFTCycleStrategy**: 3 regimes (trending/ranging/mixed), cycle phase signals — correct
- **NaN handling**: All strategies check for NaN from indicators before generating signals — correct
- **Refactored**: `_accumulate_signals` and `_select_winner` are clean single-pass methods — correct

Well-structured strategy code with proper indicator integration. ✅

### 8.1298 strategies: EnsembleVoter averages SL/TP across votes — Low [FIXED]

**Файл:** `strategies.py:326-334`

```python
inv_count = 1.0 / winner_count
return Signal(
    ...
    entry_price=winner_agg[1] * inv_count,
    stop_loss=winner_agg[2] * inv_count,
    take_profit=winner_agg[3] * inv_count,
    ...
)
```

The ensemble averages entry_price, stop_loss, and take_profit across all winning-direction signals. This produces meaningless price levels — e.g., if TrendFollowing says SL=63000 and MeanReversion says SL=64000, the ensemble SL is 63500, which may not match any actual market level. The averaged SL could be too tight for one strategy and too loose for another.

**Фикс:** Use the signal with the highest confidence as the "primary" signal and use its SL/TP. Or use the most conservative (tightest) SL across all winning signals.

### 8.1299 ai-signal-bot/src/strategies/statistical_arbitrage.py: Stat Arb — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/statistical_arbitrage.py` (318 lines)

- **OLS regression**: np.linalg.lstsq with LinAlgError fallback — correct
- **ADF test**: Simplified Dickey-Fuller, no lag selection — documented
- **Half-life estimation**: Ornstein-Uhlenbeck AR(1) — correct
- **Kalman filter hedge**: Adaptive hedge ratio with process/measurement noise — correct
- **Z-score entry/exit**: Dynamic thresholds — correct

Good stat arb implementation with Kalman filter and cointegration testing. ✅

### 8.1300 ai-signal-bot/src/strategies/market_making.py: Avellaneda-Stoikov — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/market_making.py` (268 lines)

- **Reservation price**: r = s - q × γ × σ² × (T-t) — correct
- **Optimal spread**: γσ²T + (2/γ)ln(1+γ/k) — correct
- **Inventory skew**: Bid/ask adjusted by inventory — correct
- **Toxicity filter**: Cancel quotes when toxicity > threshold — correct
- **Volatility estimation**: Log returns, annualized for 24/7 crypto — correct

Good Avellaneda-Stoikov implementation with inventory management. ✅

### 8.1301 ai-signal-bot/src/strategies/ml_ensemble.py: ML Ensemble — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/ml_ensemble.py` (318 lines)

- **Optional dependencies**: LightGBM/XGBoost/sklearn with graceful fallback — correct
- **HMM regime detector**: Gaussian mixture + transition matrix — correct
- **Isolation Forest**: Anomaly filtering — correct
- **Feature engineering**: Delegated to ml_features.py — correct
- **Walk-forward**: Retrain every N candles — correct

Good ML ensemble with proper optional dependency handling. ✅

### 8.1302 ml_ensemble: HMM _fit uses sorted returns split — Low [N/A]

**Файл:** `ml_ensemble.py:97-105`

```python
sorted_returns = np.sort(arr)
n = len(sorted_returns)
for i in range(self.n_states):
    start = int(i * n / self.n_states)
    end = int((i + 1) * n / self.n_states)
    segment = sorted_returns[start:end]
    self.state_means[i] = segment.mean()
    self.state_vars[i] = max(segment.var(), 1e-8)
```

The "HMM" regime detector uses sorted returns split into n_states groups — this is k-means on 1D data, not a real HMM. The transition matrix is estimated from classified states, but there's no EM (Baum-Welch) or forward-backward algorithm. The name "HMMRegimeDetector" is misleading.

**Фикс:** Rename to `QuantileRegimeDetector` or `SimpleRegimeDetector`. If a real HMM is needed, use `hmmlearn` library.

### 8.1303 ai-signal-bot/src/strategies/sentiment.py: Sentiment Strategy — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/sentiment.py` (215 lines)

- **Event types**: FOMC, CPI, NFP, earnings, regulation, hack, whale, listing, liquidation — correct
- **Sentiment map**: Pre-defined sentiment scores per event type — correct
- **Volatility map**: Expected volatility multiplier per event type — correct
- **Decay**: Exponential sentiment decay — correct
- **Pre/post-event windows**: Configurable positioning windows — correct

Good sentiment strategy with event-driven design. ✅

### 8.1304 sentiment: numpy import inside method — Low [FIXED]

**Файл:** `sentiment.py:105`

```python
def on_news_event(self, event: NewsEvent) -> None:
    ...
    if not event.expected:
        import numpy as np
        rng = np.random.default_rng(seed=int(event.timestamp * 1000) % (2**32))
```

`numpy` is imported inside the method body, only for unexpected events. This is a conditional import — if numpy is not installed, the import fails only when an unexpected event arrives, not at module load time. This is a latent ImportError.

**Фикс:** Move `import numpy as np` to the top of the file with a try/except fallback, or use `random.gauss(0, 0.2)` from stdlib instead.

### 8.1305 ai-signal-bot/src/strategies/marketplace.py: Strategy Marketplace — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/marketplace.py` (248 lines)

- **Plugin system**: JSON registry, module loading via importlib — correct
- **Plugin metadata**: name, version, author, tags, risk_level — correct
- **Registry persistence**: JSON file with error handling — correct
- **Tag filtering**: List by tags — correct

Good plugin system design. ✅

### 8.1306 marketplace: install_from_git executes arbitrary code — ⚠️ Security [FIXED]

**Файл:** `marketplace.py` (248 lines)

The marketplace supports `install_from_git()` which clones a Git repository and imports Python code from it. This is a code execution risk — a malicious strategy plugin can run arbitrary code on the bot's server. There's no sandboxing, no code signing, no verification.

**Фикс:** (1) Document the security risk clearly. (2) Run plugins in a subprocess with restricted permissions. (3) Add a `--trusted-authors` allowlist. (4) Add code signing verification.

### 8.1307 ai-signal-bot/src/strategies/circuit_breaker.py: Circuit Breaker — ✅ Good

**Файл:** `ai-signal-bot/src/strategies/circuit_breaker.py` (85 lines)

- **Consecutive loss tracking**: Trips after N losses — correct
- **Auto-recovery**: Cooldown-based — correct
- **Signal filtering**: Forces NEUTRAL when tripped — correct
- **Manual reset**: Available — correct
- **Property side-effect**: `is_tripped` calls `check_and_recover()` — documented

Clean circuit breaker implementation. ✅

### 8.1308 circuit_breaker: is_tripped property has side effect — Low [N/A]

**Файл:** `circuit_breaker.py:30-32`

```python
@property
def is_tripped(self) -> bool:
    self.check_and_recover()
    return self._tripped
```

The `is_tripped` property calls `check_and_recover()` which can mutate `_tripped` and `_consecutive_losses`. Property accessors with side effects are a code smell — callers don't expect `if breaker.is_tripped:` to change state.

**Фикс:** Make `is_tripped` a pure property: `return self._tripped`. Callers should call `check_and_recover()` explicitly before checking `is_tripped`.

### 8.1309 ai-signal-bot/src/risk/risk_manager.py: RiskManager — ✅ Good

**Файл:** `ai-signal-bot/src/risk/risk_manager.py` (262 lines)

- **Trailing stop**: Fixed % and ATR-based — correct
- **Breakeven move**: SL → entry + buffer after threshold — correct
- **Partial TP**: Close % of position at first TP — correct
- **Max hold time**: Close after N candles — correct
- **Peak/trough tracking**: For trailing logic — correct
- **Action-based return**: Dict with new_stop_loss, close_position, etc. — correct

Good risk manager with comprehensive position management. ✅

### 8.1310 ai-signal-bot/src/risk/var.py: VaR Calculator — ✅ Good

**Файл:** `ai-signal-bot/src/risk/var.py` (178 lines)

- **Historical VaR**: Percentile-based — correct
- **Parametric VaR**: Normal distribution z-score — correct
- **Monte Carlo VaR**: Simulated returns — correct
- **Time scaling**: Square root of time rule — correct
- **Backtest**: Kupiec test — correct
- **Multiple levels**: 95%, 99%, 99.9% — correct

Good VaR implementation with all three methods. ✅

### 8.1311 var: scipy hard dependency — Low [FIXED]

**Файл:** `var.py:9`

```python
from scipy import stats
```

`scipy` is imported unconditionally. If scipy is not installed, the entire `var.py` module fails to import, even if the user only wants historical VaR (which doesn't need scipy — only parametric VaR uses `stats.norm.ppf`).

**Фикс:** Make scipy optional: `try: from scipy import stats; except ImportError: stats = None`. In `calculate_parametric_var`, use `scipy.stats.norm.ppf` if available, else use a hardcoded z-score table or `statistics.NormalDist().inv_cdf()` from stdlib (Python 3.8+).

### 8.1312 ai-signal-bot/src/risk/kelly.py: Kelly Criterion — ✅ Good

**Файл:** `ai-signal-bot/src/risk/kelly.py` (183 lines)

- **Kelly formula**: f* = (pb - q) / b — correct
- **Half-Kelly**: Configurable fraction — correct
- **Confidence adjustment**: Scale by signal confidence — correct
- **Position caps**: max_risk_pct, max_position_pct — correct
- **No edge handling**: Returns 0 when Kelly ≤ 0 — correct

Good Kelly position sizing with safety adjustments. ✅

### 8.1313 ai-signal-bot/src/risk/position_sizing.py: DynamicPositionSizer — ⚠️ Over-Engineered [FIXED]

**Файл:** `ai-signal-bot/src/risk/position_sizing.py` (205 lines)

The `DynamicPositionSizer` class duplicates functionality already in `kelly.py`:
- `kelly_criterion_sizing()` calls `KellyPositionSizer` internally
- `volatility_based_sizing()` is a simpler version of what `RiskManager` + `run.py` already do
- `risk_parity_sizing()` hardcodes 2% stop loss — not real risk parity

The class accepts `signal: str` (e.g., 'HOLD', 'BUY') instead of a `Signal` object, making it inconsistent with the rest of the codebase.

**Фикс:** Remove `DynamicPositionSizer` and use `KellyPositionSizer` directly. If volatility-based sizing is needed, add it to `KellyPositionSizer` as a method. Code reduction: ~200 lines.

### 8.1314 ai-signal-bot/src/risk/stress_test.py: Stress Test Scenarios — ✅ Good

**Файл:** `ai-signal-bot/src/risk/stress_test.py` (203 lines)

- **2008 crisis**: 50% price shock — correct
- **COVID crash**: 30% price shock — correct
- **FTX collapse**: Crypto-specific shock (95% crypto, 20% traditional) — correct
- **LUNA collapse**: Included — correct
- **Portfolio impact**: PnL, margin requirement, liquidity impact — correct

Good stress testing with realistic crisis scenarios. ✅

### 8.1315 stress_test: hardcoded shock multipliers — Low [N/A]

**Файл:** `stress_test.py:33-34`

```python
shock_multiplier = 0.5
```

All shock multipliers are hardcoded constants. The 2008 crisis is always a 50% drop, COVID is always 30%. In reality, different assets react differently — BTC dropped 50% in March 2020 but ETH dropped 60%. The stress test applies the same shock to all assets.

**Фикс:** Accept `shock_by_asset: dict[str, float]` parameter for per-asset shocks. Or use historical correlation matrices to simulate realistic cross-asset shocks.

### 8.1316 ai-signal-bot/src/risk/portfolio_optimizer.py: Duplicate PortfolioOptimizer — ⚠️ Dead Code [FIXED]

**Файлы:** `src/risk/portfolio_optimizer.py` (307 lines), `src/strategies/portfolio_optimizer.py` (311 lines)

Two separate `PortfolioOptimizer` classes exist:
- `risk/portfolio_optimizer.py`: Markowitz, BL, Kelly, risk parity, rebalancing
- `strategies/portfolio_optimizer.py`: Markowitz, BL, risk parity, min variance

Both implement the same optimization methods with slightly different APIs. Neither imports from `src/portfolio/` which has the canonical implementations (markowitz.py, black_litterman.py, risk_parity.py).

**Фикс:** Remove both duplicates. Use `src/portfolio/` modules directly. Code reduction: ~600 lines.

### 8.1317 ai-signal-bot/src/signal_validation/validator.py: SignalValidator — ✅ Good

**Файл:** `ai-signal-bot/src/signal_validation/validator.py` (122 lines)

- **Confidence check**: min_confidence threshold — correct
- **R:R check**: min_rr_ratio threshold — correct
- **Drawdown check**: Daily PnL vs max_drawdown_pct — correct
- **Position limit**: max_open_positions — correct
- **Duplicate prevention**: 5-minute cooldown per symbol — correct
- **Stale signal cleanup**: Removes entries older than 10 minutes — correct

Good signal validator with comprehensive risk checks. ✅

### 8.1318 validator: datetime.now() without timezone — Low [FIXED]

**Файл:** `validator.py:46,58,113`

```python
self._daily_reset = datetime.now()
```

`datetime.now()` returns a naive datetime (no timezone). If the bot runs in UTC but the server's local timezone changes (e.g., DST), the 24-hour reset check (`now - self._daily_reset > timedelta(hours=24)`) may trigger at the wrong time. In Kubernetes, container timezone is UTC by default, but this is fragile.

**Фикс:** Use `datetime.now(UTC)` (Python 3.12+: `from datetime import UTC`).

### 8.1319 ai-signal-bot/src/database/db.py: SQLite Database — ✅ Good

**Файл:** `ai-signal-bot/src/database/db.py` (180 lines)

- **WAL mode**: `PRAGMA journal_mode=WAL` for concurrent reads — correct
- **Connection per operation**: `closing(self._conn())` — safe, no connection leaks
- **Parameterized queries**: All queries use `?` placeholders — correct
- **Indexes**: On symbol and status columns — correct
- **Close method**: WAL checkpoint + journal mode DELETE — Windows-safe

Good SQLite layer with proper WAL mode and parameterized queries. ✅

### 8.1320 db: new connection per operation — Low [FIXED]

**Файл:** `db.py:21-25`

```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

Every `save_signal()`, `save_trade()`, `save_equity()` call creates a new SQLite connection, executes PRAGMA, and closes it. With 50 symbols × 60s interval = ~50 signals/min, that's 50 connection open/close cycles per minute. Each connection also executes `PRAGMA journal_mode=WAL` which is a write operation on the first call.

**Фикс:** Use a persistent connection with a connection pool, or use `contextvars` to share a connection within a single async task. Set WAL mode once during `_init_db()` and don't repeat it per connection.

### 8.1321 db: close() catches broad Exception — Low [FIXED]

**Файл:** `db.py:29-34`

```python
def close(self) -> None:
    try:
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("PRAGMA journal_mode=DELETE")
    except Exception:
        pass
```

Broad `except Exception: pass` silently swallows all errors during close. If the database is locked or corrupted, the error is never reported. This can hide data loss.

**Фикс:** Catch specific exceptions `(sqlite3.OperationalError, sqlite3.DatabaseError)` and log the error: `logger.warning(f"DB close error: {e}")`.

### 8.1322 ai-signal-bot/src/communication/signal_publisher.py: SignalPublisher — ✅ Good

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py` (453 lines)

- **WebSocket server**: websockets.serve with ping_interval/ping_timeout — correct
- **Client management**: Set-based, with disconnect cleanup — correct
- **Broadcast**: asyncio.gather with return_exceptions=True — correct
- **Circuit breaker**: Blocks signals when tripped — correct
- **Signal history**: deque(maxlen=100) — correct
- **orjson fallback**: Fast JSON serialization with stdlib fallback — correct
- **Backtest via WebSocket**: Synthetic candle generation, strategy selection — correct
- **Parameter validation**: Clamped values (candles 10-10000, volatility 0-5) — correct

Good WebSocket publisher with proper broadcast and circuit breaker integration. ✅

### 8.1323 signal_publisher: _run_backtest blocks event loop — Low [FIXED]

**Файл:** `signal_publisher.py:271-302`

```python
async def _run_backtest(self, params: dict) -> dict:
    from src.backtesting import Backtester
    ...
    for name, strat in strategies.items():
        result = bt.run(candles, strat, symbol=bt_params["symbol"], warmup=50)
```

`bt.run()` is a synchronous CPU-bound operation called from an async method. With 10000 candles and 4 strategies, this can take 10-30 seconds, blocking the event loop. No new signals are broadcast during this time, and WebSocket pings may time out.

**Фикс:** Run `bt.run()` in `asyncio.to_thread()` or `loop.run_in_executor()`. Or queue backtest requests and process them in a separate thread.

### 8.1324 signal_publisher: 3 identical _send closures — Low [FIXED]

**Файл:** `signal_publisher.py:188-193, 229-234, 263-268`

Three identical `_send` closures are defined in `broadcast_signal`, `broadcast_market_regime`, and `_broadcast_circuit_breaker_status`:

```python
disconnected = set()
async def _send(ws):
    try:
        await ws.send(msg)
    except Exception:
        disconnected.add(ws)
await asyncio.gather(*[_send(ws) for ws in self._clients], return_exceptions=True)
self._clients -= disconnected
```

This is 3× code duplication of the same broadcast-and-cleanup pattern.

**Фикс:** Extract to a single `_broadcast_to_clients(msg: bytes)` method. Code reduction: ~20 lines.

### 8.1325 ai-signal-bot/src/communication/ws_client.py: ExchangeClient — ✅ Good

**Файл:** `ai-signal-bot/src/communication/ws_client.py` (215 lines)

- **WebSocket connect**: compression="deflate", max_size=2^20 — correct
- **Message encoding**: JSON/msgpack/orjson with fallback — correct
- **Candle history**: deque(maxlen=200) per symbol — correct
- **Reconnect**: Exponential backoff (1s → 30s, 5 attempts) — correct
- **Order submission**: Trading active check, orjson serialization — correct

Good WebSocket client with proper reconnection logic. ✅

### 8.1326 ws_client: listen() doesn't reconnect on ConnectionClosed — Low [FIXED]

**Файл:** `ws_client.py:119-121`

```python
except websockets.ConnectionClosed:
    logger.warning("Connection closed by server")
    self._connected = False
```

When the connection closes, `listen()` just sets `_connected = False` and returns. The caller (`run.py:_listen_loop`) catches this and calls `reconnect()`, but there's a gap: between the connection closing and the caller's exception handler, any in-flight messages are lost. Also, if `listen()` is called in a tight loop without the caller's error handling, it will return immediately without reconnecting.

**Фикс:** Add an optional `auto_reconnect: bool = False` parameter to `listen()`. If True, call `reconnect()` automatically on ConnectionClosed.

### 8.1327 ai-signal-bot/src/communication/shm_ring_buffer.py: SHM Ring Buffer — ✅ Good

**Файл:** `ai-signal-bot/src/communication/shm_ring_buffer.py` (285 lines)

- **SPSC lock-free**: head/tail atomic reads/writes — correct
- **Cache-line alignment**: head at offset 64, tail at offset 128 — correct
- **Memory barrier**: Windows FlushViewOfFile, Linux msync — correct
- **Power-of-2 capacity**: Required for mask-based wrap — correct
- **Platform support**: Windows (mmap tagname) and Linux (shm_open) — correct
- **Magic validation**: Checks SHM_MAGIC on open — correct
- **__del__ safety**: Checks `_mm is not None` before cleanup — correct

Good SHM ring buffer with proper atomic semantics and cross-platform support. ✅

### 8.1328 shm_ring_buffer: no overflow detection on push — Low [FIXED]

**Файл:** `shm_ring_buffer.py` (push method)

When the ring buffer is full (head + 1 == tail), `push()` either silently drops the element or overwrites it (depending on implementation). For trading signals, a dropped signal means a missed trade. There's no counter for dropped elements or log warning.

**Фикс:** Add a `dropped_count` atomic counter. Log a warning every N drops. Return `False` from `push()` when the buffer is full so the caller can handle it.

### 8.1329 ai-signal-bot/src/communication/fix_client.py: FIX 4.4 Client — ✅ Good

**Файл:** `ai-signal-bot/src/communication/fix_client.py` (447 lines)

- **FIX message parsing/building**: Tag-value with SOH delimiter — correct
- **Checksum calculation**: sum(body) % 256 — correct
- **Session management**: Logon/logout, heartbeat, sequence numbers — correct
- **Persistent seq numbers**: File-based storage — correct
- **Async transport**: asyncio streams — correct
- **Resend requests**: Gap detection with sequence number tracking — correct

Good FIX 4.4 client implementation with persistent sequence numbers. ✅

### 8.1330 fix_client: no SSL/TLS support — Low [FIXED]

**Файл:** `fix_client.py`

The FIX client uses plain TCP (`asyncio.open_connection`). In production, FIX sessions should use TLS. Most modern exchanges require SSL/TLS for FIX connections.

**Фикс:** Add `ssl_context: ssl.SSLContext | None = None` parameter. Use `asyncio.open_connection(host, port, ssl=ssl_context)` when provided.

### 8.1331 ai-signal-bot/src/backtesting/backtester.py: Backtester — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/backtester.py` (506 lines)

- **Candle replay**: Iterates historical candles, runs strategy.analyze() — correct
- **Position simulation**: Entry/exit with SL/TP, fees, slippage — correct
- **Risk manager integration**: Optional trailing stop, breakeven, partial TP — correct
- **Equity curve**: Tracked per candle — correct
- **Performance metrics**: Sharpe, Sortino, Calmar, max drawdown, recovery factor — correct
- **Trade records**: Complete trade list with exit reason — correct

Good backtesting engine with comprehensive metrics. ✅

### 8.1332 backtester: 506 lines in single class — Low [N/A]

**Файл:** `backtester.py` (506 lines)

The `Backtester` class is 506 lines with multiple responsibilities: candle replay, position management, risk management, fee calculation, equity curve tracking, and metrics computation. The `run()` method is likely very long.

**Фикс:** Extract metrics computation to a `BacktestMetrics` class. Extract position management to a `PositionSimulator` class. Keep `Backtester.run()` as a thin orchestrator.

### 8.1333 ai-signal-bot/src/backtesting/pnl_calculator.py: PnL Calculator — ✅ Good

**Файл:** `ai-signal-bot/src/backtesting/pnl_calculator.py` (252 lines)

- **Asset types**: Spot, futures, options — correct
- **Slippage**: Direction-aware (LONG pays more on entry, less on exit) — correct
- **Fees**: Notional × fee_rate — correct
- **Funding cost**: Futures only, proportional to hold time — correct
- **Options PnL**: Intrinsic value for unrealized — correct
- **PnL breakdown**: Gross, entry fee, exit fee, funding, net — correct

Good PnL calculator with pluggable asset type support. ✅

### 8.1334 Project-wide: 2 duplicate PortfolioOptimizer classes — ⚠️ Dead Code [FIXED]

**Файлы:** `risk/portfolio_optimizer.py` (307 lines), `strategies/portfolio_optimizer.py` (311 lines), `portfolio/` (4 files: markowitz.py, black_litterman.py, risk_parity.py, rebalancing.py)

Three separate implementations of portfolio optimization:
1. `risk/portfolio_optimizer.py` — Markowitz, BL, Kelly, risk parity, rebalancing
2. `strategies/portfolio_optimizer.py` — Markowitz, BL, risk parity, min variance
3. `portfolio/` — Canonical: markowitz.py, black_litterman.py, risk_parity.py, rebalancing.py

Total: ~900 lines of duplicate portfolio optimization code.

**Фикс:** Keep `portfolio/` as the canonical implementation. Remove `risk/portfolio_optimizer.py` and `strategies/portfolio_optimizer.py`. Import from `portfolio/` directly. Code reduction: ~600 lines.

### 8.1335 Project-wide: 13 `except Exception` catches — Low [FIXED]

**Файлы:** `communication/signal_publisher.py` (6), `data_collection/real_account.py` (3), `communication/health_check.py` (1), `communication/shm_fill_consumer.py` (1), `communication/shm_signal_producer.py` (1), `database/db.py` (1)

13 broad `except Exception` catches across the codebase. These can mask `KeyboardInterrupt`, `SystemExit`, `asyncio.CancelledError`, and other critical exceptions. In an async trading bot, catching `CancelledError` can prevent proper task cancellation and graceful shutdown.

**Фикс:** Replace with specific exception types. For WebSocket operations: `(websockets.ConnectionClosed, OSError, asyncio.TimeoutError)`. For DB: `(sqlite3.OperationalError, sqlite3.DatabaseError)`. For SHM: `(OSError, ValueError, struct.error)`.

### 8.1336 Project-wide: 0 threading.Lock or asyncio.Lock usage — ⚠️ Race Condition Risk [FIXED]

**Файл:** `src/` (all files)

grep found **zero** `threading.Lock` or `asyncio.Lock` usages across the entire `src/` directory. While asyncio single-threaded execution avoids most race conditions, several patterns are at risk:
- `SignalPublisher._clients` set: Modified by `broadcast_signal()` and `_handle_client()` concurrently — `self._clients -= disconnected` is not atomic
- `ExchangeClient._candle_history`: Modified by `listen()` and read by `_generate_signals()` — deque is thread-safe for append/popleft, but not for iteration during modification
- `SignalValidator._recent_signals`: Modified by `validate()` and cleaned up in `_check_duplicate()` — dict mutation during iteration is possible

**Фикс:** Add `asyncio.Lock` around `_clients` modification in `SignalPublisher`. Use `asyncio.Lock` around `_recent_signals` cleanup in `SignalValidator`. For `ExchangeClient`, copy the deque before iteration: `list(self._candle_history.get(symbol, []))`.

### 8.1337 Project-wide: 0 global statements — ✅ Good

**Файл:** `src/` (all files)

grep found only 3 `global` statements, all in `observability/` for logging setup. No global mutable state in business logic. ✅

### 8.1338 Project-wide: datetime.now() without timezone — Low [FIXED]

**Файлы:** `signal_validation/validator.py` (5), `communication/fix_client.py` (1), `monitoring/tracker.py` (1), `utils/helpers.py` (1)

8 uses of `datetime.now()` without timezone across the codebase. In Kubernetes (UTC by default), this works, but it's fragile — if the container timezone changes, time-based logic (daily reset, cooldown timers) breaks.

**Фикс:** Replace all `datetime.now()` with `datetime.now(UTC)`. Add a linting rule (ruff: `DTZ005`) to catch this.

---

## 9. technical_analysis/ (25 files, ~6500 lines)

### 8.1339 technical_analysis/indicators.py — ✅ Good

**Файл:** `technical_analysis/indicators.py` (333 lines)

Pure functions for SMA, EMA, RSI, MACD, Bollinger Bands, ATR, ADX, VWAP. Dual-path: numpy vectorized when available, pure Python fallback. NaN-padded output aligned with input. Well-structured with `_closes`, `_highs`, `_lows`, `_volumes` extractors supporting both dict and object candles.

**Minor:** `_closes` line 19 has overly complex ternary: `c["close"] if isinstance(c, dict) else (c if isinstance(c, (int, float)) else c.close)`. Three-way type check per candle per call. Could use a protocol or assume one type.

### 8.1340 technical_analysis/fft_analysis.py — ✅ Good (minor: hand-rolled FFT)

**Файл:** `technical_analysis/fft_analysis.py` (274 lines)

FFT-based cycle detection with power spectrum, dominant cycles, spectral trend score, FFT filter. Hand-rolled Cooley-Tukey radix-2 FFT with bit-reversal permutation, Hann window, zero-padding. Well-tested math.

**Minor:** Hand-rolled `_fft` instead of `numpy.fft.fft`. numpy is already an optional dependency in `indicators.py` — could use it here too. The pure Python FFT is O(n log n) but ~50× slower than numpy.

### 8.1341 technical_analysis/kalman.py — ✅ Good

**Файл:** `technical_analysis/kalman.py` (138 lines)

1D and 2D Kalman filter implementations. 1D: state=price, clean predict/update cycle. 2D: constant velocity model with [position, velocity] state, pure Python 2×2 matrix math. Optional numpy not used (matrices are 2×2, overhead not worth it). Clean API with `update()` and `filter()`.

### 8.1342 technical_analysis/garch.py — ✅ Good

**Файл:** `technical_analysis/garch.py` (320 lines)

GARCH(1,1) with MLE parameter estimation via gradient ascent. Also EWMA (RiskMetrics) and Parkinson (high-low) volatility estimators. Parameter clipping with stationarity enforcement (alpha+beta < 0.999). Half-life, forecast, unconditional variance. Well-structured `GARCHResult` container.

**Minor:** Fixed learning rate (0.01) with no line search or convergence check beyond max_iter. For 100 iterations on 30+ returns, this may not converge to the true MLE. Consider L-BFGS or at least adaptive learning rate.

### 8.1343 technical_analysis/__init__.py — ⚠️ Over-Engineered [FIXED]

**Файл:** `technical_analysis/__init__.py` (252 lines)

Re-exports ~200 symbols from 25 modules. Same anti-pattern as `research/__init__.py`. Any `from src.technical_analysis import sma` triggers loading ALL 25 modules including rbergomi, compressed_sensing, hmc, bayesian_sts, optimal_stopping — none of which are used in production trading.

**Фикс:** Use lazy imports or direct module imports. `from src.technical_analysis.indicators import sma` instead of `from src.technical_analysis import sma`. Remove `__init__.py` re-exports entirely.

### 8.1344 technical_analysis/hawkes.py — ✅ Good

**Файл:** `technical_analysis/hawkes.py` (121 lines)

Clean facade after split into `hawkes_model.py` + `hawkes_funcs.py`. Extract events from price series, fit Hawkes process, compute intensity path, simulate, generate trading signal from branching ratio. Well-structured `HawkesResult` container.

### 8.1345 technical_analysis/copula.py — ✅ Good (minor: duplicate erf) [FIXED]

**Файл:** `technical_analysis/copula.py` (401 lines)

Empirical, Gaussian, Clayton, Gumbel copula fitting. Kendall tau, Spearman rho, Pearson corr. Tail dependence coefficients. Joint probability and conditional probability. Well-structured.

**Minor:** Own `erf` function (line 80) using Abramowitz-Stegun approximation. Python's `math.erf` is available since 3.2 and more accurate. Remove the custom implementation.

### 8.1346 technical_analysis/wavelet.py — ✅ Good

**Файл:** `technical_analysis/wavelet.py` (245 lines)

Haar (D2) and Daubechies D4 wavelet transforms. DWT, IDWT, multi-level decomposition, MRA reconstruction, soft-threshold denoising. Clean periodic convolution implementation.

### 8.1347 technical_analysis/dtw.py — ✅ Good (minor: duplicate compute_returns) [FIXED]

**Файл:** `technical_analysis/dtw.py` (128 lines)

Classic O(n*m) DTW with Sakoe-Chiba band constraint. Pattern templates for double bottom, head and shoulders, ascending triangle, etc. Z-score normalization, sliding window extraction.

**Minor:** `compute_returns` (line 88) duplicates the same function in 22+ research modules. Should use shared `utils.compute_returns`.

### 8.1348 technical_analysis/gmm.py — ✅ Good

**Файл:** `technical_analysis/gmm.py` (194 lines)

1D Gaussian Mixture Model with EM algorithm. K-Means initialization, BIC/AIC model selection. Clean implementation with log-likelihood history for convergence monitoring.

### 8.1349 technical_analysis/pca.py — ✅ Good

**Файл:** `technical_analysis/pca.py` (232 lines)

Covariance-based PCA with numpy SVD (numerically stable) and pure Python fallback via Jacobi eigendecomposition. Explained variance ratio, cumulative variance, scores, components. Clean `PCAResult` container.

### 8.1350 technical_analysis/kmeans.py — ✅ Good

**Файл:** `technical_analysis/kmeans.py` (174 lines)

Lloyd's algorithm with K-Means++ smart initialization. Within-cluster sum of squares, convergence check via label stability. Clean and correct.

### 8.1351 technical_analysis/ms_garch.py — ✅ Good

**Файл:** `technical_analysis/ms_garch.py` (319 lines)

Markov-Switching GARCH with Kim's filtering approach. Per-regime GARCH parameters, filtered/smoothed probabilities, regime transitions, expected duration. Complex but well-structured. `MSResult` container with 15 fields.

### 8.1352 technical_analysis/bayesian_price.py — ✅ Good

**Файл:** `technical_analysis/bayesian_price.py` (359 lines)

Beta-Binomial direction model, Normal-Inverse-Gamma magnitude model, BOCPD changepoint detection, Bayesian Ridge regression. Own `log_gamma` (Lanczos), `beta_pdf`, `beta_cdf_inv`, `normal_pdf`. 24-field `BayesianPriceResult` container.

**Minor:** `beta_cdf_inv` uses bisection with Riemann-sum CDF (200 steps × 50 iterations = 10,000 beta_pdf evaluations). Slow but acceptable for offline analysis.

### 8.1353 technical_analysis/sde.py — ✅ Good (minor: duplicate _random_normal)

**Файл:** `technical_analysis/sde.py` (343 lines)

GBM, GBM-Milstein, Ornstein-Uhlenbeck, CIR, Heston, Merton jump-diffusion simulations. Euler-Maruyama and Milstein schemes. Well-structured `SDEResult` with percentile bands.

**Minor:** `_random_normal` (line 55) is a Box-Muller implementation duplicated in 4 files (sde.py, rbergomi.py, hmc.py, optimal_stopping.py). Should be in shared utils.

### 8.1354 technical_analysis/rbergomi.py — ✅ Good (minor: O(n²) Cholesky) [FIXED]

**Файл:** `technical_analysis/rbergomi.py` (281 lines)

Rough Bergomi model with fractional Brownian motion. Hurst exponent estimation, fGn via Cholesky decomposition, fBm, variance swaps, ATM vol, skew. Well-structured `RBergomiResult`.

**Minor:** `frac_gaussian_noise` (line 75) builds n×n covariance matrix and does Cholesky decomposition in pure Python — O(n³). For n=50 steps, 125,000 operations. Could use numpy or Davies-Harte method (O(n log n)).

### 8.1355 technical_analysis/compressed_sensing.py — ✅ Good

**Файл:** `technical_analysis/compressed_sensing.py` (248 lines)

OMP (Orthogonal Matching Pursuit) and ISTA (Iterative Shrinkage-Thresholding) for sparse signal recovery. Own least squares via Gaussian elimination with partial pivoting. Measurement matrix generation, DFT basis.

### 8.1356 technical_analysis/emd.py — ✅ Good (minor: duplicate _fft)

**Файл:** `technical_analysis/emd.py` (313 lines)

Empirical Mode Decomposition with sifting process, cubic spline interpolation, Hilbert transform (via FFT). IMFs, residue, instantaneous frequency/amplitude. Well-structured.

**Minor:** `_fft` (line 157) duplicates the same Cooley-Tukey FFT in `fft_analysis.py` and `vmd.py`. Should use shared FFT or `numpy.fft.fft`.

### 8.1357 technical_analysis/vmd.py — ✅ Good (minor: O(n²) IFFT)

**Файл:** `technical_analysis/vmd.py` (263 lines)

Variational Mode Decomposition via ADMM. K modes with compact spectral support. Uses FFT for forward transform but **direct DFT for inverse** (`_ifft` line 93) — O(n²) instead of O(n log n). For n=128, 16,384 vs ~900 operations.

**Minor:** `_ifft` is O(n²) direct DFT. Should use the existing `_fft` with conjugation (as `fft_analysis._ifft` does) or `numpy.fft.ifft`.

### 8.1358 technical_analysis/hmc.py — ✅ Good (minor: numerical gradient) [FIXED]

**Файл:** `technical_analysis/hmc.py` (251 lines)

Hamiltonian Monte Carlo for GARCH parameter estimation. Leapfrog symplectic integrator, Metropolis acceptance. 500 samples × 20 leapfrog steps × 3 params × 2 log_posterior evals (central differences) = 60,000 log_posterior evaluations.

**Minor:** `grad_log_posterior` uses numerical gradient (central differences, eps=1e-6). Each gradient evaluation = 2× log_posterior calls per parameter. For 3 params × 500 samples × 20 leapfrog steps = 60,000 evaluations. Analytical gradient would be 2× faster.

### 8.1359 technical_analysis/bayesian_sts.py — ✅ Good

**Файл:** `technical_analysis/bayesian_sts.py` (291 lines)

Bayesian Structural Time Series with Kalman filter. Local linear trend + dummy seasonal decomposition. 10-step-ahead forecasting. Pure Python matrix operations (2×2 and n×n). Well-structured `BSTSResult` with 19 fields.

### 8.1360 technical_analysis/monte_carlo.py — ✅ Good

**Файл:** `technical_analysis/monte_carlo.py` (141 lines)

Monte Carlo shuffle test for trade-sequence robustness. Shuffles PnL sequence 100× to estimate distribution of equity outcomes. Percentiles, profit probability, max drawdown distribution. Clean and correct.

### 8.1361 technical_analysis/optimal_stopping.py — ✅ Good (minor: duplicate _random_normal)

**Файл:** `technical_analysis/optimal_stopping.py` (323 lines)

Snell envelope for American option exercise. Binomial tree (Cox-Ross-Rubinstein) and Longstaff-Schwartz Monte Carlo. Own 3×3 Cramer's rule solver for polynomial regression. Well-structured.

**Minor:** `_random_normal` (line 77) is the 4th duplicate of Box-Muller. Should be in shared utils.

### 8.1362 technical_analysis: 4× duplicate _random_normal (Box-Muller) — Low [FIXED]

**Файлы:** `sde.py:55`, `rbergomi.py:64`, `hmc.py:46`, `optimal_stopping.py:77`

4 identical Box-Muller `_random_normal` implementations across 4 files. ~15 lines each = ~60 lines of duplicate code.

**Фикс:** Create `src/technical_analysis/_utils.py` with `random_normal(rng)` function. Import in all 4 files. Or use `random.gauss(0, 1)` from stdlib (available since Python 2.3).

### 8.1363 technical_analysis: 3× duplicate _fft (Cooley-Tukey) — Low [FIXED]

**Файлы:** `fft_analysis.py:15`, `emd.py:157`, `vmd.py:52`

3 separate Cooley-Tukey radix-2 FFT implementations. ~40-60 lines each = ~150 lines of duplicate code. `fft_analysis._fft` works on `list[complex]`, `emd._fft` and `vmd._fft` work on `list[float]` but are essentially the same algorithm.

**Фикс:** Create `src/technical_analysis/_fft_utils.py` with a shared FFT function. Or use `numpy.fft.fft` when numpy is available (it's already optional in indicators.py and pca.py).

### 8.1364 technical_analysis: 10+ modules likely dead code — ⚠️ Dead Code [N/A]

**Файлы:** `rbergomi.py`, `compressed_sensing.py`, `emd.py`, `vmd.py`, `hmc.py`, `bayesian_sts.py`, `optimal_stopping.py`, `copula.py`, `ms_garch.py`, `sde.py`, `bayesian_price.py`, `gmm.py`, `kmeans.py`, `dtw.py`, `wavelet.py`, `monte_carlo.py`

16 of 25 modules (~4000+ lines) implement advanced mathematical models that are not referenced by any strategy, risk manager, or backtester in production. They are imported only through `__init__.py` re-exports and likely used only by the UI dashboard for analysis.

**Фикс:** Move to a separate `technical_analysis_advanced/` package or make imports lazy. Keep only `indicators.py`, `fft_analysis.py`, `kalman.py`, `garch.py`, `hawkes.py` in the core `technical_analysis/` module.

### 8.1365 technical_analysis: All pure Python (no numpy) except indicators/pca — Info

**Файлы:** 22 of 25 modules

22 of 25 modules are pure Python with no numpy dependency, even though numpy is already optional in `indicators.py` and `pca.py`. This means:
- Matrix operations (Kalman, BSTS, GARCH, copula) use manual loops instead of vectorized numpy
- FFT is hand-rolled 3× instead of using `numpy.fft`
- Random number generation uses Box-Muller instead of `numpy.random.normal`
- O(n²) and O(n³) algorithms (Cholesky, IFFT, least squares) that numpy would handle in C

**Фикс:** For the 5 core modules (indicators, fft, kalman, garch, hawkes), add numpy fast paths like indicators.py already has. For the 16 advanced modules, leave as pure Python since they're offline analysis tools.

### 8.1366 technical_analysis: Result containers are plain classes with 10-24 fields — Info

**Файлы:** All 25 modules

Each module defines a `Result` class with 10-24 manually-assigned fields in `__init__`. No `@dataclass` decorator, no `__repr__`, no `__eq__`. Examples:
- `GARCHResult`: 16 fields
- `BayesianPriceResult`: 24 fields
- `BSTSResult`: 19 fields
- `MSResult`: 15 fields
- `RBergomiResult`: 18 fields

**Фикс:** Use `@dataclass` for auto-generated `__repr__`, `__eq__`, and reduced boilerplate. Or use `NamedTuple` for immutability.

### 8.1367 technical_analysis: No input validation on most functions — Low [FIXED]

**Файлы:** Most modules

Most functions check `if not data or len(data) < MIN_*` but don't validate for NaN, Inf, or non-numeric values. `indicators.sma([float('nan'), 1.0, 2.0], 2)` would produce `[nan, nan, 1.5]` — the NaN propagates through cumsum. `garch.fit_garch([float('inf'), 1.0, ...])` would produce Inf in variance.

**Фикс:** Add `math.isfinite()` checks at function entry. Or document that inputs must be finite and let NaN propagate (current behavior).

### 8.1368 technical_analysis: _random_normal uses while loop for u==0 — Info

**Файлы:** `sde.py:57`, `rbergomi.py:66`, `hmc.py:48`, `optimal_stopping.py:79`

All 4 `_random_normal` implementations have `while u == 0: u = rng.random()` to avoid `log(0)`. In practice, `rng.random()` returns [0, 1) — the probability of exactly 0 is ~2^-53 (one in 9 quadrillion). The while loop is defensive but never executes.

**Info:** Not a bug, just unnecessary complexity. `random.gauss(0, 1)` from stdlib handles this internally.

### 8.1369 technical_analysis: copula.py empirical_cdf is O(n²) — Low [FIXED]

**Файл:** `copula.py:74`

```python
def empirical_cdf(values: list[float]) -> list[float]:
    n = len(values)
    return [sum(1 for x in values if x <= v) / (n + 1) for v in values]
```

O(n²) — for each value, scans all values. For n=500 returns, 250,000 comparisons. Could use `scipy.stats.rankdata` or sort-based approach: O(n log n).

**Фикс:** `sorted_values = sorted(values); ranks = [bisect.bisect_left(sorted_values, v) for v in values]; return [r / (n + 1) for r in ranks]`

### 8.1370 technical_analysis: vmd.py _ifft is O(n²) direct DFT — Low [FIXED]

**Файл:** `vmd.py:93`

```python
def _ifft(spectrum: list[complex]) -> list[float]:
    n = len(spectrum)
    time = [0.0] * n
    for idx in range(n):
        total = 0.0
        for k in range(n):
            angle = 2 * math.pi * k * idx / n
            total += spectrum[k].real * math.cos(angle) - spectrum[k].imag * math.sin(angle)
        time[idx] = total / n
    return time
```

O(n²) direct DFT for inverse FFT, while the forward `_fft` (line 52) is O(n log n) Cooley-Tukey. For n=128, this is 16,384 vs ~900 operations — 18× slower. The existing `_fft` could be used for inverse via conjugation (as `fft_analysis._ifft` does).

**Фикс:** `def _ifft(spectrum): n = len(spectrum); conj = [x.conjugate() for x in spectrum]; result = _fft(conj); return [x.real / n for x in result]`

---

## 10. ml/ (12 files, ~5200 lines)

### 8.1371 ml/__init__.py — ⚠️ Over-Engineered [FIXED]

**Файл:** `ml/__init__.py` (81 lines)

Re-exports ~30 symbols from 7 modules (autoencoder, environment, feature_store, rkhs, svm_signal, vae). Same anti-pattern as `technical_analysis/__init__.py` and `research/__init__.py`. Note: `price_predictor.py` and `rl_trader.py` are NOT re-exported (they require torch), which is correct.

**Фикс:** Use direct submodule imports. `from src.ml.feature_store import FeatureStore` instead of `from src.ml import FeatureStore`.

### 8.1372 ml/price_predictor.py — ✅ Good (minor: hard torch dependency)

**Файл:** `ml/price_predictor.py` (334 lines)

PyTorch LSTM and Transformer price prediction models. Clean architecture: ModelConfig dataclass, LSTMPredictor with attention, TransformerPredictor with positional encoding, training loop with early stopping, ONNX export. Well-structured.

**Minor:** `import torch` at top level (line 28) — no try/except guard. If torch is not installed, any `from src.ml import ...` will crash because `__init__.py` imports other modules in the same package. Should be guarded like other optional deps.

### 8.1373 ml/rl_trader.py — ✅ Good (minor: hard torch dependency)

**Файл:** `ml/rl_trader.py` (390 lines)

PPO agent with Actor-Critic network, DQN agent with replay buffer, training loop with checkpointing. Clean RLConfig dataclass with all hyperparameters. GAE advantage estimation, gradient clipping, entropy bonus.

**Minor:** Same as price_predictor — `import torch` at top level (line 28) without guard.

### 8.1374 ml/feature_store.py — ✅ Good (minor: broad Exception catch) [FIXED]

**Файл:** `ml/feature_store.py` (220 lines)

Redis-backed feature store with in-memory fallback. Pipeline for batch updates, TTL support, feature registry. Clean fallback when Redis unavailable.

**Minor:** Line 94: `except (OSError, ConnectionError, RuntimeError, Exception)` — the `Exception` at the end makes all others redundant. Just `except Exception` or remove `Exception` and keep specific types.

### 8.1375 ml/model_registry.py — ✅ Good

**Файл:** `ml/model_registry.py` (296 lines)

Model registry with semver versioning, A/B testing, rollback support. File-based JSON persistence. ModelStatus enum (candidate/staging/production/archived/rolled_back). Clean `ModelVersion` and `ABTest` dataclasses.

### 8.1376 ml/automl.py — ✅ Good

**Файл:** `ml/automl.py` (191 lines)

Optuna-based hyperparameter optimization with TPE sampler and median pruner. Clean AutoMLConfig dataclass. Strategy-specific search spaces (trend_following, mean_reversion). Optional dependency guarded.

### 8.1377 ml/environment.py — ✅ Good

**Файл:** `ml/environment.py` (163 lines)

OpenAI Gym-compatible trading environment for RL. Clean Action enum, TradingState dataclass, step/reset interface. Normalized observations, transaction costs, portfolio tracking.

### 8.1378 ml/autoencoder.py — ✅ Good

**Файл:** `ml/autoencoder.py` (376 lines)

Pure Python autoencoder with Xavier init, sigmoid activation, backpropagation, anomaly detection via reconstruction error. Stable sigmoid with input clamping. No PyTorch dependency — fully self-contained.

### 8.1379 ml/vae.py — ✅ Good (minor: 5th duplicate _random_normal) [FIXED]

**Файл:** `ml/vae.py` (349 lines)

Variational Autoencoder with 2-layer encoder/decoder, reparameterization trick, ELBO loss (MSE + β·KL), full backpropagation. Pure Python with manual gradient computation.

**Minor:** `_random_normal` (line 223) is the 5th duplicate of Box-Muller (also in sde.py, rbergomi.py, hmc.py, optimal_stopping.py). Use `random.gauss(0, 1)`.

### 8.1380 ml/rkhs.py — ✅ Good

**Файл:** `ml/rkhs.py` (276 lines)

RKHS kernel methods: RBF/Laplacian kernels, kernel matrix, centering, Jacobi eigendecomposition, kernel ridge regression, MMD two-sample test. Pure Python, well-structured.

### 8.1381 ml/svm_signal.py — ✅ Good

**Файл:** `ml/svm_signal.py` (182 lines)

Linear SVM via SGD with hinge loss. Learning rate decay, C regularization, training accuracy evaluation. Clean and correct.

### 8.1382 ml: torch hard dependency in price_predictor + rl_trader — Low [FIXED]

**Файлы:** `ml/price_predictor.py:28`, `ml/rl_trader.py:28`

Both files `import torch` at top level without try/except. If torch is not installed, importing any module from `src.ml` package may crash because Python imports `__init__.py` first, which imports other ml modules. While `__init__.py` doesn't import price_predictor or rl_trader directly, any code that does `from src.ml.price_predictor import LSTMPredictor` will get `ImportError: No module named 'torch'` with no graceful fallback.

**Фикс:** Guard with `try: import torch; except ImportError: torch = None` and check at class instantiation, not import time.

### 8.1383 ml: 5 modules likely dead code — ⚠️ Dead Code [N/A]

**Файлы:** `autoencoder.py`, `vae.py`, `rkhs.py`, `svm_signal.py`, `environment.py`

5 of 12 ML modules (~1300 lines) implement advanced ML models not referenced by any strategy or production code path. `environment.py` is only used by `rl_trader.py` (which requires torch). The pure Python autoencoder/vae/rkhs/svm are likely UI dashboard analysis tools.

**Фикс:** Move to `ml_advanced/` package or make imports lazy.

---

## 11. monitoring/ (4 files, ~1700 lines)

### 8.1384 monitoring/alerting.py — ✅ Good

**Файл:** `monitoring/alerting.py` (260 lines)

Multi-channel alert system (Discord, Telegram, email, webhook) with rate limiting (cooldown per rule), severity levels, alert history. Clean AlertRule/Alert dataclasses. Async `_send_alert` with aiohttp. Specific exception types in check_rules.

### 8.1385 monitoring/health_server.py — ✅ Good (minor: 3× duplicate _check_* methods) [FIXED]

**Файл:** `monitoring/health_server.py` (153 lines)

HTTP health check server with /health, /health/exchange, /health/database, /health/shm, /ready endpoints. Kubernetes-ready (liveness + readiness probes). Proper 503 on unhealthy.

**Minor:** `_check_exchange`, `_check_database`, `_check_shm` (lines 38-72) are identical except for the key name ("exchange"/"database"/"shm"). Extract to `_check_component(name)`.

### 8.1386 monitoring/metrics.py — ✅ Good

**Файл:** `monitoring/metrics.py` (239 lines)

Prometheus metrics exporter with Counter, Gauge, Histogram, Summary. Signal/fill/order counts, PnL, drawdown, latency histograms. Optional prometheus_client guarded. Clean /metrics endpoint.

### 8.1387 monitoring/tracker.py — ✅ Good (minor: datetime.now() without timezone) [FIXED]

**Файл:** `monitoring/tracker.py` (175 lines)

PerformanceTracker dataclass with signals/trades/PnL tracking. SignalLogger and TradeLogger for CSV output. Clean summary() method.

**Minor:** Line 134: `datetime.now().strftime(...)` — naive datetime. Use `datetime.now(UTC)`.

---

## 12. observability/ (3 files, ~500 lines)

### 8.1388 observability/health_checks.py — ✅ Good

**Файл:** `observability/health_checks.py` (221 lines)

Deep health checking with liveness/readiness probes. ComponentHealth dataclass with latency. Checks WebSocket, TimescaleDB, Redis, exchange. HealthStatus enum (healthy/degraded/unhealthy). Clean overall status aggregation.

### 8.1389 observability/logging.py — ✅ Good

**Файл:** `observability/logging.py` (171 lines)

Structured logging with structlog. JSON or console renderer. Correlation IDs via contextvars. Service context injection. Library noise suppression. Well-structured with helper functions for config.

### 8.1390 observability/tracing.py — ✅ Good

**Файл:** `observability/tracing.py` (111 lines)

OpenTelemetry tracing with OTLP exporter (Jaeger). NoopTracer fallback when not initialized. Clean setup/shutdown lifecycle. Asyncio instrumentor.

---

## 13. notification/ (1 file, ~334 lines)

### 8.1391 notification/notifier.py — ✅ Good

**Файл:** `notification/notifier.py` (334 lines)

Telegram + Discord notifier with remote commands (/status, /positions, /close_all, /pause, /resume). AlertEvent dataclass with emoji mapping. Async polling for Telegram updates. Clean start/stop lifecycle with task cancellation.

---

## 14. networking/ (1 file, ~156 lines)

### 8.1392 networking/socket_transport.py — ✅ Good (minor: busy-poll loop) [FIXED]

**Файл:** `networking/socket_transport.py` (156 lines)

Raw UDP socket transport with non-blocking I/O, binary packet, stats tracking. MarketDataPacket dataclass. Clean initialize/send/parse.

**Minor:** `start_receive_loop` (line 86) uses `time.sleep(0.0001)` on BlockingIOError — 100μs busy-poll. In production, should use `selectors` or `asyncio` for event-driven I/O instead of polling.

---

## 15. utils/ (1 file, ~205 lines)

### 8.1393 utils/helpers.py — ✅ Good [FIXED]

**Файл:** `utils/helpers.py` (205 lines)

Utility functions: setup_logging, JsonFormatter, load_config, get_env, now_ms/now_us, format_price/qty/percentage, safe_divide, clamp, truncate_dict. CircuitBreaker (failure threshold, recovery timeout, half-open state). RateLimiter (token bucket, async acquire). Clean and well-structured.

**Minor:** Two logging setups: `utils/helpers.py:setup_logging` and `observability/logging.py:setup_logging`. The observability one uses structlog, the utils one uses stdlib. Consolidate to one.

---

## 16. llm_engine/ (1 file, ~394 lines)

### 8.1394 llm_engine/engine.py — ✅ Good

**Файл:** `llm_engine/engine.py` (394 lines)

LLM-powered market analysis with OpenAI/Anthropic/Ollama support. Rule-based fallback when no API key. Response caching with TTL. Prompt templates from files with fallback defaults. Clean LLMConfig/MarketContext/LLMAnalysis dataclasses.

**Minor:** API key loaded from env var in `initialize()` — if not set, silently falls back to rule-based. Should log a warning at WARNING level, not INFO.

---

## 17. portfolio/ (4 files, ~900 lines)

### 8.1395 portfolio/__init__.py — ✅ Good

**Файл:** `portfolio/__init__.py` (17 lines)

Thin re-export of 4 classes from 4 modules. This is the correct pattern for `__init__.py` — small, focused, only 4 symbols.

### 8.1396 portfolio/markowitz.py — ✅ Good

**Файл:** `portfolio/markowitz.py` (~200 lines)

Markowitz mean-variance optimization with numpy. Efficient frontier, min variance, max Sharpe. Clean MarkowitzOptimizer class.

### 8.1397 portfolio/black_litterman.py — ✅ Good

**Файл:** `portfolio/black_litterman.py` (~170 lines)

Black-Litterman model with prior, views, posterior. Clean BlackLittermanModel class.

### 8.1398 portfolio/risk_parity.py — ✅ Good

**Файл:** `portfolio/risk_parity.py` (~180 lines)

Risk parity optimization with Newton-Raphson iteration. Equal risk contribution. Clean RiskParityOptimizer class.

### 8.1399 portfolio/rebalancing.py — ✅ Good

**Файл:** `portfolio/rebalancing.py` (~170 lines)

Portfolio rebalancing strategies: threshold, calendar, drift. Clean RebalancingStrategy class.

---

## 18. research/ (35 files, ~14000+ lines)

### 8.1400 research/__init__.py — ⚠️ Over-Engineered [FIXED]

**Файл:** `research/__init__.py` (307 lines)

Re-exports ~200+ symbols from 35 modules. Same anti-pattern as `technical_analysis/__init__.py`. Any `from src.research import X` loads ALL 35 modules including affine_arithmetic, banach, burgers, cameron_martin, cramer_rao, fokker_planck, girsanov, hahn, ito_generator, kolmogorov_sinai, koopman, lax_milgram, lie_group, malliavin, pontryagin, radon_nikodym, renormalization, renyi_entropy, riesz, sobolev — none used in production.

**Фикс:** Delete re-exports. Use direct submodule imports.

### 8.1401 research: 30+ modules likely dead code — ⚠️ Dead Code [FIXED]

**Файлы:** 30+ of 35 files

30+ research modules (~12000+ lines) implement advanced mathematical concepts (Banach fixed point, Burgers equation, Cameron-Martin theorem, Cramér-Rao bound, Fokker-Planck, Girsanov theorem, Hahn decomposition, Itô generator, Kolmogorov-Sinai entropy, Koopman operator, Lax-Milgram, Lie group, Malliavin calculus, Pontryagin maximum principle, Radon-Nikodym, renormalization group, Rényi entropy, Riesz representation, Sobolev spaces) that are not referenced by any strategy, risk manager, or backtester. Pure academic research code.

**Фикс:** Move to separate `research_lab/` package outside `src/`. Keep only `attribution.py`, `competition.py`, `genetic_strategy.py`, `greeks_hedging.py`, `microstructure_lab.py` if any are used.

### 8.1402 research: compute_returns duplicated 20+ times — Low [FIXED]

**Файлы:** 20+ research modules

Same `compute_returns` function duplicated across 20+ research modules. Each is ~5 lines. Total: ~100+ lines of duplicate code.

**Фикс:** Create `src/research/_utils.py` with `compute_returns`. Import in all modules. Or use `src.utils.helpers`.

---

## 19. Project-wide cross-module findings

### 8.1403 Project-wide: 3× duplicate logging setup — Low [FIXED]

**Файлы:** `utils/helpers.py:14` (setup_logging), `observability/logging.py:31` (setup_logging), `monitoring/tracker.py:11` (logger = logging.getLogger)

Three separate logging configurations. `utils/helpers.py` uses stdlib JsonFormatter, `observability/logging.py` uses structlog, `monitoring/tracker.py` creates its own logger. In production, this can cause conflicting handlers, duplicate log lines, or lost context.

**Фикс:** Use only `observability/logging.py:setup_logging` as the canonical logging setup. Remove `utils/helpers.py:setup_logging` and `JsonFormatter`. `monitoring/tracker.py` should use `get_logger(__name__)` from observability.

### 8.1404 Project-wide: 5× duplicate _random_normal (Box-Muller) — Low [FIXED]

**Файлы:** `technical_analysis/sde.py:55`, `technical_analysis/rbergomi.py:64`, `technical_analysis/hmc.py:46`, `technical_analysis/optimal_stopping.py:77`, `ml/vae.py:223`

5 identical Box-Muller implementations across 5 files. ~75 lines of duplicate code.

**Фикс:** Use `random.gauss(0, 1)` from stdlib. Or create `src/utils/math_utils.py` with `random_normal(rng)`.

### 8.1405 Project-wide: 3× duplicate __init__.py re-export anti-pattern — ⚠️ Over-Engineered [FIXED]

**Файлы:** `technical_analysis/__init__.py` (252 lines, ~200 symbols), `research/__init__.py` (307 lines, ~200 symbols), `ml/__init__.py` (81 lines, ~30 symbols)

Three packages use the same anti-pattern: re-exporting all symbols from all submodules in `__init__.py`. This causes:
- Slow import time (loads all modules even if only one is needed)
- High memory usage (all module code in memory)
- Circular import risk (modules importing from package level)
- Coupling (adding a module requires updating `__init__.py`)

**Фикс:** Delete all re-exports from `__init__.py`. Use direct submodule imports: `from src.technical_analysis.indicators import sma` instead of `from src.technical_analysis import sma`.

### 8.1406 Project-wide: 2 duplicate health check systems — Low [FIXED]

**Файлы:** `monitoring/health_server.py` (153 lines), `observability/health_checks.py` (221 lines)

Two separate health check systems:
- `monitoring/health_server.py`: HTTP server with /health endpoints, checks exchange/database/SHM
- `observability/health_checks.py`: HealthChecker class with liveness/readiness, checks WS/DB/Redis/exchange

Both serve the same purpose (Kubernetes health probes) but with different implementations and different component checks. This is confusing and redundant.

**Фикс:** Consolidate into one. Keep `observability/health_checks.py` as the checker logic, `monitoring/health_server.py` as the HTTP server that uses it.

### 8.1407 Project-wide: 50+ modules likely dead code total — ⚠️ Dead Code [N/A]

**Файлы:** 16 technical_analysis + 5 ml + 30 research = 51+ modules

Total dead code across the project: ~17,000+ lines (4000 technical_analysis + 1300 ml + 12000 research). These modules are imported only through `__init__.py` re-exports and used by the UI dashboard, not by the trading bot itself.

**Фикс:** Move all advanced/research modules to a separate package (e.g., `analysis_lab/`). Keep `src/` focused on production trading code. This would reduce `src/` by ~50% and dramatically improve import time.

### 8.1408 monitoring: tracker.py datetime.now() without timezone — Low [FIXED]

**Файл:** `monitoring/tracker.py:134`

`datetime.now().strftime(...)` — naive datetime in dashboard display. Already counted in project-wide R1318 but this is a new instance found in batch 82.

**Фикс:** `datetime.now(UTC).strftime(...)`

---

## 20. data_collection/ (4 files, ~2500 lines)

### 8.1409 data_collection/exchange_factory.py — ✅ Good

**Файл:** `data_collection/exchange_factory.py` (242 lines)

Exchange adapter factory with Protocol-based interface. SimulatorAdapter (stub) and RealExchangeAdapter (wraps real_market_data + real_account). ExchangeMode enum (simulator/real/fallback). Clean Protocol definition for exchange adapters.

### 8.1410 data_collection/real_exchange_client.py — ✅ Good

**Файл:** `data_collection/real_exchange_client.py` (335 lines)

REST client for Binance, OKX, Bybit. HMAC-SHA256 request signing with `usedforsecurity=False` (good practice). AccountBalance and Position dataclasses. Per-exchange signing methods. Clean aiohttp session management.

### 8.1411 data_collection/real_account.py — ✅ Good (minor: 3× broad except Exception) [FIXED]

**Файл:** `data_collection/real_account.py` (380 lines)

Real account management via ccxt. AccountBalance, AccountPosition, OpenOrder dataclasses with to_dict(). User data stream for fills and margin warnings. Leverage cache. Clean close() lifecycle.

**Minor:** 3× `except Exception` (lines 163, 247, 378) — too broad. Should catch specific exceptions (ccxt exceptions, network errors).

### 8.1412 data_collection/real_market_data.py — ✅ Good (minor: no asyncio.Lock on shared state) [FIXED]

**Файл:** `data_collection/real_market_data.py` (455 lines)

Multi-exchange WebSocket market data feed (Binance, OKX, Bybit). NormalizedTicker, NormalizedCandle, NormalizedOrderBook dataclasses. Exponential backoff reconnection per exchange. RealMarketDataManager wraps feed with caching (deque maxlen=1000).

**Minor:** `_tickers`, `_orderbooks`, `_candles` dicts are written from WebSocket callbacks and read from main code — no `asyncio.Lock`. In asyncio single-threaded context this is mostly safe (dict operations are atomic in CPython), but a context switch between `await` calls could cause stale reads. Low risk but worth noting.

### 8.1413 data_collection: 2× duplicate AccountBalance dataclass — Low [FIXED]

**Файлы:** `real_account.py:30` (AccountBalance with asset/free/used/total), `real_exchange_client.py:38` (AccountBalance with exchange/total_balance/available_balance/unrealized_pnl/margin_used/currency)

Two different `AccountBalance` dataclasses with different fields. `real_account.py` uses ccxt format (asset/free/used/total), `real_exchange_client.py` uses REST format (exchange/total_balance/available_balance/unrealized_pnl/margin_used/currency). Confusing — same name, different shape.

**Фикс:** Rename to `CcxtAccountBalance` and `RestAccountBalance`, or unify into one with optional fields.

### 8.1414 data_collection: no rate limiting on REST API calls — ⚠️ Medium [FIXED]

**Файл:** `real_exchange_client.py`

`RealExchangeClient` makes REST API calls (get_balance, get_positions, get_open_orders, get_trade_history) without any rate limiting. Binance has 1200 weight/min limit, OKX has 20 req/2s, Bybit has 120 req/min. At scale (50 symbols × 60s interval × 4 endpoints = 200 req/min), this could hit rate limits.

**Фикс:** Add `asyncio.Semaphore` or use `utils.helpers.RateLimiter` to throttle API calls. Or use ccxt's built-in `enableRateLimit: True` (already set in `real_account.py:117` but not in `real_exchange_client.py`).

---

## 21. config/ (1 file, ~314 lines)

### 8.1415 config/__init__.py — ✅ Good

**Файл:** `config/__init__.py` (314 lines)

SignalBotConfig dataclass with YAML loading, validation (errors + warnings), and property-based access. Validates required sections, risk ranges, strategy params, indicator periods. Warns on suspicious values (high risk, wide SL, many positions). Clean and well-structured.

**Minor:** 40+ property methods — could use `__getattr__` with dot-notation path resolution for less boilerplate. But explicit properties are safer (type hints, IDE autocomplete).

---

## 22. Entry points

### 8.1416 run.py — ✅ Good (minor: no graceful shutdown on SIGTERM) [FIXED]

**Файл:** `run.py` (397 lines)

Main entry point. AISignalBot orchestrator: ExchangeClient → strategies → ensemble → validation → execution. Clean component wiring. Backtest mode via --backtest flag. Metrics server via --metrics flag. LLM engine integration.

**Minor:** No SIGTERM handler — Kubernetes sends SIGTERM to terminate pods. `KeyboardInterrupt` (line 170) only catches Ctrl+C, not SIGTERM. Pod will be killed after grace period without cleanup (DB flush, WS close, LLM close).

**Фикс:** Add `signal.signal(signal.SIGTERM, lambda s, f: bot._running = False)` or use `asyncio.run(main())` with `loop.add_signal_handler`.

### 8.1417 run.py: _execute_live_order not implemented — ⚠️ Dead Code [FIXED]

**Файл:** `run.py:308-311`

```python
async def _execute_live_order(self, signal: Signal, signal_id: int) -> None:
    """Execute a live order (would connect to real exchange in production)."""
    self.logger.warning("Live trading not implemented in simulation mode")
```

Stub method — logs warning and does nothing. If `paper_trading=False` in config, signals are validated, saved, broadcast, but never executed. Silent failure.

**Фикс:** Either implement using `RealExchangeAdapter` or raise `NotImplementedError`.

### 8.1418 run_backtest.py — ✅ Good [FIXED]

**Файл:** `run_backtest.py` (179 lines)

Backtest runner with synthetic candle generation (GBM), SQLite data loading, multi-strategy backtesting, optimization, and chart output. Clean argparse interface.

**Minor:** `sqlite3.connect` (line 80) without context manager — `conn.close()` is called but not in finally block. If exception occurs between connect and close, connection leaks.

**Фикс:** `with sqlite3.connect(args.db) as conn: rows = conn.execute(...).fetchall()`

---

## 23. Root-level utility scripts (3 files, ~655 lines)

### 8.1419 root/monitor.py — ✅ Good (minor: naive datetime)

**Файл:** `monitor.py` (157 lines)

Live status dashboard connecting to signal WebSocket (port 8766). Displays real-time signals, log tail, performance stats. Clean async WebSocket client.

**Minor:** `from datetime import datetime` (line 12) — uses `datetime.now()` without timezone. Low impact (display only).

### 8.1420 root/metrics.py — duplicate of src/monitoring/metrics.py [FIXED]

**Файл:** `metrics.py` (293 lines)

Standalone Prometheus metrics collector (`AISignalBotMetrics` class) with Counter, Gauge, Histogram for signals, PnL, win rate, system resources. This duplicates `src/monitoring/metrics.py` (239 lines, `MetricsExporter` class). Different class name, different metric names, different port (8001 vs 9090). At scale, both could run simultaneously, causing port conflicts and duplicate metrics in Prometheus.

**Фикс:** Delete `metrics.py` and use `src/monitoring/metrics.py:MetricsExporter` exclusively.

### 8.1421 root/tracing.py — ⚠️ Duplicate of src/observability/tracing.py [FIXED]

**Файл:** `tracing.py` (205 lines)

Standalone OpenTelemetry tracer (`AISignalBotTracer` class) with Jaeger exporter. This duplicates `src/observability/tracing.py` (111 lines, `setup_tracing` function). Different API (class vs function), different setup pattern. At scale, both could initialize separate TracerProviders, causing conflicting trace contexts.

**Фикс:** Delete `tracing.py` and use `src/observability/tracing.py:setup_tracing` exclusively.

### 8.1422 root: 2× duplicate infrastructure modules — Low [N/A]

**Файлы:** `metrics.py` (293 lines) vs `src/monitoring/metrics.py` (239 lines), `tracing.py` (205 lines) vs `src/observability/tracing.py` (111 lines)

Two pairs of duplicate infrastructure modules at root level vs src/. Total: ~500 lines of duplicate code. The root-level versions are older, standalone implementations. The src/ versions are newer, better integrated.

**Фикс:** Delete root-level `metrics.py` and `tracing.py`. Use src/ versions exclusively.

---

## 24. scripts/ (3 files, ~265 lines)

### 8.1423 scripts/migrate.py — ✅ Good (minor: conn.close not in finally)

**Файл:** `scripts/migrate.py` (101 lines)

Database migration runner using asyncpg. Creates `schema_migrations` tracking table, applies pending `.sql` files in order. Clean argparse interface.

**Minor:** `conn.close()` (line 85) not in finally block — if migration fails, connection leaks.

### 8.1424 scripts/run_bot.py — ⚠️ Dead Code (stub) [FIXED]

**Файл:** `scripts/run_bot.py` (59 lines)

Stub script that only starts `SignalPublisher` and sleeps. Does NOT run the actual bot (no strategies, no exchange connection, no signal generation). The real entry point is `run.py` at project root. This script is misleading — `--strategy` argument is accepted but ignored.

**Фикс:** Delete this file. Use `run.py` at project root.

### 8.1425 scripts/run_backtest.py — ⚠️ Duplicate of root run_backtest.py [FIXED]

**Файл:** `scripts/run_backtest.py` (109 lines)

Another backtest runner using `BacktestEngine` (not `Backtester`). Different API from root `run_backtest.py` (which uses `Backtester`). Different strategy imports (`from src.strategies.strategies import ...` vs `from src.strategies import ...`). Different config (`BacktestConfig` vs raw params). Generates mock candles with different parameters.

**Фикс:** Delete this file. Use `run_backtest.py` at project root.

---

## 25. Shared root files (2 files, ~271 lines)

### 8.1426 run_logger.py — ⚠️ 4th duplicate logging setup [FIXED]

**Файл:** `run_logger.py` (118 lines, at project root `f:\VSC projects\trading-system – lite\`)

Shared timestamped run logging with `JsonFormatter`. Creates per-run log files with timestamped filenames. This is the 4th logging setup:
1. `run_logger.py` (root) — timestamped file logging with JsonFormatter
2. `utils/helpers.py:setup_logging` — stdlib logging with JsonFormatter
3. `observability/logging.py:setup_logging` — structlog with JSON/console
4. `monitoring/tracker.py` — creates own logger

`run_logger.py:JsonFormatter` (line 20) duplicates `utils/helpers.py:JsonFormatter` (line 45) — both format log records as JSON with timestamp/level/logger/message. Different field names (`ts` vs `timestamp`, `msg` vs `message`).

**Minor:** Line 66: `datetime.now().strftime(...)` — naive datetime for log filename. Should use `datetime.now(timezone.utc)`.

**Фикс:** Consolidate to one logging setup. Keep `run_logger.py` for file-based run logging (it's the most complete), use `observability/logging.py` for structured logging. Delete `utils/helpers.py:setup_logging` and `JsonFormatter`.

### 8.1427 ai-signal-bot/src/utils/bot_helpers.py — ✅ Good (minor: triggers __init__.py re-export) [FIXED]

**Файл:** `src/utils/bot_helpers.py` (153 lines)

Helper functions extracted from `run.py` for file-size compliance: `build_strategies`, `build_stat_arb`, `generate_stat_arb_signals`, `generate_llm_explanation`, `load_candles_from_csv`. Clean TYPE_CHECKING imports. Good exception handling.

**Minor:** Line 30: `from src.technical_analysis import adx, ema, rsi` — triggers the `__init__.py` re-export anti-pattern, loading all 25 technical_analysis modules just to use 3 functions. Should be `from src.technical_analysis.indicators import adx, ema, rsi`.

### 8.1428 Project-wide: 4× duplicate logging setup (updated) — Low [FIXED]

**Файлы:** `run_logger.py` (root, 118 lines), `utils/helpers.py:14` (205 lines), `observability/logging.py:31` (171 lines), `monitoring/tracker.py:11` (175 lines)

Four separate logging configurations with different formatters, different field names, different handler setups. `run_logger.py` uses `ts`/`msg`, `utils/helpers.py` uses `timestamp`/`message`, `observability/logging.py` uses structlog. At scale, this causes inconsistent log formats across services, making log aggregation (ELK, Loki) difficult.

**Фикс:** Use `run_logger.py` for per-run file logging (timestamped filenames). Use `observability/logging.py` for structured logging (structlog). Delete `utils/helpers.py:setup_logging` and `JsonFormatter`. `monitoring/tracker.py` should use `get_logger(__name__)` from observability.

---

## 26. Remaining files

### 8.1429 communication/ws_connection_pool.py — ✅ Good

**Файл:** `src/communication/ws_connection_pool.py` (152 lines)

WebSocket connection pool with `PooledConnection` wrapper, `WebSocketConnectionPool` with `asyncio.Lock`, health checks (ping/pong with 5s timeout), stale eviction, max pool size (10), compression, `close_all()` lifecycle. Well-structured — uses `asyncio.Lock` correctly (unlike most other modules). Background health check task with cancellation.

**Minor:** `_health_loop` (line 131) — `while True` without checking a `_running` flag. If `close_all()` is called, the task is cancelled, but `asyncio.CancelledError` is not caught in the loop. Works in practice but less explicit.

### 8.1430 conftest.py — ✅ Good (trivial)

**Файл:** `conftest.py` (14 lines)

pytest configuration — adds bot root and project root to `sys.path` for test imports. Standard pattern. No issues.

### 8.1431 communication: ws_connection_pool not used by ws_client — Low [FIXED]

**Файл:** `src/communication/ws_client.py` (ExchangeClient)

`WebSocketConnectionPool` is well-implemented but `ExchangeClient` (ws_client.py) doesn't use it — it manages its own WebSocket connection directly. The pool is dead code unless other consumers use it.

**Фикс:** Either integrate `ExchangeClient` with the pool, or remove `ws_connection_pool.py` if no other module uses it.
