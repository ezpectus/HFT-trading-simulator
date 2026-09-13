# OFFICE BOARD — AI SLOP AUDIT

> Аудит: 11 сен 2026 → текущий раунд R70+. Метод: статический grep-анализ по `.windsurf/workflows/ai_slop_audit.md`.
> **Закрытые находки перенесены в `.cascade/done-log.md`** (99 шт, R4–R60) — доска держит только Open/Partial. Проверка закрытых — `slop-verify`.
> История работ: `.cascade/progress.md`, баги: `.cascade/bug_log.md`.

---

## СВОДКА

| Метрика | Значение |
|---------|----------|
| Tracked файлов | 1180 (ai-signal-bot 332, web-ui/src 460, hft-trade-bot 146, exchange_simulator 84) |
| Всего находок | ~161 (S001–S161) |
| Закрыто | 147 |
| Открыто | **14** — 7 из R71 + 4 из R72 + 3 из R73 |

**Текущее состояние:** R73 (config leaf-key sweep: sim config.yaml + ai-bot settings.yaml + hft dev config.yaml + web-ui build-config) нашёл **3 открытых** — S159–S161. Главное: ~16 конфиг-ключей валидируются/парсятся, но не доходят до рантайма — хуже всех `metrics.enabled:false` сима, который безусловно стартует сервер, от которого зависят healthcheck и prometheus (S159); 4-сторонний drift `obi_levels` — 4 написания ключа, 0 эффективных; CONFIGURATION_GUIDE §2 описывает фантомный конфиг сима (неверный путь + 9 несуществующих ключей, S161).

---

## НАХОДКИ

| ID | Находка | Детали | Приоритет | Статус |
|----|---------|--------|-----------|--------|
| **S148** | Kill-switch «cancel all orders» — лог-заглушка, реальных отмен нет | `bot_setup.cpp:175-176` — `set_cancel_all_callback([&]{ spdlog::warn("KILL SWITCH: Cancelling all open orders..."); })` — чистый лог, ноль отмен. `OrderExecutor` не имеет cancel-метода; в WS-протоколе сима нет `cancel_order` (диспетч `ws_message_handler.py:143-167`). Покоящиеся ордера (LIMIT/GTD/PostOnly через adaptive selector → в симе уходят в PENDING и исполняются на следующих тиках) переживают kill-switch → филлятся после остановки → переоткрывают позицию. Тот же ложный лог в `graceful_shutdown` (`bot_loop.cpp:349` «cancelling all open orders» — только close_position дальше). Аварийный стоп оставляет боевые ордера работать. | High | [ ] Open |
| **S149** | `client_order_id` мёртв end-to-end — заявленная идемпотентность не существует | `run.py:542` шлёт `client_order_id=f"sig_{signal_id}"` → `ws_client.py:240` кладёт в order-msg → sim читает 14 полей (`_submit_exchange_order`, `ws_message_handler.py:230-244`), `client_order_id` среди них нет, dedup-таблицы нет — 0 refs во всём exchange_simulator. `ARCHITECTURE.md:641` заявляет «client_order_id for deduplication» — ложь; в `WEBSOCKET_PROTOCOL.md` поля вообще нет. Живой вектор дублей: `useWebSocket.send()` очередит ≤100 сообщений при дисконнекте и сбрасывает пачкой на reconnect (`useWebSocket.ts:280-290,161-172`) — «не отправленный» (return false) ордер исполняется позже по новой цене; повторный клик юзера = второй ордер, и dedup, который должен был это ловить, отсутствует. | High | [ ] Open |
| **S150** | `config.prod.yaml` — продакшн-театр: ~35 мёртвых ключей | Parsed-but-never-read: `database.*` (7 ключей — dsn/pool_*/persist_*), `redis.*` (3), `exchange.fallback_to_simulator`, `metrics.enabled`, `metrics.host`, `signal_engine_v2.thresholds.min_composite`, `signal_engine_v2.periods.vwap_window`, `trading.paper_trading` — всё пишется в `Config`, читается только баннером (`bot_setup.cpp:37-39` печатает «DB: true \| Redis: true» при нуле DB-кода в src). `stop_loss_pct`/`take_profit_pct` — только валидируются (`config_validate.h:20-27`), в поведение не идут (V2 использует sl/tp_atr_mult). Никогда не парсятся: `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}` (kill-switch безусловен — `enabled:false` его не отключит), `adaptive_order_selector.{default_type,post_only_retries}`, `pressure_model.{obi_levels,microprice_enabled}` (microprice считается всегда, `pressure_model.h:102`), `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}` (id берётся из порядка в списке, не из поля). Плюс: прод-бинарь всё равно дозванивается только до `exchange.simulator_ws_url` — реальных exchange-адаптеров нет с S059. | Medium | [ ] Open |
| **S151** | `seq` в broadcast — write-only: заявленный gap-detection отсутствует | `ws_broadcast.py:421-422,472,510` инкрементит и шлёт `seq` в каждом `candles`-сообщении; `WEBSOCKET_PROTOCOL.md:269` обещает клиентам «detect missed messages and request sync_state on gaps». Читателей ноль: `useExchangeData.js` — 0 обращений к `data.seq`, `ws_client.py` (ai-bot) тоже игнорит. Reconnect лечит книги через полный `sync_state`-снапшот (orderbooks включены, `ws_broadcast.py:114-123`) — но per-tick детекта дыр нет: потерянное сообщение (напр. merge-логика `flushBatch` в useWebSocket, сейчас выключена для exchange-сокета) → `orderbook_deltas` молча лягут на протухший стакан. Мёртвое поле + ложный doc-claim. | Medium | [ ] Open |
| **S152** | `network/ws_client.h` — мёртвый toolkit; живые коннекты без watchdog | 255 строк (`Watchdog`/`MessageQueue`/`ReconnectionManager`/`SubscriptionManager`/`ReconnectPolicy`) инклудятся только тестами (`test_network.cpp`, `test_signal_flow.cpp`) — 0 include в src (ЧИСТО-claim R51 «ws_client.h широко инклудятся» неверен — инклудят только тесты). `SignalReceiver`/`OrderExecutor` руками крутят websocketpp-reconnect; ни ping/pong-handler'а, ни stale-detection — полуоткрытый TCP (peer умер без FIN/RST) никогда не вызовет `close_handler` → ресивер молча перестаёт получать данные при `connected_=true`; `prices_cache` протухает → SL/TP/PnL считаются по мёртвым ценам вечно. Watchdog, который это ловит, лежит в том же репо неподключённым. | Medium | [ ] Open |
| **S153** | `alerting.py` — aiohttp session без timeout | `alerting.py:74` `ClientSession()` голый — контраст с `engine.py:55` (`ClientTimeout(total=...)`). Зависший webhook-POST блокирует `check_rules`→`_send_alert` gather на неявные 300s aiohttp-дефолта — последующие проверки правил задерживаются на ~5 минут, CRITICAL-алерт (daily_loss/kill_switch) стоит в очереди за мёртвым Discord-каналом. Backstop есть (300s), но алерт-конвейер на это время встаёт. | Low | [ ] Open |
| **S154** | Адаптивные типы ордеров умирают до провода | `AdaptiveOrderSelectorV2::select` выбирает IOC/FOK/GTD/POST_ONLY (`bot_loop.cpp:179-198` логирует «kind=GTD» и т.п.), но `execute_v2_order` использует из селекции только `limit_price`, а `submit_order` заново деривирует MARKET/LIMIT через второй селектор (`OrderTypeSelector`, `order_executor.h:109`) — kind/TIF/expiry теряются; `gtd_seconds` кормит `expire_ns`, никуда не уходящий. `to_{binance,okx,bybit}_{type,tif}` + `to_exchange_*` — 7 функций ~100 строк, вызываются только тестами (`test_doctest_adaptive_order_selector.cpp`, `test_v2_pressure_adaptive.cpp`). Лог говорит GTD — на проводе LIMIT. | Low | [ ] Open |
| **S155** | Sim :8765 — control-plane без авторизации вообще | В `exchange_simulator/` ноль auth/token/password — диспетч `ws_message_handler.py:143-167` принимает от любого клиента: `order`, `close_position` (форс-клоуз чужой позиции), `start_trading`/`stop_trading` (одно сообщение = стоп торговли для ВСЕХ клиентов), `update_config` (мутация `volatility`/`fee_pct`/`slippage_bps`/`account.leverage` БЕЗ границ — отрицательная комиссия = бесплатные деньги на каждом филле, leverage→0 ломает маржу), `set_speed`/`replay` (пауза всего рынка), `options_chain` (compute-спам). Data-plane и control-plane на одном открытом порту; rate-limit 1000 msg/мин спасает от флуда, но не от одной команды. Порт публикуется в dev+prod compose. | High | [ ] Open |
| **S156** | Сим биндится на `localhost` внутри контейнера — публикуемые порты мёртвы | `config.yaml:313` `websocket.host: "localhost"` (+ `metrics.host` :320) читается `__main__.py:136` без env-override (env читаются только LOG_FORMAT/SHM_*), тот же файл монтируется ro в dev+prod контейнеры, а compose публикует `8765:8765`/`8775:8775` — docker-proxy форвардит на container-IP, где никто не слушает → веб-UI и внешние клиенты НИКОГДА не подключатся. Healthcheck курлит `localhost:8775` изнутри контейнера → остаётся зелёным → «здоровый» деплой с мёртвой лентой. `DEPLOYMENT.md:22` врёт: «docker-compose up = everything works». ai-bot так не болеет — `AI_BOT_BIND_HOST` env default `0.0.0.0` (run.py:87). | High | [ ] Open |
| **S157** | Auth publisher'а fail-open + `==` + ноль rate-limit на compute-эндпоинтах | `signal_publisher.py:124` `if self._auth_token:` — пустой токен = авторизация отключена **молча** (ни одного warn при старте, `run.py:88`), а `.env.prod.example:37` шипит `AI_BOT_AUTH_TOKEN=` пустым — задокументированный прод-деплой = открытый :8766: слив signal-ленты + history-доступ на коннект + 10 compute-эндпоинтов (`run_backtest`/`optimize_portfolio`/`hawkes_fit`/`cvar`/`stress`/`vol_surface`/`funding_arb_scan`/`position_size`/`compare_backtests`) без пер-клиентского лимита — спам бэктестами = CPU-DoS всего бота. Токен сравнивается `==` (`signal_publisher.py:128`, `health_server.py:157`) — timing-канал; нужен `secrets.compare_digest`. UI-токен к тому же зашит в JS-бандл (`VITE_SIGNAL_TOKEN` build-time). | Medium | [ ] Open |
| **S158** | hft health-server: один idle-коннект замораживает /health + /metrics | `health_server.h:105-118` — однопоточный accept-loop + блокирующий `::read`/`recv` без `SO_RCVTIMEO`/deadline: клиент, открывший TCP и ничего не шлющий, навсегда блокирует весь сервер — все последующие коннекты висят в backlog=4 → healthcheck'и (docker `:9091/health`, k8s-пробы) таймаутят → restart-луп живого бота. Плюс INADDR_ANY без авторизации отдаёт `monitor_->format_json()` (позиции/PnL) на публикуемом :9091 — утечка торгового состояния. | Medium | [ ] Open |
| **S159** | Config dead-key кластер: ~16 ключей в 3 сервисах валидируются/парсятся, но не доходят до рантайма | **sim `config.yaml`**: `metrics.{enabled,port,host}` (:317-320) — все 3 мертвы: `_run_metrics_server` стартует безусловно на `self.port+10`/`self.host` (`websocket_server.py:179-189`), комментарий «Off by default» врёт, а compose-healthcheck и prometheus-джоб (:486) молча зависят от «выключенного» сервера — честный gate сломает healthcheck. `account.currency` (:301) — `SimulatedExchange.__init__` не принимает currency (`exchange.py:40-49`), `Account.currency` хардкод `"USDT"` (models.py:405). `visualizer.enabled` (:306) — читаются только refresh_interval/chart_width/chart_height (`__main__.py:96-104`), реальный gate = CLI-флаг `--no-visualizer`. `market.timeframe` (:291) — только cross-check в валидаторе; рантайм живёт на `timeframe_seconds`. `exchanges.<id>.symbols` (:23,78,133 — ~147 строк yaml) — валидируются и кросс-чекаются, но в `SimulatedExchange` не передаются: все биржи отдают все 49 `initial_prices`, обрезка списка не делает ничего. **ai-bot**: `shm.max_symbols` (settings.yaml:175) — ни property, ни `__getattr__`-пути; `run.py:280` деривит `len(symbol_names)`. **hft dev `config.yaml`**: `signal_engine_v2.obi_levels: 20` (:109) — мёртвый скаляр, парсер хочет `obi_levels_5/10/20` (config_parser.h:96-98); `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` (:91,97-98) — парсятся в `cfg`, но `EngineParams` таких полей не имеет, `bot_setup.cpp:153-159` их не вайрит; FFT гейтится литералом `closes.size() >= 64u` (signal_engine.h:297) — `fft_enabled:false` не отключит ~100 строк FFT-математики. `metrics.{port,host}` (:148-149) мертвы в dev-пути (`is_production ? metrics_port : 9091`, INADDR_ANY хардкод). Плюс **4-сторонний drift `obi_levels`**: dev-скаляр / prod-лист `pressure_model.obi_levels` (config.prod.yaml:89) / парсер split-keys / guide:294 — 4 написания, 0 эффективных, движок всегда на compiled defaults {5,10,20}. Расширяет S150. | Medium | [ ] Open |
| **S160** | PWA manifest: счётчики протухли на ~74 панели | `vite.config.js:15` — description «204 panels and 44+ math models»; факт: 278 `{ id:` записей в `panels/registry.js`. Манифест (install-prompt/description в OS) врёт о размере дашборда; «44+ math models» верифицировать нельзя — реестра моделей нет — но panel-count доказуемо stale. | Info | [ ] Open |
| **S161** | CONFIGURATION_GUIDE §2 — фантомный конфиг сима: неверный путь + 9 несуществующих ключей | `CONFIGURATION_GUIDE.md:130` указывает `exchange_simulator/config/settings.yaml` — реальный файл `config.yaml`. Таблица :134-139 документирует топ-левел `host`/`port` (реальные — под `websocket:`), `compression: deflate` (нет ключа — хардкод `websocket_server.py:184`), `max_symbols: 50` (нет ключа; SHM-слоты — env `SHM_MARKET_MAX_SYMBOLS` :107, символы — из `initial_prices`), `tick_interval_ms: 1000` (нет ключа — литерал `_tick_interval = 1.0` :74), `encoding: json|msgpack` (нет ключа — `_client_encodings` per-client :82). Fees-блок :143-157 описывает `maker_fee_bps`/`taker_fee_bps` — реальная схема одиночный `fee_pct` + `slippage_bps`, maker/taker-сплита нет. Оператор по этому гайду редактирует ключи, которых нет — молча ничего не меняется. | Low | [ ] Open |

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
- sim ws: `max_size=1MB`, per-client rate-limit 1000 msg/мин (от флуда защищает, от control-команд нет → S155), auth-handshake publisher'а bounded `wait_for(10s)`
- secrets-in-logs: aiohttp debug-лог подавлен в notifier (токены telegram/discord не утекают)

**R73 (config leaf-keys — проверено, чисто):**
- ai-bot `settings.yaml` leaf-sweep: все ключи имеют живых читателей, кроме `shm.max_symbols` (S159) — `metrics.enabled` настоящий gate (`run.py:194` `enable_metrics or config.metrics_enabled`), контраст с мёртвым флагом сима
- hft dev `config.yaml` — остальные ключи живые: `hft_strategies` periods/тоглы вайрятся в `EngineParams` (bot_setup.cpp:153-159), `adaptive_order_selector.*` → `AdaptiveOrderSelectorV2::Params`, `latency_optimization.*`/`ai_signal_bot.*`/`signal_engine_v3.enabled`/`logging.*` → `cfg`, `trading.*`/`risk.*`/`exchange.*` → `cfg` (S150 уже покрыл их banner-only consumption)
- web-ui: `netlify.toml` живой (deploy.yml Netlify-job + secrets), `nginx.conf` реальные security-headers/health/SPA-fallback, VitePWA autoUpdate сам инжектит SW-регистрацию — `registerSW` import не нужен
- web-ui generated dirs (`dist/`, `coverage/`, `playwright-report/`, `test-results/`, `screenshots/`) — все gitignored, не residue
- helm `OPENAI_API_KEY` if/else — value-or-secret pattern, не дупликат

---

## ПРИОРИТЕТЫ

1. **S148** (High) — kill-switch/graceful-shutdown «cancel all orders» лог-заглушка: resting-ордера переживают аварийный стоп. Fix-варианты: sim-side `cancel_order` msg-type + `OrderExecutor::cancel_all` + реальный callback; или min-fix — marketable-close вместо pending-ордеров + честный лог.
2. **S149** (High) — `client_order_id` мёртв end-to-end при живом dup-векторе (UI send-queue flush). Fix: sim dedup-таблица `client_order_id → order_id` (TTL) + протокол-док.
3. **S155** (High) — sim :8765 control-plane без авторизации. Fix: auth-handshake как у publisher'а (токен) или разделение data/control портов + bounds-валидация `update_config` (fee≥0, leverage∈[1,125], vol>0).
4. **S156** (High) — контейнерный сим биндит localhost → публикуемые порты мёртвы, healthcheck зелёный. Fix: env-override (`EXCHANGE_WS_HOST` как `AI_BOT_BIND_HOST`) или `host: 0.0.0.0` в compose-конфиге; healthcheck наружу (docker-proxy), не изнутри.
5. **S159** (Medium) — ~16 мёртвых конфиг-ключей в 3 сервисах. Fix-порядок: sim `metrics.*` — либо честный gate + отдельный `health.enabled`, либо удалить ключи (healthcheck зависит); `account.currency`/`exchanges.*.symbols` — пробросить в `SimulatedExchange` или дропнуть; hft `fft_*`/`fast_ema_enabled`/`obi_levels`-drift — свести к одному написанию и завести в `EngineParams`.
6. Периодически — `/slop-verify`: QA-проверка записей done-log по файлам/строкам.
