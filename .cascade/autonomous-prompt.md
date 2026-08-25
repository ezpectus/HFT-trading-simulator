# Autonomous Work Prompt — Trading System Lite

## Context
You are working on a multi-language HFT trading system with:
- **web-ui/** — React 18 + Vite + TailwindCSS frontend, 289 components, 99 test files, PWA
- **ai-signal-bot/** — Python 3.12 asyncio trading bot, 144 source files, 155 test files
- **exchange_simulator/** — Python WebSocket exchange simulator (50 symbols, 3 exchanges)
- **hft-trade-bot/** — C++20 HFT execution engine (SHM IPC, lock-free queues)
- **hft-executor/** — Rust order executor (tokio-tungstenite, FFI for C++)
- **helm/** + **deploy/** — Kubernetes Helm charts, Docker Compose configs
- **terraform/** — Infrastructure as Code
- **monitoring/** — Prometheus, Alertmanager, Grafana configs
- **scripts/** — Build, deploy, CI helper scripts (27 files)
- **docs/** — 13 documentation files + 4 guides (ALL need regular updates)
- **Root docs:** CHANGELOG.md, README.md, CONTRIBUTING.md, SECURITY.md, PROJECT_AUDIT.md
- **.cascade/office-board.md** — Task board with REF-01..REF-625 (572 DONE, 0 TODO)
- **.cascade/verification-plan.md** — Audit checklist for project health

## Your Mission
1. Read `.cascade/office-board.md` and work through tasks sequentially
2. Mark each task as ✅ DONE in the board when completed
3. **Before every commit: update ALL relevant docs** (see Doc Update Protocol below)
4. Commit after every 5-10 tasks
5. Keep `.cascade/verification-plan.md` updated with findings
6. Keep CHANGELOG.md updated with every batch of changes

## Session Start Protocol (EVERY new session)
1. Check `git status --short` — see if there are uncommitted changes from last session
2. Check `git log --oneline -5` — see recent commits for context
3. Read `.cascade/office-board.md` lines 1-20 (progress summary) — get current state
4. Grep office-board for `⬜ TODO` or `⛔ BLOCKED` — find pending tasks
5. Read `.cascade/verification-plan.md` — check for unresolved audit items
6. If uncommitted changes exist — review them first, commit or ask user
7. Then start working on next priority task

## Session End Protocol (BEFORE ending session)
1. Commit any uncommitted changes (with CHANGELOG + docs update)
2. Update `.cascade/office-board.md` progress summary (DONE/TODO counts)
3. Update `.cascade/autonomous-prompt.md` Current Status section if needed
4. Update `.cascade/verification-plan.md` with any new findings
5. Report to user: what was done, what's pending, what's blocked

## Office Board Navigation
- Board is ~2750 lines — DO NOT read it all at once
- Read lines 1-20 for progress summary
- Grep for `⬜ TODO` to find pending tasks
- Grep for `⛔ BLOCKED` to find stuck tasks
- Grep for `### REF-NN:` to find specific task by number
- Tasks are grouped by category (A through J) and phase (4 through 5)
- Each task has: title, Описание, Сложность, Файлы

## Adding New Tasks to Office Board
- Continue numbering from last REF (currently REF-625)
- Format: `### REF-NNN: Title ⬜ TODO`
- Include: **Описание:**, **Сложность:**, **Файлы:**
- Add to appropriate category section
- Update progress summary at top of file

## Current Status
- **ALL OFFICE-BOARD TASKS COMPLETE:** 572 DONE, 0 TODO, 0 BLOCKED
- **REF-01..50** — DRY refactoring, UI centralization ✅
- **REF-51..110** — JS test fixes, 857 tests passing ✅
- **REF-111..150** — Edge-case test coverage for components/hooks/utils ✅
- **REF-151..200** — Performance optimization ✅
- **REF-201..250** — Python type hints, docstrings, strategy tests (10 new test files) ✅
- **REF-251..300** — DevOps/CI/CD/Helm verified ✅
- **REF-301..400** — Documentation + security verified ✅
- **REF-401..500** — UI/UX + tooling verified ✅
- **REF-501..520** — Static analysis audits ✅
- **REF-521..625** — Config, CI/CD, docs, test coverage ✅
- **Bug log:** 188 bugs found, all fixed
- **JS tests:** 857 tests, 0 failures (isolate: true)
- **Python tests:** 32+ unit tests, integration tests, strategy tests
- **memo():** 289/289 components wrapped in memo() (3 error boundaries excluded) ✅
- **Verification plan:** `.cascade/verification-plan.md` — audit checklist updated
- **Git:** All commits pushed to origin/master ✅

## Next Steps
The office-board is fully cleared. Verification plan audit mostly complete. Remaining:
1. User should run full test suites (JS + Python) and fix any failures
2. ✅ Security: ApiClient.jsx apiKey/apiSecret fixed — now in-memory only (useState)
3. Docs freshness: Verify docs/ match current code structure
4. Config verification: Verify settings.yaml/shared_config.yaml match current code
5. Add new task batches to office-board.md as needed

## Doc Update Protocol (MANDATORY — after every code change)

### Files to read and update after changes:
1. **CHANGELOG.md** — Add entry under `[Unreleased]` with date, batch name, Changed/Added/Fixed/Removed sections
2. **docs/ARCHITECTURE.md** — If architecture, modules, or data flow changed
3. **docs/WEB_UI.md** — If web-ui components, panels, hooks, or utils changed
4. **docs/TRADING_STRATEGIES.md** — If strategies, signals, or ensemble logic changed
5. **docs/RISK_MANAGEMENT.md** — If risk, VaR, position sizing, or stops changed
6. **docs/TESTING.md** — If test structure, frameworks, or coverage changed
7. **docs/DEPLOYMENT.md** — If Docker, Helm, terraform, or CI/CD changed
8. **docs/MONITORING_GUIDE.md** — If metrics, alerts, or health checks changed
9. **docs/PERFORMANCE.md** — If performance, latency, or optimization changed
10. **docs/REST_API.md** — If API endpoints, request/response format changed
11. **docs/WEBSOCKET_PROTOCOL.md** — If WS messages, channels, or protocol changed
12. **docs/ADVANCED_ORDER_TYPES.md** — If order types, execution logic changed
13. **docs/guides/CONFIGURATION_GUIDE.md** — If config files, env vars, or settings changed
14. **docs/guides/DEVELOPMENT_GUIDE.md** — If dev setup, build process, or tooling changed
15. **docs/guides/QUICK_START.md** — If getting started steps changed
16. **docs/guides/TRADING_GUIDE.md** — If trading workflow or UI usage changed
17. **README.md** — If project overview, architecture, or features changed
18. **CONTRIBUTING.md** — If contribution process, code style, or PR workflow changed
19. **SECURITY.md** — If security policies, vulnerability fixes, or auth changed
20. **PROJECT_AUDIT.md** — If audit findings resolved or new findings discovered
21. **.cascade/office-board.md** — Mark tasks ✅ DONE, update progress summary
22. **.cascade/verification-plan.md** — Update audit findings, mark items checked

### Doc update rules:
- Read the doc file BEFORE updating — don't blindly overwrite
- Update only the relevant section — don't rewrite the whole file
- Keep formatting consistent with existing doc style
- If a doc doesn't exist yet for a new feature — create it
- If a doc references removed code — update or remove the reference
- CHANGELOG.md entries must follow Keep a Changelog format (Added/Changed/Fixed/Removed/Deprecated)

## Task Execution Protocol
For each task:
1. **Read the task** in office-board.md → understand the files involved
2. **Read the relevant source files** before making changes
3. **Read the relevant doc files** to understand what needs updating after
4. **Make minimal, focused edits** — don't refactor beyond the task scope
5. **Verify the fix** — re-read changed files, check for syntax errors
6. **Update office-board.md** — change ⬜ TODO to ✅ DONE after completing each task
7. **Update CHANGELOG.md** — add entry describing what changed
8. **Update relevant docs/** — per Doc Update Protocol above
9. **Commit every 5-10 tasks** — see commit convention below

## Rules
1. **Do NOT run tests, linters, or dev servers** — user handles all test/lint runs
2. **Do NOT run destructive commands** (rm, git reset, git checkout) without approval
3. **Follow existing code style** — don't add comments unless asked
4. **Verify imports exist** before adding them
5. **If a task is blocked** — mark as ⛔ BLOCKED with reason and move to next
6. **Pre-commit verification** — re-read every changed file, grep for broken imports, verify no syntax errors
7. **Update docs after changes** — per Doc Update Protocol above (CHANGELOG + relevant docs/)
8. **Keep verification-plan.md updated** — mark items as checked, add new findings

## Git Workflow
- **Autonomous batch mode (REF tasks):** AI can `git add -A && git commit --no-verify -m "..."` directly
- **Ad-hoc changes / manual edits:** User runs git commands themselves
- **Push to origin:** Only when user explicitly asks — `git push origin master`
- **Pre-commit hook is broken** — always use `--no-verify`
- **NEVER** run: tests, linters, dev servers, `rm`, `git reset`, `git checkout` without explicit approval

## Cross-Cutting Concerns (BEWARE when changing these files)
- **`ui-helpers.tsx`** — imported by 289 components. Any change affects ALL panels. Run full test suite after.
- **`format.ts`** — imported by 20+ components for price/volume/pct formatting
- **`registry.js`** — maps all panels to components and props. Breaking it kills the entire UI.
- **`useLocalStorage` hook** — used by Auth, DrawingTools, ChartTemplates, FeatureFlags, ThemeSwitcher, NotificationCenter, DeployStatus, AlertWebhook. Test mocks must return 3 values. (ApiClient removed — security fix: credentials now in-memory)
- **`settings.yaml`** — config for entire bot. Changing values affects all strategies, risk, signals.
- **`shared_config.yaml`** — shared between exchange_simulator, ai-signal-bot, hft-trade-bot
- **`src/observability/logging.py`** — logging provider for all 57+ Python modules. Don't break `get_logger()`.
- **`src/strategies/signal.py`** — Signal class used by all strategies, backtester, validator. Don't change API without updating all consumers.

## Test Conventions (web-ui)
- Test files: `web-ui/src/test/componentName.test.jsx`
- Pattern: `describe('ComponentName', () => { it('does something', () => { render(<Component />); expect(screen.getByText('...')).toBeInTheDocument() }) })`
- `useLocalStorage` mock: `vi.mock('../hooks/useLocalStorage', () => ({ useLocalStorage: (key, default) => { const [v, s] = useState(default); return [v, s, () => {}] } }))`
- Use `getAllByText` when text appears multiple times in component output
- Use `getAllByText(...).find(el => el.tagName === 'BUTTON')` to select specific element type
- Wrap `vi.advanceTimersByTime()` in `act()` for React state updates
- `isolate: true` in vitest.config.js — each test file gets its own context
- Setup file: `web-ui/src/test/setup.js`

## Test Conventions (ai-signal-bot)
- Test files: `ai-signal-bot/tests/unit/test_*.py`, `ai-signal-bot/tests/integration/test_*.py`
- Async tests: `async def test_*():` + `await`
- Mock async methods with `AsyncMock`, not `MagicMock`
- DB: use `_get_conn()` method, not `_conn()` attribute
- `deque` doesn't support slicing — wrap with `list()` first
- Config: `from src.config import load_config; config = load_config()`

## Known Issues (from verification-plan.md)
- ✅ **Python TODO/FIXME:** 0 occurrences in `ai-signal-bot/src/` — ALL CLEAR
- ✅ **JSX TODO/FIXME:** 0 occurrences in `web-ui/src/**/*.jsx` — ALL CLEAR
- ✅ **console.log in components:** All clear (console.warn in error handlers OK, WidgetSDK console.log is in string template literal)
- ✅ **Components without memo():** 289/289 memoized (3 error boundaries excluded)
- ✅ **Python test fixes:** All committed and pushed
- ✅ **Helm charts:** CodeQL alerts #49, #50 fixed (no empty passwords)
- ✅ **localStorage security:** ApiClient credentials now in-memory (useState) — fixed
- **Docs freshness:** TESTING.md updated with actual counts, other docs need verification

## Key Technical Context

### Project Structure (root level)
```
ai-signal-bot/     — Python trading bot (144 src, 155 tests)
exchange_simulator/ — Python WS exchange simulator
hft-trade-bot/     — C++20 HFT engine (SHM IPC, lock-free)
hft-executor/      — Rust order executor (FFI, tokio)
web-ui/            — React 18 frontend (289 components, 99 tests)
helm/ + deploy/    — K8s Helm charts + Docker Compose
terraform/         — IaC
monitoring/        — Prometheus, Alertmanager, Grafana
scripts/           — Build/deploy/CI scripts (27 files)
docs/              — 13 docs + 4 guides
```

### JavaScript/React (web-ui/)
- `useLocalStorage` hook returns `[value, setValue, remove]` — 3 values
- Test mocks must return 3 values: `(key, default) => { const [v, s] = useState(default); return [v, s, () => {}] }`
- `ui-helpers.js` re-exports from `ui-helpers.tsx` (migrated to TypeScript)
- `ui-helpers.tsx` exports: `pnlColor`, `pnlBg`, `sideColor`, `sideBg`, `statusColor`, `statusBg`, `statusIcon`, `ICONS`, `StatCard`, `Bar`, `Label`, `SectionTitle`, `WarningBanner`, `CLASS`
- Vitest uses `isolate: true` (changed from false — proper isolation between test files)
- `cn()` utility in `web-ui/src/utils/cn.js` for conditional Tailwind class merging
- Pre-commit hook is broken — always use `--no-verify`
- 289 React components, 6 hooks, 11 utils, 93 test files
- 289/289 components wrapped in `memo()` (3 error boundaries excluded — ChunkRetryBoundary, PanelErrorBoundary, TopErrorBoundary)
- Panel registry: `web-ui/src/panels/registry.js` — all panels must resolve
- Hooks: `useLocalStorage`, `useInterval`, `usePrevious` (+ 3 others)
- Utils: `ui-helpers.tsx`, `format.ts`, `patterns.ts`, `timeframes.ts`, `cn.js`, `mock-data/`

### Python (ai-signal-bot/)
- Python 3.12, asyncio, websockets, numpy, scipy (optional), scikit-learn (optional), LightGBM/XGBoost (optional)
- Ruff for linting (line-length=120), pytest for testing
- `pytest-asyncio` with `asyncio_mode = "auto"` in pyproject.toml
- All async methods must be awaited in tests — use `async def test_*` + `await`
- Use `AsyncMock` (not `MagicMock`) for mocking async methods
- DB: SQLite, `_get_conn()` method (not `_conn()` which is an attribute)
- `deque` doesn't support slicing — wrap with `list()` first
- Config: YAML in `ai-signal-bot/config/settings.yaml` → `SignalBotConfig` dataclass
- 144 Python source files across 15+ modules
- Modules: strategies/, risk/, backtesting/, technical_analysis/, signal_validation/, data_collection/, communication/, database/, ml/, portfolio/, monitoring/, observability/, research/, llm_engine/, notification/, networking/, utils/
- Signal class: direction, confidence, SL/TP, strategy name, reason, rr_ratio, is_actionable, to_dict()
- All strategies implement `analyze(symbol, candles) -> Signal`
- 50 symbols configured, 5m timeframe, 60s signal interval, paper trading by default
- Logging: `from src.observability.logging import get_logger` + `logger = get_logger(...)` (structlog)

### C++ / Rust
- hft-trade-bot: C++20, SHM IPC, lock-free queues, zero-allocation hot path, 1ms main loop
- hft-executor: Rust, tokio-tungstenite, FFI for C++, auto-reconnect
- Latency budget: Exchange → WS 2ms → Signal Bot → SHM 30us → C++ → FFI 1us → Rust → WS 0.5ms → Exchange
- Fast path: ~3.5ms signal to order
- Build: `build-all.bat` (Windows), Makefile (Linux)

### Exchange Simulator (exchange_simulator/)
- Python WebSocket server simulating 50 symbols across 3 exchanges
- GBM + jump diffusion price generation
- Order book simulation with bid/ask spreads
- Options chain generation
- Ports: WS :8765, HTTP metrics :8775
- Health endpoints: `/health`, `/live`, `/ready`, `/metrics`
- Graceful shutdown via SIGTERM/SIGINT
- Config: `shared_config.yaml` + exchange_simulator specific config
- Deprecated: `exchange_simulator/health.py` (use aiohttp endpoints instead), `exchange_simulator/metrics.py` (use `ws_prometheus.py`)

### Infrastructure
- 2 Helm charts (helm/ and deploy/) — need syncing
- Docker Compose: `docker-compose.yml`, `.staging.yml`, `.prod.yml`, `.hub.yml`
- Configs: `settings.yaml`, `settings.testnet.yaml`, `shared_config.yaml`, exchange_simulator config, hft-trade-bot config
- `.env.prod` + `.env.prod.example` — environment variables
- `Makefile` + `Makefile.prod` — build orchestration
- `build-all.bat`, `build-docker.bat`, `start.bat`, `docker.bat`, `verify.bat`, `ci-test.bat` — Windows scripts
- `start.sh`, `docker.sh`, `verify.sh`, `ci-test.sh`, `run-all-tests.sh` — Linux scripts
- `run_all_tests.py` — unified test runner
- `monitoring/` — Prometheus, Alertmanager, Grafana configs
- `terraform/` — IaC for cloud resources
- `scripts/` — 27 helper scripts
- GitHub Actions in `.github/`
- Pre-commit config in `.pre-commit-config.yaml` (hook broken — use `--no-verify`)
- 13 documentation files + 4 guides in `docs/` — ALL need regular updates
- Root docs: CHANGELOG.md (190KB, active), README.md, CONTRIBUTING.md, SECURITY.md, PROJECT_AUDIT.md

## Commit Convention
```
git add -A
git commit --no-verify -m "refactor: complete REF-XX..REF-YY" -m "- Brief description of changes"
```

## Pre-Commit Checklist (MANDATORY — do NOT run tests, just verify code)
1. Re-read every changed file to verify changes are correct and complete
2. Grep for broken imports (from src.deleted_module, import deleted_symbol)
3. Verify no syntax errors: check for unclosed brackets, missing colons, broken indentation
4. Verify all new imports actually exist in target modules
5. Check that deleted functions/classes are not referenced anywhere else
6. Verify tests still align with changed APIs (grep for function names in tests/)
7. Update office-board.md (mark tasks ✅ DONE, update progress summary)
8. Update CHANGELOG.md (add entry under [Unreleased])
9. Update relevant docs/ files (per Doc Update Protocol)
10. Update verification-plan.md if audit findings changed
11. Then commit with --no-verify

## When Stuck
- Search the codebase with grep/glob for relevant patterns
- Read test files to understand expected behavior
- Read docs/ to understand intended architecture
- Check existing implementations for patterns to follow
- Read CHANGELOG.md for context on previous changes
- Read CONTRIBUTING.md for code style guidelines
- Check `.github/` for CI workflows that reveal expected behavior
- Mark task as blocked (⛔) with reason and continue to next
- Do NOT guess — verify with code reading before making changes

## Error Handling Patterns
- **Component crash on render:** Usually missing prop or hook returns wrong shape. Check destructuring, add fallback/default values.
- **Import resolution failure:** Check file extension (.js vs .jsx vs .tsx), check export exists, check path.
- **Test fails after refactor:** Grep for old function/component name across all test files, update references.
- **Multiple elements match getByText:** Replace with `getAllByText(...)[0]` or `.find(el => el.tagName === 'BUTTON')`.
- **Timer test warning:** Wrap `vi.advanceTimersByTime()` in `act(() => { ... })`.
- **Python async test fails:** Ensure `await` on all async calls, use `AsyncMock` for async methods.
- **Circular import in Python:** Move import inside function, or split module, or use `from src.module.symbol import X` instead of `from src.module import X`.

## Code Style Guide

### Python (ai-signal-bot/ + exchange_simulator/)
- Follow PEP 8, use `ruff` for linting (line-length=120)
- `snake_case` for functions and variables
- `PascalCase` for classes
- One module per file
- Async methods: `async def` + `await`
- Logging: `from src.observability.logging import get_logger` + `logger = get_logger(__name__)`
- Config: `from src.config import load_config` or `from config import load_config`
- Tests: `async def test_*():` + `await`, `AsyncMock` for async mocks

### C++ (hft-trade-bot/)
- C++20 conventions
- `snake_case` for functions and variables
- `PascalCase` for classes and structs
- `UPPER_CASE` for constants
- `#pragma once` for header guards
- `NOMINMAX` before `windows.h` (prevents min/max macro conflicts)
- `#pragma pack(push, 1)` for IPC structs (must match Python `struct` layout)
- `/utf-8` compile option for MSVC

### JavaScript/React (web-ui/)
- `PascalCase` for component files (e.g. `MyComponent.jsx`)
- `camelCase` for functions and variables
- `useLocalStorage` for persistent state (returns 3 values)
- `memo()` wrap for all exported components
- Use `ui-helpers.tsx` components: `StatCard`, `Bar`, `Label`, `SectionTitle`, `WarningBanner`
- Use `cn()` from `utils/cn.js` for conditional Tailwind classes
- TailwindCSS dark/light theme: `bg-bg-800`, `text-gray-200`, etc.
- No `console.log` in production code (console.warn in error handlers is OK)
- No `dangerouslySetInnerHTML`

## Adding New Features (reference CONTRIBUTING.md)

### New Trading Strategy (Python)
1. Create `ai-signal-bot/src/strategies/my_strategy.py`
2. Implement `analyze(symbol, candles) -> Signal`
3. Add to ensemble voter in `run.py`
4. Write tests in `tests/test_my_strategy.py`
5. Add to backtest runner
6. Update `docs/TRADING_STRATEGIES.md`
7. Update CHANGELOG.md

### New Web UI Component (Sidebar Panel)
1. Create `web-ui/src/components/MyComponent.jsx`
2. Use `useWebSocket` / `useExchangeData` / `useSignalData` hooks for data
3. Follow TailwindCSS dark/light theme classes (`bg-bg-800`, `text-gray-200`)
4. Wrap in `memo()`
5. Register in `src/panels/registry.js` — add import + entry to PANELS array with `id`, `name`, `category`, `component`, `propsBuilder`
6. No changes needed in `App.jsx` — panel appears automatically in sidebar
7. Create test file `web-ui/src/test/myComponent.test.jsx`
8. Update `docs/WEB_UI.md`
9. Update CHANGELOG.md

### New Web UI Component (Core Layout)
1. Create `web-ui/src/components/MyComponent.jsx`
2. Import in `App.jsx` and add to layout or tab panel
3. Wrap in `memo()`
4. Update `docs/WEB_UI.md`
5. Update CHANGELOG.md

### New HFT Indicator (C++)
1. V1: Add function to `hft-trade-bot/src/strategies/signal_engine.h`
2. V2: Add inline class to `hft-trade-bot/src/strategies/signal_engine_v2.h`
3. Add vote/weight in `SignalEngine::analyze()` or `SignalEngineV2::analyze()`
4. Add test in `tests/test_signal_engine.cpp` or `tests/test_signal_engine_v2.cpp`
5. Rebuild with `cmake --build build`
6. Update `config/config.yaml` weights if needed
7. Update `docs/PERFORMANCE.md`
8. Update CHANGELOG.md

### New Risk Manager Feature (Python)
1. Add config field to `RiskConfig` in `ai-signal-bot/src/risk/risk_manager.py`
2. Implement check method (e.g. `_check_my_feature()`)
3. Call from `update()` method and add to actions dict
4. Write tests in `tests/test_risk_manager.py`
5. Integrate into backtester if applicable
6. Update `docs/RISK_MANAGEMENT.md`
7. Update CHANGELOG.md

### New WebSocket Message Type
1. Add to `docs/WEBSOCKET_PROTOCOL.md`
2. Implement sender side (Python or C++)
3. Implement receiver side
4. Add test
5. Update CHANGELOG.md

### New Chart Indicator (web-ui)
1. Add calculation function to `web-ui/src/utils/indicators.js`
2. Add line/area series in `CandleChart.jsx` using `chart.addLineSeries()`
3. Add toggle button to the indicator bar
4. Update data effect to calculate and set indicator data
5. Update CHANGELOG.md

## CI/CD Pipeline
GitHub Actions runs on every push/PR (`.github/workflows/`):
- **ci.yml** — 13 jobs: lint (ruff + clang-format + ESLint), test (pytest + ctest + vitest + Windows), build (Docker images + Vite bundle size), security (Bandit + CodeQL + npm audit), test count floors
- **codeql.yml** — GitHub code scanning for C++, Python, JavaScript
- **deploy.yml** — Deployment workflow
- **nightly-backtest.yml** — Nightly backtest run
- **release.yml** — Release workflow
- **dependabot.yml** — Dependency update automation
- **PR template:** `.github/PULL_REQUEST_TEMPLATE.md`
- **Issue templates:** `.github/ISSUE_TEMPLATE/` (3 templates)

CI checks that MUST pass:
- ruff (Python lint)
- ESLint (JS lint)
- clang-format (C++ lint)
- pytest (Python tests)
- ctest (C++ tests, gcc-13 + clang-17 + MSVC)
- vitest (JS tests)
- Bandit (Python security)
- CodeQL (all languages)
- npm audit (dependency vulnerabilities)
- Docker build (all 4 services)
- Vite bundle size check
- Test count floors (catches accidental test deletion)

## Performance Guidelines

### C++ Hot-Path (signal engine, order executor, SHM, risk manager)
- **No heap allocations** — use stack buffers, not `std::string` or `std::vector`
- **No exceptions** — mark functions `noexcept`, avoid `throw`
- **Branchless where possible** — `std::fmax(x, 0.0)` instead of `if (x > 0)`
- **`[[likely]]`/`[[unlikely]]`** — annotate branches for branch predictor
- **Precompute reciprocals** — `double inv = 1.0 / n;` then multiply
- **`memcpy` for bulk data** — not per-element loops
- **Cache-line align shared atomics** — `alignas(64)` to prevent false sharing
- **`acquire`/`release` memory ordering** — not `seq_cst`
- **Power-of-2 buffer sizes** — bitmask (`&`) instead of modulo (`%`)
- **Single-pass multi-level computation** — compute OBI 5/10/20 in one loop
- **`unordered_set` for existence checks** — O(1) not O(n) linear scan

### Python Hot-Path (broadcast loop, signal generation)
- Use `orjson.dumps()` / `orjson.loads()` instead of `json` when available
- Use `asyncio.gather()` for concurrent WebSocket sends
- Prefer `msgpack` for binary serialization
- Hoist loop-invariant computations outside loops
- Reuse computed arrays instead of recomputing
- Replace `uuid.uuid4()` with monotonic counters for session-scoped IDs
- Use `collections.deque(maxlen=N)` for fixed-size history buffers
- Use `dict`/`set` for O(1) lookups instead of linear `list` scans
- Cache `int(time.time())` once per tick

## Services & Ports
| Service | Port | Purpose |
|---------|------|---------|
| Web UI | http://localhost:3000 | React frontend (Vite dev) |
| Exchange Simulator | ws://localhost:8765 | WebSocket market data |
| Exchange Simulator Metrics | http://localhost:8775 | Health + Prometheus metrics |
| AI Signal Bot | ws://localhost:8766 | WebSocket signal feed |
| Prometheus | http://localhost:9090 | Metrics (Docker prod) |
| Grafana | http://localhost:3001 | Dashboards (Docker prod) |

## Database
- SQLite: `ai-signal-bot/data/trading.db`
- Tables: candles, signals, fills, positions, trades, session_stats
- Migrations: `ai-signal-bot/src/database/migrations/`
- Connection: `_get_conn()` method (not `_conn()` attribute)
- Production (Docker): PostgreSQL in `docker-compose.prod.yml`

## Key Config Values (ai-signal-bot/config/settings.yaml)
- 50 trading symbols (BTC/USDT through MINA/USDT)
- 5m timeframe, 60s signal interval
- Paper trading by default
- Risk: 2% per trade, 8% daily drawdown, 65% min confidence, 1.5 min R:R, 2% SL, 4% TP, 10% max position
- Ensemble: majority mode, min 2 votes
- Strategies enabled: trend, meanrev, fft, statarb, sentiment
- Strategies disabled: market_making, ml_ensemble

## Web UI Hooks Reference
- **`useLocalStorage`** — persistent state, returns `[value, setValue, remove]`, JSON serialization
- **`useWebSocket`** — WebSocket connections, reconnection, error recovery, message parsing
- **`useExchangeData`** — exchange data: snapshot, fills, arbitrage, replay, candle merge/sort, order submission
- **`useSignalData`** — signal history, single signal, regime, backtest callback
- **`useMockData`** — mock exchange data, mock signals, periodic updates, toggleReplay
- **`useKeyboardShortcuts`** — global shortcuts, modifier combos, auto-ignores input/select/textarea
- **`useDebounce`** — debounced value after delay (default 300ms)
- **`useMediaQuery`** — responsive design, `useIsMobile()`, `useIsTablet()`
- **`useInterval`** — polling, `useInterval(callback, delay)`
- **`usePrevious`** — previous value for comparison logic
- **`usePerformance`** — debounce, throttle, batched updates, worker, intersection observer
- **`useTradeJournal`** — save/get/delete notes, CSV export
- **`useDetachablePanels`** — detach, update, close, popup content
- **`useSoundAlerts`** — AudioContext, oscillator, enable/disable

## Test Counts (current)
- **web-ui:** 99 test files, 804+ tests (Vitest + @testing-library/react)
- **web-ui E2E:** 4 Playwright spec files (smoke, trading, mock-mode, screenshots)
- **ai-signal-bot:** 155 test files, 568+ tests (pytest)
- **exchange_simulator:** 36 test files, 579+ tests (pytest)
- **hft-trade-bot:** 29 doctest + 49 CTest files, 700+ test cases (ctest)
- **Total:** ~345 test files, ~2700+ tests across all languages

## Build System
- **Python:** `pip install -r requirements.txt` (per project)
- **JS:** `npm install` in `web-ui/`, Vite for dev/build
- **C++:** CMake + vcpkg (Windows) or system libs (Linux), `cmake --build build --config Release`
- **Rust:** Cargo in `hft-executor/`
- **Docker:** `docker-compose up` (dev), `docker-compose -f docker-compose.prod.yml up` (prod)
- **Windows one-command:** `install-deps.bat`, `start.bat`, `no-docker.bat`, `build-all.bat`
- **Linux one-command:** `no-docker.sh install`, `no-docker.sh start`, Makefile targets
- **Unified test runner:** `python run_all_tests.py`

## Task Categories Summary
- **REF-01..50** — ✅ DONE — DRY refactoring, UI centralization (StatCard, Bar, Label, SectionTitle, WarningBanner, cn(), CLASS)
- **REF-51..110** — ✅ DONE — JS test fixes (useLocalStorage mock, getByText→getAllByText, timer act() wraps)
- **REF-111..200** — ✅ DONE — Edge-case test coverage, performance optimization
- **REF-201..300** — ✅ DONE — Python type hints, docstrings, strategy tests
- **REF-301..400** — ✅ DONE — DevOps, Docker, Helm, documentation, security
- **REF-401..500** — ✅ DONE — UI/UX, tooling, ESLint, TypeScript migration
- **REF-501..520** — ✅ DONE — Static analysis bug fixes
- **REF-521..625** — ✅ DONE — Config, CI/CD, docs, test coverage

## Verification Plan Reference
See `.cascade/verification-plan.md` for:
1. Git & commit audit (uncommitted changes, unpushed commits)
2. JS test health (857 tests, flaky audit, coverage)
3. Python test health (pytest run, uncommitted fixes, TODO/FIXME count)
4. Component quality (memo, console.log, TODO/FIXME, long components, index keys)
5. Office board completeness
6. Documentation freshness (13 docs + 4 guides + root docs)
7. Configuration correctness (vitest, configs, Helm)
8. Security audit (XSS, localStorage, API keys)
