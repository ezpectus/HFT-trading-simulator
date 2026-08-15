---
description: Fix all bugs from MASTER_DEVELOPMENT_PLAN.md then implement all remaining features — full project completion
auto_execution_mode: 3
---

# Bug Fix & Feature Implementation Workflow

## Rules

1. **Minimal console usage** — use `read_file`, `grep_search`, `edit` tools instead of terminal commands. Only use `run_command` for `git commit` and `git push`.
2. **5-variant analysis before each fix** — for every bug, analyze 5 approaches with tradeoffs, then pick the best. Present as a concise table:

   | # | Approach | Pros | Cons |
   |---|----------|------|------|
   | 1 | ...      | ...  | ...  |
   | 2 | ...      | ...  | ...  |
   | 3 | ...      | ...  | ...  |
   | 4 | ...      | ...  | ...  |
   | 5 | ...      | ...  | ...  |

   Pick the best variant, state why in one line.

3. **Commit after each batch of fixes** — one commit per round or logical group of fixes. Detailed commit message with per-bug rationale.
4. **Update MASTER_DEVELOPMENT_PLAN.md checkboxes** — after fixing each bug, change `[ ]` to `[x]` with a short status:
   - `[x] P-XXXX: FIXED — <one-line description>`
   - `[x] P-XXXX: FALSE POSITIVE — <reason>`
   - `[x] P-XXXX: SKIPPED — <reason>`
5. **No AI-style comments** — no `# AI generated`, no `# TODO: implement later`, no verbose docstrings unless asked.
6. **HFT-style code** — performance-conscious, minimal allocations, no unnecessary abstractions.
7. **Track progress** — after each batch, report a summary line:

   `Progress: X fixed / Y total bugs remaining. Z bugs left.`

   Update this count after every batch until all bugs are resolved.

8. **Transition to features** — when all bugs in MASTER_DEVELOPMENT_PLAN.md are checked off (`[x]`), proceed to implement the remaining unfinished features and tasks described in the plan. Follow the same batch-commit workflow for feature implementation.

## Steps

### Phase 1: Bug Fixes

1. Scan `MASTER_DEVELOPMENT_PLAN.md` for all unchecked `[ ] P-XXXX` items.
2. If no unchecked bugs remain, skip to step 6.
3. For each bug batch:
   a. Read the relevant source file(s) using `read_file` / `grep_search`.
   b. Perform 5-variant analysis with tradeoffs.
   c. Pick best variant, implement using `edit` / `multi_edit`.
   d. Update the checkbox in `MASTER_DEVELOPMENT_PLAN.md` to `[x]`.
4. After all fixes in the batch, commit with `git add -A; git commit -m "..."`.
5. Report progress: `Progress: X fixed / Y total. Z bugs left.` Continue to next batch until all bugs are fixed.

### Phase 2: Feature Implementation

6. When all bugs are fixed, scan `MASTER_DEVELOPMENT_PLAN.md` for unfinished features/tasks (items marked as TODO, not started, or incomplete).
7. Implement features in logical batches, committing after each batch with detailed rationale.
8. Report feature progress after each batch until all planned features are implemented.
