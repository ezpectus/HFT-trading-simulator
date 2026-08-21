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
**Status:** TODO

### [02] CTO → [04] VP Eng
**Task:** dpdk_transport.py — either implement real DPDK or rename
**Details:**
  - Currently: _DPDK_AVAILABLE = False, falls back to raw sockets
  - Option A: Implement real DPDK (kernel bypass, huge pages, zero-copy)
  - Option B: Rename to socket_transport.py, remove DPDK claims from docstring
  - Recommended: Option B (honest naming)
**File:** ai-signal-bot/src/networking/dpdk_transport.py
**Status:** TODO

---

## P2 — RENAME FOR HONESTY

### [03] CTO → [01] CEO
**Task:** Rename "HFT" to "MFT" in documentation
**Details:**
  - Signal interval = 60 seconds, not microseconds
  - This is MFT (Medium-Frequency Trading) with HFT-style C++ engine
  - Either rename to MFT, or reduce signal interval to < 1ms and use C++ engine natively
**Status:** TODO

### [04] CTO → [04] VP Eng
**Task:** Add "PROTOTYPE" or "ACADEMIC" label to fpga_orderbook.vhd
**Details:**
  - "10+ GHz" claim is fantasy (UltraScale+ runs ~500MHz-1GHz)
  - for loop shift in clocked process = 255 clock cycles
  - No testbench, no .xdc, no .tcl
  - Label honestly as academic sketch, not production prototype
**File:** hft-trade-bot/fpga/fpga_orderbook.vhd
**Status:** TODO

---

## P3 — STRENGTHEN REAL MODULES

### [05] VP Eng → [03] ML Eng
**Task:** price_predictor.py — add ONNX export for C++ inference
**Details:**
  - Real PyTorch LSTM/Transformer already works
  - Need: torch.onnx.export() for C++ inference in Signal Engine
  - Add ONNX runtime loading in C++ signal_engine
**File:** ai-signal-bot/src/ml/price_predictor.py
**Status:** TODO

### [06] VP Eng → [03] ML Eng
**Task:** rl_trader.py — add model save/load, checkpointing
**Details:**
  - Real PPO with ActorCritic, GAE, clip objective already works
  - Need: torch.save()/torch.load() for model persistence
  - Add checkpoint interval and resume from checkpoint
**File:** ai-signal-bot/src/ml/rl_trader.py
**Status:** TODO

### [07] VP Eng → ALL
**Task:** Add integration tests for strategy + risk + backtest pipeline
**Details:**
  - End-to-end: strategy generates signal → risk validates → backtest executes
  - Test with multiple strategies, verify equity curve metrics
  - Test with extreme market conditions (stress scenarios)
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
