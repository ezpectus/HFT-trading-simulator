# Architecture Roadmap (5–20 Year Sustainability Plan)

> **Goal:** Ensure the trading system remains maintainable, extensible, and performant over decades.
> This document defines architectural principles, migration milestones, and technology evolution strategy.

---

## Current State (2025)

| Metric | Value |
|--------|-------|
| Components | 53+ React panels |
| App.jsx size | ~350 lines (after registry refactor) |
| Backend services | 3 (Exchange Simulator, AI Signal Bot, HFT Bot) |
| Communication | WebSocket (JSON) |
| Database | SQLite (WAL) |
| Containerization | Docker Compose |

### Key Architectural Decision: Panel Registry (2025)
- All sidebar panels registered in `src/panels/registry.js`
- `PanelContainer` renders panels by category with collapsible sections
- User can toggle panel visibility (localStorage persistence)
- **Adding a new panel = 1 entry in registry.js, 0 changes to App.jsx**

---

## Design Principles for Long-Term Sustainability

### 1. **Registry Over Monolith**
- Never hardcode component lists in layout files
- All extensible features go through a registry pattern
- Future: plugin system, dynamic imports, third-party extensions

### 2. **Protocol-First Communication**
- WebSocket JSON today → Protocol Buffers / FlatBuffers when latency matters
- Message schema versioning from day one
- Backward-compatible message evolution (add fields, never remove)

### 3. **State Management Evolution Path**
- **Now:** React hooks (useState, useMemo, useContext)
- **Phase 2 (1-2 years):** Zustand or Jotai for global state (positions, accounts)
- **Phase 3 (3-5 years):** Server-state sync (TanStack Query / SWR) when backend adds REST
- **Phase 4 (5-10 years):** Event-sourced state (CQRS) for full audit trail

### 4. **Backend Decoupling**
- Each service (Exchange, AI, HFT) is independently deployable
- No shared state between services — only message passing
- Future: gRPC for internal service-to-service, keep WebSocket for UI
- Future: event bus (Kafka/NATS) for replay, audit, analytics

### 5. **Data Layer Evolution**
- **Now:** SQLite WAL, in-memory state
- **Phase 2:** PostgreSQL for persistent trade history, journal, strategies
- **Phase 3:** Time-series DB (InfluxDB/TimescaleDB) for candle/tick storage
- **Phase 4:** Data lake (Parquet/S3) for ML training, backtesting at scale

### 6. **Type Safety Migration**
- **Now:** JavaScript with JSDoc comments
- **Phase 2 (1-2 years):** TypeScript migration (incremental, file-by-file)
- **Phase 3:** Full type coverage, strict mode, codegen for WS messages

### 7. **Testing Strategy**
- **Now:** Manual testing, Python pytest for backend
- **Phase 2:** Vitest for React components, Playwright for E2E
- **Phase 3:** Contract testing between services (Pact)
- **Phase 4:** Property-based testing for trading logic (fast-check)

---

## Milestone Roadmap

### Year 1 (2025–2026): Foundation
- [x] Panel registry system (done)
- [ ] TypeScript migration (incremental)
- [ ] Component lazy loading (React.lazy + Suspense)
- [ ] Vitest unit tests for critical components
- [ ] Message schema versioning (WS protocol v2)
- [ ] PostgreSQL migration for trade history
- [ ] Prometheus + Grafana monitoring

### Year 2–3 (2026–2028): Scale
- [ ] Plugin architecture for panels (dynamic import + manifest)
- [ ] Zustand global state store
- [ ] TanStack Query for server-state
- [ ] Time-series DB for candle storage
- [ ] gRPC for service-to-service
- [ ] Event bus (NATS) for async communication
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Multi-region deployment

### Year 3–5 (2028–2030): Intelligence
- [ ] ML model serving (ONNX runtime in browser)
- [ ] Real-time feature store
- [ ] Walk-forward optimization at scale
- [ ] Reinforcement learning training pipeline
- [ ] Natural language strategy builder (LLM integration)
- [ ] Auto-discovery of trading patterns

### Year 5–10 (2030–2035): Platform
- [ ] Full CQRS + event sourcing
- [ ] Multi-tenant architecture (teams, shared strategies)
- [ ] WebAssembly computation for heavy analytics
- [ ] Distributed backtesting (Ray/Dask)
- [ ] Real-time risk engine (separate microservice)
- [ ] Mobile app (React Native, shared state protocol)
- [ ] Marketplace for strategies/indicators

### Year 10–20 (2035–2045): Ecosystem
- [ ] AI-driven strategy generation and validation
- [ ] Quantum-resistant cryptography for API keys
- [ ] Fully decentralized execution (DEX integration)
- [ ] Zero-knowledge proofs for trade verification
- [ ] Natural language trading interface (voice + text)
- [ ] Autonomous portfolio management agents
- [ ] Cross-market arbitrage (crypto, FX, equities, commodities)

---

## Architecture Anti-Patterns to Avoid

1. **God Component** — Never let any single file exceed 500 lines. Split.
2. **Prop Drilling** — Use context or state library for data >2 levels deep.
3. **Direct Service Calls in Components** — Always go through hooks/services layer.
4. **Hardcoded Config** — All configurable values in YAML/env, never in code.
5. **Tight Coupling** — Services communicate only via messages, never import each other.
6. **Implicit State** — All state transitions must be traceable and replayable.
7. **Premature Optimization** — Profile first, optimize second. Maintainability > micro-optimization.

---

## Technology Radar

| Technology | Status | Adopt | Trial | Assess | Hold |
|-----------|--------|-------|-------|--------|------|
| React 18 | ✅ Current | ● | | | |
| Vite | ✅ Current | ● | | | |
| TailwindCSS | ✅ Current | ● | | | |
| lightweight-charts | ✅ Current | ● | | | |
| TypeScript | Migration target | | ● | | |
| Zustand | State management | | ● | | |
| TanStack Query | Server state | | | ● | |
| Vitest | Testing | | ● | | |
| Playwright | E2E testing | | | ● | |
| PostgreSQL | Database | | | ● | |
| TimescaleDB | Time-series | | | ● | |
| NATS | Event bus | | | ● | |
| gRPC | Service comm | | | ● | |
| Protocol Buffers | Serialization | | | ● | |
| WebAssembly | Computation | | | | ● |
| React Native | Mobile | | | | ● |
| Kubernetes | Orchestration | | | | ● |

---

## Panel Registry: Future Evolution

### Phase 1 (Current — 2025)
- Static registry in `registry.js`
- All components imported eagerly
- Visibility toggled via localStorage

### Phase 2 (2026)
- Dynamic imports: `React.lazy(() => import('../components/X'))`
- Suspense boundaries per category
- Reduces initial bundle size by 40-60%

### Phase 3 (2027–2028)
- Plugin manifest format:
  ```json
  {
    "id": "my-custom-indicator",
    "name": "Custom RSI Divergence",
    "category": "technical",
    "entry": "./plugins/rsi-divergence/index.jsx",
    "props": { "period": 14 },
    "permissions": ["candles", "signals"]
  }
  ```
- Runtime plugin loading
- Third-party plugin marketplace

### Phase 4 (2029+)
- Sandboxed plugin execution (Web Workers / iframe)
- Plugin API with typed interface
- Plugin versioning and dependency management

---

## File Organization Principles

```
web-ui/src/
├── panels/                    # Panel system
│   ├── registry.js            # Component registry (single source of truth)
│   └── PanelContainer.jsx     # Renders panels by category
├── components/                # Individual panel components
│   ├── [core-ui]/             # Chart, OrderBook, OrderForm, etc.
│   ├── [order-flow]/          # CVD, tape, spoofing, heatmaps
│   ├── [technical]/           # Fibonacci, FVG, patterns, S/R
│   ├── [risk]/                # VaR, drawdown, Monte Carlo, walk-forward
│   ├── [portfolio]/           # Optimizer, rebalance, hedging, Greeks
│   ├── [strategy]/            # Builder, journal, webhooks, execution
│   └── [export]/              # Session, CSV, stats
├── hooks/                     # Custom React hooks
├── utils/                     # Pure functions (indicators, format, etc.)
├── services/                  # (Future) API layer, WS abstraction
├── stores/                    # (Future) Zustand stores
└── types/                     # (Future) TypeScript definitions
```

---

## Migration Checklist

- [x] Panel registry created
- [x] App.jsx refactored to use registry
- [x] PanelContainer with collapsible categories
- [x] localStorage visibility persistence
- [ ] Subfolder organization for components
- [ ] TypeScript config (tsconfig.json)
- [ ] First .ts/.tsx files
- [ ] Vitest setup
- [ ] Playwright E2E
- [ ] CI/CD pipeline
- [ ] Lazy loading for panels
- [ ] Zustand store for global state
- [ ] Message schema versioning

---

## Versioning Strategy

- **Major (X.0.0):** Breaking changes (new WS protocol, DB migration)
- **Minor (0.X.0):** New features, new panels, new strategies
- **Patch (0.0.X):** Bug fixes, performance improvements
- **Pre-1.0:** Breaking changes allowed in minor versions
- **Post-1.0:** SemVer strictly enforced

---

## Conclusion

The panel registry system is the cornerstone of long-term sustainability.
It ensures that adding the 100th panel is as easy as adding the 1st —
one entry in `registry.js`, zero changes to `App.jsx`.

All future architectural decisions must answer:
1. Does this make the system harder to maintain in 10 years?
2. Does this introduce coupling that will be painful to undo?
3. Is this decision reversible if technology changes?

If any answer is "yes," reconsider.
