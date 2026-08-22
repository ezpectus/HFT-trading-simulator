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
