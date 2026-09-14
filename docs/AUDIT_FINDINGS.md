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

**S148 (High) — Fixed in R77-fix.** Kill-switch "cancel all open orders" is a log stub. `KillSwitch::activate` promises step 1 "Cancel all open orders" (`kill_switch.h`) and calls `cancel_all_cb_` — wired in `bot_setup.cpp:175-176` to a bare `spdlog::warn("KILL SWITCH: Cancelling all open orders...")`. There is no cancel path anywhere: `OrderExecutor` has no cancel method, and the sim WS protocol has no `cancel_order` type (`ws_message_handler.py:143-167` dispatch table). Resting orders (LIMIT/GTD/PostOnly produced by the adaptive selector go PENDING in the sim) survive the kill switch and fill afterwards — re-opening positions after the emergency stop. Same false log in `graceful_shutdown` (`bot_loop.cpp:349` prints "cancelling all open orders" then only closes positions). The daily-loss kill switch leaves armed orders working.

**S149 (High) — Fixed in R77-fix.** `client_order_id` is dead end-to-end — the advertised idempotency does not exist. ai-bot sends `client_order_id=f"sig_{signal_id}"` (`run.py:542` → `ws_client.py:240`); `ARCHITECTURE.md:641` claims it provides deduplication. The simulator ignores it: `_submit_exchange_order` reads 14 fields (`ws_message_handler.py:230-244`), `client_order_id` is not one, no dedup table exists (0 refs in `exchange_simulator/`), and the field is absent from `WEBSOCKET_PROTOCOL.md`. A live duplicate vector exists: `useWebSocket.send()` queues up to 100 messages while disconnected and flushes them on reconnect (`useWebSocket.ts:161-172,280-290`) — an order placed during an outage returns "not sent" yet executes later at post-reconnect prices, and a user retry produces a second, undeduped execution.

**S150 (Medium) — Fixed in R97.** `config.prod.yaml` production theatre — ~35 dead keys. Parsed but never consumed: `database.*` (7 keys — dsn/pool_min/pool_max/persist_trades/persist_signals/persist_positions/persist_candles), `redis.*` (3), `exchange.fallback_to_simulator`, `metrics.enabled`, `metrics.host`, `signal_engine_v2.thresholds.min_composite`, `signal_engine_v2.periods.vwap_window`, `trading.paper_trading` — all land in `Config` fields read only by the startup banner (`bot_setup.cpp:37-39` prints "DB: true | Redis: true" though zero DB/Redis code exists in src). `stop_loss_pct`/`take_profit_pct` are validated (`config_validate.h:20-27`) but never drive behavior (V2 uses sl/tp_atr_mult). Never parsed at all: `risk.kill_switch.{enabled,auto_cancel_orders,auto_close_positions}` (the kill switch is unconditional — `enabled:false` would not disable it), `adaptive_order_selector.{default_type,post_only_retries}`, `pressure_model.{obi_levels,microprice_enabled}` (microprice always computed), `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}` (symbol ids derive from list order). And the prod binary only ever dials `exchange.simulator_ws_url` — real-exchange execution was removed in S059.

**Fix:** ~33 dead leaf keys deleted from `config.prod.yaml` along with their `Config` fields, parse sites, validators, and banner lines (`database.*`, `redis.*`, `fallback_to_simulator`, `paper_trading`, `stop_loss_pct`/`take_profit_pct`, `min_composite`, `vwap_window`, `risk.kill_switch.{enabled,auto_*}`, `adaptive_order_selector.{default_type,post_only_retries}`, `latency_optimization.{signal_thread_core,market_data_core,spsc_queue_capacity,object_pool_size}`, `symbols[].{id,max_leverage}`). Audit corrections verified against code: `metrics.*` is live (HealthServer gate), `microprice_enabled`/`obi_levels_*` live (wired at bot_setup:108-110,156), `daily_loss_limit`/`max_drawdown_pct`/`max_leverage` are real guards/`RiskManager::Params`. `system.mode` now gates `is_production`. `clear_secrets()` removed (no secrets left). Bonus: `test_integration_config` was uncompilable (`config.leverage` nonexistent) — repaired. DEPLOYMENT.md sample updated to the real schema.

**S151 (Medium) — Fixed in R97.** `seq` broadcast field is write-only — advertised gap-detection absent. Every `candles` broadcast carries an incrementing `seq` (`ws_broadcast.py:421-422,472,510`); `WEBSOCKET_PROTOCOL.md:269` tells clients to "detect missed messages and request sync_state on gaps". Zero readers exist: `useExchangeData.js` never references `data.seq`, and `ws_client.py` (ai-bot) ignores it too. Reconnect heals books via a full `sync_state` snapshot (orderbooks included), but per-tick gap detection on the delta channel is absent — a dropped message lets `orderbook_deltas` apply silently onto a stale book.

**Fix:** gap detection wired in both protocol clients. `useExchangeData.js` tracks `lastSeqRef` — a `candles` seq gap requests `sync_state` with the pre-gap timestamp cursor (ts updates AFTER the gap check so the server resends the dropped range), 5s cooldown, baseline reset on socket open (server counter restarts). `ws_client.py` (ai-bot) does the same via `_request_resync`/`_send_resync` with `create_task` inside the recv loop, baseline reset on `welcome`. Tests: 4 new pytest cases (gap/contiguous/cooldown/reset) + 3 vitest cases.

**S152 (Medium) — Fixed in R97.** `network/ws_client.h` is a dead abstraction toolkit; live connections have no watchdog. The header implements `Watchdog`, `MessageQueue`, `ReconnectionManager`, `SubscriptionManager`, `ReconnectPolicy` (~255 lines) — included only by tests (`test_network.cpp`, `test_signal_flow.cpp`); zero includes in src (the R51 "widely included" note was wrong). Real clients (`SignalReceiver`, `OrderExecutor`) hand-roll websocketpp reconnect with no ping/pong handler and no stale-data detection: a half-open TCP connection never fires `close_handler`, leaving `connected_=true` while market data silently stops — `prices_cache` goes stale and SL/TP/PnL run on dead prices indefinitely. The watchdog that would catch this sits unused in the same repo.

**Fix:** `ws_client.h` trimmed to `src/network/watchdog.h` — only `Watchdog` survives (the other 5 abstractions were proven-dead and deleted with their test blocks). `Watchdog` is now wired into BOTH live connections: `SignalReceiver` feeds it on open/message/ping/pong; `OrderExecutor` feeds on open/ping/pong (its socket carries no data stream — server pings at 10s cadence are the liveness signal). A 2s monitor thread force-`terminate()`s a 15s-silent connection, driving the existing close→reconnect path; dead handles fall back to direct `schedule_reconnect`. `client_` is a plain `shared_ptr` under `client_mtx_` with a `client_snapshot()` helper (`atomic<shared_ptr>` is absent from mingw-libc++ — a mutex snapshot is portable); the reconnect sleeper became a joinable, cv-interruptible `reconnect_thread_` — the old detached thread could outlive the object and dereference a dangling `this`, and disconnect() can no longer stall 30s joining it. `test_signal_flow.cpp` had rotted past compilability (`ShmRingBuffer<T,N>`→ctor(capacity), `FastSignal.symbol_id`/`direction:int`/`timestamp_ns` renamed) — repaired. `test_network.cpp` trimmed to watchdog tests.

**S153 (Low) — Fixed in R92.** `alerting.py` aiohttp session has no timeout — `ClientSession()` bare (`alerting.py:74`), unlike `engine.py:55` which sets `ClientTimeout`. A hung webhook POST blocks `check_rules`→`_send_alert` for aiohttp's implicit ~300s, delaying subsequent rule checks — a CRITICAL alert (daily_loss/kill_switch) queues behind a dead Discord webhook.

**S154 (Low) — Fixed in R97.** Adaptive order kinds die before the wire. `AdaptiveOrderSelectorV2::select` picks IOC/FOK/GTD/POST_ONLY and the logs say so (`bot_loop.cpp:179-198` logs "kind=GTD"), but `execute_v2_order` consumes only `limit_price`, and `submit_order` re-derives MARKET/LIMIT via a second selector (`OrderTypeSelector`, `order_executor.h:109`) — kind/TIF/expiry are dropped; `gtd_seconds` feeds an `expire_ns` that never leaves the process. `to_{binance,okx,bybit}_{type,tif}` + `to_exchange_*` — 7 functions, ~100 lines — are called only by tests. Logged order type ≠ sent order type.

**Fix:** end-to-end TIF semantics. `OrderSelection` now carries kind+limit_price+expire_ns into a new TIF-aware `OrderExecutor::submit_order` overload that serializes `time_in_force`/`post_only`/`expire_ms`/`price`. `ws_message_handler` parses+validates the fields; the sim honors real semantics — IOC/FOK never rest (FOK checks book depth via `_depth_covers`), post_only rejects when marketable, GTD rests until `expire_ts` then cancels via the pending-order sweep. Terminal non-FILLED events now reach clients (`ws_broadcast` ships all `closed_orders`, not just FILLED — the UI's `trackOrderStatus` evicts them from `openOrders`). Dead `to_{binance,okx,bybit,exchange}_{type,tif}` mapping layer (~100 lines) + test blocks deleted. `Order` carries `time_in_force`/`expire_ts`/`post_only` through `to_dict`. New `test_time_in_force.py` — 12 cases incl. MARKET+TIF reject and GTD expiry sweep.

**Verified clean this round:** sim `_cleanup_client` pops all per-client dicts + rate-limit 1000/min + per-message try + `max_size=1MB`; `signal_publisher` bounded sends `wait_for(5s)` + `max_clients=50` + auth `wait_for(10s)`; ai-bot `ws_client.py` recv watchdog `wait_for(30s)` + `open_timeout=10` + ping 10/10 + jittered backoff; `market_data_feed.py` bounded `asyncio.Queue(500)` with drop-oldest + ping keepalive + gap-fill on reconnect; `useWebSocket.ts` ring buffer 5000 + outgoing cap 100 + maxReconnects 20 + app-ping 5s; `sync_state` includes full orderbooks; `OrderExecutor` honest bool + arb unwind leg + JSON truncation guard; `KillSwitch` idempotent + monitor thread joinable + SHM notify wired (S132); root-level residue (`websocketpp/`, `vcpkg/`, `node_modules/`, `audit/`, `hft-skills/`, root scripts/docs) all untracked.

## Round 72 — 2026-09-14 — security surface sweep: 4 open findings (S155–S158)

Scope: the remaining rulebook section — security holes: auth depth on WS/HTTP listeners, unauthenticated control endpoints, binds, CORS, token transport, secrets-in-logs, SHM permissions. Recorded only; no source changes.

**S155 (High) — Fixed in R77-fix.** The exchange simulator's control plane has zero authentication. `exchange_simulator/` contains no auth/token/password code at all — `ws_message_handler.py:143-167` accepts from any connected client: `order` (orders on any exchange account), `close_position` (force-close any position), `start_trading`/`stop_trading` (one message halts trading for ALL clients — instant DoS), `update_config` (mutates `volatility`/`fee_pct`/`slippage_bps`/`account.leverage` with **no bounds** — a negative fee pays the filler free money; leverage→0 breaks margin math), `set_speed`/`replay` (pause/scrub the whole market), `options_chain` (compute spam). Data plane and control plane share one open port published in dev+prod compose; the 1000 msg/min rate limit stops floods, not a single command.

**S156 (High) — Fixed in R77-fix.** The containerized simulator binds `localhost` while compose publishes its ports — a green-but-dead deployment. `config.yaml:313` `websocket.host: "localhost"` (+ `metrics.host: "localhost"`) is read at `__main__.py:136` with no env override (only `LOG_FORMAT`/`SHM_*` are env-read); the same file is mounted read-only into dev and prod containers, and no Dockerfile sets a host env. Compose publishes `8765:8765`/`8775:8775` — docker-proxy forwards to the container IP where nothing listens → the web UI and external clients can never connect. The healthcheck curls `localhost:8775` **inside** the container → stays green while the data feed is unreachable. `DEPLOYMENT.md:22` claims "`docker-compose up` = everything works" — false (corrected). The ai-bot does this right: `AI_BOT_BIND_HOST` env defaults to `0.0.0.0` (`run.py:87`).

**S157 (Medium) — Open.** Signal-publisher auth hygiene cluster. (a) Fail-open: `signal_publisher.py:124` `if self._auth_token:` — an empty token disables auth **silently** (no startup warning; `run.py:88`); (b) `.env.prod.example:37` ships `AI_BOT_AUTH_TOKEN=` empty, so the documented prod deploy exposes :8766 with the full signal feed + connect-time signal history + **10 compute endpoints** (`run_backtest`, `optimize_portfolio`, `hawkes_fit`, `cvar_analysis`, `stress_test`, `vol_surface`, `funding_arb_scan`, `position_size`, `compare_backtests`) with no per-client rate limit — backtest spam = CPU DoS of the whole bot; (c) tokens compared with `==` at `signal_publisher.py:128` and `health_server.py:157` — timing side channel, `secrets.compare_digest` is the fix; (d) the UI token is baked into the JS bundle at build time (`VITE_SIGNAL_TOKEN`).

**S158 (Medium) — Open.** hft health server: one idle connection freezes probing. `health_server.h:105-118` runs a single-threaded accept loop with a blocking `::read`/`recv` and no `SO_RCVTIMEO`/deadline — a client that opens TCP and sends nothing blocks the server forever; every later connection queues on `listen(…,4)` backlog → `/health` and `/metrics` time out → docker/k8s probes fail → restart loop of a healthy bot. Also: `INADDR_ANY` with no auth serves `monitor_->format_json()` (positions/PnL) on the published :9091 — trading-state info leak.

**Verified clean this round:** SHM perms `0600`/`0o600` on both sides (C++ `shm_open`, Python `os.open`, `multiprocessing.SharedMemory`) — local signal injection closed; zero CORS/`Access-Control` headers repo-wide (no `*`); token sent as an in-band `{type:"auth"}` frame, not a URL query; auth-failure logs don't echo the token; `_sanitize_log` applied to user-controlled values; ai-bot health middleware exempts only `/live`+`/ready`; Grafana admin password is `${GRAFANA_PASSWORD:?required}` in dev+prod; notifier suppresses aiohttp debug logging (no Telegram/Discord token leakage); sim enforces `max_size=1MB` + per-client 1000 msg/min; publisher auth handshake bounded `wait_for(10s)`.

## Round 73 — 2026-09-14 — config leaf-key sweep: 3 open findings (S159–S161)

Scope: the last un-audited config surface — leaf keys of `exchange_simulator/config.yaml`, `ai-signal-bot/config/settings.yaml`, hft dev `config/config.yaml` (S150 covered only `config.prod.yaml`), plus web-ui build config (vite/netlify/nginx). Every key traced to a runtime reader; recorded only, no source changes.

**S159 (Medium) — Fixed in R87.** Config dead-key cluster across all three services — ~16 keys that are parsed/validated but never reach runtime. **exchange_simulator `config.yaml`:** `metrics.{enabled,port,host}` (:317-320) are all dead — `_run_metrics_server` starts unconditionally on `self.port+10` bound to `self.host` (`websocket_server.py:179-189`); the `enabled: false` comment "Off by default" is a lie, and both the compose healthcheck and the Prometheus job (`CONFIGURATION_GUIDE.md:486`) silently depend on the "disabled" server — an honest gate would break healthchecks. `account.currency` (:301) dies end-to-end: `SimulatedExchange.__init__` has no currency param (`exchange.py:40-49`) and `Account.currency` is hardcoded `"USDT"` (models.py:405). `visualizer.enabled` (:306) is never read — `viz_cfg` consumes only `refresh_interval`/`chart_width`/`chart_height` (`__main__.py:96-104`); the real gate is the `--no-visualizer` CLI flag. `market.timeframe` (:291) is cross-checked by the validator only — runtime reads `timeframe_seconds` alone. `exchanges.<id>.symbols` (:23,78,133 — ~147 yaml lines) are validated and cross-referenced but never passed to `SimulatedExchange` — every exchange serves all 49 `initial_prices`, so trimming a list does nothing except trip validator errors. **ai-bot:** `shm.max_symbols` (settings.yaml:175) is dead — no config property and `run.py:280` derives `len(symbol_names)`. **hft dev `config.yaml`:** `signal_engine_v2.obi_levels: 20` (:109) is a dead scalar — the parser reads `obi_levels_5/10/20` (config_parser.h:96-98); `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` (:91,97-98) parse into `cfg` but `EngineParams` has no such fields and `bot_setup.cpp:153-159` never wires them — the FFT block is gated by the literal `closes.size() >= 64u` (signal_engine.h:297), so `fft_enabled: false` cannot turn off ~100 lines of FFT math; `metrics.{port,host}` (:148-149) are dead on the dev path (`is_production ? metrics_port : 9091` + hardcoded `INADDR_ANY`). Plus a four-way `obi_levels` drift: dev scalar / prod `pressure_model.obi_levels` list (config.prod.yaml:89) / parser split-keys / `CONFIGURATION_GUIDE.md:294` — four spellings, zero effective; the engine always runs compiled {5,10,20}. Extends S150.

**S160 (Info) — Fixed in R95.** PWA manifest counts are stale: `vite.config.js:15` description claims "204 panels and 44+ math models" — `panels/registry.js` actually has 278 `{ id:` entries (~74 panels added since the text was written). The install-prompt/description misstates the dashboard's size; "44+ math models" is unverifiable (no model registry exists) but the panel count alone proves the text rots.

**S161 (Low) — Fixed in R95.** `CONFIGURATION_GUIDE.md` §2 documents a phantom simulator config. The header points to `exchange_simulator/config/settings.yaml` (real file: `config.yaml`), the table documents top-level `host`/`port` (real keys live under `websocket:`), `compression: deflate` (no key — hardcoded at `websocket_server.py:184`), `max_symbols: 50` (no key — SHM slots come from env `SHM_MARKET_MAX_SYMBOLS`, symbols derive from `initial_prices`), `tick_interval_ms: 1000` (no key — literal `_tick_interval = 1.0` at :74), and `encoding: json|msgpack` (no key — per-client `_client_encodings`). The fees block documents `maker_fee_bps`/`taker_fee_bps` — the real schema is a single `fee_pct` + `slippage_bps` with no maker/taker split. An operator following this section edits keys that don't exist and silently changes nothing.

**Verified clean this round:** ai-bot `metrics.enabled` is a real gate (`run.py:194` — `enable_metrics or config.metrics_enabled`) — the honest counterpart to the sim's dead flag; every other `settings.yaml` leaf has a live reader; hft dev-config remainder is wired (`hft_strategies` periods/toggles → `EngineParams`, `adaptive_order_selector.*` → selector params, `latency_optimization.*`/`ai_signal_bot.*`/`signal_engine_v3`/`logging.*`/`trading.*`/`risk.*`/`exchange.*` → `cfg`); `netlify.toml` is live (deploy.yml Netlify job); `nginx.conf` has real security headers/health/SPA fallback; `VitePWA autoUpdate` injects SW registration itself (no missing `registerSW`); web-ui generated dirs (`dist/`, `coverage/`, `playwright-report/`, `test-results/`, `screenshots/`) all gitignored; helm `OPENAI_API_KEY` if/else is a value-or-secret pattern, not a dup. Doc fix: `CONFIGURATION_GUIDE.md` `obi_levels` claim corrected.

## Round 74 — 2026-09-14 — protocol-doc truth sweep + monitoring: 2 open findings (S162–S163)

Scope: `WEBSOCKET_PROTOCOL.md` verified field-by-field against `ws_message_handler`/`ws_broadcast` (sim :8765) and `signal_publisher` + request modules (ai-bot :8766); Grafana dashboard queries + `alerts.yml` expressions checked against emitted metrics.

**S162 (Medium) — Fixed in R95.** The :8765 section of `WEBSOCKET_PROTOCOL.md` is wrong in 8 verified ways. (1) `config_update` doesn't exist — the dispatcher key is `update_config` (`ws_message_handler.py:163`) and the schema differs too: doc shows `{"config":{fees:{maker,taker}}}` but the handler reads a flat `updates` map `{fees:{ex:fee_pct},volatility,slippage,leverage}` (:400-424) — a doc-following client gets an unknown-type error. (2) `position` broadcast has zero emitters — positions only ride inside `account` in snapshot/candles. (3) `speed_change` broadcast has zero emitters — the real `speed_set` reply goes only to the requesting client (:331); other clients never learn the speed changed. (4) `config_updated` — doc claims a broadcast carrying `config`+`timestamp`; code sends a sender-only ack echoing `updates` (:424). (5) `fills_batch.fills` — the real key is `orders` (`ws_broadcast.py:296-298`); a doc-following client reads `data.fills` → undefined → silently drops every batched fill. (6) `welcome.server_name` — real key is `server` (:72), and welcome is sent on connect, not "in response to subscribe". (7) `error.code` — no error emitter carries `code`. (8) Undocumented: `start_trading`/`stop_trading` commands (the kill commands from S155) and five `candles` payload fields (`funding_rates`, `candles_to_funding`, `news_event`, `weekend_mode`, `trading_active` — `ws_broadcast.py:478-481`). Anyone implementing a client from this doc breaks in at least four places. Doc corrected.

**S163 (Medium) — Fixed in R90.** Grafana `latency-monitoring.json`: 6 of 8 latency panels are permanently empty — `histogram_quantile(0.50/0.99, exchange_simulator_{order,websocket,price_feed}_latency_seconds)` (:47,63,79,95,111,127) query the bare metric name, but the sim only emits `name_bucket{le=...}` series (`ws_metrics.py:29-30`) → the selector returns nothing → `histogram_quantile` yields no data. The correct `_bucket`+`rate()` form sits three panels away (:15,:31 for `trading_signal_latency`, :159 for the distribution) — half the dashboard is written right, half isn't. In an incident, the operator stares at empty latency panels.

**Verified clean this round:** the entire :8766 section is honest — all 9 compute request types and all 9 `*_result` response names match emitters in `analysis_requests.py`/`backtest_requests.py`/`portfolio_requests.py`, plus `auth`/`auth_ok`/`auth_failed`, `signal`, `signal_history`, `market_regime`, `circuit_breaker_status`; sim `subscribe` reads all 3 documented fields with honest msgpack fallback, `unsubscribe` sends no response as documented, `trading_state` is a real broadcast (:394), `snapshot`/`sync_state`/`pong`/`replay_*`/`audit_logs`/`options_chain`/`arbitrage_scan`/`fill` all emit; `alerts.yml` — all 22 expressions resolve to emitted metrics (incl. `exchange_orders_rejected_total`, `exchange_equity`/`balance`, `ai_signal_bot_drawdown/win_rate/pnl_total`); hft dashboard — all 10 queried `hft_*` metrics emit via `format_prometheus()`.

## Round 75 — 2026-09-14 — infra-config honesty (helm/terraform/alertmanager/Makefile): 2 open findings (S164–S165)

Scope: leaf-key sweep of `helm/values.yaml` vs `.Values` consumers + all 10 templates, terraform variables vs `var.*` uses, alertmanager routing, Makefile targets vs referenced files.

**S164 (High) — Open.** The helm chart renders a non-functional system. (1) `ai-signal-bot.yaml` never sets `WS_URL` — the bot dials the baked default `ws://localhost:8765` (settings.yaml:73) = its own pod loopback → the `*-exchange-simulator` Service is unreachable → no market data → no signals → the hft sidecar starves, while `/live`+`/ready` probes stay green. (2) `exchange-simulator.yaml` mounts no config (image bakes `config.yaml` with `host: localhost` via `COPY . .`) — k8s httpGet probes hit the pod IP, not loopback → **CrashLoopBackOff** (worse than compose-S156's green-but-dead), and the chart offers no way to mount a corrected config. (3) The Prometheus ConfigMap (`prometheus.yaml:87-99`) contains only `scrape_interval` + 3 jobs — **no `rule_files`, no `alerting:`**, and no alertmanager template exists in the chart → zero alert pipeline in k8s (`alerts.yml`/`alertmanager.yml` are compose-only). (4) The Grafana StatefulSet mounts only `/var/lib/grafana` — no provisioning volume → no datasource, no dashboards: an empty Grafana. (5) `network-policy.yaml` default-denies egress except same-release pods + DNS + ingress-nginx — while the chart wires `OPENAI_API_KEY` → api.openai.com is blocked → LLM path dead. (6) hft sidecar: `readOnlyRootFilesystem` with trigger file `/tmp/kill_switch` on the rootfs → file-triggered kill switch unreachable (the SHM flag under mounted `/dev/shm` still works). (7) `webUi.wsExchange`/`wsSignals` are required `--set` values consumed only by `fail` guards (`web-ui.yaml:2-7`) — they never reach the pod; the guard creates false confidence while the image bundle may contain any baked URL. (8) `AI_BOT_AUTH_TOKEN` is never set → publisher auth fail-open in cluster (extends S157).

**S165 (Info) — Fixed in R95.** Small infra residue: `terraform/modules/eks/main.tf:15` declares `variable "vpc_id"` and both environments pass `module.vpc.vpc_id` into it — but `var.vpc_id` is never referenced inside the module (dead interface input). `Makefile` — the five trailing targets (`ci-test`, `ci-quick`, `benchmark`, `walk-forward`, `docker-hub`) are missing from `.PHONY` (:1) — a file with that name would silently disable the target.

**Verified clean this round:** every `values.yaml` key (~44) has a `.Values.*` consumer — zero dead values; `alertmanager.yml` honestly documents "nothing is sent until you wire a channel" with valid routing/inhibit syntax; `make logs` targets real files — `_latest.log` symlinks from `run_logger.py:103`, `hft_trade_bot_latest.log` is a real second sink (`logger.h:43-55`), `trades_latest.csv` from `trade_csv_logger.py:51` via sim `websocket_server.py:80`; all Makefile targets point at existing files; 10/11 terraform variables consumed; `hft-trade-bot.yaml` is an honestly-documented empty template (sidecar pattern).

## Round 76 — 2026-09-14 — test-honesty sweep: 3 open findings (S166–S168)

Scope: first dedicated pass over test-suite quality — 157 vitest files + 4 e2e specs (web-ui), 99 ai-bot + 29 sim pytest files, 25 hft doctest files, `monitoring/tests`. Patterns: vacuous asserts, fixture-self-asserts, shadow-copy tests, orphan tests, CI gating.

**S166 (Low) — Fixed in R90.** Vitest placeholder theatre. `web-ui/src/test/exchange-ui.test.jsx` (267 lines, 25 `it` blocks, 50 expects) — 17 are unconditional `expect(true).toBe(true)` with comments like "This test would verify that order forms use the correct theme" — covering (on paper) exchange themes, state persistence across exchange switches, stop-limit/trailing-stop/iceberg order fields, advanced-order validation, and audit-log UI. Another 27 expects assert the test's own fixture literals: `expect(mockBinanceTheme).toHaveProperty('primary')` ×24 across three mock theme objects, plus `mockBinanceTheme.primary.not.toBe(mockBybitTheme.primary)` ×3 — proving the local constants differ from each other, which says nothing about the app. Only ~6 of 50 expects touch the real `ExchangeProvider`. `performance.test.jsx` adds 2 more unconditional asserts ("manual chunks configured", "target <2s initial load time" — both `expect(true)`). The suite reports 34 green "tests" of coverage that does not exist: regressions in order-form UI, exchange switching, and Vite perf config all pass silently.

**S167 (Medium) — Fixed in R90.** Five math test files test shadow copies, not production code. `cointegration.test.js`, `garch.test.js`, `hmm.test.js`, `kalman.test.js`, `kmeans.test.js` — 85 expects total, and the only import in each is `vitest`. The algorithms under test (`calcADF`, `ols`, `calcZScore`, `calcHalfLife`, `forward`…) are defined **inside the test files** as copies ("Tests the core algorithms extracted from CointegrationScanner.jsx"). The production implementations live separately — `PairTradingSignals.jsx` (z-score/cointegration), `GARCHVolatility.jsx`, `HiddenMarkovModel.jsx`, `KalmanFilterPrice.jsx`, `KMeansClustering.jsx` — and are never imported. A regression in production math breaks zero tests; the copies can diverge from the originals forever while the suite stays green. It proves the test-file snapshots are self-consistent, not that the shipped math is correct.

**S168 (Info) — Fixed in R95.** `ARCHITECTURE.md:422` claims "103 test files (99 unit + 4 e2e)" — stale since ~58 test files were added; actual is 157 vitest files + 4 e2e specs. README:121 ("157 test files") and :195 ("162 test files" = 157+4+helper) are accurate — only the architecture table rots.

**Verified clean this round:** Python suites are honest — ai-bot 99 + sim 29 files use real asserts and mock-assertion APIs (`assert_called_once_with`/`assert_not_called`); the no-assert scan produced zero true hits (`test_run_equity.py` was a false positive). `monitoring/tests/test_alerts.py` is real schema validation of `alerts.yml` (5 groups, severity enum, required `expr`/`for`/`labels`/`annotations`). The 4 e2e specs carry 34 real expects and are CI-gated — `test-e2e` job has no `continue-on-error`/`|| true` and feeds the `check_result` test-summary gate; `screenshots.spec.js` is an honestly-named README capture script, not test theatre. hft doctest suite: 565 REQUIRE/CHECK across 17 files — substantive (that they exercise dead abstractions is S152's point, not vacuity). `monitoring/alerts/` is an empty untracked local directory, not committed residue.

## Round 77 — 2026-09-14 — panel-registry wiring + stores/hooks sweep: 1 open finding (S169)

Scope: the rulebook's proven bug class #1 — panels off the data path — swept across all 278 `registry.js` entries, plus `stores/` and a hooks leaf-sweep for zero-importers and `.js`/`.ts` duplicates.

**S169 (Low) — Fixed in R95.** Dead hooks + 471 lines of tests for dead code. `hooks/useInterval.js` (15 lines) and `hooks/useInterval.ts` (36 lines, documented) are a duplicate pair with **zero production importers** — only `test/useInterval.test.jsx` (182 lines) imports `'../hooks/useInterval'` extensionless, and Vite resolves `.js` before `.ts`, so the test exercises the short untyped copy while the documented `.ts` is a pure shadow; any future importer silently gets `.js`. `hooks/usePerformance.js` (152 lines) exports five hooks — `useDebouncedValue` (a duplicate of live `useDebounce.ts`), `useThrottledCallback`, `useBatchedUpdates`, `useWorker`, `useIntersectionObserver` — with zero production importers; it lives only in `usePerformance.test.jsx` (289 lines). ~203 lines of dead hooks + 471 lines of tests that inflate the suite's green count — same test-to-nowhere disease as S167.

**Verified clean this round:** every registry entry resolves to an existing component (0 missing files); the 15 `props: () => ({})` entries are all honest — eight `NoDataFeed` disclosures ("feed is not produced by the backend": Colocation, ABTesting, LogDashboard, PacketInspector, HyperoptUI, RetrainingPipeline, GeneticViewer, CancelMonitor), `OptionsPricing`/`OptionsStrategies` are interactive calculators (user params → real BS math), `BacktestComparison` is a localStorage saved-results viewer, `OnboardingTutorial` needs no data, `StrategyMarketplace` discloses "local only", `DashboardProfiler` reads real Web Vitals via `utils/performanceMonitor`, `StrategyBacktest` self-subscribes. `MOCK_` appears only inside `MockModeBanner` (the detector); all 27 `Math.random()` sites are legitimate simulation math (Box-Muller/MC sampling, k-means centroid init, shuffles, ID generation) — zero fabricated market data. Stores are wired correctly (`useTradingStore` has 6 consumers incl. `useTradingStoreSync` → `usePanelContext` → panels); the other 19 hooks all have production importers; `useDebounce.ts` is live (4 panels).

## R77-fix — 2026-09-14 — fix round: 4 High findings closed (S148, S149, S155, S156)

Scope: the whole sim-WS/executor cluster — orders, cancellation, deduplication, auth, container bind. All four share the :8765 surface, so one coherent round.

**S148 — kill-switch cancellation.** Diagnosis went deeper than the audit note: resting LIMIT orders were written to `_order_history` as PENDING but registered in *no* pending dict — `check_advanced_orders` only scanned stop-limit/trailing/iceberg maps, so a non-crossing LIMIT could **never fill and never be cancelled** (the audit's "fills on next ticks" was wrong; they were permanent zombies — the hft adaptive order selector's LIMIT/GTD/PostOnly output was sim-theatre). Fix: new `_pending_limits` dict (`exchange.py`), registration in `exchange_order_submission.py`, `_check_limit_orders` fills at limit price on each tick and rides the existing `fills_batch` broadcast; `cancel_order`/`cancel_all_orders` exchange APIs + WS handlers (`ws_message_handler.py`) — deliberately callable while `trading_active=false` since cancellation *is* the kill path; C++ `OrderExecutor::cancel_all_orders()` (same send pattern as `close_position`); real callbacks in `bot_setup.cpp` kill-switch and `bot_loop.cpp` graceful shutdown. Verified end-to-end: pending → fill at limit → cancel → cancel-all.

**S149 — client_order_id.** Simulator now keeps a bounded dedup table `{exchange}:{client_order_id} → Order` (10k deque cap); a repeated id returns the original order with `deduplicated:true` — no second fill, no broadcast. C++ executor sends `hft_{symbol}_{timestamp}`; the UI stamps `ui_{ts}_{rand}` before the reconnect-queue capture so the reconnect flush carries the same id. Verified: duplicate cid → single order in history; distinct cids → both fill.

**S155 — control-plane auth.** `EXCHANGE_CONTROL_TOKEN` env enables first-frame `auth` handshake (`secrets.compare_digest`); `_CONTROL_TYPES` — order, close_position, cancel_order, cancel_all_orders, start/stop_trading, update_config, set_speed, replay — are rejected until authenticated; the data path (subscribe/snapshot/options_chain/ping) stays open; tokenless dev mode unchanged. Clients wired: web-ui `VITE_EXCHANGE_TOKEN` → `authToken`, ai-bot `ws_client.py` sends auth before subscribe, C++ `OrderExecutor` sends auth in `on_open`. Prod compose marks the token `:?required`; `.env.prod.example` documents the pair. Startup warning when the token is unset. Bonus fix: `VITE_SIGNAL_TOKEN` was never declared as a Dockerfile build-arg — signal auth silently died in prod images; now declared in both Dockerfiles. Verified in all 4 modes: gated / bad-token / good-token / tokenless.

**S156 — container bind.** `EXCHANGE_WS_HOST` env override in `__main__.py` (same convention as `AI_BOT_BIND_HOST`); one flag covers both binds since the metrics/health HTTP server shares `self.host`. `EXCHANGE_WS_HOST=0.0.0.0` set in all four compose files (hub gained its first environment block). The healthcheck's internal `curl localhost:8775` is now honest — the listener is actually there.

Verified: sim pytest 387 passed / 7 skipped; e2e scripts for every new path; `useExchangeData` vitest 37/37 (test updated to assert the new payload shape — honest contract change, not weakened); ai-bot 22 selected; ruff clean; `docker compose config -q` green on dev/staging/prod/hub. C++ changes are inspection-verified (no local toolchain; CI compiles them). Protocol doc updated: auth, cancel messages, `client_order_id`, `deduplicated` flag.

## Round 78 — 2026-09-14 — ai-signal-bot/src bounded-context leaf-sweep: 4 open findings (S170–S173)

Scope: the last large uncovered rotation cell — all 84 files / ~14.7k lines of `ai-signal-bot/src/`. Import-graph sweep of all 72 modules, then internals of the suspicious ones.

**S170 (Medium) — Fixed in R88.** Three dead modules, ~740 lines of code that production never executes. `strategies/cross_exchange_arb.py` (337 lines): `CrossExchangeArbEngine` — a complete arbitrage *execution* engine (simple/triangular/statistical, leg-risk management, simultaneous order placement) whose docstring advertises "executes real arbitrage when price discrepancies exceed transaction costs" — zero production importers; not in `build_strategies`, not in `__init__`, not in the WS dispatcher; only `test_cross_exchange_arb.py` ever touches it. `strategies/marketplace.py` (259 lines): `StrategyMarketplace` — a plugin loader with `install_from_git`/`install_from_archive` (importlib-loading arbitrary remote code — a security surface as well as dead weight) — zero production importers; the web-ui `StrategyMarketplace` panel is a separate localStorage-only implementation, so the feature was built twice and both ends hang in the air. `utils/helpers.py` (142 lines): zero production importers, exercised only by `test_helpers.py`/`test_utils.py`.

**S171 (Medium) — Fixed in R88.** The strategies-side circuit breaker is never constructed — the advertised consecutive-losses protection is dead in production. `run.py:118` builds `EnsembleVoter(mode=…, min_votes=…)` without `circuit_breaker=` or `strategies=`; `vote()` checks `self.circuit_breaker` (`ensemble.py:38-40`) which is always `None`, so the 87-line `strategies/circuit_breaker.py` breaker ("stops trading after consecutive losses, auto-recovery after cooldown") can never trip — the bot trades straight through a loss streak. (The live breaker is `communication/circuit_breaker.py` on the publisher — a different class with a different purpose.) Same dead half: `EnsembleVoter.strategies` stays `[]` forever, so `EnsembleVoter.analyze()` would answer "No strategies configured" if anything called it — and `backtest_requests.py`'s `EnsembleVoterAdapter` re-implements `analyze()` inline instead of just passing `strategies=` to the constructor.

**S172 (Medium) — Fixed in R87.** Two parallel backtest engines with different fee models serve different UI buttons. `Backtester` (`backtester.py`, 347 lines: `fee_pct=0.075` "Binance taker", `slippage_bps=2.0`, inline math) backs the `run_backtest` WS request plus `run.py`/`run_backtest.py`. `BacktestEngine` (`backtest_engine.py`, 327 lines: `fee_rate=0.0004`, `slippage_bps=1.0`, via `PnLCalculator`) backs `compare_backtests` and `walk_forward`. Same strategy, same candles → different results depending on which button you press; the fee alone differs ~1.9×. `backtesting/__init__.py` exports two `BacktestResult` types (`BacktestResult as BacktestEngineResult`) — every consumer has to know which engine produced its numbers. Classic feature-factory duplicate: two engines, two result models, zero shared code.

**S173 (Medium) — Fixed in R87.** Live-order path defects. (a) `_execute_live_order` (`run.py:564`) constructs a fresh `ExchangeFactory`+`RealExchangeAdapter` **per signal**: `initialize()` runs `load_markets()` (multi-REST exchange handshake) plus market-data-manager setup, places one order, then tears it all down — a full connect/init/close cycle in the signal hot path; a signal burst means rate-limit pushback from the real exchange and seconds of execution delay. (b) `RealAccount.place_order` retries `max_retries=3` with **no `clientOrderId`** — an ambiguous timeout (order may have landed) retries blind → double real-money orders; the paper path got `client_order_id=sig_{id}` (S149) but the real path, where idempotency matters most, has none. (c) `SimulatorAdapter.cancel_order` (`exchange_factory.py:227`) still returns `False` under the comment "simulator protocol has no cancel message" — true until R77-fix added `cancel_order`/`cancel_all_orders`; and `ExchangeClient` (`ws_client.py`, the bot's actual order path) exposes no cancel method at all — the bot cannot cancel a sim order even where the protocol now allows it.

**Verified clean this round:** `ml_ensemble.py` is a real sklearn pipeline (guarded LGBM/XGBoost/GBM imports, StandardScaler, IsolationForest anomaly filter, `predict_proba`, honest NEUTRAL fallbacks for untrained/low-confidence/anomaly); `database`/`signal_validation`/`monitoring` packages are genuinely used (`run.py:36,41,89-98,236,628`); `observability.tracing` is wired (`setup_tracing`/`shutdown_tracing` in run.py:710,722); `data_collection` is complete — ExchangeFactory SIMULATOR/REAL/FALLBACK all implemented, `RealAccount`'s `return []` sites are honest post-error guards, feed←manager←factory chain is live; `MetricsCollector` is an honestly-documented fallback sink used by `signal_publisher:75`; `backtest_comparison`/`walk_forward`/`optimizer` are reachable via WS handlers and CI scripts; `pricing/volatility_surface` serves a real `vol_surface` WS endpoint; package-level `__init__` re-exports are all consumed.

## Round 79 — 2026-09-14 — web-ui utils/contexts/component-internals sweep: 4 open findings (S174–S177)

Scope: `web-ui/src/utils/` (17 files), `contexts/`, and component-internal correctness patterns across `components/`+`panels/` — shared-prop mutation, unguarded parses, dead exports.

**S174 (Medium) — Fixed in R90.** A complete exchange-theming system is dead code. `contexts/ExchangeContext.jsx` (132 lines: 3 exchange themes → CSS variables `--exchange-*` + per-exchange layout configs) and `components/ExchangeSelector.jsx` have **zero production importers and zero mounts** — the real exchange switch flows through the Zustand store (`App.jsx:81` destructures `selectedExchange`/`setSelectedExchange`; `Header.jsx:65` renders the exchange buttons). No stylesheet or component reads `var(--exchange-*)` — the provider would set variables into the void even if mounted. Bonus deception: the theme map knows binance/bybit/**coinbase** while the sim trades binance/**okx**/bybit — mounted, it would silently give okx the binance theme. The kicker: the only non-vacuous asserts in the S166 theatre file `exchange-ui.test.jsx` test this dead provider.

**S175 (Low) — Fixed in R88.** `DrawdownAnalysis.jsx:16` runs `fills.sort(...)` **in place** on a ctx prop. `Array.sort` mutates, and the store keeps fills newest-first (`setFills(prev => [new, ...prev])`) — so while DrawdownAnalysis is mounted, every render re-sorts the shared array oldest-first and `FillsPanel`'s "Recent Fills" (plus every other `fills` consumer) displays in reverse. Fix is `[...fills].sort()`/`toSorted()`.

**S176 (Low) — Fixed in R92.** Two more tests-only utilities: `utils/auditExport.js` (107 lines — JSON/CSV audit export; `AuditLogViewer` does its own export) and `utils/cn.js` (3-line classname joiner — zero `cn(` call sites; components use template literals). Both exist solely for their test files — same test-to-nowhere disease as S167/S169/S170.

**S177 (Low) — Invalid (R94).** 11 `JSON.parse(localStorage…)` call sites without try/catch: `AlertWebhook.jsx:27`, `BacktestComparison.jsx:139,188`, `StrategyBacktest.jsx:43`, `StrategyBuilder.jsx:36`, `useSavedBacktests.js:23`, `useSessionRecorder.ts:47,171`, `useStrategyMarketplace.ts:120,144` (+1). A truncated or hand-edited key throws `SyntaxError` during render/hook-init → `PanelErrorBoundary` shows a dead panel until the user clears storage. The shared `useLocalStorage` hook *is* guarded (`try → initialValue`) — these 11 sites bypass it.

**Verified clean this round:** `Object.values(acc.positions)` on the positions *list* works correctly at all 12 sites (values of an array are its items — no S041-class residue; zero `Object.entries(positions)`); 115 `.sort()/.reverse()` sites all operate on locally-built arrays except S175; `useWebSocket.onmessage` has per-message try/catch around `JSON.parse` (S013-class properly closed); `performance.ts` (trading math) vs `performanceMonitor.js` (web vitals) are different domains, both live; `ui-helpers.js` is an honest 1-line re-export shim; `components/backtest/` + `components/performance/` — all 6 files wired; `candles`/`format`/`indicators` have 80/91/31 importers.

## Round 80 — 2026-09-14 — hft-trade-bot/src internals leaf-sweep: 5 open findings (S178–S182)

Scope: all 42 source files in `hft-trade-bot/src/` (~8.3k lines) — position/risk/monitoring/network/execution/strategies per-module logic. Wiring was verified in R69, domain patterns in R71; internals were never swept.

**S178 (High) — Open.** The entire RiskManager V2 "production safety" layer is tests-only. `check_order` (`risk_manager.h:99-178`) implements 8 pre-trade gates — symbol blacklist, max leverage, per-symbol qty, total exposure, **daily-loss-$ kill check**, peak-equity drawdown, order-rate throttle, margin — with **zero production callers**; only `test_doctest_risk_manager.cpp` exercises them. Production calls `check_signal` (`bot_loop.cpp:93,238,282`), which checks confidence/R:R/max-positions/daily-drawdown-% only. Every V2 tracker is also dead: `on_fill`/`reduce_exposure`/`update_pnl_v2`/`reset_daily`/`blacklist_symbol` — zero prod calls, so `total_exposure_` and `peak_equity_` stay 0 forever (the peak-equity drawdown check would be dead even if wired). Meanwhile 8 safety config keys are parsed, validated, and documented — pure theatre. Bonus lie: `kill_switch.h:6` promises "Daily loss limit exceeded (auto-trigger from RiskManager)" — `activate()` is invoked only by the file-trigger poller; DAILY_LOSS/MAX_DRAWDOWN/MARGIN_CALL are unreachable enum values.

**S179 (Medium) — Open.** Optimistic position book, no fill reconciliation. `pos_mgr.open_position` runs on `ws.send()` *send-success* at all three call sites (`bot_loop.cpp:104,219,289`) — fine for MARKET, wrong for resting LIMITs (the adaptive selector emits them, and R77-fix made them fill later sim-side): the local book records a position at the *signal's* price instantly, then `check_sl_tp` may "close" a position the exchange never filled → the close order creates a real *opposite* position in the sim. The `fill` handler (`signal_receiver_handlers.h:30-54`) only logs + pushes to SHM — it never touches `pos_mgr` (no on_fill/reconcile). Restart → empty book vs live exchange positions → `has_position` passes → double-opens.

**S180 (Medium) — Open.** Balance is a hardcoded fiction. `bot_context.h:75` — `std::atomic<double> balance{10000.0}`: no config key, no parsing of the `account` broadcast the simulator sends (`websocket_server.py:53` — receiver has no `account`/`balance` handler at all). It only mutates via `fetch_add(unrealized_pnl)` on SL/TP closes (`bot_loop.cpp:57`). Position sizing (`calculate_position_size`, 2%-risk) and `check_signal`'s daily-drawdown-% both compute against imaginary $10k forever.

**S181 (Low) — Fixed in R94.** `signal_engine_v3_enabled` is dead unless v2 is also enabled: the only consumer (`generate_signal`, `bot_loop.cpp:143`) lives inside `run_v2_signal_loop`, which early-returns on `!signal_engine_v2_enabled` (:223). Config `v3.enabled=true, v2.enabled=false` constructs + prepopulates the v3 engine (`bot_setup.cpp:145-147`) that never analyzes. The opt-in flag actually means "only on top of v2".

**S182 (Low) — Fixed in R94.** `PositionManager::open_position`'s overwrite branch (`position_manager.h:21-30`) is unreachable — all three production callers pre-guard with `has_position()`. Dead code that, if ever reached, would silently drop the old position's unrealized PnL (never realized) and flip LONG→SHORT without a close order; it also matches on `symbol` alone while storing `exchange` unused.

**Verified clean this round:** `Position::update_pnl` math is correct (long/short, fees+funding deducted); `shm_ring_buffer` is an honest SPSC (acquire/release ordering, cache-line-aligned head/tail, magic/capacity/element-size validation); every JSON access in `signal_receiver_handlers` uses `.value()` with defaults; kill-switch mechanics are live (file-trigger poller + `can_trade()` gate at `main.cpp:49`); `check_sl_tp`/`close_position`/`update_all_pnl` are correct; zero TODO/FIXME/stub markers across src; V1 `check_signal`/`calculate_position_size` are honest live logic; `update_pnl` CAS-add and `balance.fetch_add` are correct atomics.

## Round 81 — 2026-09-14 — web-ui components per-file internals: 2 open findings (S183–S184)

Scope: `web-ui/src/components/` — 296 files / ~62.5k lines, the last large untouched cell. Swept bug classes not previously run per-file: timer/listener leaks, dead `useState` setters, `[]`-deps hooks reading props (brace-matched scan), structural file duplicates (normalized-md5), fetch/axios targets, UI→sim WS-type coverage vs the handler dispatch table, and sampling of the largest math panels.

**S183 (Medium) — Fixed in R91.** The UI drops the entire order-lifecycle surface. `useExchangeData.js:38-167` has no case for `order` acks (the sim replies `{type:'order', status:'pending'|'filled'}` per submission — including PENDING resting LIMITs since R77-fix) nor for `order_cancelled`/`orders_cancelled`. `OrderForm.jsx:72-74` shows "Order submitted" on send-success plus a fake 500ms spinner — a resting LIMIT disappears into the void: **no pending-orders panel exists anywhere** and the UI never sends `cancel_order` despite the protocol now supporting it. A placed limit order is invisible and uncancellable from the UI until it fills. Mirror-image of S179: both sides of the wire treat send==fill.

**S184 (Low) — Fixed in R92.** `HawkesProcess.jsx:293-294` stores its pending-request timeout id on `window.__hawkesTimeout` instead of a ref; the unmount cleanup (:148) clears the same global. A second mounted instance's cleanup kills the other's pending timeout → its `setPending(false)` never fires → permanent "waiting" state. Global scratch state shared across mounts.

**Verified clean this round:** all 9 `addEventListener` sites have matching `removeEventListener`; every `setInterval`/`setTimeout` in effects has a cleanup; zero dead `useState` setters (automated scan); zero `useMemo`/`useCallback`/`useEffect` with `[]` deps reading props (brace-matched parser, not regex); zero structurally-duplicate files across 289 components (normalized-md5); only one `fetch(` in the tree (AlertWebhook → user-configured URL); every UI→sim WS type maps to a real handler; the ~60 exotic math panels (AffineArithmetic family) are genuine implementations running on `selectCandles` data — real affine arithmetic with Chebyshev exp approximation, not decoration; `useDetachablePanels` builds popup DOM via createElement/textContent (no innerHTML) with BroadcastChannel sync; `useTradingStore`/`usePanelContext` are an honest thin Zustand layer; `CancelMonitor` is an honest `NoDataFeed` disclosure; `BacktestRunner` posts to the live `run_backtest` endpoint.

## Round 82 — 2026-09-14 — test suites outside web-ui: 3 open findings (S185–S187)

Scope: `ai-signal-bot/tests/` (37 + unit/ + integration/ + mocks/), `exchange_simulator/tests/` (36), `hft-trade-bot/tests/` (28), `web-ui/e2e/` (5 specs). Patterns: tautologies, shadow-defs (S167 pattern on Python), mock-of-mock tests, orphaned test files, skip theatre.

**S185 (Medium) — Fixed in R91.** A closed mock-testing-mock loop. `ai-signal-bot/tests/mocks/mock_objects.py` (185 lines: MockExchange/MockWebSocket/MockSHM/MockDatabase) has exactly one consumer — `tests/integration/test_trading_flow.py` (~130 lines, docstring "Integration tests — end-to-end flow tests using mocks"), which imports **zero production modules**: `MockExchange.place_order` returns hardcoded `"filled"`, the test asserts `"filled"`; `MockSHM.try_push/try_pop` test the mock's own dict wrapper. ~315 lines of scaffolding testing itself under the name "integration". The neighboring `test_e2e_pipeline.py` is a real e2e (drives `SimulatedExchange`+`CircuitBreaker`) — which makes the theatre visible.

**S186 (Medium) — Fixed in R91.** hft dead test layer. `tests/mocks/mock_exchange.h` (164-line `hft::test::MockExchange`) — **zero includers** across tests/CMake. `tests/test_doctest_cpp_optimizations.cpp` (125 lines: LatencyHistogram/SPSC/spinlock) and `tests/test_doctest_hft_config.cpp` (127 lines: config defaults/YAML parsing) have **no `add_doctest_test` target** and no CI reference — they never compile or run: regressions in `low_latency.h` and `config.h` would pass silently while the tree looks covered. Tests for *live* code that can never execute — the mirror image of tests exercising dead code.

**S187 (Info) — Fixed in R94.** `web-ui/e2e/screenshots.spec.js` — 5 "tests" with zero `expect` calls (screenshot capture for the README) inside the required `test-e2e` CI gate (`ci.yml:502,528`) — green runs count as e2e coverage while asserting nothing.

**Verified clean this round:** zero `assert True`/tautologies across all Python suites; zero shadow-defs of production functions in tests (the S167 pattern does not exist on the Python side); `test_e2e_pipeline.py`/`test_strategy_risk_backtest.py` are real integration tests; all skips are honest dependency gates (hypothesis/scipy/prometheus_client — installed in CI); Playwright e2e specs are real page tests in a required CI job; all doctest targets are CMake-wired except the two orphans; root-vs-`unit/` duplicate test filenames cover different subjects (both real); sim test suite is clean.

## Round 83 — 2026-09-14 — CI/CD workflows + nginx + root configs: 3 open findings (S188–S190)

Scope: `.github/workflows/` (5 files, 1241 lines), `web-ui/nginx.conf`, Dockerfiles, `netlify.toml`, vite/vitest/tsconfig/package.json.

**S188 (High) — Open.** `deploy.yml` builds the production UI without auth tokens or even WS URLs. `build-and-push` passes only `VITE_WS_EXCHANGE`/`VITE_WS_SIGNALS` as build-args (:90-92) — `VITE_SIGNAL_TOKEN`/`VITE_EXCHANGE_TOKEN` ARGs exist in `Dockerfile.prod:9-10` but are never fed → the deployed bundle has empty tokens while prod requires `EXCHANGE_CONTROL_TOKEN` for control commands (S155) → `submit_order`/`start_trading` get `auth_failed` — the deployed dashboard can't trade. Worse, `deploy-web-ui` (Netlify, :29-31) runs `npm run build` with **zero env** → the public bundle bakes `ws://localhost:8765`/`ws://localhost:8766` — the Netlify site points every visitor at their own localhost.

**S189 (Medium) — Fixed in R92.** `ci.yml:42-43` and `:140-141` — `wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key` streams the GPG key to **stdout** (`-O-`); the file `llvm-snapshot.gpg.key` is never created → `gpg --dearmor < llvm-snapshot.gpg.key` fails on the missing file (bash -e) → the LLVM apt repo is never added → `clang-format-18` (lint-cpp) and `clang-17` (test-cpp matrix leg) can't install → both jobs are red on every run. Correct form: `wget -qO llvm-snapshot.gpg.key` (no trailing dash) or pipe `wget -qO- URL | gpg --dearmor | sudo tee`.

**S190 (Low) — Fixed in R92.** `codeql.yml` builds C++ under `|| true` (:65) — a broken build still reaches `analyze`, and CodeQL-C++ needs build-tracing → empty/partial DB → zero C++ findings under a green check. Plus python/javascript are scanned twice per push: codeql.yml's matrix and ci.yml's `security-codeql` job duplicate the work.

**Verified clean this round:** all 5 deploy health-check ports are real (8775 sim / 8080 ai-bot ready / 9091 hft / 3000 web / 3001 grafana); `docker-smoke` hits real `/health` endpoints (nginx.conf:26); `nightly-backtest` is honest (synthetic data → real Backtester → regression gate → issue on failure); `release.yml` changelog is honest; web-ui Dockerfile is a real prod nginx build with /health; `netlify.toml` correct; vitest thresholds + all package scripts live; `audit-deps`/bandit/test-summary are real gates.

## Round 84 — 2026-09-14 — fix round: S188 + C++ risk/book cluster (S178+S179+S180)

**S188 — Fixed.** `deploy.yml` now feeds `VITE_SIGNAL_TOKEN`/`VITE_EXCHANGE_TOKEN` from `secrets.*` into the docker build-args, and the Netlify job gets `env: VITE_WS_EXCHANGE/VITE_WS_SIGNALS` from `vars.*` — tokens deliberately NOT baked into the public bundle (view-only dashboard).

**S178 — Fixed.** The V2 pre-trade layer is now live: `precheck_order` (bot_loop.cpp) calls `check_order` before every `submit_order` in all 3 order paths; `update_risk_state` runs every main-loop tick — UTC-day rollover → `reset_daily`, mark-to-market → `update_pnl_v2`, and `kill_switch->activate(DAILY_LOSS/MAX_DRAWDOWN)` is now reachable (previously only the file trigger could fire it). Fill callbacks feed `on_fill`/`reduce_exposure`. Residual: the arbitrage path bypasses `check_order` (two-leg semantics — noted), `blacklist_symbol` remains a runtime API.

**S179 — Fixed.** Position book is fill-driven: `add_pending_order` marks a symbol engaged on send (no order stacking while a LIMIT rests), `apply_fill` books on FILLED only (weighted-average scale-in, partial-reduce with realized PnL, full close), `sync_position` reconciles the exchange's account broadcast so positions opened while offline are re-adopted after restart. Stray fills (our own close acks, other clients' orders on the shared sim account) are no-ops.

**S180 — Fixed.** `risk.initial_balance` config key seeds `ctx.balance`; every `accounts` broadcast overwrites it with the exchange's real balance (free cash — the honest base for sizing/margin). Position reconcile rides the same feed.

**Bonus fix:** `test_doctest_risk_manager.cpp` "Max drawdown rejected" had a broken premise — `update_pnl_v2(0,-2000,8000)` sets peak=8000, not the assumed 10000, so drawdown was always 0 and the check never exercised. Peak is now established explicitly → 24/24 green.

Verify: clang++22 syntax-clean on `position_manager.h`; doctest binaries run locally — position_manager 22/22, risk_manager 24/24; clang-format-18 --Werror clean; YAML validated. Full C++ build not possible locally (vcpkg deps) — CI compiles.

## Round 86 — 2026-09-14 — fix round: S164 (helm) + S157 + S158

**S164 — Fixed.** The helm chart now deploys a live system. All 8 sub-issues addressed: ai-bot gets `WS_URL` pointing at the release-scoped sim service (was pod-loopback — starved the whole data path while probes stayed green); sim gets `EXCHANGE_WS_HOST=0.0.0.0` (was loopback → k8s httpGet probes CrashLooped the pod); prometheus gets `rule_files` + vendored alerts ConfigMap + `alerting:` → new alertmanager Deployment/Service/ConfigMap; grafana gets provisioning ConfigMaps (datasource→release prometheus, dashboard provider) + vendored dashboard JSONs — no longer an empty shell; netpol gains TCP/443 egress (OpenAI/Discord/exchange APIs — NetworkPolicy can't select by DNS); hft sidecar gets `HFT_KILL_SWITCH_FILE=/app/logs/kill_switch` (writable emptyDir — `/tmp` was read-only) + `HFT_EXCHANGE_WS_URL`; `webUi.wsExchange/wsSignals` now land as Deployment annotations so the required `--set` values are at least auditable; `AI_BOT_AUTH_TOKEN`/`EXCHANGE_CONTROL_TOKEN` wired via optional secretKeyRefs. Enabler: `expand_env` in config_parser.h now supports `${VAR:-default}` and is applied to `simulator_ws_url`/`kill_switch.trigger_file`. Residual: `helm/files/` vendors copies of monitoring/ assets (charts can't read outside chart root — keep in sync); optional secret refs mean a missing secret = documented fail-open.

**S157 — Fixed.** Publisher auth: empty token now logs a loud startup warning (matching the sim's S155 posture); token compares use `secrets.compare_digest` on both the WS handshake and the health-server Bearer middleware; the 9 compute endpoints now sit behind a per-client sliding-window limit (`AI_BOT_COMPUTE_RATE_LIMIT`, default 30/min) — backtest spam can no longer CPU-DoS the bot. New WS round-trip test in test_auth_wiring.py. Residual: VITE_SIGNAL_TOKEN in the JS bundle is inherent to browser clients.

**S158 — Fixed.** Accepted client sockets now get 5s SO_RCVTIMEO/SO_SNDTIMEO — an idle TCP costs ≤5s instead of freezing every probe behind it. The server also honors the previously-dead `metrics.host` key (inet_pton, falls back to 0.0.0.0 with a warn) — `127.0.0.1` keeps positions/PnL off the wire. Residual: /metrics has no auth when bound openly — scoped via config, not token.

Verify: expand_env standalone harness 6/6; 18/18 in test_auth_wiring + test_signal_publisher incl. new rate-limit test; YAML validated; clang-format-18 clean. No local helm binary — templates verified by inspection; full C++ build on CI.

## Round 87 — fix round: S173, S172, S159 resolved

**S173 — Fixed.** `_execute_live_order` reuses a cached live adapter (`_live_adapter`/`_get_live_adapter` in run.py) — the exchange handshake and `load_markets()` run once per bot lifetime instead of once per signal; the adapter is closed on shutdown. `client_order_id` now flows through `place_order` on both paths: `RealAccount` puts `clientOrderId` into the ccxt params (making the real-path retry loop idempotent — a timeout-after-fill resubmits the same id) and `SimulatorAdapter` passes it through the order JSON. `SimulatorAdapter.cancel_order` is implemented over the existing WS protocol via the adapter's pending-future queue, and `ExchangeClient` gained `cancel_order`/`cancel_all_orders`. Tests were rewritten to exercise real cancellation and cid propagation — 86/86 green.

**S172 — Fixed (aligned).** Both backtest engines now default to the simulator's Binance model — fee 0.04%, slippage 2.0 bps (`Backtester` fee_pct 0.075→0.04; `BacktestEngine` slippage_bps 1.0→2.0). The engines remain separate (different APIs — strategy objects + RiskManager vs dict signals + PnLCalculator; merging is a rewrite, not a fix-round change) but identical inputs now produce identical fee/slippage treatment. Default-pinning test assertions updated to the aligned values — 87/87 green.

**S159 — Fixed.** Every flagged key is now wired or removed. **sim:** `metrics.{enabled,port,host}` feed `ExchangeWebSocketServer` (enabled gates the metrics task — which also hosts /health, so shipped yaml now honestly says `true`; port overrides port+10; host falls back to ws host). `account.currency` reaches `Account` via `SimulatedExchange(currency=)`. `visualizer.enabled` is the base gate (`--no-visualizer` remains the CLI override). `market.timeframe` is the fallback source for `timeframe_seconds` via TIMEFRAME_SECONDS. `exchanges.*.symbols` — the three identical 49-symbol lists (147 lines) are deleted; the validator derives the universe from `initial_prices` and treats per-exchange lists as an optional subset (warns on unpriced listings). **ai-bot:** `shm.max_symbols` has a property and feeds `ShmMarketDataWriter` (0 = auto-size to the symbol list; the shipped default 10 would have silently truncated 39 of 49 symbols — now 0). **hft:** `hft_strategies.{fast_ema_enabled,fft_enabled,fft_min_candles}` are real `SignalEngine::Params` fields gating the EMA votes and the FFT block (literal `>= 64u` gone). The four-way `obi_levels` drift collapsed to split keys `obi_levels_5/10/20` in both yamls; the prod parser reads them and `bot_setup` feeds them to `PressureModel` too. Bonus dead key `pressure_model.microprice_enabled` is now a real gate. Dev `metrics.{enabled,port,host}`: the dev parser learned the metrics block, the `is_production ? port : 9091` hardcode is gone, `/metrics` gates on `enabled` (`/health` stays always-on), the Config default moved 9090→9091 to match what always ran, and dev yaml `host` is honestly `0.0.0.0` (containers can't publish a loopback bind). Verified: 404 sim + 18 shm + 86 exchange-factory tests green; shipped sim config validates 0 errors/0 warnings; clang-format clean; C++ compiled where the toolchain allows (CI compiles the rest).

## Round 88 — fix round: S170, S171, S175 resolved

**S170 — Fixed.** Deleted with proven deadness (0 production importers, no refs outside tests): `cross_exchange_arb.py` (337-line arb execution engine — "executes real arbitrage" docstring, never in `build_strategies` or any dispatcher), `marketplace.py` (259-line plugin loader — `install_from_git`/`install_from_archive` importlib-loads arbitrary code, an unmounted security surface too), `utils/helpers.py` (142 lines) plus their four test files (`test_cross_exchange_arb.py`, `test_marketplace.py`, `test_utils.py`, top-level `test_helpers.py`). `run_all_tests.py` globs cleaned. `bot_helpers.py` is live (run.py) — its test kept.

**S171 — Fixed (deleted, not wired).** The strategies-side `CircuitBreaker` needs `on_trade_closed(pnl)` — no realized-PnL feed exists in this service (it generates signals; `PerformanceTracker.record_trade` also has zero prod callers). Wiring it would mean building a PnL pipeline — a feature, not a fix. Removed: the 87-line class, the voter's breaker param/gate, the `strategies.py` re-export, `test_circuit_breaker.py`, and the 5 breaker-integration tests. `EnsembleVoter.analyze`/`strategies` became live instead — `run.py` now passes `strategies=self.strategies`, and `_EnsembleAdapter` was deleted (native `EnsembleVoter(strategies=...)` does the same thing). Bonus: a `fee_pct=0.075` hardcode in `backtest_requests.py` (S172 residue) aligned to 0.04. The publisher's `communication/circuit_breaker.py` is a different, live class — untouched.

**S175 — Fixed.** `fills.sort()` → `[...fills].sort()` — the shared `useExchangeData` fills array is no longer mutated in-place, so "Recent Fills" and other readers keep their newest-first order while the panel is mounted. 18/18 component tests green.

## Round 90 — fix round: S163, S166, S167, S174 resolved

**S163 — Fixed.** The six dead latency panels queried bare histogram names; they now use `histogram_quantile(q, rate(exchange_simulator_*_latency_seconds_bucket[5m]))` — matching the working panels on the same dashboard. Fixed in both `monitoring/grafana/dashboards/` and the vendored `helm/files/dashboards/` copy.

**S167 — Fixed (extraction).** The five shadow copies are gone: production math moved to `src/utils/cointegrationMath.js`, `garchMath.js`, `hmmMath.js`, `kalmanMath.js`, `kmeansMath.js`; the five components import from there, and the five test files now import the same modules instead of defining inline clones. The extraction exposed real divergences the shadows hid: the test's `calcGARCH` was a static-parameter clone of production's MLE gradient descent; test `viterbi` returned a raw path where production returns `{states, logProb}`; `lloyds`/`silhouette` signatures didn't match `kmeansIterate`/`silhouetteScore`. And it caught a real bug: `linearRegression` produced `zScore = NaN` on a perfect fit (`0/0`) — guarded. The new modules also exposed seams that make the tests honest: `kmeansPlusPlus(data, k, rng)` takes an injectable RNG, and `baumWelchStep` is exported so the per-iteration EM tests exercise the real step. 65/65 tests green.

**S166 — Fixed.** `exchange-ui.test.jsx` deleted wholesale — 17 `expect(true)` placeholders plus 27 fixture self-asserts, and its only real asserts covered the dead `ExchangeProvider` removed in S174. In `performance.test.jsx`, the "manual chunks configured" placeholder became a real assert importing `vite.config.js` and exercising all four vendor-split rules; the un-assertable "<2s initial load" placeholder was deleted (browser metric, not a unit test).

**S174 — Fixed.** Deleted with proven deadness (0 production importers, 0 mounts, 0 readers of `--exchange-*` CSS vars): `contexts/ExchangeContext.jsx` (132 lines), `components/ExchangeSelector.jsx`, and the `exchange-ui.test.jsx` theatre file whose only real subject was this dead provider. Real exchange selection flows through the Zustand store. The theme map's coinbase-vs-okx drift confirmed at deletion time. `vite build` + full vitest suite (156 files, 1106 tests) green.

## Round 91 — fix round: S183, S185, S186 resolved

**S183 — UI order lifecycle.** The board text said the sim emits `type:'order'` acks — the real wire sends `type:'fill'` carrying `order.status` (PENDING for resting orders). Fixed against the actual protocol: `useExchangeData.js` now tracks an `openOrders` map keyed `exchange|order_id` — PENDING fills/batches add, FILLED/REJECTED/CANCELLED remove; `order_cancelled` removes one, `orders_cancelled` removes the listed ids; `snapshot`/`sync_state` hydrate `open_orders` wholesale (new `Exchange.get_pending_orders` feeds `ws_broadcast`). `submitOrder` returns a Promise resolving on the `fill` ack matched by `client_order_id` (echo now wired through `Order.to_dict` + `_handle_order_inner`). `OrderForm` awaits the ack — shows Filled/Resting/Rejected/awaiting-ack instead of unconditional "Order submitted". New `PendingOrders` panel in the Account tab lists resting orders with per-order cancel + Cancel All senders. 61 vitest green incl. 17 new lifecycle tests.

**S185 — mock-testing-mock deleted.** `tests/mocks/mock_objects.py` (185 lines) + `tests/integration/test_trading_flow.py` (5 tests, zero production imports — mocks asserting on themselves). `tests/mocks/` package removed. Sibling integration tests use real `SimulatedExchange`/`Backtester`/`RiskManager` — unaffected. 1433 ai-bot tests pass.

**S186 — hft dead layer removed, orphans wired.** `tests/mocks/mock_exchange.h` deleted (0 includers). Both orphan doctests got `add_doctest_test` targets: `test_doctest_cpp_optimizations` (8/8 pass locally via g++) and `test_doctest_hft_config` — which needed `src/core/config.cpp` + yaml-cpp/fmt/spdlog links since `Config::load` isn't header-only. Same missing-source bug found and fixed in `test_integration_config` (registered but never buildable — no exe in build/). hft_config itself compiles only in CI (no local yaml-cpp headers) — verified wiring, not local run.

## Round 92 — fix round: S189, S190, S184, S153, S176 resolved

**S189 — dead CI legs revived.** `wget -qO- <key-url>` streamed the GPG key to stdout while `gpg --dearmor <` read a file that never existed — lint-cpp and the clang-17 test leg were broken on every run. Now `wget -qO- | gpg --dearmor | sudo tee` pipes the key directly (ci.yml ×2); pipefail surfaces a wget failure immediately.

**S190 — CodeQL dedup + honest failure.** `codeql.yml` matrix dropped python/javascript (ci.yml's `security-codeql` already scans them with `security-extended` — the stronger job survives) and the C++ build lost its `|| true` — a broken build now fails the job instead of feeding `analyze` an empty database under a green check.

**S184 — window-global timeout.** `window.__hawkesTimeout` → `useRef` (HawkesProcess.jsx) — each mounted instance owns its timeout; a second mount's unmount no longer kills the first's pending-fit timer.

**S153 — alert pipeline timeout.** `aiohttp.ClientSession()` → `ClientTimeout(total=15, connect=5)` — a hung webhook stalls the alert loop for ≤15s instead of ~300s.

**S176 — dead utils deleted.** `auditExport.js` + `cn.js` + their test files — zero production importers each, proven by grep before deletion.

## Round 94 — 2026-09-14 — fix round: 3 fixes + 1 invalidation (S177/S181/S182/S187)

**S177 — Invalid.** All 11 `JSON.parse(localStorage)` sites were already wrapped in try/catch when R79 recorded the finding (`git blame`: try-blocks predate the audit; `6a05e5e` only added the IS_DEV gate to existing catches). Two listed sites aren't localStorage at all — import-file parsers with schema validation. Pattern-match false positive; closed without code change.

**S181 — Fixed.** `run_v2_signal_loop` gate widened to `(!v2_enabled && !v3_enabled)` — a v3-only config now actually runs the loop instead of constructing+prepopulating an engine that never analyzes. Confirms v3's real semantics: `generate_signal` prefers engine_v3 when constructed (replacement, not layer).

**S182 — Fixed.** `open_position` deleted outright — 0 prod callers since S179 (booking goes through `apply_fill`). The doctest suite's 24 call sites rerouted through a `open_via_fill` helper (`add_pending_order` + `apply_fill(FILLED)`) — tests now exercise the live booking path. 22/22 green.

**S187 — Fixed.** All 7 screenshot tests now carry real `toBeVisible` asserts against verified selectors (`#main-content`, `canvas`, `getByTestId('tab-*')`, "Order Book"/"Open Positions" text). The old `[data-panel-id]` selectors never matched anything — `DetachablePanel` doesn't render the attribute. 7/7 green locally.

## Round 95 — 2026-09-14 — fix round: 6 closed (S160/S161/S162/S165/S168/S169)

**S160 — manifest counts.** `204 panels and 44+ math models` → `278 panels` (real `{ id:` count in registry.js); the unverifiable "44+ math models" claim dropped — no model registry exists to check it.

**S161 — config guide.** §2 rewritten against the real `config.yaml` schema — `exchanges.<name>.{fee_pct,slippage_bps}`, `initial_prices`, `market.*`, `account.*`, `websocket.{host,port}`, `metrics.enabled` + honest note that tick interval/compression/encoding are hardcoded. The earlier stale-warning block removed (the phantom table it described is gone).

**S162 — verify-close.** Doc already corrected: `update_config`/`config_updated` sender-ack, `fills_batch.orders`, `welcome.server`, error-without-code, `speed_change` marked nonexistent, `start_trading`/`stop_trading` documented. All 8 mismatch classes converge with the dispatcher.

**S165 — infra residue.** Dead `vpc_id` variable + both env call-site args removed (subnet_ids is the real input); Makefile `.PHONY` completed with the 5 tail targets.

**S168 — all stale counts at once.** WEB_UI.md/ARCHITECTURE.md/README: 99-unit→153, 103-files→157, 295/296-components→291, 162-files→157. Hook listing in WEB_UI.md cleaned of deleted useInterval/usePerformance.

**S169 — dead hooks deleted.** `useInterval.{js,ts}` + `usePerformance.js` + their two test files (~674 lines) — zero prod importers; the live `useDebounce.ts` is the real hook.

## Round 98 — 2026-09-15 — sim periphery + ai-bot root sweep: 3 open findings (S191–S193)

Scope: `exchange_simulator/` modules outside the R11/R12/R18/R71 clusters — `arbitrage.py`, `audit_logger.py`, `config_validator.py`, `data_export.py`, `options_*.py`, `visualizer*.py`, `ws_constants.py`, `ws_metrics.py`, `ws_prometheus.py`, `__main__.py`, `conftest.py`, `models.py` — plus `ai-signal-bot` root entry files (`run.py`, `run_backtest.py`, `monitor.py`, `conftest.py`) never leaf-swept (R78 covered only `src/`). Recorded only; no source changes.

**S191 (Low) — Fixed in R99.** Dead options cluster — deprecated `options_pricing` + test-only `options_strategies` (~1014 lines). `options_pricing.py` (428) is deprecated with a module-level `DeprecationWarning` (:15) — its only importers are `options_strategies.py` and its own test. `options_strategies.py` (306) has **zero** production importers — only `test_options_pricing.py` (280 lines shadow-testing dead code). The live path is `options_simulator.py` (wired at `ws_message_handler.py:546,560` for `options_chain` requests). `run_all_tests.py:104` still references the dead test file.

**Fix:** all three files deleted (~1014 lines) — deadness proven by grep (options_pricing importers = options_strategies + own test; options_strategies = 0 prod importers). Live path `options_simulator.py` keeps its own test file. The `run_all_tests.py` glob updated locally (file is gitignored, untracked).

**S192 (Info) — Fixed in R99.** `alerting.py` docstring/ctor advertise an email channel that doesn't exist. `AlertSystem.__init__` accepts `email_smtp` (:56) and stores it (:61); docstring :3 claims "Channels: log, webhook (Discord/Telegram), email." — but `_send_alert` (:152-157) only branches to discord/telegram/webhook; there is no `_send_email`. `run.py:377-382` passes only the four live channels. Dead parameter + false docstring.

**Fix:** `email_smtp` param and field removed from `AlertSystem.__init__`; docstring corrected to "log, webhook (Discord/Telegram)". Zero callers referenced it.

**S193 (Low) — Fixed in R99.** `AuditEventType` advertises 13 event types; 5 are never emitted: `POSITION_MODIFIED`, `CONFIG_CHANGE`, `SYSTEM_STOP`, `ERROR`, `WARNING`. `audit_logger.py`'s docstring promises "Configuration changes" and "System events (start, stop, errors, warnings)", yet `ws_message_handler.py` contains zero audit calls — `_handle_update_config` mutates leverage outside the audit stream, and graceful shutdown emits no `SYSTEM_STOP`. The audit trail misses exactly the ops events it exists to record.

**Fix:** real emit sites wired — `CONFIG_CHANGE` in `_handle_update_config` (metadata={keys}), `SYSTEM_STOP` in `start()`'s finally (covers SIGTERM/SIGINT), `ERROR` in `_process_message`'s handler except, `WARNING` in `_parse_message`'s invalid-json/msgpack paths. `POSITION_MODIFIED` removed from the enum — no domain event exists (positions mutate only via orders). `audit_logger` docstring corrected. Runtime-verified: CONFIG_CHANGE emits with applied-key metadata.

**Verified clean this round:** both `conftest.py` files are legitimate sys.path shims; `ws_constants.py` flags all consumed; `arbitrage.py` live (detector→broadcast→auto-execute); `audit_logger` reaches `AuditLogViewer` via `audit_logs` broadcast; `data_export` wired to `--export` CLI; `monitor.py`/`run_backtest.py` documented CLIs with resolving imports; all 13 `models.py` classes consumed; caches bounded (deque maxlen / `_max_*` trims); `ws_metrics` exports all 9 counters; `hft-executor` Rust crate fully absent from the tree; `account.currency` now wired end-to-end (S159 fix confirmed at `__main__.py:87` → `exchange.py:50` → `models.py:414`).

## Round 100 — 2026-09-15 — grafana/e2e/config-accessor sweep + stale-docs resweep: 2 open findings (S194–S195)

Scope: `monitoring/grafana/` (5 dashboard JSONs + provisioning yml), `web-ui/e2e/` (4 specs + `dismiss-onboarding.js` + `playwright.config.js`), `ai-signal-bot/config/` (`__init__.py` 448-line accessor layer + `settings.testnet.yaml`), plus a docs-vs-deleted-code resweep after R97/R99 deletions. Recorded only; no source changes.

**S194 (Medium) — Fixed in R101.** `ai-signal-bot/config/settings.testnet.yaml` is a broken testnet path on four independent layers:

1. **Validation rejects it standalone.** The file is a fragment containing only an `exchange:` section; `SignalBotConfig.load(validate=True)` raises `ValueError` with 5 errors (missing `trading`/`risk`/`strategies`/`indicators` sections + `exchange.websocket_url`/`default_exchange`). The documented command `python run.py --config config/settings.testnet.yaml` (`docs/theory/useful_info_en.md:151`) therefore dies at startup — verified by running it.
2. **`testnet: true` never reaches the exchange layer.** Nothing reads `exchange.testnet` (or `mode`/`name`/`api_key`/`api_secret`/`symbols`) from config — `run.py:580-585` constructs `ExchangeFactory(mode=REAL, exchange=default_exchange, symbols, rest_timeout)` with no `testnet`/`api_key`/`api_secret`. Factory default `testnet=False` means a fixed config would still hit **real Binance, not the sandbox**.
3. **Env-var names mismatch.** The yaml interpolates `${BINANCE_TESTNET_API_KEY}`/`${BINANCE_TESTNET_API_SECRET}`; `ExchangeFactory` reads `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` (`exchange_factory.py:371-372`).
4. **`${VAR}` is never expanded.** `config/__init__.py:26` uses `yaml.safe_load` with no env-substitution — credentials would load as the literal string `"${BINANCE_TESTNET_API_KEY}"`.

The file's own header also advertises CLI flags that don't exist (`--exchange-mode real --testnet --api-key/--api-secret` — `run.py` argparse has only `--config`/`--dashboard`/`--metrics`/`--backtest`). A sandbox-trading config that either crashes on load or silently routes to the live venue is exactly the failure mode a testnet preset exists to prevent.

**Fix:** `SignalBotConfig.testnet` accessor added (`config/__init__.py`, `exchange.testnet`, default `False`) and wired into `ExchangeFactory` at `run.py:580` → `RealExchangeAdapter` → `RealAccountManager` → ccxt sandbox mode. `settings.testnet.yaml` rewritten as a complete loadable preset — all required sections present, `paper_trading: false` + `testnet: true`, credentials documented as `EXCHANGE_API_KEY`/`EXCHANGE_API_SECRET` env vars (the names the factory actually reads); dead keys (`exchange.mode`/`name`/`api_key`/`api_secret`/`symbols`/`intervals`) removed; header usage corrected to the real `--config` flag. Verified: the file now passes `SignalBotConfig.load` validation and `testnet=True` reaches the adapter.

**S195 (Info) — Fixed in R101.** Stale-doc cluster — documentation references modules deleted in R99 and config keys that never existed:

- `docs/ARCHITECTURE.md:201` lists `options_strategies.py` / `options_pricing.py` as strategy helpers — both deleted in R99 (S191).
- `docs/TESTING.md:129` lists `test_options_pricing` in the test inventory — deleted in R99.
- `docs/theory/TECHNICAL_REFERENCE.md:1427-1428` lists both dead options files as live modules.
- `docs/DEPLOYMENT.md:734-739` "HFT Trade Bot" tuning block shows `latency_optimization.enable_thread_pinning`, `enable_spinlocks`, `shm.ring_buffer_size` — **none are parsed**: the real keys are `thread_pinning`/`execution_thread_core` (prod names, `config_parser.h:317-319`) or `thread_pinning_enabled`/`execution_core_id` (dev names, `:157-159`), and SHM sizing lives at `ipc.signals.capacity`/`ipc.fills.capacity` (`:208,213`). Following the doc produces a config the parser silently ignores.

**Fix:** all four sites corrected — ARCHITECTURE/TESTING/TECHNICAL_REFERENCE no longer list the deleted options files (`options_simulator.py` is the live entry); the DEPLOYMENT tuning block now uses the keys the parser actually reads (`thread_pinning`/`execution_thread_core`, `ipc.signals.capacity`/`ipc.fills.capacity`).

**Verified clean this round:** all 70 `SignalBotConfig` accessors have live readers (only `__getattr__` fallback unused — legitimate); all 5 grafana dashboards are valid JSON with real panels (flat + `{"dashboard":…}` wrapped formats are both file-provisionable; 46 exprs across 4 files; `ai_signal_bot_metrics.json` flat-format, others wrapped — inconsistent but loadable); `dashboards.yml` provider `options.path` matches the compose mount; datasource `url: http://prometheus:9090` is correct container-to-container; `playwright.config.js` is wired (`dev:mock` script exists, baseURL/webServer agree); all 3 `dismiss-onboarding.js` exports imported; `monitoring/alerts/` is an empty untracked dir; `latency_optimization` dual key-names work because dev/prod yamls each use their own parser branch's names.

## Round 102 — 2026-09-15 — verify round: 9/9 confirmed, 1 new defect surfaced (S196)

Re-verified all 9 unverified done-log entries adversarially against code: **S150** (dead keys gone, `mode`→`is_production` gate at `config_parser.h:183`, banner honest), **S151** (gap detection + pre-gap cursor + cooldown in both clients; 4 py + 3 vitest green), **S152** (`ws_client.h` deleted, `watchdog.h` wired into both live conns with mutex-guarded client + joinable reconnect), **S154** (full TIF chain executor→handler→sim→broadcast→UI eviction; 12 TIF tests green), **S191** (3 files deleted, 0 orphan refs), **S192** (`email_smtp` fully gone), **S193** (4 audit emits at real sites, `POSITION_MODIFIED` removed), **S194** (testnet wired config→factory→adapter; preset loads), **S195** (4 stale-doc sites corrected).

**S196 (Medium) — Fixed in R103.** Verify-surfaced defect in `hft-trade-bot/config/config.prod.yaml`: two `kill_switch` blocks coexist — `ipc.kill_switch` (:53-58, env-aware `trigger_file: "${HFT_KILL_SWITCH_FILE:-/tmp/kill_switch}"`) and `risk.kill_switch` (:123-124, literal `"/tmp/kill_switch"`). Both parsers write `cfg.kill_switch_trigger_file`; `parse_prod_risk` runs after `parse_prod_ipc` (`config.cpp:30` vs `:46`) and overwrites unconditionally — the `HFT_KILL_SWITCH_FILE` env override (added for k8s `readOnlyRootFilesystem`, per its own comment) never reaches runtime; the file trigger always lands on `/tmp/kill_switch`. Also `ipc.kill_switch.shm_name` (:54) is never parsed — the SHM name is hardcoded `"/hft_kill_switch"` at `bot_setup.cpp:180`.

**Fix:** `kill_switch` consolidated to a single home under `ipc.kill_switch` — the shadowing `risk.kill_switch` block removed from `config.prod.yaml` and its parse site deleted from `parse_prod_risk` (single-home rule documented in a comment at `config_parser.h:289`). `ipc.kill_switch.shm_name` is now parsed into `cfg.kill_switch_shm_name` (`config.h:124`) and consumed by `bot_setup.cpp:179` instead of the hardcode. `HFT_KILL_SWITCH_FILE` now actually reaches runtime. Dead fixture keys removed from `test_integration_config.cpp`.

## Round 105 — 2026-09-15 — test-suite leaf-sweep + consistency-gate internals: 3 open findings (S197–S199)

Scope: `exchange_simulator/tests/` (34 files) + `ai-signal-bot/tests/` (93 files) — per-file test↔live alignment (the shadow-test class S191 proved real) — plus `scripts/test_config_consistency.py` internals and a ledger-consistency check between AUDIT_FINDINGS and the done-log. Recorded only; no source changes.

**S197 (Info) — Open.** `scripts/test_config_consistency.py` (the pre-commit config gate, wired at `pre-commit-check.py:481/:902`) has three internal defects: (a) the `audit`-section check is duplicated back-to-back at :209-214 — the second block is dead code; (b) `_shared_signal_ws` (:137) loads `websocket.ai_signal_bot` from shared_config but is never compared against anything — a drifted signal-port would pass the gate green; (c) `test_risk_parameter_consistency` (:172-199) prints WARNING for every mismatch and unconditionally returns True — a "consistency check" that cannot fail by construction.

**S198 (Info) — Open.** Status drift in this document: 12 entries still carry "— Open." markers though all are closed in `.cascade/done-log.md` (several `✅ verified`): S109, S116, S117, S155, S156, S157, S158, S164, S178, S179, S180, S188. The findings doc contradicts the ledger it feeds — a reader sees a dozen open Medium/High findings that don't exist on the board.

**S199 (Info) — Open.** `exchange_simulator/tests/requirements.txt` is dead and harmful: 2 lines (`pytest>=7.0`), zero references repo-wide. The real test deps live in `exchange_simulator/requirements-dev.txt` (pytest>=8.3.4 + pytest-asyncio + hypothesis). Anyone who installs the dead file gets pytest without pytest-asyncio — every async sim test silently skips.

**Verified clean this round:** all 127 `test_*.py` imports resolve to existing modules (0 shadow-imports); `test_simulator`/`test_simulated_exchange`/`test_exchange` overlap in coverage but all hit live classes; conftests are real shims/fixtures; `tests/logs/` untracked residue only; `stress_test.py`/`load_test_50_symbols.py` are documented non-collected load scripts (the `scripts/` duplicate was deleted back in S138); property/load tests use honest dep-gate `skipif`; `test_config_consistency.py` is genuinely wired into pre-commit and its hard checks (symbols/exchanges/ws-url) can fail.

## Round 106 — 2026-09-15 — web-ui test leaf-sweep + docs/metadata resweep: 3 open findings (S200–S202)

Scope: `web-ui/src/test/` (154 vitest files — the largest test surface never per-file audited), `shared_config.yaml` leaf values, `docs/guides/` + `MONITORING_GUIDE.md` claims vs code, and `monitoring/` leaf files. Recorded only; no source changes.

**S200 (Info) — Open.** `web-ui/index.html:6` (`<meta name="description">`) and `:12` (`og:description`) still advertise "204 panels, 44+ math models". S160 corrected the panel manifest in `vite.config.js` to 278 panels but the HTML head was missed — search results and social previews serve the stale pre-S160 numbers. Bring in line with the manifest (or derive from a single source).

**S201 (Info) — Open.** `docs/guides/DEVELOPMENT_GUIDE.md` project-tree section is a stale cluster — 7 wrong facts: "28 test files" for exchange_simulator (real: 31) :66; "88 test files" for ai-signal-bot (real: 93) :82; `exchange_simulator/config/` listed as a directory (it's `config.yaml`, a file) :67; `web-ui/src/contexts/` listed (doesn't exist — contexts live under `components/contexts/`) :98; `hft-trade-bot/pch.h` at repo-root (real: `src/pch.h`) :94; "227 React components" (real: 295) :97; `web-ui/src/panels/PanelRegistry.jsx` (real: `registry.js`) :246. A contributor following the guide edits files that don't exist.

**S202 (Low) — Open.** `monitoring/ebpf_monitor.py` is an orphan with a broken core metric. The only eBPF program is `TRACEPOINT_PROBE(raw_syscalls, sys_enter)` (:53-75) which writes `ts_start` but never `ts_end` — so `latency_ns` is always 0 (:121) and `ebpf_syscall_avg_latency_us` permanently reports zero; the `syscall[32]` name field is never populated; the docstring advertises network-packet, cache-miss and malloc tracking that have no code; and nothing runs it — zero references in compose/helm/k8s/scripts/CI. Either add the `sys_exit` probe pair + wire a deployment, or delete the file.

**Verified clean this round:** all 154 web-ui test files import resolvable modules, 0 shadow subjects (every tested module has non-test importers), 0 files without `expect(` assertions; `shared_config.yaml` `timeframe_seconds: 300` reaches `MarketSimulator` via `exchange_simulator/__main__.py:69` (the file is a declared reference, not runtime-loaded — honest); all 22 metric names in `MONITORING_GUIDE.md` are actually emitted; guides/README/WEBSOCKET_PROTOCOL reference no deleted modules.

## Round 107 — 2026-09-15 — e2e spec internals + helm chart + terraform: 4 open findings (S203–S206)

Scope: `web-ui/e2e/` (5 spec files + helpers), `helm/` chart internals (11 templates + vendored files), `terraform/` (7 files). Recorded only; no source changes.

**S203 (Medium) — Open.** `helm/templates/pdb.yaml`: 2 of 3 PodDisruptionBudgets select zero pods. The `exchange-simulator` PDB (:32) matches `component: exchange-simulator` (hyphen) while the Deployment labels pods `exchange_simulator` (underscore, exchange-simulator.yaml:9/15/20) — node drains evict the simulator freely despite the PDB existing. The `hft-trade-bot` PDB (:49) selects `component: hft-trade-bot`, but the HFT bot is a sidecar inside the ai-signal-bot pod — no pod ever carries that label (the ai-bot PDB does cover the shared pod, so this one is doubly dead). Also `ingress.yaml` routes `/grafana` → grafana:3000, but no `GF_SERVER_SERVE_FROM_SUB_PATH`/`GF_SERVER_ROOT_URL` is set — enabling ingress gives a 404 grafana path.

**S204 (Medium) — Open.** `terraform/modules/eks/main.tf:45-57`: the "prod" EKS cluster has `endpoint_public_access` defaulting to true with `public_access_cidrs` = 0.0.0.0/0 — the API server is world-reachable; no `encryption_config` — Kubernetes Secrets (the chart's api-keys secret holds OpenAI/exchange tokens) sit unencrypted in etcd; no `enabled_cluster_log_types` — no API/audit control-plane logs; `version = "1.28"` is past EKS support. Both environments also pass `concat(public_subnet_ids, private_subnet_ids)` to the node group, and public subnets set `map_public_ip_on_launch` — prod worker nodes get public IPs.

**S205 (Info) — Open.** Terraform doc drift: `docs/DEPLOYMENT.md:339` claims "The `terraform/` directory … was removed in the S109 cleanup" — it exists (7 files; only the RDS/ElastiCache modules were removed). Both `terraform.tfvars.example` files still carry `db_password` for the deleted RDS module (undeclared-variable warning on plan). `terraform/README.md` advertises "CloudWatch log groups" — no `aws_cloudwatch_log_group` resource exists.

**S206 (Info) — Open.** e2e theater in `web-ui/e2e/`: three misnamed/vacuous specs — `smoke.spec.js:66-71` "status bar is visible at bottom" asserts `body` visibility; `mock-mode.spec.js:64-70` "can toggle sidebar" toggles nothing; `trading.spec.js:86-92` "mock mode banner shows" asserts the header. `dismiss-onboarding.js` hides ALL `.fixed.inset-0.z-50` overlays plus the notification-toast region — the suite is structurally blind to error overlays and toasts; and the console-error allowlist (`mock-mode.spec.js:151-160`) filters `network`/`NaN` — real errors pass silently.

**Verified clean this round:** the helm Prometheus `hft-trade-bot` job scraping `ai-signal-bot:9091` is CORRECT — the HFT sidecar shares the pod and the Service publishes port 9091; vendored `helm/files/` (alerts.yml, alertmanager.yml, 5 dashboards) are byte-identical to `monitoring/`; probe ports are real (sim 8775 `/health`, ai-bot 8080 `/live`+`/ready`); the web-ui template fails fast on empty `wsExchange`/`wsSignals`; grafana provisioning mounts are correct; the terraform S3 module is solid (versioning, SSE, public-access-block, lifecycle); e2e is wired into a required CI gate.

## Round 108 — 2026-09-15 — repo-root + build/config leaf-sweep: 3 open findings (S207–S209)

Scope: repo root (env files, scripts, Makefiles, untracked residue dirs), per-component build config (Dockerfiles, CMakeLists, nginx.conf, .pre-commit-config, .gitattributes, .sops.yaml), and the gitignored-vs-tracked boundary.

**S207 (High) — Open.** `ai-signal-bot/run.py:31` unconditionally imports `run_logger` — a file that is **gitignored** (`.gitignore:181`, deliberately untracked per CHANGELOG:62). A fresh clone cannot start the bot: `python run.py` → `ModuleNotFoundError`. Both `ai-signal-bot/Dockerfile` and `Dockerfile.prod` end with `CMD ["python", "run.py", "--metrics"]` — the built image crash-loops (and the build context is `./ai-signal-bot`, so the root file can't reach the image even if it were tracked). CI `test-python(ai-signal-bot)` collects `test_run_equity.py` + `test_shm_alerting_wiring.py` which do `from run import AISignalBot` → collection errors on a clean checkout. The exchange simulator guards the identical import (`__main__.py:26-28`, `websocket_server.py:37-39` → `None` fallbacks); the ai-bot does not. Fix is either shipping `run_logger.py` (un-ignore it) or adding the same try/except + stdlib logging fallback.

**S208 (Low) — Open.** `Makefile:29-30` `test-cpp`: `ctest --output-on-failure 2>/dev/null || echo "C++ tests skipped…"` — a real ctest failure (not just a missing build dir) exits non-zero, hits `||`, and `make test` reports green. Can't-fail gate, S066 class. Split the cases: missing build dir → skip message; ctest ran and failed → propagate.

**S209 (Info) — Open.** Tracked docs describe gitignored files as system components: `docs/ARCHITECTURE.md:202,228,591` name `run_logger.py` the canonical per-run logger for both Python services; `docs/WEB_UI.md:495-496` list `error_monitor.py`/`price_monitor.py` as standard utilities. All four are in `.gitignore` — a reader who clones the repo searches for files that aren't there. Either ship them or label them "local dev tools, not in repo".

**Verified clean this round:** `.env.prod`/`web-ui/.env` are gitignored (no committed secrets); `.env.mock` is a single benign flag; `websocketpp/`/`vcpkg/` are gitignored vendored deps with a system/vcpkg CMake fallback plus a loud warning; `Makefile.prod`, `build-all.bat`, `no-docker.*` are real commands, not orphans; `.pre-commit-config.yaml` delegates to the canonical hook script; `.sops.yaml` is an untracked template with a placeholder age key (not a secret); `web-ui/nginx.conf` has honest security headers, a real `/health`, and correct service-worker cache rules; prod compose `VITE_WS_*` args are `:?required`-guarded; `audit/`, `build/`, `logs/`, `deploy/`, `PROJECT_*.md`, `hft-skills/` are untracked local residue.

## Round 109 — 2026-09-15 — ci.yml full sweep + compose connectivity audit: 2 open findings (S210–S211)

Scope: `.github/workflows/ci.yml` (621 lines, every job), `docker-compose.{yml,hub,staging,prod}.yml` connectivity wiring, `.env.prod.example`. Recorded only; no source changes.

**S210 (High) — Open.** The compose data path was never wired — all four compose files are green-but-dead. (a) `ai-signal-bot`: no `WS_URL` env in dev (`docker-compose.yml:76-78` sets only PYTHONUNBUFFERED), hub, staging (:69-70 only LOG_FORMAT), or prod (`env_file: .env.prod`, but `.env.prod.example` never documents `WS_URL`) → falls back to `settings.yaml:73` `ws://localhost:8765` = the bot's own container loopback → zero market data → no signals. (b) `hft-trade-bot` dev/hub/staging run `config/config.yaml` whose `exchange.websocket_url` is `ws://localhost:8765` (`config.yaml:75`), and the dev parser path (`config_parser.h:51`) applies no env expansion → loopback again. (c) hft prod runs `config.prod.yaml` with `${HFT_EXCHANGE_WS_URL:-ws://exchange_simulator:8765}` — the default uses an underscore while the compose service is named `exchange-simulator` → DNS NXDOMAIN even in prod, and `HFT_EXCHANGE_WS_URL` is not in `.env.prod.example`. Every healthcheck stays green (`/health` endpoints are self-contained HTTP servers) — `docker compose up` yields a fully dead trading path that looks healthy. Helm got this wiring in S164 (`WS_URL` + `HFT_EXCHANGE_WS_URL` + env-expansion support); compose never did.

**S211 (Low) — Open.** ci.yml gate edges: `audit-deps`'s "Check for vulnerabilities" step (:325-334) is dead code — the preceding `npm audit --audit-level=high` (:323) already exits non-zero on high/critical, so the grep-gate is unreachable. `security-bandit`: `if [ -f bandit-report.json ]` (:384) silently skips the severity check when bandit crashes before writing the report — job goes green with no scan performed.

**Verified clean this round:** `test-summary` aggregator is honest (`needs.*.result` per job, fails on non-success); `test-count` has real per-language floors (75/20/10/6/30) that can fail; `docker-smoke` curls real health endpoints (and would catch S207's crash-loop); staging Prometheus scrapes resolve via service-name aliases (container_name prefixes don't matter); hub/prod healthchecks hit real endpoints (8775/health, 8080/ready, 9091/health, 3000/health); the hft images install `wget` explicitly for their healthchecks.

## Round 110 — 2026-09-15 — workflows + manifests + CMake wiring: 0 new findings (S200 extended)

Scope: `.github/workflows/{deploy,nightly-backtest,release,codeql}.yml` internals, `web-ui/package.json`/`vite.config.js`, `pyproject.toml`/`requirements*.txt` both python components, `dependabot.yml`, hft-trade-bot CMake test-target↔source audit. Recorded only.

**No new findings.** One existing finding widened: **S200** now also covers `web-ui/package.json:6` — "52 quant models" counts the deleted `research/` package (no `model_registry.py`/`lstm_model.py`/`transformer_model.py` exists in the tree; the honest figure is README:133's "~60 math-model UI panels"). Marketing numbers now diverge in three files: index.html "204 panels/44+ models", package.json "278 panels/52 models", vite.config manifest "278 panels" (correct).

**Verified clean this round:** `deploy.yml` — post-deploy health check hits only prod-published ports (8775/8080/9091/3000/3001), scp source list is coherent, notify semantics handle skipped-deploy correctly; `nightly-backtest.yml` — all imports resolve (`Backtester.run(warmup=)` exists, TrendFollowing/MeanReversion reach via `strategies.py` re-export, every result attribute exists in `results.py`), the regression gate can fail, issue-on-failure is real; `codeql.yml` honest paths-ignore + weekly cron; `release.yml` standard tag flow; `vite.config.js` manifest count (278) is correct, CSP/manualChunks/PWA real; CMakeLists — all 25 test targets have existing sources, zero orphans (S186 holds); dependabot targets real ecosystems; ruff configs + pinned requirements honest.

## Round 111 — 2026-09-15 — scripts/ leaf-sweep + exchange engine re-check + docs stragglers: 8 open findings (S212–S219)

Scope: `scripts/` leaf files never per-file audited (`benchmark_suite.py`, `walk_forward_ci.py`, `health-check.py`, `ci-equivalence.py`, `deploy.sh` native/stop paths, hook wrappers), exchange-simulator engine internals re-check (liquidation/margin/funding/OCO/arb paths in `exchange*.py`, `market_simulator.py`, `ws_broadcast.py`, `audit_logger.py`), `web-ui/public/`, and root docs stragglers (`CONTRIBUTING.md`, `SECURITY.md`, `README_PROJECT_OVERVIEW.md`). Recorded only; no source changes.

**S212 (Medium) — Open.** msgpack is negotiated but never honored on the hot path. The server stores per-client encoding in `_client_encodings` (`ws_message_handler.py:361-365`) and `_send_json` respects it (`ws_broadcast.py:57-58`), but all three broadcast paths — `_broadcast_market_data` (:470-474), `_broadcast_audit_events` (:244-247), `_broadcast_fills_batch` (:310-313) — serialize with `orjson.dumps`/`json.dumps` unconditionally. Worse, the ai-bot client discriminates msgpack by `isinstance(message, bytes)` (`ws_client.py:165`), and server-side orjson sends **binary** frames even for JSON-negotiated clients — so merely installing `msgpack` in the bot environment (it's not in `requirements.txt` today) makes every tick frame fail `msgpack.unpackb` → `ValueError` → "Invalid message" warning → total silent feed loss, even with default `encoding="json"`. `WEBSOCKET_PROTOCOL.md:1078-1085` advertises msgpack as a production option "reducing bandwidth ~40-60% for large order book and candle payloads" — precisely the messages that are never packed. Either honor the negotiated encoding in broadcast paths or drop msgpack from the protocol doc + negotiation.

**S213 (Low) — Open.** The arbitrage pipeline can never fire — the market model excludes it by construction. `market_simulator.py:42` gives each exchange a *fixed* multiplicative offset (`1.0 + i*0.0002`, max ~4 bps) and `_generate_full_ob` derives the book spread from per-*symbol* volatility only — identical across exchanges — so every cross-exchange book pair has `best_bid(B) <= best_ask(A)` once offsets are applied, or a gross spread far below the ~19 bps fee+slippage floor. `arbitrage.py:163` returns `None` on `sell_price <= buy_price` before `min_spread_bps` is even reached → `scan()` returns ∅ forever; `ws_broadcast.py:343`'s auto-exec (`spread_bps > 20`) is unreachable code; the UI arbitrage panel is permanently empty. The R98 clean-claim ("detector→broadcast→auto-execute живые") was wiring-level — the wiring exists but the model makes detection impossible. Either give exchanges independent price noise (jittered offsets) or label the feature "market too efficient to trigger."

**S214 (Low) — Open.** `scripts/` measurement theater. `benchmark_suite.py` bills itself as "Latency measurement for all HFT components" but all six benchmarks time inline toy loops — `json.loads` of a canned dict, list-reallocation "order book update", a hand-rolled RSI — zero real components are imported (not even the Python ones); `make benchmark` (Makefile:81) and PERFORMANCE.md:124 present these numbers as pipeline latencies. `walk_forward_ci.py` never executes a strategy: `WF_STRATEGY` is passed to the subprocess and echoed straight back into the JSON report; all five "strategies" compute Sharpe/drawdown on the *same* `seed=42` GBM series → byte-identical metrics; there is no in-sample/out-of-sample split (not walk-forward at all); and the docstring's "Runs nightly" is false — no workflow calls it (nightly-backtest.yml does its own real walk-forward); reachable only via `Makefile:84`.

**S215 (Low) — Open.** `scripts/deploy.sh` native mode is broken in three places and docker mode uses EOL tooling. `start_native` does `cd exchange_simulator && python -m exchange_simulator` (:147-148) — a package cannot be `-m`-imported from inside itself → ModuleNotFoundError on every native start. `stop_deployment` uses `pkill -f "ai_signal_bot"` (:114) but the bot runs as `python run.py` — the pattern never matches → stop/restart leaves a live duplicate bot attached to the simulator socket. `ENVIRONMENT` is read (:16) and logged (:253) but never branches — a dead flag. The docker path calls `docker-compose` (v1, EOL since 2023) four times while CI, `docker-smoke-test.sh` and the `.bat` twin all use `docker compose` v2 — on modern installs the v1 binary doesn't exist and the prerequisite check exits. R42/R61 verified the backup/rollback and health-check blocks; the start/stop paths weren't part of that check.

**S216 (Info) — Open.** Dev-tooling self-assertion cluster. `ci-equivalence.py` extracts real `check_*` names from `pre-commit-check.py` (:37-44) but never validates the `CI_TO_PRECOMMIT` mapping against them — the coverage verdict is its own hardcoded table; the `test-rust`→`check_rust_build_and_test` row is a phantom on both sides (no such CI job, no such function — the verifier silently "covers" something that doesn't exist). `health-check.py` scans only `<component>/src/` for coverage gaps and duplicate functions (:127, :169) — `exchange_simulator` uses a flat layout, so the entire component is silently excluded from both reports. `install-hooks.sh` is referenced by both hook-script headers but doesn't exist — only `install-hooks.bat` ships, so POSIX users have no installer. `pre-commit-check.py`'s docstring (:7-8) and `install-hooks.bat`'s echo both advertise "cargo build + test (Rust)" — the repo contains zero `Cargo.toml` files.

**S217 (Info) — Open.** `CONTRIBUTING.md` stale-facts cluster. The project tree (:442-471) documents deleted `src/ml/` and `src/research/` ("52 quant models") directories; test counts are wrong in four places ("36" sim files → real 31; "155" ai-bot → 93; "157" :302 / "162" :460 web-ui → 153; "49" C++ → 25); "13 trading strategies" → 12; "50 symbol definitions" → 49; "docs (15 files)" → 13; prod compose claims "+ PostgreSQL, Redis" (:470) — neither service exists; the run instructions repeat the broken `cd exchange_simulator && python -m exchange_simulator` (:255-256) and `cd hft-trade-bot/build && ./hft_trade_bot config/config.yaml` (:263-264) — config lives at `../config/config.yaml` relative to build/. A contributor's first setup run breaks on the first commands.

**S218 (Low) — Open.** `README_PROJECT_OVERVIEW.md` is an undisclaimed fossil at repo root. Its architecture diagram (:27) shows the deleted Rust `hft-executor` as the live FFI order path; the "ML (real)" section (:74-78) lists `rl_trader.py`/`automl.py`/`feature_store.py`/`model_registry.py` — all deleted; "Research (52 models)" (:80-84) describes a deleted directory; the "Previously Slop" table (:96-98) says lstm/transformer were "Kept for educational purposes" — they were removed; counts are stale throughout. The sibling snapshot docs (`REFACTORING_PLAN_10DAYS.md`, `PROJECT_AUDIT.md`) carry explicit HISTORICAL disclaimers — this one doesn't, so a reader gets two contradictory root-level READMEs. Add the same disclaimer or refresh the content.

**S219 (Low) — Open.** `audit_logger.py` file sink: every `log()` call does `open(path,"a")`/`write`/`close` (:107-113) — a full file-open syscall per audit event on a path that fires for every balance change, order event and fill (hundreds/sec on a busy sim); `logs/audit.log` has no rotation or size cap → unbounded growth on multi-day runs (and on the container overlay layer under docker). Use a `RotatingFileHandler` or a held-open buffered writer with a size cap.

**Verified clean this round:** engine internals — liquidation math is correct (canonical `entry*(1∓1/lev±mmr)` formulas, full-before-partial precedence, insurance-fund deficit coverage); account-level leverage is a *consistent* domain model (validator `config_validator.py:212-217`, hot-reload `ws_message_handler.py:552-556`, margin `_check_margin_and_size`, liquidation) — `Position` not storing its own leverage is design, not a bug; `close_position` WS command uses `force_close=True` (:456) so the margin-check bypass is intentional; margin lock/release accounting and opposite-order flip residuals are balanced; funding sign convention correct; OCO sibling-cancel works; market-sim GBM + shared-factor correlation + wick/OHLC synthesis honest; `SECURITY.md` claims verified (rate limiting real at `ws_message_handler.py:48-61`); `docker-smoke-test.sh` hits real published ports/paths (ai-bot `9090/health` exists via `metrics.py:410`); `REFACTORING_PLAN_10DAYS.md`/`PROJECT_AUDIT.md` carry honest HISTORICAL disclaimers; `web-ui/public/` is just `favicon.svg` (SW/PWA generated by vite-plugin-pwa — verified R73); hook scripts are thin honest delegates to `pre-commit-check.py`; parquet export and depth snapshot are real.

## Round 112 — 2026-09-15 — exchange_simulator leaf-sweep + ai-bot root files + no-docker launchers: 4 open findings (S220–S223)

Scope: `exchange_simulator/` modules never leaf-read (`options_simulator.py`, `data_export.py`, `config_validator.py`, `visualizer.py`/`_charts`/`_account`, `ws_metrics.py`, `ws_prometheus.py`, `websocket_server.py`, `__main__.py`), ai-signal-bot root files (`monitor.py`, `run_backtest.py`), and the `no-docker.{bat,sh}` launchers. Recorded only; no source changes.

**S220 (Medium) — Open.** The advertised no-docker launch path can't start the exchange simulator on any OS — and on Windows it's broken twice. `no-docker.bat:88` and `no-docker.sh:77-78` do `cd` into `exchange_simulator/` then `python -m exchange_simulator` — a package cannot be `-m`-imported from inside itself → ModuleNotFoundError; the sim's terminal window dies instantly while the other three services come up looking fine. This is the same broken-from-inside defect already recorded at `deploy.sh:148` (S215) and `CONTRIBUTING.md:255-256` (S217) — but these two are the *primary* documented quick-start scripts. Second layer: `__main__.py:162-163` installs `loop.add_signal_handler(SIGTERM/SIGINT)` with no guard — on Windows' ProactorEventLoop this raises `NotImplementedError` (verified on the dev host's Python 3.12), so even a correct `python -m exchange_simulator` from the repo root crashes the WS server at startup on Windows. Docker masks both defects; the native dev flow the repo advertises doesn't work anywhere.

**S221 (Low) — Open.** `exchange_orders_{submitted,filled,rejected}_total` aren't counters — they're windowed counts over `ex._order_history`, a `deque(maxlen=10000)` (`exchange.py:63`, exported at `ws_prometheus.py:128-133`). After 10k orders `submitted` pins at 10000 forever (`rate()` → 0 while orders still flow), and `filled`/`rejected` **decrease** whenever evicted entries contained matching statuses — non-monotonic `_total` series make `rate()`/`increase()` read evictions as counter resets → Grafana panels show garbage spikes and stalled order rates. The trio also emits with no `# HELP`/`# TYPE` lines (untyped exposition). Fix by tracking cumulative per-exchange counters or renaming to gauge semantics.

**S222 (Info) — Open.** Visualizer arrow keys are dead on Windows and the exchange name is hardcoded. `_handle_key` (`visualizer.py:136-137`) routes only `b'\x1b'` (POSIX ESC sequence start) to `_handle_arrow_key`, but Windows `msvcrt.getch()` reports arrow keys with a `b'\xe0'`/`b'\x00'` prefix — so the `<- -> Switch tabs` control the footer advertises (:263) does nothing on Windows. Separately, `exchanges.get("binance")` is hardcoded at `:71` (`.symbols` in `__init__`) and `:218` (`_render_symbol_tab`) — rename the first exchange in `config.yaml` and the thread dies on AttributeError, which the `_viz_loop` catch-list at `__main__.py:110` (RuntimeError/OSError/ValueError/TypeError) deliberately doesn't include → silent visualizer death.

**S223 (Info) — Open.** Dead public metrics accessor. `WebSocketMetrics.get_metrics()` and its delegator `ExchangeWebSocketServer.get_metrics()` (`websocket_server.py:266-268`) are called only by tests — the production Prometheus path reads `metrics.*` fields directly (`ws_prometheus.py`), so the dict-based accessor is unused API surface. The underlying counters and histograms are live; only the accessor is dead.

**Verified clean this round:** `options_simulator.py` — canonical Black-Scholes (price + all five Greeks) and Newton-Raphson IV with vega scaling, honest `NaN` on non-convergence; `data_export.py` — real CSV writes for candles/orders/accounts/positions + honest pyarrow→CSV fallback; `config_validator.py` — complete section/range/cross-reference validation (symbols↔prices↔volatility); `ws_metrics.py` — valid histogram exposition, all counters fed by production paths (`record_message` at `ws_broadcast.py:68`, `errors_total` at `ws_message_handler.py:101-114`, `price_updates_total` at `:224`, all three histograms observed); `ws_prometheus.py` — valid exposition format, `getrusage` guarded for Windows; `websocket_server.py` — `run_logger`/`trade_csv_logger` optional imports properly guarded (the S207 contrast), correct SHM seqlock publisher (odd=writing/even=committed), real `/health` `/live` `/ready` `/metrics` endpoints on ws_port+10; `monitor.py` — real signal feed (renders exactly `Signal.to_dict()` keys; both tailed files are the config defaults); `run_backtest.py` — genuinely wired (real `walk_forward` with train/test windows at `optimizer.py:193-219`, all called APIs exist — unlike the S214 theatrical `walk_forward_ci.py`); `visualizer_charts.py`/`visualizer_account.py` — canonical EMA/RSI/ATR/MACD/BB math rendering real data.

## Round 113 — 2026-09-15 — hft-trade-bot root/scripts leaf-sweep + orphan files: 4 open findings (S224–S227)

Scope: `hft-trade-bot/` never-leaf-read files (`monitor.py`, `scripts/{build,run,monitor}.py`, `package-lock.json`, `Dockerfile{,.prod}`, `.dockerignore`), `scripts/ci/` tree, package `__init__.py` markers, `web-ui/.env.example`, stale `.gitkeep` files, `fpga_orderbook.vhd` claim-check. Recorded only; no source changes.

**S224 (Medium) — Open.** hft-trade-bot logging/monitor plumbing is broken end-to-end: `config.log_file` is a dead config key — parsed from two yaml paths (`logging.file` `config_parser.h:164`, `system.log_file` `:186`) and set in `config.prod.yaml:31`, but `Logger::init(level, dir, json)` takes only a *directory* (`bot_setup.cpp:61` passes `"logs"`, never `ctx.config.log_file`) → the key does nothing and logs always land in hardcoded `hft_trade_bot_{YYYYMMDD_HHMMSS}.log` / `hft_trade_bot_latest.log`. Consequence: `hft-trade-bot/monitor.py:13` tails `logs/hft_trade_bot.log` — a file **never written** → the status monitor shows "NOT FOUND (bot not started yet)" forever while the bot runs; its log panel and counters are permanently dead. Separately, `scripts/monitor.py:23` reads SHM region `/hft_heartbeat` that no producer creates (the C++ side creates only `/hft_fills` and `/hft_market`; the `heartbeats_sent` names in `system_monitor.h` are metric counters, not a shm region) → the tool exits "SHM heartbeat not found" on every run. Both hft monitors were born blind.

**S225 (Low) — Open.** `scripts/run.py --paper` is a fake flag: it appends `--paper` as `argv[2]` (:43-44), but `init_config_and_logger` (`bot_setup.cpp:56-58`) reads only `argv[1]` as the config path and `main.cpp` has no flag parser — the flag is silently ignored. A user who runs `python scripts/run.py --paper` believing they've enabled paper-trading mode gets whatever the config says.

**S226 (Low) — Open.** `scripts/ci/` is an orphaned self-hosted CI tree: 8 files, ~545 lines, committed as "custom CI/CD scripts (self-hosted, no GitHub Actions)" (b3a538e) — but nothing invokes them (zero references from workflows, Makefiles, docs; the real CI is `.github/workflows/ci.yml`). Inside, `test.sh` is a can't-fail gate: missing `pytest`/missing `vitest` print a warning and skip **without incrementing FAIL** → exit 0 on a run that executed zero tests; and even when tools exist it runs only `ai-signal-bot/tests/` — all 31 `exchange_simulator` test files are never executed by the "Test Runner".

**S227 (Info) — Open.** Committed residue: `hft-trade-bot/package-lock.json` is an empty npm lockfile (`{"name":"hft-trade-bot","lockfileVersion":3,"packages":{}}`) with **no `package.json`** in the directory — an accidental `npm install` artifact checked in. Four stale `.gitkeep` files sit in non-empty directories (`hft-trade-bot/{scripts,tests}/`, `ai-signal-bot/{scripts,tests}/` — scripts/ holds 3 Python files, tests/ hold 30+ files).

**Verified clean this round:** `scripts/build.py` — honest CMake wrapper (vcpkg + websocketpp auto-detect, real targets, propagates exit codes); hft Dockerfiles — builder/runtime on the same bookworm release (ABI-safe, explicitly commented), pinned runtime lib versions, non-root user, real wget healthchecks, the websocketpp C++20 sed-patch is a documented honest workaround; `.dockerignore`×5 sensible; `web-ui/.env.example` accurate — `VITE_SIGNAL_TOKEN` is verified end-to-end (sent by `useExchangeData.js:457`, verified by `signal_publisher.py:137-143`; `EXCHANGE_TOKEN`→`_handle_auth`:503-512 also live); `fpga_orderbook.vhd` is referenced only in theory docs/skills — never claimed as a live component; `__init__.py`/`tests/__init__.py` are honest markers; `ai-signal-bot/monitor.py` (R112) and hft `monitor.py` process-check (`pgrep -f`/`tasklist`) work.

## Round 114 — 2026-09-15 — ai-signal-bot src/ under-covered subdirs + exchange_factory wiring: 2 open findings (S228–S229)

Scope: `ai-signal-bot/src/` subdirs with zero prior findings — `data_collection/` (real_account, exchange_factory, market_data_feed/manager/types), `llm_engine/` (engine, rule_based, llm_types), `observability/` (health_checks, logging, tracing), `signal_validation/validator.py`, `technical_analysis/` headers — plus the `run.py` live-order wiring. Recorded only; no source changes.

**S228 (Medium) — Open.** The advertised live/testnet order path is green-but-dead: `ccxt` is required but installed nowhere. `settings.testnet.yaml:32` ships `paper_trading: false` and `CONFIGURATION_GUIDE.md:417` documents the live path ("paper_trading: false + ccxt") — but `ccxt` is absent from `requirements.txt`, `requirements-dev.txt`, both Dockerfiles and CI. Selecting the mode sends every signal through `_execute_live_order` (`run.py:521`) → `ExchangeFactory(REAL)` → `RealAccountManager.initialize()` → `RuntimeError("ccxt not available")` (`real_account.py:118-119`) → caught at :617 → "Live order error" logged per signal, `_live_adapter` stays `None` so the doomed init retries every signal. Health stays green, signals keep broadcasting — zero orders ever reach the venue. Note `RealExchangeAdapter.initialize()` dies on the account leg even though the market-data feed is ccxt-independent (aiohttp/websockets) — one missing dep kills both legs. Either declare ccxt (requirements + Dockerfile) or fail fast at startup when `paper_trading: false` without it.

**S229 (Low) — Open.** `SimulatorAdapter._pending_orders` resolves order futures by FIFO position with no correlation: `_recv_loop` (`exchange_factory.py:131-134`) pops the head future on **any** `fill`/`error`/`order_cancelled` arriving on the shared socket — and the simulator broadcasts every order's fill to all *other* clients (`ws_message_handler.py:272`, `exclude=websocket`). A concurrent fill from a different bot resolves this adapter's pending future → `place_order` returns another client's order dict (wrong order_id/price/symbol silently). Latent today: the production paper path uses `ws_client.submit_order`, and the factory's SIMULATOR/FALLBACK adapters are exercised only by tests — but the first real consumer of the factory sim path gets the misattribution.

**S227 extended:** two more stale `.gitkeep` files found inside populated package dirs — `ai-signal-bot/src/data_collection/.gitkeep` and `ai-signal-bot/src/llm_engine/.gitkeep` (6 total now).

**Verified clean this round:** `real_account.py` — honest ccxt wrapper (guarded import, `clientOrderId` idempotency key against timeout-after-fill dupes, exponential retry, honest error paths); `exchange_factory.py` SimulatorAdapter — real WS snapshot cache + honest cancel semantics (S102/S148 fixes hold); `llm_engine/engine.py` — real OpenAI/Anthropic/Ollama payload shapes, rule-based fallback, `rule_based.py` does real JSON extraction + schema clamping (no AI-theatre); `observability/tracing.py` — guarded OTel with honest NoopTracer; `health_checks.py` — wired via `run.py:137`/`metrics_server:215`, absent redis/timescaledb report HEALTHY "not configured" rather than lying; `signal_validation/validator.py` — actually in the signal path (`run.py:498`), all five checks real with async lock; `market_data_feed.py` — genuine binance/okx/bybit streams, bounded queue with drop-oldest backpressure, reconnect backoff, `on_reconnect` gap-fill callback; `market_data_types.py`/`llm_types.py`/`rule_based.py` honest.

## Round 115 — 2026-09-15 — web-ui/src leaf-sweep (hooks/stores/utils/components/panels): 9 open findings (S230–S238)

Scope: `web-ui/src` — ~460 tracked files never leaf-swept (prior coverage was spot-checks R77/R79 and tests R106). Read all 21 hooks, 4 stores, 20 utils, the 86KB panel registry, App.jsx wiring, the full component import graph, and the UI→backend protocol round-trip against both Python servers. Recorded only; no source changes.

**S230 (High) — Open.** The entire backend-compute plane is severed at the store sync layer. `useTradingStoreSync.js:42-50` (`setSignalData`) pushes only `signals`/`regime`/`backtestResult`/`circuitBreaker`/`connected`/`latency`/`sendSignalMessage` and silently drops all seven result fields: `portfolioResult`, `volSurfaceResult`, `cvarResult`, `stressTestResult`, `positionSizeResult`, `hawkesResult`, `fundingArbResult` (plus `authState`). `useTradingStore` doesn't declare them and `usePanelContext.signalsObj` (:100-109) doesn't forward them, so every `ctx.signals.*Result` in the registry (:408/456/540/564/681/825/865) is permanently `undefined`. End-to-end effect: a panel sends `cvar_analysis`/`hawkes_fit`/`stress_test`/`vol_surface`/`position_size`/`optimize_portfolio`/`funding_arb_scan`, `signal_publisher.py:236-256` computes and replies, `useSignalData` stores the result (:426-443) — then the sync discards it and each of the 7 panels (FundingRateHistory, RiskDashboard, HawkesProcess, ConditionalValueAtRisk, PositionSizeOptimizer, VolSurface, PortfolioOptLab) renders its own "timeout — no *_result in 30s" error while the answer already arrived. The server-compute feature is dead while looking fully wired. The same sync also drops `openOrders`/`cancelOrder`/`cancelAllOrders`/`exchangeReconnects` (the store field is a permanent 0)/`connect`/`nextReconnectIn` — nothing in the registry reads them today, but the store declares fields it never sets.

**S231 (Medium) — Open.** `useWebSocket` advertises knobs that are dead or fake. `useWebSocket.ts:133` passes `['permessage-deflate']` as the WebSocket constructor's second argument — that slot takes **subprotocols**, not extensions; the browser negotiates compression itself and the server already runs `compression="deflate"` (`websocket_server.py:198`), so the flag is decorative (and risks a subprotocol-mismatch rejection). `reconnectCount.current += 1` runs in `onopen` (:145) while the `maxReconnects=20` cap is checked in `onclose` (:224) — a server that never accepts leaves the count at 0 → infinite retry, and the "Max reconnections reached — call connect() to retry" error is unreachable exactly when the server is down. The `error` state is returned but neither production caller (`useExchangeData.js:260,455`) destructures it → socket parse/close errors are invisible to the UI. `batchTypes`/`batchInterval`/`maxBufferSize`/`getBufferedMessages`/`clearBuffer`/`bufferSize`/`queueSize` have zero production consumers — a 5000-slot ring buffer is allocated and written on every message into the void, and the batch-merge path never runs.

**S232 (Medium) — Open.** Three facade panels that look functional and do nothing. `Auth.jsx:14-24` accepts **any** username+password, writes `trading-auth-user` to localStorage (zero readers repo-wide), and renders a green "Authenticated" — it gates nothing and contacts no service; the real auth is the build-time `VITE_*_TOKEN` handshake. Fake security is worse than no security. `FeatureFlags.jsx` offers 8 toggles (mock-mode, advanced-panels, detachable-panels, ml-ensemble, market-making, funding-arb, circuit-breaker, trailing-stop) persisted to `trading-feature-flags` — a key with zero readers; the `mock-mode` flag doesn't even touch the real `mock-mode` localStorage key that `useMockData.js:15` reads, and `advanced-panels` shadows the real `trading-sim-advanced-panels` key (`PanelContainer.jsx:12`). 8/8 toggles are theatre. `AlertWebhook.jsx` implements full webhook CRUD (5 event types, enable toggles, localStorage persistence) but **no dispatcher exists** — nothing watches fills/signals and POSTs; the `_fills`/`_toasts` props are accepted and ignored (:16), and the only `fetch` is the manual "Send test" button (:69). Users configure Discord/Telegram alerts that can never fire.

**S233 (Low) — Open.** `useNotifications` counts new events by length diff (`useNotifications.js:46-55,69-77`), but `fills` and `signals` are hard-capped at 50 via `.slice(0,50)` in `useExchangeData` (:174,:402). Once saturated, the length stays 50 → `newFills = 0` / `newSignalCount = 0` → fill toasts and strong-signal toasts permanently stop while events keep flowing. Needs a diff on the first element's id/timestamp, not array length.

**S234 (Low) — Open.** The registry's `addToast` adapter corrupts messages for 12 panels. `registry.js` wraps `addToast: (type, msg) => ctx.addToast({type, title: msg})` at :751 (auth), :757 (database-viewer), :759 (deploy-status), :767 (feature-flags), :769 (chart-templates), :775 (theme-switcher), :779 (model-dashboard), :783 (tax-report), :797 (api-playground), :805 (team-collab), :807 (strategy-version), :817 (widget-sdk) — but the store's object branch (`useToastStore.js:10-13`) renders `` `${title}: ${message}` `` with `message` undefined → every toast from these panels reads "Logged in as X: undefined", "flag enabled: undefined", etc.

**S235 (Low) — Open.** Detachable-panels dead cluster. `useDetachablePanels.js` declares 6 `PANEL_CONFIG` entries and `updatePopupContent` renders all 6, `useDetachedPanelSync` syncs 5 — but only `chart` and `orderbook` get a `<DetachablePanel>` wrapper (`App.jsx:220,252`) → the account/signals/arbitrage/performance branches are unreachable (the `handleDetach` dataMap :37-46 doesn't even include 'performance'). `BroadcastChannel('trading-sim-panel')` (:22) posts messages into a channel nobody listens on — the popup is written via same-origin DOM access (:95-235), making the channel vestigial. Line :41 uses a real blocking `alert('Popup blocked…')` in production UI — this also corrects the board's stale ЧИСТО claim that `alert(` matches only `onAlert`/`removeAlert`.

**S236 (Medium) — Open.** `submitOrder` has an offline-queue race. `useWebSocket.ts:280-290` queues messages on a closed socket (`outgoingQueueRef`, <100) and returns false — but `useExchangeData.js:282-288` ignores that and always arms a 5-second ack timer → resolves `null` and drops the pending entry → on reconnect the queue flushes (:161-172) and the order **executes anyway** → the fill arrives, `resolveAck` finds no pending → the UI reported "no answer" while the order is live. A user retry mints a *new* `client_order_id` (`ui_…random` :277) → the server-side dedup (`ws_message_handler.py:244-267`, keyed by cid) doesn't catch it → double order. `OrderForm.jsx:84` compounds it: the `ack === false` → "Not connected" branch is unreachable (submitOrder never returns false) and the `null` timeout case draws "Sent — awaiting ack".

**S237 (Info) — Open.** Mock hooks return an incomplete shape. `useMockExchangeData` (:139-145) omits `openOrders`/`lastError`/`auditLogs`/`optionsChain`/`cancelOrder`/`cancelAllOrders`/`requestOptionsChain`/`connect`/`nextReconnectIn`/`exchangeReconnects`; `useMockSignalData` (:189-192) omits all 7 `*Result` fields plus `authState`/`connect`/`nextReconnectIn`. Masked today (PendingOrders early-returns on `openOrders||{}`, VolSurface gates `requestOptionsChain`, `await true` works) — but mock mode structurally cannot exercise the cancel/options/backend-compute paths and is one unguarded consumer away from a crash.

**S238 (Info) — Open.** `WsInspector` — labeled "Raw WebSocket Inspector" — doesn't inspect WebSocket traffic. It fabricates one synthetic record per `candles.length`/`signals.length` change with invented `size`/`timestamp`/`preview` fields (`WsInspector.jsx:23-40`) — a retelling of "something arrived," not the frames. Meanwhile `useWebSocket` maintains a real 5000-message ring buffer (`getBufferedMessages`) that has zero consumers (S231).

**Verified clean this round:** zero zero-import files — all 289 components resolve through the registry/App; UI→backend protocols are 1:1 in both directions (all 11 `sendSignalMessage` types have signal_publisher handlers, all 16 `sendExchange` types have ws_message_handler handlers); the order submitter receives its own fill before the excluded broadcast (`ws_message_handler.py:271`); all 22 `NoDataFeed` panels are honest disclosures ("feed is not produced by backend"), not fakes; `utils/backtestEngine.js` is a real rule-engine (entry/exit rules, fees, slippage, equity curve, Sharpe/Sortino/Calmar/recovery factor); `performance.ts`/`performanceMonitor.js`/`performanceReport.js` are three distinct domains (trade metrics / Web Vitals + render timing / HTML export), not duplicates; every store is bounded (toasts 5, fills/signals 50, auditLogs 200, candles 500); mock infrastructure is honestly gated (`VITE_MOCK_MODE`/localStorage + visible banner); `console.*` appears only in TopErrorBoundary and the WS parse-log.

## Round 116 — 2026-09-15 — config sweep: every yaml/env key vs its code reader + dependency manifests vs imports: 4 open findings (S239–S242)

Scope: `ai-signal-bot/config/settings*.yaml`, `exchange_simulator/config.yaml`, `hft-trade-bot/config/{config,config.prod}.yaml` against `config_parser.h`/`config.h`/`bot_setup.cpp`, `monitoring/{prometheus,alertmanager,alerts}.yml`, `helm/files/` duplicates, grafana provisioning, `web-ui/.env*`/`netlify.toml`, `pyproject.toml`×2, `.pre-commit-config.yaml`, `dependabot.yml`, and every requirements/package.json entry vs actual imports. Recorded only; no source changes.

**S239 (Medium) — Open.** Two of three Prometheus scrape jobs are dead in every compose deployment — the metrics servers bind container loopback. Sim side: `__main__.py:157` passes `metrics_host=metrics_cfg.get("host")` — the yaml key `metrics.host: "localhost"` (`config.yaml:170`) is *set*, so `self._metrics_host or self.host` (`websocket_server.py:253`) never falls back to `EXCHANGE_WS_HOST=0.0.0.0` → the `:8775` health+metrics HTTP server listens on loopback while compose publishes `8775:8775` and prometheus scrapes `exchange-simulator:8775` → connection refused every 15s. The S156 done-log claims "one flag covers both binds" — stale: the flag fixes only `:8765`; the yaml-set `metrics.host` short-circuits it. Ai-bot side: `run.py:221` `metrics_host = AI_BOT_BIND_HOST or config.metrics_host` → `settings.yaml:162` ships `"localhost"`, and `AI_BOT_BIND_HOST` is set in zero compose files and absent from `.env.prod.example` → the MetricsExporter on `:9090` binds loopback → `ai-signal-bot:9090` scrape dead. Only `hft-trade-bot:9091` survives (`metrics.host: "0.0.0.0"` baked in both hft yamls). Healthchecks stay green because they curl loopback inside the netns — the monitoring plane is green-but-dead for 2 of 3 services.

**S240 (Medium) — Open.** `hft-trade-bot/config/config.prod.yaml` — the file production actually loads — ships dead and mis-wired keys. `risk.blacklisted_symbols` (:120) is advertised as "Symbols to never trade": `RiskManager::Params.blacklisted_symbols` exists and `check_order` enforces it (`risk_manager.h:43,104`), but no parser line reads the key, `Config` has no member, and the aggregate init at `bot_setup.cpp:88` passes `{}` — the only populate calls are in doctests. Same for `per_symbol_max_qty` (:46,{} at :89). `pressure_model.toxicity_threshold: 0.7` (:92, documented "Toxicity score above this = toxic") is mapped onto `v2_pressure_threshold` (`config.cpp:39-40`) — which is `SignalEngineV2::Params.pressure_threshold`, the normalizer in `raw_pressure/pressure_threshold` (`signal_engine_v2.h:307`): the knob actually desensitizes the pressure sub-signal 3.5×, while the real toxicity knobs (`toxic_size_threshold` → `PressureModel::Params:24`, `toxic_penalty`) have no prod-yaml keys at all. Bonus: prod yaml has no `ai_signal_bot` section → `ai_signal_enabled` defaults true → `ai_signal_ws_url` defaults `ws://localhost:8766` — the hft container dials its own loopback once per start and warns (bot_setup:356-359). And `CONFIGURATION_GUIDE.md:319-328` still documents a `smart_order_router.*` yaml block for the component deleted in the S058-era purge — the parser reads no such keys.

**S241 (Info) — Open.** Dead pinned dependencies. `exchange_simulator/requirements.txt` carries `numpy==2.1.3` with zero imports across src/ and tests/ — installed into both sim Docker images (`Dockerfile:7`, `Dockerfile.prod:7`) as a ~30MB wheel of nothing. `web-ui/package.json:50` devDeps `@testing-library/user-event@^14.5.2` — zero imports repo-wide (132 files import `@testing-library/react`; user-event, none).

**S242 (Info) — Open.** Config-surface nits. `web-ui/.env.example` documents every VITE_* var except `VITE_EXCHANGE_TOKEN` — a real reader (`useExchangeData.js:12`) that carries the control-plane auth frame; `.env.prod.example:36` documents it, the dev file doesn't — a dev who sets `EXCHANGE_CONTROL_TOKEN` on the sim gets `auth_failed` on the order form with no documented fix. `exchange_simulator/__main__.py:233` prints "3 Exchanges | 3 Symbols" in the startup banner — hardcoded; the shipped config has 49 symbols.

**Verified clean this round:** every `settings.yaml` key has both an accessor and a production caller — all six strategy flags gate real classes in `bot_helpers.build_strategies`, `alerting.py` is a real dispatcher (Discord/Telegram/webhook senders + cooldowns, wired at `run.py:193/373` — the S125-era death is fixed), `testnet` reaches `ExchangeFactory` (`run.py:583`), `paper_trading` is the real live-order gate (`run.py:515`); `exchange_simulator/config.yaml` is fully consumed by `__main__.py`; hft's unified parser runs both dev+prod key sets on every file and the dev yaml is fully covered; all four prometheus scrape targets resolve to compose service names; `alertmanager.yml` honestly documents its empty default receiver; `helm/files/{alerts,alertmanager}.yml` are byte-identical to `monitoring/` and consumed via `.Files.Get`; `web-ui/.env.mock` is wired via `dev:mock`/`--mode mock`; `netlify.toml` backs a real deploy job; `dependabot.yml` targets 8 real ecosystems; `.pre-commit-config.yaml` wraps the canonical hook script; both pyprojects set `asyncio_mode = "auto"`; `shared_config.yaml` remains an honestly-documented consistency reference (S136 holds); `prop-types`, `web-vitals`, `lightweight-charts`, `zustand`, `hypothesis`, `matplotlib` (BacktestPlotter via run.py:34), `tabulate` all have real importers.

## Round 117 — 2026-09-15 — `hft-trade-bot/src/` C++ leaf-sweep (all 46 files): 10 open findings (S243–S252)

Scope: the entire C++ source tree — `core/` (main, bot_loop, bot_setup, bot_context, config, config_parser, config_validate, logger), `strategies/` (V1 engine, V2 .h/.cpp/params/finalize, V3 HMM, pressure_model, obi_utils, inline_indicators), `execution/` (order_executor, order_type_selector, adaptive_order_selector_v2), `position/`, `risk/` (risk_manager, kill_switch), `ipc/` (shm_protocol, shm_ring_buffer, shm_signal_consumer, shm_fill_producer, shm_market_data), `communication/` (signal_receiver + handlers + data), `monitoring/` (health_server, system_monitor), `network/` (watchdog), `utils/` (low_latency), `data/` (types, signal, aligned_types). Prior coverage was fragmented spot-checks (R80) and the importer sweep (R51) — this is the first full read. Recorded only; no source changes.

**S243 (Critical) — Open.** Every order generated by the V1/V2 engine loops carries the same `client_order_id` — `hft_<symbol>_0` — so the simulator's dedup silently replays the first fill forever. `convert_fast_signal` (`bot_loop.cpp:171-188`) builds a `Signal` from the engine's `FastSignal` but never copies `fast_sig.timestamp` — the field stays `0`. The V1 loop (`bot_loop.cpp:299-307`) constructs `Signal` the same way. `submit_order` then stamps `client_order_id` as `"hft_%s_%lld"` with `signal.timestamp` (`order_executor.h:157`) → every engine order for `BTC/USDT` is `hft_BTC/USDT_0`. The simulator dedups on `exchange_id:client_order_id` (`ws_message_handler.py:244-267`, 10k-entry window — effectively permanent at this order rate): a repeated cid doesn't error — it **replays the original order's fill** marked `deduplicated: true`. The hft codebase has zero readers of the `deduplicated` flag, so `handle_fill` → `apply_fill` books the stale fill as a fresh execution — the position book reopens positions at the first order's price/qty for orders that never reached the exchange. Net effect: V1/V2 can execute at most **one order per symbol**; every later signal produces a phantom replay. The same drop kills dynamic leverage — `sig.leverage` stays `1`, so `compute_leverage` (`signal_engine_v2.h:519/523`) and the five `v2_*leverage*` config knobs never reach the wire.

**S244 (Critical) — Open.** The first broadcast frame kills the process: binary → throwing msgpack decode → `std::terminate`. `signal_receiver.h:98-100` subscribes with `{"encoding":"msgpack"}`; the message handler (:114-123) sends binary frames to `json::from_msgpack(bin)` — the **throwing** overload — with no try/catch anywhere in the chain. The simulator broadcasts every frame as `orjson.dumps(...)` bytes → WebSocket **binary** opcode containing UTF-8 JSON (the server-side half is S212: encoding negotiated but never honored). msgpack decode of JSON text throws `parse_error` → websocketpp invokes `m_message_handler` unguarded (`connection_impl.hpp:1097`) → the exception escapes `client.run()` inside `ws_thread_` (:131 — a lambda with no try) → `std::terminate` → process abort. The bot literally cannot survive one market-data tick against the current sim; under docker's restart policy this is a permanent crash-loop, not a reconnect.

**S245 (High) — Open.** A v3-only configuration silently runs the V1 fallback — and V3 has no config keys at all. `main.cpp:56-60` dispatches on `signal_engine_v2_enabled` alone: `v2 && can_trade` → v2 loop, else `can_trade` → `run_v1_fallback_loop`. `signal_engine_v3_enabled` is never tested in the dispatch, so `v3_enabled:true, v2_enabled:false` runs the V1 engine — a completely different strategy — while the setup banner advertises V3. The loop's own guard comment (`bot_loop.cpp:245-246`) acknowledges the v3-only case; main doesn't follow it. And `Config` contains zero `v3_*` members — `SignalEngineV3::Params` (hmm_update_threshold, trend_boost, range_confidence_cap…) are hardcoded defaults at `bot_setup.cpp:145`, unreachable from yaml. The HMM feature is flagged, undispatchable, and untunable.

**S246 (High) — Open.** `/health` is a static healthy lie, and 6 of 11 exported metrics are permanent zeros. `health_server.h` exposes `update_health(const HealthStatus&)` — it has **zero callers** in src. `health_` therefore stays at `HealthStatus` defaults (`system_monitor.h`: shm_healthy/exchange_connected/signal_engine_active all `true`, ages 0, errors 0) → `is_healthy()` returns true forever → `/health` serves 200 with a dead exchange socket, stale signals, or broken SHM. Compose healthchecks and k8s probes stay green on a nonfunctional bot. `SystemMonitor` exports 11 metrics but only 5 have increment sites (ORDERS_SENT/FILLED/REJECTED, SIGNALS_RECEIVED/PROCESSED); ORDERS_CANCELED, ERRORS, RECONNECTS, SHM_DROPS, HEARTBEATS_SENT, HEARTBEATS_MISSED export `0` forever — a reconnect storm or error flood is invisible. `MemoryTracker` is a dead class with zero consumers. The endpoints are real; the data is a facade.

**S247 (Medium) — Open.** PressureModel's trade-flow and toxicity legs are dead in production, and the SHM data path degrades OBI to zero. Both production call sites use the no-trades overload `analyze(ob)` (`bot_loop.cpp:164`, `:202`) — no code ever constructs `PressureModel::TradeTick` → `compute_trade_imbalance` sees an empty window → `trade_imbalance = 0`; `compute_toxicity` gets `nullptr, 0` → `toxic_score = 0.0` always → `toxic_penalty` multiplies nothing, and the selector's `toxic_score >= 0.5` → IOC branch (`adaptive_order_selector_v2.h:70`) is unreachable. `signal_engine_v2.h:123-124` even hardcodes `pr.toxic_score = 0.0`. On top of that, the SHM market-data path injects degenerate books: `inject_snapshot` builds one bid + one ask at equal `volume*0.1` (`signal_receiver_data.h:84-88`) → every OBI leg ≈ 0 → under SHM data the pressure score reduces to body-direction only. 6 of 11 `PressureResult` fields are computed then dropped. `ARCHITECTURE.md:278` advertises "trade flow imbalance, toxicity detection" — decoration.

**S248 (Medium) — Open.** SL/TP closes book realized PnL at the trigger price; the actual close fill is dropped as a stray. `process_sl_tp` (`bot_loop.cpp:55-63`): on trigger, it sends `executor->close_position(symbol)` then immediately calls `pos_mgr.close_position(symbol, trigger.price)` — booking `realized_pnl` and `balance.fetch_add` at the **trigger** price (:58). The real close fill arrives moments later → `apply_fill` finds no position → falls into the stray-fill branch (`position_manager.h:149-151`) → dropped. The executed price and the close fee are never reconciled: realized PnL and balance drift by (slippage + close fee) on every SL/TP exit.

**S249 (Medium) — Open.** `reset_daily()` zeroes live exposure at UTC midnight; `update_pnl` is a dead API. `update_risk_state` (`bot_loop.cpp:338-341`) calls `risk_mgr->reset_daily()` on UTC day rollover → `risk_manager.h:224` stores `0` into `total_exposure_` — but exposure is *current holdings*, not a daily counter → positions carried past midnight stop counting toward `max_total_exposure` until new fills re-add notional; the headline risk limit silently weakens every night. Bonus: `update_pnl` (:202-208) — a CAS-add API — has zero production callers (`update_pnl_v2` owns `daily_pnl_` via :347) — test-only code in the production class (same class of dead API as S223).

**S250 (Low) — Open.** Dead "HFT infrastructure" and an unreachable GTD branch. `low_latency.h` carries ~150 lines that exist only for doctests: `ObjectPool` (:145-187), `CircuitBreaker` (:378-432), `RetryPolicy` (:437-467) — instantiated exclusively by `test_doctest_cpp_optimizations.cpp`/`test_v2_infra.cpp` (the S152 pattern). `bot_loop.cpp:205` calls `adaptive_selector->select(..., qty, 0.0, now_ns)` — `top5_depth` hardcoded `0.0` → the GTD branch (`adaptive_order_selector_v2.h:95`, requires `top5_depth > 0`) is unreachable; the `expire_ms` serialization path is written but never exercised. `ShmMarketData::write_snapshot`/`write_price` have zero callers — the C++ side is consumer-only.

**S251 (Info) — Open.** `config_validate.h` is a can't-fail gate, and the kill-switch knob sits next to a units trap. Every check in the validator is warn-only — zero paths reject a bad config. `max_drawdown_pct` — a **fraction** (0.10) that trips the kill switch at `bot_loop.cpp:355` — is never validated, while its yaml neighbor `max_daily_drawdown_pct: 5.0` is a **percent**. A 5.0-instead-of-0.10 slip in the fraction = a kill switch that trips at −500% (never); a 0.5 "percent" slip = instant trip on the first tick.

**S252 (Info) — Open.** Per-symbol stores conflate three exchanges into one series. `order_books_`, `prices_`, `candle_history_` (`signal_receiver_data.h:190-192`) are keyed by symbol only — three exchanges' books/candles for the same symbol overwrite/interleave → last-writer-wins order books and non-monotonic candle series → OBI and candle indicators compute on cross-exchange chimeras. `ob.exchange` is parsed (`signal_receiver_handlers.h:130`) and discarded.

**Verified clean this round:** SHM struct layouts are byte-identical with Python `struct.Struct` (SignalMsg 32B / FillMsg 28B / MarketSnapshotMsg 28B / KillSwitchMsg 16B); `shm_ring_buffer` is an honest SPSC (R80) and `shm_market_data` a correct seqlock (odd=writing, even=committed); `KillSwitch` is a real mechanism (file-trigger poll, SHM notify, cancel/close callbacks wired at `bot_setup.cpp:181-202`, activated by daily-loss + max-drawdown checks); V1 engine is real math (Cooley-Tukey FFT, EMA/RSI/ATR); V2 is honest composite scoring; V3 is a real online-HMM (forward-backward/Viterbi); `pressure_model` math is real (the wiring is dead, not the math — S247); `order_executor.h` is real (manual JSON, auth-first, reconnect/backoff, arb unwind); `watchdog.h` uses `steady_clock` correctly; `health_server.h` is honest raw-socket HTTP with bounded I/O — the server is real, the status is facade; `Config::load` is a unified loader where every member has a parser line (minus the S240/S245 gaps); `ai_signal_queue` is correctly mutex-serialized into an SPSC; the reconnect machinery is honest (cancelable sleeper, join-before-reassign, watchdog terminate→close→reconnect, 1s→30s backoff); `update_risk_state`/`graceful_shutdown`/`poll_shm_market_data` are real logic.

## Round 118 — 2026-09-14 — docs-vs-reality sweep: 6 open findings (S253–S258)

Scope: every claim-bearing doc — `README.md`, `docs/{ARCHITECTURE,DEPLOYMENT,WEBSOCKET_PROTOCOL,TESTING,PERFORMANCE,MONITORING_GUIDE,WEB_UI,RISK_MANAGEMENT,ADVANCED_ORDER_TYPES,TRADING_STRATEGIES}.md`, `docs/guides/{QUICK_START,CONFIGURATION,TRADING,DEVELOPMENT}.md`, `CONTRIBUTING.md`, `terraform/README.md`, `README_PROJECT_OVERVIEW.md`, `audit/`, `PROJECT_AUDIT.md`, `CHANGELOG.md`, `docs/theory/` (~20.7k lines). Method: extract checkable claims (env names, commands, ports, yaml keys, counts, component lists) and resolve each against code/compose/parsers. Recorded only; no source changes.

**S253 (High) — Open.** `DEPLOYMENT.md:125-141` ships a `.env` template of 8 fictional variables — `EXCHANGE_SIMULATOR_HOST`, `EXCHANGE_SIMULATOR_PORT`, `AI_SIGNAL_BOT_HOST`, `AI_SIGNAL_BOT_PORT`, `WEB_UI_PORT`, `DATABASE_PATH`, `PROMETHEUS_PORT`, `GRAFANA_PORT` — with zero readers anywhere (compose, Dockerfiles, code). The real env surface (`EXCHANGE_WS_HOST`, `EXCHANGE_CONTROL_TOKEN`, `GRAFANA_USER`/`_PASSWORD`, `LOG_FORMAT`, `HFT_EXCHANGE_WS_URL`) appears nowhere in the template. A user who follows the guide configures nothing.

**S254 (High) — Open.** The documented native-deployment commands fail for all three components. `DEPLOYMENT.md:196`: `cd exchange_simulator && python -m exchange_simulator` — a package can't be `-m`-ed from inside itself (the S220 class). `:214`: `python -m ai_signal_bot` — the directory is `ai-signal-bot` with hyphens, unimportable as a module name; the real entry is `python run.py` (which does accept `--config`, `run.py:715`). `:230`: `./hft_trade_bot --config ../config/config.prod.yaml` — the binary reads `argv[1]` positionally (`bot_setup.cpp:56-58`), so the literal string `--config` becomes the config path and YAML load fails at startup; `DEVELOPMENT_GUIDE.md:320`'s `./hft_trade_bot --profile` dies the same way. `QUICK_START.md:175` invokes `docker.bat` — no such file; `:54-55` clones `HFT-trading-simulator` — README:62 gives the real repo `HFT-TradeBot--Lite-version`.

**S255 (Medium) — Open.** `DEPLOYMENT.md` names that exist nowhere: `BINANCE_API_KEY`/`_SECRET` (:589-590) — the factory reads `EXCHANGE_API_KEY`/`_SECRET` (the rename is recorded in the repo's own CHANGELOG, S141 — the doc contradicts its own history); `audit.retention_days` (:607) and `websocket.buffer_size` (:721) — no readers; four fixed log paths (`logs/{exchange_simulator,ai_signal_bot,hft_trade_bot,audit}.log`, :702-708) — every writer uses timestamped names, so all four files never exist; `localhost:9090/-/healthy` for Prometheus (:326) — dev compose publishes `9099:9090`, and `:9090` is the ai-bot's own metrics port (404 on `/-/healthy`).

**S256 (Medium) — Open.** ai-bot `logging.file` is a dead config key code-side (S224's twin). `config/__init__.py:340` parses `logging.file` → `run.py:722` passes it to `setup_logging(level, log_file)` → `run.py:56-59` silently drops the parameter and delegates to `setup_run_logging`, which always writes timestamped `logs/ai_signal_bot_*.log`. A user editing `settings.yaml`'s logging path configures nothing.

**S257 (Medium) — Open.** Stale feature claims across maintained docs. `PERFORMANCE.md:15,43-50` — a "Rust HFT Executor" latency-budget row and a full benchmark table for a component deleted in the S058-era purge. `ARCHITECTURE.md:216` — "Ensemble Voter (3 strategies)" (5 enabled by default); `:640` — "the simulator does not yet deduplicate on `client_order_id` (S149)" — directly contradicted by R117: the dedup + `deduplicated:true` fill replay is verified code (`ws_message_handler.py:244-267`) and is exactly the mechanism that makes S243 catastrophic. `WEBSOCKET_PROTOCOL.md:1078-1085` — documents per-client `msgpack` negotiation as honored (~40-60% bandwidth saving); actually `_client_encodings` is honored only in `_send_json` point-sends (snapshot/sync) — the hot broadcasts (`candles`, `fills_batch`, `audit_logs`, arb) serialize orjson unconditionally (`ws_broadcast.py:245/311/338/471`), so requesting msgpack gains nothing and kills the C++ client (S244). `MONITORING_GUIDE.md:373-389` — helm snippet shows `/health` on port 9090; the real templates probe `/live`+`/ready` on `ports.health` (8080).

**S258 (Info) — Open.** Numeric drift everywhere counts are stated confidently. `TESTING.md:84` "316 test files" / `:23` "311" — actual 304 (126 py not 129; 153 js not 157; 25 cpp ✓). `README.md:195` "157 test files" for web-ui (153). "278 registered panels" ×6 places (ARCHITECTURE :35/:93/:123/:376/:431/:479/:602, README, WEB_UI) — the registry has 278 `id:` entries but 7 are category-header rows → 271 component-mapped panels. "291 component files" (295 `.jsx` in `web-ui/src/components`). "50 symbols" in QUICK_START:13/:210, PERFORMANCE:57, README_PROJECT_OVERVIEW — config.yaml:36-84 defines 49.

**Re-check:** S218 (`README_PROJECT_OVERVIEW.md` fossil) confirmed and deepened — the header still claims "Status: COMPLETE — 571 tasks, 188 bugs, production-ready" while the live ledger holds 60+ open findings incl. 2 Critical; unlike its sibling fossils it carries no post-cleanup disclaimer.

**Verified clean this round:** MONITORING_GUIDE — all 5 dashboards exist and all 22 alert rules match name-for-name; `ALERT_*`/`OTEL_*` env names are real. TRADING_STRATEGIES params match code (EMA 9/21, ADX 25, SL/TP 2×/3× ATR, min_votes 2). ADVANCED_ORDER_TYPES — trailing/iceberg/OCO genuinely implemented (`exchange_advanced_orders.py`). RISK_MANAGEMENT — the 8 pre-trade checks exist in code. CONFIGURATION_GUIDE — all ~60 documented keys have readers (incl. `gtd_seconds`, `toxic_size_threshold`, `decay_rate`, `fade_threshold`, `emergency_confidence`, `prediction_horizon`, `zscore_*`, `vwap_enabled`). `audit/AUDIT_REPORT.md`, `docs/theory/*`, `PROJECT_AUDIT.md`, `REFACTORING_PLAN_10DAYS.md` all carry honest point-in-time/post-cleanup disclaimers; CHANGELOG is current. DEPLOYMENT endpoint URLs are valid (8775 health/live/ready/metrics, 8080, 9090, 9091, 3000, 9099, 9093); `data/trading.db` is real (`db.py:13`); `ipc.*.capacity`, `market.order_book_depth`, `audit.*`, `latency_optimization.*` all parse. The helm hft-sidecar design (9091 inside the ai-bot pod, shared `/dev/shm`) is legitimate. QUICK_START's `python run.py` for ai-bot, `.env.mock` flow, and `Makefile.prod prod-up` are correct; dev compose publishes every advertised port.

---

## Round 119 — repo-wide dead-code sweep (4 findings: S259–S262)

Final rotation item: whole-repo dead-code sweep — importer graph over all 104 non-test Python modules, file + named-export reachability over web-ui (295 source files, 165 named exports), CMake coverage of all 25 hft test files, root scripts, `__init__.py` re-exports, class-instantiation scan, `scripts/` (25 files), git-hook wiring, e2e/playwright wiring, docker HEALTHCHECK refs, committed assets.

**S259 (Medium) — Open.** `ai-signal-bot/src/backtesting/walk_forward.py` is a 201-line dead twin: `WalkForwardAnalyzer`/`WalkForwardWindow`/`WalkForwardResult` are imported only by `tests/unit/{test_backtest,test_walk_forward}.py` — the production walk-forward path in `backtest_requests.py` calls `StrategyOptimizer.walk_forward` (`optimizer.py`), a parallel self-contained implementation. Two walk-forward engines exist; the one docs/tests exercise is invisible to prod. Plus `backtesting/__init__.py:2,16` re-exports `BacktestResult as BacktestEngineResult` in `__all__` — zero references repo-wide.

**S260 (Low) — Open.** Dead public API in `ai-signal-bot` technical_analysis/observability. Zero-ref even by tests: `simulate_hawkes` (`hawkes_funcs.py:85`), `validate_prices` (`indicators.py:18`), `class HawkesResult` (`hawkes_model.py:31` — the Hawkes params/functions are live via `analysis_requests`; only the result class is orphaned). Test-only: `macd` (`indicators.py:114` — 3 test callers, 0 prod), `bind_context`/`clear_context` (`observability/logging.py:158,167` — log-context API exists purely for tests). Six units of public surface with no production consumers.

**S261 (Medium) — Open.** web-ui dead surface. `Toast.jsx:6` exports `useToasts` — a hook duplicate of `useToastStore` used only by `toast.test.jsx`; `App.jsx:100` consumes the Zustand store. `performanceMonitor.js`: `onAlert`/`offAlert`/`getMetricsHistory` have zero references; `getPerformanceSummary`/`recordCustomMetric`/`resetMetrics`/`resetPanelMetrics` are test-only — 7 of ~14 exports dead. Prod uses only `init`/`get*`/`recordPanelRender`/`checkBudgets`, and `checkBudgets` fires `triggerAlert` into an empty callback list — budget violations silently drop. Plus test-only `bgColorForSide` (`format.ts`).

**S262 (Low) — Open.** Dead git-hook variants + phantom installer. `scripts/pre-commit-hook.{sh,bat}` and `scripts/commit-msg-hook.{sh,bat}` (~118 lines) claim "Installed by: install-hooks.{sh,bat}" — but `install-hooks.sh` doesn't exist (`.pre-commit-config.yaml:8` references it anyway) and `install-hooks.bat` installs the `-git` twins (`pre-commit-hook-git.sh`, `commit-msg-hook-git.sh`) instead. The `.bat` variants are doubly dead — git can't spawn `.bat` hooks (the S071 bug class). Plus orphan dev scripts `scripts/ci-equivalence.py` and `scripts/health-check.py` — zero doc/Makefile/CI/docker references.

**Retracted this round:** `web-ui/src/main.jsx` (loaded via `index.html` script tag — entry point); math helpers `kmeansPlusPlus`/`kmeansIterate`/`euclidean`/`sqDistance`/`normInv`/`tCDF`/`bivariateNormalCDF`/`baumWelchStep`, `generateAccounts`, `get_tracer`, `__main__` functions (internal self-use); `market_making`/`statistical_arbitrage` (package imports + `build_strategies`); factory types (internal to `exchange_factory.py`); `HawkesParams` + Hawkes functions (live via `analysis_requests`); root scripts `error_monitor`/`price_monitor`/`trade_csv_logger`/`run_all_tests`/`build-all.bat` (documented in WEB_UI:493-496/README or Makefile-invoked); both `conftest.py` (real pytest roots); all 25 hft test files (CMake targets); e2e specs (playwright `testDir` + shared helper); `logs/trades_*.csv` (gitignored runtime residue, not committed).

**Verified clean:** every non-test Python module has a prod importer; all web-ui files reachable; e2e wired through playwright config; `ai-signal-bot/scripts/` is an empty gitkeep dir (S227 class, already recorded).

Commit: 9fe7ebb

---

## Round 120 — monitoring/ + .github/ + web-ui/e2e/ leaf-sweep (3 findings: S263–S265)

Last uncovered surface: monitoring stack configs, all 5 GitHub workflows + dependabot + templates, e2e suite wiring.

**S263 (High) — Open.** The documented prod-deploy path fails on a clean server. `docker-compose.prod.yml` has five `${VAR:?required}` interpolations (`GRAFANA_PASSWORD`, `EXCHANGE_CONTROL_TOKEN`, `VITE_WS_EXCHANGE`, `VITE_WS_SIGNALS`, `VITE_EXCHANGE_TOKEN`) resolved from the compose process env / `.env` only. The file every doc tells the operator to create — `.env.prod` (DEPLOYMENT.md:378, compose header :2) — is loaded via service-level `env_file:` (:136/:176), which feeds **container** env vars, never `${}` interpolation. The header's own usage line shows `--env-file .env.prod`, but `deploy.yml:132-133` (the SSH `up -d`), `Makefile.prod` (`prod-up`), and the DEPLOYMENT flow all omit the flag — so `docker compose -f docker-compose.prod.yml up -d` exits on `:?required` with error text that names the very file compose isn't reading.

**S264 (Low) — Open.** `deploy.yml` notification gates check the wrong context: `if: vars.DISCORD_WEBHOOK_URL != ''` (:173) gates a step whose value is `secrets.DISCORD_WEBHOOK_URL` (:176); same for Telegram — `vars.TELEGRAM_BOT_TOKEN` gate (:181) vs `secrets.TELEGRAM_BOT_TOKEN` value (:185). An operator who sets only the secrets (the natural place for a webhook URL/bot token) gets silently skipped notifications forever; the pattern also nudges a bot token into `vars`, which is unmasked in repo settings.

**S265 (Low) — Open.** ci.yml dead gate + unpinned clone. `audit-deps`: `npm audit --audit-level=high` (:323) already exits non-zero on high/critical — the second check (:325-334) greps `|| true` output for "critical|high" and can never fire. `test-cpp-msvc` (:207) clones `zaphoyd/websocketpp` with no ref/tag — an unpinned HEAD dependency in the build path while vcpkg beside it is commit-pinned (:200).

**Retracted:** `web-ui/Dockerfile` exists (build-docker matrix valid); ai-bot `:9090/health` smoke check is real (`metrics.py:410` serves it; dev compose runs `run.py --metrics`); `web-ui/.env` is gitignored, not committed; nightly-backtest's inline `python -c` runs the real `Backtester` + real strategies (the S214 theater is the separate `walk_forward_ci.py`); `vcpkg/` is an untracked local tree.

**Verified clean:** all 22 alert rules reference emitted metrics (8 `ai_signal_bot_*` in metrics_server.py, 9 `exchange_*` in ws_prometheus.py); `test_alerts.py` validates real group names; alertmanager honestly documents its no-op default receiver; grafana provider paths match compose mounts; prometheus targets match service names; codeql covers only the cpp leg (py/js in ci.yml — honest comment); release.yml changelog generation real; dependabot dirs all exist; issue/PR templates have no stale refs; e2e specs use real selectors/keybindings (Shift+\ ↔ App.jsx); `dev:mock` → `.env.mock` → `VITE_MOCK_MODE` wired end-to-end; staging 18xxx port offsets consistent.

Commit: fd2b029

---

## Round 121 — test-suite deep audit (3 findings: S266–S268)

Deep pass on the 279-file test suite (126 py + 153 js): duplicate filenames, mock theater, vacuous tests, tests exercising R119-proven-dead code, conftest/fixture drift, and mock-vs-wire shape contracts.

**S266 (Medium) — Open.** The mock-data layer validates a contract the real wire doesn't share. `mockData.js:199` generates `accounts[].positions` as a symbol-keyed **map** and `maybeUpdatePosition` (:212-242) mutates it map-style — but the real feed serializes `positions` as a **list** (`models.py:438`, the S041 fix). Consequences in mock mode: `CostBasis.jsx:21` `for (const pos of acc.positions || [])` on `{}` → TypeError (not iterable) → error-boundary card; `AccountPanel:120` and `BotStatus:20` read `.length` → permanently 0 positions; the mock even invents `acct.unrealized_pnl` (:241-242), a field absent from the real `to_dict`. Mock mode is green only because the e2e specs never touch a positions panel.

**S267 (Low) — Open.** The suite keeps dead code looking tested. `tests/unit/test_walk_forward.py` (349 lines) tests `WalkForwardAnalyzer` — dead since S259 — and even patches the `BacktestEngine` inside it (×5 `patch("src.backtesting.walk_forward.BacktestEngine")`): it verifies bookkeeping for a pipeline prod never calls. `test_backtest.py:9` imports the same dead analyzer. `test_observability.py:155-159` are literal "no_crash" tests for the dead `bind_context`/`clear_context` (S260). `toast.test.jsx` covers the dead `useToasts` (S261); the perf test trio exercises performanceMonitor's test-only exports. ~6 test files assert exclusively on zero-prod-consumer surface.

**S268 (Info) — Open.** Parallel test trees: `ai-signal-bot/tests/` and `tests/unit/` hold 6 same-name pairs — `test_indicators`, `test_backtest`, `test_kelly`, `test_strategies`, `test_risk_manager`, `test_signal_publisher` — with divergent coverage (e.g. risk_manager: 24 unique tests in root vs 19 in unit, 2 shared names). Both trees collect under `pytest tests/`; which layer is canonical is undocumented.

**Verified clean:** all skips are honest dep/env gates with reasons (34× prometheus_client, 14× /dev/shm, 5× live-sim); `try:` blocks are ImportError gates only; conftests are real path shims + real fixtures; `vi.mock` is restrained (23/153 files, all boundary mocks with autospec); `test_shm_*` files test live prod code (`run.py:275-303`); `test_signal_publisher.py` exercises the real backtest endpoint end-to-end; no `status_code in (200,400,500)` tolerance anywhere.

Commit: b1ed546

---

## Round 122 — build & tooling config sweep (3 findings: S269–S271)

Full pass on the build layer: all 12 npm scripts, vite/vitest/eslint/tsconfig, postcss/tailwind, both `pyproject.toml` files, requirements↔imports, CMakeLists non-test paths, playwright wiring, `.clang-format`/`.editorconfig`, `shared_config.yaml` consumers.

**S269 (Medium) — Open.** 15 `.ts` source files sit outside every static check. `eslint.config.js:9` declares `files: ['**/*.{js,jsx}']` — `.ts`/`.tsx` never match, so `npm run lint` (`eslint src/`) silently skips them. `tsconfig.json` exists (`strict: true`, `include: ["src"]`) but `tsc` is invoked nowhere: no `typecheck` script in package.json, no step in ci.yml (the JS lint job runs only `npm run lint`), nothing in pre-commit. The blind files include `useWebSocket.ts` (the S231 subject — reconnect loop), `useTradeJournal.ts`, `format.ts`, `useSessionRecorder.ts`, `useStrategyMarketplace.ts`, `useSoundAlerts.ts`, `useWebSocket.ts` + 8 more hooks, `format.ts`/`patterns.ts`/`performance.ts`/`timeframes.ts`. The riskiest surface (WS client, session recorder, marketplace) is the least checked — a type error or `any`-leak there can never trip a gate.

**S270 (Low) — Open.** The coverage gate measures only the already-tested directories. `vitest.config.js:30` scopes `coverage.include` to `['src/utils/**','src/hooks/**']` with 40% thresholds — the denominator excludes ~290 files under `components/`/`stores/`/`contexts/`. The gate can never regress on the untested mass, while TESTING.md:287 advertises a "coverage gate" that sounds whole-repo.

**S271 (Info) — Open.** The S258 numeric drift reached the build configs. `package.json` description claims "278 panels, 52 quant models" and `vite.config.js:15` bakes "278 panels" into the PWA manifest — the registry has 271 component-mapped panels. TESTING.md's CI table also drifted: "Python 3.11, 3.12" → ci.yml runs 3.12 only (×4 jobs); "Node 20, 22" → 22 only (×4); "cmake → build → test_runner" → actually `ctest` over per-file `test_*` binaries, no `test_runner` exists. This retracts the R110 ЧИСТО claim "vite.config манифест корректен (278)".

**Retracted:** `test:ui` resolves (`@vitest/ui` present in package-lock transitively); `vite-plugin-pwa` is genuinely configured (`vite.config.js:9-42` — registerType/workbox/manifest, not a dead dep); the google-fonts runtimeCaching rule matches a real `fonts.googleapis` link (`index.html:19`); tailwind is live (`@tailwind` directives in index.css:1-3, utility classes throughout components); `web-ui/.env` is gitignored, not committed.

**Verified clean:** all 12 npm scripts resolve to real tools/configs; all 8 prod deps + 22 dev deps have consumers (happy-dom=env, esbuild=minifier+override, autoprefixer/postcss via postcss.config.js); both pyproject files are honest ruff+pytest configs with documented per-file-ignores; requirements.txt entries all have importers (tabulate→tracker.py, matplotlib→plotter.py); CMake options real (PCH default-on, MIMALLOC/JEMALLOC with honest WARNING fallback, vcpkg autodetect, all 25 test targets↔sources); `shared_config.yaml` genuinely consumed by `test_config_consistency.py`, pre-commit, and deploy scripts; `.clang-format`/`.editorconfig` present for the CI format step; `.windsurf/workflows/` holds 8 workflow files incl. slop-fix.md.

Commit: 13c4862

---

## Round 123 — monitoring data-path + helm/terraform re-sweep (2 findings: S272–S273)

The dashboard layer was never data-traced: 5 grafana JSONs (56 expressions, 40 unique metric names) checked against emitters **and** against which setters actually run. Helm templates re-verified (primary sweep was R107/S203–S206); `helm/files/` vendored copies diffed against `monitoring/`; terraform env roots + modules + tfvars examples leaf-read.

**S272 (Medium) — Open.** 17 of ~25 `MetricsExporter` update methods (`ai-signal-bot/src/monitoring/metrics.py`) are never called in prod — the gauges/counters/histograms they back render as eternal zeros across three dashboards. Dead setters: `record_signal` (:235), `record_fill` (:241), `record_order_sent`/`record_order_rejected` (:246/:253), `update_pnl` (:264), `update_positions` (:272), `update_ws_status` (:278), `update_shm_buffer` (:283), `observe_signal_latency`/`observe_order_latency`/`observe_shm_round_trip`/`observe_position_hold_time` (:288–303), `record_error` (:340), `set_bot_drawdown`/`set_bot_win_rate`/`set_bot_pnl_total`/`set_bot_uptime` (:345–360). Blast radius: `trading-performance.json` is a zero-board — `trading_fills_total`, `trading_signals_total`, `trading_total_equity`, `ai_signal_bot_drawdown`, `ai_signal_bot_win_rate` all flat (only `sharpe_ratio` lives, via run.py:641); `ai_signal_bot_metrics.json` shows `errors_total`/`uptime_seconds` permanently 0; `latency-monitoring.json`'s `trading_signal_latency_seconds` histogram is empty. Subtlety: the publisher increments `ai_signal_bot_signals_sent_total` (live) while the dashboard queries `trading_signals_total` (dead `record_signal`) — two signal counters, one flat. The hft half of `trading-overview.json` is the S246 blast radius.

**S273 (Low) — Open.** Both `terraform/environments/{dev,prod}/terraform.tfvars.example` set `db_password` — but the env roots declare **zero** `variable` blocks and no database resource exists (modules are eks/s3/vpc only). `terraform plan` fails with "Value for undeclared variable"; the dev example even ships a password-shaped literal `ChangeMeInProduction123!`.

**Retracted:** the dead hft-trade-bot PDB + `/grafana` ingress path are already S203 (helm templates were leaf-swept in R107); all 40 dashboard metric names exist in emitters — the defect is dead setters, not wrong names; `helm/files/` is byte-identical to `monitoring/` (zero drift, honest sync comments); cpu/memory gauges self-sample at scrape time via `resource.getrusage` (POSIX-guarded); `MetricsCollector` is an intentional write-only sink when `--metrics` is off.

**Verified clean:** helm templates are genuinely good — fail-fast on `webUi.wsExchange`/`wsSignals`/`grafana.adminPassword`, correct env names (`WS_URL`, `HFT_EXCHANGE_WS_URL`, `EXCHANGE_CONTROL_TOKEN`, `EXCHANGE_WS_HOST`), probes on real endpoints (`/live`, `/ready`, `/health`, `/-/healthy`, `/-/ready`, `/api/health`), hft sidecar sharing `/dev/shm` via emptyDir-Memory, kill-switch redirected to a writable volume, vendored alerts/dashboards via `.Files.Get`/`.Files.Glob`; terraform s3 module has real public-access-block + versioning + encryption; s3 backend with dynamodb lock.

Commit: a5c93ca
