# OFFICE BOARD — DEVELOPMENT TASKS

> Phase 1 (P1-P3): Code quality & honesty — COMPLETE
> Phase 2 (P4): Documentation fixes — TODO
> Phase 3 (P6): CI/CD & DevOps — TODO
> Phase 4 (P7): Testing & QA — TODO
> Phase 5 (P8): Resume & Portfolio — TODO
> Phase 6 (P5): Future enhancements — BACKLOG

---

## P1-P3 — CODE QUALITY & HONESTY (COMPLETE)

### [01] hft-executor — real WebSocket send via tokio-tungstenite
**Status:** DONE — Real WebSocket, auto-reconnect, fill tracking, 5 unused deps removed

### [02] dpdk_transport.py → socket_transport.py
**Status:** DONE — Renamed, honest docstring, tests updated

### [03] Convert to true HFT mode (<1ms loop)
**Status:** DONE — signal_interval_ms: 1, config-driven poll, cooldown 100ms

### [04] FPGA orderbook — ACADEMIC SKETCH label
**Status:** DONE — False claims removed, limitations documented

### [05] price_predictor.py — ONNX export
**Status:** DONE — Already implemented (export_onnx, opset 17, dynamic batch)

### [06] rl_trader.py — save/load + checkpointing
**Status:** DONE — PPOAgent & DQNAgent save()/load(), RLConfig checkpoint fields

---

## P4 — DOCUMENTATION FIXES

### [07] VP Eng → ALL
**Task:** Integration tests for strategy + risk + backtest pipeline
**Details:**
  - End-to-end: strategy generates signal → risk validates → backtest executes
  - Test with multiple strategies (Trend, MeanRev, Ensemble)
  - Test with extreme market conditions (stress scenarios)
  - Verify equity curve metrics (Sharpe, drawdown, win rate)
**Status:** TODO

### [09] VP Eng → [02] Tech Writer
**Task:** Delete Russian _ru.md files in docs/theory/
**Details:**
  - 6 files still in Russian (English _en.md counterparts exist):
    - ai_slop_lessons_ru.md, hft_architecture_ru.md, module_guide_ru.md
    - project_architecture_ru.md, quant_models_ru.md, useful_info_ru.md
  - Recommended: Delete _ru.md files (avoid duplicate maintenance)
**Status:** TODO

### [10] VP Eng → [02] Tech Writer
**Task:** Fix missing docs/PERFORMANCE.md
**Details:**
  - DEVELOPMENT_GUIDE.md references ../PERFORMANCE.md — broken link
  - Option A: Create PERFORMANCE.md with latency targets & benchmarks
  - Option B: Remove broken link from DEVELOPMENT_GUIDE.md
  - Recommended: Option A (good for resume portfolio)
**Status:** TODO

### [11] VP Eng → [02] Tech Writer
**Task:** Update WEB_UI.md test count
**Details:**
  - WEB_UI.md says "9 files, 60+ tests" — actual: 44 files (40 unit + 4 E2E)
  - Update table to include all test files
  - Reconcile with TESTING.md
**File:** docs/WEB_UI.md
**Status:** TODO

### [12] VP Eng → ALL
**Task:** Code-documentation consistency audit
**Details:**
  - Verify file paths in docs exist
  - Verify config parameter names match YAML files
  - Verify function signatures match source code
  - Verify test counts match actual files
  - Check cross-reference links between doc files
**Status:** TODO

---

## P6 — CI/CD & DEVOPS (NEW)

### [13] VP Eng → [04] DevOps
**Task:** GitHub Actions CI pipeline
**Details:**
  - No CI exists — all tests run manually
  - Create .github/workflows/ci.yml:
    - Python: ruff lint + pytest (ai-signal-bot + exchange_simulator)
    - Rust: cargo build + cargo test (hft-executor)
    - C++: cmake build + doctest (hft-trade-bot)
    - JS: npm run lint + vitest + playwright (web-ui)
  - Matrix: Python 3.12, Ubuntu 22.04 + Windows
  - Cache: pip, cargo, npm, vcpkg
  - Badge in README
**Status:** TODO

### [14] VP Eng → [04] DevOps
**Task:** Docker Compose smoke test
**Details:**
  - docker-compose.yml exists but never tested end-to-end
  - Write script: docker compose up -d → wait for health checks → verify:
    - Exchange Simulator responds on :8765
    - AI Signal Bot responds on :8766
    - HFT Trade Bot responds on :9091
    - Web UI responds on :3000
  - Add as CI step or standalone script
**Status:** TODO

### [15] VP Eng → [04] DevOps
**Task:** Update Cargo.lock after dependency cleanup
**Details:**
  - hft-executor Cargo.toml changed (removed 5 deps, added futures-util)
  - Run: cd hft-executor && cargo update
  - Verify cargo build still works
  - Commit Cargo.lock
**Status:** TODO

---

## P7 — TESTING & QA (NEW)

### [16] VP Eng → [03] QA Eng
**Task:** C++ HFT bot test coverage
**Details:**
  - hft-trade-bot has doctest headers but no test runner CI
  - Verify all doctest headers compile and pass
  - Add test for: config parsing (signal_interval_ms), main loop timing,
    V2 signal generation with 100ms cooldown, SL/TP execution
  - Target: at least 20 doctest cases
**Status:** TODO

### [17] VP Eng → [03] QA Eng
**Task:** Rust executor integration test
**Details:**
  - hft-executor has unit tests but no integration test
  - Add test: spin up mock WebSocket server → create OrderExecutor →
    submit order → verify message received on server side
  - Use tokio-tungstenite server for mock
  - File: hft-executor/tests/integration_test.rs
**Status:** TODO

### [18] VP Eng → [03] ML Eng
**Task:** ML model training smoke test
**Details:**
  - price_predictor.py and rl_trader.py have real implementations
  - Add smoke test: train 1 epoch on synthetic data → verify loss decreases
  - Test ONNX export round-trip: export → load with onnxruntime → compare outputs
  - Test RL checkpoint: save → load → verify weights match
**Status:** TODO

---

## P8 — RESUME & PORTFOLIO (NEW)

### [19] CTO → [01] CEO
**Task:** Write README.md "Architecture Deep Dive" section
**Details:**
  - Current README is good but high-level
  - Add section explaining:
    - Why 3 languages (Python for AI, C++ for HFT, Rust for executor)
    - Why SHM IPC instead of just WebSocket
    - Why PPO for RL (on-policy, stable, good for trading)
    - Why ensemble voting instead of single strategy
    - Latency budget breakdown (1ms loop → 100ms cooldown → WS send)
  - This is the "interview cheat sheet" — what you'd say when asked "explain your architecture"
**Status:** TODO

### [20] CTO → [01] CEO
**Task:** Create architecture diagram (Mermaid or ASCII)
**Details:**
  - Visual showing: Exchange Simulator → WS → AI Signal Bot → SHM → C++ HFT Bot → Rust Executor → Exchange
  - Show data flow: market data → signals → orders → fills
  - Show ports: 8765, 8766, 9091, 3000
  - Add to README.md or docs/ARCHITECTURE.md
**Status:** TODO

### [21] CTO → [01] CEO
**Task:** Prepare interview talking points document
**Details:**
  - 5 key technical decisions and why they were made
  - 3 "gotchas" encountered and how they were solved
  - 2 things you'd do differently next time
  - Performance numbers you can quote (1ms loop, 100ms cooldown, 50 symbols)
  - File: .cascade/interview-prep.md (private, not in repo)
**Status:** TODO

---

## P5 — FUTURE ENHANCEMENTS (BACKLOG)

### [08] CTO → ALL
**Task:** Future enhancements backlog
**Details:**
  - Quantum computing models (QAOA, VQE, QSVM) — theory in TECHNICAL_REFERENCE.md
  - SVI/SABR volatility surface fitting
  - Options strategies with Greeks hedging in live mode
  - LLM-powered signal explanations in production
  - ONNX runtime in C++ signal_engine (consume exported models)
  - Real exchange WebSocket connections (Binance/OKX/Bybit) in C++ bot
  - Prometheus + Grafana dashboards (config exists, dashboards TODO)
**Status:** BACKLOG
