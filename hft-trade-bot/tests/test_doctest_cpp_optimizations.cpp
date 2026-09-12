// Performance tests for C++ HFT optimizations
// Tests low-latency utilities (histogram, SPSC queue, spinlock, affinity, circuit breaker)
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "utils/low_latency.h"
#include <chrono>
#include <doctest.h>
#include <random>
#include <vector>

using namespace hft;

TEST_SUITE("C++ Performance Optimizations") {

    TEST_CASE("LatencyHistogram - Basic Recording") {
        LatencyHistogram hist;

        hist.record(1.0);
        hist.record(2.0);
        hist.record(3.0);

        auto stats = hist.get_stats();
        CHECK(stats.count == 3);
        CHECK(stats.min == 1.0);
        CHECK(stats.max == 3.0);
    }

    TEST_CASE("LatencyHistogram - Percentile Calculation") {
        LatencyHistogram hist;

        // Record 100 samples at 10μs
        for (int i = 0; i < 100; ++i) {
            hist.record(10.0);
        }

        auto stats = hist.get_stats();
        CHECK(stats.count == 100);
        CHECK(stats.p50 > 0);
        CHECK(stats.p95 > 0);
        CHECK(stats.p99 > 0);
    }

    TEST_CASE("ScopedLatency - RAII Timing") {
        LatencyHistogram hist;

        {
            ScopedLatency timer(hist);
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }

        auto stats = hist.get_stats();
        CHECK(stats.count == 1);
        CHECK(stats.min > 0);
    }

    TEST_CASE("SPSCQueue - Basic Operations") {
        SPSCQueue<int, 16> queue;

        CHECK(queue.empty() == true);
        CHECK(queue.size() == 0);

        CHECK(queue.push(42) == true);
        CHECK(queue.empty() == false);
        CHECK(queue.size() == 1);

        int value;
        CHECK(queue.pop(value) == true);
        CHECK(value == 42);
        CHECK(queue.empty() == true);
    }

    TEST_CASE("SPSCQueue - Capacity Limit") {
        SPSCQueue<int, 4> queue;

        // Fill queue
        CHECK(queue.push(1) == true);
        CHECK(queue.push(2) == true);
        CHECK(queue.push(3) == true);
        CHECK(queue.push(4) == true);

        // Should be full
        CHECK(queue.push(5) == false);

        // Drain
        int value;
        for (int i = 1; i <= 4; ++i) {
            CHECK(queue.pop(value) == true);
            CHECK(value == i);
        }

        CHECK(queue.empty() == true);
    }

    TEST_CASE("Spinlock - Basic Locking") {
        Spinlock lock;
        int      counter = 0;

        {
            SpinlockGuard guard(lock);
            counter = 42;
        }

        CHECK(counter == 42);
    }

    TEST_CASE("ThreadAffinity - Core Count") {
        int cores = ThreadAffinity::num_cores();
        CHECK(cores > 0);
    }

    TEST_CASE("CircuitBreaker - Basic Operation") {
        CircuitBreaker cb(3, 30);

        CHECK(cb.allow_request() == true);
        CHECK(cb.get_state() == CircuitBreaker::State::CLOSED);

        cb.record_failure();
        cb.record_failure();
        cb.record_failure();

        // Should be open after threshold
        CHECK(cb.get_state() == CircuitBreaker::State::OPEN);
        CHECK(cb.allow_request() == false);
    }

} // TEST_SUITE
