# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → раунды до R31. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (66 шт, R4–R31) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> История работ: `.cascade/progress.md`, `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 1180 (ai-signal-bot 332, web-ui/src 460, hft-trade-bot 146, exchange_simulator 84) |
| Всего находок | ~127 (S001–S126 + переименованные) |
| Закрыто | 91 (+S125, +S126) |
| Открыто | 0 — беклог пуст |

**Главный вывод:** R40 закрыл последние находки (S116 auth e2e, S117 portfolio WS API — обе wire). R41 — slop-verify 7 claims, все VERIFIED. R42 — аудит infra/CI/monitoring: CI↔compose↔prometheus↔alerts полностью согласованы; найдены S122/S123 → закрыты в R43 (smoke-test починен, codemods удалены). Беклог снова пуст.

R45 — аудит workflows/configs/scripts-ci: всё чисто кроме `monitoring/tests/` (S124 — 23 теста на удалённые модули, CI не запускает). R46: закрыт (metrics-тесты удалены, alerts-тест repointed). Беклог пуст.
---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| **S014** | God-файлы Python (верхушка) | R31: `strategies.py` 515→4 модуля + shim (96 тестов green); `real_market_data.py` 551→3 модуля + shim (1381 green); `backtester.py` 23KB→14.8KB (results/metrics/report вынесены); rl_trader/fix_client удалены. Финал R32: `signal_publisher.py` 496→307 — backtest-запросы (~220 строк: parse/clamp, client-candles, synthetic GBM gen, risk-config, strategy build, run/compare — все self-free) → `communication/backtest_requests.py`; паблишер = только WS-lifecycle/auth/broadcast. `engine.py` 440→266 — `SecretStr`+3 датакласса → `llm_types.py`, `_parse_response`+3 rule-based фолбэка → `rule_based.py`. 24+18 новых контракт-тестов green. | Low | [x] Done |
| **S015** | God-компоненты web-ui | R31: `PerformanceDashboard.jsx` 522→166 (performanceReport.js + PerfAreaChart.jsx + ExchangeBreakdown/StreakPanel/RiskMetricsPanel — exSortMode-стейт уехал внутрь секции); `BacktestRunner.jsx` 785→519 (backtest/ подкомпоненты + useSavedBacktests/useBacktestChart); `App.jsx` →394 (4 хука). Финал R32: `CopulaModel.jsx` 498→311 — копула-математика (15 ф-ций) → `utils/copulaMath.js`; `EmpiricalDynamicModeling.jsx` 455→265 — EDM-математика → `utils/edmMath.js`. 27 контракт-тестов на math-либы — всплыл баг S105. | Low | [x] Done |
| **S107** | Метрики ai-signal-bot писались в пустоту + мёртвый exporter | `signal_publisher` кормил `MetricsCollector`, но `MetricsServer` (единственный вызывающий `.render()`) нигде не стартовал в prod — счётчики умирали в памяти. Параллельно `MetricsExporter` (prometheus_client, :9090 — порт helm) стартовал в run.py, но из ~15 alert-методов был подключён только `record_ws_reconnect`: `signals_sent_total`/`signals_blocked_total`/`circuit_breaker_state`/`ws_clients_connected` вечно нули — Prometheus/Grafana видел замершего бота при живых сигналах. Два стека с идентичными именами серий. R33 fix: `record_backtest` добавлен в exporter; `start_server` → `bool`; run.py подменяет `signal_publisher.metrics` на exporter когда сервер реально поднялся. 80 тестов green. | **High** | [x] Done |
| **S108** | Dev-скрипты падают на cp1251 | `scripts/ci-equivalence.py` и `scripts/health-check.py` падают с `UnicodeEncodeError` на Windows-консоли без `PYTHONIOENCODING=utf-8` — box-drawing/emoji в `print()` (✅❌─═). R33 fix: `sys.stdout.reconfigure(utf-8, errors=replace)` в main() обоих; `health-check` теперь отрабатывает (score 52/100). | Low | [x] Done |
| **S111** | CompetitionFramework — фейковый турнир | "Run Tournament" роллил кубики: `elo: 1000+rand(-100,100)`, `sharpe: rand(-0.5,2.5)` по 6 стратегиям, 4 из которых не существуют на бэкенде; результаты сохранялись в localStorage как настоящие. R35 fix: переписан на реальный `run_backtest` WS API — per-strategy запросы с `candles_data` (реальные свечи до 1000), корреляция ответов по echo `strategy`, ELO поверх реальных Sharpe, `data_source` disclosure, таймаут 60с, NoDataFeed когда signal-канал down. +4 контракт-теста. | **High** | [x] Done ✅vR41 |
| **S112** | AuditLogViewer навечно пустой | `registry.js` передавал `auditLogs: []` константой при живом `AuditLogger` с `register_callback` — ни один prod-код не регистрировал callback, по WS аудит не шёл. R35 fix end-to-end: `start()` регистрирует `_on_audit_event` после успешного bind → bounded deque(maxlen=500) → `_broadcast_audit_events` в тике broadcast-loop шлёт `{type:'audit_logs',logs:[to_dict]}` → `useExchangeData` кейс (bounded 200) → store → ctx → панель. Callback unregister в finally при shutdown. +8 бэкенд-тестов, +5 фронт-тестов. | **High** | [x] Done ✅vR41 |
| **S113** | WS-сервер симулятора не стартовал вообще | `await self._shutdown_event` (2 сайта: start():~191, _run_metrics_server:~237) — `asyncio.Event` не awaitable → TypeError сразу после bind порта. Заменил рабочий `await asyncio.Future()` в f807082 "Reliability Plan" — crash-on-startup, ни один тест не вызывал `start()`. R35 fix: `.wait()` + регистрация audit-callback после bind + metrics_task внутрь `async with` (иначе сирота при serve-фейле) + unregister в finally + идемпотентный `register_callback`. Регрессионный тест `test_start_registers_and_shutdown_unregisters` воспроизводит крах. | **Critical** | [x] Done ✅vR41 |
| **S114** | `audit:` секция config.yaml мёртвая | 5 ключей (`enabled/max_memory_entries/log_file_path/enable_file_logging/enable_callbacks`) никто не читал — `get_audit_logger()` хардкодил дефолты. R35 fix: `AuditLogger(enabled=)` + `__main__.main()` зовёт `set_audit_logger(AuditLogger(**cfg))` до `build_exchanges` (биржи биндятся к singleton в `__init__`). `enabled:false` → `log()` no-op, проверено. | Medium | [x] Done |
| **S115** | WS-протокол: fills_batch + error молча дропались | `useExchangeData` `default: break` съедал `fills_batch` (движковые филлы — SL/TP, ликвидации, арб-исполнения из `ws_broadcast`) и `error` (5+ rejection-сайтов) — юзерские филлы приходили, движковые пропадали, отказы невидимы. R35b fix (parallel): `fills_batch` → prepend в `fills` (fill-toasts теперь для движковых тоже); `error` → `lastError` → store → `useNotifications` toast. +3 контракт-теста. | **High** | [x] Done |
| **S121** | ARCHITECTURE.md описывал систему больше реальной | «Живой» арх-документ содержал выдуманную поверхность: таблица V2 Subsystems — 6 фантомных подсистем с нулём файлов (MomentumBreakout/MarketMaking/StatArb/SmartOrderRouterV2/PreTradeRisk/PortfolioRisk), 12 фантомных хедеров в инвентаре (`order_manager.h`, `latency_tracker.h`, весь `src/market_data/`, `*_v2.h` стратегии), фантомный SHM-сегмент `/hft_heartbeat`, «27 doctest файлов» (реально 13). Симулятор: «multi-API real-time price feeds», «Heston/Merton/Markov microstructure», «latency simulation», «spoofing/queue/adverse selection», «spread analytics» — всё фикция (движок = seeded GBM, книга = exp-decay + rng). Бот: `strategies.py`/`fft_strategy.py`/`order_book_replay.py`/`fix_client.py`/`health_check.py:9092`. Web-ui: `.js` ссылки на `.ts`-файлы. Всё исправлено на реальный инвентарь (R39b). Попутно удалён `MetricsServer` — рабочий HTTP /metrics сервер без единого вызова `start()` (реальный стек = MetricsExporter из S107; `MetricsCollector` оставлен как fallback-синк). | Medium | [x] Done |
| **S116** | WS auth handshake недостижим с обеих сторон | `SignalPublisher._auth_token` всегда "" (run.py не передавал, settings.yaml не имел ключа, UI не слал auth); `HealthServer.auth_token` Bearer-middleware тем же классом. R40 wire e2e: `api.auth_token` + `AI_BOT_AUTH_TOKEN` env → `config.api_auth_token` → `SignalPublisher(auth_token=)` + `HealthServer(auth_token=)`; UI `VITE_SIGNAL_TOKEN` → `useWebSocket` шлёт `{type:"auth"}` первым фреймом до subscribe, `authState` pending/ok/failed в `useSignalData`; health `/live`+`/ready` exempt от Bearer — kubelet-пробы не сломаны. Попутно: `register_check("liveness"/"readiness")` регистрировал имена, которые `_check_all` никогда не дёргал — переведено на `check_component_health` под реальные имена (exchange/database/shm). +8 backend-тестов, +1 vitest. | Low | [x] Done |
| **S117** | `portfolio/` (4 модуля) + `pricing/volatility_surface.py` мёртвы | 0 prod-импортеров, только собственные тесты; PortfolioOptLab честно дисклеймил отсутствие фида. R40 wire через WS API: `communication/portfolio_requests.py` — `optimize_portfolio` (max_sharpe/min_variance/risk_parity/black_litterman по клиентским candles_data; RC% для RP, views для BL, current_weights+portfolio_value → rebalance-orders) + `vol_surface` (SVI/SABR-калибровка по points[{strike,maturity_days,iv}]). UI: PortfolioOptLab переписан под реальный запрос (method picker, asset select, rebalance из живых позиций, weights/метрики/RC/orders); VolSurface — секция IV Smile Fit поверх `options_chain` (disclosed flat-σ). +21 backend-тест, +6 vitest. | Medium | [x] Done |
| **S122** | `docker-smoke-test.{sh,bat}` — мёртвый И стейл | 0 refs: ci.yml имеет свой inline docker-smoke с ПРАВИЛЬНЫМИ портами (8775/9090/9091/3000 — совпадает с compose healthchecks), а скрипт curl-ит `http://localhost:8765/health` + `:8766/health` — чистые WS-порты, HTTP /health там нет (health живёт на port+10=8775 и :9090). На здоровом стеке всегда "failed health check" → отправляет дебажить не то. `.bat`-твин те же порты. R43 fix: порты приведены к CI/compose (8775/9090), web-ui → /health, summary печатает ws:// URL. | Medium | [x] Done |
| **S123** | Одноразовые codemod-скрипты забыты | `scripts/fix_eslint_unused.py` + `scripts/fix_fstring_logs.py` — одноразовые миграции из S101 (eslint codemod 257 сайтов), единственные "refs" — упоминания в AUDIT_FINDINGS. Отработали и остались лежать. Тот же класс что S104 dead-хуки. R43: удалены. | Low | [x] Done |
| **S124** | `monitoring/tests/` — 23 теста на удалённый код | Все фейлят на импорте/фикстурах: `test_metrics.py` грузит `ai-signal-bot/metrics.py` + `exchange_simulator/metrics.py` через spec_from_file — оба файла удалены (S016 commit 024ce07 «file existed only for its own test», e983fdf), классы `ExchangeSimulatorMetrics`/`AISignalBotMetrics` нигде не существуют (реальный стек = `src/monitoring/metrics.py:MetricsExporter` + `ws_prometheus.py`, свои тесты в ai-signal-bot/tests). `test_alerts.py` читает `monitoring/alerts/alerts.yml` — директория пустая, реальный файл `monitoring/alerts.yml` имеет другие group-имена (ai-signal-bot/exchange-simulator/... vs ожидаемые latency_alerts/trading_alerts). CI их не запускает — мёртвый suite, только repo-wide pytest его видит. R46 fix: `test_metrics.py` + `conftest.py` (prometheus-fixture служила только им) удалены; `test_alerts.py` repointed на `monitoring/alerts.yml` с реальными group-именами — 10 тестов green. | Medium | [x] Done |
| **S125** | ai-bot dead-module cluster — ~1900 строк test-only | Zero-importer sweep: shm_* остров (4 файла — SHM-канал hft↔bot, run.py не инстанцировал), alerting.py, risk/{cvar,position_sizing,stress_test} (только __init__-реэкспорт), funding_arb_detector, hawkes_{funcs,model}. R50 **wired all**: `analysis_requests.py` — 5 WS endpoints (cvar_analysis/stress_test/position_size/hawkes_fit/funding_arb_scan) через signal_publisher; SHM-канал за `shm.enabled` в run.py (signals→ring, market→slots, fills→db+csv); AlertSystem за `alerting.enabled` (4 ops-правила, env-каналы); ws_client хранит funding_rates (sync_state). UI: HawkesProcess/ConditionalValueAtRisk/PositionSizeOptimizer/FundingRateHistory/RiskDashboard получили backend-кнопки через sendSignalMessage. Баг: push_signal_dict секунды→ns. +30 backend-тестов, suite 1519 green. | **High** | [x] Done |
| **S126** | web-ui dead residue — ~6 файлов + тесты | Zero-importer sweep web-ui/src: ExchangeSelector.jsx (не в registry), useInterval.{js,ts} оба твина, usePerformance.js, auditExport.js, cn.js — test-only. R50 решение: **keep** — utility-library intent, закрыто без изменений. | Medium | [x] Done |
| **S120** | Мёртвые config-ключи в settings.yaml | 9 ключей без читателей. Удалены: `trading.timeframe` (сим шлёт свечи сам), `risk.stop_loss_pct`/`take_profit_pct` (SL/TP ATR-стратегические, sizing от `signal.stop_loss`), `indicators.macd_*` (сам `macd()` нигде не вызывается — валидатор даже проверял `macd_fast < macd_slow` на мёртвых ключах). Заведены: `rsi_period`→MeanReversion (параметр был, не передавался), `atr_period`→FFTCycle+MeanReversion (hardcode `atr(candles,14)`), `rsi/adx_period`→LLM-контекст. Параллельно user завёл `network.*` timeouts→ExchangeClient/Factory/RealAccount, `metrics.*`→MetricsExporter, `strategies.*` тюнабли→Config-даклассы — тот же класс находки, в одном коммите `40fb2be`. | Medium | [x] Done ✅vR41 |
| **S119** | Обе options-панели crash-on-render + битая математика | `OptionsPricing.jsx`+`OptionsStrategies.jsx` — полностью мёртвые панели (ловил только PanelErrorBoundary). 4 бага: `Math.erf` не существует в JS → TypeError при первом рендере (оба файла) → fix на shared `erf` из copulaMath; `Math.pi` (undefined, надо `Math.PI`) → pdf=NaN → gamma/vega/theta=NaN при живых delta/price; TDZ `const callPrice = callPrice(K)` → ReferenceError в straddle (дефолт!) и strangle; iron condor: знак премии инвертирован (long−short → «Max Profit» отрицательный) + break-evens на long-страйках 90/110 вместо short 95/105. Плюс convention drift: theta per-year у панели vs per-day у OptionsSimulator/OptionsChain — приведено к per-day + лейбл. R38 fix всё; +8 контракт-тестов на BS-значения. | **High** | [x] Done ✅vR41 |

---

## ЧИСТО (проверено индивидуально, 0 совпадений)

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
- Rust `unwrap` — `unwrap_or_default`/`unwrap_or` + тесты, легитимно
- Rust `unsafe` — FFI boundary, необходимо
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
- README числа точные: 278 panels (registry), 289 components, 116 vitest файлов
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

---

## ПРИОРИТЕТЫ

1. ~~S001/S003~~ — обе Critical закрыты R34: 0 MOCK_* в компонентах, все панели либо ctx-wired либо disclosed. Беклог пуст.
3. ~~S014/S015 — god-файлы: все 12 разобраны (R31–R32).~~ Закрыто.
5. Периодически — `/slop-verify`: QA-проверка записей done-log по файлам/строкам.
