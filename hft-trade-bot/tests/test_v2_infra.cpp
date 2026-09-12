// V2 Low-Latency Infra Tests
// Split out of test_signal_engine_v2.cpp (S020 god-test).
#include "../src/data/aligned_types.h"
#include "../src/data/types.h"
#include "../src/execution/adaptive_order_selector_v2.h"
#include "../src/strategies/pressure_model.h"
#include "../src/strategies/signal_engine_v2.h"
#include "../src/utils/low_latency.h"

#include "test_fixtures.h"
#include "test_util.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

using namespace hft;

// ─── Test helpers ───

// ═══════════════════════════════════════════════════════════════════════════════
// Low-Latency Infrastructure Tests
// ═══════════════════════════════════════════════════════════════════════════════

TEST(test_spinlock_basic) {
    Spinlock lock;
    {
        SpinlockGuard guard(lock);
        ASSERT_FALSE(lock.try_lock());
    }
    ASSERT_TRUE(lock.try_lock());
    lock.unlock();
}

TEST(test_spsc_queue_basic) {
    SPSCQueue<int, 16> queue;
    ASSERT_TRUE(queue.empty());
    ASSERT_TRUE(queue.push(42));
    ASSERT_FALSE(queue.empty());
    int val;
    ASSERT_TRUE(queue.pop(val));
    ASSERT_EQ(val, 42);
    ASSERT_TRUE(queue.empty());
}

TEST(test_spsc_queue_full) {
    SPSCQueue<int, 4> queue; // Capacity 4, all 4 usable
    ASSERT_TRUE(queue.push(1));
    ASSERT_TRUE(queue.push(2));
    ASSERT_TRUE(queue.push(3));
    ASSERT_TRUE(queue.push(4));
    ASSERT_FALSE(queue.push(5)); // Full
    int val;
    ASSERT_TRUE(queue.pop(val));
    ASSERT_TRUE(queue.push(5)); // Now has space
}

TEST(test_spsc_queue_wraparound) {
    SPSCQueue<int, 4> queue;
    for (int cycle = 0; cycle < 10; ++cycle) {
        for (int i = 0; i < 4; ++i) {
            ASSERT_TRUE(queue.push(cycle * 4 + i));
        }
        for (int i = 0; i < 4; ++i) {
            int val;
            ASSERT_TRUE(queue.pop(val));
            ASSERT_EQ(val, cycle * 4 + i);
        }
    }
    ASSERT_TRUE(queue.empty());
}

TEST(test_object_pool_basic) {
    ObjectPool<int, 8> pool;
    int*               a = pool.acquire();
    int*               b = pool.acquire();
    ASSERT_TRUE(a != nullptr);
    ASSERT_TRUE(b != nullptr);
    ASSERT_TRUE(a != b);
    pool.release(a);
    pool.release(b);
    ASSERT_EQ(pool.available(), 8u);
}

TEST(test_object_pool_exhaustion) {
    ObjectPool<int, 4> pool;
    int*               ptrs[4];
    for (int i = 0; i < 4; ++i) {
        ptrs[i] = pool.acquire();
        ASSERT_TRUE(ptrs[i] != nullptr);
    }
    ASSERT_TRUE(pool.acquire() == nullptr); // Exhausted
    pool.release(ptrs[0]);
    ASSERT_TRUE(pool.acquire() != nullptr); // Available again
}

TEST(test_latency_histogram) {
    LatencyHistogram hist;
    hist.record(0.5);    // < 1μs → bucket 0
    hist.record(10.0);   // ~10μs
    hist.record(100.0);  // ~100μs
    hist.record(1000.0); // ~1ms

    auto stats = hist.get_stats();
    ASSERT_EQ(stats.count, 4u);
    ASSERT_TRUE(stats.min < 1.0);
    ASSERT_TRUE(stats.max >= 1000.0);
    ASSERT_TRUE(stats.p50 > 0);
    ASSERT_TRUE(stats.p99 > 0);
}

TEST(test_latency_histogram_scoped) {
    LatencyHistogram hist;
    {
        ScopedLatency timer(hist);
        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }
    auto stats = hist.get_stats();
    ASSERT_EQ(stats.count, 1u);
    ASSERT_TRUE(stats.min >= 50.0); // At least 50μs (sleep overhead)
}

TEST(test_circuit_breaker) {
    CircuitBreaker cb(3, 1); // 3 errors, 1s cooldown
    ASSERT_TRUE(cb.allow_request());

    cb.record_failure();
    cb.record_failure();
    ASSERT_TRUE(cb.allow_request()); // Still closed (2 < 3)

    cb.record_failure();
    ASSERT_FALSE(cb.allow_request()); // Open (3 >= 3)

    // Wait for cooldown
    std::this_thread::sleep_for(std::chrono::seconds(2));
    ASSERT_TRUE(cb.allow_request()); // Half-open → probe allowed

    cb.record_success();
    ASSERT_TRUE(cb.allow_request()); // Closed again
}
// ═══════════════════════════════════════════════════════════════════════════════
// Thread Affinity Tests
// ═══════════════════════════════════════════════════════════════════════════════

TEST(test_thread_affinity_num_cores) {
    int cores = ThreadAffinity::num_cores();
    ASSERT_TRUE(cores > 0);
}

int main() {
    return test_report("V2 Low-Latency Infra Tests");
}
