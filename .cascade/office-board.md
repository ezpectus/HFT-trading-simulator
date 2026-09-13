# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → текущий раунд R70+. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (99 шт, R4–R60) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> История работ: `.cascade/progress.md`, баги: `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 1180 (ai-signal-bot 332, web-ui/src 460, hft-trade-bot 146, exchange_simulator 84) |
| Всего находок | ~199 (S001–S199) |
| Закрыто | 158 |
| Открыто | **3** — R105 audit: S197/S198/S199 |

**Текущее состояние:** R105 audit — `exchange_simulator/tests/` + `ai-signal-bot/tests/` leaf-sweep (test↔live alignment) + `scripts/test_config_consistency.py` internals + docs-ledger consistency — **3 находки**: S197 (consistency-гейт: дублированный audit-check :209-214, `_shared_signal_ws` загружен но никогда не сверяется — drift ai-bot порта пройдёт зелёным, risk-check никогда не падает), S198 (AUDIT_FINDINGS.md — 12 протухших «— Open» маркеров на записях из done-log+verified: S109/S116/S117/S155/S156/S157/S158/S164/S178/S179/S180/S188 — документ противоречит леджеру), S199 (`exchange_simulator/tests/requirements.txt` — мёртвый+вредный: 0 ссылок, `pytest>=7.0` против dev-файла `>=8.3.4`+pytest-asyncio — кто поставит его, получит silent-skip всех async-тестов). Ранее: R104 audit — delta-ревизия кода, добавленного фиксами R97–R103 — **0 находок, чисто**: TIF-цепочка честна (LIMIT филлится по лимиту — `fill_price = price` :352, нет нарушения лимита; GTD без expire → `GTD_MISSING_EXPIRY` reject :90-92; `expire_ms` non-numeric → ValueError ловится общим except → error frame); watchdog-петли корректны (`connected_`-гейт, feed-после-trip, dead-handle→schedule_reconnect, ping_handler feed на 10s-серверных пингах при 15s-таймауте — само-трипа нет); `audit_logger.log` не бросает (file/callback пути catch-all) — безопасен внутри except; `_request_resync` — cooldown + loop-guard + `self._ws and self._connected` check перед send; legacy `submit_order` 3-arg overload жив (v1-engine path :315 + MARKET-делегация); `order_type_selector.h` жив (:141/:144). Также перепроверены: все 17 utils/stores файлов web-ui имеют импортёров; v1-selector/params/finalize headers живы. Ранее: R103 fix — S196 закрыта: `kill_switch` теперь единый дом `ipc.kill_switch` (shm_name + env-aware trigger_file + poll_interval_ms), теневой `risk.kill_switch` блок и его parse-site удалены, `ipc.kill_switch.shm_name` заведён в `cfg.kill_switch_shm_name` и читается в bot_setup (был hardcode). `HFT_KILL_SWITCH_FILE` теперь реально доходит до рантайма. Ранее: R102 verify-раунд — все 9 unverified done-log записей перепроверены по коду: **9/9 VERIFIED** (S150/S151/S152/S154/S191/S192/S193/S194/S195 — deletions реально удалены, emits/wiring/тесты на месте, 12 TIF + 26 ws_client + 4 vitest gap-тестов green). Verify вскрыл **новый дефект S196**: `risk.kill_switch.trigger_file` (literal `/tmp/kill_switch`) парсится ПОСЛЕ `parse_prod_ipc` и безусловно перезаписывает env-expanded `ipc.kill_switch.trigger_file` (`${HFT_KILL_SWITCH_FILE}`) — k8s-escape-hatch мёртв; плюс `ipc.kill_switch.shm_name` никем не читается (hardcoded `"/hft_kill_switch"` bot_setup.cpp:180). Ранее: R101 fix — S194/S195 закрыты. **S194** — testnet-путь починен end-to-end: `exchange.testnet` accessor добавлен в SignalBotConfig, wired в ExchangeFactory (run.py:580) → RealExchangeAdapter → RealAccountManager → ccxt sandbox; `settings.testnet.yaml` переписан как полный валидный preset (все обязательные секции, `paper_trading: false` + `testnet: true`, креды только через `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` env — совпадает с тем, что реально читает factory; мёртвые ключи `mode`/`name`/`api_key`/`api_secret`/`intervals`/`symbols` удалены; header-usage исправлен на реальный `--config`). Проверено: `SignalBotConfig.load` грузит, `testnet=True` доходит. **S195** — stale-docs исправлены: ARCHITECTURE:201/TESTING:129/TECHNICAL_REFERENCE:1427 убраны ссылки на удалённые options_*; DEPLOYMENT:734 tuning-блок переписан на реальные ключи (`thread_pinning`/`execution_thread_core`, `ipc.*.capacity`). Проверено: 107 config/exchange-тестов pass, ruff clean. Ранее: R100 audit — 2 находки на grafana/e2e/config-accessor ячейках + stale-docs resweep. **S191** — dead options cluster удалён (~1014 строк: options_pricing deprecated-shim + options_strategies 0 прод-импортёров + test_options_pricing shadow-test; живой путь options_simulator имеет свой тест). **S192** — `email_smtp` параметр удалён из AlertSystem.__init__, docstring исправлен (email-канала никогда не было). **S193** — audit-stream допаян: CONFIG_CHANGE эмитится в `_handle_update_config` (update_config менял leverage мимо аудита), SYSTEM_STOP в `start()` finally (SIGTERM/SIGINT путь), ERROR в message-handler except, WARNING в invalid-json/msgpack парсах; POSITION_MODIFIED удалён из enum (доменного события не существует); docstring audit_logger приведён к факту. Проверено: sim 394 pass, alerting 41 pass, runtime-smoke CONFIG_CHANGE эмитится с metadata. Ранее: R98 audit — 3 находки на sim-периферии + ai-bot root. Ранее: R97 fix — последние 4 находки старой доски.

---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| **S197** | `test_config_consistency.py` — дублированный блок + unused var + risk-check который не может упасть | `scripts/test_config_consistency.py:209-214` — `if "audit" not in exchange_config: return False` продублирован дважды подряд (мёртвый второй блок). `:137` — `_shared_signal_ws = shared_config["websocket"]["ai_signal_bot"]` загружается и никогда не используется — endpoint ai-bot из shared_config ни с чем не сверяется: дрейф порта сигналов пройдёт гейт зелёным. `test_risk_parameter_consistency` (:172-199) — все 3 проверки только печатают WARNING и функция всегда возвращает True — «consistency check», который по построению не может упасть (гейт зелёный при любом дрейфе risk-параметров). | Info | [ ] Open |
| **S198** | `AUDIT_FINDINGS.md` — 12 протухших «— Open» маркеров на закрытых записях | Статусный дрейф: S109/S116/S117/S155/S156/S157/S158/S164/S178/S179/S180/S188 помечены «— Open.» в doc, но все присутствуют в done-log (R77/R86/R94/R95-era фиксы) и часть уже ✅ verified (R85/R89/R93/R96). Читатель doc'и видит 12 «открытых» Medium/High-находок которых нет — audit-trail противоречит собственному леджеру. | Info | [ ] Open |
| **S199** | `exchange_simulator/tests/requirements.txt` — мёртвый и вредный dep-файл | 2 строки (`pytest>=7.0`), **0 ссылок** repo-wide (CI/Makefile/docs/Dockerfile не трогают). Реальные test-deps живут в `exchange_simulator/requirements-dev.txt` (pytest>=8.3.4 + pytest-asyncio + hypothesis…). Кто поставит tests/requirements.txt получит pytest без pytest-asyncio → все async-тесты сима молча пропускаются. | Info | [ ] Open |



---

## ЧИСТО (проверено индивидуально, 0 совпадений)

- R98: `exchange_simulator/conftest.py` + `ai-signal-bot/conftest.py` — легитимные sys.path-шимы; `ws_constants.py` — все флаги (`_HAS_SHM`/`_HAS_ORJSON`/`_HAS_MSGPACK`/`PROTOCOL_VERSION`/`_sanitize_log`) реально импортируются server/broadcast/handler
- R105: test-leaf-sweep — все импорты 127 test_*.py резолвятся в существующие модули (0 shadow-imports); test_simulator/test_simulated_exchange/test_exchange бьют живые классы (overlap coverage, не тень); conftest'ы — реальные sys.path-шимы/fixtures; `tests/logs/` untracked; `stress_test.py`/`load_test_50_symbols.py` — non-collected load-скрипты (документированы, scripts-дубль удалён ещё S138); property/load тесты — честные dep-gate skipif, не пустые
- R100: `config/__init__.py` — все 70 property-accessors consumed (только `__getattr__`-fallback без читателей — легитимно); grafana dashboards — все 5 JSON валидны (flat+wrapped оба provisionable), 46 exprs, datasource `Prometheus` совпадает с datasources.yml, provider path ↔ compose mount согласованы; playwright.config — `dev:mock` script существует, baseURL/webServer согласованы; `dismiss-onboarding.js` helpers — все 3 export'а импортируются; `monitoring/alerts/` — пустая untracked-директория
- R98: `arbitrage.py`/`audit_logger.py`/`data_export.py` — живые end-to-end (detector→broadcast→auto-execute; audit→`audit_logs`→AuditLogViewer; export→`--export` CLI); `monitor.py`/`run_backtest.py` — документированные CLI, импорты резолвятся; `models.py` — все 13 классов consumed; кеши/истории bounded (deque maxlen, _max_* trims); `ws_metrics` — все 9 счётчиков экспортируются; `hft-executor` Rust-crate полностью отсутствует в дереве

- `TODO` — 0 в ai-signal-bot
- `import *` — 0
- bare `except:` — 0 в src
- `except Exception: pass` / `except Exception: return` — 0 в коде
- `eval(` — 0 (только `model.eval()` PyTorch)
- `exec(` — 0
- `pickle.loads` — 0
- `verify=False` — 0 (только в docs)
- `yaml.load` — 0
- `shell=True` — 2 легитимных (nosec + conditional)
- f-string SQL — 0
- `pytest.mark.xfail` — 0, `pytest.mark.skip` — 1 (`skipif` с reason, легитимно)
- `NotImplementedError` — 0
- `type(x) ==` — 0
- `str(Path(`/`Path(str(` — 0
- `dangerouslySetInnerHTML` — 0
- `catch {}`/`catch (e) {}` — 0
- `except (Exception` — 0
- Mutable default args — 0
- `== True`/`== False`/`== None`/`is True`/`is False` — 0
- `datetime.utcnow`/`datetime.now()` — 0
- `while True` — 5 легитимных
- `np.random` — 9 легитимных
- `key={i}`/`key={index}` — 0
- `sys.exit(`/`exit(` в src — 0
- `lru_cache`/`@cache` — 0
- `asyncio.run(` — только entry points
- `os.environ` — 12 легитимных
- `exchange_factory.py` 34 `async def` — Protocol, легитимно
- C++ `catch (...)` — top-level only, легитимно
- C++ `new`/`delete` — только комментарии
- `innerHTML` — 1 комментарий "no innerHTML injection", чисто
- `var ` — имена переменных (varH, varCF), не декларации
- `alert(` — `onAlert`/`removeAlert`, не browser alert
- `debugger` — 0
- `async def` без `await` — 27 сайтов, все signature-bound (Protocol impl, aiohttp handlers, task-spawn entry) — ЧИСТО
- R42: CI `docker-smoke` порты ↔ compose healthchecks ↔ exporter endpoints полностью согласованы (8775/9090/9091/3000); prometheus job_names ↔ `up{job=}` селекторы; все 13 метрик из alerts.yml реально эмитятся (metrics.py + ws_prometheus.py)
- R42: web-ui package.json — все deps импортируются в src/config (0 unused); `deploy.sh` backup/restore = корректный atomic swap SQLite data-dirs; `ebpf_monitor.py` = задокументированный standalone CLI; `pre-commit-check.py`/`health-check.py`/`ci-equivalence.py` живые
- R45: `scripts/ci/` — живой local-CI suite (run-all→lint/test/build/security, CHANGELOG-документирован); оба `config.yaml` — 0 мёртвых leaf-ключей; workflows deploy/nightly/release/codeql — реальные API/пути (shim re-export + `Backtester.run` сигнатура совпадают); Dockerfiles ↔ EXPOSE/HEALTHCHECK/CMD консистентны; helm values — реальные образы+pins
- R47: compose-варианты prod/staging/hub — healthchecks на реальных портах (8775/9090/9091/3000), staging-суффиксы и 18xxx-порты согласованы, hub=real registry images; `ui-helpers.js` = deliberate re-export shim на `.tsx`; `mockData.js` — env-gated mock-инфра (S003-легитимна); `visualizer*.py` — живые (флаг `--no-visualizer` в __main__)
- `getattr(x, "a")` без default — 0
- R51: zero-importer sweep repo-wide (после S125/S126): hft-trade-bot — 0 мёртвых файлов (42 исходника, все .cpp в CMake SOURCES, pch.h через target_precompile_headers, оба "сиротских" хедера — aligned_types.h/ws_client.h — широко инклудятся); exchange_simulator — 0 (24 файла); web-ui/src — 1 остаток = ExchangeSelector (S126 keep); scripts — 4 zero-ref, все живые entry-points (benchmark_suite/walk_forward_ci → Makefile targets; ci-equivalence → документированный верификатор; run-all.sh → local-CI оркестратор R45)
- Unbounded module/instance caches — `_candle_history`/`_funding_history`/`_ob_cache` все capped (`_max_*` trims)
- `random.`/`np.random` в src — 8 сайтов, все seeded RNG (VaR/CVaR MC, reconnect jitter, Hawkes) — легитимны
- `len() == 0`/`!= 0` в src — 1 тривиальный guard; в тестах — exact-contract asserts
- `pytest.mark.skip`/`xfail` без reason — 0; web-ui `it.skip`/`xit`/`xdescribe` — 0
- `json.loads` без try — 0 из 45 (все в try-блоках)
- `if not x: return []`/`{}` masking — 0 в src
- Dead top-level классы в strategies/risk/portfolio — 0 (все referenced)
- Dead hft headers — 0 (`pch.h` wired через `target_precompile_headers`)
- helm/terraform — 0 ссылок на удалённые сервисы; settings.yaml — нет секций удалённых модулей
- `try/except: pass` в тестах — только chaos-тесты (connection death tolerated намеренно)
- web-ui mock infra (`useMockData`/`mockData`/`MockModeBanner`) — env-gated `VITE_MOCK_MODE`, disclosed, tested — легитимно
- `assert callable(`/`assert issubclass(` — 0
- `except Exception` в exchange_simulator — 0
- `print(` в exchange_simulator — 2 (docstring + options_simulator)
- `.index(` — 0
- `status_code in` — 0
- `mockData`/`useMockData` в components — 0 (используют MOCK_* inline)
- `model_dump(` — 0
- `sorted()[-k:]`/`sorted()[:k]` — 0
- `f"INSERT`/`f"SELECT` — 0
- C++ `catch (std::exception)` — 10, все логируют (spdlog warn/error/critical), чисто
- Rust `unwrap()`/`expect()`/`panic!`/`todo!`/`unimplemented!` в `hft-executor/src` — 0 (все 15 в `#[cfg(test)]`)
- Rust `unsafe` — только FFI boundary (CStr::from_ptr, Box::from_raw) — легитимно
- `fpga/fpga_orderbook.vhd` — честно помечен "ACADEMIC SKETCH — NOT A PRODUCTION PROTOTYPE", не притворяется
- `hft-trade-bot/monitor.py` — реальный log tailer, не мок
- `.env.prod` — gitignored, секреты только через `${VAR:?}` (без дефолтов в compose)
- prod compose: postgres/redis через `expose`, не `ports` — не торчат наружу
- Все 4 prod Dockerfile: multi-stage, non-root user, пинned base images
- `release.yml` — легитимный changelog/release flow
- `deploy.yml` — scp/ssh + GHCR push, секреты через secrets.*, чисто
- README числа точные: 278 panels (registry), 289 components, 116 vitest файлов [R76: vitest вырос до 157 — README:121 «157» актуален, ARCHITECTURE.md:422 «99 unit» протух → S168]
- `EnsembleVoter` + `CircuitBreaker` + StatArb — реально в loop (run.py / signal_publisher)
- `visualizer.py` — подключён через `__main__.py --no-visualizer`, живой
- Все 18 незарегистрированных web-ui компонентов — App.jsx chrome (Header/StatusBar/OrderForm…), не сироты
- helm templates существуют, httpGet пробы — по claim'у в README
- `health_server.py` на :8080 — реальный (aiohttp, поднимается в run.py)
- `llm_engine/engine.py` — РЕАЛЬНЫЙ LLM-клиент: openai/anthropic HTTP через aiohttp, rate-limit, LRU-кэш, rule-based fallback при provider=none/нет ключа — wired в run.py:116/148
- `terraform/` — настоящие .tf модули (eks/rds/elasticache + env-mains), задокументированы в DEPLOYMENT.md
- shm_* + ws_client + signal_publisher в communication/ — живые (wired в run.py)
- exchange_simulator: qty=NaN/≤0/over-limit отклоняются корректно, SL/TP default 2%/4% ставятся, partial-liquidation PnL формула верна, insurance fund покрывает дефицит, ликвидационные цены `entry*(1∓1/lev±mmr)` — канонические
- лимит-ордера корректно уходят в PENDING когда цена не проходит fill_price
- `arbitrage` + `data_export` + `config_validator` + `options_simulator` из вложенного пакета — ЖИВЫ (wired в __main__/ws_message_handler)
- funding pipeline целиком живой: market_simulator → ws_broadcast → UI fundingRates
- `options_chain` WS handler реален — BS-chain с полными греками от OptionsSimulator
- `signal_engine_v3.h` OnlineHMM — НАСТОЯЩИЙ math: log-space forward recursion, log-sum-exp, Gaussian emissions, online adaptation; opt-in через config (engine_v2 fallback)
- hft живое: `adaptive_selector`, `risk_mgr`, `kill_switch`, `shm_fill_producer`, `shm_market_data`, `shm_signal_consumer`, `signal_receiver`, `SystemMonitor` — всё wired в core/
- `useExchangeData` — настоящий полный plumbing: candle dedup-map, orderbook delta apply, fills/funding/news/regime/circuit-breaker — все real
- mock-mode честно гейтится `VITE_MOCK_MODE`/localStorage, задекларирован в README
- `useTradeJournal` (CSV export) + `useSessionRecorder` (localStorage) — реальные
- risk/ модули живы через backtester+signal_publisher (VaR/CVaR/Kelly/stress/position_sizing/risk_manager)
- R78 ai-signal-bot/src leaf-sweep ЧИСТО: `ml_ensemble.py` — настоящий sklearn/LGBM/XGBoost (guarded imports, StandardScaler, IsolationForest, predict_proba, honest NEUTRAL при untrained/low-conf/anomaly); `database`/`signal_validation`/`monitoring` пакеты реально используются (run.py:36,41,89-98,236,628); `observability.tracing` wired (setup/shutdown в run.py:710,722); `data_collection` полный — ExchangeFactory SIMULATOR/REAL/FALLBACK, RealAccount = честный defensive code (каждый `return []` после logged error/guard), feed←manager←factory цепочка живая; `MetricsCollector` — честный fallback-sink, живой в signal_publisher:75; `backtest_comparison`/`walk_forward` живы (backtest_requests/optimizer/run_backtest/walk_forward_ci); `pricing/volatility_surface` — SVI/SABR за WS-endpoint; все `return []`/`{}` в src — легитимные guard'ы, не stub-маскировка; EMPTY-BODY в exchange_factory — `...` Protocol-методы
- R79 web-ui internals ЧИСТО: `Object.*(positions)` — все 12 сайтов `Object.values` (на list работают корректно, values=array items), 0 `Object.entries`; .sort()/.reverse() — 115 сайтов, все на локально-построенных массивах кроме DrawdownAnalysis (S175); `useWebSocket` onmessage — per-message try/catch на JSON.parse (S013-класс закрыт); `useLocalStorage` — guarded (try→initialValue); `performance.ts` vs `performanceMonitor.js` — разные домены (trading-math vs web-vitals), оба живые; `ui-helpers.js` — честный 1-строчный re-export shim на `.tsx`; components/backtest+performance подпакеты — все 6 файлов wired; candles/format/indicators — 80/91/31 импортеров
- R80 hft-trade-bot/src internals ЧИСТО: `Position::update_pnl` — корректная long/short математика с вычетом fees+funding; `shm_ring_buffer` — честный SPSC (acquire/release, cache-line-aligned head/tail, magic/capacity/elem-size валидация); `signal_receiver_handlers` — все JSON-доступы через `.value()` с дефолтами; kill-switch механика живая (file-trigger poll + `can_trade()` гейт в main.cpp:49); `check_sl_tp`/`close_position`/`update_all_pnl` корректны; 0 TODO/FIXME/stub во всём src; `calculate_position_size`/`check_signal` (V1) — честная live-логика; `balance.fetch_add` на close + `daily_pnl_` CAS-add — корректные атомики
- R81 components internals ЧИСТО: все 9 addEventListener с removeEventListener; все setInterval/setTimeout в useEffect с cleanup; 0 мёртвых useState-setter'ов; 0 useMemo/useCallback/useEffect с `[]`-deps читающих пропсы (brace-matched scan); 0 структурных дублей файлов (normalized-md5 по 289 файлам); `fetch(` только AlertWebhook→user-URL; все UI→sim WS-типы имеют хендлеры; экзотические math-панели (AffineArithmetic и семейство ~60 шт) — настоящие реализации на `selectCandles`, не декорации; `useDetachablePanels` — createElement/textContent, ноль innerHTML; `useTradingStore`/`usePanelContext` — честный Zustand-слой; CancelMonitor — honest NoDataFeed; BacktestRunner → live `run_backtest`
- R82 test-suites ЧИСТО: 0 `assert True`/tautology во всех python-сьютах; 0 shadow-def продакшен-функций в тестах (S167-паттерна нет в python); `test_e2e_pipeline`/`test_strategy_risk_backtest` — настоящие integration (SimulatedExchange+CB, Backtester+RiskManager+Validator); все skip'ы — честные dep-gate (hypothesis/scipy/prometheus — ставятся в CI); e2e Playwright — реальные page-тесты, wired в required CI-гейт; doctest hft — все таргеты в CMake кроме 2 сирот (S186); дублирующие имена test_*.py в root vs unit/ — разные предметы, оба реальные
- R83 CI/infra-configs ЧИСТО: `deploy.yml` health-check — все 5 портов валидны (8775 sim/8080 ai-bot-ready/9091 hft/3000 web/3001 grafana); `docker-smoke` ходит в реальные /health (nginx :26); `nightly-backtest` — честный walk-forward + regression-gate + issue-on-fail; `release.yml` changelog генератор честный; `web-ui/Dockerfile` — prod-nginx с /health; `netlify.toml` корректен; `vitest.config` thresholds+все скрипты живые; `audit-deps`/bandit/test-summary — настоящие гейты

- live-цикл делает собственный sizing (run.py:299-306) + validator (confidence/RR/drawdown/maxpos/dup) — честная архитектура
- backtesting/: backtester/optimizer/walk_forward/plotter/backtest_engine/pnl_calculator/comparison — живы через run.py/run_backtest.py/nightly
- README "models not trained" дисклеймер существует (но занижает — ml/ вообще не вызывается)
- `check_stop_loss_take_profit` вызывается из main-loop/ws_broadcast — живой путь SL/TP
- `indicators`/`fft_analysis`/`hawkes_funcs`/`hawkes_model` — единственные 4 wired-модуля technical_analysis
- `_execute_limit_order`/`_execute_trailing`/`_execute_iceberg` реализованы — но недостижимы (S094)
- Config consistency: 49 символов идентичны в shared_config / exchange config.yaml / ai-bot settings.yaml / hft config.yaml (README "50" — off-by-one, тривиально)
- Все 5 grafana dashboard JSON валидны
- `ws_prometheus.py` — настоящий exposition format (контраст с hft JSON /metrics — S069)
- `exchange_factory` + `real_account` — настоящие ccxt-адаптеры, wired в run.py:342 для live-режима
- hft `pressure_model`/`low_latency`/`obi_utils`/`inline_indicators`/`types`/`aligned_types`/`signal.h` — живые
- C++ real-адаптеры Binance/OKX/Bybit конструируются при `is_production && smart_router_enabled` (но route() мёртв — S059)
- `market_simulator` GBM-ядро настоящее: correlated z (shared+idio), news events, weekend mode, wick/high/low/volume synthesis — разумный симулятор
- funding `rng.gauss(0,0.0002)` per-exchange — осознанный сим-дизайн, funding pipeline живой до UI

**R71 (domain-required patterns — проверено, чисто):**
- sim `_cleanup_client` — все 4 per-client dict'а (versions/encodings/subscriptions/msg_counts) pop'аются на disconnect, утечки нет; rate-limit 1000 msg/мин, per-message try, `max_size=1MB`, ping_interval=10
- `signal_publisher.py` — broadcast bounded `wait_for(send, 5s)` per-client, `max_clients=50` + 1013 reject, auth handshake `wait_for(10s)`
- ai-bot `ws_client.py` — recv watchdog `wait_for(30s)`, `open_timeout=10`, ping 10/10, reconnect backoff+jitter ≤5 попыток, per-message JSONDecodeError try
- `market_data_feed.py` — `asyncio.Queue(maxsize=500)` + drop-oldest-политика на QueueFull, ping 20/10, backoff ≤30s, gap-fill hook на reconnect
- `useWebSocket.ts` — ring buffer 5000, outgoing queue cap 100, `maxReconnects=20`, app-ping 5s
- `sync_state` включает полные orderbooks (`ws_broadcast.py:114-123`) — reconnect лечит книги
- `OrderExecutor` — честный bool-return, unwind-нога при срыве sell-лега арбитража, JSON truncation guard, reconnect backoff ≤30s
- `KillSwitch` — идемпотентный `activate()`, joinable monitor-thread, SHM-нотификация wired (S132), close-positions callback реальный
- root-level residue — `websocketpp/`, `vcpkg/`, `node_modules/`, `audit/`, `hft-skills/`, root `*.py`, stale root `*.md` — всё untracked/gitignored, находок нет

**R72 (security surface — проверено, чисто):**
- SHM perms `0600`/`0o600` обе стороны — C++ `shm_open` (shm_ring_buffer.h:101, shm_market_data.h:66), Python `os.open` (shm_ring_buffer.py:148,151) + `multiprocessing.SharedMemory` (sim) — owner-only, инъекция сигналов локальным юзером закрыта
- CORS — 0 `Access-Control`/cors-хедеров репо-вайд: никаких `*` — health-эндпоинты не читаются браузером cross-origin
- Токен-транспорт правильный: `{type:"auth",token}` первым фреймом (не URL query → не течёт в proxy-логи); auth-fail лог не эхит токен; `_sanitize_log` на user-значениях в update_config
- ai-bot health middleware: освобождает только `/live`+`/ready`, `/health*` под Bearer при заданном токене
- Grafana admin-пароль `${GRAFANA_PASSWORD:?required}` в dev+prod (staging default «staging» — только staging)
- sim ws: `max_size=1MB`, per-client rate-limit 1000 msg/мин (от флуда защищает; control-команды теперь за `EXCHANGE_CONTROL_TOKEN`-auth → S155 fixed), auth-handshake publisher'а bounded `wait_for(10s)`
- secrets-in-logs: aiohttp debug-лог подавлен в notifier (токены telegram/discord не утекают)

**R73 (config leaf-keys — проверено, чисто):**
- ai-bot `settings.yaml` leaf-sweep: все ключи имеют живых читателей, кроме `shm.max_symbols` (S159 — R87: заведён, 0=auto-size) — `metrics.enabled` настоящий gate (`run.py:194` `enable_metrics or config.metrics_enabled`), контраст с мёртвым флагом сима
- hft dev `config.yaml` — остальные ключи живые: `hft_strategies` periods/тоглы вайрятся в `EngineParams` (bot_setup.cpp:153-159), `adaptive_order_selector.*` → `AdaptiveOrderSelectorV2::Params`, `latency_optimization.*`/`ai_signal_bot.*`/`signal_engine_v3.enabled`/`logging.*` → `cfg`, `trading.*`/`risk.*`/`exchange.*` → `cfg` (S150 уже покрыл их banner-only consumption)
- web-ui: `netlify.toml` живой (deploy.yml Netlify-job + secrets), `nginx.conf` реальные security-headers/health/SPA-fallback, VitePWA autoUpdate сам инжектит SW-регистрацию — `registerSW` import не нужен
- web-ui generated dirs (`dist/`, `coverage/`, `playwright-report/`, `test-results/`, `screenshots/`) — все gitignored, не residue
- helm `OPENAI_API_KEY` if/else — value-or-secret pattern, не дупликат

**R74 (protocol-doc + monitoring — проверено, чисто):**
- WEBSOCKET_PROTOCOL.md §8766 (ai-bot) — полностью честный: все 9 compute-типов и `*_result` ответы (`backtest_result`/`comparison_result`/`portfolio_result`/`vol_surface_result`/`cvar_result`/`stress_test_result`/`position_size_result`/`hawkes_result`/`funding_arb_result`) совпадают с эмиттерами в `analysis_requests.py`/`backtest_requests.py`/`portfolio_requests.py`; `auth`/`auth_ok`/`auth_failed`, `signal`, `signal_history`, `market_regime`, `circuit_breaker_status` реальны
- sim `subscribe`/`unsubscribe` — все 3 поля читаются (`protocol_version`/`encoding`/`symbols`, handler:282-296), msgpack-fallback честный, unsubscribe без ответа — как в доке; `trading_state` — настоящий broadcast всем клиентам (handler:394), `snapshot`/`sync_state`/`pong`/`replay_*`/`audit_logs`/`options_chain`/`arbitrage_scan`/`fill` — эмиттеры есть
- `alerts.yml` — все 22 expr'а резолвятся в реально эмитящиеся метрики (`exchange_orders_rejected_total` :133, `exchange_equity`/`exchange_balance` :118-119, `ai_signal_bot_drawdown/win_rate/pnl_total` в metrics_server.py:105-110) — ноль dead-alerts
- hft dashboard — все 10 `hft_*` метрик в кверях реально эмитятся `format_prometheus()` (system_monitor.h:134+), включая `hft_latency_us_bucket`/`hft_shm_signal_queue_depth`/`hft_fill_rate`

**R75 (infra-config — проверено, чисто):**
- helm `values.yaml` — все ~44 ключа имеют `.Values.*`-потребителей в шаблонах (image/ports/resources/enabled/storage/storageClassName/ingress.*) — ноль dead-values
- `alertmanager.yml` — честно задокументирован «default receiver has no notification configs — nothing is sent until you wire a channel»; routing/inhibit синтаксически валидны
- `Makefile logs` — все 4 файла реальны: `_latest.log` symlink'и создаются `run_logger.py:103` (sim+ai-bot), `hft_trade_bot_latest.log` — второй sink в `logger.h:43-55`, `trades_latest.csv` — `trade_csv_logger.py:51` (через sim `websocket_server.py:80`)
- `Makefile` таргеты → реальные файлы (`pre-commit-check.py`, `benchmark_suite.py`, `walk_forward_ci.py`, `docker-compose.hub.yml`)
- terraform: 10 из 11 переменных потребляются (vpc/eks/s3 модули реальные)
- hft-trade-bot.yaml — честный comment-only файл (sidecar-pattern задокументирован)

**R76 (test-honesty — проверено, чисто):**
- python test suites — ai-bot 99 + sim 29 файлов: реальные asserts + mock-assertions (`assert_called_once_with`/`assert_not_called`); no-assert скан → 0 истинных попаданий (`test_run_equity.py` — false-positive на mock-API)
- `monitoring/tests/test_alerts.py` — настоящая schema-валидация `alerts.yml`: 5 групп, severity∈{info,warning,critical}, обязательные `expr`/`for`/`labels`/`annotations`
- e2e — 4 spec'а с реальными expect'ами (34 шт); CI `test-e2e` job — настоящий gate (нет `continue-on-error`/`|| true`, входит в `check_result` test-summary); `screenshots.spec.js` — честно названный capture-скрипт для README, не притворяется тестом
- hft doctest — 565 REQUIRE/CHECK в 17 файлах, наполненные тесты (что они тестируют мёртвые абстракции — отдельно в S152/S096, не vacuity)
- `monitoring/alerts/` — пустая untracked-папка на диске, не закоммичена — не residue репо
- README test-counts честны: :121 «157 vitest + 4 e2e» и :195 «162 test files» (157+4 spec+helper) — точны

**R77 (panel-registry wiring + stores/hooks — проверено, чисто):**
- `panels/registry.js` — все 278 entries резолвятся в существующие компоненты (0 missing файлов)
- 15 entries с `props: () => ({})` — все честны: 8× `NoDataFeed`-disclosure (Colocation/ABTesting/LogDashboard/PacketInspector/HyperoptUI/RetrainingPipeline/GeneticViewer/CancelMonitor — «feed is not produced by backend»), OptionsPricing/OptionsStrategies — интерактивные калькуляторы (user-params → BS-math), BacktestComparison — localStorage saved-results viewer, OnboardingTutorial, StrategyMarketplace — disclosed «local only», DashboardProfiler — реальные Web Vitals через `utils/performanceMonitor`, StrategyBacktest — self-subscribed
- `MOCK_` — только в `MockModeBanner` (детектор), не в data-компонентах
- `Math.random()` — все 27 сайтов легитимны: Box-Muller/MC-сэмплинг, k-means centroid init, permutation shuffles, `Date.now()+rand` ID-gen — ноль фабрикованного market-data
- stores честно вайрятся: `useTradingStore` — 6 потребителей, `usePanelContext`/`useToastStore`/`useUIStore` — по живым импортерам
- остальные 19 хуков имеют прод-импортеров; `useDebounce.ts` — живой (4 панели)

---

## ПРИОРИТЕТЫ

1. **S162** (Medium) — протокол-док :8765 врёт в 8 местах. (Doc поправлен в R74 + R77 дописал новые типы; строка остаётся контрольной точкой для slop-verify.)
2. Периодически — `/slop-verify`: QA-проверка записей done-log по файлам/строкам.
