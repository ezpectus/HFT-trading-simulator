# DONE LOG — закрытые находки

> Архив `[x] Done`/`[x] N/A` строк с `.cascade/office-board.md`. Доска держит только Open/Partial — сюда переносит `slop-fix` при закрытии, проверяет `slop-verify`.
> Формат для новых записей: `| S### | находка | как закрыто: файлы:строки | приоритет | раунд |`.

## Миграция R4–R31 (перенесено с доски как есть)

| ID | Находка | Детали / как закрыто | Приоритет |
|----|---------|----------------------|-----------|
| **S002** | `Math.random()` как "live" метрики — 88 вхождений в 36 файлах | LatencyPanel → реальная WS-RTT история; OrderBook → детерминир. fallback; MarketDepthReplay → детерминир. хэш по (timestamp,level). R26 финал: оставшиеся 52 сайта — легитимный Monte-Carlo (Ogata thinning, EM init, bootstrap, MCMC) на реальных candles + id-generation. | Critical | ✅ verified R48 VERIFIED R52: 48 Math.random — все легитимный стохастический сэмплинг (Xavier init, CS-матрицы, MCMC, Hawkes thinning, HMM), не фейк-метрики.
| **S004** | Тесты проверяют размер/тип/не-None, не содержимое — 839 слабых assert'ов | R6+R28+R29: топ-файлы → exact-value asserts (test_portfolio ret=0.121/vol=√0.00739/turnover=0.05, test_vae KL=0.5/threshold=mean+2σ, test_rebalancing order sides, test_backtest_plotter ==4 png, test_fft ==32 bins). `len>0` standalone = 0; 23 vacuous теста → exact/semantic. Остаточные len==/isinstance — paired с content, легитимны. | High | ✅ verified R48 VERIFIED R52 (ранее R48): weak-assert residue ~13% — легитимные is-not-None guards.
| **S005** | `range(len(` — 84 вхождения в 38 файлах | R6+R29: все сайты → `zip(…, strict=False)`/`enumerate`/`pairwise`/`np.arange`. `range(len(` = 0 в обоих пакетах. | Medium | VERIFIED R52: реальных range(len( = 0 (6 grep-хитов = np.arange — собственный фикс).
| **S006** | Моки без spec — 156 в 22 тестовых файлах | R25–R29: все top-level моки spec'd (test_signal_publisher 22 сайта → spec=WebSocketServer*, test_real_account → spec=_CCXT_SURFACE, test_metrics_server → asyncio.Server/StreamReader/Writer, test_websocket_server 30 → spec=ServerConnection, test_security 19, test_walk_forward 10, test_bot_helpers 8, cross_exchange_arb 15). AsyncMock callback-шпионы исключены (spec неприменим). | Medium | VERIFIED R52: top-level mocks spec'd (14 spec= в test_signal_publisher); остаток — attribute-level AsyncMock методов, вне скоупа.
| **S007** | `time.time()` — 71 в 23 файлах src | 37 интервалов → `time.monotonic()` (circuit_breaker cooldown, uptime'ы, latency/ages, _last_msg_times, exec_ms, cache TTL, decay). Стенные timestamps в пейлоадах/БД оставлены — их семантика. | Medium | VERIFIED R52: 39 monotonic-сайтов на месте (circuit_breaker cooldown, uptime, _last_msg_ts); time.time() residue = легитимный wall-clock.
| **S008** | `type: ignore` — 9 | R27: 0 осталось. var.py → `ModuleType \| None`; helpers → `assert last_exc is not None`; price_predictor/rl_trader удалены. | Low | VERIFIED R52: 1 type: ignore — легитимный conditional-import pragma (ws_constants.py:11).
| **S009** | Duck typing `getattr`/`hasattr` — 26 | R26b ревизия: легитимный duck-typing на гетерогенных API (ccxt capabilities, plugin loading, dict-or-object нормализация). N/A. | Low | VERIFIED R53: N/A-finding — duck-typing ревизия подтверждена (ccxt capabilities, plugin loading).
| **S010** | `os.path` + `pathlib` вперемешку — 15 | R26b: ложная находка — ни один файл не смешивает стили (все 100% os.path). fix_client/model_registry удалены. N/A. | Low | VERIFIED R53: ложная находка изначально — стилей не смешивается.
| **S011** | `global` — 4 в src | Singleton get_or_create — intended pattern, callers consistent. N/A. | Info | VERIFIED R53: singleton get_or_create — intended.
| **S012** | `print()` в src — 5 | Docstring-примеры + намеренный `print_report()` CLI-вывод. N/A. | Low | VERIFIED R53: print() = docstring-примеры + print_report CLI.
| **S013** | `json.loads` без per-message try в real_market_data.py | Per-message `try/except JSONDecodeError` + `continue` в 3 циклах (binance/okx/bybit), как ws_client.py:148; JSONDecodeError убран из внешних except — reconnect только по сетевым. | Medium | VERIFIED R52: real_market_data.py теперь shim; per-message try/except JSONDecodeError пережил рефактор (market_data_feed.py:142,241,340 — 3 цикла).
| **S016** | `exchange_simulator/metrics.py` — dead code | metrics.py (264) + test_exchange_metrics.py (131) удалены — сервер использует ws_metrics.WebSocketMetrics. | Low | VERIFIED R52: metrics.py отсутствует, ws_prometheus живой.
| **S017** | f-string в logger calls | R26b: `logger.X(f"...")` = 0 в src; attribution/competition удалены. Все lazy %-args. | Low | VERIFIED R52: 0 logger(f" — единственный grep-хит = .ruff_cache binary.
| **S018** | Hardcoded `localhost:8765` — 4 места | monitor.py → `SIGNAL_WS_URL` env; ApiClient.jsx → `import.meta.env.VITE_WS_*`. | Low | VERIFIED R52: все localhost:8765 — env-defaults (WS_URL/VITE_WS_EXCHANGE), не хардкод.
| **S019** | `.windsurf/` закоммичен в репо | Добавлен в .gitignore, убран из индекса. | — | VERIFIED R53: .windsurf/ в .gitignore:160.
| **S020** | `test_signal_engine_v2.cpp` 43KB god-test | R29: разрезан на 4 доменных файла (infra 10/indicators 12/engine 25/pressure_adaptive 13) + test_util.h/test_fixtures.h, CMake foreach. Behavior-preserving. | Low | VERIFIED R53: доменные тест-файлы на месте (test_v2_indicators, doctest_signal_engine, pressure_model).
| **S021** | `exchange_simulator/` вложенная структура + мусор | Nested pkg flattened (S084); logs/pycache — gitignored artifacts. | Low | VERIFIED R53: nested pkg отсутствует.
| **S022** | `WidgetSDK.jsx` console.log в default config | Строка внутри MOCK_CODE_SAMPLE — документация, не исполняемый код. N/A. | Low | VERIFIED R53: MOCK_CODE_SAMPLE — docs-строка, N/A.
| **S023** | `**kwargs` passthrough — 8 | 4 remaining — wrapper API где kwargs IS the contract. N/A. | Info | VERIFIED R53: kwargs = wrapper-контракт, N/A.
| **S024** | Root-level dev-скрипты на диске | Все 5 gitignored, локальные dev-tools. N/A. | Info | VERIFIED R53: dev-скрипты gitignored.
| **S025** | `.cascade/` раздут до 1.9MB | Удалены stale-доки, осталось 8 рабочих файлов. | — | VERIFIED R53: .cascade = 9 рабочих файлов (было 8 — +progress), stale-доков нет.
| **S026** | `JSON.parse(JSON.stringify(...))` deep-copy | `structuredClone(data.accounts)`. | Low | VERIFIED R52: 1 residue = test-serialization spy-assert (legit), prod-паттерн = structuredClone.
| **S027** | Старый typing `List[`/`Dict[`/`Tuple[` — 1121 | Dead-code раунды снесли тяжёлые файлы; code-level = 0; последний docstring List[Signal] в marketplace.py почищен. | Medium | VERIFIED R53: старого typing 0 (1 grep-хит = OrderedDict generic).
| **S028** | `or {}`/`or []` None-masking — 12 | R26b: корректная идиома optional-param default, маскировки багов нет. N/A. | Low | VERIFIED R53: or-{} = optional-param idiom.
| **S029** | `toBeTruthy()` — 15 в 4 файлах | → `length>0`/`toBeDefined`/`not.toBeNull()`/`toBeInTheDocument`. 0 осталось. | Low | ROTTED R52 → S127: toBeTruthy() вернулся (37 в 10 новых тестах) — исправлено на toBeInTheDocument, 33/33 green.
| **S030** | `console.*` не все IS_DEV-gated — 26 | R26: 11 `console.warn` → `if (IS_DEV)`; `console.error` в TopErrorBoundary/useWebSocket оставлены — реальные prod-ошибки. | Low | VERIFIED R53: 2 ungated console.error = задокументированные остатки (TopErrorBoundary/useWebSocket).
| **S031** | `0.0.0.0` binds — 9 в 8 файлах | run.py читает SIGNAL_WS_HOST/HEALTH_HOST/METRICS_HOST env (default 0.0.0.0 для контейнеров) — можно биндить 127.0.0.1 без правки кода. | Medium | VERIFIED R53: все 0.0.0.0 с # nosec + env-читатели.
| **S032** | `-> dict` без контрактов — 145 в 76 файлах | R28: TypedDict-контракты exchange_factory (TickerData/OrderbookData/AdapterHealth, 12 сайтов). R29: остаток 56 — все JSON wire payloads / гетерогенные exchange API; TypedDict для wire JSON = ceremony. Легитимно. | Medium | VERIFIED R53: TypedDict-контракты на месте (TickerData/OrderbookData, exchange_factory.py:29,37).
| **S033** | `time.sleep` в тестах — 7 | R26b: → детерминированный patch `time.monotonic` + явный старый datetime. 80/80 green. | Low | VERIFIED R52: time.sleep в тестах = 0.
| **S034** | `assert True`/`== True` — 3 | `assert client.connected`; `is True` ×2. | Low | VERIFIED R52: assert True/== True = 0.
| **S035** | ~70 math-панелей МЁРТВЫ: `candles[exchange][symbol]` на flat-массиве | R4: `utils/candles.js` (selectCandles/groupCandles), 61 файл автоконвертирован, 10 multi-symbol вручную. 0 остаточных `candles[exchange]`. | Critical | ✅ verified R48 VERIFIED R52: utils/candles.js на месте (selectCandles).
| **S036** | `utils/format.ts` терял exports при TS-миграции | colorForSide/bgColorForSide/formatPct возвращены; build green. | High | ✅ verified R48 VERIFIED R52: format.ts экспортирует formatPct/colorForSide (:18,:40).
| **S037** | `App.test.jsx` — полностью сломан | Пути исправлены, моки приведены к реальным сигнатурам store. | Medium | VERIFIED R52: App.test.jsx прогнан — 1/1 green.
| **S038** | 7 pre-existing failing тестов web-ui | format `-$500`; patterns wick `<= body*2`; auditExport Blob-mock убран; performanceMonitor initPerformanceMonitoring+INP; alertWebhook label. | Medium | VERIFIED R53: vitest suite green по R52-прогонам (10 файлов 33/33).
| **S039** | `patterns.ts` HAMMER/SHOOTING_STAR никогда не срабатывали | Порог `<= body*2` — канонический 2:1 wick:body. | High | ✅ verified R48 VERIFIED R52: wick<=body*2 порог на месте (patterns.ts:46,56).
| **S040** | `initPerformanceMonitoring()` мёртвая + FID устарел | FID→INP (web-vitals v6), DashboardProfiler инициализирует, PanelContainer оборачивает панели в `<Profiler>`. | High | ✅ verified R48 VERIFIED R52: initPerformanceMonitoring зовётся (DashboardProfiler:33), INP метрика (:66).
| **S041** | `Account.positions` list не map — `Object.entries` ломал символы | Ревью 14 сайтов: 0 entries-багов; 4 `Object.keys().length` → `positions?.length`. | High | ✅ verified R48 VERIFIED R52: Object.entries только на dict-shaped accounts/perExchange — entries-on-list паттерна нет.
| **S050** (was S042) | 2 failing теста ловили реальные баги | hmc: аналитический градиент приведён к objective; emd: endpoint-anchored knots. 138/138 green. | High |
| **S051** (was S043) | `deque` не поддерживает срезы — order history падал | `islice`-хвост / `list(...)`. 88/88 green в 5 файлах. | High | ✅ verified R48
| **S058** | `hft-executor` — мёртвый Rust-крейт (584 строки) | Крейт удалён (предварительно починен: bounded queue, send-time counting, FIFO latency, safe Drop — 26/26). Ссылки вычищены из ci/dependabot/scripts/docs. | High | ✅ verified R48
| **S059** | `SmartOrderRouterV2` собран, `route()` не вызывается | Удалён + 6 адаптеров + конфиг-секции. Живой adaptive_selector сохранён. | High | ✅ verified R48
| **S060** | `src/fix/` — мёртвый FIX-модуль (979 строк) | Удалён (4 header + 2 теста), `fix.enabled` убран из config — флага-обманки нет. | Medium | VERIFIED R53: src/fix/ отсутствует.
| **S061** | `persistence/mapped_persistence.h` — 371 строка, 0 ссылок | Удалён, persistence/ целиком. | Medium | VERIFIED R53: persistence/ отсутствует.
| **S062** | C++ бот открывал позиции на неотправленных ордерах | submit/close/execute_arb возвращают bool; open_position() только при send-успехе (3 сайта); SL/TP/kill-switch гейтятся отправкой. | Critical | ✅ verified R48
| **S063** | Rust `submit()` считал отправленным лежащее в очереди | До удаления: bounded mpsc(1024), orders_sent при send, FIFO in-flight. Затем крейт удалён (S058). | High | ✅ verified R48
| **S064** | Арбитражные ноги без хеджирования | unwind_buy_leg — MARKET-sell обратно при отказе sell-ноги; иначе spdlog::critical "NAKED LONG". | High | ✅ verified R48
| **S065** | v1 fallback генерил синтетический стакан молча | Warn той же строкой что v2 prepare_order_book. | Medium | VERIFIED R53: spdlog::warn "Generating synthetic order book" на обоих сайтах (bot_loop.cpp:91,223).
| **S066** | nightly-backtest — фейковый регрессионный гейт | Чек стал реальным: `sys.exit(1)` при avg_return<-5%/all-errored/>50% errors/empty → `if: failure()` достижим. `::warning::`→`::error::`. | High | ✅ verified R48
| **S067** | deploy health-check бьёт не в тот порт | `:9090`→`:9092/health`, `:3000`→`:3001/api/health`; VITE_WS_* → `${VAR:?required}`. | High | ✅ verified R48
| **S068** | Grafana prod: дашборды не провизионируются | dashboards → `/etc/grafana/provisioning/dashboards` + env на провиженный путь. | Medium | VERIFIED R53: dashboards → /etc/grafana/provisioning/dashboards + home-dashboard env (compose:209,215).
| **S069** | hft `:9091/metrics` JSON не Prom-формат | `format_prometheus()` — 13 метрик exposition, text/plain 0.0.4. | Medium | VERIFIED R53: format_prometheus() реализован (system_monitor.h:133), вызывается (health_server.h:134). — ✅ verified R85
| **S070** | CI-гейты не могут упасть | pipefail/$LASTEXITCODE вместо grep-театра; bandit HIGH-gate exit 1; floors под реальность. | Medium | VERIFIED R53: pipefail присутствует в ci.yml.
| **S071** | `.pre-commit-config.yaml` — мёртвый конфиг | .git/hooks/pre-commit → sh-версия; .pre-commit-config → local hook на тот же скрипт. | Medium | VERIFIED R53: .pre-commit-config.yaml на месте.
| **S072** | nginx cargo-культ headers на HTTP | Убраны X-XSS-Protection (deprecated) + HSTS (игнорится по HTTP); XFO/nosniff/Referrer/Permissions оставлены. | Low | VERIFIED R52: nginx.conf — X-XSS/HSTS отсутствуют.
| **S073** | dev compose `latest`-теги | Запинены на prod-версии: prometheus:v3.0.0, grafana:11.4.0. | Low | VERIFIED R52: prom/prometheus:v3.0.0, grafana:11.4.0 (compose:166,200).
| **S074** | `docs/REST_API.md` — ~15 фантомных endpoints | Переписан под реальную поверхность (health/metrics + список Not implemented → WS). | High | ✅ verified R48
| **S075** | README — фантомная арх-схема и фичи | Диаграмма без Rust FFI-хопа; bullets без SOR/FIX/mmap. | High | ✅ verified R48
| **S076** | README prod-порты + "13 strategies" + "8-stage pipeline" | "7 wired strategies", "signal loop", порты published vs internal, research/ml "not wired". | Medium | VERIFIED R53: 13-strategies/8-stage хитов в README нет (только в AUDIT_FINDINGS).
| **S077** | sim `price_feed_*` + `health.py` — мёртвые острова (1120 строк) | Удалены 4 модуля + 5 тестов; hybrid-ветка и price_feed конфиг-блок вырезаны. | Medium | VERIFIED R52: price_feed_*+health.py удалены, nested-пакет отсутствует.
| **S078** | ai-bot fix_client/notifier/socket_transport — ~1000 строк мёртвых | Удалены + 3 теста; пустые пакеты networking/, notification/ убраны. | High | VERIFIED R53: все 5 путей отсутствуют, 0 живых refs.
| **S079** | Два расходящихся helm-чарта | Канонический `helm/` сохранён; `deploy/helm/` удалён; helm-lint линтит один чарт. | Medium | VERIFIED R53: deploy/helm отсутствует.
| **S080** | `audit/` + `hft-skills/` — груз в репо | Неверно: обе UNTRACKED+gitignored — не repo weight. N/A. | Info | VERIFIED R53: audit/+hft-skills untracked+gitignored.
| **S081** | Sim: встречный ордер больше позиции — остаток испарялся | `_open_residual_position` при перелёте — остаток открывается с entry=filled_price + своей маржой + audit-событием. | Critical | ✅ verified R48
| **S082** | Sim: маржа не резервировалась — бесконечный левередж | `Position.margin` + `_lock_margin` дебетует notional/lev при fill; equity = balance+margin+uPnL. | High | ✅ verified R48
| **S083** | OCO-ордера мертвы | `oco_group_id` регистрируется, `_resolve_oco` на всех fill-путях, сибсы CANCELLED+purged; ws-handler форвардит advanced-параметры. | Medium | VERIFIED R52: _resolve_oco на fill-путях (adv_orders:116,215; order_submission:302).
| **S084** | `exchange_simulator/exchange_simulator/` nested + sys.path хак | 4 живых модуля в корень, sys.path/importlib-хак удалён. | Medium | VERIFIED R52: nested exchange_simulator/ удалён.
| **S085** | SL/TP: REJECTED переписывался в FILLED + воровал чужую trade_history | Убран безусловный `status=FILLED`; retag только при реальном FILLED. | High | ✅ verified R48
| **S086** | Вложенный пакет — 6 мёртвых модулей (1240 строк) | Удалены + 6 тест-файлов (liquidation_engine_v2, funding_rate, order_book_realism, microstructure, latency_sim, spread_analytics). | High | ✅ verified R48
| **S087** | `options_chain` endpoint есть, web-ui не вызывал | useExchangeData шлёт options_chain-запрос → store; OptionsChain рендерит серверный chain, клиентский BS — подписанный fallback. | Medium | VERIFIED R53: options_chain шлётся (useExchangeData.js:184) и обрабатывается (:133).
| **S088** | hft ~3300 строк мёртвых header'ов | Удалено + 17 тест-файлов + CMake-регистрации. order_type_selector.h оставлен (живой). | High | ✅ verified R48
| **S089** | Два бэктест-движка: панель клиентский, серверный не вызывался | Не дубликаты: панель=rule-builder, сервер=named strategies. Сервер принимает candles_data; панель получила server-секцию с ярлыками. | Medium | VERIFIED R52: candles_data принимается (backtest_requests.py:87).
| **S090** | `useStrategyMarketplace` — localStorage "маркетплейс" | Badge `local only` + tooltip — честная маркировка. | Medium | VERIFIED R53: local-only badge+tooltip (StrategyMarketplace.jsx:61) + тест ассертит.
| **S091** | App.jsx монтировал real+mock hooks безусловно | `autoConnect: !IS_MOCK` / `{enabled=IS_MOCK}` — таймеры и сокеты не стартуют в чужом режиме. | Low | VERIFIED R53: IS_MOCK-гейтинг в App.jsx:95-96,143.
| **S092** | `src/ml/` весь пакет мёртв (2848 строк, 10 модулей) | Удалён целиком + 11 тест-файлов. | High | ✅ verified R48
| **S093** | `backtesting/order_book_replay.py` — 262 строки мёртвы | Удалён + 3 теста + реэкспорт + стейл-глобы. | Medium | VERIFIED R53: order_book_replay.py отсутствует.
| **S094** | Advanced-ордера никогда не срабатывали | `check_advanced_orders()` wired в `_process_exchange_events` + оба цикла __main__; исполнители интегрированы с маржой. | High | ✅ verified R48
| **S095** | `src/research/` 34 модуля мёртвы (7578 строк) + TA 20/25 | Удалены + 52 тест-файла; оставлены indicators/fft_analysis/hawkes_funcs/hawkes_model. | High | ✅ verified R48
| **S096** | hft `market_data/` + ~1000 строк мёртвы | Удалены market_data/, symbol_map, simd_indicators + тесты. obi_utils/inline_indicators живы. | High | ✅ verified R48
| **S097** | `hybrid_mode: true` в config молча игнорировался | С S077: price_feed блок + hybrid параметры удалены — конфиг не врёт. | Medium | VERIFIED R53: hybrid-ключей в конфигах 0.
| **S098** | `_execute_arbitrage` не проверял rejection ног | Проверка статусов ДО close_opportunity/profit-лога; dead dumps удалены. | High | ✅ verified R48
| **S099** | 25 тестов ai-bot падали на master | 5 стейл-тестов под старые API + 3 РЕАЛЬНЫХ бага (real_account Exception vs OSError; _send не ловил ConnectionClosed → мёртвые клиенты; kelly min_risk vs notional-cap). 23 failed → 1368 passed. | Medium | VERIFIED R52: ConnectionClosed ловится (ws_client:167); kelly min_risk_pct+notional-cap (kelly.py:59,142).
| **S100** | 35 web-ui тестов ассертили фейковые данные | 8 файлов переписаны: no-feed панели ассертят NoDataFeed disclosure; liquidityMap3D — real-props тесты. Vitest 992 green. | Medium | VERIFIED R53: no-feed disclosure тесты на месте.
| **S101** | CI lint-джобы красные на master | ruff --fix + мёртвый scripts/pre-commit.py удалён; eslint codemod 257 сайтов + ~15 вручную; clang-format -i на 66. Все три: 0. | High | ✅ verified R48
| **S102** | `SimulatorAdapter` — чистый фейк | R28: реальный WS-клиент — recv-loop кэширует broadcast, place_order ждёт fill/error по FIFO-фьючерсам, cancel_order честно False. 14 тестов на FakeWs. | High | ✅ verified R48
| **S103** | Доки описывают удалённые пакеты — ~67 ссылок | R30+R29: surgical cleanup live-доков (DEPLOYMENT YAML, ARCHITECTURE, TESTING inventory, DEV_GUIDE); theory/ — banner; project_architecture_en — вычищен presents-as-current осадок. | Medium | VERIFIED R53: terraform-секция имеет disclaimer (DEPLOYMENT:49-51), presents-as-current осадка нет.
| **S104** | 4 пустых package-хаска + 68 stale .pyc + 2 dead-хука | Хаски удалены, dead-хуки git rm, README вычищен. | Low | VERIFIED R53: package-huskов нет (0-byte __init__ = нормальные маркеры живых пакетов).
| **S105** | C++ тесты красные — 8 фейлов, 2 настоящих бага | LatencyHistogram min/max до bucket early-return (sub-1μs терялись); SPSCQueue STORAGE=Capacity+1 (usable=Capacity). +3 stale-теста на prod-пути, +3 fixtures 60→70 candles. 60/60 + doctest 8/8. | High | ✅ verified R48
| **S106** | `betaCF`/`regIncompleteBeta` сломаны → неверные t-CDF и studentT tail dependence | Вынесено из CopulaModel в `utils/copulaMath.js` при сплите S015: `front` уже содержал `/a`, обе ветви `regIncompleteBeta` делили ещё раз → `I_x(a,b)` занижена в ~a раз (I_0.5(2,2)=0.81 вместо 0.5); `betaCF` — naive-рекурсия вместо Lentz → `tCDF(1,200)=0.50` вместо 0.84, `tCDF(2.015,5)=0.975` вместо 0.95. `fitCopula` считает studentT λ через это — tail-зависимость занижена в ~3 раза (0.062→0.184). Математика хвостов врала. Фикс: Lentz betacf (Numerical Recipes) + убрано двойное деление. Проверка: I_0.5(2,2)=0.5 с 14 знаками, tCDF(2.015,5)=0.95, tCDF(1,200)=0.8407≈normCDF(1). | High | ✅ verified R48
| **S001** | web-ui панели не подключены к бэкенду | Финальная верификация R34: все 271 registry-записи имеют `props:` ctx-мапы (0 starved); 5 'неиспользуемых' пропсов = `_`-алиасы (AlertWebhook `_fills`/`_toasts`, MarketDepthReplay `_orderbooks` — deliberate, eslint-конвенция); 9 prop-less компонентов все легитимны (NoDataFeed-disclosed / калькуляторы на user-input / 'local only' badge / чистый UI); `Math.random` — 27 файлов, все = алгоритмическая случайность (xavier init, Ogata thinning, IB cluster-init) на реальных `candles`. MOCK_* в компонентах: **0**. mock-инфра env-gated + MockModeBanner-disclosed. | **Critical** | ✅ verified R48
| **S003** | `MOCK_*` inline-данные — 378 вхождений в 50 компонентах | Переведено ~50 компонентов за раунды R4–R34; финальная проверка: `MOCK_`/`mockData`/`generateMock`/`dummy` в `src/components/` = **0** (остаток только в env-gated mock-инфре + тестах). Оценка '~17 остаток' устарела — реальных фабрикантов нет: prop-less панели либо NoDataFeed, либо disclosed local/demo, либо реальные калькуляторы. | **Critical** | ✅ verified R48
| **S110** | registry-панели с пустыми props-мапами — 2 реально starved | R34: проверка `props: () => ({})` (16 шт) — 14 легитимны (NoDataFeed/store-pull/калькуляторы/UI), но **2 голодных**: `NewsFeed` декларировал `{newsEvent}` при живом `ctx.exchange.newsEvent` (sim шлёт `news_event`, хук парсит) — навечно пустой; `BacktestComparison` ждал `externalResults`, которых никто не давал — вечный empty-state при существующих saved-backtests в localStorage. Fix: NewsFeed → `ctx.exchange.newsEvent`; BacktestComparison → читает `SAVED_KEY` + `saved-backtests-changed`/`storage`/`focus` listeners, delete/clear пишут в localStorage + dispatch (двусторонний sync с BacktestRunner — хук тоже слушает событие). +5 контракт-тестов. | **High** | ✅ verified R48
| **S111** | Протокол WS: `fills_batch` + `error` молча дропались UI | R35: сверка типов sim→UI — `fills_batch` (`ws_broadcast:288,383` — engine-филлы: SL/TP, ликвидации, arb-исполнения) и `error` (rate-limit/trading-stopped/bad-fields, 5+ точек в `ws_message_handler`) не имели `case` в `useExchangeData` → `default: break`. Пользовательские fills шли, engine-филлы терялись; отказы ордеров невидимы. Fix: `fills_batch` → prepend в `fills` (fill-toasts в useNotifications заработали сами); `error` → `lastError` через store → toast. +3 контракт-теста. | **High** | ✅ verified R48
| **S118** | 162 stale .pyc bytecode-файла удалённых модулей/тестов | R36b: `__pycache__` живых пакетов содержал bytecode мёртвого кода — `portfolio_optimizer`, `fix_client`, `real_exchange_client`, `order_book_replay`, `ws_connection_pool`, `bayesian_*`, `copula`, `dtw`, `hawkes`... + ~60 orphan test-`pyc` (test_fix_client, test_ml_modules, test_research_modules...). S104 чистил только целые husk-директории — пропустил рассыпанный residue. Fix: полная purge `__pycache__` (регенерируется). Untracked → inert, но шум + обманчивые grep-хиты. | Low | VERIFIED R52: orphan .pyc — 3 инертных residue (untracked), purge держится.
| **S109** | Dead persistence layer — postgres/redis/migrations/terraform | R37: пользователь исполнил wire+delete — `db.py` переписан на SQLite (WAL, индексы), `run.py` сохраняет signals/trades/equity; удалены postgres+redis сервисы, migrate.py, 4 миграции, helm postgres/redis/secret, terraform RDS+ElastiCache. Verified: `config.db_path`←`settings.yaml:151`; testnet.yaml — fragment не config. R37 residual fix: `save_equity` подключён к тик-циклу (`_snapshot_equity`); `close_trade` — schema-ahead-of-writer (бот не видит sim-side закрытия) — задокументировано. | Medium | ✅ verified R41
| **S116** | WS auth handshake недостижим (publisher + health server) | R40: `signal_publisher._auth_token` всегда "" — run.py не передавал, settings.yaml не имел ключа, UI не слал auth. Плюс `HealthServer.auth_token` Bearer-middleware тем же классом. Wired e2e: `api.auth_token` в settings.yaml + `AI_BOT_AUTH_TOKEN` env → `config.api_auth_token` (config/__init__.py:350) → `SignalPublisher(auth_token=)` (run.py:87) + `HealthServer(auth_token=)` (run.py:174); UI: `VITE_SIGNAL_TOKEN` → `useWebSocket authToken` шлёт `{type:"auth"}` первым фреймом до subscribe (useWebSocket.ts:150), `authState` pending/ok/failed в useSignalData; пост-хендшейк `auth` → `auth_ok{required}` (signal_publisher.py:182). HealthServer: `/live`+`/ready` exempt от Bearer — kubelet-пробы без креденшелов (health_server.py:152). Бонус той же файловой зоны: `register_check("liveness"/"readiness")` регистрировал имена, которые `_check_all` никогда не запрашивал (он дёргает exchange/database/shm) — мёртвая регистрация → теперь `check_component_health` адаптер (health_checks.py:183) + регистрации под реальные имена (run.py:172-183); helm-пробы бьют в MetricsExporter:9090/health — незатронуты. +8 тестов (test_auth_wiring). | Low | VERIFIED R53: auth e2e — api.auth_token→config→publisher+health; UI authToken первым фреймом; probes exempt. +8 тестов green в R40.
| **S117** | Мёртвые модули `portfolio/` (4) + `pricing/` (1) | R40: 0 live-импортеров, только свои тесты. Wired через WS API: новый `communication/portfolio_requests.py` — `optimize_portfolio` (max_sharpe/min_variance/risk_parity/black_litterman по клиентским candles_data; RC-проценты для risk_parity; views для BL; current_weights+portfolio_value → RebalancingStrategy orders) + `vol_surface` (SVI/SABR калибровка по points[{strike,maturity_days,iv}]) — диспетч в signal_publisher.py:197-204. UI: `PortfolioOptLab` переписан — method picker + asset select + rebalance-toggle (веса из реальных позиций/price-фида), рендерит weights/метрики/RC/orders; `VolSurface` — секция "IV Smile Fit": options_chain → points → SVI-фит (disclosed: sim-чейн flat-σ). +21 backend-тест, +6 vitest. | Medium | VERIFIED R53: portfolio_requests.py dispatch (signal_publisher:197-204); PortfolioOptLab/VolSurface реальные консьюмеры. +21 backend +6 vitest в R40.
| **S121** | ARCHITECTURE.md — фантомный инвентарь | R39b: таблица HFT V2 описывала 6 несуществующих подсистем (Momentum/MM/StatArb V2, SOR V2, PreTradeRisk, PortfolioRisk) + 12 фантомных хедера + /hft_heartbeat сегмент; sim-таблица — fiction-фичи (multi-API feeds, Heston/Merton, spoofing detection); ai-bot/web-ui — стейл-ссылки. Исправлено на реальный инвентарь. Fold-in: мёртвый `MetricsServer` класс удалён (collector оставлен как fallback-sink). | Medium | ✅ verified R41
| **S122** | `docker-smoke-test.{sh,bat}` мёртвый + стейл-порты | R43: скрипт curl-ил WS-порты 8765/8766 без HTTP → всегда "failed" на здоровом стеке; 0 refs (ci.yml инлайнит свой smoke с верными портами). Fix: 8775/9090/3000-health как в compose healthchecks, summary печатает ws://. | Medium | VERIFIED R53: порты 8775/9090 как в compose healthchecks.
| **S123** | Одноразовые codemod-скрипты | R43: `fix_eslint_unused.py` + `fix_fstring_logs.py` удалены — отработавшие миграции S101, refs только в аудит-логах. | Low | VERIFIED R53: codemod-скрипты отсутствуют.
| **S124** | `monitoring/tests/` — 23 теста на удалённый код | R46: `test_metrics.py` spec-грузил удалённые `ai-signal-bot/metrics.py`+`exchange_simulator/metrics.py` (классы мертвы с S016) — удалён вместе с `conftest.py`; `test_alerts.py` читал пустой `monitoring/alerts/alerts.yml` — repointed на живой `monitoring/alerts.yml`, group-имена обновлены под реальную схему (ai-signal-bot/exchange-simulator/hft-trade-bot/system/websocket). 10 passed. | Medium | VERIFIED R53: test_metrics+conftest удалены; test_alerts repointed — 10 green.
| **S125** | ai-bot dead-module cluster — 11 модулей ~1900 строк | R49: zero-importer sweep нашёл острова — shm_* (4 файла, задуманный hft↔bot SHM-канал, run.py не инстанцировал), alerting.py, risk/{cvar,position_sizing,stress_test} (только __init__-реэкспорт), funding_arb_detector, technical_analysis/{hawkes_funcs,hawkes_model}. R50 user решение: **wire all**. Wired: (a) новый `communication/analysis_requests.py` — 5 WS endpoints: `cvar_analysis` (cvar.py: VaR/CVaR+tail+stressed scenarios), `stress_test` (stress_test.py: 2008/COVID/FTX+custom), `position_size` (position_sizing.py: volatility/risk_parity/kelly), `hawkes_fit` (hawkes_funcs.py: MLE+intensity path; hawkes_model.py живёт через него), `funding_arb_scan` (funding_arb_detector.py; fallback на live-фид через `publisher.data_source`); диспетч signal_publisher.py:184-229. (b) SHM-канал в run.py: `_start_shm_channel` (run.py:270) — producer/writer/consumer за `shm.enabled`; signal→ring в `_finalize_and_execute` (run.py:469); market snapshots в `_generate_signals` (run.py:417); fills→db+csv через `_on_shm_fills` (run.py:308). Фикс бага: `push_signal_dict` молча пушил unix-секунды как ns → нормализация (shm_signal_producer.py:71). (c) AlertSystem в run.py за `alerting.enabled` — 4 дефолт-правила (daily_loss по equity-dd, no_fills по uptime, shm_disconnected по ring-full, db_down по sqlite-пробу) + каналы из env (run.py:340). (d) ws_client: `sync_state` теперь обрабатывается + хранит funding_rates/candles_to_funding (ws_client.py:172). Config: `shm:`+`alerting:` секции в settings.yaml + 11 properties. +30 тестов (test_analysis_requests 21 + test_shm_alerting_wiring 15 — incl. реальные WS round-trips). Полный suite: 1519 green. | **High** | VERIFIED R52: 5 endpoints dispatched (signal_publisher:217-230); shm/alerting wired behind flags (run.py:181-186); sync_state+funding (ws_client:182-198); 5 панелей send+consume (registry:408-681); results routed (useExchangeData:304-316). — ✅ verified R85
| **S126** | web-ui dead-residue — 6 файлов без импортеров | R49: ExchangeSelector.jsx (не в registry), useInterval.{js,ts} оба твина, usePerformance.js, auditExport.js, cn.js — все test-only. R50 user решение: **keep all** — utility-library intent (публичный API компонентов/хуков). Оставлено как есть; нахождение закрыто без изменений кода, импортеры остаются тестами. | Medium | VERIFIED R52: keep-решение — файлы на месте, нахождение закрыто как intentional.
| **S127** | `toBeTruthy()` регрессия — 37 сайтов в 10 тестах | R52: S029 rot — новые тесты вернули паттерн (getBy*+toBeTruthy redundant, firstChild+toBeTruthy weak). Fix: все 37 → `toBeInTheDocument` (конвенция проекта). 33/33 vitest green. | Low | [x] Done ✅vR52 |
| **S128** | `.env.example` — 7 мёртвых env-флагов | R54: `VITE_DEFAULT_EXCHANGE/SYMBOL/TIMEFRAME` + 4 `VITE_ENABLE_*` — 0 читателей в src, файл утверждал «flags control visibility». Fix: блоки Default Settings + Feature Flags удалены (web-ui/.env.example). | Low | [x] Done |
| **S129** | registry→component props drift — 35 dead keys в 22 панелях | R54: registry слал пропсы, которые компоненты не деструктурируют (FillAnalytics/TCA/Inventory/RealtimeAttribution по 3-4 ключа, title-флаги оказались nested-payload FP). Fix: 35 ключей вырезаны из props-функций — меньше selector-работы, контракт = сигнатуре. Полный vitest: 1112 green. | Low | [x] Done |
| **S130** | Reverse props drift — 3 панели старвятся registry | R55: (a) BacktestRunner — «Run Backtest» всегда «WebSocket not connected» (sendSignalMessage/backtestResult не слались; connected смотрел на exchange-сокет вместо signals). Wired: `sendSignalMessage`+`backtestResult` из signals, `connected`→`ctx.signals.connected`. (b) PerformanceDashboard — `buildEquityCurve(undefined)` рисовал фейковую плоскую кривую 10k, signal-статы вечные нули. Wired: `fills`+`signals`. (c) IndicatorBuilder — compute-pipeline умирал в `onIndicatorsChange?.()`. User решение: **wire to chart overlay** — `useUIStore.customIndicators` + `setCustomIndicators` → ctx → панель → `CandleChart` рендерит line-series overlay per indicator line (add/remove по diff). +5 тестов (CandleChart 3 + useUIStore 2) + registry contract-тест. Vitest touched-area: 20+3 green. | **Medium** | [x] Done |
| **S131** | Grafana-дашборды запрашивали ~29 несуществующих метрик | R56 fix (user решение: **extend emitters**): (a) **hft-trade-bot** — `SystemMonitor` получил runtime-gauges + prom-histogram блок: `hft_active_positions` (pos_mgr), `hft_pnl_unrealized`+`hft_pnl_total` (новый `PositionManager::total_realized_pnl` аккумулятор в close_position), `hft_memory_usage_mb` (process_memory_mb: psapi/Win + /proc/self/status POSIX), `hft_shm_{signal,order,fill}_queue_depth` (consumer.pending/ai_signal_queue.size/producer.pending), `hft_latency_us_bucket{le}` реальные cumulative-ведра из `LatencyHistogram::snapshot_buckets` (+`sum_us` atomic) — всё подпитывается из `print_status` каждые 10с. (b) **ai-signal-bot** — новые gauges `ai_signal_bot_{cpu_usage_percent,memory_usage_bytes,sharpe_ratio}`; cpu/rss сэмплируются на scrape через `resource.getrusage` (`_refresh_process_metrics` в _metrics_handler), sharpe = mean/std доходностей equity-кривой из нового `db.get_equity_history` (в `_snapshot_equity`, run.py:570). (c) **exchange_simulator** — `LatencyHistogram` (le-buckets) в ws_metrics + инструментация: `errors_total`/`price_updates_total`/`ws_latency` в _process_message, `order_latency` в _handle_order, `feed_latency`+price_updates в _broadcast_loop; emit в ws_prometheus + process-метрики. (d) Dashboard-repoint (неэмилируемое имя → реальный эквивалент): `exchange_simulator_active_connections→exchange_connected_clients`, `orders_total→orders_submitted_total`, `fills_total→orders_filled_total`, `pnl_daily→trading_daily_pnl`, `portfolio_value→trading_total_equity`, `position_count→trading_open_positions`, `trades_total→trading_fills_total`, `signals_generated→trading_signals_total`, `model_accuracy→win_rate`, `signal_generation_latency→trading_signal_latency_seconds_bucket`, `hft_signals_total{strategy=...}×5` → единый `hft_signals_received_total` (SignalMsg не несёт strategy — panel «by Strategy» была недостижимой). Panel-titles поправлены (Signal Win Rate / Total Equity). Верификация: все dashboard-expr резолвятся в эмитимые имена (0 dangling); +6 py-tests +7 doctest (31/31 + 22/22 green); pre-commit gate 7/7 ALL GREEN. | **Medium** | [x] Done |
| **S132** | Kill-switch SHM канал write-only end-to-end | R56 audit+fix: `KillSwitchMsg` — C++ пушил в `/hft_kill_switch` (kill_switch.h:88-94), ни один consumer не читал; ai-bot `record_kill_switch`/`trading_kill_switch_active` имели 0 продакшн-вызовов. Wired e2e: `shm_kill_switch_consumer.py` (KILL_SWITCH_STRUCT `<Q B B 6x` 16B, REASON_NAMES по enum), polling-task в `_start_shm_channel` (run.py:289), `_on_kill_switch` → latch `_hft_kill_active` + `record_kill_switch(name)` + log.critical; CRITICAL alert-rule `hft_kill_switch` (60s cooldown); `_finalize_and_execute` больше не пушит сигналы в убитый hft; config `shm.kill_switch_name` (settings.yaml:172, config/__init__.py:383). +9 тестов (consumer 6 + wiring 3). Gate 7/7. | **Medium** | [x] Done |
| **S133** | 5 WS message-типов отправлялись, но не были задокументированы | R56 audit doc-vs-wire: sim/bot шлют `audit_logs`, `circuit_breaker_status`, `replay_candles`, `replay_state`, `speed_set` — отсутствовали в WEBSOCKET_PROTOCOL.md. R57 fix (docs-only): добавлены секции — `speed_set` (direct ack к `set_speed`, ws_message_handler.py:331), `replay_state` paused:true/false (:342-348), `replay_candles` {candles,offset,timestamp} (:353-357), `audit_logs` {logs:[AuditLog.to_dict] — полный набор полей incl. metadata/session_id} (ws_broadcast.py:237-239), `circuit_breaker_status` {state,consecutive_failures/successes,total_trips/blocks,failure_threshold,cooldown_seconds,timestamp} (circuit_breaker.py:137-147 + publisher timestamp). +6 строк в Message Type Summary (вкл. `replay` C→S row). Post-scan: все 41 sent-типа задокументированы, JSON-примеры валидны. | Low | [x] Done |
| **S134** | HealthServer :8080 недостижим из deploy-конфигов — все пробы били в stub | R57 audit compose/helm: ai-bot HealthServer :8080 (detailed /health/* + /live + /ready, auth-exempt для kubelet) — 0 refs в helm/compose; probes/healthcheck били в MetricsExporter :9090 `/health` stub `{"status":"ok"}`. Fix: helm liveness→`/live`, readiness→`/ready` на новом `aiSignalBot.ports.health:8080` + service-port; docker-compose{.yml,.prod,.staging,.hub}: publish `8080` + healthcheck→`localhost:8080/ready` (503 при деградации exchange/db — реальная проверка вместо stub). | **Medium** | [x] Done |
| **S135** | `docker-compose.yml` инжектил 4 мёртвых VITE_ENABLE_* | R57: build-args 137-140 повторяли флаги из S128 (0 читателей в web-ui/src). Удалены; prod/staging/hub были чисты. | Low | [x] Done |
| **S136** | `shared_config.yaml` + `test_config_consistency.py` — мёртвая пара | R58: shared_config монтировался в 3 compose-контейнера, 0 prod-читателей; единственный consumer `test_config_consistency.py` не в CI, падал cp1251 (S108-класс), FAIL на `price_feed` секции удалённой в S097. Fix: mounts удалены (docker-compose.yml ×3); скрипт: utf-8 reconfigure + stale price_feed-check заменён audit-check; wired в pre-commit-check (`config: consistency` — staged config или non-lint режим). 5/5 green. | **Medium** | [x] Done |
| **S137** | deploy.yml бил в несуществующий `api/health` + stub `9092/health` | R58: post-deploy loop — `3000/api/health` → SPA fallback 200 (не может упасть), `9092/health` → MetricsExporter stub. Fix: `8080/ready` (ai-bot real checks) + `3000/health` (web-ui nginx real); grafana `3001/api/health` — настоящий, оставлен. Частичный FP: prod-compose `/api/health` — это grafana service, реальный endpoint. | **Medium** | [x] Done |
| **S138** | Дупликат `load_test_50_symbols.py` | R58: `scripts/` копия — 0 refs, pytest collects 0, разошлась с tests/ версией (та в TESTING.md). Удалена. | Low | [x] Done |
| **S139** | Makefile `ci-test`/`ci-quick` → удалённый `ci-test.sh` | R59: Makefile звали `./ci-test.sh` — удалён в c7025b7. Fix: repointed на `pre-commit-check.py --all/--quick` (канонический gate). | Low | [x] Done |
| **S140** | `cachetools` — declared-but-unimported | R59: `exchange_simulator/requirements.txt` — 0 импортов repo-wide. Pin удалён. | Low | [x] Done |

## Раунды R31–R60 (перенесено с доски при чистке R60)

| ID | Находка | Детали / как закрыто | Приоритет | Раунд |
|----|---------|----------------------|-----------|-------|
| **S014** | God-файлы Python (верхушка) | R31: `strategies.py` 515→4 модуля + shim (96 тестов green); `real_market_data.py` 551→3 модуля + shim (1381 green); `backtester.py` 23KB→14.8KB (results/metrics/report вынесены); rl_trader/fix_client удалены. Финал R32: `signal_publisher.py` 496→307 — backtest-запросы (~220 строк: parse/clamp, client-candles, synthetic GBM gen, risk-config, strategy build, run/compare — все self-free) → `communication/backtest_requests.py`; паблишер = только WS-lifecycle/auth/broadcast. `engine.py` 440→266 — `SecretStr`+3 датакласса → `llm_types.py`, `_parse_response`+3 rule-based фолбэка → `rule_based.py`. 24+18 новых контракт-тестов green. | Low | R31 |
| **S015** | God-компоненты web-ui | R31: `PerformanceDashboard.jsx` 522→166 (performanceReport.js + PerfAreaChart.jsx + ExchangeBreakdown/StreakPanel/RiskMetricsPanel — exSortMode-стейт уехал внутрь секции); `BacktestRunner.jsx` 785→519 (backtest/ подкомпоненты + useSavedBacktests/useBacktestChart); `App.jsx` →394 (4 хука). Финал R32: `CopulaModel.jsx` 498→311 — копула-математика (15 ф-ций) → `utils/copulaMath.js`; `EmpiricalDynamicModeling.jsx` 455→265 — EDM-математика → `utils/edmMath.js`. 27 контракт-тестов на math-либы — всплыл баг S105. | Low | R31 |
| **S107** | Метрики ai-signal-bot писались в пустоту + мёртвый exporter | `signal_publisher` кормил `MetricsCollector`, но `MetricsServer` (единственный вызывающий `.render()`) нигде не стартовал в prod — счётчики умирали в памяти. Параллельно `MetricsExporter` (prometheus_client, :9090 — порт helm) стартовал в run.py, но из ~15 alert-методов был подключён только `record_ws_reconnect`: `signals_sent_total`/`signals_blocked_total`/`circuit_breaker_state`/`ws_clients_connected` вечно нули — Prometheus/Grafana видел замершего бота при живых сигналах. Два стека с идентичными именами серий. R33 fix: `record_backtest` добавлен в exporter; `start_server` → `bool`; run.py подменяет `signal_publisher.metrics` на exporter когда сервер реально поднялся. 80 тестов green. | **High** | R33 |
| **S108** | Dev-скрипты падают на cp1251 | `scripts/ci-equivalence.py` и `scripts/health-check.py` падают с `UnicodeEncodeError` на Windows-консоли без `PYTHONIOENCODING=utf-8` — box-drawing/emoji в `print()` (✅❌─═). R33 fix: `sys.stdout.reconfigure(utf-8, errors=replace)` в main() обоих; `health-check` теперь отрабатывает (score 52/100). | Low | R33 |
| **S111** | CompetitionFramework — фейковый турнир | "Run Tournament" роллил кубики: `elo: 1000+rand(-100,100)`, `sharpe: rand(-0.5,2.5)` по 6 стратегиям, 4 из которых не существуют на бэкенде; результаты сохранялись в localStorage как настоящие. R35 fix: переписан на реальный `run_backtest` WS API — per-strategy запросы с `candles_data` (реальные свечи до 1000), корреляция ответов по echo `strategy`, ELO поверх реальных Sharpe, `data_source` disclosure, таймаут 60с, NoDataFeed когда signal-канал down. +4 контракт-теста. | **High** | R35 ✅v41 |
| **S112** | AuditLogViewer навечно пустой | `registry.js` передавал `auditLogs: []` константой при живом `AuditLogger` с `register_callback` — ни один prod-код не регистрировал callback, по WS аудит не шёл. R35 fix end-to-end: `start()` регистрирует `_on_audit_event` после успешного bind → bounded deque(maxlen=500) → `_broadcast_audit_events` в тике broadcast-loop шлёт `{type:'audit_logs',logs:[to_dict]}` → `useExchangeData` кейс (bounded 200) → store → ctx → панель. Callback unregister в finally при shutdown. +8 бэкенд-тестов, +5 фронт-тестов. | **High** | R35 ✅v41 |
| **S113** | WS-сервер симулятора не стартовал вообще | `await self._shutdown_event` (2 сайта: start():~191, _run_metrics_server:~237) — `asyncio.Event` не awaitable → TypeError сразу после bind порта. Заменил рабочий `await asyncio.Future()` в f807082 "Reliability Plan" — crash-on-startup, ни один тест не вызывал `start()`. R35 fix: `.wait()` + регистрация audit-callback после bind + metrics_task внутрь `async with` (иначе сирота при serve-фейле) + unregister в finally + идемпотентный `register_callback`. Регрессионный тест `test_start_registers_and_shutdown_unregisters` воспроизводит крах. | **Critical** | R35 ✅v41 |
| **S114** | `audit:` секция config.yaml мёртвая | 5 ключей (`enabled/max_memory_entries/log_file_path/enable_file_logging/enable_callbacks`) никто не читал — `get_audit_logger()` хардкодил дефолты. R35 fix: `AuditLogger(enabled=)` + `__main__.main()` зовёт `set_audit_logger(AuditLogger(**cfg))` до `build_exchanges` (биржи биндятся к singleton в `__init__`). `enabled:false` → `log()` no-op, проверено. | Medium | R35 |
| **S115** | WS-протокол: fills_batch + error молча дропались | `useExchangeData` `default: break` съедал `fills_batch` (движковые филлы — SL/TP, ликвидации, арб-исполнения из `ws_broadcast`) и `error` (5+ rejection-сайтов) — юзерские филлы приходили, движковые пропадали, отказы невидимы. R35b fix (parallel): `fills_batch` → prepend в `fills` (fill-toasts теперь для движковых тоже); `error` → `lastError` → store → `useNotifications` toast. +3 контракт-теста. | **High** | R35 |
| **S116** | WS auth handshake недостижим с обеих сторон | `SignalPublisher._auth_token` всегда "" (run.py не передавал, settings.yaml не имел ключа, UI не слал auth); `HealthServer.auth_token` Bearer-middleware тем же классом. R40 wire e2e: `api.auth_token` + `AI_BOT_AUTH_TOKEN` env → `config.api_auth_token` → `SignalPublisher(auth_token=)` + `HealthServer(auth_token=)`; UI `VITE_SIGNAL_TOKEN` → `useWebSocket` шлёт `{type:"auth"}` первым фреймом до subscribe, `authState` pending/ok/failed в `useSignalData`; health `/live`+`/ready` exempt от Bearer — kubelet-пробы не сломаны. Попутно: `register_check("liveness"/"readiness")` регистрировал имена, которые `_check_all` никогда не дёргал — переведено на `check_component_health` под реальные имена (exchange/database/shm). +8 backend-тестов, +1 vitest. | Low | R40 |
| **S117** | `portfolio/` (4 модуля) + `pricing/volatility_surface.py` мёртвы | 0 prod-импортеров, только собственные тесты; PortfolioOptLab честно дисклеймил отсутствие фида. R40 wire через WS API: `communication/portfolio_requests.py` — `optimize_portfolio` (max_sharpe/min_variance/risk_parity/black_litterman по клиентским candles_data; RC% для RP, views для BL, current_weights+portfolio_value → rebalance-orders) + `vol_surface` (SVI/SABR-калибровка по points[{strike,maturity_days,iv}]). UI: PortfolioOptLab переписан под реальный запрос (method picker, asset select, rebalance из живых позиций, weights/метрики/RC/orders); VolSurface — секция IV Smile Fit поверх `options_chain` (disclosed flat-σ). +21 backend-тест, +6 vitest. | Medium | R40 |
| **S119** | Обе options-панели crash-on-render + битая математика | `OptionsPricing.jsx`+`OptionsStrategies.jsx` — полностью мёртвые панели (ловил только PanelErrorBoundary). 4 бага: `Math.erf` не существует в JS → TypeError при первом рендере (оба файла) → fix на shared `erf` из copulaMath; `Math.pi` (undefined, надо `Math.PI`) → pdf=NaN → gamma/vega/theta=NaN при живых delta/price; TDZ `const callPrice = callPrice(K)` → ReferenceError в straddle (дефолт!) и strangle; iron condor: знак премии инвертирован (long−short → «Max Profit» отрицательный) + break-evens на long-страйках 90/110 вместо short 95/105. Плюс convention drift: theta per-year у панели vs per-day у OptionsSimulator/OptionsChain — приведено к per-day + лейбл. R38 fix всё; +8 контракт-тестов на BS-значения. | **High** | R38 ✅v41 |
| **S120** | Мёртвые config-ключи в settings.yaml | 9 ключей без читателей. Удалены: `trading.timeframe` (сим шлёт свечи сам), `risk.stop_loss_pct`/`take_profit_pct` (SL/TP ATR-стратегические, sizing от `signal.stop_loss`), `indicators.macd_*` (сам `macd()` нигде не вызывается — валидатор даже проверял `macd_fast < macd_slow` на мёртвых ключах). Заведены: `rsi_period`→MeanReversion (параметр был, не передавался), `atr_period`→FFTCycle+MeanReversion (hardcode `atr(candles,14)`), `rsi/adx_period`→LLM-контекст. Параллельно user завёл `network.*` timeouts→ExchangeClient/Factory/RealAccount, `metrics.*`→MetricsExporter, `strategies.*` тюнабли→Config-даклассы — тот же класс находки, в одном коммите `40fb2be`. | Medium | — ✅v41 |
| **S121** | ARCHITECTURE.md описывал систему больше реальной | «Живой» арх-документ содержал выдуманную поверхность: таблица V2 Subsystems — 6 фантомных подсистем с нулём файлов (MomentumBreakout/MarketMaking/StatArb/SmartOrderRouterV2/PreTradeRisk/PortfolioRisk), 12 фантомных хедеров в инвентаре (`order_manager.h`, `latency_tracker.h`, весь `src/market_data/`, `*_v2.h` стратегии), фантомный SHM-сегмент `/hft_heartbeat`, «27 doctest файлов» (реально 13). Симулятор: «multi-API real-time price feeds», «Heston/Merton/Markov microstructure», «latency simulation», «spoofing/queue/adverse selection», «spread analytics» — всё фикция (движок = seeded GBM, книга = exp-decay + rng). Бот: `strategies.py`/`fft_strategy.py`/`order_book_replay.py`/`fix_client.py`/`health_check.py:9092`. Web-ui: `.js` ссылки на `.ts`-файлы. Всё исправлено на реальный инвентарь (R39b). Попутно удалён `MetricsServer` — рабочий HTTP /metrics сервер без единого вызова `start()` (реальный стек = MetricsExporter из S107; `MetricsCollector` оставлен как fallback-синк). | Medium | R39 |
| **S122** | `docker-smoke-test.{sh,bat}` — мёртвый И стейл | 0 refs: ci.yml имеет свой inline docker-smoke с ПРАВИЛЬНЫМИ портами (8775/9090/9091/3000 — совпадает с compose healthchecks), а скрипт curl-ит `http://localhost:8765/health` + `:8766/health` — чистые WS-порты, HTTP /health там нет (health живёт на port+10=8775 и :9090). На здоровом стеке всегда "failed health check" → отправляет дебажить не то. `.bat`-твин те же порты. R43 fix: порты приведены к CI/compose (8775/9090), web-ui → /health, summary печатает ws:// URL. | Medium | R43 |
| **S123** | Одноразовые codemod-скрипты забыты | `scripts/fix_eslint_unused.py` + `scripts/fix_fstring_logs.py` — одноразовые миграции из S101 (eslint codemod 257 сайтов), единственные "refs" — упоминания в AUDIT_FINDINGS. Отработали и остались лежать. Тот же класс что S104 dead-хуки. R43: удалены. | Low | R43 |
| **S124** | `monitoring/tests/` — 23 теста на удалённый код | Все фейлят на импорте/фикстурах: `test_metrics.py` грузит `ai-signal-bot/metrics.py` + `exchange_simulator/metrics.py` через spec_from_file — оба файла удалены (S016 commit 024ce07 «file existed only for its own test», e983fdf), классы `ExchangeSimulatorMetrics`/`AISignalBotMetrics` нигде не существуют (реальный стек = `src/monitoring/metrics.py:MetricsExporter` + `ws_prometheus.py`, свои тесты в ai-signal-bot/tests). `test_alerts.py` читает `monitoring/alerts/alerts.yml` — директория пустая, реальный файл `monitoring/alerts.yml` имеет другие group-имена (ai-signal-bot/exchange-simulator/... vs ожидаемые latency_alerts/trading_alerts). CI их не запускает — мёртвый suite, только repo-wide pytest его видит. R46 fix: `test_metrics.py` + `conftest.py` (prometheus-fixture служила только им) удалены; `test_alerts.py` repointed на `monitoring/alerts.yml` с реальными group-именами — 10 тестов green. | Medium | R46 |
| **S125** | ai-bot dead-module cluster — ~1900 строк test-only | Zero-importer sweep: shm_* остров (4 файла — SHM-канал hft↔bot, run.py не инстанцировал), alerting.py, risk/{cvar,position_sizing,stress_test} (только __init__-реэкспорт), funding_arb_detector, hawkes_{funcs,model}. R50 **wired all**: `analysis_requests.py` — 5 WS endpoints (cvar_analysis/stress_test/position_size/hawkes_fit/funding_arb_scan) через signal_publisher; SHM-канал за `shm.enabled` в run.py (signals→ring, market→slots, fills→db+csv); AlertSystem за `alerting.enabled` (4 ops-правила, env-каналы); ws_client хранит funding_rates (sync_state). UI: HawkesProcess/ConditionalValueAtRisk/PositionSizeOptimizer/FundingRateHistory/RiskDashboard получили backend-кнопки через sendSignalMessage. Баг: push_signal_dict секунды→ns. +30 backend-тестов, suite 1519 green. | **High** | R50 | — ✅ verified R85
| **S126** | web-ui dead residue — ~6 файлов + тесты | Zero-importer sweep web-ui/src: ExchangeSelector.jsx (не в registry), useInterval.{js,ts} оба твина, usePerformance.js, auditExport.js, cn.js — test-only. R50 решение: **keep** — utility-library intent, закрыто без изменений. | Medium | R50 |
| **S127** | `toBeTruthy()` регрессия — 37 сайтов в 10 тестах | R52 verify: S029 claim «0 осталось» сгнил — новые тесты (RiskMetricsPanel 10, StreakPanel 6, competitionFramework 4, ExchangeBreakdown 4, BacktestComparison 3, BacktestRunner 2, ComparisonChart 2, CopulaModel 2, perfAreaChart 1, performanceDashboard 3) вернули паттерн. `expect(getBy*(...)).toBeTruthy()` — redundant (getBy* сам бросает); `expect(container.firstChild).toBeTruthy()` — слабый. Конвенция = `toBeInTheDocument` (600+ сайтов). | Low | R52 |
| **S128** | `.env.example` — 7 мёртвых env-флагов | R54: `VITE_DEFAULT_EXCHANGE/SYMBOL/TIMEFRAME` + `VITE_ENABLE_ADVANCED_ORDERS/AUDIT_LOGS/EXCHANGE_CLONES/SYMBOL_SEARCH` — 0 читателей в src; файл утверждает «Feature flags control visibility» — stale config docs (S120-класс, на env-поверхности). | Low | R54 |
| **S129** | registry→component props drift — 27 сайтов | R54: registry шлёт пропсы, которые компоненты не деструктурируют: FillAnalytics(candles,exchange,symbol), TCA(4), Inventory(3), RealtimeAttribution(3), SignalTracker(candles,fills), TickReplay(candles,exchange), MLInsights(candles,symbol), InterExchangeSpread(exchange), FundingRateHistory(exchange,symbol), Auth/ChartTemplates/FeatureFlags/TaxReport/ThemeSwitcher(title) и др. — мёртвая selector-работа + вводящий в заблуждение контракт. props./...props паттернов нет — trim безопасен. | Low | R54 |
| **S130** | Reverse props drift — 3 панели старвятся registry | R55 contract-audit: (a) **BacktestRunner** — registry шлёт только `{symbol, connected}`; компонент имеет полный backend-пайплайн (`sendSignalMessage` run_backtest, `backtestResult`, compare, 30s timeout) — кнопка Run ВСЕГДА даёт «WebSocket not connected» даже при живом канале. Плюс `connected` читается с exchange-сокета, а бэктест идёт по signals-сокету (registry.js:722). (b) **PerformanceDashboard** — шлётся только `accounts`; `buildEquityCurve(undefined)` → фейковая плоская кривая на 10k, `signals` → вечные нули — панель показывает правдоподобные мёртвые данные без disclosure. (c) **IndicatorBuilder** — `onIndicatorsChange` никогда не шлётся; весь compute-pipeline (BB/SMA values) умирает в `?.()` — панель рендерит только определения. Класс S089/S115 (advertised-but-unwired). | **Medium** | R55 | — ✅ verified R146 (registry:490 signals+fills; :723 signals-connected+sendSignalMessage+backtestResult; :358 onIndicatorsChange→setCustomIndicators)
| **S131** | Grafana-дашборды запрашивают ~29 несуществующих метрик | R56 contract-audit emitted-vs-queried: **latency-monitoring.json** — все 5 queries мертвы (`exchange_simulator_*` — реальный префикс `exchange_*`; `ai_signal_bot_signal_generation_latency_seconds` не эмитится). **system-overview.json** — все ~9 мертвы (`*_cpu_usage_percent`/`memory_usage_bytes` никто не эмитит). **trading-overview.json** — ~8 мертвых hft_* (`active_positions`, `latency_us_bucket`, `memory_usage_mb`, `pnl_*`, `shm_*_queue_depth`, `signals_total` — реальные имена `signals_received/processed_total`). **trading-performance.json** — ~7 мертвых (`model_accuracy`, `pnl_daily`, `portfolio_value`, `position_count`, `sharpe_ratio`, `signals_generated_total`, `trades_total`). Только `ai_signal_bot_metrics.json` полностью живой. Дашборды показывают вечные No Data — ops-обманчивость. | **Medium** | R56 | — ✅ verified R146 (R140 re-proved: все 40 имён резолвятся в живые эмиттеры)
| **S132** | Kill-switch SHM канал write-only end-to-end | R56 audit SHM-полей: `KillSwitchMsg` (`shm_protocol.h:70`) — C++ `KillSwitch::trigger()` пушит в ring `/hft_kill_switch` (kill_switch.h:88-94, init bot_setup.cpp:194), но **ни один consumer не читает** — ни Python (`shm_fill_consumer.py` читает только `/hft_fills`), ни web-ui. Параллельно ai-bot имеет готовый приёмник: `MetricsExporter.record_kill_switch(reason)` (metrics.py:258) + gauge `trading_kill_switch_active` — **0 продакшн-вызовов**. Обе стороны контракта построены, середина отсутствует — kill-switch срабатывает молча для Python-стека. Класс S125 (недоведённый SHM-канал). R56 fix: wired e2e — `shm_kill_switch_consumer.py` (KILL_SWITCH_STRUCT `<Q B B 6x` 16B), polling в `_start_shm_channel`, `_on_kill_switch` → latch `_hft_kill_active` + `record_kill_switch` + CRITICAL alert-rule; push-gate в `_finalize_and_execute`; config `shm.kill_switch_name`. +9 тестов. | **Medium** | R56 | — ✅ verified R146 (shm_kill_switch_consumer.py существует; run.py:301-306 polling, :346 latch, :417 CRITICAL rule, :512 push-gate)
| **S133** | 5 недокументированных WS message-типов | R56 contract-audit doc-vs-wire: sim/bot шлют `audit_logs`, `circuit_breaker_status`, `replay_candles`, `replay_state`, `speed_set` — ни один не задокументирован в WEBSOCKET_PROTOCOL.md. `comparison_result` — FP (шлётся из backtest_requests.py, задокументирован). R57 fix (docs-only): секции `speed_set`/`replay_state`/`replay_candles`/`audit_logs` (sim :8765) + `circuit_breaker_status` (bot :8766) с реальными payload-полями из продюсеров (audit_logs — полный AuditLog.to_dict), +5 строк в Message Type Summary + `replay` C→S строка. Post-scan: все 41 sent-типа задокументированы. | Low | R56 |
| **S134** | HealthServer :8080 недостижим из deploy-конфигов — все пробы бьют в stub | R57 audit compose/helm: ai-bot поднимает HealthServer :8080 (detailed /health + /live + /ready — специально unauthenticated для kubelet, health_server.py:150) и MetricsExporter :9090 со stub `/health`=`{"status":"ok"}` (metrics.py:429). Helm probes били в :9090, 4 compose healthcheck curl-или `9090/health`, :8080 нигде не опубликован — k8s/compose видели только «aiohttp жив», деградация exchange/db невидима; docs зовут `curl :8080/health` — недостижимо. R57 fix: helm liveness→`/live`, readiness→`/ready` на `ports.health:8080` + service-port; все 4 compose: publish `8080` + healthcheck→`:8080/ready` (real _check_all, 503 при деградации). | **Medium** | R57 | — ✅ verified R146
| **S135** | `docker-compose.yml` инжектит 4 мёртвых VITE_ENABLE_* | R57: строки 137-140 — `VITE_ENABLE_ADVANCED_ORDERS/AUDIT_LOGS/EXCHANGE_CLONES/SYMBOL_SEARCH` — те же мёртвые флаги что S128 удалил из `.env.example` (0 читателей в web-ui/src), compose-копия пропущена. prod/staging/hub чисты. Fix: удалены. | Low | R57 |
| **S136** | `shared_config.yaml` + `test_config_consistency.py` — мёртвая пара | R58: файл монтируется во все 3 compose-контейнера но **0 prod-кода его читает** — только docs/CHANGELOG/scripts. Единственный читатель `test_config_consistency.py` (a) не подключён к CI/pre-commit, (b) падал cp1251 UnicodeEncodeError (класс S108), (c) FAIL — требовал `price_feed` секцию, удалённую в S097. R58 fix: удалены 3 фейковых mount'а; скрипт починен (utf-8 reconfigure + stale price_feed→audit-check rename); wired в pre-commit-check (`config: consistency` — бежит когда config-файл staged или full-режим). 5/5 checks green. | **Medium** | R58 |
| **S137** | `/api/health` — несуществующий endpoint + `9092/health` stub в deploy.yml | R58: `deploy.yml:135` проверял `web-ui:3000/api/health` — nginx имеет только `location = /health`; `/api/health` → SPA fallback → index.html 200 — проверка не могла упасть. Плюс `9092/health` — stub MetricsExporter (класс S134). Частичный FP: prod-compose `/api/health` оказался **grafana** endpoint — настоящий. Fix: deploy.yml → `8080/ready` (ai-bot) + `3000/health` (web-ui, раньше вообще не проверялся); grafana `3001/api/health` оставлен — реальный. | **Medium** | R58 |
| **S138** | Дупликат `load_test_50_symbols.py` — старая Finding 006 всё ещё жива | `scripts/load_test_50_symbols.py` (standalone, 0 refs, pytest collects 0) vs `exchange_simulator/tests/load_test_50_symbols.py` (тот, что в TESTING.md). Fix: scripts/ копия удалена. | Low | — |
| **S139** | Makefile `ci-test`/`ci-quick` → удалённый `ci-test.sh` | R59: `Makefile:75,78` звали `./ci-test.sh` — удалён в c7025b7. Fix: repointed на канонический gate — `pre-commit-check.py --all` / `--quick`. | Low | R59 |
| **S140** | `cachetools` — declared-but-unimported dep | R59: `exchange_simulator/requirements.txt` — 0 импортов по repo. Удалён pin. | Low | R59 |
| **S143** | `deploy.sh`/`deploy.bat` health-check бьют в WS-порты — на здоровом стеке всегда fail | R62 fix: порты приведены к compose-канону — sim `8765`→`8775/health`, ai-bot `8766`→`8080/ready`, web-ui `3000`→`3000/health` (SPA-fallback → реальный nginx endpoint). bash -n green. `.bat` не гейтит вообще (только лог) — семантика сохранена. | Medium | R62 |
| **S141** | Exchange-credential env drift — `.env.prod.example`/k8s задавали `BINANCE_*`/`OKX_*`/`BYBIT_*`/`FIX_*`/`EXCHANGE_MODE` — код читает `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` (exchange_factory.py:347-348) | R62 fix: `.env.prod.example` — dead creds/FIX/EXCHANGE_MODE удалены, реальная пара `EXCHANGE_API_KEY/SECRET` с disclosure про paper_trading+ccxt; `secrets.enc.yaml` переписан на реальные имена (ALERT_*/EXCHANGE_*/OPENAI/ANTHROPIC/AI_BOT_AUTH_TOKEN, убран TimescaleDB secret); helm — убраны `EXCHANGE_MODE`/`LOG_LEVEL`/`global.logLevel`/`env.exchangeMode` (dead — C++/Python их не читают; `LOG_FORMAT` живой, оставлен); compose — убраны `EXCHANGE_MODE`×2 (prod) и `LOG_LEVEL`×3 (dev). YAML валиден, refs к удалённым value-ключам = 0. | Low | R62 |
| **S142** | Alertmanager — документированный, но отсутствующий компонент: docs описывали service+config+envsubst, реальности не было (ни сервиса, ни `alerting:`-секции) | R62 fix (product-решение: ship): создан `monitoring/alertmanager.yml` (group_by alertname/severity/service, critical 1h repeat, critical→warning inhibit); `prometheus.yml` + `alerting:` → `alertmanager:9093`; сервис `prom/alertmanager:v0.27.0` добавлен во все 3 compose + volumes; заодно смонтирован `alerts.yml` в prod/staging prometheus (правила там не грузились вообще). Docs (MONITORING_GUIDE/CONFIGURATION_GUIDE/ARCHITECTURE/DEPLOYMENT/README) синхронизированы. | Low | R62 |
| **S145** | Deploy-pipeline нерабочий end-to-end — `deploy` job копировал 3 файла, `compose pull` тянул ноль (нет `image:` refs), bind-mounts конфигов не копировались; job на `refs/tags/v*` при пустых тегах — никогда не выполнялся | R63 fix: prod-compose получил `image: ghcr.io/ezpectus/hft-tradebot--lite-version/<svc>:${IMAGE_TAG:-latest}` ×4; deploy.yml scp расширен (monitoring/, */config.yaml, ai-bot config/, hft config/); ssh-скрипт экспортирует `IMAGE_TAG=${{github.ref_name}}#v`; metadata-action +`type=raw,value=latest` на main; DEPLOYMENT.md описал реальный flow + server prereqs. | High | R63 | — ✅ verified R146
| **S144** | `docker-compose.hub.yml` тянул `docker.io/ezpectus/hft-*:v2.0.0` — образы, которые CI никогда не производил | R63 fix: репоинт на `ghcr.io/ezpectus/hft-tradebot--lite-version/<svc>:latest` (тег `latest` теперь пушится на каждом main-билде). | Low | R63 |
| **S146** | Undeclared deps: `tabulate` на startup-пути (run.py→monitoring/__init__→tracker.py unguarded) — Docker-образ/fresh-install падает на import; `scipy` unguarded в `cvar.py` (guarded в var/markowitz/vol_surface) — `cvar_analysis` endpoint крашился бы | R66 fix: `tabulate==0.9.0` в requirements.txt; cvar.py — `_HAS_SCIPY` guard + fallbacks (`_norm_ppf` из var.py BSM-approx, `_norm_pdf` чистая math, numpy-фолбэки skew/kurtosis) — fallback выдаёт идентичные scipy результаты (~1e-10), верифицировано blocked-import тестом. 96 risk-тестов green. | **Medium** | R66 | — ✅ verified R146
| **S147** | `/hft_fills` SHM-канал write-only end-to-end + side-enum инверсия | C++ `shm_fill_producer` создаётся (bot_setup.cpp:209) но `push_fill` никогда не зовётся — `fill` WS-handler только логировал (signal_receiver_handlers.h:30). Python `shm_fill_consumer` (R50) поллил вечно-пустой ring. Латентно: Python декодировал `side` по `{1:BUY,2:SELL}` (run.py:328) а C++ протокол `0=BUY,1=SELL` — каждый SELL писался бы как BUY. R68 fix: `set_fill_producer` + FillMsg push в fill-handler (epoch-ns, symbol_id_impl, side 0/1, fee, ex_id=3), wiring в init_ipc, Python decode исправлен на {0:BUY,1:SELL}; фикстуры test_shm_alerting_wiring приведены к реальному контракту. 53 shm-теста green. | **Medium** | R68 | — ✅ verified R146
| **S148** | Kill-switch «cancel all orders» — лог-заглушка, реальных отмен нет | R77 fix: sim — новый `_pending_limits` dict (exchange.py:71) — покоящие LIMIT-ордера регистрируются (exchange_order_submission.py:255,266), до этого они умирали зомби в `_order_history` навсегда (ни fill, ни cancel — sibling-дефект, найден в диагностике). `_check_limit_orders` (exchange_advanced_orders.py:40-62) филлит по limit-цене при достижении рынком, едет в `check_advanced_orders` → `fills_batch` broadcast. `cancel_order`/`cancel_all_orders` (exchange_advanced_orders.py:64-103) — pop из всех 4 pending-dict'ов, status→CANCELLED, ORDER_CANCELLED audit; `_resolve_oco` чистит и `_pending_limits`. WS: `cancel_order`/`cancel_all_orders` в диспетчере + handler'ы (ws_message_handler.py:165-168, 403-447) — работают при `trading_active=false` (это и есть kill-сценарий). C++: `OrderExecutor::cancel_all_orders()` (order_executor.h:184-209, паттерн close_position); реальный callback в bot_setup.cpp:175-181 + реальный вызов в graceful_shutdown (bot_loop.cpp:349-355). Verified: pytest 387 green + e2e-скрипт (pending→fill→cancel→cancel-all). C++ — inspection-verified (тулчейн отсутствует, CI скомпилит). | High | R77 | — ✅ verified R85
| **S149** | `client_order_id` мёртв end-to-end — заявленная идемпотентность не существовала | R77 fix: sim — bounded dedup-таблица `_order_dedup` `{exchange}:{cid}→Order` + `_order_dedup_keys` deque (websocket_server.py:100-103, cap _ORDER_DEDUP_MAX=10000); `_handle_order_inner` (ws_message_handler.py:211-229) — повторный cid возвращает оригинальный order с `deduplicated:true`, без второго fill и без broadcast. C++ executor шлёт `hft_{symbol}_{timestamp}` (order_executor.h:122-124). UI `submitOrder` штампует `ui_{ts}_{rand}` до постановки в очередь (useExchangeData.js:178-185) — reconnect-flush несёт тот же id. Документировано в WEBSOCKET_PROTOCOL.md. Verified e2e: dup-cid → один ордер в истории; разные cid → оба филлятся. | High | R77 | — ✅ verified R85
| **S155** | Exchange simulator control-plane без авторизации | R77 fix: `EXCHANGE_CONTROL_TOKEN` env → `control_token` в `ExchangeWebSocketServer` (websocket_server.py:65-72) + `_authed_sockets` set; `_CONTROL_TYPES` frozenset (order/close_position/cancel_*/start_trading/stop_trading/update_config/set_speed/replay — ws_message_handler.py:38-42) гейтится при заданном токене; `auth`/`auth_ok`/`auth_failed` первым фреймом, `secrets.compare_digest` (ws_message_handler.py:473-487); cleanup на disconnect (:140). Data-путь (subscribe/snapshot/options_chain/ping) остаётся открытым. Клиенты: web-ui `VITE_EXCHANGE_TOKEN`→`authToken` (useExchangeData.js:10-12,172), ai-bot `ws_client.py:115-118` шлёт auth перед subscribe, C++ `OrderExecutor` шлёт auth в open_handler (order_executor.h:49-65). Prod-compose: `EXCHANGE_CONTROL_TOKEN:?required` на sim + `VITE_EXCHANGE_TOKEN:?` build-arg; `.env.prod.example` документирует пару. Startup-warning когда токен не задан. Verified e2e все 4 режима: gated/bad/good/tokenless. Bonus: `VITE_SIGNAL_TOKEN` никогда не декларировался как build-ARG — теперь объявлен в обоих Dockerfile (раньше signal-auth молча умирал в прод-сборке). | High | R77 | — ✅ verified R85
| **S156** | Контейнерный сим биндит localhost → публикуемые порты мёртвы | R77 fix: `EXCHANGE_WS_HOST` env-override в `__main__.py:145-149` (конвенция `AI_BOT_BIND_HOST`); один флаг покрывает оба бинда — metrics/health HTTP тоже на `self.host` (websocket_server.py:240). `EXCHANGE_WS_HOST=0.0.0.0` выставлен во всех 4 compose (dev/prod/staging/hub — hub получил первый environment-блок). Compose config -q зелёный на всех 4. Healthcheck остаётся внутренним curl localhost:8775 — теперь честен (listener реально там). | High | R77 | — ✅ verified R85

## R84 — fix-раунд (S188, S178, S179, S180)

| ID | Находка | Как закрыто: файлы:строки | Приоритет | Раунд |
|----|---------|---------------------------|-----------|-------|
| **S188** | deploy.yml пёк прод-UI без auth-токенов/WS-URL | `deploy.yml` build-args теперь включают `VITE_SIGNAL_TOKEN`/`VITE_EXCHANGE_TOKEN` из `secrets.*` (docker-образ), а Netlify-джоба получает `env: VITE_WS_EXCHANGE/VITE_WS_SIGNALS` из `vars.*` — токены в публичный бандл осознанно НЕ печём (view-only dashboard). | High | R84 | — ✅ verified R85
| **S178** | RiskManager V2 «production safety» весь tests-only | Wired в прод: `precheck_order` (bot_loop.cpp:92-104) зовёт `check_order` перед каждым submit во всех 3 путях (process_ai_signals, execute_v2_order, run_v1_fallback_loop) — blacklist/leverage/per-symbol-qty/exposure/daily-loss/drawdown/rate-throttle/margin теперь живые гейты. `update_risk_state` (bot_loop.cpp:324) в main-loop каждый тик: UTC-day rollover → `reset_daily` + baseline, `update_pnl_v2` (realized-today + unrealized + equity), и `kill_switch->activate(DAILY_LOSS|MAX_DRAWDOWN)` — activate() больше не file-trigger-only. `on_fill`/`reduce_exposure` зовутся из fill-callback (bot_setup.cpp:296-318). `update_pnl` (CAS-add) убран из prod-path — daily_pnl_ теперь authoritative через update_pnl_v2 (метод остался для doctest-suite). Резидуал: arb-путь обходит check_order (2-ногий, отдельная семантика), `blacklist_symbol` остаётся runtime-API без прод-вызова (легитимный сеттер). | High | R84 | — ✅ verified R85
| **S179** | Оптимистичная книга: open_position на send-success, fills не реконсилируются | Fill-driven bookkeeping: `PositionManager` получил pending_orders_ + `add_pending_order` (send → pending, symbol занят для has_position/position_count → нет стекинга ордеров), `apply_fill` (PENDING=resting-ack; FILLED→open/scale-in weighted-entry/reduce/close с реализацией PnL; REJECTED/CANCELLED→cancel_pending), `sync_position` (account-broadcast reconcile: подхватывает позиции, открытые пока бот был оффлайн — закрывает restart-gap), `cancel_pending`/`clear_pending_orders`. Receiver: fill-callback + `order_cancelled`/`orders_cancelled` dispatch. Stray fills без pending (наш же close-fill, чужие UI-ордера на shared-аккаунте) — no-op. Резидуал: pending-ордер на отвалившемся fill живёт до cancel/restart — sync_position чинит позиционную сторону. | Medium | R84 | — ✅ verified R85
| **S180** | balance хардкод 10000 | `config.initial_balance` ключ (config.h + config_parser + config.yaml — default 10000 как раньше); receiver парсит `accounts[default_exchange]` из каждого candles/snapshot broadcast → `ctx.balance` = sim `balance` (free cash — корректная база для margin-check и sizing); equity по-прежнему = balance + local unrealized (консервативно занижено на locked-margin). `sync_position` заодно реконсилит позиции при рестарте. | Medium | R84 | — ✅ verified R85

Бонус-фикс: `test_doctest_risk_manager.cpp:170` — «Max drawdown rejected» имел сломанную посылку (update_pnl_v2(0,-2000,8000) ставил peak=8000, не 10000 → drawdown=0 → тест всегда красный/некорректный). Peak теперь устанавливается явно → 24/24 green, drawdown-гейт реально проверяется.

| **S164** | Helm-чарт рендерил мёртвую систему | R86 fix — все 8 суб-проблем: (1) `WS_URL=ws://<release>-exchange-simulator:8765` в ai-bot env (ai-signal-bot.yaml:45-46); (2) `EXCHANGE_WS_HOST=0.0.0.0` env на sim (exchange-simulator.yaml) — k8s-пробы больше не CrashLoop; (3) prometheus `rule_files` + rules ConfigMap (vendored `helm/files/alerts.yml`) + `alerting:` → новый `templates/alertmanager.yaml` (Deployment+Service+ConfigMap за `alertmanager.enabled`); (4) grafana provisioning: datasource+provider ConfigMaps + dashboards ConfigMap из `helm/files/dashboards/*.json` — Grafana больше не пустая; (5) netpol: egress TCP/443 anywhere (OpenAI/Discord/webhooks — netpol не умеет DNS-selector); (6) `HFT_KILL_SWITCH_FILE=/app/logs/kill_switch` env (writable emptyDir) + `${VAR:-default}` support в `expand_env` (config_parser.h:26-39) применён к simulator_ws_url/trigger_file; (7) webUi.wsExchange/wsSignals теперь пишутся в Deployment annotations — заданные URL'ы хотя бы аудируемы; (8) `AI_BOT_AUTH_TOKEN`+`EXCHANGE_CONTROL_TOKEN` secretKeyRef (optional:true) на ai-bot и hft-sidecar. Residual: vendored файлы в helm/files дублируют monitoring/ (drift-риск); `optional: true` = fail-open при отсутствующем secret (как compose). | High | R86 | — ✅ verified R89
| **S157** | ai-bot publisher: fail-open auth + `==` + ноль compute rate-limit | R86 fix: `secrets.compare_digest` на WS-handshake (signal_publisher.py:142) и Bearer middleware (health_server.py:158); startup-warning при пустом токене (publisher start, :110-116); per-client sliding-window на 9 compute-типов — `AI_BOT_COMPUTE_RATE_LIMIT` (default 30/мин, `_allow_compute` :285-298, gate :209, cleanup в finally). +тест `TestComputeRateLimit` в test_auth_wiring.py. Residual: `VITE_SIGNAL_TOKEN` в JS-бандле — inherent для browser-клиентов. | Medium | R86 | — ✅ verified R89
| **S158** | hft health-server: idle-TCP морозил /health + /metrics | R86 fix: `SO_RCVTIMEO`/`SO_SNDTIMEO` 5s на accept'нутом сокете (health_server.h:114-131) — idle-клиент отваливается за 5s вместо вечной блокировки accept-loop; bind теперь `metrics.host` (HealthServer host param :35-36, inet_pton :91-97, wired из config в bot_setup.cpp:210) — `127.0.0.1` прячет positions/PnL от сети (default 0.0.0.0 сохранён для compose-scrape). Заодно заведён dead-key `metrics.host` из S159. Residual: /metrics всё ещё без auth при 0.0.0.0-bind — scope через конфиг, не через токен. | Medium | R86 | — ✅ verified R89

## R87 — fix-раунд (S173, S172, S159)

| ID | Находка | Как закрыто: файлы:строки | Приоритет | Раунд |
|----|---------|---------------------------|-----------|-------|
| **S173** | Live-order path: factory-per-order + retry без идемпотентности + stale cancel-stub | R87 fix: (a) `run.py` кеширует live-adapter (`_live_adapter`/`_get_live_adapter`) — exchange-handshake/load_markets один раз на жизнь бота; `close()` в shutdown-path. (b) `client_order_id` проброшен через `place_order` в обоих путях: `RealAccount` кладёт `clientOrderId` в ccxt params (real_account.py), SimulatorAdapter — в order JSON; retry-цикл real-пути теперь идемпотентен. (c) `SimulatorAdapter.cancel_order` реализован поверх WS-протокола через pending-future queue (exchange_factory.py) + `ExchangeClient.cancel_order`/`cancel_all_orders` (ws_client.py). Тесты переписаны на реальный cancel + cid-propagation — 86/86 green. | Medium | R87 | — ✅ verified R89
| **S172** | Два backtest-движка с разными fee-моделями | R87 fix (align, не merge — структуры разные: strategy-objects+RiskManager vs dict-signals+PnLCalculator; полный merge = rewrite с API-риском): оба движка выровнены к sim-модели Binance (config.yaml: fee 0.04%, slippage 2.0bps). `backtester.py`: fee_pct 0.075→0.04. `backtest_engine.py`: slippage_bps 1.0→2.0. Дефолт-пиннинг тесты обновлены к новым значениям — 87/87 green. Residual: два движка остаются (разные API/семантика) — но одинаковые входы теперь дают одинаковые fee/slippage. | Medium | R87 | — ✅ verified R89
| **S159** | ~16 мёртвых конфиг-ключей в 3 сервисах | R87 fix — все ключи заведены или удалены: **sim** — `metrics.{enabled,port,host}` заведены в ExchangeWebSocketServer (enabled гейтит task, port заменяет port+10, host фолбэк на ws-host; websocket_server.py:64-77,193-198,251); yaml enabled честно `true` (compose-healthcheck зависит). `account.currency` → SimulatedExchange(currency)→Account (exchange.py:48-64). `visualizer.enabled` → реальный gate (CLI = override; __main__.py:262). `market.timeframe` → фолбэк-источник timeframe_seconds через TIMEFRAME_SECONDS (__main__.py:68-70). `exchanges.*.symbols` (147 строк) удалены — рантайм торгует shared-universe; валидатор деривирует all_symbols из initial_prices + optional subset-warn (config_validator.py:46-50,90-105). **ai-bot** — `shm.max_symbols` property + run.py:287 (0=auto-size; yaml 10→0 — иначе усекало 39/49 символов). **hft** — `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` → SignalEngine::Params + реальные гейты (signal_engine.h:222-235,267-273,302); `signal_engine_v2.obi_levels`-drift сведён к split-keys во всех yaml + prod-parser читает их (config_parser.h:254-258) + `pp.obi_levels_*` заведены в PressureModel (bot_setup.cpp:152-156); `microprice_enabled` (бонусный prod dead-key) → Params + gate (pressure_model.h:27,102-104); dev `metrics.{port,host,enabled}` — dev-парсер читает metrics-блок (config_parser.h:166-170), is_production-ternary убран (bot_setup.cpp:216-219), /metrics гейтится на enabled (health_server.h:36-38,152-153), default порта 9090→9091 (config.h:147), dev-yaml host localhost→0.0.0.0 (container port-publish). Verified: sim 404 + shm 18 + exchange 86 green; validator на shipped-config 0/0; clang-format clean; C++ syntax-check где возможно (vendored-deps — CI). | Medium | R87 | — ✅ verified R89

## R88 — fix-раунд (S170, S171, S175)

| ID | Находка | Как закрыто: файлы:строки | Приоритет | Раунд |
|----|---------|---------------------------|-----------|-------|
| **S170** | ai-bot: 3 мёртвых модуля (~740 строк) + их тесты | R88 fix — удалены с доказанной deadness (0 прод-импортеров, 0 refs вне тестов): `src/strategies/cross_exchange_arb.py` (337 — «executes real arbitrage» execution-движок, никогда не в `build_strategies`/диспетчере), `src/strategies/marketplace.py` (259 — plugin-loader с importlib-загрузкой произвольного кода = security-поверхность впридачу), `src/utils/helpers.py` (142) + тесты `test_cross_exchange_arb.py`, `test_marketplace.py`, `test_utils.py` (unit), `test_helpers.py` (top-level — пропущен бордом, пойман pytest). `run_all_tests.py` glob-ссылки вычищены (:84-90). `src/utils/bot_helpers.py` — ЖИВОЙ (run.py), созвучный тест сохранён. 1438 ai-bot tests green. | Medium | R88 | — ✅ verified R89
| **S171** | strategies-CircuitBreaker никогда не инстанцируется — unfeedable в этом сервисе | R88 fix — удалён, не заведён: `on_trade_closed(pnl)` требует realized-PnL фида, которого в ai-bot нет (сервис генерит сигналы, позиций не трeкает; `PerformanceTracker.record_trade` — тоже 0 прод-вызывающих). Полный wire = построение PnL-пайплайна — фича, не фикс. Удалены: `strategies/circuit_breaker.py` (87 строк), breaker-параметр/checks из `EnsembleVoter` (ensemble.py:14-21, vote() gate), re-export в `strategies.py`, `test_circuit_breaker.py` + 5 breaker-тестов в `test_ensemble_voter.py`. Заодно `EnsembleVoter.analyze`/`strategies` стали живыми: run.py:122-127 теперь передаёт `strategies=self.strategies`, `_EnsembleAdapter` в backtest_requests удалён — native `EnsembleVoter(strategies=sub_strategies)` (:164-166). Bonus: `fee_pct=0.075` хардкод в backtest_requests:38 → 0.04 (S172-residue). Publisher-side `communication/circuit_breaker.py` — другой класс, живой, не тронут. | Medium | R88 | — ✅ verified R89
| **S175** | `DrawdownAnalysis` мутирует shared `fills` prop in-place | R88 fix: `fills.sort()` → `[...fills].sort()` (DrawdownAnalysis.jsx:16) — shared-массив из `useExchangeData` больше не переворачивается для всего дашборда. 18/18 component tests green. | Low | R88 | — ✅ verified R89
| **S163** | Grafana latency dashboard: 6 из 8 панелей латентности мертвы навсегда | R90 fix: 6 `histogram_quantile(q, bare_metric)` → `histogram_quantile(q, rate(metric_bucket[5m]))` в `monitoring/grafana/dashboards/latency-monitoring.json` + vendored `helm/files/dashboards/latency-monitoring.json` (drift-sync: оба файла правятся в паре). JSON валиден, форма идентична рабочим :15/:31. | Medium | R90 | — ✅ verified R93
| **S167** | 5 math-тестов — shadow-копии алгоритмов, 0 импортов продакшена | R90 fix (extraction): чистая математика вынесена в `src/utils/cointegrationMath.js` (calcADF/calcHalfLife/linearRegression/calcCorrelation), `garchMath.js` (calcLogReturns/calcGARCH-MLE/calcEWMAVol/calcParkinsonVol), `hmmMath.js` (forward/backward/viterbi/baumWelchStep/baumWelch/quantize — EM-шаг экспортирован, чтобы тесты гоняли тот же код), `kalmanMath.js` (KalmanFilter1D/2D), `kmeansMath.js` (extractFeatures/kmeansPlusPlus+rng-param/kmeansIterate/kmeans/silhouetteScore/normalize/euclidean). 5 компонентов импортируют из utils; 5 тестов переписаны на реальные сигнатуры (`viterbi→{states,logProb}`, `lloyds→kmeansIterate`, prod `calcGARCH` с MLE-gradient-descent вместо static-клона). Найден реальный баг: perfect-fit → stdResidual=0 → zScore=NaN → добавлен guard. 65/65 green. | Medium | R90 | — ✅ verified R93
| **S166** | Vitest placeholder-theatre: 19 unconditional + 27 fixture-self-asserts | R90 fix: `exchange-ui.test.jsx` удалён целиком (17×expect(true) + 27 fixture-asserts; единственные реальные assert'ы покрывали мёртвый ExchangeProvider из S174 — с удалением системы субъект теста исчез). `performance.test.jsx`: «manual chunks configured» стал реальным assert'ом — импортирует `vite.config.js`, проверяет manualChunks-функцию и все 4 vendor-правила; нефиксируемый «<2s initial load» placeholder удалён (браузерная метрика — не unit-тест). | Low | R90 | — ✅ verified R93
| **S174** | Мёртвая theme-система: `ExchangeContext`/`ExchangeSelector` никогда не смонтированы | R90 fix — удалено с доказанной deadness: `contexts/ExchangeContext.jsx` (132 строки) + `components/ExchangeSelector.jsx` — 0 прод-импортеров, 0 mount'ов, 0 читателей `--exchange-*` CSS-переменных; реальный выбор биржи — Zustand `selectedExchange`. Bonus-обман подтверждён при удалении: темы знали binance/bybit/coinbase, сим торгует binance/okx/bybit. `src/contexts/` dir удалён пустым. Build + 156 test files / 1106 tests green. | Medium | R90 | — ✅ verified R93
| **S183** | UI игнорит весь order-lifecycle протокола: `order`/`order_cancelled`/`orders_cancelled` падают в `default:` | R91 fix: реальный протокол — ack приходит как `type:'fill'` с `order.status` (PENDING=resting, FILLED/REJECTED=terminal); отдельного `type:'order'` sim не шлёт. `useExchangeData.js`: `openOrders` map по `exchange|id`, трекинг через `trackOrderStatus` в `fill`/`fills_batch`, кейсы `order_cancelled`/`orders_cancelled`, `snapshot`/`sync_state` гидратируют `open_orders` (добавлено в `ws_broadcast._send_market_snapshot`/`_send_sync_state` + `Exchange.get_pending_orders`), `cancelOrder`/`cancelAllOrders` senders, `submitOrder` возвращает Promise резолвящийся ack'ом по `client_order_id` (echo добавлен в `Order.to_dict` + `ws_message_handler._handle_order_inner`). `OrderForm` ждёт ack — «Filled @price»/«Resting @price»/«Rejected: reason»/«Sent — awaiting ack» вместо «Order submitted» на send-success. Новая панель `PendingOrders.jsx` в Account-табе с per-order cancel + Cancel All. Тесты: 11 новых в useExchangeData.test.jsx + 6 PendingOrders.test.jsx — 61 green. | Medium | R91 | — ✅ verified R93
| **S185** | Mock-testing-mock: `mock_objects.py` + `test_trading_flow.py` — замкнутый круг без продакшена | R91 fix — удалено: `tests/mocks/mock_objects.py` (185 строк) + `tests/integration/test_trading_flow.py` (5 «integration»-тестов, 0 прод-импортов — assert'ят хардкод моков) + пустой `tests/mocks/__init__.py`. Sibling-файлы (`test_e2e_pipeline.py`, `test_strategy_risk_backtest.py`) — настоящие integration с SimulatedExchange/Backtester/RiskManager, остаются. 1433 ai-bot tests green. | Medium | R91 | — ✅ verified R93
| **S186** | hft: мёртвый mock + 2 сиротских doctest-файла — тесты живого кода никогда не компилируются | R91 fix: `tests/mocks/mock_exchange.h` удалён (0 includers). `add_doctest_test` для `test_doctest_cpp_optimizations` (8/8 pass локально) и `test_doctest_hft_config` — последнему добавлен `target_sources(config.cpp)` + fmt/spdlog/yaml-cpp линки (без них `Config::load` — undefined reference). **Bonus:** `test_integration_config` имел ту же дыру — зарегистрирован без config.cpp, exe никогда не собирался; починен тем же способом. hft_config не собирается локально (нет yaml-cpp headers) — CI ctest соберёт. | Medium | R91 | — ✅ verified R93
| **S189** | `wget -qO-` вместо сохранения ключа — lint-cpp и clang-17 leg test-cpp мертвы | R92 fix: `wget -qO- URL` теперь pipe'ит напрямую в `gpg --dearmor | sudo tee .../llvm.gpg` в обоих местах (ci.yml lint-cpp :42, test-cpp clang-17 :140) — промежуточный файл больше не нужен, pipefail ловит wget-фейл. | Medium | R92 | — ✅ verified R93
| **S190** | codeql.yml: C++ билд под `|| true` → пустая база анализа при зелёной джобе + дубль со сканом в ci.yml | R92 fix: `|| true` убран — сломанный C++ билд теперь красит джобу честно вместо зелёного analyze на пустой БД. Matrix сужена до cpp-only: python/javascript legs удалены — ci.yml `security-codeql` уже сканирует их с `security-extended` queries (сильнее дефолтных). cpp-нога уникальна (ci.yml C++ не сканирует). | Low | R92 | — ✅ verified R93
| **S184** | `HawkesProcess` хранит pending-timeout в `window.__hawkesTimeout` — глобал | R92 fix: `window.__hawkesTimeout` → `timeoutRef = useRef(null)` (HawkesProcess.jsx:148,293-294) — каждый mount получает свой таймер, unmount-cleanup чистит только свой. Cross-instance kill убран. | Low | R92 | — ✅ verified R93
| **S153** | `alerting.py` — aiohttp session без timeout | R92 fix: `ClientSession()` → `ClientSession(timeout=ClientTimeout(total=15, connect=5))` (alerting.py:74) — висший webhook-эндпоинт стопорит alert-pipeline максимум на 15s вместо ~300s aiohttp-дефолта. 18 alerting-wiring тестов green. | Low | R92 | — ✅ verified R93
| **S176** | Мёртвые utils: `auditExport.js` + `cn.js` — tests-only | R92 fix — удалено с доказанной deadness: `utils/auditExport.js` (107 строк) + `utils/cn.js` (3) + их тесты `auditExport.test.js`/`cn.test.js` — 0 прод-импортеров каждый (AuditLogViewer экспортирует сам через `onExport`-prop). vitest 155 файлов / 1108 тестов green. | Low | R92 | — ✅ verified R93
| **S177** | 11 сайтов `JSON.parse(localStorage…)` без try — битый ключ убивает панель | R94 — **ложное срабатывание, закрыто без изменений**: все 11 сайтов уже обёрнуты в try/catch на момент аудита (R79). Try-блоки предшествуют записи находки — `git blame`/`6a05e5e` (12.09, за день до R79) только добавил IS_DEV-gate к существующему catch. Два сайта из списка (`useSessionRecorder.ts:171`, `useStrategyMarketplace.ts:144`) вообще не localStorage — это import-file парсеры со схема-валидацией. Паттерн-матчинг `JSON.parse(` без проверки enclosing-try. | Low | R94 | — ✅ verified R96
| **S181** | `signal_engine_v3_enabled` мёртв без `v2_enabled` | R94 fix: `run_v2_signal_loop` gate расширен до `(!v2_enabled && !v3_enabled)` (bot_loop.cpp:252-256) — v3-only конфиг теперь реально гоняет луп. Семантика подтверждена кодом: `generate_signal` предпочитает `engine_v3` при наличии (:165-168), `engine_v2` конструируется безусловно (bot_setup:144) — v3 замещает v2, не слой поверх. | Low | R94 | — ✅ verified R96
| **S182** | `PositionManager::open_position` — недостижимая ветка перезаписи теряет PnL | R94 fix — метод удалён целиком (position_manager.h): 0 прод-вызывателей с S179 (позиции книгуются через `apply_fill` с weighted-merge), только doctest-сьют его дёргал. Тест-сьют переписан на реальный prod-путь: хелпер `open_via_fill` = `add_pending_order` + `apply_fill(FILLED)` — 24 call-site'а, все 22 теста зелёные. Теперь сьют гоняет живой booking-path вместо мёртвого toy-метода. | Low | R94 | — ✅ verified R96
| **S187** | `screenshots.spec.js` — 5 тестов без единого assert'а в CI-gated e2e | R94 fix: все 7 тестов получили реальные `expect(...).toBeVisible()` — app-shell (`#main-content`/`header`), chart-canvas, Order Book header, tab-backtest/tab-signals/tab-account navigation + `.tab-content`. Bonus: старые селекторы `[data-panel-id=...]` никогда не матчились (DetachablePanel не рендерит атрибут) — заменены на реальные (data-testid табы, canvas, текстовые заголовки). 7/7 pass локально против dev:mock. | Info | R94 | — ✅ verified R96
| **S160** | PWA manifest: счётчики протухли на ~74 панели | R95 fix: vite.config.js:15 `204 panels and 44+ math models` → `278 panels` (реальный `{ id:`-count registry.js). «44+ math models» убрано целиком — реестра моделей нет, число неверифицируемо. | Info | R95 | — ✅ verified R96
| **S161** | CONFIGURATION_GUIDE §2 — фантомный конфиг сима | R95 fix: секция переписана под реальную схему `config.yaml` — `exchanges.<name>.{fee_pct,slippage_bps}` (нет maker/taker-сплита), `initial_prices`, `market.{timeframe,drift,warmup_candles,order_book_depth}`, `account.{initial_balance,leverage}`, `websocket.{host,port}`, `metrics.enabled` + честная заметка: tick_interval/compression/encoding захардкожены в websocket_server.py. Старый phantom-блок (9 несуществующих ключей) уже был заменён warning'ом — warning снят, таблица реальная. | Low | R95 | — ✅ verified R96
| **S162** | WEBSOCKET_PROTOCOL.md — 8 классов расхождений с диспетчером | R95 verify-close: doc уже поправлен — `update_config` с flat `updates` (:199,:897), `config_updated` sender-ack (:456,:912), `fills_batch.orders` (:909), `welcome.server` (:100 = handler :83), `error` без `code` с явной заметкой (:389-393), `speed_change`-broadcast помечен несуществующим (:451), `start_trading`/`stop_trading` задокументированы (:121). Все 8 классов сходятся с диспетчером. | Medium | R95 | — ✅ verified R96
| **S165** | terraform `vpc_id` dead input + Makefile .PHONY | R95 fix: `variable "vpc_id"` удалён из modules/eks/main.tf + оба call-site'а (dev/prod main.tf:39) — 0 refs осталось (subnet_ids — реальный вход). Makefile .PHONY дополнен хвостовыми таргетами: ci-test, ci-quick, benchmark, walk-forward, docker-hub. | Info | R95 | — ✅ verified R96
| **S168** | Stale test-counts «99 unit/103 files» vs факт | R95 fix — поправлены ВСЕ протухшие счётчики за раз: WEB_UI.md:376 «103 files: 99+4, 800+ tests» → «157 files: 153 unit + 4 E2E, 1000+ tests» (+hooks-листинг очищен от удалённых useInterval/usePerformance); ARCHITECTURE.md:93 «Vitest (157 files)» → 153, :377/:480 «296 components» → 291, :422 «161 files: 157+4» → «157: 153+4»; README.md:26/:117 «295» → 291, :121 «157 test files» → 153, :195 «162 test files» → 157. Факт: src/test/ = 154 файла = 153 test-файла + setup.js; e2e = 4 spec; ~1078 кейсов. | Info | R95 | — ✅ verified R96
| **S169** | Мёртвые хуки + 471 строка тестов для мёртвого кода | R95 fix — удалено с доказанной deadness: `useInterval.js` (15) + `useInterval.ts` (36) + `usePerformance.js` (152) + `useInterval.test.jsx` (182) + `usePerformance.test.jsx` (289) — 0 прод-импортеров (grep по src/+e2e/). Живой дубль `useDebounce.ts` реально импортируется (ArbitragePanel/FillsPanel/PriceComparison). Bonus-обман подтверждён: extensionless-import теста резолвил бы `.js`-копию, «правильный» `.ts` был тенью. | Low | R95 | — ✅ verified R96
| **S150** | `config.prod.yaml` — продакшн-театр: ~35 мёртвых ключей | R97 fix — ~33 мёртвых leaf-ключа удалены вместе с их Config-полями/парсингом/валидацией/баннером: `database.*` (7), `redis.*` (3), `exchange.fallback_to_simulator`, `signal_engine_v2.thresholds.min_composite`, `periods.vwap_window`, `trading.paper_trading` + `risk.{stop_loss_pct,take_profit_pct}` (dev yaml тоже — ключ лгал «no real orders are sent»), `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}`, `adaptive_order_selector.{default_type,post_only_retries}`, `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}`. Коррекции аудита по коду: `metrics.*` ЖИВЫ (HealthServer gate :217→:152), `pressure_model.microprice_enabled` + `obi_levels_*` живы (bot_setup:108-110,156), `risk.{daily_loss_limit,max_drawdown_pct,max_leverage,...}` — реальные гарды/Params. `system.mode` теперь гейтит `is_production` (staging ≠ prod). `clear_secrets()` удалён (оба секрета ушли). Bonus: test_integration_config был некомпилируем (`config.leverage` не существует) — починен на `max_open_positions`. DEPLOYMENT.md sample под реальную prod-схему. | Medium | R97 | — ✅ verified R102
| **S151** | `seq` в broadcast — write-only, заявленный gap-detection отсутствует | R97 fix — детекция заведена в обоих клиентах протокола: `useExchangeData.js` (lastSeqRef; gap → `sendExchangeRef({type:'sync_state', last_timestamp: pre-gap cursor})`, baseline reset в onOpen — счётчик сервера рестартуется) + `ws_client.py` ai-bot (`_last_seq`/`_last_msg_ts`, `_request_resync` с create_task + 5s cooldown, baseline reset на `welcome`). Курсор — ts последнего КОНТИГУАСНОГО сообщения (обновление ts после проверки gap) — сервер досылает именно пропавший диапазон. Тесты: 4 py (gap/contiguous/cooldown/welcome-reset) + 3 vitest. | Medium | R97 | — ✅ verified R102
| **S152** | `network/ws_client.h` — мёртвый toolkit; живые коннекты без watchdog | R97 fix — файл стриплен до `src/network/watchdog.h` (только `Watchdog` — остальные 5 абстракций ~190 строк удалены как proven-dead). Watchdog заведён в ОБА живых коннекта: `SignalReceiver` (feed на open/message/ping/pong) + `OrderExecutor` (feed на open/ping/pong — сокет не несёт data-stream). Монитор-тред 2s: `connected_ && !is_alive(15s)` → `get_con_from_hdl → terminate` → штатный close→schedule_reconnect; на мёртвый hdl — прямой schedule_reconnect. `client_` теперь shared_ptr под `client_mtx_` со snapshot-хелпером (atomic<shared_ptr> недоступен в mingw-libc++; UAF на do_connect-swap убран), `schedule_reconnect` сериализован `reconnect_mtx_`; reconnect-тред стал joinable с interruptible sleep (reconnect_cv_/reconnect_cancel_) — detached-sleeper UAF убран, disconnect не висит на 30s join. test_network.cpp стриплен до watchdog-тестов; test_signal_flow.cpp починен от протухания (ShmRingBuffer<T,N>→ctor(cap), FastSignal.symbol_id/direction-int/timestamp_ns → реальные поля). | Medium | R97 | — ✅ verified R102
| **S154** | Адаптивные типы ордеров умирают до провода | R97 fix — end-to-end: `OrderSelection` несёт kind+limit_price+expire_ns → новый TIF-aware `submit_order` (order_executor.h) сериализует `time_in_force`/`post_only`/`expire_ms`/`price`/`client_order_id` → `ws_message_handler` валидирует и прокидывает → sim исполняет честно (IOC/FOK не отдыхают; FOK проверяет глубину стакана `_depth_covers`; post_only reject на кроссе; GTD отдыхает до `expire_ts`, sweep в check_advanced_orders → CANCELLED GTD_EXPIRED) → терминальные не-FILLED события доходят до клиентов (`ws_broadcast` шлёт весь closed_orders, не только FILLED — UI `trackOrderStatus` убирает их из openOrders). Мёртвый слой `to_{binance,okx,bybit,exchange}_{type,tif}` (~100 строк) + их тест-блоки удалены. Новый `test_time_in_force.py` — 12 кейсов; `models.py` Order несёт time_in_force/expire_ts/post_only в to_dict. `OrderForm` получил CANCELLED-ветку ack. Валидация: TIF на MARKET / expire_ts без GTD / unknown TIF → REJECTED. | Low | R97 | — ✅ verified R102
| **S191** | Dead options cluster: deprecated `options_pricing` + test-only `options_strategies` | R99 fix — удалено с доказанной deadness: `options_pricing.py` (428, deprecated, импортёры = options_strategies + свой тест), `options_strategies.py` (306, 0 прод-импортёров), `tests/test_options_pricing.py` (280, shadow-test мёртвого кода) — ~1014 строк. Живой путь `options_simulator.py` имеет собственный `test_options_simulator.py`. `run_all_tests.py` (untracked, gitignored :183) — ссылка убрана локально. Sim suite 394 pass. | Low | R99 | — ✅ verified R102
| **S192** | `alerting.py` — мёртвый `email_smtp` + docstring рекламирует email | R99 fix: параметр удалён из `AlertSystem.__init__` (alerting.py:52-60), `self.email_smtp` убран; docstring :3 «…, email.» → «log, webhook (Discord/Telegram)». 0 вызывателей параметра (run.py передаёт 4 живых канала). 41 alerting-тест green. | Info | R99 | — ✅ verified R102
| **S193** | `AuditEventType` — 5/13 членов никогда не эмитятся | R99 fix — audit-stream допаян реальными событиями: CONFIG_CHANGE → `_handle_update_config` (ws_message_handler, update_config менял fee/slippage/leverage мимо аудита — теперь metadata={keys}); SYSTEM_STOP → `start()` finally в websocket_server (SIGTERM/SIGINT путь); ERROR → `_process_message` except; WARNING → `_parse_message` invalid-json/msgpack. POSITION_MODIFIED удалён из enum — доменного события не существует (позиции open/close через ордера). Docstring audit_logger «(open, close, modify)» → «(open, close)». Runtime-smoke: CONFIG_CHANGE эмитится с keys. 12/13 членов теперь живые. | Low | R99 | — ✅ verified R102
| **S194** | `settings.testnet.yaml` — testnet-путь сломан по 4 слоям; документированная команда падает | R101 fix — testnet wired end-to-end: `SignalBotConfig.testnet` accessor добавлен (config/__init__.py, `exchange.testnet` default False) → `run.py:580` передаёт `testnet=self.config.testnet` в `ExchangeFactory` → `RealExchangeAdapter` → `RealAccountManager` (ccxt sandbox). `settings.testnet.yaml` переписан как полный loadable preset: все required-секции, `paper_trading: false` + `testnet: true`, мёртвые ключи (`exchange.mode`/`name`/`api_key`/`api_secret`/`symbols`/`intervals`) удалены — фабрика читает `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` env, header-usage исправлен на реальный `--config` (был вымышленный `--exchange-mode/--testnet/--api-key`). Verified: `SignalBotConfig.load` грузит файл, testnet=True/paper_trading=False. | Medium | R101 | — ✅ verified R102
| **S195** | Stale-docs кластер: docs ссылаются на удалённые модули и несуществующие ключи | R101 fix: `ARCHITECTURE.md:201` — строка `options_strategies.py`/`options_pricing.py` удалена; `TESTING.md:129` — `test_options_pricing` убран из инвентаря; `TECHNICAL_REFERENCE.md:1427` — мёртвые options-файлы заменены живым `options_simulator.py`; `DEPLOYMENT.md:734` tuning-блок переписан на реальные ключи парсера (`latency_optimization.{thread_pinning,execution_thread_core}` prod-имена + `ipc.{signals,fills}.capacity` вместо несуществующих `enable_thread_pinning`/`enable_spinlocks`/`shm.ring_buffer_size`). | Info | R101 | — ✅ verified R102
| **S196** | `config.prod.yaml` — `risk.kill_switch.trigger_file` shadow'ит env-aware `ipc.kill_switch.trigger_file`; `ipc.kill_switch.shm_name` мёртв | R103 fix — единый дом `ipc.kill_switch`: `risk.kill_switch`-блок удалён из prod yaml и его parse-site убран из `parse_prod_risk` (config_parser.h:288 — комментарием задокументировано правило single-home); `ipc.kill_switch.shm_name` заведён → новое поле `cfg.kill_switch_shm_name` (config.h:124) → `bot_setup.cpp:179` читает его вместо hardcode `"/hft_kill_switch"`. `HFT_KILL_SWITCH_FILE` env-override теперь реально доходит до рантайма (был клоббер literal `/tmp/kill_switch` через parse order). Dead fixture-ключи `risk.kill_switch.{daily_loss_trigger,max_drawdown_trigger}` вычищены из test_integration_config. Verified: yaml парсит ipc.kill_switch целиком, risk.kill_switch=None, clang-format clean. | Medium | R103 | — ✅ verified R146
| **S243** | Engine-ордера шарили `client_order_id` → dedup реплеил первый fill | R147 fix — `bot_loop.cpp` `convert_fast_signal` (:183-184) теперь копирует `fast_sig.leverage` + `fast_sig.timestamp` (FastSignal несёт оба поля — `aligned_types.h:35/42`, engine пишет timestamp_ns); V1-loop (:310-312) штампует `sig.timestamp = FastSignal::now_ns()` — V1-структура timestamp не несёт, order-time честный источник. cid `hft_<sym>_<ts>` уникален на ордер → dedup больше не реплеит; `compute_leverage` доходит до risk-sizing (bot_loop.cpp:96 `max(1,sig.leverage)`). | Critical | R147 | — ✅ verified R150
| **S244** | throwing `from_msgpack` в unguarded handler → terminate на 1-м binary-фрейме | R147 fix — `signal_receiver.h:117-130` per-message try/catch вокруг opcode-диспетча (warn+drop кадра, event-loop жив); `:142-149` last-resort catch в `ws_thread_` lambda — escape из `client->run()` логируется, `connected_=false`, `schedule_reconnect()` (reconnect-thread джойнит мёртвый ws_thread_ и дёргает do_connect — дедлока нет, пост в dead io_service не используется). | Critical | R147 | — ✅ verified R150
| **S246** | `/health` статичный фасад; 6/11 метрик вечные нули; MemoryTracker мёртв | R147 fix — `update_health_status(ctx)` (bot_loop.cpp:372-401) зовётся каждую итерацию main.cpp:52: `exchange_connected` = receiver&&executor is_connected, `signal_engine_active` = v2_enabled?(v2||v3):v1, `shm_healthy` = !ipc_enabled || consumer!=nullptr, `last_signal_age_ms` = `receiver->last_activity_ms()` (новый accessor — signal_receiver.h:189), `last_fill_age_ms` из нового `ctx.last_fill_ms` (ставится в on_fill FILLED — bot_setup.cpp:311-315), `error_count_5min` — rolling 5-min baseline, `memory_usage_mb` = process_memory_mb. Счётчики: RECONNECTS — в reconnect-thread обоих сокетов (signal_receiver.h:285, order_executor.h:419) через `set_monitor(&sys_monitor)` в init_monitoring (bot_setup.cpp:219-221); HEARTBEATS_MISSED — на watchdog stale-trip (оба); ORDERS_CANCELED — CANCELLED отделён от REJECTED (bot_setup.cpp:330-332) + on_order_cancelled (:355); SHM_DROPS — на `push_fill` false (handlers:58-61, был [[nodiscard]]-ignored); ERRORS — ErrorCountSink (logger.h:26-41) подключён через новый `Logger::init(..., monitor)` (bot_setup.cpp:61). HEARTBEATS_SENT удалён — heartbeat-отправителя в боте не существует; MemoryTracker выпилен (0 прод-консьюмеров, жил только в своих тестах — удалены из test_doctest_system_monitor.cpp + tests/unit/test_monitoring.cpp); `health_` под `health_mtx_` (health_server.h:223) — update_health теперь реально зовётся, гонка закрыта; в /health JSON добавлен недостающий closing `}` — endpoint отдавал malformed JSON. | High | R147 | — ✅ verified R150
| **S279** | unguarded `trade_logger` в fill-path → broadcast-task умирал на первом fill | R147 fix — `ws_broadcast.py:284-297` `log_fill` и `:389-399` `log_batch` под `if self.trade_logger is not None:` — тот же guard-стиль, что ws_message_handler.py:337. Clean-clone/Docker без gitignored `trade_csv_logger.py` больше не роняет `_broadcast_loop`. py_compile + ruff clean. | High | R147 | — ✅ verified R150

### S207 — `run.py` hard-import gitignored `run_logger.py` (R148)

**Было:** `ai-signal-bot/run.py:31` — `from run_logger import setup_run_logging` без guard; `run_logger.py` в `.gitignore` → fresh clone `python run.py` = ModuleNotFoundError, оба Dockerfile crash-loop.

**Фикс:** guarded import (`try/except ImportError` → `setup_run_logging = None`) + stdlib-`logging` fallback в `setup_logging` — возвращает `(logger, "stdout")`, тот же contract что и sim-версия (`exchange_simulator/__main__.py:26-28`). Проверено: импорт `run.py` с meta-path-блокировкой `run_logger` проходит, `setup_logging` отдаёт рабочий logger + `stdout`.

**Файлы:** `ai-signal-bot/run.py` (import-guard + fallback `setup_logging`).

**Верифицировано R150** — claims сверены с кодом, все присутствуют.

### S210 — compose data-path dead во всех 4 файлах (R148)

**Было:** ai-bot не получал `WS_URL` ни в одном compose → `settings.yaml` default `ws://localhost:8765` = loopback собственного контейнера; hft dev-parse читал `websocket_url` без env-expansion; prod-default `ws://exchange_simulator:8765` (underscore) ≠ service `exchange-simulator` → NXDOMAIN. Healthcheck'и зелёные — self-contained. Весь sim→ai→hft путь мёртв в docker.

**Фикс:**
- `docker-compose.yml` / `.staging.yml` / `.hub.yml` / `.prod.yml` — ai-bot `WS_URL=ws://exchange-simulator:8765`; hft `HFT_EXCHANGE_WS_URL=ws://exchange-simulator:8765` + `HFT_AI_SIGNAL_WS_URL=ws://ai-signal-bot:8766` (prod: только exchange — AI идёт через SHM IPC, как в helm).
- `hft-trade-bot/src/core/config_parser.h` — `parse_dev_config`/`parse_dev_extras` теперь `expand_env` для `websocket_url`/`ai_signal_bot.websocket_url` (prod-парсер уже expand'ил).
- `hft-trade-bot/config/config.yaml` — `${HFT_EXCHANGE_WS_URL:-ws://localhost:8765}` / `${HFT_AI_SIGNAL_WS_URL:-ws://localhost:8766}`; `config.prod.yaml:38` — `${HFT_EXCHANGE_WS_URL:-ws://exchange-simulator:8765}` (hyphen).
- `.env.prod.example` — описаны `HFT_EXCHANGE_WS_URL`/`WS_URL` дефолты.

**Проверено:** все 4 compose парсятся (yaml.safe_load), effective env = `ws://exchange-simulator:8765` / `ws://ai-signal-bot:8766`; prod `command: /app/hft_trade_bot config/config.prod.yaml` + env-var резолвится через expand_env.

**Файлы:** `docker-compose{,.staging,.hub,.prod}.yml`, `hft-trade-bot/src/core/config_parser.h`, `hft-trade-bot/config/config{,.prod}.yaml`, `.env.prod.example`.

**Верифицировано R150** — claims сверены с кодом, все присутствуют.

### S230 — backend-compute plane убит sync-слоем (R148)

**Было:** `useTradingStoreSync` пушил только 7 базовых signal-полей и ронял `portfolioResult`/`volSurfaceResult`/`cvarResult`/`stressTestResult`/`positionSizeResult`/`hawkesResult`/`fundingArbResult`/`authState` (+ exchange-side `openOrders`/`cancelOrder`/`cancelAllOrders`/`reconnects`/`connect`/`nextReconnectIn`). Store их не объявлял, `usePanelContext` не форвардил → 7 панелей (registry ctx.signals.*Result) получали `undefined` и рисовали фейковый 30s-timeout при уже пришедшем ответе; WsManager-панель — вечный «Waiting...».

**Фикс:** все поля прокинуты через всю цепочку: `useTradingStoreSync` (оба сеттера) → `useTradingStore` (declared initial state: 8 signal-results + `signalConnect`/`signalNextReconnectIn`; `openOrders`/`cancel*`/`exchangeReconnects`/`exchangeConnect`/`exchangeNextReconnectIn`) → `usePanelContext` (destructure + `ctx.exchange`/`ctx.signals` hook-shape names). Регресс-тесты: `usePanelContext.test` assert'ит все `*Result`/`authState`/`connect`/`nextReconnectIn` keys + data-flow; `useTradingStoreSync.test` — mirror result-fields в store.

**Проверено:** vitest 12/12 на sync/store/context + registry.test 10/10 + 5 affected-panel suites 10/10; eslint clean.

**Файлы:** `web-ui/src/hooks/useTradingStoreSync.js`, `web-ui/src/stores/useTradingStore.js`, `web-ui/src/stores/usePanelContext.js`, `web-ui/src/test/useTradingStoreSync.test.jsx`, `web-ui/src/test/usePanelContext.test.jsx`.

**Верифицировано R150** — claims сверены с кодом, все присутствуют.

### S245 — v3-only конфиг молча бежал V1 fallback + V3 untunable (R149) ✅ · verified R183

**Было:** `main.cpp` диспатчил только по `signal_engine_v2_enabled` → `v3_enabled:true, v2_enabled:false` падал в `run_v1_fallback_loop` — другой движок при banner'е «V3». `Config` не имел ни одного `v3_*` ключа — `SignalEngineV3::Params` жил на хардкод-defaults.

**Фикс:**
- `main.cpp:57` — gate `v2_enabled || v3_enabled` (loop сам выбирает движок в `generate_signal`, bot_loop.cpp:165-176).
- `config.h` — 7 полей `v3_trend_boost`/`v3_trend_dampen`/`v3_range_confidence_cap`/`v3_volatile_leverage_mult`/`v3_volatile_stop_mult`/`v3_hmm_update_threshold`/`v3_min_regime_confidence` с дефолтами = Params.
- `config_parser.h` — shared `parse_v3_section` (dev `parse_dev_extras` + prod `parse_prod_engines` оба зовут).
- `bot_setup.cpp` — `make_v3_params(c)` вместо `SignalEngineV3::Params{}` на конструкции.
- `config.yaml` + `config.prod.yaml` — все 7 ключей задокументированы с дефолтами.

**Файлы:** `hft-trade-bot/src/core/{main.cpp,config.h,config_parser.h,bot_setup.cpp}`, `hft-trade-bot/config/config{,.prod}.yaml`.

### S253 — DEPLOYMENT `.env`-шаблон с 8 вымышленными переменными (R149) ✅ · verified R183

**Было:** `DEPLOYMENT.md` документировал `EXCHANGE_SIMULATOR_HOST`/`_PORT`, `AI_SIGNAL_BOT_HOST`/`_PORT`, `WEB_UI_PORT`, `DATABASE_PATH`, `PROMETHEUS_PORT`, `GRAFANA_PORT` — 0 читателей у всех восьми.

**Фикс:** шаблон заменён на реальный dev-сет — `GRAFANA_PASSWORD` (`:?required` в dev compose) + `GRAFANA_USER`; текст объясняет что service-URL/порты живут в compose `environment:`/component-yaml, а prod-рычаги — в `.env.prod` (указатель на `.env.prod.example`).

**Файлы:** `docs/DEPLOYMENT.md`.

### S254 — native-deploy команды неработоспособны (R149) ✅ · verified R183

**Было:** `DEPLOYMENT.md` — `python -m` изнутри пакета, `--config` флаг у hft-бинаря (argv[1] позиционный); `QUICK_START.md` — `docker.bat` (несуществующий), чужой clone-URL, `./hft_trade_bot` без config-path.

**Фикс:** residual — `QUICK_START` Step-4 `cd hft-trade-bot/build && ./hft_trade_bot` искал `build/config/config.yaml` → исправлено на запуск из `hft-trade-bot/` с `./build/hft_trade_bot config/config.yaml`. Остальное уже было исправлено в предыдущих проходах: DEPLOYMENT три команды с audit-notes в правильной форме, `DEVELOPMENT_GUIDE.md:321-322` позиционный path + «no --profile flag», `docker.bat`→`no-docker.bat`, clone-URL совпадает с `git remote -v`.

**Файлы:** `docs/guides/QUICK_START.md`.

### S263 — `.env.prod` не доходил до `${}`-интерполяции (R149) ✅ · verified R183

**Было:** 5 `:?required` в `docker-compose.prod.yml` резолвятся только из `.env`/`--env-file`; `env_file: .env.prod` грузит контейнерный env, НЕ интерполяцию → `up` на чистом сервере падал с текстом ошибки, врущим про `.env.prod`.

**Фикс:** `--env-file .env.prod` добавлен в `deploy.yml` SSH-шаг (pull + up) и `Makefile.prod` `DOCKER_COMPOSE` (включая `prod-stats` который звал compose напрямую). DEPLOYMENT-note переписан: документирует `make prod-up` как рабочий путь.

**Файлы:** `.github/workflows/deploy.yml`, `Makefile.prod`, `docs/DEPLOYMENT.md`.

## R151 — slop-fix (9 findings)

### S291 — ai-bot: один malformed candle убивал market-data listener навсегда ✅ · verified R183
- `ai-signal-bot/src/communication/ws_client.py` — `_process_message` валидирует candle-словари (symbol/close) вместо слепого `candle["symbol"]`; per-message catch-all с логом — ни одно кривое сообщение не роняет listen-loop.
- `ai-signal-bot/run.py` — `_listen_loop` ловит `Exception` (не только IO-классы), `_listen_task` сохранён в self, `_on_task_done` при неожиданной смерти таска во время работы бота планирует `_reconnect`/restart вместо голого лога.
- Регресс: `ai-signal-bot/tests/unit/test_listen_restart.py` — 5 тестов: malformed-candle пропуск, non-IO исключение → restart, cancelled-task не рестартует, stop-флаг блокирует restart, повторный crash рестартует снова.
- Проверено: pytest 5/5 + полный ai-signal-bot suite зелёный.

### S303 — exchange_simulator Docker-образ DOA: `python -m` на плоском /app ✅ · verified R183
- `exchange_simulator/Dockerfile` + `Dockerfile.prod` — `COPY . .` → `COPY . ./exchange_simulator/` — пакет лежит как `/app/exchange_simulator/`, `python -m exchange_simulator` резолвится из WORKDIR /app.
- Все 4 compose-файла — config-mount `./exchange_simulator/config.yaml:/app/exchange_simulator/config.yaml:ro` (package-relative путь `__main__.py`).
- Проверено: локальный макет образа (tmpdir + `cp` layout) — `python -m exchange_simulator --no-visualizer` стартует, печатает баннер, биндит сервер.

### S220 — no-docker лаунчеры мёртвы на всех ОС ✅ · verified R183
- `no-docker.bat` — `cd exchange_simulator && python -m exchange_simulator` → запуск из корня репо (пакет резолвится снаружи, не изнутри себя).
- `no-docker.sh` — та же правка (`cd "$PROJECT_ROOT"` перед `python3 -m exchange_simulator`).
- `exchange_simulator/__main__.py` — `loop.add_signal_handler` под `try/except NotImplementedError` (Windows ProactorEventLoop) с warning + KeyboardInterrupt-фолбэком.
- Проверено: `bash -n` чистый; живой прогон на этом хосте напечатал "add_signal_handler unsupported on this platform" и продолжил старт.

### S203 + S310 + S312 — helm: мёртвые PDB + битый grafana subpath (3 находки-дубля одного комплекса) ✅ · verified R184
- `helm/templates/pdb.yaml` — selector `app.kubernetes.io/component: exchange-simulator` → `exchange_simulator` (матчит реальные pod-лейблы Deployment'а); hft-trade-bot PDB удалён целиком — hft живёт сайдкаром в ai-signal-bot поде, отдельная PDB выбирала бы 0 подов навсегда (покрытие даёт ai-signal-bot PDB на shared pod).
- `helm/templates/grafana.yaml` — при `ingress.enabled` добавлены `GF_SERVER_SERVE_FROM_SUB_PATH=true` + `GF_SERVER_ROOT_URL=<scheme>://<ingress.hostname>/grafana/` — `/grafana` prefix из ingress.yaml теперь отдаёт ассеты корректно.
- Проверено: шаблоны перечитаны вручную (helm binary недоступен локально); selector-матчинг сверен с exchange-simulator.yaml:9/15/20.

### S311 — helm image-дефолты недостижимы (ImagePullBackOff ×4) ✅ · verified R184
- `helm/values.yaml` — 4 репозитория `hft-*:v2.0.0` → `ghcr.io/ezpectus/hft-tradebot--lite-version/<service>:latest` — совпадает с deploy.yml push-path (`github.repository`/`matrix.service`) и `latest`-тегом default-branch сборок.

### S204 + S315 — terraform eks: открытый API, секреты без KMS, EOL-версия, ноды наружу ✅ · verified R184
- `terraform/modules/eks/main.tf` — `version` → `var.cluster_version` (default "1.32", в пределах standard support); `endpoint_private_access = true`, `endpoint_public_access = length(cidrs) > 0` — private-only по умолчанию, public API включается только с явным CIDR-whitelist; `encryption_config` на `aws_kms_key.eks_secrets` (rotation on, alias) → secrets в etcd зашифрованы; `enabled_cluster_log_types` = api/audit/authenticator/controllerManager/scheduler; node_group → `var.node_subnet_ids`.
- `terraform/environments/dev/main.tf` + `prod/main.tf` — `node_subnet_ids = module.vpc.private_subnet_ids` (воркеры только в private); dev получил комментарий как включить kubectl-доступ.
- Проверено: HCL перечитан (terraform binary недоступен); module inputs/outputs консистентны с обоими env-вызовами.

## R152 — slop-fix (4 findings + S318 found-and-fixed in-frame)

### S224 — hft `log_file` мёртвый ключ + оба монитора слепые — ✅ verified R154 · re-verified R187
- `src/core/logger.h` — `Logger::init(level, log_file, json, monitor)` принимает полный путь: parent_path/stem/extension выводятся из конфига → `<stem>_<ts><ext>` + `<stem>_latest<ext>`; дефолт `logs/hft_trade_bot.log` воспроизводит исторические имена 1:1.
- `bot_setup.cpp` — передаёт `ctx.config.log_file` (было hardcode `"logs"`); избыточный `create_directories("logs")` убран.
- `monitor.py` — тейлит `logs/hft_trade_bot_latest.log` (файл который реально пишется) вместо несуществующего `hft_trade_bot.log`.
- `scripts/monitor.py` — SHM `/hft_heartbeat` теперь СУЩЕСТВУЕТ: новый `src/ipc/shm_heartbeat.h` (CreateFileMappingW/shm_open, 64B layout Q+4q) создаётся в `init_monitoring` (независимо от ipc_enabled) и `beat(orders,fills,signals,errors)` вызывается из `update_health_status` каждый тик цикла; monitor.py tag — verbatim `/hft_heartbeat` (см. S318).
- Проверено: g++ syntax+runtime компилируется и бежит; C++ writer → Python reader кросс-процессное чтение вернуло реальные счётчики (11,22,33,44) на этом Windows-хосте.

### S256 — ai-bot `logging.file` param-drop — ✅ verified R154 · re-verified R187
- `run.py::setup_logging` fallback теперь делегирует в in-repo `src/observability/logging.py::setup_logging(log_file=...)` — RotatingFileHandler(10MB×5) на настроенном пути + console; external gitignored `run_logger` override сохранён.
- Проверено: с заблокированным `run_logger` бот пишет `logs/test_s256.log` (StreamHandler + RotatingFileHandler wired, контент на месте).

### S255 — DEPLOYMENT мёртвые имена/ключи/пути ✅ · verified R184
- Все 5 пунктов уже исправлены ранее (audit-notes на месте: EXCHANGE_API_*, :9099, timestamped logs, removed retention_days/buffer_size). Остаток — убраны устаревшие «key ignored» оговорки (S224/S256 теперь живые ключи — log-locations переписаны под реальную семантику).

### S228 — live-path без ccxt = молчаливый per-signal RuntimeError ✅ · verified R184
- `run.py::main` — fail-fast gate: `paper_trading:false` + `CCXT_AVAILABLE=False` → `logger.error` + `sys.exit(1)` до старта бота (was: зелёный health + «Live order error» на каждый сигнал, 0 ордеров).
- ccxt НЕ добавлен в requirements — новые зависимости требуют одобрения пользователя; gate — честный минимум.

### S318 — NEW: Windows SHM IPC мёртв целиком (name-mismatch) — ✅ verified R154 · re-verified R187
- C++ `CreateFileMappingW` использует имя `/hft_*` дословно; Python-сторона делала `name.lstrip("/")` в `shm_ring_buffer.py` и `shm_market_data_writer.py` → разные kernel-объекты → Python attach'ился к свежесозданному пустому region, все SHM-каналы (signals/fills/market/kill_switch) молча читали нули на Windows.
- Исправлено: verbatim-tag в обоих сайтах (+ `scripts/monitor.py`). Подтверждено живым кросс-процессным чтением.

## R153 — slop-fix (5 findings)

### S236 — web-ui offline-queue ack race — ✅ verified R154 · re-verified R185
- **Bug:** `useExchangeData.submitOrder` armed a 5s ack timer even when `send()` returned `false` (queued while disconnected) → resolved `null` ("no response") for an order that hadn't hit the wire; on reconnect the queue flushed it with the same `client_order_id` — UI had already given up, and a user retry with a fresh cid bypassed server dedup → duplicate orders.
- **Fix:** `web-ui/src/hooks/useExchangeData.js` — pending entry created without a timer when queued; timer arms only on real send, or in a `useEffect` on `exchangeConnected` after `useWebSocket`'s onopen flush has already put queued messages on the wire. Ack handler unchanged — resolves with the order.
- **Files:** `web-ui/src/hooks/useExchangeData.js` (submitOrder + connected-effect)
- **Tests:** `web-ui/src/test/useExchangeData.test.jsx` — 2 new regressions: queued order does not time out at 5s while offline (then times out normally after reconnect), and resolves with the post-reconnect ack. `mockSend` now returns `true` to match real `send()` semantics when connected. 53/53 pass.

### S247 — PressureModel dead trade-flow/toxicity legs — ✅ verified R154 · re-verified R187
- **Bug:** prod calls `analyze(ob)` → `trades=nullptr,n=0` → `trade_imbalance`/`toxic_score` structurally 0. V2's `raw_pressure = obi*0.3 + ti*0.3 + body*0.4` carried a permanently-dead 30% leg — composite capped at 0.7 of its scale, silently damping signals below `pressure_threshold`; toxic→IOC gate could never fire. No trade stream exists on the wire at all (orderbooks/deltas/candles/prices/accounts only), so wiring was impossible without protocol work.
- **Fix:** honest removal-from-prod-claims: `PressureResult.has_trade_flow` flag set by `analyze(ob,trades,n)`; V2 renormalizes `raw_pressure` over live legs (`live_w = 0.7 + (has_trade_flow ? 0.3 : 0)`) at both composite sites — identical math when fed, full intended scale when not.
- **Files:** `hft-trade-bot/src/data/aligned_types.h`, `src/strategies/pressure_model.h`, `src/strategies/signal_engine_v2.h` (2 sites)
- **Note:** selector toxic-gate stays — correct under 0 when unmeasured; flag documents the contract.

### S248 — SL/TP booked at trigger price; real close-fill dropped — ✅ verified R154 · re-verified R185
- **Bug:** `process_sl_tp` (bot_loop.cpp) sent `close_position` then immediately `pos_mgr.close_position(symbol, trigger.price)` + `balance.fetch_add` at the trigger price. The real fill arrived later → position already erased → "stray fill" drop → real price + close fee never reconciled (PnL/balance drifted by slippage+fee per close); `risk_mgr->reduce_exposure` also never ran → exposure leak. Kill-switch callback had the same pattern.
- **Fix:** keep the position on the book; `mark_closing(symbol)` suppresses `check_sl_tp` re-triggers for 10s (stale marks expire → retry); `apply_fill` books the close at real fill price with fee via the normal CLOSED path (which also does `reduce_exposure` + `balance.fetch_add(realized_pnl)`); REJECTED/CANCELLED clears the mark so SL/TP can re-fire.
- **Files:** `hft-trade-bot/src/position/position_manager.h` (`closing_since_`, `mark_closing`, `CLOSING_RETRY`), `src/core/bot_loop.cpp` (process_sl_tp), `src/core/bot_setup.cpp` (kill switch)

### S249 — reset_daily zeroed live exposure; test-only update_pnl — ✅ verified R154 · re-verified R187
- **Bug:** `reset_daily()` stored `total_exposure_ = 0` at the UTC boundary — but exposure is current holdings, so positions carried past midnight silently dropped out of `max_total_exposure` until new fills re-added. `update_pnl(double)` CAS-add had 0 prod callers (prod owns `daily_pnl_` via `update_pnl_v2`'s store).
- **Fix:** `reset_daily` no longer touches `total_exposure_`; `update_pnl` removed; 3 test call sites migrated to `update_pnl_v2(x, 0, 0)`; "Daily reset" test extended with an exposure-preservation assert.
- **Files:** `hft-trade-bot/src/risk/risk_manager.h`, `hft-trade-bot/tests/test_doctest_risk_manager.cpp`

### S239 — metrics servers bound to container loopback — ✅ verified R154 · re-verified R187
- **Bug:** sim `config.yaml` set `metrics.host: "localhost"` explicitly → the documented fallback `metrics_host or websocket.host` never engaged → :8775 bound container loopback (published port + prom job dead, in-container healthcheck green). ai-bot `AI_BOT_BIND_HOST` existed in code but was never set in any compose → :9090 loopback.
- **Fix:** `exchange_simulator/__main__.py` — `EXCHANGE_METRICS_HOST` env override (mirrors `EXCHANGE_WS_HOST`); `config.yaml` `metrics.host` key removed so the ws-host fallback actually engages (0.0.0.0 in container via `EXCHANGE_WS_HOST`, localhost locally). `AI_BOT_BIND_HOST=0.0.0.0` added to ai-signal-bot env in all 4 compose files; both keys documented in `.env.prod.example`.
- **Files:** `exchange_simulator/__main__.py`, `exchange_simulator/config.yaml`, `docker-compose{,.prod,.staging,.hub}.yml`, `.env.prod.example`

**Gate:** `pre-commit-check.py` 8/8 ALL GREEN.

## R155 — slop-fix (5 findings)

### S240 — hft `config.prod.yaml` dead/miswired keys ✅ · verified R161 · re-verified R189
- **Bug:** `risk.blacklisted_symbols` + `risk.per_symbol_max_qty` were documented in prod yaml but parsed nowhere; `bot_setup.cpp` passed `{}` to `RiskManager::Params`. `pressure_model.toxicity_threshold` was parsed into `v2_pressure_threshold` (wrong semantic — it's the adaptive selector's toxic→IOC gate). No `ai_signal_bot` section in prod → `ai_signal_enabled=true` defaulted to a dead `ws://localhost:8766` dial while real signals arrive over SHM.
- **Fix:** `config.h` gains `blacklisted_symbols`/`per_symbol_max_qty` + `adaptive_toxic_threshold`; `config_parser.h` parses all three (prod format); `config.cpp` duplicate miswired pressure block removed; `bot_setup.cpp` wires Params + `ap.toxic_threshold`; prod yaml adds `ai_signal_bot.enabled: false` + `toxic_size_threshold` doc; `CONFIGURATION_GUIDE.md` stale `smart_order_router` section removed. 2 doctests added (`test_doctest_hft_config.cpp`).
- **Files:** `hft-trade-bot/src/core/config.h`, `config_parser.h`, `config.cpp`, `bot_setup.cpp`, `config/config.prod.yaml`, `tests/test_doctest_hft_config.cpp`, `docs/guides/CONFIGURATION_GUIDE.md`

### S232 — web-ui facades wired real ✅ · verified R161 · re-verified R189
- **Bug:** Auth accepted any non-empty credentials into an unread localStorage key; 8 feature-flag toggles wrote an orphan `trading-feature-flags` blob (0 readers) — `mock-mode`/`advanced-panels` didn't even touch the real keys; AlertWebhook CRUD had no dispatcher — `_fills`/`_toasts` props ignored.
- **Fix (user decision: wire fully real):** `featureFlags.js` module — 6 flags write real keys + `feature-flag-changed` event; consumers: `useMockData` (`mock-mode`), `PanelContainer` (`trading-sim-advanced-panels` via useFeatureFlag), `useUIStore`/`useSoundAlerts` (sound, App syncs both ways), `useExchangeData` autoConnect (`auto-reconnect`), `detachPanel` gate (`detachable-panels`), OrderForm TRAILING_STOP option (`trailing-stop`). 5 unwireable backend-strategy toggles removed. Auth.jsx — real token probe: `{type:'auth'}` on a throwaway socket → `auth_ok` stores `trading-sim-auth-token` + `auth-token-changed` event → live socket reconnects with it; `auth_failed`/timeout never marks Authenticated; register-mode facade removed. AlertWebhook — dispatcher: new fills POST fill/sl_tp/liquidation (classified via new server-side `close_reason` on fills_batch), price-alert toasts → price_alert, UTC-midnight rollover → daily_summary; mount-seed fills treated as history (no replay spam). 7 regression tests (3 webhook dispatch, 4 auth flow) + facade-era tests rewritten.
- **Files:** `web-ui/src/featureFlags.js` (new), `components/{Auth,FeatureFlags,AlertWebhook,OrderForm}.jsx`, `panels/PanelContainer.jsx`, `hooks/{useDetachablePanels,useExchangeData}.js`, `App.jsx`, `exchange_simulator/ws_broadcast.py` (close_reason), tests `auth/featureFlags/alertWebhook/App.test.jsx`

### S231 — `useWebSocket` hollow API fixed ✅ · verified R161 · re-verified R189
- **Bug:** `perMessageDeflate:true` sent `['permessage-deflate']` as a WebSocket SUBPROTOCOL (never negotiates extensions); `reconnectCount++` incremented in `onopen` while the cap was checked in `onclose` — a never-connecting server retried forever; `error` returned but no prod consumer destructured it; ring-buffer/batch API had zero consumers.
- **Fix:** dead knobs removed (`perMessageDeflate`, `batchTypes`, `batchInterval`, `maxBufferSize`, `getBufferedMessages`, `clearBuffer`, `bufferSize`, `queueSize`); attempts counted per onclose failure → `maxReconnects` actually caps (regression-tested); `isRetryRef` distinguishes auto-retry from manual `connect()` (which resets the budget); `disconnect()` sets `manualCloseRef` — no more auto-reconnect after manual close; `error` wired to `useExchangeData.lastError` → toast pipeline. 3 new tests (no bogus subprotocol, cap-reachable, disconnect-stays-down); buffer tests removed with the API.
- **Files:** `web-ui/src/hooks/useWebSocket.ts`, `hooks/useExchangeData.js`, `test/useWebSocket.test.jsx`

### S212 — msgpack negotiation honored on broadcasts ✅ · verified R161 · re-verified R185
- **Bug:** `_client_encodings` was honored only by `_send_json`; all hot broadcasts (candles/fills_batch/audit_logs/arb) sent `orjson.dumps` BYTES to every client — binary frames that any msgpack-installed client tried to `unpackb` → total feed loss for JSON clients too.
- **Fix:** `_encode()` returns str for JSON (TEXT frame) / bytes for msgpack (binary); `_encoded_variants()` pre-encodes shared payloads per negotiated encoding; audit-drain, fills_batch, arb, and the per-client market-data path all send the negotiated variant; `_send_json` unified on the same helper; protocol_version stamping preserved. 4 regression tests in `test_ws_broadcast.py` (text frame to json client, binary to msgpack, mixed-client fan-out, `_send_json` honors encoding).
- **Files:** `exchange_simulator/ws_broadcast.py`, `tests/test_ws_broadcast.py`

### S257 — stale doc claims corrected ✅ · verified R161 · re-verified R189
- **Bug:** PERFORMANCE kept a struck-through "Rust HFT Executor" benchmark table for the deleted crate; ARCHITECTURE said "min 2 of 5 enabled strategies" (6 implemented, 4 default); WEBSOCKET_PROTOCOL documented msgpack as point-sends-only (stale the other way post-S212); MONITORING helm snippet needed re-verification.
- **Fix:** Rust section + struck row deleted from PERFORMANCE.md; ARCHITECTURE ensemble line → "min 2 votes across enabled strategies; 6 implemented, 4 default" (dedup paragraph already correct); WEBSOCKET_PROTOCOL encoding section rewritten for post-S212 behavior (text-vs-binary frame discrimination, msgpack fallback note); MONITORING snippet verified against `helm/templates/ai-signal-bot.yaml` (/live+/ready on `ports.health`) — already correct, no edit.
- **Files:** `docs/PERFORMANCE.md`, `docs/ARCHITECTURE.md`, `docs/WEBSOCKET_PROTOCOL.md`

**Gate:** `pre-commit-check.py` 8/8 ALL GREEN.

## Round 156 — slop-fix (4 closed, S309 deferred — no Docker daemon)

### S259 — dead `walk_forward.py` duplicate removed ✅ · verified R158 · re-verified R188
- **Bug:** `ai-signal-bot/src/backtesting/walk_forward.py` (201 lines) was a parallel `WalkForwardAnalyzer` engine invisible to prod — `backtest_requests.py`/`run_backtest.py` call `StrategyOptimizer.walk_forward` (`optimizer.py`); only `tests/unit/{test_backtest,test_walk_forward}.py` imported it (the test_backtest one a dead import — never used). `backtesting/__init__.py` also re-exported `BacktestResult as BacktestEngineResult` in `__all__` — zero references.
- **Fix:** module deleted; `test_walk_forward.py` rewritten against the live `StrategyOptimizer.walk_forward` — 5 tests covering window stepping (each `backtester.run` sees only the test slice), insufficient-data→`[]`, per-window failure isolation, params propagation into `strategy_class(**params)`, fitness on every result. Dead import dropped from `test_backtest.py:9`; `BacktestEngineResult` import+`__all__` entry removed from `__init__.py`.
- **Files:** `ai-signal-bot/src/backtesting/walk_forward.py` (deleted), `src/backtesting/__init__.py`, `tests/unit/test_walk_forward.py` (rewritten), `tests/unit/test_backtest.py`

### S266 — mock accounts now match the wire contract ✅ · verified R158 · re-verified R188
- **Bug:** `mockData.js` generated `accounts[].positions` as a symbol-keyed **map** while the wire sends a **list** (`models.py:438`); `CostBasis` iterated it → TypeError, `AccountPanel`/`BotStatus` `.length` → always 0. The mock also invented `margin`/`free_margin`/`unrealized_pnl`/`realized_pnl` account fields the real `to_dict` never sends, and omitted `total_pnl`/`win_rate`/`trade_history` — mock mode validated a shape the feed doesn't have.
- **Fix:** `generateAccounts` emits the real `Account.to_dict` shape (exchange/balance/equity/currency/leverage/positions-list/trade_history/total_pnl/total_fees/total_trades/winning_trades/win_rate); `maybeUpdatePosition` uses findIndex/splice/push, books closes into `total_pnl`+`total_trades`+`trade_history` (20-cap like the wire), positions carry `stop_loss`/`take_profit`/`opened_at`/`margin`; `useMockData.closePosition` splices by symbol. `MultiAccountView` no longer reads phantom `acc.unrealized_pnl`/`realized_pnl` (uPnl=equity−balance, rPnl=`total_pnl`); 5 components moved off `Object.values(acc.positions||{})` — the map-tolerant idiom that hid the bug — onto `(acc.positions||[])`. 2 regression tests (positions is list; stays list through updates).
- **Files:** `web-ui/src/utils/mockData.js`, `hooks/useMockData.js`, `components/MultiAccountView.jsx`, `components/{AutoRebalance,HedgingSuggestions,LiquidationCascade,LiquidationMap,PnLAttribution}.jsx`, `test/{mockData.test.js,useMockData.test.jsx}`

### S261 — `useToasts` dead dup removed; perf alerts wired ✅ · verified R158 · re-verified R188
- **Bug:** `Toast.jsx` exported a local-state `useToasts` duplicate of `useToastStore` — only `toast.test.jsx` consumed it (prod uses the store via `App.jsx:101`). In `performanceMonitor.js`, `checkBudgets`/vitals handlers fired `triggerAlert` into an always-empty `alertCallbacks` list — budget violations were silently dropped; `getMetricsHistory` accumulated arrays nobody read; `getPerformanceSummary`/`recordCustomMetric`/`customMetrics` had zero prod consumers.
- **Fix:** `useToasts` deleted from `Toast.jsx`; `toast.test.jsx` migrated to `useToastStore` (+store reset in `beforeEach`). `DashboardProfiler` now subscribes `onAlert`/`offAlert` — immediate over-budget banners alongside the existing 2s `checkBudgets` poll. Dead exports cut: `getMetricsHistory` (+`metricsHistory` store + 5 push sites), `getPerformanceSummary`, `recordCustomMetric` (+`customMetrics` state). Tests rewritten onto the live alert path (`onAlert` fires on over-budget vital, `offAlert` detaches, under-budget silent).
- **Files:** `web-ui/src/components/Toast.jsx`, `components/DashboardProfiler.jsx`, `utils/performanceMonitor.js`, `test/{toast.test.jsx,performanceMonitor.test.js,performance.test.jsx}`

### S269 — `.ts` sources under a real check ✅ · verified R158 · re-verified R188
- **Bug:** `eslint.config.js` matched only `**/*.{js,jsx}` and no gate ran `tsc` — 16 `.ts` files (incl. `useWebSocket.ts`, `useSessionRecorder.ts`, `useStrategyMarketplace.ts`) were outside every static check.
- **Fix:** `web-ui/src/vite-env.d.ts` added (`vite/client` types → fixes `import.meta.env` TS2339); `tsc --noEmit` clean under strict; `typecheck` script in `package.json`; `check_tsc()` added to `scripts/pre-commit-check.py` as a 9th check (staged-aware, runs with the js lint block); CI `lint-js` job now runs `npm run typecheck` after `npm run lint`. No new dependencies — `typescript` was already in devDeps.
- **Files:** `web-ui/{package.json,src/vite-env.d.ts}`, `scripts/pre-commit-check.py`, `.github/workflows/ci.yml`

### S309 — DEFERRED (evidence, not a close)
- Docker Desktop daemon unreachable on this host (`npipe:////./pipe/dockerDesktopLinuxEngine` absent) — `docker compose up` impossible. Static audit: all four `/health` endpoints exist on the CI-curled ports (sim :8775 `websocket_server.py:248`, ai-bot :9090 `metrics.py:410`, hft :9091 sidecar, web-ui :3000 `nginx.conf:26`) and every compose service has a healthcheck for `--wait`. Whether S303's image fix makes the job actually pass needs a live daemon — stays Open with the note on the board.

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN (new `tsc: web-ui` check live).

## Round 157 — slop-fix (5 closed)

### S260 — dead public API in ai-signal-bot cut ✅ · verified R158 · re-verified R188
- **Bug:** six units of public surface with zero production consumers: `simulate_hawkes` (hawkes_funcs.py — Ogata thinning, zero refs incl. tests), `validate_prices` (indicators.py — zero refs), `HawkesResult` (hawkes_model.py — the params/functions are live via analysis_requests, the result class orphaned), `macd` (indicators.py — 2 test trees, 0 prod), `bind_context`/`clear_context` (observability/logging.py — structlog contextvars wrappers existing only for no-crash tests).
- **Fix:** all six deleted at the definition site; `import random` in hawkes_funcs went with `simulate_hawkes`; module docstrings updated. Nothing else referenced them — verified by grep over src/ + tests/ + run*.py.
- **Files:** `ai-signal-bot/src/technical_analysis/{hawkes_funcs,hawkes_model,indicators}.py`, `src/observability/logging.py`

### S267 — tests no longer warm dead code ✅ · verified R158 · re-verified R188
- **Bug:** ~6 test files asserted exclusively on zero-prod-consumer surface — the dead `WalkForwardAnalyzer` (S259), `useToasts` (S261), perf-monitor test-only exports (S261), `bind_context`/`clear_context` no-crash asserts, and `TestMACD` classes in both `test_indicators` trees.
- **Fix:** the S259/S261 legs closed in R156 (tests migrated to live APIs). This round: `TestMACD` + the `macd` import removed from both `tests/unit/test_indicators.py` and `tests/test_indicators.py`; `test_bind_context_no_crash`/`test_clear_context_no_crash` + the dead import removed from `test_observability.py`. Remaining S267 surface: none — the finding's list is fully covered.
- **Files:** `ai-signal-bot/tests/{test_indicators.py,unit/test_indicators.py,unit/test_observability.py}`

### S262 — dead hook variants + phantom installer + orphans ✅ · verified R158 · re-verified R188
- **Bug:** `scripts/pre-commit-hook.{sh,bat}` + `commit-msg-hook.{sh,bat}` (~118 lines) claimed "Installed by install-hooks.{sh,bat}" — but `install-hooks.sh` never existed and `install-hooks.bat` installs only the `*-git.sh` twins; the `.bat` variants are doubly dead (git can't spawn .bat hooks). `.pre-commit-config.yaml` referenced the phantom `install-hooks.sh`. `scripts/ci-equivalence.py` + `scripts/health-check.py` had zero references in docs/Makefile/CI/docker.
- **Fix:** six files deleted; `.pre-commit-config.yaml` comment now documents the real install path (`install-hooks.bat` → `*-git.sh` via git's sh spawn). Canonical hook `pre-commit-hook-git.sh` untouched.
- **Files:** `scripts/{pre-commit-hook.sh,pre-commit-hook.bat,commit-msg-hook.sh,commit-msg-hook.bat,ci-equivalence.py,health-check.py}` (deleted), `.pre-commit-config.yaml`

### S264 — deploy.yml notify gates read the right context ✅ · verified R158
- **Bug:** `if: vars.DISCORD_WEBHOOK_URL != ''` / `vars.TELEGRAM_BOT_TOKEN != ''` gated steps whose values come from `secrets.*` — secrets aren't allowed in `if:` conditions, so the author reached for `vars`; an operator setting only the secrets (the natural place) gets notifications silently skipped forever, and the pattern nudges a bot token into unmasked `vars`.
- **Fix:** both secrets hoisted to job-level `env:` (`DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`) — allowed there — and the step gates now read `env.*`. Notifications fire when the secrets are actually set.
- **Files:** `.github/workflows/deploy.yml`

### S265 — ci.yml dead gate removed + websocketpp pinned ✅ · verified R158
- **Bug:** `audit-deps` ran `npm audit --audit-level=high` (already non-zero on high/critical) then a second step grepped `|| true` output for "critical|high" — unreachable dead check. `test-cpp-msvc` cloned `zaphoyd/websocketpp` at unpinned HEAD while the vcpkg clone beside it was commit-pinned.
- **Fix:** dead second step deleted (the single real gate remains); clone pinned `--branch 0.8.2 --depth 1` (last stable release, matching the repo's dormant upstream).
- **Files:** `.github/workflows/ci.yml`

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN.

## Round 159 — slop-fix (8 closed)

### S272 — dead MetricsExporter setters wired to live producers ✅ · verified R161 · re-verified R189
- **Bug:** 17 of ~25 exporter methods never called → three Grafana dashboards + six alert rules rendered eternal zeros; dashboard queried `trading_signals_total` (dead `record_signal`) while the publisher incremented `ai_signal_bot_signals_sent_total`.
- **Fix:** wired real producers — `record_signal` (symbol/direction/confidence) + `observe_signal_latency` (creation→broadcast) in `broadcast_signal`; `record_fill` in `_on_shm_fills`; `record_order_sent`/`record_order_rejected`/`observe_order_latency` in `_execute_live_order`; `update_pnl`/`update_positions`/`update_ws_status`/`set_bot_drawdown`/`set_bot_win_rate`/`set_bot_pnl_total`/`set_bot_uptime`/`record_error` in `_snapshot_equity` + error paths; `update_shm_buffer` reads ring `.pending()`. Cut what has no honest producer: `observe_shm_round_trip` (SHM fills carry `signal_id=None` — no correlation key), `observe_position_hold_time`, `reset_kill_switch` (no reset path — gauge latches honestly). DB gained equity-history/stat queries to feed the setters.
- **Files:** `ai-signal-bot/run.py`, `src/monitoring/metrics.py`, `src/communication/{signal_publisher,metrics_server}.py`, `src/database/db.py`, `tests/unit/test_monitoring_metrics.py`

### S288 — alert rules now have live producers ✅ · verified R161 · re-verified R189
- **Bug:** 6 `alerts.yml` rules (`HighBotErrorRate`/`CriticalBotErrorRate`/`HighDrawdown`/`CriticalDrawdown`/`LowWinRate`/`NegativePnL`) queried metrics whose setters were dead — `CriticalDrawdown >15%` could never fire.
- **Fix:** closed by the S272 wiring — `record_error`, `set_bot_drawdown`, `set_bot_win_rate`, `set_bot_pnl_total` now called from `_snapshot_equity` and the live-order error paths every tick.
- **Files:** `ai-signal-bot/run.py`, `src/monitoring/metrics.py`

### S292 — MetricsCollector fallback interface completed ✅ · verified R161 · re-verified R189
- **Bug:** `record_kill_switch` (and the other bot-* setters) existed on `MetricsExporter` but not the `MetricsCollector` fallback → first kill-switch activation without `--metrics` raised `AttributeError` in the unguarded consumer callback.
- **Fix:** fallback collector now exposes the full producer surface the bot calls (kill-switch, drawdown, win-rate, pnl, uptime, fills, orders, signals, errors, shm buffer) — same names, same signatures.
- **Files:** `ai-signal-bot/src/communication/metrics_server.py`

### S290 — `no_fills` alert rule un-dead ✅ · verified R161 · re-verified R190
- **Bug:** `run.py` called `self.tracker.uptime_seconds()` — it's a `@property`, so every rule eval raised `TypeError`, swallowed by `check_rules` → the WARNING could never fire. Wiring test hid it (`SimpleNamespace(uptime_seconds=lambda: 0)`).
- **Fix:** property access without parens; all 3 test mocks changed to `uptime_seconds=0` (attribute, matching prod shape).
- **Files:** `ai-signal-bot/run.py`, `tests/unit/test_shm_alerting_wiring.py`

### S275 — BotStatus circuit-breaker section live ✅ · verified R161 · re-verified R190
- **Bug:** `registry.js` read `ctx.exchange.circuitBreaker` — field lives on `ctx.signals` → section rendered "No data" forever; real trips invisible.
- **Fix:** `ctx.signals.circuitBreaker`.
- **Files:** `web-ui/src/panels/registry.js`

### S276 — wire-field drift fixed across 11 components ✅ · verified R161 · re-verified R190
- **Bug:** panels written against invented field names — `realized_pnl` (real: `pnl`), `timestamp`/`time` (real: `closed_at`), `order_id`/`filled_qty`/`fill_price` (real: `id`/`filled_quantity`/`filled_price`), `f.pnl` on fills (Order wire has none), account `unrealized_pnl` (not emitted).
- **Fix:** SessionReportExport uses `pnl`/`closed_at` (win-rate/profit-factor/dates now real); DrawdownAnalysis reads closed-trade history not order fills; TaxReport switched to `accounts.trade_history` for realized PnL; TradeReplay/AuditTrail/TickReplay/CostBasis/MarketDepthReplay use `id`/`filled_quantity`/`filled_price`; PerformanceAttribution buckets on `closed_at`+`pnl` (1970-Thursday bucket gone); StatusBar derives uPnl=equity−balance; AlertWebhook drops dead `order_id` fallbacks; mock `generateFill` emits the real Order contract; registry props updated (TaxReport gets accounts, TradeReplay gets live data).
- **Files:** `web-ui/src/components/{SessionReportExport,DrawdownAnalysis,TaxReport,PerformanceAttribution,TradeReplay,AuditTrail,TickReplay,CostBasis,MarketDepthReplay,StatusBar,AlertWebhook}.jsx`, `web-ui/src/panels/registry.js`, `web-ui/src/utils/mockData.js`

### S284 — fixtures repaired to the real wire schema ✅ · verified R161 · re-verified R190
- **Bug:** 5 test files fed panels fantasy fields (`order_id`/`filled_qty`/`price`, `pnl` on fills) — the suite enforced the drift instead of catching it.
- **Fix:** `auditTrail`/`tickReplay`/`costBasis`/`drawdownAnalysis`/`taxReport` fixtures rewritten to `id`/`filled_quantity`/`filled_price`, realized-PnL moved to trade_history shape. `useSessionRecorder.test:50` (S278 assertion) left for the S278 round.
- **Files:** `web-ui/src/test/{auditTrail,tickReplay,costBasis,drawdownAnalysis,taxReport}.test.jsx`

### S270 — coverage gate now measures the whole source tree ✅ · verified R161 · re-verified R190
- **Bug:** `coverage.include` was `['src/utils/**','src/hooks/**']` — the ~290-file untested mass was invisible to the denominator; the 40% gate could never trip on real regressions.
- **Fix:** include widened to `src/**` (excl. tests/deps); thresholds ratcheted to the measured floor (~25% lines/statements, ~24% functions/branches); TESTING.md updated to match the real gate scope.
- **Files:** `web-ui/vitest.config.js`, `docs/TESTING.md`

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN (ruff×2, eslint, tsc, clang-format, pytest×2 = 1414+..., vitest 1093, config).

## Round 160 — slop-fix (6 closed)

### S281 — order-status counters count real enum values ✅ · verified R163 · re-verified R185
- **Bug:** `ws_prometheus.py:129-130` compared `o.status.value` against lowercase `"filled"`/`"rejected"` while `OrderStatus` stores `"FILLED"`/`"REJECTED"` → `exchange_orders_filled_total`/`exchange_orders_rejected_total` were eternal zeros (ported from never-started `health.py` with the case bug).
- **Fix:** uppercase comparisons matching the codebase idiom (`o.status.value == "FILLED"`); regression test feeds real `OrderStatus` values through the exposition path.
- **Files:** `exchange_simulator/ws_prometheus.py`, `tests/test_ws_prometheus.py`

### S289 — exchange ratio alerts un-dead ✅ · verified R163 · re-verified R190
- **Bug:** `HighOrderRejectionRate` (`rejected/submitted > 0.1`) could never fire and `LowFillRate` (`filled/submitted < 0.8` for 10m) fired permanently — both fed by S281's eternal-zero metrics. Crying wolf + blind spot.
- **Fix:** closed by the S281 fix — the PromQL was correct, the data was dead; both metrics now report real counts.
- **Files:** `exchange_simulator/ws_prometheus.py` (no alerts.yml change needed)

### S215 — deploy.sh native brokenness ✅ · verified R163 · re-verified R190
- **Bug:** `cd exchange_simulator && python -m exchange_simulator` (can't import a package from inside itself); `pkill -f "ai_signal_bot"` never matches `python run.py` → stop/restart left a live bot; `ENVIRONMENT` read+logged but never branched; `docker-compose` v1 (EOL) ×4.
- **Fix:** sim starts from repo root; stop is pid-file driven (files start_native already wrote); `ENVIRONMENT=dev|production` now selects `settings.testnet.yaml`/`config.yaml` vs `settings.yaml`/`config.prod.yaml` — matching the compose mounts; all compose calls on `docker compose` v2.
- **Files:** `scripts/deploy.sh`

### S295 — deploy.sh native health-gate reachable ✅ · verified R163
- **Bug:** `start_native` ran bare `python run.py` (no `--metrics`, `metrics.enabled: false`) → HealthServer never started → `:8080/ready` failed all 30 retries → guaranteed `exit 1`; web check curled `:3000/health` — vite preview SPA-fallbacks 200 on any path; `status` grepped a non-matching pattern.
- **Fix:** ai-bot starts `--metrics --config "$AI_CONFIG"` (mirrors docker-compose.yml:82); web check is mode-aware (docker `/health` vs native `id="root"` marker); `status` reports from pid files.
- **Files:** `scripts/deploy.sh`

### S296 — deploy.bat can fail + can stop ✅ · verified R163
- **Bug:** health loop logged per-service warns but never aggregated → returned success after 30 iterations regardless; `taskkill /FI "WINDOWTITLE eq …"` matches nothing under `start /B` (shared console) → stop killed nothing; same-family: broken-from-inside sim start, no `--metrics`, `docker-compose` v1, vacuum `:3000/health`.
- **Fix:** health check aggregates `HEALTHY` per round, breaks early on all-4, exits non-zero on failure; stop kills by CIM `Win32_Process` commandline match (python `-m exchange_simulator`/`run.py --metrics`, node `vite preview`) + `taskkill /IM` for the exe; same start/config/compose fixes as deploy.sh.
- **Files:** `scripts/deploy.bat`

### S298 — build-all.bat permanently-red checks fixed ✅ · verified R163
- **Bug:** `python -c "import exchange_simulator"` ran from inside the package dir → guaranteed ModuleNotFoundError that also skipped the sim test suite; `cross_exchange_arb`/`marketplace` imports never existed.
- **Fix:** import check runs from repo root (tests still run from the package dir); phantom imports replaced with real modules — `funding_arb_detector.FundingRateArbitrageDetector`, `statistical_arbitrage.StatisticalArbitrage` — all three verified live.
- **Files:** `build-all.bat`

**Deferred:** S309 — Docker daemon still unreachable on this host (npipe missing); static verification from R156 stands.

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN.

## Round 162 — slop-fix (5 closed)

### S280 — broadcast loop contained + update_config validated ✅ · verified R163
- **Bug:** `_broadcast_loop` had zero try/except — any exception in `next_candle()`/arb/serialization killed the task silently while `/health` stayed green. `_handle_update_config` wrote `updates["volatility"][symbol]` straight into `market._volatility` unchecked → string → `sigma = "abc" / sqrt_cpy` TypeError in the tick path → feed dead (dev: unauthenticated, prod: authed-DoS).
- **Fix:** tick body wrapped — `logger.exception` + 1s backoff + continue (CancelledError still propagates). `_valid_number` gate rejects non-finite/non-numeric (bool/nan/str) writes for volatility/fees/slippage/leverage; rejected keys reported in `config_updated.rejected`. 3 regression tests (non-numeric reject, NaN reject, loop survives tick failure).
- **Files:** `exchange_simulator/ws_broadcast.py`, `ws_message_handler.py`, `tests/test_websocket_server.py`

### S304 — hub compose runs the prod-image path ✅ · verified R163
- **Bug:** `docker-compose.hub.yml` hft command `./build/hft_trade_bot config/config.yaml` — dev-layout path absent from the `Dockerfile.prod` runtime stage (binary at `/app/hft_trade_bot`) → service could never start via hub. Staging header claimed "Signal Engine V3 enabled (HMM)" with nothing enabling it; staging grafana had no provisioning mounts → empty Grafana under a monitoring claim.
- **Fix:** hub command → `/app/hft_trade_bot config/config.prod.yaml` (env `HFT_EXCHANGE_WS_URL` resolves identically). Staging: V3 header line removed; grafana mounts `monitoring/grafana/{datasources,dashboards}` + `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH` (matches main compose).
- **Files:** `docker-compose.hub.yml`, `docker-compose.staging.yml`

### S302 — Makefile dev-exchange works + compose v2 ✅ · verified R163
- **Bug:** `dev-exchange` ran `cd exchange_simulator && python -m exchange_simulator` — guaranteed ModuleNotFoundError (5th broken-from-inside site); `dev`/`docker-up`/`docker-down`/`docker-hub` called EOL `docker-compose` v1.
- **Fix:** `dev-exchange` runs `python -m exchange_simulator --no-visualizer` from repo root; all four targets use `docker compose`.
- **Files:** `Makefile`

### S305 — CONTRIBUTING/CHANGELOG truth pass ✅ · verified R163
- **Bug:** `CONTRIBUTING.md` pointed at deleted `start.bat` in two quick-start blocks and claimed prod-compose carries PostgreSQL/Redis (it ships Prometheus/Alertmanager/Grafana only). CHANGELOG versions don't map to any shipped version.
- **Fix:** both blocks now name `no-docker.bat` + `docker compose`; install note → `no-docker.bat install`; prod-compose comment corrected; CHANGELOG gains a versioning note explaining dated `[Unreleased]` sprints vs component versions (package.json 2.2.0, `__version__` 1.0.0).
- **Files:** `CONTRIBUTING.md`, `CHANGELOG.md`

### S306 — WEB_UI.md dead launchers ✅ · verified R163
- **Bug:** "Use `start.bat`/`start.sh` to launch all 4 services + 4 monitors in 8 terminal windows" — both files deleted, the 8-window count was never true, real launchers unnamed.
- **Fix:** line now names `no-docker.{bat,sh}` / `docker compose up` and states monitors run as separate commands.
- **Files:** `docs/WEB_UI.md`

**Stale queue entries removed:** S279 (fixed R147), S162 (verified R96 — control-point note, not an open row).

**Deferred:** S309 — Docker daemon still unreachable.

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN.

### S274 — MarketDepthReplay replays the real orderbook prop ✅ · verified R166
- **Bug:** `orderbooks: _orderbooks` — the real prop deliberately ignored while the panel synthesized a 10-level book from candle OHLC (`mid ± spread×levels` + jitter): a "depth replay" of depth that never existed. Bonus: `f.timestamp || f.received_at` mixed seconds vs ms in the fill-join window.
- **Fix:** panel renders the real `ctx.exchange.orderbooks` book for the replayed symbol — labeled as the live book (no client-side L2 history exists on the wire, so a true depth replay cannot be honest); candle+fill replay still scrubs real data. `f.timestamp` normalized s→ms before the join.
- **Files:** `web-ui/src/components/MarketDepthReplay.jsx`, `web-ui/src/test/marketDepthReplay.test.jsx`

### S233 — notification diffs survive the 50-cap ✅ · verified R166
- **Bug:** new-event detection was `len - prevLen`; `fills`/`signals` hard-cap at `.slice(0,50)` in `useExchangeData` → once saturated, length stays 50 → fill + strong-signal toasts permanently silent while events stream.
- **Fix:** diff by head-identity (first element's timestamp+symbol+direction / fill key) instead of array length — a new head fires regardless of cap saturation. Tests model the real newest-first producer order + a cap-saturation regression test.
- **Files:** `web-ui/src/hooks/useNotifications.js`, `web-ui/src/test/useNotifications.test.jsx`

### S234 — registry addToast passes the real function through ✅ · verified R166
- **Bug:** 12 panels got `addToast: (type,msg) => ctx.addToast({type, title: msg})`; the store's object branch renders `` `${title}: ${message}` `` with `message` undefined → every toast read "…: undefined".
- **Fix:** all 12 sites pass `ctx.addToast` through directly — the store's positional `(type, message)` branch already handles the panel contract.
- **Files:** `web-ui/src/panels/registry.js`

### S235 — detachable panels cut to the reachable surface ✅ · verified R166
- **Bug:** `PANEL_CONFIG` declared 6 panels and `updatePopupContent` rendered all 6, `useDetachedPanelSync` synced 5 — but only `chart`/`orderbook` have `<DetachablePanel>` wrappers → account/signals/arbitrage/performance branches unreachable (`handleDetach` dataMap didn't even carry 'performance'). `BroadcastChannel('trading-sim-panel')` posted into a channel nobody listens on. `:41` used a real blocking `alert('Popup blocked…')`.
- **Fix:** config + renderers + sync trimmed to chart/orderbook; BroadcastChannel removed; popup-blocked notice routed through `useToastStore` instead of `alert()`. Tests updated to the real surface.
- **Files:** `web-ui/src/hooks/useDetachablePanels.js`, `useDetachedPanelSync.js`, `App.jsx`, `web-ui/src/test/useDetachablePanels.test.jsx`, `useDetachedPanelSync.test.jsx`

### S250 — dead HFT infra cut + GTD branch wired ✅ · verified R166
- **Bug:** `ObjectPool`/`CircuitBreaker`/`RetryPolicy` (~150 lines in `low_latency.h`) instantiated only by doctests — the S152 pattern. `bot_loop.cpp` passed `top5_depth=0.0` → the GTD branch in `AdaptiveOrderSelectorV2::select` was unreachable, so `expire_ms` never reached the wire despite full executor plumbing. `ShmMarketData::write_*` had zero prod callers.
- **Fix:** three dead classes deleted + their test cases + `<random>` include; `select_order_kind` now computes real top-5 depth from the side the order crosses (`ob.asks` for buys, `ob.bids` for sells) → GTD selectable, `expire_ns` flows to the `expire_ms` wire field; shm header comment corrected (C++ is consumer-only — `write_*` is the protocol encoder mirrored by the Python writer + doctest fixture); stale `TestCircuitBreakerInit` banner over a RiskManager test fixed; CMakeLists comment updated.
- **Files:** `hft-trade-bot/src/utils/low_latency.h`, `src/core/bot_loop.cpp`, `src/ipc/shm_market_data.h`, `tests/test_v2_infra.cpp`, `test_doctest_cpp_optimizations.cpp`, `test_doctest_risk_manager.cpp`, `CMakeLists.txt`

### S225 — fake `--paper` flag removed ✅ · verified R166
- **Bug:** `scripts/run.py` appended `--paper` as argv[2]; `init_config_and_logger` reads only argv[1] (config path) and `main.cpp` has no flag parser → silently ignored. No paper/live concept exists in the C++ config at all — the bot only ever trades the simulator.
- **Fix:** flag + usage line removed.
- **Files:** `hft-trade-bot/scripts/run.py`

### S213 — arb detector can actually fire ✅ · verified R166
- **Bug:** every exchange's price was `base × fixed_offset` (≤4bps, constant ratio) → `best_bid(B) <= best_ask(A)` always after ~19bps fee+slippage cost → `scan()` structurally ∅; auto-exec (`spread_bps > 20`) unreachable; arb panel eternally empty.
- **Fix:** per-(exchange,symbol) mean-reverting deviation (OU: kappa=0.12, sigma≈6bps) lets venue prices genuinely diverge — verified: 9 opportunities over 400 candles, best 22.6bps (crosses the >20bps auto-exec path). Deviation runs off `self.rng` → seed determinism preserved. 2 regression tests (fires over run + bounded deviation).
- **Files:** `exchange_simulator/market_simulator.py`, `tests/test_arbitrage.py`

### S221 — exchange_orders_*_total are real counters now ✅ · verified R166
- **Bug:** `submitted`/`filled`/`rejected` were windowed `len()`/status-sums over `deque(maxlen=10000)` — `submitted` pins at 10000, `filled`/`rejected` regress on eviction → non-monotonic `_total` breaks `rate()`/`increase()`; no HELP/TYPE lines.
- **Fix:** `_CountingOrderHistory` keeps cumulative counters; `Order.__setattr__` reports post-append transitions (same object sits in pending dicts + history) so PENDING→FILLED counts at transition time; exporter emits cumulative values with `# HELP`/`# TYPE counter`. Regression test covers eviction + in-place fill.
- **Files:** `exchange_simulator/exchange.py`, `models.py`, `ws_prometheus.py`, `tests/test_ws_prometheus.py`

### S219 — audit.log rotation + held-open sink ✅ · verified R166
- **Bug:** every `log()` did `open()/write()/close()` — a syscall per event on a path firing hundreds/sec; `logs/audit.log` had no rotation → unbounded growth.
- **Fix:** `RotatingFileHandler` (10MB × 5, config-wired `audit.max_file_bytes`/`backup_count`) on a per-instance logger — held-open stream + size-cap rotation. `AuditLogger.close()` releases the handler; tests moved to `tmp_path` (the open handle blocked `TemporaryDirectory` teardown on Windows).
- **Files:** `exchange_simulator/audit_logger.py`, `__main__.py`, `tests/test_audit_logger.py`

### S226 — scripts/ci un-orphaned + test.sh can fail ✅ · verified R166
- **Bug:** `scripts/ci/` (8 files) invoked by nothing; `test.sh` warned-and-skipped missing pytest/vitest without incrementing FAIL → exit 0 executing zero tests; and ran only `ai-signal-bot/tests/` — all 31 exchange_simulator files never executed.
- **Fix:** missing tools now increment FAIL; exchange_simulator suite added; `make ci-full` wires `run-all.sh` into the reachable surface.
- **Files:** `scripts/ci/test.sh`, `Makefile`

## R167 — slop-fix — 6 findings closed

**Gate:** `pre-commit-check.py` 9/9 ALL GREEN (staged-hook run for the
tools commit used the documented `WD_SKIP_COVERAGE=1` — live-server
harnesses are un-unit-testable by design).

### S229 — SimulatorAdapter correlates replies by id, not FIFO ✅ · verified R169
- **Bug:** `_recv_loop` popped the head pending future on ANY `fill`/`error`/`order_cancelled`; the sim broadcasts every fill to all *other* clients → a stranger's fill resolved our future, `place_order` returned a foreign order dict.
- **Fix:** `_pending_orders` keyed by correlation id (auto-generated `sim-<uuid>` client_order_id per order, `order_id` for cancels); broadcast messages without a matching key ignored; `error` replies stay FIFO via `_request_order` (direct-addressed only). Regression test: foreign fill no longer resolves a pending order.
- **Files:** `ai-signal-bot/src/data_collection/exchange_factory.py`, `tests/unit/test_exchange_factory.py`

### S273 — dead tfvars db_password removed ✅ · verified R169
- **Bug:** `terraform/environments/{dev,prod}/terraform.tfvars.example` set `db_password` with zero `variable` blocks and zero DB resources in the roots — undeclared-variable warning into nowhere, plus a password literal in dev.
- **Fix:** both example files deleted.
- **Files:** `terraform/environments/{dev,prod}/terraform.tfvars.example`

### S277 — marketplace strategies reach the backtest engine ✅ · verified R169
- **Bug:** `trading-sim-strategy-marketplace` packages were stored/imported/exported but nothing could run them — zero run/load/apply actions; the backtest read a different key.
- **Fix:** `listMarketplaceStrategies()` exported (built-ins + imported); `StrategyBacktest` gained a library select merging builder saves + marketplace packages into runnable `rules` (identical condition vocabulary); aria-labels disambiguate the selects.
- **Files:** `web-ui/src/hooks/useStrategyMarketplace.ts`, `web-ui/src/components/StrategyBacktest.jsx`, `web-ui/src/test/strategyBacktest.test.jsx`

### S278 — SessionRecorder totalTrades no longer N_snapshots× inflated ✅ · verified R169
- **Bug:** `stopRecording` summed `acc.trade_history.length` across every snapshot, but history is cumulative → count multiplied by snapshot count.
- **Fix:** `totalTrades` reads the last snapshot's cumulative history length per account. Regression test: grown history → final count, not the sum.
- **Files:** `web-ui/src/hooks/useSessionRecorder.ts`, `web-ui/src/test/useSessionRecorder.test.jsx`

### S282 — live-server harnesses unmasqueraded from tests/ ✅ · verified R169
- **Bug:** 5 files (~1200 lines) in `exchange_simulator/tests/` — three `test_*.py` with zero `def test_*` (pytest imported, ran nothing), two non-matching names never collected.
- **Fix:** moved to `exchange_simulator/tools/` under honest names (`chaos_enhanced.py`, `chaos_reconnect.py`, `load_10k.py`, `stress_load.py`, `load_50_symbols.py`); usage docstrings updated; `chaos_enhanced` `project_root` fixed (was `exchange_simulator/` — one level short, sim subprocess could never launch); `TESTING.md` paths updated.
- **Files:** `exchange_simulator/{tests→tools}/*`, `docs/TESTING.md`

### S283 — stress/load harnesses use the real WS protocol ✅ · verified R169
- **Bug:** `stress_test.py` POSTed orders to `http://localhost:8765/api/v1/orders` and `load_test_50_symbols.py` GET `/symbols` + `/orderbook/` — a REST API the sim has never had → guaranteed 100% errors.
- **Fix:** rewritten to the actual protocol — orders as `{"type":"order"}` on a shared WS with fills correlated by `client_order_id` and direct `error` replies; latency via `ping`→`pong` round-trip; the orderbook-REST test became a broadcast symbol-coverage measurement (no orderbook request type exists).
- **Files:** `exchange_simulator/tools/stress_load.py`, `tools/load_50_symbols.py`

## R168 — slop-fix — 5 findings closed

### S285 — integration tests run against a real in-process sim ✅ · verified R169
- **Bug:** every `test_integration.py` sim-dependent test did `pytest.skip` without a live sim on :8765 — CI jobs never started one, so the WS path was green-because-never-run. `ExchangeClient.connect()` also never consumed frames.
- **Fix:** `sim_server` fixture boots a real `ExchangeWebSocketServer` on 127.0.0.1:18765 (MarketSimulator + SimulatedExchange, audit log to tmp_path); tests consume the `welcome` frame and drive `ExchangeClient.listen()` as a task.
- **Files:** `ai-signal-bot/tests/test_integration.py` — 12 passed.
- **Commit:** 4a79b00

### S286 — zombie import tests removed ✅ · verified R169
- **Bug:** `test_monitoring_llm.py` had import-checks for `src.data_collection.market_replay` / `timescaledb_client` — modules that never existed; each armored with `ModuleNotFoundError -> pytest.skip`.
- **Fix:** both tests + stale docstring reference removed.
- **Files:** `ai-signal-bot/tests/unit/test_monitoring_llm.py`
- **Commit:** 4a79b00

### S287 — raw assert() converted to doctest ✅ · verified R169
- **Bug:** 79 raw `assert()` in `test_shm.cpp` / `test_monitoring.cpp` / `test_network.cpp` / `test_signal_flow.cpp` compiled to nothing under `-DNDEBUG` — Release ctest runs were vacuous greens.
- **Fix:** converted to `TEST_CASE` + `REQUIRE` (doctest, NDEBUG-independent, abort-on-failure preserved); targets moved to `add_doctest_test`; hand-rolled `main()`s + `[PASS]` prints dropped. Verified: `g++ -DNDEBUG` build runs and reports all cases.
- **Files:** `hft-trade-bot/tests/{test_shm.cpp,unit/test_monitoring.cpp,unit/test_network.cpp,integration/test_signal_flow.cpp}`, `hft-trade-bot/CMakeLists.txt`
- **Commit:** 27bfe62

### S293 — follow_threshold wired end-to-end ✅ · verified R169 · re-verified R197
- **Bug:** `SentimentConfig.follow_threshold` was read at sentiment.py:198/:202 but had no `SignalBotConfig` property, no yaml key, no `bot_helpers` passthrough — pinned at 0.3.
- **Fix:** `sentiment_follow_threshold` property (default 0.3), `follow_threshold` keys in settings.yaml + settings.testnet.yaml, passthrough in `build_strategies`; S117 tunables regression extended.
- **Files:** `ai-signal-bot/config/__init__.py`, `config/settings{,.testnet}.yaml`, `src/utils/bot_helpers.py`, `tests/unit/test_bot_helpers.py`
- **Commit:** 15412eb

### S294 — --tests now runs ctest; staged mode honest about deferral ✅ · verified R169 · re-verified R197
- **Bug:** `check_cpp_build_and_test` ran only under `--full`/`--all`, so the documented `--tests` mode never ran ctest and staged `.cpp` commits got clang-format + green with zero build/test; header/CI-map implied equivalence that didn't exist.
- **Fix:** gate condition admits `args.tests`; staged/quick prints an explicit `[SKIP] cmake+ctest` note naming covering modes; docstring states per-mode equivalence.
- **Files:** `scripts/pre-commit-check.py`
- **Commit:** c58517f

## R170 — slop-fix — 10 findings closed

### S316 — shared_config.yaml is now honest gate-reference, not dead authority ✅ · verified R173 · re-verified R197
- **Bug:** header claimed 'shared parameters used by all components'; runtime reads nothing. Dead sections: `system` (incl. fifth version `3.0.0`), `default_exchange`, `timeframe`/`timeframe_seconds`, `account`; `websocket.ai_signal_bot` loaded into `_shared_signal_ws` and never compared.
- **Fix:** kept live gate inputs (`symbols`, `exchanges`, `risk`, `websocket`), cut the dead sections, honest header; `_shared_signal_ws` now compared against `hft_config.ai_signal_bot.websocket_url` — verified fails on drift (9999 vs 8766).
- **Files:** `shared_config.yaml`, `scripts/test_config_consistency.py`
- **Commit:** 14dbb69

### S299 — install-deps.bat vcpkg flag gated + dead start.bat pointer removed ✅ · verified R173
- **Bug:** unconditional `-DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\...` — with the var unset the path degraded to `\scripts\...` and cmake configure died; `build-all.bat` already guards correctly. Final echo pointed at nonexistent `start.bat`.
- **Fix:** flag set only `if defined VCPKG_ROOT` (CMakeLists autodetects anyway); dead pointer removed.
- **Files:** `install-deps.bat`
- **Commit:** 14dbb69

### S300 — deploy.yml: honest notify, .env.prod fail-fast, master branch ✅ · verified R173 · re-verified R197
- **Bug:** `notify` treated `skipped` needs as success — every master push announced 'Deployment SUCCESS' for a tag-only deploy that never ran; scp shipped only `.env.prod.example`, nothing materialized `.env.prod` so compose `--env-file` died on a clean server; netlify `production-branch: main`/`refs/heads/main` could never fire on a master-only repo.
- **Fix:** verdict now reports FAILED/CANCELLED/'deploy skipped (tags v* only)'/SUCCESS from actual results; SSH step fail-fasts with an actionable error when `.env.prod` is absent; netlify production branch + gate moved to `master`.
- **Files:** `.github/workflows/deploy.yml`
- **Commit:** 2832f9c

### S313 — dead numpy pin removed ✅ · verified R173 · re-verified R197
- **Bug:** `exchange_simulator/requirements.txt` pinned `numpy==2.1.3` — zero imports anywhere in the component (GBM runs on stdlib); ~50MB wheel + supply-chain surface baked into CI and the sim image for nothing.
- **Fix:** pin cut.
- **Files:** `exchange_simulator/requirements.txt`
- **Commit:** 14dbb69

### S317 + S308 — root .dockerignore and .clang-format deleted ✅ · verified R173 · re-verified R197
- **Bug:** root `.dockerignore` described exclusions for a root-context build that doesn't exist (all 12 contexts are `./<component>`); root `.clang-format` (ColumnLimit 120 + include-sorting) had zero C++ files in scope — all 30 live under `hft-trade-bot/` with its own config (ColumnLimit 100) — and would misformat if ever applied.
- **Fix:** both files deleted (proven-dead).
- **Files:** `.dockerignore`, `.clang-format`
- **Commit:** 14dbb69

### S307 + S200 + S271 — version/panel numbers converged on canonical values ✅ · verified R173 · re-verified R197
- **Bug:** index.html said "204 panels, 44+ math models"; package.json "278 panels, 52 quant models" (52 = deleted research/); vite PWA manifest "278 panels"; both py `__version__` said 1.0.0 — five divergent spaces.
- **Fix:** all sites now say 271 registered panels + ~60 math-model panels (README:117/133 canonical); `__version__` = 4.1.0 (CHANGELOG's latest tagged release); TESTING.md CI-table claims in S271 were stale — the table is already accurate. Bonus: CONTRIBUTING.md tree fixed (deleted ml/+research/ dirs, phantom nested package, tools/, real counts).
- **Files:** `web-ui/index.html`, `web-ui/package.json`, `web-ui/vite.config.js`, `ai-signal-bot/__init__.py`, `exchange_simulator/__init__.py`, `CONTRIBUTING.md`, `docs/theory/hft_architecture_en.md` (gitignored — local fix only)
- **Commit:** b7a6f1f

### S314 — duplicate of S273 ✅ · verified R173
- **Status:** same `terraform.tfvars.example` `db_password` finding as S273 — files were deleted in R167 (commit ff85c7a). Closed as duplicate.

## R171 — slop-fix — 5 findings closed (Low tier emptied)

### S202 — ebpf_monitor: sys_enter/sys_exit pair, real latency ✅ · verified R173
- **Bug:** only a `sys_enter` probe existed — `ts_end` was never set, so `latency_ns` was 0 by construction and avg/max metrics permanently zero; docstring promised network/cache/memory/scheduling/file-IO that was never written; `syscall[32]` never filled; prom gauges registered but no http server ever exposed them.
- **Fix:** `BPF_HASH(pid→start_ts)` + `sys_exit` probe submits one event per syscall with real `latency_ns` + `syscall_id`; docstring cut to implemented scope; gauges + never-populated stats buckets removed. Userspace aggregation verified (count/total/max accumulate real values).
- **Files:** `monitoring/ebpf_monitor.py`
- **Commit:** 41a84a8

### S208 — Makefile test-cpp propagates real ctest failures ✅ · verified R173
- **Bug:** `ctest --output-on-failure || echo "skipped"` conflated missing build dir with failing tests — a red ctest exited 0.
- **Fix:** explicit `[ ! -d build ]` → honest skip message; otherwise ctest's exit code propagates to `make test`.
- **Files:** `Makefile`
- **Commit:** 2e2ed33

### S211 — bandit can't pass without a report ✅ · verified R173
- **Bug:** severity check was `if [ -f bandit-report.json ]` — a bandit crash before writing produced a green job with zero scan. (The finding's dead audit-grep step was already gone — stale.)
- **Fix:** missing report → `::error::` + `exit 1`; the `|| echo "0"` JSON-parse swallow removed so a corrupt report also fails.
- **Files:** `.github/workflows/ci.yml`
- **Commit:** 2e2ed33

### S214 — walk_forward_ci.py is the real walk-forward now ✅ · verified R173 · re-verified R185
- **Bug:** the script set `WF_STRATEGY` but the subprocess never read it — every named strategy produced identical buy-and-hold metrics on the same candle stream, labeled 'Walk-Forward Optimization CI'. Meanwhile `nightly-backtest.yml` carried the real implementation inline and never called the script.
- **Fix:** script rewritten as the real walk-forward (rolling 30d/7d windows, real `Backtester` × TrendFollowing+MeanReversion, per-strategy aggregates, `--baseline`/`--threshold` degradation gate); workflow calls the script (downstream check reads `report['windows']`); `make walk-forward` works standalone via embedded seeded-GBM fixture labeled `synthetic-gbm-seed42`. Verified live: 5 windows × 2 strategies, strategy-specific metrics.
- **Files:** `scripts/walk_forward_ci.py`, `.github/workflows/nightly-backtest.yml`
- **Commit:** 19a1ea4

### S218 — README_PROJECT_OVERVIEW disclaimed as HISTORICAL ✅ · verified R173
- **Bug:** root-level snapshot presented deleted code as live (Rust hft-executor FFI, ml/, research/, "kept" slop modules) with no disclaimer — two contradictory root READMEs.
- **Fix:** HISTORICAL banner added (same pattern as REFACTORING_PLAN_10DAYS.md) naming the dead claims and pointing at README.md + the audit ledger. File is gitignored/untracked — fix lives in the working tree.
- **Files:** `README_PROJECT_OVERVIEW.md` (local-only)
### S197 — consistency gate can fail now ✅ · verified R173 · re-verified R185
- **Bug:** `test_risk_parameter_consistency` printed WARNINGs but always returned True — shared/AI/HFT risk drift could never break the gate; `_shared_signal_ws` loaded but never compared (fixed in R170/S316 wiring); duplicated `audit` section check.
- **Fix:** all three configs now compared on `max_risk_per_trade_pct`/`max_daily_drawdown_pct`/`min_confidence` — mismatch → ERROR + `False`; duplicate audit block removed. Proven live: `min_confidence: 99.0` in shared → `✗ FAIL` + nonzero; revert → all 5 checks pass.
- **Files:** `scripts/test_config_consistency.py:215-227`
- **Commit:** 57f5773

### S198 — stale Open markers corrected ✅ · verified R173
- **Bug:** `docs/AUDIT_FINDINGS.md` catalog entries still said "— Open." for findings already fixed and verified: S116/S117 (fixed R40), S157/S158/S164 (R86), S178/S179/S180/S188 (R84). (S109/S155/S156 carried no false-Open marker.) 9 flips, not 12 — the finding's count was itself stale.
- **Fix:** each marker rewritten to its real fix round (`— Fixed in R40.` etc.); historical finding text untouched.
- **Files:** `docs/AUDIT_FINDINGS.md` (catalog entries)
- **Commit:** 8fe770d

### S199 — dead tests/requirements.txt removed ✅ · verified R173
- **Bug:** `exchange_simulator/tests/requirements.txt` pinned only `pytest>=7.0` with zero repo references; real deps live in `requirements-dev.txt`. Installing it gives pytest without pytest-asyncio → async suite silently skipped.
- **Fix:** file deleted; no CI/Makefile/docs/Dockerfile referenced it (only historical ledger notes mention the path).
- **Files:** `exchange_simulator/tests/requirements.txt` (deleted)
- **Commit:** 8d14a43

### S201 — development guide tree refreshed ✅ · verified R173
- **Bug:** `docs/guides/DEVELOPMENT_GUIDE.md` showed `exchange_simulator/config/` (real: `config.yaml`), `web-ui/src/contexts/` (nonexistent), `hft-trade-bot/pch.h` (real: `src/pch.h`), "88 test files" (real ~94), "227 React components" (real ~295), `panels/PanelRegistry.jsx` (real `registry.js`); sim `tools/` dir absent. ("28 test files" was accurate post-R167 — 28 `test_*.py` remain after the tools move.)
- **Fix:** every claim corrected against the live tree; nonexistent dirs replaced by real `panels/`/`stores/`/`utils/`; counts made approximate (`~`) where churn is high.
- **Files:** `docs/guides/DEVELOPMENT_GUIDE.md` project-tree + panel-registration sections
- **Commit:** 8fe770d

### S205 — terraform docs match reality ✅ · verified R173
- **Bug:** `docs/DEPLOYMENT.md` Option 4 claimed "terraform/ … was removed in the S109 cleanup" — the directory exists (VPC/EKS/S3 modules; only RDS/ElastiCache went). `terraform/README.md` promised "CloudWatch log groups" — no such resource exists.
- **Fix:** DEPLOYMENT.md Option 4 rewritten to describe the real substrate (VPC/EKS/S3, stateless — no DB/cache tier, deploy via Helm onto EKS); README's phantom CloudWatch bullet dropped. The `db_password` tfvars part was already closed via S273/S314 (R167/R170).
- **Files:** `docs/DEPLOYMENT.md` (Option 4), `terraform/README.md`
- **Commit:** 8fe770d
### S222 — visualizer: Windows arrows + first-exchange, no binance hardcode ✅ · verified R177
- **Bug:** `msvcrt.getch()` emits `à`/`x00` prefix for arrows but `_handle_key` routed only `x1b` — `<- -> Switch tabs` dead on Windows; the Windows branch then read two bytes where one follows. `exchanges.get("binance")` hardcoded at :71/:218 — renaming the exchange silently emptied the UI; `__main__` catch-list missed AttributeError/KeyError.
- **Fix:** `à`/`x00` routed to the handler on Windows (single K/M suffix byte, POSIX branch untouched); symbols/exchange resolve via `next(iter(exchanges.values()))`; number keys generalized 1-9 matching the dynamic footer; catch extended. Verified: instantiate with `{'kraken': ...}` → symbols populate; numkey routing works.
- **Files:** `exchange_simulator/visualizer.py:71,127,137-151,219,263-267`, `exchange_simulator/__main__.py:110`
- **Commit:** 7a00aeb

### S206 — e2e honesty: real assertions + scoped overlay kill ✅ · verified R177
- **Bug:** smoke 'status bar' asserted `body`; mock-mode 'toggle sidebar' never toggled; trading 'mock banner' asserted `header`; `dismiss-onboarding` CSS-killed every `.fixed.inset-0.z-50` overlay + the notifications region (error dialogs/toasts invisible to e2e); console-error allowlist swallowed `NaN`/`attribute`/`SVG`/`Warning:`/generic `network`.
- **Fix:** status bar asserts `role=contentinfo`; sidebar does a real collapse→expand round-trip (skip on mobile viewports where the control isn't rendered); mock banner asserts `role=alert` + "DEMO MODE" (harness always serves `dev:mock`); overlay CSS scoped to `data-testid="onboarding-modal"` (added to the component; stale "204 panels/44+ models" copy corrected to 271/~60); allowlist keeps only WebSocket/favicon/ERR_CONNECTION_REFUSED. +4 vitest cases for the modal.
- **Files:** `web-ui/e2e/{smoke,mock-mode,trading}.spec.js`, `web-ui/e2e/dismiss-onboarding.js`, `web-ui/src/components/OnboardingTutorial.jsx`, `web-ui/src/test/onboardingTutorial.test.jsx`
- **Commit:** 3fa0a27

### S209 — docs label gitignored dev tools as local-only ✅ · verified R177
- **Bug:** `docs/ARCHITECTURE.md:202,228,591` + `docs/WEB_UI.md:495-496` presented `run_logger.py`/`error_monitor.py`/`price_monitor.py` as canonical components — all three are gitignored local scripts (`.gitignore:179-181`), absent in clean clones (the code itself says "not shipped" at `run.py:31`, `__main__.py:21`).
- **Fix:** all 5 doc sites marked local dev tool / gitignored / optional; finding content preserved.
- **Files:** `docs/ARCHITECTURE.md`, `docs/WEB_UI.md`
- **Commit:** b8a868b

### S216 — dev-verifier residue: posix installer + cargo phantom + e2e-aware gate ✅ · verified R177
- **Bug (live parts):** `install-hooks.sh` referenced by both sh hook headers but only `.bat` existed; `pre-commit-check.py` docstring + `install-hooks.bat` promised cargo build/test with zero Cargo.toml; coverage gate flagged playwright `*.spec.*`/`e2e/` files as untested sources. (Stale parts: `ci-equivalence.py` and `health-check.py` were already deleted in 4b11cef/S262 — their phantom-rust row and src/-only scan died with them.)
- **Fix:** created `install-hooks.sh` (POSIX twin: copies the two `*-hook-git.sh` into `.git/hooks`, chmod +x, honest check list); cargo claims stripped from docstring/usage/echo; coverage gate now skips `.spec.` and `e2e/` like other test files.
- **Files:** `scripts/install-hooks.sh` (new), `scripts/pre-commit-check.py:7-9,20,575-580`, `scripts/install-hooks.bat:51-55`
- **Commit:** fd5b044

### S217 — CONTRIBUTING run instructions + counts corrected ✅ · verified R177
- **Bug (live parts):** `cd exchange_simulator && python -m exchange_simulator` can't resolve the package from inside it; `./hft_trade_bot config/config.yaml` from `build/` missed `../`; stale counts "36/155/49 test files" and "7 wired strategies". (Stale parts: `ml/`/`research/` tree rows, "50 symbols", "docs (15 files)", prod-compose PostgreSQL/Redis were already corrected earlier — the finding's line refs predate that refresh.)
- **Fix:** run section rewritten root-relative with the build step noted; counts → ~28 files/412 tests (sim), ~94/1400+ (ai-bot), 25 files/~274 TEST_CASEs (hft), 6 wired strategies.
- **Files:** `CONTRIBUTING.md:247-258,339,350,378,435`
- **Commit:** b8a868b
### S227 — committed residue swept ✅ · verified R177
- **Bug:** `hft-trade-bot/package-lock.json` — empty `{}` npm lockfile with no package.json (accidental artifact); 9 stale `.gitkeep` placeholders in populated directories.
- **Fix:** lockfile + 9 `.gitkeep` deleted (hft scripts/tests/src{monitoring,network,utils}, ai-signal-bot tests/src{data_collection,llm_engine,utils}); `ai-signal-bot/scripts/.gitkeep` kept — that dir is still legitimately empty.
- **Files:** 10 deletions
- **Commit:** chore sweep (R175)

### S223 — WS metrics observable via /metrics ✅ · verified R177
- **Bug:** `WebSocketMetrics` maintained live counters (`message_count`, `bytes_sent`, `compression_ratio`, `delta_update_ratio`, `client_count`, broadcast latency, message sizes) whose only reader was `get_metrics()` — a dict accessor called exclusively by its own test; the real `/metrics` endpoint never saw them.
- **Fix:** `_append_sim_metrics` now emits all nine as Prometheus series (`exchange_simulator_messages_total`, `bytes_sent_total`, `clients_connected`, `compression_ratio`, `delta_update_ratio`, `bandwidth_mbps`, `broadcast_latency_p95_ms`, `message_size_bytes_{avg,p95}`); dead `get_metrics()` chain removed from ws_metrics + websocket_server; test now asserts the real exposition.
- **Files:** `exchange_simulator/ws_prometheus.py`, `ws_metrics.py`, `websocket_server.py`, `tests/test_websocket_server.py`
- **Commit:** f400a30

### S238 — WsInspector shows real WS frames ✅ · verified R177
- **Bug:** fabricated one synthetic record per `candles.length`/`signals.length` change — invented sizes/timestamps/previews, not real frames. (The finding's "use getBufferedMessages" premise was stale — S231 removed that API for having zero consumers; WsInspector is now its first real consumer class.)
- **Fix:** module-level frame tap in `useWebSocket` — `publishWsFrame`/`subscribeWsFrames` (zero-cost when unsubscribed); `ws.onmessage` publishes `{label, data, size, receivedAt}`; `useExchangeData` labels its sockets 'exchange'/'signal'; inspector consumes real frames; dead props removed from registry; +4 tests driving real frames through the tap.
- **Files:** `web-ui/src/hooks/useWebSocket.ts`, `hooks/useExchangeData.js`, `components/WsInspector.jsx`, `panels/registry.js:764`, `test/wsInspector.test.jsx`
- **Commit:** 691a41c

### S237 — mock hooks reach shape parity ✅ · verified R177
- **Bug:** `useMockExchangeData`/`useMockSignalData` returned ~half the real shape — `openOrders`, `auditLogs`, `optionsChain`, `lastError`, `cancelOrder`, `cancelAllOrders`, `requestOptionsChain`, `connect`, `nextReconnectIn`, `exchangeReconnects` plus all 7 `*Result` fields and `authState` missing; mock-mode consumers would crash on `undefined` (masked today by early-returns).
- **Fix:** both returns carry full parity — honest nulls/empties for data slots, no-op senders matching the file's convention, `authState:'disabled'` mirroring the real no-token default; contract test asserts every real-hook key exists.
- **Files:** `web-ui/src/hooks/useMockData.js`, `test/useMockData.test.jsx`
- **Commit:** 691a41c

### S241 — dead pinned deps removed ✅ · verified R177
- **Bug:** `numpy` in sim requirements was already cut by S313 (stale half); `@testing-library/user-event@^14.5.2` had zero imports across web-ui.
- **Fix:** `npm uninstall @testing-library/user-event` — gone from package.json + lockfile; vitest still green.
- **Files:** `web-ui/package.json`, `web-ui/package-lock.json`
- **Commit:** chore sweep (R175)

## R176 — slop-fix — 5 findings closed

### S242 — exchange auth token documented + honest banner ✅ · verified R177
- **Bug:** `web-ui/.env.example` omitted `VITE_EXCHANGE_TOKEN` (real reader `useExchangeData.js:12` sends it as the auth frame for order/cancel/set_speed/replay) — dev setting `EXCHANGE_CONTROL_TOKEN` on the sim got `auth_failed` with no documented remedy. `exchange_simulator/__main__.py` banner hardcoded "3 Symbols" (real: 49).
- **Fix:** `.env.example` documents `VITE_EXCHANGE_TOKEN` ↔ `EXCHANGE_CONTROL_TOKEN` pairing; banner derives counts from the built exchange map + symbol universe — prints "3 Exchanges | 49 Symbols".
- **Files:** `web-ui/.env.example`, `exchange_simulator/__main__.py`
- **Commit:** 324afcb

### S251 — HFT config validation can fail; fraction/percent mine disarmed ✅ · verified R177
- **Bug:** every check in `config_validate.h` was `spdlog::warn` — zero fail paths; `Config::load` ignored any result. `max_drawdown_pct` (fraction consumed by the kill switch at `bot_loop.cpp`) was never validated while its percent-scale sibling `max_daily_drawdown_pct` sat beside it in yaml. The prod test fixture itself carried `max_drawdown_pct: 10.0` — the exact percent-thinking typo.
- **Fix:** `validate_config` collects violations and throws `std::runtime_error` listing all of them; `max_drawdown_pct` enforced in (0,1]; `ws_url` required only when `!ipc_enabled` (SHM mode legitimately has none); yaml documents the fraction-vs-percent distinction; fixture corrected to 0.10; +3 doctest cases (impossible risk value, percent-in-fraction key, missing ws_url).
- **Files:** `hft-trade-bot/src/core/config_validate.h`, `config/config.yaml`, `tests/test_doctest_hft_config.cpp`, `tests/test_integration_config.cpp`
- **Commit:** b848454

### S252 — per-venue market data stores ✅ · verified R177 · re-verified R185 · re-verified R196
- **Bug:** `prices_`/`order_books_`/`candle_history_` keyed by bare symbol — the sim's "exchange|symbol" wire keys and `candle.exchange` were parsed and discarded; three venues overwrote/interleaved each other; an orderbook delta could mutate a different venue's book. (Also found: `using Spinlock = SpinLock` referenced a type that never existed — the header could not compile standalone.)
- **Fix:** all three stores keyed `exchange|symbol`; `SignalReceiver::set_default_exchange` wired from `config.default_exchange` in `init_core_components`; symbol-only accessors resolve default-venue then shm then bare; by-id arrays and `get_all_prices` serve the primary venue only (pos_mgr semantics preserved); deltas resolve their own venue; `feed_frame_json` test seam added (mirrors `inject_snapshot`); new doctest asserts three-venue isolation for prices/books/deltas/candles.
- **Files:** `hft-trade-bot/src/communication/signal_receiver_data.h`, `signal_receiver_handlers.h`, `signal_receiver.h`, `src/core/bot_setup.cpp`, `tests/test_doctest_signal_receiver.cpp`, `CMakeLists.txt`
- **Commit:** 4e6e3c7

### S258 — numeric doc drift converged ✅ · verified R177
- **Bug:** live docs confidently stated different numbers — "278 panels" where 7 of 278 registry entries are category rows (271 component-mapped panels), "289/291 components" (295 .jsx), "157 web-ui test files" (153 unit + 4 e2e), "50 symbols" (49 configured), TESTING "316/311 test files".
- **Fix:** TESTING.md, ARCHITECTURE.md, README.md, WEB_UI.md (incl. :14 "289 components"), CONTRIBUTING.md (157→153 unit + 4 e2e), TRADING_GUIDE (50→49) all converge on the verified counts; WEB_UI now distinguishes 271 panels vs 278 registry entries.
- **Files:** `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/WEB_UI.md`, `README.md`, `CONTRIBUTING.md`, `docs/guides/TRADING_GUIDE.md`
- **Commit:** 9961ce8

### S268 — single canonical test tree ✅ · verified R177 · re-verified R196
- **Bug:** `ai-signal-bot/tests/` and `tests/unit/` held 6 same-name pairs as diverged parallel suites; canonical layer undocumented.
- **Fix:** canonical = `tests/unit/` (per TESTING.md). Ported root-unique coverage first — kelly min_risk negative regression, TF/MR directional signals, `Signal.rr_ratio_neutral`, breakeven+trailing interaction, SHORT peak/trough tracking, ATR gap/missing-prev_close edges, backtest-request param pass-through — then deleted the 6 root files, moved the remaining 24 verbatim, `test_integration.py` → `tests/integration/`, removed phantom `tests/mocks/` (only `__pycache__`). 1360 passed, 2 skipped.
- **Files:** `ai-signal-bot/tests/` (30 files: 6 deleted, 24 moved), `tests/unit/test_{kelly,strategies,risk_manager,backtest_requests}.py`
- **Commit:** c0ba78c

## R178 — slop-fix — 2 findings closed (Info tier emptied)

### S297 — rollback restores all four backup artifacts ✅ · verified R181 — ❌ REVERTED R196: audit half never worked — `deploy.sh:69` backs up `exchange_simulator/logs/audit/` which doesn't exist (audit log is the FILE `logs/audit.log`, config.yaml:184); `|| true` hides the miss → `audit_$TS` never created → both new restore branches dead code. And "merge" is wrong for a single rotating file — `cp -r` overwrite loses post-backup lines. ai_data restore + stop-order real → reopened as S340.
- **Bug:** `backup_deployment` wrote config tar + exchange `data` + `ai_data` + `audit` (`deploy.sh:53-69`, `deploy.bat:51-66`) but `rollback` restored only config + exchange data — the AI bot's SQLite/WAL signals/trades db and the audit snapshot were write-only; "Rollback completed" reported on a half-rolled-back system.
- **Fix:** both rollback paths now restore all four artifacts — `ai_data` via atomic swap (a merged old/new WAL pair can corrupt the db), `audit` via merge-copy so post-backup entries survive; `stop_deployment` moved before the file swaps (was after — live writers could race the restore). Verified end-to-end in a sandbox: all four restore, post-backup audit entries survive, order is stop→restore→start.
- **Files:** `scripts/deploy.sh`, `scripts/deploy.bat`

### S301 — nightly issue dedup + dead pytest install removed ✅ · verified R181 · re-verified R196
- **Bug:** `nightly-backtest.yml` `Create issue on regression` (`if: failure()`) called `issues.create` unconditionally — a persistent failure opened a new issue every night forever; `pip install pytest pytest-asyncio` (:37) installed packages no step invoked. (The third sub-claim — `walk_forward_ci.py` orphaned — was already stale: wired in R171/S214, called at :73.)
- **Fix:** the step now lists open issues, finds an existing one by title (PRs excluded via `!pull_request`), and comments with the latest run URL instead of duplicating; dead pip install removed. YAML + embedded JS both parse-verified.
- **Files:** `.github/workflows/nightly-backtest.yml`

## R180 — slop-fix — 4 findings closed (R179 doc-drift batch)

### S318 — CONFIGURATION_GUIDE rewritten to live shared_config surface ✅ · verified R181
- **Bug:** `docs/guides/CONFIGURATION_GUIDE.md:59-118` documented `system:`, `default_exchange:`, `timeframe:`/`timeframe_seconds:`, `account:` — all removed from `shared_config.yaml` in S316/R170 — plus "50 pairs" (real: 49).
- **Fix:** the shared-config section now opens with the gate-reference disclaimer (not runtime-loaded; consumed by `test_config_consistency.py`), lists only the live sections (symbols/exchanges/risk/websocket), corrects 49 pairs.
- **Files:** `docs/guides/CONFIGURATION_GUIDE.md`

### S319 — all 6 wired strategies documented ✅ · verified R181
- **Bug:** TRADING_STRATEGIES.md had detailed sections for TrendFollowing/MeanReversion/FFTCycle only; MarketMaking/MLEnsemble/Sentiment (all wired `bot_helpers.py:54-63`) were undescribed.
- **Fix:** added sections describing each strategy's real mechanics (EVENT_SENTIMENT_MAP + fade/follow thresholds; Avellaneda-Stoikov reservation price + inventory skew + toxicity; HMM regime + GBM classifier + anomaly filter, sklearn/lightgbm optional); voter member list corrected to all 6.
- **Files:** `docs/TRADING_STRATEGIES.md`

### S320 — PERFORMANCE.md methodology is runnable now ✅ · verified R181
- **Bug:** `./hft_trade_bot --config <path> --enable-latency-histograms` — config is positional `argv[1]` (`bot_setup.cpp:58`), no such flag (yaml `latency_histogram_enabled`); `cmake -DENABLE_PROFILING=ON` — no such option (real: `-DUSE_PGO=ON` + `-DCMAKE_BUILD_TYPE=Profile`); "REST API 5-20ms ~10ms" row measured a nonexistent API; "5 strategies" (real: 6); "Measured" column produced by nothing, benchmark_suite (S214 toy-theater) cited as source.
- **Fix:** real PGO two-pass + positional config + yaml-flag note; REST row replaced by the no-REST pointer; 6 strategies; Measured column disclaimed as ad-hoc + benchmark_suite caveat noted.
- **Files:** `docs/PERFORMANCE.md`

### S321 — docker-compose v1 → docker compose v2 in docs ✅ · verified R181 — ⚠ R196: cited 3 files are clean but 28 v1-command sites survive in 4 other docs → S341
- **Bug:** ~23 sites taught the EOL v1 binary: DEPLOYMENT.md ×14, QUICK_START.md ×7, README.md ×2 (S302 fixed the Makefile but docs were left).
- **Fix:** all command positions converted; compose *file* names (`docker-compose.prod.yml` etc.) preserved.
- **Files:** `docs/DEPLOYMENT.md`, `docs/guides/QUICK_START.md`, `README.md`

## R182 — slop-fix — 1 finding closed (S309 — docker-smoke un-red; board empty)

### S309 — docker-smoke was red by construction; all three permanent-fail causes removed ✅ · verified R183 · re-verified R196
- **Bug (deeper than the original entry):** the finding blamed S303's dead sim image, but the job actually died *earlier* — `docker-compose.yml:242` has `${GRAFANA_PASSWORD:?...}` and CI has no `.env`, so `docker compose up` failed at variable interpolation before any image was built (reproduced on this host: `docker compose config` → `required variable GRAFANA_PASSWORD is missing a value`). Two more structural defects behind it: `--timeout 60` is the container-*shutdown* timeout — it never bounded `--wait`, which waits forever, so a stuck health chain surfaced as a 10-min job timeout rather than a compose error; and `timeout-minutes: 10` was marginal for a cold 4-image build (hft C++ in-Docker compile is the long pole) + ~2-3 min `depends_on: service_healthy` chain.
- **Fix:** `.github/workflows/ci.yml:329-348` — job-level `env: GRAFANA_PASSWORD: ci-smoke` (throwaway; `down -v` in the same job destroys the stack), `docker compose build` split into its own step so build failures stop masquerading as smoke failures, `--wait-timeout 240` gives the healthy-wait a real bound, `timeout-minutes` 10→20. Same defect pair fixed in `scripts/docker-smoke-test.sh` (`export GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-ci-smoke}"`) and `scripts/docker-smoke-test.bat` (`if not defined`) — both died on the `:?` for any dev without the var, this host included (no `.env` present).
- **Verified:** `docker compose config` repro-fail → with `GRAFANA_PASSWORD=ci-smoke` → clean parse; `--wait-timeout` flag exists in the installed compose; ci.yml YAML-valid; `bash -n` clean; pre-commit-check 9/9 ALL GREEN.
- **Honest caveat:** containers actually reaching `healthy` inside 240s is runtime-verified by the next CI run itself — Docker daemon unreachable on this host (Docker Desktop process dies on launch). If the job still goes red, the failure is now *informational* (a real boot bug → new finding), not the structural deadness this entry recorded.

### S341 — docker-compose v1 remainder in 4 docs ✅ (docs-refresh)
- **Bug:** S321 converted DEPLOYMENT/QUICK_START/README but left 28 v1-command sites in DEVELOPMENT_GUIDE.md, MONITORING_GUIDE.md, useful_info_en.md (gitignored theory doc), WEB_UI.md, plus 2 in CONTRIBUTING.md.
- **Fix:** all command-position `docker-compose ` -> `docker compose `; compose file names preserved.
- **Verified:** grep for command-position `docker-compose ` across tracked docs + CONTRIBUTING = 0 remaining.
- **Files:** docs/guides/DEVELOPMENT_GUIDE.md, docs/MONITORING_GUIDE.md, docs/WEB_UI.md, CONTRIBUTING.md (+ untracked docs/theory/useful_info_en.md)

## R199 — dependabot / supply-chain — all 9 open alerts closed (+2 found by npm audit)

All entries are `web-ui/package-lock.json` advisories — **devDependencies-only chains** (build/lint/test tooling); nothing ships in the prod bundle. Fixes applied in `web-ui/package.json` + `web-ui/package-lock.json` via `npm install` + `npm audit fix`. Verified: `npm audit` → **0 vulnerabilities**; `tsc --noEmit` clean; `vitest run` smoke green on 4.1.11.

### GH#87 — browserslist `normalizeStats` crash / prototype write ✅ · verified R216
- **Bug:** `browserslist@4.28.4` (range `<=4.28.6`) — untrusted `browserslist-stats.json` custom stats cause an uncaught crash + prototype-property write in `normalizeStats`. Same version covered by a second advisory: unbounded distinct-query cache growth → eventual OOM.
- **Fix:** 4.28.4 → **4.28.9**. All parents (`@babel/helper-compilation-targets` via workbox-build/vite-plugin-pwa, `autoprefixer`, `update-browserslist-db`) want `^4.24.0` — in-range update, no override needed.
- **Chain:** `vite-plugin-pwa → workbox-build → @babel/preset-env → @babel/core → @babel/helper-compilation-targets → browserslist`; also `autoprefixer → browserslist`.

### GH#91 — js-yaml `maxTotalMergeKeys` CPU DoS ✅ · verified R216
- **Bug:** `js-yaml@4.3.1` (range `<4.3.2`) — the merge-key cap doesn't limit CPU for empty merge sources; hostile YAML → DoS in any tool parsing it.
- **Fix:** override `>=4.3.1` → **`>=4.3.2 <5`** → resolves **4.3.2** (nested under `@eslint/eslintrc`). The `<5` cap matters: `>=4.3.2` alone let npm pick major 5.4.2 over a `^4.1.1` requirement — semver-unsafe.
- **Chain:** `eslint → @eslint/eslintrc → js-yaml` (^4.1.1). Dev/lint path only.

### GH#82–#85 — fast-uri URI-normalization cluster (4× High) ✅ · verified R216
- **Bug:** `fast-uri@4.1.2` (all range `<4.1.3`) — four normalization defects: host confusion via skipped IDN canonicalization on scheme-relative refs (#85); host confusion via percent-encoded scheme normalization (#82); SSRF via malformed IPv6 normalization (#84); SSRF via repeated hostname percent-decoding (#83).
- **Fix:** override `>=4.1.2` → **`>=4.1.3`** → resolves **4.1.4**. Parent `ajv@8.20.0` requires `^3.0.1` — override is the only mechanism (was already in place from a previous round).
- **Chain:** `vite-plugin-pwa → workbox-build → ajv → fast-uri`. Blast radius honest note: ajv only validates workbox config at build time — the SSRF/host-confusion surface is not network-exposed in this repo; severity is formal, real exploitability ~nil.

### GH#90 — baseline-browser-mapping process-termination DoS ✅ · verified R216
- **Bug:** `baseline-browser-mapping@2.10.40` (range `>=2.0.0 <2.11.0`) — calls `process.exit` on invalid input → kills any tooling passing external data.
- **Fix:** → **2.11.23**, pulled automatically by `browserslist@4.28.9` (dep range `^2.10.38` admits it).
- **Chain:** `browserslist → baseline-browser-mapping`.

### GH#88/#89 — vitest / @vitest/mocker path traversal ✅ · verified R216
- **Bug:** `vitest@4.1.10` + `@vitest/mocker@4.1.10` (range `>=2.1.0 <4.1.11`) — Redirect Mock allows path traversal / arbitrary file read outside project root. Direct devDep.
- **Fix:** `vitest` + `@vitest/coverage-v8` `^4.1.10` → `^4.1.11` → all three resolve **4.1.11** (mocker follows vitest; coverage-v8 peer-pins `vitest@4.1.x`). Vitest 5.0.0 exists but the fix shipped on the 4.x line — no major bump needed.
- **Honest note:** exploit needs a malicious test/mock config — dev-machine surface, not prod.

### npm-audit extras (not in the Dependabot list) ✅ · verified R216
- **brace-expansion (High)** — DoS via unbounded expansion length (OOM) + CVE-2026-14257-mitigation bypass via unbounded intermediate arrays. Three copies in tree, all in vulnerable ranges: `1.1.16<1.1.18` (eslint→minimatch@3), `2.1.2<2.1.4` (filelist→minimatch@5), `5.0.7<5.0.9` (glob→minimatch@10) → **1.1.21 / 2.1.7 / 5.0.12**, all in-range via `npm audit fix`.
- **nanoid (High)** — custom non-secure generator loops forever at `size=0`. `3.3.17<3.3.18` → **3.3.19** via `postcss@^8.5.23` (in-range).

- **Files:** `web-ui/package.json` (vitest/@vitest/coverage-v8 `^4.1.11`; overrides `fast-uri >=4.1.3`, `js-yaml >=4.3.2 <5`), `web-ui/package-lock.json`
- **Board note:** Dependabot PRs #83, #86–#89, #92 superseded — fixes applied directly.

## R200 — slop-fix — 4 findings closed (all remaining High: S337, S329, S332, S340)

### S337 — CircuitBreaker wired: trips on execution failures, gates broadcast+SHM+orders ✅ · verified R206
- **Bug:** `record_failure`/`record_success` had zero prod callers (breaker CLOSED forever), and `broadcast_signal`'s internal `allow_signal` gate only silenced the WS publish — `run.py` ignored the result and SHM push + order execution ran regardless. Documented win/loss semantic was unimplementable: `db.close_trade` has no prod callers, `trades.pnl` is never written — no realized-outcome feedback exists.
- **Fix:** `broadcast_signal` → `bool` (False = breaker-blocked); `_finalize_and_execute` returns early on False — SHM push and both order paths now sit behind the gate. `record_failure` on: paper order send exception / WS disconnected; live `place_order` falsy result / exception (incl. adapter-create failure). `record_success` on accepted order (resets counter, closes HALF_OPEN probes). Breaker docstring rewritten to honest semantics (execution failures, not trade outcomes). Internal `allow_signal` check kept inside `broadcast_signal` — stat-arb path (`bot_helpers.py:103`) stays gated, HALF_OPEN single-probe semantics preserved.
- **Files:** `ai-signal-bot/src/communication/signal_publisher.py:306-348` (bool return), `ai-signal-bot/run.py:571-577` (gate), `:610-628` (paper-path record_*), `:699-720` (live-path record_*), `ai-signal-bot/src/communication/circuit_breaker.py:1-14` (honest docstring). Tests: `test_shm_alerting_wiring.py` mocks updated to new `True` contract + new `test_finalize_blocked_by_breaker_skips_shm_and_order`.
- **Verified:** 99 tests green (shm_alerting_wiring, comm_circuit_breaker, signal_publisher, backtester, bot_helpers).

### S329 — Backtester lookahead removed ✅ · verified R206
- **Bug:** `window = candles[start:i+1]` included bar `i`; `strategy.analyze` saw `candles[i].close` and `_open_position` filled at that same close — impossible live; every backtest surface systematically flattered.
- **Fix:** `window = candles[start:i]` — signal computed on bars closed before `i`, fill still at `candles[i].close` (decide-on-prior-bar, fill-on-bar-i convention). Covers both `analyze` call sites (entry + reversal). SL/TP triggers unchanged — intra-bar exits on a pre-existing position are causal.
- **Files:** `ai-signal-bot/src/backtesting/backtester.py:128-135`
- **Verified:** new pin `test_no_lookahead_window_excludes_fill_bar` (spy asserts window ends at candles[i-1] for every call); test_backtester.py 19/19 green.

### S332 — web-ui backtestEngine lookahead removed ✅ · verified R206
- **Bug:** `evaluateConditions(candles, i, …)` read bar `i` (`price_above`/`rsi_*`/`ema_cross`/`volume_spike`/`price_change_5`) and fills executed at `candles[i].close` — same decide-and-fill-on-close defect as S329.
- **Fix:** `evaluateConditions(candles, i - 1, …)` — rules evaluate the previously closed bar, fills stay at bar `i`. Loop kept over all bars (equityCurve stays index-aligned with candles — pinned by tests); `i=0` has no prior bar → no evaluation.
- **Files:** `web-ui/src/utils/backtestEngine.js:212-219`
- **Verified:** new pin `fills on the bar AFTER the signal bar` (close spikes only at bar 10 → entryTime === candles[11].time, entryPrice = candles[11].close×1.0005); backtestEngine.test.js 8/8 green.

### S340 — audit backup targets the real file; restore is honest snapshot ✅ · verified R206
- **Bug:** `deploy.sh`/`deploy.bat` backed up `exchange_simulator/logs/audit/` — a dir that doesn't exist (audit is the single rotating FILE `logs/audit.log` per `config.yaml:184` / `audit_logger.py:41`, RotatingFileHandler). `cp -r … || true` swallowed the miss → `audit_$TS` never created → both restore branches were dead code; and "merge" semantics were wrong for an append-mode file anyway.
- **Fix:** backup globs `logs/audit.log*` (file + rotations) into `audit_$TS/`; restore copies it back as a verbatim snapshot (post-backup live lines are replaced — that's what rollback means; comment corrected, no fake "merge" claim). Empty-source case logs a skip instead of creating phantom dirs. `.bat` mirrors with `audit.log` existence check.
- **Files:** `scripts/deploy.sh:68-75` (backup), `:360-368` (restore); `scripts/deploy.bat:65-69` (backup), `:302-308` (restore)
- **Verified:** `bash -n` clean; `cp audit.log*` glob verified against real file.

## R201 — slop-fix — 2 findings closed (S338 halt gates, S339 dead drawdown feed)

### S338 — halt gates now cover both order paths ✅ · verified R206
- **Bug:** `is_trading_active` gated only `_execute_paper_order` (`run.py:579`); `_execute_live_order` had no halt check — live orders fired during a sim halt (real-money blast radius). `_hft_kill_active` (C++ kill-switch latch, `run.py:389`) paused only the SHM signal feed — neither order path consulted it.
- **Fix:** single halt gate in `_finalize_and_execute` ahead of both paths — `halted_by = kill-switch | trading-stopped` blocks `_execute_paper_order` AND `_execute_live_order` with an explicit warning naming the halt source. Signal broadcast + SHM push unchanged (informational flow; kill-switch already gates SHM separately at :572). Halted skips are not execution failures — no breaker record (correct: halt ≠ downstream fault).
- **Files:** `ai-signal-bot/run.py:593-604`
- **Verified:** 74 tests green (shm_alerting_wiring + validator suites); test mocks exercise the halt branch via `is_trading_active=False`.

### S339 — SignalValidator drawdown gate fed with real equity deltas ✅ · verified R206
- **Bug:** `_check_drawdown` read `self._daily_pnl`, but `update_pnl` had zero prod callers — `_daily_pnl` stayed 0.0 forever, so the advertised max-daily-drawdown gate could never fire. A realized-PnL feed was impossible: `db.close_trade` has no callers, `trades.pnl` never written.
- **Fix:** `_validate_signal` now feeds `validator.update_pnl(equity_delta)` per validated signal — delta of account equity since the previous signal. Cumulative deltas = today's equity change (realized+unrealized mark-to-market); `update_pnl`'s built-in date rollover resets daily. Stricter than the documented realized-only semantic (gates on underwater positions too) — honest docstring/comment notes the difference. First call sets baseline only.
- **Files:** `ai-signal-bot/run.py:130` (`_dd_last_equity` init), `:556-565` (delta feed in `_validate_signal`)
- **Verified:** 74 tests green; validator's own update_pnl/drawdown tests unchanged and passing.
- **Doc sync:** README known-gaps, ARCHITECTURE:228, RISK_MANAGEMENT:320, CONFIGURATION_GUIDE:13-15, TRADING_GUIDE:38 — all S338/S339 "unwired/decorative" claims updated (were stale post-fix).

## R202 — slop-fix — 4 findings closed (S330/S331 sim fill-model, S334/S335 C++ position book)

### S330 — iceberg slices gated on marketability + live slice model ✅ · verified R206
- **Bug:** `_check_iceberg_orders` filled a slice every tick with no marketability gate — a priced iceberg filled at its stale limit regardless of market (sell-iceberg@51000 printing fills while market=50000). The slice bookkeeping (`slice_size`/`slices_remaining`/`current_slice_filled`/`on_fill`) was dead: `_create_order` never set `slice_size` → `to_dict` broadcast `slices_remaining:0` as a static fake field.
- **Fix:** priced icebergs now rest like limits — slice fills only while marketable (buy `current<=price`, sell `current>=price`), at the limit price; unpriced icebergs keep one-slice-per-tick-at-mid (explicit TWAP semantic). `slice_size=visible_qty` wired at creation so `__post_init__` computes real `slices_remaining`; `_execute_iceberg_slice` calls `order.on_fill(slice_qty)` — `to_dict` now emits live values.
- **Files:** `exchange_simulator/exchange_advanced_orders.py:178-185` (gate), `:301-303` (on_fill); `exchange_simulator/exchange_order_submission.py:179-184` (slice_size); tests `exchange_simulator/tests/test_exchange_advanced_orders.py` (TestCheckIcebergOrders, 5 cases)
- **Verified:** 432 sim tests green — no-fill-above/below-limit, fill-at-limit, unpriced TWAP, bookkeeping tracking all pinned.

### S331 — partial liquidation routed through submit_order ✅ · verified R206
- **Bug:** `_handle_partial_liquidation` was a shadow fill path: `fee=0.0`, no slippage, zero audit events, hand-built `ord-{N}` id — the model flattered exactly the levered losers it force-closed.
- **Fix:** special-case deleted; `PARTIAL_LIQUIDATION` goes through `submit_order(force_close=True)` like LIQUIDATION/SL/TP — real fill price (slippage+impact), fee charged, ORDER_FILLED/FEE/POSITION_CLOSED/BALANCE audit events, `reason` stamped on the ClosedTrade. Hand-rolled body + dead `ClosedTrade` import removed; now-unused `current_price` local dropped.
- **Files:** `exchange_simulator/exchange_liquidation.py:85-104` (close path), `:6-12` (imports); deleted `:113-150`; new `exchange_simulator/tests/test_exchange_liquidation.py` (4 cases)
- **Verified:** 432 sim tests green — fee charged, slippage applied, ORDER_FILLED audit written, remainder position kept, reason stamped.

### S334 — partial-close fee no longer double-counted ✅ · verified R216
- **Bug:** REDUCED branch realized `slice_pnl - fee` AND added the fee to the surviving position's `fees_paid`; `update_pnl` nets `fees_paid` off the remainder → same fill fee subtracted again at final close. `realized_pnl_total_` understated by every partial-close fee.
- **Fix:** dropped `it->fees_paid += fee` on REDUCED — the close fill's fee is realized fully in the slice pnl; the remainder carries only open-side fees. CLOSED branch unchanged (close fee enters `fees_paid` before final `update_pnl` → counted once).
- **Files:** `hft-trade-bot/src/position/position_manager.h:105-118`
- **Verified:** doctest — 1.0@50000, reduce 0.4@51000 fee 5 → realized 395; close 0.6@51000 fee 6 → total 989 = 1000 gross − 11 fees exactly once. 28/28 green.

### S335 — sync_position ghosts age out of the book ✅ · verified R216
- **Bug:** `sync_position` adopted/refreshed but never removed — a missed close fill (disconnect gap, lost fills_batch) left a local ghost: `has_position()` blocked the symbol forever, `check_sl_tp` could fire close orders for a non-existent position.
- **Fix:** new `reconcile_positions(broadcast_symbols, exchange)` called once per account broadcast — a position absent for `SYNC_MISS_LIMIT=3` consecutive broadcasts is dropped (counter resets on reappearance; per-exchange scoped; `closing_since_`/`active_symbols_`/`sync_misses_` cleaned). Age-out instead of instant removal so a fill landing between snapshot and broadcast can't flap the book. Caller logs each drop.
- **Files:** `hft-trade-bot/src/position/position_manager.h:189-220` (reconcile), `:346-348` (state), `:160-164` (sync_position doc); `hft-trade-bot/src/core/bot_setup.cpp:365-385` (broadcast batch + warn); tests `tests/test_doctest_position_manager_v1.cpp:255-347` (6 cases)
- **Verified:** doctest 28/28 green — ghost survives 2 misses, drops on 3rd, streak resets on reappearance, other-exchange positions untouched. g++ compile clean; clang-format clean. Full cmake build not run here (vcpkg toolchain absent on this machine) — header-only TU verified directly, bot_setup.cpp change is a 9-line caller block; CI test-cpp covers the full build.

## R203 — slop-fix — 2 findings closed (S322 venue-runner dedup, S328 dead backtest stack)

### S322 — one shared venue feed loop, three thin wrappers ✅ · verified R213
- **Bug:** `_run_binance`/`_run_okx`/`_run_bybit` were three copies of the same ~60-line skeleton (import-guard → connect → state-lock register → gap-fill → json loop + drop-oldest → exp-backoff); only URL + subscribe-frame construction differed. The copy-paste had already drifted: binance logged `websockets not installed`, okx/bybit returned silently.
- **Fix:** shared `_run_feed(name, url, symbols, subscribe_payload=None)` owns the loop; the venue methods only build their URL/sub-args. Binance keeps subscriptions in the combined-stream URL (no frame); okx/bybit send one `{"op":"subscribe","args":[…]}` post-connect — same relative order as before. Import-guard now logs for every venue (was binance-only).
- **Files:** `ai-signal-bot/src/data_collection/market_data_feed.py:101-165` (shared loop), `:166-178` (binance wrapper), `:224-233` (okx), `:275-284` (bybit); new `tests/unit/test_market_data_feed.py` (6 cases)
- **Verified:** 28/28 feed tests green (incl. existing malformed-message + inst-id tests); wrappers pin URL/subscribe payloads, import-guard log, venue-tagged queue.

### S328 — dead parallel backtest stack deleted, one BacktestResult ✅ · verified R209
- **Bug:** `backtest_engine.py` (330 ln) + `pnl_calculator.py` (251 ln) formed a second backtest stack instantiated by nothing in prod — only `__init__.py` re-exports and their own test files. Its `BacktestResult` stayed live as a DTO in `compare_backtests_request` (`backtest_requests.py:170`) while `BacktestComparison.add` is annotated for `results.BacktestResult` — two same-named diverging contracts.
- **Fix:** deleted both modules (~580 lines) + their three sole-purpose test files (`test_backtest.py`, `test_backtest_engine.py`, `test_pnl_calculator.py` — proven dead: every import inside them references only the deleted modules); `compare_backtests_request` now builds the canonical `results.BacktestResult` (`final_balance=` field; `final_equity` remains a read alias). `__init__.py` re-exports trimmed. `test_backtest_comparison.py` repointed to the canonical result type.
- **Files:** `ai-signal-bot/src/communication/backtest_requests.py:169-196`; `ai-signal-bot/src/backtesting/__init__.py:1-8`; `ai-signal-bot/src/backtesting/results.py:55`; deleted `src/backtesting/{backtest_engine,pnl_calculator}.py`, `tests/unit/{test_backtest,test_backtest_engine,test_pnl_calculator}.py`; `tests/unit/test_backtest_comparison.py:12-35`
- **Verified:** 1253/1253 unit tests green; ruff clean; grep — zero remaining `backtest_engine`/`pnl_calculator`/`BacktestEngine`/`PnLCalculator` refs in src. Live `compare_backtests` path unchanged in shape (DTO fields are a strict subset of the canonical contract).
- **Doc sync:** TESTING.md test-matrix rows (deleted files dropped; stale `test_comm_circuit_breaker` name fixed from the R200 rename), module_guide_en post-cleanup note now covers the deleted stack, project_architecture_en test-tree entry removed.

## R204 — slop-fix — 5 findings closed (S323 backtestEngine dup, S324 fake Retry, S325/S326 python bloat, S327 dispatch)

### S323 — one closePosition body for CLOSE_ALL + end-of-data ✅ · verified R213
- **Bug:** the 25-line close block (slippage exit, signed pnl, fee, short-borrow, 9-field trades.push) existed twice — `case 'close_all'` and the trailing flush — `entryNotional1`/`entryNotional2` rename scars proving the copy. A fix to one copy (fee math, borrow window) would silently miss the other.
- **Fix:** `closePosition(candle, reason)` closure inside `runBacktest` (owns `balance`/`position`/`trades` + fee params); `close_all` → `closePosition(candle,'CLOSE_ALL')`, tail flush → `closePosition(candles.at(-1),'END')`. Same math, one body.
- **Files:** `web-ui/src/utils/backtestEngine.js:212-242` (helper), `:319-321` (close_all), `:356-359` (END flush)
- **Verified:** vitest backtestEngine 8/8 — identical trades/equity (pure dedup).

### S324 — WsManager Retry actually calls connect() ✅ · verified R213
- **Bug:** `handleReconnect` only toasted "…reconnect initiated" — never invoked `connect()`; the Retry button was a placebo while the socket stayed dead.
- **Fix:** `handleReconnect(label, source)` calls `source?.connect()` — both data hooks already expose `connect` (`useExchangeData.js:406`, `useSignalData.js:101`); missing connect falls back to a `warning` toast instead of lying.
- **Files:** `web-ui/src/components/WsManager.jsx:100-107`, `:131`, `:141`; `src/test/wsManager.test.jsx` (+1 case)
- **Verified:** vitest wsManager 7/7 — new test clicks Retry, asserts `connect` called once.

### S325 — stress scenarios share one evaluation tail ✅ · verified R213
- **Bug:** 4 scenario methods each re-spelled the same ~20-line tail (value pre/post → pnl → pnl_pct → margin → StressTestResult); only shock math + margin/liquidity/threshold scalars differed.
- **Fix:** `_evaluate(name, prices, positions, shocked, margin_factor, liquidity_impact, pass_threshold)` owns the tail; each scenario computes `shocked_prices` and passes its constants (2008: .5/.02/.3 · covid: .4/.03/.25 · ftx: .6/.10/.4 · custom: .5/std-based/.3). File 202→~155 lines.
- **Files:** `ai-signal-bot/src/risk/stress_test.py:30-50` (helper), `:52-109` (scenario bodies)
- **Verified:** pytest test_stress_test + metrics suites — 60 passed; ruff clean.

### S326 — alert metrics from one spec table; None-init can't drift ✅ · verified R213
- **Bug:** `_init_alert_metrics` hand-rolled 15 `self.x = Counter/Gauge(...)` blocks; the no-prometheus `__init__` branch hand-listed attrs and had already drifted — missing `backtests_run_total`, `bot_cpu_usage_percent`, `bot_memory_usage_bytes`, `bot_sharpe_ratio` (AttributeError if ever touched without the HAS_PROMETHEUS guard).
- **Fix:** module-level `_ALERT_METRIC_SPECS` = (attr, kind, prom-name, doc) ×15; `_init_alert_metrics` = setattr loop; None-init iterates the same table → all 15 nulled (4 previously missed). Names stay grep-able in the table literal.
- **Files:** `ai-signal-bot/src/monitoring/metrics.py:24-43` (table), `:87-90` (None-init), `:170-174` (ctor loop)
- **Verified:** ruff clean; pytest test_metrics + test_metrics_server + test_monitoring_metrics green.

### S327 — `*_result` dispatch via setter-map ✅ · verified R213
- **Bug:** `handleSignalMessage` spelled 8 identical `case 'x_result': setX(data); break` branches (board refs said useExchangeData.js — the switch moved to useSignalData.js when the hook was split).
- **Fix:** `resultSetters` ref-map `{type: setter}` — setState functions are stable so a ref is safe; `default:` does `resultSetters.current[data.type]?.(data)`. `backtest_result` keeps its own case (fires the onBacktestResult callback); `auth_ok`/`auth_failed` stay (they transform, not `setX(data)`).
- **Files:** `web-ui/src/hooks/useSignalData.js:30-44` (map), `:69-82` (switch)
- **Verified:** vitest useSignalData 5/5; eslint clean.

## R205 — slop-fix — 2 findings closed (S333 fill precision, S336 hdl ordering) — BOARD EMPTY

### S333 — magnitude-aware price tick; dead duplicate constant ✅ · verified R209
- **Bug:** every fill/book/candle price was `round(price, 2)` — a 2-decimal tick hardcoded for dollar-scale assets. Any symbol priced < ~$0.005 (sub-cent/memecoin) collapsed to 0.00 → zero-price positions, broken PnL/notional. `_TYPICAL_VOLUME = 500.0` was also defined twice (`exchange_order_submission.py:19` + `exchange_advanced_orders.py:16`) — flagged as a drift hazard; on inspection the advanced_orders copy was never referenced at all (dead, not drifting).
- **Fix:** `models.round_price()` — `round(price, 2)` for `price >= 1.0` (identical output for every existing major/test symbol), `round(price, 8)` below $1 (crypto-convention precision; a $0.00002 asset keeps its price). Rewired all 8 price sites (fills ×3 order_submission/advanced_orders, candle OHLC, book-level rescale + generation in market_simulator). USD-amount rounds (`margin`/`notional`/`intensity`) and quantity rounds (4-dec) left alone — different domain. Dead `_TYPICAL_VOLUME` deleted; the live one in order_submission stays private (sole consumer).
- **Files:** `exchange_simulator/models.py:9-19` (helper); `exchange_order_submission.py:18,363,449`; `exchange_advanced_orders.py:15,240,255,303` (+dead const removed); `market_simulator.py:14,208-213,323-324,346-347`; tests `tests/test_models.py` TestRoundPrice (3 cases)
- **Verified:** 435 sim tests green incl. new pins (dollar-scale identical, 0.00002 survives, boundary 1.005→1.0). ruff clean.

### S336 — `connection_` hdl published under mutex (both WS clients) ✅ · verified R209
- **Bug:** `order_executor.h` open-handler wrote the non-atomic `websocketpp::connection_hdl` then set `connected_`; submit threads and the watchdog (`connected_.load(relaxed)` :439) read `connection_` with no formal happens-before — torn/stale hdl reads are UB on weak-memory targets, and a reconnect re-write could race an in-flight reader outright. Same pattern in sibling `signal_receiver.h` (write :104, reads :179/:318) — fixed in the same batch.
- **Fix:** `connection_` now guarded by `client_mtx_` — the same mutex already serializing `client_` snapshots. `set_conn()`/`conn_snapshot()` accessors in both classes; all 9 executor send/close/get_con sites + 2 receiver sites go through `conn_snapshot()`. Mutex chosen over release/acquire flag-ordering because a reconnect RE-writes the hdl — only mutual exclusion prevents a torn read mid-rewrite; also matches the established client_ idiom. `connected_` stays a lock-free advisory gate.
- **Files:** `hft-trade-bot/src/execution/order_executor.h:54-56` (publish), `:399-409` (accessors), `:466-471` (member comment), 9 call sites; `hft-trade-bot/src/communication/signal_receiver.h:102-104`, `:276-284` (accessors), `:179`, `:318`, `:347-351`
- **Verified:** clang-format clean both files; standalone TSan/4-thread harness of the publish/snapshot idiom — 40k cycles, no torn reads, moved-from semantics correct. Full cmake build not runnable here (vcpkg deps absent — same env limit as R202); CI test-cpp covers it.
- **Bug caught mid-fix:** receiver open-handler reuses `hdl` for the subscribe frame after publish — `set_conn(hdl)` takes a copy there (moving it first would send on an expired hdl).

## R208 — slop-fix — 5 findings closed (R207 "dead producer feeds" family) — BOARD EMPTY

### S342 — closed-trade accounting via authoritative sim `trade_history` ✅ · verified R209
- **Bug:** `db.close_trade()` + `tracker.record_trade()` had zero prod callers — fills persisted as `OPEN`/`FILLED` forever, so dashboard `trades_closed`/`win_rate`/`total_pnl` and Prometheus `bot_win_rate`/`bot_pnl_total`/daily gauges were structural zeros. The sim already does authoritative close accounting (`Account.trade_history` + `total_trades` in every accounts broadcast) — the bot just ignored it.
- **Fix:** `_ingest_closed_trades()` runs each tick: per-exchange cursor on `total_trades` (first sight arms the cursor — no replay), ingests the `trade_history` tail delta → `save_trade(status='CLOSED')` + `trade_logger.log` + `tracker.record_trade`. Covers paper, live-signal orders AND C++ SHM fills (same sim account). `get_stats.total_fees` scoped to `status='CLOSED'` — execution rows' fees would double-count. Real ccxt accounts have no `trade_history` — that gap stays honestly unwired.
- **Files:** `ai-signal-bot/run.py:136` (cursor), `:270` (tick call), `:399-444` (ingest); `ai-signal-bot/src/database/db.py:180-184` (fee scope); tests `tests/unit/test_run_equity.py` TestIngestClosedTrades (6 cases)
- **Verified:** pytest test_run_equity + test_db 30/30; full unit suite 1300 green; ruff clean.

### S343 — strategy feeds wired: sim news → sentiment, position deltas → MM ✅ · verified R209
- **Bug:** `SentimentStrategy.on_news_event` + `MarketMakingStrategy.on_fill`/`update_inventory`/`update_toxicity` had zero callers → both strategies could only return NEUTRAL; sentiment is `enabled: true` by default. Bonus defect: `on_news_event` overwrote `event.sentiment` with `map[type]*magnitude` unconditionally → pre-scored events would be flattened to 0 anyway.
- **Fix:** `ws_client` captures `news_event` from broadcasts (property). `_route_news_event()` maps sim events (intensity 3-8→magnitude, direction→sign) into `NewsEvent` and dedupes on `(symbol,intensity,direction)` — the sim rebroadcasts the same event for its whole `remaining` window. `on_news_event` keeps provided sentiment when the type map has no opinion (UNKNOWN et al). `_sync_mm_inventory()` diffs signed account positions between ticks → `mm.on_fill` — real inventory + avg-cost PnL, covers opens/closes/flips; missing price → cursor kept, retries next tick. `update_toxicity` stays unwired — no order-flow source exists.
- **Files:** `ai-signal-bot/src/communication/ws_client.py:58,96-100,237-238`; `ai-signal-bot/src/strategies/sentiment.py:101-107`; `ai-signal-bot/run.py:139-140` (cursors), `:271-272` (tick calls), `:446-511` (routers); tests `test_sentiment.py` +2, `test_run_equity.py` TestRouteNewsEvent+TestSyncMMInventory (11 cases)
- **Verified:** pytest sentiment/market_making/ws_client/run_equity 78/78; ruff clean.

### S344 — CB Prometheus reporting wired ✅ · verified R209
- **Bug:** `record_circuit_breaker_trip()` had zero callers (counter pinned 0); `set_circuit_breaker_state()` sat below `if not self._clients: continue` — gauge stale exactly when the breaker trips with no UI attached.
- **Fix:** `CircuitBreaker` accepts an optional `on_trip` hook, fired inside `_trip()` (best-effort, reporting can't break the breaker). Publisher wires `on_trip=self._on_cb_trip` → `self.metrics.record_circuit_breaker_trip()` — lazy attr resolution so the run.py `MetricsExporter` swap is picked up. Status loop now updates the gauge BEFORE the clients gate.
- **Files:** `ai-signal-bot/src/communication/circuit_breaker.py:20` (import), `:49-51` (ctor), `:136-140` (fire); `ai-signal-bot/src/communication/signal_publisher.py:76,86-89` (wiring), `:388-398` (ungated gauge); tests `test_circuit_breaker.py` TestOnTripCallback (3), `test_signal_publisher.py` +2
- **Verified:** pytest circuit_breaker + signal_publisher 50/50; ruff clean.

### S345 — live-adapter read path: lazy feed + aggTrade merge ✅ · verified R209
- **Bug:** `RealExchangeAdapter.initialize()` eagerly started real Binance/OKX/Bybit sockets filling caches nobody reads (all `get_*` = 0 prod callers; only `place_order` used). Latent proof: `@aggTrade` subscribed "for `last`" but never parsed → `last=0.0` forever.
- **Fix:** adapter no longer starts the feed at connect; `RealMarketDataManager._ensure_started()` lazily starts it on the first `get_ticker`/`get_orderbook`/`get_candles` call (order-only adapters pay zero sockets). Feed keeps per-symbol `_ticker_state` — bookTicker updates bid/ask, aggTrade updates `last`, emitted tickers carry all three (a naive aggTrade ticker would have clobbered the book).
- **Files:** `ai-signal-bot/src/data_collection/exchange_factory.py:333-335` (no eager start); `ai-signal-bot/src/data_collection/market_data_manager.py:56-65` (init→start_feed, `_ensure_started`), `:79,87,97` (getter calls); `ai-signal-bot/src/data_collection/market_data_feed.py:47-49` (state), `:179-211` (merge+aggTrade branch); tests `test_market_data_manager.py` (new, 7 cases), `test_market_data_feed.py` TestBinanceTickerMerge (4)
- **Verified:** pytest market_data + exchange_factory 73/73; ruff clean.

### S346 — fit/OOS split; walk-forward honest context windows ✅ · verified R209
- **Bug:** `run_backtest.py` grid-searched params on the full candle set then "validated" on windows inside it — in-sample printed as OOS. `walk_forward` itself never trained: `params` fixed, `train_size` was a skip-offset while its docstring claimed "train on window".
- **Fix:** `split_fit_validation()` chronological 60/40 split — `grid_search` ×2 only on the fit head, `walk_forward` on the untouched tail. `walk_forward` reworked: each window = `train_size` strictly-past context candles (indicator warmup, no trades/metrics) + `test_size` evaluated candles (`warmup=train_size`); redundant `warmup` param dropped; docstring now states fixed-params OOS eval + caller must keep segments disjoint.
- **Files:** `ai-signal-bot/src/backtesting/optimizer.py:193-230`; `ai-signal-bot/run_backtest.py:64-75` (split), `:141-143` (wire), `:148,161` (fit segment), `:181-190` (OOS eval); tests `test_walk_forward.py` (rewritten, +disjoint-context regression), `test_run_backtest.py` (new, 5 cases), `test_optimizer.py`/`test_backtest_optimizer.py` updated
- **Verified:** pytest walk_forward + optimizer + run_backtest 22/22; full suite green; ruff clean.

## R212 — slop-fix — S347/S348/S349 (exchange_simulator ws-стек)

### S347 — WS-layer /metrics fed from real broadcast paths ✅ · verified R213
- **Bug:** `record_broadcast_latency`/`record_delta_update` had zero prod callers (2 eternal-zero gauges); `record_message` ran only in `_send_json` so `messages_total`/`bytes_sent`/`message_size_*`/`bandwidth` counted ~1% of traffic — the tick loop was invisible. `client_count` was a send-time copy that could lag. `compression_ratio` could never move: `compressed_size` never passed AND wire compression (`compression="deflate"`, websocket_server.py:199) is transport-internal — the app cannot observe compressed frame sizes.
- **Fix:** new `_send_tracked(client, payload)` — times each send (latency recorded in `finally` so a backpressured-then-failed send still counts), records size on success. All broadcast paths rewired: `_broadcast_market_data` (main + arb payload), `_broadcast_fills_batch`, `_broadcast_audit_events`, `_broadcast_to_clients`. `record_delta_update` fed at the per-key decision in `_build_orderbook_data` (None→False, delta→True, no-change→skip). `clients_connected` gauge emits `len(self.clients)` at scrape. **Removed** (unmeasurable surface): `record_message(compressed_size)` param, `compression_ratio` field, `exchange_simulator_compression_ratio` gauge — flagged: /metrics surface loses one eternal-zero gauge; `record_message` signature loses a never-used param.
- **Files:** `exchange_simulator/ws_broadcast.py:55-76` (helper+_send_json), `:283,297` (audit/fills), `:316,324` (delta), `:358-363` (market+arb); `ws_metrics.py:40-73` (fields+record_message); `ws_prometheus.py:111-116` (clients_connected live, compression block gone); `ws_message_handler.py:635` (_broadcast_to_clients); tests `test_websocket_server.py` TestWebSocketMetrics reworked (+5 prod-path cases), `test_ws_broadcast.py` unaffected
- **Verified:** pytest ws_server+ws_broadcast+ws_events+handler+exchange 171/171; full sim suite 442 green; ruff clean.

### S348 — control acks delivered via `_send_json` ✅ · verified R213
- **Bug:** 4× `asyncio.create_task(websocket.send(json.dumps(...)))` unreferenced — GC-able mid-flight, exceptions swallowed; raw `json.dumps` also bypassed negotiated encoding (msgpack clients got unparseable TEXT) and metrics. `replay_state` on speed=0 is the client's only pause-sync.
- **Fix:** `_handle_set_speed`/`_handle_update_config` → `async def` (dispatch sites awaited); all 4 acks go through `await self._send_json(...)` — delivered, encoded per client negotiation, counted.
- **Files:** `exchange_simulator/ws_message_handler.py:194,208` (dispatch), `:392-410` (set_speed), `:540-543` (config sig), `:587-592` (config_updated); tests: existing `test_set_speed`/`test_update_config_*` now deterministic; `test_set_speed_pause` asserts the replay_state push arrives
- **Verified:** same suite run as S347 — 171/171, 442 full; ruff clean.

### S349 — close_reason travels on the order ✅ · verified R213
- **Bug:** `ws_exchange_events` read `trade_history[-1].reason` for EVERY closed order in a tick — >1 close/tick (SL BTC + TP ETH) all inherited the last entry's reason; worse, a FILLED order that appended no trade (advanced-order fill opening/increasing a position) inherited a stale SL/TP label. Wrong reason → AlertWebhook misclassifies liquidation/sl_tp/fill + wrong `CLOSED_{reason}` in trade CSV. Exchange side had the same `[-1]` stamp fragility.
- **Fix:** reason rides the order — `Order.close_reason` field (emitted by `to_dict`), set in `_close_triggered_position`; `ClosedTrade.order_id` written at `_close_position`, trade stamp joins by `order_id` instead of list position. WS layer reads `order.close_reason`; `[-1]` lookup deleted. Public-surface flag: `Order.to_dict`/`ClosedTrade.to_dict` gain `close_reason`/`order_id` keys (additive).
- **Files:** `exchange_simulator/models.py:145,178` (Order), `:414,430` (ClosedTrade); `exchange_position_lifecycle.py:68` (order_id); `exchange_liquidation.py:96-104` (order stamp + id-join); `ws_exchange_events.py:31-62` (per-order reason, to_dict carries it); tests `test_simulated_exchange.py::test_batch_closes_carry_own_reason`, `test_ws_exchange_events.py::test_close_reason_flows_per_order`
- **Verified:** same suite run — 171/171, 442 full; ruff clean.

## R215 — slop-fix — S350/S351/S352 (hft-trade-bot SHM IPC + health)

### S350 — `test_integration_shm.cpp` rewritten against the real SHM API ✅ · verified R216
- **Bug:** the file referenced a phantom API that never existed (`ExchangeId::Binance`/`SymbolId::BTCUSDT`/`Side::Buy`, `fill.quantity`/`order_id`, `init(name,cap)`, static `unlink`s, `push`/`has_pending`, size asserts 64/48/64 vs actual 32/28/28) — uncompilable on every platform, yet wired into all POSIX builds (`if(NOT WIN32)`) → Linux CI `make -j` was red; Windows skipped it silently. Latent extra defect found while fixing: `shm_fill_producer.h` used `spdlog::error` without including `<spdlog/spdlog.h>` — survived only via include-order luck, would break any TU that includes it first.
- **Fix:** full rewrite against the real API — wire-size contract asserts (32/28/28/16), `ShmFillProducer`→`ShmRingBuffer<FillMsg>` consumer roundtrip with field asserts, full-ring failure (no silent overwrite), `ShmRingBuffer<SignalMsg>` producer→`ShmSignalConsumer::start(cb)` thread+callback delivery, `KillSwitchMsg` roundtrip. Coverage is real now: producer→consumer paths exercised end-to-end, not just struct sizes. `shm_fill_producer.h` gained its own `#include <spdlog/spdlog.h>` (self-contained header).
- **Files:** `hft-trade-bot/tests/test_integration_shm.cpp:1-153` (rewrite); `hft-trade-bot/src/ipc/shm_fill_producer.h:7-11` (include)
- **Verified:** clang-22 `-fsyntax-only` clean (doctest + real headers, Windows-stub ring impl — target itself is POSIX-only, runtime check rides CI); wire-contract TU static_asserts enum values + struct sizes.

### S351 — dead/contradictory IPC declarations removed or wired live ✅ · verified R216
- **Bug:** `AlignedOrderBookLevel`, `RoutingDecision`, `SymbolId` (49-entry static snapshot of a runtime-dynamic map), `Action`, `Side`, `ExchangeId` — all dead. `ExchangeId` also contradicted the wire: `SIMULATOR=0`/`BYBIT=3` vs field doc + producer `3=Simulator`.
- **Fix:** deleted `SymbolId` (drift hazard — runtime `symbol_to_id_` is the real map), `AlignedOrderBookLevel`, `RoutingDecision`. `ExchangeId` reordered to the wire doc (`BINANCE=0,OKX=1,BYBIT=2,SIMULATOR=3`) and wired into the producer (`f.exchange_id = static_cast<uint8_t>(ipc::ExchangeId::SIMULATOR)`); `ipc::Side` wired into the fill side literal; `ipc::Action` wired into the signal decode at bot_setup — dead declarations became live, self-documenting protocol uses. **Flagged:** enum values changed (enum was dead — wire bytes unchanged, producer still emits 3); `test_shm.cpp:143` literal `1 // OKX` stays correct under the new order.
- **Files:** `hft-trade-bot/src/ipc/shm_protocol.h:82-107` (SymbolId gone, ExchangeId fixed); `src/data/aligned_types.h` (AlignedOrderBookLevel/RoutingDecision deleted, was :17-24/:231-270); `src/communication/signal_receiver_handlers.h:53-59`; `src/core/bot_setup.cpp:272-274`; `tests/test_integration_shm.cpp:44-68,99,125` (enums used in asserts); docs `ARCHITECTURE.md:292`, `TRADING_STRATEGIES.md:469` (deleted struct names removed)
- **Verified:** wire-contract static_asserts pass (enum values == wire doc, sizes == Python layouts); headers compile standalone.

### S352 — `signal_engine_active` is a real liveness bit; `cpu_usage_pct` deleted ✅ · verified R216
- **Bug:** `is_healthy()` included a bit that could never be false (engines unconditionally constructed pre-loop) — decorative conjunct. `cpu_usage_pct` dead field (0 writers/0 readers, never serialized).
- **Fix:** new `BotContext::last_engine_eval_ms` atomic stamped at both real eval sites — `generate_signal` (v2/v3 chokepoint) and `engine_v1->analyze` (v1 fallback). `signal_engine_active` = engine exists AND (never evaluated — warmup — OR evaluated <60s ago): once the first eval happens, a stalled engine loop trips `/health` 503. Semantics match `last_signal_age_ms` (stall → unhealthy is already the endpoint's shape). **Flagged:** post-first-eval, `signal_engine_active` can now be false — new reachable 503 path (honest: engine stall during a feed-alive window was previously invisible); `cpu_usage_pct` removed from `HealthStatus` (never in JSON — no wire change). Doc: stale "update_health() has zero callers" claim at `ARCHITECTURE.md:145` corrected — the feed has been live since S246.
- **Files:** `hft-trade-bot/src/core/bot_context.h:90-92`; `src/core/bot_loop.cpp:160-169` (v2/v3 stamp), `:304-308` (v1 stamp), `:391-408` (gate); `src/monitoring/system_monitor.h:304`; `docs/ARCHITECTURE.md:145`
- **Verified:** `bot_context.h`/`system_monitor.h` compile clean; `FastSignal::now_epoch_ns()` type-checked in wire TU; gate logic review-verified (`bot_loop.cpp` dep-blocked locally — no vcpkg on this box; CI compiles it).

## R218 — slop-fix — S353 (stale docstrings, monitoring+scripts)

### S353 — stale docstring claims corrected at both sites ✅ · verified R219
- **Bug:** doc-claims outlived code at two sites, same pattern: `monitoring/ebpf_monitor.py` `_report` docstring said "Log current stats as JSON **and update Prometheus metrics**" — the `prometheus_client` Gauge block was added in Пачка HH then deleted (git-confirmed; a Gauge with no `/metrics` endpoint exposed nothing anyway), docstring survived. `scripts/benchmark_suite.py` module docstring said "Latency measurement for **all HFT components**... for each pipeline stage" — all six benches are inline toy loops on canned data with zero pipeline imports (docs/PERFORMANCE.md:25-29 already discloses honestly; the script header still inflated).
- **Fix:** corrected both docstrings to match reality — `_report` now says "Log current stats as JSON (no metrics export — standalone tool)"; benchmark header now says "synthetic proxy micro-benchmarks (NOT the real pipeline)" + points at PERFORMANCE.md. Rejected alternative: restoring the Gauge code — would require adding a metrics HTTP endpoint the standalone tool never had (scope creep, and likely why it was removed).
- **Files:** `monitoring/ebpf_monitor.py:153`; `scripts/benchmark_suite.py:2-7`
- **Verified:** `python -m py_compile` clean on both files.

## R220 — slop-fix — S354/S355 (docs-vs-reality rot)

### S354 — TESTING.md numbers + coverage claims corrected to verified actuals ✅ · verified R221
- **Bug:** systematic rot — every count wrong and self-contradictory (Py 118/126 → real 120; C++ 25 → real 26 incl. integration/+unit/ subdirs; JS ~158/162 → 159; totals 303/304/307 → 305+5 e2e), phantom test names (`test_trading_flow.py`, `test_marketplace`, `test_cross_exchange_arb`, `test_portfolio_optimizer`, `test_integration_signal_engine`), false coverage claims (`test_alerts.py` does NOT cross-check metric names — structure only; `test_integration.py` has zero health asserts — health coverage lives in `tests/unit/test_health_server.py`/`test_metrics_server.py`; sim `:8775/health` covered by docker-smoke + compose healthcheck, no pytest). Same-pattern fix: `ADVANCED_ORDER_TYPES.md:349` `test_order_types.py` → real `test_advanced_order_types.py`+`test_exchange_advanced_orders.py`; `QUICK_START.md:176` self-contradictory comment removed.
- **Fix:** rewrote all counts to ls-verified actuals (120 Py / 26 C++ / 159 JS / 305 total +5 e2e), corrected integration count 4→3 with real file purposes, replaced phantom names with real ones, rewrote coverage claims to describe what tests actually do, corrected health-endpoint coverage attributions. Initial recount missed `tests/{integration,unit}/` subdirs — corrected C++ 23→26 and total 302→305 in the same pass.
- **Files:** `docs/TESTING.md:23,84-92,95,103-105,113-117,122,157,166,182,193-194,229,235-241`; `docs/ADVANCED_ORDER_TYPES.md:349`; `docs/guides/QUICK_START.md:174-177`
- **Verified:** every count re-globbed recursively (`find ... -name 'test_*'`); every named test file `ls`-checked; coverage claims re-read in source.

### S355 — RISK_MANAGEMENT.md examples rewritten against the real API ✅ · verified R221
- **Bug:** phantom-API tour — entire `### RiskAnalyzer` section documented `src/risk/var_stress_test.py`+`RiskAnalyzer` which never existed; wrong method names (`calculate_historical_cvar`→`calculate_cvar`, `size_by_volatility`→`calculate_position_size`, `run_covid_crash`→`covid_crash_scenario`, `update_stop_loss`→`init_position`+`update`); wrong kwarg (`entry=`→`entry_price=`); phantom `test_risk_modules.py` (×2).
- **Fix:** every example rewritten to real signatures (`calculate_cvar`, `calculate(balance, entry_price, stop_loss)`, `calculate_position_size(signal, price, volatility, risk_per_trade, method)`, `covid_crash_scenario(current_prices, positions)`, `init_position`+`update` with real `actions` keys `new_stop_loss/close_position/close_reason/partial_close_pct`); phantom RiskAnalyzer section deleted; test table → real files (test_risk/test_cvar*/test_kelly*/test_position_sizing/test_risk_manager).
- **Files:** `docs/RISK_MANAGEMENT.md:135-141,176,204-213,241-253,293-303,341-349`
- **Verified:** all class names `grep`-confirmed in `src/risk/`; all method names + signatures + result fields + actions-keys read from source; all 5 test files `ls`-confirmed.

## R221 — slop-audit+fix — S356 (tools/ + monitor sweep)

### S356 — `load_10k` advertised latency percentiles structurally dead + PASS label ignored `--target` ✅ · verified R233
- **Bug:** `record_message` measured latency as `wall_now − msg["timestamp"]`, but every broadcast timestamp is the simulator's *simulated* clock (`ws_broadcast.py` → `market.current_timestamp`, seeded at 1704067200 and advanced by candle interval) — the delta is ~years, so the `0 < ms < 10000` sanity filter rejected 100% of samples and p50/p95/p99 always printed N/A. Second defect: report printed `PASS if avg >= 10000` while `sys.exit` honored `--target` — the label and the exit code could disagree.
- **Fix:** removed the dead timestamp-parse block; added `_sample_latency` — a 1 Hz WS ping→pong RTT sampler (the pattern `load_50_symbols.py` already uses) run as a task alongside the recv loop; `report()` now takes `target` and labels `Target ({target}/sec)` consistently with the exit gate.
- **Files:** `exchange_simulator/tools/load_10k.py:50-52,61,89,103-106,113-120,142,169,187`
- **Verified:** `py_compile` + `ruff` clean; live check against a stub WS server — 4 real RTT samples collected in 3s, ~55k msgs received, report prints real percentiles and `Target (1/sec): PASS` with a custom `--target`.

Audit result for the rest of the sweep: `load_50_symbols.py` clean (ping/pong latency correct), `stress_load.py` clean (client-side `client_order_id` RTT correlation — the right way), `chaos_reconnect.py`/`chaos_enhanced.py` clean (real process lifecycle, Windows process-group kill chain, S220-correct `python -m exchange_simulator`), `ai-signal-bot/monitor.py` clean (all display keys — `entry_price`/`stop_loss`/`take_profit`/`rr_ratio`/`direction`/`confidence`/`reason` — verified against real signal payloads; honest reconnect backoff).

## R222 — execution-verify — full test-suite sweep (no new findings)

Ran every runnable suite end-to-end instead of read-verifying individual entries:

- `exchange_simulator`: **446 passed / 7 skipped** — all skips are honest env gates (`hypothesis` not installed).
- `ai-signal-bot`: **1341 passed / 2 skipped** — `resource` module (Windows), SHM unavailable in this environment.
- `web-ui` vitest: **159 files / 1133 tests — all pass**.
- `hft-trade-bot` ctest: **environment-blocked** — `build/Debug/*.exe` are ASan-instrumented MSVC-debug binaries produced under `S:/` (CTestTestfile paths don't resolve); they need `MSVCP140D`/`VCRUNTIME140D`/`ucrtbased`/`clang_rt.asan_dynamic` which are absent on this host (local toolchain is llvm-mingw; no VS debug CRT). Not a repo defect — the suite runs in CI; sources were clang-22 syntax-verified in R216.

**Result: 2,920 tests green, 0 real failures.** Also audited verify-debt: the 4 done-log headers without a ✅ stamp (S207/S210/S230/S309) all carry inline `Верифицировано R150` or are the R182-closed S309 deferred note — zero actual unverified entries.

## R223 — env-var cross-check sweep — S357

### S357 — `.env.prod.example` asymmetric: `OPENAI_API_KEY` listed, `ANTHROPIC_API_KEY` absent (Info) ✅ · verified R233
- **Bug:** `src/llm_engine/engine.py:60` reads `ANTHROPIC_API_KEY` when `llm.provider: anthropic` is configured; `docs/guides/CONFIGURATION_GUIDE.md:385` documents it — but the prod env template (the file operators copy to `.env.prod`, forwarded into containers via `env_file:`) listed only `OPENAI_API_KEY`. An anthropic deployer gets no hint of the var name.
- **Fix:** added `ANTHROPIC_API_KEY=` with a provider-hint comment next to `OPENAI_API_KEY`.
- **Files:** `.env.prod.example:59-61`
- **Verified:** var name matches `engine.py:60` `os.getenv` exactly; guide :385 already documents it — now symmetric.

Sweep result otherwise clean: all 20 Python `os.environ`/`getenv` reads + 1 C++ `getenv` resolved — `EXCHANGE_WS_HOST`/`LOG_FORMAT` set by every compose + helm, `EXCHANGE_METRICS_HOST`/`AI_BOT_BIND_HOST`/`WS_URL`/tokens/`VITE_*` all in the example or `.env.mock`, `SHM_MARKET_*` documented in CONFIGURATION_GUIDE:423-425 (opt-in, both sides graceful — hft `init_shm_market_data` warns and falls back to WS), `AI_BOT_COMPUTE_RATE_LIMIT` sane default + code comment, `APP_VERSION`/`SIGNAL_WS_URL`/`OTEL_*`/`WD_SKIP_COVERAGE`/`NODE_OPTIONS` tooling/defaults. JS: all 5 `import.meta.env.VITE_*` reads documented.

## R224 — imports-vs-requirements cross-check — S358

### S358 — `tools/stress_load.py` bare `import psutil` not in any requirements file (Info) ✅ · verified R233
- **Bug:** `stress_load.py:21` imports `psutil` unconditionally, but neither `requirements.txt` nor `requirements-dev.txt` pins it — a clean dev checkout crashes at import. Sibling `load_10k.py` guards it (`HAS_PSUTIL`); `stress_load` doesn't. Docker images only install `requirements.txt`, so the bare import was only ever true in dev envs — which lacked the pin.
- **Fix:** `psutil>=5.9.0` added to `exchange_simulator/requirements-dev.txt` (dev tools live under dev deps; `>=` convention matches the file). Chosen over guarding the import: the memory-growth scenario is a named feature of the tool — silently skipping it would weaken the harness.
- **Files:** `exchange_simulator/requirements-dev.txt:8-9`
- **Verified:** `psutil 5.9.7` installed locally satisfies the floor; `stress_load` module imports cleanly; no other unguarded third-party imports exist in either Python tree (ccxt/lightgbm/xgboost/scipy/sklearn/structlog/opentelemetry/msgpack/orjson/pyarrow/run_logger/trade_csv_logger/psutil-in-load_10k all inside `try:` or function-level guards).

## R226 — async-task lifecycle audit — S359

### S359 — `ws_client._request_resync` fire-and-forget task swallowed send failures (Info) ✅ · verified R233
- **Bug:** `ws_client.py:258` was the only `create_task` site in the codebase with no task reference and no done callback — every sibling site either stores the task for cancel+await on shutdown or registers `add_done_callback(self._on_task_done)` (the run.py idiom). If `_send_resync`'s `ws.send` raised (e.g. `ConnectionClosed` on the flaky socket that caused the gap in the first place), the exception died in the GC "exception never retrieved" handler and the resync was silently skipped — self-healing only on the next gap + 5s cooldown, with no log anywhere.
- **Fix:** keep the task reference + `add_done_callback(self._on_resync_done)` which logs `logger.warning("Resync request failed: %s", exc)` — matches the codebase's `_on_task_done` idiom.
- **Files:** `ai-signal-bot/src/communication/ws_client.py:258-265`; `tests/unit/test_ws_client.py` (new `test_resync_send_failure_logged`).
- **Verified:** new test drives a real seq-gap → `send` raising `ConnectionClosed` → asserts the warning fires (initial `caplog`/`assert_called_once` versions failed for honest reasons — structlog logger not caplog-visible, and the gap path itself warns — final version asserts the message in `call_args_list`). Full file: 27 tests green; compile+ruff clean.

## R228 — time-source audit — S360

### S360 — `exchange_simulator` duration measurements on wall clock (Info) ✅ · verified R233
- **Bug:** two duration sites used `time.time()` where `time.monotonic()` is required — the codebase's own convention (`ai-signal-bot` uses `monotonic()` at `metrics_server.py:31`, `health_server.py:53`, `health_checks.py:61`, `ws_client` resync cooldown). (a) `ws_message_handler._check_rate_limit` (`now`/`window_start`) — an NTP backward step makes `now - window_start` negative → the window never expires → the client is throttled indefinitely; a forward step resets early → limiter leaks. (b) `ws_metrics._start_time`/`get_bandwidth_mbps` — `elapsed` could go negative → a *negative* `exchange_simulator_bandwidth_mbps` gauge exported to Prometheus (`ws_prometheus.py:119`); the `== 0` guard didn't cover it.
- **Fix:** both sites → `time.monotonic()`; `elapsed == 0` guard → `<= 0`. All other `time.time()` uses audited and correct — wall-clock record timestamps (`models.py` factories, `audit_logger`, `arbitrage` `closed_at`, serialized `"timestamp"` fields) and wall-to-wall comparisons (GTD `expire_ts`, signal `created_ts`). Dev tools' deadline loops left on wall clock deliberately (human wall-time semantics).
- **Files:** `exchange_simulator/ws_message_handler.py:50,75`; `exchange_simulator/ws_metrics.py:51,100-101`; `exchange_simulator/tests/test_websocket_server.py:519`.
- **Verified:** 51 tests green in test_websocket_server.py (incl. rate-limit + bandwidth tests); ruff clean.

## R229 — React lifecycle sweep — S361

### S361 — `useWebSocket` unmount spawns a ghost reconnect loop (Medium) ✅ · verified R233
- **Bug:** the mount-effect cleanup (`useWebSocket.ts:254`) cleared all three timers and called `ws.close()` — but never set `manualCloseRef`. `close()` fires `onclose` asynchronously, which calls `scheduleRetry()` whenever `manualCloseRef` is false — creating a NEW `reconnectTimer` after the cleanup ran. That timer survives unmount (nothing clears it), fires `connect()`, and builds a fresh WebSocket on a dead component — a ghost socket that reconnects forever (`reconnectAttempts` resets on open, so even the S231 maxReconnects cap never fires). `disconnect()` set the flag correctly; only the unmount path missed it — every component unmounting while connected (tab/route switches, conditional panels) leaked a zombie WS.
- **Fix:** `manualCloseRef.current = true` in the unmount cleanup before `ws.close()` — one line, same semantics as `disconnect()`.
- **Files:** `web-ui/src/hooks/useWebSocket.ts:254-261`; `web-ui/src/test/useWebSocket.test.jsx` (new `unmount does not spawn a ghost reconnect (S361)`).
- **Verified:** test FAILS pre-fix (mockInstances=2 — ghost socket created) and passes post-fix (14 tests green). Proven regression, not a smoke check.

## R230 — NaN/inf serialization sweep — S362

### S362 — `portfolio_requests` validators accept non-finite floats → unparseable frames (Info) ✅ · verified R233
- **Bug:** `1e999` is valid JSON — `json.loads` yields `inf`. Every float-parse in `portfolio_requests.py` accepted it: `_returns_from_candles` closes (`inf/inf` → NaN returns → NaN cov matrix), `current_weights`/`market_weights`/`portfolio_value`/`risk_free_rate` (rf=inf → sharpe `-inf`), view weights/expected_return/confidence, surface `strike`/`maturity_days` (`<=0` misses inf/nan), `forward`, `eval_strikes`. NaN/inf then flowed to `json.dumps`, which emits bare `NaN`/`Infinity` — invalid JSON → the client's `JSON.parse` throws → the entire response frame is dropped (useWebSocket's catch logs + discards). One malformed request → its response silently never arrives.
- **Fix:** `np.isfinite` checks at all 8 parse sites, returning the file's existing error-string idiom ("must be finite") — input-side rejection matching `analysis_requests:55` ("returns must be finite"). `iv`/`beta` were already safe via bounded ranges.
- **Files:** `ai-signal-bot/src/communication/portfolio_requests.py:46,192-194,201-203,214-216,225-227,90-96,250-252,326,338-340`; `tests/unit/test_portfolio_requests.py` (6 new error-path params).
- **Verified:** 25 tests green incl. 6 new `1e999` rejection cases; ruff clean.
