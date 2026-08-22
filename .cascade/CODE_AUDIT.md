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

### 8.73 Alertmanager: hardcoded credentials — Medium

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

### 8.74 shared_config.yaml: hardcoded localhost — Medium

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

### 8.78 Alertmanager: no silence/ maintenance window support — Low

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

### 8.89 deploy.sh: no health check failure exit — Medium

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

### 8.90 deploy.sh: rollback uses `rm -rf` — Low

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

### 8.92 deploy.sh: backup retention — Low

**Файл:** `scripts/deploy.sh:32-62`

Backups are created with timestamps but never cleaned up. After 100 deploys, `backup/` has 100 copies of config + DB. No rotation policy.

**Фикс:** Add `find $BACKUP_DIR -mtime +30 -delete` to cleanup backups older than 30 days.

### 8.93 ESLint config: PropTypes disabled — Low

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

### 8.94 Vite config: no CSP headers — Low

**Файл:** `web-ui/vite.config.js`

No Content-Security-Policy headers configured. The dev server and preview server serve without CSP. In production, if served directly (not behind nginx/ingress), XSS attacks are easier.

**Фикс:** Add `server.headers` with CSP: `"Content-Security-Policy": "default-src 'self'; connect-src 'self' ws://localhost:*"`.

### 8.95 Vite config: PWA cache strategy — ✅ Good

**Файл:** `web-ui/vite.config.js:29-41`

Workbox config with `globPatterns` for JS/CSS/HTML/SVG/fonts. Runtime caching for Google Fonts with `CacheFirst` strategy and expiration policy (`maxEntries: 10, maxAgeSeconds: 1yr`). Manual chunks for react-vendor, charts-vendor, icons-vendor, state-vendor. Good bundle splitting.

### 8.96 hft-trade-bot config: hardcoded localhost — Medium

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

### 8.98 ErrorBoundary: per-panel but no top-level — Medium

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

### 8.100 Code reduction: exchange_simulator modules — Low

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

### 8.107 SECURITY.md: inaccurate claim about WS validation — Low

**Файл:** `SECURITY.md:35`

```markdown
- **Input validation** — WebSocket messages validated before processing
```

But §8.71 showed `signal_publisher.py:141` does `json.loads(message)` with no schema validation, no type checking, no size limit. The SECURITY.md claim is incorrect — WS messages are parsed but not validated.

**Фикс:** Either add schema validation (as recommended in §8.71) or correct the SECURITY.md claim to "WebSocket messages parsed as JSON" (not "validated").

### 8.108 web-ui .env.example — ✅ Good

**Файл:** `web-ui/.env.example` (33 lines)

Clear documentation, all vars optional with localhost defaults, feature flags documented, `.env` is gitignored. No secrets in example. ✅

### 8.109 Code reduction: total summary — Info

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

### 8.115 dpdk_transport.py: file missing — Medium

**Файл:** `ai-signal-bot/src/networking/dpdk_transport.py`

The file exists only as `.pyc` (compiled bytecode in `__pycache__/`). The source `.py` file is missing. This means:
- The module can't be linted, audited, or modified
- It can't be imported on a different Python version (`.pyc` is version-specific)
- If `__pycache__` is cleaned (e.g., `git clean`), the module is gone

**Фикс:** Restore the source file from git history or remove the `__pycache__` entry and the import references.

### 8.116 Health checks: not wired into main bot — Medium

**Файл:** `ai-signal-bot/src/observability/health_checks.py`

The `HealthChecker` class and `create_health_endpoints()` function exist, but grep for `HealthChecker` or `create_health_endpoints` in `run.py` or `signal_publisher.py` shows no usage. The deep health checks are implemented but not connected to the running bot. The bot uses the shallow `health_check.py` (§8.45) instead.

**Фикс:** Wire `HealthChecker` into `run.py` startup: create the checker, pass WS/DB/Redis clients, register the aiohttp handlers on the metrics/health server.

### 8.117 C++ order_executor: detached reconnect thread — Medium

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

### 8.123 .env.prod.example: placeholder passwords — Low

**Файл:** `.env.prod.example:24-25,32-34`

```
POSTGRES_PASSWORD=change_me_to_a_secure_password
GRAFANA_PASSWORD=change_me_to_a_secure_password
```

Same placeholder pattern as Helm `values.yaml` (§8.69). If someone copies `.env.prod.example` to `.env.prod` and forgets to change passwords, production runs with `change_me_to_a_secure_password`. No validation that passwords are actually changed.

**Фикс:** Add a startup script that checks `if [ "$POSTGRES_PASSWORD" = "change_me_to_a_secure_password" ]; then echo "ERROR: Change default password"; exit 1; fi`.

### 8.124 .env.prod.example: localhost in WS URLs — Low

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

### 8.126 C++ health_server: accept() blocks shutdown — Medium

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

### 8.132 Makefile.prod: migration not idempotent — Low

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

### 8.138 docker-compose.yml (dev): Grafana admin/admin — Low

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

### 8.144 deploy.yml: health check doesn't fail pipeline — Low

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

### 8.147 C++ bot_context.h: God struct — Medium

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

### 8.148 C++ bot_context.h: SPSCQueue with mutex — Low

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

### 8.152 docker-compose.prod.yml: VITE_WS localhost fallback — Low

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

### 8.155 C++ risk_manager.h: check_order mutex on hot path — Medium

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

### 8.158 C++ pre_trade_risk.h: blacklist/whitelist not thread-safe — Medium

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

### 8.162 Terraform: hardcoded RDS password — Medium

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

### 8.166 C++ risk_manager: duplicate risk system — Medium

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

### 8.174 ai-signal-bot migrate.py: narrow exception catch — Low

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

### 8.176 C++ signal_engine_v2: 3 signal engines (v1, v2, v3) — Medium

**Файлы:** `signal_engine.h` (v1), `signal_engine_v2.h`, `signal_engine_v3.h`

`BotContext` holds all 3 signal engines:
```cpp
std::unique_ptr<SignalEngineV2> engine_v2;
std::unique_ptr<SignalEngineV3> engine_v3;
std::unique_ptr<SignalEngine>   engine_v1;
```

V3 wraps V2 (includes `signal_engine_v2.h`). V1 is the fallback. This is 3 versions of the same component. If V3 is the production engine and V1 is fallback, V2 may be dead code (only used through V3).

**Code reduction:** If V2 is only used through V3, it can be merged into V3. If V1 is only a fallback, it can be simplified. Potential ~200 lines reduction.

### 8.177 C++ shm_ring_buffer: no cleanup on crash (already noted) — Info

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

### 8.193 Helm values.yaml: hardcoded passwords — Medium

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

### 8.195 Helm values.yaml: VITE_WS localhost in production — Medium

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

### 8.203 C++ BinanceAdapter: nested Spinlock acquisition — Medium

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

### 8.204 C++ BinanceAdapter: can_send_order TOCTOU — Low

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

### 8.207 C++ 3 exchange adapters: code duplication — Medium

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

### 8.211 web-ui App.jsx: 565 lines — Medium

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

### 8.212 shared_config.yaml: localhost in production — Medium

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

### 8.215 Alertmanager config: hardcoded SMTP password — Medium

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

### 8.222 ai-signal-bot signal_publisher: 6 catch-all Exception handlers — Low

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

### 8.224 web-ui useUIStore: getFilteredSymbols not memoized — Low

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

### 8.226 monitoring alerts.yml: no HFT-specific latency alerts — Medium

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

### 8.228 monitoring ebpf_monitor.py: only syscall BPF loaded — Low

**Файл:** `monitoring/ebpf_monitor.py:128`

```python
self._bpf = BPF(text=SYSCALL_BPF)
```

Only `SYSCALL_BPF` is loaded. `NETWORK_BPF` is defined (lines 75-105) but never loaded. The network monitoring code exists but is not used. The `_on_syscall_event` handler is registered but there's no `_on_net_event` handler.

**Фикс:** Load both BPF programs: `BPF(text=SYSCALL_BPF + NETWORK_BPF)`. Register network event handler. Or remove `NETWORK_BPF` if not needed.

### 8.229 monitoring ebpf_monitor.py: no Prometheus export — Low

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

### 8.234 web-ui performanceMonitor.js: alertCallbacks unbounded — Low

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

### 8.236 web-ui backtestEngine.js: EMA/RSI duplicated from indicators.js — Low

**Файлы:** `backtestEngine.js:66-101` vs `indicators.js:9-62`

`backtestEngine.js` has its own `ema()` and `rsi()` functions that are identical to `calcEMA()` and `calcRSI()` in `indicators.js`. The only difference is naming convention (camelCase vs calc-prefix).

**Code reduction:** Import from `indicators.js`: `import { calcEMA, calcRSI } from './indicators'`. ~40 lines reduction.

### 8.237 web-ui backtestEngine.js: no short selling fee on borrow — Low

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

### 8.238 web-ui backtestEngine.js: no slippage model — Low

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

### 8.240 web-ui indicators.js: O(n²) SMA and Bollinger — Low

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

### 8.243 web-ui mockData.js: only 5 of 50 symbols — Low

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

### 8.246 web-ui vite.config.js: no esbuild.drop for console.log — Low

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

### 8.256 web-ui useExchangeData: candle sort on every update — Low

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

### 8.259 web-ui useDetachablePanels: no BroadcastChannel cleanup — Low

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

### 8.261 ai-signal-bot db.py: new connection per operation — Medium

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

### 8.262 ai-signal-bot db.py: no data retention — Low

**Файл:** `ai-signal-bot/src/database/db.py`

No retention policy for signals, trades, or equity_curve tables. Over time (months of running), these tables grow without bound. SQLite handles large tables, but query performance degrades.

**Фикс:** Add `delete_old_signals(days=90)` and `delete_old_trades(days=90)` methods. Call daily. Or add a cron job.

### 8.263 ai-signal-bot db.py: no equity_curve index — Low

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

### 8.264 ai-signal-bot db.py: no migration system — Medium

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

### 8.266 web-ui useWebSocket: no max reconnect limit — Low

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

### 8.270 exchange_simulator liquidation_engine_v2: ADL is a stub — Low

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

### 8.271 exchange_simulator liquidation_engine_v2: cascade market impact uses fixed seed — Low

**Файл:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:73`

```python
self._rng = np.random.default_rng(seed=42)
```

The cascade market impact RNG is seeded with 42, making cascades deterministic. This is good for testing/reproducibility but means every simulation run will have identical cascade patterns. In a trading simulator, some randomness is expected.

**Фикс:** Make seed configurable: `seed = config.get('cascade_seed', None)` where `None` means random.

### 8.272 exchange_simulator liquidation_engine_v2: f-string logging — Low

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

### 8.273 exchange_simulator liquidation_engine_v2: no thread safety — Low

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

### 8.275 exchange_simulator arbitrage: unbounded _closed_history — Low

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

### 8.277 exchange_simulator funding_rate: f-string logging — Low

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

### 8.282 exchange_simulator order_book_realism: recent_fills unbounded — Low

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

### 8.285 exchange_simulator __main__.py: runpy entry point — ✅ Clean

**Файл:** `exchange_simulator/exchange_simulator/__main__.py` (15 lines)

Clean entry point that adds parent directory to `sys.path` and runs the root-level `__main__.py` via `runpy.run_path`. ✅

### 8.286 exchange_simulator: all modules use seed=42 — Low

**Файл:** `liquidation_engine_v2.py:73`, `funding_rate.py:48`, `latency_simulation.py:48`, `market_microstructure.py:74`, `order_book_realism.py:106`

All 5 modules that use `np.random.default_rng` hardcode `seed=42`. This makes the entire simulation deterministic — every run produces identical results. While good for testing, it means the simulator cannot produce varied market conditions across runs.

**Фикс:** Make seed configurable via config.yaml: `simulation.seed: null` (null = random) or `simulation.seed: 42` (deterministic).
