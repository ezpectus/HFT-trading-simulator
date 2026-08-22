---
description: AI Agent B reviews and verifies code written by AI Agent A against the task spec
---

# Code Review & Verification Workflow

This workflow is executed by a **verifier AI agent** after a **coder AI agent** has completed a task.

## Input
- Task specification (what was requested)
- List of files created/modified by the coder agent
- Test files that must pass

## Steps

1. **Read the task specification** — understand exactly what was asked.

2. **Read every modified/created file** — verify the code matches the spec:
   - Are all required functions/classes present?
   - Are imports correct and at the top of the file?
   - Is there any dead code or leftover scaffolding?
   - Are there circular imports?
   - Does the code follow existing project style (ruff, line-length=120)?

3. **Check for regressions** — verify no other files were broken:
   - Search for all imports of the modified modules
   - Verify `__init__.py` files still export everything correctly
   - Check that no public API was accidentally removed

4. **Check for DRY violations** — look for duplicated code that should be shared:
   - `compute_returns` duplicated across 20+ research modules
   - `quantize` duplicated in `info_bottleneck.py` and `transfer_entropy.py`
   - Similar helper functions that could be extracted to a shared utils module

5. **Check for over-engineering** — flag unnecessarily complex code:
   - Classes with only static methods → use plain functions
   - Unnecessary abstraction layers
   - Config options that are never used
   - Dead code paths that can never execute

6. **Verify tests** — confirm test coverage:
   - Are existing tests still valid with the changes?
   - Do test imports match the new module structure?
   - Are there tests for any new public functions?

7. **Report findings** — output a structured report:
   ```
   ## Verification Report
   - Status: PASS / FAIL / PASS WITH WARNINGS
   - Files checked: [list]
   - Issues found: [list or "none"]
   - Recommendations: [list or "none"]
   ```

8. **If FAIL** — list specific issues that must be fixed before the task is considered complete.
