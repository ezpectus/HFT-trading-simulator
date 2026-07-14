# Masterplan — Uncompleted Tasks & Future Roadmap

> **Source:** Consolidated from `PROGRESS.md`, `FUTURE_TODO.md`, `AUDIT_2025.md`, `ARCHITECTURE_ROADMAP.md`.
> All items below are **unchecked** (`[ ]`) across all source files. Completed items excluded.
> Last updated: 2025-07-13

---

## P0 — Near-Term (0–6 months)

### Frontend

- [ ] **Playwright E2E tests** — browser automation for critical user flows (connect, trade, chart, panels)
- [ ] **Consolidate duplicate journal systems** — merge `useTradeJournal.js` (TradeHistory inline notes) and `TradeJournal.jsx` (tagged entries) into single hook with unified data model
- [ ] **Refactor `useDetachablePanels`** — replace 170 lines of inline `document.write()` HTML/CSS with `BroadcastChannel` + iframe sharing Tailwind/CSS from main app
- [ ] **WebSocket message queue for offline resilience** — buffer messages during disconnect, replay on reconnect with state sync (resume from last candle)
- [ ] **i18n: extract strings, add locale support** — all UI strings into locale files, add language switcher
- [ ] **Theme: user-customizable color schemes** — beyond dark/light toggle, allow user-defined color palettes persisted in localStorage

### Backend

- [ ] **Message schema versioning (WS protocol v2)** — version field in all WS messages, backward-compatible field addition, never remove fields
- [ ] **PostgreSQL migration for trade history** — move persistent trade history, journal, strategies from SQLite to PostgreSQL

### Testing

- [ ] **Property-based testing for trading logic** — `fast-check` for risk calculations, position sizing, signal generation
- [ ] **Contract testing between services** — Pact contracts for Exchange Simulator ↔ AI Signal Bot ↔ HFT Bot ↔ Web UI

---

## P1 — Mid-Term (6–18 months)

### Frontend

- [ ] **TypeScript migration** — incremental, file-by-file: `tsconfig.json`, first `.ts/.tsx` files, strict mode, codegen for WS message types
- [ ] **Zustand global state store** — replace prop drilling for positions, accounts, signals with Zustand stores
- [ ] **Backtest comparison (side-by-side strategy results)** — run multiple backtests, compare metrics in split view, export comparison CSV
- [ ] **Strategy backtesting with custom rules from Strategy Builder** — execute Strategy Builder rules against historical candles, generate equity curve + stats
- [ ] **Export backtest results as shareable link** — serialize backtest config + results to URL, importable by other users

### Backend

- [ ] **gRPC for service-to-service** — replace WebSocket JSON with gRPC for internal Exchange ↔ AI ↔ HFT communication, keep WebSocket for UI
- [ ] **Event bus (NATS) for async communication** — decouple services via pub/sub, enable replay, audit, analytics
- [ ] **Time-series DB for candle/tick storage** — InfluxDB or TimescaleDB for high-frequency market data
- [ ] **TanStack Query for server-state** — when backend adds REST endpoints, use TanStack Query for caching, refetch, optimistic updates

### Trading Features

- [ ] **Options strategy P&L simulator with Greeks overlay** — visualize P&L surface for multi-leg options strategies over time and price
- [ ] **Volume-weighted TWAP execution** — sliced order execution weighted by historical volume profile, progress tracking
- [ ] **Real-time strategy parameter tuning** — adjust signal engine params live without restart, A/B test parameter sets
- [ ] **Multi-asset portfolio optimization** — Markowitz/Black-Litterman with live data, rebalance suggestions
- [ ] **Machine learning signal enhancement** — train models on historical signals + outcomes, enhance live signal confidence

---

## P2 — Long-Term (1.5–5 years)

### Architecture

- [ ] **Plugin architecture for panels** — dynamic import + manifest format, runtime plugin loading, third-party panel marketplace
- [ ] **Multi-region deployment** — active-active across regions, latency-based routing
- [ ] **Real-time risk engine (separate microservice)** — dedicated risk service with gRPC, pre-trade + post-trade checks, portfolio VaR/CVaR streaming

### Intelligence

- [ ] **ML model serving (ONNX runtime in browser)** — run trained models client-side for real-time inference without server round-trip
- [ ] **Real-time feature store** — streaming feature computation (RSI, volatility, order flow imbalance) served to ML models
- [ ] **Walk-forward optimization at scale** — parallelized walk-forward across parameter grid, distributed via Ray/Dask
- [ ] **Reinforcement learning training pipeline** — gym environment from simulator, PPO/SAC agents, reward shaping
- [ ] **Natural language strategy builder (LLM integration)** — "buy when RSI < 30 and volume spikes" → compiled strategy rules
- [ ] **Auto-discovery of trading patterns** — unsupervised pattern mining on historical data, signal generation from discovered patterns

### Platform

- [ ] **Mobile app (React Native, shared state protocol)** — iOS/Android with shared WS protocol, push notifications for alerts
- [ ] **WebAssembly computation for heavy analytics** — port C++ signal engine to WASM, run in browser for zero-latency local computation
- [ ] **Distributed backtesting (Ray/Dask)** — scale backtests across cluster, parameter sweeps with 1000s of combinations
- [ ] **Marketplace for strategies/indicators** — publish, share, subscribe to trading strategies and custom indicators

---

## P3 — Visionary (5–20 years)

### Ecosystem

- [ ] **Full CQRS + event sourcing** — all state transitions as immutable events, replayable audit trail, temporal queries
- [ ] **Multi-tenant architecture** — teams, shared strategies, role-based access control, per-tenant isolation
- [ ] **AI-driven strategy generation and validation** — autonomous agent generates, backtests, deploys strategies with human approval gate
- [ ] **Quantum-resistant cryptography for API keys** — post-quantum key exchange (Kyber/Dilithium) for exchange API authentication
- [ ] **Fully decentralized execution (DEX integration)** — on-chain order routing, smart contract execution, MEV protection
- [ ] **Zero-knowledge proofs for trade verification** — prove trade execution correctness without revealing strategy details
- [ ] **Natural language trading interface (voice + text)** — "open long BTC 0.5x with stop at 95k" → parsed and executed
- [ ] **Autonomous portfolio management agents** — AI agents manage allocations, rebalance, hedge with configurable risk budgets
- [ ] **Cross-market arbitrage (crypto, FX, equities, commodities)** — unified order routing across asset classes, latency-aware execution

---

## Known Limitations (Documented — Not Planned for Fix)

| Item | File | Decision | Rationale |
|------|------|----------|-----------|
| Inline HTML in popup windows | `useDetachablePanels.js` | Refactor to BroadcastChannel + iframe | Popup windows can't access React/Tailwind; listed in P0 |
| `Array.sort()` on every WS message | `useExchangeData.js` | Monitor, not fix | 500 elements sort < 1ms; would complicate code for negligible gain |
| Duplicate journal systems | `useTradeJournal.js` + `TradeJournal.jsx` | Consolidate into single hook | Different UX purposes; key collision fixed; listed in P0 |

---

## Summary by Priority

| Priority | Count | Focus |
|----------|-------|-------|
| **P0** | 11 | Testing, resilience, i18n, schema versioning, PostgreSQL |
| **P1** | 12 | TypeScript, Zustand, gRPC, NATS, backtesting, options, TWAP |
| **P2** | 11 | Plugins, ML serving, RL training, mobile, WASM, marketplace |
| **P3** | 9 | CQRS, multi-tenant, AI agents, DEX, ZK proofs, cross-market |
| **Total** | **43** | |
