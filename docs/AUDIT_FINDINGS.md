# Audit Findings — Full Project Grep Scan

**Date:** 2026-08-22 (last verified: 2026-08-25)
**Scope:** Entire project (`ai-signal-bot/`, `exchange_simulator/`, `hft-trade-bot/`, `hft-executor/`, `monitoring/`, `web-ui/`, `scripts/`, root-level files)
**Method:** grep-based scan for: TODO/FIXME/HACK, `except Exception`, `print()`, `import *`, `type: ignore`, `NotImplementedError`, `global`, `: Any`, `# noqa`, `pass`, hardcoded values (localhost, ports, /dev/shm), duplicate files, dead code, credentials/secrets, redundant exception tuples, f-string logging, `nosec`/`codeql` annotations, `os.system`, SQL injection patterns

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
