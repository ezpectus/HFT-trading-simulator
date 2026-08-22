# Refactoring Plan: 22 August – 1 September 2026

## Goal
Remove over-engineering, eliminate code duplication, simplify complex modules, and ensure all tests pass after each change.

## Rules
- After each day's work, run `/code-review` workflow (verifier agent checks coder agent's work)
- After each day's work, commit with message: `refactor: <description>`
- Never break existing tests — run full suite after each day
- No new features, only simplification and cleanup

---

## Code Audit Findings (verified Aug 22)

### Confirmed duplications
- `compute_returns` — **22 identical copies** across research modules (not 20+)
- `quantize` — **2 copies** (`info_bottleneck.py`, `transfer_entropy.py`) with slightly different signatures
- Research modules do **NOT** import each other — zero inter-module dependencies

### Dead code confirmed
- **ALL 35 research modules** — not imported by any strategy, backtest, or signal code. Only imported by `research/__init__.py` and their own test files. All are ACADEMIC (tested but not integrated).
- **ALL 10 ML modules** (`automl.py`, `autoencoder.py`, `environment.py`, `feature_store.py`, `model_registry.py`, `price_predictor.py`, `rkhs.py`, `rl_trader.py`, `svm_signal.py`, `vae.py`) — not imported by any code outside `src/ml/`. No tests import them either.
- **`fix_client.py`** (329 lines) — only imported by its own test file. Not used by any production code.
- **`ws_connection_pool.py`** — only imported by its own test file.
- **`networking/socket_transport.py`** — not imported by anything.
- **SHM modules** (`shm_fill_consumer.py`, `shm_market_data_writer.py`, `shm_ring_buffer.py`, `shm_signal_producer.py`) — not imported by any code outside `communication/`.

### Already deleted (SLOP)
- `lstm_model.py`, `transformer_model.py`, `rl_agent.py`, `dpdk_transport.py` — no longer exist

### Updated file sizes (actual line counts)
| File | Lines (was) | Lines (now) |
|------|------------|------------|
| `research/__init__.py` | 307 | 305 |
| `backtester.py` | 506 | 449 |
| `strategies.py` | 472 | 413 |
| `signal_publisher.py` | 453 | 380 |
| `fix_client.py` | 447 | 329 |
| `rl_trader.py` | 390 | 272 |

---

## Day 1 (Aug 22): Hawkes Refactoring ✅ DONE
- Split `hawkes.py` → `hawkes_model.py` + `hawkes_funcs.py` + `hawkes.py` (facade)
- Remove `hawkes_log_lik` from `hawkes_funcs.py` (lives in `hawkes_model.py`)
- **Status:** Complete. Commit: 3c6919b

---

## Day 2 (Aug 23): Extract shared `compute_returns` utility
**Problem:** `compute_returns` is duplicated across **22 research modules** — each has its own identical copy.

**Plan:**
1. Create `src/research/_common.py` with `compute_returns(prices)` function
2. Replace all 22 local `compute_returns` definitions with import from `_common.py`
3. Update `__init__.py` aliases (e.g. `banach_compute_returns` → keep as re-export from `_common.py`)
4. Run tests to verify no regressions

**Files affected (22 — verified):**
`banach.py`, `burgers.py`, `cameron_martin.py`, `cramer_rao.py`, `fokker_planck.py`, `free_energy.py`, `girsanov.py`, `hahn.py`, `info_bottleneck.py`, `ito_generator.py`, `kolmogorov_sinai.py`, `koopman.py`, `lax_milgram.py`, `lie_group.py`, `malliavin.py`, `pontryagin.py`, `radon_nikodym.py`, `renormalization.py`, `renyi_entropy.py`, `riesz.py`, `sobolev.py`, `stochastic_control.py`

---

## Day 3 (Aug 24): Extract shared `quantize` + other duplicated helpers
**Problem:** `quantize` duplicated in `info_bottleneck.py` and `transfer_entropy.py` (different default arg signatures). Other helpers may also be duplicated.

**Plan:**
1. Audit all 35 research modules for duplicated helper functions (not just `compute_returns`)
2. Move shared helpers to `src/research/_common.py`
3. Normalize `quantize` signature — pick one default, update both callers
4. Update imports in all affected modules
5. Run tests

---

## Day 4 (Aug 25): Simplify research `__init__.py` exports
**Problem:** `src/research/__init__.py` is 305 lines of manual imports + `__all__` list. Hard to maintain, error-prone.

**Plan:**
1. Audit which exports are actually imported by tests/other modules — **finding: NO module outside research/ imports anything from research/**
2. All exports are only used by individual test files via `from src.research.X import ...`
3. Consider: do we need `__init__.py` to re-export everything? Or can tests import directly from module files?
4. Simplify `__init__.py` to minimal or empty (tests import directly from submodules)
5. Remove dead aliases like `banach_compute_returns` (not used anywhere after Day 2)
6. Run tests

---

## Day 5 (Aug 26): Audit and prune unused research modules
**Problem:** 35 research modules — **NONE are imported by any strategy, backtest, or signal generation code.** All are ACADEMIC (tested but not integrated).

**Code audit result:**
- **ACTIVE** (used in production): 0
- **ACADEMIC** (tested but not integrated): 35 — all have dedicated test files
- **DEAD** (not tested, not integrated): 0

**Plan:**
1. Keep all 35 modules — they are educational and tested
2. Add a note to `research/__init__.py` documenting these as ACADEMIC
3. Consider: should any be promoted to actual strategy integration? (Decision: out of scope for refactoring phase)
4. Run tests — all should still pass

---

## Day 6 (Aug 27): Backtester simplification
**Problem:** `backtester.py` is 449 lines (was 506, already shrunk). May contain over-engineered logic.

**Plan:**
1. Read full `backtester.py` and identify:
   - Overly complex methods that could be simplified
   - Dead code paths
   - Methods that could be extracted to separate functions
2. Simplify without changing public API
3. Run backtest tests

---

## Day 7 (Aug 28): Strategies cleanup
**Problem:** `strategies.py` is 413 lines (was 472) with multiple strategy classes in one file.

**Plan:**
1. Consider splitting into separate files: `trend_following.py`, `mean_reversion.py`, `ensemble_voter.py`
2. Or keep as-is if the file is well-organized
3. Remove dead strategy code, unused config options
4. Check for over-engineering in signal generation logic
5. Run strategy tests

---

## Day 8 (Aug 29): Communication layer audit + dead code removal
**Problem:** `signal_publisher.py` is 380 lines (was 453). `fix_client.py` is 329 lines (was 447). Several communication modules are dead code.

**Code audit findings:**
- `fix_client.py` — only imported by its own test. Not used in production.
- `ws_connection_pool.py` — only imported by its own test.
- `shm_fill_consumer.py`, `shm_market_data_writer.py`, `shm_ring_buffer.py`, `shm_signal_producer.py` — not imported by any code outside `communication/`.
- `networking/socket_transport.py` — not imported by anything.

**Plan:**
1. Audit `signal_publisher.py` — remove unused message types, simplify protocol
2. **Delete `fix_client.py`** — dead code, only test imports it. Delete test too.
3. **Delete `ws_connection_pool.py`** — dead code, only test imports it. Delete test too.
4. **Delete `networking/` directory** — `socket_transport.py` not imported anywhere.
5. Audit SHM modules — if not imported outside `communication/`, mark as dead or delete
6. Run communication tests (remaining ones)

---

## Day 9 (Aug 30): ML module cleanup + dead code removal
**Problem:** ALL 10 ML modules are dead code — not imported by any code outside `src/ml/`, and no tests import them.

**Code audit findings:**
- `automl.py`, `autoencoder.py`, `environment.py`, `feature_store.py`, `model_registry.py`, `price_predictor.py`, `rkhs.py`, `rl_trader.py`, `svm_signal.py`, `vae.py` — zero imports from outside `src/ml/`
- `lstm_model.py`, `transformer_model.py`, `rl_agent.py` — already deleted (SLOP)
- `dpdk_transport.py` — already deleted

**Plan:**
1. **Delete entire `src/ml/` directory** — all modules are dead code, no imports, no tests
2. Remove any references to `ml` in `__init__.py` or config files
3. Check if `MLConfig` or `ml_ensemble` strategy references need cleanup
4. Run tests — verify nothing breaks

---

## Day 10 (Aug 31): Final cleanup + documentation
**Plan:**
1. Run full test suite — everything must pass
2. Run `ruff check` — fix any linting issues
3. Update `.cascade/context_cache.md` with final refactoring summary
4. Update `.cascade/progress.md` with all changes made during the 10 days
5. Remove any temporary files, notes, or scaffolding
6. Final commit: `refactor: 10-day cleanup complete`

---

## Sep 1: Buffer day
- Fix any issues found during the 10 days
- Address test failures
- Review and plan next phase

---

## Key Metrics to Track
- [ ] Lines of code removed
- [ ] Duplicate functions eliminated (target: 22 `compute_returns` + 2 `quantize`)
- [ ] Dead modules deleted (target: 10 ML + 2-3 communication + 1 networking)
- [ ] Tests passing (should stay at 100%)
- [ ] Ruff warnings (should be 0)

---

## SLOP BACKLOG (post-refactoring)

These are not part of the 10-day refactoring, but should be addressed after:

1. 🟠 `fpga_orderbook.vhd` (in `hft-trade-bot/fpga/`) — delete or mark TODO
2. 🟡 `hft-executor/src/lib.rs` — finish WebSocket send implementation
3. 🟡 README — remove excess badges, update with current state
4. 🟢 Consider promoting 1-2 research modules to actual strategy integration
