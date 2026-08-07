# Roadmap — Future Versions

> **Updated:** August 7, 2026  
> **Project:** HFT Trading System — Lite Version  
> **Principle:** Keep it lite. No over-engineering. Only features that add real value to a simulation/educational trading system.

---

## v2.5.0 — Testing & Refactoring

**Goal: solidify test coverage for existing components**

- [ ] Add `useLocalStorage` tests (initial value, persistence, remove, JSON serialization)
- [ ] Add `VirtualList` tests (scroll position, item rendering, dynamic height)
- [ ] Add `CandleChart` tests (indicator toggle, data update, marker rendering)
- [ ] Add `OrderBook` tests (real data parsing, synthetic fallback, imbalance calc)
- [ ] Add `Header` tests (exchange/symbol/timeframe selection, keyboard shortcuts)
- [ ] Refactor `useTheme`, `useTradeJournal`, `PanelContainer` to use `useLocalStorage` hook

**Rationale:** These are core UI components with zero test coverage. Adding tests prevents regressions and documents expected behavior.

---

## v2.6.0 — Performance & Optimization

**Goal: keep the UI responsive under heavy data load**

- [ ] Add Web Worker for indicator calculations (EMA/RSI/BB/VWAP off main thread)
- [ ] Implement candle data incremental updates (`setData` vs `update`) in CandleChart
- [ ] Add `requestIdleCallback` for non-critical panel rendering
- [ ] Profile and optimize `registry.js` lazy loading (preload critical panels)
- [ ] Add LRU cache for aggregated candles in `timeframes.js`

**Rationale:** The UI currently does all indicator calculations on the main thread, causing jank with 197 panels. Web Workers + LRU cache are simple, proven solutions — not over-engineering.

---

## v2.7.0 — Trading Features (Optional)

**Goal: add practical trading features if the system is actually used for simulation trading**

- [ ] Add trailing stop-loss to `OrderForm` (auto-adjust SL on price movement)
- [ ] Add position scaling (add to existing position) in `OrderForm`
- [ ] Add order book depth chart (cumulative bid/ask visualization)

**Rationale:** Trailing stop-loss and position scaling are basic trading features that any simulation should have. The depth chart is a natural extension of the existing OrderBook panel.  
**Skipped:** OCO orders, multi-symbol correlation overlay — cool but nobody will use them in a lite simulator.

---

## What was removed and why

The following items from the original roadmap were **removed** as over-engineering for a lite project:

| Removed item | Reason |
|-------------|--------|
| SIMD AVX2/SSE4.2 indicator calculations | HFT-level optimization, not needed for a simulator |
| Lock-free MPMC queue for signal pipeline | Over-engineered for single-user simulation |
| Backpressure-aware order executor | No real order routing in a simulator |
| Heatmap-based latency profiler | Nice-to-have, not critical |
| Config hot-reload via SIGHUP | Just restart the bot |
| LSTM-based price prediction (PyTorch) | Separate R&D project, not a feature |
| Reinforcement learning agent (PPO) | Same — research, not product |
| Sentiment analysis from news events | Scope creep |
| Walk-forward optimization with stability scoring | Already have backtesting, this is gold-plating |
| Monte Carlo permutation tests | Academic exercise, not practical |
| Redis pub/sub alternative to WebSocket | Full architecture change |
| PostgreSQL/TimescaleDB storage | Full architecture change |
| Grafana alerting rules | Ops tooling, not app features |
| Kubernetes manifests | Lite = docker-compose, not k8s |
| End-to-end integration tests (3 frameworks) | Already have Vitest + Playwright + pytest + CTest |

**Bottom line:** v2.8–v3.0 from the original roadmap would turn this into a full HFT platform requiring a dev team. That's not what "lite" means. If you want those features, fork the repo and build a full version.
