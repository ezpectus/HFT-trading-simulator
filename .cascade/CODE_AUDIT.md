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
