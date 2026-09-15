# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → текущий раунд R198+. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (226 шт на R198) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> **R199:** все 9 Dependabot-алертов web-ui (+2 найденных `npm audit` сверх списка) закрыты → done-log R199. `npm audit` = 0.
> История работ: `.cascade/progress.md`, баги: `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 985 (ai-signal-bot 192, web-ui 533, hft-trade-bot 85, exchange_simulator 67, scripts 20, helm 20, monitoring 12, terraform 6, .github 10, docs 16, docker/compose 12, root 21, .cascade 3). Untracked на диске: `hft-skills/` (1132 ф., gitignored), `deploy/k8s/` (1 ф.) |
| Всего находок | ~349 (S001–S349) |
| Закрыто | 232 |
| Открыто | **3** |

**Текущее состояние:** R211 slop-audit exchange_simulator remainder (~4.6k строк: ws_*-стек, market/options simulators, arbitrage, audit_logger, data_export, config_validator, models, visualizers, __main__) — 3 находки: **S347** (Medium — WS-layer /metrics gauges полумёртвы: 3 вечных нуля + hot broadcast path обходит record_message), **S348** (Info — floating create_task-acks: replay_state/config_updated могут потеряться), **S349** (Info — close_reason misattribution при batch-closes). Чисто: ws_message_handler (rate-limit/auth/dedup/validation), ws_broadcast (per-encoding variants, deltas, seq), wire-schema ↔ web-ui consumer, Black-Scholes + GBM engine, audit/exchange/main — реальные. Board: 3 open. Ранее: R210 web-ui/src ЧИСТО; R208 slop-fix — все 5 находок R207 закрыты. **S342** — `_ingest_closed_trades()` потребляет авторитетный `trade_history` симулятора по курсору `total_trades` (CLOSED-строки + `tracker.record_trade` + CSV; `get_stats.total_fees` сужен до CLOSED — иначе дабл-каунт). **S343** — `news_event` бродкаста маппится в `NewsEvent` (intensity→magnitude, direction→sign) → `SentimentStrategy.on_news_event`; `on_news_event` больше не затирает pre-scored sentiment когда map не имеет мнения; position-delta → `MarketMakingStrategy.on_fill` (inventory+avg-cost PnL живые; toxicity остаётся unwired — нет order-flow источника). **S345** — market-data feed стартует лениво по первому чтению (`_ensure_started`), `@aggTrade` парсится и мёржится с bookTicker в `_ticker_state` → `last` реальный. **S346** — `split_fit_validation` (60/40 chronological): grid_search только на fit-сегменте, walk_forward на нетронутом OOS-хвосте; `walk_forward` честно: train_size = strictly-past context (warmup), test_size = evaluated segment, warmup-параметр убран. **S344** — `CircuitBreaker(on_trip=...)` → `metrics.record_circuit_breaker_trip` на реальном трипе; `set_circuit_breaker_state` вынесен из-под клиент-гейта. 1300 unit-тестов зелёные. Board: 0 open.

R207 ai-signal-bot/src full sweep — 5 находок, все одной семьи "живой код, мёртвый продюсер": **S342** (Medium — нет closed-trade пути: `db.close_trade`+`tracker.record_trade` без caller'ов → dashboard/`bot_win_rate`/`bot_pnl_total`/daily-PnL gauge структурные нули), **S343** (Medium — zombie-стратегии: `on_news_event`/`on_fill` без caller'ов; sentiment включён дефолтом, sim шлёт `news_event`, бот игнорит), **S345** (Medium — live-adapter read-path мёртв end-to-end: feed работает, reader'ов нет; `@aggTrade` подписан но не парсится → `last=0.0`), **S346** (Medium — walk-forward «валидация» in-sample: grid_search по полному сету → OOS-claim ложный), **S344** (Low — `circuit_breaker_trips_total` никем не инкрементится; state-gauge обновляется только при наличии WS-клиентов). Чисто: вся стратегическая/risk/portfolio математика, SHM-стек, request-хендлеры, observability — реальные. Board: 5 open.

R195 ai-signal-bot safety-gates audit — 3 находки, все про "защита, которая не защищает": **S337** (High — CircuitBreaker не может сработать: `record_failure` без prod-caller'ов; и даже сработав, гейтит только broadcast — ордера и SHM-фид идут дальше), **S338** (Medium — `is_trading_active` гейтит только paper; live-путь без halt-гейта; `_hft_kill_active` до ордеров не доходит), **S339** (Medium — validator drawdown-чек мёртв: `update_pnl` никто не вызывает). Чисто: llm_engine (реальные HTTP-клиенты + honest provider=none), real_account/exchange_factory (ccxt-backed live path), hawkes (живой WS-endpoint), Database (WAL sqlite), SignalValidator остальные чеки живые. Board: 18 open.

R194 hft-trade-bot C++ core audit — 3 находки: **S334** (Medium — partial-close fee double-count в `realized_pnl_total_`), **S335** (Medium — `sync_position` never removes → фантомные позиции на пропущенных филлах), **S336** (Info — `connection_` hdl опубликован без ordering). Чисто: SPSC ring buffer (текстбук-правильные acquire/release), 3 поколения signal engines все честно заведены (v3 оборачивает v2, v1 = explicit fallback с warn на synthetic book), order_executor (truncation-гарды, arb unwind, watchdog). Board: 15 open.

R193 exchange_simulator fill-model audit — 4 находки: **S332** (High — JS backtestEngine lookahead, twin of S329), **S330** (Medium — iceberg fills unconditional at stale limit price + dead slice model broadcast as static fake fields), **S331** (Medium — partial liquidation bypasses submit_order: no fee/slippage/audit), **S333** (Info — hardcoded round(·,2) tick + duplicated `_TYPICAL_VOLUME`). Clean: submit_order validation, margin math (traced all close branches — balances), SL/TP triggers, trailing-stop semantics, funding signs, order-book model. Board: 12 open.

R192 domain-math audit — 2 находки: **S329** (High — `Backtester` lookahead: `analyze()` видит бар `i`, филл по `candles[i].close`; все бэктест-поверхности завышены) и **S328** (Medium — мёртвый параллельный стек `backtest_engine`+`pnl_calculator` ~580 строк + двойной `BacktestResult`-контракт). Стратегии/risk/pricing leaf-read: mean_reversion, sentiment, ml_ensemble, statistical_arbitrage, trend_following, funding_arb, kelly/cvar/var/position_sizing/risk_manager, volatility_surface — реальные вычисления с NaN-гардами, чисто. Markowitz rf-mix латентен (rf дефолт 0.0, UI не шлёт). Board: 8 open.

R182 slop-fix — закрыта последняя открытая находка **S309** (docker-smoke был красным by construction — убраны все 3 структурные причины: `GRAFANA_PASSWORD:?` убивал `up` на интерполяции ещё до S303-образа [воспроизведено через `docker compose config`], мёртвый `--timeout 60` → `--wait-timeout 240`, job-budget 10→20 мин; тот же дефект-паттерн пофикшен в `docker-smoke-test.{sh,bat}`). Runtime-подтверждение healthy-цепочки = следующий CI-прогон (daemon на хосте недоступен). Gate ALL GREEN. **Board: 0 open.**

R180 slop-fix — закрыты все 4 находки R179: **S318** (CONFIGURATION_GUIDE переписан под живую gate-reference поверхность — 4 удалённые секции выкинуты, 49 пар), **S319** (+3 секции стратегий: Sentiment/MarketMaking/MLEnsemble, voter-list исправлен), **S320** (un-runnable benchmark-команды заменены реальными: positional argv + USE_PGO/Profile + yaml histograms; REST-строка выкинута; «5 strategies»→6; Measured-колонка помечена ad-hoc; benchmark_suite toy-дисклеймер), **S321** (docker-compose v1 → docker compose v2, 23 сайта, имена файлов сохранены). Gate ALL GREEN. Board: 1 open — S309 Medium (Docker-blocked).

R175 slop-fix — закрыты 5 Info-находок: **S227** (пустой hft package-lock без package.json + 9 протухших .gitkeep удалены; ai-signal-bot/scripts/.gitkeep легитимен — директория пуста), **S223** (живые WS-счётчики теперь в /metrics — 9 новых Prometheus-серий; мёртвая get_metrics()-цепочка, которую читал только собственный тест, удалена), **S238** (WsInspector читает настоящие фреймы через новый tap в useWebSocket — publish/subscribe с нулевой ценой без подписчиков; фабрикация по candles.length убрана; сокеты помечены exchange/signal; +4 теста), **S237** (оба mock-хука получили полный shape-паритет — openOrders/auditLogs/optionsChain/7 *Result/authState/connect/nextReconnectIn; contract-test фиксирует паритет), **S241** (@testing-library/user-event удалён — 0 импортов; numpy-половина уже закрыта в S313). Gate ALL GREEN. Board: 8 open — S309 Medium (Docker-blocked) + 7 Info.
---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| S347 | Dead WS-layer Prometheus metrics | `ws_metrics.py` + `ws_broadcast.py`. 3 gauges вечные нули: `record_broadcast_latency` 0 prod-caller'ов → `exchange_simulator_broadcast_latency_p95_ms`; `record_delta_update` 0 caller'ов → `delta_update_ratio`; `compressed_size` никогда не передаётся → `compression_ratio`. Плюс `record_message`/`client_count` только в `_send_json` (:58) — горячие broadcast-пути (`_broadcast_market_data`/`_broadcast_fills_batch`/`_broadcast_audit_events`) обходят их → `messages_total`/`bytes_sent`/`clients_connected`/`message_size_*` считают только connect-time sends, тик-цикл невидим. S223 завёл fed-счётчики; эти остались test-fed only. Grafana/алерты на них мертвы (S344-семья). | Medium | [ ] Open |
| S348 | Floating `create_task(send)` acks | `ws_message_handler.py`:400,408,410,589 — `asyncio.create_task(websocket.send(...))` без ссылки: task может быть GC'd mid-flight (asyncio docs прямо предупреждают), исключения теряются. `replay_state` при speed=0 (:400) — единственное уведомление клиента → его `replayPaused` может разойтись с сервером; `config_updated` (:589) — клиент не узнает о reject'ах. | Info | [ ] Open |
| S349 | `close_reason` misattribution в batch-closes | `ws_exchange_events.py`:36-37 — для каждого closed-ордера в тике читается `trade_history[-1].reason` (последний close, не текущий ордер). При >1 закрытии за тик (SL на BTC + TP на ETH) все получают reason последнего → неверный `close_reason` в fill-бродкасте (AlertWebhook misclassifies liquidation/sl_tp/fill) + неверный `CLOSED_{reason}` статус в trade CSV. | Info | [ ] Open |















---

## DEPENDABOT / SUPPLY-CHAIN — R199 ✅ CLOSED → done-log

Все 9 open-алертов Dependabot web-ui (#82–#85 fast-uri, #87 browserslist, #88/#89 vitest+mocker, #90 baseline-browser-mapping, #91 js-yaml) **+ 2 extras из `npm audit`** (brace-expansion ×3 копии, nanoid) — закрыты. Все цепочки devDependencies-only, prod-бандл не затронут. `npm audit` = 0. Детали/цепочки/версии: `.cascade/done-log.md` → **R199**. Dependabot-PR #83, #86–#89, #92 superseded.

---

## ЧИСТО (проверено индивидуально, 0 совпадений)

- R207: `ai-signal-bot/src` full sweep (66 файлов/12.9k строк) ЧИСТО кроме S342–S346: вся стратегическая математика реальна (trend/meanrev/ensemble/fft_cycle/stat_arb/ml_features/market_making/sentiment — NaN-гарды, A-S формулы, OLS/ADF/Kalman), indicators оба пути (numpy+pure, Wilder RSI), risk (var/cvar/kelly/position_sizing/risk_manager trailing+BE), portfolio (markowitz/BL/risk_parity/rebalancing — все за живыми WS-хендлерами), hawkes (grid-MLE+intensity), fft_analysis (numpy FFT+Hann), observability (structlog+OTel+health_checks реальны), monitoring (alerting/health_server/metrics обе реализации/tracker-класс), SHM-стек (seqlock+SPSC ring+producer/consumer/market-writer+kill — байт-в-байт с C++), comm (ws_client reconnect, signal_publisher rate-limit+CB bool-контракт S337, analysis/portfolio/backtest requests — валидация+to_thread, metrics_server honest fallback), backtesting (post-S329 backtester, results/metrics/report/plotter/comparison/optimizer), llm_engine (provider-chain+rule_based fallback+SecretStr), data_collection (feed queue/backpressure+3 venue parsers+reconnect, manager caches, real_account ccxt-defensive, exchange_factory honest cancel_order=False), database (WAL sqlite), config accessors. Мёртвые producer-фиды вынесены в S342–S345.

- R143: `helm/` ЧИСТО кроме S310–S312: `fail`-гарды на обязательные values (wsExchange/wsSignals/grafana.adminPassword), SHM-sidecar `shareProcessNamespace`+emptyDir-Memory корректны, kill-switch на writable logs-volume при readOnlyRootFilesystem, EXCHANGE_WS_HOST/WS_URL/HFT_EXCHANGE_WS_URL ловят loopback-ловушки с честными комментариями, `/live`+`/ready` реально на :8080 (health_server:143-144), vendored `files/` (alerts/alertmanager/5 dashboards) побайтово синхронны monitoring/, network-policy default-deny + честный DNS/443 комментарий, hft-trade-bot.yaml — намеренный comment-stub, все probes на правильных портах/путях
- R142: `web-ui/src/test/` ЧИСТО (153 файла — 0 skips/todos/snapshots/trivial-asserts, 1,973 expects; vi.mock только на зависимости с верными shapes; NoDataFeed-disclosure тесты честные; живые Zustand/MockWebSocket тесты; 150/150 импортов резолвятся; vitest.config v8-thresholds + setup.js jest-dom/cleanup реальны)
- R141: `ci.yml` leaf-read — все джобы кроме S309-графа честны: matrix test-python/test-cpp (gcc-14/clang-17)/test-windows/test-e2e (`VITE_MOCK_MODE` реален), `test-count` per-language floors удовлетворимы (126 py / 12 doctest / ~12 ctest / ~150 js vs 20/10/6/30), security-codeql [python,javascript] без пересечения с codeql.yml (cpp-only), concurrency/read-only perms корректны. `run_backtest.py` argparse ↔ docs совпадают; все CHANGELOG «removed X»-клеймы верифицированы против дерева (файлы реально отсутствуют, helpers.py удалён целиком → claim не stale); `deploy/k8s/secrets.enc.yaml` корректно gitignored; stray untracked files = 0
- R140: grafana-dashboards ЧИСТО (0 находок): все 40 уникальных metric-name в 5 dashboard-JSON резолвятся в реальные эмиттеры — `ai_signal_bot_{circuit_breaker_state,circuit_breaker_trips_total,ws_clients_connected,errors_total,drawdown,win_rate,pnl_total,uptime_seconds,backtests_run_total,cpu_usage_percent,memory_usage_bytes,sharpe_ratio,signals_sent_total,signals_blocked_total}` все объявлены в MetricsExporter (metrics.py:180-228) с prometheus-client registry; exchange/hft серии полные; `trading_*` серия тоже эмитится; единственные dead-query панели — `exchange_orders_filled/rejected_total` вечный ноль = blast-radius открытого S281; datasource `Prometheus` совпадает по имени с datasources.yml, `isDefault:true`, uid'ы панелей уникальны, `-- Grafana --` builtin-панель легитимна.
- R139: dotfiles ЧИСТО (кроме S307/S308): `.gitignore` — все secrets-паттерны на месте (`.env*`, `*.pem/key/p12/pfx/crt`, `secrets/`, `api_keys/`, sops/age `*.enc.*`, `keys.txt`), `*.csv/parquet/png/svg/db/log` broad-игноры безопасны (ноль fixture-reads в тестах — всё tmp-scoped, единственный tracked-match `favicon.svg` корректно исключён через `!web-ui/public/**`), `.env.prod.example` не игнорится; `.gitattributes` — `* text=auto eol=lf` + bat/ps1/cmd→crlf корректно; `.editorconfig` — per-lang indent-таблица sane (Makefile→tab верно); `hft-trade-bot/.clang-format` — живой (все 30 C++ под ним); `ai-signal-bot/__init__.py`/`exchange_simulator/__init__.py` — честные маркеры; `LICENSE` — настоящий Apache-2.0; `index.html` — fonts/PWA-meta/`<div id=root>`+`main.jsx` всё живое; `.windsurf/`+`.cascade/` gitignore-entries консистентны с half-tracked моделью.
- R138: mechanical-sweeps ЧИСТО (0 находок): 0 реальных TODO/FIXME/XXX/NotImplementedError в ранее непокрытых деревьях (web-ui/scripts/monitoring/tests — хиты это `EventType.HACK` enum в sentiment-тестах и собственная TODO-метрика health-check.py); все 6 `console.*` за `IS_DEV`-гейтом в performanceMonitor; все suppression-комменты обоснованы (optional-import `type:ignore`, 2× `exhaustive-deps`, 6× `no-console` с documented reason); localStorage-ключи симметричны — WEBHOOK_KEY/SESSION_KEY/STORAGE_KEY имеют getItem+setItem пары (S277-остров уже покрыт); все 12 `JSON.parse` в prod-src внутри try/catch (corrupt localStorage не роняет mount); 0 bare `assert` в prod-python (run_under -O безопасен); `CustomIndicatorPlugin.new Function` — restricted-context formula-фича по дизайну, strict+try/catch+Array-валидация; `monitoring/prometheus.yml` — все 5 job'ов на реальные порты (sim:8775, ai:9090, hft:9091, am:9093, self:9090); `alertmanager.yml` — честный receiver-less template с инструкцией; `docker-compose.yml` dev — header-claims все верны (6 сервисов, 22 alert-правила точно, 5 dashboards), `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH` → существующий trading-overview.json, `./exchange_simulator/config.yaml` mount → `__main__.py:43` default-path, все depends_on service_healthy цепочки + wget/python healthchecks на правильных портах; README quick-start → broken paths это blast-radius S220/S303.
- R137: test-trees ЧИСТО (0 находок): `exchange_simulator/tests/` — 863 asserts/31 файл, все импорты резолвятся в живые модули (ArbitrageDetector/SimulatedExchange/MarketSimulator реальны), интеграционные тесты in-process и CI-runnable, chaos-subprocess'ы запускают `python -m exchange_simulator` с правильным cwd=repo-root (пакет резолвится — контраст S215/S303), `test_property_based` — hypothesis в requirements-dev + честный skipif (CI ставит dev-reqs → тесты бегут); `hft-trade-bot/tests/` — все 26 .cpp проводены в CMake-таргеты, integration-тесты — реальные in-proc roundtrip'ы (SHM producer→consumer, kill-switch файл-триггер, YAML config); `ai-signal-bot/tests/` — 2289 asserts/1427 функций, моки только на сокетах, prometheus/SHM скип-гарды зеркалят честные optional-dep гарды прода; `web-ui/e2e/` — mock-mode/smoke/trading spec'ы с 34 реальными asserts (aria-pressed toggle'ы, regex на тексте кнопок). Двойные механизмы skip'ов — все легитимные (live-server S285, absent-modules S286, POSIX-SHM, optional-deps).
- R136: residue-sweep ЧИСТО (кроме S306 + S227-уточнения): tracked-but-ignored — только 3 `.cascade/` ledger'а (намеренно); `docs/theory/` (20.7k строк) и `audit/` — gitignored+untracked, не repo-weight (S080-прецедент); `fpga_orderbook.vhd` — саморазоблачающий «ACADEMIC SKETCH — NOT A PRODUCTION PROTOTYPE», ссылается только на theory-доки, ни одна документация не заявляет его живым; `hft-trade-bot/scripts/{build,run}.py` — честные CMake-wrapper'ы с exit-пропагацией; `web-ui` mock-mode оба пути консистентны (`dev:mock` `--mode mock` → `.env.mock`, `build:mock` env-var напрямую, `IS_MOCK` читает оба); `e2e/dismiss-onboarding.js` — реальный helper импортируемый всеми 4 spec'ами; `.windsurf/workflows/` 7 файлов — инструкции без stale-claims (slop-fix/verify/audit-loop согласованы); `exchange_simulator/tests/requirements.txt` — минимальный честный pin; `ai-signal-bot/run_backtest.py` — живой standalone CLI (deprecation `run.py --backtest` честный); `ai-signal-bot/scripts/.gitkeep` — единственный gitkeep, делающий свою работу.
- R135: dockerfiles/compose-residue/docs-tail ЧИСТО (кроме S303–S305): `ai-signal-bot/Dockerfile{,.prod}` корректны (multi-stage, non-root, `--metrics` CMD — кроме S207 run_logger); `hft-trade-bot/Dockerfile{,.prod}` — осознанная bookworm-ABI пара, правильные binary-paths для своих layout'ов; `docker-compose.staging.yml` — порты/healthchecks/limits согласованы, `./build/hft_trade_bot` верен для dev-образа; `docker-compose.hub.yml` — depends_on service_healthy цепочки верны; `--export` флаги sim реальны (`__main__.py:208-210` + DataExporter); `SECURITY.md`/`PULL_REQUEST_TEMPLATE`/ISSUE_TEMPLATEs — честные шаблоны; `shared_config.yaml` по-прежнему честный reference (S136).
- R134: workflows + root/web-ui configs ЧИСТО (кроме S298–S302): `release.yml` — честный changelog-генератор→`action-gh-release`, корректный prev-tag через `HEAD^`; `codeql.yml` — осознанная cpp-only матрица (py/js покрывает ci.yml, задокументировано), ручной build с честным websocketpp-sed; `nightly-backtest.yml` — импорты/сигнатуры резолвятся (`strategies.py` ре-экспортирует обе стратегии, `Backtester.run(candles, strategy, symbol, warmup)` совпадает), реальные walk-forward окна по seeded-42 GBM + регрессионный гейт; `deploy.yml` — matrix build/push корректен (4 сервиса, semver-tags, gha-cache), build-args матчат Dockerfile ARGs, scp-покрытие всех prod-mounts (monitoring/, configs); `docker-compose.prod.yml` — все 5 health-endpoint'ов реально публикуются (8775/8080/9091/3000/3001); `Makefile.prod` — все 16 таргетов честные; `.env.prod.example` — все `:?required` vars покрыты + честные комменты; `Makefile` `logs` — все 4 файла реально пишутся (`_latest.log` symlinks, trades_latest.csv); `web-ui/Dockerfile{,.prod}` — все 4 `VITE_*` ARG объявлены+прокинуты в ENV; `nginx.conf` — реальный `/health`, честные security-header комменты, корректный SW-cache split; `e2e/screenshots.spec.js` — 6 реальных скриншот-тестов с visibility-assert'ами; `dependabot.yml` — 8 живых экосистем с реальными директориями.
- R133: scripts + helm + terraform ЧИСТО (кроме S294–S297): `docker-smoke-test.{sh,bat}` честные — реальные порты (8775/9090/9091/3000), errorlevel/exit-пропагация, compose `--metrics` делает `:9090/health` валидным; `commit-msg-hook.{sh,bat}` + `pre-commit-hook.*` корректно проксируют exit-коды; `health-check.py` — честный dashboard (всегда exit 0, не гейт); helm-templates — shareProcessNamespace для SHM-sidecar'а, реальные probes на правильных портах, vendored `files/alerts.yml`/`alertmanager.yml`/5 dashboards **byte-identical** monitoring/-оригиналам (нет дрейфа), grafana provisioning-пути корректны (datasources+dashboards provider), ingress WS-пути на правильные сервисы, network-policy sane; terraform — VPC textbook (public→IGW, private→NAT, 0.0.0.0/0 только в route-tables), EKS-открытость уже S204, S3 без новых дыр. `ci-equivalence`/`health-check`/`benchmark_suite`/`walk_forward_ci`/`test_config_consistency`/hook-orphans — покрыты S197/S214/S216/S226/S262.
- R132: run.py + config + communication ЧИСТО (кроме S290–S293): `shm_ring_buffer.py` — layout байт-в-байт совпадает с C++ `ShmRingBuffer` (192B header, head@64/tail@128, общий magic), capacity=power-of-2 enforced, header-поля валидируются при open; SPSC try_push/try_pop корректны, flush батчится по 64; `shm_market_data_writer` — настоящий seq-lock (odd=write-in-progress); все 70 `SignalBotConfig`-properties имеют живых потребителей (0 мёртвых); `SignalPublisher` — реальный auth-handshake (secrets.compare_digest) + per-client sliding-window rate-limit на 9 compute-endpoints + bounded signal-history + lock-гarded client-set; `backtest_requests` честный (synthetic-данные помечены `data_source`, client-candles валидированы, params clamped, GBM seeded=42); `portfolio_requests`/`analysis_requests` — bounded inputs, enum-валидация, тяжёлая математика в `asyncio.to_thread`; `implied_vol` units consistent (days→years внутри); `_execute_paper_order` — реальный risk-sizing (risk_amount/risk_per_unit + notional-cap); `_execute_live_order` — ленивый кэшированный adapter + client_order_id dedup; `_on_shm_fills` guarded persist с bounds-check symbol-id; `_snapshot_equity` — реальный Sharpe из equity-history; `CircuitBreaker` — корректный state-machine (CLOSED/OPEN/HALF_OPEN + probe-бюджет); `ws_client` — seq-gap→resync с cooldown, recv-watchdog, backoff+jitter
- R114: `data_collection` — `real_account.py` честный ccxt-wrapper (clientOrderId idempotency, retry-backoff, guarded imports); `exchange_factory.py` SimulatorAdapter — реальный WS-кэш + honest cancel (S102/S148 держатся); `llm_engine` — настоящие OpenAI/Anthropic/Ollama payload-формы + rule-based fallback с schema-clamp (никакого «AI-theatre»); `observability/tracing` — guarded OTel, NoopTracer честный; `health_checks` — wired в run.py, absent redis/timescaledb → HEALTHY «not configured» (не врёт); `signal_validation/validator` — реально в pipeline (run.py:498), все 5 проверок + asyncio-lock; `market_data_feed` — настоящие binance/okx/bybit стримы, backpressure drop-oldest, reconnect backoff, on_reconnect gap-fill
- R113: `hft/scripts/build.py` — честный CMake-wrapper (vcpkg+websocketpp автодетект, реальные targets, exit-codes); `hft Dockerfiles` — builder+runtime на одном bookworm (ABI-safe), pinned runtime libs, non-root user, real wget healthcheck, websocketpp C++20 sed-patch честно документирован; `.dockerignore`×5 — осмысленные; `web-ui/.env.example` — точен (VITE_WS_* build-time, VITE_SIGNAL_TOKEN→реально верифицируется signal_publisher:137-143, VITE_MOCK_MODE живой); auth-цепочка `EXCHANGE_TOKEN`→`_handle_auth`:503 + `SIGNAL_TOKEN`→publisher:226 end-to-end живая; `fpga_orderbook.vhd` — упомянут только в theory/skills, не притворяется живым компонентом; `__init__.py`/`tests/__init__.py` — честные маркеры
- R112: `options_simulator` — канонический Black-Scholes (price/delta/gamma/theta/vega/rho) + Newton-Raphson IV с vega-scaling и честным NaN на несходимости; `data_export` — реальные CSV/Parquet, честный pyarrow→CSV fallback; `config_validator` — все секции/диапазоны/cross-refs (symbols↔prices↔volatility); `ws_metrics` — LatencyHistogram валиден, все счётчики fed (record_message :broadcast68, errors_total :handler101-114, price_updates :broadcast224, 3 histograms observed); `ws_prometheus` — exposition format валиден, rusage-guard для Windows; `websocket_server` — run_logger/trade_csv_logger optional-imports guarded (контраст с S207), SHM seqlock корректен (odd=writing/even=committed), /health /live /ready /metrics реальны, metrics-port=ws+10; `monitor.py` — WS-feeд type=="signal" матчит `Signal.to_dict()` ключи 1:1, оба tail-файла = config defaults; `run_backtest.py` — настоящий walk-forward через optimizer:193 (train/test окна), все API-сигнатуры резолвятся; `visualizer_account`/`_charts` — EMA/RSI/ATR/MACD/BB формулы каноничны, рендер реальных данных
- R98: `exchange_simulator/conftest.py` + `ai-signal-bot/conftest.py` — легитимные sys.path-шимы; `ws_constants.py` — все флаги (`_HAS_SHM`/`_HAS_ORJSON`/`_HAS_MSGPACK`/`PROTOCOL_VERSION`/`_sanitize_log`) реально импортируются server/broadcast/handler
- R128: web-ui/src/test/ ЧИСТО (кроме S284-кластера): 0 `it.skip`/`.todo` во всём сьюте; 0 orphan-тестов — все 154 импорта резолвятся в существующие модули; мат-тесты честные — seeded mulberry32 PRNG + точные значения (`beta toBeCloseTo 2,5`, residuals <1e-8, ADF-vs-critical); `vi.mock` только у 23 файлов и там где надо (ws/apiClient); ~913 weak-asserts из 1973 expects — приемлемая доля для render-тестов; `performance.test.jsx`/`.ts` — разные модули, не дубли; 3 Zustand-store (useTradingStore/useUIStore/useToastStore) — честные: batch-setters из хуков, derived-data из App-memo, dual-signature addToast с auto-expire; `contexts/` не существует — всё через stores
- R127: exchange_simulator tail ЧИСТО: `models.py` — корректные to_dict-контракты (Order/Position/Account/ClosedTrade/Candle/OCO/Iceberg), честная equity-математика (balance + Σmargin+unrealized), trailing-stop ratchet, iceberg replenish; `__main__.py` — настоящий composition root (validate_or_exit → audit-конфиг до build_exchanges → env-override EXCHANGE_WS_HOST → signal-handlers); `config_validator` — настоящие range-checks + prices↔volatility cross-refs; `data_export` — реальный CSV/parquet с pyarrow-fallback; `test_security.py` — spec'd MagicMock'и + injection-кейсы; `test_property_based` — настоящий Hypothesis со skipif; `test_integration_dataflow` — реальные OHLC/symbol-assert'ы; всего 20 shallow-asserts на 6.6k строк тестов; 0 TODO/FIXME/NotImplementedError в пакете
- R126: exchange_simulator ws-слой — настоящий production-grade: `ws_message_handler` — auth-gate на `_CONTROL_TYPES` (compare_digest), rate-limit 1000/60s, order-dedup с идемпотентным resubmit (LRU 10k), `_sanitize_log` на всех user-controlled логах, per-message try; `ws_broadcast` — per-client subscription filtering, orderbook delta-computation, orjson/msgpack fallback'и, fills_batch для engine-филов; `websocket_server` — SHM publisher с seq-lock, health/live/ready endpoints, graceful shutdown; options_simulator — канонический Black-Scholes (d1/d2, Greeks, Newton-Raphson IV, put-call parity); arbitrage — реальный pair-scan + TTL + auto-exec с broadcast fills; liquidation — настоящие liq/partial/SL/TP trigger'ы с insurance-fund deficit; audit_logger — thread-safe deque + file + callbacks; `LatencyHistogram` — корректные cumulative buckets; data_export/config_validator/TabbedVisualizer — wired из __main__ (`--export`, `validate_or_exit`, viz-thread)
- R125: вся квант-математика в `web-ui/src/utils/` — НАСТОЯЩАЯ (не label-deep): hmmMath (scaled forward/backward + Viterbi + Baum-Welch EM), garchMath (log-returns + GARCH(1,1) variance-recursion + gradient-descent MLE), kalmanMath (1D + 2D position/velocity filters с настоящими predict/update), cointegrationMath (OLS/ADF-stat vs critical-values/half-life), indicators.js (579 строк канонических формул: EMA/RSI/MACD/Ichimoku/ADX/PSAR — 91 импортер), edmMath (mutual-info/FNN/delay-embedding/simplex/CCM), kmeansMath (k-means++ + Lloyd + silhouette + нормализация); `backtestEngine.js` — честный browser-side движок («no backend required») + consumer StrategyBacktest + тесты; все 21 хук имеют прод-консьюмеров (mockData→useExchangeData/App mock-mode, performanceMonitor→DashboardProfiler/PanelContainer, sessionRecorder→SessionReplay, savedBacktests→BacktestRunner, soundAlerts→useNotifications); `trading-sim-strategies` key-chain живой (StrategyBuilder пишет → StrategyBacktest читает); exchange-sim engine core — настоящий matching: margin-lock+release, OCO sibling-resolve, TIF/FOK depth-check через `_depth_covers`, partial-fill для больших ордеров, residual-position на перевороте, pending-ордера тикаются через `check_advanced_orders` (ws_broadcast:263 + __main__ loop), GTD-cancel-in-filled_orders безвреден (caller фильтрует status==FILLED); GTD/stop-limit/trailing/iceberg/pending-limit eval — все настоящие
- R124: audit-pipeline — полностью wired (audit_logger → `_audit_pending` → `_broadcast_audit_events` (ws_broadcast:235) → `audit_logs` → `setAuditLogs` — AuditLogViewer живой); `PositionsPanel`/`Object.values(acc.positions)` — shape-tolerant к list; `submitOrder` — настоящий `ui_`-cid + pending-ack map; `formatTime`/`AuditLogViewer` — корректный ×1000; `received_at` — честный client-stamp (ms) на fills; все setInterval/addEventListener имеют парные cleanup; `ExpectedValueCalculator`/`KellyCalculator`/`MonteCarlo`/`TimeOfDayPerformance`/`PnLAttributionChart`/`SessionStats` читают реальные ClosedTrade-поля (`closed_at`, `pnl`); `SessionExport` — реальный Blob-download; wire-модели verified: Order.to_dict (fills), ClosedTrade (trade_history), Position/Account
- R123: все 40 dashboard-метрик по имени существуют в emitters (ai_signal_bot_*/exchange_*/hft_*/trading_*); `helm/files/` — байт-в-байт копии monitoring/ (alerts, alertmanager, 5 dashboards) с честными sync-комментариями в шаблонах; helm templates честны — fail-fast на webUi.wsExchange/wsSignals/grafana.adminPassword, env-имена верные (WS_URL, HFT_EXCHANGE_WS_URL, EXCHANGE_CONTROL_TOKEN, EXCHANGE_WS_HOST), probes на реальных endpoints (/live /ready /health /-/healthy /-/ready /api/health), hft-sidecar + SHM emptyDir-Memory + kill-switch на writable-логе, vendored configs через .Files.Get/.Files.Glob; `MetricsCollector` — write-only fallback-sink (заменяется MetricsExporter при --metrics); terraform s3 — public-access-block+versioning+encryption настоящие; cpu/mem метрики — self-sample на scrape (HAS_RESOURCE guard)
- R122: все 12 npm-скриптов резолвятся (включая `test:ui` — `@vitest/ui` в lock транзитивно; `analyze` — vite-bundle-visualizer в devDeps; `dev:mock`/`build:mock` → `.env.mock`+`VITE_MOCK_MODE` live); `vite-plugin-pwa` реально wired (registerType/workbox/manifest; google-fonts runtimeCache ↔ fonts.googleapis в index.html:19); tailwind/postcss живые (`@tailwind` directives в index.css:1-3, tailwind-классы в компонентах); все 8 prod-deps + 22 dev-deps имеют consumers (happy-dom=env, esbuild=minifier, autoprefixer/postcss=postcss.config); оба pyproject — честные ruff+pytest-конфиги с документированными per-file-ignores; requirements.txt ↔ импорты (tabulate→tracker.py, matplotlib→plotter.py); CMake options реальны (PCH default-ON, allocator options с WARNING-fallback, vcpkg autodetect); `shared_config.yaml` читается test_config_consistency.py + pre-commit; `.clang-format`/`.editorconfig` есть; index.html script-src → main.jsx live
- R110: workflows deploy/nightly-backtest/release/codeql — реальные (backtest-импорты резолвятся, regression-гейт падает, health-check порты публикуются prod-compose); CMake — все 25 test-targets↔sources, 0 orphans; dependabot/pyproject/requirements — честные. (~~vite.config манифест корректен (278)~~ — опровергнуто S271: «278 panels» в манифесте и package.json description — протухший счётчик, реально 271)
- R111: exchange-engine re-check — liquidation (long/short формулы, full→partial precedence, insurance-fund deficit), margin lock/release + flip-residual, funding sign-convention, OCO sibling-cancel — все корректны; account-level leverage — единая согласованная модель (validator/hot-reload/margin/liq), `Position` её не дублирует — НЕ баг; `close_position` идёт через `force_close` — margin-check обход задуман; market-sim GBM+shared-factor correlations+wick/OHLC честны; `security-bandit`/`docker-smoke`/deploy-healthchecks — реальные endpoints; SECURITY.md честен (rate-limit `ws_message_handler:48` реален); `docker-smoke-test.sh` — правильные порты; REFACTORING_PLAN/PROJECT_AUDIT — HISTORICAL-дисклеймеры на месте; web-ui/public — только favicon (PWA/SW генерятся vite-plugin-pwa); `test-rust`/Cargo — фантомов нет в ci.yml jobs (призрак только в таблице ci-equivalence → S216)
- R108: env-файлы — `.env.prod`/`web-ui/.env` gitignored (secrets не в репо), `.env.mock` = один benign флаг; `websocketpp/`+`vcpkg/` — vendored gitignored deps с system/vcpkg CMake-fallback; `Makefile.prod`/`.bat`/`no-docker.sh` — реальные команды не сироты; `.pre-commit-config.yaml` → каноничный `pre-commit-hook-git.sh`; `nginx.conf` — честные security-headers + реальный /health + правильные SW-cache правила; prod-compose `VITE_WS_*` под `:?required`; `audit/`/`build/`/`logs/`/`deploy/`/`PROJECT_*.md` — untracked local residue (не находки)
- R107: helm scrape-топология — `ai-signal-bot:9091` для hft-job КОРРЕКТНО (hft — sidecar, Service публикует 9091 на под); vendored `helm/files/` (alerts/alertmanager/5 dashboards) бинарно идентичны `monitoring/`; probe-порты реальны (sim 8775 `/health`, ai-bot 8080 `/live`+`/ready`); web-ui template fail-fast на пустых `wsExchange/wsSignals`; grafana provisioning монтируется в `/etc/grafana/provisioning/` корректно; terraform S3-модуль полон (versioning/SSE/public-access-block/lifecycle); e2e wired в required CI-гейт (ci.yml:465+526)
- R106: web-ui test-leaf-sweep — все 154 vitest-файла: импорты резолвятся, 0 shadow-subjects (у каждого тестируемого модуля есть прод-импортёры), 0 файлов без `expect(`; `shared_config.yaml` timeframe (5m/300s) доходит до `MarketSimulator` через `__main__.py:69`; MONITORING_GUIDE — все 22 metric-name реально эмитятся; guides/docs не ссылаются на удалённые модули
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
- Rust `unwrap()`/`expect()`/`panic!`/`todo!`/`unimplemented!` в `hft-executor/src` — 0 (все 15 в `#[cfg(test)]`) — *исторически; крейт удалён, S058*
- Rust `unsafe` — только FFI boundary (CStr::from_ptr, Box::from_raw) — легитимно — *исторически; крейт удалён, S058*
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

**R115 (web-ui/src leaf-sweep — проверено, чисто):**
- 0 zero-import файлов в web-ui/src — все 289 components резолвятся через registry/App
- протоколы 1:1: все `sendSignalMessage` типы (11) имеют хэндлеры в signal_publisher; все `sendExchange` типы — в ws_message_handler; order submitter получает свой fill (`websocket.send` до excluded broadcast, ws_message_handler:271)
- 22 `NoDataFeed`-панели — честные disclosure'ы («feed is not produced by backend»), не фейки
- `utils/backtestEngine.js` — настоящий rule-engine (entry/exit rules, fees, slippage, equity curve, Sharpe/Sortino/Calmar/recovery), не театр; `performance.ts`/`performanceMonitor.js`/`performanceReport.js` — три разных домена (trade-metrics / Web Vitals+render / HTML-export), не дубли
- stores bounded: toasts maxlen 5, fills/signals 50, auditLogs 200, candles 500 — нет unbounded роста
- mock-инфраструктура честно гейтится (`VITE_MOCK_MODE`/`localStorage mock-mode` + видимый banner); `useDetachablePanels` popup-рендеринг через same-origin DOM — работает
- console.* только в TopErrorBoundary + useWebSocket parse-log — чисто
- **Коррекция ЧИСТО:** claim «`alert(` — только onAlert/removeAlert» устарел — `useDetachablePanels.js:41` содержит настоящий blocking `alert()` (учтено в S235)

**R116 (config/dependency sweep — проверено, чисто):**
- `ai-signal-bot/config/settings.yaml` — каждый ключ имеет accessor в `config/__init__.py` И прод-коллера (run.py/bot_helpers); все 6 strategy-флаги гейтят реальные классы (TrendFollowing/MeanReversion/FFTCycle/Sentiment/MarketMaking/MLEnsemble + StatArb); `alerting.py` — реальный dispatcher (Discord/Telegram/webhook senders, cooldowns, wired run.py:193/373 — S125-era смерть починена); `testnet` доезжает до ExchangeFactory (run.py:583); `paper_trading` — реальный гейт (run.py:515)
- `exchange_simulator/config.yaml` — все ключи consumed в `__main__.py` (market/account/visualizer/websocket/metrics/arbitrage/audit); оба pyproject ставят `asyncio_mode=auto` под async-тесты
- `hft-trade-bot/config/config.yaml` (dev) — все ключи имеют parser-строки; `Config::load` прогоняет dev+prod parsers на каждом файле — unified loader
- `monitoring/prometheus.yml` — 4 scrape-джобы, все DNS-имена резолвятся в compose service names; `alertmanager.yml` — честный empty-default receiver с инструкцией; `helm/files/{alerts,alertmanager}.yml` — байт-в-байт идентичны monitoring/ и потребляются через `.Files.Get`
- `web-ui`: `.env.mock` wired (`dev:mock` → `vite --mode mock`); `netlify.toml` живой (deploy.yml `nwtgck/actions-netlify`); `prop-types`/`web-vitals`/`lightweight-charts`/`zustand` — реальные импорты; devDeps postcss/tailwind/typescript — config-driven, реальны
- `dependabot.yml` — все 8 ecosystems целятся в существующие dirs (pip×2, npm, gha, docker×4); `.pre-commit-config.yaml` — честный wrapper на каноничный скрипт
- **Коррекция done-log:** S156-запись «one flag covers both binds» — протухла (metrics.host шортирует фолбэк — см. S239)

**R117 (hft-trade-bot/src leaf-sweep — проверено, чисто):**
- SHM-структуры `shm_protocol.h` — байт-в-байт с Python `struct.Struct` (SignalMsg 32B, FillMsg 28B, MarketSnapshotMsg 28B, KillSwitchMsg 16B); `shm_ring_buffer` — честный SPSC (R80) + `shm_market_data` — корректный seqlock (odd=writing/even=committed)
- `KillSwitch` — реальный механизм: file-trigger poll, SHM-нотификация Python, cancel_all/close_all callbacks wired в bot_setup:181-202, activate() зовётся из update_risk_state (daily-loss + max-drawdown)
- `signal_engine.h` V1 — настоящие EMA/RSI/ATR + Cooley-Tukey FFT; `signal_engine_v2` — честная композитная математика (6 субсигналов, weights, confidence→60+t*40); `signal_engine_v3` — настоящий online-HMM (forward-backward, Viterbi); `pressure_model` — реальные формулы (ноги мертвы по wiring — S247, но математика не фейк)
- `order_executor.h` — ручной JSON-билдер, auth-first, reconnect/backoff, arb-unwind — реальный код; `watchdog.h` — steady_clock корректен; `health_server.h` — настоящий raw-socket HTTP с bounded I/O (данные фасад — S246 — но сервер сам честный)

**R118 (docs-vs-reality sweep — проверено, чисто):**
- MONITORING_GUIDE — 5 dashboards и 22 alert-правила существуют и совпадают имя-в-имя; все env-имена ALERT_*/OTEL реальны; health-таблица портов корректна (8775/8080/9090/9091/3000)
- TRADING_STRATEGIES — все сверяемые параметры совпадают с кодом/yaml (ema 9/21, adx 25, sl/tp 2×/3× ATR, min_votes 2); ADVANCED_ORDER_TYPES — trailing/iceberg/OCO реально реализованы (exchange_advanced_orders.py); RISK_MANAGEMENT — 8 pre-trade чеков существуют в коде
- CONFIGURATION_GUIDE — все ~60 ключей имеют читателей (включая экзотику: gtd_seconds, toxic_size_threshold, decay_rate, fade_threshold, emergency_confidence, prediction_horizon, zscore_*, vwap_enabled)
- `audit/AUDIT_REPORT.md`, `docs/theory/*` (20.7k строк), `PROJECT_AUDIT.md`, `REFACTORING_PLAN_10DAYS.md` — все несут честные point-in-time/post-cleanup дисклеймеры; CHANGELOG актуален (по текущий раунд)
- DEPLOYMENT endpoints: все health/metrics URL валидны (8775 /health+/live+/ready+/metrics, 8080, 9090, 9091, 3000, 9099, 9093); `data/trading.db` реален (db.py:13); `ipc.*.capacity`/`market.order_book_depth`/`audit.*`/`latency_optimization.*` ключи парсятся; helm sidecar-архитектура (hft :9091 внутри ai-bot pod) легитимна
- QUICK_START: `python run.py` для ai-bot корректен; `.env.mock` путь работает; Makefile.prod `prod-up` существует; dev-compose публикует все заявленные порты
- `config.h`/`config_parser.h`/`config.cpp` — unified loader, каждый Config-член имеет parser-строку (кроме отмеченных в S240/S245); `logger.h` — реальные rotating sinks; `update_risk_state` — честный UTC-rollover + mark-to-market; `graceful_shutdown` — реальный teardown
- `signal_receiver.h` reconnect-механика — честная: cancelable sleeper, join-before-reassign, watchdog terminate→close→reconnect, exponential backoff 1s→30s

**R119 (repo-wide dead-code sweep — проверено, чисто):**
- Все 104 non-test py-модуля reachable: каждый имеет prod-импортёр (прямой или через package `__init__`); единственный orphan-модуль — `monitoring/ebpf_monitor.py` = уже S202
- web-ui file-level: все 295 `.jsx/.js/.ts` reachable — единственный «orphan» `main.jsx` грузится через `<script>` в index.html (entry-точка)
- Все 25 hft-тест-файлов имеют CMake-таргеты в `hft-trade-bot/CMakeLists.txt`; e2e-спеки wired через `playwright.config` testDir + shared `dismiss-onboarding.js`
- Root-утилиты легитимны: `error_monitor`/`price_monitor`/`trade_csv_logger`/`monitor`/`run_backtest`/`run_all_tests`/`build-all.bat` документированы (WEB_UI:493-496, README) или вызваны из Makefile/CI; оба `conftest.py` — настоящие pytest-корни
- Внутренние helpers живые: `kmeansPlusPlus`/`kmeansIterate`/`euclidean`/`sqDistance`/`normInv`/`tCDF`/`bivariateNormalCDF`/`baumWelchStep`/`generateAccounts`/`get_tracer`/`__main__`-функции — self-count ≥2, зовутся из своих же модулей
- `market_making`/`statistical_arbitrage` — wired через package-imports + `build_strategies`; factory-типы (`TickerData`/`ExchangeAdapter`/etc.) живут внутри `exchange_factory.py`

**R120 (monitoring/ + .github/ + web-ui/e2e/ — проверено, чисто):**
- `monitoring/alerts.yml` — все 22 правила ссылаются на реально эмитимые метрики (8 `ai_signal_bot_*` в metrics_server.py, 9 `exchange_*` в ws_prometheus.py); `monitoring/tests/test_alerts.py` валидирует структуру против реальных group-имён
- `alertmanager.yml` — честно документирует «default receiver ничего не шлёт»; inhibit-правило корректно; `prometheus.yml` targets = compose service-имена
- Grafana provisioning: `dashboards.yml` path `/etc/grafana/provisioning/dashboards` ↔ compose-монт :229; datasource `http://prometheus:9090` = service-name ✓
- `.github/workflows`: `codeql.yml` честно покрывает только cpp-лег (py/js — в ci.yml); `release.yml` changelog-генерация реальна; `nightly-backtest.yml` — настоящий walk-forward через `Backtester`+`TrendFollowingStrategy`/`MeanReversionStrategy` (не S214-театр); `dependabot.yml` — все 7 директорий существуют; ISSUE/PR templates без протухших ссылок
- `web-ui/e2e/` — 4 спека используют реальные селекторы/кейбиндинги (Shift+\\ ↔ App.jsx:245/382); `dev:mock` → `--mode mock` → `.env.mock` → `VITE_MOCK_MODE` — wiring end-to-end живой; `web-ui/.env` правильно gitignored (не committed)

**R121 (test-suite deep audit — проверено, чисто):**
- Все skip'ы честные: `test_monitoring_metrics` (34× prometheus_client dep-gate), `test_shm_ring_buffer` (14× /dev/shm env-gate), `test_integration` (5× live-sim env-gate) — все с reason'ами
- `try:` в тестах — только ImportError-gates (`_HAS_CVAR`/`test_load_10k`/`test_property_based`); 0 swallow-паттернов
- conftest'ы — реальные sys.path-шимы + настоящие candle-фикстуры (54 строки всего); ноль `status_code in (200,400,500)`-толерантности
- `vi.mock` — 23/153 файла, все boundary-моки (store/context/registry/data-source); `test_shm_*`/`test_signal_publisher`/`test_ws_client` — живой код с легитимной изоляцией (autospec на patch)
- `useMockData.test.jsx` — мокает data-source (правильная граница) и тестирует hook-логику; `PriceAlerts onAlert` — prop компонента, не performanceMonitor
- `test_signal_publisher.py` — настоящий live-execution тест `run_backtest_request` (equity-curve длина, структура results)

**R211 (exchange_simulator remainder — 3 находки):**
- **S347 (Medium)** — WS-layer Prometheus метрики полумёртвы: `broadcast_latency_p95_ms`/`delta_update_ratio`/`compression_ratio` — вечные нули (zero prod callers на `record_broadcast_latency`/`record_delta_update`/`compressed_size`); `messages_total`/`bytes_sent`/`clients_connected`/`message_size_*` считают только `_send_json`-трафик — горячий тик-цикл (`_broadcast_market_data`/`_broadcast_fills_batch`/`_broadcast_audit_events`) обходит `record_message`
- **S348 (Info)** — `asyncio.create_task(websocket.send(...))` ×4 без ссылки (ws_message_handler:400,408,410,589): GC-risk + потерянные исключения; `replay_state` при speed=0 — единственный sync-канал
- **S349 (Info)** — `close_reason` при batch-closes берёт `trade_history[-1]` для каждого ордера → мислейбл при >1 закрытии/тик, доходит до AlertWebhook-классификации и trade CSV
- Чисто: `ws_message_handler` (per-message try, rate-limit, auth-gate на control-types, idempotent dedup, NaN/TIF-валидация, compare_digest), `ws_broadcast` (per-encoding variants S212, per-client subs, seq, delta-compute, isolated tick), wire-schema ↔ useExchangeData consumer (все emit-типы покрыты), `websocket_server` (SHM seqlock, health/live/ready, graceful shutdown), `ws_metrics` (real cumulative-bucket histogram), `market_simulator` (GBM + correlated shocks + OU venue-deviation + funding/news/weekend), `options_simulator` (Black-Scholes + parity-check), `arbitrage` (net-spread after fees+slippage, dedup, TTL), `audit_logger` (rotating file sink, thread-safe), `config_validator` (cross-refs), `data_export`, `models`, `exchange`, `__main__` (env-overrides, signal handlers)

**R210 (web-ui/src full sweep — проверено, чисто):**
- Data-path end-to-end реален: `useWebSocket` (attempt-cap S231, backoff+countdown, ping/pong latency, auth-кадр до subscribe, outgoing-queue с dedup-совместимым cid) → `useExchangeData` (seq-gap resync, orderbook_deltas, ack-корреляция с честным 5s timeout + queued-semantics, authoritative `open_orders` replace, `fills_batch`, audit_logs) → `useSignalData` (S327 setter-map) → `useTradingStoreSync` → `usePanelContext` (memo-ctx) → registry `props(ctx)`-builders → панели
- Whole-store subscribes только в 3 центральных воронках (App/usePanelContext/useAppShortcuts) — панелей-штормов нет; все 271 registry-импорта резолвятся; 16 `props: () => ({})` — честные `NoDataFeed`-стабы (hyperopt/deploy/log-dashboard…) или self-contained tools (store/localStorage)
- `Math.random` в 20 компонентах — весь легитимный (Box-Muller, Xavier-init, MH accept/reject, Ogata-thinning Hawkes, bootstrap/permutation, id-gen для alerts/notifications) — не фабрикация «live»-данных (R52/R136-прецедент)
- Mock-path честный: `IS_MOCK` env-gated, parity-shape возвраты с комментариями, `MockModeBanner` disclosure, `dev:mock` → `.env.mock` wiring
- Жизненный цикл: все 13 setInterval-файлов имеют cleanup; 0 `useEffect(async`; единственный `fetch(` — AlertWebhook dispatcher (S232, fire-and-forget с .catch); весь `JSON.parse` под try/catch или `useLocalStorage`-guard
- `Object.*(acc.positions)` — всё `Object.values` по списку (корректно; S041-паттерн `Object.entries` отсутствует)
- PWA/workbox: только static-assets + google-fonts CacheFirst — live-данные не кешируются; CSP-заголовки на dev-сервере
- utils все живые: 3 perf-модуля с разными ролями (trading-math / render-monitor / PDF-export), `ui-helpers.js` = intentional TS-migration shim; indicators/backtestEngine — реальная математика, честно документирован «runs entirely in the browser»
- OrderForm (S236-статусы ack), Auth (S232 real probe-socket), AlertWebhook (S232 dispatcher с dedup + daily-summary), SessionRecorder (cumulative-trade-history fix), useDetachablePanels (popup DOM без injection), useNotifications (head-identity dedup против .slice-cap) — реальные реализации

---

## ПРИОРИТЕТЫ

1. ~~S337~~ ~~S329+S332~~ ~~S340~~ (R200) ~~S338/S339~~ (R201) ~~S330/S331~~ ~~S334/S335~~ (R202) ~~S322~~ ~~S328~~ (R203) ~~S323~~ ~~S324~~ ~~S325~~ ~~S326~~ ~~S327~~ (R204) ~~S333~~ ~~S336~~ (R205) — старая доска закрыта.
2. ~~R208 slop-fix~~ — все 5 находок R207 закрыты (S342 closed-trade ingestion, S343 strategy feeds, S345 lazy feed + aggTrade, S346 fit/OOS split, S344 CB metrics). ~~R209 slop-verify~~ — 8/8 verified. ~~R210 slop-audit web-ui/src~~ — ЧИСТО, 0 находок. R211 sim-remainder — **3 open**: S347 (dead WS-metrics) → S348 → S349. Следующий шаг по audit-loop: `slop-fix` на S347–S349.
3. Периодически — `/slop-verify`: QA-проверка записей done-log по файлам/строкам (last verified R209). Unverified: R199 dependabot, R202 C++ (S334/S335), R203 S322, R204 (S323–S327).
