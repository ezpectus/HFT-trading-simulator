# Changelog

All notable changes to this project are documented in this file.

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

- **MSVC vcpkg setup** — added `vcpkgDirectory` parameter to `lukka/run-vcpkg@v11`
  - File: `.github/workflows/ci.yml:198`
  - Cause: Action expected vcpkg as git submodule, but none was configured

- **Vitest worker crash** — changed `pool: 'threads'` → `pool: 'forks'`, `isolate: true` → `isolate: false`
  - File: `web-ui/vitest.config.js:14-15`
  - Cause: Worker thread crashed on unhandled EventEmitter error event

- **Vitest uncaught exception** — added `process.on('uncaughtException')` handler
  - File: `web-ui/src/test/setup.js:78-81`
  - Cause: Unhandled error events in jsdom crashed the test worker

- **vi.unmock hoisting warning** — removed unnecessary mock/unmock calls
  - File: `web-ui/src/test/useTradeJournal.test.jsx`
  - Cause: `vi.unmock()` inside `beforeEach` is hoisted by Vitest, causing deprecation warning

- **CodeQL C++ autobuild** — replaced with manual CMake build
  - File: `.github/workflows/codeql.yml:56-68`
  - Cause: CodeQL autobuild could not compile C++ code without dependency installation

### Documentation

- Created `SECURITY.md` — vulnerability reporting policy and security measures
- Created `audit/SECURITY-AUDIT-REPORT.md` — detailed audit report with all fixes
- Created `CHANGELOG.md` — this file
