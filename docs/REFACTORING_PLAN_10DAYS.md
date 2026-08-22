# Refactoring Plan: 22 August – 1 September 2026

## Goal
Remove over-engineering, eliminate code duplication, simplify complex modules, and ensure all tests pass after each change.

## Rules
- After each day's work, run `/code-review` workflow (verifier agent checks coder agent's work)
- After each day's work, commit with message: `refactor: <description>`
- Never break existing tests — run full suite after each day
- No new features, only simplification and cleanup

---

## Day 1 (Aug 22): Hawkes Refactoring ✅ DONE
- Split `hawkes.py` → `hawkes_model.py` + `hawkes_funcs.py` + `hawkes.py` (facade)
- Remove `hawkes_log_lik` from `hawkes_funcs.py` (lives in `hawkes_model.py`)
- **Status:** Complete. Ready to commit.

---

## Day 2 (Aug 23): Extract shared `compute_returns` utility
**Problem:** `compute_returns` is duplicated across 20+ research modules — each has its own identical copy.

**Plan:**
1. Create `src/research/_common.py` with `compute_returns(prices)` function
2. Replace all local `compute_returns` definitions across research modules with import from `_common.py`
3. Update `__init__.py` aliases (e.g. `banach_compute_returns` → keep as re-export from `_common.py`)
4. Run tests to verify no regressions

**Files affected (~20):**
- `banach.py`, `burgers.py`, `cameron_martin.py`, `cramer_rao.py`, `fokker_planck.py`, `free_energy.py`, `girsanov.py`, `hahn.py`, `info_bottleneck.py`, `ito_generator.py`, `kolmogorov_sinai.py`, `koopman.py`, `lax_milgram.py`, `lie_group.py`, `malliavin.py`, `pontryagin.py`, `radon_nikodym.py`, `renormalization.py`, `renyi_entropy.py`, `riesz.py`, `sobolev.py`, `stochastic_control.py`

---

## Day 3 (Aug 24): Extract shared `quantize` + other duplicated helpers
**Problem:** `quantize` duplicated in `info_bottleneck.py` and `transfer_entropy.py`. Other helpers may also be duplicated.

**Plan:**
1. Audit all research modules for duplicated helper functions
2. Move shared helpers to `src/research/_common.py`
3. Update imports in all affected modules
4. Run tests

---

## Day 4 (Aug 25): Simplify research `__init__.py` exports
**Problem:** `src/research/__init__.py` is 307 lines of manual imports + `__all__` list. Hard to maintain, error-prone.

**Plan:**
1. Consider using `__all__` auto-generation or simplifying the export pattern
2. Remove unused aliases (e.g. `banach_compute_returns` — are these actually used anywhere?)
3. Audit which exports are actually imported by tests/other modules
4. Remove dead exports
5. Run tests

---

## Day 5 (Aug 26): Audit and prune unused research modules
**Problem:** 32 research modules — are all of them actually used? Some may be pure academic exercises with no integration.

**Plan:**
1. For each research module, check:
   - Is it imported by any strategy, backtest, or signal generation code?
   - Is it tested?
   - Does it provide actionable trading signals?
2. Mark modules as: ACTIVE (used), ACADEMIC (tested but not integrated), DEAD (not tested, not integrated)
3. For DEAD modules: remove or archive
4. For ACADEMIC modules: keep but document as educational
5. Run tests

---

## Day 6 (Aug 27): Backtester simplification
**Problem:** `backtester.py` is 506 lines. May contain over-engineered logic.

**Plan:**
1. Read full `backtester.py` and identify:
   - Overly complex methods that could be simplified
   - Dead code paths
   - Methods that could be extracted to separate functions
2. Simplify without changing public API
3. Run backtest tests

---

## Day 7 (Aug 28): Strategies cleanup
**Problem:** `strategies.py` is 472 lines with multiple strategy classes in one file.

**Plan:**
1. Consider splitting into separate files: `trend_following.py`, `mean_reversion.py`, `ensemble_voter.py`
2. Or keep as-is if the file is well-organized
3. Remove dead strategy code, unused config options
4. Check for over-engineering in signal generation logic
5. Run strategy tests

---

## Day 8 (Aug 29): Communication layer audit
**Problem:** `signal_publisher.py` is 453 lines, `fix_client.py` is 447 lines. May have over-engineered features.

**Plan:**
1. Audit `signal_publisher.py` — remove unused message types, simplify protocol
2. Audit `fix_client.py` — remove unused FIX tags, simplify session management
3. Check `shm_ring_buffer.py` and other SHM modules for dead code
4. Run communication tests

---

## Day 9 (Aug 30): ML module cleanup
**Problem:** `rl_trader.py` (390 lines) requires PyTorch. `price_predictor.py` also. These may be over-engineered for an educational system.

**Plan:**
1. Audit ML modules for:
   - Unused model architectures
   - Dead training code
   - Overly complex configs
2. Simplify or remove unused ML code
3. Ensure ML tests still pass (or mark as optional/skip if torch not installed)
4. Run ML tests

---

## Day 10 (Aug 31): Final cleanup + documentation
**Plan:**
1. Run full test suite — everything must pass
2. Run `ruff check` — fix any linting issues
3. Update `PROJECT_AUDIT.md` with refactoring summary
4. Update `CHANGELOG.md` with all changes made during the 10 days
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
- [ ] Duplicate functions eliminated
- [ ] Modules simplified
- [ ] Tests passing (should stay at 100%)
- [ ] Ruff warnings (should be 0)
