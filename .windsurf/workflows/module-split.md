---
description: Refactor a module by splitting into model, functions, and facade files following the hawkes.py pattern
---

# Module Split Refactoring Workflow

This workflow splits a monolithic module into 3 files: `_model.py` (dataclasses), `_funcs.py` (core logic), and original `.py` (facade with re-exports).

## Input
- Target module path (e.g. `src/technical_analysis/hawkes.py`)

## Steps

1. **Read the target module** — identify:
   - Data classes / result containers → go to `_model.py`
   - Core computational functions (fit, simulate, intensity) → go to `_funcs.py`
   - High-level analysis functions, signal functions, event extraction → stay in original `.py`
   - Constants: split appropriately (model constants in `_model.py`, function constants in `_funcs.py`, analysis constants in `.py`)

2. **Create `_model.py`**:
   - Move all data classes and result containers
   - Move any pure math helper functions used only by data classes (e.g. log-likelihood)
   - Add proper imports (`from __future__ import annotations`, `math`, etc.)
   - No imports from other project modules (avoid circular deps)

3. **Create `_funcs.py`**:
   - Move core computational functions
   - Import from `_model.py` what's needed
   - Add proper imports

4. **Rewrite original `.py`**:
   - Import and re-export everything from `_model.py` and `_funcs.py`
   - Keep only high-level analysis functions, signal functions, and helpers local to analysis
   - Keep analysis-specific constants here

5. **Verify `__init__.py`** — ensure all existing imports from the original module still work (re-exports cover them).

6. **Verify test imports** — ensure test files importing from the original module path still work.

7. **Run code-review workflow** — have a verifier agent check the work.
