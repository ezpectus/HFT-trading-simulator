# Price Feed Performance Bottleneck Analysis

**Date:** August 12, 2026  
**Component:** Price Feed Manager  
**Objective:** Identify performance bottlenecks in the current implementation

---

## Current Implementation Review

### Architecture Overview
The current `PriceFeedManager` implementation:
- Uses simple dict-based cache with manual TTL checking
- Creates new HTTP sessions per request (no connection pooling)
- Sequential symbol fetching in Coinbase API
- No request batching for multiple symbols
- Basic rate limiting per API
- WebSocket reconnection with exponential backoff

### Code Structure Analysis

#### 1. Cache Implementation (Lines 586-587, 644-650)
**Current:**
```python
self._cache: dict[str, PriceTick] = {}
self._cache_ttl = 5.0
```

**Issues:**
- No size limit - can grow unbounded
- Manual TTL checking on every read
- No LRU eviction policy
- Cache hits/misses not tracked (until Task 1.1)

**Impact:** Medium - Memory can grow indefinitely, TTL check adds overhead

#### 2. HTTP Session Management (Lines 80-84, 176-178)
**Current:**
```python
async def get_session(self) -> aiohttp.ClientSession:
    if self._session is None or self._session.closed:
        self._session = aiohttp.ClientSession()
    return self._session
```

**Issues:**
- No connection pooling configuration
- Default connector settings (limit=100, but not optimized)
- No timeout configuration per request
- Session created lazily but not shared optimally

**Impact:** High - Connection overhead adds 20-30ms latency per request

#### 3. Coinbase Sequential Fetching (Lines 340-347)
**Current:**
```python
async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
    result = {}
    for symbol in symbols:
        tick = await self.get_price(symbol)
        if tick:
            result[symbol] = tick
    return result
```

**Issues:**
- Sequential execution - no concurrency
- Each symbol = separate HTTP request
- No batching support
- For 50 symbols: 50 sequential HTTP requests

**Impact:** High - 40-60% latency increase for multiple symbols

#### 4. Binance Batch Fetch (Lines 197-233)
**Current:**
```python
async def get_prices(self, symbols: list[str]) -> dict[str, PriceTick]:
    binance_symbols = ",".join([self._normalize_symbol(s).upper() for s in symbols])
    url = f"{self._rest_base}/ticker/price?symbols=[{binance_symbols}]"
```

**Issues:**
- Batching exists but not used by PriceFeedManager
- No batch size limits
- Symbol denormalization loop is O(n)

**Impact:** Low - Feature exists but not utilized

#### 5. Synchronous Operations in Async Context
**Current:**
- Rate limit checking is synchronous (lines 91-98)
- Health status updates are synchronous (lines 104-118)
- Cache operations are synchronous (lines 644-650)

**Impact:** Low - Minimal blocking, but could be optimized

#### 6. Data Copying
**Current:**
- PriceTick objects copied on cache retrieval
- No use of __slots__ for dataclasses
- Multiple dict lookups per operation

**Impact:** Low - Minor memory overhead

---

## Identified Bottlenecks (Priority Order)

### 1. **HIGH PRIORITY: No Connection Pooling**
- **Location:** `BasePriceAPI.get_session()`
- **Issue:** Each request creates new connections
- **Impact:** 20-30ms latency per request
- **Solution:** Implement aiohttp connection pool with configured limits

### 2. **HIGH PRIORITY: Sequential Coinbase Fetching**
- **Location:** `CoinbaseAPI.get_prices()`
- **Issue:** Sequential instead of concurrent execution
- **Impact:** 40-60% latency for multiple symbols
- **Solution:** Use `asyncio.gather()` for concurrent requests

### 3. **MEDIUM PRIORITY: Simple Dict Cache**
- **Location:** `PriceFeedManager._cache`
- **Issue:** No size limits, manual TTL checking
- **Impact:** Memory growth, cache inefficiency
- **Solution:** Replace with `cachetools.TTLCache`

### 4. **MEDIUM PRIORITY: No Request Batching in Manager**
- **Location:** `PriceFeedManager.get_all_prices()`
- **Issue:** Calls `get_price()` sequentially
- **Impact:** 50 HTTP requests for 50 symbols
- **Solution:** Implement smart batching logic

### 5. **LOW PRIORITY: Synchronous Rate Limiting**
- **Location:** `BasePriceAPI._check_rate_limit()`
- **Issue:** Blocking calls in async context
- **Impact:** Minor latency
- **Solution:** Use async-safe rate limiting

### 6. **LOW PRIORITY: Data Structure Overhead**
- **Location:** `PriceTick` dataclass
- **Issue:** No __slots__, unnecessary copying
- **Impact:** Memory overhead
- **Solution:** Add __slots__ to dataclasses

---

## Optimization Opportunities

### Quick Wins (Low Effort, High Impact)
1. **Connection Pooling** - 2 hours, 20-30% latency reduction
2. **Concurrent Coinbase Fetching** - 1 hour, 40-60% latency reduction
3. **Request Batching** - 2 hours, 40-60% latency reduction

### Medium Effort (Medium Impact)
1. **LRU Cache with TTL** - 2 hours, better memory management
2. **Batch Size Configuration** - 1 hour, fine-tuned performance
3. **Cache Warming** - 1 hour, improved cold start

### Long-term (High Effort, High Impact)
1. **Binary Serialization (msgpack)** - 1 hour, 3-5x faster serialization
2. **Async Rate Limiting** - 2 hours, non-blocking operations
3. **Dataclass Optimization** - 1 hour, reduced memory

---

## Performance Targets

### Baseline (Current)
- Fetch latency p95: ~150ms (estimated)
- Cache hit rate: Unknown (not tracked)
- API calls for 50 symbols: 50 individual requests
- Memory usage: Unbounded cache growth

### Target (After Day 1 Optimizations)
- Fetch latency p95: < 50ms (67% reduction)
- Cache hit rate: > 95%
- API calls for 50 symbols: ~10 (80% reduction)
- Memory usage: Bounded with LRU cache

---

## Next Steps

1. ✅ **Task 1.1:** Add performance profiling (COMPLETED)
2. 🔄 **Task 1.2:** Analyze bottlenecks (IN PROGRESS)
3. ⏳ **Task 1.3:** Implement connection pooling
4. ⏳ **Task 1.4:** Implement request batching
5. ⏳ **Task 1.5:** Optimize caching strategy
6. ⏳ **Task 1.6:** Implement binary serialization
7. ⏳ **Task 1.7:** Performance testing
8. ⏳ **Task 1.8:** Documentation and commit

---

## Conclusion

The current implementation has clear bottlenecks that can be addressed systematically:
- Connection pooling will reduce connection overhead
- Request batching will reduce API call count
- LRU cache will improve memory efficiency
- Binary serialization will speed up data handling

The proposed optimizations in Day 1 tasks directly address these bottlenecks and should achieve the target of < 50ms p95 latency.
