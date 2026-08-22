# Code Audit — Over-engineering, Dead Code, Missing Infrastructure

> Аудит: 22 авг 2026. Проверено grep'ом по всему `ai-signal-bot/src/`.

---

## 1. ДУБЛИРОВАНИЕ (over-engineering)

### 1.1 PortfolioOptimizer — 3 РАЗНЫХ РЕАЛИЗАЦИИ
| Файл | Строк | Использование |
|------|-------|---------------|
| `src/risk/portfolio_optimizer.py` | 307 | только тесты (`test_portfolio_optimizer.py`) |
| `src/strategies/portfolio_optimizer.py` | 311 | только тесты (`test_risk.py`) |
| `src/portfolio/` (markowitz, black_litterman, risk_parity, rebalancing) | ~400 | только тесты |

**Фикс:** оставить одну (лучшая — `src/portfolio/`), остальные удалить. Тесты переписать на одну.

### 1.2 VaR/CVaR — 2 РЕАЛИЗАЦИИ
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/risk/var.py` + `src/risk/cvar.py` | VaRCalculator, CVaRCalculator | только тесты |
| `src/risk/var_stress_test.py` | RiskAnalyzer (historical_var, cvar, mc_var...) | только тесты |

**Фикс:** оставить `var.py`+`cvar.py` (чище API), `var_stress_test.py` удалить или сделать обёрткой.

### 1.3 StressTest — 2 РЕАЛИЗАЦИИ
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/risk/stress_test.py` | StressTestScenario | только тесты |
| `src/risk/var_stress_test.py` | RiskAnalyzer.stress_test | только тесты |

**Фикс:** оставить одну, удалить другую.

### 1.4 Backtester — 2 РЕАЛИЗАЦИИ
| Файл | Строк | Использование |
|------|-------|---------------|
| `src/backtesting/backtester.py` | 506 | run.py, run_backtest.py, signal_publisher |
| `src/backtesting/backtest_engine.py` | 321 | scripts/run_backtest.py, walk_forward.py |

Оба имеют `BacktestResult` с пересекающимися полями. `backtest_comparison.py` использует `backtester.BacktestResult`, а `walk_forward.py` — `backtest_engine.BacktestResult`.

**Фикс:** объединить в один. `backtest_engine.py` — более современный (PnLCalculator), но `backtester.py` используется в проде. Оставить `backtester.py`, `backtest_engine.py` удалить, `walk_forward.py` переписать на `backtester.py`.

### 1.5 CircuitBreaker — 3 КОПИИ
| Файл | Использование |
|------|---------------|
| `src/communication/circuit_breaker.py` | signal_publisher.py |
| `src/strategies/circuit_breaker.py` | strategies.py (re-export) |
| `src/utils/helpers.py` (CircuitBreaker) | helpers |

**Фикс:** оставить `communication/circuit_breaker.py`, остальные — re-export или удалить.

### 1.6 Metrics — 2 РЕАЛИЗАЦИИ
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/communication/metrics_server.py` | MetricsCollector | signal_publisher.py |
| `src/monitoring/metrics.py` | MetricsExporter | run.py (--metrics) |

**Фикс:** объединить. Имена метрик в `metrics_server.py` (`ai_signal_bot_*`) совпадают с alert rules, а в `metrics.py` (`trading_*`) — нет. Оставить `metrics_server.py` как основной.

### 1.7 Health — 3 РЕАЛИЗАЦИИ
| Файл | Класс | Использование |
|------|-------|---------------|
| `src/communication/health_check.py` | HealthAggregator | НИКТО |
| `src/monitoring/health_server.py` | HealthServer | run.py (--metrics) |
| `src/observability/health_checks.py` | HealthChecker | НИКТО |

**Фикс:** оставить `monitoring/health_server.py` (работает), подключить `communication/health_check.py` (агрегатор), `observability/health_checks.py` удалить.

### 1.8 Дублирование внутри signal_publisher.py
- `_build_strategies()` (строки 364-391) — дублирует `bot_helpers.build_strategies()`
- `_generate_synthetic_candles()` (строки 331-362) — GBM генерация, дублирует MarketSimulator из exchange_simulator
- `_EnsembleAdapter` (строки 42-52) — дублирует EnsembleVoter
- `_format_backtest_result()` (строки 393-411) — дублирует `BacktestResult.to_dict()`

**Фикс:** `_build_strategies` → import из bot_helpers; `_generate_synthetic_candles` → оставить (нужна для backtest по запросу, но вынести в utils); `_EnsembleAdapter` → использовать EnsembleVoter напрямую; `_format_backtest_result` → использовать to_dict().

### 1.9 Дублирование внутри backtester.py
- Drawdown-логика дублируется: `_process_risk_update` (строки 118-120) и `_track_equity_and_drawdown` (строки 147-149) — одинаковый расчёт
- `_handle_signal_reversal` и `_check_entry` — одинаковый `init_position` блок (строки 250-257 и 272-280)
- Position sizing в `_open_position` (строки 366-378) дублирует `run.py._execute_paper_order` (строки 268-277)
- `print_report` и `print_comparison` — дублирование форматирования

**Фикс:** вынести drawdown в один метод, init_position в один метод, position sizing в `src/utils/position_sizing.py`.

---

## 2. МЁРТВЫЙ КОД (написан, никто не использует)

### 2.1 ML модули — ВСЕ 10 мёртвые
`automl.py`, `autoencoder.py`, `environment.py`, `feature_store.py`, `model_registry.py`, `price_predictor.py`, `rkhs.py`, `rl_trader.py`, `svm_signal.py`, `vae.py`
- Ноль импортов извне `src/ml/`
- Ноль тестов
- `lstm_model.py`, `transformer_model.py`, `rl_agent.py` уже удалены

**Фикс:** удалить всю `src/ml/` (Day 9 плана).

### 2.2 Research модули — ВСЕ 35 ACADEMIC
- Ноль импортов из production кода
- Только тесты
- Research модули не импортируют друг друга

**Фикс:** оставить как educational (Day 5 плана).

### 2.3 Communication — мёртвые модули
| Файл | Строк | Использование |
|------|-------|---------------|
| `fix_client.py` | 329 | только test_fix_client.py |
| `ws_connection_pool.py` | ~150 | только test_ws_connection_pool.py |
| `shm_fill_consumer.py` | ~80 | никто |
| `shm_market_data_writer.py` | ~120 | никто |
| `shm_ring_buffer.py` | ~300 | никто |
| `shm_signal_producer.py` | ~90 | никто |

**Фикс:** удалить (Day 8 плана).

### 2.4 Networking — мёртвый
`src/networking/socket_transport.py` — никто не импортирует. `dpdk_transport.py` уже удалён.

**Фикс:** удалить `src/networking/`.

### 2.5 Стратегии — мёртвые
| Файл | Использование |
|------|---------------|
| `marketplace.py` | только test_marketplace.py |
| `cross_exchange_arb.py` | только test_cross_exchange_arb.py |
| `funding_arb_detector.py` | только test_ml_ensemble_funding.py |

**Фикс:** удалить или оставить как research.

### 2.6 Прочие мёртвые пакеты
| Пакет | Использование |
|-------|---------------|
| `src/portfolio/` | только тесты |
| `src/pricing/` (volatility_surface) | только тесты |
| `src/notification/` (notifier) | никто |
| `src/data_collection/` (real_exchange_client, real_market_data, timescaledb_client) | никто |

**Фикс:** аудит каждого — удалить или оставить как research.

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

### 3.1 backtester.py (506 строк → ~350)
- Drawdown: 2 копии → 1 метод (-15 строк)
- init_position: 2 копии → 1 метод (-10 строк)
- print_report + print_comparison: общий форматтер (-20 строк)
- `_process_risk_update` + `_track_equity_and_drawdown`: объединить (-15 строк)

### 3.2 signal_publisher.py (453 строк → ~350)
- `_build_strategies` → import из bot_helpers (-30 строк)
- `_format_backtest_result` → to_dict() (-20 строк)
- `_EnsembleAdapter` → EnsembleVoter напрямую (-10 строк)
- `_generate_synthetic_candles` → вынести в utils (-30 строк)

### 3.3 strategies.py (472 строк → ~400)
- Дублирование Signal-конструкторов NEUTRAL (3+ копии) → helper `_neutral(symbol, reason)`
- `_crossover_signal` + `_trend_continuation_signal` — проверить пересечение логики

### 3.4 risk/ (var.py + cvar.py + var_stress_test.py + stress_test.py ≈ 800 строк → ~400)
- Одна реализация VaR/CVaR
- Одна реализация StressTest

---

## 4. ЧЕГО НЕТ (что в нормальных системах есть)

### 4.1 Кеширование — НЕТ
- Индикаторы (EMA, RSI, ADX, ATR) пересчитываются с нуля на каждый `analyze()` для 50 символов × 5 стратегий каждые 60s
- Нет инкрементального обновления (O(1) per new candle)
- **Фикс:** `IndicatorCache` — хранить последнее значение + обновлять только новую свечу

### 4.2 Шардирование/партиционирование БД — НЕТ
- SQLite одна таблица `equity_curve` растёт бесконечно
- Нет партиционирования по времени, нет retention policy
- **Фикс:** партиционирование по месяцам + cleanup старых записей

### 4.3 Rate limiting — НЕТ
- Нет ограничения сигналов/ордеров в секунду
- SignalPublisher шлёт всем клиентам без backpressure
- **Фикс:** RateLimiter (в utils/helpers.py уже есть!) — подключить к broadcast_signal

### 4.4 Idempotency ордеров — НЕТ
- `submit_order` без `client_order_id` — повторная отправка = двойной ордер
- **Фикс:** client_order_id + dedup на стороне exchange

### 4.5 Retry/backoff для ордеров — НЕТ
- WS connect имеет backoff, но `submit_order` — нет
- **Фикс:** retry с backoff для submit_order

### 4.6 Graceful shutdown — ЧАСТИЧНО
- run.py: `finally` блок есть, но нет SIGTERM-обработки (только KeyboardInterrupt)
- **Фикс:** signal handler (SIGTERM/SIGINT) → drain → close

### 4.7 Structured logging — ЧАСТИЧНО
- `LOG_FORMAT=json` через env, но по умолчанию text
- **Фикс:** JSON по умолчанию в prod

### 4.8 Tracing — НЕ ПОДКЛЮЧЕН
- `observability/tracing.py` написан, но `setup_tracing()` нигде не вызывается
- **Фикс:** вызвать в run.py с флагом --tracing

### 4.9 Валидация сообщений — НЕТ
- WS сообщения не валидируются по схеме
- **Фикс:** pydantic-схемы для signal/order/backtest сообщений

### 4.10 Health endpoints — НЕ ПОЛНОСТЬЮ
- Exchange Simulator: health.py написан, но НЕ запускается (см. RELIABILITY_PLAN.md)
- Web UI: нет /health
- **Фикс:** см. RELIABILITY_PLAN.md

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

### 8.1 Race condition: `_clients` set без блокировки

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

### 8.5 Нет socket buffer tuning в C++ — Low

**Файлы:** `hft-trade-bot/src/`

Не найдено `SO_RCVBUF`/`SO_SNDBUF`/`setsockopt` в C++ коде. WebSocket клиент использует системные defaults (обычно 64-128KB). Для HFT это может быть недостаточно при bursts.

**Фикс:** `setsockopt(SOL_SOCKET, SO_RCVBUF, 1<<20)` (1MB) в WSClient.

### 8.6 Нет DB busy_timeout — Medium

**Файл:** `ai-signal-bot/src/database/db.py:22`

```python
conn = sqlite3.connect(self.path)
```

Нет `timeout=` параметра. По умолчанию 5 секунд. При WAL mode concurrent writes могут ждать до 5s, затем `sqlite3.OperationalError: database is locked`.

**Фикс:** `sqlite3.connect(self.path, timeout=30)` + `conn.execute("PRAGMA busy_timeout=30000")`.

### 8.7 Нет DB connection pooling — Medium

**Файл:** `ai-signal-bot/src/database/db.py`

Каждый метод (`save_signal`, `save_trade`, `save_equity`, `get_stats`) открывает новое соединение через `self._conn()`. В цикле бота это 3-4 соединения per signal cycle (60s). Не проблема для 1 бота, но при масштабировании на multiple bots → много соединений.

**Фикс:** Persistent connection с reconnect logic, или connection pool.

### 8.8 Resource leak: aiohttp ClientSession без close в alerting.py

**Файл:** `ai-signal-bot/src/monitoring/alerting.py:168, 190, 205`
**Severity:** Medium

```python
async with aiohttp.ClientSession() as session:
    async with session.post(url, json=payload) as resp:
        ...
```

Каждая отправка алерта (Discord/Telegram/Webhook) создаёт новую `ClientSession`. При частых алертах (например, circuit breaker tripping → 10 алертов/min) это утечка connector resources. `async with` закрывает сессию, но создание/уничтожение TCP connector — overhead.

**Фикс:** Одна persistent `ClientSession` в `__init__`, `close()` в `stop()`.

### 8.9 Docker healthchecks — TCP вместо HTTP (подтверждено)

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

### 8.12 Type hints: `_EnsembleAdapter.analyze` без return type — Low

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py:50`

```python
def analyze(self, symbol: str, candles: list):  # ← нет -> Signal
```

В то время как все стратегии в `strategies.py` имеют `-> Signal`, `_EnsembleAdapter` не указывает return type. Это мешает статическому анализу и IDE autocomplete.

### 8.13 Magic numbers в signal_publisher.py — Low

**Файл:** `ai-signal-bot/src/communication/signal_publisher.py`

- `deque(maxlen=100)` — hardcoded, не из config
- `await asyncio.sleep(5)` в CB broadcast — hardcoded interval
- `random.Random(42)` — seed для synthetic candles, не configurable

### 8.14 Helm probes — нет (подтверждено)

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

### 8.16 Missing DB indexes for timestamp queries — Medium

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

### 8.22 No log rotation — Medium

**Файлы:** весь проект

Grep for `RotatingFileHandler|TimedRotatingFileHandler|logrotate|maxBytes` = 0 matches.

All logging goes to files in `logs/` without rotation. In production, log files grow unbounded. After a month of 24/7 operation with 50 symbols × 60s interval, log files can reach GBs. Disk fills up → bot crashes.

**Фикс:** `logging.handlers.RotatingFileHandler(maxBytes=50_000_000, backupCount=5)` or `TimedRotatingFileHandler(when='midnight', backupCount=30)`.

### 8.23 Float precision in financial calculations — Medium

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

### 8.24 No input validation on WS messages — Medium

**Файлы:** `ai-signal-bot/src/communication/` — grep for `pydantic|validate|validator|schema` = 0 matches

WebSocket messages are accepted as raw JSON without schema validation. Any client can send any JSON structure. Malformed messages cause `KeyError`/`TypeError` in downstream code.

**Фикс:** Pydantic models for incoming WS messages: `SignalMsg`, `OrderMsg`, `SubscribeMsg`. Validate before processing.

### 8.25 No DB retention/cleanup policy — Medium

**Файлы:** `ai-signal-bot/src/database/db.py` — grep for `DELETE FROM|TRUNCATE|retention|cleanup|purge` = 0 matches

`signals`, `trades`, `equity_curve` tables grow forever. No `DELETE FROM signals WHERE timestamp < ?` cleanup. After a year of 50 symbols × 60s interval:
- signals: ~2.6M rows
- equity_curve: ~525K rows
- trades: depends on activity

**Фикс:** `cleanup_old(retention_days: int)` method: `DELETE FROM signals WHERE timestamp < ?` + `PRAGMA optimize`.

### 8.26 No timezone handling — Low

**Файлы:** `ai-signal-bot/src/` — grep for `timezone|tzinfo|utcnow|datetime.utcnow` = 0 matches

All timestamps use `int(time.time())` (Unix epoch). This is timezone-agnostic (always UTC), which is actually fine. But there's no `datetime` with `tzinfo` for human-readable logs or reports. If someone adds `datetime.now()` without timezone, it'll use local time silently.

### 8.27 No auth on health/metrics endpoints — Low

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

### 8.36 No network timeout in YAML config — Medium

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

### 8.38 Alert rules: no HFT-specific alerts — Low

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

### 8.40 CI: npm audit doesn't fail on high — Low

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

### 8.42 No config schema validation — Medium

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

### 8.44 Dockerfile healthcheck — TCP vs HTTP (revisited)

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

### 8.46 Dead code: `tracing.py` — never imported

**Файл:** `ai-signal-bot/src/observability/tracing.py` (111 lines)

Grep for `setup_tracing|get_tracer` across entire project = 0 matches (outside `tracing.py` itself). The module is fully implemented (OpenTelemetry + Jaeger, no-op fallback, graceful shutdown) but never used. 111 lines of dead code.

**Фикс:** Either integrate `setup_tracing()` into `run.py` startup, or remove the file.

### 8.47 Test coverage gaps — Medium

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

### 8.48 No signal handling / graceful shutdown — High

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

### 8.49 No WebSocket keepalive (ping/pong) — Medium

**Файлы:** `ai-signal-bot/src/communication/signal_publisher.py`, `ws_client.py`

Grep for `ping|pong|keepalive|keep_alive` across entire project = 0 matches.

Without ping/pong:
- Silent disconnects go undetected (client thinks it's connected, server thinks it's connected, but TCP is dead)
- Firewalls/load balancers drop idle connections after 60s
- Client never knows the server is gone until it tries to send

**Фикс:** `websockets.serve(..., ping_interval=20, ping_timeout=10)` or implement custom keepalive.

### 8.50 No reconnection backoff with jitter — Medium

**Файлы:** `ai-signal-bot/src/communication/ws_client.py`

Grep for `jitter|backoff|exponential` across entire project = 0 matches.

The Rust executor (`hft-executor/src/lib.rs:140`) has proper exponential backoff: `backoff = (backoff * 2).min(Duration::from_secs(10))`. But no jitter — if 100 clients disconnect simultaneously, they all reconnect at exactly the same interval → thundering herd.

The Python WS client has no backoff at all — it reconnects immediately, which can overwhelm the server on mass disconnect.

**Фикс:** `delay = min(base_delay * 2**attempt, max_delay) + random.uniform(0, jitter)`.

### 8.51 Three CircuitBreaker implementations — code duplication — Medium

**Файлы:**
1. `src/communication/circuit_breaker.py` — full state machine (CLOSED/OPEN/HALF_OPEN), dataclass config, tests
2. `src/strategies/circuit_breaker.py` — simpler version (tripped/cooldown), different API
3. `src/utils/helpers.py:145` — yet another version (closed/open/half_open as string), different API

Three different implementations of the same pattern, with different APIs, different config parameters, different state names. Only #1 and #2 are actually used. #3 is exported via `utils/__init__.py` but never imported by any module.

**Фикс:** Consolidate into one `CircuitBreaker` in `src/communication/circuit_breaker.py`. Delete #2 and #3. Update imports.

### 8.52 RateLimiter — implemented but unused — dead code

**Файл:** `src/utils/helpers.py:179-205`

`RateLimiter` is implemented (token bucket, async acquire) and exported via `utils/__init__.py`, but grep for `RateLimiter` outside `helpers.py` and `__init__.py` shows it's only used in tests (`test_utils.py`). Never used in production code — no rate limiting on:
- WS message processing
- Order submission
- Exchange API calls
- Signal generation

### 8.53 Global mutable state — Low

**Файлы:** `src/observability/logging.py:38` (`global _configured`), `src/observability/tracing.py:35` (`global _tracer, _initialized`)

Global state for singleton initialization. Not thread-safe (no lock around `_configured` check). In asyncio single-thread context this is fine, but if someone adds `threading.Thread` for CPU-bound work, double-init is possible.

### 8.54 No asyncio task management — Medium

**Файлы:** `ai-signal-bot/src/`

Grep for `asyncio.gather|asyncio.create_task|ensure_future` = 0 matches in `src/`. The signal_publisher uses `asyncio.gather` (found in earlier audit), but no general task management pattern. No `asyncio.TaskGroup` (Python 3.11+) for structured concurrency. No task cancellation on shutdown. Background tasks (circuit breaker broadcast, metrics) are fire-and-forget — if they crash, nobody knows.

**Фикс:** Use `asyncio.TaskGroup` for structured concurrency. Store task references and cancel on shutdown. Add `task.add_done_callback(callback)` to log crashes.

### 8.55 Health check: no dependency depth check — Medium

**Файл:** `ai-signal-bot/src/communication/health_check.py`

The `HealthAggregator` checks if other services respond on `/health`, but the bot's own `/health` endpoint (if it exists) doesn't check:
- DB connectivity (can it read/write?)
- Exchange connectivity (is it receiving candles?)
- WS client count (is anyone listening?)
- Internal queue depth (is it backlogged?)

A "healthy" status while DB is locked or exchange is disconnected is misleading. The health check should verify actual dependencies, not just HTTP 200.

### 8.56 Health aggregator: aiohttp session per check — Medium

**Файл:** `ai-signal-bot/src/communication/health_check.py:53`

```python
async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3.0)) as session:
    async with session.get(url) as resp:
```

Same pattern as `alerting.py` (§8.8) — new `ClientSession` per health check call. The aggregator checks 3 services every interval, creating 3 new sessions each time. TCP connector overhead × 3 × every check interval.

**Фикс:** Persistent `ClientSession` on the `HealthAggregator` instance, closed in `stop()`.

### 8.57 No retry on transient failures — Medium

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

### 8.59 Health aggregator binds to 0.0.0.0 — Low

**Файл:** `ai-signal-bot/src/communication/health_check.py:116`

```python
self._site = web.TCPSite(self._runner, "0.0.0.0", self.port)  # nosec: B104
```

The `# nosec: B104` annotation acknowledges the security issue (binding to all interfaces). This means the health endpoint is accessible from any network interface, not just localhost. In Docker with port mapping, this is fine. In direct deployment, anyone can reach it.

### 8.60 Code reduction opportunities — Summary

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

### 8.61 F-string logging — not structured — Low

**Файлы:** весь `ai-signal-bot/src/`

Grep for `logger.info(f` = 30+ matches across all modules. All logging uses f-string interpolation:
```python
logger.info(f"Client connected: {remote} (total: {len(self._clients)})")
```

This produces flat strings that can't be parsed by log aggregation (Loki, ELK, Datadog). To search for "client connected" you need regex, not structured queries.

**Фикс:** `logger.info("Client connected", extra={"remote": remote, "total_clients": len(self._clients)})` or use `structlog` for key-value logging.

### 8.62 SHM: no cleanup on crash — Medium

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

### 8.64 Dual metrics systems — Medium

**Файлы:**
1. `src/communication/metrics_server.py` — custom text format, manual Prometheus exposition
2. `src/monitoring/metrics.py` — `prometheus_client` library with Counter/Gauge/Histogram

Two separate metrics systems with overlapping metrics:
- `metrics_server.py`: `ai_signal_bot_signals_sent_total`
- `metrics.py`: `trading_signals_total` (same concept, different name)

Prometheus sees both, but dashboards/alerts need to know which one to query. The custom one (`metrics_server.py`) doesn't support histograms (no latency distribution), while `metrics.py` does.

**Фикс:** Consolidate to `prometheus_client` only. Remove `metrics_server.py` custom implementation.

### 8.65 No asyncio.Lock on shared mutable state — Medium

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

### 8.66 Helm: no PodDisruptionBudget — Medium

**Файл:** `helm/templates/`

Grep for `PodDisruptionBudget|pdb` = 0 matches. No PDB means Kubernetes can evict all pods simultaneously during node drain or cluster upgrade. With a single-replica StatefulSet (which this is), draining a node kills the only pod → downtime.

**Фикс:** Add PDB with `minAvailable: 1` for critical services (ai-signal-bot, hft-trade-bot, exchange-simulator).

### 8.67 Helm: no NetworkPolicy — Medium

**Файл:** `helm/templates/`

Grep for `NetworkPolicy|networkpolicy` = 0 matches. All pods can communicate with all other pods and external networks. In production, the DB pod should only accept connections from ai-signal-bot and hft-trade-bot pods, not from web-ui or random pods.

**Фикс:** Add NetworkPolicy restricting ingress to DB/Redis pods from application pods only.

### 8.68 Helm: no RBAC — Low

**Файл:** `helm/templates/`

No ServiceAccount, Role, or RoleBinding defined. Pods run with default service account. No principle of least privilege.

### 8.69 Helm: hardcoded PostgreSQL password — Medium

**Файл:** `helm/values.yaml:17`

```yaml
password: "change-me-in-production"  # Override via --set postgres.password=... or existingSecret
```

Default password is `change-me-in-production`. The comment says "Override via --set" but there's no validation that it was actually changed. If someone runs `helm install` without overrides, the DB has a known password.

**Фикс:** Require `existingSecret` ref. Fail Helm install if no secret provided: `{{- required "postgres.password is required" .Values.postgres.password }}`.

### 8.70 Docker Compose: no resource limits — Medium

**Файл:** `docker-compose.yml`

Grep for `resources|limits|ulimits` = 0 matches. No memory or CPU limits on any container. A memory leak in any service can consume all host memory and crash everything. The Helm chart has resource limits (§8.66), but docker-compose (used for dev/staging) does not.

**Фикс:** Add `deploy.resources.limits` to each service in docker-compose.

### 8.71 WS input: no schema validation — Medium

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

### 8.72 DB migrations: SQL files exist but no runner — Medium

**Файлы:** `src/database/migrations/001_initial_schema.sql` through `004_add_backtests.sql`

4 migration SQL files exist (PostgreSQL syntax: `BIGSERIAL`, `CREATE EXTENSION`). But grep for `migrat` in `src/database/` = 0 matches. No migration runner code. No version tracking table. No `apply_migrations()` function.

The SQLite `db.py` has its own schema initialization (`CREATE TABLE IF NOT EXISTS`), separate from these PostgreSQL migrations. Two DB backends, two schema management approaches, neither has a proper migration runner.

**Фикс:** Use Alembic (Python) or `flyway` (JVM) or at minimum a `migrate.py` script that reads `migrations/*.sql` in order and tracks applied versions in a `_migrations` table.
