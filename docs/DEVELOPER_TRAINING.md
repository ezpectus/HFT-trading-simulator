# Developer Training Guide

This guide provides comprehensive training for developers working on the HFT Trading System.

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Architecture Overview](#architecture-overview)
3. [Component Development](#component-development)
4. [Testing](#testing)
5. [Code Style and Standards](#code-style-and-standards)
6. [Debugging](#debugging)
7. [Performance Optimization](#performance-optimization)
8. [Contributing](#contributing)

## Development Environment Setup

### Prerequisites

**System Requirements:**
- Operating System: Linux (Ubuntu 20.04+) or Windows 10+
- Python: 3.10+
- Node.js: 18+
- C++ Compiler: GCC 10+ or Clang 12+ with C++20 support
- Docker: 20.10+ (optional but recommended)
- Git

**IDE Recommendations:**
- Python: VS Code, PyCharm
- C++: VS Code, CLion
- JavaScript/React: VS Code, WebStorm

### Repository Setup

```bash
# Clone repository
git clone https://github.com/your-org/hft-trade-bot.git
cd hft-trade-bot

# Install Python dependencies
pip install -r exchange_simulator/requirements.txt
pip install -r ai-signal-bot/requirements.txt

# Install Node.js dependencies
cd web-ui
npm install
cd ..

# Build C++ components
cd hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
make -j$(nproc)
cd ../..
```

### Development Tools

**Python:**
```bash
# Install development tools
pip install black ruff mypy pytest pytest-cov

# Format code
black exchange_simulator/
ruff check exchange_simulator/

# Type checking
mypy exchange_simulator/
```

**C++:**
```bash
# Install clang-format
sudo apt-get install clang-format

# Format code
clang-format -i hft-trade-bot/src/**/*.cpp
```

**JavaScript:**
```bash
# Format code
cd web-ui
npm run format

# Lint
npm run lint
```

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Web UI                              │
│                    (React + Vite)                          │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  Exchange Simulator                         │
│                     (Python)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Price Feed   │  │ Order Book   │  │ Audit Logger │    │
│  │   Manager    │  │   Manager    │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  AI Signal Bot                              │
│                     (Python)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Signal       │  │ Strategy    │  │ Risk         │    │
│  │   Engine     │  │   Manager    │  │   Manager    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└────────────────────┬────────────────────────────────────────┘
                     │ SHM
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  HFT Trade Bot                               │
│                     (C++20)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Signal       │  │ Order        │  │ Risk         │    │
│  │   Engine V2  │  │   Manager    │  │   Manager    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key Directories

```
hft-trade-bot/
├── exchange_simulator/     # Python exchange simulator
│   ├── exchange.py         # Main exchange logic
│   ├── models.py           # Data models
│   ├── audit_logger.py     # Audit logging
│   ├── price_feed_manager.py # Price feed integration
│   └── tests/              # Unit tests
├── ai-signal-bot/          # Python AI signal bot
│   ├── strategies/         # Trading strategies
│   ├── signal_engine.py    # Signal generation
│   └── tests/              # Unit tests
├── hft-trade-bot/          # C++20 HFT engine
│   ├── src/
│   │   ├── core/           # Core components
│   │   ├── strategies/     # Trading strategies
│   │   ├── execution/      # Order execution
│   │   └── ipc/            # Inter-process communication
│   └── tests/              # Unit tests
├── web-ui/                 # React web dashboard
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── panels/          # Dashboard panels
│   │   ├── hooks/          # Custom hooks
│   │   └── utils/          # Utilities
│   └── tests/              # Unit tests
├── docs/                   # Documentation
├── scripts/                # Utility scripts
└── shared_config.yaml      # Global configuration
```

## Component Development

### Exchange Simulator (Python)

**Adding a New Order Type:**

1. **Define Order Model** (`exchange_simulator/models.py`):
```python
@dataclass
class NewOrderType(Order):
    """New order type implementation."""
    custom_field: float
    
    def execute(self, exchange: SimulatedExchange) -> Order:
        """Execute the order."""
        # Custom execution logic
        pass
```

2. **Add to OrderType Enum**:
```python
class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    NEW_ORDER_TYPE = "new_order_type"
```

3. **Update Order Submission** (`exchange_simulator/exchange.py`):
```python
def submit_order(self, order_type: OrderType, **kwargs):
    if order_type == OrderType.NEW_ORDER_TYPE:
        order = NewOrderType(**kwargs)
    # ... existing logic
```

4. **Write Tests** (`exchange_simulator/tests/test_new_order_type.py`):
```python
def test_new_order_type():
    order = NewOrderType(
        id="test_001",
        symbol="BTC/USDT",
        # ... other fields
        custom_field=1.0
    )
    assert order.custom_field == 1.0
```

**Adding a New Audit Event:**

1. **Add to AuditEventType Enum** (`exchange_simulator/models.py`):
```python
class AuditEventType(Enum):
    ORDER_SUBMITTED = "order_submitted"
    NEW_EVENT = "new_event"
```

2. **Log the Event**:
```python
self._audit_logger.log(
    event_type=AuditEventType.NEW_EVENT,
    exchange=self.exchange_id,
    symbol=symbol,
    metadata={"key": "value"},
)
```

### AI Signal Bot (Python)

**Adding a New Strategy:**

1. **Create Strategy File** (`ai-signal-bot/strategies/new_strategy.py`):
```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class NewStrategy:
    """New trading strategy."""
    
    def generate_signal(self, candles: list) -> Optional[Signal]:
        """Generate trading signal."""
        # Strategy logic
        pass
```

2. **Register Strategy** (`ai-signal-bot/config/settings.yaml`):
```yaml
strategies:
  new_strategy:
    enabled: true
    param1: 10
    param2: 0.5
```

3. **Integrate in Signal Engine**:
```python
from strategies.new_strategy import NewStrategy

class SignalEngine:
    def __init__(self):
        self.new_strategy = NewStrategy()
    
    def generate_signals(self):
        if self.config["strategies"]["new_strategy"]["enabled"]:
            signal = self.new_strategy.generate_signal(candles)
```

### HFT Trade Bot (C++)

**Adding a New Strategy:**

1. **Create Strategy Header** (`hft-trade-bot/src/strategies/new_strategy.h`):
```cpp
#pragma once
#include "signal.h"

class NewStrategy {
public:
    NewStrategy(const Config& config);
    Signal generateSignal(const MarketData& data);
    
private:
    Config config_;
};
```

2. **Implement Strategy** (`hft-trade-bot/src/strategies/new_strategy.cpp`):
```cpp
#include "new_strategy.h"

Signal NewStrategy::generateSignal(const MarketData& data) {
    // Strategy logic
    return Signal{};
}
```

3. **Update CMakeLists.txt**:
```cmake
add_library(new_strategy
    src/strategies/new_strategy.cpp
)
target_link_libraries(new_strategy PRIVATE core)
```

4. **Register in Config** (`hft-trade-bot/config/config.yaml`):
```yaml
strategies:
  new_strategy:
    enabled: true
    param1: 10
```

### Web UI (React)

**Adding a New Panel:**

1. **Create Panel Component** (`web-ui/src/panels/NewPanel.jsx`):
```jsx
import React, { useState, useEffect } from 'react'
import { useExchangeData } from '../hooks/useExchangeData'

export function NewPanel({ symbol }) {
  const { candles } = useExchangeData(symbol)
  
  return (
    <div className="panel">
      <h3>New Panel</h3>
      {/* Panel content */}
    </div>
  )
}
```

2. **Register Panel** (`web-ui/src/panels/registry.js`):
```javascript
import { NewPanel } from './NewPanel'

export const PANELS = [
  // ... existing panels
  {
    id: 'new-panel',
    name: 'New Panel',
    category: 'custom',
    component: NewPanel,
  },
]
```

3. **Add to Navigation** (`web-ui/src/App.jsx`):
```javascript
const PANEL_CATEGORIES = {
  // ... existing categories
  custom: {
    name: 'Custom',
    panels: ['new-panel'],
  },
}
```

## Testing

### Python Testing

**Running Tests:**
```bash
# Run all tests
pytest exchange_simulator/tests/

# Run specific test file
pytest exchange_simulator/tests/test_models.py

# Run with coverage
pytest --cov=exchange_simulator exchange_simulator/tests/

# Run with verbose output
pytest -v exchange_simulator/tests/
```

**Writing Tests:**
```python
import pytest
from exchange_simulator.models import Order, OrderType, Side

def test_order_creation():
    order = Order(
        id="test_001",
        symbol="BTC/USDT",
        exchange="binance",
        side=Side.BUY,
        order_type=OrderType.MARKET,
        quantity=0.1,
    )
    assert order.id == "test_001"
    assert order.symbol == "BTC/USDT"
```

### C++ Testing

**Running Tests:**
```bash
# Build tests
cd hft-trade-bot/build
cmake .. -DBUILD_TESTING=ON
make

# Run tests
ctest --verbose

# Run specific test
./tests/test_signal_engine
```

**Writing Tests:**
```cpp
#include <gtest/gtest.h>
#include "signal.h"

TEST(SignalTest, Creation) {
    Signal signal;
    signal.symbol_id = 0;  // BTC
    signal.action = 1;     // LONG
    signal.confidence = 0.8;
    
    EXPECT_EQ(signal.symbol_id, 0);
    EXPECT_EQ(signal.action, 1);
    EXPECT_FLOAT_EQ(signal.confidence, 0.8);
}
```

### JavaScript Testing

**Running Tests:**
```bash
cd web-ui
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test NewPanel.test.jsx
```

**Writing Tests:**
```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewPanel } from '../panels/NewPanel'

describe('NewPanel', () => {
  it('renders panel title', () => {
    render(<NewPanel symbol="BTC/USDT" />)
    expect(screen.getByText('New Panel')).toBeInTheDocument()
  })
})
```

## Code Style and Standards

### Python (PEP 8)

**Formatting:**
```bash
black exchange_simulator/
```

**Linting:**
```bash
ruff check exchange_simulator/
```

**Type Hints:**
```python
from typing import List, Optional

def process_orders(orders: List[Order]) -> Optional[Order]:
    """Process a list of orders."""
    pass
```

### C++ (Google Style)

**Formatting:**
```bash
clang-format -i hft-trade-bot/src/**/*.cpp
```

**Naming Conventions:**
- Classes: PascalCase (e.g., `SignalEngine`)
- Functions: PascalCase (e.g., `GenerateSignal`)
- Variables: snake_case (e.g., `order_count`)
- Constants: kPascalCase (e.g., `kMaxOrders`)

### JavaScript (Airbnb Style)

**Formatting:**
```bash
cd web-ui
npm run format
```

**Linting:**
```bash
npm run lint
```

**Naming Conventions:**
- Components: PascalCase (e.g., `NewPanel`)
- Functions: camelCase (e.g., `generateSignal`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_ORDERS`)

## Debugging

### Python Debugging

**Using pdb:**
```python
import pdb; pdb.set_trace()
```

**Using VS Code:**
1. Set breakpoints in code
2. Press F5 to start debugging
3. Use debug console to inspect variables

**Logging:**
```python
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

logger.debug("Debug message")
logger.info("Info message")
logger.error("Error message")
```

### C++ Debugging

**Using GDB:**
```bash
gdb ./hft_trade_bot
(gdb) break main
(gdb) run
(gdb) print variable
(gdb) continue
```

**Using VS Code:**
1. Configure `.vscode/launch.json`
2. Set breakpoints
3. Press F5 to start debugging

**Logging:**
```cpp
#include <spdlog/spdlog.h>

spdlog::info("Info message");
spdlog::debug("Debug message");
spdlog::error("Error message");
```

### JavaScript Debugging

**Using Browser DevTools:**
1. Open DevTools (F12)
2. Set breakpoints in Sources
3. Use Console to inspect variables

**Using VS Code:**
1. Set breakpoints in code
2. Press F5 to start debugging
3. Use debug console

**Logging:**
```javascript
console.log('Info message')
console.debug('Debug message')
console.error('Error message')
```

## Performance Optimization

### Python Performance

**Profiling:**
```bash
python -m cProfile -s time exchange_simulator/exchange.py
```

**Optimization Tips:**
- Use list comprehensions instead of loops
- Use built-in functions (map, filter)
- Avoid unnecessary object creation
- Use `__slots__` for dataclasses with many instances

### C++ Performance

**Profiling:**
```bash
perf record ./hft_trade_bot
perf report
```

**Optimization Tips:**
- Use `const` and `constexpr` where possible
- Pass large objects by reference
- Use move semantics
- Optimize hot paths
- Use SIMD for vector operations

### JavaScript Performance

**Profiling:**
1. Open Chrome DevTools
2. Go to Performance tab
3. Record and analyze

**Optimization Tips:**
- Use React.memo for component memoization
- Use useMemo/useCallback for expensive computations
- Virtualize long lists
- Lazy load components
- Avoid unnecessary re-renders

## Contributing

### Workflow

1. **Create Branch:**
```bash
git checkout -b feature/new-feature
```

2. **Make Changes:**
- Write code
- Add tests
- Update documentation

3. **Commit Changes:**
```bash
git add .
git commit -m "feat: add new feature"
```

4. **Push and Create PR:**
```bash
git push origin feature/new-feature
```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Example:**
```
feat(exchange): add iceberg order type

Implement iceberg order type with hidden/visible quantity logic.

Closes #123
```

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Performance impact considered
- [ ] Security implications reviewed

## Resources

- [Architecture Documentation](ARCHITECTURE.md)
- [API Documentation](API_REFERENCE.md)
- [Configuration Reference](CONFIGURATION_REFERENCE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Testing Guide](TESTING.md)
