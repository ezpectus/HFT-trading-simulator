# Contributing

## Development Setup

### Prerequisites — Install These First

You need these tools before running any install scripts. Install them in order.

> **Important:** After installing each tool, **restart your terminal** so it appears in your PATH.

| # | Tool | Version | Why | How to install |
|---|------|---------|-----|----------------|
| 1 | Python | 3.12+ | Exchange Simulator + AI Signal Bot | https://python.org/downloads — check "Add to PATH" |
| 2 | Node.js | 20+ | Web UI (includes npm) | https://nodejs.org — LTS version |
| 3 | CMake | 3.16+ | C++ build system | https://cmake.org/download — Windows x64 Installer, check "Add to PATH" |
| 4 | C++ compiler | C++20 | HFT Trade Bot engine | See per-OS instructions below |
| 5 | vcpkg | latest | C++ libraries (Windows only) | See Windows setup below |

**Verify all tools are installed:**
```bat
python --version
npm --version
cmake --version
```
If any command says "not recognized" — that tool is not installed or not in PATH. Restart terminal first, then reinstall if needed.

---

## Windows Setup

### Step 1 — Install C++ Compiler

Download and install **Visual Studio Build Tools 2022**:
1. Go to https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Click **"Download Build Tools"**
3. Run the installer
4. Select workload: **"Desktop development with C++"** (check the checkbox)
5. Click **Install** — this downloads ~5 GB, wait for it to finish

### Step 2 — Install vcpkg + C++ Libraries

Open Command Prompt and run:
```bat
cd %USERPROFILE%\trading-system
git clone https://github.com/microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat
setx VCPKG_ROOT "%USERPROFILE%\trading-system\vcpkg"
```

**Restart your terminal**, then install C++ libraries:
```bat
vcpkg install boost-system boost-random openssl spdlog fmt nlohmann-json yaml-cpp
```

> This compiles all libraries from source. It takes 10-30 minutes. Wait for it to finish.

### Step 2b — Install websocketpp (header-only, not in vcpkg)

```bat
cd %USERPROFILE%\trading-system
git clone https://github.com/zaphoyd/websocketpp.git
```

> websocketpp is a header-only library. No build step needed — CMake finds it via `-DWEBSOCKETPP_INCLUDE_DIR`.

### Step 3 — Install Project Dependencies

**Option A — One command (recommended):**
```bat
cd %USERPROFILE%\trading-system
install-deps.bat
```
This installs Python packages, Node.js dependencies, and builds the C++ HFT Trade Bot.

**Option B — Manual (if the script fails):**
```bat
cd %USERPROFILE%\trading-system

REM 1. Python dependencies
cd exchange_simulator && pip install -r requirements.txt && cd ..
cd ai-signal-bot && pip install -r requirements.txt && cd ..

REM 2. Web UI dependencies
cd web-ui && npm install && cd ..

REM 3. C++ HFT Trade Bot
cd hft-trade-bot
if not exist build mkdir build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake -DWEBSOCKETPP_INCLUDE_DIR="%USERPROFILE%\trading-system\websocketpp"
cmake --build . --config Release -j
cd ..\..
```

### Step 4 — Start the System

```bat
cd %USERPROFILE%\trading-system

REM Option A: 4 service windows (no monitors)
no-docker.bat

REM Option B: 4 services + 4 CLI monitor windows
start.bat

REM Option C: Docker (all services containerized)
docker-compose up
```

Services will be available at:
- Web UI: http://localhost:3000
- Exchange Simulator: ws://localhost:8765
- AI Signal Bot: ws://localhost:8766

### npm Vulnerabilities

After `npm install` in `web-ui/`, you may see vulnerability warnings. These are **dev-server-only** issues in Vite (path traversal on local dev server) — they do **not** affect production builds or the running trading system. To check:
```bat
cd web-ui
npm audit
```

### MSVC Build Notes

The C++ engine compiles on both MSVC (Windows) and GCC/Clang (Linux/macOS). Key compatibility details:

- **Shared Memory**: Windows uses `CreateFileMappingW`/`MapViewOfFile` (page-file-backed). Linux uses `shm_open`/`mmap` (`/dev/shm`). All IPC headers auto-detect via `#ifdef _WIN32`.
- **Time Functions**: `localtime_r`/`gmtime_r` (POSIX) are replaced with `localtime_s`/`gmtime_s` (Windows) via platform guards.
- **Struct Packing**: `#pragma pack(push, 1)` ensures IPC message structs match Python `struct` layout on MSVC (which has different default padding than GCC).
- **Macro Pollution**: All `windows.h` includes are preceded by `#define NOMINMAX` to prevent `min`/`max` macro conflicts with `std::min`/`std::max`.
- **UTF-8 Paths**: `add_compile_options(/utf-8)` in CMakeLists.txt ensures MSVC handles non-ASCII characters in file paths.
- **vcpkg Libraries**: Required on Windows: `boost-system boost-random openssl spdlog fmt nlohmann-json yaml-cpp`

---

## Linux/macOS Setup

### Step 1 — Install Prerequisites

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip nodejs npm cmake g++ build-essential \
  libboost-dev libboost-system-dev libssl-dev libwebsocketpp-dev \
  libspdlog-dev libfmt-dev nlohmann-json3-dev libyaml-cpp-dev
```

**macOS (Homebrew):**
```bash
brew install python@3.12 node cmake boost openssl websocketpp spdlog fmt nlohmann-json yaml-cpp
```

### Step 2 — Install Project Dependencies

**Option A — One command (recommended):**
```bash
cd /path/to/trading-system
./no-docker.sh install
```

**Option B — Manual:**
```bash
cd /path/to/trading-system

# 1. Python dependencies
cd exchange_simulator && pip3 install -r requirements.txt && cd ..
cd ai-signal-bot && pip3 install -r requirements.txt && cd ..

# 2. Web UI dependencies
cd web-ui && npm install && cd ..

# 3. C++ HFT Trade Bot
cd hft-trade-bot && mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release -j
cd ../..
```

### Step 3 — Start the System

```bash
cd /path/to/trading-system

# Start all services
./no-docker.sh start

# Or with Docker
docker-compose up
```

---

## Linters (optional but recommended)

```bash
pip install ruff          # Python linter
cd web-ui && npm run lint # JS linter (MUST be in web-ui directory!)
```

For full setup instructions, see [docs/SETUP.md](docs/SETUP.md).

## Running Tests

```bash
# Exchange simulator tests
cd exchange_simulator
python -m pytest tests/ -v

# AI signal bot tests
cd ai-signal-bot
python -m pytest tests/ -v

# C++ signal engine tests (V1 + V2)
cd hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j$(nproc)
./test_signal_engine
./test_signal_engine_v2
ctest --output-on-failure
```

# Web UI tests
cd web-ui
npm test          # Vitest
npm run lint      # ESLint
npm run build     # Production build verification

## Running the System

**Windows — quick start (after `start.bat install`):**
```bat
REM Option A: 4 service windows (no monitors)
no-docker.bat

REM Option B: 4 services + 4 CLI monitor windows
start.bat

REM Option C: Docker (all services containerized)
docker-compose up
```

**Linux/macOS:**
```bash
# Start all components with Docker (includes Web UI)
docker-compose up
# Web UI available at http://localhost:3000

# Or run individually:
# 1. Exchange simulator
cd exchange_simulator
python -m exchange_simulator

# 2. AI Signal Bot
cd ai-signal-bot
python run.py --dashboard

# 3. HFT Trade Bot
cd hft-trade-bot/build
./hft_trade_bot config/config.yaml

# 4. Web UI (development mode)
cd web-ui
npm install
npm run dev
# Open http://localhost:3000
```

## Backtesting & Optimization

```bash
cd ai-signal-bot

# Run backtest with synthetic data
python run_backtest.py --candles 500

# Generate equity curve charts
python run_backtest.py --plot --output-dir charts/

# Optimize strategy parameters
python run_backtest.py --optimize

# Use historical data from SQLite
python run_backtest.py --db data/trading.db --symbol BTC/USDT
```

## Testing

### Web UI (Vitest + @testing-library/react)

```bash
cd web-ui
npx vitest run                    # Run all tests once
npx vitest run --coverage         # With coverage report
npx vitest                        # Watch mode
```

Test files are in `web-ui/src/test/`. Current coverage: 37 test files, 458+ tests covering:
- Component rendering and empty states (EmptyState, SignalFeed, BotStatus, FillsPanel)
- Form validation (OrderForm quantity/margin validation)
- Error boundaries (retry, auto-disable after 3+ errors)
- Loading skeletons and toast notifications (add/remove, auto-dismiss, clearAll)
- SignalFeed direction filter (All/Long/Short)
- ReplayControls (play/pause toggle, scrub slider, step buttons, debounce, conditional rendering)
- TradeTimeline (fill rendering, summary stats, filtering, edge cases)
- Watchlist (add/remove symbols, sort cycling, price/change display, interactions)
- PriceAlerts (add/remove alerts, above/below direction, trigger on price cross, sound toggle, distance display)
- FillsPanel (fill rendering, search filtering by symbol/side/exchange, stats summary, buy/sell ratio)
- AccountPanel (exchange leaderboard, sort cycling PnL/Win%/Balance, PnL coloring, recent trade bars, empty state, defaults)
- ConfidenceScorer (8-factor confidence model, empty state <15 candles, direction bias detection, recommendation messages, candle filtering by exchange/symbol)
- DrawdownAnalysis (max/current drawdown, duration, recoveries, underwater %, peak equity, recovery indicator, edge cases with missing pnl/timestamp)
- Hook tests: useWebSocket (reconnect, message handling), useDebounce (timer, cleanup), useLocalStorage (persistence, JSON, remove), useKeyboardShortcuts (combos, input ignoring, preventDefault), useMediaQuery (match, cleanup, re-subscribe), useSoundAlerts (AudioContext, oscillator, enable/disable), usePerformance (debounce, throttle, batched updates, worker, intersection observer), useTradeJournal (save/get/delete notes, CSV export), useDetachablePanels (detach, update, close, popup content for all panel types), useExchangeData (snapshot, fills, arbitrage, replay, candle merge/sort, order submission, toggleReplay), useSignalData (signal_history, single signal, regime, backtest callback), useMockData (mock exchange data, mock signals, periodic updates, toggleReplay, cleanup)

### Python (pytest)

```bash
cd exchange_simulator
python -m pytest tests/ -v --tb=short --cov=src --cov-report=xml

cd ai-signal-bot
python -m pytest tests/ -v --tb=short --cov=src --cov-report=xml
```

Exchange simulator: 18 test files, 579+ tests covering:
- Exchange order matching, fees, slippage, partial fills
- Market simulator: GBM price generation, correlation, funding history
- Liquidation engine: partial liquidation, insurance fund, SL/TP
- Depth snapshot API: cumulative volumes, spread, imbalance
- Funding rate logic: positive/negative rates, notifications
- Latency simulation: base latency, jitter, spikes, reconnection backoff
- Spread analytics: spread percentiles, slippage tracking, summary stats
- Arbitrage detection, config validation, data export
- WebSocket server, order book streaming, integration dataflow

AI signal bot: 25 test files, 568+ tests covering:
- Signal validation: confidence, R:R ratio, drawdown, position limits, cooldown
- Circuit breaker: closed/open/half-open states, failure threshold, recovery
- Metrics server: Prometheus format, counters, gauges, HTTP endpoint, server lifecycle
- Health aggregator: service checks (healthy/degraded/unhealthy), aggregation, HTTP handler
- SHM ring buffer: consumer validation, push/pop, bulk operations, capacity checks
- SHM signal producer: init, push_signal, push_signal_dict (direction/confidence/symbol mapping), bulk_push, close, context manager
- SHM fill consumer: init, try_pop, bulk_pop, pending, async polling loop, stop, close, context manager
- Alert system: rule add/remove/enable/disable, check_rules firing/cooldown, exception cooldown regression, history, stats
- Performance tracker: signal/trade recording, win rate, PnL/fee accumulation, signals per hour, summary dict
- Signal/Trade CSV loggers: file creation, header writing, append logging, no overwrite existing, no-directory path crash fix, nested directory creation
- FIX client: message parse/build round-trip, malformed tag crash fix, checksum/body length validation, session seq persistence
- Real exchange client: HMAC signing (Binance/OKX/Bybit), URL defaults, dataclass construction, dispatch routing
- Risk manager: trailing stop, breakeven, partial TP, max hold time
- Kelly criterion: half-Kelly, confidence-scaled, edge cases
- Strategies: trend following, mean reversion, ensemble voting
- FFT analysis: cycle detection, regime classification
- Backtesting: fee/slippage modeling, drawdown, Calmar ratio, walk-forward analysis, overfitting detection
- Signal publisher: broadcast, history, circuit breaker blocking, dict mutation regression, metrics recording
- Order book replay, portfolio optimizer, integration dataflow

### C++ (CTest)

```bash
cd hft-trade-bot/build
ctest --output-on-failure
```

Test files are in `hft-trade-bot/tests/`. Current coverage: 27 doctest test files (risk_manager, pressure_model, signal_engine, position_manager, momentum_breakout, market_making, statistical_arb, mean_reversion, smart_order_router, order_manager, latency_tracker, position_manager_v1, portfolio_risk, pre_trade_risk, position_manager_v2, candle_aggregator, trade_handler, order_book_manager, kill_switch, shm_heartbeat, shm_market_data, shm_bulk, adaptive_order_selector, system_monitor, order_type_selector, fix_message, signal_engine_v2) + 10 CTest-based test files, 680+ test cases covering:

### CI Pipeline

All tests run automatically on push/PR via GitHub Actions (`.github/workflows/ci.yml`):
- **Lint**: ruff (Python), clang-format (C++), ESLint (JS)
- **Test**: pytest (Python), ctest (C++), vitest (JS)
- **Build**: Docker images for all 4 services
- **Audit**: npm dependency vulnerability check

## Data Export

```bash
cd exchange_simulator

# Export all data to CSV
python -m exchange_simulator --export --export-dir data/exports

# Export to Parquet (requires pyarrow)
pip install pyarrow
python -m exchange_simulator --export --export-format parquet
```

## Code Style

- **Python:** Follow PEP 8, use `ruff` for linting
  ```bash
  ruff check .
  ```
- **C++:** Follow C++20 conventions
  - `snake_case` for functions and variables
  - `PascalCase` for classes and structs
  - `UPPER_CASE` for constants
  - Use `#pragma once` for header guards
- Keep files focused — one module per file
- Add tests for new features
- Use meaningful commit messages

### Web UI Hooks

- **`useLocalStorage`** — use for any state that should persist across page reloads. Returns `[value, setValue, remove]`. Handles JSON serialization automatically. Replaces manual `useState` + `useEffect` + `localStorage` patterns.
- **`useKeyboardShortcuts`** — use for global keyboard shortcuts. Pass a map of key → handler. Supports modifier combos (`ctrl+s`, `shift+1`). Auto-ignores input/select/textarea by default.
- **`useDebounce`** — use for search/filter inputs that trigger expensive operations. Returns debounced value after delay (default 300ms). Prevents excessive re-renders on rapid typing.
- **`useWebSocket`** — use for WebSocket connections. Handles reconnection, error recovery, and message parsing.
- **`useMediaQuery`** — use for responsive design. Provides `useIsMobile()` and `useIsTablet()` helpers.

## Project Structure

```
hft-trading-simulator/
├── exchange_simulator/           # Python: simulated crypto exchange
│   ├── exchange_simulator/        # Core package (14 modules)
│   ├── tests/                     # pytest tests
│   ├── config.yaml
│   ├── pyproject.toml             # ruff config
│   └── Dockerfile
├── ai-signal-bot/                # Python: AI signal generation
│   ├── src/                      # Source modules
│   │   ├── strategies/           # Trend, Mean Reversion, FFT, Ensemble
│   │   ├── technical_analysis/   # RSI, EMA, MACD, BB, ATR, ADX, VWAP
│   │   ├── communication/        # WebSocket client + signal publisher
│   │   ├── backtesting/          # Backtester, plotter, optimizer, order book replay
│   │   ├── risk/                 # Risk manager, Kelly position sizing
│   │   ├── signal_validation/    # Signal validator
│   │   ├── database/             # SQLite storage
│   │   └── monitoring/           # Performance tracking
│   ├── tests/                     # pytest tests
│   ├── run.py                    # Main entry point
│   ├── run_backtest.py           # Backtest runner
│   ├── config/settings.yaml
│   ├── pyproject.toml            # ruff config
│   └── Dockerfile
├── hft-trade-bot/                # C++20: HFT execution engine
│   ├── src/                      # Source headers
│   │   ├── core/                 # Main loop, config, logger
│   │   ├── strategies/           # Signal engine (6 indicators)
│   │   ├── communication/        # WebSocket receiver
│   │   ├── execution/            # Order executor, type selector
│   │   ├── risk/                 # Risk manager
│   │   ├── position/             # Position manager
│   │   └── data/                 # Data types
│   ├── tests/                    # C++ unit tests
│   ├── config/config.yaml
│   └── CMakeLists.txt
├── web-ui/                       # React 18: browser dashboard
│   ├── src/
│   │   ├── components/           # 201+ UI components (191+ registered panels)
│   │   ├── panels/               # Panel registry + container (ErrorBoundary + Suspense)
│   │   ├── hooks/                # WebSocket, exchange data, signals, theme, sound, detachable,
│   │   │                         #   useLocalStorage (generic persistence), useKeyboardShortcuts,
│   │   │                         #   useDebounce (search/filter), useMediaQuery (responsive)
│   │   └── utils/                # Indicators, performance, format, timeframes, patterns
│   ├── .env.example              # WebSocket URL + mock mode configuration
│   ├── netlify.toml              # Netlify deployment config
│   ├── eslint.config.js          # ESLint 9 flat config
│   ├── Dockerfile                # Multi-stage (node + nginx)
│   ├── nginx.conf
│   └── package.json
├── docs/                         # Documentation (8 files)
├── .github/                      # CI workflows + issue/PR templates
├── logs/                         # Timestamped log files (auto-created)
├── docker-compose.yml            # 4-service orchestration
├── shared_config.yaml            # Global settings
├── Makefile                      # install, dev, test, test-js, lint, build, docker, logs
├── install-deps.bat              # One-command dependency installer (Python + C++ + Node)
├── no-docker.bat                 # Start all 4 services without Docker (Windows)
├── start.bat / start.sh          # Quick-start scripts (8 windows: 4 services + 4 monitors)
└── .editorconfig
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture overview.

## Adding New Features

### New Trading Strategy (Python)
1. Create `ai-signal-bot/src/strategies/my_strategy.py`
2. Implement `analyze(symbol, candles) -> Signal`
3. Add to ensemble voter in `run.py`
4. Write tests in `tests/test_my_strategy.py`
5. Add to backtest runner

### New HFT Indicator (C++)
1. For V1: Add function to `hft-trade-bot/src/strategies/signal_engine.h`
2. For V2: Add inline class to `hft-trade-bot/src/strategies/signal_engine_v2.h`
3. Add vote/weight in `SignalEngine::analyze()` or `SignalEngineV2::analyze()`
4. Add test in `tests/test_signal_engine.cpp` or `tests/test_signal_engine_v2.cpp`
5. Rebuild with `cmake --build build`
6. Update `config/config.yaml` weights if needed

### New WebSocket Message Type
1. Add to [docs/WEBSOCKET_PROTOCOL.md](docs/WEBSOCKET_PROTOCOL.md)
2. Implement sender side (Python or C++)
3. Implement receiver side
4. Add test

### New Web UI Component (Sidebar Panel)
1. Create `web-ui/src/components/MyComponent.jsx`
2. Use `useWebSocket` / `useExchangeData` / `useSignalData` hooks for data
3. Follow TailwindCSS dark/light theme classes (`bg-bg-800`, `text-gray-200`, etc.)
4. Register in `src/panels/registry.js` — add import + entry to PANELS array with `id`, `name`, `category`, `component`, `propsBuilder`
5. No changes needed in `App.jsx` — panel appears automatically in sidebar
6. Test in browser with `npm run dev`

### New Web UI Component (Core Layout)
1. Create `web-ui/src/components/MyComponent.jsx`
2. Import in `App.jsx` and add to layout or tab panel
3. Test in browser with `npm run dev`

### New Chart Indicator
1. Add calculation function to `web-ui/src/utils/indicators.js`
2. Add line/area series in `CandleChart.jsx` using `chart.addLineSeries()`
3. Add toggle button to the indicator bar
4. Update data effect to calculate and set indicator data

### New Risk Manager Feature
1. Add config field to `RiskConfig` in `ai-signal-bot/src/risk/risk_manager.py`
2. Implement check method (e.g. `_check_my_feature()`)
3. Call from `update()` method and add to actions dict
4. Write tests in `tests/test_risk_manager.py`
5. Integrate into backtester if applicable

### New Exchange Simulator Feature
1. Add config fields to `exchange_simulator/config.yaml`
2. Implement in appropriate module (`exchange.py`, `market_simulator.py`, etc.)
3. Add validation to `config_validator.py`
4. Write tests in `exchange_simulator/tests/`
5. Update `docs/EXCHANGE_SIMULATOR.md` if needed

## Pull Requests

1. Create a feature branch from `main`
2. Write tests for your changes
3. Ensure all tests pass:
   - `python -m pytest tests/ -v` (Python)
   - `./test_signal_engine` (C++)
4. Run linter: `ruff check .`
5. Update documentation if needed
6. Submit a pull request with a clear description

## CI Pipeline

GitHub Actions runs on every push/PR (4 jobs):
- **Python:** ruff lint + pytest for exchange_simulator and ai-signal-bot
- **C++:** cmake build + V1/V2 unit tests + clang-format check
- **JS:** npm install + ESLint + Vitest + vite build
- **Docker:** docker-compose build verification

Log files are uploaded as artifacts after each run.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

See [LICENSE](LICENSE) for details. This project is for educational purposes only — attribution required for forks and derivatives.
