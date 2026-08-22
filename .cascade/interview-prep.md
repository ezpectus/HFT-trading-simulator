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
