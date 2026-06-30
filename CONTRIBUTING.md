# Contributing

## Development Setup

### Prerequisites
- Python 3.12+
- Node.js 20+ (for web-ui)
- C++20 compiler (GCC 10+, Clang 12+, or MSVC 19.29+)
- CMake 3.16+
- Boost, OpenSSL, websocketpp, spdlog, fmt, nlohmann_json, yaml-cpp

### Install Dependencies

**Python components:**
```bash
cd exchange-simulator && pip install -r requirements.txt && cd ..
cd ai-signal-bot && pip install -r requirements.txt && cd ..
```

**Web UI:**
```bash
cd web-ui && npm install && cd ..
```

**C++ component (Ubuntu):**
```bash
sudo apt-get install cmake \
  libboost-dev libboost-system-dev \
  libssl-dev libwebsocketpp-dev \
  libspdlog-dev libfmt-dev \
  nlohmann-json3-dev libyaml-cpp-dev
```

For full setup instructions, see [docs/SETUP.md](docs/SETUP.md).

## Running Tests

```bash
# Exchange simulator tests
cd exchange-simulator
python -m pytest tests/ -v

# AI signal bot tests
cd ai-signal-bot
python -m pytest tests/ -v

# C++ signal engine tests
cd hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j$(nproc)
./test_signal_engine
ctest --output-on-failure
```

## Running the System

```bash
# Start all components with Docker (includes Web UI)
docker-compose up
# Web UI available at http://localhost:3000

# Or run individually:
# 1. Exchange simulator
cd exchange-simulator
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

## Data Export

```bash
cd exchange-simulator

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

## Project Structure

```
crypto-trading-simulator/
├── exchange-simulator/           # Python: simulated crypto exchange
│   ├── exchange_simulator/        # Core package (9 modules)
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
│   │   ├── components/           # 90+ UI components
│   │   ├── panels/               # Panel registry + container
│   │   ├── hooks/                # WebSocket, exchange data, theme, sound, etc.
│   │   └── utils/                # Indicators, performance, format, timeframes, patterns
│   ├── .env.example              # WebSocket URL configuration
│   ├── Dockerfile                # Multi-stage (node + nginx)
│   ├── nginx.conf
│   └── package.json
├── docs/                         # Documentation (10 files)
├── .github/                      # CI templates + workflows
├── docker-compose.yml            # 4-service orchestration
├── shared_config.yaml            # Global settings
├── Makefile                      # install, dev, test, lint, build, docker
├── start.bat / start.sh          # Quick-start scripts
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
1. Add function to `hft-trade-bot/src/strategies/signal_engine.h`
2. Add vote in `SignalEngine::analyze()`
3. Add test in `tests/test_signal_engine.cpp`
4. Rebuild with `cmake --build build`

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
1. Add config fields to `exchange-simulator/config.yaml`
2. Implement in appropriate module (`exchange.py`, `market_simulator.py`, etc.)
3. Add validation to `config_validator.py`
4. Write tests in `exchange-simulator/tests/`
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

GitHub Actions runs on every push/PR:
- Python tests for exchange-simulator and ai-signal-bot (pytest + pytest-asyncio)
- C++ build and unit tests for hft-trade-bot
- Web UI build (npm install + vite build)
- Linting with ruff
- Docker image build verification

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
