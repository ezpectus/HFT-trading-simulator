# OFFICE BOARD — РЕФАКТОРИНГ И УПРОЩЕНИЕ

> Фаза 1 (Портирование моделей): ЗАВЕРШЕНО (52 модели, Sprint 1-105)
> Фаза 2 (Рефакторинг): АКТИВНА (22 авг – 1 сен 2026)
> План: docs/REFACTORING_PLAN_10DAYS.md
> Следующая фаза: RELIABILITY — .cascade/RELIABILITY_PLAN.md (11 задач, после рефакторинга)

---

## ТЕКУЩИЙ ДЕНЬ — Day 2 (Aug 23): compute_returns дедупликация

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
| SIGTERM handler | `docker stop` → kill -9 через 10s, состояние не сохранено | Task 8 |
| Sharding/Partitioning | SQLite equity_curve растёт бесконечно | CODE_AUDIT §4.2 |
| Backpressure | SignalPublisher шлёт всем без ограничений | CODE_AUDIT §4.3 |
| Idempotency ордеров | Retry = двойной ордер = потеря денег | CODE_AUDIT §4.4 |
| Retry/backoff для ордеров | Сеть моргнула → ордер потерян | Task 9 |
| Schema validation WS | Любой JSON принимается | CODE_AUDIT §4.9 |
| Health endpoints (exchange) | Prometheus не скрейпит | Task 1 |
| Metric name mismatch | Алерты никогда не сработают | Task 11 |
| Indicator caching | 200k операций каждые 60s вместо 1k | CODE_AUDIT §4.1 |
| Race condition `_clients` | RuntimeError при concurrent broadcast + connect | CODE_AUDIT §8.1 |
| DB busy_timeout | `database is locked` при concurrent writes | CODE_AUDIT §8.6 |
| DB connection pooling | Каждый метод открывает/закрывает conn | CODE_AUDIT §8.7 |
| Socket buffer tuning | OS defaults 64-128KB, bursts → drops | CODE_AUDIT §8.5 |
| Helm probes отсутствуют | K8s pod не рестартует при hang | CODE_AUDIT §8.14 |
| Docker healthchecks TCP | TCP проверяет порт, не готовность | CODE_AUDIT §8.9 |
| aiohttp session per alert | Каждая отправка алерта = новая сессия | CODE_AUDIT §8.8 |
| Top-level ErrorBoundary | Падение корневого компонента = белый экран | CODE_AUDIT §8.10 |
| Missing DB indexes | `get_stats` full-scan, equity_curve без индекса | CODE_AUDIT §8.16 |
| C++ `catch(...)` kill switch | Safety-critical silent failure | CODE_AUDIT §8.17 |
| No PropTypes/TypeScript | Нет runtime prop validation в web-ui | CODE_AUDIT §8.19 |
| No log rotation | Log files grow unbounded → disk full | CODE_AUDIT §8.22 |
| Float precision | IEEE 754 errors accumulate in P&L | CODE_AUDIT §8.23 |
| No WS message validation | Raw JSON accepted, no schema | CODE_AUDIT §8.24 |
| No DB retention/cleanup | Tables grow forever, ~2.6M rows/year | CODE_AUDIT §8.25 |
| No auth on health/metrics | Endpoints open if ports exposed | CODE_AUDIT §8.27 |
| Rust unwrap/expect panic | Process crash on runtime failure | CODE_AUDIT §8.29 |
| Rust no idempotency | Reconnect = exchange can't deduplicate orders | CODE_AUDIT §8.30 |
| Rust string matching for fills | Fragile, false positives | CODE_AUDIT §8.32 |
| No network timeout in config | Timeouts hardcoded, need redeploy to change | CODE_AUDIT §8.36 |
| No config schema validation | Wrong type in YAML → runtime TypeError | CODE_AUDIT §8.42 |
| No HFT alert rules | HFT errors, DB locks, CB changes not alerted | CODE_AUDIT §8.38 |
| CI: npm audit non-blocking | High-severity vulns don't fail CI | CODE_AUDIT §8.40 |
| Dockerfile healthcheck TCP | TCP not HTTP, same as compose | CODE_AUDIT §8.44 |
| Dead code: tracing.py | 111 lines, never imported | CODE_AUDIT §8.46 |
| Test coverage gaps | signal_publisher, db, alerting, llm — 0 tests | CODE_AUDIT §8.47 |
| **No graceful shutdown** | **Ctrl+C = kill, no DB close, no WS notify, orders lost** | **CODE_AUDIT §8.48** |
| No WS keepalive | Silent disconnects undetected | CODE_AUDIT §8.49 |
| No backoff with jitter | Thundering herd on mass reconnect | CODE_AUDIT §8.50 |
| 3x CircuitBreaker duplication | 3 different implementations, 1 unused | CODE_AUDIT §8.51 |
| RateLimiter dead code | Implemented, tested, never used in prod | CODE_AUDIT §8.52 |
| No asyncio task management | Background tasks fire-and-forget, crashes unnoticed | CODE_AUDIT §8.54 |
| Health check no depth | "Healthy" while DB locked or exchange disconnected | CODE_AUDIT §8.55 |
| No retry on transient failures | Exchange 429, DB locked → no retry, just fail | CODE_AUDIT §8.57 |
| Code reduction ~510 lines | 3× CircuitBreaker, dead tracing/RateLimiter, compute_returns dup | CODE_AUDIT §8.60 |
| SHM no cleanup on crash | SIGKILL = SHM not unlinked, restart fails | CODE_AUDIT §8.62 |
| Dual metrics systems | Custom text + prometheus_client, overlapping names | CODE_AUDIT §8.64 |
| No asyncio.Lock on _clients | Set mutated during iteration → RuntimeError | CODE_AUDIT §8.65 |
| Helm: no PDB | Node drain evicts all pods → downtime | CODE_AUDIT §8.66 |
| Helm: no NetworkPolicy | All pods reach all pods, DB exposed | CODE_AUDIT §8.67 |
| Helm: hardcoded PG password | Default "change-me-in-production" if not overridden | CODE_AUDIT §8.69 |
| Docker Compose: no resource limits | Memory leak = host crash | CODE_AUDIT §8.70 |
| WS input: no schema validation | Malicious client can crash bot | CODE_AUDIT §8.71 |
| DB migrations: no runner | 4 SQL files, no code to apply them | CODE_AUDIT §8.72 |
| Alertmanager: placeholder credentials | SMTP password, Slack/Discord webhooks = placeholders | CODE_AUDIT §8.73 |
| shared_config: hardcoded localhost | Won't work in Docker/K8s | CODE_AUDIT §8.74 |
| Alertmanager: no silence during deploy | All alerts fire on restart | CODE_AUDIT §8.78 |
| Makefile: no C++ tests | `make test` skips 30+ C++ CTest targets | CODE_AUDIT §8.84 |
| Rust panic=abort + unwrap | SystemTime error = immediate C++ host abort | CODE_AUDIT §8.85 |
| deploy.sh: no health check exit | Reports success even if all services down | CODE_AUDIT §8.89 |
| deploy.sh: rm -rf before cp | Rollback loses data if cp fails | CODE_AUDIT §8.90 |
| deploy.sh: no backup retention | 100 deploys = 100 backup copies, no cleanup | CODE_AUDIT §8.92 |
| ESLint: PropTypes + unused-vars off | No prop type checking, dead vars accumulate | CODE_AUDIT §8.93 |
| Vite: no CSP headers | XSS easier if served directly | CODE_AUDIT §8.94 |
| hft-trade-bot config: hardcoded localhost | ws://localhost won't work in Docker/K8s | CODE_AUDIT §8.96 |
| ErrorBoundary: no top-level | App crash = white screen, no recovery | CODE_AUDIT §8.98 |
| Code reduction ~710 lines | 510 ai-signal-bot + 200 exchange_simulator | CODE_AUDIT §8.100 |
| SECURITY.md: inaccurate WS claim | Says "validated" but no schema validation exists | CODE_AUDIT §8.107 |
| Code reduction ~800 lines total | CircuitBreaker×3 + tracing + RateLimiter + compute_returns + exchange_sim | CODE_AUDIT §8.109 |
| dpdk_transport.py: source missing | Only .pyc exists, can't lint or modify | CODE_AUDIT §8.115 |
| Health checks v2: not wired | HealthChecker exists but not used in run.py | CODE_AUDIT §8.116 |
| C++ order_executor: detached thread | Destroy while reconnect sleeping = use-after-free | CODE_AUDIT §8.117 |
| C++ order_executor: snprintf truncation | Long strings = malformed JSON sent silently | CODE_AUDIT §8.118 |
| .env.prod: placeholder passwords | `change_me_to_a_secure_password` with no validation | CODE_AUDIT §8.123 |
| .env.prod: localhost WS URLs | Docker build without override = broken WS | CODE_AUDIT §8.124 |
| C++ health_server: accept() blocks | stop() can't join thread until next connection | CODE_AUDIT §8.126 |
| Makefile.prod: migration not idempotent | Running twice = "table already exists" error | CODE_AUDIT §8.132 |
| docker-compose dev: Grafana admin/admin | Default creds, risky if port exposed | CODE_AUDIT §8.138 |
| deploy.yml: health check no exit | Pipeline succeeds even if all services down | CODE_AUDIT §8.144 |
| C++ bot_context: God struct | 25+ members, all coupled, hard to test | CODE_AUDIT §8.147 |
| C++ SPSCQueue + mutex | SPSC is single-producer but mutex suggests multi-thread race | CODE_AUDIT §8.148 |
| prod VITE_WS localhost fallback | Forgetting to set in .env.prod = broken WS | CODE_AUDIT §8.152 |
| C++ risk_manager: check_order mutex | Serializes all order submissions, use shared_mutex | CODE_AUDIT §8.155 |
| C++ daily_pnl += not atomic | atomic<double> += is load+store race, use fetch_add | CODE_AUDIT §8.156 |
| C++ pre_trade_risk: blacklist race | insert/erase while check() reads = data race UB | CODE_AUDIT §8.158 |
| C++ duplicate risk system | RiskManager + PreTradeRisk do same 8 checks | CODE_AUDIT §8.166 |
| C++ reset_daily incomplete | peak_equity_ not reset → wrong drawdown next day | CODE_AUDIT §8.167 |
| Terraform: hardcoded RDS password | default = "ChangeMeInProduction123!" | CODE_AUDIT §8.162 |
| C++ 3 signal engines (v1/v2/v3) | V2 may be dead code, ~200 lines reducible | CODE_AUDIT §8.176 |
| migrate.py: narrow exception | Doesn't catch asyncpg.PostgresError | CODE_AUDIT §8.174 |
| SHM stale data on restart | Magic passes but head/tail inconsistent after crash | CODE_AUDIT §8.177 |
| C++ string_to_side no validation | Any non-"BUY" string silently → SELL | CODE_AUDIT §8.186 |
| web-ui: 50+ components, many unused | Math viz panels may be dead code, ~1000+ lines reducible | CODE_AUDIT §8.188 |
| Helm values.yaml: hardcoded passwords | postgres "change-me-in-production", grafana "" → admin/admin | CODE_AUDIT §8.193 |
| Helm values.yaml: VITE_WS localhost | K8s browser can't reach localhost:8765/8766 | CODE_AUDIT §8.195 |
| C++ signal.h: NEUTRAL→BUY | side() silently returns BUY for NEUTRAL, no enforcement | CODE_AUDIT §8.192 |
| C++ 3 exchange adapters: code duplication | 470 lines, ~200 duplicated. Move to ExchangeBase | CODE_AUDIT §8.207 |
| C++ BinanceAdapter: nested Spinlock | price_lock_ → depth_lock_ nesting, fragile lock ordering | CODE_AUDIT §8.203 |
| C++ BinanceAdapter: can_send_order TOCTOU | fetch_add always increments even on reject | CODE_AUDIT §8.204 |
| web-ui App.jsx: 565 lines God component | 6 useEffects, 14 tabs, extract to hooks/components | CODE_AUDIT §8.211 |
| shared_config.yaml: localhost | WS host localhost in shared config, won't work in prod | CODE_AUDIT §8.212 |
| Alertmanager: hardcoded SMTP password | smtp_auth_password 'your-password' in git. Webhooks too | CODE_AUDIT §8.215 |
| web-ui: 50 symbols duplicated | 50 symbols in JS + shared_config.yaml, out of sync risk | CODE_AUDIT §8.219 |
| web-ui: getFilteredSymbols not memoized | Re-filters on every call, unnecessary re-renders | CODE_AUDIT §8.224 |
| monitoring: no HFT-specific alerts | No order latency, SHM overflow, fill rate, slippage, drawdown alerts | CODE_AUDIT §8.226 |
| ebpf_monitor: NETWORK_BPF dead code | Defined but never loaded. Remove or activate | CODE_AUDIT §8.228 |
| ebpf_monitor: no Prometheus export | JSON to stdout only, not in Grafana dashboards | CODE_AUDIT §8.229 |
| performanceMonitor: alertCallbacks leak | No offAlert(), callbacks fire after unmount | CODE_AUDIT §8.234 |
| web-ui backtestEngine: EMA/RSI duplicated | Identical to indicators.js. Import instead, ~40 lines reduction | CODE_AUDIT §8.236 |
| web-ui backtestEngine: no borrow fee | Short selling overestimates P&L, no daily borrow fee | CODE_AUDIT §8.237 |
| web-ui backtestEngine: no slippage | Entry/exit at candle.close, no slippage model | CODE_AUDIT §8.238 |
| web-ui indicators: O(n²) SMA | O(n×period) instead of O(n) rolling sum | CODE_AUDIT §8.240 |
| web-ui mockData: only 5 of 50 symbols | Mock mode doesn't represent full trading universe | CODE_AUDIT §8.243 |
| hft-trade-bot config: 50 symbols 3x | 50 symbols in config.yaml + shared_config + useUIStore. 3 copies | CODE_AUDIT §8.247 |
| hft-trade-bot config: localhost WS | ws://localhost:8765 and :8766, won't work in prod | CODE_AUDIT §8.248 |
| web-ui registry: 200+ math panels | Research-grade math (SchrodingerBridge, FokkerPlanck). Feature flag | CODE_AUDIT §8.252 |
| web-ui vite.config: no esbuild.drop | console.log not stripped in prod build | CODE_AUDIT §8.246 |
| web-ui e2e: no WS tests | No WebSocket, real-time, order flow e2e tests | CODE_AUDIT §8.254 |
| ai-signal-bot db.py: new connection per op | Every method opens/closes connection. PRAGMA WAL on every conn. No retry on locked | CODE_AUDIT §8.261 |
| ai-signal-bot db.py: no equity_curve index | No index on timestamp. Range queries will full-scan | CODE_AUDIT §8.263 |
| ai-signal-bot db.py: no migration system | _init_db() uses CREATE TABLE IF NOT EXISTS. No ALTER TABLE for schema changes | CODE_AUDIT §8.264 |
| web-ui useExchangeData: candle sort every update | Full Array.from + sort on every candle message. 500 elements × every second | CODE_AUDIT §8.256 |
| web-ui useDetachablePanels: no channel cleanup | BroadcastChannel never closed. Resource leak on unmount | CODE_AUDIT §8.259 |
| web-ui useWebSocket: no max reconnect | Backoff capped at 30s but reconnects indefinitely | CODE_AUDIT §8.266 |
| liquidation_engine_v2: ADL is a stub | ADL logs and resets fund, doesn't reduce counterparty positions | CODE_AUDIT §8.270 |
| liquidation_engine_v2: no thread safety | No locks on insurance_fund, events, _cascade_depth | CODE_AUDIT §8.273 |
| exchange_simulator arbitrage: unbounded _closed_history | Plain list, no cap. Use deque(maxlen=1000) | CODE_AUDIT §8.275 |
| exchange_simulator order_book_realism: recent_fills unbounded | Plain list, no cap. Use deque(maxlen=1000) | CODE_AUDIT §8.282 |
| exchange_simulator: all modules seed=42 | 5 modules hardcode seed=42. Simulation is deterministic | CODE_AUDIT §8.286 |
| ai-signal-bot health_checks: no liveness depth | Liveness always returns "alive". Deadlocked loop reports alive | CODE_AUDIT §8.288 |
| ai-signal-bot notifier: token in URL | Bot token embedded in URL. If URL logged, token exposed in logs | CODE_AUDIT §8.295 |
| ai-signal-bot llm_engine: no LLM response validation | No schema validation on LLM output. Malformed JSON → incorrect analysis | CODE_AUDIT §8.300 |
| ai-signal-bot tracing: localhost endpoint | Default Jaeger endpoint localhost:4317. Won't work in K8s | CODE_AUDIT §8.293 |
| ai-signal-bot research: 35-module mega-import | 35 modules eagerly loaded, 200+ exports. Use lazy imports | CODE_AUDIT §8.305 |
| ai-signal-bot research: 22× duplicated compute_returns | 22 identical 3-line copies. 66 lines wasted | CODE_AUDIT §8.306 |
| ai-signal-bot research: 35 modules code reduction | 35 research-grade math modules, ~5000+ lines. Feature-flag | CODE_AUDIT §8.307 |
| exchange_simulator: triple metrics systems | 3 separate Prometheus metrics generators. Consolidate | CODE_AUDIT §8.316 |
| exchange_simulator tracing: time.sleep in trace | 1ms latency added to every traced order. Tracing should be passive | CODE_AUDIT §8.313 |
| ai-signal-bot ws_client: no reconnect | On ConnectionClosed, just logs. No reconnect. Bot stops receiving data | CODE_AUDIT §8.323 |
| ai-signal-bot: 3× CircuitBreaker duplication | 3 separate CircuitBreaker implementations. Consolidate into 1 | CODE_AUDIT §8.321 |
| ai-signal-bot: dual health check systems | observability/HealthChecker + communication/HealthAggregator. Consolidate | CODE_AUDIT §8.335 |
| ai-signal-bot: dual metrics systems | communication/metrics_server.py + monitoring/. Consolidate | CODE_AUDIT §8.336 |
| ai-signal-bot: 4× health check implementations | 4 separate health check systems across project. Consolidate | CODE_AUDIT §8.355 |
| ai-signal-bot: 5× PortfolioOptimizer duplication | 5 files implementing same portfolio optimization. ~600 lines wasted | CODE_AUDIT §8.339 |
| ai-signal-bot: 60-file TA+research overlap | 25 technical_analysis + 35 research = 60 files with overlapping math. ~10000 lines | CODE_AUDIT §8.358 |
| ai-signal-bot alerting: aiohttp session leak | _send_discord/_send_telegram likely create session per call. Use shared session | CODE_AUDIT §8.353 |
| ai-signal-bot: dual metrics (monitoring + communication) | monitoring/metrics.py + communication/metrics_server.py. Consolidate | CODE_AUDIT §8.359 |
| ai-signal-bot: 250+ symbol entries across 4+ configs | 50 symbols × 4+ files. shared_config.yaml not referenced. Single source of truth | CODE_AUDIT §8.370 |
| ai-signal-bot: localhost in all configs | All WS URLs default localhost. Won't work in K8s/Docker. Use env vars | CODE_AUDIT §8.371 |
| ai-signal-bot: no SIGINT/SIGTERM handler | K8s SIGTERM = ungraceful shutdown. DB/WS/SHM not cleaned up | CODE_AUDIT §8.381 |
| ai-signal-bot: no database migrations | CREATE TABLE IF NOT EXISTS only. No migration system. Use Alembic | CODE_AUDIT §8.382 |
| hft-trade-bot: synthetic order book | Fake 10-level book with 1bp spacing, 1.0 qty. No warning. Unrealistic | CODE_AUDIT §8.380 |
| ai-signal-bot db: new connection per operation | Every save creates new conn + PRAGMA WAL. Use persistent conn or aiosqlite | CODE_AUDIT §8.363 |
| Makefile.prod: no migration tracking | Runs all SQL migrations every time. No schema_migrations table | CODE_AUDIT §8.374 |
| docker-compose: no resource limits | No mem_limit/cpus in dev compose. Prod risky if used directly | CODE_AUDIT §8.385 |
| helm: hardcoded localhost for web-ui WS | localhost in browser won't connect to K8s services. Use ingress URL | CODE_AUDIT §8.387 |
| helm: Postgres password in plaintext | `change-me-in-production` in values.yaml. Default to empty, require secret | CODE_AUDIT §8.388 |
| ci.yml: no security scanning | No pip-audit/npm audit/trivy. CodeQL exists but no SCA | CODE_AUDIT §8.390 |
| ci.yml: no integration tests | Unit tests only. No docker-compose integration test in CI | CODE_AUDIT §8.391 |
| terraform: db_password default in plaintext | `ChangeMeInProduction123!` as default. Remove default, require var or Secrets Manager | CODE_AUDIT §8.401 |
| terraform: no prod environment | Only dev/ exists. No prod/ with production-grade settings | CODE_AUDIT §8.402 |
| docker-compose.prod: ports exposed to host | Postgres/Redis/Prometheus ports exposed. Security risk. Remove internal port mappings | CODE_AUDIT §8.416 |
| web-ui: 200+ components over-engineering | Math/research panels unlikely used by traders. Feature flag or separate package | CODE_AUDIT §8.410 |
| hft-trade-bot: 3 engine versions loaded | V1/V2/V3 all allocated. V1 never used in hot path. Remove V1 | CODE_AUDIT §8.419 |
| hft-trade-bot: prices_cache not thread-safe | unordered_map without lock. Data race if multi-threaded. Use shared_mutex | CODE_AUDIT §8.420 |
| deploy.yml: localhost fallback for VITE_WS | Defaults to localhost if GitHub vars not set. Build should fail instead | CODE_AUDIT §8.412 |
| hft-executor: avg_latency_ns always 0 | Stats field never populated. No latency measurement implemented | CODE_AUDIT §8.394 |
| deploy/k8s: only secrets, no manifests | Only secrets.enc.yaml. No Deployment/Service/ConfigMap. Use Helm or add manifests | CODE_AUDIT §8.404 |
| hft-trade-bot: no Dockerfile.prod | Deploy workflow uses Dockerfile.prod but only Dockerfile exists. Deploy will fail | CODE_AUDIT §8.423 |
| migrate.py: no transaction wrapping | Migration SQL not in transaction. Partial state on failure. Use conn.transaction() | CODE_AUDIT §8.436 |
| config.h: hardcoded localhost default | ws_url defaults to localhost:8765. Won't work in Docker/K8s. Default to empty | CODE_AUDIT §8.445 |
| order_executor: detached reconnect thread | Detached thread accesses this after destruction. Use jthread or join in dtor | CODE_AUDIT §8.452 |
| BinanceAdapter: nested spinlock acquisition | Two spinlocks sequential. Latent deadlock risk. Use single lock or document ordering | CODE_AUDIT §8.462 |
| Helm values: no Redis password | No auth section for Redis. Add existingSecret and --requirepass | CODE_AUDIT §8.467 |
| metrics_collector: mutex on every metric op | Global mutex blocks all metric operations in HFT hot path. Use atomics | CODE_AUDIT §8.483 |
| circuit_breaker: not thread-safe | No lock on _state/_consecutive_failures. Race in async context. Use asyncio.Lock | CODE_AUDIT §8.499 |
| health_check: new ClientSession per call | Creates aiohttp session per health check. Use shared session for pooling | CODE_AUDIT §8.501 |
| db.py: new connection per operation | Both exchange_simulator and ai-signal-bot db.py create new conn + PRAGMA WAL per op. Use persistent conn, set WAL once | CODE_AUDIT §8.525, §8.628 |
| main.cpp: no SIGTERM handler — FALSE ALARM | SIGTERM handler EXISTS in bot_setup.cpp:63. R518 downgraded to Info | CODE_AUDIT §8.583 |
| options_pricing: duplicate of options_simulator | Two modules implement Black-Scholes. Consolidate into one | CODE_AUDIT §8.548 |
| kill_switch: file monitoring thread not joined | stop_monitoring may not join thread. Use-after-free risk. Use jthread | CODE_AUDIT §8.557 |
| validator: not thread-safe | _daily_pnl/_open_positions no lock. Race in async context. Use asyncio.Lock | CODE_AUDIT §8.571 |
| risk_manager: not thread-safe | Same position concurrent update races on peak/trough/SL. Use asyncio.Lock per position | CODE_AUDIT §8.596 |
| helpers: CircuitBreaker not thread-safe | No lock on _failure_count/_state. Race in async. Use asyncio.Lock | CODE_AUDIT §8.649 |
| tracing: OTLP exporter insecure=True | Disables TLS for trace export. Traces unencrypted in prod. Use insecure=False with certs | CODE_AUDIT §8.653 |
| real_market_data: no reconnection state sync | No gap fill after reconnect. Trades on stale prices. Fetch historical candles | CODE_AUDIT §8.664 |
| ws_client: no TLS support | No ssl param. ws:// sends order data unencrypted. Add ssl for wss:// | CODE_AUDIT §8.676 |
| notifier: Telegram token in URL | Bot token in URL path. Exposed in proxy/debug logs. Redact URLs or use header auth | CODE_AUDIT §8.668 |
| notifier: no auth for remote commands | Only chat_id check. chat_id not secret. Add command password/PIN | CODE_AUDIT §8.670 |
| socket_transport: blocking receive loop | Sync while + time.sleep blocks event loop. Use asyncio add_reader | CODE_AUDIT §8.675 |
| config: API keys in plaintext struct | api_key/api_secret as std::string. Not zeroed on destruction. Use SecureString | CODE_AUDIT §8.681 |
| shm_ring_buffer C++: shm_open 0666 permissions | World read/write on /dev/shm. Any process can read/write trading data. Use 0600 | CODE_AUDIT §8.690 |
| run.py: no SIGTERM handler | Only KeyboardInterrupt caught. K8s SIGTERM kills without cleanup. Add signal handler | CODE_AUDIT §8.693 |
| signal_publisher: no client authentication | No auth on WS connections. Anyone gets trading signals. Add shared secret | CODE_AUDIT §8.697 |
| signal_publisher: no TLS on WS server | No ssl param. ws:// signals sniffed. Add ssl for wss:// | CODE_AUDIT §8.698 |
| fix_client: seq num file non-atomic save | open('w') truncates on crash. Seq reset = FIX session rejection. Use temp+rename | CODE_AUDIT §8.701 |
| fix_client: no TLS on TCP connection | asyncio.open_connection no ssl. FIX msgs plaintext. Add ssl param | CODE_AUDIT §8.702 |
| shm_market_data_writer: no memory barrier on seq write | struct.pack_into no barrier. ARM reordering = C++ reads stale data. Use ctypes barrier | CODE_AUDIT §8.713 |
| health_checks: no timeout on component checks | No timeout on readiness probe. DB hang blocks event loop. Use asyncio.wait_for | CODE_AUDIT §8.735 |
| tracing: OTLP exporter insecure=True | Disables TLS for trace export. Traces unencrypted in prod. Use insecure=False with certs | CODE_AUDIT §8.741 |
| exchange_factory: API key/secret in plaintext | Plaintext strings in memory. Crash dump exposes credentials. Use env vars or secrets manager | CODE_AUDIT §8.756 |
| db.py: new connection per operation | ~50 conn/min, each 5-10ms. Use connection pool or persistent connection | CODE_AUDIT §8.759 |
| main.cpp: no SIGINT/SIGTERM handler visible | No signal handler in main. SIGTERM kills without graceful_shutdown. Verify init installs handler | CODE_AUDIT §8.763 |
| main.cpp: no exception handling in main loop | No try/catch. Exception = crash without graceful shutdown. Open positions and SHM left dirty | CODE_AUDIT §8.764 |
| config.h: API keys in plaintext std::string | std::string not zeroed on destruction. Core dump exposes keys. Use SecureString | CODE_AUDIT §8.766 |
| order_executor: detached reconnect thread race | Detached thread accesses destroyed client_ after disconnect(). Use condition variable or join | CODE_AUDIT §8.774 |
| BinanceAdapter: API keys in plaintext std::string | Not zeroed on destruction. Core dump exposes credentials. Use SecureString | CODE_AUDIT §8.778 |
| automl: no validation set in optimize() | No validation enforcement. Overfit params deployed to prod. Add validation_data param | CODE_AUDIT §8.785 |
| model_registry: _save() not atomic | open('w') truncates on crash. Registry corrupted, production model lost. Use temp+rename | CODE_AUDIT §8.788 |
| llm_engine: API key in config dataclass plaintext | Exposed in repr/logging. Use field(repr=False) or SecretStr | CODE_AUDIT §8.791 |
| llm_engine: no rate limiting on API calls | 50 symbols = 50 API calls/cycle. OpenAI 429 errors. Add token bucket rate limiter | CODE_AUDIT §8.792 |
| signal_engine_v2: heap alloc in get_cache() | emplace in analyze_incremental breaks no-heap-alloc contract. Pre-populate cache at init | CODE_AUDIT §8.796 |
| signal_engine_v2: cooldown not per-symbol | Single cooldown blocks all 50 symbols. Only 1 signal per period. Move to per-symbol cache | CODE_AUDIT §8.798 |
| signal_engine_v3: heap alloc in get_or_create_hmm_state() | emplace in analyze_incremental breaks no-heap-alloc contract. noexcept incorrect. Pre-populate at init | CODE_AUDIT §8.808 |
| mean_reversion_v2: no per-symbol state | Single Kalman+residuals for all symbols. BTC contaminates ETH. Add per-symbol state | CODE_AUDIT §8.812 |
| socket_transport: start_receive_loop blocks thread | Blocking while loop blocks asyncio event loop. Use add_reader or separate thread | CODE_AUDIT §8.815 |
| notifier: bot token in plaintext | Token in URL, exposed in logs. Use field(repr=False) or env vars | CODE_AUDIT §8.818 |
| notifier: no rate limiting on alerts | 50 fills = 50 API calls. Telegram 429. Add queue + rate limiter | CODE_AUDIT §8.819 |
| shm_protocol: SymbolId limited to 10 symbols | Config has 50 symbols but enum only 10. Symbols 10-49 use raw ints, bypassing type safety | CODE_AUDIT §8.838 |
| health_checks: check_readiness runs sequentially | 4 checks sequential. DB down = 30s wait blocks Redis/Exchange checks. K8s probe times out. Use asyncio.gather | CODE_AUDIT §8.852 |
| health_checks: no timeout on individual checks | DB/Redis hang indefinitely on network partition. Use asyncio.wait_for with 2s timeout | CODE_AUDIT §8.853 |
| momentum_breakout_v2: no per-symbol state | EMA/ATR/ADX/volume shared across symbols. BTC contaminates ETH. Add per-symbol state | CODE_AUDIT §8.871 |
| signal_engine_v3: get_or_create_hmm_state heap alloc in noexcept | emplace can throw bad_alloc → std::terminate → abort. Pre-populate hmm_states_ at init | CODE_AUDIT §8.887 |
| market_making_v2: no per-symbol state | Volatility/sigma shared across symbols. BTC vol contaminates ETH quotes. One instance per symbol | CODE_AUDIT §8.892 |
| fix_client: password in plaintext debug log | msg.fields includes tag 554 (password) at DEBUG level. Redact sensitive tags before logging | CODE_AUDIT §8.898 |
| mean_reversion_v2: no per-symbol state | Kalman+OU+residuals shared across symbols. BTC contaminates ETH. One instance per symbol | CODE_AUDIT §8.915 |
| signal_publisher: backtest runs in event loop | bt.run() blocks all WS connections for seconds. Use asyncio.to_thread | CODE_AUDIT §8.920 |
| alerting: new aiohttp.ClientSession per alert per channel | 3 sessions/alert, 30/min. FD exhaustion. Shared session in init | CODE_AUDIT §8.943 |
| order_executor: detached reconnect thread race | Dangling `this` after destroy. Detached thread sleeps then accesses dead object. Don't detach or use asio timer | CODE_AUDIT §8.987 |
| ws_connection_pool: acquire holds lock during _create_connection | Network I/O (100-500ms) under asyncio.Lock blocks all 150 acquire/release coroutines. Release lock before connect | CODE_AUDIT §8.993 |
| db: new SQLite connection per operation | 2.5 conn/sec × 5ms = 12.5ms/sec overhead. Scales to 62ms/sec at 500 symbols. Persistent connection or aiosqlite | CODE_AUDIT §8.1000 |
| order_manager: no lock on state transitions | check_timeouts() and on_fill() race on same OrderRecord. EXPIRED + FILLED simultaneously. Spinlock or atomic state | CODE_AUDIT §8.1012 |
| ws_client: listen has no reconnect loop | Exits on ConnectionClosed without calling reconnect(). Bot stops receiving market data silently. Wrap in reconnect loop | CODE_AUDIT §8.1020 |
| health_checks: check_readiness runs sequentially | 4 checks sequential. DB down = 30s wait blocks Redis/Exchange. K8s probe times out. Use asyncio.gather | CODE_AUDIT §8.1027 |
| health_checks: no timeout on individual checks | DB/Redis/Exchange hang indefinitely on network partition. Use asyncio.wait_for with 2s timeout | CODE_AUDIT §8.1028 |
| notifier: token in URL | Telegram bot token embedded in URL visible in debug logs/proxies. Disable HTTP debug logging | CODE_AUDIT §8.1043 |
| BinanceAdapter: on_book_ticker takes two spinlocks | Price/depth consistency gap — reader sees new price with stale depth. Single spinlock or atomic doubles | CODE_AUDIT §8.1064 |
| engine.py: API key in memory as plain string | LLMConfig dataclass repr exposes API key in logs. Use SecretStr wrapper | CODE_AUDIT §8.1059 |
| BinanceAdapter: api_secret in Config struct | Plain std::string secret in heap memory. Use secure string wrapper, don't log Config | CODE_AUDIT §8.1066 |
| OKXAdapter: passphrase stored as plain string | OKX passphrase in plain std::string. Use secure string wrapper | CODE_AUDIT §8.1071 |
| BybitAdapter: api_secret in Config struct | Same as Binance/OKX — plain string secret. Use secure string wrapper | CODE_AUDIT §8.1074 |
| metrics_collector: mutex on every metric operation | Single std::mutex blocks all hot-path metric ops during Prometheus export. Use atomics or per-histogram locks | CODE_AUDIT §8.1078 |
| tracer: spans_ vector unbounded | 200 spans/sec → 144MB/hour → 3.4GB/day → OOM. Ring buffer or periodic export | CODE_AUDIT §8.1085 |
| tracer: no span export mechanism | Spans collected but never sent to Jaeger. Tracing is useless. Add export_spans() | CODE_AUDIT §8.1087 |
| backtest_engine: duplicate of backtester.py | Two engines with 827 lines overlap, different Sharpe annualization. Merge into one | CODE_AUDIT §8.1133 |
| optimizer: sequential grid search | 1000 combos = 16min on 1 core. Use ProcessPoolExecutor for N× speedup | CODE_AUDIT §8.1138 |
| walk_forward: new BacktestEngine per param combo | 320 engine instances per run. Add reset() and reuse | CODE_AUDIT §8.1143 |
| backtester: O(N²) window slicing | 50M copies for 10K candles. Pass index or use rolling window | CODE_AUDIT §8.1127 |
| real_account: bare Exception swallows CancelledError | get_balance and set_leverage catch bare Exception. Use specific exceptions | CODE_AUDIT §8.1149 |
| real_market_data: no backpressure on WS messages | 1000+ msgs/sec blocks receive loop. Use asyncio.Queue with bounded size | CODE_AUDIT §8.1154 |
| exchange_factory: FALLBACK doesn't close failed adapter | Resources leak on partial init failure. Call close() in except block | CODE_AUDIT §8.1147 |
| real_account: no retry on order placement | Transient exchange errors lose orders. Add retry with exponential backoff | CODE_AUDIT §8.1151 |
| real_exchange_client: 335 lines dead code | Duplicate of real_account.py, not used by exchange_factory. Remove or use as ccxt-free fallback | CODE_AUDIT §8.1158 |
| signal_publisher: backtest blocks event loop | 10K candles = 1s event loop block. 5 HFT clients starved. Use run_in_executor | CODE_AUDIT §8.1173 |
| systemic: bare Exception catches CancelledError | 5+ files swallow CancelledError preventing clean shutdown. Use specific exceptions | CODE_AUDIT §8.1182 |
| fix_client: no connect timeout | FIX server unreachable → hang forever. Add asyncio.wait_for(timeout=10) | CODE_AUDIT §8.1184 |
| fix_client: _pending_messages unbounded | OOM on failed ResendRequest. Cap at 1000 | CODE_AUDIT §8.1185 |
| shm_ring_buffer: FlushViewOfFile on every write | 100K syscalls/sec at high throughput. Batch flush or rely on cache coherence | CODE_AUDIT §8.1165 |
| shm_market_data_writer: no memory barrier on ARM | Seq writes without barrier → reader sees stale data on ARM. Add _mm_barrier | CODE_AUDIT §8.1191 |
| ws_connection_pool: fire-and-forget tasks | _evict_stale creates tasks that may be GC'd. Store refs or await directly | CODE_AUDIT §8.1188 |
| 3 duplicate modules across packages | helpers.CircuitBreaker vs communication.CircuitBreaker. observability.logging vs helpers.setup_logging. monitoring.health_server vs observability.health_checks. monitoring.metrics vs communication.metrics_server. Merge | CODE_AUDIT §8.1201,1210,1225,1227 |
| model_registry: _save on every A/B impression | 1000 JSON file writes/sec. Batch saves or use database | CODE_AUDIT §8.1237 |
| health_server: sequential health checks | 5s total > K8s 1s timeout. Use asyncio.gather | CODE_AUDIT §8.1228 |
| health_checks: no timeout on DB/Redis checks | K8s kills pod after 1s. Add asyncio.wait_for(timeout=2) | CODE_AUDIT §8.1208 |
| tracker: opens CSV file on every log() call | 100 open/close syscalls/sec. Keep file open | CODE_AUDIT §8.1220 |
| alerting: new aiohttp session per alert | 30 sessions/min. Use shared session | CODE_AUDIT §8.1216 |
| automl: study.optimize blocks event loop | 1h event loop block. Use run_in_executor | CODE_AUDIT §8.1230 |
| notifier: Discord polls REST API without sleep | Hammers Discord API at max speed. Add asyncio.sleep(1) on success | CODE_AUDIT §8.1265 |
| llm_engine: no rate limiting on API calls | Spikes on cold cache. Add rate limiter | CODE_AUDIT §8.1261 |
| price_predictor: not integrated with model_registry | Models trained but not versioned. Integrate register() after training | CODE_AUDIT §8.1246 |
| rkhs: Jacobi eigendecomposition O(N³) in pure Python | 10.8M ops, ~10s. Use numpy.linalg.eigh | CODE_AUDIT §8.1253 |
| notifier: NotifierManager.send_alert sequential | 5s total for 2 notifiers. Use asyncio.gather | CODE_AUDIT §8.1266 |
| research: 22 duplicate compute_returns functions | 22× same function across research modules. Create shared utils.py | CODE_AUDIT §8.1277 |
| research/__init__.py: 307 lines re-exporting ~200 symbols | Triggers loading all 25+ modules on any import. Use lazy imports | CODE_AUDIT §8.1276 |
| research: 35 files ~6000 lines potential dead code | Advanced math rarely used in production. Move to separate package | CODE_AUDIT §8.1280 |
| config: 30+ properties = 190 lines boilerplate | Over-engineered dict access. Use pydantic or dataclass | CODE_AUDIT §8.1290 |
| run.py: no graceful shutdown on SIGTERM | K8s/Docker sends SIGTERM not SIGINT. Add signal handler | CODE_AUDIT §8.1292 |
| run.py: _generate_symbols sequential for 50 symbols | With LLM 50-500s per cycle. Use asyncio.gather | CODE_AUDIT §8.1293 |
| run.py: duplicate entry points | 3 backtest scripts. Consolidate to run.py --backtest | CODE_AUDIT §8.1295 |
| strategies: EnsembleVoter averages SL/TP across votes | Meaningless price levels. Use highest-confidence signal's SL/TP | CODE_AUDIT §8.1298 |
| marketplace: install_from_git executes arbitrary code | No sandboxing. Run in subprocess with restricted permissions | CODE_AUDIT §8.1306 |
| risk: DynamicPositionSizer duplicates kelly.py | ~200 lines redundant. Remove and use KellyPositionSizer directly | CODE_AUDIT §8.1313 |
| risk: 2 duplicate PortfolioOptimizer classes | 3 implementations ~900 lines. Keep portfolio/ only | CODE_AUDIT §8.1316, §8.1334 |
| db: new SQLite connection per operation | 50 conn/min. Use persistent connection | CODE_AUDIT §8.1320 |
| ~~signal_publisher: _run_backtest blocks event loop~~ [FIXED] | Wrapped bt.run in asyncio.to_thread | CODE_AUDIT §8.1323 |
| ~~signal_publisher: 3 identical _send closures~~ [FIXED] | Extracted _broadcast_to_clients helper | CODE_AUDIT §8.1324 |
| Project-wide: 0 asyncio.Lock usage | _clients _candle_history _recent_signals at risk. Add locks | CODE_AUDIT §8.1336 |
| Project-wide: 13 except Exception catches | Masks CancelledError. Use specific exception types | CODE_AUDIT §8.1335 |
| Project-wide: 8 datetime.now() without timezone | Naive datetime fragile. Use datetime.now(UTC) | CODE_AUDIT §8.1338 |
| var: scipy hard dependency | Module fails if scipy missing. Make optional | CODE_AUDIT §8.1311 |
| fix_client: no SSL/TLS support | Plain TCP. Add ssl_context parameter | CODE_AUDIT §8.1330 |
| ~~shm_ring_buffer: no overflow detection on push~~ [FIXED] | Added dropped_count counter to try_push | CODE_AUDIT §8.1328 |
| ~~technical_analysis/__init__.py: 252 lines re-export ~200 symbols~~ [FIXED] | Replaced with empty file | CODE_AUDIT §8.1343 |
| ~~technical_analysis: 4× duplicate _random_normal Box-Muller~~ [FIXED] | All 4 copies replaced with rng.gauss(0,1) | CODE_AUDIT §8.1362 |
| technical_analysis: 3× duplicate _fft Cooley-Tukey | ~150 lines duplicate in fft_analysis/emd/vmd. Use shared _fft_utils or numpy.fft | CODE_AUDIT §8.1363 |
| technical_analysis: 16 modules likely dead code | ~4000+ lines not used in production. Move to advanced package | CODE_AUDIT §8.1364 |
| technical_analysis: vmd.py _ifft is O(n²) direct DFT | Forward is O(n log n) but inverse is O(n²). Use _fft with conjugation | CODE_AUDIT §8.1370 |
| technical_analysis: copula.py empirical_cdf is O(n²) | 250K comparisons for n=500. Use sort+bisect O(n log n) | CODE_AUDIT §8.1369 |
| ~~technical_analysis: copula.py own erf function~~ [FIXED] | Replaced with math.erf. Removed 9-line custom impl | CODE_AUDIT §8.1345 |
| technical_analysis: rbergomi O(n³) Cholesky in pure Python | n=50 → 125K ops. Use numpy or Davies-Harte O(n log n) | CODE_AUDIT §8.1354 |
| technical_analysis: hmc numerical gradient 60K evals | Central differences. Analytical gradient 2× faster | CODE_AUDIT §8.1358 |
| ~~technical_analysis: dtw duplicate compute_returns~~ [FIXED] | Replaced with import from _common.py | CODE_AUDIT §8.1347 |
| technical_analysis: No NaN/Inf input validation | NaN propagates through cumsum. Add math.isfinite() checks | CODE_AUDIT §8.1367 |
| ~~ml/__init__.py: 81 lines re-export ~30 symbols~~ [FIXED] | Replaced with empty file | CODE_AUDIT §8.1371 |
| ml: torch hard dependency in price_predictor + rl_trader | import torch unguarded. Guard with try/except | CODE_AUDIT §8.1382 |
| ml: 5 modules likely dead code | ~1300 lines not used in production. Move to ml_advanced/ | CODE_AUDIT §8.1383 |
| ~~ml/vae.py: 5th duplicate _random_normal~~ [FIXED] | Replaced with rng.gauss(0,1) | CODE_AUDIT §8.1379 |
| ~~ml/feature_store.py: broad Exception catch~~ [FIXED] | Removed redundant Exception from tuple | CODE_AUDIT §8.1374 |
| ~~monitoring/health_server.py: 3× duplicate _check_* methods~~ [FIXED] | Extracted _check_component helper. 3 one-liners instead of 3× 10-line copies | CODE_AUDIT §8.1385 |
| ~~monitoring/tracker.py: datetime.now() without timezone~~ [FIXED] | Changed to datetime.now(UTC) | CODE_AUDIT §8.1387 |
| networking/socket_transport.py: busy-poll loop | time.sleep(0.0001) on BlockingIOError. Use selectors or asyncio | CODE_AUDIT §8.1392 |
| ~~utils/helpers.py: duplicate logging setup~~ [FIXED] | Removed setup_logging + JsonFormatter. Consolidated to observability/logging | CODE_AUDIT §8.1393 |
| ~~research/__init__.py: 307 lines re-export ~200 symbols~~ [FIXED] | Reduced to 3 lines: compute_returns + quantize from _common | CODE_AUDIT §8.1400 |
| research: 30+ modules likely dead code | ~12000+ lines academic math. Move to research_lab/ | CODE_AUDIT §8.1401 |
| ~~research: compute_returns duplicated 20+ times~~ [FIXED] | Moved to _common.py, 24 copies replaced with import | CODE_AUDIT §8.1402 |
| ~~Project-wide: 3× duplicate logging setup~~ [FIXED] | Consolidated: helpers.setup_logging removed, 3→2 (run_logger + observability) | CODE_AUDIT §8.1403 |
| ~~Project-wide: 5× duplicate _random_normal~~ [FIXED] | All 6 copies replaced with rng.gauss(0,1) | CODE_AUDIT §8.1404 |
| ~~Project-wide: 3× duplicate __init__.py re-export~~ [FIXED] | TA (249→0), ML (81→0), research (307→3). All re-exports deleted | CODE_AUDIT §8.1405 |
| Project-wide: 2 duplicate health check systems | Consolidate. observability for logic, monitoring for HTTP | CODE_AUDIT §8.1406 |
| Project-wide: 50+ modules likely dead code total | ~17000+ lines. Move to analysis_lab/. Reduce src/ by ~50% | CODE_AUDIT §8.1407 |
| ~~data_collection: 2× duplicate AccountBalance dataclass~~ [FIXED] | Renamed real_account.AccountBalance → AssetBalance. Different fields, different purposes | CODE_AUDIT §8.1413 |
| ~~data_collection: no rate limiting on REST API calls~~ [FIXED] | Added asyncio.Semaphore in RealExchangeClient | CODE_AUDIT §8.1414 |
| ~~real_account: 3× broad except Exception~~ [FIXED] | Replaced with (OSError, RuntimeError, KeyError, ValueError) | CODE_AUDIT §8.1411 |
| real_market_data: no asyncio.Lock on shared state | _tickers _orderbooks _candles written from WS read from main. Low risk | CODE_AUDIT §8.1412 |
| ~~run.py: no SIGTERM handler~~ [FIXED] | Added SIGTERM/SIGINT handler for graceful shutdown | CODE_AUDIT §8.1416 |
| run.py: _execute_live_order not implemented | Stub logs warning. Silent failure if paper_trading=False | CODE_AUDIT §8.1417 |
| ~~run_backtest: sqlite3.connect without context manager~~ [FIXED] | Wrapped in with statement | CODE_AUDIT §8.1418 |
| ~~root/metrics.py: duplicate of src/monitoring/metrics.py~~ [FIXED] | 293 lines duplicate. Deleted | CODE_AUDIT §8.1420 |
| ~~root/tracing.py: duplicate of src/observability/tracing.py~~ [FIXED] | 205 lines duplicate. Deleted | CODE_AUDIT §8.1421 |
| ~~scripts/run_bot.py: stub that doesn't run bot~~ [FIXED] | Deleted. Use run.py | CODE_AUDIT §8.1424 |
| ~~scripts/run_backtest.py: duplicate of root run_backtest.py~~ [FIXED] | Deleted. Use root run_backtest.py | CODE_AUDIT §8.1425 |
| ~~run_logger.py: 4th duplicate logging setup~~ [FIXED] | Removed setup_logging from helpers.py. 3→2 logging setups | CODE_AUDIT §8.1426 |
| ~~bot_helpers.py: triggers __init__.py re-export~~ [FIXED] | Fixed: from src.technical_analysis.indicators import adx, ema, rsi | CODE_AUDIT §8.1427 |
| ~~ws_connection_pool.py: dead code — not used by ws_client~~ [FIXED] | Deleted module + test. ExchangeClient manages own WS | CODE_AUDIT §8.1431 |
