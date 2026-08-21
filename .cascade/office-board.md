# OFFICE BOARD — DEVELOPMENT TASKS

> Tasks from PROJECT_MEGA_ANALYSIS.txt development roadmap.
> Priority order: P1 (complete skeletons) → P2 (rename) → P3 (strengthen) → P5 (future).

---

## P1 — COMPLETE EXISTING SKELETONS

### [01] CTO → [04] VP Eng
**Task:** hft-executor — implement real WebSocket send via tokio-tungstenite
**Details:**
  - Connect to exchange WebSocket
  - Send serialized orders (not just log them)
  - Receive fill confirmations
  - Remove unused dependencies from Cargo.toml (parking_lot, dashmap, ahash, bytes)
  - Replace crossbeam unbounded with real SPSC
**File:** hft-executor/src/lib.rs
**Status:** DONE — Real tokio-tungstenite WebSocket, auto-reconnect with backoff, fill tracking, removed 5 unused deps, added futures-util

### [02] CTO → [04] VP Eng
**Task:** dpdk_transport.py — renamed to socket_transport.py
**Details:**
  - Renamed to socket_transport.py, removed all DPDK claims from docstring
  - Class renamed: DPDKTransport → SocketTransport
  - Honest docstring: raw UDP socket transport for market data
  - Test file updated: test_socket_transport.py
  - Old files (dpdk_transport.py, test_dpdk_transport.py) need manual deletion
**File:** ai-signal-bot/src/networking/socket_transport.py
**Status:** DONE

---

## P2 — RENAME FOR HONESTY

### [03] CTO → [01] CEO
**Task:** Convert to true HFT mode (<1ms loop)
**Details:**
  - Changed signal_interval_seconds: 60 → signal_interval_ms: 1 in config.yaml
  - Main loop now uses config-driven poll interval (was hardcoded 1000ms)
  - V2 cooldown reduced from 5000ms to 100ms
  - C++ engine now runs in true sub-millisecond HFT mode
  - Backwards compat: signal_interval_seconds still parsed (multiplied by 1000)
**Status:** DONE

### [04] CTO → [04] VP Eng
**Task:** Add "ACADEMIC" label to fpga_orderbook.vhd
**Details:**
  - Replaced misleading header with honest ACADEMIC SKETCH label
  - Documented all known limitations (clock speed, latency, missing files)
  - Removed false claims: "10+ GHz", "Sub-100ns"
**File:** hft-trade-bot/fpga/fpga_orderbook.vhd
**Status:** DONE

---

## P3 — STRENGTHEN REAL MODULES

### [05] VP Eng → [03] ML Eng
**Task:** price_predictor.py — ONNX export for C++ inference
**Details:**
  - export_onnx() function already exists (line 309)
  - Supports both LSTM and Transformer models
  - Dynamic batch axes, opset 17, constant folding
**File:** ai-signal-bot/src/ml/price_predictor.py
**Status:** DONE — already implemented

### [06] VP Eng → [03] ML Eng
**Task:** rl_trader.py — add model save/load, checkpointing
**Details:**
  - PPOAgent.save()/load() — model + optimizer state + episode metadata
  - DQNAgent.save()/load() — Q-networks + optimizer + epsilon + step_count
  - RLConfig: checkpoint_interval, checkpoint_dir fields added
  - Both agents return episode number from load() for resume training
**File:** ai-signal-bot/src/ml/rl_trader.py
**Status:** DONE

### [07] VP Eng → ALL
**Task:** Add integration tests for strategy + risk + backtest pipeline
**Details:**
  - End-to-end: strategy generates signal → risk validates → backtest executes
  - Test with multiple strategies, verify equity curve metrics
  - Test with extreme market conditions (stress scenarios)
**Status:** TODO

---

## P4 — DOCUMENTATION FIXES (identified during docs review)

### [09] VP Eng → [02] Tech Writer
**Task:** Translate remaining Russian files in docs/theory/
**Details:**
  - 6 files still in Russian:
    - ai_slop_lessons_ru.md (132KB)
    - hft_architecture_ru.md (138KB)
    - module_guide_ru.md (162KB)
    - project_architecture_ru.md (141KB)
    - quant_models_ru.md (160KB)
    - useful_info_ru.md (128KB)
  - English versions already exist (_en.md counterparts)
  - Option A: Translate _ru.md files to English
  - Option B: Delete _ru.md files if _en.md versions are authoritative
  - Recommended: Option B (avoid duplicate maintenance)
**Status:** TODO

### [10] VP Eng → [02] Tech Writer
**Task:** Create missing docs/PERFORMANCE.md
**Details:**
  - DEVELOPMENT_GUIDE.md references ../PERFORMANCE.md in See Also section
  - File does not exist — broken link
  - Create performance documentation covering:
    - Python signal bot latency (~50ms target)
    - C++ HFT engine latency (~15us target)
    - Web UI render performance (204 lazy-loaded panels)
    - SHM IPC latency (~10-50us)
    - WebSocket latency (~1-5ms)
    - Benchmark methodology and results
  - Or remove the broken link from DEVELOPMENT_GUIDE.md
**Status:** TODO

### [11] VP Eng → [02] Tech Writer
**Task:** Update WEB_UI.md test count — outdated
**Details:**
  - WEB_UI.md says "9 files, 60+ tests" (line 376)
  - Actual: 40 unit test files + 4 E2E spec files = 44 total
  - Table only lists 9 test files — missing 31 unit test files
  - Update table to include all 40 unit test files
  - Reconcile with TESTING.md which correctly says 44 files
**File:** docs/WEB_UI.md
**Status:** TODO

### [12] VP Eng → ALL
**Task:** Code-documentation consistency audit
**Details:**
  - Verify all file paths referenced in docs/ actually exist
  - Verify config parameter names in docs match actual YAML files
  - Verify function signatures in docs match actual source code
  - Verify test file counts in TESTING.md match actual test files
  - Check all cross-reference links between doc files are valid
  - Run as automated script if possible (grep + file existence check)
**Status:** TODO

---

## P5 — FUTURE ENHANCEMENTS

### [08] CTO → ALL
**Task:** Future enhancements backlog
**Details:**
  - Quantum computing models (QAOA, VQE, QSVM) — theory documented in TECHNICAL_REFERENCE.md
  - SVI/SABR volatility surface fitting
  - Options strategies with Greeks hedging in live mode
  - LLM-powered signal explanations in production
**Status:** BACKLOG
