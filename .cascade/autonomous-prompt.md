# Autonomous Work Prompt — Trading System Lite

## Context
You are working on a trading system with:
- **web-ui/** — React + Vite + TailwindCSS frontend with 100+ panels
- **ai-signal-bot/** — Python asyncio trading bot with strategies, risk, backtesting
- **helm/** — Kubernetes Helm chart for deployment
- **docs/** — 25+ documentation files (all outdated, need updating)
- **.cascade/office-board.md** — Task board with REF-01..REF-625 tasks (0 TODO, 572 DONE — all complete)

## Your Mission
Read `.cascade/office-board.md` and work through tasks sequentially.
Mark each task as ✅ DONE in the board when completed.
**Before every commit: run tests, update all relevant docs.**
Commit after every 5-10 tasks.

## Current Status
- **ALL TASKS COMPLETE:** 572 DONE, 0 TODO, 0 BLOCKED
- **REF-01..50** — DRY refactoring, UI centralization ✅
- **REF-51..110** — JS test fixes, 857 tests passing ✅
- **REF-111..150** — Edge-case test coverage for components/hooks/utils ✅
- **REF-151..200** — Performance optimization ✅
- **REF-201..250** — Python type hints, docstrings, strategy tests (10 new test files) ✅
- **REF-251..300** — DevOps/CI/CD/Helm verified ✅
- **REF-301..400** — Documentation + security verified ✅
- **REF-401..500** — UI/UX + tooling verified ✅
- **REF-501..520** — Static analysis audits ✅
- **REF-521..625** — Config, CI/CD, docs, test coverage ✅
- **Bug log:** 188 bugs found, all fixed
- **JS tests:** 857 tests, 0 failures
- **Python tests:** 32+ unit tests, integration tests, strategy tests

## Next Steps
The office-board is fully cleared. Potential future work:
1. Run full test suites and fix any failures
2. Push all commits to origin
3. Update autonomous-prompt.md with new task batches if needed

## Task Execution Protocol
For each task:
1. **Read the task** in office-board.md → understand the files involved
2. **Read the relevant source files** before making changes
3. **Make minimal, focused edits** — don't refactor beyond the task scope
4. **Verify the fix** — re-read changed files, check for syntax errors
5. **Update office-board.md** — change ⬜ TODO to ✅ DONE after completing each task
6. **Commit every 5-10 tasks** — see commit convention below

## Rules
1. **Do NOT run tests, linters, or dev servers** — user handles all test/lint runs
2. **Do NOT run destructive commands** (rm, git reset, git checkout) without approval
3. **Follow existing code style** — don't add comments unless asked
4. **Verify imports exist** before adding them
5. **If a task is blocked** — mark as ⛔ BLOCKED with reason and move to next
6. **Pre-commit verification** — re-read every changed file, grep for broken imports, verify no syntax errors
7. **Update docs after changes** — if you change code, update the corresponding doc in `docs/` to match

## Key Technical Context

### JavaScript/React (web-ui/)
- `useLocalStorage` hook returns `[value, setValue, remove]` — 3 values
- Test mocks must return 3 values: `(key, default) => { const [v, s] = useState(default); return [v, s, () => {}] }`
- `ui-helpers.js` re-exports from `ui-helpers.tsx` (migrated to TypeScript)
- `ui-helpers.tsx` exports: `pnlColor`, `pnlBg`, `sideColor`, `sideBg`, `statusColor`, `statusBg`, `statusIcon`, `ICONS`, `StatCard`, `Bar`, `Label`, `SectionTitle`, `WarningBanner`, `CLASS`
- Vitest uses `isolate: true` (changed from false — proper isolation between test files)
- `cn()` utility in `web-ui/src/utils/cn.js` for conditional Tailwind class merging
- Pre-commit hook is broken — always use `--no-verify`
- 289 React components, 6 hooks, 11 utils, 93 test files
- 283/289 components wrapped in `memo()` (6 without: 3 error boundaries, LoadingSkeleton, ReconnectBanner, Toast)
- Panel registry: `web-ui/src/panels/registry.js` — all panels must resolve

### Python (ai-signal-bot/)
- Python 3.12, asyncio, websockets, numpy, scipy (optional)
- Ruff for linting (line-length=120), pytest for testing
- `pytest-asyncio` with `asyncio_mode = "auto"` in pyproject.toml
- All async methods must be awaited in tests — use `async def test_*` + `await`
- Use `AsyncMock` (not `MagicMock`) for mocking async methods
- DB: SQLite, `_get_conn()` method (not `_conn()` which is an attribute)
- `deque` doesn't support slicing — wrap with `list()` first
- Config: YAML in `ai-signal-bot/config/settings.yaml`
- 50+ Python source files across 15 modules

### Infrastructure
- 2 Helm charts (helm/ and deploy/helm/) — need syncing
- Configs: settings.yaml, settings.testnet.yaml, shared_config.yaml, exchange_simulator config, hft-trade-bot config
- 25+ documentation files — ALL outdated, need updating

## Commit Convention
```
git add -A
git commit --no-verify -m "refactor: complete REF-XX..REF-YY" -m "- Brief description of changes"
```

## Pre-Commit Checklist (MANDATORY — do NOT run tests, just verify code)
1. Re-read every changed file to verify changes are correct and complete
2. Grep for broken imports (from src.deleted_module, import deleted_symbol)
3. Verify no syntax errors: check for unclosed brackets, missing colons, broken indentation
4. Verify all new imports actually exist in target modules
5. Check that deleted functions/classes are not referenced anywhere else
6. Verify tests still align with changed APIs (grep for function names in tests/)
7. Update office-board.md (mark tasks ✅ DONE)
8. Then commit with --no-verify

## When Stuck
- Search the codebase with grep/glob for relevant patterns
- Read test files to understand expected behavior
- Check existing implementations for patterns to follow
- Mark task as blocked and continue to next

## Task Categories Summary
- **REF-01..50** — ✅ DONE — DRY refactoring, UI centralization (StatCard, Bar, Label, SectionTitle, WarningBanner, cn(), CLASS)
- **REF-51..110** — ✅ DONE — JS test fixes (useLocalStorage mock, getByText→getAllByText, timer act() wraps)
- **REF-111..200** — ✅ DONE — Edge-case test coverage, performance optimization
- **REF-201..300** — ✅ DONE — Python type hints, docstrings, strategy tests
- **REF-301..400** — ✅ DONE — DevOps, Docker, Helm, documentation, security
- **REF-401..500** — ✅ DONE — UI/UX, tooling, ESLint, TypeScript migration
- **REF-501..520** — ✅ DONE — Static analysis bug fixes
- **REF-521..625** — ✅ DONE — Config, CI/CD, docs, test coverage
