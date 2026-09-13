# Audit Findings — Full Project Grep Scan

**Date:** 2026-08-22 (last verified: 2026-08-25)
**Scope:** Entire project (`ai-signal-bot/`, `exchange_simulator/`, `hft-trade-bot/`, `hft-executor/`, `monitoring/`, `web-ui/`, `scripts/`, root-level files)
**Method:** grep-based scan for: TODO/FIXME/HACK, `except Exception`, `print()`, `import *`, `type: ignore`, `NotImplementedError`, `global`, `: Any`, `# noqa`, `pass`, hardcoded values (localhost, ports, /dev/shm), duplicate files, dead code, credentials/secrets, redundant exception tuples, f-string logging, `nosec`/`codeql` annotations, `os.system`, SQL injection patterns

---

## UPDATE — September 11, 2026 (AI Slop Audit round 2)

Полный прогон по `.windsurf/workflows/ai_slop_audit.md`. Детальная доска: `.cascade/office-board.md` (S001–S025).

### Новые находки
- **S001 (Critical):** `web-ui/src` — 460 файлов, ~290 компонентов, **0 реальных API-вызовов** (нет `fetch`/`axios`/`ApiClient`). Все панели — моки.
- **S002 (Critical):** `Math.random()` как live-метрики — 88 вхождений в 36 файлах. `setInterval`/`setTimeout` — 0: панели даже не обновляются.
- **S003 (Critical):** `MOCK_*` inline-данные — 378 вхождений в 50 компонентах.
- **S004 (High):** 566 `assert len(` + 194 `assert isinstance(` в тестах — проверяют размер/тип, не значения.
- **S005:** `range(len(` — 84 в 38 файлах. **S006:** `patch()` без autospec — 25 в 9 файлах. **S007:** `time.time()` — 71 в 23 файлах.
- **S013:** `json.loads` в `real_market_data.py` без per-message try — битое сообщение убивает WS-loop → reconnect (3 места).

### Коррекции старого аудита
- **Finding 022 (f-string logging):** заявлено ~80+, фактически ~14 (`attribution.py` 10, `competition.py` 4). Завышено в 6 раз.

### Round 2 (тот же день)
- **S004 расширен:** +79 `assert ... is not None` в 44 тестовых файлах → всего ~839 слабых assert'ов.
- **S026:** `JSON.parse(JSON.stringify(...))` deep-copy хак в `useSessionRecorder.ts` — нужен `structuredClone()`.

### Round 3 (тот же день) — коррекция методологии
**Обнаружен BRE-баг:** grep использует BRE — `|` это литерал, не alternation. Все поиски с `|` дали ложные нули. Перепроверено индивидуально.

**Исправленные находки:**
- **S001:** `fetch(` — 1 вызов (не 0), `ApiClient.jsx`/`useWebSocket.ts` существуют. API-слой есть, но ~99% панелей его не используют.
- **S002:** `setInterval` — 24, `setTimeout` — 45. Панели обновляются, но рандомом.
- **S006:** `Mock(`/`MagicMock(` — 131 в 13 файлах (не 0). Всего 156 моков без spec.
- **S027 (новый):** `List[` 877 + `Dict[` 136 + `Tuple[` 108 = 1121 старый typing в ~150 файлах. Смешано с modern syntax.
- **S028 (новый):** `or {}`/`or []` — 12 в 9 файлах (None-masking).
- **S029 (новый):** `toBeTruthy()` — 15 в 4 тестовых файлах.
- **S030 (новый):** `console.*` — 26 в 13 файлах, не все IS_DEV-gated.
- **S031 (новый):** `0.0.0.0` binds — 9 в 8 файлах.
- **S032 (новый):** `-> dict` без контрактов — 145 в 76 файлах.
- **S033 (новый):** `time.sleep` в тестах — 7 в 4 файлах.
- **S034 (новый):** `assert True`/`== True` — 3 в 2 файлах.

**Снятые ложные тревоги:** `FIXME` (FIX protocol), `eval(` (`model.eval()`), `HACK` (EventType.HACK), `shell=True` (nosec), `pytest.mark.skip` (skipif с reason), `innerHTML` (комментарий), `var ` (имена переменных), `alert(` (onAlert/removeAlert), `document.`/`window.` (локальные переменные/легитимный DOM), `Date.now()`/`new Date()` (52+90 — легитимные timestamps).

### Подтверждено чистым (0 совпадений, проверено индивидуально)
`TODO`, `import *`, bare `except:`, `except Exception: pass`, `eval`/`exec`/`pickle.loads`/`verify=False`/`yaml.load`, f-string SQL, `pytest.mark.xfail`, `Optional[`/`Union[`, `NotImplementedError`, mutable default args, `== True/None`, `datetime.utcnow`, `dangerouslySetInnerHTML`, пустые `catch {}`, `key={index}`, `sys.exit` в src, `lru_cache`, `.index(`, `model_dump(`, `status_code in`, `assert callable`/`issubclass`.

### Инфра
- `.windsurf/` был закоммичен (2 workflow-файла) — добавлен в `.gitignore`, убран из индекса.

---

## UPDATE — August 25, 2026

### Findings Resolved Since Original Audit
- **Finding 001 (dead code ai-signal-bot/tracing.py):** ✅ REMOVED
- **Finding 002 (dead code exchange_simulator/tracing.py):** ✅ REMOVED
- **Finding 003 (dead code ai-signal-bot/metrics.py):** ✅ REMOVED
- **Finding 007 (except Exception in signal_publisher.py):** ✅ FIXED — 0 `except Exception` catches remain
- **Finding 009 (except Exception: pass in db.py):** ✅ FIXED
- **Finding 021 (redundant Exception in feature_store.py):** ✅ FIXED — now `except (OSError, ConnectionError, RuntimeError)`
- **Finding 025 (open() without encoding=):** ✅ FIXED — all `open()` calls now use `encoding="utf-8"`
- **Finding 026 (console.log in performanceMonitor.js):** ✅ FIXED — gated by IS_DEV flag with eslint-disable
- **memo() audit:** ✅ 286/289 components wrapped (3 error boundaries excluded by design)
- **TODO/FIXME:** ✅ 0 in Python, 0 in JSX
- **dangerouslySetInnerHTML:** ✅ 0 occurrences
- **Security:** ✅ ApiClient credentials now in-memory (useState), Auth stores only username
- **CodeQL alerts #49, #50:** ✅ Fixed (helm passwords use placeholders)

### Findings Still Open (low priority)
- **Finding 004 (exchange_simulator/metrics.py):** Still exists, only used in tests
- **Finding 005 (duplicate run_backtest.py):** Both serve different purposes (quick vs full)
- **Finding 006 (duplicate load_test_50_symbols.py):** Low priority
- **Finding 013 (hardcoded localhost:8765):** Defaults in code, config overrides available
- **Finding 022 (f-string logging ~80+ calls):** Low priority, lazy eval only matters at high volume
- **Finding 023 (os.system in monitor.py):** Annotated with nosec, low priority
- **Finding 024 (0.0.0.0 bind):** All annotated with nosec, standard for Docker/K8s

---

## Summary (updated Aug 25, 2026)

| Category | Original Count | Current Count | Severity |
|----------|---------------|---------------|----------|
| Dead code files (root-level) | 3 | 1 (exchange_simulator/metrics.py) | High → Low |
| Duplicate scripts | 2 | 2 (different purposes, documented) | Medium → Low |
| `except Exception` catches | 15 | 0 | Medium → ✅ Clean |
| `except Exception: pass` (silent) | 1 | 0 | High → ✅ Clean |
| Redundant `Exception` in exception tuple | 1 | 0 | Medium → ✅ Clean |
| f-string in logger calls (perf) | ~80+ | ~80+ | Low |
| `os.system` in production | 1 | 1 (nosec annotated) | Low |
| `open()` without `encoding=` | 7 | 0 | Low → ✅ Clean |
| `console.log` in web-ui utils | 6 | 6 (IS_DEV gated) | Low → ✅ Clean |
| Hardcoded `localhost:8765` in production | 4 | 4 (config overrides) | Low |
| `0.0.0.0` bind in production (with nosec) | 7 | 7 | Info (justified) |
| `nosec` / `codeql` annotations | 10 | 10 | Info (justified) |
| Private attribute access in tests | 1 | 1 | Low |
| `type: ignore` | 1 | 1 | Info (justified) |
| `global` statements | 29 | 13 (16 eliminated with dead code) | Info (all justified) |
| `: Any` annotations | 11 | 11 | Info (all justified) |
| `# noqa` annotations | 39 | 39 | Info (all justified) |
| `pass` in production (non-CancelledError) | 4 | 3 | Low |
| TODO/FIXME/HACK | 0 | 0 | ✅ Clean |
| `import *` | 0 | 0 | ✅ Clean |
| Bare `except:` | 0 | 0 | ✅ Clean |
| `NotImplementedError` | 0 | 0 | ✅ Clean |
| `eval()`/`exec()` | 0 | 0 | ✅ Clean |
| `subprocess`/`os.system` | 0 | 0 | ✅ Clean |
| Hardcoded credentials | 0 | 0 | ✅ Clean |
| `dangerouslySetInnerHTML` | 0 | 0 | ✅ Clean |
| React components without memo() | N/A | 3 (error boundaries, by design) | ✅ Clean |

---

## Finding 001 — Dead code: `ai-signal-bot/tracing.py` (205 lines)

**File:** `ai-signal-bot/tracing.py`  
**Severity:** High  
**Status:** Not imported anywhere  

`AISignalBotTracer` class with OpenTelemetry/Jaeger tracing. NOT imported by any production code or test. Superseded by `ai-signal-bot/src/observability/tracing.py` which provides `setup_tracing()` / `get_tracer()` / `shutdown_tracing()`.

**Action:** Remove file. If any functionality is missing from `src/observability/tracing.py`, port it first.

---

## Finding 002 — Dead code: `exchange_simulator/tracing.py` (193 lines)

**File:** `exchange_simulator/tracing.py`  
**Severity:** High  
**Status:** Not imported anywhere  

`ExchangeSimulatorTracer` class — mirror of `ai-signal-bot/tracing.py`. NOT imported by any production code or test. No module-level replacement exists in `exchange_simulator/` (the simulator doesn't use OpenTelemetry tracing in production).

**Action:** Remove file.

---

## Finding 003 — Potentially dead code: `ai-signal-bot/metrics.py` (293 lines)

**File:** `ai-signal-bot/metrics.py`  
**Severity:** Medium  
**Status:** Only loaded dynamically in `monitoring/tests/test_metrics.py` via `_load_module()`  

`AISignalBotMetrics` class with Prometheus counters/gauges/histograms. NOT imported in production. Superseded by `ai-signal-bot/src/monitoring/metrics.py` which provides a different, more modular Prometheus exporter with graceful `ImportError` fallback.

**Action:** Remove file. Update `monitoring/tests/test_metrics.py` to test `src/monitoring/metrics.py` instead.

---

## Finding 004 — Potentially dead code: `exchange_simulator/metrics.py` (250 lines)

**File:** `exchange_simulator/metrics.py`  
**Severity:** Medium  
**Status:** Only imported in test files (`exchange_simulator/tests/test_exchange_metrics.py`, `monitoring/tests/test_metrics.py`)  

`ExchangeSimulatorMetrics` class. NOT imported in production. The exchange simulator uses `exchange_simulator/ws_metrics.py` (`WebSocketMetrics`) for WebSocket-specific metrics and `exchange_simulator/ws_prometheus.py` for Prometheus export.

**Action:** Remove file. Update or remove `test_exchange_metrics.py` and `monitoring/tests/test_metrics.py` references.

---

## Finding 005 — Duplicate script: `ai-signal-bot/run_backtest.py` vs `ai-signal-bot/scripts/run_backtest.py`

**Files:**
- `ai-signal-bot/run_backtest.py` (179 lines) — uses `Backtester` directly, generates synthetic candles
- `ai-signal-bot/scripts/run_backtest.py` (109 lines) — uses `BacktestEngine` + `BacktestComparison`, mock candles

**Severity:** Medium  

Two different backtest runner scripts with different implementations and different backtest engines. Confusing for users — unclear which is canonical.

**Action:** Decide on one canonical runner. If both serve different purposes (quick vs full backtest), rename and document clearly.

---

## Finding 006 — Duplicate script: `scripts/load_test_50_symbols.py` vs `exchange_simulator/tests/load_test_50_symbols.py`

**Files:**
- `scripts/load_test_50_symbols.py` (67 `print()` calls)
- `exchange_simulator/tests/load_test_50_symbols.py` (22 `print()` calls)

**Severity:** Low  

Two load test scripts for 50 symbols. Likely one was copied from the other and diverged.

**Action:** Consolidate into one location. Keep in `exchange_simulator/tests/` if it's a test, or `scripts/` if it's a utility.

---

## Finding 007 — `except Exception` catches: `signal_publisher.py` (6 catches)

**File:** `ai-signal-bot/src/communication/signal_publisher.py`  
**Lines:** 123, 135, 155, 191, 232, 266  
**Severity:** Medium  

Six `except Exception` catches:
- Lines 123, 135: catching send failures for signal history / circuit breaker status → could narrow to `(websockets.WebSocketException, ConnectionError, OSError)`
- Line 155: catch-all in client handler loop → could narrow to `(websockets.WebSocketException, json.JSONDecodeError, OSError)`
- Lines 191, 232, 266: broadcast send failures → could narrow to `(websockets.WebSocketException, ConnectionError, OSError)`

**Action:** Narrow to specific exception types.

---

## Finding 008 — `except Exception` catches: `real_account.py` (3 catches)

**File:** `ai-signal-bot/src/data_collection/real_account.py`  
**Lines:** 163, 247, 378  
**Severity:** Medium  

Three `except Exception` catches wrapping ccxt exchange calls:
- Line 163: `fetch_balance` failure → could narrow to `(ccxt.ExchangeError, ccxt.NetworkError, asyncio.TimeoutError)`
- Line 247: `set_leverage` failure → same
- Line 378: connection check → same

**Action:** Narrow to ccxt-specific exceptions. Add `import ccxt` if not present.

---

## Finding 009 — `except Exception: pass` — silent failure in `db.py`

**File:** `ai-signal-bot/src/database/db.py`  
**Line:** 33-34  
**Severity:** High  

```python
except Exception:
    pass
```

Silently swallows ALL errors during SQLite WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)` + `PRAGMA journal_mode=DELETE`). Could hide database corruption, disk full, or permission errors.

**Action:** Narrow to `(sqlite3.OperationalError, sqlite3.DatabaseError)` and log a warning.

---

## Finding 010 — `except Exception` catches: `health_check.py` (1 catch)

**File:** `ai-signal-bot/src/communication/health_check.py`  
**Line:** 73  
**Severity:** Low  

Catch-all after specific `TimeoutError` and `ConnectionRefusedError` catches. Returns unhealthy status with error string.

**Action:** Narrow to `(OSError, asyncio.TimeoutError, json.JSONDecodeError)`.

---

## Finding 011 — `except Exception` catches: `shm_fill_consumer.py` and `shm_signal_producer.py` (2 catches)

**Files:**
- `ai-signal-bot/src/communication/shm_fill_consumer.py:39`
- `ai-signal-bot/src/communication/shm_signal_producer.py:37`

**Severity:** Low  

Both catch all exceptions during SHM initialization. Could hide `FileNotFoundError`, `PermissionError`, `OSError` for shared memory creation.

**Action:** Narrow to `(OSError, FileNotFoundError, PermissionError)`.

---

## Finding 012 — `except Exception: pass` in test conftest: `monitoring/tests/conftest.py`

**File:** `monitoring/tests/conftest.py`  
**Lines:** 11, 18  
**Severity:** Low  

Test fixture cleanup for Prometheus registry. Uses `except Exception: pass` and accesses private `_collector_to_names` attribute.

**Action:** Narrow to `(KeyError, ValueError)` — `REGISTRY.unregister` may raise these. Replace `_collector_to_names` with public API if available.

---

## Finding 013 — Hardcoded `localhost:8765` in production code

**Files:**
- `ai-signal-bot/src/communication/ws_client.py:35` — default URL `ws://localhost:8765`
- `ai-signal-bot/src/data_collection/exchange_factory.py:42` — `SimulatorAdapter` default URL
- `ai-signal-bot/src/data_collection/exchange_factory.py:168` — `ExchangeClient` default URL
- `price_monitor.py:19` — `WS_URL = "ws://localhost:8765"`

**Severity:** Low  

Hardcoded WebSocket URL. Should come from config or environment variable. The config files do have `websocket_url` settings, but the code defaults don't read from config.

**Action:** Make defaults configurable via environment variable or config file.

---

## Finding 014 — `type: ignore` in `ws_constants.py`

**File:** `exchange_simulator/ws_constants.py:11`  
**Severity:** Info (justified)  

```python
WebSocketServerConnection = None  # type: ignore[assignment,misc]
```

Justified — fallback when `websockets.ServerConnection` is not available (older websockets versions). The `# noqa: F401` on the import line handles the unused import case.

**Action:** No action needed. Documented for completeness.

---

## Finding 015 — `global` statements (29 instances across 10 files)

**Files:** `ai-signal-bot/metrics.py` (4), `ai-signal-bot/tracing.py` (4), `exchange_simulator/metrics.py` (4), `exchange_simulator/tracing.py` (4), `exchange_simulator/audit_logger.py` (5), `exchange_simulator/health.py` (1), `ai-signal-bot/src/observability/logging.py` (1), `ai-signal-bot/src/observability/tracing.py` (2), `monitoring/tests/test_alerts.py` (1)

**Severity:** Info  

All `global` statements are in singleton patterns or module-level state management. All have justification comments (`# singleton pattern, module-level state`).

**Action:** No action needed. If Findings 001-004 are resolved (dead code removal), 16 of these will be eliminated.

---

## Finding 016 — `: Any` type annotations (11 instances across 7 files)

**Files:** `real_account.py` (2), `llm_engine/engine.py` (1), `research/competition.py` (3), `research/genetic_strategy.py` (1), `utils/helpers.py` (1), `tests/mocks/mock_objects.py` (1), `monitoring/ebpf_monitor.py` (2)

**Severity:** Info  

All have inline justification comments:
- `ccxt.Exchange — ccxt has no type stubs`
- `aiohttp.ClientSession — duck-typed`
- `Market data — type depends on backtest engine`
- `Any: default may be str|int|float|bool`
- `signal API requires these params`

**Action:** No action needed.

---

## Finding 017 — `# noqa` annotations (39 instances across 12 files)

**Files:** `ai-signal-bot/run.py` (10), `exchange_simulator/__main__.py` (8), `exchange_simulator/ws_constants.py` (5), `ai-signal-bot/scripts/run_backtest.py` (3), `ai-signal-bot/tests/test_integration.py` (3), `ai-signal-bot/scripts/migrate.py` (1), `ai-signal-bot/scripts/run_bot.py` (1), `exchange_simulator/exchange_simulator/__main__.py` (1), `exchange_simulator/health.py` (4), `exchange_simulator/websocket_server.py` (1), `ai-signal-bot/src/strategies/strategies.py` (2), `monitoring/ebpf_monitor.py` (1)

**Severity:** Info  

All justified:
- `E402` — imports after `sys.path` manipulation (required for module resolution)
- `F401` — optional imports (`msgpack`, `orjson`, `shm`) that may not be installed
- `ARG001` — signal handler function signature requires unused parameters

**Action:** No action needed.

---

## Finding 018 — `pass` in production code (non-asyncio)

**Files:**
- `ai-signal-bot/src/database/db.py:34` — `except Exception: pass` (see Finding 009)
- `ai-signal-bot/src/observability/tracing.py:84-87` — `NoopSpan` stub methods (4 `pass` statements)
- `ai-signal-bot/src/observability/logging.py:161,170` — `except ImportError: pass` (optional `structlog`)

**Severity:** Low  

The `NoopSpan` and `NoopTracer` stubs are intentional fallbacks when OpenTelemetry is not installed. The `ImportError: pass` for structlog is acceptable (optional dependency).

**Action:** Finding 009 is the only actionable item here.

---

## Finding 019 — Root-level utility scripts organization

**Files:**
- `price_monitor.py` (221 lines) — standalone price/signal monitor
- `error_monitor.py` (208 lines) — standalone error log monitor
- `run_logger.py` — shared logging setup (imported by `ai-signal-bot/run.py` and `exchange_simulator/__main__.py`)

**Severity:** Low  

Standalone scripts at project root. `run_logger.py` is a shared dependency. `price_monitor.py` and `error_monitor.py` are utility scripts.

**Action:** Consider moving to `scripts/` directory for better organization. `run_logger.py` should stay accessible or be moved to a `shared/` directory.

---

## Finding 020 — `exchange_simulator/exchange_simulator/__main__.py` — thin wrapper

**File:** `exchange_simulator/exchange_simulator/__main__.py` (15 lines)  
**Severity:** Info  

Wrapper that calls root-level `__main__.py` via `runpy.run_path()`. This is a standard Python pattern for `python -m exchange_simulator` support when the actual entry point is at the package root.

**Action:** No action needed. Working as intended.

---

## Clean Patterns (0 violations)

The following patterns have **zero** violations across the entire project:

- **TODO / FIXME / HACK** — 0 matches (all previously cleaned in Sprints 10-17)
- **`import *`** — 0 matches
- **Bare `except:`** — 0 matches
- **`NotImplementedError`** — 0 matches
- **`eval()` / `exec()`** — 0 matches
- **`subprocess`** — 0 matches (no subprocess usage found)
- **`os.system`** — 1 match (Finding 023, `monitor.py`, annotated with `nosec: B605`)
- **Hardcoded credentials / API keys / passwords** — 0 matches (all use env vars or config)
- **C++ `printf` / `goto` / `delete`** — 0 matches
- **Rust `unsafe` / TODO** — 0 matches (6 `unsafe` in FFI, all justified)
- **JS `console.log`** — 6 matches in `web-ui/src/utils/performanceMonitor.js` (Finding 026)
- **JS `TODO`** — 0 matches in `web-ui/src/`
- **`assert` in production code** — 0 matches (only in test files)
- **`sleep()`** — 19 matches, all justified (`asyncio.sleep()` for async waiting, `time.sleep(0.0001)` for socket polling)
- **`deprecated`** — 0 matches
- **`hardcoded`** — 0 matches
- **`XXX`** — 2 matches, both in comments (FIX checksum format `10=XXX`, docstring placeholder `xxx`)
- **`BUG`** — 2 matches, both in test docstrings (regression test descriptions for fixed bugs)
- **`WARN`** — all matches are `logger.warning()` calls (proper logging)
- **`pickle`** — 0 matches (no unsafe deserialization)
- **`yaml.load(`** (unsafe) — 0 matches (all use `yaml.safe_load()`)
- **`shell=True`** — 0 matches

---

## Finding 021 — Redundant `Exception` in exception tuple: `feature_store.py`

**File:** `ai-signal-bot/src/ml/feature_store.py:94`  
**Severity:** Medium  

```python
except (OSError, ConnectionError, RuntimeError, Exception) as e:
```

`Exception` in the tuple makes `OSError`, `ConnectionError`, and `RuntimeError` redundant — `Exception` catches everything they would catch and more. This is likely a leftover from a previous narrowing pass where `Exception` was added as a safety net but never removed.

**Action:** Remove `Exception` from the tuple: `except (OSError, ConnectionError, RuntimeError) as e:`. If broader catching is truly needed for Redis, add `redis.exceptions.RedisError` instead.

---

## Finding 022 — f-string in logger calls (performance)

**Files:** ~80+ calls across `ai-signal-bot/src/`  
**Severity:** Low  

Extensive use of `logger.info(f"...")`, `logger.warning(f"...")`, `logger.error(f"...")`, `logger.debug(f"...")` throughout the codebase. f-strings are evaluated eagerly even when the log level is disabled (e.g., `DEBUG` messages are still formatted when only `INFO` is enabled).

**Key files affected:**
- `communication/signal_publisher.py` — 8 f-string logger calls
- `communication/fix_client.py` — 6 f-string logger calls
- `communication/ws_client.py` — 5 f-string logger calls
- `data_collection/real_account.py` — 12 f-string logger calls
- `data_collection/real_market_data.py` — 3 f-string logger calls
- `backtesting/optimizer.py` — 5 f-string logger calls
- `backtesting/plotter.py` — 4 f-string logger calls
- `monitoring/alerting.py` — 2 f-string logger calls
- `notification/notifier.py` — 2 f-string logger calls
- Plus ~30+ more across other files

**Action:** Replace `logger.info(f"msg {var}")` with `logger.info("msg %s", var)` for lazy evaluation. Low priority — only impacts performance when log levels are disabled and message volume is high.

---

## Finding 023 — `os.system` in production: `monitor.py`

**File:** `ai-signal-bot/monitor.py:21`  
**Severity:** Low  

```python
os.system("cls" if os.name == "nt" else "clear")  # nosec: B605
```

Uses `os.system` for terminal screen clearing. While `nosec: B605` is annotated (acknowledged security lint suppression), `subprocess.run` with `shell=True` is the recommended alternative.

**Action:** Replace with `subprocess.run("cls" if os.name == "nt" else "clear", shell=True)`. Low priority — monitor scripts are not production-critical.

---

## Finding 024 — `0.0.0.0` bind addresses in production (7 instances)

**Files:**
- `ai-signal-bot/run.py:77` — `SignalPublisher(host="0.0.0.0", port=8766)`
- `ai-signal-bot/src/communication/signal_publisher.py:58` — default `host="0.0.0.0"`
- `ai-signal-bot/src/communication/health_check.py:116` — `web.TCPSite(self._runner, "0.0.0.0", self.port)`
- `ai-signal-bot/src/communication/metrics_server.py:91` — default `host="0.0.0.0"`
- `ai-signal-bot/src/monitoring/health_server.py:24` — default `host="0.0.0.0"`
- `ai-signal-bot/src/monitoring/metrics.py:211` — default `host="0.0.0.0"`
- `exchange_simulator/health.py:126` — `uvicorn.run(app, host="0.0.0.0", port=8775)`

**Severity:** Info (all annotated with `# nosec: B104`)  

All 7 instances bind to `0.0.0.0` (all interfaces) with `nosec: B104` annotations. This is standard for containerized deployments (Docker/K8s) where binding to `0.0.0.0` is required for port forwarding. However, for non-containerized local development, this exposes services to the network.

**Action:** Make bind address configurable via config file or environment variable. Default to `127.0.0.1` for local dev, `0.0.0.0` for Docker. The `exchange_simulator/health.py:126` instance lacks a `# nosec` annotation — add one or make configurable.

---

## Finding 025 — `open()` without `encoding=` parameter (7 instances)

**Files:**
- `ai-signal-bot/src/communication/fix_client.py:151` — `open(self.seq_file)` (read)
- `ai-signal-bot/src/communication/fix_client.py:161` — `open(self.seq_file, 'w')` (write)
- `ai-signal-bot/src/llm_engine/engine.py:104` — `open(path)` (read prompt template)
- `ai-signal-bot/src/ml/automl.py:183` — `open(path, "w")` (write JSON)
- `ai-signal-bot/src/ml/model_registry.py:95` — `open(self.index_path)` (read JSON)
- `ai-signal-bot/src/ml/model_registry.py:119` — `open(self.index_path, "w")` (write JSON)
- `ai-signal-bot/src/strategies/marketplace.py:71` — `open(self.registry_path)` (read JSON)
- `ai-signal-bot/src/strategies/marketplace.py:92` — `open(self.registry_path, "w")` (write JSON)

**Severity:** Low

On Windows, `open()` without `encoding=` uses the system default encoding (cp1252 on Western Windows, cp1251 on Russian Windows). This can cause `UnicodeDecodeError` when reading files with UTF-8 content (e.g., JSON with non-ASCII strings, prompt templates with special characters).

**Action:** Add `encoding="utf-8"` to all 7 `open()` calls. The `tracker.py` and `helpers.py` files already use `encoding="utf-8"` correctly — these 7 calls were missed.

---

## Finding 026 — `console.log` in `web-ui/src/utils/performanceMonitor.js` (6 calls)

**File:** `web-ui/src/utils/performanceMonitor.js`
**Lines:** 178, 190, 202, 214, 226, 229
**Severity:** Low

Six `console.log` calls in the performance monitoring utility. These are intentional diagnostic logs for Core Web Vitals (LCP, FID, CLS, TTFB, FCP). While acceptable in development, they should be gated behind a `DEBUG` flag or removed for production builds.

**Action:** Wrap in `if (import.meta.env.DEV)` or replace with a conditional debug logger.

---

## Recommended Action Priority

1. **Remove dead code** (Findings 001, 002) — `tracing.py` files at root level (398 lines total)
2. **Investigate metrics.py files** (Findings 003, 004) — verify no production usage, then remove (543 lines)
3. **Fix `db.py` silent exception** (Finding 009) — narrow + log warning
4. **Fix redundant `Exception` in tuple** (Finding 021) — `feature_store.py` — remove `Exception` from tuple
5. **Narrow `except Exception` catches** (Findings 007, 008, 010, 011, 012) — 15 catches total
6. **Consolidate duplicate scripts** (Findings 005, 006) — decide canonical location
7. **Make hardcoded URLs configurable** (Finding 013) — use env vars or config
8. **Replace f-string logging with lazy `%s`** (Finding 022) — ~80+ calls across `src/`
9. **Replace `os.system` with `subprocess`** (Finding 023) — `monitor.py` screen clear
10. **Add `encoding="utf-8"` to `open()` calls** (Finding 025) — 7 calls in fix_client, llm_engine, ml, strategies
11. **Gate `console.log` in performanceMonitor.js** (Finding 026) — wrap in `import.meta.env.DEV`
12. **Organize root-level scripts** (Finding 019) — move to `scripts/`


---

# ROUND 4 � WIRE-TO-LIVE (2026-09-12)

Direction (user-approved): \ake features are worse than missing features\ � replace mock UI data with real WebSocket streams wherever the payload exists.

## Finding 027 � S035: ~70 math panels dead via nested candle access

**Files:** \web-ui/src/components/*.jsx\ (71 files)
**Severity:** Critical

\useExchangeData\ produces a flat candle array \[{exchange, symbol, timestamp, open, high, low, close, volume}]\; the registry passes it through unchanged. ~70 math panels indexed it as \candles[exchange][symbol]\ > always \undefined\ > panels rendered a permanent empty state. Real math, never executed � worse than fake: dead code posing as live.

**Fix:** new \web-ui/src/utils/candles.js\ (\selectCandles\/\groupCandles\ handle flat arrays); 61 files auto-migrated, 10 multi-symbol files hand-migrated (BlackLitterman, CopulaModel, EmpiricalDynamicModeling, GraphTheoryNetwork, KellyCriterion, PrincipalComponentAnalysis, RandomMatrixTheory, TensorDecomposition, TransferEntropy, WassersteinBarycenters). Grep confirms zero remaining nested accesses.

## Finding 028 � S036: format.ts lost exports during TS migration

**File:** \web-ui/src/utils/format.ts\
**Severity:** High

\colorForSide\, \gColorForSide\, \ormatPct\ are imported by 5 components (BotStatus, TradeHistory, SignalFeed, FillsPanel, PositionsPanel) and asserted by \utils.test.js\, but were absent from format.ts � production build failed with MISSING_EXPORT. **Fixed:** all three re-exported with the behavior the tests pin down.

## Finding 029 � S037: App.test.jsx never ran

**File:** \web-ui/src/test/App.test.jsx\
**Severity:** Medium

Wrong relative paths (\./App\, \./hooks/*\), stale \useUIStore\ mock field names, \useTradingStore\ mock ignoring selector form. The only smoke test for the App shell was dead. **Fixed:** paths + mocks now match current store signatures; test mounts the real App.

## Finding 030 � S001�S003 partial: 13 panels rewired to live streams

Top mock offenders now consume real data with honest empty states:

| Panel | Live source |
|-------|-------------|
| FillAnalytics, TCA, SlippageAnalytics | \ills\ (orders WS) |
| SignalTracker | \signals\ + \prices\ |
| ArbScanner | \rbitrage_scan\ |
| Inventory | \ccounts\ + \prices\ |
| WalkForwardViewer | \acktest_result\ |
| Microstructure, OrderBook | \orderbooks\ |
| CrossAssetMatrix | \candles\ (Pearson corr on last 60 closes) |
| DataQuality | \candles\ (real gap/staleness/OHLC checks) |
| StrategyCorrelation | \signals\ (directional agreement matrix) |
| LatencyPanel | WS RTT samples (client-accumulated history) |

Registry: ~20 panel entries changed from \props: () => ({})\ to real context props. 12 test files rewritten to assert real wire shapes instead of mock content.

## Finding 031 � S038: pre-existing failing tests (not from this round)

\ormat.test.js\ expects \ormatUsd(-500) === '- \.00'\ while \utils.test.js\ expects \'-\.00'\ � contradictory specs. \patterns.test.js\ (2: HAMMER/SHOOTING_STAR undetected), \uditExport\ (2: blob asserts), \performanceMonitor\ (2: customMetrics object vs scalar), \lertWebhook\ (1: label). Left open for a future round.

## Round 4 verification

- \ite build\: green (was broken before S036 fix)
- \itest run\: 986 passed / 8 failed (all 8 = Finding 031 pre-existing)
- \pytest tests/unit/test_real_market_data.py\: 22/22 (incl. new malformed-JSON resilience test)


## Round 5 — wire-to-live batch 2 + S038 test repairs

### Panels rewired (S001–S003 continued)

| Panel | Real source |
|-------|-------------|
| DashboardProfiler | Web Vitals via performanceMonitor + per-panel React `<Profiler>` timings recorded in PanelContainer |
| RegimeDetector | live `market_regime` broadcast (FFT classifier: TRENDING/RANGING/MIXED) + real candle statistics (vol, slope, skew, kurtosis, autocorr) |
| RealtimeAttribution | realized PnL from `accounts[*].trade_history` — by symbol, by close reason, cumulative curve |

### Finding 039 — patterns.ts: HAMMER/SHOOTING_STAR never fired

Condition `upperWick < body * 0.5` / `lowerWick < body * 0.5` rejected textbook candles (wick == body). Detector was dead on real data. Fixed to `<= body * 2` (canonical 2:1 wick:body). **High**

### Finding 040 — initPerformanceMonitoring was dead code + FID gone

The web-vitals instrumentation module existed but was never imported/called anywhere. Additionally `onFID` no longer exists in web-vitals v6 (installed) — the import would have failed had anyone called it. Fixed: FID→INP (v6 API, 200ms budget), DashboardProfiler initializes monitoring, PanelContainer wraps every panel in `<Profiler>`. **High**

### Finding 031 (S038) — all 7 fixed

- `format.test.js` — aligned to impl+utils.test (`-$500.00`)
- `patterns.test.js` — revealed Finding 039 real bug (fixed impl, not test)
- `auditExport.test.js` — removed broken `vi.fn(()=>({}))` Blob mock (not a constructor); happy-dom provides real Blob
- `performanceMonitor.test.js` — wrong export name, FID→INP, customMetrics object shape
- `alertWebhook.test.jsx` — new webhooks start enabled; test asserted wrong initial label

### Mechanical (S026/S029/S034)

- S026: `JSON.parse(JSON.stringify())` → `structuredClone()` in useSessionRecorder
- S029: all 15 `toBeTruthy()` → specific asserts (length>0 / not.toBeNull / toBeInTheDocument)
- S034: `assert True` → `assert client.connected`; `== True` → `is True` ×2
- S012/S022 closed as N/A — prints/console.log were docstring examples, not executed code

## Round 5 verification

- `vitest run`: **995/995 green** (was 986/8 after round 4)
- `pytest test_portfolio.py + test_real_market_data.py`: 44/44
- `vite build`: green

## Round 6 — wire-to-live batch 3 + S041 contract bug

### Panels rewired (S001–S003 continued)

| Panel | Real source |
|-------|-------------|
| AuditTrail | `fills` + `signals` → ORDER_FILL / SIGNAL entries, source filter |
| BlackSwanTester | candle returns → VaR95/99, ES, max drawdown, skew, kurtosis; sigma-scaled shock scenarios vs real gross exposure |
| FuturesBasis | `fundingRates` → real funding APR (rate × 3 × 365); `prices` → cross-exchange basis rows |
| OptionsChain | realized vol from candles → Black-Scholes theoretical chain (explicitly disclosed — no options feed exists) |
| TickReplay | `fills` reversed to chronological order → tick-by-tick replay |
| VolSurface | realized-vol grid (exchange × window) + vol cone — fabricated IV grid removed |

All six registry entries now pass live ctx props. Their tests were rewritten: old specs asserted deleted MOCK_* strings; new specs assert empty states and computed values from real-shaped fixtures.

### Finding 041 — Account.positions treated as a map (list in reality)

`Account.positions` is a **list** of `Position` objects `{symbol, exchange, side, quantity, entry_price, ...}`. `Object.entries(acc.positions)` yields `[arrayIndex, pos]` pairs — the "symbol" became `'0'`, `'1'`… Silently wrong exposure math in `BlackSwanTester.jsx:57` (fixed) and `CostBasis.jsx` (fixed round 5). `Object.keys`/`Object.values` on the same array work incidentally but need contract review. **High**

### Verification

- `vitest run`: **996/996 green** across 116 files
- `vite build`: green
- `pytest test_portfolio.py + test_vae.py`: 64/64

### Also committed

- refactor: `range(len())` → `zip`/`enumerate`/`np.arange` in rkhs, free_energy, emd, hmc, plotter (S005 partial)
- test: exact-value asserts in test_portfolio, init-bound tests in test_vae (S034 continued)

## Round 6 addendum — S042: failing tests caught real bugs

Two pre-existing test failures turned out to be **real defects**, not stale tests:

- **`hmc.py::grad_log_posterior`** — claimed analytical GARCH(1,1) gradient but was
  inconsistent with `log_posterior` in three ways: (1) no prior gradient
  (-10ω, -5α, -5β missing entirely), (2) different variance recursion —
  prev-return `r²[t-1]` vs objective's current-return `r²[t]`,
  (3) wrong seed derivatives: h₋₁ = ω/(1−α−β) has ∂/∂ω = 1/(1−α−β),
  ∂/∂α = ∂/∂β = ω/(1−α−β)² — code seeded [1.0, r²[0], h[0]].
  Rewritten to differentiate the actual objective. Finite-diff test now passes.
- **`emd.py::sift`** — maxima/minima are interior-only, so the cubic-spline
  envelopes *extrapolated* at indices 0 and n−1 and diverged over 50 sift
  iterations (IMF mean −13.5 on a ±2.5 signal). Fixed with endpoint-anchored
  knots (index 0 and n−1 pinned to h[0]/h[-1]) — standard EMD endpoint handling.
  `test_imf_has_zero_mean` now passes.

Verification: `pytest tests/test_emd.py tests/test_hmc.py tests/test_rkhs.py tests/test_free_energy.py` — **138/138 green** (was 136/138).

### S043 — deque slicing → TypeError (8 failing tests, one root cause)

`_order_history` was changed to `deque(maxlen=10000)` (`exchange.py:60`) but
`get_order_history` still sliced it (`self._order_history[-limit:]`).
`collections.deque` has no `__getitem__` slice support → `TypeError` on every
call. Same bug in `arbitrage.py:256` (`_closed_history`). Downstream victims:
`data_export.py` (export summary/orders), arbitrage integration. Fixed with
`islice` tail (no full-deque copy) in exchange.py and `list()` wrap in
arbitrage.py. `market_simulator.py` `[-n:]` sites are plain lists — clean.
**88/88 green** across the 5 previously-failing test files.

## Round 7 — audit branch: C++/Rust hft layer (first deep pass)

Rotation target: hft-trade-bot (C++20) + hft-executor (Rust) — до этого были только поверхностные grep'ы (catch/unwrap/unsafe в ЧИСТО). Полный проход по data flow.

### New findings S050–S057

**S054 (Critical) — фантомные позиции.** `bot_loop.cpp` вызывает `pos_mgr.open_position()` безусловно после попытки отправки — `process_ai_signals:65`, `execute_v2_order:170`, `run_v1_fallback_loop:225`. При `executor->is_connected() == false` ордер не уходит, позиция открывается локально. Дальше SL/TP честно "закрывает" позиции, которых на бирже никогда не было — расхождение состояний молчит.

**S050 — мёртвый Rust-крейт.** `hft-executor` (584 строки lib.rs + Cargo.toml + тесты + CI jobs + dependabot) — заявлен как "FFI callable from C++", но ни один C++ файл его не линкует и не вызывает. C++ бот использует собственный websocketpp `OrderExecutor`. CI компилирует и тестирует артефакт, который ничто не потребляет.

**S051 — SmartOrderRouterV2 не роутит.** Создаётся в `bot_setup.cpp:157`, регистрирует 6 адаптеров (real+sim), `smart_router_enabled` честно логируется при старте — и `route()` не вызывается ни разу вне тестов. Все ордера идут через `ctx.executor` в единственный `default_exchange`.

**S052 — src/fix/ мёртв.** 979 строк FIX-протокола (message/encoder/decoder/session). Конфиг `fix.enabled` парсится и логируется — сессия никогда не создаётся. Живёт только в собственных тестах.

**S053 — mapped_persistence.h мёртв.** 371 строка, ноль ссылок вне файла.

**S055 — Rust submit() врёт про доставку.** `orders_sent` инкрементится на push в unbounded channel, не на WS send. Аутаж → очередь растёт без борьбы → реконнект → пачка устаревших ордеров улетает разом. `avg_latency_ns` берёт `last_order_ts` (последний отправленный, не тот что филлился). `is_fill_message` не сверяет order id.

**S056 — арбитраж без хеджа.** `execute_arbitrage`: BUY ушёл, SELL упал → голая нога, только error-лог.

**S057 — половинчатый фикс.** v1 fallback loop генерит тот же синтетический 10-уровневый стакан, что v2 — но без warn, который добавили в `prepare_order_book` (round AH).

### ЧИСТО (C++/Rust)

- Все 10 `catch(std::exception)` логируют — молчания нет
- `unwrap()/expect()/panic!` в Rust src — 0 (все 15 в `#[cfg(test)]`)
- `unsafe` — только FFI boundary
- `fpga_orderbook.vhd` — честный дисклеймер "ACADEMIC SKETCH", не притворяется продакшеном
- `monitor.py` — реальный tail лога

## Round 8 — audit branch: infra (Docker / compose / nginx / CI)

Rotation target: infra. Verified every healthcheck/scrape/deploy path against code.

### New findings S066–S073

**S066 — nightly-backtest is deterministic theater.** Generates 525,600 candles of `random.gauss` noise with `random.seed(42)` — identical data every single night. The "regression check" prints `::warning::` and never exits non-zero → `if: failure()` issue-creation step is unreachable. A nightly regression gate on data that cannot regress, with a check that cannot fail.

**S067 — deploy health check hits the wrong port.** `deploy.yml` checks `DEPLOY_HOST:9090/health`, but prod compose maps ai-signal-bot as `9092:9090`. Every tag deploy fails its own health gate. Also: `VITE_WS_*` defaults `ws://localhost:*` are baked into the bundle at build time — without `.env.prod` overrides the prod UI connects to the viewer's own machine.

**S068 — Grafana prod provisions zero dashboards.** Dashboards mounted to `/etc/grafana/dashboards`, but the provider config (`dashboards.yml`, inside that same dir) is only scanned under `/etc/grafana/provisioning/`. Home dashboard path points at an unprovisioned JSON → 404 home. Dev works (mounts into provisioning).

**S069 — hft-trade-bot `/metrics` is JSON, not Prometheus.** `health_server.h:134` returns `format_json()`; prometheus.yml scrapes it as exposition format → parse error every 15s forever. Dead target.

**S070 — CI gates that cannot fail.** test-js/test-windows: `set +e` + grep `Tests N failed` — a vitest crash before summary print = green. security-bandit: `|| true` + `::warning`, counts ALL results regardless of severity. test-count: floors on test-FILE count — vanity metric.

**S071 — .pre-commit-config.yaml is dead config.** Framework config (ruff/eslint/pre-commit-hooks) exists but `pre-commit install` is never invoked; installed hooks are custom batch scripts that git can't spawn. Only manual `scripts/pre-commit-check.py --staged` actually runs.

**S072 — nginx cargo-cult headers.** HSTS on plain HTTP (ignored by browsers), deprecated X-XSS-Protection, no TLS termination at all.

**S073 — dev compose `latest` tags** for prometheus/grafana (prod pins versions).

### ЧИСТО (infra)

- `.env.prod` gitignored; all compose secrets are `${VAR:?}` required — no hardcoded passwords
- prod: postgres/redis via `expose`, not `ports`
- All 4 prod Dockerfiles: multi-stage, non-root, pinned bases
- All compose healthcheck endpoints verified against real code (/health exists on 8775/9090/9091/3000)
- `release.yml`/`deploy.yml` — legit, secrets via secrets.*

## Round 9 — audit branch: docs-vs-reality + dead code

Rotation target: docs-vs-reality + dead code. Verified README/docs claims against actual code paths.

### New findings S074–S077

**S074 — REST_API.md documents ~15 endpoints that were never built.** Exchange sim: `/symbols`, `/orderbook/{s}`, `POST /orders`, `GET/DELETE /orders/{id}`, `/account`, `/trades`, `/candles/{s}` — the actual server registers only `/health` `/live` `/ready` `/metrics` (websocket_server.py:204-207). AI bot: `/strategies`, `/signals`, `POST /strategies/{id}/toggle`, `/backtest` — actual routes are `/health*` `/ready` `/live` `/metrics` (health_server.py:124-129, metrics.py:355-356). HFT bot: `/performance`, `/positions`, `POST /kill_switch` — actual: `/health` `/metrics` only (health_server.h:123-125). The doc even ships a rate-limit table for phantom endpoints. A spec for an API nobody implemented.

**S075 — README's headline architecture is phantom.** The diagram claims `C++ Bot → [FFI 1us] → Rust → [WS 0.5ms] → Exchange` — the Rust executor is dead code (S058): zero C++ callers, not linked in CMake. The latency budget's FFI hop doesn't exist. Feature bullets advertise "FIX 4.4 protocol" (S060 dead module), "Memory-mapped persistence" (S061 dead file), "Smart Order Router: 5 strategies" (S059 — route() never called). The README describes a different system than the one that runs.

**S076 — README numbers are wrong: prod ports, "13 strategies", "8-stage pipeline".** Prod table claims AI-bot `:8080` health (prod compose doesn't publish it) and Prometheus `:9099` (prod exposes 9090 internally only). "13 strategies" — `build_strategies` (bot_helpers.py:39-58) instantiates at most 6 + StatArb; `CrossExchangeArbEngine` (cross_exchange_arb.py:93), `FundingRateArbitrageDetector` (funding_arb_detector.py:74) and `StrategyMarketplace` (marketplace.py:54) have zero non-test callers and aren't exported via `__init__.py`. "8-stage pipeline" — no pipeline module exists; run.py is an informal loop.

**S077 — Dead-code islands in exchange_simulator: 1120 lines.** `price_feed_apis.py` (416) + `price_feed_manager.py` (329) + `price_feed_models.py` (208): a "multi-API real-time price feed" subsystem with failover and rate limiting — imported only by each other and 4 own test files; zero production callers. `health.py` (167): self-declared deprecated FastAPI module ("not used in production… will be removed") kept alive by test_health.py — tests for dead code. Irony: the only subsystem capable of pulling real prices is dead while the simulator synthesizes GBM.

### ЧИСТО (docs-vs-reality, dead code)

- README counts verified exact: 278 registry panels, 289 components, 116 vitest files
- EnsembleVoter, CircuitBreaker, StatArb are actually wired (run.py / signal_publisher.py)
- `visualizer.py` live via `__main__.py --no-visualizer`
- All 18 unregistered web-ui components are App.jsx chrome, not orphans; AuditLogViewer is registered
- `health_server.py` :8080 is real (aiohttp, started in run.py)
- helm templates exist with real httpGet probes

## Round 10 — audit branch: ai-signal-bot deep subdirs + repo periphery

Rotation target: un-audited ai-signal-bot subdirs (communication/networking/notification/llm_engine) + repo-root periphery (helm/deploy-helm/terraform/audit/hft-skills).

### New findings S078–S080

**S078 — ~1000 more dead lines: fix_client + notifier + socket_transport.** `communication/fix_client.py` (459) is a full FIX 4.4 client — logon/logout, heartbeat, resend requests, execution reports — imported ONLY by `test_fix_client.py`. `notification/notifier.py` (384) referenced only by dead `funding_arb_detector` (S076) + own test. `networking/socket_transport.py` (164) referenced only by own test — even fix_client doesn't use it. The project's FIX story is dead on BOTH sides: C++ `src/fix/` (S060) and Python `fix_client.py` — nothing calls either.

**S079 — Two divergent helm charts.** `helm/` and `deploy/helm/` both exist with different template sets (root has ingress.yaml + network-policy.yaml; deploy/ has jaeger.yaml + namespace.yaml). DEPLOYMENT.md points at root `./helm`. No workflow/script references either — two silent-forking sources of truth.

**S080 — Repo cargo: audit/ (320K) + hft-skills/ (20MB).** `audit/` holds stale August mega-audit artifacts next to the live `.cascade/` system. `hft-skills/` is a 20MB skills-content library with zero code references.

### ЧИСТО (ai-signal-bot periphery)

- `llm_engine/engine.py` — REAL: OpenAI/Anthropic via aiohttp, rate-limit, LRU cache, rule-based fallback; wired in run.py:116/148
- shm_* producers/consumers + ws_client + signal_publisher — live in run.py
- terraform/ — real .tf modules, documented in DEPLOYMENT.md

## Round 11 — audit branch: exchange_simulator core (matching/liquidation/orders)

Rotation target: exchange internals — order submission, liquidation, advanced orders, package structure. Empirically verified two accounting bugs by running the sim.

### New findings S081–S085

**S081 — Opposite-side order larger than the position silently drops the residual (VERIFIED).** `_update_position` → `_close_position` closes `min(order.qty, pos.qty)` and returns. Live repro: BUY 1 BTC then SELL 3 BTC → `positions: 0` — fee charged on all 3 BTC ($79.44), PnL booked for 1, the 2-BTC short never opens. Money evaporates with no log. `exchange_order_submission.py:344-391`.

**S082 — Margin is never reserved; effective leverage is unbounded (VERIFIED).** `_check_margin_and_size` checks `notional/lev + fee > balance` but balance is never debited on open — only the fee. Every subsequent position is checked against the same un-reserved balance. Live repro: $10k balance, lev=10 → opened $200k notional across 5 symbols (real leverage 20x on a 10x cap); balance dropped by fees only. `exchange_order_submission.py:282-297`.

**S083 — OCO orders are dead code.** `submit_order(oco_group_id=...)` accepts the param, `OCOGroup` model + `on_fill` cancel logic exist (`models.py:247`), `_oco_groups` dict is created (`exchange.py:71`) — but `add_order`/`on_fill` are never called. An order carrying oco_group_id processes as a normal order; the group never forms. README advertises OCO.

**S084 — Nested `exchange_simulator/exchange_simulator/` package + sys.path surgery.** Outer `__init__.py` mutates `sys.path` (adds both dirs), imports nested modules by SHORT name via importlib, then aliases `sys.modules["exchange_simulator.X"]`. Each module has 2-3 import identities; an `ImportError` inside any module is swallowed to `logger.debug` — the module silently vanishes from the namespace.

**S085 — SL/TP/liquidation path forces REJECTED → FILLED and mislabels someone else's trade.** `_close_triggered_position` (`exchange_liquidation.py:95-104`): when `mid_price==0` the close order comes back REJECTED; the code unconditionally sets `order.status = FILLED` and then writes `trade_history[-1].reason = reason` — but the rejection appended no trade, so it retags the LAST UNRELATED trade as LIQUIDATION/STOP_LOSS. Position stays open (retries every tick), history is poisoned.

### ЧИСТО (exchange core)

- NaN/≤0/oversize quantity correctly rejected; limit orders go PENDING when price doesn't cross
- Partial-liquidation PnL math correct; insurance-fund deficit cover works; liq prices canonical `entry*(1∓1/lev±mmr)`
- Default SL/TP (2%/4%) applied on every new position — intended sim behavior, honestly auto-armed

## Round 12 — audit branch: nested exchange_simulator package internals

Rotation target: the inner `exchange_simulator/exchange_simulator/` package (~2300 lines) — checked which modules are actually consumed vs test-only islands.

### New findings S086–S087

**S086 — Six dead modules in the inner package (1240 lines).** Each lives only for its own test file: `liquidation_engine_v2.py` (306 — an "enhanced" engine with cascade liquidations + ADL + insurance-fund tracking; production runs the simpler `exchange_liquidation` mixin instead, and V2 defines its own duplicate `Position` model), `funding_rate.py` (136 — dead duplicate; real funding flows from `market_simulator.get_funding_rates` → `charge_funding` → broadcast), `order_book_realism.py` (307 — spoofing/iceberg/adverse-selection engine; real books come from `market_simulator.generate_order_book`), `market_microstructure.py` (175), `latency_simulation.py` (129), `spread_analytics.py` (187). Tested but dead — the tests create the illusion these subsystems run.

**S087 — `options_chain` WS endpoint exists but is never consumed.** `ws_message_handler.py:402-435` serves a full BS chain with Greeks via `OptionsSimulator` on request; the web-ui `OptionsChain.jsx` computes BS client-side off realized vol instead. A real feed nobody subscribes to — wire it under the "real API" direction.

### ЧИСТО (inner package)

- `arbitrage`, `data_export`, `config_validator`, `options_simulator` — live (wired in `__main__`/`ws_message_handler`)
- Funding pipeline is live end-to-end: market_simulator → charge_funding → broadcast → UI `fundingRates`

## Round 13 — audit branch: hft-trade-bot remaining headers (engines/risk/ipc/metrics)

Rotation target: every header in hft-trade-bot not yet audited — verified each against core/ wiring.

### New finding S088

**S088 — ~3300 more dead lines: hft header archipelago.** Alive only via doctest files, zero references from core/: `position_manager_v2.h` (347 — prod uses `position_manager.h`), `order_manager.h` (378), `latency_tracker.h` (252), `order_type_selector.h` (38), `portfolio_risk.h` (261), `pre_trade_risk.h` (220 — prod uses `risk_manager.h`), four `*_v2.h` strategy headers (market_making 176, mean_reversion 300, momentum_breakout 203, statistical_arb 251), `shm_heartbeat.h` (271 — the SHM heartbeat is never written; its Python counterpart lives only inside dead fix_client.py), `metrics_collector.*` (347), `tracer.*` (290). A second dead layer on top of S058–S061 — combined dead C++ ≈ 5700 lines.

### ЧИСТО (hft wiring)

- `signal_engine_v3.h` OnlineHMM is REAL math — log-space forward recursion with log-sum-exp, Gaussian emissions, online parameter adaptation; opt-in via `signal_engine_v3_enabled`, v2 fallback
- Live in core/: adaptive_selector, risk_mgr, kill_switch (SHM trigger + cancel/close/notify callbacks), shm_fill_producer, shm_market_data, shm_signal_consumer, signal_receiver, SystemMonitor

## Round 14 — audit branch: web-ui data layer (hooks/services/mock plumbing)

Rotation target: the live-data plumbing itself — useExchangeData/useSignalData, mock layer, utility engines, secondary hooks.

### New findings S089–S091

**S089 — Two backtest engines; the panel runs the client one while the server API sits unused.** `StrategyBacktest.jsx` runs `utils/backtestEngine.js` (421 lines of JS) on client candles. The server accepts `run_backtest`/`compare_backtests` over the signals WS (`signal_publisher.py:187-191,310`) with real strategy objects — never called by this panel. Two implementations, divergent results on identical data; the server path is only consumed via WalkForwardViewer's push channel.

**S090 — `useStrategyMarketplace` is localStorage-only.** The "marketplace" panel is JSON import/export of hardcoded `DEFAULT_STRATEGIES` (`useStrategyMarketplace.ts:110-125`). The server-side `StrategyMarketplace` (marketplace.py, dead per S076) was the intended backend and is never connected. Name advertises a marketplace; implementation is a file exchanger.

**S091 — App.jsx mounts real + mock hooks unconditionally.** Both `useExchangeData()` and `useMockExchangeData()` run always (App.jsx:89-93): in real mode the mock timers tick pointlessly; in mock mode the real WebSocket still connects to :8765/:8766 and spams reconnect logs.

### ЧИСТО (web-ui data layer)

- `useExchangeData` — real and thorough: candle dedup map, orderbook delta application, fills/funding/news/regime/circuit-breaker all consumed from real messages
- Mock mode honestly gated (`VITE_MOCK_MODE`/localStorage), declared in README
- `useTradeJournal` (CSV export), `useSessionRecorder` (localStorage) — real local features

## Round 15 — audit branch: ai-signal-bot internals (backtesting/risk/portfolio/ml)

Rotation target: the remaining Python core — backtesting, risk, portfolio, ml, pricing, signal_validation.

### New findings S092–S093

**S092 — The entire `src/ml/` package is dead: 2848 lines, 10 modules.** autoencoder (375), automl (219), environment (163), feature_store (220), model_registry (310), price_predictor (385), rkhs (241), rl_trader (408), svm_signal (181), vae (346) — imported ONLY by their own test files (10+ test files testing dead code). `ml/__init__.py` is empty. The wired `MLEnsembleStrategy` uses `strategies/ml_features.py` + sklearn directly — nothing from `src/ml/`. README's "models not trained" disclaimer understates it: the package isn't merely untrained — nothing calls it.

**S093 — `backtesting/order_book_replay.py` dead (262 lines).** `OrderBookBacktester`/`OrderBookReplay`/`ReplayOrderBook` re-exported in `__init__.py` but zero callers. Rest of backtesting/ is live via run.py/run_backtest.py/nightly.

### ЧИСТО (ai-signal-bot internals)

- risk/ modules live through backtester + signal_publisher (VaR/CVaR/Kelly/stress/position_sizing/risk_manager all imported)
- Live loop does its own position sizing (run.py:299-306) + SignalValidator checks — honest architecture, no fake risk gate
- backtester/optimizer/walk_forward/plotter/backtest_engine/pnl_calculator/comparison all reachable

## Round 16 — audit branch: advanced orders + quant-model library wiring

Rotation target: advanced-order trigger path (stop-limit/trailing/iceberg) + technical_analysis + research module consumption.

### New findings S094–S095

**S094 — Advanced orders register but NEVER fire.** `check_advanced_orders()` (exchange_advanced_orders.py:14) has zero callers — not the WS loop, not `__main__`, not even tests. Stop-limit, trailing-stop and iceberg orders land in `_pending_*` dicts as PENDING and hang there forever: the API accepts them, reports PENDING, and they silently never execute. Combined with S083 (OCO fully dead): the entire advertised "advanced order types" surface is decorative — 4/4 types don't work end-to-end.

**S095 — The "52 quant models" library feeds nothing: ~11.5k dead lines.** `src/research/` — all 34 modules (7578 lines: koopman, malliavin, pontryagin, rmt, transfer_entropy…) have zero non-test callers. `src/technical_analysis/` — 20 of 25 modules dead (bayesian_*, copula, garch, kalman, wavelet…); only `indicators`, `fft_analysis`, `hawkes_funcs`, `hawkes_model` are wired into strategies. The actual trading loop uses EMA/RSI/ADX/FFT. ~118 test files test this dead code — the biggest test-to-nowhere ratio in the repo. README's "52 quant models in trading logic" is false.

### ЧИСТО

- `check_stop_loss_take_profit` is called from main-loop + ws_broadcast — the SL/TP path is live
- indicators/fft/hawkes are the only wired TA modules — the ones actually used are real
- `_execute_limit_order`/`_execute_trailing`/`_execute_iceberg` are implemented — unreachable, not stubbed

## Round 17 — audit branch: hft exchange adapters + market_data layer + config consistency

Rotation target: hft exchange adapters, market_data/strategy headers, ws_prometheus, audit_logger, cross-component config consistency, grafana JSON validity.

### New finding S096

**S096 — hft market_data layer is dead + ~1000 more header lines.** `candle_aggregator.h` (145), `order_book_manager.h` (281), `trade_handler.h` (212) live only in doctests — real data arrives via `shm_market_data`/`signal_receiver` straight into bot_loop, bypassing the whole market_data/ directory. Plus `simd_indicators.h` (227), `symbol_map.h` (129). Total dead C++ now ≈ 6700 lines (S058–S061 + S088 + S096). NOTE: `obi_utils`/`inline_indicators` are LIVE (used by signal_engine_v2.h).

### ЧИСТО

- Config consistency verified: 49 symbols identical across shared_config / exchange config / ai-bot settings / hft config (README "50" is a trivial off-by-one)
- All 5 grafana dashboard JSONs parse
- `ws_prometheus.py` emits real exposition format (contrast: hft /metrics JSON — S069)
- `exchange_factory` + `real_account` are real ccxt adapters, wired in run.py:342 for live mode
- C++ real exchange adapters ARE constructed when `is_production && smart_router_enabled` — but route() never called (S059)

## Round 18 — audit branch: market_simulator internals + ws_broadcast

Rotation target: GBM/news/funding core, orderbook broadcast, arbitrage auto-execution, hybrid-mode flag.

### New findings S097–S098

**S097 — `hybrid_mode: true` in config.yaml is silently ignored.** `exchange_simulator/config.yaml:332` advertises "real prices + simulated microstructure", but `__main__.py:55` constructs `MarketSimulator` without `hybrid_mode`/`price_feed_manager` — default False. The flag lies: the real-price path is unreachable even when configured on. Extends S077 — the price_feed_* island is unreachable even when its own switch is flipped.

**S098 — `_execute_arbitrage` never checks leg rejections.** `ws_broadcast.py:306-330`: buy/sell orders are submitted, the opportunity is closed as "AUTO_EXECUTED" and profit is logged + written to trade_csv BEFORE any status check (statuses only gate the fill broadcast at :342). With S081/S082 accounting bugs both legs can be REJECTED and the arb still logs as executed. Plus dead serialization at :345-348 — `orjson.dumps`/`json.dumps` results discarded.

### ЧИСТО

- market_simulator GBM core is real: shared+idiosyncratic correlated shocks, news events, weekend mode, honest wick/volume synthesis
- funding `rng.gauss(0,0.0002)` per exchange — deliberate sim design, live pipeline to UI

## Round 19 — FIX branch: sim accounting criticals (S081, S082, S085, S098)

All four exchange_simulator findings fixed and runtime-verified. 621 sim tests pass.

- **S081**: `_close_position` now opens `_open_residual_position` for the overshoot — residual gets entry=filled_price, default SL/TP, its share of order margin, POSITION_OPENED audit event. Verified: SELL 0.3 on a 0.1 long → SHORT 0.2, margin 1323.96, equity conserved.
- **S082**: new `Position.margin` field; `_lock_margin` debits `notional/lev` at fill (skipped for force_close — closing needs no margin). Close releases `pos.margin * close_qty/pos.qty` plus the order-margin share for the closed part; partial liquidation releases proportionally; same-side adds accumulate margin. `Account.equity = balance + Σ(margin + uPnL)`. `balance` is now free collateral — the existing INSUFFICIENT_MARGIN check became real.
- **S085**: removed unconditional `order.status = FILLED` after force_close submit; `trade_history[-1].reason` retag gated on actual FILLED status. Verified: price=0 → honest REJECTED NO_PRICE_DATA, prior history untouched.
- **S098**: `_execute_arbitrage` checks both leg statuses before closing the opportunity — rejection closes it as "FAILED" with a warning naming both rejection reasons, no fake profit rows. Dead `orjson.dumps`/`json.dumps` throwaway serialization removed.

## Round 20 — FIX branch: infra + docs (S066, S067, S074, S075, S076)

HFT rows (S058–S065) left untouched — parallel session owns those files (hft-executor already deleted, SOR/FIX wiring being removed there).

- **S066**: nightly regression check is a real gate now — `sys.exit(1)` on avg return < -5%, all-errored strategy, >50% error windows, or empty results; `::warning::`→`::error::` so `if: failure()` issue creation is reachable. Seed kept: deterministic data is correct for a code-regression gate.
- **S067**: deploy health-checks hit published ports — ai-bot `:9092/health` (was :9090, internal-only), grafana `:3001/api/health` (was :3000/health). Prod compose `VITE_WS_*` now `${VAR:?required}` — fails the build instead of silently baking ws://localhost into the bundle.
- **S074**: REST_API.md rewritten to the real surface — health/metrics endpoints only, explicit "Not implemented" section routing readers to the WS protocol.
- **S075**: README architecture honest — no Rust executor column, no FFI hop in the latency budget, no SOR/FIX/mmap-persistence bullets, no Rust tech-stack rows.
- **S076**: same file — 7 wired strategies (build_strategies: 6+StatArb), "signal loop" not "8-stage pipeline", 49 symbols everywhere, ~290 panels, research/ml marked not-wired, port table split published vs internal, "FIX port conflict" troubleshooting row removed.

## Round 21 — FIX branch: C++/Rust execution + dead modules (S058–S065)

All eight HFT findings closed. C++ compile verification impossible locally (no MSVC, no vcpkg deps — toolchain absent); changes verified by diff review + repo-wide reference sweeps. Rust side was fully test-verified (26/26) before the crate was deleted per product decision.

- **S062 (Critical) — phantom local positions.** `OrderExecutor::submit_order`/`close_position`/`execute_arbitrage` returned `void` — send failures were invisible; `pos_mgr.open_position()` ran unconditionally at 3 sites (`process_ai_signals`, `execute_v2_order`, `run_v1_fallback_loop`). All three now return `bool` gated on the real websocketpp error code; local bookkeeping (open AND close, incl. SL/TP and kill-switch paths in `bot_setup.cpp`) only happens when the request bytes were actually sent. Disconnected/failed send = no local position, no silent divergence.
- **S064 — arbitrage naked leg.** Sell-leg failure (serialization OR send ec) after a successful buy now triggers one automatic unwind attempt — market SELL back on the buy exchange. If the unwind itself fails: `spdlog::critical` "NAKED LONG POSITION requires manual intervention". Function returns `false` — the arb is no longer logged as executed on one leg.
- **S065 — silent synthetic book in v1.** `run_v1_fallback_loop` fabricated a 10-level 1bp book with no disclosure (v2 path got a warn earlier — half-fix). Same `spdlog::warn` now fires in the v1 path.
- **S063 — Rust executor semantics.** Before deletion the crate was actually repaired and test-verified: unbounded channel → `mpsc(1024)` (backpressure instead of outage queue-storm), `orders_sent` incremented at real send not enqueue, latency/fill attribution via FIFO in-flight queue (fills carry no client order id — FIFO is the only honest mapping), `Drop` uses `shutdown_background` (runtime drop inside async ctx panicked before). Fixed tests that never compiled (`PartialEq` missing on enums, `null()` vs `*mut`) + a batch-submit race. **26/26 green** — first time this crate's test suite ever passed.
- **S058 — hft-executor crate deleted.** 584 lines + Cargo project, zero call sites (C++ bot uses its own websocketpp OrderExecutor). Removed from: ci.yml job, dependabot cargo entry, .gitignore, build-all.bat, run_all_tests.py (`--rust` flag, `RUST_PROJECTS`, `do_rust`), pre-commit-check.py, health-check.py, DEVELOPMENT_GUIDE.md, TESTING.md.
- **S059 — SmartOrderRouterV2 deleted.** Router + 6 exchange adapters (real_binance/okx/bybit + sim_*) constructed and configured, `route()` called only by its own tests. Removed: `src/exchange/` (9 files incl. `*_config.h`), `smart_order_router_v2.h`, 3 test files, CMake registrations, `smart_router_*` config from yaml/config.h/config_parser/config_validate, router init from `bot_setup.cpp` — live `adaptive_selector` retained.
- **S060 — `src/fix/` deleted.** 979 lines of FIX 4.4 (message/encoder/decoder/session) used only by its own tests; `fix.enabled` config flag removed — the false-advertisement toggle is gone.
- **S061 — `mapped_persistence.h` deleted.** 371 lines, zero references.

**Deleted:** ~3000 lines of dead C++/Rust. **Test state:** Rust 26/26 (pre-deletion); C++ unverifiable locally — flagged for CI.

## Round 21 — FIX branch: dead-code mass deletion + advanced orders wired (S078, S086, S092, S094, S095, +S099)

HFT rows skipped — parallel session is mid-cleanup there. Took the four dead-code islands + the advanced-order wiring.

- **S078**: deleted `fix_client.py` (459), `notifier.py` (384), `socket_transport.py` (164) + 3 tests; empty `networking/`/`notification/` packages removed.
- **S086**: deleted 6 dead nested sim modules (1240 lines) + 6 test files; `_nested_modules` registry updated.
- **S092**: deleted entire `src/ml/` (~2848 lines, 10 modules) + 11 test files. `MLEnsembleStrategy` uses `strategies/ml_features.py` — unaffected.
- **S094 (wired, not deleted)**: `check_advanced_orders()` now called in `ws_broadcast._process_exchange_events` (fills flow into the broadcast batch) and both `__main__` loops; executors lock margin via S082's `_lock_margin`. Runtime-verified: STOP_LIMIT PENDING → FILLED @62238.8 on stop breach, position closed, pending cleared.
- **S095**: deleted `src/research/` (34 modules, 7578 lines) + 20/25 `technical_analysis` (kept live: indicators, fft_analysis, hawkes_funcs, hawkes_model) + 52 test files.
- **S099 (new finding)**: 25 ai-signal-bot tests fail on clean master (verified via stash — NOT from deletions): stale-after-refactor tests — config validation rejects its own valid fixture, VaR/CVaR/Kelly value mismatches, SHM mock side-effects not intercepted, signal_publisher never removes disconnected clients. The CI gate (S070) doesn't catch it.

**Total: 155 files, −31,065 lines.** Sim suite: 443 pass (178 dead-module tests removed). ai-bot suite collects clean: 1412 tests, no import errors.

## Round 22 — FIX branch: price-feed island + OCO wired + helm dedup (S077, S079, S083, S093, S097)

HFT rows skipped — parallel session owns them (S058–S065 all landed in R21 there).

- **S077 + S097**: deleted the whole price-feed island — `price_feed_apis.py` (416) + `price_feed_manager.py` (329) + `price_feed_models.py` (208) + deprecated `health.py` (167) + 5 test files; removed the unreachable hybrid branch (`generate_candles_async`, `_generate_candles_inner_async`, `price_feed_manager`/`hybrid_mode` params) and the entire 38-line `price_feed:` config section — the config no longer advertises a subsystem that doesn't exist.
- **S079**: `deploy/helm/` deleted — `helm/` is canonical (documented in DEPLOYMENT.md; images/versions match docker-compose.prod: postgres:16-alpine, redis:7-alpine, prometheus:v3.0.0). `helm-lint.sh` now lints only `helm/`.
- **S083 — OCO actually wired**: `Order.oco_group_id` field + `to_dict`; `submit_order` registers into `self._oco_groups` (get-or-create); new `_resolve_oco(order)` cancels siblings on every fill path — `_fill_market_order`, `_finalize_order_execution` (stop-limit/trailing fills), iceberg parent completion. Cancelled siblings are **purged from `_pending_*` dicts** so they can't fire later; joining an already-resolved group → `CANCELLED` with `OCO_GROUP_RESOLVED` (was: silently PENDING in a dead group). `ws_message_handler` now forwards all advanced params (stop_price/limit_price/trail_*/iceberg_visible_qty/oco_group_id) — external clients could previously never submit them. Also fixed: iceberg parent was popped while staying PENDING forever → now marked FILLED on completion; pending-check loops iterate snapshots and skip non-PENDING orders (dict-mutation crash + cancelled-order-execution bugs found while wiring). Live-verified: fill → sibling CANCELLED + purged; late join → OCO_GROUP_RESOLVED.
- **S093**: `backtesting/order_book_replay.py` + 3 test files deleted; `__init__.py` re-export removed.
- **Hygiene from deletions**: `build-all.bat` import checks — 15/20 referenced modules deleted earlier (ml/*, research/*, dpdk_transport, onnx_engine.h, portfolio_optimizer/var_stress_test/market_replay/timescaledb_client from batch d433af8); kept the 6 live ones, removed "Rust Executor Built" summary lines (no cargo step existed). `run_all_tests.py` — 14 stale subcategory globs removed (would have silently reported "0 files" groups for deleted modules).

**Verified:** 375 sim tests pass; ai-bot collects 1377 tests clean; OCO path live-repro'd.

## Round 22 — FIX branch: C++ dead headers + infra gates (S088, S096, S069, S070, S071)

- **S088/S096 — ~3900 lines of dead C++ deleted.** position_manager_v2, order_manager, latency_tracker, portfolio_risk, pre_trade_risk, shm_heartbeat, metrics_collector.{h,cpp}, tracer.{h,cpp}, 4 dead `*_v2` strategies, market_data/ (candle_aggregator, order_book_manager, trade_handler), data/symbol_map.h, simd_indicators.h — zero references outside their own tests. 20 test files that tested only dead code removed with them; `test_doctest_cpp_optimizations` stripped to the live `low_latency.h` cases. **Board error caught:** `order_type_selector.h` was listed as dead but is live via `order_executor.h` — kept. Bonus find: `test_integration_signal_engine.cpp` called `SignalEngineV2::compute_signal` — a method that does not exist (real API is `analyze`) — stale test that never compiled, deleted. CMake: dead registrations removed; the `find_library(FMT/SPDLOG)` fallback moved before its first use (it was orphaned inside a deleted block).
- **S069 — /metrics now speaks Prometheus.** `SystemMonitor::format_prometheus()` emits all 13 counters/gauges in exposition format (`_total` counters, fill/rejection gauges, uptime); endpoint serves `text/plain; version=0.0.4`. Previously `format_json()` output hit a Prometheus scrape job every 15s and failed to parse — the target was dead forever.
- **S070 — CI gates that could not fail now can.** test-js: `set +e` + grep "Tests N failed" meant a vitest crash before the summary printed = green job; now `pipefail` propagates the real exit code. test-windows: same fix via `Tee-Object` + `$LASTEXITCODE`. security-bandit: was `|| true` + `::warning` counting ALL results; now fails on `issue_severity == HIGH` with `::error` + exit 1. test-count floors lowered to post-deletion reality (they'd have failed on the intentional dead-test removals).
- **S071 — pre-commit made real.** Installed `.git/hooks/pre-commit` was a stale batch file git cannot spawn — every local commit silently skipped checks. Reinstalled the existing `pre-commit-hook-git.sh`. `.pre-commit-config.yaml` (framework config for a framework nobody ran) rewritten as a `local` hook pointing at the same script — one check implementation for both install paths.

## Round 23 — FIX branch: mock panels + positions review (S003 cont., S041)

- **S003 — 8 more components off MOCK_*** (25 → 17 remaining). `LiquidityMap3D` now renders the real order book — merged bid/ask ladder, bid/ask walls, imbalance — from the `orderbooks` ctx prop the registry already passed. The other 7 have no backend feed and were lying about it: `CancelMonitor` (cancellations are audit-logged but never broadcast), `ModelDashboard`, `LogDashboard`, `DatabaseViewer`, `PacketInspector`, `CapacityAnalysis`, `GeneticViewer` (its backend module `genetic_strategy` was deleted as dead code). All now render a shared `NoDataFeed` disclosure naming the missing feed instead of fabricated tables.
- **S041 — positions review closed.** All 14 `Object.*(acc.positions)` sites audited: `Object.values` on the list is correct, `Object.keys().length` was incidentally correct — normalized to `positions?.length` in 4 files. Zero remaining `Object.entries`/index-key bugs.

## Round 24 — FIX branch: mediums — grafana provisioning, nested package, binds, options chain, marketplace label (S068, S084, S031, S087, S090)

- **S068 — Grafana prod never provisioned a single dashboard.** `docker-compose.prod.yml` mounted `./monitoring/grafana/dashboards` to `/etc/grafana/dashboards`, but the provider config reads `/etc/grafana/provisioning/` — prod loaded 0 dashboards while `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH` pointed at a non-provisioned file (home 404). Now mounted under `/etc/grafana/provisioning/dashboards` and the env points at the provisioned path.
- **S084 — nested `exchange_simulator/exchange_simulator/` package + sys.path surgery removed.** The outer `__init__.py` mutated `sys.path`, imported modules by short name via importlib, and aliased `sys.modules` — every module had 2-3 import identities, and ImportError was swallowed into `logger.debug`. All 4 live modules flattened to package root; all live imports already used full paths. Bonus fix: `websocket_server.py` hard-imported `trade_csv_logger` — a **gitignored dev script** — meaning in a clean clone the importlib swallow made websocket_server silently vanish. Dev-script imports are now optional/defensive.
- **S031 — 0.0.0.0 binds now env-configurable.** `run.py` reads `SIGNAL_WS_HOST`/`HEALTH_HOST`/`METRICS_HOST` (container-safe `0.0.0.0` default preserved); health/Prometheus ports also env-configurable.
- **S087 — OptionsChain wired to the real endpoint.** `useExchangeData` sends `options_chain` requests and routes responses through the store/panel-context/registry; `OptionsChain.jsx` renders the server chain (simulator spot, sim volatility, strikes, expiries, Greeks), keeping client-side BS as an explicitly labeled fallback. Empty state and sigma label now name the data source.
- **S090 — StrategyMarketplace honestly labeled.** It's hardcoded defaults + localStorage JSON import/export — no server marketplace exists. Added a `local only` badge with a tooltip stating exactly that.
- **New finding S100:** 35 web-ui tests fail because they assert the fabricated data that R23's NoDataFeed refactor removed (packetInspector/cancelMonitor/capacityAnalysis/geneticViewer/logDashboard/modelDashboard/liquidityMap3D/databaseViewer). Tests are green only when the component lies — need rewrites against honest empty states or real props. Also fixed en passant: `optionsChain.test.jsx` empty-state wording, `sessionMarkers.test.jsx` brittle `getByText` (active session renders its name twice).

**Verified:** optionsChain + sessionMarkers test files green (8/8); vite build green; sim suite 375 pass; ai-bot 1377 collect clean. The 35 S100 failures are pre-existing on committed HEAD (components from R23 commit + stale tests) — not caused by this round's edits.

---

## Round 24 — S099 (test suite green) + S007 + S016 + S073

**S099 — 23 failing tests → 0.** Split: ~15 stale tests under moved APIs + 3 real bugs.

Stale tests fixed:
- `test_config.py` VALID_CONFIG predated the validator schema (shipped settings.yaml passes clean — validator was right). Fixture brought to the real schema: `default_exchange`, SL/TP/max_position_size, trend_following/mean_reversion/ensemble params, all 6 indicator periods.
- `test_kelly_position_sizer`: `entry=` → `entry_price=` kwarg rename.
- `test_kelly` min_risk: `max_position_pct=1000` headroom so min-risk bump isn't clipped by the 100%-notional cap.
- `test_cvar`: `cvar >= var` → `<=` (CVaR is loss beyond VaR — deeper negative).
- `test_rebalancing`: `rebalance()` → `execute_rebalance(portfolio_value=)`.
- `test_var_calculator`: nonexistent `calculate_var(method=)` dispatcher → named methods; sign convention `>0` → `<0`, `r99>=r95` → `<=`.
- `test_fft`: radix-2 padding assert → numpy handles any N (DC-value check).
- `test_shm_*`: bare `Exception` → `OSError` (what shm-open raises; impl contract is bool-return).
- `test_health_checks`: `message=` → `details=`; `test_metrics`: asserts real `signals_total` attr.
- `test_monitoring_llm`: case-sensitive "No SHM check" → case-insensitive.
- `test_circuit_breaker`/`test_tracker`: patch/inject `time.monotonic` (impl converted).

**Real bugs fixed (found by the failing tests):**
- `real_account.py`: all 13 except-clauses caught `(OSError, RuntimeError, KeyError, ValueError)` — but ccxt raises `ccxt.*Error` (plain `Exception` tree). Real exchange failures would crash `get_health`/`get_balance`/`set_leverage` instead of returning graceful defaults. Broadened to `Exception` (CancelledError is BaseException — unaffected).
- `signal_publisher._send`: caught `(ConnectionError, OSError, TimeoutError)` — `websockets.ConnectionClosed` is an `Exception`, so dead clients were never marked disconnected; `gather(return_exceptions=True)` swallowed the failure silently and `_clients` grew forever. Broadened to `Exception`.
- `test_kelly` min_risk: confirmed impl correct — notional cap legitimately wins over min-risk bump (test needed headroom, not a bug).

**S007 — time.time()→monotonic for intervals.** 37 sites converted across 11 files (cooldowns, uptimes, latencies, ages, cache-TTL, decay). Wall-clock timestamps in messages/DB/payloads kept `time.time()` — correct semantics. NTP adjustments can no longer warp cooldowns or reported latencies.

**S016** — `exchange_simulator/metrics.py` (264 lines) deleted: server uses `ws_metrics.WebSocketMetrics`; file lived only for its own test (also deleted).

**S073** — dev compose `prometheus:latest`/`grafana:latest` → `v3.0.0`/`11.4.0` (same pins as prod).

Verified: ai-signal-bot **1368 passed, 0 failed** (was 23 failed). Targeted module tests green after monotonic conversion. Ruff clean on touched files (6 I001 import-sort warnings pre-existing).

## Round 25 — FIX branch: dual backtest engines, hook gating, repo-junk correction, nginx honesty (S089, S091, S080, S072)

- **S089 — the "duplicate backtest engines" were not duplicates.** The panel runs a **custom rule-builder** (user-defined condition/action rules) in JS on live sim candles; the server `run_backtest` runs **named Python strategy classes** on self-generated synthetic GBM. Wiring the panel to the server as-is would have silently dropped both the user's rules and the real candles. Fix honors both: server `_run_backtest` now accepts `candles_data` (validated, 10k cap, malformed → synthetic fallback) and reports `data_source: client|synthetic`; the panel gained a "Server engine" section (strategy select → `sendSignalMessage` → results table) with both engines honestly labeled. Live-verified: 120 client candles → real `Backtester` → 14 trades on uptrend; bad payload → synthetic fallback.
- **S091 — hooks gated by mode.** `useExchangeData`/`useSignalData` pass `autoConnect: !IS_MOCK` — mock mode no longer opens real sockets to :8765/:8766 with reconnect spam. Mock hooks take `{enabled = IS_MOCK}` — real mode no longer ticks mock intervals. Tests pass `enabled: true` explicitly.
- **S080 — finding was wrong.** `audit/` (320K) and `hft-skills/` (20MB) are untracked AND gitignored — `git ls-files` empty, `check-ignore` confirms. They were never repo weight; local workspace junk only. Corrected, not deleted (user's local files).
- **S072 — nginx headers honest.** Removed `X-XSS-Protection` (deprecated; would only re-enable the buggy legacy auditor) and `Strict-Transport-Security` (browsers ignore HSTS over HTTP — it belongs on a TLS terminator that doesn't exist here). Kept the four headers that actually work over HTTP.
- **Gate fallout:** new real test files `test_ws_message_handler.py` (advanced-params forwarding regression), `useTradingStore`/`usePanelContext` (field-drop regression), `strategyMarketplace`, `strategyBacktest` — the repaired pre-commit gate demanded them, correctly.

**Verified:** server backtest live-repro; vitest targeted files green (mock 16, strategyBacktest 4, useExchangeData 29, panel-context 3); vite build green.

---

## Round 25 — S003 финал (mock → real/no-feed), S006 partial

**S003 — закрыт полностью.** Оставшиеся 16 `MOCK_*` компонентов:
- **Real-data wiring (4):** `MarketImpact` — walk-the-book VWAP slippage из реального `orderbooks` (orderbook[] levels), отображает `book+` когда сайз превышает видимую ликвидность; `TaxReport` — mock-fallback удалён, рендерит реальные `fills`/`pnl`; `NewsFeed` — накапливает реальные `news_event` broadcast-сообщения (latest-only в сторе → in-component accumulator); `MLInsights` — fake model-cards (accuracy/MSE/epochs без фида) → NoDataFeed, Long/Short counts теперь из реальных ml-tagged signals.
- **NoDataFeed (12):** ABTesting, ApiPlayground, Colocation, DeployStatus, HyperoptUI, OnChainAnalytics, PortfolioOptLab, RetrainingPipeline, ScenarioSim, StrategyVersionControl, TeamCollab, WidgetSDK — ни у одного нет backend-фида; вместо сфабрикованных таблиц — disclosure с именем отсутствующего фида.
- **Удалён сирота:** `src/utils/mock-data/` — 12 файлов (~268 строк фабрик), последние consumers только что конвертированы; 0 внешних импортов.
- `MOCK_` в компонентах: **0**. Остались только легитимные: `MockModeBanner` (env flag) + `mockData.js`/`useMockData.js` (mock-mode factory, gated by `enabled`).

**S006 partial:** `test_signal_publisher` (24 мока — самый большой файл) → `spec=websockets.WebSocketServerProtocol`/`WebSocketServer`, 22 сайта, 23/23 green. Спеки отлавливают wrong-attr использование (раньше `ws.anything` молча проходил).

**Verification:** vitest 120 files / 960 tests green · vite build green · eslint clean на тронутых файлах (15 pre-existing ошибок в 4 нетронутых тестах: exchange-ui, indicators, panelErrorBoundary, virtualList — кандидаты в борду).

---

## Round 26 — S002 финал, S030 console-gating, coverage-gate tests

**S002 — Done.** Ревизия оставшихся 52 `Math.random` сайтов: всё легитимно — стохастические алгоритмы на реальных candle-инпутах (Ogata thinning в HawkesProcess, EM init в HMM, bootstrap в MonteCarlo, MCMC в HMC/Malliavin) + id-generation. Единственный дефект: `MarketDepthReplay` — `0.8 + Math.random()*0.4` jitter делал реконструированный стакан недетерминированным (та же свеча → другой стакан на каждый рендер). Заменён на детерминированный хэш по (timestamp, level); disclosure "Reconstructs L2 depth from candle OHLC" уже был.

**S030 — Done.** 11 `console.warn` → `if (IS_DEV)` в 7 файлах (localStorage-диагностики, audit-export no-op). `console.error` в TopErrorBoundary/useWebSocket оставлены — реальные error-paths.

**Gate-driven tests (5 новых файлов):** useSessionRecorder (snapshot→stop→metadata: peakEquity/maxDrawdown/totalTrades, import validation, localStorage), useStrategyMarketplace (builtin seeding, schema-version reject, id-replace, export round-trip), MarketDepthReplay (mid-price reconstruction, <10 candles guard), SessionStats (real PnL/win-rate aggregation), StrategyBuilder (save→localStorage).

**Verified:** vitest targeted green (21 новых теста), eslint clean, full suite 122 files green.

---

## Round 26b — механические находки: 3 fixed, 3 N/A

**Fixed:**
- **S033** — `time.sleep` в 4 тестовых файлах убран: cooldown-тесты circuit breaker'ов теперь патчат `time.monotonic` (детерминированно, мгновенно — после S007 оба breaker'а читают monotonic). `test_validator._daily_reset` — вместо `sleep(0.01)` надежды на тик часов, сетится явный старый datetime (Windows timer resolution ~15.6ms делал старый тест флаки). 80/80 green.
- **S018** — `monitor.py` WS_URL → env `SIGNAL_WS_URL`; `ApiClient.jsx` — WS URLs из `VITE_WS_EXCHANGE/VITE_WS_SIGNALS` (статус уже был живой через ctx — врали только захардкоженные URL при env-override).
- **S028** — N/A: все 6 `or {}`/`or []` — корректная идиома защиты от mutable default / пустого YAML.

**N/A (ложные находки):**
- **S017** — 0 `logger.X(f"...")` в src (attribution/competition удалены ранее; везде lazy %-args).
- **S010** — файлы 100% os.path, смешивания с pathlib нет.
- **S009** — все 24 `hasattr`/`getattr` легитимны: ccxt capability detection, plugin loading, optional adapter methods — не "вместо isinstance" на своих классах.

## Round 27 — S101: CI lint jobs red on master (local gate never saw it)

**S101 — three CI lint jobs were red on clean master.** `ci.yml` runs `ruff check .` per component, `npm run lint` (eslint src/), and `clang-format-18 --dry-run --Werror` on hft-trade-bot. The local pre-commit gate checks only *staged* files — so commits passed while repo-wide lint rotted. Verified on HEAD: ruff **29 errors**, eslint **303**, clang-format **~670 violations across 66 files**.

Fixes:
- **ruff:** `ruff check --fix` cleared 28 (18 I001 in ai-signal-bot tests + F541 f-string-without-placeholder). The last error (F841) lived in `scripts/pre-commit.py` — the **dead predecessor** of `pre-commit-check.py` (the hook invokes the latter; the former is referenced by nothing). Its `--quick` flag was fake — parsed, never read. Deleted rather than patched.
- **eslint 303 → 0:** 268 `no-unused-vars` — mostly dead assignments/props left behind by the S003 mock-purge — plus `prefer-const`. A codemod (`scripts/fix_eslint_unused.py`) removed unused destructure members/imports/statements and `_`-prefixed position-dependent args across 121 files; ~15 sites needed hand repair (dead helper-function bodies, multi-declarator lines, cascading orphans like `PtauCov_`/`calcATR`/`highs`/`lows`/`zMax`). Deleted real dead code: `randomNormal`/`logGaussian`/`computeFreeEnergy`/`generatePolicies` bodies in FreeEnergyPrinciple, `kellyContinuous`, `levyProkhorov`, `conditionalProb`, `euclideanMean`, dead `direction`/`maxDDStart`/`cumulativeForce`/`im` accumulators.
- **clang-format:** `-i` over the exact CI file set — 66 files, 0 violations after.

**S017-extension:** the ai-signal-bot scope was clean, but `exchange_simulator/` had **45 f-string logger calls** — converted to lazy `%`-args by `scripts/fix_fstring_logs.py` (3 spec/slice sites handled by hand). f-string in `logger.X(...)` builds the string even when the level is filtered.

Verified: `ruff check .` 0 · `eslint src/` 0 · `clang-format --dry-run --Werror` 0 · vitest **981/981** (125 files) · exchange_simulator **366 passed** · vite build green.

---

## Round 27 — S008 type:ignore=0, S006 топ-3 мок-файла spec'd

**S008 — Done.** `type: ignore` 0 в src: `var.py` — `stats: ModuleType | None` для optional scipy import вместо suppress; `helpers.py` — `assert last_exc is not None` перед raise (loop выходит только после caught exception — инвариант задокументирован). price_predictor/rl_trader ignores ушли с удалёнными файлами.

**S006 — топ-3 файла spec'd (63/156):** `test_real_account` — `spec=_CCXT_SURFACE` (13 методов что реально вызывает prod-код; ccxt не установлен → spec-по-именам ловит опечатки в именах методов). `test_metrics_server` — `spec=asyncio.Server/StreamReader/StreamWriter` (stdlib классы). Ранее: `test_signal_publisher` — websockets protocol spec.

**Verified:** 30+24+15 тестов green на тронутых файлах, ruff clean.

---

## Round 28 — S004 partial, S027/S021/S011/S023/S024 closed

**S004 — partial:** `len(...) > 0` → exact contracts ещё в 4 файлах: `test_rebalancing` (orders `== 3` + стороны `[BUY, SELL, SELL]` — drift 0.4→0.5, 0.3→0.25, 0.3→0.25), `test_backtest_plotter` (`== 4` png: equity+pnl per strategy + comparison_equity+comparison_radar), `test_exchange_factory` (sim-stub возвращает ровно 1 захардкоженный USDT-баланс — тест теперь документирует stub-контракт), `test_fft_analysis` (`== 32` positive-frequency bins для N=64). Пересмотрены `test_real_market_data`/`test_alerting`/`test_fft_analysis` — там `len`-asserts и есть контракт (paired с exact values / alert-cooldown semantics), не трогал. ~40 слабых сайтов остаются.

**S027 — Done:** code-level `List[`/`Dict[`/`Tuple[`/`Set[` в ai-signal-bot src+tests + exchange_simulator: **0** (проверено regex по annotation-позициям, исключая docstrings). Исходные 1121 ушли с dead-code раундами (vae/ms_garch/autoencoder удалены) и lint-свипами; последний residue — docstring `-> List[Signal]` в `marketplace.py` — исправлен.

**S021 — Done:** `exchange_simulator/exchange_simulator/` nested package уже flattened (S084); оставшиеся `logs/`/`__pycache__` — gitignored artifacts.

**S023 — N/A:** осталось 4 `**kwargs` сайта — все это wrapper-API где kwargs и есть контракт: `bind_contextvars` (arbitrary log context), OTel `start_as_current_span` attrs, `retry_async` forwarding. price_predictor/rl_trader удалены.

**S024 — N/A:** все 5 root dev-скрипта подтверждённо gitignored — локальные инструменты пользователя, веса в репо нет.

**S011 — N/A:** 4 `global` — singleton `get_or_create` паттерн, используется консистентно, утечек изоляции в тестах нет.

**Verified:** 104 targeted тестов green · ruff clean на тронутых.

---

## Round 28 — S102: SimulatorAdapter was a pure fake (now wired to real sim WS)

**S102 — the worst kind of fake: an adapter that never connected.** `SimulatorAdapter` had a `simulator_url` field but no socket code at all: `get_ticker` returned `_sim_prices.get(symbol, 50000.0)` — flat 50000 for any symbol; `place_order` instantly returned `{"order_id": "sim_1", "status": "filled"}` at `price or 50000`; `cancel_order` always `True`; `get_orderbook`/`get_candles`/`get_positions` returned empty. `ExchangeMode.FALLBACK` silently degraded real trading into fabricated prices with guaranteed fills. The old unit tests *asserted the fake contract* (`status == "filled"`).

**Fix — wired to the real API:** the adapter is now a WS client to the simulator at `simulator_url`: connect + recv-loop caching the `candles` broadcast (prices/candles/orderbooks/accounts), `place_order` sends `{"type":"order"}` and resolves on the fill/error reply via FIFO futures (10s timeout), `cancel_order` returns **False** (the sim protocol has no cancel message — reported honestly), `get_balance`/`get_positions` read the account broadcast, `get_health` reports connection state + last-message age. No feed → honest empty data, not flat-50000.

**S006 — +5 test files spec'd (~70 sites):** `test_websocket_server` (30: `spec=ServerConnection` for ws clients — auto-AsyncMock children for coroutine `send`; spec-by-names for `MarketSimulator`/`SimulatedExchange` since instance attrs aren't in `dir(Class)`; real `OrderBookLevel`/`Account` dataclasses instead of mocks), `test_security` (19: same surfaces + fill spec'd on the full Order field contract), `test_walk_forward` (10 engines → `spec=BacktestEngine`), `test_bot_helpers` (8: `_CFG_SURFACE`/`_BOT_SURFACE`/`_SIGNAL_SURFACE`). `test_real_market_data` excluded — its AsyncMocks are callback spies assigned to `feed.on_ticker`, not faked objects. Spec immediately caught real surface (`_order_history` private-attr access in ws_prometheus) — that's the point.

**S032 — Partial:** TypedDict contracts on the top offender — `TickerData`/`OrderbookData`/`AdapterHealth` in `exchange_factory.py`; Protocol + both adapters annotated (12 of 145 sites).

**Bonus:** `helpers.retry_with_backoff` — `coro_fn`/`**kwargs` now `ParamSpec`-typed (preserves wrapped signature).

Verified: sim 60 tests green (43 ws_server + 17 security), ai-bot 77 green (30 factory + 23 walk_forward + 12 bot_helpers + others), ruff clean on touched files.

---

## Round 29 — S001/S004/S005/S006/S032 closed

**S001 — Done.** Финальная проверка эпопеи: все **271 registry-записей** имеют `props:` ctx-маппинги (0 панелей без данных); 19 панелей с нестандартными prop-именами (`orderbookData`, `currentPrice`, `auditLogs`) подтверждены wired через `ob(ctx)`/`ctx.currentPrice`. 13 non-MOCK data-literals в компонентах — все оказались computed/config массивами на реальных входах (FearGreed weights на computed scores, paramSets с параметрами от meanR/varR, indicator fn-обёртки). MOCK_=0, random-as-live=0, mock-mode env-gated.

**S004 — Done.** `len(...) > 0` standalone: **0** (12 сайтов → exact: order count+sides, equity `n-warmup+1`/`n-lookback`, optimizer grids `==4`/`==2`/`==7` windows, plotter `==4` pngs, fft `==32`/`==1` bins, sim stub `==1`, validator `==2`, orderbook depth `==20`). Единственный оставшийся `or`-site — легитимный either-feed contract. 23 single-assert vacuous теста → semantic asserts: `exit_reason` в enum-set (was discarded listcomp!), `SignalDirection.NEUTRAL`, `sharpe > 0`, bollinger `> 0.5` (z-score/2 convention), `cci > 0`, prometheus `# HELP`/`# TYPE` markers, `callable(log.bind)`, `transaction_cost == 0.001`. Остаточные `isinstance`/`len ==` — paired с content, легитимны.

**S005 — Done.** `range(len(` → 0: 12 сайтов ai-signal-bot (pairwise `zip(strict=False)`, same-length `zip(strict=True)`, `enumerate` где нужен индекс) + 6 в exchange_simulator (test_market_simulator, visualizer_charts). Plotter-хиты были `np.arange` — корректная numpy-идиома, не трогал.

**S006 — Done.** Все top-level моки spec'd: `cross_exchange_arb` 15× `MagicMock(spec=["place_order"])` (единственный метод что вызывает engine), unit `signal_publisher` `AsyncMock(spec=CircuitBreaker)`, `ws_client._ws` ×4 `spec=WebSocketClientProtocol`, e2e `market` `spec=MarketSimulator`, observability spec-lists. Остаточные unspec'd — attribute-overrides на spec'd родителях (имена проверены родителем) + injected callbacks (spec бессмысленен для callables). Параллельный агент spec'ит shm_* файлы в той же итерации.

**S032 — N/A.** После dead-code чисток осталось 56 `-> dict` — все JSON wire payloads (signal_publisher broadcast, health endpoints) или гетерогенные exchange-API ответы (`exchange_factory` Protocol). Внутренние structured results уже dataclass'ы (`BacktestResult`, `VaRResult`…). TypedDict для wire payloads — ceremony без поведения.

**Бонус:** новый `tests/unit/test_hawkes_model.py` — 6 contract-тестов на `hawkes_log_lik` (stationarity guards, empty→-mu·t, clustered > spread при alpha>0, Poisson-equivalence при alpha=0) — файл тронут S005, gate требовал тест.

**Verified:** 1181+165+150+32+21 тестов green · ruff clean на всех моих файлах (1 I001 в agent's test_ws_message_handler — не моё).

---

## Round 30 — AUDIT sweep: doc drift + dead residue

Board сведён к god-file rows → AUDIT branch. Прошёл непокрытые паттерны rulebook'а + менее-аудированные области (hft headers, scripts/, hooks/utils, infra, docs-vs-reality).

**S103 — doc drift (Medium).** ~67 ссылок на удалённые пакеты в 7 docs-файлах. Худший — `docs/theory/module_guide_en.md`: 145-секционный гайд, 30 рефов на `research/` "52 quant models", `notification/`, `price_feed` — пакеты удалены в S092/S095/S097. `docs/DEPLOYMENT.md` хуже остальных по последствиям: YAML-блок `price_feed:` — пользователь выставит конфиг и он будет молча проигнорирован. `ARCHITECTURE.md` описывает `price_feed_manager.py` как живой модуль.

**S104 — dead residue (Low).** 4 пустых package-хаска (`src/ml/`, `src/research/`, `src/notification/`, `src/networking/`) — ноль .py, только `__pycache__` с 68 stale .pyc файлами удалённых модулей. Не трекнуты, инертны (bytecode-only в `__pycache__` не импортируем), но шум + README их рекламирует. Плюс 2 dead-хука в web-ui (`usePrevious.js`, `useStatusMap.js` — 16 строк, 0 импортов).

**ЧИСТО (проверено, добавлено в лист):**
- `async def` без `await`: 27 сайтов — все signature-bound (Protocol impl, aiohttp handlers, `start_monitoring`/`start_user_data_stream` task-spawn, `_handle_unsubscribe` sync-dispatch). Не sync-pretending-async — реальной работы в них нет.
- `getattr` без default: 0. `import *`: 0. `type(x)==`: 0. `str(Path(`: 0.
- Unbounded caches: sim `_candle_history`/`_funding_history`/`_ob_cache` — все с `_max_*` trims.
- `random`/`np.random` в src: 8 сайтов — все seeded (`default_rng(42)`, `Random(seed)`, reconnect jitter).
- `json.loads` без try: 0 из 45.
- Dead classes в strategies/risk/portfolio: 0. Dead hft headers: 0 (`pch.h` жив через `target_precompile_headers`).
- `if not x: return []` masking: 0. skip/xfail без reason: 0. `it.skip`/`xit`: 0.
- helm/terraform/settings.yaml: нет ссылок на удалённые сервисы/модули.
- `scripts/migrate.py` — реальный инструмент (4 SQL migrations, asyncpg runner).
- web-ui mock infra — env-gated `VITE_MOCK_MODE`, disclosed — легитимна.

**Verified:** все поиски sanity-checked на known-present строках; hit-context прочитан до классификации.

---

## Round 30b — S103/S104 fixed

**S104 — Done.** Удалены 4 пустых package-хаска (`src/ml/`, `src/research/`, `src/notification/`, `src/networking/` — только `__pycache__`, 68 stale .pyc) + `usePrevious.js`/`useStatusMap.js` (0 импортов). README: убраны строки `ml/`/`research/` из дерева и буллет "Research library" — пакетов больше нет вообще, даже "not wired".

**S103 — Done.** Live-доки вычищены хирургически:
- `DEPLOYMENT.md` — удалены 2 YAML-блока `price_feed:` (enabled/hybrid_mode/apis, cache_ttl) — ключи молча игнорировались бы пользователем.
- `ARCHITECTURE.md` — `price_feed_manager.py` убран из списка модулей sim'а.
- `TESTING.md` — тест-инвентарь переписан: удалены имена 12 мёртвых тестовых файлов (`test_price_feed_*` ×4, `test_research_modules`, `test_notifier`, `test_socket_transport`, `test_fix_client`, `test_ml_modules/models`, `test_real_exchange_client`, `test_order_book_realism` и др.); счётчики исправлены на реальные: 193→**117** py, 155→**88** ai-bot, 36→**28** sim, 49→**25** cpp, 116→**120** js unit.
- `DEVELOPMENT_GUIDE.md` — дерево: удалены `ml/` (PPO/LSTM/Transformer), `research/`, `notification/`; `communication/` "FIX" → WebSocket/SHM (fix_client удалён); устаревшие имена файлов sim'а (`options.py`/`liquidation.py`/`market_microstructure.py`) → реальные; таблица протоколов — удалены строки FIX 4.4 и Rust FFI (hft-executor удалён).
- `docs/theory/*.md` (7 файлов, 89 refs) — **gitignored local docs**, не коммитятся; добавлен post-cleanup banner с перечнем удалённых модулей — теория остаётся референсом, ложь "код существует" убрана.
- `REFACTORING_PLAN_10DAYS.md` — HISTORICAL banner (тоже untracked, local).

**Verified:** residual grep = 0 в live-доках; deleted-file check прогнан по каждому имени в TESTING.md; banners вставлены после title строки, формат файлов не сломан.

---

## Round 31 — S020 split + C++ red-suite root causes

**S020 — Done.** `test_signal_engine_v2.cpp` (1009 lines, 61 tests) разрезан на 4 доменных файла: `test_v2_infra` (10), `test_v2_indicators` (12), `test_v2_engine` (25), `test_v2_pressure_adaptive` (13). Общие хедеры: `test_util.h` (TEST/ASSERT-макросы, счётчики, раннер), `test_fixtures.h` (candle/order-book билдеры). CMake: `foreach(v2test …)` вместо монолитного таргета.

**S105 — Done (2 реальных бага, найдены верификацией сплита).**
- `LatencyHistogram::record` — sub-1μs сэмплы уходили в early-return bucket[0] ДО min/max CAS-лупов → `stats.min` залипал на 1e18 навсегда. Latency-инструмент HFT-бота терял ровно те сэмплы, ради которых он существует. Fix: min/max tracking поднят выше bucket-выбора.
- `SPSCQueue<T,N>` — mask-ring (`(head+1) & MASK`) давал N-1 usable слот при заявленном `Capacity`. Два тестовых файла кодировали противоречивые контракты ("usable 3" vs `push(4)==true`). Fix: `STORAGE = Capacity+1` + wrap-reset — теперь `Capacity` = usable, как в rigtorp/boost. `size()` сделан wrap-aware, pow2 static_assert снят.

**Stale-тесты (не баги движка):**
- cooldown-тесты дёргали stateless `analyze()` — у него нет per-symbol cache, а значит нет cooldown state вообще. Prod-путь — `analyze_incremental()` (v3 вызывает `analyze` как внутренний scoring-примитив). Тесты переведены на production path.
- downtrend-тест скармливал bid-heavy стакан (`make_order_book` всегда делал bids×1.0 vs asks×0.7) — OBI толкал LONG посреди краха, contrarian RSI добивал → comp=-0.11 при sell_threshold=-0.30. Fix: `ask_scale` параметр, downtrend получает ask-heavy книгу → comp≈-0.70 → SHORT.
- toxicity-тест assert'ил `pressure_score < 0.5` против raw-pressure семантики — score threshold-normalized и сатурирует в ±1 (raw 0.187 при threshold 0.2 → 0.94). Fix: сравнительный assert toxic-vs-clean (0.94 < 1.0).
- 3 теста скармливали 60 свечей при warmup = ema_slow(50)+ema_signal(9)+2 = 61 → "Insufficient data". Бамп до 70.

**Verified:** 4 новых бинаря 60/60 green; `test_doctest_cpp_optimizations` 8/8 (SPSC capacity + histogram регрессии покрыты); clang-format прогнан; original монолит воспроизводил те же 7 фейлов до сплита.

---

## Round 31b — S014/S015 god-file splits (часть)

**S014 — Partial.** `strategies.py` (515 строк) разрезан на 4 доменных модуля по классам (trend_following/mean_reversion/ensemble/fft_cycle) — `strategies.py` стал re-export shim, ни один из 9 импорт-сайтов не потребовал правок. `real_market_data.py` (551) → `market_data_types.py` (Normalized* dataclass'ы) + `market_data_feed.py` (WS feed) + `market_data_manager.py` (pull-cache) + shim. Сплит вскрыл мелочь: `RealMarketDataManager` использовал module-level `logger`/`asyncio` — импорты докинуты.

**S015 — Partial.** `PerformanceDashboard.jsx` 522→166: PDF-report генератор (80 строк HTML-строк) → `utils/performanceReport.js`; два идентичных lightweight-charts эффекта → `components/performance/PerfAreaChart.jsx`. Параллельно: `BacktestRunner.jsx` резан другой сессией.

**Verified:** pytest 1381 green, vitest 998/998 (129 файлов), eslint clean на тронутых.

---

## Round 32 — S014/S015 финал + S106

**S014 → Done.** `signal_publisher.py` 496→307: backtest-request handling (param clamps, client-candle parsing, deterministic synthetic GBM, risk-config, strategy construction, run/compare envelopes) extracted to `communication/backtest_requests.py` — all functions self-free, WS protocol unchanged. `engine.py` 440→266: `llm_types.py` (SecretStr + 3 dataclasses), `rule_based.py` (response parser + rule-based fallbacks, all pure).

**S015 → Done.** `CopulaModel.jsx` 498→311 (`utils/copulaMath.js`), `EmpiricalDynamicModeling.jsx` 455→265 (`utils/edmMath.js`). Both were React components wrapping ~190 lines of pure math — the split makes the math independently testable.

**S106 (new High) → Done.** The CopulaModel split surfaced a real math bug: `regIncompleteBeta` divided by `a` twice (`front` already carried `/a`) and `betaCF` was a naive recursion, not Lentz — `I_0.5(2,2)` returned 0.81, `tCDF(1,200)` returned 0.50 instead of 0.84. `fitCopula` computes student-t tail dependence through it, so the panel's tail-dependence numbers were ~3× understated. Replaced with Lentz betacf; verified against textbook critical values (t₀.₉₅,₅=2.015 → 0.95; I_0.5(2,2)=0.5 to 14 digits).

**Verified:** pytest 1075 green · vitest 1023 green (27 new math-contract tests) · eslint/ruff clean.

---

## Round 33 — dead metrics path + cp1251 dev-script crashes

**S107 (High) — Done.** Two parallel metrics stacks, each half-wired, neither connected end-to-end:
- `MetricsCollector` (`communication/metrics_server.py`) — hand-rolled, fed by `signal_publisher` (`record_signal_sent`/`record_signal_blocked`/`set_ws_clients`/`set_circuit_breaker_state`/`record_backtest`). But `MetricsServer` — the only code calling `collector.render()` — was **never instantiated outside tests**. Every signal metric died in process memory.
- `MetricsExporter` (`monitoring/metrics.py`, prometheus_client+aiohttp) — IS served on :9090, the exact port helm values/prometheus scrape. But `run.py` wired only `record_ws_reconnect`; all `ai_signal_bot_*` alert series (`signals_sent_total`, `signals_blocked_total`, `circuit_breaker_state`, `ws_clients_connected`, pnl/drawdown/win_rate) stayed at zero forever — **Grafana shows a flatlined bot while signals flow**. Same series names in both stacks = duplicate architecture with no working end.
- Fix (wire-to-real): added missing `backtests_run_total` counter + `record_backtest()` to the exporter (its method names already mirrored the collector — clearly designed as the sink); `start_server` now returns `bool`; `run.py` sets `signal_publisher.metrics = prom_server` only when the endpoint actually started. MetricsCollector remains the in-process fallback when prometheus deps are absent.

**S108 (Low) — Done.** `scripts/ci-equivalence.py` and `scripts/health-check.py` crashed with `UnicodeEncodeError` on this repo's own Windows dev env (cp1251 console, box-drawing/emoji in `print()`). Added `sys.stdout.reconfigure(utf-8, errors=replace)` at both `main()` entry points. `pre-commit-check.py` unaffected (Unicode only in comments).

**Audit of R31/R32 extraction output (ЧИСТО):**
- New hooks `useChartCandles`/`useTradingStoreSync`/`useDetachedPanelSync`/`useAppShortcuts` — faithful extractions; dep arrays complete; `EXCHANGES`/`SYMBOLS` are real `useUIStore` exports.
- New modules `backtest_requests.py` (seeded `random.Random(42)`, honest malformed-candle fallback), `llm_types.py`, `rule_based.py` (validates+clamps sentiment/confidence/rec), `market_data_{types,feed,manager}.py` — clean.
- `helm/` — single chart, `hft-trade-bot` sidecar-in-ai-bot-pod design documented in the template itself; hardcoded 9091 = hft health port (matches port map).
- `exchange_simulator/config.yaml` — all 16 sampled keys (visualizer/metrics/arbitrage/audit/market/account) have readers.
- web-ui `fetch(`/axios — 1 call total (`AlertWebhook` outbound POST) — legit, UI is WS-only as documented.
- `return {}`/`return []`/`return None` sweep (64 sites) — all honest: Optional semantics or log-and-empty (`load_config` warns, `real_account` logs errors).
- TODO/FIXME/HACK markers — 0 real; hits were domain words (exchange "hack" event, "temporary" market impact).

**Verified:** pytest 80 green (metrics+publisher suites) · ruff clean · both scripts now run end-to-end (health-check reports 52/100 FAIR).

## Round 33 — 2026-09-12 — Infra + dead-layer sweep

- **S109 (Medium)** — dead persistence layer: `src/database/db.py` (211 lines) imported only by its own tests; 4 SQL migrations + `migrate.py` never invoked by the app; prod compose + helm provision postgres/redis and inject `REDIS_URL` with **0 readers**; terraform provisions real RDS+ElastiCache for nothing. Misleading infra implying persistence that doesn't exist.
- Verified clean: all compose services map to live Dockerfiles; nginx.conf is an honest static SPA server; 0 TODO/FIXME in hft src; all 5 production .cpp in CMake SOURCES; no dead C++ headers.
- **S001/S003 → done-log**: final verification — 271/271 registry entries wired, 0 `MOCK_*` in components, 9 prop-less panels all legit (NoDataFeed / calculators / disclosed local-only), 27 `Math.random` users all algorithmic on real inputs, 5 'unused props' are deliberate `_` aliases. **Board open findings: 0→1** (only S109 remains).

## Round 34 — 2026-09-12 — empty props-maps sweep

- **S110 (High) → Done.** Earlier "all panels wired" check counted `props: () => ({})` as fed. Auditing the 16 empty maps: 14 legit (NoDataFeed/stores/calculators), **2 starved**: `NewsFeed` declared `{newsEvent}` while `ctx.exchange.newsEvent` was live (sim broadcasts `news_event`, `useExchangeData:101` parses it) — permanently empty; `BacktestComparison` waited for `externalResults` nobody passed — permanent empty state while saved backtests sat in localStorage. Fixed: registry wires `newsEvent`; `BacktestComparison` loads `SAVED_KEY` entries (snake_case→row mapping, missing metrics render '—'), listens for `saved-backtests-changed`/`storage`/`focus`; `useSavedBacktests` dispatches that event on writes and listens for it — delete/clear in the comparison panel now syncs back to BacktestRunner. +5 contract tests.
- Verified clean: user's new `audit_logs` WS feed (deque-bounded, callback register/unregister, drained broadcast); `competition` registry fix matches `CompetitionFramework`'s signature; `DatabaseViewer`/`Colocation`/etc. NoDataFeed-disclosed.
- **Verified:** vitest 148 files / 1080 green · eslint clean.

## Round 35 — 2026-09-12 — audit-log feed + crash-on-startup + dice-roll panel

- **S113 (Critical) → Done.** `websocket_server.py` awaited `self._shutdown_event` — an `asyncio.Event`, never awaitable — raising `TypeError` immediately after `serve()` bound the port. Introduced in f807082 ("Reliability Plan") replacing working `await asyncio.Future()`. **The exchange simulator's WS server could not start at all** — `__main__.py:146` awaits exactly this path, and no test ever called `start()` fully. Fixed: `.wait()` at both sites; as part of the same lifecycle audit, `metrics_task` moved inside the `async with` (it was created before `serve()` and orphaned — kept serving on port+10 — if the WS bind failed), audit-callback registration moved after successful bind, unregister wrapped in `finally`, and `AuditLogger.register_callback` made idempotent (double-start or leaked registration would have duplicated every queued event). Regression test drives `start()` through shutdown with a fake serve ctx.
- **S112 (High) → Done.** `AuditLogViewer` was permanently empty: `registry.js` passed `auditLogs: []` while the backend `AuditLogger` logged real order/lifecycle events with a `register_callback` extension point no production code used. Wired end-to-end: `start()` registers `_on_audit_event` → thread-safe `deque(maxlen=500)` → `_broadcast_audit_events` drains in the broadcast tick → `{type:"audit_logs",logs:[AuditLog.to_dict()]}` → `useExchangeData` case (client-side bound 200, newest-first) → Zustand → `usePanelContext` → registry prop. No fabricated data — pure plumbing of a real source.
- **S111 (High) → Done.** `CompetitionFramework` "Run Tournament" rolled dice: `elo: 1000+rand(-100,100)`, `sharpe: rand(-0.5,2.5)`, wins/losses random — persisted to localStorage as real-looking results, zero disclosure, and 4 of its 6 strategies don't exist backend-side. Rewritten on the real `run_backtest` WS API: per-strategy requests carrying actual market `candles_data` (≤1000), responses correlated via the echoed `strategy` field, ELO computed over real Sharpe ratios, `data_source` shown (real candles vs synthetic), 60s timeout, `NoDataFeed` when the signal channel is down. Strategy list reduced to the 4 real ones in `build_strategies`.
- **S114 (Medium) → Done.** `config.yaml`'s `audit:` section (5 keys) had zero readers — `get_audit_logger()` hardcoded defaults. Added `AuditLogger(enabled=)` gating `log()`; `main()` now builds the singleton from config via `set_audit_logger` before `build_exchanges` binds it.
- **ЧИСТО:** all 27 `Math.random` sites algorithmic (Xavier init, Ogata thinning, Box-Muller, MC shuffle, unique IDs); 0 `MOCK_*` in components; all 16 `props:()=>({})` entries re-verified legit after CompetitionFramework; single `fetch` is the legit outbound webhook.
- **Verified:** pytest 74 green incl. 8 new audit-broadcast tests · vitest 44 green (competition 4, audit_logs 5, store/sync 6) · ruff/eslint clean · `enabled:false` smoke-verified.
- **Open:** S109 (dead persistence layer — needs delete-vs-keep product decision).

## Round 35b — 2026-09-12 — WS protocol completeness (parallel session)

- **S115 (High) → Done.** Cross-referenced every `{"type": X}` the sim emits vs every `case` in `useExchangeData`: `fills_batch` (engine fills — SL/TP, liquidations, arb executions via `ws_broadcast:288/383`) and `error` (5+ rejection sites in `ws_message_handler`) were silently dropped by `default: break`. User fills arrived; engine fills vanished; rejections invisible. Fixed: `fills_batch` prepends all orders into `fills` (existing fill-toasts now fire for engine fills); `error` → `lastError` → store → `useNotifications` toast. +3 contract tests.
- Verified clean: `audit_logger.py` (bounded deque, locked, snapshot-callback invocation); seeded `random.Random`; 0 mutable defaults; 0 unreferenced-but-long tasks; ExecutionBot interval cleanup present.
- **Verified:** vitest 148 files / 1088 green · eslint clean.

## Round 36 — 2026-09-12 — signal-WS protocol + dead capability

- **S116 (Low) — Open.** `signal_publisher` implements a full auth handshake (`auth`→`auth_ok`/`auth_failed`+close) that is unreachable: `run.py:83` never passes `auth_token` (default `''` = off), no config key feeds it, and the web-ui has **no auth client at all** — arming it would lock the UI out with an unhandled `auth_failed`. Looks like security, works as neither. Options: wire the token through config + a UI auth message, or delete the handshake as dead code.
- Signal→UI completeness: bot emits `auth_ok`/`auth_failed`/`signal`/`signal_history`/`market_regime`/`circuit_breaker_status`/`backtest_result`/`comparison_result` — all except the dead auth pair are handled.
- ЧИСТО: all `JSON.parse(localStorage)` guarded; `new Function` in CustomIndicatorPlugin is eval-by-design (self-XSS only); `useWebSocket` sends `sync_state`+`subscribe` on open; README test claims: none.

## Round 36b — 2026-09-12 — dead modules + pyc residue

- **S117 (Medium) — Open.** `src/portfolio/` (4 modules, ~630 lines) + `src/pricing/volatility_surface.py` (214 lines, SVI/SABR) have **zero live importers** — consumed only by their own ~41 tests. Same unwired-feature class as `database/` (S109); decide together.
- **S118 (Low) → Done.** 162 stale `.pyc` files — bytecode of deleted modules (`fix_client`, `real_exchange_client`, `portfolio_optimizer`, `hawkes`...) and deleted tests inside live `__pycache__` dirs. S104 removed whole husks but missed scattered residue. Purged all `__pycache__` (regenerates).
- Verified clean: liquidation/SL-TP math correct (priority order, force_close margin bypass, insurance-fund deficit cover); `data_collection` is live (real-order path); `signal_validation`/`monitoring`/`utils` wired via run.py.
- **Verified:** 41 dead-module tests still green post-purge.

## Round 37 — 2026-09-12 — S109 resolution verification + equity wiring

- **S109 → Done (user-executed, verified).** Resolution = wire-the-module + delete-the-infra: `db.py` rewritten asyncpg→SQLite (WAL, busy_timeout, real schema+indexes); `run.py` imports `Database`, saves signals (:287) + trades (:334); `config.db_path` reads `settings.yaml:151` `database.path`. Deleted: postgres+redis services (compose-prod), `migrate.py`, 4 SQL migrations, helm postgres/redis/secret templates, terraform RDS+ElastiCache, all env wiring. `settings.testnet.yaml` missing `database:` — **not** a bug: it's a reference fragment (only `exchange:` section, env-var style), never a standalone loadable config.
- **Residual wired:** `save_equity`/`close_trade` were defined-but-uncalled — `_snapshot_equity()` now persists equity_curve points each signal tick from the live account dict (best-effort, warns not raises). `close_trade` remains schema-ahead-of-writer — the bot never observes position closes (exits live inside the sim); wiring it needs position↔trade-id tracking — documented, not fake-wired. +4 contract tests (`test_run_equity`).
- **Verified:** ruff clean · 26 db tests + 4 new green.

## Round 38 — 2026-09-12 — options math: dead panels + convention drift

- **S119 (High) → Done.** `OptionsPricing.jsx` + `OptionsStrategies.jsx` were **fully dead panels** — both crashed on every render, caught only by `PanelErrorBoundary`. Four distinct bugs in ~200 lines:
  1. `Math.erf(...)` — not a JS builtin → `TypeError` on first render (both files). Fixed: shared `erf` from `utils/copulaMath.js` (Abramowitz–Stegun, already used by 3 other components).
  2. `Math.pi` — `undefined` (constant is `Math.PI`) → `pdf` returned NaN → gamma/vega/theta all NaN while delta/price rendered (OptionsPricing). Fixed: `Math.PI`.
  3. TDZ self-shadow `const callPrice = callPrice(params.K)` — `ReferenceError` in straddle (the default view!) and strangle branches (OptionsStrategies). Renamed to `callPx`/`putPx`.
  4. Iron condor premium sign inverted (`long−short` → netPremium −2.27, "Max Profit" displayed negative) and break-evens anchored on the long strikes (90/110) instead of the short strikes (95/105). Fixed: credit = short−long legs, BEs on short strikes — payoff curve now shows +credit in the body, −width+credit at wings.
  5. Convention drift: panel theta was per-year while sim `OptionQuote.theta` is documented per-day and `OptionsChain` shows sim values — same "Theta" label, 365× apart. Fixed: ÷365 + label "Theta (per day)".
- **Verified clean:** deprecated `options_pricing.py` BS formulas numerically exact (call 10.4506 / put 5.5735 / delta 0.6368 / gamma 0.0188 vs textbook); live `OptionsSimulator` textbook-correct (per-day theta, Newton-Raphson IV with vega guard, intrinsic/zero-input guards). Repo-wide sweep: no other non-existent `Math.*` builtins, no other `const X = X(...)` TDZ shadows.
- **Verified:** +8 contract tests pinning BS values + per-day convention · vitest 150 files / 1096 green · eslint clean.

## Round 39 — 2026-09-12 — dead config surface (S120)

- **S120 (Medium) → Done.** `settings.yaml` exposed 9 keys nothing read — config that *looks* tunable but is inert:
  - `indicators.macd_fast/slow/signal` — `macd()` itself has **zero callers**; validator even enforced `macd_fast < macd_slow` on dead keys → deleted (keys + properties + validator checks + test fixtures).
  - `trading.timeframe` — candles arrive via WS push; no bot-side consumer; `ws_client.subscribe` takes no timeframe → deleted.
  - `risk.stop_loss_pct`/`take_profit_pct` — signals carry strategy-ATR-derived SL/TP and `run.py:316` sizes off `signal.stop_loss` directly; no global-override point exists → deleted (keys + properties + 3 validator rules).
  - Wired instead of deleted: `indicators.rsi_period` → `MeanReversionStrategy(rsi_period=)` (param existed, never passed); `indicators.atr_period` → new param on `FFTCycleStrategy` + `MeanReversionStrategy` (both hardcoded `atr(candles, 14)`); `rsi_period`/`adx_period` → `generate_llm_explanation` (was `rsi(closes)`/`adx(candles)` bare defaults).
  - Parallel user work (same finding class, bundled): `network.ws_connect_timeout`/`ws_recv_timeout`/`rest_timeout` wired through `run.py` → `ExchangeClient` → `ExchangeFactory` → `RealAccountManager`; `metrics.enabled/port/host` wired to `MetricsExporter` startup; `strategies.{sentiment,market_making,ml_ensemble}` tunables wired through `build_strategies` into their Config dataclasses.
- Verified clean: every remaining yaml key has a `config.*` property and ≥1 non-test consumer; `signal_engine_v2.sl_atr_mult` doc block is the HFT bot's schema, not this file's.
- **Verified:** +1 flow test (`test_indicator_periods_reach_strategies`); user added tunable + network/metrics tests; pytest 1456 green · ruff clean.

## Round 39b — 2026-09-12 — ARCHITECTURE.md phantom inventory (S121) + dead MetricsServer

- **S121 (Medium) → Done.** `ARCHITECTURE.md` documented a materially grander system than exists — the "live system" doc contained aspirational/fictional surface:
  - HFT "V2 Subsystems" table claimed 6 phantom subsystems with **zero files**: Momentum Breakout V2, Market Making V2 (Avellaneda-Stoikov), Statistical Arbitrage V2, Smart Order Router V2 (5 strategies), PreTradeRisk, PortfolioRisk (VaR/CVaR). Real: signal_engine_v2/v3, pressure_model, adaptive_order_selector_v2, order_executor, kill_switch, risk_manager.
  - HFT file inventory listed 12 phantom headers (`order_manager.h`, `latency_tracker.h`, `smart_order_router_v2.h`, `shm_heartbeat.h`, `pre_trade_risk.h`, `portfolio_risk.h`, whole `src/market_data/` dir, `src/strategies/*_v2.h`) + phantom `/hft_heartbeat` SHM segment + "27 doctest files" (real: 13).
  - Simulator table claimed **fiction features**: "Multi-API real-time price feeds (Binance/Coinbase, failover)" (zero API integration), "Student-t/Merton/Heston/Markov microstructure" (0 matches — engine is seeded GBM), "latency simulation with jitter/spikes/backoff" (only broadcast-latency *measurement* exists), "spoofing detection/queue positions/adverse selection" (0 matches — book is exp-decay + rng), "spread analytics" module, phantom modules `liquidation_engine_v2/market_microstructure/latency_simulation/order_book_realism/funding_rate/spread_analytics`.
  - ai-signal-bot section: `strategies.py`/`fft_strategy.py`/`order_book_replay.py`/`fix_client.py`/`health_check.py:9092` — all stale or nonexistent.
  - web-ui: `.js` refs for 10 files that are `.ts`; `useSignalData.js` doesn't exist (exported from useExchangeData.js).
  - Fixed: table rows corrected to real implementation, phantom file rows replaced with the real inventory, `/hft_heartbeat` removed, metrics/health lines corrected.
- **Fold-in: dead `MetricsServer` deleted.** `metrics_server.py` contained a working ~60-line hand-rolled HTTP `/metrics` responder — but `MetricsServer.start()` has zero production callers; S107 wired `MetricsExporter` (prometheus_client) as the real stack. Deleted the class + its 2 tests; `MetricsCollector` kept (fallback sink when prometheus disabled + e2e `.render()` test). Module docstring corrected.
- **Verified:** 32 comm/circuit-breaker+e2e tests green post-deletion.

## Round 40 — 2026-09-12 — dead auth wired e2e (S116) + dead portfolio/pricing via WS API (S117)

Последние две открытые находки — обе wire-or-delete; решение user: wire для обеих.

- **S116 (Low) → Done.** WebSocket auth-хендшейк был написан, но недостижим с обеих сторон: `run.py:87` создавал `SignalPublisher` без `auth_token` (→ `_auth_token=""` → `_authenticate` никогда не дёргался), `settings.yaml` не имел ключа токена, UI не отправлял `{type:"auth"}`. `HealthServer.auth_token` Bearer-middleware — та же мёртвая обвязка. Wired end-to-end:
  - `settings.yaml`: `api.auth_token: ${AI_BOT_AUTH_TOKEN:}` + property `config.api_auth_token` (`config/__init__.py`) → `SignalPublisher(auth_token=)` + `HealthServer(auth_token=)` в `run.py`.
  - `useWebSocket.ts`: опция `authToken` — `{type:"auth", token}` шлётся первым фреймом при `onopen`, до subscribe-очереди; `authState` (disabled/pending/ok/failed) возвращается наружу, `useSignalData` экспонирует его + `sendSignalMessage`. Env: `VITE_SIGNAL_TOKEN` (документирован в `web-ui/.env.example` + `.env.prod.example`).
  - `HealthServer`: probe-пути `/live`+`/ready` exempt от Bearer — helm kubelet-пробы не получают 401 (осознанный компромисс: probe = liveness-only; `/health`/`/health/*` под токеном).
  - Попутная находка той же зоны (тот же класс «мёртвая обвязка»): `run.py` регистрировал `register_check("liveness")`/`("readiness")` — имена, которые `_check_all` никогда не дёргал (искал `exchange`/`database`/`shm`) → переведено на `HealthChecker.check_component_health` с регистрациями под реальные имена.
- **S117 (Medium) → Done.** `src/portfolio/` (black_litterman, markowitz, rebalancing, risk_parity) + `src/pricing/volatility_surface.py` — 0 production-импортеров; жили исключительно в собственных тестах; `PortfolioOptLab` честно показывал «No optimizer-run feed». Wired через WS API по образцу `backtest_requests.py`:
  - Новый `src/communication/portfolio_requests.py`: `optimize_portfolio` — methods `max_sharpe`/`min_variance`/`risk_parity`/`black_litterman` по клиентским `candles_data` (synthetic fallback как у backtest-API); `risk_parity` возвращает `risk_contributions` (%), `black_litterman` принимает `views[{assets,weights,return,confidence}]`, `current_weights`+`portfolio_value` → `RebalancingStrategy.generate_orders`. `vol_surface` — `points[{strike,maturity_days,iv}]` → SVI/SABR калибровка + `implied_vol`/`surface` в ответе, опционально `spot`.
  - `signal_publisher._handle_client_message`: диспетч `optimize_portfolio`/`vol_surface` → `portfolio_requests` (JSON-ответы `{type:"portfolio_result"|"vol_surface_result"|"error"}`).
  - UI: `PortfolioOptLab` переписан — method picker, multi-asset select, rebalance-toggle (веса из реальных `positions`+price-фида), рендер weights/expected_return/volatility/sharpe/risk_contributions/orders + ошибки; `VolSurface` — секция «IV Smile Fit» поверх живого `options_chain` → SVI-фит (disclosed: sim-чейн flat-σ). `registry.js` props для обеих панелей.
- **Verified:** +29 backend-тестов (`test_portfolio_requests` 21 + `test_auth_wiring` 8) · 56 comm/metrics/config/integration регрессия green · vitest 18 (portfolioOptLab 6 + useWebSocket 12) + 70 в touched-зонах (useExchangeData/botStatus/apiClient) · ruff + eslint clean на touched-файлах.

## Round 42 — 2026-09-12 — infra/CI/monitoring sweep → S122 stale smoke-test, S123 codemod residue

- **S122 (Medium) → Open.** `scripts/docker-smoke-test.sh` (+ `.bat` twin): zero references — `ci.yml` `docker-smoke` job inlines its own checks against the **correct** ports (sim 8775 = WS+10, ai-bot 9090, hft 9091, web-ui 3000 — all matching compose healthchecks). The script instead curls `http://localhost:8765/health` and `:8766/health` — pure WebSocket ports with no HTTP listener — so a healthy stack always reports "failed". Fix ports or delete.
- **S123 (Low) → Open.** `scripts/fix_eslint_unused.py` + `fix_fstring_logs.py`: one-shot codemods from S101 (eslint 257-site codemod); only "references" are audit-log mentions. Same class as S104 dead hooks.
- **Verified clean:** CI↔compose health ports fully consistent; prometheus job_names ↔ alert `up{job}` selectors ↔ scrape targets; all 13 alert-`expr` metrics actually emitted (`metrics.py`, `ws_prometheus.py`); every web-ui dependency imported; `deploy.sh` post-S109 consistent (atomic swap over SQLite data dirs); `ebpf_monitor.py` standalone diagnostic as documented; zero CI/script refs to deleted postgres/redis/terraform.

## Round 43 — 2026-09-12 — fix S122 + S123

- **S122 (Medium) → Done.** Repaired `docker-smoke-test.{sh,bat}`: health checks now hit the real HTTP endpoints (sim :8775, ai-bot :9090, web-ui `/health`) matching compose healthchecks and the CI `docker-smoke` job; service summary prints `ws://` URLs for the WebSocket ports.
- **S123 (Low) → Done.** Deleted `fix_eslint_unused.py` + `fix_fstring_logs.py` — spent one-shot codemods.
- Board: **Open = 0.**

## Round 45 — 2026-09-12 — workflow/config/scripts-ci sweep → S124 dead monitoring test suite

- **S124 (Medium) → Open.** `monitoring/tests/` — 23 failing tests nobody runs: `test_metrics.py` spec-loads `ai-signal-bot/metrics.py` + `exchange_simulator/metrics.py`, both deleted (sim's in S016 commit 024ce07 — "file existed only for its own test"; the classes `ExchangeSimulatorMetrics`/`AISignalBotMetrics` exist nowhere — live stack is `MetricsExporter` + `ws_prometheus`). `test_alerts.py` reads `monitoring/alerts/alerts.yml` — an empty dir; the live `monitoring/alerts.yml` uses different group names (`ai-signal-bot`/`exchange-simulator`/`hft-trade-bot`/`system`/`websocket` vs expected `latency_alerts`/`trading_alerts`/`system_health_alerts`). No CI reference — only repo-wide pytest trips on it.
- **Verified clean:** `scripts/ci/` = deliberate local-CI orchestrator (CHANGELOG-referenced, real pytest/ruff/vitest commands); `exchange_simulator/config.yaml` + `hft-trade-bot/config/config.yaml` — zero dead leaf keys; `deploy.yml`/`nightly-backtest.yml`/`release.yml`/`codeql.yml` — real APIs and paths (strategies shim re-exports + `Backtester.run(candles, strategy, symbol, warmup)` signature verified); Dockerfiles EXPOSE/HEALTHCHECK/CMD ↔ real ports/flags; helm values real image repos + pinned tags; `vcpkg/` untracked local tooling.

## Round 46 — 2026-09-12 — fix S124

- **S124 (Medium) → Done.** `monitoring/tests/test_metrics.py` deleted (spec-loaded `ai-signal-bot/metrics.py` + `exchange_simulator/metrics.py` — removed in S016/e983fdf; `ExchangeSimulatorMetrics`/`AISignalBotMetrics` exist nowhere; live exporters have own tests). `conftest.py` deleted with it (its prometheus-registry fixture served only the metrics tests). `test_alerts.py` repointed to `monitoring/alerts.yml` and its group-name tests updated to the real schema — **10 tests green**. `monitoring/alerts/` empty dir is untracked residue.

## Round 48 — 2026-09-12 — slop-verify deep batch: 8 old-era claims, all VERIFIED

First QA pass over the R26–R35 done-log era (never re-checked until now):

| ID | Pri | Claim | Evidence |
|----|-----|-------|----------|
| S081 | Critical | residual position on over-fill | `exchange_order_submission.py:447-477` — `_open_residual_position` opens the leftover at filled_price with own margin + audit event |
| S082 | High | margin locked on fills | `_lock_margin` :324; debited at :299 / adv :195/:256; released proportionally at :424 + liquidation.py:121 |
| S094 | High | advanced orders wired | `check_advanced_orders()` in both `__main__.py` loops + `ws_broadcast.py:252` |
| S098 | High | arb rejection legs checked | `ws_broadcast.py:347-360` — FILLED statuses checked BEFORE close_opportunity; failure path logs both legs' rejection_reason |
| S102 | High | SimulatorAdapter real WS | `exchange_factory.py:67` — recv-loop broadcast cache, FIFO order futures (10s), honest `cancel_order()→False`; factory wiring :354-409 |
| S106 | High | copula math fixed | `copulaMath.js:181-195` — Lentz `betaCF`, single `/a` division in `regIncompleteBeta` |
| S092 | High | src/ml deleted | dir absent, 0 orphan imports |
| S095 | High | src/research deleted | dir absent, 0 orphan imports |

No WRONG/ROTTED entries.

## Round 49 — 2026-09-12 — zero-importer sweep → S125 dead-module cluster + S126 web-ui residue

- **S125 (High) → Open.** Systematic zero-importer scan of `ai-signal-bot/src` (70 modules): 11 modules (~1900 lines) have no production importer — they survive only through their own test files or `risk/__init__.py` re-exports:
  - `communication/shm_ring_buffer.py` (327) + `shm_signal_producer.py` (99) + `shm_market_data_writer.py` (124) + `shm_fill_consumer.py` (91) — a designed hft↔bot SHM IPC island; `run.py` instantiates none of them (only a health-check name mentions "shm").
  - `monitoring/alerting.py` (271) — `AlertSystem`, test-only.
  - `risk/cvar.py` (179) + `position_sizing.py` (198) + `stress_test.py` (202) — imported only by `risk/__init__.py` re-export + own tests.
  - `strategies/funding_arb_detector.py` (269) — `FundingRateArbitrageDetector`, test-only.
  - `technical_analysis/hawkes_funcs.py` (113, zero refs at all) + `hawkes_model.py` (91, test-only).
  Same class as S117 — needs per-domain wire-vs-delete calls.
- **S126 (Medium) → Open.** web-ui zero-importer residue: `ExchangeSelector.jsx` (no importers, absent from panel registry — cannot mount), `useInterval.js`+`.ts` (both twins dead), `usePerformance.js`, `utils/auditExport.js`, `utils/cn.js` — each survives only via its own test file (~1000 lines incl. tests).
- **Verified clean:** `exchange_simulator` — zero dead prod modules (all scan hits are pytest-collected tests/entry points); `walk_forward.py` live via `run_backtest.py`+`optimizer.py`+script; `utils/helpers.py` live via `run.py`.

## Round 50 — 2026-09-12 — S125 wired end-to-end, S126 kept

- **S125 → Done.** All 11 dead modules now have production reachability:
  - `communication/analysis_requests.py` (new, 366 lines): `cvar_analysis` → `risk/cvar.py` (VaR/CVaR/tail/stressed scenarios), `stress_test` → `risk/stress_test.py` (2008/COVID/FTX + custom shocks), `position_size` → `risk/position_sizing.py` (volatility/risk_parity/kelly), `hawkes_fit` → `technical_analysis/hawkes_funcs.py` (MLE grid search + intensity path; `hawkes_model.py` lives via it), `funding_arb_scan` → `strategies/funding_arb_detector.py` (request data or live `publisher.data_source` feed). Dispatch in `signal_publisher.py:184-229`; heavy math via `asyncio.to_thread`.
  - SHM channel in `run.py` behind `shm.enabled`: `ShmSignalProducer` (signals→`/hft_signals` ring in `_finalize_and_execute`), `ShmMarketDataWriter` (price slots per tick), `ShmFillConsumer` (poll task → `db.save_trade` + `trade_logger`). Bug fix: `push_signal_dict` pushed unix-second timestamps as nanoseconds — now normalizes.
  - `AlertSystem` in `run.py` behind `alerting.enabled`: rules daily_loss/no_fills/shm_disconnected/db_down; channels from `ALERT_*` env or settings.
  - `ws_client` handles `sync_state` + stores `funding_rates`/`candles_to_funding`.
  - UI: HawkesProcess, ConditionalValueAtRisk, PositionSizeOptimizer, FundingRateHistory, RiskDashboard send real requests via `sendSignalMessage`; 5 new result states in `useSignalData`; registry props updated.
  - Tests: +21 `test_analysis_requests.py` +15 `test_shm_alerting_wiring.py` (incl. real WS round-trips). Full suite: **1519 passed**.
- **S126 → Done (kept).** 6 zero-importer web-ui files retained per user decision (utility-library intent) — no code change.

**S127 (Low) — Done.** Verify R52 caught S029 rot: `toBeTruthy()` returned — 37 sites across 10 newer test files (RiskMetricsPanel, StreakPanel, competitionFramework, ExchangeBreakdown, BacktestComparison, BacktestRunner, ComparisonChart, CopulaModel, perfAreaChart, performanceDashboard). `expect(getBy*(...)).toBeTruthy()` is redundant (query throws on miss); `expect(container.firstChild).toBeTruthy()` is weak. All 37 → `toBeInTheDocument()` per project convention. 33/33 vitest green.

**S128 (Low) — Done.** `web-ui/.env.example` documented 7 env vars nothing reads: `VITE_DEFAULT_EXCHANGE/SYMBOL/TIMEFRAME` + `VITE_ENABLE_ADVANCED_ORDERS/AUDIT_LOGS/EXCHANGE_CLONES/SYMBOL_SEARCH` — with a note claiming "feature flags control visibility". Dead config documentation (S120 class on the env surface). Both blocks removed.

**S129 (Low) — Done.** Registry→component props drift: 22 panel entries sent props their components don't destructure (35 dead keys — FillAnalytics/TCA/Inventory/RealtimeAttribution the worst at 3-4 each; `title` flags on Auth/ChartTemplates/etc turned out nested-payload false positives). Dead selector evaluation + misleading contract. Keys trimmed; full vitest 1112 green.

**S130 (Medium) — Done.** Reverse props drift (registry sends less than components consume): **BacktestRunner** got only `{symbol, connected}` — its full backend pipeline (`sendSignalMessage`/`backtestResult`/compare/timeout) was unreachable; "Run Backtest" always failed with 'WebSocket not connected', and `connected` watched the exchange socket while backtest rides the signals socket. **PerformanceDashboard** got only `accounts` — `buildEquityCurve(undefined)` rendered a fake flat 10k equity curve and signal stats stayed zero forever. **IndicatorBuilder**'s `onIndicatorsChange` was never sent — its compute pipeline (BB/SMA/etc.) died in `?.()`. Fixes: runner + dashboard wired to `ctx.signals`/`ctx.exchange` props (correct socket for `connected`); IndicatorBuilder→CandleChart channel via `useUIStore.customIndicators` — panel-built indicators render as chart line overlays (user chose wire-over-delete). +6 tests; touched-area vitest green.

**S131 (Medium) — Done.** Grafana dashboards queried ~29 metric names no emitter produced — permanent "No Data" panels (ops-facing dishonesty): `latency-monitoring.json` and `system-overview.json` were 100% empty, `trading-overview`/`trading-performance` mostly empty; only `ai_signal_bot_metrics.json` was fully live. User chose **extend emitters**: (a) `hft-trade-bot` — `SystemMonitor` gained runtime gauges + a real histogram block fed every 10s from `print_status`: `hft_active_positions`, `hft_pnl_unrealized`, `hft_pnl_total` (new `PositionManager::total_realized_pnl` accumulated on `close_position`), `hft_memory_usage_mb` (psapi/`/proc/self/status`), `hft_shm_{signal,order,fill}_queue_depth` (ring `pending()`/`SPSCQueue::size()`), `hft_latency_us_bucket{le}` cumulative buckets via new `LatencyHistogram::snapshot_buckets` (+`sum_us`). (b) `ai-signal-bot` — `ai_signal_bot_{cpu_usage_percent,memory_usage_bytes}` sampled at scrape via `resource.getrusage`, `ai_signal_bot_sharpe_ratio` = per-interval Sharpe of the real `equity_curve` series (`db.get_equity_history`, pushed in `_snapshot_equity`). (c) `exchange_simulator` — `LatencyHistogram` helper + instrumentation: `errors_total`, `price_updates_total`, `order_latency`/`feed_latency`/`ws_latency` histograms, process metrics in `ws_prometheus`. (d) Dashboard repoints for names with real equivalents (`exchange_simulator_active_connections`→`exchange_connected_clients`, `model_accuracy`→`win_rate`, `pnl_daily`→`trading_daily_pnl`, etc.); the unreachable "Signal Rate by Strategy" panel (`SignalMsg` carries no strategy field) collapsed to a single real series. Post-check: every dashboard expr resolves to an emitted name. +6 py-tests, +7 doctests; gate 7/7 green.

**S132 (Medium) — Done.** Kill-switch notification channel write-only end-to-end: `KillSwitchMsg` (`shm_protocol.h`) was pushed by `KillSwitch::trigger()` into `/hft_kill_switch` with zero consumers — no Python reader, no web-ui path; meanwhile `MetricsExporter.record_kill_switch`/`trading_kill_switch_active` had zero production callers. Both ends of the contract existed; the middle was missing (S125-class unfinished SHM channel). Wired e2e: `shm_kill_switch_consumer.py` mirrors the fill-consumer pattern (KILL_SWITCH_STRUCT `<Q B B 6x`, REASON_NAMES matching `KillSwitch::Reason`), polling task in `_start_shm_channel`, `_on_kill_switch` latches `_hft_kill_active` + records the metric + logs critical; CRITICAL `hft_kill_switch` alert rule; `_finalize_and_execute` stops pushing signals to a dead hft bot; `shm.kill_switch_name` config. +9 tests; gate green.

**S133 (Low) — Done.** Doc-vs-wire drift: five message types sent over the WebSocket channels were absent from `docs/WEBSOCKET_PROTOCOL.md` — `audit_logs`, `replay_candles`, `replay_state`, `speed_set` (simulator :8765) and `circuit_breaker_status` (signal bot :8766). (`comparison_result` flagged by the scan was a false positive — already documented and emitted by `backtest_requests.py`.) Docs-only fix: added accurate sections for all five — payloads verified against producers (`AuditLog.to_dict` full field set, `_handle_replay`/`_handle_set_speed` payloads, `CircuitBreaker.get_status` + publisher `timestamp`); Message Type Summary gained the S→C rows plus the previously-unlisted `replay` C→S row. Post-fix scan: all 41 sent types documented.

**S134 (Medium) — Done.** Deploy-config drift around the ai-signal-bot health surface: `HealthServer` on :8080 (detailed `/health` + `/health/{exchange,database,shm}` + `/live` + `/ready` — the last two deliberately unauthenticated "for kubelet probes") was unreachable from every deploy config — zero references in helm/compose, port never published. Meanwhile helm liveness/readiness and all four compose healthchecks hit `MetricsExporter`'s :9090 `/health` stub that always returns `{"status":"ok"}` — k8s/compose could only see "aiohttp alive", exchange/db/shm degradation invisible; docs told users to `curl :8080/health` (unreachable). Fix: helm liveness→`/live`, readiness→`/ready` on new `aiSignalBot.ports.health:8080` + service port; all 4 compose files publish 8080 and health-check `localhost:8080/ready` (real `_check_all`, 503 on degradation).

**S135 (Low) — Done.** `docker-compose.yml` build-args still injected the four dead `VITE_ENABLE_*` flags removed in S128 (zero readers in web-ui/src) — the compose copy was missed. Removed; prod/staging/hub were already clean.

**S136 (Medium) — Done.** Dead config pair: `shared_config.yaml` was mounted into all 3 compose containers but read by zero production code (grep: only docs/scripts hits). Its sole consumer `scripts/test_config_consistency.py` was (a) not wired into CI or pre-commit, (b) crashed with `UnicodeEncodeError` on cp1251 consoles (S108 class), and (c) failed outright demanding a `price_feed` section deleted in S097. Fix: removed the 3 fake container mounts; fixed the script (utf-8 reconfigure, stale price_feed check replaced with the live `audit` check); wired it into `pre-commit-check.py` as `config: consistency` — runs when a config file is staged and in non-lint full modes. 5/5 checks pass.

**S137 (Medium) — Done.** `deploy.yml` post-deploy health loop checked `web-ui:3000/api/health` — nginx only serves exact-match `/health`; `/api/health` hits the SPA fallback and returns index.html with 200 — a check that cannot fail. Same loop also hit `:9092/health` (MetricsExporter stub, S134 class). Fixed: `:8080/ready` for ai-signal-bot (real `_check_all`) and `:3000/health` for web-ui (previously unchecked). Partial FP: the compose `:3001/api/health` target is Grafana — a real endpoint — left as-is.

**S138 (Low) — Done.** `scripts/load_test_50_symbols.py` — diverged duplicate of `exchange_simulator/tests/load_test_50_symbols.py` (the copy TESTING.md documents); zero references, pytest collects nothing from it. Deleted; closes old Finding 006.

**S139 (Low) — Done.** Makefile `ci-test`/`ci-quick` targets invoked `./ci-test.sh` — deleted in `c7025b7` ("duplicate test runners"), leaving broken targets. Repointed to the canonical gate: `pre-commit-check.py --all` / `--quick`.

**S140 (Low) — Done.** `cachetools==5.5.0` in `exchange_simulator/requirements.txt` — zero imports repo-wide (src + tests). Dead pin removed. (`matplotlib`, `msgpack`, `orjson`, all 7 web-ui deps verified in use.)

**S141 (Low) — Done (R62).** Exchange-credential env drift: `.env.prod.example` and `deploy/k8s/secrets.enc.yaml` defined `BINANCE_API_KEY`/`BINANCE_API_SECRET` (+ `OKX_*`, `BYBIT_*`, `FIX_USERNAME`/`FIX_PASSWORD`, `EXCHANGE_MODE`), but the only code that reads exchange credentials is `exchange_factory.py:347-348` — `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET`. Helm mapped no exchange creds; `EXCHANGE_MODE`/`LOG_LEVEL` were set by helm/compose but read by nothing. **Fix:** `.env.prod.example` and `secrets.enc.yaml` rewritten to the real env names (`EXCHANGE_API_KEY/SECRET`, `ALERT_*`, `AI_BOT_AUTH_TOKEN`) with disclosure that live trading is opt-in (`paper_trading: false` + `ccxt` install); dead `FIX_*`/`EXCHANGE_MODE`/`LOG_LEVEL`/`global.logLevel`/`env.exchangeMode` removed from helm templates/values and compose files; phantom TimescaleDB secret dropped.

**S142 (Low) — Done (R62, shipped).** Alertmanager was documented but absent: docs described `monitoring/alertmanager/config.yml`, envsubst vars, and a compose service — none existed. **Fix:** real `monitoring/alertmanager.yml` created (group_by `alertname`/`severity`/`service`, 1h critical repeat, critical→warning inhibition, empty `default` receiver with webhook/telegram examples); `alerting:` section added to `prometheus.yml` targeting `alertmanager:9093`; `prom/alertmanager:v0.27.0` service added to all three compose files with healthchecks and data volumes. Also fixed: prod/staging Prometheus never mounted `alerts.yml` — the 22 rules never loaded there; mount added.

**S143 (Medium) — Done.** `scripts/deploy.sh` + `scripts/deploy.bat` health-checked `http://localhost:8765/health` and `:8766/health` — pure WebSocket ports with no HTTP listener (sim health lives on :8775, ai-bot on :8080). Same wrong-port class as S122 — fixed in `docker-smoke-test.*` but the deploy twins were missed; on a healthy stack `all_healthy` never became true → 30 retries → false deploy failure. Found by slop-verify R61. Fixed R62: repointed to the compose canon — sim `:8775/health`, ai-bot `:8080/ready`, web-ui `:3000` → `:3000/health` (the bare URL only hit the SPA fallback). `.bat` doesn't gate (log-only semantics preserved).

**S144 (Low) — Done (R63).** `docker-compose.hub.yml` referenced `docker.io/ezpectus/hft-*:v2.0.0` images no CI job ever builds or pushes (deploy.yml pushes `ghcr.io/<repo>/<service>` semver/sha tags). Repointed to `ghcr.io/ezpectus/hft-tradebot--lite-version/<service>:latest` — `latest` is now tagged on every default-branch build via `type=raw,value=latest`.

**S145 (High) — Done (R63).** The `deploy` job was broken end-to-end: it copied 3 files to the server then ran `docker compose pull` — but `docker-compose.prod.yml` services had only `build:` contexts and no `image:` refs (nothing to pull; `up` would try to build without sources), and none of the bind-mounted config files (`monitoring/*.yml`, service configs, grafana provisioning) were copied (docker would create empty dirs). The job also only triggers on `v*` tags and no tags exist — it had never run. Fixed: `image:` refs added to all four prod services (`${IMAGE_TAG:-latest}`), scp source list now includes `monitoring/` + all service configs, the SSH step exports `IMAGE_TAG` from the pushed tag, and DEPLOYMENT.md documents the real flow + server prerequisites.

**S146 (Medium) — Done (R66).** Undeclared dependencies on live paths: `tabulate` is imported unguarded by `monitoring/tracker.py` which sits on the `run.py` startup path (`monitoring/__init__` re-export) — absent from `requirements.txt`, so the Docker image and fresh installs crash at import time (zero transitive providers). `scipy` was imported unguarded in `risk/cvar.py` while `var.py`/`markowitz.py`/`volatility_surface.py` all guard it — the `cvar_analysis` WS endpoint would crash on installs without scipy. **Fix:** `tabulate==0.9.0` declared; `cvar.py` now mirrors the `var.py` convention — `_HAS_SCIPY` guard + shared `_norm_ppf` (Beasley-Springer-Moro) + pure-math `_norm_pdf` + numpy skew/kurtosis fallbacks producing scipy-identical output (~1e-10). Verified via blocked-import simulation + 96 risk tests.

**S147 (Medium) — Done (R68).** `/hft_fills` SHM channel was write-only end-to-end: C++ `ShmFillProducer` was constructed in `init_ipc` but `push_fill` had zero call sites — the `fill` WS handler only `spdlog`-logged fills, so Python's `shm_fill_consumer` polled an eternally-empty ring. Latent contract bug found alongside: Python decoded `side` as `{1:BUY,2:SELL}` while the C++ protocol defines `0=BUY,1=SELL` — every SELL fill would have been persisted as BUY. **Fix:** `SignalReceiver::set_fill_producer` + `FillMsg` push in the fill handler (epoch-ns timestamp, `symbol_id_impl` lookup, side 0/1, fee, exchange_id=3); wired in `init_ipc`; Python decode corrected to `{0:BUY,1:SELL}`; test fixtures updated to the real contract. 53 shm tests green.

## Round 71 — 2026-09-14 — domain-required patterns sweep: 7 open findings (S148–S154)

Scope: the last large uncovered rulebook area — trading-domain reliability patterns (timeouts, backpressure, idempotency, gap-detection, graceful shutdown) across sim + ai-bot + web-ui + hft hot paths, plus root-level residue. Recorded only; no source changes.

**S148 (High) — Open.** Kill-switch "cancel all open orders" is a log stub. `KillSwitch::activate` promises step 1 "Cancel all open orders" (`kill_switch.h`) and calls `cancel_all_cb_` — wired in `bot_setup.cpp:175-176` to a bare `spdlog::warn("KILL SWITCH: Cancelling all open orders...")`. There is no cancel path anywhere: `OrderExecutor` has no cancel method, and the sim WS protocol has no `cancel_order` type (`ws_message_handler.py:143-167` dispatch table). Resting orders (LIMIT/GTD/PostOnly produced by the adaptive selector go PENDING in the sim) survive the kill switch and fill afterwards — re-opening positions after the emergency stop. Same false log in `graceful_shutdown` (`bot_loop.cpp:349` prints "cancelling all open orders" then only closes positions). The daily-loss kill switch leaves armed orders working.

**S149 (High) — Open.** `client_order_id` is dead end-to-end — the advertised idempotency does not exist. ai-bot sends `client_order_id=f"sig_{signal_id}"` (`run.py:542` → `ws_client.py:240`); `ARCHITECTURE.md:641` claims it provides deduplication. The simulator ignores it: `_submit_exchange_order` reads 14 fields (`ws_message_handler.py:230-244`), `client_order_id` is not one, no dedup table exists (0 refs in `exchange_simulator/`), and the field is absent from `WEBSOCKET_PROTOCOL.md`. A live duplicate vector exists: `useWebSocket.send()` queues up to 100 messages while disconnected and flushes them on reconnect (`useWebSocket.ts:161-172,280-290`) — an order placed during an outage returns "not sent" yet executes later at post-reconnect prices, and a user retry produces a second, undeduped execution.

**S150 (Medium) — Open.** `config.prod.yaml` production theatre — ~35 dead keys. Parsed but never consumed: `database.*` (7 keys — dsn/pool_min/pool_max/persist_trades/persist_signals/persist_positions/persist_candles), `redis.*` (3), `exchange.fallback_to_simulator`, `metrics.enabled`, `metrics.host`, `signal_engine_v2.thresholds.min_composite`, `signal_engine_v2.periods.vwap_window`, `trading.paper_trading` — all land in `Config` fields read only by the startup banner (`bot_setup.cpp:37-39` prints "DB: true | Redis: true" though zero DB/Redis code exists in src). `stop_loss_pct`/`take_profit_pct` are validated (`config_validate.h:20-27`) but never drive behavior (V2 uses sl/tp_atr_mult). Never parsed at all: `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}` (the kill switch is unconditional — `enabled:false` would not disable it), `adaptive_order_selector.{default_type,post_only_retries}`, `pressure_model.{obi_levels,microprice_enabled}` (microprice always computed), `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}` (symbol ids derive from list order). And the prod binary only ever dials `exchange.simulator_ws_url` — real-exchange execution was removed in S059.

**S151 (Medium) — Open.** `seq` broadcast field is write-only — advertised gap-detection absent. Every `candles` broadcast carries an incrementing `seq` (`ws_broadcast.py:421-422,472,510`); `WEBSOCKET_PROTOCOL.md:269` tells clients to "detect missed messages and request sync_state on gaps". Zero readers exist: `useExchangeData.js` never references `data.seq`, and `ws_client.py` (ai-bot) ignores it too. Reconnect heals books via a full `sync_state` snapshot (orderbooks included), but per-tick gap detection on the delta channel is absent — a dropped message lets `orderbook_deltas` apply silently onto a stale book.

**S152 (Medium) — Open.** `network/ws_client.h` is a dead abstraction toolkit; live connections have no watchdog. The header implements `Watchdog`, `MessageQueue`, `ReconnectionManager`, `SubscriptionManager`, `ReconnectPolicy` (~255 lines) — included only by tests (`test_network.cpp`, `test_signal_flow.cpp`); zero includes in src (the R51 "widely included" note was wrong). Real clients (`SignalReceiver`, `OrderExecutor`) hand-roll websocketpp reconnect with no ping/pong handler and no stale-data detection: a half-open TCP connection never fires `close_handler`, leaving `connected_=true` while market data silently stops — `prices_cache` goes stale and SL/TP/PnL run on dead prices indefinitely. The watchdog that would catch this sits unused in the same repo.

**S153 (Low) — Open.** `alerting.py` aiohttp session has no timeout — `ClientSession()` bare (`alerting.py:74`), unlike `engine.py:55` which sets `ClientTimeout`. A hung webhook POST blocks `check_rules`→`_send_alert` for aiohttp's implicit ~300s, delaying subsequent rule checks — a CRITICAL alert (daily_loss/kill_switch) queues behind a dead Discord webhook.

**S154 (Low) — Open.** Adaptive order kinds die before the wire. `AdaptiveOrderSelectorV2::select` picks IOC/FOK/GTD/POST_ONLY and the logs say so (`bot_loop.cpp:179-198` logs "kind=GTD"), but `execute_v2_order` consumes only `limit_price`, and `submit_order` re-derives MARKET/LIMIT via a second selector (`OrderTypeSelector`, `order_executor.h:109`) — kind/TIF/expiry are dropped; `gtd_seconds` feeds an `expire_ns` that never leaves the process. `to_{binance,okx,bybit}_{type,tif}` + `to_exchange_*` — 7 functions, ~100 lines — are called only by tests. Logged order type ≠ sent order type.

**Verified clean this round:** sim `_cleanup_client` pops all per-client dicts + rate-limit 1000/min + per-message try + `max_size=1MB`; `signal_publisher` bounded sends `wait_for(5s)` + `max_clients=50` + auth `wait_for(10s)`; ai-bot `ws_client.py` recv watchdog `wait_for(30s)` + `open_timeout=10` + ping 10/10 + jittered backoff; `market_data_feed.py` bounded `asyncio.Queue(500)` with drop-oldest + ping keepalive + gap-fill on reconnect; `useWebSocket.ts` ring buffer 5000 + outgoing cap 100 + maxReconnects 20 + app-ping 5s; `sync_state` includes full orderbooks; `OrderExecutor` honest bool + arb unwind leg + JSON truncation guard; `KillSwitch` idempotent + monitor thread joinable + SHM notify wired (S132); root-level residue (`websocketpp/`, `vcpkg/`, `node_modules/`, `audit/`, `hft-skills/`, root scripts/docs) all untracked.

## Round 72 — 2026-09-14 — security surface sweep: 4 open findings (S155–S158)

Scope: the remaining rulebook section — security holes: auth depth on WS/HTTP listeners, unauthenticated control endpoints, binds, CORS, token transport, secrets-in-logs, SHM permissions. Recorded only; no source changes.

**S155 (High) — Open.** The exchange simulator's control plane has zero authentication. `exchange_simulator/` contains no auth/token/password code at all — `ws_message_handler.py:143-167` accepts from any connected client: `order` (orders on any exchange account), `close_position` (force-close any position), `start_trading`/`stop_trading` (one message halts trading for ALL clients — instant DoS), `update_config` (mutates `volatility`/`fee_pct`/`slippage_bps`/`account.leverage` with **no bounds** — a negative fee pays the filler free money; leverage→0 breaks margin math), `set_speed`/`replay` (pause/scrub the whole market), `options_chain` (compute spam). Data plane and control plane share one open port published in dev+prod compose; the 1000 msg/min rate limit stops floods, not a single command.

**S156 (High) — Open.** The containerized simulator binds `localhost` while compose publishes its ports — a green-but-dead deployment. `config.yaml:313` `websocket.host: "localhost"` (+ `metrics.host: "localhost"`) is read at `__main__.py:136` with no env override (only `LOG_FORMAT`/`SHM_*` are env-read); the same file is mounted read-only into dev and prod containers, and no Dockerfile sets a host env. Compose publishes `8765:8765`/`8775:8775` — docker-proxy forwards to the container IP where nothing listens → the web UI and external clients can never connect. The healthcheck curls `localhost:8775` **inside** the container → stays green while the data feed is unreachable. `DEPLOYMENT.md:22` claims "`docker-compose up` = everything works" — false (corrected). The ai-bot does this right: `AI_BOT_BIND_HOST` env defaults to `0.0.0.0` (`run.py:87`).

**S157 (Medium) — Open.** Signal-publisher auth hygiene cluster. (a) Fail-open: `signal_publisher.py:124` `if self._auth_token:` — an empty token disables auth **silently** (no startup warning; `run.py:88`); (b) `.env.prod.example:37` ships `AI_BOT_AUTH_TOKEN=` empty, so the documented prod deploy exposes :8766 with the full signal feed + connect-time signal history + **10 compute endpoints** (`run_backtest`, `optimize_portfolio`, `hawkes_fit`, `cvar_analysis`, `stress_test`, `vol_surface`, `funding_arb_scan`, `position_size`, `compare_backtests`) with no per-client rate limit — backtest spam = CPU DoS of the whole bot; (c) tokens compared with `==` at `signal_publisher.py:128` and `health_server.py:157` — timing side channel, `secrets.compare_digest` is the fix; (d) the UI token is baked into the JS bundle at build time (`VITE_SIGNAL_TOKEN`).

**S158 (Medium) — Open.** hft health server: one idle connection freezes probing. `health_server.h:105-118` runs a single-threaded accept loop with a blocking `::read`/`recv` and no `SO_RCVTIMEO`/deadline — a client that opens TCP and sends nothing blocks the server forever; every later connection queues on `listen(…,4)` backlog → `/health` and `/metrics` time out → docker/k8s probes fail → restart loop of a healthy bot. Also: `INADDR_ANY` with no auth serves `monitor_->format_json()` (positions/PnL) on the published :9091 — trading-state info leak.

**Verified clean this round:** SHM perms `0600`/`0o600` on both sides (C++ `shm_open`, Python `os.open`, `multiprocessing.SharedMemory`) — local signal injection closed; zero CORS/`Access-Control` headers repo-wide (no `*`); token sent as an in-band `{type:"auth"}` frame, not a URL query; auth-failure logs don't echo the token; `_sanitize_log` applied to user-controlled values; ai-bot health middleware exempts only `/live`+`/ready`; Grafana admin password is `${GRAFANA_PASSWORD:?required}` in dev+prod; notifier suppresses aiohttp debug logging (no Telegram/Discord token leakage); sim enforces `max_size=1MB` + per-client 1000 msg/min; publisher auth handshake bounded `wait_for(10s)`.

## Round 73 — 2026-09-14 — config leaf-key sweep: 3 open findings (S159–S161)

Scope: the last un-audited config surface — leaf keys of `exchange_simulator/config.yaml`, `ai-signal-bot/config/settings.yaml`, hft dev `config/config.yaml` (S150 covered only `config.prod.yaml`), plus web-ui build config (vite/netlify/nginx). Every key traced to a runtime reader; recorded only, no source changes.

**S159 (Medium) — Open.** Config dead-key cluster across all three services — ~16 keys that are parsed/validated but never reach runtime. **exchange_simulator `config.yaml`:** `metrics.{enabled,port,host}` (:317-320) are all dead — `_run_metrics_server` starts unconditionally on `self.port+10` bound to `self.host` (`websocket_server.py:179-189`); the `enabled: false` comment "Off by default" is a lie, and both the compose healthcheck and the Prometheus job (`CONFIGURATION_GUIDE.md:486`) silently depend on the "disabled" server — an honest gate would break healthchecks. `account.currency` (:301) dies end-to-end: `SimulatedExchange.__init__` has no currency param (`exchange.py:40-49`) and `Account.currency` is hardcoded `"USDT"` (models.py:405). `visualizer.enabled` (:306) is never read — `viz_cfg` consumes only `refresh_interval`/`chart_width`/`chart_height` (`__main__.py:96-104`); the real gate is the `--no-visualizer` CLI flag. `market.timeframe` (:291) is cross-checked by the validator only — runtime reads `timeframe_seconds` alone. `exchanges.<id>.symbols` (:23,78,133 — ~147 yaml lines) are validated and cross-referenced but never passed to `SimulatedExchange` — every exchange serves all 49 `initial_prices`, so trimming a list does nothing except trip validator errors. **ai-bot:** `shm.max_symbols` (settings.yaml:175) is dead — no config property and `run.py:280` derives `len(symbol_names)`. **hft dev `config.yaml`:** `signal_engine_v2.obi_levels: 20` (:109) is a dead scalar — the parser reads `obi_levels_5/10/20` (config_parser.h:96-98); `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` (:91,97-98) parse into `cfg` but `EngineParams` has no such fields and `bot_setup.cpp:153-159` never wires them — the FFT block is gated by the literal `closes.size() >= 64u` (signal_engine.h:297), so `fft_enabled: false` cannot turn off ~100 lines of FFT math; `metrics.{port,host}` (:148-149) are dead on the dev path (`is_production ? metrics_port : 9091` + hardcoded `INADDR_ANY`). Plus a four-way `obi_levels` drift: dev scalar / prod `pressure_model.obi_levels` list (config.prod.yaml:89) / parser split-keys / `CONFIGURATION_GUIDE.md:294` — four spellings, zero effective; the engine always runs compiled {5,10,20}. Extends S150.

**S160 (Info) — Open.** PWA manifest counts are stale: `vite.config.js:15` description claims "204 panels and 44+ math models" — `panels/registry.js` actually has 278 `{ id:` entries (~74 panels added since the text was written). The install-prompt/description misstates the dashboard's size; "44+ math models" is unverifiable (no model registry exists) but the panel count alone proves the text rots.

**S161 (Low) — Open.** `CONFIGURATION_GUIDE.md` §2 documents a phantom simulator config. The header points to `exchange_simulator/config/settings.yaml` (real file: `config.yaml`), the table documents top-level `host`/`port` (real keys live under `websocket:`), `compression: deflate` (no key — hardcoded at `websocket_server.py:184`), `max_symbols: 50` (no key — SHM slots come from env `SHM_MARKET_MAX_SYMBOLS`, symbols derive from `initial_prices`), `tick_interval_ms: 1000` (no key — literal `_tick_interval = 1.0` at :74), and `encoding: json|msgpack` (no key — per-client `_client_encodings`). The fees block documents `maker_fee_bps`/`taker_fee_bps` — the real schema is a single `fee_pct` + `slippage_bps` with no maker/taker split. An operator following this section edits keys that don't exist and silently changes nothing.

**Verified clean this round:** ai-bot `metrics.enabled` is a real gate (`run.py:194` — `enable_metrics or config.metrics_enabled`) — the honest counterpart to the sim's dead flag; every other `settings.yaml` leaf has a live reader; hft dev-config remainder is wired (`hft_strategies` periods/toggles → `EngineParams`, `adaptive_order_selector.*` → selector params, `latency_optimization.*`/`ai_signal_bot.*`/`signal_engine_v3`/`logging.*`/`trading.*`/`risk.*`/`exchange.*` → `cfg`); `netlify.toml` is live (deploy.yml Netlify job); `nginx.conf` has real security headers/health/SPA fallback; `VitePWA autoUpdate` injects SW registration itself (no missing `registerSW`); web-ui generated dirs (`dist/`, `coverage/`, `playwright-report/`, `test-results/`, `screenshots/`) all gitignored; helm `OPENAI_API_KEY` if/else is a value-or-secret pattern, not a dup. Doc fix: `CONFIGURATION_GUIDE.md` `obi_levels` claim corrected.

## Round 74 — 2026-09-14 — protocol-doc truth sweep + monitoring: 2 open findings (S162–S163)

Scope: `WEBSOCKET_PROTOCOL.md` verified field-by-field against `ws_message_handler`/`ws_broadcast` (sim :8765) and `signal_publisher` + request modules (ai-bot :8766); Grafana dashboard queries + `alerts.yml` expressions checked against emitted metrics.

**S162 (Medium) — Open.** The :8765 section of `WEBSOCKET_PROTOCOL.md` is wrong in 8 verified ways. (1) `config_update` doesn't exist — the dispatcher key is `update_config` (`ws_message_handler.py:163`) and the schema differs too: doc shows `{"config":{fees:{maker,taker}}}` but the handler reads a flat `updates` map `{fees:{ex:fee_pct},volatility,slippage,leverage}` (:400-424) — a doc-following client gets an unknown-type error. (2) `position` broadcast has zero emitters — positions only ride inside `account` in snapshot/candles. (3) `speed_change` broadcast has zero emitters — the real `speed_set` reply goes only to the requesting client (:331); other clients never learn the speed changed. (4) `config_updated` — doc claims a broadcast carrying `config`+`timestamp`; code sends a sender-only ack echoing `updates` (:424). (5) `fills_batch.fills` — the real key is `orders` (`ws_broadcast.py:296-298`); a doc-following client reads `data.fills` → undefined → silently drops every batched fill. (6) `welcome.server_name` — real key is `server` (:72), and welcome is sent on connect, not "in response to subscribe". (7) `error.code` — no error emitter carries `code`. (8) Undocumented: `start_trading`/`stop_trading` commands (the kill commands from S155) and five `candles` payload fields (`funding_rates`, `candles_to_funding`, `news_event`, `weekend_mode`, `trading_active` — `ws_broadcast.py:478-481`). Anyone implementing a client from this doc breaks in at least four places. Doc corrected.

**S163 (Medium) — Open.** Grafana `latency-monitoring.json`: 6 of 8 latency panels are permanently empty — `histogram_quantile(0.50/0.99, exchange_simulator_{order,websocket,price_feed}_latency_seconds)` (:47,63,79,95,111,127) query the bare metric name, but the sim only emits `name_bucket{le=...}` series (`ws_metrics.py:29-30`) → the selector returns nothing → `histogram_quantile` yields no data. The correct `_bucket`+`rate()` form sits three panels away (:15,:31 for `trading_signal_latency`, :159 for the distribution) — half the dashboard is written right, half isn't. In an incident, the operator stares at empty latency panels.

**Verified clean this round:** the entire :8766 section is honest — all 9 compute request types and all 9 `*_result` response names match emitters in `analysis_requests.py`/`backtest_requests.py`/`portfolio_requests.py`, plus `auth`/`auth_ok`/`auth_failed`, `signal`, `signal_history`, `market_regime`, `circuit_breaker_status`; sim `subscribe` reads all 3 documented fields with honest msgpack fallback, `unsubscribe` sends no response as documented, `trading_state` is a real broadcast (:394), `snapshot`/`sync_state`/`pong`/`replay_*`/`audit_logs`/`options_chain`/`arbitrage_scan`/`fill` all emit; `alerts.yml` — all 22 expressions resolve to emitted metrics (incl. `exchange_orders_rejected_total`, `exchange_equity`/`balance`, `ai_signal_bot_drawdown/win_rate/pnl_total`); hft dashboard — all 10 queried `hft_*` metrics emit via `format_prometheus()`.

## Round 75 — 2026-09-14 — infra-config honesty (helm/terraform/alertmanager/Makefile): 2 open findings (S164–S165)

Scope: leaf-key sweep of `helm/values.yaml` vs `.Values` consumers + all 10 templates, terraform variables vs `var.*` uses, alertmanager routing, Makefile targets vs referenced files.

**S164 (High) — Open.** The helm chart renders a non-functional system. (1) `ai-signal-bot.yaml` never sets `WS_URL` — the bot dials the baked default `ws://localhost:8765` (settings.yaml:73) = its own pod loopback → the `*-exchange-simulator` Service is unreachable → no market data → no signals → the hft sidecar starves, while `/live`+`/ready` probes stay green. (2) `exchange-simulator.yaml` mounts no config (image bakes `config.yaml` with `host: localhost` via `COPY . .`) — k8s httpGet probes hit the pod IP, not loopback → **CrashLoopBackOff** (worse than compose-S156's green-but-dead), and the chart offers no way to mount a corrected config. (3) The Prometheus ConfigMap (`prometheus.yaml:87-99`) contains only `scrape_interval` + 3 jobs — **no `rule_files`, no `alerting:`**, and no alertmanager template exists in the chart → zero alert pipeline in k8s (`alerts.yml`/`alertmanager.yml` are compose-only). (4) The Grafana StatefulSet mounts only `/var/lib/grafana` — no provisioning volume → no datasource, no dashboards: an empty Grafana. (5) `network-policy.yaml` default-denies egress except same-release pods + DNS + ingress-nginx — while the chart wires `OPENAI_API_KEY` → api.openai.com is blocked → LLM path dead. (6) hft sidecar: `readOnlyRootFilesystem` with trigger file `/tmp/kill_switch` on the rootfs → file-triggered kill switch unreachable (the SHM flag under mounted `/dev/shm` still works). (7) `webUi.wsExchange`/`wsSignals` are required `--set` values consumed only by `fail` guards (`web-ui.yaml:2-7`) — they never reach the pod; the guard creates false confidence while the image bundle may contain any baked URL. (8) `AI_BOT_AUTH_TOKEN` is never set → publisher auth fail-open in cluster (extends S157).

**S165 (Info) — Open.** Small infra residue: `terraform/modules/eks/main.tf:15` declares `variable "vpc_id"` and both environments pass `module.vpc.vpc_id` into it — but `var.vpc_id` is never referenced inside the module (dead interface input). `Makefile` — the five trailing targets (`ci-test`, `ci-quick`, `benchmark`, `walk-forward`, `docker-hub`) are missing from `.PHONY` (:1) — a file with that name would silently disable the target.

**Verified clean this round:** every `values.yaml` key (~44) has a `.Values.*` consumer — zero dead values; `alertmanager.yml` honestly documents "nothing is sent until you wire a channel" with valid routing/inhibit syntax; `make logs` targets real files — `_latest.log` symlinks from `run_logger.py:103`, `hft_trade_bot_latest.log` is a real second sink (`logger.h:43-55`), `trades_latest.csv` from `trade_csv_logger.py:51` via sim `websocket_server.py:80`; all Makefile targets point at existing files; 10/11 terraform variables consumed; `hft-trade-bot.yaml` is an honestly-documented empty template (sidecar pattern).

## Round 76 — 2026-09-14 — test-honesty sweep: 3 open findings (S166–S168)

Scope: first dedicated pass over test-suite quality — 157 vitest files + 4 e2e specs (web-ui), 99 ai-bot + 29 sim pytest files, 25 hft doctest files, `monitoring/tests`. Patterns: vacuous asserts, fixture-self-asserts, shadow-copy tests, orphan tests, CI gating.

**S166 (Low) — Open.** Vitest placeholder theatre. `web-ui/src/test/exchange-ui.test.jsx` (267 lines, 25 `it` blocks, 50 expects) — 17 are unconditional `expect(true).toBe(true)` with comments like "This test would verify that order forms use the correct theme" — covering (on paper) exchange themes, state persistence across exchange switches, stop-limit/trailing-stop/iceberg order fields, advanced-order validation, and audit-log UI. Another 27 expects assert the test's own fixture literals: `expect(mockBinanceTheme).toHaveProperty('primary')` ×24 across three mock theme objects, plus `mockBinanceTheme.primary.not.toBe(mockBybitTheme.primary)` ×3 — proving the local constants differ from each other, which says nothing about the app. Only ~6 of 50 expects touch the real `ExchangeProvider`. `performance.test.jsx` adds 2 more unconditional asserts ("manual chunks configured", "target <2s initial load time" — both `expect(true)`). The suite reports 34 green "tests" of coverage that does not exist: regressions in order-form UI, exchange switching, and Vite perf config all pass silently.

**S167 (Medium) — Open.** Five math test files test shadow copies, not production code. `cointegration.test.js`, `garch.test.js`, `hmm.test.js`, `kalman.test.js`, `kmeans.test.js` — 85 expects total, and the only import in each is `vitest`. The algorithms under test (`calcADF`, `ols`, `calcZScore`, `calcHalfLife`, `forward`…) are defined **inside the test files** as copies ("Tests the core algorithms extracted from CointegrationScanner.jsx"). The production implementations live separately — `PairTradingSignals.jsx` (z-score/cointegration), `GARCHVolatility.jsx`, `HiddenMarkovModel.jsx`, `KalmanFilterPrice.jsx`, `KMeansClustering.jsx` — and are never imported. A regression in production math breaks zero tests; the copies can diverge from the originals forever while the suite stays green. It proves the test-file snapshots are self-consistent, not that the shipped math is correct.

**S168 (Info) — Open.** `ARCHITECTURE.md:422` claims "103 test files (99 unit + 4 e2e)" — stale since ~58 test files were added; actual is 157 vitest files + 4 e2e specs. README:121 ("157 test files") and :195 ("162 test files" = 157+4+helper) are accurate — only the architecture table rots.

**Verified clean this round:** Python suites are honest — ai-bot 99 + sim 29 files use real asserts and mock-assertion APIs (`assert_called_once_with`/`assert_not_called`); the no-assert scan produced zero true hits (`test_run_equity.py` was a false positive). `monitoring/tests/test_alerts.py` is real schema validation of `alerts.yml` (5 groups, severity enum, required `expr`/`for`/`labels`/`annotations`). The 4 e2e specs carry 34 real expects and are CI-gated — `test-e2e` job has no `continue-on-error`/`|| true` and feeds the `check_result` test-summary gate; `screenshots.spec.js` is an honestly-named README capture script, not test theatre. hft doctest suite: 565 REQUIRE/CHECK across 17 files — substantive (that they exercise dead abstractions is S152's point, not vacuity). `monitoring/alerts/` is an empty untracked local directory, not committed residue.

## Round 77 — 2026-09-14 — panel-registry wiring + stores/hooks sweep: 1 open finding (S169)

Scope: the rulebook's proven bug class #1 — panels off the data path — swept across all 278 `registry.js` entries, plus `stores/` and a hooks leaf-sweep for zero-importers and `.js`/`.ts` duplicates.

**S169 (Low) — Open.** Dead hooks + 471 lines of tests for dead code. `hooks/useInterval.js` (15 lines) and `hooks/useInterval.ts` (36 lines, documented) are a duplicate pair with **zero production importers** — only `test/useInterval.test.jsx` (182 lines) imports `'../hooks/useInterval'` extensionless, and Vite resolves `.js` before `.ts`, so the test exercises the short untyped copy while the documented `.ts` is a pure shadow; any future importer silently gets `.js`. `hooks/usePerformance.js` (152 lines) exports five hooks — `useDebouncedValue` (a duplicate of live `useDebounce.ts`), `useThrottledCallback`, `useBatchedUpdates`, `useWorker`, `useIntersectionObserver` — with zero production importers; it lives only in `usePerformance.test.jsx` (289 lines). ~203 lines of dead hooks + 471 lines of tests that inflate the suite's green count — same test-to-nowhere disease as S167.

**Verified clean this round:** every registry entry resolves to an existing component (0 missing files); the 15 `props: () => ({})` entries are all honest — eight `NoDataFeed` disclosures ("feed is not produced by the backend": Colocation, ABTesting, LogDashboard, PacketInspector, HyperoptUI, RetrainingPipeline, GeneticViewer, CancelMonitor), `OptionsPricing`/`OptionsStrategies` are interactive calculators (user params → real BS math), `BacktestComparison` is a localStorage saved-results viewer, `OnboardingTutorial` needs no data, `StrategyMarketplace` discloses "local only", `DashboardProfiler` reads real Web Vitals via `utils/performanceMonitor`, `StrategyBacktest` self-subscribes. `MOCK_` appears only inside `MockModeBanner` (the detector); all 27 `Math.random()` sites are legitimate simulation math (Box-Muller/MC sampling, k-means centroid init, shuffles, ID generation) — zero fabricated market data. Stores are wired correctly (`useTradingStore` has 6 consumers incl. `useTradingStoreSync` → `usePanelContext` → panels); the other 19 hooks all have production importers; `useDebounce.ts` is live (4 panels).
