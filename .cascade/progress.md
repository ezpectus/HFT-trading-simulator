# Progress Journal — HFT Trading System

## Tasks

| # | Date | Task | Status | Commit |
|---|------|------|--------|--------|
| 1 | 2026-08-15 | Deep audit v4.0 — 40+ UI-only models, CUDA/ONNX dead code | ✅ Done | 7934b9c |
| 2 | 2026-08-15 | Deep audit v4.1 — cross-check README/ARCHITECTURE/MATH_MODELS vs code, fix v4.0 errors | ✅ Done | a4d3ea6 |
| 3 | 2026-08-15 | Deep audit v4.2 — found market_microstructure.py (Student-t/Merton/Heston/Markov), options_strategies.py, 6 more modules | ✅ Done | — |
| 4 | 2026-08-15 | Deep audit v4.3 — recount panels (204→197), tests (138→172), sync all docs | ✅ Done | — |
| 5 | 2026-08-16 | Scan exchange_simulator/ source files — found & fixed 10 bugs (#066-#075) | ✅ Done | 268e858 |
| 6 | 2026-08-16 | Scan ai-signal-bot/src/ source files — found & fixed 7 bugs (#076-#082) | ✅ Done | fa25ec5 |
| 7 | 2026-08-16 | Scan ai-signal-bot/src/risk,ml,research — found & fixed 5 bugs (#083-#087) | ✅ Done | d83020e |

## Bug Fix Progress

| Bug # | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| #066 | _update_position closes entire position on partial opposite-side order | ✅ Fixed | 268e858 | 2026-08-16 |
| #067 | BlackScholes._d1 division by zero at T=0 or sigma=0 | ✅ Fixed | 268e858 | 2026-08-16 |
| #068 | WebSocket message parsing uses .json() on str | ✅ Fixed | 268e858 | 2026-08-16 |
| #069 | Coinbase WebSocket sends dict instead of JSON string | ✅ Fixed | 268e858 | 2026-08-16 |
| #070 | _execute_iceberg_slice sets FILLED before margin check | ✅ Fixed | 268e858 | 2026-08-16 |
| #071 | Iceberg limit price check uses wrong OrderType comparison | ✅ Fixed | 268e858 | 2026-08-16 |
| #072 | _execute_market_order doesn't apply slippage | ✅ Fixed | 268e858 | 2026-08-16 |
| #073 | /metrics endpoint returns string instead of Prometheus format | ✅ Fixed | 268e858 | 2026-08-16 |
| #074 | AuditLogger callback registration not thread-safe | ✅ Fixed | 268e858 | 2026-08-16 |
| #075 | BinomialTree._calculate_parameters NaN at T=0 or sigma=0 | ✅ Fixed | 268e858 | 2026-08-16 |
| #076 | Backtester counts break-even trades (pnl=0) as losses | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #077 | BacktestEngine counts break-even trades (pnl=0) as losses | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #078 | RL environment reward hides transaction costs from agent | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #079 | RL agents call env.reset() without required prices argument | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #080 | RL agent info['trade_count'] KeyError on empty info dict | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #081 | Backtester annualization uses 252 (stock days) instead of 365 (crypto) | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #082 | BacktestEngine annualization uses 252 (stock days) instead of 365 (crypto) | ✅ Fixed | fa25ec5 | 2026-08-16 |
| #083 | market_making.py volatility annualization uses 252 instead of 365 (crypto 24/7) | ✅ Fixed | d83020e | 2026-08-16 |
| #084 | position_sizing.py volatility annualization uses 252 instead of 365 in 2 methods | ✅ Fixed | d83020e | 2026-08-16 |
| #085 | kelly.py from_trade_history counts break-even (pnl=0) as losses | ✅ Fixed | d83020e | 2026-08-16 |
| #086 | risk/portfolio_optimizer.py annualization uses 252 instead of 365 in 5 places | ✅ Fixed | d83020e | 2026-08-16 |
| #087 | position_sizing.py adjust_for_correlation includes self-correlation (diag=1.0) | ✅ Fixed | d83020e | 2026-08-16 |
| #163 | TradingEnv observation dim (63) mismatched with RL agent state_size (100/20) | ✅ Fixed | ee611ee | 2026-08-16 |
| #164 | DQNAgent.replay() crashes when q_network_weights is None (all random early actions) | ✅ Fixed | d4d7fa7 | 2026-08-16 |
| #165 | db.py leaks SQLite connections on exceptions (no try/finally) | ✅ Fixed | 1d4f943 | 2026-08-16 |
| #166 | FIX ResendRequest skips all resent messages (incoming_seq incremented past gap) | ✅ Fixed | 0b394fd | 2026-08-16 |
| #167 | rl_trader.py NUM_ACTIONS=4 but TradingEnv only supports 3 actions | ✅ Fixed | — | 2026-08-16 |
| #168 | Parametric VaR/CVaR scales mean by √t instead of t (incorrect multi-day risk) | ✅ Fixed | b723a6f | 2026-08-16 |
| #169 | Statistical arbitrage take_profit on wrong side for both LONG and SHORT | ✅ Fixed | — | 2026-08-16 |

## Proposals

| # | Title | Status | Date |
|---|-------|--------|------|
| — | No proposals yet | — | — |

## Scan Coverage

| Category | Total | Read ✅ | Partial 🔄 | Pending ⏳ |
|----------|-------|--------|-----------|------------|
| exchange-simulator/src/ | ~56 | 56 | 0 | 0 |
| ai-signal-bot/src/ | ~100+ | 25 | 0 | 75+ |
| hft-trade-bot/src/ | ~50+ | 5 | 0 | 45+ |
| hft-executor/src/ | 3 | 1 | 0 | 2 |
| web-ui/src/components/ | 227 | 0 | 0 | 227 |
| web-ui/src/ | ~20 | 2 | 0 | 18 |
| tests/ | ~172+ | 0 | 0 | 172+ |
| docs/ | ~20 | 10 | 0 | 10 |
| **TOTAL** | **~610+** | **48** | **0** | **562+** |

See `.cascade/file_tracker.md` for full file-by-file tracking.
