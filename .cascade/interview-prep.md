# Interview Prep — HFT Trading System

> Private document for interview preparation. Not committed to the repo.

---

## 5 Key Technical Decisions

### 1. Three languages (Python + C++ + Rust) instead of one
**Why:** Each language is optimized for its task. Python has the best ML ecosystem (PyTorch, scikit-learn). C++ gives sub-millisecond latency with zero-allocation hot paths. Rust provides memory-safe FFI for order execution without GC pauses.
**Trade-off:** More complex deployment and IPC, but latency requirements make this necessary.

### 2. SHM IPC instead of WebSocket for hot path
**Why:** WebSocket is ~2ms per message (TCP + framing + JSON parse). SHM is ~30us (memcpy + atomic flag). 60x faster.
**Trade-off:** Platform-specific code (Windows CreateFileMappingW vs POSIX shm_open), but the latency gain is critical for HFT.

### 3. Ensemble voting instead of single strategy
**Why:** No single strategy works in all market regimes. Trend Following fails in ranging markets. Mean Reversion fails in trending markets. Ensemble voting combines 5 strategies — when 3+ agree, confidence is higher than any individual.
**Trade-off:** More computation per signal, but ensemble voting is ~2us (single-pass accumulator).

### 4. PPO instead of DQN for RL
**Why:** PPO is on-policy — adapts faster to non-stationary markets. Clipped objective prevents catastrophic policy updates. Simpler training loop (no replay buffer).
**Trade-off:** Less sample-efficient than DQN, but both are implemented for comparison.

### 5. Signal Engine V2 with 100ms cooldown instead of continuous signals
**Why:** Without cooldown, the engine generates signals every tick (~1ms), leading to excessive order spam. 100ms cooldown allows rapid re-entry while preventing duplicate orders.
**Trade-off:** May miss very short opportunities, but reduces false signals and exchange fees.

---

## 3 Gotchas Encountered and Solutions

### 1. websocketpp C++20 incompatibility
**Problem:** websocketpp uses C++17 template syntax that breaks in C++20 mode.
**Solution:** Patched the system headers in CI (`sed` to remove template-id in constructor/destructor). This is a known issue with the library being abandoned.

### 2. SHM IPC on Windows vs Linux
**Problem:** Windows uses `CreateFileMappingW` with a tagname, Linux uses `shm_open` with a path. Completely different APIs.
**Solution:** Auto-detect platform in the C++ code with `#ifdef _WIN32`. Python SHM uses `mmap` with `tagname` parameter on Windows.

### 3. Rust FFI lifetime management
**Problem:** The C++ side holds a `void*` to the Rust `OrderExecutor`. If the Rust side drops it, use-after-free.
**Solution:** `Box::into_raw` on create, `Box::from_raw` + drop on destroy. The C++ side must call `hft_executor_destroy` — documented in the FFI header.

---

## 2 Things I'd Do Differently

### 1. Use shared protobuf instead of raw JSON for IPC
JSON serialization is ~50us per message. Protobuf would be ~5us. For the hot path, this matters. The current SHM path uses packed structs (fast), but the WebSocket paths still use JSON.

### 2. Start with CI from day one
The project had 200+ test files but no CI pipeline until late. Adding CI retroactively required fixing many lint issues at once. Starting with CI from day one would have caught issues incrementally.

---

## Performance Numbers to Quote

| Metric | Value | Context |
|--------|-------|---------|
| C++ main loop | 1ms | Configurable via `signal_interval_ms` |
| V2 signal cooldown | 100ms | Prevents signal spam |
| SHM IPC latency | ~30us | Python → C++ signal path |
| C++ signal generation (p50) | < 10us | V2/V3 engine, incremental cache |
| C++ total loop (p50) | < 100us | Signal + risk + order per symbol |
| WebSocket throughput | ~1,000 msg/s | Exchange simulator broadcast |
| Price feed latency p95 | ~42ms | Target: < 50ms (ACHIEVED) |
| API call reduction | 80% | 50 → 10 calls for 50 symbols |
| Cache hit rate | 96% | TTLCache with 1000 entries |
| Test files | 208 total | 118 Python, 46 C++, 44 JS |
| Panel count | 204 | React lazy-loaded |
| Math models | 44 in trading logic | + 40 UI-only educational |
| Symbols | 50+ | BTC, ETH, SOL, BNB, ADA... |
| CI jobs | 18 | Lint, test, build, security, E2E, Docker |

---

## Elevator Pitch (30 seconds)

"I built an educational HFT trading simulator with a polyglot architecture: Python for AI signal generation with 19 strategies and ML models, C++20 for sub-millisecond order execution with lock-free queues and SHM IPC, Rust for memory-safe order execution via WebSocket, and a React 18 dashboard with 204 lazy-loaded panels. The system trades 50+ crypto symbols on a simulated exchange with realistic microstructure models — GBM, Heston, Merton jumps, and Markov regime switching. It has 208 test files, 18 CI jobs, and Docker Compose orchestration with health checks."

---

## Common Interview Questions

### "Explain your architecture"
Start with the data flow: Exchange Simulator → (WebSocket) → AI Signal Bot → (SHM IPC) → C++ HFT Bot → (FFI) → Rust Executor → (WebSocket) → Exchange. Then explain why each language was chosen and the latency budget.

### "What's the hardest part?"
The SHM IPC between Python and C++ — different memory models, platform-specific APIs (Windows vs Linux), and ensuring zero-copy with proper synchronization (atomic flags, not mutexes).

### "How do you test this?"
208 test files across 3 languages. Python: pytest with 118 files. C++: doctest with 46 files. JS: Vitest + Playwright with 44 files. CI runs 18 jobs including Docker Compose smoke test.

### "What would you improve?"
Protobuf instead of JSON for IPC. Real exchange connections (Binance/OKX WebSocket). Prometheus + Grafana dashboards (config exists, dashboards are TODO).

### "Is this production-ready?"
No — it's an educational simulator. No real money, no real exchange. But the architecture, latency optimization techniques, and testing discipline are production-grade.

---

## BAD CODE vs GOOD CODE — Examples for Interview

> These are real examples from the codebase. Use them to show you understand what makes code bad at scale and why the good version matters when you have many users and a large system.

---

### Example 1: Silent Exception Swallowing (Database)

**BAD** — `ai-signal-bot/src/database/db.py:27-34`:
```python
def close(self) -> None:
    """Close database and release WAL file locks (Windows-safe)."""
    try:
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("PRAGMA journal_mode=DELETE")
    except Exception:
        pass  # ← silently swallows ALL errors
```

**GOOD**:
```python
def close(self) -> None:
    """Close database and release WAL file locks (Windows-safe)."""
    try:
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("PRAGMA journal_mode=DELETE")
    except (sqlite3.OperationalError, sqlite3.DatabaseError) as e:
        logger.warning(f"DB checkpoint failed on close: {e}")
```

**Why it matters at scale:** With `except Exception: pass`, if the WAL checkpoint fails (disk full, corruption, permissions), you never know. The database silently stays in WAL mode, the WAL file grows unbounded, and eventually the system runs out of disk. With 1000 users, that's 1000 silent corruptions. The good version narrows the exception to SQLite-specific errors and logs them — you can alert on `DB checkpoint failed` and fix the root cause before it cascades.

---

### Example 2: Redundant Exception in Tuple (Feature Store)

**BAD** — `ai-signal-bot/src/ml/feature_store.py:94`:
```python
except (OSError, ConnectionError, RuntimeError, Exception) as e:
    logger.warning(f"[FeatureStore] Redis connection failed: {e} — using in-memory")
```

**GOOD**:
```python
except (OSError, ConnectionError, redis.exceptions.RedisError) as e:
    logger.warning(f"[FeatureStore] Redis connection failed: {e} — using in-memory")
```

**Why it matters at scale:** `Exception` in the tuple catches EVERYTHING — including `KeyboardInterrupt`, `SystemExit`, `MemoryError`, `RecursionError`. In a large system, catching `MemoryError` and continuing silently means the process keeps running in a degraded state, potentially corrupting data. The good version catches only the specific exceptions that Redis connections can throw, letting truly fatal errors propagate and crash the process (which K8s will restart).

---

### Example 3: f-string in Logger (Performance)

**BAD** — ~80+ calls across `src/`:
```python
logger.debug(f"Signal: {signal.symbol} dir={signal.direction} conf={signal.confidence:.4f} "
             f"entry={signal.entry_price} sl={signal.stop_loss} tp={signal.take_profit} "
             f"strategy={signal.strategy} reason={signal.reason}")
```

**GOOD**:
```python
logger.debug("Signal: %s dir=%s conf=%.4f entry=%s sl=%s tp=%s strategy=%s reason=%s",
             signal.symbol, signal.direction, signal.confidence,
             signal.entry_price, signal.stop_loss, signal.take_profit,
             signal.strategy, signal.reason)
```

**Why it matters at scale:** f-strings are evaluated eagerly — the string is formatted EVERY time, even if DEBUG logging is disabled. With 50 symbols × 5 strategies × 60s interval = 250 calls/min, that's 250 unnecessary string format operations per minute. In a high-frequency system with 1000 users, that's 250k wasted format operations/min. The good version uses lazy `%s` formatting — the string is only formatted if the log level is enabled. The args are just passed as a tuple, and the logger decides whether to format them.

---

### Example 4: Missing `encoding=` on `open()` (Cross-Platform)

**BAD** — 7 files including `fix_client.py:151`, `model_registry.py:95`:
```python
with open(self.seq_file) as f:
    parts = f.read().strip().split()
```

**GOOD**:
```python
with open(self.seq_file, encoding="utf-8") as f:
    parts = f.read().strip().split()
```

**Why it matters at scale:** Without `encoding=`, Python uses the system default — `cp1252` on English Windows, `cp1251` on Russian Windows, `utf-8` on Linux. A JSON file with a symbol like "BTC/USDT" works everywhere, but add a strategy name with a Unicode character (e.g., "Mean Reversion α") and it crashes on Windows with `UnicodeDecodeError`. In a team with developers on different OSes, this causes "works on my machine" bugs. The good version is explicit — `utf-8` everywhere, regardless of OS.

---

### Example 5: Hardcoded localhost (Docker/K8s)

**BAD** — `ws_client.py`, `exchange_factory.py`, `price_monitor.py`:
```python
ws_url = "ws://localhost:8765"  # ← hardcoded
```

**GOOD**:
```python
ws_url = os.getenv("EXCHANGE_WS_URL", "ws://localhost:8765")
```

**Why it matters at scale:** In Docker Compose, the exchange simulator is at `ws://exchange-simulator:8765`, not `localhost`. In K8s, it's a service DNS name. With hardcoded `localhost`, the bot works on your laptop but crashes in any containerized environment. With 1000 users deploying via Docker, 1000 bots fail to connect. The good version defaults to localhost for development but allows override via environment variable for production.

---

### Example 6: No Idempotency on Orders (Financial Risk)

**BAD** — `ws_client.py submit_order`:
```python
order_msg = {
    "type": "order",
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
}
await self._ws.send(json.dumps(order_msg))
# Network blip → retry → exchange receives TWICE → double position
```

**GOOD**:
```python
import uuid

order_msg = {
    "type": "order",
    "client_order_id": str(uuid.uuid4()),  # idempotency key
    "exchange": exchange,
    "symbol": symbol,
    "side": side,
    "quantity": quantity,
    "order_type": "MARKET",
}
await self._ws.send(json.dumps(order_msg))
# Exchange: if client_order_id seen before → return original result, don't execute again
```

**Why it matters at scale:** In trading, a retry without idempotency = real money lost. Network hiccups happen — TCP resets, WS disconnects, timeouts. If you retry a market order and the exchange executes both, you're now long 2× the intended size. With 1000 users each trading 50 symbols, a single network blip could cause 50,000 unintended orders. `client_order_id` is the standard solution — Binance, Coinbase, Kraken all support it. The exchange deduplicates on their side.

---

### Example 7: No Graceful Shutdown (Container Orchestration)

**BAD** — `run.py`:
```python
try:
    while self._running:
        await asyncio.sleep(self.config.signal_interval)
        await self._generate_signals()
except KeyboardInterrupt:
    self.logger.info("Stopping...")
finally:
    self._running = False
```

**GOOD**:
```python
import signal

def _install_signal_handlers(self) -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, self._request_shutdown)

def _request_shutdown(self) -> None:
    self.logger.info("Shutdown requested — draining...")
    self._running = False

async def run(self):
    self._install_signal_handlers()
    try:
        while self._running:
            await asyncio.sleep(self.config.signal_interval)
            await self._generate_signals()
    finally:
        await self._drain()  # close WS, save state, checkpoint DB
```

**Why it matters at scale:** `docker stop` sends SIGTERM, not KeyboardInterrupt. Without a SIGTERM handler, Docker waits 10 seconds, then sends SIGKILL. The process is killed instantly — no `finally` block, no state save, no DB checkpoint. In K8s, pod termination sends SIGTERM — same problem. With 1000 users on K8s, every rolling update loses in-flight signals and corrupts the equity curve. The good version catches SIGTERM, stops accepting new work, drains pending operations, saves state, and exits cleanly.

---

### Example 8: Metric Name Mismatch (Alerts Never Fire)

**BAD** — alert rules vs code:
```yaml
# monitoring/alerts/alerts.yml
expr: ai_signal_bot_signal_generation_latency_seconds > 0.1
```
```python
# monitoring/metrics.py
self.signal_latency = Histogram(
    "trading_signal_latency_seconds", ...)  # ← different name!
```

**GOOD** — same name everywhere:
```yaml
# monitoring/alerts/alerts.yml
expr: ai_signal_bot_signal_generation_latency_seconds > 0.1
```
```python
# monitoring/metrics.py
self.signal_latency = Histogram(
    "ai_signal_bot_signal_generation_latency_seconds", ...)
```

**Why it matters at scale:** Prometheus doesn't error on non-existent metrics in alert rules — it just waits for data that never comes. The alert silently never fires. You think you're monitoring signal latency, but you're not. In a large system with 50+ alerts, you can't manually verify each one. The good version ensures the metric name in code matches the alert rule exactly. Best practice: use `promtool check rules` in CI to catch mismatches.

---

### Example 9: No Backpressure on Broadcast

**BAD** — `signal_publisher.py broadcast_signal`:
```python
async def broadcast_signal(self, signal: dict) -> None:
    if not self.circuit_breaker.allow_signal():
        return
    msg = json.dumps(signal)
    await asyncio.gather(
        *[ws.send(msg) for ws in self._clients],
        return_exceptions=True
    )
    # ← no limit on concurrent sends, no queue, no drop policy
```

**GOOD**:
```python
async def broadcast_signal(self, signal: dict) -> None:
    if not self.circuit_breaker.allow_signal():
        return
    msg = json.dumps(signal)
    # Drop slow clients — don't let them block the hot path
    sends = []
    for ws in list(self._clients):
        try:
            sends.append(asyncio.wait_for(ws.send(msg), timeout=0.5))
        except (ConnectionError, asyncio.TimeoutError):
            self._clients.discard(ws)
    await asyncio.gather(*sends, return_exceptions=True)
```

**Why it matters at scale:** Without backpressure, one slow client (e.g., HFT bot on a congested network) blocks `asyncio.gather` — all other clients wait for the slowest one. In a system with 100 HFT clients, one slow client delays signals to all 99 others. The good version adds a per-client timeout — slow clients are dropped, fast clients get their signals immediately. This is critical for HFT where milliseconds matter.

---

### Example 10: Code Duplication — Position Sizing

**BAD** — same logic in `backtester.py` and `run.py`:
```python
# backtester.py _open_position
risk_amount = balance * self.risk_per_trade_pct / 100
risk_per_unit = abs(fill_price - signal.stop_loss)
quantity = risk_amount / risk_per_unit
max_qty = balance * self.max_position_pct / 100 / fill_price
quantity = min(quantity, max_qty)

# run.py _execute_paper_order — SAME LOGIC, different param names
risk_amount = balance * self.config.max_risk_pct / 100
risk_per_unit = abs(signal.entry_price - signal.stop_loss)
quantity = risk_amount / risk_per_unit
max_qty = balance * self.config.max_position_size_pct / 100 / signal.entry_price
quantity = min(quantity, max_qty)
```

**GOOD** — one function, one source of truth:
```python
# src/utils/position_sizing.py
def calculate_position_size(balance: float, entry_price: float, stop_loss: float,
                            risk_pct: float, max_position_pct: float) -> float:
    risk_amount = balance * risk_pct / 100
    risk_per_unit = abs(entry_price - stop_loss)
    if risk_per_unit <= 0:
        return 0.0
    quantity = risk_amount / risk_per_unit
    max_qty = balance * max_position_pct / 100 / entry_price if entry_price > 0 else 0
    return min(quantity, max_qty)

# backtester.py
from src.utils.position_sizing import calculate_position_size
quantity = calculate_position_size(balance, fill_price, signal.stop_loss,
                                   self.risk_per_trade_pct, self.max_position_pct)

# run.py
from src.utils.position_sizing import calculate_position_size
quantity = calculate_position_size(balance, signal.entry_price, signal.stop_loss,
                                   self.config.max_risk_pct, self.config.max_position_size_pct)
```

**Why it matters at scale:** Two copies = two places for bugs. If you fix a rounding error in one but forget the other, backtest results diverge from live trading. In a large system, you might have 10 places doing position sizing — each slightly different. The good version has one function, one test, one place to fix bugs. When the risk formula changes, it changes everywhere automatically.

---

### Example 11: No Indicator Caching (Performance)

**BAD** — full recalculation every cycle:
```python
# strategies.py analyze() — called 250 times/minute
closes = [c["close"] for c in candles]  # 200 candles
ema_f = ema(closes, self.ema_fast)      # O(N) = 200 ops
ema_s = ema(closes, self.ema_slow)      # O(N) = 200 ops
adx_vals = adx(candles, 14)             # O(N) = 200 ops
atr_vals = atr(candles, 14)             # O(N) = 200 ops
# Total: 250 × 4 × 200 = 200,000 ops/min
```

**GOOD** — incremental O(1) update:
```python
class IndicatorCache:
    def __init__(self, period: int):
        self._ema: float | None = None
        self._alpha = 2 / (period + 1)

    def update(self, price: float) -> float:
        if self._ema is None:
            self._ema = price
        else:
            self._ema = self._alpha * price + (1 - self._alpha) * self._ema
        return self._ema

# Total: 250 × 4 × 1 = 1,000 ops/min (200× faster)
```

**Why it matters at scale:** EMA has a closed-form incremental update: `EMA_new = α·price + (1-α)·EMA_old`. One multiplication, one addition — O(1). Without caching, you recalculate the entire 200-candle window every time. In a system with 1000 symbols × 10 strategies, that's 8 million ops/min wasted. The good version updates incrementally — only the new candle is processed. 200× speedup, same results.

---

### Example 12: Dead Parameter (AI Slop)

**BAD** — `scripts/run_bot.py:31`:
```python
publisher = SignalPublisher(ws_port=config.get("websocket_port", 8766))
# ↑ ws_port doesn't exist in SignalPublisher.__init__!
# Real signature: def __init__(self, host: str = "0.0.0.0", port: int = 8766)
# This will crash with TypeError: unexpected keyword argument 'ws_port'
```

**GOOD**:
```python
publisher = SignalPublisher(
    host="0.0.0.0",
    port=int(config.get("websocket_port", 8766))
)
```

**Why it matters at scale:** This is classic AI-generated code that was never run. The parameter name "sounds right" but doesn't match the actual API. In a large codebase, dead code like this accumulates — scripts that crash on first run, imports that fail, parameters that don't exist. The good version matches the actual signature. Always run every script at least once before committing.

---

## INTERVIEW TALKING POINTS — Reliability

### "What reliability patterns did you implement?"
- **CircuitBreaker** — 5 consecutive losing signals → stop trading, cooldown, half-open recovery
- **CancelledError handling** — 10 async modules properly cancel tasks on shutdown
- **WAL mode SQLite** — concurrent read/write without blocking
- **Connection pooling** — aiohttp TCPConnector with 100 connections per host
- **Rate limiting** — BinanceAPI: 1200 req/min, CoinbaseAPI: 1000 req/min

### "What reliability patterns are MISSING?"
- **SIGTERM handler** — only KeyboardInterrupt, not Docker/K8s signals
- **Idempotency on orders** — no `client_order_id`, retry = double order
- **Backpressure** — SignalPublisher broadcasts without per-client timeout
- **Indicator caching** — 200× wasted computation per cycle
- **Metric/alert name mismatch** — alerts silently never fire
- **Schema validation** — WS messages accepted as raw JSON without validation
- **DB partitioning** — equity_curve grows unbounded, no retention

### "How would you make this production-ready?"
1. Add SIGTERM handler → graceful drain → save state → exit 0
2. Add `client_order_id` to all order submissions
3. Add per-client broadcast timeout (drop slow clients)
4. Unify metric names with alert rules
5. Add pydantic schemas for WS messages
6. Add indicator cache (EMA/RSI/ADX incremental updates)
7. Partition equity_curve by month, add retention policy
8. Switch from SQLite to PostgreSQL with TimescaleDB for time-series data

---

### Example 13: Race Condition on Shared Set (Concurrency)

**BAD** — `signal_publisher.py`:
```python
class SignalPublisher:
    def __init__(self):
        self._clients: set = set()  # ← shared mutable state, no lock

    async def _handle_client(self, ws):
        self._clients.add(ws)       # ← modify
        # ... await messages ...
        self._clients.discard(ws)   # ← modify

    async def broadcast_signal(self, signal):
        msg = json.dumps(signal)
        await asyncio.gather(
            *[ws.send(msg) for ws in self._clients],  # ← iterate
            return_exceptions=True
        )
        self._clients -= disconnected  # ← modify during potential iteration
```

**GOOD**:
```python
class SignalPublisher:
    def __init__(self):
        self._clients: set = set()
        self._clients_lock = asyncio.Lock()

    async def _handle_client(self, ws):
        async with self._clients_lock:
            self._clients.add(ws)
        # ... await messages ...
        async with self._clients_lock:
            self._clients.discard(ws)

    async def broadcast_signal(self, signal):
        msg = json.dumps(signal)
        # Snapshot the set — don't iterate while others modify
        async with self._clients_lock:
            clients = list(self._clients)
        # ... send to snapshot ...
```

**Why it matters at scale:** In asyncio, `asyncio.gather` yields control to other tasks. While `broadcast_signal` iterates `_clients`, `_handle_client` can `.add()` or `.discard()` the same set. Python raises `RuntimeError: Set changed size during iteration`. With 100 clients connecting/disconnecting frequently, this crash is inevitable. The good version either uses a lock or takes a snapshot (`list(self._clients)`) before iterating. In a system with 1000 users, race conditions are not intermittent — they're guaranteed.

---

### Example 14: Missing DB Busy Timeout (Database Locks)

**BAD** — `db.py:22`:
```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path)  # ← default timeout = 5s
    conn.execute("PRAGMA journal_mode=WAL")
    return conn
```

**GOOD**:
```python
def _conn(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.path, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")  # 30s wait on lock
    conn.execute("PRAGMA synchronous=NORMAL")   # WAL-safe, faster fsync
    return conn
```

**Why it matters at scale:** SQLite in WAL mode allows concurrent reads, but writes still serialize. With the default 5s timeout, if two writes collide (e.g., `save_signal` + `save_equity` in the same cycle), one gets `OperationalError: database is locked`. The bot crashes and restarts. With 1000 users, that's 1000 crashes per write collision. The good version sets `busy_timeout=30000` — SQLite waits up to 30s for the lock instead of failing immediately. Combined with `synchronous=NORMAL` (safe in WAL mode, 2× faster), this eliminates lock errors while maintaining durability.

---

### Example 15: Resource Leak — New HTTP Session Per Alert

**BAD** — `monitoring/alerting.py:168,190,205`:
```python
async def _send_discord(self, alert):
    payload = {...}
    async with aiohttp.ClientSession() as session:  # ← new session every alert
        async with session.post(self.discord_webhook, json=payload) as resp:
            if resp.status not in (200, 204):
                logger.error(f"Discord webhook failed: {resp.status}")
```

**GOOD**:
```python
class AlertSystem:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None

    async def start(self):
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10),
            connector=aiohttp.TCPConnector(limit=10, keepalive_timeout=30)
        )

    async def _send_discord(self, alert):
        if not self._session:
            return
        payload = {...}
        async with self._session.post(self.discord_webhook, json=payload) as resp:
            if resp.status not in (200, 204):
                logger.error(f"Discord webhook failed: {resp.status}")

    async def stop(self):
        if self._session:
            await self._session.close()
```

**Why it matters at scale:** Each `aiohttp.ClientSession()` creates a new `TCPConnector` with its own connection pool. Creating and destroying a session per alert means: (1) no connection reuse — every alert opens a new TCP connection, (2) DNS lookup every time, (3) TLS handshake every time. When the circuit breaker trips and fires 10 alerts/min, that's 10 new TCP connections/min. With 1000 users, that's 10,000 unnecessary TCP connections/min. The good version creates one session with keepalive — connections are reused, DNS is cached, TLS sessions are resumed. 10× less overhead.

---

### Example 16: Docker Healthcheck — TCP vs HTTP

**BAD** — `docker-compose.yml`:
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import socket; socket.create_connection(('localhost', 8765), timeout=5)"]
```

**GOOD**:
```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:8775/health"]
```

**Why it matters at scale:** TCP healthcheck only verifies the port is open — the process could be hung (event loop blocked, deadlock, OOM). Docker thinks the container is healthy, but the service is unresponsive. With HTTP `/health`, the endpoint checks real application state — DB connection, WS clients, internal queues. If the event loop is blocked, the HTTP server can't respond → Docker marks it unhealthy → restarts. In K8s, this is even more critical — liveness/readiness probes determine traffic routing. A TCP-probed pod receives traffic even when hung. The good version uses HTTP, which verifies actual application readiness.

---

### Example 17: C++ `catch (...)` on Safety-Critical Component

**BAD** — `hft-trade-bot/src/risk/kill_switch.h:64`:
```cpp
bool init() {
    try {
        shm_ = std::make_unique<ShmRingBuffer<ipc::KillSwitchMsg>>(
            shm_name_, 64, true);
        return true;
    } catch (...) {
        return false;  // ← swallows ALL exceptions, no logging
    }
}
```

**GOOD**:
```cpp
bool init() {
    try {
        shm_ = std::make_unique<ShmRingBuffer<ipc::KillSwitchMsg>>(
            shm_name_, 64, true);
        return true;
    } catch (const std::exception& e) {
        spdlog::error("KillSwitch SHM init failed: {}", e.what());
        return false;
    }
}
```

**Why it matters at scale:** The kill switch is the last line of defense — it stops the bot when something goes wrong. If its SHM init fails silently, the kill switch doesn't work, but the bot continues trading. This is the worst possible failure mode: you think you have a safety net, but you don't. `catch (...)` swallows everything — including `std::bad_alloc` (OOM), `std::system_error` (permissions), even non-`std::exception` throws. The good version catches `std::exception` specifically and logs the error. If init fails, you see it in logs and can fix it before deploying. In a trading system with 1000 users, a non-functional kill switch could mean unlimited losses on a flash crash.

---

### Example 18: Missing Database Indexes

**BAD** — `db.py:78-80`:
```python
# Only these indexes exist:
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_status ON trades(status);

# But get_stats() runs:
conn.execute("SELECT COUNT(*) FROM trades WHERE status='CLOSED' AND pnl > 0")
# ← full table scan! status index helps, but pnl > 0 is unindexed
# With 100k trades: 100k rows scanned per stats call
```

**GOOD**:
```python
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_timestamp ON signals(timestamp);  # time queries
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_status_pnl ON trades(status, pnl);  # composite for get_stats
CREATE INDEX idx_equity_timestamp ON equity_curve(timestamp);  # time-based queries
```

**Why it matters at scale:** Without a composite index on `(status, pnl)`, SQLite scans every row with `status='CLOSED'` to check `pnl > 0`. With 100 trades, that's instant. With 100,000 trades (a year of trading 50 symbols), that's 100k rows per `get_stats()` call. The web UI calls `get_stats()` every refresh (5s) → 1.2M row scans/min. The good version creates a composite index — SQLite jumps directly to `status='CLOSED' AND pnl > 0` rows. O(1) lookup instead of O(N) scan. In a system with 1000 users each generating 1000 trades/day, you'd have 1M trades in a week — without indexes, `get_stats()` takes seconds, with indexes it takes milliseconds.

---

### Example 19: Float Precision in Financial Calculations

**BAD** — `src/` повсеместно:
```python
balance = 10000.0
risk_amount = balance * 0.02       # 200.00000000000003
quantity = risk_amount / 1.5       # 133.33333333333334
pnl = (50100.0 - 50000.0) * quantity  # 13333.333333333343
# After 10,000 trades: accumulated error shifts P&L by dollars
```

**GOOD**:
```python
from decimal import Decimal, ROUND_HALF_UP

balance = Decimal("10000.00")
risk_amount = balance * Decimal("0.02")           # 200.00
quantity = (risk_amount / Decimal("1.50"))         # 133.333333...
quantity = quantity.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
pnl = (Decimal("50100.00") - Decimal("50000.00")) * quantity  # exact
```

**Why it matters at scale:** IEEE 754 doubles have ~15 significant digits. `0.1 + 0.2 != 0.3` — it's `0.30000000000000004`. In a single trade, the error is microscopic. But over 10,000 trades with compounding, errors accumulate. Your reported P&L drifts from actual P&L. When you reconcile with the exchange's numbers, there's a discrepancy. Worse: Binance API expects `quantity=0.00100000` (string), but `float` gives `0.0010000000000000002` — the API rejects it or rounds differently. With 1000 users each doing 100 trades/day, that's 100,000 potential precision errors/day. The good version uses `Decimal` — exact arithmetic, no rounding surprises. For a trading system, this is not optional.

---

### Example 20: No Log Rotation (Disk Exhaustion)

**BAD** — весь проект:
```python
logging.basicConfig(
    filename=f"logs/{name}.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
# ← no rotation, no max size, no backup count
# logs/bot.log grows forever: 1MB → 100MB → 10GB → disk full → crash
```

**GOOD**:
```python
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler(
    f"logs/{name}.log",
    maxBytes=50_000_000,  # 50MB per file
    backupCount=5,        # keep 5 rotated files (250MB total max)
    encoding="utf-8",
)
handler.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)s %(name)s: %(message)s"
))
logging.basicConfig(level=logging.INFO, handlers=[handler])
```

**Why it matters at scale:** Without rotation, log files grow linearly. A bot logging 100 lines/min at 100 bytes/line = 14MB/day = 420MB/month = 5GB/year. With 50 symbols and DEBUG logging, multiply by 10× = 50GB/year. On a 20GB VPS, the disk fills in 5 months. When the disk is full, `logging` silently stops (or crashes with `OSError`). The bot continues running but with no logs — you're blind to errors. With 1000 users on small VPS instances, this is a guaranteed outage. The good version caps log storage at 250MB (5 × 50MB) — when `bot.log` hits 50MB, it becomes `bot.log.1`, and a new `bot.log` starts. Old files are deleted after 5 rotations.

---

### Example 21: Rust `unwrap()` — Panic in Production

**BAD** — `hft-executor/src/lib.rs:80,159`:
```rust
let runtime = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(1)
    .enable_all()
    .build()
    .expect("Failed to create tokio runtime");  // ← panics entire process

let json = serde_json::to_string(&order).unwrap_or_default();  // ← empty string on error
let msg = Message::Text(json);  // ← sends "" to exchange
```

**GOOD**:
```rust
pub fn new(ws_url: &str) -> Result<Self, String> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
        .map_err(|e| format!("Runtime creation failed: {e}"))?;

    // ... spawn run_loop ...

    Ok(Self { tx, order_count, fill_count, error_count, _runtime: Some(runtime) })
}

// In run_loop:
let json = match serde_json::to_string(&order) {
    Ok(j) => j,
    Err(e) => {
        tracing::error!("Order serialization failed: {e}");
        error_count.fetch_add(1, Ordering::Relaxed);
        continue;
    }
};
```

**Why it matters at scale:** In Rust, `panic()` unwinds the stack and kills the thread — or the entire process if it's the main thread. `expect()` on line 80 panics if the OS can't create a thread (ulimit hit, cgroup limit). In a container with limited PIDs/threads, this is a real scenario. `unwrap_or_default()` on line 159 silently sends an empty JSON string to the exchange — the exchange receives `""`, can't parse it, and drops the connection. The bot thinks it sent the order, but the exchange never got it. With 1000 users, a serialization bug means 1000 silent order losses. The good version returns `Result` from `new()` — the caller decides how to handle failure (retry, fallback, exit). For serialization, it logs the error and skips the order instead of sending garbage.

---

### Example 22: Rust String Matching Instead of JSON Parsing

**BAD** — `hft-executor/src/lib.rs:209-214`:
```rust
fn is_fill_message(text: &str) -> bool {
    text.contains("\"fill\"")
        || text.contains("\"filled\"")
        || text.contains("\"order_fill\"")
        || text.contains("\"type\":\"fill\"")
}
// Any message with "fill" anywhere matches:
// {"type":"error","reason":"order_refilled"} → true (false positive!)
// {"type":"status","msg":"buffer_filled"} → true (false positive!)
```

**GOOD**:
```rust
#[derive(Deserialize)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
}

fn is_fill_message(text: &str) -> bool {
    match serde_json::from_str::<WsMessage>(text) {
        Ok(msg) => msg.msg_type == "fill" || msg.msg_type == "order_fill",
        Err(_) => false,
    }
}
```

**Why it matters at scale:** String matching is fragile — it matches substrings anywhere in the message. As the exchange evolves and adds new message types (e.g., `"type":"refill_notification"`, `"type":"buffer_filled"`), the fill counter inflates with false positives. You think you got 100 fills, but 30 were false matches. In a trading system, wrong fill counts mean wrong P&L, wrong position tracking, wrong risk calculations. The good version parses the JSON and checks the `type` field exactly. No false positives, no ambiguity. In a system with 1000 users processing 10,000 messages/day, string matching could cause 300,000 false fill counts/day — rendering the fill tracker useless.

---

### Example 23: No Config Schema Validation (Runtime Crashes)

**BAD** — `config/settings.yaml` + `config/__init__.py`:
```yaml
# settings.yaml
risk:
  risk_pct: 2        # ← what if someone writes "2%" or "two"?
  max_daily_drawdown: 8
```

```python
# config/__init__.py — no validation
risk_pct = config.get("risk", {}).get("risk_pct", 2)
# ... later in trading loop:
risk_amount = balance * risk_pct / 100
# If risk_pct = "2%" → TypeError: unsupported operand type(s)
# If risk_pct = "2" → works (string * float = error in Python 3)
```

**GOOD**:
```python
from pydantic import BaseModel, validator

class RiskConfig(BaseModel):
    risk_pct: float = 2.0
    max_daily_drawdown: float = 8.0

    @validator("risk_pct")
    def risk_pct_must_be_valid(cls, v):
        if not 0 < v <= 100:
            raise ValueError("risk_pct must be between 0 and 100")
        return v

class Settings(BaseModel):
    risk: RiskConfig
    # ... other sections

# At load time:
config = Settings(**yaml.safe_load(open("settings.yaml")))
# If risk_pct = "2%" → ValidationError: value is not a valid float
# Clear error at startup, not a crash mid-trading
```

**Why it matters at scale:** Without schema validation, a typo in YAML config causes a runtime crash hours or days into operation. `risk_pct: 2%` passes `yaml.safe_load` (it's a valid string), passes config loading (no validation), then crashes on the first trade attempt: `TypeError: unsupported operand type(s) for *: 'float' and 'str'`. The bot has been running for hours, then crashes on the first signal. With 1000 users, that's 1000 bots crashing simultaneously because of a config typo. The good version validates at startup — if the config is wrong, the bot refuses to start with a clear error message. No silent runtime crashes. In a trading system, failing fast at startup is infinitely better than failing mid-trade.

---

### Example 24: Hardcoded Timeouts (No Config Flexibility)

**BAD** — `real_exchange_client.py:94`:
```python
self._session = aiohttp.ClientSession(
    timeout=aiohttp.ClientTimeout(total=10)  # ← hardcoded
)
```

**GOOD**:
```python
# config/settings.yaml
network:
  ws_timeout: 30
  http_timeout: 10
  db_timeout: 30
  reconnect_delay: 5
  max_reconnects: 10

# real_exchange_client.py
self._session = aiohttp.ClientSession(
    timeout=aiohttp.ClientTimeout(total=config.network.http_timeout)
)
```

**Why it matters at scale:** A hardcoded 10s timeout might be fine for Binance (fast API), but too short for a slow exchange in Asia (200ms RTT + processing). When a user in Singapore connects to a US exchange, 10s might not be enough for heavy order book snapshots. To change the timeout, you need to: edit source code → commit → CI → build Docker image → deploy. That's 30+ minutes of downtime for a 1-number change. The good version puts timeouts in config — change YAML, restart pod, done in 30 seconds. With 1000 users across different regions, each needing different timeouts, hardcoded values are unworkable. Config-driven timeouts let each deployment tune to its network conditions without code changes.

---

### Example 25: Missing Tests on Critical Paths

**BAD** — `ai-signal-bot/tests/`:
```
tests/
├── unit/
│   ├── test_strategies.py      ✅
│   ├── test_risk_manager.py    ✅
│   ├── test_backtester.py      ✅
│   ├── test_signal_validator.py ✅
│   └── ...
└── integration/
    └── test_e2e_pipeline.py    ✅

# But these critical modules have ZERO tests:
# - signal_publisher.py  (WS broadcast to clients)
# - db.py                (SQLite CRUD, WAL checkpoint)
# - alerting.py          (Discord/Telegram/webhook alerts)
# - ws_client.py         (reconnection logic)
# - notifier.py          (notification dispatch)
```

**GOOD**:
```python
# tests/unit/test_signal_publisher.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from src.communication.signal_publisher import SignalPublisher

class TestSignalPublisher:
    @pytest.mark.asyncio
    async def test_broadcast_to_multiple_clients(self):
        pub = SignalPublisher(...)
        client1 = AsyncMock(); client2 = AsyncMock()
        pub._clients = {client1, client2}
        await pub.broadcast_signal({"symbol": "BTC/USDT", "direction": "LONG"})
        client1.send.assert_called_once()
        client2.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_slow_client_disconnected(self):
        pub = SignalPublisher(...)
        slow_client = AsyncMock()
        slow_client.send.side_effect = asyncio.TimeoutError
        pub._clients = {slow_client}
        await pub.broadcast_signal({"symbol": "BTC/USDT"})
        assert slow_client not in pub._clients  # removed

# tests/unit/test_db.py
class TestDatabase:
    def test_insert_and_retrieve_signal(self):
        db = Database(":memory:")
        db.save_signal({"symbol": "BTC/USDT", "direction": "LONG"})
        signals = db.get_recent_signals(limit=1)
        assert len(signals) == 1
        assert signals[0]["symbol"] == "BTC/USDT"
```

**Why it matters at scale:** Signal publisher, DB, and alerting are the backbone of the trading system. A bug in `broadcast_signal` means clients get stale or no data. A bug in `db.py` means trades are lost. A bug in `alerting.py` means critical alerts don't fire. Without tests, these bugs ship to production and are discovered by users. With 1000 users, a signal publisher bug affects all 1000 simultaneously. The good version tests the actual critical paths: broadcast to N clients, slow client removal, DB insert/retrieve, alert dispatch. Each test runs in <1s and catches regressions before they reach production. The cost of writing these tests is 2 hours. The cost of a production bug in signal publishing is 1000 users losing money.

---

### Example 26: Dead Code (Unused Module)

**BAD** — `ai-signal-bot/src/observability/tracing.py` (111 lines):
```python
# Fully implemented OpenTelemetry tracing...
def setup_tracing(service_name, endpoint, enabled=True):
    # 30 lines of OTel setup
    ...

def get_tracer(name):
    # 20 lines of no-op fallback
    ...

def shutdown_tracing():
    # 15 lines of graceful shutdown
    ...

# But grep for setup_tracing|get_tracer across entire project = 0 matches
# Nobody calls this. Nobody imports this. 111 lines of dead code.
```

**GOOD**:
```python
# Option A: Integrate it
# run.py
from src.observability.tracing import setup_tracing, shutdown_tracing

setup_tracing(service_name="ai-signal-bot", endpoint=config.tracing.endpoint)
# ... at shutdown:
shutdown_tracing()

# Option B: Remove it
# git rm src/observability/tracing.py
# Less code = less maintenance, fewer dependencies, smaller image
```

**Why it matters at scale:** Dead code is a liability, not an asset. It looks maintained (has docstrings, proper error handling), so developers assume it's used. They waste time reading it, understanding it, updating its dependencies. When someone finally tries to use it, it's broken — because nobody tested it, the API drifted from what callers would need. In a codebase with 1000 files, 10% dead code means 100 files of confusion. New developers spend hours reading code that does nothing. In the worst case, dead code has security vulnerabilities (outdated dependencies) that show up in audits but can't be exploited because the code is never called — but you still have to fix them. The good version is binary: either integrate it (add the 2-line call in `run.py`) or delete it. No zombie code.

---

### Example 27: No Graceful Shutdown (Data Loss on Termination)

**BAD** — `run.py`:
```python
async def main():
    bot = SignalBot(config)
    await bot.start()  # runs forever

if __name__ == "__main__":
    asyncio.run(main())
# Ctrl+C or docker stop → SIGTERM → process killed immediately
# DB connection: not closed (WAL checkpoint not run)
# WS clients: not notified (they hang until TCP timeout)
# In-flight orders: lost (sent to exchange, not recorded in DB)
# aiohttp sessions: not closed (socket leaks until OS GC)
```

**GOOD**:
```python
import signal

async def main():
    bot = SignalBot(config)
    db = Database(config.db.path)
    publisher = SignalPublisher(...)

    shutdown_event = asyncio.Event()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown_event.set)

    # Run bot and wait for shutdown signal
    bot_task = asyncio.create_task(bot.start())
    await shutdown_event.wait()

    # Graceful shutdown
    logger.info("Shutting down...")
    bot_task.cancel()
    await publisher.notify_shutdown()  # tell WS clients
    await db.close()                    # WAL checkpoint, close conn
    await bot.http_session.close()      # close aiohttp
    logger.info("Shutdown complete")

if __name__ == "__main__":
    asyncio.run(main())
```

**Why it matters at scale:** Without graceful shutdown, every `docker stop` or `Ctrl+C` is a potential data loss event. The bot sent an order to Binance, but before the DB `INSERT` into `trades` table ran, the process was killed. The order is live on the exchange, but not tracked locally. Position tracking is wrong. Risk management is wrong. P&L is wrong. With 1000 users, every deploy (which triggers `docker stop`) risks 1000 data loss events. The good version catches SIGTERM/SIGINT, cancels the bot task, notifies WS clients, closes the DB (running WAL checkpoint to persist all writes), and closes HTTP sessions. No data loss, no socket leaks, no orphaned orders. In K8s, this is even more critical — pods are terminated regularly (scaling, updates, node draining). Without graceful shutdown, every pod termination is a potential incident.

---

### Example 28: No WebSocket Keepalive (Silent Disconnects)

**BAD** — `signal_publisher.py`:
```python
self._server = await websockets.serve(
    self._handle_client, host, port
)
# ← no ping_interval, no ping_timeout
# Client connects, then network goes down (WiFi off, VPN drop)
# Server still thinks client is connected
# Client still thinks it's connected
# No data flows, but no error either
# After 60s, firewall drops the dead TCP connection
# But server doesn't know until it tries to send → exception
```

**GOOD**:
```python
self._server = await websockets.serve(
    self._handle_client, host, port,
    ping_interval=20,   # send ping every 20s
    ping_timeout=10,    # wait 10s for pong, else disconnect
    close_timeout=5,    # graceful close timeout
)
# Server pings every 20s. If no pong in 10s, server disconnects client.
# Client knows within 30s that connection is dead → reconnect.
# No silent disconnects, no stale connections in _clients set.
```

**Why it matters at scale:** Without keepalive, dead connections accumulate in the `_clients` set. The server tries to broadcast to 100 clients, but 30 are dead (WiFi dropped, laptop closed, VPN failed). Each `send()` to a dead client hangs until TCP timeout (30-120s). The broadcast to the 70 alive clients is blocked waiting for the 30 dead ones. With 1000 users, 300 dead connections means every signal broadcast takes 2+ minutes instead of 100ms. The good version sends ping every 20s — dead clients are detected and removed within 30s. The broadcast only hits alive clients. In a trading system where signal latency matters (60s interval), a 2-minute broadcast delay means signals arrive after the next candle already started. Keepalive is not optional — it's the difference between a responsive system and a zombie-filled one.
