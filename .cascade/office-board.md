# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → текущий раунд R70+. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (99 шт, R4–R60) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> История работ: `.cascade/progress.md`, баги: `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 1180 (ai-signal-bot 332, web-ui/src 460, hft-trade-bot 146, exchange_simulator 84) |
| Всего находок | ~190 (S001–S190) |
| Закрыто | 155 |
| Открыто | **14** — остаток: S150/S151/S152/S154/S160/S161/S162/S165/S168/S169/S177/S181/S182/S187 |

**Текущее состояние:** R92 fix-раунд закрыл **S189** (ci.yml `wget -qO-` стримил gpg-ключ в stdout — файл не создавался, clang-нога была мертва; теперь pipe в `gpg --dearmor`) + **S190** (codeql.yml — `|| true` убран из C++ build, python/js-ноги удалены — дублировали security-extended в ci.yml; остался только cpp) + **S184** (`window.__hawkesTimeout` → `useRef` — cross-instance race убран) + **S153** (alerting.py ClientSession получил `ClientTimeout(total=15, connect=5)` — висший webhook больше не стопорит алерты на 300s) + **S176** (мёртвые `auditExport.js`/`cn.js` + их тесты удалены — 0 импортеров). Ранее: R91 fix-раунд закрыл **S183** (UI order-lifecycle: `fill`-ack теперь трекает pending-ордера, `order_cancelled`/`orders_cancelled` убирают их; PendingOrders-панель + cancel-кнопки; OrderForm ждёт реальный ack через client_order_id — sim отдаёт `fill` с status, не `order`) + **S185** (mock-testing-mock: mock_objects.py + test_trading_flow.py удалены — 0 прод-импортов) + **S186** (mock_exchange.h мёртв; 2 сиротских doctest припаяны к CMake — cpp_optimizations 8/8 проходят, hft_config получил config.cpp+линки). Ранее: R90 fix-раунд закрыл **S163** (6 мёртвых latency-панелей Grafana — bare-name → `_bucket`+rate) + **S167** (shadow-math → extraction: 5 utils-модулей, тесты теперь гоняют продакшен; поймали реальный NaN-баг в zScore) + **S166** (exchange-ui theatre удалён вместе с S174; performance.test — реальный assert на manualChunks) + **S174** (мёртвая ExchangeContext/ExchangeSelector theme-система удалена). Verify R89: 9/9 чисто. Ранее: R88 fix-раунд закрыл **S170** (dead-code sweep: cross_exchange_arb/marketplace/helpers ~740 строк + тесты) + **S171** (unfeedable strategies-CircuitBreaker удалён; EnsembleVoter.analyze стал живым — adapter-обёртка убрана) + **S175** (DrawdownAnalysis in-place sort → копия). Ранее: R87 fix-раунд закрыл **S173** (live-path: cached adapter + clientOrderId + real cancel) + **S172** (backtest defaults выровнены к sim-модели 0.04%/2bps) + **S159** (~16 мёртвых конфиг-ключей заведены или удалены). Ранее: R86 fix-раунд закрыл **S164** (helm — High) + **S157**/**S158** (Medium, auth/health-server) — `f875192`-эпоха verify R85 чистая (11 claims, 0 reverts). Ранее:  R77 fix-раунд закрыл **4 High** (S148 kill-switch cancel, S149 client_order_id dedup, S155 sim control-plane auth, S156 container bind) — закоммичено `256b39a`. R78 audit: leaf-sweep `ai-signal-bot/src/` (84 файла) — **4 Medium**: S170 (три мёртвых модуля ~740 строк: cross_exchange_arb execution-движок, marketplace plugin-loader, utils/helpers), S171 (strategies-CircuitBreaker никогда не инстанцируется — EnsembleVoter создаётся без него; EnsembleVoter.analyze мёртв), S172 (два backtest-движка с fee-моделями 0.075%/2bps vs 0.04%/1bp — разные ответы по разным кнопкам), S173 (live-path: ExchangeFactory заново на каждый ордер — load_markets per signal; retry×3 без clientOrderId; SimulatorAdapter.cancel_order stale-заглушка False хотя протокол уже умеет). R79 audit: `web-ui/src/utils`+`contexts`+component-internals sweep — **4 находки**: S174 (мёртвая ExchangeContext theme-система: 0 mount'ов, 0 читателей CSS-переменных, themes без okx; её тестирует theatre-файл S166), S175 (DrawdownAnalysis сортит shared `fills` prop in-place — «Recent Fills» переворачивается для всего дашборда), S176 (auditExport+cn — tests-only утилиты), S177 (11 незащищённых JSON.parse(localStorage) — битый ключ убивает панель). R80 audit: `hft-trade-bot/src` internals (42 файла, ~8.3k строк) — **5 находок**: S178 (**High** — RiskManager V2 «production safety» весь tests-only: check_order с 8 проверками + on_fill/reduce_exposure/update_pnl_v2/reset_daily/blacklist — 0 прод-вызовов; 8 конфиг-ключей безопасности = theatre; kill-switch «auto-trigger from RiskManager» невозможен — activate() зовёт только file-trigger), S179 (оптимистичная книга: open_position на send-success, fills не реконсилируются — SL/TP может «закрыть» несуществующую позицию и создать реальную противоположную), S180 (balance хардкод 10000 — ни конфига, ни парсинга account-сообщений; sizing и drawdown считаются от выдуманного капитала), S181 (v3_enabled мёртв без v2_enabled — единственный loop гейтится на v2), S182 (open_position overwrite-ветка недостижима — а если бы дошла, теряла бы PnL). R81 audit: `web-ui/src/components/` per-file internals (296 файлов, 62.5k строк) — **2 находки**: S183 (UI дропает весь order-lifecycle: `order`-ack/`order_cancelled`/`orders_cancelled` → `default:`; «Order submitted» на send-success; ни одной pending-orders панели и cancel-UI нет — зеркало S179), S184 (`window.__hawkesTimeout` глобал в HawkesProcess — cross-instance race). R82 audit: тест-сьюты вне web-ui (ai-bot tests 37 + sim tests 36 + hft tests 28 + e2e 5) — **3 находки**: S185 (mock-testing-mock круг: mock_objects.py 185 строк имеет единственного потребителя test_trading_flow.py — «integration»-тесты с нулём прод-импортов, assert'ят хардкод моков), S186 (hft: mock_exchange.h 0 includers + 2 сиротских doctest-файла — тесты живого кода без CMake-таргета, регрессии low_latency/config проходят молча), S187 (screenshots.spec — 5 безassert'ных «тестов» в CI-gated e2e). R83 audit: CI/CD workflows + nginx + root-конфиги (5 workflow-файлов, 1241 строка) — **3 находки**: S188 (**High** — deploy.yml: docker-образ без VITE_*_TOKEN build-args → прод-UI auth_failed на ордерах; Netlify-джоба вообще без env → бандл на ws://localhost), S189 (wget -qO- в ci.yml ×2 стримит gpg-ключ в stdout, файл не создаётся → lint-cpp и clang-17 leg красные), S190 (codeql C++ build `|| true` → пустая БД при зелёном чеке + python/js скан дважды). R84 fix-раунд закрыл **4** (S188 deploy env, S178 risk-layer wiring, S179 fill-driven book, S180 account-balance feed) — см. done-log.

---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| **S150** | `config.prod.yaml` — продакшн-театр: ~35 мёртвых ключей | Parsed-but-never-read: `database.*` (7 ключей — dsn/pool_*/persist_*), `redis.*` (3), `exchange.fallback_to_simulator`, `metrics.enabled`, `metrics.host`, `signal_engine_v2.thresholds.min_composite`, `signal_engine_v2.periods.vwap_window`, `trading.paper_trading` — всё пишется в `Config`, читается только баннером (`bot_setup.cpp:37-39` печатает «DB: true \| Redis: true» при нуле DB-кода в src). `stop_loss_pct`/`take_profit_pct` — только валидируются (`config_validate.h:20-27`), в поведение не идут (V2 использует sl/tp_atr_mult). Никогда не парсятся: `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}` (kill-switch безусловен — `enabled:false` его не отключит), `adaptive_order_selector.{default_type,post_only_retries}`, `pressure_model.{obi_levels,microprice_enabled}` (microprice считается всегда, `pressure_model.h:102`), `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}` (id берётся из порядка в списке, не из поля). Плюс: прод-бинарь всё равно дозванивается только до `exchange.simulator_ws_url` — реальных exchange-адаптеров нет с S059. | Medium | [ ] Open |
| **S151** | `seq` в broadcast — write-only: заявленный gap-detection отсутствует | `ws_broadcast.py:421-422,472,510` инкрементит и шлёт `seq` в каждом `candles`-сообщении; `WEBSOCKET_PROTOCOL.md:269` обещает клиентам «detect missed messages and request sync_state on gaps». Читателей ноль: `useExchangeData.js` — 0 обращений к `data.seq`, `ws_client.py` (ai-bot) тоже игнорит. Reconnect лечит книги через полный `sync_state`-снапшот (orderbooks включены, `ws_broadcast.py:114-123`) — но per-tick детекта дыр нет: потерянное сообщение (напр. merge-логика `flushBatch` в useWebSocket, сейчас выключена для exchange-сокета) → `orderbook_deltas` молча лягут на протухший стакан. Мёртвое поле + ложный doc-claim. | Medium | [ ] Open |
| **S152** | `network/ws_client.h` — мёртвый toolkit; живые коннекты без watchdog | 255 строк (`Watchdog`/`MessageQueue`/`ReconnectionManager`/`SubscriptionManager`/`ReconnectPolicy`) инклудятся только тестами (`test_network.cpp`, `test_signal_flow.cpp`) — 0 include в src (ЧИСТО-claim R51 «ws_client.h широко инклудятся» неверен — инклудят только тесты). `SignalReceiver`/`OrderExecutor` руками крутят websocketpp-reconnect; ни ping/pong-handler'а, ни stale-detection — полуоткрытый TCP (peer умер без FIN/RST) никогда не вызовет `close_handler` → ресивер молча перестаёт получать данные при `connected_=true`; `prices_cache` протухает → SL/TP/PnL считаются по мёртвым ценам вечно. Watchdog, который это ловит, лежит в том же репо неподключённым. | Medium | [ ] Open |
| **S154** | Адаптивные типы ордеров умирают до провода | `AdaptiveOrderSelectorV2::select` выбирает IOC/FOK/GTD/POST_ONLY (`bot_loop.cpp:179-198` логирует «kind=GTD» и т.п.), но `execute_v2_order` использует из селекции только `limit_price`, а `submit_order` заново деривирует MARKET/LIMIT через второй селектор (`OrderTypeSelector`, `order_executor.h:109`) — kind/TIF/expiry теряются; `gtd_seconds` кормит `expire_ns`, никуда не уходящий. `to_{binance,okx,bybit}_{type,tif}` + `to_exchange_*` — 7 функций ~100 строк, вызываются только тестами (`test_doctest_adaptive_order_selector.cpp`, `test_v2_pressure_adaptive.cpp`). Лог говорит GTD — на проводе LIMIT. | Low | [ ] Open |
| **S160** | PWA manifest: счётчики протухли на ~74 панели | `vite.config.js:15` — description «204 panels and 44+ math models»; факт: 278 `{ id:` записей в `panels/registry.js`. Манифест (install-prompt/description в OS) врёт о размере дашборда; «44+ math models» верифицировать нельзя — реестра моделей нет — но panel-count доказуемо stale. | Info | [ ] Open |
| **S161** | CONFIGURATION_GUIDE §2 — фантомный конфиг сима: неверный путь + 9 несуществующих ключей | `CONFIGURATION_GUIDE.md:130` указывает `exchange_simulator/config/settings.yaml` — реальный файл `config.yaml`. Таблица :134-139 документирует топ-левел `host`/`port` (реальные — под `websocket:`), `compression: deflate` (нет ключа — хардкод `websocket_server.py:184`), `max_symbols: 50` (нет ключа; SHM-слоты — env `SHM_MARKET_MAX_SYMBOLS` :107, символы — из `initial_prices`), `tick_interval_ms: 1000` (нет ключа — литерал `_tick_interval = 1.0` :74), `encoding: json|msgpack` (нет ключа — `_client_encodings` per-client :82). Fees-блок :143-157 описывает `maker_fee_bps`/`taker_fee_bps` — реальная схема одиночный `fee_pct` + `slippage_bps`, maker/taker-сплита нет. Оператор по этому гайду редактирует ключи, которых нет — молча ничего не меняется. | Low | [ ] Open |
| **S162** | WEBSOCKET_PROTOCOL.md §8765 — 8 классов подтверждённых расхождений с диспетчером | Документ — интеграционный контракт, и он врёт: (1) `config_update` — реальный ключ диспетчера `update_config` (`ws_message_handler.py:163`), плюс схема другая: doc шлёт `{"config":{fees:{maker,taker}}}`, код читает плоский `updates` `{fees:{ex:fee_pct},volatility,slippage,leverage}` (:400-424) — клиент по доке получает unknown-type error; (2) `position` broadcast — **ноль эмиттеров**, позиции едут только внутри `account` в snapshot/candles (models.py:430); (3) `speed_change` broadcast — **ноль эмиттеров**, реальный `speed_set` уходит только запросившему (:331), остальные клиенты о смене скорости не узнают; (4) `config_updated` — doc обещает broadcast с `config`+`timestamp`, код шлёт sender-only ack с ключом `updates` (:424) — тот же класс лжи; (5) `fills_batch.fills` — реальный ключ `orders` (`ws_broadcast.py:296-298`) — клиент по доке читает `data.fills` → undefined → теряет все batched-филлы; (6) `welcome.server_name` — реальный ключ `server` (:72), и welcome шлётся на коннект, не «в ответ на subscribe»; (7) `error.code` — ни один error-эмиттер не несёт `code`; (8) недокументировано: команды `start_trading`/`stop_trading` (kill-команды из S155!) и 5 полей candles-пейлоада (`funding_rates`, `candles_to_funding`, `news_event`, `weekend_mode`, `trading_active` — `ws_broadcast.py:478-481`). Клиент, пишущийся по доке, ломается минимум в 4 местах. Doc поправлен. | Medium | [ ] Open |
| **S165** | Мелкий infra-residue: terraform `vpc_id` + Makefile .PHONY | `terraform/modules/eks/main.tf:15` декларирует `variable "vpc_id"`, оба environment'а передают `module.vpc.vpc_id` (dev/prod main.tf:39) — но внутри модуля `var.vpc_id` ни разу не используется (0 refs) — мёртвый input интерфейса. `Makefile` — 5 хвостовых таргетов (`ci-test`, `ci-quick`, `benchmark`, `walk-forward`, `docker-hub`) не в `.PHONY` (:1) — файл с таким именем молча выключит таргет. | Info | [ ] Open |
| **S168** | ARCHITECTURE.md: stale test-count «99 unit» vs фактические 157 | `ARCHITECTURE.md:422` — «103 test files: 99 unit + 4 e2e» — таблица застряла до добавления ~58 тест-файлов; фактически `web-ui/src/test/` = 157 vitest-файлов + 4 e2e-спеки. README:121 «157 test files (Vitest)» и :195 «162 test files» — честны (157+4 spec+helper). | Info | [ ] Open |
| **S169** | Мёртвые хуки + 471 строка тестов для мёртвого кода | `hooks/useInterval.js` (15 строк) + `hooks/useInterval.ts` (36 строк, задокументирован) — duplicate-пара, 0 импортеров в проде; тест `useInterval.test.jsx` (182 строки) импортирует `'../hooks/useInterval'` extensionless → Vite резолвит `.js` первым → тест гоняет короткую нетипизированную копию, а «правильный» `.ts` — чистая тень; любой будущий импортер молча получит `.js`. `hooks/usePerformance.js` (152 строки, 5 экспортов: `useDebouncedValue` — дубль живого `useDebounce.ts`, `useThrottledCallback`, `useBatchedUpdates`, `useWorker`, `useIntersectionObserver`) — 0 прод-импортеров, живёт только в `usePerformance.test.jsx` (289 строк). Итого ~203 строки мёртвых хуков + 471 строка тестов, надувающих зелёный счёт сьюта — та же test-to-nowhere болезнь, что S167. | Low | [ ] Open |

| **S177** | 11 сайтов `JSON.parse(localStorage…)` без try — битый ключ убивает панель | `AlertWebhook.jsx:27`, `BacktestComparison.jsx:139,188`, `StrategyBacktest.jsx:43`, `StrategyBuilder.jsx:36`, `hooks/useSavedBacktests.js:23`, `useSessionRecorder.ts:47,171`, `useStrategyMarketplace.ts:120,144` (+1) — все парсят localStorage без try/catch. Shared-хук `useLocalStorage.ts:14-20` guarded (try→initialValue) — эти 11 сайтов его обходят. Урезанный/отредактированный ключ → SyntaxError в render/hook-init → PanelErrorBoundary показывает dead-panel до ручной очистки storage. Blast radius сдержан boundary, но панель мертва навсегда для юзера, не знающего про DevTools. | Low | [ ] Open |
| **S181** | `signal_engine_v3_enabled` мёртв без `v2_enabled` | `bot_loop.cpp:223` — единственный потребитель `engine_v3` (`generate_signal:143`) сидит внутри `run_v2_signal_loop`, который отсекается `!signal_engine_v2_enabled`. Конфиг `v3.enabled=true, v2.enabled=false` → движок конструируется и `prepopulate`'н (`bot_setup.cpp:145-147`), но `analyze_incremental` не вызывается никогда. Флаг «opt-in» v3 на деле означает «работает только поверх включённого v2». | Low | [ ] Open |
| **S182** | `PositionManager::open_position` — недостижимая ветка перезаписи теряет PnL | `position_manager.h:21-30` — при совпадении symbol перезаписывает позицию **без** реализации её unrealized_pnl (и не трогает `realized_pnl_total_`) + ключ только по symbol (exchange хранится, но не участвует в match). R84: прод больше не зовёт `open_position` вовсе (позиции книгуются через `apply_fill` с корректным weighted-merge) — метод остался только для doctest-сьюта. Ветка перезаписи мертва полностью; если её реанимируют — теряет PnL и молча флипает LONG→SHORT без close-ордера. | Low | [ ] Open |
| **S187** | `screenshots.spec.js` — 5 тестов без единого assert'а в CI-gated e2e | `web-ui/e2e/screenshots.spec.js` — «Screenshot capture for README»: 5 тестов делают `page.screenshot()` без expect'ов (кроме неявных page-load ошибок). Входит в `test-e2e` CI-джобу, обязательную в gate (ci.yml:502,528) — зелёные скриншот-раны считаются e2e-покрытием. Честное назначение — генерация README-скриншотов, но оформлено как тест-сьют. | Info | [ ] Open |
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
