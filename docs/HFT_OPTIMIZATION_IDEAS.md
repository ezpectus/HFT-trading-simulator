# HFT Performance Optimization Ideas

> Audit date: 2026-07-15
> Status: Ideas — not yet implemented. Pick by priority.

---

## 🔴 Critical — Hot Path Latency (C++ main loop)

### O1. Replace `std::mutex` with `Spinlock` in SignalReceiver
- **Problem:** `signal_receiver.h` uses `std::mutex` for all data access (`prices_`, `candle_history_`, `order_books_`). `std::mutex` = syscall on contention (~10-50μs). The main loop calls `get_candles()`, `get_order_book()`, `get_all_prices_into()` every iteration — 3 mutex lock/unlock per symbol per loop.
- **Fix:** Replace `std::mutex` with `Spinlock` (already exists in `utils/low_latency.h`). Critical sections are <1μs (copy small vectors/maps). Spinlock = ~100ns.
- **Impact:** ~50-100μs per loop iteration with 3 symbols.

### O2. Eliminate heap allocations in main loop
- **Problem:** `get_candles()` returns `std::vector<Candle>` by value (heap alloc + copy). `get_order_book()` returns `OrderBook` by value (heap alloc for bids/asks vectors). Called per symbol per loop iteration.
- **Fix:** Add `get_candles_into(symbol, n, preallocated_vector&)` and `get_order_book_into(symbol, preallocated_ob&)` methods that fill pre-allocated buffers. Reuse buffers across loop iterations.
- **Impact:** Eliminates 2×3=6 heap allocations per loop iteration (~20-50μs each on first alloc, fragmentation over time).

### O3. Reduce main loop sleep from 100ms to event-driven
- **Problem:** `main.cpp:742` has `std::this_thread::sleep_for(100ms)`. This means the bot processes signals at most 10x/second. For HFT, this is 100ms of dead latency.
- **Fix:** Replace polling with condition variable notified by `SignalReceiver` on message arrival. Or reduce to 1ms sleep in simulator mode, 0ms (spin) in production with backoff.
- **Impact:** 100ms → <1ms reaction time. **This is the single biggest win.**

### O4. Cache `symbol.c_str()` and `config.symbols` as `const char*` array
- **Problem:** `main.cpp:535` calls `symbol.c_str()` every loop iteration. `config.symbols` is `std::vector<std::string>` — iterating creates string copies.
- **Fix:** Pre-compute `std::array<const char*, MAX_SYMBOLS>` once at startup.
- **Impact:** Minor (~100ns per symbol), but free.

### O5. JSON parse on receive thread, not main loop
- **Problem:** `signal_receiver.h:198` — `json::parse(payload)` happens in the WebSocket callback thread. This is correct (async), but the parsed data is then copied under mutex into maps. The copy is the bottleneck.
- **Fix:** Use `json::parse` with `json::parse(payload, nullptr, false)` for exception-free parsing. Skip malformed messages instead of throwing.
- **Impact:** Eliminates try/catch overhead (~50ns per call) + avoids exception unwinding on bad data.

---

## 🟡 High — Exchange Simulator (Python)

### O6. Cache `generate_order_book` — don't regenerate every tick
- **Problem:** `market_simulator.py:281` — `generate_order_book()` is called 3×3=9 times per broadcast tick (3 exchanges × 3 symbols). Each call does 20 iterations with `rng.random()`, `math.exp()`, `round()`. This is ~180 random calls + 180 exp calls per tick.
- **Fix:** Cache order books and only regenerate when price moves >0.01% or every N ticks. Incremental update: shift levels by price delta, randomize quantities slightly.
- **Impact:** ~90% reduction in order book generation CPU time.

### O7. Pre-serialize JSON with `json.dumps()` optimization
- **Problem:** `websocket_server.py:760` — `json.dumps(message)` serializes the entire broadcast message every tick. With candles, prices, accounts, funding, deltas — this is a large dict.
- **Fix:** Use `orjson` (10x faster than stdlib `json`). Or use `msgpack` for all clients (already supported). At minimum, use `json.dumps(message, separators=(',', ':'))` to skip whitespace.
- **Impact:** orjson: ~5-10x serialization speedup. separators: ~20% smaller payload + ~10% faster.

### O8. Avoid `dict.copy()` in delta computation
- **Problem:** `_compute_orderbook_delta()` creates `current_bids = {l.price: l.quantity for l in bids}` — a new dict per symbol per tick. 9 dict comprehensions per broadcast.
- **Fix:** Maintain persistent price→qty dicts in the OrderBook object itself, update in-place. Only compute diff against last sent.
- **Impact:** Eliminates 9 dict allocations per tick.

### O9. Use `orjson` or `ujson` for all JSON serialization
- **Problem:** stdlib `json` is slow. `orjson` is 10x faster, `ujson` is 3-5x.
- **Fix:** `pip install orjson` + `import orjson; orjson.dumps(message)` → returns bytes directly.
- **Impact:** 5-10x JSON serialization speedup across all Python components.

### O10. Batch `json.dumps` for fills instead of per-fill
- **Problem:** Each fill triggers `json.dumps({"type": "fill", ...})` individually, then sends to each client in a loop.
- **Fix:** Batch fills since last tick, send as `{"type": "fills", "orders": [...]}` in the broadcast message.
- **Impact:** Fewer WebSocket sends, less serialization overhead.

---

## 🟡 High — C++ Memory & Data Structures

### O11. Replace `std::unordered_map<std::string, ...>` with numeric key maps
- **Problem:** `signal_receiver.h` uses `std::unordered_map<std::string, double> prices_`, `std::unordered_map<std::string, std::vector<Candle>> candle_history_`, `std::unordered_map<std::string, OrderBook> order_books_`. String hashing + comparison on every access.
- **Fix:** Assign each symbol a `uint16_t` ID at startup. Use `std::array<T, MAX_SYMBOLS>` or `std::unordered_map<uint16_t, T>`. ~10x faster lookups.
- **Impact:** ~200-500ns per lookup → ~20-50ns. 6 lookups per loop = ~1-3μs saved.

### O12. `position_manager_v2.h` — string concatenation in hot path
- **Problem:** `pos_mgr.on_fill()` does `auto key = symbol + ":" + exchange;` — heap allocation for string concat on every fill.
- **Fix:** Pre-compute keys, or use `std::pair<uint16_t, uint16_t>` (symbol_id, exchange_id) as map key.
- **Impact:** Eliminates heap alloc on fill path.

### O13. `std::sort` in orderbook delta application
- **Problem:** `signal_receiver.h:263` — `std::sort(bids.begin(), bids.end(), ...)` is called every time a NEW level is added via delta. O(n log n) per addition.
- **Fix:** Use `std::lower_bound` + `std::vector::insert` to maintain sorted order (O(n) insertion but no full sort). Or use a sorted container. For 20 levels, insertion sort is faster.
- **Impact:** Minor for 20 levels, but cleaner.

### O14. `system_monitor.h` — `std::to_string` in `format_json()`
- **Problem:** `format_json()` calls `std::to_string()` 14 times, each does heap allocation.
- **Fix:** Use `snprintf` into a pre-allocated char buffer (like `HealthStatus::format_json()` already does).
- **Impact:** Only called on /metrics request, not hot path. Low priority.

---

## 🟢 Medium — Architecture & Protocol

### O15. Binary protocol for C++ ↔ Exchange Simulator
- **Problem:** C++ receives JSON text, parses with nlohmann/json (slow, ~5-10μs per message). MessagePack is 2-5x faster to parse.
- **Fix:** C++ `SignalReceiver` requests `encoding: "msgpack"` in subscribe (already supported by server). Add msgpack parsing in C++ (single-header `msgpack.hpp`).
- **Impact:** 2-5x faster message parsing. ~3-5μs → ~1μs per message.

### O16. Shared memory bypass for market data (skip WebSocket entirely)
- **Problem:** Market data goes: Python → JSON serialize → WebSocket → C++ JSON parse → mutex → maps. This is ~50-100μs end-to-end.
- **Fix:** Use SHM ring buffer for market data (like existing SHM for signals). Python writes candle/OB data directly to shared memory, C++ reads it lock-free.
- **Impact:** <5μs latency. **Eliminates WebSocket for hot path entirely.** WebSocket kept as fallback.

### O17. Thread pinning for main loop
- **Problem:** OS scheduler may migrate the main loop thread between cores, causing cache misses.
- **Fix:** Pin main loop thread to a dedicated core using `pthread_setaffinity_np()`. Already have `pin_thread()` in `low_latency.h`.
- **Impact:** ~10-30% reduction in jitter (variance in loop time).

### O18. CPU isolation for HFT thread (Linux)
- **Problem:** Other threads (WebSocket, logging, health server) compete for CPU time.
- **Fix:** Isolate core 0 for HFT main loop, move WebSocket/health/logging to cores 1-3. Use `isolcpus=0` kernel parameter + `pthread_setaffinity_np()`.
- **Impact:** Eliminates context switches on HFT core. ~5-15% latency improvement.

### O19. Lock-free SPSC queue for signal delivery
- **Problem:** `has_ai_signal` / `arb_lock` use `std::mutex` for signal delivery from WebSocket thread to main loop.
- **Fix:** Use `SpscQueue<Signal>` (already exists in `low_latency.h`) — lock-free single-producer-single-consumer.
- **Impact:** ~500ns → ~10ns per signal delivery.

---

## 🟢 Medium — Python AI Signal Bot

### O20. Vectorize signal generation with NumPy
- **Problem:** Signal strategies iterate candle arrays in Python loops.
- **Fix:** Convert candle arrays to NumPy arrays, use vectorized operations (EMA, RSI, ATR).
- **Impact:** 10-100x faster indicator computation.

### O21. Cache indicator state between ticks
- **Problem:** Indicators (EMA, RSI, ATR) are recomputed from scratch each tick.
- **Fix:** Maintain rolling state (prev_ema, prev_rsi_avg_gain/loss) and update incrementally.
- **Impact:** O(n) → O(1) per tick for each indicator.

---

## 🔵 Low — Build & Compiler

### O22. Enable LTO (Link-Time Optimization) in CMake
- **Problem:** CMake builds with `-O2` but no LTO. Cross-module inlining is missed.
- **Fix:** Add `-flto` to CMAKE_CXX_FLAGS_RELEASE and `-flto` to linker flags.
- **Impact:** 5-15% code size reduction, 2-10% speed improvement from inlining.

### O23. Enable PGO (Profile-Guided Optimization)
- **Problem:** Compiler doesn't know which branches are hot/cold.
- **Fix:** Build with `-fprofile-generate`, run workload, rebuild with `-fprofile-use`.
- **Impact:** 5-20% speed improvement from better branch prediction.

### O24. Use `mimalloc` or `jemalloc` instead of glibc malloc
- **Problem:** Standard malloc has lock contention and fragmentation.
- **Fix:** Link with `mimalloc` (drop-in replacement, thread-local caches).
- **Impact:** 10-30% faster allocations, reduced fragmentation.

### O25. Add `-march=native` to CMake
- **Problem:** Compiler targets generic CPU, misses AVX2/AVX-512 instructions.
- **Fix:** Add `-march=native` to CMAKE_CXX_FLAGS_RELEASE.
- **Impact:** Auto-vectorization for loops in signal engine. 10-30% for math-heavy code.

---

## Priority Ranking

| # | Idea | Impact | Effort | Priority |
|---|------|--------|--------|----------|
| O3 | Event-driven main loop (remove 100ms sleep) | 🔴🔴🔴 | Low | **DO FIRST** |
| O1 | Spinlock instead of mutex in SignalReceiver | 🔴🔴 | Low | **DO SECOND** |
| O2 | Pre-allocated buffers for get_candles/get_order_book | 🔴🔴 | Medium | **DO THIRD** |
| O6 | Cache order book generation in Python | 🟡🟡 | Low | Quick win |
| O7 | `orjson` + `separators` for JSON serialization | 🟡🟡 | Low | Quick win |
| O16 | SHM for market data (bypass WebSocket) | 🔴🔴🔴 | High | Big project |
| O15 | MessagePack for C++ client | 🟡🟡 | Medium | Good ROI |
| O11 | Numeric symbol IDs | 🟡 | Medium | Clean refactor |
| O19 | SPSC queue for signal delivery | 🟡 | Low | Already have infra |
| O17 | Thread pinning | 🟡 | Low | Already have infra |
| O22 | LTO in CMake | 🟢 | Low | Free win |
| O25 | `-march=native` | 🟢 | Low | Free win |
| O24 | mimalloc/jemalloc | 🟢 | Low | Free win |

---

## Quick Wins (can do right now, <30 min each)

1. **O3** — Change `100ms` sleep to `1ms` or condition variable
2. **O7** — Add `separators=(',', ':')` to all `json.dumps()` calls
3. **O22** — Add `-flto` to CMake
4. **O25** — Add `-march=native` to CMake
5. **O17** — Pin main loop thread to core
6. **O19** — Replace mutex signal delivery with SPSC queue

## Big Projects (1-3 days each)

1. **O16** — SHM ring buffer for market data (eliminate WebSocket from hot path)
2. **O2** — Pre-allocated buffer API for SignalReceiver
3. **O11** — Numeric symbol ID system
4. **O15** — MessagePack C++ client
