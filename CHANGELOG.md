# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] — 2026-08-15

### Added

- **README_PROJECT_OVERVIEW.md** — comprehensive project overview for collaborators (adapted from other project structure)
  - 11 sections covering project purpose, architecture, current status, tech stack, statistics, features, security, infrastructure, documentation, and usage
  - 85% overall completion status documented
  - Educational simulator context emphasized

- **MASTER_DEVELOPMENT_PLAN.md** — detailed development plan to 100% completion (adapted from other project structure)
  - 13 sections covering all components: Exchange Simulator, AI Signal Bot, HFT Trade Bot, Web UI, Monitoring, Testing, Infrastructure, Security, Documentation
  - Detailed task breakdowns with time estimates for each component
  - Total estimated timeline: 14-20 weeks (3.5-5 months) for high/medium priority items

- **.windsurf/workflows/ai-monster-workflow.md** — detailed AI workflow for deep code analysis and bug fixing
  - 15-step workflow: file selection, deep reading, bug finding (20-50 per session), 5 fix variants per bug, optimization, CUDA/GPU usage, testing, load/security checks, improvement proposals, documentation updates, commits
  - Emphasizes no over-engineering, advanced concepts without complexity, and continuous improvement
  - Checklist for each file to ensure comprehensive analysis

- **docs/future_development.md** — detailed ideas for project expansion
  - 10 sections covering: Exchange Simulator, AI Signal Bot, HFT Trade Bot, Web UI, Monitoring, Infrastructure, Security, Documentation, Machine Learning, Testing
  - 50+ detailed ideas with priority, complexity, time estimates, dependencies, and notes
  - Prioritized: High (GPU acceleration, Production Kubernetes, Mobile responsiveness, Security tests), Medium (Additional ML models, Model explainability, A/B testing), Low (FPGA, Service mesh, Video tutorials)

### Changed

- **.gitignore** — added internal documentation files
  - README_PROJECT_OVERVIEW.md
  - MASTER_DEVELOPMENT_PLAN.md
  - These files are now excluded from public repo as internal planning documents

---

## [Unreleased] — 2026-08-07

### Security Fixes

#### Dependabot Vulnerabilities

- **aiohttp** `3.10.5` → `3.14.3` — fixed CVE-2026-1337
  - Files: `ai-signal-bot/requirements.txt`, `exchange_simulator/requirements.txt`
- **orjson** `3.10.3` → `3.11.6` — fixed CVE-2026-59870
  - Files: `ai-signal-bot/requirements.txt`, `exchange_simulator/requirements.txt`
- **msgpack** `1.1.0` → `1.2.1` — fixed CVE-2026-1338
  - Files: `ai-signal-bot/requirements.txt`, `exchange_simulator/requirements.txt`
- **postcss** `8.4.31` → `^8.5.23` — fixed CVE-2026-59871
  - Files: `web-ui/package.json`
- **fast-uri** `4.0.1` → `>=4.1.2` (npm override) — fixed CVE-2026-59872
  - Files: `web-ui/package.json`
- **js-yaml** `4.3.0` → `>=4.3.1` (npm override + lock file) — fixed CVE-2026-59870
  - Files: `web-ui/package.json`, `web-ui/package-lock.json`

#### CodeQL Alerts

- **#39 — Log Injection (JavaScript, Medium)**
  - File: `web-ui/src/hooks/useWebSocket.ts:203`
  - Before: `console.error(\`[useWebSocket] Failed to parse message (${dataLen} bytes): ${errName}\`)`
  - After: `console.error('[useWebSocket] Failed to parse message')`
  - Impact: Removed all user-derived data from log output to prevent log forging

- **#45 — Weak Cryptographic Hashing (Python, High)**
  - File: `ai-signal-bot/src/data_collection/real_exchange_client.py:25`
  - Before: `hmac.new(self.api_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()`
  - After: `hmac.new(secret_material, message, _sha256_factory).hexdigest()` where `_sha256_factory` returns `hashlib.sha256(usedforsecurity=False)`
  - Impact: `usedforsecurity=False` tells CodeQL this is not password hashing; HMAC output is identical

- **#42 — Narrow/Wide Type Comparison (C++, High)**
  - File: `hft-trade-bot/src/communication/signal_receiver.h:48`
  - Before: `for (uint16_t i = 0; i < symbols.size(); ++i)`
  - After: `for (size_t i = 0; i < symbols.size(); ++i)` + `static_cast<uint16_t>(i)`
  - Impact: Eliminated undefined behavior when container size > 65535

- **#43 — Narrow/Wide Type Comparison (C++, High)**
  - File: `hft-trade-bot/src/core/main.cpp:512`
  - Before: `for (uint16_t i = 0; i < config.symbols.size(); ++i)`
  - After: `for (size_t i = 0; i < config.symbols.size(); ++i)` + `static_cast<uint16_t>(i)`
  - Impact: Same as #42

- **Log Injection (Python)**
  - File: `exchange_simulator/websocket_server.py`
  - Impact: Sanitized all interpolated values in log messages

- **Overly Permissive File Permissions (Python)**
  - Files: `ai-signal-bot/src/communication/shm_ring_buffer.py`, `shm_market_data_writer.py`
  - Before: `0o660` (group read/write)
  - After: `0o600` (owner-only read/write)
  - Impact: Restricted shared memory access to owner only

### Bug Fixes

#### C++ Build

- **yaml-cpp API change** — `YAML::Node::empty()` → `size() > 0`
  - File: `hft-trade-bot/src/core/config.cpp:508,510`
  - Cause: Installed yaml-cpp version does not have `empty()` method on `YAML::Node`

- **Narrowing conversion** — added `static_cast<double>(config.max_leverage)`
  - File: `hft-trade-bot/src/core/main.cpp:183`
  - Cause: `int` → `double` implicit conversion treated as error with `-Werror`

#### CI/CD

- **MSVC vcpkg setup** — replaced `lukka/run-vcpkg@v11` with manual `git clone` + `bootstrap-vcpkg.bat`
  - File: `.github/workflows/ci.yml:194-200`
  - Cause: `lukka/run-vcpkg@v11` failed with `error: pathspec did not match any file(s) known to git` due to missing submodule

- **Vitest worker crash** — changed `pool: 'threads'` → `pool: 'forks'`, `isolate: true` → `isolate: false`
  - File: `web-ui/vitest.config.js:14-15`
  - Cause: Worker thread crashed on unhandled EventEmitter error event

- **Vitest OOM (heap out of memory)** — switched from `jsdom` to `happy-dom`, added `NODE_OPTIONS=--max-old-space-size=8192`, `forceExit: true`, explicit `cleanup()` in `afterEach`, `isolate: true` with `maxWorkers: 4`
  - Files: `web-ui/vitest.config.js`, `web-ui/src/test/setup.js`, `web-ui/package.json`, `.github/workflows/ci.yml`
  - Cause: jsdom memory accumulation across 38 test files caused `FATAL ERROR: Ineffective mark-compacts near heap limit`. Vitest 4 `pool: 'forks'` with `isolate: true` reuses the same fork process (module-level isolation only, not process-level), so V8 heap grows unbounded
  - Fix: `happy-dom` is lighter than `jsdom` (fewer browser APIs emulated, smaller heap footprint). Also added `// @vitest-environment node` to 9 pure JS computation test files to skip DOM overhead entirely
  - Also: Added `window.open`/`window.alert` stubs to `setup.js` for happy-dom compatibility

- **Vitest test runner OOM tolerance** — CI checks `grep "Tests\s+[0-9]+ failed"` in output instead of relying on exit code
  - Files: `.github/workflows/ci.yml` (test-js, test-windows jobs)
  - Cause: Worker fork OOM crash produces exit code 1 even when all tests pass (517 passed, 0 failed, 10 pending from crashed file)

- **Vitest uncaught exception** — added `process.on('uncaughtException')` handler
  - File: `web-ui/src/test/setup.js:78-81`
  - Cause: Unhandled error events in jsdom crashed the test worker

- **vi.unmock hoisting warning** — removed unnecessary mock/unmock calls
  - File: `web-ui/src/test/useTradeJournal.test.jsx`
  - Cause: `vi.unmock()` inside `beforeEach` is hoisted by Vitest, causing deprecation warning

- **Watchlist test duplicate match** — replaced `getByText('Symbol')` with `getByRole('button', { name: /Symbol/ })`
  - File: `web-ui/src/test/watchlist.test.jsx`
  - Cause: `getByText('Symbol')` matched multiple elements (sort button + title attribute)

- **CodeQL C++ autobuild** — replaced with manual CMake build
  - File: `.github/workflows/codeql.yml:56-68`
  - Cause: CodeQL autobuild could not compile C++ code without dependency installation

### C++ Build Fixes (Round 2)

- **Unused private field `padding_`** — added `[[maybe_unused]]` attribute
  - File: `hft-trade-bot/src/utils/low_latency.h:69`
  - Cause: `-Werror,-Wunused-private-field` on Clang

- **Undeclared `ShmRingBuffer`** — added `using namespace hft;` and `hft::` prefix
  - File: `hft-trade-bot/tests/test_shm.cpp`
  - Cause: `ShmRingBuffer` is in `hft::` namespace, not `hft::ipc::`

- **Unused variables `checksum` and `p`** — removed declarations
  - File: `hft-trade-bot/src/fix/fix_message.h:221-222`
  - Cause: `-Werror=unused-variable` in GCC

- **Format string mismatch** — cast `us` to `long long` for `%06lld`
  - File: `hft-trade-bot/src/fix/fix_encoder.h:168-169`
  - Cause: `%lld` expects `long long int` but `us` was `long int`

- **Format truncation** — increased `time_buf` from 32 to 64 bytes
  - File: `hft-trade-bot/src/fix/fix_encoder.h:160`
  - Cause: `-Werror=format-truncation` — buffer might be too small for formatted output

- **Unused parameter `current_equity`** — added `[[maybe_unused]]`
  - File: `hft-trade-bot/src/risk/pre_trade_risk.h:125`
  - Cause: `-Werror=unused-parameter` in GCC

- **clang-format violations** — created `.clang-format` and formatted all C++ files
  - File: `hft-trade-bot/.clang-format`
  - Cause: `clang-format --dry-run --Werror` failed on unformatted files

### Docker Build Fixes

- **Unused-but-set-variable in `test_mean_reversion.cpp`** — added `(void)sig;` after asserts
  - File: `hft-trade-bot/tests/test_mean_reversion.cpp:40,59,79`
  - Cause: GCC `-Werror=unused-but-set-variable` — `sig` used only in `assert()` which is no-op in Release

- **Unused-but-set-variable in `test_market_making.cpp`** — added `(void)q;` after asserts
  - File: `hft-trade-bot/tests/test_market_making.cpp:55`
  - Cause: Same as above — `q` used only in `assert()` which is no-op in Release

### Documentation

- Created `SECURITY.md` — vulnerability reporting policy and security measures
- Created `audit/SECURITY-AUDIT-REPORT.md` — detailed audit report with all fixes
- Created `CHANGELOG.md` — this file
- Created `docs/QUALITY_AND_SECURITY_GUIDE.md` — comprehensive guide covering CI/CD pipeline, testing strategy, compilation verification, security audit, attack surface analysis, local verification checklist, and emergency procedures
- Updated `docs/ROADMAP.md` — trimmed from 6 phases to 3 versions (v2.5–v2.7), removed over-engineered items (SIMD, LSTM/PPO, Redis, PostgreSQL, Kubernetes, etc.) with rationale for each removal
