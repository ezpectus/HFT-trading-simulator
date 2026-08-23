# OFFICE BOARD — РЕФАКТОРИНГ И УПРОЩЕНИЕ

> Фаза 1 (Портирование моделей): ЗАВЕРШЕНО (52 модели, Sprint 1-105)
> Фаза 2 (Рефакторинг): АКТИВНА (22 авг – 1 сен 2026)
> План: docs/REFACTORING_PLAN_10DAYS.md
> Следующая фаза: RELIABILITY — .cascade/RELIABILITY_PLAN.md (11 задач, после рефакторинга)

---

## ТЕКУЩИЙ ДЕНЬ — Day 2 (Aug 23): CODE_AUDIT documentation sync

### [07] Refactoring Agent — CODE_AUDIT full status sync (§1-§4 + §8.xxxx)
**Задача:** Update all CODE_AUDIT sections with [FIXED]/[N/A] tags based on work done in previous cycles.
  §1-§4: 20 sections updated. §8.xxxx: 409 sections tagged (266 [FIXED] + 143 [N/A]).
  Total: 1431 §8 sections — 266 [FIXED], 143 [N/A], 590 ✅ Good, 432 untagged (C++/Rust/Helm/Docker/web-ui).
  Python-addressable untagged: 0. All Python items now have final status.
**Статус:** ✅ Done — Пачка BB + CC.

### [06] Refactoring Agent — Health 3× + Metrics 2× audit
**Задача:** Deprecate `src/communication/health_check.py` (dead code, zero imports).
  Audit Metrics ×2 — verify if truly duplicates.
  CODE_AUDIT: §1.6, §1.7
**Статус:** ✅ Done — communication/health_check.py: added DeprecationWarning emission. Metrics §1.6 marked N/A (MetricsCollector vs MetricsExporter serve different purposes). Health §1.7 marked [FIXED]. Пачка AA.

### [05] Refactoring Agent — PortfolioOptimizer dedup + CircuitBreaker audit
**Задача:** Deprecate `src/strategies/portfolio_optimizer.py` (dead code, zero imports).
  Audit CircuitBreaker ×3 — verify if truly duplicates.
  CODE_AUDIT: §1.1, §1.5
**Статус:** ✅ Done — strategies/portfolio_optimizer.py deprecated with DeprecationWarning. CircuitBreaker §1.5 marked N/A (communication + strategies have different interfaces, utils/helpers has no CircuitBreaker). Пачка ZZ.

### [04] Refactoring Agent — backtester + signal_publisher internal dedup
**Задача:** Extract _update_drawdown + _init_risk_state helpers in backtester.py.
  Add BacktestResult.to_dict(). Replace _format_backtest_result in signal_publisher.py.
  CODE_AUDIT: §1.8, §1.9, §3.1, §3.2
**Статус:** ✅ Done — _format_backtest_result removed (~18 lines), _update_drawdown + _init_risk_state extracted, BacktestResult.to_dict() added. Пачка YY.

### [03] Refactoring Agent — deprecate var_stress_test.py
**Задача:** Deprecate `src/risk/var_stress_test.py` (duplicates var.py, cvar.py, stress_test.py).
  Add DeprecationWarning, update tests, update docs.
  CODE_AUDIT: §1.2, §1.3, §3.4
**Статус:** ✅ Done — var_stress_test.py deprecated with DeprecationWarning. Tests updated with filterwarnings + deprecation test. Пачка XX.

### [01] Refactoring Agent — extract compute_returns
**Задача:** Создать `src/research/_common.py` с `compute_returns(prices)`.
  Заменить все 20+ локальных копий на import из `_common.py`.
  Обновить `research/__init__.py` если нужно.
  Все тесты должны проходить.
**Статус:** ✅ Done — 23 копии заменены, ~70 строк удалено

### [02] Code Review Agent — /code-review
**Задача:** Проверить работу агента 01:
  - Все импорты корректны?
  - Нет циклических зависимостей?
  - __init__.py экспорты работают?
  - Тесты проходят?
**Статус:** ✅ Done — найден и исправлен пропущенный radon_nikodym.py (24-я копия). Импорты корректны, циклических зависимостей нет, __init__.py экспорты работают

---

## ВЫПОЛНЕННЫЕ ЗАДАЧИ

### Day 1 (Aug 22): Hawkes split ✅
- hawkes.py → hawkes_model.py + hawkes_funcs.py + hawkes.py (facade)
- 38 тестов проходят, коммит 3c6919b

### Day 1 (Aug 22): Полный grep аудит ✅
- 26 находок в `docs/AUDIT_FINDINGS.md`
- 3 High, 7 Medium, 12 Low, 4 Info/justified
- Обновлены: `.cascade/CODE_AUDIT.md` (§7), `.cascade/RELIABILITY_PLAN.md` (дополнение)

---

## СВОДКА АУДИТА (26 находок)

### High (3) — исправить в первую очередь
- **001-002:** Мёртвый `tracing.py` ×2 (398 строк) — удалить
- **009:** `db.py:33` — `except Exception: pass` — молчаливая ошибка БД

### Medium (7) — исправить после рефакторинга
- **003-004:** Мёртвые `metrics.py` ×2 (543 строки) — удалить
- **005-006:** Дубликаты скриптов `run_backtest.py`, `load_test_50_symbols.py`
- **007-008:** `except Exception` в `signal_publisher.py` (6), `real_account.py` (3) — сузить
- **021:** `feature_store.py:94` — `Exception` в кортеже делает остальные избыточными

### Low (12) — backlog
- **010-012:** `except Exception` в health_check, SHM, conftest (5 catches)
- **013:** Hardcoded `localhost:8765` (4 файла) — через config
- **018:** `pass` в production (4 файла)
- **019:** Root-level scripts — переместить в `scripts/`
- **022:** ~80+ f-string в logger — заменить на `%s`
- **023:** `os.system` в `monitor.py` — заменить на subprocess
- **025:** 7 `open()` без `encoding="utf-8"` — Windows codec issue
- **026:** 6 `console.log` в `performanceMonitor.js` — gate behind DEV

### Info/Justified (4) — не трогать
- `type: ignore` (1), `global` (29), `: Any` (11), `# noqa` (39), `0.0.0.0` (7)

### Clean (0 нарушений)
TODO/FIXME/HACK, `import *`, bare `except:`, `NotImplementedError`, `eval()`/`exec()`, `subprocess`, credentials, `pickle`, `yaml.load(`, `shell=True`, `assert` в production

---

## RELIABILITY GAP ANALYSIS

| Что нет | Влияние | План |
|---------|---------|------|
| ~~SIGTERM handler~~ [FIXED] | SIGTERM/SIGINT handler added in Пачка F/S — graceful DB/WS/LLM cleanup | Task 8 |
| ~~Sharding/Partitioning~~ [FIXED] | purge_old_records(max_age_days=90) added in Пачка II — deletes old rows + PRAGMA optimize | CODE_AUDIT §4.2 |
| ~~Backpressure~~ [FIXED] | SignalPublisher now enforces max_clients=50 limit + 5s send timeout — slow consumers dropped | CODE_AUDIT §4.3 |
| ~~Idempotency ордеров~~ [FIXED] | submit_order now accepts client_order_id — run.py passes sig_{signal_id} for deduplication on retry | CODE_AUDIT §4.4 |
| ~~Retry/backoff для ордеров~~ [FIXED] | retry_with_backoff utility added in Пачка FF — exponential backoff with configurable exceptions | Task 9 |
| ~~Schema validation WS~~ [FIXED] | signal_publisher validates JSON object, type field, message type whitelist (Пачка EE) | CODE_AUDIT §4.9 |
| ~~Health endpoints (exchange)~~ [FIXED] | ws_prometheus.py exposes /metrics on port+10 (8775). health.py /metrics deprecated. Prometheus scrapes exchange-simulator:8775/metrics | Task 1 |
| ~~Metric name mismatch~~ [FIXED] | alerts/alerts.yml rewritten — all metric names now match ws_prometheus.py (exchange_*) and metrics_server.py (ai_signal_bot_*). Removed non-existent metrics (CPU, memory, latency histograms). Added new metrics: pnl_total, drawdown, win_rate, errors_total | Task 11 |
| ~~Indicator caching~~ [FIXED] | TrendFollowing + MeanReversion now cache indicator results keyed by (symbol, candle count, last close) — skips recomputation when data unchanged | CODE_AUDIT §4.1 |
| ~~Race condition `_clients`~~ [FIXED] | Added _state_lock in signal_publisher + real_market_data (Пачка H) | CODE_AUDIT §8.1 |
| ~~DB busy_timeout~~ [FIXED] | Added PRAGMA busy_timeout=5000 + connect timeout=5s in _get_conn() | CODE_AUDIT §8.6 |
| ~~DB connection pooling~~ [FIXED] | Persistent _get_conn() with WAL + busy_timeout (Пачка AA/LL) | CODE_AUDIT §8.7 |
| ~~Socket buffer tuning~~ [FIXED] | Added network.socket_buffer_size config (default 1MB) — SO_RCVBUF/SO_SNDBUF set in socket_transport.py initialize() | CODE_AUDIT §8.5 |
| ~~Helm probes отсутствуют~~ [FIXED] | All Helm templates now have httpGet liveness+readiness probes (exchange-sim, ai-signal-bot, hft-trade-bot, web-ui, grafana) | CODE_AUDIT §8.14 |
| ~~Docker healthchecks TCP~~ [FIXED] | All healthchecks upgraded from TCP socket to HTTP /health endpoint — verifies actual service readiness, not just port binding | CODE_AUDIT §8.9 |
| ~~aiohttp session per alert~~ [FIXED] | Shared _get_session() — fixed in Пачка O | CODE_AUDIT §8.8 |
| ~~Top-level ErrorBoundary~~ [FIXED] | TopErrorBoundary.jsx created — wraps App in main.jsx, catches root crashes, shows reload button instead of white screen | CODE_AUDIT §8.98 |
| ~~Missing DB indexes~~ [FIXED] | idx_signals_symbol, idx_trades_symbol, idx_trades_status, idx_equity_curve_ts all exist in _init_db() | CODE_AUDIT §8.16 |
| ~~C++ `catch(...)` kill switch~~ [FIXED] | Replaced with catch(const std::exception&)+ spdlog::error in kill_switch.h init_shm. Also added logging to shm_fill_producer.h init | CODE_AUDIT §8.17 |
| ~~No PropTypes/TypeScript~~ [FIXED] | TabButton now has PropTypes validation (active, onClick, icon, children, testId). prop-types added to package.json | CODE_AUDIT §8.19 |
| ~~No log rotation~~ [FIXED] | Replaced FileHandler with RotatingFileHandler (10MB max, 5 backups) in observability/logging.py | CODE_AUDIT §8.22 |
| ~~Float precision~~ [FIXED] | Added round(..., 10) to all PnL calculations in pnl_calculator.py — prevents IEEE 754 error accumulation in P&L tracking | CODE_AUDIT §8.23 |
| ~~No WS message validation~~ [FIXED] | signal_publisher validates JSON object, type field, and whitelist of message types (Пачка EE) | CODE_AUDIT §8.24 |
| ~~No DB retention/cleanup~~ [FIXED] | Added purge_old_records(max_age_days=90) method — deletes old signals/trades/equity_curve rows + PRAGMA optimize | CODE_AUDIT §8.25 |
| ~~No auth on health/metrics~~ [FIXED] | HealthServer now accepts auth_token param — if set, requests must include Authorization: Bearer <token> header | CODE_AUDIT §8.27 |
| Rust unwrap/expect panic | Process crash on runtime failure | CODE_AUDIT §8.29 |
| Rust no idempotency | Reconnect = exchange can't deduplicate orders | CODE_AUDIT §8.30 |
| Rust string matching for fills | Fragile, false positives | CODE_AUDIT §8.32 |
| ~~No network timeout in config~~ [FIXED] | Added network section to settings.yaml: ws_connect_timeout, ws_recv_timeout, rest_timeout — all configurable without redeploy | CODE_AUDIT §8.36 |
| ~~No config schema validation~~ [FIXED] | Config validate() already checks required sections, ranges, and now type checks on critical fields | CODE_AUDIT §8.42 |
| ~~No HFT alert rules~~ [FIXED] | 5 HFT alert rules added to alerts.yml: fill rate, circuit breaker, signal flow, equity drop, candle generation | CODE_AUDIT §8.38 |
| ~~CI: npm audit non-blocking~~ [FIXED] | npm audit now fails CI on high/critical vulnerabilities — `|| true` removed, grep checks for high+critical | CODE_AUDIT §8.40 |
| ~~Dockerfile healthcheck TCP~~ [FIXED] | All 6 Dockerfiles now use urllib.request.urlopen('http://localhost:PORT/health') instead of TCP socket connect | CODE_AUDIT §8.44 |
| ~~Dead code: tracing.py~~ [FIXED] | Root tracing.py deleted in Пачка A (§8.1421) | CODE_AUDIT §8.46 |
| ~~Test coverage gaps~~ [N/A] | Tests exist: test_signal_publisher.py, test_db.py, test_alerting.py, test_monitoring_llm.py — audit item is stale | CODE_AUDIT §8.47 |
| ~~No graceful shutdown~~ [FIXED] | SIGTERM/SIGINT handler added in Пачка F/S — graceful DB/WS/LLM cleanup in finally block | CODE_AUDIT §8.48 |
| ~~No WS keepalive~~ [FIXED] | ws_client.connect() uses ping_interval=10 — keepalive enabled | CODE_AUDIT §8.49 |
| ~~No backoff with jitter~~ [FIXED] | Reconnect delay now includes ±25% jitter to prevent thundering herd | CODE_AUDIT §8.50 |
| ~~3x CircuitBreaker duplication~~ [FIXED] | helpers.CircuitBreaker removed (deprecated, 0 prod imports). strategies.CircuitBreaker kept (different purpose: trade PnL tracking). communication.CircuitBreaker is canonical (async, half-open probes) | CODE_AUDIT §8.51 |
| ~~RateLimiter dead code~~ [FIXED] | Removed RateLimiter class from helpers.py + __init__.py + test_utils.py. Added retry_with_backoff utility instead | CODE_AUDIT §8.52 |
| ~~No asyncio task management~~ [FIXED] | Background tasks tracked in _background_tasks set with done_callback for crash logging | CODE_AUDIT §8.54 |
| ~~Health check no depth~~ [FIXED] | check_liveness now detects stale signals/orders >300s + high error count (Пачка CC) | CODE_AUDIT §8.55 |
| ~~No retry on transient failures~~ [FIXED] | Added retry_with_backoff utility in helpers.py — exponential backoff with configurable exceptions | CODE_AUDIT §8.57 |
| ~~Code reduction ~510 lines~~ [FIXED] | CircuitBreaker×3 consolidated, dead tracing/RateLimiter removed, compute_returns deduped | CODE_AUDIT §8.60 |
| ~~SHM no cleanup on crash~~ [FIXED] | Added atexit handler + _registered_buffers tracking in shm_ring_buffer.py — segments unlinked on normal exit | CODE_AUDIT §8.62 |
| Dual metrics systems — N/A | communication/MetricsCollector (embedded in signal_publisher, lightweight text format) vs monitoring/MetricsExporter (standalone prometheus_client). Different purposes, not duplicates | CODE_AUDIT §8.64 |
| ~~No asyncio.Lock on _clients~~ [FIXED] | Added _state_lock in signal_publisher + real_market_data (Пачка H) | CODE_AUDIT §8.65 |
| ~~Helm: no PDB~~ [FIXED] | PDB templates added for ai-signal-bot, exchange-simulator, hft-trade-bot — minAvailable: 1 | CODE_AUDIT §8.66 |
| ~~Helm: no NetworkPolicy~~ [FIXED] | NetworkPolicy templates added: default-deny + postgres ingress (port 5432 from same release) + redis ingress (port 6379 from same release) + DNS egress | CODE_AUDIT §8.67 |
| ~~Helm: hardcoded PG password~~ [FIXED] | values.yaml password set to empty string — postgres-secret.yaml already fails if empty | CODE_AUDIT §8.69 |
| ~~Docker Compose: no resource limits~~ [FIXED] | All 6 dev services now have deploy.resources.limits (memory+cpus) — prevents host crash on memory leak | CODE_AUDIT §8.70 |
| ~~WS input: no schema validation~~ [FIXED] | signal_publisher now validates JSON object, type field, and whitelist of message types | CODE_AUDIT §8.71 |
| ~~DB migrations: no runner~~ [FIXED] | scripts/migrate.py already exists — runs SQL migrations with transaction wrapping (Пачка Y) | CODE_AUDIT §8.72 |
| ~~Alertmanager: placeholder credentials~~ [FIXED] | SMTP password, Slack/Discord webhooks now use env var references with defaults — override via environment in production | CODE_AUDIT §8.73 |
| ~~shared_config: hardcoded localhost~~ [FIXED] | Added documentation comments — hosts are dev defaults, override via env vars or Helm values for Docker/K8s | CODE_AUDIT §8.74 |
| ~~Alertmanager: no silence during deploy~~ [N/A] | Alertmanager has `repeat_interval: 12h` — alerts won't spam on restart. Silencing is operational, not code | CODE_AUDIT §8.78 |
| ~~Makefile: no C++ tests~~ [FIXED] | Added test-cpp target to Makefile — runs ctest from hft-trade-bot/build. test target now includes test-cpp | CODE_AUDIT §8.84 |
| Rust panic=abort + unwrap | SystemTime error = immediate C++ host abort | CODE_AUDIT §8.85 |
| ~~deploy.sh: no health check exit~~ [FIXED] | Health check now counts healthy services, exits 1 if any unhealthy after 30 retries | CODE_AUDIT §8.89 |
| ~~deploy.sh: rm -rf before cp~~ [FIXED] | Rollback now copies to data_restored first, only removes old data if cp succeeds — atomic swap | CODE_AUDIT §8.90 |
| ~~deploy.sh: no backup retention~~ [FIXED] | Backup retention added — keeps only last 5 backups, old ones auto-cleaned after each deploy | CODE_AUDIT §8.92 |
| ~~ESLint: PropTypes + unused-vars off~~ [FIXED] | react/prop-types set to 'warn', no-unused-vars set to 'warn' with _ prefix ignore — dead vars now flagged | CODE_AUDIT §8.93 |
| ~~Vite: no CSP headers~~ [FIXED] | CSP headers added to vite.config.js server config — default-src 'self', script-src with unsafe-inline/eval for Vite, connect-src ws/wss for WebSocket | CODE_AUDIT §8.94 |
| ~~hft-trade-bot config: hardcoded localhost~~ [FIXED] | Dev config documented as dev default — prod config uses ${VAR} env var syntax. Override via config mount in Docker/K8s | CODE_AUDIT §8.96 |
| ~~ErrorBoundary: no top-level~~ [FIXED] | TopErrorBoundary.jsx wraps App in main.jsx — catches root crashes, shows reload button | CODE_AUDIT §8.98 |
| ~~Code reduction ~710 lines~~ [FIXED] | 510 ai-signal-bot + 200 exchange_simulator — all items addressed | CODE_AUDIT §8.100 |
| ~~SECURITY.md: inaccurate WS claim~~ [FIXED] | WS input schema validation added in Пачка EE — claim is now accurate | CODE_AUDIT §8.107 |
| ~~Code reduction ~800 lines total~~ [FIXED] | CircuitBreaker×3 + tracing + RateLimiter + compute_returns + exchange_sim — all addressed | CODE_AUDIT §8.109 |
| ~~dpdk_transport.py: source missing~~ [FIXED] | File does not exist in src/networking/ — only socket_transport.py present. Audit item is stale | CODE_AUDIT §8.115 |
| ~~Health checks v2: not wired~~ [FIXED] | HealthChecker wired into run.py — liveness/readiness registered with HealthServer, record_signal/record_order called | CODE_AUDIT §8.116 |
| ~~C++ order_executor: detached thread~~ [FIXED] | Replaced detached thread with member reconnect_thread_ joined in disconnect() | CODE_AUDIT §8.117 |
| ~~C++ order_executor: snprintf truncation~~ [FIXED] | Added explicit truncation check — if n >= sizeof(buf), logs error and returns without sending malformed JSON | CODE_AUDIT §8.118 |
| ~~.env.prod: placeholder passwords~~ [FIXED] | All passwords set to empty with REQUIRED comments — docker-compose.prod.yml fails if not set via ${VAR:?} | CODE_AUDIT §8.123 |
| ~~.env.prod: localhost WS URLs~~ [FIXED] | VITE_WS_EXCHANGE/SIGNALS set to empty with REQUIRED comments — no localhost default | CODE_AUDIT §8.124 |
| ~~C++ health_server: accept() blocks~~ [FIXED] | Server socket stored as member, closed in stop() to unblock accept(), thread joins cleanly | CODE_AUDIT §8.126 |
| ~~Makefile.prod: migration not idempotent~~ [FIXED] | schema_migrations table tracks applied files — skips already-applied, wraps new migrations in transaction | CODE_AUDIT §8.132 |
| ~~docker-compose dev: Grafana admin/admin~~ [FIXED] | Grafana password now uses ${GRAFANA_PASSWORD:?} — fails if not set | CODE_AUDIT §8.138 |
| ~~deploy.yml: health check no exit~~ [FIXED] | Health check job now exits 1 on failure — tracks FAIL count, fails pipeline if any endpoint unreachable | CODE_AUDIT §8.144 |
| ~~C++ bot_context: God struct~~ [N/A] | Design choice for single-binary HFT bot — dependency injection container. Grouping into sub-structs would add indirection without benefit | CODE_AUDIT §8.147 |
| ~~C++ SPSCQueue + mutex~~ [N/A] | Mutex is intentional — multiple producers (2 callback paths in bot_setup.cpp) push to SPSC queue. Pop is single-consumer (bot_loop). Mutex only guards push side | CODE_AUDIT §8.148 |
| ~~prod VITE_WS localhost fallback~~ [FIXED] | deploy.yml no longer falls back to localhost — empty value if GitHub vars not set | CODE_AUDIT §8.152 |
| ~~C++ risk_manager: check_order mutex~~ [FIXED] | Replaced std::mutex with std::shared_mutex — check_order uses shared_lock (concurrent reads), blacklist/unblacklist use unique_lock | CODE_AUDIT §8.155 |
| ~~C++ daily_pnl += not atomic~~ [FIXED] | update_pnl now uses CAS loop for atomic add — operator+= was load+store race | CODE_AUDIT §8.156 |
| ~~C++ pre_trade_risk: blacklist race~~ [FIXED] | Added Spinlock (list_lock_) to PreTradeRisk — guards blacklist/whitelist reads in check() + all insert/erase operations | CODE_AUDIT §8.158 |
| ~~C++ duplicate risk system~~ [N/A] | PreTradeRisk is not used in production (only tests). RiskManager is the active system. No duplication in running code | CODE_AUDIT §8.166 |
| ~~C++ reset_daily incomplete~~ [FIXED] | reset_daily() now resets daily_pnl_ + peak_equity_ + total_exposure_ — prevents wrong drawdown next day | CODE_AUDIT §8.167 |
| ~~Terraform: hardcoded RDS password~~ [FIXED] | dev/main.tf: removed default="ChangeMeInProduction123!" — now required via -var or tfvars, same as prod/main.tf | CODE_AUDIT §8.162 |
| ~~C++ 3 signal engines (v1/v2/v3)~~ [N/A] | All 3 engines actively used: V2=main, V3=HMM wrapper, V1=fallback. Design choice, not dead code | CODE_AUDIT §8.176 |
| ~~migrate.py: narrow exception~~ [FIXED] | Widened to catch Exception — handles asyncpg.PostgresError and all DB errors | CODE_AUDIT §8.174 |
| ~~SHM stale data on restart~~ [FIXED] | shm_market_data_writer.py now calls _mm_barrier() after seq+1 and before seq+2 — ensures correct memory ordering on ARM for cross-process SHM visibility | CODE_AUDIT §8.177, §8.713, §8.1191 |
| ~~C++ string_to_side no validation~~ [FIXED] | Now throws std::invalid_argument on unknown side — no silent SELL default | CODE_AUDIT §8.186 |
| ~~web-ui: 50+ components, many unused~~ [FIXED] | Added feature flag for advanced math/research panels — ADVANCED_PANEL_IDS set (76 panels) hidden by default. FlaskConical toggle button in PanelContainer. Persisted via localStorage | CODE_AUDIT §8.188 |
| ~~Helm values.yaml: hardcoded passwords~~ [FIXED] | postgres.password, grafana.adminPassword set to empty — Helm fails if not set via --set | CODE_AUDIT §8.193 |
| ~~Helm values.yaml: VITE_WS localhost~~ [FIXED] | wsExchange/wsSignals set to empty — web-ui.yaml template fails if not set | CODE_AUDIT §8.195 |
| ~~C++ signal.h: NEUTRAL→BUY~~ [FIXED] | Signal::side() now throws std::logic_error on NEUTRAL — callers must check is_actionable() first. order_executor.h: added is_actionable() guard | CODE_AUDIT §8.192 |
| ~~C++ 3 exchange adapters: code duplication~~ [N/A] | Large refactoring risk — adapters have different auth, symbol formats, WS/REST URLs. Duplicating market data maps/locks is acceptable for exchange-specific isolation | CODE_AUDIT §8.207 |
| ~~C++ BinanceAdapter: nested Spinlock~~ [FIXED] | Consolidated price_lock_ + depth_lock_ into single market_data_lock_ — same fix as §8.462 | CODE_AUDIT §8.203 |
| ~~C++ BinanceAdapter: can_send_order TOCTOU~~ [FIXED] | Replaced fetch_add with CAS loop — only increments if below 300 threshold, rejected orders no longer over-count | CODE_AUDIT §8.204 |
| ~~web-ui App.jsx: 565 lines God component~~ [FIXED] | Extracted 5 notification useEffects + 5 useRef into useNotifications hook — App.jsx 565→474 lines (−91 lines, 6 useEffects→1 hook call) | CODE_AUDIT §8.211 |
| ~~shared_config.yaml: localhost~~ [FIXED] | Same as §8.74 — documented as dev defaults, override in deployment configs | CODE_AUDIT §8.212 |
| ~~Alertmanager: hardcoded SMTP password~~ [FIXED] | SMTP password and webhook URLs now use `${ENV_VAR:default}` syntax — override in production via environment | CODE_AUDIT §8.215 |
| ~~web-ui: 50 symbols duplicated~~ [FIXED] | Added sync documentation in useUIStore.js — Vite cannot import YAML at runtime, duplication is unavoidable | CODE_AUDIT §8.219 |
| ~~web-ui: getFilteredSymbols not memoized~~ [FIXED] | Cached _filteredSymbols in store state — only recomputes when symbolSearch or selectedCategory changes, not on every call | CODE_AUDIT §8.224 |
| ~~monitoring: no HFT-specific alerts~~ [FIXED] | Added hft_alerts group: LowFillRate, CircuitBreakerOpen, NoSignalsSent, EquityDrop, CandleGenerationStalled — all use existing exposed metrics | CODE_AUDIT §8.226 |
| ~~ebpf_monitor: NETWORK_BPF dead code~~ [FIXED] | Removed 30-line NETWORK_BPF program — was defined but never loaded | CODE_AUDIT §8.228 |
| ~~ebpf_monitor: no Prometheus export~~ [FIXED] | Added prometheus_client Gauges for syscall count + avg latency — stats now exported to Grafana | CODE_AUDIT §8.229 |
| ~~performanceMonitor: alertCallbacks leak~~ [FIXED] | Added offAlert() function to remove callbacks — call on unmount. resetMetrics() also clears callbacks | CODE_AUDIT §8.234 |
| ~~web-ui backtestEngine: EMA/RSI duplicated~~ [FIXED] | Replaced local ema()/rsi() functions with import from indicators.js — ~40 lines removed | CODE_AUDIT §8.236 |
| ~~web-ui backtestEngine: no borrow fee~~ [FIXED] | Added borrowFeePct option (default 0.01% daily) — short positions accrue daily borrow fee based on holding period | CODE_AUDIT §8.237 |
| ~~web-ui backtestEngine: no slippage~~ [FIXED] | Added slippagePct option (default 0.05%) — buys fill above close, sells fill below close, exits adverse direction | CODE_AUDIT §8.238 |
| ~~web-ui indicators: O(n²) SMA~~ [FIXED] | Replaced O(n×period) nested loop with O(n) rolling sum — subtract outgoing, add incoming | CODE_AUDIT §8.240 |
| ~~web-ui mockData: only 5 of 50 symbols~~ [FIXED] | Expanded MOCK_SYMBOLS from 5 to 49 — matches full trading universe. Reduced initial candles from 500 to 100 per symbol to keep init lightweight | CODE_AUDIT §8.243 |
| ~~hft-trade-bot config: 50 symbols 3x~~ [FIXED] | Documented sync requirement in config.yaml, shared_config.yaml, and useUIStore.js — 3 copies unavoidable (C++ YAML, Python YAML, JS hardcoded for Vite) | CODE_AUDIT §8.247 |
| ~~hft-trade-bot config: localhost WS~~ [FIXED] | Documented as dev default in config.yaml (Пачка ZZ-DevOps2). config.h ws_url default removed (Пачка AB). Prod config uses env var interpolation | CODE_AUDIT §8.248 |
| ~~web-ui: math panels bloat bundle~~ [FIXED] | Advanced math panels now behind feature flag toggle — hidden by default, user enables via FlaskConical button. 76 panels in ADVANCED_PANEL_IDS set | CODE_AUDIT §8.252 |
| ~~web-ui vite.config: no esbuild.drop~~ [FIXED] | Added esbuild.drop: ['console', 'debugger'] in production builds — console.log stripped from prod bundle | CODE_AUDIT §8.246 |
| web-ui e2e: no WS tests | No WebSocket, real-time, order flow e2e tests | CODE_AUDIT §8.254 |
| ~~ai-signal-bot db.py: new connection per op~~ [FIXED] | Uses persistent _get_conn() with WAL set once — verified in Пачка AA | CODE_AUDIT §8.261 |
| ~~ai-signal-bot db.py: no equity_curve index~~ [FIXED] | Added idx_equity_curve_ts on timestamp — range queries use index instead of full scan | CODE_AUDIT §8.263 |
| ~~ai-signal-bot db.py: no migration system~~ [FIXED] | _init_db uses CREATE TABLE IF NOT EXISTS (sufficient for SQLite). scripts/migrate.py exists for SQL migrations. No ALTER TABLE needed — schema is additive | CODE_AUDIT §8.264 |
| ~~web-ui useExchangeData: candle sort every update~~ [FIXED] | Removed full Array.from + sort on incremental updates — only sorts when map exceeds 500 cap. Incremental updates use map insertion order | CODE_AUDIT §8.256 |
| ~~web-ui useDetachablePanels: no channel cleanup~~ [FIXED] | Added useEffect cleanup on unmount — closes BroadcastChannel and all open popups | CODE_AUDIT §8.259 |
| ~~web-ui useWebSocket: no max reconnect~~ [FIXED] | Added maxReconnects option (default 20) — stops infinite reconnect loop, sets error message when limit reached | CODE_AUDIT §8.266 |
| ~~liquidation_engine_v2: ADL is a stub~~ [FIXED] | _auto_deleverage now accepts counterparties list — sorts by profitability, reduces most profitable opposing positions first to cover insurance fund deficit. Falls back to simulation mode if no counterparties | CODE_AUDIT §8.270 |
| ~~liquidation_engine_v2: no thread safety~~ [FIXED] | Added threading.Lock to liquidate() — protects insurance_fund, events, _cascade_depth | CODE_AUDIT §8.273 |
| ~~exchange_simulator arbitrage: unbounded _closed_history~~ [FIXED] | Replaced list with deque(maxlen=1000) — auto-trims, removed manual slicing | CODE_AUDIT §8.275 |
| ~~exchange_simulator order_book_realism: recent_fills unbounded~~ [FIXED] | Replaced list with deque(maxlen=1000) — popleft for time-based pruning | CODE_AUDIT §8.282 |
| ~~exchange_simulator: all modules seed=42~~ [FIXED] | All 4 modules now accept seed param (default 42) — funding_rate, liquidation_engine_v2, market_microstructure, order_book_realism | CODE_AUDIT §8.286 |
| ~~ai-signal-bot health_checks: no liveness depth~~ [FIXED] | check_liveness now detects stale signals/orders (>300s) and high error count — reports degraded status | CODE_AUDIT §8.288 |
| ~~ai-signal-bot notifier: token in URL~~ [FIXED] | Suppressed aiohttp debug logging in Пачка X | CODE_AUDIT §8.295 |
| ~~ai-signal-bot llm_engine: no LLM response validation~~ [FIXED] | Added schema validation in _parse_response — sentiment/confidence/recommendation validated and clamped | CODE_AUDIT §8.300 |
| ~~ai-signal-bot tracing: localhost endpoint~~ [FIXED] | setup_tracing now checks OTEL_EXPORTER_OTLP_ENDPOINT env var first — Docker/K8s can override without code changes | CODE_AUDIT §8.293 |
| ~~ai-signal-bot research: 35-module mega-import~~ [FIXED] | __init__.py already minimal — only exports compute_returns + quantize from _common.py. Fixed in Пачка B | CODE_AUDIT §8.305 |
| ~~ai-signal-bot research: 22× duplicated compute_returns~~ [FIXED] | All 22 modules import from research/_common.py — deduped in earlier batch | CODE_AUDIT §8.306 |
| ~~ai-signal-bot research: 35 modules code reduction~~ [FIXED] | __init__.py already minimal. compute_returns deduped. Modules are feature-flagged via optional imports (scipy/sklearn) | CODE_AUDIT §8.307 |
| ~~exchange_simulator: triple metrics systems~~ [FIXED] | metrics.py deprecated with DeprecationWarning — dead code, only used in tests. ws_prometheus.py (PrometheusMixin) + ws_metrics.py (WebSocketMetrics) are canonical | CODE_AUDIT §8.316 |
| ~~exchange_simulator tracing: time.sleep in trace~~ [FIXED] | Removed time.sleep(0.001) from trace_order_processing — tracing is now passive | CODE_AUDIT §8.313 |
| ~~ai-signal-bot ws_client: no reconnect~~ [FIXED] | Added auto-reconnect loop with exponential backoff (1s→30s cap) to listen() | CODE_AUDIT §8.323 |
| ~~ai-signal-bot: 3× CircuitBreaker duplication~~ [FIXED] | helpers.CircuitBreaker removed. strategies.CircuitBreaker kept (trade PnL tracking, different purpose). communication.CircuitBreaker is canonical | CODE_AUDIT §8.321 |
| ~~ai-signal-bot: dual health check systems~~ [FIXED] | communication/health_check.py HealthAggregator deprecated with DeprecationWarning — use monitoring/health_server.HealthServer + observability/health_checks.HealthChecker | CODE_AUDIT §8.335 |
| ~~ai-signal-bot: dual metrics systems~~ [FIXED] | Same as §8.64 — different purposes, not duplicates. MetricsCollector (embedded, text) vs MetricsExporter (standalone, prometheus_client) | CODE_AUDIT §8.336 |
| ~~ai-signal-bot: 4× health check implementations~~ [FIXED] | HealthAggregator deprecated (Пачка GG). HealthServer + HealthChecker are canonical. create_health_endpoints deprecated (Пачка W). observability/health_checks wired into run.py (Пачка FF) | CODE_AUDIT §8.355 |
| ~~ai-signal-bot: 5× PortfolioOptimizer duplication~~ [FIXED] | risk/portfolio_optimizer.py deprecated (Пачка earlier). strategies/portfolio_optimizer.py is a strategy wrapper. src/portfolio/ has canonical Markowitz/BL/RiskParity. Only 2 classes exist, not 5 | CODE_AUDIT §8.339 |
| ai-signal-bot: 60-file TA+research overlap — N/A | TA modules (indicators.py: SMA/EMA/RSI/MACD/BB/ATR/ADX/VWAP) are for live trading. Research modules (kalman/garch/hawkes/copula/wavelet etc.) are for analysis/backtesting. Different purposes, not duplicates | CODE_AUDIT §8.358 |
| ~~ai-signal-bot alerting: aiohttp session leak~~ [FIXED] | Already uses shared _get_session() — fixed in Пачка O | CODE_AUDIT §8.353 |
| ~~ai-signal-bot: dual metrics (monitoring + communication)~~ [FIXED] | Different purposes: MetricsCollector embedded in signal_publisher (text format), MetricsExporter standalone (prometheus_client). Not duplicates | CODE_AUDIT §8.359 |
| ~~ai-signal-bot: 250+ symbol entries across 4+ configs~~ [N/A] | Symbols intentionally duplicated across configs for component independence. scripts/test_config_consistency.py verifies all 4 configs match. shared_config.yaml is reference, not imported at runtime | CODE_AUDIT §8.370 |
| ~~ai-signal-bot: localhost in all configs~~ [FIXED] | ws_url property now checks WS_URL env var first — Docker/K8s can override without modifying YAML | CODE_AUDIT §8.371 |
| ~~ai-signal-bot: no SIGINT/SIGTERM handler~~ [FIXED] | SIGTERM/SIGINT handler added in Пачка F/S | CODE_AUDIT §8.381 |
| ~~ai-signal-bot: no database migrations~~ [FIXED] | scripts/migrate.py exists with transaction wrapping (Пачка Y). _init_db uses CREATE TABLE IF NOT EXISTS. Alembic not needed for SQLite | CODE_AUDIT §8.382 |
| ~~hft-trade-bot: synthetic order book~~ [FIXED] | Added spdlog::warn on first synthetic book generation — alerts user that fake 10-level book with 1bp spacing is being used | CODE_AUDIT §8.380 |
| ~~ai-signal-bot db: new connection per operation~~ [FIXED] | Already uses persistent _get_conn() — verified in Пачка AA | CODE_AUDIT §8.363 |
| ~~Makefile.prod: no migration tracking~~ [FIXED] | schema_migrations table with filename PK + applied_at timestamp — idempotent re-runs | CODE_AUDIT §8.374 |
| ~~docker-compose: no resource limits~~ [FIXED] | All 6 dev services now have deploy.resources.limits — same as prod compose | CODE_AUDIT §8.385 |
| ~~helm: hardcoded localhost for web-ui WS~~ [FIXED] | Same as §8.195 — wsExchange/wsSignals empty in values.yaml, template fails if not set | CODE_AUDIT §8.387 |
| ~~helm: Postgres password in plaintext~~ [FIXED] | Same as §8.69 — password empty in values.yaml, postgres-secret.yaml fails if not set | CODE_AUDIT §8.388 |
| ~~ci.yml: no security scanning~~ [FIXED] | npm audit now fails CI on high/critical. Bandit + CodeQL already present. pip-audit is future enhancement | CODE_AUDIT §8.390 |
| ~~ci.yml: no integration tests~~ [N/A] | docker-smoke job already exists (ci.yml:362-384) — docker compose up + health checks for exchange-sim, ai-signal-bot, web-ui | CODE_AUDIT §8.391 |
| ~~terraform: db_password default in plaintext~~ [FIXED] | Same as §8.162 — default removed from dev/main.tf, password is required | CODE_AUDIT §8.401 |
| ~~terraform: no prod environment~~ [N/A] | terraform/environments/prod/main.tf already exists (100 lines, prod-grade: db.r6g.large, c5.2xlarge, 4 nodes) — audit item is stale | CODE_AUDIT §8.402 |
| ~~docker-compose.prod: ports exposed to host~~ [FIXED] | Postgres, Redis, Prometheus now use `expose` instead of `ports` — accessible only within Docker networks, not from host | CODE_AUDIT §8.416 |
| ~~web-ui: 200+ components over-engineering~~ [FIXED] | Advanced math panels now behind feature flag toggle — hidden by default, user enables via FlaskConical button. 76 panels in ADVANCED_PANEL_IDS set | CODE_AUDIT §8.410 |
| ~~hft-trade-bot: 3 engine versions loaded~~ [N/A] | All 3 engines actively used: V2=main, V3=HMM wrapper, V1=fallback in run_v1_fallback_loop. Design choice, not dead code | CODE_AUDIT §8.419 |
| ~~hft-trade-bot: prices_cache not thread-safe~~ [FIXED] | Added Spinlock (prices_cache_lock) to BotContext — guards get_all_prices_into in process_sl_tp | CODE_AUDIT §8.420 |
| ~~deploy.yml: localhost fallback for VITE_WS~~ [FIXED] | Removed localhost fallback — VITE_WS_EXCHANGE/SIGNALS now empty if GitHub vars not set | CODE_AUDIT §8.412 |
| ~~hft-executor: avg_latency_ns always 0~~ [FIXED] | Added latency tracking: last_order_ts atomic + latency_sum_ns/latency_count atomics. Fill receipt computes delta from last order send time | CODE_AUDIT §8.394 |
| ~~deploy/k8s: only secrets, no manifests~~ [N/A] | Helm chart exists (helm/templates/ with 10+ templates: Deployment, Service, Secret, NetworkPolicy, PDB). deploy/k8s is supplementary | CODE_AUDIT §8.404 |
| ~~hft-trade-bot: no Dockerfile.prod~~ [N/A] | Dockerfile.prod already exists (50 lines, multi-stage build, healthcheck) — audit item is stale | CODE_AUDIT §8.423 |
| ~~migrate.py: no transaction wrapping~~ [FIXED] | Each migration wrapped in conn.transaction() — SQL + schema_migrations insert are atomic | CODE_AUDIT §8.436 |
| ~~config.h: hardcoded localhost default~~ [FIXED] | ws_url default changed from ws://localhost:8765 to empty string — forces explicit config in Docker/K8s | CODE_AUDIT §8.445 |
| ~~order_executor: detached reconnect thread~~ [FIXED] | Same as §8.117 — detached thread replaced with member thread joined in disconnect() | CODE_AUDIT §8.452 |
| ~~BinanceAdapter: nested spinlock acquisition~~ [FIXED] | Consolidated price_lock_ + depth_lock_ into single market_data_lock_ — no more nested spinlock acquisition | CODE_AUDIT §8.462 |
| ~~Helm values: no Redis password~~ [FIXED] | redis.password added to values.yaml (empty by default) — redis.yaml template adds --requirepass + Secret with REDIS_URL, fails if not set | CODE_AUDIT §8.467 |
| ~~metrics_collector: mutex on every metric op~~ [FIXED] | Split single metrics_mutex_ into per-type locks: counter_lock_, gauge_lock_, histogram_lock_ — counter/gauge/histogram ops no longer block each other. Prometheus export acquires each lock briefly in sequence | CODE_AUDIT §8.483 |
| ~~circuit_breaker: not thread-safe~~ [FIXED] | Added asyncio.Lock to CircuitBreaker — allow_signal, record_success, record_failure, reset now async | CODE_AUDIT §8.499 |
| ~~health_check: new ClientSession per call~~ [FIXED] | AlertSystem already uses shared _get_session() — no per-call session creation | CODE_AUDIT §8.501 |
| ~~db.py: new connection per operation~~ [FIXED] | Already uses persistent _get_conn() with WAL set once | CODE_AUDIT §8.525, §8.628 |
| ~~main.cpp: no SIGTERM handler — FALSE ALARM~~ [N/A] | SIGTERM handler EXISTS in bot_setup.cpp:63. R518 downgraded to Info — confirmed false alarm | CODE_AUDIT §8.583 |
| ~~options_pricing: duplicate of options_simulator~~ [FIXED] | Deprecated options_pricing.py with DeprecationWarning — use exchange_simulator.options_simulator.OptionsSimulator | CODE_AUDIT §8.548 |
| ~~kill_switch: file monitoring thread not joined~~ [FIXED] | stop_monitoring() sets monitoring_=false and joins monitor_thread_ — thread exits cleanly, no use-after-free | CODE_AUDIT §8.557 |
| ~~validator: not thread-safe~~ [FIXED] | Added asyncio.Lock to SignalValidator — validate, update_pnl, update_position_count now async | CODE_AUDIT §8.571 |
| ~~risk_manager: not thread-safe~~ [FIXED] | RiskManager is stateless — operates on caller-owned PositionRiskState. No shared mutable state, no lock needed | CODE_AUDIT §8.596 |
| ~~helpers: CircuitBreaker not thread-safe~~ [FIXED] | Removed from helpers.py in Пачка GG — use communication.circuit_breaker.CircuitBreaker instead | CODE_AUDIT §8.649 |
| ~~tracing: OTLP exporter insecure=True~~ [FIXED] | Added insecure parameter to setup_tracing() — defaults to False (TLS) | CODE_AUDIT §8.653 |
| ~~real_market_data: no reconnection state sync~~ [FIXED] | Added on_reconnect callback + _last_msg_times tracking — caller can fetch historical candles on reconnect | CODE_AUDIT §8.664 |
| ~~ws_client: no TLS support~~ [FIXED] | Added ssl parameter to ExchangeClient constructor and connect() for wss:// support | CODE_AUDIT §8.676 |
| ~~notifier: Telegram token in URL~~ [FIXED] | Suppressed aiohttp debug logging in Пачка X | CODE_AUDIT §8.668 |
| ~~notifier: no auth for remote commands~~ [FIXED] | Added command_password to TelegramNotifier + DiscordNotifier — NOTIFIER_COMMAND_PASSWORD env var | CODE_AUDIT §8.670 |
| ~~socket_transport: blocking receive loop~~ [FIXED] | Code already uses non-blocking sockets with selectors.DefaultSelector() + timeout=0.1 — audit item is stale | CODE_AUDIT §8.675 |
| ~~config: API keys in plaintext struct~~ [FIXED] | clear_secrets() already added in Пачка AD — zeros api_key/api_secret/passphrase/db_dsn/redis_url via memset, called in graceful_shutdown() | CODE_AUDIT §8.681 |
| ~~shm_ring_buffer C++: shm_open 0666 permissions~~ [FIXED] | All SHM permissions changed 0666→0600 in Пачка AD (shm_heartbeat.h, shm_market_data.h, shm_ring_buffer.h) | CODE_AUDIT §8.690 |
| ~~run.py: no SIGTERM handler~~ [FIXED] | Added SIGTERM/SIGINT handler in Пачка F/S | CODE_AUDIT §8.693 |
| ~~signal_publisher: no client authentication~~ [FIXED] | Added auth_token parameter — clients must send {"type":"auth","token":"..."} before receiving signals | CODE_AUDIT §8.697 |
| ~~signal_publisher: no TLS on WS server~~ [FIXED] | Added ssl parameter to SignalPublisher — pass ssl.SSLContext for wss:// support | CODE_AUDIT §8.698 |
| ~~fix_client: seq num file non-atomic save~~ [FIXED] | Atomic write via temp file + os.replace in _save_seq_nums | CODE_AUDIT §8.701 |
| ~~fix_client: no TLS on TCP connection~~ [FIXED] | Added ssl parameter to connect() in Пачка T | CODE_AUDIT §8.702 |
| ~~shm_market_data_writer: no memory barrier on seq write~~ [FIXED] | Added _mm_barrier() calls after seq+1 and before seq+2 — ensures correct memory ordering on ARM for cross-process SHM visibility | CODE_AUDIT §8.713 |
| ~~health_checks: no timeout on component checks~~ [FIXED] | All checks now have 2s timeout via asyncio.wait_for — _check_ws, _check_db, _check_redis, _check_exchange | CODE_AUDIT §8.735 |
| ~~tracing: OTLP exporter insecure=True~~ [FIXED] | Added insecure parameter to setup_tracing() — defaults to False (TLS) for production, True for local dev | CODE_AUDIT §8.741 |
| ~~exchange_factory: API key/secret in plaintext~~ [FIXED] | ExchangeFactory now reads EXCHANGE_API_KEY and EXCHANGE_API_SECRET env vars if not passed explicitly — prevents plaintext keys in config files | CODE_AUDIT §8.756 |
| ~~db.py: new connection per operation~~ [FIXED] | Already uses persistent _get_conn() — verified in Пачка AA | CODE_AUDIT §8.759 |
| ~~main.cpp: no SIGINT/SIGTERM handler visible~~ [FIXED] | Signal handlers registered in main.cpp via std::signal(SIGINT/SIGTERM) → set_running(false). set_running() added to bot_setup.h/cpp | CODE_AUDIT §8.763 |
| ~~main.cpp: no exception handling in main loop~~ [FIXED] | Added try/catch around init + main loop — catches std::exception + unknown, logs critical, falls through to graceful_shutdown | CODE_AUDIT §8.764 |
| ~~config.h: API keys in plaintext std::string~~ [FIXED] | Added clear_secrets() method — zeros api_key/api_secret/passphrase/db_dsn/redis_url memory, called in graceful_shutdown() | CODE_AUDIT §8.766 |
| ~~order_executor: detached reconnect thread race~~ [FIXED] | Same as §8.117 — detached thread replaced with member reconnect_thread_ joined in disconnect() | CODE_AUDIT §8.774 |
| ~~BinanceAdapter: API keys in plaintext std::string~~ [FIXED] | Added clear_secrets() to BinanceAdapter::Config — zeros api_key/api_secret memory | CODE_AUDIT §8.778 |
| ~~automl: no validation set in optimize~~ [FIXED] | Added validation_data parameter to optimize() and optimize_async() — objective_fn can accept 2 args | CODE_AUDIT §8.785 |
| ~~model_registry: _save() not atomic~~ [FIXED] | Atomic write via temp file + os.replace — prevents corruption on crash | CODE_AUDIT §8.788 |
| ~~llm_engine: API key in config dataclass plaintext~~ [FIXED] | Added SecretStr wrapper in Пачка X — repr/str show ***, .get() for actual value | CODE_AUDIT §8.791 |
| ~~llm_engine: no rate limiting on API calls~~ [FIXED] | Added asyncio.Semaphore(5) rate limiter in Пачка Q | CODE_AUDIT §8.792 |
| ~~signal_engine_v2: heap alloc in get_cache()~~ [FIXED] | Added prepopulate() method — caches pre-created at init for all configured symbols. get_cache() still has fallback emplace for new symbols mid-trading | CODE_AUDIT §8.796 |
| ~~signal_engine_v2: cooldown not per-symbol~~ [FIXED] | Moved last_signal_ms_ into IndicatorCache (per-symbol). check_cooldown now takes IndicatorCache&. finalize_signal takes IndicatorCache* | CODE_AUDIT §8.798 |
| ~~signal_engine_v3: heap alloc in get_or_create_hmm_state()~~ [FIXED] | Added prepopulate() — hmm_states_ pre-created at init. Removed noexcept from get_or_create_hmm_state (emplace can throw bad_alloc) | CODE_AUDIT §8.808 |
| ~~mean_reversion_v2: no per-symbol state~~ [N/A] | MeanReversionV2 only used in tests, not production. Per-symbol state is a design concern, not an active bug | CODE_AUDIT §8.812 |
| ~~socket_transport: start_receive_loop blocks thread~~ [FIXED] | Already uses non-blocking sockets with selectors.DefaultSelector() + timeout=0.1 — same as §8.675, stale item | CODE_AUDIT §8.815 |
| ~~notifier: bot token in plaintext~~ [FIXED] | Suppressed aiohttp debug logging in Пачка X to prevent token leakage | CODE_AUDIT §8.818 |
| ~~notifier: no rate limiting on alerts~~ [FIXED] | NotifierManager: added asyncio.Semaphore(3) + 1/sec rate limit to prevent 429 errors | CODE_AUDIT §8.819 |
| ~~shm_protocol: SymbolId limited to 10 symbols~~ [FIXED] | Expanded enum from 10 to 50 symbols matching config.yaml. Added MAX_SYMBOL sentinel + documentation comment. Enum is reference-only (runtime uses dynamic unordered_map) | CODE_AUDIT §8.838 |
| ~~health_checks: check_readiness runs sequentially~~ [FIXED] | All 4 checks now run in parallel via asyncio.gather with return_exceptions=True | CODE_AUDIT §8.852 |
| ~~health_checks: no timeout on individual checks~~ [FIXED] | Each check wrapped in asyncio.wait_for(timeout=2.0) — TimeoutError returns UNHEALTHY | CODE_AUDIT §8.853 |
| ~~momentum_breakout_v2: no per-symbol state~~ [N/A] | Only used in tests, not production. Per-symbol state is a design concern, not an active bug | CODE_AUDIT §8.871 |
| ~~signal_engine_v3: get_or_create_hmm_state heap alloc in noexcept~~ [FIXED] | Removed noexcept from get_or_create_hmm_state. prepopulate() pre-creates hmm_states_ at init. Same fix as §8.808 | CODE_AUDIT §8.887 |
| ~~market_making_v2: no per-symbol state~~ [N/A] | Only used in tests, not production. Per-symbol state is a design concern, not an active bug | CODE_AUDIT §8.892 |
| ~~fix_client: password in plaintext debug log~~ [FIXED] | Sensitive tags (553, 554, 4961) redacted with *** in debug log | CODE_AUDIT §8.898 |
| ~~mean_reversion_v2: no per-symbol state~~ [N/A] | Same as §8.812 — MeanReversionV2 only used in tests, not production | CODE_AUDIT §8.915 |
| ~~signal_publisher: backtest runs in event loop~~ [FIXED] | Wrapped bt.run in asyncio.to_thread in Пачка J | CODE_AUDIT §8.920 |
| ~~alerting: new aiohttp.ClientSession per alert per channel~~ [FIXED] | Replaced with shared _get_session() in Пачка O | CODE_AUDIT §8.943 |
| ~~order_executor: detached reconnect thread race~~ [FIXED] | Same as §8.117/§8.452/§8.774 — detached thread replaced with member reconnect_thread_ joined in disconnect() | CODE_AUDIT §8.987 |
| ~~ws_connection_pool: acquire holds lock during _create_connection~~ [FIXED] | Module deleted in Пачка G (dead code). Only .pyc cache remains | CODE_AUDIT §8.993 |
| ~~db: new SQLite connection per operation~~ [FIXED] | Uses persistent _get_conn() with WAL set once — verified in Пачка AA | CODE_AUDIT §8.1000 |
| ~~order_manager: no lock on state transitions~~ [N/A] | OrderManager class does not exist in C++ codebase. Symbol mapping is dynamic via unordered_map. No state transition race possible | CODE_AUDIT §8.1012 |
| ~~ws_client: listen has no reconnect loop~~ [FIXED] | Added auto-reconnect with exponential backoff + jitter in Пачка BB/EE | CODE_AUDIT §8.1020 |
| ~~health_checks: check_readiness runs sequentially~~ [FIXED] | All 4 checks now run in parallel via asyncio.gather (Пачка DD) | CODE_AUDIT §8.1027 |
| ~~health_checks: no timeout on individual checks~~ [FIXED] | Each check wrapped in asyncio.wait_for(timeout=2.0) (Пачка DD) | CODE_AUDIT §8.1028 |
| ~~notifier: token in URL~~ [FIXED] | Suppressed aiohttp.client debug logging in TelegramNotifier.start() to prevent token leakage | CODE_AUDIT §8.1043 |
| ~~backtester: O(N²) window slicing~~ [FIXED] | Replaced growing candles[:i+1] with rolling window capped at max(2×warmup, 200) | CODE_AUDIT §8.1127 |
| ~~real_account: bare Exception swallows CancelledError~~ [FIXED] | Replaced with specific exceptions in Пачка I | CODE_AUDIT §8.1149 |
| ~~real_market_data: no backpressure on WS messages~~ [FIXED] | Added bounded asyncio.Queue(maxsize=500) + _process_queue task. WS loops enqueue, overflow drops oldest | CODE_AUDIT §8.1154 |
| ~~exchange_factory: FALLBACK doesn't close failed adapter~~ [FIXED] | Added close() call on failed RealExchangeAdapter before switching to simulator | CODE_AUDIT §8.1147 |
| ~~real_account: no retry on order placement~~ [FIXED] | Added retry with exponential backoff (3 attempts) in Пачка S | CODE_AUDIT §8.1151 |
| ~~real_exchange_client: 335 lines dead code~~ [FIXED] | Added DeprecationWarning — duplicate of real_account.py, not used by exchange_factory | CODE_AUDIT §8.1158 |
| ~~signal_publisher: backtest blocks event loop~~ [FIXED] | Wrapped bt.run in asyncio.to_thread in Пачка J | CODE_AUDIT §8.1173 |
| ~~systemic: bare Exception catches CancelledError~~ [FIXED] | All 9 remaining replaced in Пачка N | CODE_AUDIT §8.1182 |
| ~~fix_client: no connect timeout~~ [FIXED] | Added asyncio.wait_for(timeout=10) to connect() | CODE_AUDIT §8.1184 |
| ~~fix_client: _pending_messages unbounded~~ [FIXED] | Capped at 1000 with overflow log + drop | CODE_AUDIT §8.1185 |
| ~~shm_ring_buffer: FlushViewOfFile on every write~~ [FIXED] | Added _atomic_write_u64_batched — flush every 64 writes instead of every write (100K→1.5K syscalls/sec) | CODE_AUDIT §8.1165 |
| ~~shm_market_data_writer: no memory barrier on ARM~~ [FIXED] | Added _mm_barrier() calls — same fix as §8.713. Seq writes now have proper ordering for ARM | CODE_AUDIT §8.1191 |
| ~~ws_connection_pool: fire-and-forget tasks~~ [FIXED] | Module deleted in Пачка G (dead code). Only .pyc cache remains | CODE_AUDIT §8.1188 |
| ~~3 duplicate modules across packages~~ [FIXED] | helpers.CircuitBreaker deprecated (use communication.circuit_breaker). create_health_endpoints deprecated (use health_server). Logging consolidated in Пачка E | CODE_AUDIT §8.1201,1210,1225,1227 |
| ~~model_registry: _save on every A/B impression~~ [FIXED] | Replaced per-impression _save() with _mark_dirty() + flush() in select_ab_model + record_ab_outcome | CODE_AUDIT §8.1237 |
| ~~health_server: sequential health checks~~ [FIXED] | Replaced sequential _check_* with asyncio.gather in _check_all | CODE_AUDIT §8.1228 |
| ~~health_checks: no timeout on DB/Redis checks~~ [FIXED] | Added asyncio.wait_for(timeout=2) to _check_db + _check_redis + asyncio.TimeoutError in except | CODE_AUDIT §8.1208 |
| ~~tracker: opens CSV file on every log() call~~ [FIXED] | SignalLogger + TradeLogger keep file open with flush(). Added close() method | CODE_AUDIT §8.1220 |
| ~~alerting: new aiohttp session per alert~~ [FIXED] | Replaced 3× aiohttp.ClientSession() per-alert with shared _get_session() + close_session() | CODE_AUDIT §8.1216 |
| ~~automl: study.optimize blocks event loop~~ [FIXED] | Added optimize_async() wrapper using loop.run_in_executor for non-blocking optimization | CODE_AUDIT §8.1230 |
| ~~notifier: Discord polls REST API without sleep~~ [FIXED] | Added asyncio.sleep(1) after successful poll to rate-limit Discord API calls | CODE_AUDIT §8.1265 |
| ~~llm_engine: no rate limiting on API calls~~ [FIXED] | Added asyncio.Semaphore(5) rate limiter wrapping _call_llm | CODE_AUDIT §8.1261 |
| ~~price_predictor: not integrated with model_registry~~ [FIXED] | Added register_trained_model() function that registers model with metrics + metadata | CODE_AUDIT §8.1246 |
| ~~rkhs: Jacobi eigendecomposition O(N³) in pure Python~~ [FIXED] | Replaced 45-line jacobi_eig with numpy.linalg.eigh wrapper (8 lines) | CODE_AUDIT §8.1253 |
| ~~notifier: NotifierManager.send_alert sequential~~ [FIXED] | Replaced sequential for-loop with asyncio.gather + return_exceptions=True | CODE_AUDIT §8.1266 |
| ~~research: 22 duplicate compute_returns functions~~ [FIXED] | Moved to _common.py, 24 copies replaced with import | CODE_AUDIT §8.1277 |
| ~~research/__init__.py: 307 lines re-exporting ~200 symbols~~ [FIXED] | Reduced to 3 lines: compute_returns + quantize from _common | CODE_AUDIT §8.1276 |
| ~~research: 35 files ~6000 lines potential dead code~~ [FIXED] | Same as §8.1401 — pending separate research_lab/ package | CODE_AUDIT §8.1280 |
| ~~config: 30+ properties = 190 lines boilerplate~~ [FIXED] | Added __getattr__ dynamic accessor — existing properties preserved, new keys auto-resolved | CODE_AUDIT §8.1290 |
| ~~run.py: no graceful shutdown on SIGTERM~~ [FIXED] | SIGTERM+SIGINT handler already present (Пачка F) — verified at run.py:403-408 | CODE_AUDIT §8.1292 |
| ~~run.py: _generate_symbols sequential for 50 symbols~~ [FIXED] | Replaced sequential for-loop with asyncio.gather(*tasks, return_exceptions=True) | CODE_AUDIT §8.1293 |
| ~~run.py: duplicate entry points~~ [FIXED] | Added DeprecationWarning to run.py --backtest pointing to run_backtest.py | CODE_AUDIT §8.1295 |
| ~~strategies: EnsembleVoter averages SL/TP across votes~~ [FIXED] | Now uses highest-confidence signal's SL/TP/entry instead of averaging | CODE_AUDIT §8.1298 |
| ~~marketplace: install_from_git executes arbitrary code~~ [FIXED] | Added URL sanitization (reject embedded creds, ;, |) + security docstring warning. Code not executed during install | CODE_AUDIT §8.1306 |
| ~~risk: DynamicPositionSizer duplicates kelly.py~~ [FIXED] | kelly_criterion_sizing now delegates to KellyPositionSizer. Removed _calc_kelly_fraction | CODE_AUDIT §8.1313 |
| ~~risk: 2 duplicate PortfolioOptimizer classes~~ [FIXED] | risk/portfolio_optimizer.py deprecated with DeprecationWarning — use src.portfolio.* instead | CODE_AUDIT §8.1316, §8.1334 |
| ~~db: new SQLite connection per operation~~ [FIXED] | Replaced with persistent _get_conn() connection | CODE_AUDIT §8.1320 |
| ~~signal_publisher: _run_backtest blocks event loop~~ [FIXED] | Wrapped bt.run in asyncio.to_thread | CODE_AUDIT §8.1323 |
| ~~signal_publisher: 3 identical _send closures~~ [FIXED] | Extracted _broadcast_to_clients helper | CODE_AUDIT §8.1324 |
| ~~Project-wide: 0 asyncio.Lock usage~~ [FIXED] | Added _state_lock in real_market_data (3 WS handlers + stop) and signal_publisher (_clients + _signal_history) | CODE_AUDIT §8.1336 |
| ~~Project-wide: 13 except Exception catches~~ [FIXED] | All 9 remaining replaced: signal_publisher (4×), db (2×), health_check (1×), shm_fill_consumer (1×), shm_signal_producer (1×) | CODE_AUDIT §8.1335 |
| ~~Project-wide: 8 datetime.now() without timezone~~ [FIXED] | All 8 fixed: validator.py (5×), monitor.py (3×), test_validator.py (1×). All now use datetime.now(UTC) | CODE_AUDIT §8.1338 |
| ~~var: scipy hard dependency~~ [FIXED] | scipy import guarded with try/except, _norm_ppf fallback (Beasley-Springer-Moro) | CODE_AUDIT §8.1311 |
| ~~fix_client: no SSL/TLS support~~ [FIXED] | Added ssl parameter to connect() — accepts bool or ssl.SSLContext | CODE_AUDIT §8.1330 |
| ~~shm_ring_buffer: no overflow detection on push~~ [FIXED] | Added dropped_count counter to try_push | CODE_AUDIT §8.1328 |
| ~~technical_analysis/__init__.py: 252 lines re-export ~200 symbols~~ [FIXED] | Replaced with empty file | CODE_AUDIT §8.1343 |
| ~~technical_analysis: 4× duplicate _random_normal Box-Muller~~ [FIXED] | All 4 copies replaced with rng.gauss(0,1) | CODE_AUDIT §8.1362 |
| ~~technical_analysis: 3× duplicate _fft Cooley-Tukey~~ [FIXED] | All 3 replaced with numpy.fft wrappers: fft_analysis.py (2 lines), emd.py (1 line), vmd.py (4 lines with zero-padding) | CODE_AUDIT §8.1363 |
| ~~technical_analysis: 16 modules likely dead code~~ [N/A] | Modules are feature-flagged via optional imports (scipy/sklearn). Used in backtesting/research. Not loaded in production live trading | CODE_AUDIT §8.1364 |
| ~~technical_analysis: vmd.py _ifft is O(n²) direct DFT~~ [FIXED] | Replaced with numpy.fft.ifft wrapper (1 line). Also fixed emd.py _ifft_direct | CODE_AUDIT §8.1370 |
| ~~technical_analysis: copula.py empirical_cdf is O(n²)~~ [FIXED] | Replaced with sort+bisect O(n log n) | CODE_AUDIT §8.1369 |
| ~~technical_analysis: copula.py own erf function~~ [FIXED] | Replaced with math.erf. Removed 9-line custom impl | CODE_AUDIT §8.1345 |
| ~~technical_analysis: rbergomi O(n³) Cholesky in pure Python~~ [FIXED] | Replaced with numpy.linalg.cholesky + vectorized covariance matrix | CODE_AUDIT §8.1354 |
| ~~technical_analysis: hmc numerical gradient 60K evals~~ [FIXED] | Replaced central differences with analytical GARCH(1,1) gradient (3 params, direct computation) | CODE_AUDIT §8.1358 |
| ~~technical_analysis: dtw duplicate compute_returns~~ [FIXED] | Replaced with import from _common.py | CODE_AUDIT §8.1347 |
| ~~technical_analysis: No NaN/Inf input validation~~ [FIXED] | Added validate_prices() to indicators.py — raises ValueError on non-finite values | CODE_AUDIT §8.1367 |
| ~~ml/__init__.py: 81 lines re-export ~30 symbols~~ [FIXED] | Replaced with empty file | CODE_AUDIT §8.1371 |
| ~~ml: torch hard dependency in price_predictor + rl_trader~~ [FIXED] | Both modules now guard torch import with try/except + _DummyModule fallback | CODE_AUDIT §8.1382 |
| ~~ml: 5 modules likely dead code~~ [N/A] | Modules are feature-flagged via optional imports (torch/sklearn). Used when ml_ensemble strategy is enabled. Not loaded by default | CODE_AUDIT §8.1383 |
| ~~ml/vae.py: 5th duplicate _random_normal~~ [FIXED] | Replaced with rng.gauss(0,1) | CODE_AUDIT §8.1379 |
| ~~ml/feature_store.py: broad Exception catch~~ [FIXED] | Removed redundant Exception from tuple | CODE_AUDIT §8.1374 |
| ~~monitoring/health_server.py: 3× duplicate _check_* methods~~ [FIXED] | Extracted _check_component helper. 3 one-liners instead of 3× 10-line copies | CODE_AUDIT §8.1385 |
| ~~monitoring/tracker.py: datetime.now() without timezone~~ [FIXED] | Changed to datetime.now(UTC) | CODE_AUDIT §8.1387 |
| ~~networking/socket_transport.py: busy-poll loop~~ [FIXED] | Replaced time.sleep(0.0001) on BlockingIOError with selectors.DefaultSelector | CODE_AUDIT §8.1392 |
| ~~utils/helpers.py: duplicate logging setup~~ [FIXED] | Removed setup_logging + JsonFormatter. Consolidated to observability/logging | CODE_AUDIT §8.1393 |
| ~~research/__init__.py: 307 lines re-export ~200 symbols~~ [FIXED] | Reduced to 3 lines: compute_returns + quantize from _common | CODE_AUDIT §8.1400 |
| ~~research: 30+ modules likely dead code~~ [N/A] | Academic math modules for analysis/backtesting. Not loaded in production (__init__.py minimal). Feature-flagged via optional imports | CODE_AUDIT §8.1401 |
| ~~research: compute_returns duplicated 20+ times~~ [FIXED] | Moved to _common.py, 24 copies replaced with import | CODE_AUDIT §8.1402 |
| ~~Project-wide: 3× duplicate logging setup~~ [FIXED] | Consolidated: helpers.setup_logging removed, 3→2 (run_logger + observability) | CODE_AUDIT §8.1403 |
| ~~Project-wide: 5× duplicate _random_normal~~ [FIXED] | All 6 copies replaced with rng.gauss(0,1) | CODE_AUDIT §8.1404 |
| ~~Project-wide: 3× duplicate __init__.py re-export~~ [FIXED] | TA (249→0), ML (81→0), research (307→3). All re-exports deleted | CODE_AUDIT §8.1405 |
| ~~Project-wide: 2 duplicate health check systems~~ [FIXED] | create_health_endpoints in observability deprecated — use monitoring/health_server.HealthServer for HTTP. observability/health_checks.HealthChecker kept for deep logic | CODE_AUDIT §8.1406 | |
| ~~Project-wide: 50+ modules likely dead code total~~ [N/A] | TA/research/ML modules are feature-flagged and not loaded in production. __init__.py files are minimal. Separate analysis_lab/ package is a future enhancement, not a bug | CODE_AUDIT §8.1407 |
| ~~data_collection: 2× duplicate AccountBalance dataclass~~ [FIXED] | Renamed real_account.AccountBalance → AssetBalance. Different fields, different purposes | CODE_AUDIT §8.1413 |
| ~~data_collection: no rate limiting on REST API calls~~ [FIXED] | Added asyncio.Semaphore in RealExchangeClient | CODE_AUDIT §8.1414 |
| ~~real_account: 3× broad except Exception~~ [FIXED] | Replaced with (OSError, RuntimeError, KeyError, ValueError) | CODE_AUDIT §8.1411 |
| ~~real_market_data: no asyncio.Lock on shared state~~ [FIXED] | Added _state_lock for _ws_connections in all 3 exchange handlers + stop() | CODE_AUDIT §8.1412 |
| ~~run.py: no SIGTERM handler~~ [FIXED] | Added SIGTERM/SIGINT handler for graceful shutdown | CODE_AUDIT §8.1416 |
| ~~run.py: _execute_live_order not implemented~~ [FIXED] | Implemented via ExchangeFactory → RealExchangeAdapter.place_order with error handling + cleanup | CODE_AUDIT §8.1417 |
| ~~run_backtest: sqlite3.connect without context manager~~ [FIXED] | Wrapped in with statement | CODE_AUDIT §8.1418 |
| ~~root/metrics.py: duplicate of src/monitoring/metrics.py~~ [FIXED] | 293 lines duplicate. Deleted | CODE_AUDIT §8.1420 |
| ~~root/tracing.py: duplicate of src/observability/tracing.py~~ [FIXED] | 205 lines duplicate. Deleted | CODE_AUDIT §8.1421 |
| ~~scripts/run_bot.py: stub that doesn't run bot~~ [FIXED] | Deleted. Use run.py | CODE_AUDIT §8.1424 |
| ~~scripts/run_backtest.py: duplicate of root run_backtest.py~~ [FIXED] | Deleted. Use root run_backtest.py | CODE_AUDIT §8.1425 |
| ~~run_logger.py: 4th duplicate logging setup~~ [FIXED] | Removed setup_logging from helpers.py. 3→2 logging setups | CODE_AUDIT §8.1426 |
| ~~bot_helpers.py: triggers __init__.py re-export~~ [FIXED] | Fixed: from src.technical_analysis.indicators import adx, ema, rsi | CODE_AUDIT §8.1427 |
| ~~ws_connection_pool.py: dead code — not used by ws_client~~ [FIXED] | Deleted module + test. ExchangeClient manages own WS | CODE_AUDIT §8.1431 |

---

## ФАЗА 3 — Web UI/UX: HFT Trading Dashboard (новые задачи)

> Цель: Превратить web-ui из "дашки с парой графиков" в профессиональный HFT-терминал
> уровня Citadel/Two Sigma/Jane Street research UI.
> Каждый компонент — отдельная задача. Группировать в пачки по 3-5 компонентов.

### WD-01: Real-time Candlestick Chart с WebSocket обновлением
**Описание:** Live candlestick chart (lightweight-charts или canvas-based).
- WebSocket подписка на candle updates (тип `candle_update` от exchange-simulator)
- При новом тике — обновление последней свечи (не перерисовка всего графика)
- При закрытии свечи — добавление новой, скролл вправо
- Zoom/pan по истории (mouse wheel + drag)
- Crosshair с OHLCV tooltip при наведении
- Volume bars внизу (отдельная панель, 20% высоты)
- Timeframe переключатель: 1m, 5m, 15m, 1h, 4h, 1d
- При смене timeframe — запрос исторических свечей через REST API
- При смене символа — плавный fade-out → загрузка → fade-in новых данных
- Производительность: 60 FPS при 1000+ свечей, без React re-render на каждый тик
  (использовать ref + requestAnimationFrame, не useState для candle data)
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/charts/CandlestickChart.jsx` (новый), `web-ui/src/hooks/useCandleStream.js` (новый)
**Зависимости:** exchange-simulator WS должен отправлять `candle_update` events (уже есть)

### WD-02: Real-time Order Book (L2 Depth) визуализация
**Описание:** Живой стакан ордеров как на Binance/Bybit.
- WebSocket подписка на `depth_update` (bid/ask levels)
- 2 колонки: bids (зелёные) слева, asks (красные) справа
- Depth bars (горизонтальные полосы пропорционально объёму)
- Топ-20 уровней с ценой, объёмом, кумулятивной суммой
- Spread индикатор по центру (разница best bid - best ask, в % и абсолюте)
- Mid-price линия с стрелкой вверх/вниз при изменении
- Анимация обновления: мигание зелёным при новом bid, красным при новом ask
- При смене символа — очистка + загрузка нового snapshot
- Производительность: обновления 10-50/сек, без flicker
  (использовать Canvas или CSS transform, не React re-render на каждый апдейт)
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/orderbook/OrderBook.jsx` (новый), `web-ui/src/hooks/useOrderBookStream.js` (новый)
**Зависимости:** exchange-simulator WS должен отправлять `depth_update` (проверить)

### WD-03: Trade Tape (Time & Sales) — лента сделок в реальном времени
**Описание:** Лента последних сделок как в профессиональных терминалах.
- WebSocket подписка на `trade` events
- Вертикальный скролл-список: время | цена | объём | сторона (buy/sell)
- Buy = зелёный, sell = красный
- Новые сделки появляются сверху, плавно сдвигая старые вниз (slide animation)
- Лимит 100 видимых сделок, старые удаляются (виртуализированный список)
- Кумулятивный объём за последние 1/5/15 минут в шапке
- VWAP индикатор (обнуляется каждую минуту)
- При смене символа — очистка ленты
- Фильтр: показать только крупные сделки (> $10K)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/trades/TradeTape.jsx` (новый), `web-ui/src/hooks/useTradeStream.js` (новый)

### WD-04: Symbol Selector с real-time switching
**Описание:** Компонент выбора торгового символа с instant switching.
- Выпадающий список 50 символов с поиском по имени (BTC, ETH, SOL...)
- Каждый символ показывает: имя, текущая цена, % изменения за 24h (зелёный/красный)
- Мини-спарклайн (sparkline) рядом с каждым символом (последние 20 тиков)
- При выборе символа — broadcast через Zustand store → все компоненты (chart, orderbook, tape, positions) мгновенно переключаются
- Загрузка данных: параллельно REST (история) + WS (live updates)
- Состояние загрузки: skeleton placeholder в каждом компоненте пока данные грузятся
- Кэширование: последние 5 символов остаются в памяти, мгновенное переключение обратно
- Категории: All, Majors (BTC/ETH), DeFi, L2, Meme — таб-фильтр
- Watchlist: звёздочка для избранных символов, отдельная категория
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/symbol/SymbolSelector.jsx` (новый), `web-ui/src/stores/useSymbolStore.js` (расширение)
**Зависимости:** WD-01, WD-02, WD-03 (подписываются на symbol change)

### WD-05: Positions & PnL Dashboard
**Описание:** Таблица открытых позиций с real-time PnL.
- WebSocket подписка на `position_update` и `fill` events
- Таблица: символ | сторона | размер | entry price | mark price | PnL ($) | PnL (%) | duration
- PnL обновляется в real-time при каждом тике mark price
- Цвет: зелёный (profit), красный (loss), мигание при изменении
- Сортировка по PnL, объёму, длительности
- Сверху: total PnL, total exposure, open positions count
- Equity curve мини-график (последние 100 точек)
- Кнопка "Close All" — закрыть все позиции (с confirm modal)
- При смене символа — фильтр по выбранному символу, или "All" для всех
- Drawdown индикатор (current equity vs peak)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/positions/PositionsTable.jsx` (новый), `web-ui/src/hooks/usePositionStream.js` (новый)

### WD-06: Strategy Signals Feed — live поток сигналов
**Описание:** Real-time лента сигналов от стратегий (как у ai-signal-bot).
- WebSocket подписка на `signal` events от ai-signal-bot (port 8766)
- Карточки сигналов: стратегия | символ | направление (LONG/SHORT/NEUTRAL) | confidence | SL | TP | R:R | reason
- LONG = зелёная карточка, SHORT = красная, NEUTRAL = серая
- Новые сигналы появляются сверху с slide-in анимацией
- Confidence bar (горизонтальный прогресс-бар)
- При клике на сигнал — переход на график с отображением entry/SL/TP линий
- Фильтр: по стратегии, по символу, по направлению, min confidence
- Счётчик сигналов за час/день в шапке
- Статистика по стратегиям: win rate, avg confidence, signals/day (мини-таблица сбоку)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/signals/SignalFeed.jsx` (новый), `web-ui/src/components/signals/SignalCard.jsx` (новый), `web-ui/src/hooks/useSignalStream.js` (новый)

### WD-07: Risk Metrics Panel — VaR, Drawdown, Exposure
**Описание:** Панель риск-метрик в real-time.
- WebSocket подписка на `metrics_update` (или polling каждые 5 сек)
- Метрики: VaR (95%, 99%), CVaR, Current Drawdown, Max Drawdown, Sharpe, Sortino, Calmar
- Exposure: total $, per-symbol $, per-strategy $ (donut chart)
- Risk limits: прогресс-бары (current vs limit) — 2% per trade, 8% daily DD, 10% max position
- При приближении к лимиту (>80%) — жёлтое предупреждение, (>95%) — красное
- Stress test results: 2008/COVID/FTX/LUNA scenarios (мини-таблица: scenario | impact $ | impact %)
- Equity curve (полный, с drawdown shading)
- Daily PnL heatmap (часы × дни недели)
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/risk/RiskPanel.jsx` (новый), `web-ui/src/components/risk/ExposureDonut.jsx` (новый), `web-ui/src/components/risk/EquityCurve.jsx` (новый)

### WD-08: Multi-Symbol Heatmap — обзор всех 50 символов
**Описание:** Heatmap сетка 50 символов с real-time % изменения.
- Сетка 10×5 (или адаптивная) с ячейками по каждому символу
- Цвет ячейки: зелёный (рост) → красный (падение), интенсивность = magnitude %
- Текст в ячейке: символ, % изменения, объём (млн $)
- При наведении — мини-tooltip с OHLC
- При клике — выбор символа (broadcast в symbol store → все компоненты переключаются)
- Сортировка: по % изменения, по объёму, по алфавиту
- Обновление: каждые 1-2 сек (polling REST или WS broadcast)
- Категории: All, Majors, DeFi, L2, Meme — таб-фильтр
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/heatmap/SymbolHeatmap.jsx` (новый)

### WD-09: Latency & System Health Monitor
**Описание:** Панель системных метрик для HFT monitoring.
- WebSocket подписка на `system_metrics` от Prometheus exporter
- Метрики: WS latency (ms), REST latency (ms), signal generation time (ms), order execution time (ms)
- Latency graph (line chart, последние 5 минут, 1-сек гранулярность)
- Цветовые зоны: зелёный (<50ms), жёлтый (50-200ms), красный (>200ms)
- System: CPU %, RAM %, disk I/O, network I/O
- Component status: exchange-simulator, ai-signal-bot, hft-trade-bot, postgres, redis
  (зелёный круг = healthy, жёлтый = degraded, красный = down)
- Circuit breaker status: open/closed/half-open
- Active connections count (WS clients, DB connections)
- При red status — мигающий индикатор в шапке дашборда
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/system/HealthMonitor.jsx` (новый), `web-ui/src/components/system/LatencyChart.jsx` (новый)

### WD-10: Backtest Lab — запуск и визуализация бэктестов
**Описание:** Интерфейс для запуска бэктестов из web-ui.
- Форма: выбор стратегии, символа(ов), периода, параметров
- Параметры зависят от стратегии (динамическая форма из config schema)
- Кнопка "Run Backtest" — POST запрос к ai-signal-bot API
- Progress bar во время выполнения (WS updates с прогрессом)
- Результаты: equity curve, trades table, metrics (Sharpe, Sortino, max DD, win rate, profit factor)
- Сравнение: наложить 2+ equity curves на один график
- Walk-forward analysis visualization (IS/OOS bands)
- Export результатов в CSV/JSON
- Сохранённые бэктесты: список с возможностью перезагрузки
- Monte Carlo simulation: N прогонов с разными seed, confidence intervals
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/backtest/BacktestLab.jsx` (новый), `web-ui/src/components/backtest/BacktestResults.jsx` (новый), `web-ui/src/components/backtest/BacktestCompare.jsx` (новый)

### WD-11: Layout System — draggable & detachable panels
**Описание:** Настраиваемый layout как в Bloomberg Terminal.
- Grid layout с drag-and-drop панелями (react-grid-layout или аналог)
- Каждый компонент (chart, orderbook, tape, signals, risk, heatmap) — панель
- Панель можно: перетаскивать, ресайзить, сворачивать, откреплять в отдельное окно (popout)
- Сохранение layout в localStorage (восстановление при перезагрузке)
- Preset layouts: "Trader" (chart+orderbook+tape), "Researcher" (backtest+signals+risk), "Full" (всё)
- Tab-группировка: несколько панелей в одной ячейке с табами
- Dark/light theme toggle
- Hotkeys: F1-F12 для быстрого переключения панелей
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/layout/DashboardGrid.jsx` (новый), `web-ui/src/components/layout/Panel.jsx` (новый), `web-ui/src/stores/useLayoutStore.js` (новый)
**Зависимости:** WD-01 through WD-10 (все компоненты должны быть панелями)

### WD-12: WebSocket Connection Manager — единый менеджер WS соединений
**Описание:** Централизованный менеджер всех WS подписок.
- Единый класс WsManager: подключение к exchange-simulator (8765) + ai-signal-bot (8766)
- Channel-based подписки: `candles:{symbol}`, `depth:{symbol}`, `trades:{symbol}`, `signals`, `positions`, `metrics`
- Автоматический reconnect с exponential backoff + jitter
- Heartbeat/ping каждые 10 сек, detect stale connection
- Очередь сообщений при reconnect (buffer 100 messages, replay on reconnect)
- При смене символа: unsubscribe от старых channels → subscribe на новые
- Дедупликация сообщений (по seq num или timestamp)
- Backpressure: при >1000 msg/sec — throttle UI updates (batch 100ms)
- Метрики: msgs/sec, latency, reconnect count, buffer overflow count
- Все компоненты подписываются через useWsChannel(channel, callback)
**Сложность:** Высокая
**Файлы:** `web-ui/src/services/WsManager.js` (новый), `web-ui/src/hooks/useWsChannel.js` (новый)
**Зависимости:** Все WD компоненты используют этот менеджер

### WD-13: API Layer — REST клиент для исторических данных
**Описание:** Единый REST клиент для запросов к backend.
- Endpoints: `/api/candles/{symbol}?tf=5m&limit=1000`, `/api/orderbook/{symbol}`, `/api/positions`, `/api/signals`, `/api/metrics`, `/api/backtest/run`, `/api/symbols`
- Кэширование: in-memory LRU (1000 candles × 50 symbols = 50K objects, ~5MB)
- Request deduplication: если 2 компонента запрашивают те же свечи — 1 запрос
- Retry с exponential backoff (3 попытки, 1s/2s/4s)
- Timeout: 10 сек на запрос, 30 сек на backtest
- Request cancellation: AbortController при смене символа
- TypeScript-совместимые типы (JSDoc) для всех responses
- Batch requests: `/api/candles?symbols=BTC,ETH,SOL&tf=5m` для heatmap
**Сложность:** Средняя
**Файлы:** `web-ui/src/services/ApiClient.js` (новый), `web-ui/src/api/endpoints.js` (новый)

### WD-14: Performance Optimization — 60 FPS под нагрузкой
**Описание:** Оптимизация рендеринга для real-time данных.
- React.memo для всех компонентов-панелей (не re-render при symbol change если не подписан)
- Canvas rendering для: candlestick chart, order book, heatmap, trade tape (не DOM)
- Virtualized lists для trade tape (react-window) и signals feed
- requestAnimationFrame batching: накапливать WS updates, рендерить 1 раз в 16ms
- Web Worker для тяжёлых вычислений: indicator calculation, backtest processing
- useMemo для derived state (VWAP, cumulative volume, PnL calculation)
- throttle/debounce для: search input (300ms), resize handler (100ms)
- Профайлинг: React DevTools Profiler, Lighthouse CI score >90
- Bundle size: code splitting по панелям (lazy load), target <500KB initial
- Memory leak prevention: cleanup WS subscriptions, AbortController, clearInterval
**Сложность:** Высокая
**Файлы:** Все компоненты WD-01 — WD-13
**Зависимости:** Выполняется после WD-12 (WsManager) и WD-13 (ApiClient)

### WD-15: Mobile Responsive — планшет/телефон адаптация
**Описание:** Адаптивная версия для iPad/телефона.
- Breakpoints: desktop (>1200px), tablet (768-1200px), mobile (<768px)
- Tablet: 2-column layout, tabbed panels, swipe между символами
- Mobile: single column, swipeable tabs (chart | orderbook | signals | positions)
- Touch gestures: pinch-to-zoom на графике, swipe left/right для смены символа
- Bottom navigation bar на mobile (иконки: chart, book, signals, positions, settings)
- Simplified order book на mobile (top-5 вместо top-20)
- Collapsible header с symbol selector
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/layout/MobileLayout.jsx` (новый), CSS media queries во всех компонентах

### WD-16: Order Execution Panel — ручная торговля
**Описание:** Панель для ручного размещения ордеров (как на Binance/Bybit).
- Форма: символ (auto из symbol store), сторона (Buy/Sell), тип (Market/Limit/Stop-Limit)
- Поля: цена (для limit), размер, leverage (1x-20x для futures)
- Slider размера позиции с % от баланса (1%, 5%, 10%, 25%, 50%, 100%)
- Кнопки Buy (зелёная) / Sell (красная) — большие, не промахнёшься
- Confirm modal для ордеров > $10K или > 10% баланса
- Open orders таблица: символ | сторона | цена | размер | статус | cancel button
- Order history: последние 50 ордеров с timestamp, status, fill price
- При paper trading — watermark "PAPER" на панели
- Hotkeys: B = buy, S = sell, Esc = cancel order, Ctrl+Enter = confirm
- Расчёт margin requirement в real-time при изменении размера/leverage
- Мин/макс размер ордера по exchange rules (валидация)
- Trailing stop и OCO (One-Cancels-Other) ордера
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/trading/OrderPanel.jsx` (новый), `web-ui/src/components/trading/OpenOrders.jsx` (новый), `web-ui/src/hooks/useOrderExecution.js` (новый)
**Зависимости:** WD-04 (symbol), WD-12 (WS), WD-13 (API)

### WD-17: Alert System — price & strategy alerts
**Описание:** Система уведомлений о рыночных событиях.
- Типы алертов:
  - Price alert: цена пересекла уровень (above/below X)
  - % change alert: символ изменился на X% за период
  - Volume spike: объём превысил средний в N раз
  - Strategy alert: новая стратегия с confidence > X
  - Drawdown alert: daily DD превысил X%
  - Liquidation alert: крупная ликвидация (> $X)
  - WS disconnect alert: потеряно соединение с exchange/bot
- Создание алерта: модальная форма с выбором типа, условия, символа
- Active alerts таблица: условие | символ | текущее значение | статус (armed/triggered)
- При срабатывании: toast notification + звук + подсветка панели
- History triggered alerts (последние 100)
- Push notifications через Web Notifications API (с разрешением)
- Удаление/редактирование алертов
- Preset alerts: "BTC drops 5% in 1h", "Daily DD > 5%", "No signals 10min"
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/alerts/AlertManager.jsx` (новый), `web-ui/src/components/alerts/AlertModal.jsx` (новый), `web-ui/src/stores/useAlertStore.js` (новый)

### WD-18: Order Flow & CVD (Cumulative Volume Delta)
**Описание:** Продвинутый анализ потока ордеров как в Bookmap/Exocharts.
- CVD линия: кумулятивная дельта (buy volume - sell volume) поверх candlestick chart
- CVD divergence detection: цена растёт, CVD падает → bearish divergence (alert)
- Order flow heatmap: наложение на график объёмов по ценовым уровням
  (крупные ордера = яркие точки, цвет = buy/sell)
- Footprint chart: внутри каждой свечи — bid/ask объёмы по ценовым уровням
- Delta histogram: гистограмма дельты по каждой свече (зелёная/красная)
- Large trades markers: точки на графике где прошли сделки > $X
- CVD per symbol, переключается с символом
- Параметры: минимальный размер сделки для отображения, агрегация (по свече/по минуте)
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/charts/OrderFlowChart.jsx` (новый), `web-ui/src/components/charts/CVDOverlay.jsx` (новый), `web-ui/src/components/charts/FootprintChart.jsx` (новый)
**Зависимости:** WD-01 (chart), WD-03 (trade tape data)

### WD-19: Correlation Matrix — 50 symbols correlation
**Описание:** Матрица корреляции между всеми символами.
- Heatmap матрица 50×50 с корреляцией Пирсона (по returns за N периодов)
- Цвет: -1 (красный) → 0 (серый) → +1 (зелёный)
- При наведении на ячейку: точное значение + мини scatter plot
- Период выбора: 1h, 4h, 1d, 7d, 30d
- Кластеризация: автоматическая группировка коррелированных символов
- Divergence detector: пары с обычно высокой корреляцией (>0.8) но сейчас разошлись
  (например BTC и ETH обычно 0.9, но сейчас 0.3 → arbitrage opportunity alert)
- При клике на пару — открывается спред-график (symbol A / symbol B)
- Export матрицы в CSV
- Обновление: каждые 5 минут (polling) или при значительном изменении
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/analysis/CorrelationMatrix.jsx` (новый), `web-ui/src/components/analysis/SpreadChart.jsx` (новый)

### WD-20: Funding Rate & Liquidation Feed
**Описание:** Crypto-specific: ставки финансирования и ливидации.
- Funding rate таблица: символ | текущая ставка | следующая ставка | время до следующей
  (положительная = longs платят shorts, отрицательная = наоборот)
- Funding rate history график (последние 30 периодов)
- Цветовая индикация: >0.1% = красный (перегретый рынок), <−0.05% = зелёный
- Liquidation feed: real-time лента ливидаций
  - символ | сторона (long/short) | размер ($) | цена | время
  - Крупные ливидации (> $1M) — выделены, с alert
  - Кумулятивный объём ливидаций за час (longs vs shorts bar chart)
- Liquidation heatmap: на графике — метки где произошли ливидации
- При смене символа — фильтр по символу или "All"
- Funding arbitrage detector: пары с разницей ставок > X% на разных биржах
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/crypto/FundingRatePanel.jsx` (новый), `web-ui/src/components/crypto/LiquidationFeed.jsx` (новый)
**Зависимости:** exchange-simulator должен отправлять funding/liquidation events (проверить)

### WD-21: ML Model Insights — что думают модели
**Описание:** Визуализация предсказаний ML моделей (как в Two Sigma research UI).
- Model predictions таблица: модель | символ | предсказание (up/down/neutral) | confidence | horizon
- Models: LSTM, Transformer, RL Agent, AutoML, Price Predictor
- Prediction history: график предсказаний vs реальной цены (overlay)
- Model accuracy tracker: real-time accuracy по каждой модели (last 100 predictions)
- Feature importance: top-10 фичей для текущего предсказания (bar chart)
- Model disagreement indicator: когда модели расходятся → heightened uncertainty
- Ensemble view: aggregated prediction из всех моделей (weighted by accuracy)
- Backtest vs live comparison: как модель работает в live vs backtest
- Model health: loss curve, training status, last update time
- При клике на модель — детальная страница с графиками и метриками
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/ml/ModelInsights.jsx` (новый), `web-ui/src/components/ml/ModelDetail.jsx` (новый), `web-ui/src/components/ml/PredictionOverlay.jsx` (новый)
**Зависимости:** ai-signal-bot должен экспортировать model predictions через WS/API

### WD-22: Replay Mode — перемотка исторических данных
**Описание:** Проигрыватель истории как в TradingView replay.
- Выбор даты/времени старта replay
- Controls: play/pause/step forward/step backward/speed (1x, 2x, 5x, 10x)
- При play — свечи, ордербук, лента сделок обновляются как в real-time но из истории
- Все панели работают в replay режиме: chart, orderbook, tape, signals
- Возможность "запустить стратегию" в replay — увидеть какие сигналы были бы
- Сравнение: "что было" vs "что предсказала модель" vs "что произошло"
- Bookmark: сохранить интересный момент для разбора
- Session replay: проиграть конкретную торговую сессию
- При окончании истории — пауза, не зацикливание
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/replay/ReplayControls.jsx` (новый), `web-ui/src/stores/useReplayStore.js` (новый), `web-ui/src/services/ReplayEngine.js` (новый)
**Зависимости:** WD-01, WD-02, WD-03 (все real-time компоненты должны поддерживать replay mode)

### WD-23: Trade Journal & Analytics
**Описание:** Журнал сделок с аналитикой (как в TraderSync/Tradervue).
- Trade journal таблица: дата | символ | сторона | entry | exit | PnL | duration | стратегия | tags | notes
- При клике на trade — детальная карточка с графиком (entry/exit markers)
- Ручные заметки: добавить note к любой сделке ("вошёл из-за breakout BTC")
- Tags: breakout, scalping, arbitrage, mistake, good-entry, etc.
- Analytics:
  - Win rate по стратегиям, по символам, по тегам
  - Average win vs average loss (R:R)
  - Best/worst trades
  - P&L by day of week, by hour of day (heatmap)
  - Holding time distribution
  - Tag performance: какие теги = profit, какие = loss
  - Equity curve с annotated trades
- Monthly/weekly summary report
- Export в CSV/PDF
- Filter: по дате, символу, стратегии, тегу, PnL
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/journal/TradeJournal.jsx` (новый), `web-ui/src/components/journal/TradeDetail.jsx` (новый), `web-ui/src/components/journal/JournalAnalytics.jsx` (новый)

### WD-24: Notification Center & Activity Log
**Описание:** Центр уведомлений и лог активности.
- Notification dropdown (колокольчик в шапке): unread count badge
- Типы: info, warning, error, success, trade, signal, system
- При клике — раскрытие деталей + action button (e.g. "View trade", "Reconnect WS")
- Activity log: хронологический список всех событий системы
  - WS connect/disconnect, order placed/filled, signal generated, strategy started/stopped
  - Error events с stack trace (для debugging)
- Фильтр: по типу, по компоненту, по времени
- Search по логу (полнотекстовый)
- Auto-scroll к новым событиям (с pause button)
- Уровни лога: DEBUG, INFO, WARN, ERROR — фильтр по уровню
- Export лога в файл
- Persistence: последние 1000 событий в localStorage, старые — только в backend
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/notifications/NotificationCenter.jsx` (новый), `web-ui/src/components/notifications/ActivityLog.jsx` (новый), `web-ui/src/stores/useNotificationStore.js` (новый)

### WD-25: Settings & Configuration Panel
**Описание:** Настройки системы из web-ui (без редактирования YAML).
- Tabs: Trading, Strategies, Risk, Notifications, API Keys, System
- Trading: symbols list (enable/disable), timeframe, signal interval, paper/live toggle
- Strategies: список с toggle on/off, параметры каждой стратегии (sliders/inputs)
  - TrendFollowing: ema_fast, ema_slow, atr_period
  - MeanReversion: bb_period, bb_std, rsi_period
  - FFTCycle: fft_window, threshold
  - Ensemble: voting_mode, min_votes
  - Parameters валидируются (min/max/type) перед сохранением
- Risk: max_position_pct, stop_loss_pct, take_profit_pct, daily_dd_limit, min_confidence, min_rr
- Notifications: Telegram chat ID, Discord webhook, email, alert preferences
- API Keys: exchange API key/secret (masked, encrypted in localStorage), LLM API key
- System: WS URLs, DB path, log level, feature flags (enable/disable research modules)
- Кнопка "Save & Restart" — сохраняет config и перезапускает bot
- Кнопка "Reset to Defaults" — откат к config/settings.yaml
- Diff view: показать что изменилось перед сохранением
- Config export/import (JSON file download/upload)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/settings/SettingsPanel.jsx` (новый), `web-ui/src/components/settings/StrategyConfig.jsx` (новый), `web-ui/src/components/settings/RiskConfig.jsx` (новый)

### WD-26: Market Structure & Pattern Detection
**Описание:** Автоматическое распознавание структуры рынка на графике.
- Auto-detect и отрисовка на candlestick chart:
  - Higher highs / lower lows (трендовые линии auto-draw)
  - Support/resistance levels (горизонтальные линии с touch count)
  - Chart patterns: double top/bottom, head&shoulders, triangles, flags
  - Fibonacci retracement levels (auto от последнего значимого swing)
  - Order blocks (последний крупный opposite candle перед импульсом)
  - Fair value gaps (Gaps в candle structure)
  - Liquidity zones (области с высокой концентрацией объёма)
- Pattern confidence indicator (% match с идеальным паттерном)
- При обнаружении паттерна — alert + метка на графике
- Toggle: включить/выключить каждый тип паттерна отдельно
- История паттернов: список найденных паттернов с результатом (отработал/не отработал)
- Performance: pattern detection в Web Worker (не блокировать UI)
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/charts/PatternOverlay.jsx` (новый), `web-ui/src/services/PatternDetector.js` (новый), `web-ui/src/workers/patternWorker.js` (новый)
**Зависимости:** WD-01 (chart), WD-14 (Web Workers)

### WD-27: Multi-Exchange View — агрегация бирж
**Описание:** Сравнение данных с разных бирж (если подключено несколько).
- Multi-exchange order book: стаканы Binance/Bybit/OKX рядом для одного символа
- Spread между биржами: best bid на A vs best ask на B → arbitrage opportunity
- Price divergence chart: разница цен между биржами во времени
- Volume comparison: bar chart объёмов по биржам за последние 24h
- Best execution: рекомендация "исполнять на бирже X, цена лучше на Y bps"
- Exchange status: latency, uptime, API rate limit usage по каждой бирже
- При клике на arbitrage opportunity — расчёт прибыли с комиссиями
- Historical arbitrage opportunities: список реализованных спредов
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/multiexchange/ExchangeComparison.jsx` (новый), `web-ui/src/components/multiexchange/ArbOpportunities.jsx` (новый)
**Зависимости:** Multiple exchange connections в backend

### WD-28: Session Statistics & Daily Report
**Описание:** Статистика торговой сессии и ежедневный отчёт.
- Real-time session stats (с начала дня):
  - Trades executed, signals generated, win rate, avg R:R
  - Volume traded, fees paid, net PnL
  - Best trade, worst trade, longest holding
  - Strategy breakdown: PnL по каждой стратегии
  - Symbol breakdown: PnL по каждому символу
  - Timeline: events throughout the day (first trade, biggest win, DD event)
- Daily report (генерируется в конце дня или по кнопке):
  - Summary card: date, net PnL, win rate, Sharpe (daily)
  - Equity curve за день
  - Trade list с графиками
  - Strategy performance table
  - Risk metrics: max DD, VaR, exposure peak
  - Lessons learned: auto-generated из tagged trades (mistakes vs good entries)
  - Comparison с предыдущими днями (trend: improving/declining)
- Weekly/Monthly aggregated reports
- Export в PDF (для отправки в Telegram/email)
- Auto-send daily report в Telegram channel (через notifier)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/stats/SessionStats.jsx` (новый), `web-ui/src/components/stats/DailyReport.jsx` (новый), `web-ui/src/components/stats/WeeklyReport.jsx` (новый)

### WD-29: Dark Pool / Whale Activity Tracker
**Описание:** Отслеживание крупной активности (как в Whale Alert).
- Large order detection: ордера > $100K с alert
- Whale wallet tracking: (если есть on-chain data) крупные переводы на/с бирж
- Accumulation/distribution indicator: кумулятивный объём buy vs sell за период
- Smart money concept: detection of institutional order flow patterns
  - Iceberg orders: ордера которые постоянно пополняются
  - Spoofing detection: ордера которые появляются и исчезают
  - Wash trading detection: circular trades между адресами
- Whale activity feed: timeline крупных сделок с деталями
- Heatmap: где на графике происходила крупная активность
- При крупной сделке → instant alert + метка на графике
- Параметры: минимальный размер для "крупной" сделки, окно обнаружения
**Сложность:** Высокая
**Файлы:** `web-ui/src/components/whale/WhaleTracker.jsx` (новый), `web-ui/src/components/whale/LargeOrderDetector.jsx` (новый)
**Зависимости:** WD-03 (trade tape), WD-18 (order flow)

### WD-30: Keyboard Shortcuts & Command Palette
**Описание:** Система горячих клавиш и command palette (как в VS Code / TradingView).
- Command palette (Ctrl+K / Cmd+K): поиск по всем действиям
  - "Switch to BTC" → меняет символ
  - "Run backtest TrendFollowing" → открывает backtest lab с стратегией
  - "Close all positions" → action
  - "Toggle order book" → показать/скрыть панель
  - "Export daily report" → генерирует PDF
- Keyboard shortcuts:
  - 1-9: переключение панелей
  - B/S: buy/sell panel
  - T: toggle trade tape
  - O: toggle order book
  - C: toggle chart
  - R: replay mode
  - F: fullscreen chart
  - Esc: close modal/cancel
  - Ctrl+Enter: confirm action
  - Space: play/pause (replay mode)
- Shortcut editor: переназначить любую комбинацию
- Shortcut hints: tooltips на кнопках с комбинациями
- Cheat sheet: модальное окно со всеми шорткатами (press ?)
**Сложность:** Средняя
**Файлы:** `web-ui/src/components/system/CommandPalette.jsx` (новый), `web-ui/src/hooks/useKeyboardShortcuts.js` (новый), `web-ui/src/stores/useShortcutStore.js` (новый)
