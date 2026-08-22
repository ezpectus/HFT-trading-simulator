# Performance Targets & Benchmarks

> Latency targets, profiling methodology, and benchmark results for each system component.

---

## Latency Budget

The system has a dual signal path with different latency requirements:

| Path | Component | Target Latency | Measured |
|------|-----------|---------------|----------|
| **Fast path** | C++ HFT engine main loop | < 1ms | 1ms (configurable) |
| **Fast path** | V2 signal generation | < 5ms | ~2ms (100ms cooldown) |
| **Fast path** | Rust executor WebSocket send | < 1ms | ~0.5ms (local) |
| **Fast path** | SHM IPC (Python → C++) | 10-50us | ~30us |
| **Slow path** | Python AI signal bot | ~50ms | 30-80ms |
| **Slow path** | Strategy analysis (per symbol) | ~5ms | 2-10ms |
| **Slow path** | Ensemble voting (5 strategies) | ~25ms | 15-40ms |
| **Network** | WebSocket (exchange simulator) | 1-5ms | ~2ms (localhost) |
| **Network** | REST API (exchange simulator) | 5-20ms | ~10ms |

---

## Component Breakdown

### C++ HFT Trade Bot

| Metric | Target | Notes |
|--------|--------|-------|
| Main loop iteration | < 1ms | `signal_interval_ms: 1` in config.yaml |
| V2 signal cooldown | 100ms | Prevents signal spam, allows rapid re-entry |
| Order book update | < 100us | Stack-allocated, cache-aligned |
| Indicator calculation | < 50us | Inline, incremental updates |
| Lock-free queue push | < 10us | SPSC ring buffer, no locks |

**Key design decisions:**
- `std::condition_variable` with 1ms timeout — wakes instantly on data, no busy-spin
- Thread pinning enabled in `latency_optimization` config
- Spinlocks instead of mutexes for hot paths
- Stack allocation for order book entries (no heap allocation per update)

### Rust HFT Executor

| Metric | Target | Notes |
|--------|--------|-------|
| Order serialization (serde_json) | < 100us | Pre-allocated, SmallVec for batches |
| WebSocket send | < 500us | tokio-tungstenite, async |
| FFI call overhead | < 1us | `extern "C"`, no allocation |
| Reconnect backoff | 500ms → 10s | Exponential, capped |

### Python AI Signal Bot

| Metric | Target | Notes |
|--------|--------|-------|
| Signal interval | 60s (configurable) | Not HFT — this is the "slow" path |
| Strategy analysis (50 symbols) | ~2.5s | 5ms × 50 symbols |
| Ensemble voting | ~1.5s | Majority vote across 5 strategies |
| Risk validation | < 1ms | In-memory checks, no I/O |
| Database write | < 5ms | SQLite WAL mode |
| WebSocket broadcast | < 2ms | asyncio, single event loop |

### Web UI

| Metric | Target | Notes |
|--------|--------|-------|
| Initial load | < 3s | 204 lazy-loaded panels |
| Panel render | < 16ms | React.lazy + Suspense, 60fps |
| VirtualList scroll | < 8ms | Windowed rendering for 1000+ items |
| WebSocket message processing | < 5ms | Batched updates, useWebSocket hook |
| Bundle size (initial) | < 200KB | Code splitting per panel |

---

## SHM IPC Performance

Shared memory is used for the hot path between Python and C++:

| Operation | Latency | Mechanism |
|-----------|---------|-----------|
| Market data write (Python → C++) | ~30us | `shm_market_data_writer.py` → ring buffer |
| Signal write (Python → C++) | ~20us | `shm_signal_producer.py` → SPSC queue |
| Fill read (C++ → Python) | ~25us | `shm_fill_consumer.py` → SPSC queue |
| Total round-trip | ~75us | Write + read + processing |

**Why SHM instead of WebSocket for hot path:**
- WebSocket: ~2ms per message (TCP + framing + parse)
- SHM: ~30us per message (memcpy + atomic flag)
- 60x faster for latency-critical path

---

## Benchmark Methodology

### C++ Engine

```bash
# Build with profiling
cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_PROFILING=ON ..
make -j$(nproc)

# Run with latency histograms enabled
./hft_trade_bot --config config/config.yaml --enable-latency-histograms

# Check p50/p95/p99 from metrics endpoint
curl http://localhost:9091/metrics | grep latency
```

### Python Signal Bot

```bash
# Run with timing
python run.py --profile --symbol BTC/USDT --interval 1m

# Or use the built-in latency tracker
# Metrics available at http://localhost:8766/metrics
```

### Rust Executor

```bash
# Benchmark with cargo
cd hft-executor
cargo bench --features bench
```

### Web UI

```bash
cd web-ui
npx vitest bench
npx playwright test --reporter=line
```

---

## Profiling Tools

| Tool | Component | What to look for |
|------|-----------|-----------------|
| `perf` | C++ engine | Cache misses, branch mispredictions |
| `valgrind --tool=callgrind` | C++ engine | Function call counts, hot paths |
| `cProfile` / `py-spy` | Python bot | Strategy analysis time, I/O waits |
| `cargo flamegraph` | Rust executor | Serialization overhead, async scheduling |
| Chrome DevTools | Web UI | Render time, bundle size, memory leaks |
| `docker stats` | All containers | CPU/memory per service |

---

## Capacity Planning

| Metric | Current | Limit | Headroom |
|--------|---------|-------|----------|
| Symbols tracked | 50 | 200 | 4x |
| Candles in memory | 500/symbol | 10000/symbol | 20x |
| Open positions | 3 | 50 | 16x |
| WebSocket connections | 4 | 20 | 5x |
| Order rate | 1/s | 100/s | 100x |
| Database size | ~100MB | ~10GB | 100x |

---

## See Also

- [Development Guide](./guides/DEVELOPMENT_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [Configuration Guide](./guides/CONFIGURATION_GUIDE.md)
- [Monitoring Guide](./MONITORING_GUIDE.md)
