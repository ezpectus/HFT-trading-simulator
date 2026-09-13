# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → текущий раунд R70+. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (99 шт, R4–R60) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> История работ: `.cascade/progress.md`, баги: `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 1180 (ai-signal-bot 332, web-ui/src 460, hft-trade-bot 146, exchange_simulator 84) |
| Всего находок | ~177 (S001–S177) |
| Закрыто | 151 |
| Открыто | **26** — 5 из R71 + 2 из R72 + 3 из R73 + 2 из R74 + 2 из R75 + 3 из R76 + 1 из R77 + 4 из R78 + 4 из R79 |

**Текущее состояние:** R77 fix-раунд закрыл **4 High** (S148 kill-switch cancel, S149 client_order_id dedup, S155 sim control-plane auth, S156 container bind) — закоммичено `256b39a`. R78 audit: leaf-sweep `ai-signal-bot/src/` (84 файла) — **4 Medium**: S170 (три мёртвых модуля ~740 строк: cross_exchange_arb execution-движок, marketplace plugin-loader, utils/helpers), S171 (strategies-CircuitBreaker никогда не инстанцируется — EnsembleVoter создаётся без него; EnsembleVoter.analyze мёртв), S172 (два backtest-движка с fee-моделями 0.075%/2bps vs 0.04%/1bp — разные ответы по разным кнопкам), S173 (live-path: ExchangeFactory заново на каждый ордер — load_markets per signal; retry×3 без clientOrderId; SimulatorAdapter.cancel_order stale-заглушка False хотя протокол уже умеет). R79 audit: `web-ui/src/utils`+`contexts`+component-internals sweep — **4 находки**: S174 (мёртвая ExchangeContext theme-система: 0 mount'ов, 0 читателей CSS-переменных, themes без okx; её тестирует theatre-файл S166), S175 (DrawdownAnalysis сортит shared `fills` prop in-place — «Recent Fills» переворачивается для всего дашборда), S176 (auditExport+cn — tests-only утилиты), S177 (11 незащищённых JSON.parse(localStorage) — битый ключ убивает панель).

---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| **S150** | `config.prod.yaml` — продакшн-театр: ~35 мёртвых ключей | Parsed-but-never-read: `database.*` (7 ключей — dsn/pool_*/persist_*), `redis.*` (3), `exchange.fallback_to_simulator`, `metrics.enabled`, `metrics.host`, `signal_engine_v2.thresholds.min_composite`, `signal_engine_v2.periods.vwap_window`, `trading.paper_trading` — всё пишется в `Config`, читается только баннером (`bot_setup.cpp:37-39` печатает «DB: true \| Redis: true» при нуле DB-кода в src). `stop_loss_pct`/`take_profit_pct` — только валидируются (`config_validate.h:20-27`), в поведение не идут (V2 использует sl/tp_atr_mult). Никогда не парсятся: `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}` (kill-switch безусловен — `enabled:false` его не отключит), `adaptive_order_selector.{default_type,post_only_retries}`, `pressure_model.{obi_levels,microprice_enabled}` (microprice считается всегда, `pressure_model.h:102`), `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}` (id берётся из порядка в списке, не из поля). Плюс: прод-бинарь всё равно дозванивается только до `exchange.simulator_ws_url` — реальных exchange-адаптеров нет с S059. | Medium | [ ] Open |
| **S151** | `seq` в broadcast — write-only: заявленный gap-detection отсутствует | `ws_broadcast.py:421-422,472,510` инкрементит и шлёт `seq` в каждом `candles`-сообщении; `WEBSOCKET_PROTOCOL.md:269` обещает клиентам «detect missed messages and request sync_state on gaps». Читателей ноль: `useExchangeData.js` — 0 обращений к `data.seq`, `ws_client.py` (ai-bot) тоже игнорит. Reconnect лечит книги через полный `sync_state`-снапшот (orderbooks включены, `ws_broadcast.py:114-123`) — но per-tick детекта дыр нет: потерянное сообщение (напр. merge-логика `flushBatch` в useWebSocket, сейчас выключена для exchange-сокета) → `orderbook_deltas` молча лягут на протухший стакан. Мёртвое поле + ложный doc-claim. | Medium | [ ] Open |
| **S152** | `network/ws_client.h` — мёртвый toolkit; живые коннекты без watchdog | 255 строк (`Watchdog`/`MessageQueue`/`ReconnectionManager`/`SubscriptionManager`/`ReconnectPolicy`) инклудятся только тестами (`test_network.cpp`, `test_signal_flow.cpp`) — 0 include в src (ЧИСТО-claim R51 «ws_client.h широко инклудятся» неверен — инклудят только тесты). `SignalReceiver`/`OrderExecutor` руками крутят websocketpp-reconnect; ни ping/pong-handler'а, ни stale-detection — полуоткрытый TCP (peer умер без FIN/RST) никогда не вызовет `close_handler` → ресивер молча перестаёт получать данные при `connected_=true`; `prices_cache` протухает → SL/TP/PnL считаются по мёртвым ценам вечно. Watchdog, который это ловит, лежит в том же репо неподключённым. | Medium | [ ] Open |
| **S153** | `alerting.py` — aiohttp session без timeout | `alerting.py:74` `ClientSession()` голый — контраст с `engine.py:55` (`ClientTimeout(total=...)`). Зависший webhook-POST блокирует `check_rules`→`_send_alert` gather на неявные 300s aiohttp-дефолта — последующие проверки правил задерживаются на ~5 минут, CRITICAL-алерт (daily_loss/kill_switch) стоит в очереди за мёртвым Discord-каналом. Backstop есть (300s), но алерт-конвейер на это время встаёт. | Low | [ ] Open |
| **S154** | Адаптивные типы ордеров умирают до провода | `AdaptiveOrderSelectorV2::select` выбирает IOC/FOK/GTD/POST_ONLY (`bot_loop.cpp:179-198` логирует «kind=GTD» и т.п.), но `execute_v2_order` использует из селекции только `limit_price`, а `submit_order` заново деривирует MARKET/LIMIT через второй селектор (`OrderTypeSelector`, `order_executor.h:109`) — kind/TIF/expiry теряются; `gtd_seconds` кормит `expire_ns`, никуда не уходящий. `to_{binance,okx,bybit}_{type,tif}` + `to_exchange_*` — 7 функций ~100 строк, вызываются только тестами (`test_doctest_adaptive_order_selector.cpp`, `test_v2_pressure_adaptive.cpp`). Лог говорит GTD — на проводе LIMIT. | Low | [ ] Open |
| **S157** | Auth publisher'а fail-open + `==` + ноль rate-limit на compute-эндпоинтах | `signal_publisher.py:124` `if self._auth_token:` — пустой токен = авторизация отключена **молча** (ни одного warn при старте, `run.py:88`), а `.env.prod.example:37` шипит `AI_BOT_AUTH_TOKEN=` пустым — задокументированный прод-деплой = открытый :8766: слив signal-ленты + history-доступ на коннект + 10 compute-эндпоинтов (`run_backtest`/`optimize_portfolio`/`hawkes_fit`/`cvar`/`stress`/`vol_surface`/`funding_arb_scan`/`position_size`/`compare_backtests`) без пер-клиентского лимита — спам бэктестами = CPU-DoS всего бота. Токен сравнивается `==` (`signal_publisher.py:128`, `health_server.py:157`) — timing-канал; нужен `secrets.compare_digest`. UI-токен к тому же зашит в JS-бандл (`VITE_SIGNAL_TOKEN` build-time). | Medium | [ ] Open |
| **S158** | hft health-server: один idle-коннект замораживает /health + /metrics | `health_server.h:105-118` — однопоточный accept-loop + блокирующий `::read`/`recv` без `SO_RCVTIMEO`/deadline: клиент, открывший TCP и ничего не шлющий, навсегда блокирует весь сервер — все последующие коннекты висят в backlog=4 → healthcheck'и (docker `:9091/health`, k8s-пробы) таймаутят → restart-луп живого бота. Плюс INADDR_ANY без авторизации отдаёт `monitor_->format_json()` (позиции/PnL) на публикуемом :9091 — утечка торгового состояния. | Medium | [ ] Open |
| **S159** | Config dead-key кластер: ~16 ключей в 3 сервисах валидируются/парсятся, но не доходят до рантайма | **sim `config.yaml`**: `metrics.{enabled,port,host}` (:317-320) — все 3 мертвы: `_run_metrics_server` стартует безусловно на `self.port+10`/`self.host` (`websocket_server.py:179-189`), комментарий «Off by default» врёт, а compose-healthcheck и prometheus-джоб (:486) молча зависят от «выключенного» сервера — честный gate сломает healthcheck. `account.currency` (:301) — `SimulatedExchange.__init__` не принимает currency (`exchange.py:40-49`), `Account.currency` хардкод `"USDT"` (models.py:405). `visualizer.enabled` (:306) — читаются только refresh_interval/chart_width/chart_height (`__main__.py:96-104`), реальный gate = CLI-флаг `--no-visualizer`. `market.timeframe` (:291) — только cross-check в валидаторе; рантайм живёт на `timeframe_seconds`. `exchanges.<id>.symbols` (:23,78,133 — ~147 строк yaml) — валидируются и кросс-чекаются, но в `SimulatedExchange` не передаются: все биржи отдают все 49 `initial_prices`, обрезка списка не делает ничего. **ai-bot**: `shm.max_symbols` (settings.yaml:175) — ни property, ни `__getattr__`-пути; `run.py:280` деривит `len(symbol_names)`. **hft dev `config.yaml`**: `signal_engine_v2.obi_levels: 20` (:109) — мёртвый скаляр, парсер хочет `obi_levels_5/10/20` (config_parser.h:96-98); `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` (:91,97-98) — парсятся в `cfg`, но `EngineParams` таких полей не имеет, `bot_setup.cpp:153-159` их не вайрит; FFT гейтится литералом `closes.size() >= 64u` (signal_engine.h:297) — `fft_enabled:false` не отключит ~100 строк FFT-математики. `metrics.{port,host}` (:148-149) мертвы в dev-пути (`is_production ? metrics_port : 9091`, INADDR_ANY хардкод). Плюс **4-сторонний drift `obi_levels`**: dev-скаляр / prod-лист `pressure_model.obi_levels` (config.prod.yaml:89) / парсер split-keys / guide:294 — 4 написания, 0 эффективных, движок всегда на compiled defaults {5,10,20}. Расширяет S150. | Medium | [ ] Open |
| **S160** | PWA manifest: счётчики протухли на ~74 панели | `vite.config.js:15` — description «204 panels and 44+ math models»; факт: 278 `{ id:` записей в `panels/registry.js`. Манифест (install-prompt/description в OS) врёт о размере дашборда; «44+ math models» верифицировать нельзя — реестра моделей нет — но panel-count доказуемо stale. | Info | [ ] Open |
| **S161** | CONFIGURATION_GUIDE §2 — фантомный конфиг сима: неверный путь + 9 несуществующих ключей | `CONFIGURATION_GUIDE.md:130` указывает `exchange_simulator/config/settings.yaml` — реальный файл `config.yaml`. Таблица :134-139 документирует топ-левел `host`/`port` (реальные — под `websocket:`), `compression: deflate` (нет ключа — хардкод `websocket_server.py:184`), `max_symbols: 50` (нет ключа; SHM-слоты — env `SHM_MARKET_MAX_SYMBOLS` :107, символы — из `initial_prices`), `tick_interval_ms: 1000` (нет ключа — литерал `_tick_interval = 1.0` :74), `encoding: json|msgpack` (нет ключа — `_client_encodings` per-client :82). Fees-блок :143-157 описывает `maker_fee_bps`/`taker_fee_bps` — реальная схема одиночный `fee_pct` + `slippage_bps`, maker/taker-сплита нет. Оператор по этому гайду редактирует ключи, которых нет — молча ничего не меняется. | Low | [ ] Open |
| **S162** | WEBSOCKET_PROTOCOL.md §8765 — 8 классов подтверждённых расхождений с диспетчером | Документ — интеграционный контракт, и он врёт: (1) `config_update` — реальный ключ диспетчера `update_config` (`ws_message_handler.py:163`), плюс схема другая: doc шлёт `{"config":{fees:{maker,taker}}}`, код читает плоский `updates` `{fees:{ex:fee_pct},volatility,slippage,leverage}` (:400-424) — клиент по доке получает unknown-type error; (2) `position` broadcast — **ноль эмиттеров**, позиции едут только внутри `account` в snapshot/candles (models.py:430); (3) `speed_change` broadcast — **ноль эмиттеров**, реальный `speed_set` уходит только запросившему (:331), остальные клиенты о смене скорости не узнают; (4) `config_updated` — doc обещает broadcast с `config`+`timestamp`, код шлёт sender-only ack с ключом `updates` (:424) — тот же класс лжи; (5) `fills_batch.fills` — реальный ключ `orders` (`ws_broadcast.py:296-298`) — клиент по доке читает `data.fills` → undefined → теряет все batched-филлы; (6) `welcome.server_name` — реальный ключ `server` (:72), и welcome шлётся на коннект, не «в ответ на subscribe»; (7) `error.code` — ни один error-эмиттер не несёт `code`; (8) недокументировано: команды `start_trading`/`stop_trading` (kill-команды из S155!) и 5 полей candles-пейлоада (`funding_rates`, `candles_to_funding`, `news_event`, `weekend_mode`, `trading_active` — `ws_broadcast.py:478-481`). Клиент, пишущийся по доке, ломается минимум в 4 местах. Doc поправлен. | Medium | [ ] Open |
| **S163** | Grafana latency dashboard: 6 из 8 панелей латентности мертвы навсегда | `latency-monitoring.json` — `histogram_quantile(0.50/0.99, exchange_simulator_{order,websocket,price_feed}_latency_seconds)` (:47,63,79,95,111,127) кверит **голое имя** без `_bucket`; sim эмитит только `name_bucket{le=...}` (`ws_metrics.py:29-30`) → bare-name селектор пуст → `histogram_quantile` ничего не возвращает → 6 панелей вечно пустые. Правильная форма с `_bucket`+`rate()` есть рядом (`:15,:31` для `trading_signal_latency` и `:159` distribution) — т.е. половина дашборда написана правильно, половина — нет. В инциденте оператор смотрит на пустые latency-панели. | Medium | [ ] Open |
| **S164** | Helm-чарт рендерит нерабочую систему: мёртвый data-path, ноль алертинга, пустой Grafana | Кластер k8s-поломок: (1) ai-signal-bot Deployment не ставит `WS_URL` — бот звонит на baked `ws://localhost:8765` (settings.yaml:73) = loopback своего пода → сервис `*-exchange-simulator` недостижим → нет market-data → нет сигналов → hft-sidecar голодает; пробы `/live`+`/ready` зелёные (там нет проверки upstream). (2) exchange-simulator: `COPY . .` печёт `config.yaml` с `host: localhost`, ConfigMap/volume нет → процесс слушает pod-loopback; k8s httpGet-пробы идут на pod-IP ≠ loopback → **CrashLoopBackOff** (хуже compose-варианта S156, где healthcheck внутри контейнера зелёный); и исправить через чарт нельзя — маунта конфига нет вообще. (3) Prometheus ConfigMap (`prometheus.yaml:87-99`) — только scrape_interval + 3 job'а; **нет `rule_files`/`alerting:`**, alertmanager-шаблона в чарте нет вообще → `alerts.yml`/`alertmanager.yml` — compose-only, в k8s ноль алертов. (4) Grafana StatefulSet маунтит только `/var/lib/grafana` — **нет provisioning** → ни datasource, ни дашбордов: пустой Grafana (S068 fixed compose; helm никогда и не имел). (5) `network-policy.yaml` — default-deny egress кроме same-release pods + DNS + ingress-nginx, но чарт вайрит `OPENAI_API_KEY` → api.openai.com заблокирован → LLM-путь мёртв. (6) hft-sidecar: `readOnlyRootFilesystem` + trigger `/tmp/kill_switch` на rootfs → file-trigger недостижим (SHM-флаг `/dev/shm` — writable, жив). (7) `webUi.wsExchange/wsSignals` — обязательные `--set` значения, потребляются только `fail`-гвардами (web-ui.yaml:2-7), в под не попадают — ложная уверенность «я задал URL» при бандле, собранном с чем угодно. (8) `AI_BOT_AUTH_TOKEN` не ставится → publisher fail-open в кластере (расширяет S157). | High | [ ] Open |
| **S165** | Мелкий infra-residue: terraform `vpc_id` + Makefile .PHONY | `terraform/modules/eks/main.tf:15` декларирует `variable "vpc_id"`, оба environment'а передают `module.vpc.vpc_id` (dev/prod main.tf:39) — но внутри модуля `var.vpc_id` ни разу не используется (0 refs) — мёртвый input интерфейса. `Makefile` — 5 хвостовых таргетов (`ci-test`, `ci-quick`, `benchmark`, `walk-forward`, `docker-hub`) не в `.PHONY` (:1) — файл с таким именем молча выключит таргет. | Info | [ ] Open |
| **S166** | Vitest placeholder-theatre: 19 unconditional + 27 fixture-self-asserts | `web-ui/src/test/exchange-ui.test.jsx` — 17× `expect(true).toBe(true)` с комментами «This test would verify…» (order-form themes, state persistence при смене биржи, stop-limit/trailing/iceberg поля, advanced-order validation, audit-log UI) — плюс 27 assert'ов на собственный фикстурный литерал (`expect(mockBinanceTheme).toHaveProperty('primary')` ×24, `mockX.primary.not.toBe(mockY.primary)` ×3) — тестируют локальный const в тест-файле, не приложение. Реальный `ExchangeProvider` трогают ~6 из 50 expect'ов. `performance.test.jsx` — 2 unconditional («manual chunks configured», «target <2s initial load» — оба `expect(true)`). Suite насчитывает 34 зелёных теста «покрытия», которого нет: регрессии в order-form UI и перф-конфиге Vite проходят молча. | Low | [ ] Open |
| **S167** | 5 math-тестов — shadow-копии алгоритмов, 0 импортов продакшена | `cointegration.test.js` / `garch.test.js` / `hmm.test.js` / `kalman.test.js` / `kmeans.test.js` — 85 expect'ов суммарно, единственный import — vitest; тестируемые функции (`calcADF`, `ols`, `calcZScore`, `forward`…) определены **внутри тест-файлов** как копии («Tests the core algorithms extracted from …»). Продакшен-реализации живут отдельно — `PairTradingSignals.jsx`, `GARCHVolatility.jsx`, `HiddenMarkovModel.jsx`, `KalmanFilterPrice.jsx`, `KMeansClustering.jsx` — и тестами не вызываются. Баг в продакшен-математике не сломает ни одного теста; копии могут расходиться с оригиналом бесконечно — suite доказывает корректность своих собственных снапшотов, не кода, который считает сигналы. | Medium | [ ] Open |
| **S168** | ARCHITECTURE.md: stale test-count «99 unit» vs фактические 157 | `ARCHITECTURE.md:422` — «103 test files: 99 unit + 4 e2e» — таблица застряла до добавления ~58 тест-файлов; фактически `web-ui/src/test/` = 157 vitest-файлов + 4 e2e-спеки. README:121 «157 test files (Vitest)» и :195 «162 test files» — честны (157+4 spec+helper). | Info | [ ] Open |
| **S169** | Мёртвые хуки + 471 строка тестов для мёртвого кода | `hooks/useInterval.js` (15 строк) + `hooks/useInterval.ts` (36 строк, задокументирован) — duplicate-пара, 0 импортеров в проде; тест `useInterval.test.jsx` (182 строки) импортирует `'../hooks/useInterval'` extensionless → Vite резолвит `.js` первым → тест гоняет короткую нетипизированную копию, а «правильный» `.ts` — чистая тень; любой будущий импортер молча получит `.js`. `hooks/usePerformance.js` (152 строки, 5 экспортов: `useDebouncedValue` — дубль живого `useDebounce.ts`, `useThrottledCallback`, `useBatchedUpdates`, `useWorker`, `useIntersectionObserver`) — 0 прод-импортеров, живёт только в `usePerformance.test.jsx` (289 строк). Итого ~203 строки мёртвых хуков + 471 строка тестов, надувающих зелёный счёт сьюта — та же test-to-nowhere болезнь, что S167. | Low | [ ] Open |
| **S170** | ai-signal-bot: 3 мёртвых модуля (~740 строк) + их тесты | `strategies/cross_exchange_arb.py` (337 строк) — `CrossExchangeArbEngine`, полный execution-движок арбитража (simple/triangular/stat, leg-risk), docstring продаёт «executes real arbitrage» — **0 прод-импортеров**, живёт только в `test_cross_exchange_arb.py` (не в `build_strategies`, не в `__init__`, не в WS-диспетчере). `strategies/marketplace.py` (259 строк) — `StrategyMarketplace`, plugin-loader с `install_from_git`/`install_from_archive` (importlib-загрузка произвольного кода — security-поверхность впридачу) — 0 импортеров кроме `test_marketplace.py`; зеркало: web-ui `StrategyMarketplace.jsx` честно «local only» — фича написана дважды, оба конца висят в воздухе. `utils/helpers.py` (142 строки) — 0 прод-импортеров, только `test_helpers.py`/`test_utils.py`. ~740 строк кода, который никогда не исполняется в проде. | Medium | [ ] Open |
| **S171** | Strategies-side `CircuitBreaker` никогда не инстанцируется — loss-streak защита мёртва в проде | `run.py:118` создаёт `EnsembleVoter(mode=..., min_votes=...)` **без** `circuit_breaker=` и `strategies=` → `vote()` (`ensemble.py:38-40`) проверяет `self.circuit_breaker` = `None` → 87-строчный breaker в `strategies/circuit_breaker.py` («stops trading after consecutive losses, auto-recovery») никогда не срабатывает — бот торгует сквозь серию лоссов без тормоза (живой breaker — `communication/circuit_breaker.py` у publisher'а, другой класс и другое назначение). Та же мёртвая половина: `EnsembleVoter.strategies` навсегда `[]` → `EnsembleVoter.analyze()` вернул бы «No strategies configured», а `backtest_requests.py:22-31` (`EnsembleVoterAdapter`) **переизобретает** `analyze()` инлайн вместо того чтобы передать strategies в конструктор. | Medium | [ ] Open |
| **S172** | Два параллельных backtest-движка с разными fee-моделями | `backtesting/backtester.py` `Backtester` (347 строк: `fee_pct=0.075` «Binance taker», `slippage_bps=2.0`, fee=notional×pct/100 — инлайн-математика) обслуживает `run_backtest` WS-запрос + run.py + run_backtest.py. `backtesting/backtest_engine.py` `BacktestEngine` (327 строк: `fee_rate=0.0004`, `slippage_bps=1.0`, через `PnLCalculator.apply_entry_slippage`) обслуживает `compare_backtests` + `walk_forward`. Одна стратегия → разные результаты в зависимости от кнопки в UI; комиссия отличается ~1.9×. `__init__.py` экспортирует оба `BacktestResult` под разными именами (`as BacktestEngineResult`) — потребитель обязан знать, чей результат он держит. Feature-factory дубль: два движка, две модели результата, ноль общего кода. | Medium | [ ] Open |
| **S173** | Live-order path: фабрика на каждый ордер + retry без идемпотентности + stale cancel-stub | `run.py:564` `_execute_live_order` — на каждый сигнал: `ExchangeFactory(mode=REAL)` → `adapter.initialize()` → `RealAccount.load_markets()` (multi-REST handshake) + market-data-manager init → 1 ордер → `close()`. Полный exchange-handshake+teardown в горячем пути сигнала; при всплеске сигналов — rate-limit со стороны настоящей биржи и секундные задержки исполнения. `real_account.py:276` `place_order(max_retries=3)` — retry-цикл без `clientOrderId`: timeout-после-fill → повторная отправка → **двойной реальный ордер** (в paper-пути `client_order_id=sig_{id}` есть, в real — где важнее — нет). Плюс `exchange_factory.py:227` `SimulatorAdapter.cancel_order` возвращает `False` с комментом «simulator protocol has no cancel message» — верно до R77-fix, теперь протокол имеет `cancel_order`/`cancel_all_orders`, но ни `SimulatorAdapter`, ни `ExchangeClient` (ws_client.py — реальный order-path бота) cancel не пробрасывают → бот не может отменить sim-ордер даже там, где протокол это позволяет. | Medium | [ ] Open |

| **S174** | Мёртвая theme-система: `ExchangeContext`/`ExchangeSelector` никогда не смонтированы | `contexts/ExchangeContext.jsx` (132 строки: 3 exchange-темы → CSS-переменные `--exchange-*` + layout-конфиги) + `components/ExchangeSelector.jsx` — **0 прод-импортеров и 0 mount'ов**: реальный выбор биржи идёт через Zustand `selectedExchange` (`App.jsx:81` + `Header.jsx:65` кнопки). Ни один stylesheet/компонент не читает `var(--exchange-*)` — провайдер ставил бы переменные в пустоту. Бонус-обман: темы знают binance/bybit/**coinbase**, а сим торгует binance/okx/**bybit** — даже смонтируй её, okx молча получил бы тему binance. Красивый финал: единственные не-vacuous assert'ы theatre-файла `exchange-ui.test.jsx` (S166) тестируют именно этот мёртвый провайдер. | Medium | [ ] Open |
| **S175** | `DrawdownAnalysis` мутирует общий `fills`-prop in-place | `components/DrawdownAnalysis.jsx:16` — `fills.sort((a,b)=>a.timestamp-b.timestamp)` — `Array.sort` мутирует массив; `fills` — ctx-prop из `useExchangeData` (`setFills(prev=>[new,...prev])` — стор держит newest-first). Пока панель смонтирована, каждый render переворачивает shared-массив → `FillsPanel` «Recent Fills» и все прочие читатели `fills` видят oldest-first. Панель ломает порядок данных для всего дашборда. Fix: `[...fills].sort()` или `fills.toSorted()`. | Low | [ ] Open |
| **S176** | Мёртвые utils: `auditExport.js` + `cn.js` — tests-only | `utils/auditExport.js` (107 строк, JSON/CSV-экспорт audit-логов — `exportAuditLogsToJSON`/`ToCSV`/`downloadAuditLogs`) — 0 импортеров кроме `test/auditExport.test.js`; AuditLogViewer экспортирует сам, не через эту утилиту. `utils/cn.js` (3 строки, classname-joiner) — 0 импортеров вообще (ни `utils/cn`, ни `@/utils/cn`, ни `cn(` в компонентах) — живёт в `test/cn.test.js`. Ещё 110 строк + 2 тест-файла в зелёном счёте. | Low | [ ] Open |
| **S177** | 11 сайтов `JSON.parse(localStorage…)` без try — битый ключ убивает панель | `AlertWebhook.jsx:27`, `BacktestComparison.jsx:139,188`, `StrategyBacktest.jsx:43`, `StrategyBuilder.jsx:36`, `hooks/useSavedBacktests.js:23`, `useSessionRecorder.ts:47,171`, `useStrategyMarketplace.ts:120,144` (+1) — все парсят localStorage без try/catch. Shared-хук `useLocalStorage.ts:14-20` guarded (try→initialValue) — эти 11 сайтов его обходят. Урезанный/отредактированный ключ → SyntaxError в render/hook-init → PanelErrorBoundary показывает dead-panel до ручной очистки storage. Blast radius сдержан boundary, но панель мертва навсегда для юзера, не знающего про DevTools. | Low | [ ] Open |
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
- ai-bot `settings.yaml` leaf-sweep: все ключи имеют живых читателей, кроме `shm.max_symbols` (S159) — `metrics.enabled` настоящий gate (`run.py:194` `enable_metrics or config.metrics_enabled`), контраст с мёртвым флагом сима
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

1. **S164** (High) — helm-чарт деплоит мёртвую систему. Fix: ConfigMap с конфигом сима + `host: 0.0.0.0`, env `WS_URL=ws://<release>-exchange-simulator:8765` + `AI_BOT_AUTH_TOKEN` + `EXCHANGE_CONTROL_TOKEN` из secret (S155 теперь требует его для ордеров), `rule_files`+alertmanager, grafana provisioning volume, egress-whitelist на api.openai.com или убрать ключ, `/tmp` emptyDir для kill-switch.
2. **S157** (Medium) — publisher auth fail-open + нет per-client rate-limit на compute. Fix: startup-warning при пустом токене (как у sim теперь), `secrets.compare_digest`, token-bucket на compute-типы.
3. **S158** (Medium) — hft health-server: одно idle-TCP блокирует пробы + monitor JSON без auth на :9091. Fix: `SO_RCVTIMEO`/deadline на recv + thread-per-conn или epoll; auth/scope для /metrics.
4. **S173** (Medium) — live-order path: factory-per-order (load_markets на каждый сигнал), retry×3 без clientOrderId, SimulatorAdapter.cancel_order stale-заглушка. Fix: переиспользовать adapter в bot-loop, `newClientOrderId`/`client_order_id` в обоих путях, cancel API на SimulatorAdapter + ExchangeClient.
5. **S172** (Medium) — два backtest-движка, разные fee-модели. Fix: свести к одному движку (BacktestEngine+PnLCalculator — точнее) и удалить/заменить Backtester, или минимум выровнять дефолты и задокументировать расхождение.
6. **S159** (Medium) — ~16 мёртвых конфиг-ключей в 3 сервисах. Fix-порядок: sim `metrics.*` — либо честный gate + отдельный `health.enabled`, либо удалить ключи (healthcheck зависит); `account.currency`/`exchanges.*.symbols` — пробросить в `SimulatedExchange` или дропнуть; hft `fft_*`/`fast_ema_enabled`/`obi_levels`-drift — свести к одному написанию и завести в `EngineParams`.
7. **S170+S171** (Medium) — dead-code sweep ai-signal-bot: удалить `cross_exchange_arb.py`/`marketplace.py`/`helpers.py` + их тесты (~740 строк); wired strategies-CircuitBreaker в `EnsembleVoter` (run.py:118) или удалить класс + `EnsembleVoter.analyze`/`.strategies` — adapter в backtest_requests уже содержит рабочий вариант.
8. **S162** (Medium) — протокол-док :8765 врёт в 8 местах. (Doc поправлен в R74 + R77 дописал новые типы; строка остаётся контрольной точкой для slop-verify.)
9. **S167** (Medium) — 5 math-тестов тестируют inline-копии, не продакшен. Fix: вынести чистую математику в `src/utils/math/` и импортировать из обеих сторон, или удалить shadow-файлы; плюс S166 — заменить 19 `expect(true)` реальными рендер-assert'ами или удалить placeholder-тесты.
10. Периодически — `/slop-verify`: QA-проверка записей done-log по файлам/строкам.
