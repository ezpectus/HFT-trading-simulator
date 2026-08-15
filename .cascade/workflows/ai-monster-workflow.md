---
description: HFT Trading System — Cascade AI full autonomous workflow. Deep code analysis, bug fixing, optimization, testing, documentation, auto-commit.
---

# Cascade AI — HFT Trading System Workflow

> This is the internal workflow file for Cascade AI working on the HFT Trading System project.
> It defines every step, every rule, every restriction. This is the monster.

---

## 1. Task Intake

### 1.1 Where Tasks Come From

- **ТЗ files** — user drops `.md` files into `.cascade/tasks/`
- **Direct messages** — user sends instructions in chat
- **Self-discovered** — Cascade finds issues during code review and creates tasks for itself
- **Audit report** — issues from `README_PROJECT_OVERVIEW.md` or `MASTER_DEVELOPMENT_PLAN.md`

### 1.2 Task File Format

```
.cascade/tasks/NNN_краткое_описание.md
```

Example: `001_fix_rsi_calculation.md`, `002_add_garch_model.md`, `003_broker_integration.md`

### 1.3 Reading a Task

1. Read the task file completely
2. Identify the scope — which files, which modules
3. Identify the type — bugfix, refactor, feature, docs, test, model
4. Identify priority — critical, high, medium, low
5. Check for dependencies — does this task require other tasks to be done first?
6. Update `.cascade/progress.md` — mark task as "in progress"

---

## 2. Analysis Phase

### 2.1 Static Analysis Only

**NEVER run terminal commands** (except git commit/push). This includes:

| Forbidden | Reason |
|-----------|--------|
| `pytest` | Hangs, consumes memory |
| `ruff` / `mypy` | Use read_file to check style/types |
| `python -m anything` | Hangs |
| `pip install` / `npm install` | Not allowed |
| `docker` anything | Not allowed |
| `uvicorn` / `node` | Not allowed |
| `curl` / `wget` | Not allowed |
| `make` / `cmake` | Not allowed |

**Allowed tools:**
- `read_file` — read any file
- `grep_search` — search for patterns
- `find_by_name` — find files
- `code_search` — semantic code search
- `list_dir` — list directory contents
- `edit` / `multi_edit` — edit files
- `write_to_file` — create new files
- `run_command` — ONLY for `git add -A; git commit -m "..."; git push`

### 2.2 Code Reading Strategy

Before touching any code:

1. **Read the target file** — full context, not just the lines to change
2. **Read related files** — imports, dependencies, callers, tests
3. **Read the test file** — understand what behavior is expected
4. **Check for patterns** — how is this done elsewhere in the codebase?
5. **Check `MASTER_DEVELOPMENT_PLAN.md`** — is this issue already known?
6. **Check `docs/future_development.md`** — is this feature already planned?

### 2.3 Dependency Tracing

When analyzing a change:

1. **Who calls this function?** — `grep_search` for the function name
2. **What does this import?** — read import statements
3. **What imports this?** — `grep_search` for `from .module import`
4. **Are there tests?** — check `tests/` for corresponding test file
5. **Is this used in strategies?** — check `src/strategies/`
6. **Is this used in C++?** — check `hft-trade-bot/src/`

### 2.4 Approach Selection — 5 Approaches Rule

For every change, consider 5 approaches:

1. **Minimal fix** — one-line change, does it solve the problem?
2. **Pattern fix** — how is this solved elsewhere in the codebase?
3. **Refactor fix** — should the surrounding code be restructured?
4. **Architecture fix** — does this require a design change?
5. **Alternative** — creative/unconventional solution

For each approach, evaluate:
- **S** (Simplicity) — how complex? (simpler = better)
- **R** (Risk) — what could break? (lower = better)
- **C** (Completeness) — fixes root cause or symptom? (root = better)

**Pick the simplest one that works.** Document why if choosing a more complex approach.

---

## 3. Project-Specific Knowledge

### 3.1 Architecture

```
HFT Trading System
├── exchange-simulator/     (Python 3.12, asyncio) — 90% ready
├── ai-signal-bot/          (Python 3.12, asyncio) — 60% ready
├── hft-trade-bot/          (C++20, Boost)         — 70% ready
├── hft-executor/           (Rust)                 — 70% ready
├── web-ui/                 (React 18, Vite)       — 85% ready
├── docs/                   — documentation
├── .cascade/               — THIS workspace
└── shared_config.yaml      — global config
```

### 3.2 Key Files

| File | Role |
|------|------|
| `exchange-simulator/src/market_simulator.py` | GBM price engine |
| `exchange-simulator/src/exchange.py` | Exchange simulation |
| `exchange-simulator/src/websocket_server.py` | WS server |
| `ai-signal-bot/src/strategies/strategies.py` | Base strategy + Signal |
| `ai-signal-bot/src/strategies/ml_ensemble.py` | ML ensemble + HMM + IsolationForest |
| `ai-signal-bot/src/technical_analysis/indicators.py` | EMA, RSI, MACD, Bollinger, ATR, VWAP, ADX |
| `ai-signal-bot/src/technical_analysis/fft_analysis.py` | FFT analysis |
| `ai-signal-bot/src/ml/` | LSTM, Transformer, RL, AutoML |
| `ai-signal-bot/src/risk/` | VaR, CVaR, Kelly, stress test |
| `ai-signal-bot/src/portfolio/` | Markowitz, Black-Litterman |
| `ai-signal-bot/run.py` | Main entry point |
| `hft-trade-bot/src/strategies/signal_engine_v2.h` | C++ indicators (EMA, RSI, OBI, VWAP, ADX, Pressure) |
| `hft-trade-bot/src/strategies/signal_engine_v3.h` | HMM regime detection (Baum-Welch, Viterbi) |
| `hft-trade-bot/src/ml/gpu_accelerator.cu` | CUDA kernels (DEAD CODE — #ifdef USE_CUDA) |
| `hft-trade-bot/src/ml/onnx_engine.h` | ONNX Runtime (DEAD CODE — #ifdef USE_ONNXRUNTIME) |
| `hft-trade-bot/src/fix/` | FIX 4.4 protocol |
| `hft-executor/src/lib.rs` | Rust order executor (FFI) |
| `web-ui/src/components/` | 197 React panels |
| `shared_config.yaml` | Global config (symbols, exchanges, risk) |

### 3.3 Known Critical Issues (from audit v4.0)

1. **README.md badges inflated** — 75+ models (actually ~36+40 UI-only), 34+ strategies (actually 16)
2. **40+ models UI-only** — exist as .jsx, NOT in trading pipeline
3. **CUDA/ONNX dead code** — behind #ifdef, never compiled
4. **SVI/SABR** — README claims, does NOT exist
5. **ML models not trained** — code exists, no weights
6. **Quantum models** — 0%
7. **Broker integration** — 5% (FIX framework exists, not connected)
8. **Real HFT features** — 10% (no co-location, DMA, PTP, GPS, tick data)
9. **15 models don't exist ANYWHERE** — Hurst, VPIN, Kyle's Lambda, etc.

### 3.4 Scan Order

```
exchange-simulator/src/          → ALL .py files
ai-signal-bot/src/               → ALL .py files (strategies, ml, risk, portfolio, technical_analysis)
ai-signal-bot/run.py             → Main entry
hft-trade-bot/src/               → ALL .h/.cpp/.cu files (strategies, ml, fix, exchange, risk, persistence)
hft-executor/src/                → ALL .rs files
web-ui/src/components/           → ALL .jsx files (197 panels)
web-ui/src/                      → App, hooks, utils
tests/                           → ALL test files
docs/                            → ALL .md files
```

---

## 4. Code Change Rules

### 4.1 Code Quality Checklist

Before committing any code change, verify:

- [ ] No `from x import *` — explicit imports only
- [ ] No bare `except Exception` — catch specific exceptions
- [ ] No `print()` — use `logging`
- [ ] No magic numbers — extract to constants
- [ ] No dead code — remove unused functions/imports
- [ ] No commented-out code — delete it
- [ ] All functions have type hints (params + return)
- [ ] Use f-strings not `%` or `.format()`
- [ ] No duplicated code blocks — extract to function
- [ ] No hardcoded config — use config files

### 4.2 HFT Performance Checklist

- [ ] O(1) lookups — dicts/indexes, not linear scans
- [ ] `__slots__` on hot path classes (Python)
- [ ] No unnecessary heap allocations (C++)
- [ ] Use `std::unordered_map` not `std::map` where order doesn't matter (C++)
- [ ] Use `numpy` vectorization instead of loops (Python)
- [ ] SIMD intrinsics where appropriate (C++)
- [ ] Lock-free data structures on hot path (C++)
- [ ] Pre-allocated buffers for recurring operations
- [ ] No dynamic allocation in inner loops (C++)

### 4.3 Security Checklist

- [ ] No secrets in code — env vars or config
- [ ] Input validated — all external data
- [ ] No SQL injection — parameterized queries
- [ ] No path traversal — sanitize file paths
- [ ] WebSocket authentication
- [ ] Rate limiting on API endpoints
- [ ] CORS not wildcard in production
- [ ] No information leakage in error messages

### 4.4 Data Structure Optimization Guide

| Current | Problem | Better Choice | Why |
|---------|---------|---------------|-----|
| `list` + `in` check | O(n) lookup | `set` | O(1) lookup |
| `list` + `.index()` | O(n) search | `dict` | O(1) by key |
| `list` + `.insert(0, x)` | O(n) shift | `collections.deque` | O(1) at both ends |
| `list` + `.pop(0)` | O(n) | `collections.deque` | O(1) popleft |
| Repeated `str` concat | O(n²) | `''.join()` | O(n) |
| `list` for unique items | O(n²) dedup | `set` | O(n) dedup |
| `sorted(list)` every call | O(n log n) each | `bisect.insort` | O(n) insert, kept sorted |

### 4.5 Advanced Techniques — Use WHERE APPROPRIATE

| Technique | When to Use | When NOT to Use |
|-----------|-------------|-----------------|
| `__slots__` | Hot path, many instances | One-off classes |
| `functools.lru_cache` | Pure function, repeated calls | Functions with side effects |
| `asyncio.Lock` | Shared mutable state in async | Read-only access |
| `dataclass(frozen=True)` | Immutable value objects | Mutable models |
| `enum.IntEnum` | Numeric constants with meaning | Simple flags |
| `collections.deque` | O(1) push/pop both ends | Random access |
| `collections.defaultdict` | Dict with default factory | Simple dicts |
| `collections.Counter` | Counting occurrences | Manual counting |
| `pathlib.Path` | File path operations | String paths |
| `itertools` | Efficient iteration | Simple loops |
| Generator expressions | Lazy evaluation | When list needed |
| `bisect` | Sorted list operations | Unsorted data |
| `heapq` | Priority queue | Random access sorted |
| `numpy.vectorize` | Numeric arrays | Small data |
| `numba.jit` | Numeric hot loops | Non-numeric code |

---

## 5. Root Cause Analysis

### 5.1 Before Fixing — 8 Questions

For every bug, answer ALL before fixing:

1. **What is the bug?** — exact description
2. **WHY is this a bug?** — what incorrect behavior does it cause?
3. **Why does this bug exist?** — how was it introduced? (copy-paste, rushed, missing knowledge)
4. **What is the root cause?** — not the symptom, the underlying reason
5. **What are the consequences?** — what breaks, what's at risk?
6. **Who is affected?** — users, API consumers, other components
7. **When does it manifest?** — always? under conditions? under load?
8. **Related bugs?** — does this bug cause others? is it caused by another?

**ONLY after answering ALL — proceed to fixing.**

---

## 6. Bug Documentation Format

### 6.1 Bug Entry Template

```markdown
#### BUG-NNN: [Name]
- **File:** `path/to/file.py:LINE-LINE`
- **Category:** Anti-pattern / Bug / Security / Performance / Type Safety / Code Smell
- **Severity:** Critical / High / Medium / Low
- **Root Cause:** [WHY this is a bug — not just WHAT]
- **Impact:** [What breaks, what's at risk]
- **Approaches:**
  1. [Minimal] — S:9 R:2 C:3
  2. [Pattern] — S:7 R:3 C:7
  3. [Refactor] — S:5 R:5 C:9
  4. [Architecture] — S:3 R:7 C:10
  5. [Alternative] — S:6 R:4 C:8
- **Selected:** Approach N — [reason]
- **Technique used:** [name] — [why this technique]
- **Fix:** [what was changed]
- **Lines:** OLD → NEW (X lines → Y lines)
- **Status:** ✅ Fixed in commit HASH
```

### 6.2 Where to Document

- **CHANGELOG.md** — after each fix, add entry
- **README_PROJECT_OVERVIEW.md** — update "Deep Analysis Findings" section
- **`.cascade/bug_log.md`** — add/update bug entry
- **`.cascade/file_tracker.md`** — update file status

---

## 7. Auto-Commit Rules

### 7.1 MANDATORY — After EVERY Change

**ПОСЛЕ КАЖДОГО ИЗМЕНЕНИЯ В КОДЕ — КОММИТ. БЕЗ ИСКЛЮЧЕНИЙ.**

### 7.2 When to Commit

1. After fixing a bug → `fix: [BUG-NNN] ...`
2. After optimization → `perf: [PERF-NNN] ...`
3. After adding a test → `test: [TEST-NNN] ...`
4. After documentation update → `docs: ...`
5. After refactoring → `refactor: ...`
6. After security fix → `security: ...`
7. After adding a math model → `math: [MODEL-NNN] ...`
8. After ML work → `ml: ...`
9. After broker integration → `broker: ...`
10. After HFT feature → `hft: ...`
11. After quantum model → `quantum: ...`
12. After ANY file change → `<type>: ...`

### 7.3 Commit Format

```
<type>: <short description>

<what changed>
<why>
<file: path>
<lines: range>
```

### 7.4 Commit Command (PowerShell)

```powershell
git add -A; git commit -m "<type>: <description>"; git push
```

### 7.5 Rules

- **One bug = one commit** (exception: related bugs in same file <1000 lines)
- **NEVER accumulate changes** — changed → commit. Changed another file → commit.
- **NEVER wait for approval** — auto-commit is always allowed
- **NEVER end a response without committing** if any file was modified
- **Max 1000 lines per commit** — split if needed
- **Verify code before commit** — read the changed file
- **PowerShell syntax:** use semicolons (`;`), NOT `&&`

---

## 8. Progress Tracking

### 8.1 Progress File (`.cascade/progress.md`)

Update after every completed task:

```markdown
## Tasks
| # | Date | Task | Status | Commit |
|---|------|------|--------|--------|
| 1 | 2026-08-15 | Fix RSI calculation | ✅ Done | abc1234 |

## Bug Fix Progress
| Bug # | Description | Status | Commit | Date |
|-------|-------------|--------|--------|------|
| 001 | RSI uses SMA instead of EMA | ✅ Fixed | abc1234 | 2026-08-15 |

## Scan Coverage
| Category | Total | Read ✅ | Pending ⏳ |
|----------|-------|--------|------------|
| exchange-simulator/src/ | 56 | 5 | 51 |
| ai-signal-bot/src/ | 100+ | 8 | 92+ |
| hft-trade-bot/src/ | 46 | 3 | 43 |
| web-ui/src/components/ | 197 | 0 | 197 |
```

### 8.2 File Tracker (`.cascade/file_tracker.md`)

Update EVERY TIME you read a new file:
- Change ⏳ → ✅ (or 🔄 if partial)
- Fill in Lines Read and Bugs Found columns

### 8.3 Bug Log (`.cascade/bug_log.md`)

Update EVERY TIME you find or fix a bug:
- Found: Add entry, Status = ⏳ Pending Fix
- Fixing: Status = 🔄 In Progress
- Fixed: Status = ✅ Fixed, add commit hash

### 8.4 Notes (`.cascade/notes.md`)

Update when:
- Discovering important context about the codebase
- Finding a tricky bug or workaround
- Learning a pattern that should be followed
- Identifying a dependency or constraint

---

## 9. Self-Orchestration

### 9.1 Autonomy Levels

| Level | Description | Example |
|-------|-------------|---------|
| L0 | Wait for explicit instruction | "Fix this specific bug" |
| L1 | Read ТЗ, execute, commit | User drops task in `.cascade/tasks/` |
| L2 | Find issues, create tasks, fix them | Discover bug during review, fix it |
| L3 | Evolve project autonomously | Port UI-only models to trading logic |

**Default: L2** — Cascade proactively finds and fixes issues.

### 9.2 Priority Order

1. **Critical bugs** — security vulnerabilities, data loss, crashes
2. **User-requested tasks** — ТЗ from `.cascade/tasks/`
3. **High-priority audit issues** — from `MASTER_DEVELOPMENT_PLAN.md`
4. **Performance** — O(n) → O(1), caching, SIMD
5. **Code quality** — split monolithic files, remove dead code
6. **Missing models** — port UI-only to trading logic (GARCH, Kalman, Copula, etc.)
7. **Documentation** — keep docs in sync, honest readiness
8. **Tests** — add missing tests, improve coverage

### 9.3 When to Stop

- **Stop if unsure** — don't guess, ask the user
- **Stop if change is too large** — >1000 lines, split into multiple tasks
- **Stop if breaking backward compatibility** — discuss with user first
- **Stop if adding new dependencies** — discuss with user first
- **Stop if deleting tests** — tests are sacred
- **Stop if touching security-critical code** — double-check with user

---

## 10. Session Targets

| Metric | Minimum | Target |
|--------|---------|--------|
| Files scanned | 5 | 15+ |
| Bugs found | 20 | 50 |
| Bugs fixed | 20 | 50 |
| Root cause analysis | 100% | 100% |
| 5 approaches | 100% | 100% |
| CHANGELOG updated | 100% | 100% |
| README_PROJECT_OVERVIEW updated | 100% | 100% |
| Commits made | 20 | 50 |

### Quality Over Quantity

- 5 critical bugs well-documented > 50 trivial bugs with poor documentation
- Each fix = root cause + 5 approaches + documentation
- Don't invent bugs to hit the target — find real issues

---

## 11. Workflow Steps

### Step 1: Select File for Analysis

- Choose a file not yet reviewed in this session
- Priority: core files → critical components → high complexity → suspicious code

### Step 2: Deep Read

- Read the ENTIRE file, not just parts
- Read slowly, understand every line
- Understand: purpose, dependencies, data flow, algorithms, data structures

### Step 3: Find Bugs

- Scan for: logic errors, error handling, performance, security, architecture, code smells
- Minimum 20-50 bugs per session

### Step 4: Root Cause Analysis

- Answer 8 questions (section 5.1) for each bug
- ONLY then proceed to fixing

### Step 5: 5 Approaches

- Generate 5 approaches with S/R/C scoring
- Pick the best, document why

### Step 6: Fix

- Fix root cause, not symptom
- Minimal diff, no over-engineering
- Use advanced techniques where appropriate
- Type-safe, secure, performant

### Step 7: Optimize

- Check algorithm complexity (O(n²) → O(n log n) → O(1))
- Check data structures (list → set/dict/deque)
- Check caching opportunities
- Check SIMD/GPU opportunities (C++)

### Step 8: Write Tests

- Regression test for each bug fix
- Test edge cases: None, empty, large input, concurrent
- Test security: injection, bypass, unauthorized

### Step 9: Check Load & Security

- Race conditions? Deadlocks? Memory leaks? Connection leaks?
- SQL injection? XSS? Hardcoded secrets? Missing validation?

### Step 10: Propose Improvements

- Record in `docs/future_development.md`
- Format: title, description, priority, complexity, time estimate, dependencies

### Step 11: Update Documentation

- `CHANGELOG.md` — entry for each change
- `README_PROJECT_OVERVIEW.md` — update findings section
- `.cascade/progress.md` — update progress
- `.cascade/bug_log.md` — update bug status
- `.cascade/file_tracker.md` — update file status

### Step 12: Commit

```
git add -A; git commit -m "<type>: [BUG-NNN] description"; git push
```

### Step 13: Repeat

- Select next file
- Continue until session target met or all files scanned

---

## 12. Product Thinking

### 12.1 This Is a Product, Not a Toy

Think about:
- **Millions of users** — not 10 users in development
- **Thousands of concurrent connections** — WebSocket, SHM IPC
- **Sub-millisecond latency** — HFT requires it
- **99.9% uptime** — less than 9 hours downtime per year
- **Hackers actively trying** — to steal data, manipulate markets, cause outages
- **Regulatory compliance** — financial systems are audited

### 12.2 Load & Scalability

For every component, evaluate:
- How many requests/second can this handle?
- What's the bottleneck? (CPU, memory, DB, network)
- What happens at 10x load? 100x?
- Does it scale horizontally? Vertically?

### 12.3 Security & Leak Prevention

- Are API keys secured?
- Are WebSocket connections authenticated?
- Are trading signals encrypted?
- Is the database protected from injection?
- Are error messages leaking sensitive info?
- Can someone manipulate the simulator to get fake results?

---

## 13. Forbidden Actions (Hard Rules)

1. **Never run terminal commands** (except git commit/push)
2. **Never delete tests**
3. **Never weaken tests** (removing assertions, skipping)
4. **Never add new dependencies** without user approval
5. **Never break backward compatibility**
6. **Never commit secrets, API keys, passwords**
7. **Never force push**
8. **Never disable security checks**
9. **Never use `from x import *`**
10. **Never use bare `except Exception`**
11. **Never use `print()` in production code**
12. **Never use `global` mutable state**
13. **Never create scattered MD files** — consolidate
14. **Never add comments unless asked**
15. **Never implement features without discussion** (unless self-orchestrating known fixes)
16. **Never ignore security** — validate, encrypt, authenticate
17. **Never lie in documentation** — if something doesn't exist, say so
18. **Never skip commits** — changed file → commit. ALWAYS.
19. **Never over-engineer** — simplest solution that works
20. **Never under-engineer** — don't cut corners

---

## 14. File Management

### 14.1 Where Files Go

| Type | Location |
|------|----------|
| ТЗ from user | `.cascade/tasks/` |
| Workflows | `.cascade/workflows/` |
| Progress | `.cascade/progress.md` |
| Notes | `.cascade/notes.md` |
| Bug log | `.cascade/bug_log.md` |
| File tracker | `.cascade/file_tracker.md` |
| Documentation | `docs/` |
| Project docs | root (`README.md`, `CHANGELOG.md`) |
| Internal docs | root (`README_PROJECT_OVERVIEW.md`, `MASTER_DEVELOPMENT_PLAN.md`) — in .gitignore |
| Code | `exchange-simulator/`, `ai-signal-bot/`, `hft-trade-bot/`, `hft-executor/`, `web-ui/` |
| Tests | `tests/` within each component |

### 14.2 File Creation Rules

- Don't create files without a reason
- Don't create scattered MD files — consolidate into existing docs
- Don't create helper scripts — solve in the codebase
- Don't create duplicate files — check if content exists elsewhere

---

## 15. Quick Reference

```
TASK INTAKE → READ ТЗ → ANALYZE (static only) → 5 APPROACHES →
PICK SIMPLEST → CODE CHANGE → CHECKLIST (quality+security+perf) →
VERIFY BY READING → DOCUMENT (CHANGELOG + README + line numbers) →
COMMIT → UPDATE PROGRESS → NEXT FILE →
AT END OF SESSION: FINAL COMMIT WITH STATS
```

### Session Checklist

- [ ] Scanned at least 5 new files
- [ ] Found at least 20 bugs
- [ ] For each bug: root cause analysis (8 questions)
- [ ] For each bug: 5 approaches generated
- [ ] For each bug: best approach selected and documented
- [ ] For each bug: fix applied
- [ ] For each bug: CHANGELOG.md updated
- [ ] For each bug: README_PROJECT_OVERVIEW.md updated
- [ ] For each bug: commit made
- [ ] `.cascade/progress.md` updated
- [ ] `.cascade/bug_log.md` updated
- [ ] `.cascade/file_tracker.md` updated
- [ ] Scan coverage tracked
- [ ] **`git status` shows clean working tree**
- [ ] **`git log` shows all commits with meaningful messages**

---

## 16. Integration With Other Documents

This workflow is used together with:
- **MASTER_DEVELOPMENT_PLAN.md** — plan to 100% readiness
- **README_PROJECT_OVERVIEW.md** — honest project overview
- **docs/future_development.md** — ideas for expansion
- **CHANGELOG.md** — history of changes
- **`.cascade/fix-bugs.md`** — bug fix & feature implementation workflow

---

## 17. Completion Criteria

Workflow is complete when:
- All files in the project have been scanned
- 20-50 bugs found and fixed per session
- **EVERY fix committed** (auto-commit!)
- All optimizations applied and committed
- All tests written and committed
- All improvements recorded in `docs/future_development.md`
- Documentation updated
- **ALL changes committed**
- **`git status` shows clean working tree**
- **`git log` shows all commits with meaningful messages**

---

*This workflow is the law. Follow it or don't touch the code.*
