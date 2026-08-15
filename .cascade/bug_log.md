# Bug Log

> All bugs found by Cascade AI during deep code analysis.
> Each bug has a unique ID, location, root cause, status, and fix info.
> Update this file EVERY TIME you find or fix a bug.

## Summary

| Status | Count |
|--------|-------|
| ✅ Fixed | 70 |
| 🔄 In Progress | 0 |
| ⏳ Pending Fix | 39 |
| 📋 Proposal Needed | 0 |
| **TOTAL FOUND** | **109** |

---

## Critical Bugs

### Bug #001: Default JWT secret in docker-compose.yml
- **File:** `docker-compose.yml:24`
- **Category:** Security
- **Severity:** Critical
- **Root Cause:** `JWT_SECRET=${JWT_SECRET:-change-this-in-production}` — if env var not set, uses known insecure secret
- **Impact:** Token forgery, full auth bypass if deployed without setting JWT_SECRET
- **Status:** ⏳ Pending Fix

### Bug #002: SSRF protection bypass via IP encoding
- **File:** `app/routers/_common.py:950-970`
- **Category:** Security
- **Severity:** Critical
- **Root Cause:** `validate_external_url()` uses `host.startswith("10.")` string prefix matching. Bypassable with hex IP (`0x7f000001`), decimal IP (`2130706433`), IPv6-mapped IPv4 (`::ffff:127.0.0.1`), short form (`127.1`), DNS rebinding
- **Impact:** Attacker can make server fetch internal resources (AWS metadata, internal APIs, DB)
- **Status:** ⏳ Pending Fix

---

## High Priority Bugs

### Bug #003: Version mismatch 8.0.0 vs 8.7.7
- **File:** `app/__init__.py:6`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `__version__ = "8.0.0"` but `pyproject.toml` and `main.py` say `8.7.7`. Dockerfile label also `8.0.0`
- **Impact:** Incorrect version in API responses, health checks, Docker images
- **Status:** ⏳ Pending Fix

### Bug #004: No Postgres pool cleanup on shutdown
- **File:** `app/main.py:118-144`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `lifespan` shutdown handler closes browser pool and artifact cleanup but not Postgres connection pool
- **Impact:** Connection leaks in production, especially during rolling deployments
- **Status:** ⏳ Pending Fix

### Bug #005: In-memory rate limiting doesn't work in multi-worker
- **File:** `app/middleware.py`
- **Category:** Security / Performance
- **Severity:** High
- **Root Cause:** When Redis not configured, rate limiting uses in-memory token buckets. Each uvicorn worker has separate state
- **Impact:** Rate limits are per-worker, allowing N*max_requests where N = worker count
- **Status:** ⏳ Pending Fix

### Bug #006: Test fixtures don't override all 140+ repos
- **File:** `tests/conftest.py`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `authed_client` fixture overrides ~13 repos but app has 140+. Unoverridden repos use global singletons
- **Impact:** Cross-test contamination via shared state, flaky tests
- **Status:** ⏳ Pending Fix

### Bug #007: No SSRF bypass tests
- **File:** `tests/`
- **Category:** Security / Testing
- **Severity:** High
- **Root Cause:** No test cases for hex IP, decimal IP, IPv6-mapped IPv4, DNS rebinding, URL encoding bypasses
- **Impact:** SSRF vulnerabilities may go undetected in future changes
- **Status:** ⏳ Pending Fix

### Bug #008: mypy `ignore_errors` for app.models
- **File:** `pyproject.toml:65-70`
- **Category:** Type Safety
- **Severity:** High
- **Root Cause:** `ignore_errors = true` for entire 6851-line models module
- **Impact:** All type errors in models go completely undetected
- **Status:** ⏳ Pending Fix

### Bug #009: Star imports cause mypy name-defined suppression
- **File:** `pyproject.toml:73-75`
- **Category:** Type Safety
- **Severity:** High
- **Root Cause:** All 70+ router files use `from ._common import *`, mypy can't resolve names, `name-defined` disabled
- **Impact:** Typos and undefined names go undetected in all router files
- **Status:** ⏳ Pending Fix

### Bug #010: Synchronous Postgres in async context
- **File:** `app/deps.py`
- **Category:** Performance
- **Severity:** High
- **Root Cause:** `psycopg` (not async) used for Postgres. Sync DB calls block FastAPI event loop
- **Impact:** Request handling blocked during database operations
- **Status:** ⏳ Pending Fix

### Bug #011: CLI not linted in CI
- **File:** `.github/workflows/ci.yml:18`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** CI runs `ruff check app/ tests/ cli.py` but CLI is a package (`cli/`), not a file
- **Impact:** CLI code not linted, linting errors go undetected
- **Status:** ⏳ Pending Fix

### Bug #012: Star import hub _common.py (979 lines)
- **File:** `app/routers/_common.py:1-979`
- **Category:** Architecture / Code Quality
- **Severity:** High
- **Root Cause:** 979-line file re-exports hundreds of symbols, all routers do `from ._common import *`
- **Impact:** Untraceable dependencies, circular import risk, namespace pollution, mypy disabled
- **Status:** ⏳ Pending Fix

---

## Medium Priority Bugs

### Bug #013: Monolithic models.py (6851 lines)
- **File:** `app/models.py`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** All Pydantic models in single file
- **Impact:** Navigation difficult, merge conflicts, slow IDE
- **Status:** ⏳ Pending Fix

### Bug #014: Monolithic repository.py (17540 lines)
- **File:** `app/repository.py`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** All repo interfaces + InMemory implementations in single file
- **Impact:** Largest file in project, extremely difficult to maintain
- **Status:** ⏳ Pending Fix

### Bug #015: 140+ repetitive singleton getters in deps.py
- **File:** `app/deps.py:1161-1498`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** Hundreds of lines of identical `get_xxx_repository()` boilerplate
- **Impact:** Code bloat, maintenance burden
- **Status:** ⏳ Pending Fix

### Bug #016: All singletons instantiated at module load time
- **File:** `app/deps.py`
- **Category:** Performance
- **Severity:** Medium
- **Root Cause:** All 140+ repos created when `deps.py` is imported
- **Impact:** Slow startup, high memory usage
- **Status:** ⏳ Pending Fix

### Bug #017: Backend selection logic repeated for every repo
- **File:** `app/deps.py`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** `if _BACKEND == "postgres" ... elif "sqlite" ... else ...` repeated 140+ times
- **Impact:** Error-prone, difficult to add new backends
- **Status:** ⏳ Pending Fix

### Bug #018: Template seeding at module load time
- **File:** `app/deps.py:1157-1158`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `for _t in get_builtin_templates(): _template_repository.save(_t)` runs at import time
- **Impact:** Seeding runs in tests, potential duplicate data
- **Status:** ⏳ Pending Fix

### Bug #019: Login rate limiting in module-level dicts
- **File:** `app/auth.py`
- **Category:** Security
- **Severity:** Medium
- **Root Cause:** `_login_attempts` dict is module-level, shared per-worker not per-server
- **Impact:** Login rate limiting bypass in multi-worker deployments
- **Status:** ⏳ Pending Fix

### Bug #020: No LLM API error handling/retry
- **File:** `app/llm.py:598-622`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `_llm_call()` doesn't catch API errors (rate limits, timeouts, auth errors)
- **Impact:** Run failures due to transient LLM API issues
- **Status:** ⏳ Pending Fix

### Bug #021: JSON parsing without error handling
- **File:** `app/llm.py:621`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `json.loads(raw)` — if LLM returns invalid JSON, raises `JSONDecodeError`
- **Impact:** Run failures due to LLM returning non-JSON responses
- **Status:** ⏳ Pending Fix

### Bug #022: No timeout on LLM calls
- **File:** `app/llm.py`
- **Category:** Performance
- **Severity:** Medium
- **Root Cause:** OpenAI client created without explicit timeout
- **Impact:** Run hangs if LLM is slow to respond
- **Status:** ⏳ Pending Fix

### Bug #023: InMemory repos not thread-safe
- **File:** `app/repository.py`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** InMemory implementations use plain dicts, no locks
- **Impact:** Data corruption in concurrent access
- **Status:** ⏳ Pending Fix

### Bug #024: No pagination in many list() methods
- **File:** `app/repository.py`
- **Category:** Performance
- **Severity:** Medium
- **Root Cause:** Many `list()` methods return all records without pagination
- **Impact:** Memory issues with large datasets
- **Status:** ⏳ Pending Fix

### Bug #025: Inconsistent list_by_user None handling
- **File:** `app/repository.py`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** Some repos return all records when user_id is None, others filter
- **Impact:** Potential data leakage between users
- **Status:** ⏳ Pending Fix

### Bug #026: CSRF may break API clients
- **File:** `app/middleware.py`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** CSRF middleware checks double-submit cookies, API clients don't handle cookies
- **Impact:** CLI and SDK clients may fail on POST/PUT/DELETE
- **Status:** ⏳ Pending Fix

### Bug #027: Retry logic duplicates execution code
- **File:** `app/pipeline.py:45-66`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** Run execution and result processing duplicated in initial and retry paths
- **Impact:** Maintenance burden, risk of divergence
- **Status:** ⏳ Pending Fix

### Bug #028: Stale run cleanup not scheduled
- **File:** `app/pipeline.py:112-136`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `cleanup_stale_runs()` exists but is never called by any scheduler
- **Impact:** Stale runs remain in RUNNING/PLANNING/QUEUED indefinitely
- **Status:** ⏳ Pending Fix

### Bug #029: Exception handling too broad in pipeline
- **File:** `app/pipeline.py:74`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** Catches `KeyError`, `AttributeError`, `TypeError` which may mask programming errors
- **Impact:** Bugs in runner/pipeline masked as run failures
- **Status:** ⏳ Pending Fix

### Bug #030: from-suite endpoint doesn't pass email_repo
- **File:** `app/routers/runs.py:142`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `create_run_from_suite` calls `_execute_suite_run` without `email_repo`
- **Impact:** No email notifications for suite-based runs
- **Status:** ⏳ Pending Fix

### Bug #031: Encryption key development fallback
- **File:** `app/security.py`
- **Category:** Security
- **Severity:** Medium
- **Root Cause:** Encryption key defaults to development value when not set
- **Impact:** Secrets encrypted with weak key in misconfigured production
- **Status:** ⏳ Pending Fix

### Bug #032: CLI no error handling for network errors
- **File:** `cli/commands.py`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** Uses `httpx.Client` without catching `ConnectError`, `TimeoutException`
- **Impact:** Unhandled exception traceback when server unreachable
- **Status:** ⏳ Pending Fix

### Bug #033: CLI no timeout on run polling
- **File:** `cli/_common.py:117`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `_poll_run` polls indefinitely, no timeout
- **Impact:** CLI hangs on stuck runs
- **Status:** ⏳ Pending Fix

### Bug #034: No Postgres/SQLite integration tests
- **File:** `tests/`
- **Category:** Testing
- **Severity:** Medium
- **Root Cause:** All tests use InMemory repos, no integration tests for Postgres/SQLite
- **Impact:** Bugs in Postgres/SQLite implementations go undetected
- **Status:** ⏳ Pending Fix

### Bug #035: CORS defaults to wildcard
- **File:** `docker-compose.yml`
- **Category:** Security
- **Severity:** Medium
- **Root Cause:** `CORS_ORIGINS=${CORS_ORIGINS:-*}` defaults to wildcard
- **Impact:** CORS allows all origins if not configured
- **Status:** ⏳ Pending Fix

### Bug #036: Coverage omits Postgres repos
- **File:** `pyproject.toml`
- **Category:** Testing
- **Severity:** Medium
- **Root Cause:** `omit = ["app/postgres_repos.py"]` excludes PG from coverage
- **Impact:** False confidence in coverage numbers
- **Status:** ⏳ Pending Fix

### Bug #037: Ruff per-file ignores for routers and CLI
- **File:** `pyproject.toml`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** F403, F405, F401, E402, F811, F821 disabled for routers and CLI
- **Impact:** Unused imports and undefined names go undetected
- **Status:** ⏳ Pending Fix

### Bug #038: No Postgres/Redis service containers in CI
- **File:** `.github/workflows/ci.yml`
- **Category:** Testing
- **Severity:** Medium
- **Root Cause:** CI only runs tests with InMemory repos
- **Impact:** Postgres/SQLite/Redis code paths not tested in CI
- **Status:** ⏳ Pending Fix

### Bug #039: Duplicate imports in _common.py
- **File:** `app/routers/_common.py`
- **Category:** Code Quality
- **Severity:** Medium
- **Root Cause:** `behavior_importer`, `performance`, `permissions`, `onprem`, `visual_diff`, `nl_dashboard` imported both at top level and in try/except blocks
- **Impact:** Code confusion, potential shadowing
- **Status:** ⏳ Pending Fix

---

## Low Priority Bugs

### Bug #040: Duplicate entries in models __all__
- **File:** `app/models.py`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `BrowserConfig`, `AutoHealSuggestion`, `CoverageGap` appear twice in `__all__`
- **Status:** ⏳ Pending Fix

### Bug #041: Middleware ordering
- **File:** `app/main.py`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** CSRF added last (executes first), rate limit should be outermost
- **Status:** ⏳ Pending Fix

### Bug #042: Static files without caching headers
- **File:** `app/main.py:299-311`
- **Category:** Performance
- **Severity:** Low
- **Root Cause:** No Cache-Control headers on static file endpoints
- **Status:** ⏳ Pending Fix

### Bug #043: Error messages hardcoded in English
- **File:** `app/errors.py`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** No i18n for error messages
- **Status:** ⏳ Pending Fix

### Bug #044: TOTP window not configurable
- **File:** `app/security.py`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** TOTP verification uses fixed window
- **Status:** ⏳ Pending Fix

### Bug #045: No Retry-After header on 429
- **File:** `app/middleware.py`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** Rate limit response doesn't include `Retry-After` header
- **Status:** ⏳ Pending Fix

### Bug #046: Path traversal protection incomplete
- **File:** `app/routers/_common.py:900-914`
- **Category:** Security
- **Severity:** Low
- **Root Cause:** `validate_user_path` doesn't use `Path.resolve()` for robust validation
- **Status:** ⏳ Pending Fix

### Bug #047: CLI star import
- **File:** `cli/commands.py:5`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `from ._common import *`
- **Status:** ⏳ Pending Fix

### Bug #048: CLI commands.py is 2587 lines
- **File:** `cli/commands.py`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** All CLI commands in single file
- **Status:** ⏳ Pending Fix

### Bug #049: TypeScript SDK uses cross-fetch
- **File:** `sdk/typescript/src/index.ts`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `cross-fetch` unnecessary for Node >=18
- **Status:** ⏳ Pending Fix

### Bug #050: Go SDK no context support
- **File:** `sdk/go/e2eqa/client.go`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** Methods don't accept `context.Context`
- **Status:** ⏳ Pending Fix

### Bug #051: Dockerfile version label hardcoded
- **File:** `Dockerfile:16`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** `LABEL org.opencontainers.image.version="8.0.0"` should be 8.7.7
- **Status:** ⏳ Pending Fix

### Bug #052: passlib+bcrypt both pinned
- **File:** `requirements.txt`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `passlib[bcrypt]==1.7.4` and `bcrypt==4.2.1` both listed, potential conflict
- **Status:** ⏳ Pending Fix

### Bug #053: pydantic+pydantic[email] both listed
- **File:** `requirements.txt`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** Redundant — `pydantic[email]` includes `pydantic`
- **Status:** ⏳ Pending Fix

### Bug #054: openai exact pin
- **File:** `requirements.txt`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `openai==1.58.1` misses security patches
- **Status:** ⏳ Pending Fix

### Bug #055: pip-audit ignores vulnerability without explanation
- **File:** `.github/workflows/ci.yml`
- **Category:** Security
- **Severity:** Low
- **Root Cause:** `--ignore-vuln PYSEC-2026-1325` without documentation
- **Status:** ⏳ Pending Fix

### Bug #056: No pip caching in CI
- **File:** `.github/workflows/ci.yml`
- **Category:** Performance
- **Severity:** Low
- **Root Cause:** No `cache: pip` in setup-python
- **Status:** ⏳ Pending Fix

### Bug #057: Coverage doesn't gate build
- **File:** `.github/workflows/ci.yml`
- **Category:** Testing
- **Severity:** Low
- **Root Cause:** `build` job doesn't depend on `coverage` job
- **Status:** ⏳ Pending Fix

### Bug #058: Version-based test naming
- **File:** `tests/test_v*.py`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** `test_v2.py`...`test_v80.py` — hard to find tests for specific features
- **Status:** ⏳ Pending Fix

### Bug #059: test_coverage_boost.py is 117KB
- **File:** `tests/test_coverage_boost.py`
- **Category:** Code Quality
- **Severity:** Low
- **Root Cause:** Largest test file, likely auto-generated
- **Status:** ⏳ Pending Fix

### Bug #060: No security headers
- **File:** `app/main.py`
- **Category:** Security
- **Severity:** Low
- **Root Cause:** No HSTS, X-Frame-Options, X-Content-Type-Options, CSP headers
- **Status:** ⏳ Pending Fix

### Bug #061: No HTTPS enforcement
- **File:** `app/main.py`
- **Category:** Security
- **Severity:** Low
- **Root Cause:** No HTTPS redirect middleware
- **Status:** ⏳ Pending Fix

### Bug #062: performance_profile not stored
- **File:** `app/pipeline.py:45` / `app/runner.py`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** `runner.run()` returns `performance_profile` but it's never saved
- **Status:** ⏳ Pending Fix

### Bug #063: Temperature hardcoded to 0 in LLM
- **File:** `app/llm.py:614`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** `temperature=0` not configurable
- **Status:** ⏳ Pending Fix

### Bug #064: No token usage tracking for LLM
- **File:** `app/llm.py`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** LLM token usage not tracked or logged
- **Status:** ⏳ Pending Fix

### Bug #065: No browser pool reuse
- **File:** `app/runner.py`
- **Category:** Performance
- **Severity:** Low
- **Root Cause:** Each run creates new browser instance
- **Status:** ⏳ Pending Fix

---

## Exchange Simulator Bugs (Scan: 2026-08-16)

### Bug #066: _update_position closes entire position on partial opposite-side order
- **File:** `exchange_simulator/exchange.py:650-708`
- **Category:** Bug
- **Severity:** Critical
- **Root Cause:** When closing a position with an opposite-side order, PnL was calculated on `existing.quantity` (full position) instead of `order.filled_quantity`. Selling 2 BTC with a 10 BTC long position would close all 10 BTC, not just 2.
- **Impact:** Incorrect position sizing, wrong PnL, unexpected full position closes
- **Status:** ✅ Fixed
- **Fix:** Use `close_qty = min(order.filled_quantity, existing.quantity)`, calculate PnL on `close_qty`, and only remove position if fully closed; otherwise reduce `existing.quantity`.

### Bug #067: BlackScholes._d1 division by zero at T=0 or sigma=0
- **File:** `exchange_simulator/options_pricing.py:39-41`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `(sigma * math.sqrt(T))` in denominator — when T=0 (at expiry) or sigma=0 (no volatility), causes ZeroDivisionError. Also `math.log(S/K)` with S<=0 or K<=0 causes ValueError.
- **Impact:** Crash when pricing options at expiry or with zero volatility
- **Status:** ✅ Fixed
- **Fix:** Guard clause returns 0.0 for T<=0, sigma<=0, S<=0, or K<=0, producing intrinsic value via _cdf(0)=0.5.

### Bug #068: WebSocket message parsing uses .json() on str
- **File:** `exchange_simulator/price_feed_manager.py:455,590`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `message.json()` called on WebSocket messages, but the `websockets` library returns `str` or `bytes`, not objects with a `.json()` method. Should use `json.loads(message)`.
- **Impact:** AttributeError on every WebSocket message — real-time price feeds completely broken
- **Status:** ✅ Fixed
- **Fix:** Replace `message.json()` with `json.loads(message)`, added `import json`.

### Bug #069: Coinbase WebSocket sends dict instead of JSON string
- **File:** `exchange_simulator/price_feed_manager.py:585`
- **Category:** Bug
- **Severity:** High
- **Root Cause:** `await ws.send(subscribe_msg)` sends a Python dict, but `websockets.send()` expects `str` or `bytes`. Coinbase never receives the subscription message.
- **Impact:** Coinbase WebSocket never subscribes — no price updates from Coinbase
- **Status:** ✅ Fixed
- **Fix:** Changed to `await ws.send(json.dumps(subscribe_msg))`.

### Bug #070: _execute_iceberg_slice sets FILLED before margin check
- **File:** `exchange_simulator/exchange.py:262-286`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `slice_order.status = OrderStatus.FILLED` was set before `_check_margin()`. If margin check failed, status was changed to REJECTED, but `hidden_quantity` and `replenished` were already modified. Order was in inconsistent state.
- **Impact:** Iceberg orders with insufficient margin have corrupted state, hidden quantity lost
- **Status:** ✅ Fixed
- **Fix:** Moved margin check before any state changes. Only decrement `hidden_quantity` and increment `replenished` after margin check passes.

### Bug #071: Iceberg limit price check uses wrong OrderType comparison
- **File:** `exchange_simulator/exchange.py:157`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** `if order.price and order.order_type == OrderType.LIMIT` — but iceberg orders have `order_type = OrderType.ICEBERG`, not `LIMIT`. The condition never matched, so iceberg orders with a limit price always executed at market price.
- **Impact:** Iceberg limit orders ignore specified price, execute at market price instead
- **Status:** ✅ Fixed
- **Fix:** Changed to `if order.price is not None:` to check for limit price directly.

### Bug #072: _execute_market_order doesn't apply slippage
- **File:** `exchange_simulator/exchange.py:236-260`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** Phase 3 helper `_execute_market_order()` filled at exact price with zero slippage, unlike `submit_order()` which applies `slippage_bps`. Trailing stop orders got unrealistic fills.
- **Impact:** Advanced orders (trailing stops) bypass slippage, giving unrealistic execution prices
- **Status:** ✅ Fixed
- **Fix:** Added slippage calculation matching `submit_order()` logic, set `order.slippage`, and use `fill_price` for notional/fee calculations.

### Bug #073: /metrics endpoint returns string instead of Prometheus format
- **File:** `exchange_simulator/health.py:112-114`
- **Category:** Bug
- **Severity:** Low
- **Root Cause:** `/metrics` endpoint returned a plain string. FastAPI wraps strings in JSON response with quotes, breaking Prometheus scraping. Error case also returned plain string instead of HTTP error.
- **Impact:** Prometheus cannot scrape metrics — monitoring broken
- **Status:** ✅ Fixed
- **Fix:** Return `PlainResponse` with `media_type="text/plain; version=0.0.4; charset=utf-8"`. Error case returns 503 status.

### Bug #074: AuditLogger callback registration not thread-safe
- **File:** `exchange_simulator/audit_logger.py:113-132`
- **Category:** Concurrency
- **Severity:** Low
- **Root Cause:** `register_callback()`, `unregister_callback()`, and `_notify_callbacks()` all access `self._callbacks` list without holding `self._lock`. Concurrent modification during iteration could cause RuntimeError or missed callbacks.
- **Impact:** Rare race condition — callback list corruption in multi-threaded scenarios
- **Status:** ✅ Fixed
- **Fix:** Wrapped `register_callback` and `unregister_callback` in `self._lock`. `_notify_callbacks` now iterates over a copy of the list under the lock.

### Bug #075: BinomialTree._calculate_parameters NaN at T=0 or sigma=0
- **File:** `exchange_simulator/options_pricing.py:279-283`
- **Category:** Bug
- **Severity:** Medium
- **Root Cause:** When T=0, `dt=0`, `u=exp(0)=1`, `d=1`, `p=(1-1)/(1-1)=0/0=NaN`. NaN propagates through all option values.
- **Impact:** NaN option prices at expiry or with zero volatility
- **Status:** ✅ Fixed
- **Fix:** Guard clause returns `u=1.0, d=1.0, p=0.5` for T<=0, sigma<=0, or steps<=0.

---

## Bug #076 — Backtester counts break-even trades as losses

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:265`
- **Severity:** Medium
- **Root Cause:** `pnl <= 0` includes trades with `pnl == 0` (break-even after fees) in the losses list, inflating losing_trades count and deflating win_rate.
- **Status:** ✅ Fixed
- **Fix:** Changed `pnl <= 0` to `pnl < 0` so break-even trades are excluded from both wins and losses.

---

## Bug #077 — BacktestEngine counts break-even trades as losses

- **Location:** `ai-signal-bot/src/backtesting/backtest_engine.py:290`
- **Severity:** Medium
- **Root Cause:** Same as #076 — `pnl <= 0` includes break-even trades in losses.
- **Status:** ✅ Fixed
- **Fix:** Changed `pnl <= 0` to `pnl < 0`.

---

## Bug #078 — RL environment reward hides transaction costs

- **Location:** `ai-signal-bot/src/ml/environment.py:155`
- **Severity:** High
- **Root Cause:** `prev_portfolio_value` was computed AFTER the trade action executed, not before. This made transaction costs invisible to the RL agent — the reward only reflected price movement, not the cost of trading. The agent could never learn to avoid unnecessary trades.
- **Status:** ✅ Fixed
- **Fix:** Moved `prev_portfolio_value` calculation before the action execution block.

---

## Bug #079 — RL agents call env.reset() without required prices argument

- **Location:** `ai-signal-bot/src/ml/rl_agent.py:161,328`
- **Severity:** Medium
- **Root Cause:** `TradingEnv.reset()` requires a `prices` positional argument, but `DQNAgent.train()` and `PPOAgent.train()` call `env.reset()` with no arguments, causing `TypeError`.
- **Status:** ✅ Fixed (partial — added `info = {}` initialization and `info.get('trade_count', 0)` to prevent KeyError; full fix requires updating train() to pass prices to reset())
- **Fix:** Initialized `info = {}` before the while loop and used `info.get('trade_count', 0)` to handle empty info dict from early termination.

---

## Bug #080 — RL agent info['trade_count'] KeyError on empty info

- **Location:** `ai-signal-bot/src/ml/rl_agent.py:183,351`
- **Severity:** Low
- **Root Cause:** When `env.step()` returns early with `done=True` and empty `info={}`, accessing `info['trade_count']` raises `KeyError`.
- **Status:** ✅ Fixed
- **Fix:** Use `info.get('trade_count', 0)` and initialize `info = {}` before the loop.

---

## Bug #083 — IcebergOrder missing `replenished` field causes TypeError

- **Location:** `exchange_simulator/models.py:281-294` (IcebergOrder dataclass)
- **Severity:** Critical
- **Root Cause:** `IcebergOrder` dataclass does not define a `replenished` field, but `exchange.py:439` passes `replenished=0` to the constructor and `exchange.py:279,296` accesses `order.replenished`. This causes `TypeError: __init__() got an unexpected keyword argument 'replenished'` every time an iceberg order is submitted.
- **Status:** ✅ Fixed
- **Fix:** Added `replenished: int = 0` field to `IcebergOrder` dataclass and included it in `to_dict()`.

---

## Bug #081 — Backtester annualization uses stock market days (252) instead of crypto (365)

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:281,287,322`
- **Severity:** Medium
- **Root Cause:** Sharpe, Sortino, and Calmar ratios use 252 (stock trading days) for annualization, but this is a crypto trading system that runs 24/7/365. This underestimates annualized returns and ratios.
- **Status:** ✅ Fixed
- **Fix:** Changed all 252 references to 365 for crypto market annualization.

---

## Bug #082 — BacktestEngine annualization uses stock market days (252) instead of crypto (365)

- **Location:** `ai-signal-bot/src/backtesting/backtest_engine.py:310,324`
- **Severity:** Medium
- **Root Cause:** Same as #081 — `bars_per_year = 252 * 24 * 60` and Calmar annualization use 252 instead of 365.
- **Status:** ✅ Fixed
- **Fix:** Changed 252 to 365 in both `bars_per_year` and Calmar annualization calculations.

---

## Bug #084 — MicrostructureConfig dt uses 252 (stock market days) instead of 365 (crypto)

- **Location:** `exchange_simulator/exchange_simulator/market_microstructure.py:61`
- **Severity:** Medium
- **Root Cause:** `dt = 1.0 / (252 * 24 * 60)` uses 252 stock market trading days, but this is a crypto trading system running 24/7/365. Using 252 overestimates the per-step dt, causing all microstructure price generation (Heston vol, Student-t returns, jumps) to be scaled incorrectly.
- **Status:** ✅ Fixed
- **Fix:** Changed `252` to `365` in the dt calculation.

---

## Bug #085 — FundingRateSimulator.compute_funding_payment missing mark_price multiplier

- **Location:** `exchange_simulator/exchange_simulator/funding_rate.py:89-94`
- **Severity:** High
- **Root Cause:** `compute_funding_payment` calculates funding as `-position_qty * funding_rate`, but real exchanges compute funding as `position_value * funding_rate` where `position_value = qty * mark_price`. Without mark_price, a 1 BTC position at $50k with 0.01% funding pays $0.0001 instead of $5.00 — 500,000x underestimate.
- **Status:** ✅ Fixed
- **Fix:** Added `mark_price` parameter (default 0.0 for backward compatibility). When mark_price > 0, computes `-qty * mark_price * funding_rate`. Falls back to legacy behavior when mark_price is 0.

---

## Bug #086 — LiquidationEngineV2.liquidate() margin update doesn't subtract released margin

- **Location:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:136`
- **Severity:** High
- **Root Cause:** When liquidating a partial position, the code does `pos.margin = max(pos.margin + pnl * margin_ratio, 0)`, which adds PnL from the liquidated portion but doesn't subtract the margin that was allocated to that portion. This means the remaining position's margin is inflated by the released margin amount, leading to incorrect margin accounting and potentially preventing future liquidations that should occur.
- **Status:** ✅ Fixed
- **Fix:** Calculate `released_margin = pos.margin * margin_ratio` and subtract it: `pos.margin = max(pos.margin - released_margin + liquidated_pnl, 0)`.

---

## Bug #087 — health.py imports non-existent PlainResponse instead of PlainTextResponse

- **Location:** `exchange_simulator/health.py:6,112,114`
- **Severity:** Critical
- **Root Cause:** `from fastapi.responses import JSONResponse, PlainResponse` — `PlainResponse` does not exist in FastAPI/Starlette. The correct class is `PlainTextResponse`. This causes `ImportError` at module load time, preventing the entire health check endpoint from working.
- **Status:** ✅ Fixed
- **Fix:** Replaced all `PlainResponse` with `PlainTextResponse`.

---

## Bug #088 — BlackScholes.calculate_gamma/vega/theta lack edge case guards causing ZeroDivisionError/ValueError

- **Location:** `exchange_simulator/options_pricing.py:130,148,176`
- **Severity:** High
- **Root Cause:** `calculate_gamma`, `calculate_theta`, and `calculate_vega` all use `math.sqrt(T)` without checking T <= 0. `calculate_gamma` also divides by `S * sigma * math.sqrt(T)`. When T=0 or negative (expired options), these raise `ZeroDivisionError` or `ValueError` (sqrt of negative). The `_d1` method already guards these cases, but these methods don't.
- **Status:** ✅ Fixed
- **Fix:** Added `if T <= 0 or sigma <= 0 or S <= 0: return 0.0` guards to all three methods.

---

## Bug #089 — CoinbaseAPI.subscribe_websocket doesn't store WebSocket task reference

- **Location:** `exchange_simulator/price_feed_manager.py:615`
- **Severity:** High
- **Root Cause:** `CoinbaseAPI.subscribe_websocket` creates a WebSocket handler task with `asyncio.create_task(_ws_handler())` but doesn't store the reference (unlike `BinanceAPI` which stores it in `self._ws_task`). This means: (1) the task can be garbage collected before completion, (2) there's no way to cancel it on close, (3) `CoinbaseAPI.close()` doesn't exist so the WebSocket connection leaks.
- **Status:** ✅ Fixed
- **Fix:** Added `self._ws_task` attribute to `CoinbaseAPI.__init__`, stored the task reference, and added `close()` method that cancels the task and calls `super().close()`.

---

## Bug #090 — WebSocket server _check_rate_limit defined but never called

- **Location:** `exchange_simulator/websocket_server.py:311-329,354`
- **Severity:** High
- **Root Cause:** The `_check_rate_limit` method is defined and per-client tracking state is initialized in `_handle_client`, but the method is never called before processing incoming messages. This means any connected client can send unlimited messages (orders, config changes, etc.) without any rate limiting, enabling DoS via message flooding.
- **Status:** ✅ Fixed
- **Fix:** Added `_check_rate_limit(websocket)` call at the start of the message processing loop in `_handle_client`. If rate limit exceeded, sends an error message and skips processing.

---

## Bug #091 — adx NumPy path dx_start search uses isinstance(v, float) which fails for numpy.float64

- **Location:** `ai-signal-bot/src/technical_analysis/indicators.py:249`
- **Severity:** High
- **Root Cause:** In the NumPy code path of the `adx` function, the `dx_start` search uses `isinstance(v, float) and math.isnan(v)` to find the first non-NaN DX value. However, `v` is a `numpy.float64` (from `np.full(n, NAN)`), and `isinstance(numpy.float64, float)` returns `False` in standard Python. This means the `isinstance` check always fails, so the condition `not (isinstance(v, float) and math.isnan(v))` is always `True` (even for NaN values), causing `dx_start` to be 0 regardless. The ADX result is then computed from NaN values, producing all-NaN output. The same bug exists at line 253 for the `dx[i]` check. The non-NumPy path at line 284 correctly uses `math.isnan(v)` without the `isinstance` guard.
- **Status:** ✅ Fixed
- **Fix:** Replaced `isinstance(v, float) and math.isnan(v)` with `np.isnan(v)` at line 249, and `isinstance(dx[i], float) and math.isnan(dx[i])` with `np.isnan(dx[i])` at line 253.

---

## Bug #092 — calculate_position_size passes risk_per_trade as expected_return to kelly_criterion_sizing

- **Location:** `ai-signal-bot/src/risk/position_sizing.py:66`
- **Severity:** High
- **Root Cause:** `calculate_position_size` calls `self.kelly_criterion_sizing(signal, price, volatility, risk_per_trade)` with `risk_per_trade` as the 4th positional argument. However, `kelly_criterion_sizing`'s signature is `(self, signal, price, volatility, expected_return=0.15, risk_per_trade=0.02)`, so `risk_per_trade` (0.02) is bound to `expected_return` instead. This means Kelly criterion uses 2% expected return instead of the default 15%, dramatically under-sizing positions. The actual `risk_per_trade` parameter falls back to its default 0.02, so the risk cap happens to work correctly by coincidence.
- **Status:** ✅ Fixed
- **Fix:** Changed the call to use keyword argument: `self.kelly_criterion_sizing(signal, price, volatility, risk_per_trade=risk_per_trade)`.

---

## Bug #093 — Backtester._close_position creates Trade with empty symbol="" instead of actual symbol

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:384`
- **Severity:** Medium
- **Root Cause:** `_close_position` creates a `Trade` with `symbol=""` hardcoded. The `symbol` parameter is available in `run()` but is never passed to `_open_position` or stored in the position dict. This means all trade records have an empty symbol, making it impossible to attribute trades to specific symbols in multi-symbol backtests or display correct symbol in reports.
- **Status:** ✅ Fixed
- **Fix:** Added `symbol` parameter to `_open_position`, stored it in the position dict, and changed `_close_position` to read it from `pos.get("symbol", "")`. Updated both `_open_position` calls in `run()` to pass `symbol=symbol`.

---

## Bug #094 — _adf_statistic computes residuals regression with wrong variables

- **Location:** `ai-signal-bot/src/strategies/statistical_arbitrage.py:52`
- **Severity:** High
- **Root Cause:** In `_adf_statistic`, the regression uses demeaned variables `x = y_lag - y_lag.mean()` and `y = dy - dy.mean()` to compute `beta`. However, the residuals for the standard error calculation are computed as `residuals_reg = dy - beta * y_lag`, which uses the raw (non-demeaned) variables. The correct formula should be `residuals_reg = y - beta * x` (using the same demeaned variables used for the regression). This produces incorrect standard errors, which in turn produces incorrect ADF test statistics, leading to wrong cointegration detection — the core of the statistical arbitrage strategy.
- **Status:** ✅ Fixed
- **Fix:** Changed `residuals_reg = dy - beta * y_lag` to `residuals_reg = y - beta * x`.

---

## Bug #095 — _monitor_loop creates asyncio task without storing reference

- **Location:** `ai-signal-bot/src/strategies/cross_exchange_arb.py:151`
- **Severity:** High
- **Root Cause:** `_monitor_loop` creates an `asyncio.create_task(self._execute_arbitrage(opp))` but doesn't store the task reference. The task can be garbage collected before completion, silently dropping arbitrage executions. This is the same class of bug as Bug #089.
- **Status:** ✅ Fixed
- **Fix:** Added `self._pending_tasks: set[asyncio.Task] = set()`, store the task in the set, and use `task.add_done_callback(self._pending_tasks.discard)` for automatic cleanup.

---

## Bug #096 — BacktestEngine._exit_position creates BacktestTrade with empty symbol=""

- **Location:** `ai-signal-bot/src/backtesting/backtest_engine.py:238`
- **Severity:** Medium
- **Root Cause:** Same as Bug #093 but in `BacktestEngine` (separate from `Backtester`). `_exit_position` creates a `BacktestTrade` with `symbol=""` hardcoded. The `symbol` parameter is available in `run()` but is not passed through to `_check_exit` or `_exit_position`. All trade records have an empty symbol.
- **Status:** ✅ Fixed
- **Fix:** Added `symbol` parameter to `_exit_position` and `_check_exit`, passed `symbol=symbol` from `run()` through all call chains.

---

## Bug #097 — DQNAgent and PPOAgent use list.pop(0) for replay memory (O(n) instead of O(1))

- **Location:** `ai-signal-bot/src/ml/rl_agent.py:67-68, 303-304`
- **Severity:** Medium (Performance)
- **Root Cause:** Both `DQNAgent.remember()` and `PPOAgent.remember()` use `self.memory.pop(0)` on a Python list to enforce the memory size limit. `list.pop(0)` is O(n) because it shifts all remaining elements. With `memory_size=10000`, every experience after the buffer is full requires shifting 9999 elements, significantly slowing training.
- **Status:** ✅ Fixed
- **Fix:** Replaced `self.memory = []` with `self.memory: deque = deque(maxlen=config.memory_size)` in both agents. Removed the manual `pop(0)` check since `deque` with `maxlen` automatically discards the oldest element when appending.

---

## Bug #098 — TradingEnv.reset() requires prices parameter but RL agents call it without arguments

- **Location:** `ai-signal-bot/src/ml/rl_agent.py:159, 329` (call sites) and `ai-signal-bot/src/ml/environment.py:61` (definition)
- **Severity:** Critical
- **Root Cause:** `TradingEnv.reset()` has signature `def reset(self, prices: np.ndarray, features: Optional[np.ndarray] = None)` — `prices` is a required parameter. However, both `DQNAgent.train()` and `PPOAgent.train()` call `env.reset()` without any arguments. This causes a `TypeError: reset() missing 1 required positional argument: 'prices'` at runtime, making RL training completely non-functional.
- **Status:** ✅ Fixed
- **Fix:** Added `prices` and `features` optional parameters to both `DQNAgent.train()` and `PPOAgent.train()`, and pass them to `env.reset()` when provided.

---

## Bug #099 — LSTMModel.evaluate mixes raw and normalized data in direction accuracy calculation

- **Location:** `ai-signal-bot/src/ml/lstm_model.py:268`
- **Severity:** Medium
- **Root Cause:** In `evaluate()`, `predictions` are computed in normalized space (using `X_norm = self._normalize(X)`), and `mse`/`mae` correctly compare against `y_norm`. However, the direction accuracy calculation at line 268 uses raw `y` (not `y_norm`) for `actual_direction`, while `pred_direction` uses normalized `predictions`. This mixes raw and normalized spaces, producing incorrect direction accuracy metrics.
- **Status:** ✅ Fixed
- **Fix:** Changed `actual_direction = np.sign(y[1:] - y[:-1])` to `actual_direction = np.sign(y_norm[1:] - y_norm[:-1])` to use the normalized target values consistently.

---

## Bug #100 — TransformerModel softmax doesn't subtract max before exp, causing numerical overflow

- **Location:** `ai-signal-bot/src/ml/transformer_model.py:80, 173`
- **Severity:** Medium (Numerical Stability)
- **Root Cause:** Two softmax computations in `TransformerModel` — one in `_multi_head_attention` (line 80) and one in `generate_signal` (line 173) — compute `np.exp(scores)` without first subtracting the maximum value. When score values are large (which can happen with large feature values or during early training), `np.exp` overflows to `inf`, producing `NaN` attention weights or signal probabilities. This is a well-known numerical stability issue in softmax implementations.
- **Status:** ✅ Fixed
- **Fix:** Added `scores_max = np.max(scores, axis=-1, keepdims=True)` and changed to `np.exp(scores - scores_max) / np.sum(np.exp(scores - scores_max), ...)` in both locations.

---

## Bug #101 — should_rebalance_volatility_based divides by zero when target_volatility is 0

- **Location:** `ai-signal-bot/src/portfolio/rebalancing.py:124`
- **Severity:** Medium
- **Root Cause:** `should_rebalance_volatility_based` computes `volatility_drift = abs(current_volatility - target_volatility) / target_volatility` without checking if `target_volatility` is zero. When the target volatility is 0 (e.g., a fully-cash target portfolio), this causes a `ZeroDivisionError` (or produces `inf` with NumPy), crashing the rebalancing check.
- **Status:** ✅ Fixed
- **Fix:** Added a guard: if `target_volatility == 0`, return `current_volatility > max_volatility_drift` (rebalance if any volatility exists when target is zero).

---

## Bug #102 — total_hedge_pnl calculation has off-by-one error causing IndexError

- **Location:** `ai-signal-bot/src/research/greeks_hedging.py:199-200`
- **Severity:** Critical
- **Root Cause:** The `total_hedge_pnl` calculation uses `enumerate([daily_hedge[0]] + daily_hedge[:-1], 1)`, which prepends an extra `daily_hedge[0]` to the list. This creates `n_days + 1` elements, so `i` ranges from 1 to `n_days + 1`. But `prices` only has `n_days + 1` elements (indices 0 to `n_days`), so `prices[n_days + 1]` raises `IndexError`. The extra prepended element also doubles the hedge P&L for the first day, producing incorrect results even if the index didn't overflow.
- **Status:** ✅ Fixed
- **Fix:** Removed the extra `[daily_hedge[0]] +` prefix. Now uses `enumerate(daily_hedge[:-1], 1)` which correctly iterates `n_days` elements with `i` from 1 to `n_days`, matching `prices` indices.

---

## Bug #103 — compute_trade_intensity uses timestamps[1] instead of timestamps[0] for duration

- **Location:** `ai-signal-bot/src/research/microstructure_lab.py:193`
- **Severity:** Medium
- **Root Cause:** `compute_trade_intensity` calculates `duration = max(timestamps[-1] - timestamps[1], 1)` using `timestamps[1]` (second trade) instead of `timestamps[0]` (first trade). This excludes the first trade from the duration calculation, underestimating the total time window and overestimating the trade arrival rate.
- **Status:** ✅ Fixed
- **Fix:** Changed `timestamps[1]` to `timestamps[0]` so the duration spans from the first to the last trade.

---

## Bug #104 — TelegramNotifier and DiscordNotifier create asyncio tasks without storing references (GC risk)

- **Location:** `ai-signal-bot/src/notification/notifier.py:74, 184`
- **Severity:** High
- **Root Cause:** Both `TelegramNotifier.start()` and `DiscordNotifier.start()` call `asyncio.create_task()` without storing the returned task reference. Python's asyncio only holds a weak reference to tasks, so the garbage collector can destroy the task before it completes, silently dropping the polling loop. Additionally, `stop()` doesn't cancel the polling task, so it keeps running after the notifier is supposed to be stopped.
- **Status:** ✅ Fixed
- **Fix:** Added `self._poll_task` attribute to both classes. Store the task reference in `start()`. In `stop()`, cancel the task and await its cancellation before closing the session.

---

## Bug #105 — LLMEngine._cache grows unbounded — memory leak

- **Location:** `ai-signal-bot/src/llm_engine/engine.py:155-159`
- **Severity:** Medium
- **Root Cause:** `LLMEngine.analyze_market` adds entries to `self._cache` on every call but never evicts stale entries. The cache only checks TTL on read, but expired entries remain in the dict indefinitely. Over time, with many symbols and price levels, the cache grows without bound, causing a memory leak.
- **Status:** ✅ Fixed
- **Fix:** Added two fixes: (1) delete expired cache entries immediately when found during lookup, (2) when cache exceeds 100 entries, proactively evict all stale entries.

---

## Bug #106 — RateLimiter.acquire divides by zero when rate is 0

- **Location:** `ai-signal-bot/src/utils/helpers.py:207`
- **Severity:** Medium
- **Root Cause:** `RateLimiter.acquire` computes `wait = (1.0 - self._tokens) / self.rate` without checking if `self.rate` is 0. When rate is 0, this causes `ZeroDivisionError`, crashing the caller. A rate of 0 is a valid configuration meaning "no requests allowed" or could result from a misconfiguration.
- **Status:** ✅ Fixed
- **Fix:** Added a guard: if `self.rate <= 0`, sleep briefly (10ms) and retry the loop instead of dividing by zero.

---

## Bug #107 — SignalPublisher.start creates asyncio task without storing reference (GC risk)

- **Location:** `ai-signal-bot/src/communication/signal_publisher.py:85`
- **Severity:** High
- **Root Cause:** `SignalPublisher.start()` calls `asyncio.create_task(self._broadcast_circuit_breaker_status())` without storing the task reference. Python's asyncio only holds a weak reference to tasks, so the garbage collector can destroy the task before it completes, silently stopping circuit breaker status broadcasts. Additionally, `stop()` doesn't cancel the task, so it keeps running after the publisher is supposed to be stopped.
- **Status:** ✅ Fixed
- **Fix:** Added `self._cb_broadcast_task` attribute. Store the task reference in `start()`. In `stop()`, cancel the task and await its cancellation before closing the server.

---

## Bug #108 — _kupiec_test produces NaN when all observations are violations

- **Location:** `ai-signal-bot/src/risk/var.py:238`
- **Severity:** Medium
- **Root Cause:** `_kupiec_test` computes `lr = 2 * (x * np.log(x / (n * p)) + (n - x) * np.log((n - x) / (n * (1 - p))))`. When `violations == total_observations` (i.e., `x == n`), the term `(n - x) * np.log((n - x) / ...)` becomes `0 * np.log(0)` = `0 * (-inf)` = `NaN`. This corrupts the entire Kupiec test result, making the VaR backtest report unreliable.
- **Status:** ✅ Fixed
- **Fix:** Added an early return `float('inf')` when `violations == total_observations`, indicating the model is completely wrong.

---

## Bug #109 — kelly_criterion_sizing divides by zero when volatility is 0 and allows negative Kelly fraction

- **Location:** `ai-signal-bot/src/risk/position_sizing.py:169`
- **Severity:** High
- **Root Cause:** `kelly_criterion_sizing` computes `kelly_fraction = (expected_return - risk_free_rate) / (volatility ** 2)` without checking if `volatility` is 0 or None. When volatility is 0, this causes `ZeroDivisionError`. Additionally, when `expected_return < risk_free_rate`, `kelly_fraction` goes negative, leading to negative position sizes (shorting when the intent is to size a long position).
- **Status:** ✅ Fixed
- **Fix:** Added guard: if `volatility is None or volatility <= 0`, set `kelly_fraction = 0.0`. Floored `kelly_fraction` at 0.0 before capping at 0.25.

---

## Bug #110 — stress_test.py divides by portfolio_value_before without zero check in all 4 scenario methods

- **Location:** `ai-signal-bot/src/risk/stress_test.py:59, 102, 149, 189`
- **Severity:** Medium
- **Root Cause:** All 4 stress test scenario methods (`crisis_2008_scenario`, `covid_crash_scenario`, `ftx_collapse_scenario`, `custom_scenario`) compute `pnl_percentage = pnl / portfolio_value_before` without checking if `portfolio_value_before` is 0. When all positions are 0 or all prices are 0, this causes `ZeroDivisionError`, crashing the stress test.
- **Status:** ✅ Fixed
- **Fix:** Added zero check: `pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0` in all 4 methods.

---

## Bug #111 — backtester.py SL/TP checks missing zero guards causes immediate exit

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:165-178`
- **Severity:** High
- **Root Cause:** The SL/TP checks in the main backtest loop don't guard against `stop_loss == 0` or `take_profit == 0`. For SHORT positions, `high >= stop_loss` with `stop_loss=0` is always true (any non-negative high), causing immediate exit on the first candle. Same for LONG with `take_profit=0` and `high >= 0`. This silently kills every position that doesn't set explicit SL/TP values.
- **Status:** ✅ Fixed
- **Fix:** Added `> 0` guards: `if current_position["stop_loss"] > 0 and ...` and `if current_position["take_profit"] > 0 and ...` for both LONG and SHORT branches.

---

## Bug #112 — backtester.py pnl_pct divides by entry_price * quantity without zero check

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:382`
- **Severity:** Medium
- **Root Cause:** `_close_position` computes `pnl_pct = pnl / (pos["entry_price"] * pos["quantity"]) * 100` without checking if the denominator is 0. When `entry_price` is 0 (shouldn't happen but can from bad data), this causes `ZeroDivisionError`, crashing the backtest.
- **Status:** ✅ Fixed
- **Fix:** Extracted `entry_notional = pos["entry_price"] * pos["quantity"]` and guarded: `pnl_pct = pnl / entry_notional * 100 if entry_notional > 0 else 0`.

---

## Bug #113 — cross_exchange_arb.py slippage calculation divides by limit_price without zero check

- **Location:** `ai-signal-bot/src/strategies/cross_exchange_arb.py:307-309`
- **Severity:** Medium
- **Root Cause:** `_execute_leg` computes `slippage = (fill_price - limit_price) / limit_price * 10000` without checking if `limit_price` is 0. When `limit_price` is 0 (e.g., bad order data or degenerate market), this causes `ZeroDivisionError`, crashing the arbitrage execution.
- **Status:** ✅ Fixed
- **Fix:** Added guard: `if limit_price > 0:` compute slippage normally, `else: slippage = 0.0`.

---

## Bug #114 — statistical_arbitrage.py stop_loss/take_profit divide by price_a without zero check

- **Location:** `ai-signal-bot/src/strategies/statistical_arbitrage.py:258-259, 268-269`
- **Severity:** Medium
- **Root Cause:** The SHORT and LONG signal generation computes `stop_loss=price_a * (1 + self.config.stop_z * self.spread_std / price_a)` and `take_profit=price_a * (1 + self.config.exit_z * self.spread_std / price_a)`. When `price_a` is 0, the division `self.spread_std / price_a` causes `ZeroDivisionError`. Additionally, the expression `price_a * (1 + X / price_a)` simplifies to `price_a + X`, making the division unnecessary.
- **Status:** ✅ Fixed
- **Fix:** Simplified expressions to `price_a + self.config.stop_z * self.spread_std` (and similarly for exit_z) with `if price_a > 0 else 0` guard. This eliminates the division entirely and is mathematically equivalent.

---

## Bug #115 — markowitz.py calculate_portfolio_metrics divides by zero volatility

- **Location:** `ai-signal-bot/src/portfolio/markowitz.py:80`
- **Severity:** Medium
- **Root Cause:** `calculate_portfolio_metrics` computes `sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility` without checking if `portfolio_volatility` is 0. When all weights are 0 or covariance matrix is zero, this causes `ZeroDivisionError`. Also `portfolio_variance` could be slightly negative due to floating point, causing `sqrt` of negative.
- **Status:** ✅ Fixed
- **Fix:** Added `max(portfolio_variance, 0)` guard and `if portfolio_volatility > 0 else 0.0` for Sharpe ratio.

---

## Bug #116 — risk_parity.py calculate_marginal_risk divides by zero volatility

- **Location:** `ai-signal-bot/src/portfolio/risk_parity.py:49`
- **Severity:** Medium
- **Root Cause:** `calculate_marginal_risk` computes `marginal_risk = np.dot(cov_matrix, weights) / portfolio_volatility` without checking if `portfolio_volatility` is 0. When portfolio has zero variance (e.g., all-zero weights or zero covariance), this causes `ZeroDivisionError` or produces `inf`/`NaN` values that propagate through the entire risk parity optimization.
- **Status:** ✅ Fixed
- **Fix:** Added early return of `np.zeros_like(weights)` when `portfolio_volatility == 0`, and `max(portfolio_variance, 0)` guard.

---

## Bug #117 — black_litterman.py incorporate_views calls np.linalg.inv without try/except

- **Location:** `ai-signal-bot/src/portfolio/black_litterman.py:91-101`
- **Severity:** High
- **Root Cause:** `incorporate_views` calls `np.linalg.inv` three times (on `tau * cov_matrix`, `Omega`, and `M1`) without any error handling. If any of these matrices are singular (e.g., collinear assets, zero covariance, or views that produce a singular Omega), `np.linalg.LinAlgError` is raised and the entire optimization crashes. The `portfolio_optimizer.py` version has this guard but this standalone `black_litterman.py` module does not.
- **Status:** ✅ Fixed
- **Fix:** Wrapped all `np.linalg.inv` calls in `try/except np.linalg.LinAlgError`, falling back to prior returns and original covariance matrix.

---

## Bug #118 — environment.py TradingEnv.step divides by current_price without zero check

- **Location:** `ai-signal-bot/src/ml/environment.py:141`
- **Severity:** High
- **Root Cause:** In the BUY action handler, `shares_bought = buy_amount / current_price` doesn't check if `current_price` is 0. When price data contains 0 (e.g., bad data, delisted asset, or placeholder), this produces `inf` shares, corrupting the position state and propagating `NaN` through all subsequent portfolio value calculations and rewards.
- **Status:** ✅ Fixed
- **Fix:** Added `current_price > 0` to the BUY condition guard.

---

## Bug #119 — plotter.py drawdown calculation divides by peak without zero check

- **Location:** `ai-signal-bot/src/backtesting/plotter.py:112`
- **Severity:** Low
- **Root Cause:** `drawdown_pct = (peak - equity) / peak * 100` doesn't guard against `peak == 0`. When equity curve starts at 0 or all values are 0, `peak` is 0, causing division by zero and producing `inf`/`NaN` values that corrupt the drawdown chart.
- **Status:** ✅ Fixed
- **Fix:** Replaced with `np.where(peak > 0, (peak - equity) / peak * 100, 0)` to return 0 drawdown when peak is 0.

---

## Bug #120 — rl_agent.py PPO _update_policy ignores log_probs (no ratio clipping)

- **Location:** `ai-signal-bot/src/ml/rl_agent.py:359-379`
- **Severity:** High
- **Root Cause:** `PPOAgent._update_policy` collects `log_probs` from experience but never uses them. The update is a simple policy gradient (`gradient = states[i] * advantages[i]`), not PPO. PPO's key feature is the clipped surrogate objective using the ratio `exp(new_log_prob - old_log_prob)`, which prevents destructive large policy updates. Without it, the "PPO" agent is just REINFORCE with advantage normalization — unstable and prone to catastrophic policy collapse.
- **Status:** ✅ Fixed
- **Fix:** Implemented proper PPO ratio computation and clipping: compute `new_log_prob` from current policy, calculate `ratio = exp(new_log_prob - old_log_prob)`, clip to `[1-eps, 1+eps]`, and use `min(ratio * advantage, clipped_ratio * advantage)` as the surrogate objective. Also added advantage normalization.

---

## Bug #121 — backtestEngine.js price_change_5 division by zero

- **Location:** `web-ui/src/utils/backtestEngine.js:157-160`
- **Severity:** Medium
- **Root Cause:** `price_change_5` condition divides by `closes[i - 5]` without checking for zero. If a candle has `close=0` (bad data, simulation edge case), this produces `Infinity` or `NaN`, causing the condition to evaluate incorrectly.
- **Status:** ✅ Fixed
- **Fix:** Added `closes[i - 5] !== 0` guard to the `if` condition.

---

## Bug #122 — backtestEngine.js position sizing division by zero

- **Location:** `web-ui/src/utils/backtestEngine.js:253-254, 267-268`
- **Severity:** High
- **Root Cause:** `buy` and `sell` actions compute `qty = (balance * positionSizePct) / candle.close` without checking `candle.close > 0`. If `candle.close` is 0, this produces `Infinity` qty, corrupting the entire backtest.
- **Status:** ✅ Fixed
- **Fix:** Added `candle.close > 0` guard to both `buy` and `sell` action conditions.

---

## Bug #123 — backtestEngine.js pnlPct division by zero in close_all

- **Location:** `web-ui/src/utils/backtestEngine.js:296`
- **Severity:** Medium
- **Root Cause:** `pnlPct` calculation divides by `position.entryPrice * position.qty` without zero check. If entryPrice is 0 (from bad candle data), this produces `Infinity` or `NaN` in trade records.
- **Status:** ✅ Fixed
- **Fix:** Extracted `entryNotional1` variable and used ternary `entryNotional1 !== 0 ? ... : 0`.

---

## Bug #124 — backtestEngine.js drawdown division by zero

- **Location:** `web-ui/src/utils/backtestEngine.js:336`
- **Severity:** Medium
- **Root Cause:** Drawdown calculation divides by `peakEquity` without zero check. If `peakEquity` is 0 (e.g., initial balance is 0), this produces `Infinity` drawdown, corrupting max drawdown metrics.
- **Status:** ✅ Fixed
- **Fix:** Added `peakEquity > 0` guard to drawdown calculation.

---

## Bug #125 — backtestEngine.js totalReturnPct division by zero

- **Location:** `web-ui/src/utils/backtestEngine.js:369`
- **Severity:** Medium
- **Root Cause:** `totalReturnPct` divides by `initialBalance` without zero check. If `initialBalance` is 0, this produces `Infinity` or `NaN` in backtest results.
- **Status:** ✅ Fixed
- **Fix:** Added `initialBalance !== 0` guard to totalReturnPct calculation.

---

## Bug #126 — backtestEngine.js pnlPct division by zero in END close

- **Location:** `web-ui/src/utils/backtestEngine.js:361`
- **Severity:** Medium
- **Root Cause:** Same as Bug #123 but in the end-of-backtest position close. `pnlPct` divides by `position.entryPrice * position.qty` without zero check.
- **Status:** ✅ Fixed
- **Fix:** Extracted `entryNotional2` variable and used ternary `entryNotional2 !== 0 ? ... : 0`.

---

## Bug #127 — backtestEngine.js recoveryFactor division by zero

- **Location:** `web-ui/src/utils/backtestEngine.js:410-412`
- **Severity:** Low
- **Root Cause:** `recoveryFactor` divides by `initialBalance * maxDrawdown` without checking `initialBalance !== 0`. If initialBalance is 0, this produces `Infinity` or `NaN`.
- **Status:** ✅ Fixed
- **Fix:** Added `initialBalance !== 0` to the existing `maxDrawdownPct > 0` guard.

---

## Bug #128 — websocket_server.py WebSocketMetrics list.pop(0) O(n) performance

- **Location:** `exchange_simulator/websocket_server.py:76-77, 84-85`
- **Severity:** Medium
- **Root Cause:** `WebSocketMetrics` uses `list.pop(0)` to evict old entries from `message_sizes` and `broadcast_latencies` — O(n) per operation. In an HFT system broadcasting thousands of messages per second, this causes significant CPU overhead and latency spikes as the list grows to 10,000 entries.
- **Status:** ✅ Fixed
- **Fix:** Replaced `list` with `deque(maxlen=10000)` for both `message_sizes` and `broadcast_latencies`. `deque` provides O(1) append and automatic eviction of old entries via `maxlen`.

---

## Bug #129 — exchange.py SL/TP checks don't guard against stop_loss=0 or take_profit=0

- **Location:** `exchange_simulator/exchange.py:832-842`
- **Severity:** High
- **Root Cause:** `check_stop_loss_take_profit` checks `current_price <= pos.stop_loss` for longs and `current_price >= pos.stop_loss` for shorts without checking if `stop_loss` is 0. When SL/TP is not set, the default value is 0, which means: for longs, `current_price <= 0` is false (OK), but for shorts, `current_price >= 0` is always true, causing immediate position closure. Similarly, `take_profit=0` for longs means `current_price >= 0` is always true.
- **Status:** ✅ Fixed
- **Fix:** Added `pos.stop_loss > 0` and `pos.take_profit > 0` guards to all SL/TP condition checks.

---

## Bug #130 — liquidation_engine_v2.py PnL double-counted in partial liquidation

- **Location:** `exchange_simulator/exchange_simulator/liquidation_engine_v2.py:140-141`
- **Severity:** High
- **Root Cause:** During partial liquidation, `liquidated_pnl` is added back to remaining position margin (`pos.margin = max(pos.margin - released_margin + liquidated_pnl, 0)`) AND also applied to the insurance fund (`self.insurance_fund += pnl * margin_ratio`). This double-counts the PnL from the liquidated portion — once in the remaining margin and once in the insurance fund. The remaining margin should only be the original margin minus the released margin; the PnL goes to the insurance fund exclusively.
- **Status:** ✅ Fixed
- **Fix:** Removed `+ liquidated_pnl` from the remaining margin calculation. Remaining margin is now `max(pos.margin - released_margin, 0)`.

---

## Bug #131 — price_feed_manager.py PerformanceMetrics list.pop(0) O(n) performance

- **Location:** `exchange_simulator/price_feed_manager.py:87-88, 93-94`
- **Severity:** Medium
- **Root Cause:** `PerformanceMetrics` uses `list.pop(0)` to evict old entries from `fetch_latencies` and `parse_latencies` — O(n) per operation. Same pattern as Bug #128. In a high-frequency price feed system, this causes unnecessary CPU overhead.
- **Status:** ✅ Fixed
- **Fix:** Replaced `list` with `deque(maxlen=10000)` for both latency tracking lists. Removed manual `pop(0)` calls.

---

## Bug #132 — visualizer.py division by zero in change_pct and upnl_pct

- **Location:** `exchange_simulator/visualizer.py:226, 615`
- **Severity:** Medium
- **Root Cause:** `change_pct` divides by `prev.close` without zero check — if previous candle close is 0 (bad data), produces `Infinity` or `NaN`. `upnl_pct` divides by `p["entry_price"] * p["quantity"]` with only `quantity > 0` guard, but `entry_price` could still be 0, making the product 0.
- **Status:** ✅ Fixed
- **Fix:** Added `prev.close != 0` guard to `change_pct`. Changed `upnl_pct` to check `entry_notional > 0` (product of entry_price and quantity) instead of just `quantity > 0`.

---

## Bug #133 — position_sizing.py 12 division-by-zero vulnerabilities

- **Location:** `ai-signal-bot/src/risk/position_sizing.py:86, 93, 95, 102, 132, 139, 179, 187, 194, 197, 258, 261`
- **Severity:** High
- **Root Cause:** `DynamicPositionSizer` methods perform arithmetic divisions without validating that divisors are non-zero. Specifically:
  - `volatility_based_sizing`: divides by `price`, `daily_volatility`, and `self.account_value` without guards. Also crashes with `TypeError` if `volatility` is `None`.
  - `risk_parity_sizing`: divides by `price * stop_loss_percentage` and `self.account_value` without guards.
  - `kelly_criterion_sizing`: divides by `price`, `daily_volatility * 2`, and `self.account_value` without guards. Also unconditionally divides `volatility` by `np.sqrt(365)` at line 187 even when `volatility` is `None` (the `None` check at line 169 only guards `kelly_fraction` computation, not the later `daily_volatility` calculation).
  - `enforce_position_limits`: divides by `total_exposure` and `self.account_value` without guards.
- **Impact:** `ZeroDivisionError` crashes or `TypeError` crashes when price, account value, or volatility inputs are 0 or None. These are realistic scenarios: zero-price data from API outages, zero account value at startup, or None volatility when data is unavailable.
- **Status:** ✅ Fixed
- **Fix:** Added early-return guards at the top of `volatility_based_sizing`, `risk_parity_sizing`, and `kelly_criterion_sizing` that return a zero `PositionSizingResult` when `price <= 0`, `account_value <= 0`, or `volatility is None or <= 0`. Added inline guards at remaining division sites: `leverage = ... if self.account_value > 0 else 0.0`, `denom = price * daily_volatility * 2; position_size = risk_amount / denom if denom > 0 else 0.0`, and `scale_factor = ... if total_exposure > 0 else 0.0`, `return position_values / self.account_value if self.account_value > 0 else position_values * 0`.

---

## Bug #134 — risk_parity.py division by zero in optimize_risk_parity

- **Location:** `ai-signal-bot/src/portfolio/risk_parity.py:119, 126`
- **Severity:** Medium
- **Root Cause:** `optimize_risk_parity` divides `weights / marginal_risk` without checking for zero elements in `marginal_risk`. When `portfolio_volatility == 0` (degenerate covariance matrix), `calculate_marginal_risk` returns all zeros, making the division produce `inf`/`NaN` that silently corrupts the entire optimization. Additionally, the post-clip normalization at line 126 divides by `np.sum(new_weights)` which could be zero if all weights are clipped to their lower bound of 0.
- **Status:** ✅ Fixed
- **Fix:** Added `np.where(np.abs(marginal_risk) < 1e-12, 1e-12, marginal_risk)` floor before division. Added `weight_sum > 0` and `clip_sum > 0` guards on both normalizations, falling back to equal weights when sum is zero.

---

## Bug #135 — backtester.py division by zero in _open_position

- **Location:** `ai-signal-bot/src/backtesting/backtester.py:344`
- **Severity:** Low
- **Root Cause:** `_open_position` calculates `max_qty = max_notional / fill_price` without checking `fill_price > 0`. While the `risk_per_unit <= 0` guard at line 339 catches most cases where `fill_price` is 0 (since `stop_loss` would also be 0), it's theoretically possible for `stop_loss` to be non-zero when `price` is 0 from corrupted data, allowing execution to reach the division.
- **Status:** ✅ Fixed
- **Fix:** Added `fill_price > 0` guard: `max_qty = max_notional / fill_price if fill_price > 0 else 0`.

---

## Bug #136 — real_market_data.py O(n) list.pop(0) in HFT candle callback

- **Location:** `ai-signal-bot/src/data_collection/real_market_data.py:387-390`
- **Severity:** Medium
- **Root Cause:** `RealMarketDataManager._on_candle` uses a regular `list` for candle caching and calls `list.pop(0)` when the cache exceeds 1000 entries. `list.pop(0)` is O(n) because all remaining elements must be shifted left. In an HFT WebSocket data path receiving candle updates at high frequency, this causes latency spikes proportional to cache size (up to 1000 element shifts per candle).
- **Impact:** Latency spikes on every candle update after cache fills to 1000 entries. In a multi-symbol HFT system, this can cause cascading delays affecting signal generation and order placement timing.
- **Status:** ✅ Fixed
- **Fix:** Replaced `list` with `collections.deque(maxlen=1000)` which provides O(1) append and automatic trimming when the maxlen is exceeded. Removed the manual `pop(0)` call entirely. Updated the type annotation from `dict[str, list[NormalizedCandle]]` to `dict[str, deque[NormalizedCandle]]`.

---

## Bug #137 — market_making.py order_count never incremented, total_pnl never updated

- **Location:** `ai-signal-bot/src/strategies/market_making.py:63, 170-176, 218-227`
- **Severity:** Medium
- **Root Cause:** `order_count` is initialized to 0 but never incremented anywhere in the class. `get_stats()` computes `fill_rate = fill_count / max(order_count, 1)` which always equals `fill_count` (a meaningless metric). `total_pnl` is initialized to 0.0 but never updated in `on_fill`, so it always reports 0.0. These are critical MM monitoring metrics.
- **Impact:** Strategy monitoring reports incorrect fill_rate (always equals fill_count) and total_pnl (always 0.0), misleading operators about strategy performance and preventing spread optimization.
- **Status:** ✅ Fixed
- **Fix:** Increment `order_count` in `generate_quotes` on the normal quoting path (each call represents one quote pair = one order opportunity). Update `total_pnl` in `on_fill` using mark-to-market PnL: for SELL fills, PnL = qty * (fill_price - prev_price); for BUY fills, PnL = -qty * (fill_price - prev_price).

---

## Bug #138 — cvar.py division by zero in Hill estimator

- **Location:** `ai-signal-bot/src/risk/cvar.py:186`
- **Severity:** Medium
- **Root Cause:** `_calculate_tail_index` computes `excesses = tail_losses_sorted[:-1] / tail_losses_sorted[-1]` where `tail_losses_sorted[-1]` is the smallest absolute loss value in the tail. When returns are mostly positive or the threshold percentile lands near zero, this denominator can be 0, causing a `ZeroDivisionError` or producing `inf`/`NaN` that propagates through the tail index calculation.
- **Impact:** Crash when computing tail risk measures for portfolios with mostly positive returns or flat return distributions. The tail index is used in extreme value theory analysis for risk management decisions.
- **Status:** ✅ Fixed
- **Fix:** Floored the denominator with `max(tail_losses_sorted[-1], 1e-12)` before division, preventing division by zero while preserving numerical accuracy for normal cases.

---

## Bug #139 — ml_ensemble.py HMMRegimeDetector refits on every update once deque is full

- **Location:** `ai-signal-bot/src/strategies/ml_ensemble.py:287-289`
- **Severity:** High
- **Root Cause:** `HMMRegimeDetector.update` uses `len(self._returns) % 50 == 0` to trigger periodic refitting. The deque has `maxlen=500`. Once it fills to 500 elements, `len()` stays at 500 permanently, and `500 % 50 == 0` is always True. This causes `_fit()` — an O(n) operation involving sorting 500 returns and classifying each one — to execute on every single `update()` call, turning a periodic maintenance task into a per-tick bottleneck in the ML prediction hot path.
- **Impact:** Severe performance degradation in the ML ensemble strategy. Every candle update triggers a full HMM refit (O(n) sort + classify), potentially blocking signal generation and adding significant latency to the prediction pipeline.
- **Status:** ✅ Fixed
- **Fix:** Added a separate `_update_count` counter that increments on every `update()` call and is never capped by deque maxlen. Changed the refit condition from `len(self._returns) % 50 == 0` to `self._update_count % 50 == 0`, ensuring refitting only happens every 50 updates regardless of deque state.

---

## Bug #140 — cross_exchange_arb.py stop() doesn't cancel pending arbitrage tasks

- **Location:** `ai-signal-bot/src/strategies/cross_exchange_arb.py:136-137`
- **Severity:** High
- **Root Cause:** `stop()` only sets `self._running = False` to stop the monitor loops, but does not cancel or await pending `_execute_arbitrage` tasks. These tasks are created via `asyncio.create_task` and stored in `_pending_tasks`. After `stop()` returns, these tasks continue running in the background, potentially placing real orders on exchanges after the engine is supposed to be shut down.
- **Impact:** Orphaned orders on exchanges during shutdown. In a trading system, this can lead to unhedged positions, unexpected exposure, and financial loss. The arbitrage engine may execute one leg of a trade after the operator has issued a stop command.
- **Status:** ✅ Fixed
- **Fix:** `stop()` now cancels all pending tasks in `_pending_tasks` and awaits their completion with `asyncio.gather(..., return_exceptions=True)` to ensure clean shutdown. The `_pending_tasks` set is cleared afterward.

---

## Bug #141 — var.py mutable default argument in calculate_var_at_multiple_levels

- **Location:** `ai-signal-bot/src/risk/var.py:140`
- **Severity:** Low
- **Root Cause:** `calculate_var_at_multiple_levels` has `confidence_levels: List[float] = [0.95, 0.99, 0.999]` as a default argument. In Python, mutable default arguments are created once at function definition time and shared across all calls. If any caller modifies the list (e.g., `confidence_levels.append(0.9999)`), the modification persists and affects all subsequent calls that use the default.
- **Impact:** Incorrect VaR calculations if the default list is mutated. Risk management decisions could be based on wrong confidence levels.
- **Status:** ✅ Fixed
- **Fix:** Changed the default to `None` and create a new list `[0.95, 0.99, 0.999]` inside the function body when `confidence_levels is None`.

---

## Bug #142 — funding_arb_detector.py stale opportunities never removed from _active_opportunities

- **Location:** `ai-signal-bot/src/strategies/funding_arb_detector.py:130-134`
- **Severity:** Medium
- **Root Cause:** `detect()` adds newly detected opportunities to `_active_opportunities` but never removes opportunities that are no longer detected (e.g., funding rate dropped below threshold, spread widened beyond max). The `get_active_opportunities()` method returns all entries ever added, including stale ones that no longer represent valid arbitrage opportunities.
- **Impact:** Operators see stale arbitrage opportunities that no longer exist, potentially leading to incorrect trading decisions. The active opportunity count grows monotonically, misrepresenting the current market state.
- **Status:** ✅ Fixed
- **Fix:** Before adding new opportunities, compute the set of new keys and remove any keys in `_active_opportunities` that are not in the new set. This ensures `get_active_opportunities()` only returns currently valid opportunities.

---

## How to Update This File

1. **Found a new bug:** Add entry with next sequential ID, fill in all fields, set Status to ⏳ Pending Fix
2. **Started fixing:** Change Status to 🔄 In Progress
3. **Finished fixing:** Change Status to ✅ Fixed, add commit hash and fix description
4. **Needs proposal:** Change Status to 📋 Proposal Needed, create proposal in `.cascade/proposals/`
5. **Update Summary table** at the top with current counts
