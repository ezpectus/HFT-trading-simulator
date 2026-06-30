# Code Audit — Kleppmann Principles (2025-06-29)

> Applied principles from "Designing Data-Intensive Applications" (Martin Kleppmann):
> **Reliability, Scalability, Maintainability, Evolvability, Operability**

---

## Phase 40 Audit — Documentation & Infrastructure (2025)

### Verification Summary

| Area | Status | Notes |
|------|--------|-------|
| Documentation | PASS | All 12 docs updated to reflect Phase 40 state |
| Logging | PASS | Timestamped logs + CSV trade logs with symlinks for all 3 services |
| CI/CD | PASS | 4 GitHub Actions jobs: Python, C++, JS, Docker |
| Build | PASS | Makefile targets: build, test, test-js, logs, clean, lint |
| Config | PASS | Hot-reload, mock mode, V2 engine config sections |
| Dependencies | PASS | No unused dependencies, requirements.txt verified |

### Documentation Completeness

| File | Status |
|------|--------|
| README.md | Updated: portfolio showcase, badges, Mermaid diagram, benchmarks |
| CHANGELOG.md | Updated: all phases 1-40 in Keep a Changelog format |
| ARCHITECTURE.md | Updated: V2 engine, 191+ panels, Mermaid diagram, tech stack |
| WEB_UI.md | Updated: 191+ panels, 75+ math models, performance, testing, mock mode |
| TRADING_STRATEGIES.md | Updated: V2 engine, pressure model, SOR, adaptive selector, Kelly, backtesting |
| WEBSOCKET_PROTOCOL.md | Updated: set_speed, config_update, speed_change, config_updated, ClosedTrade, resilience |
| SETUP.md | Updated: mock mode, V2 engine, timestamped logging, CLI monitors |
| EXCHANGE_SIMULATOR.md | Updated: arbitrage, funding, market impact, news, liquidation, partial fills, logging |
| PROGRESS.md | Updated: Phase 40 marked [DONE], future enhancements separated |
| FUTURE_TODO.md | Updated: completed items marked, architecture milestones updated |
| ARCHITECTURE_ROADMAP.md | Updated: current state metrics, Year 1 milestones, migration checklist |
| AUDIT_2025.md | This file |

### Infrastructure Verification

- **Logging:** `run_logger.py` and `trade_csv_logger.py` shared modules verified
- **Log artifacts:** GitHub Actions uploads log files as artifacts
- **clang-format:** `fix/` directory excluded from formatting check
- **ESLint:** Added to test-js CI job
- **Mock mode:** `VITE_MOCK_MODE=true` generates synthetic data for standalone demo
- **Netlify:** `netlify.toml` configured with redirects and security headers
- **License:** Changed from MIT to Apache 2.0 (educational purpose, attribution required)

---

## Issues Found & Fixed (Original Audit)

### CRITICAL — Data Corruption Bug
**File:** `TradeJournal.jsx` + `useTradeJournal.js`
**Issue:** Both used `trading-sim-journal` localStorage key with **incompatible schemas**:
- `useTradeJournal.js`: `{ [tradeKey]: noteString }`
- `TradeJournal.jsx`: `{ [tradeId]: { note, tags, savedAt } }`
**Impact:** Last writer corrupts other's data. User notes silently lost.
**Fix:** Renamed TradeJournal key to `trading-sim-journal-entries`

### HIGH — React Anti-Pattern: useMemo for Side Effects
**File:** `StrategyBuilder.jsx`
**Issue:** Used `useMemo()` to load from localStorage and call `setState` — causes state updates during render.
**Fix:** Replaced with `useEffect()`

### HIGH — No Exponential Backoff on WebSocket Reconnect
**File:** `useWebSocket.js`
**Issue:** Fixed 3s reconnect interval. Under network issues, hammers server every 3s forever.
**Fix:** Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s cap. Reset on successful connect.

### MEDIUM — Silent Error Swallowing (Operability)
**Files:** 8 files with `catch {}` or `catch { // ignore }`
**Issue:** Errors silently discarded. Violates Kleppmann's operability principle: "you should be able to observe what's happening."
**Fix:** Added `console.warn('[ComponentName] ...')` to all silent catches in:
- `useWebSocket.js`, `useTradeJournal.js`, `PanelContainer.jsx`
- `Watchlist.jsx`, `AlertWebhook.jsx`, `StrategyBuilder.jsx`
- `TradeJournal.jsx`, `SessionStats.jsx`

### MEDIUM — Dead State: customIndicators
**File:** `App.jsx`
**Issue:** `customIndicators` state declared, `setCustomIndicators` passed to IndicatorBuilder, but value never consumed (CandleChart doesn't receive it).
**Fix:** Removed dead state from App.jsx and registry.js.

### LOW — Null Safety in Registry Helper
**File:** `registry.js`
**Issue:** `ob()` helper: `ctx.exchange.orderbooks[key]` — no optional chaining.
**Fix:** Added `ctx.exchange?.orderbooks?.[key]`

---

## Issues Noted (Not Fixed — Documented for Future)

### useDetachablePanels.js — Inline HTML Construction
**Issue:** 170 lines of `popup.document.write()` with inline HTML/CSS. Duplicates styling, not maintainable.
**Decision:** Left as-is. Popup windows can't access React/Tailwind. Documented as known limitation. Future: use BroadcastChannel + iframe with shared CSS.

### useExchangeData.js — Sort on Every Message
**Issue:** `Array.from(candleMap.values()).sort()` runs on every WebSocket message (O(n log n) with n=500).
**Decision:** Not fixed — 500 elements sort is <1ms. Would complicate code for negligible gain. Monitor if candle count increases.

### Duplicate Journal Systems
**Issue:** `useTradeJournal.js` (used by TradeHistory.jsx) and `TradeJournal.jsx` (standalone) both manage trade notes with different UX and data models.
**Decision:** Kept both — they serve different purposes (TradeHistory = inline notes, TradeJournal = tagged entries). Fixed the key collision. Future: consolidate into single hook.

---

## Pass 2 — Deep Component Audit

### HIGH — useMemo with Side Effects (SessionStats)
**File:** `SessionStats.jsx`
**Issue:** `useMemo()` called `localStorage.getItem()` AND `localStorage.setItem()` — side effects inside render. Also, reset button only updated localStorage, not React state.
**Fix:** Extracted to `useState` + `useEffect`. Reset button now calls `setSessionStart()`. Added null guard with loading state.

### HIGH — useMemo for setInterval (TradeReplay)
**File:** `TradeReplay.jsx`
**Issue:** `useMemo()` used to create `setInterval` for auto-play. `useMemo` doesn't run cleanup functions, causing interval leaks on every re-render. The interval would never be cleared when `playing` or `speed` changed.
**Fix:** Replaced with `useEffect` — properly cleans up interval on dependency change and unmount.

### Verified Clean (No Issues Found)
- **Null safety in candle access:** All 15+ components that filter candles by exchange/symbol check `symCandles.length` before accessing elements
- **Account data access:** Components consistently use `acc.balance || 0`, `acc.positions || []`, `acc.trade_history || []` patterns
- **Fills access:** `DrawdownAnalysis`, `TradeClustering`, `SignalPerformance` all check `fills?.length` before processing
- **Correlation functions:** Both `CorrelationMatrix.jsx` and `HedgingSuggestions.jsx` correlation helpers check `n < 3` / `n < 10` and return 0
- **Popup blockers:** `PerformanceDashboard.jsx` checks `if (!win) return` after `window.open()`
- **File downloads:** All `document.createElement('a')` patterns are safe (no crash risk)
- **No remaining `useMemo + localStorage` anti-patterns** after StrategyBuilder and SessionStats fixes

---

## Kleppmann Principles Applied

| Principle | Action |
|-----------|--------|
| **Reliability** | Exponential backoff prevents reconnection storms; CircuitBreaker in V2 engine (5 errors -> 30s cooldown) |
| **Operability** | All silent catches log to console; timestamped log files + CSV trade logs with symlinks; CLI monitor scripts |
| **Evolvability** | Panel registry (191+ panels) enables adding panels without touching App.jsx; V1/V2 engine toggle via config |
| **Maintainability** | Dead code removed, anti-patterns fixed; ESLint + Vitest; comprehensive documentation (12 files) |
| **Scalability** | VirtualList for long lists; ErrorBoundary + Suspense per panel; no heap allocations in V2 hot path |
| **Data Integrity** | localStorage key collision resolved; CSV trade log for audit trail; timestamped logs for debugging |

---

## Files Modified

| File | Changes |
|------|---------|
| `TradeJournal.jsx` | localStorage key renamed, error logging |
| `useWebSocket.js` | Exponential backoff, error logging |
| `useTradeJournal.js` | Error logging on all catches |
| `PanelContainer.jsx` | Error logging on all catches |
| `Watchlist.jsx` | Error logging + fallback default |
| `AlertWebhook.jsx` | Error logging |
| `StrategyBuilder.jsx` | useMemo→useEffect fix, error logging |
| `SessionStats.jsx` | useMemo→useState+useEffect fix, error logging, reset state update |
| `TradeReplay.jsx` | useMemo→useEffect fix for setInterval (interval leak) |
| `App.jsx` | Removed dead customIndicators state |
| `registry.js` | Null safety in ob(), removed setCustomIndicators |
