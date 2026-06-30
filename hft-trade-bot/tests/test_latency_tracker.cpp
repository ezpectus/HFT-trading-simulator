// Tests: Histogram buckets, percentile computation, latency budget enforcement
#include "../execution/latency_tracker.h"
#include <cassert>
#include <cstdio>
#include <cmath>
#include <chrono>
#include <thread>

using namespace hft;

void test_basic_recording() {
    LatencyTracker tracker;

    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);  // 1ms
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 2'000'000);  // 2ms
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 3'000'000);  // 3ms

    auto stats = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    assert(stats.count == 3);
    assert(stats.min_us == 1000);
    assert(stats.max_us == 3000);

    printf("  [PASS] test_basic_recording (n=%lld min=%lldus max=%lldus)\n",
           static_cast<long long>(stats.count),
           static_cast<long long>(stats.min_us),
           static_cast<long long>(stats.max_us));
}

void test_percentiles() {
    LatencyTracker tracker;

    // Record 100 samples from 100us to 10000us
    for (int i = 1; i <= 100; ++i) {
        tracker.record(LatencyStage::ORDER_TO_ACK, i * 100 * 1000);  // i*100us in ns
    }

    auto stats = tracker.get_stats(LatencyStage::ORDER_TO_ACK);
    assert(stats.count == 100);

    // P50 should be around 5000us (median of 100-10000 range)
    assert(stats.p50_us > 0);
    assert(stats.p50_us <= 10000);

    // P99 should be higher than P50
    assert(stats.p99_us >= stats.p50_us);

    // P999 should be higher than P99
    assert(stats.p999_us >= stats.p99_us);

    printf("  [PASS] test_percentiles (p50=%lldus p95=%lldus p99=%lldus p999=%lldus)\n",
           static_cast<long long>(stats.p50_us),
           static_cast<long long>(stats.p95_us),
           static_cast<long long>(stats.p99_us),
           static_cast<long long>(stats.p999_us));
}

void test_multiple_stages() {
    LatencyTracker tracker;

    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 500'000);   // 500us
    tracker.record(LatencyStage::ORDER_TO_ACK, 1'000'000);    // 1ms
    tracker.record(LatencyStage::ACK_TO_FILL, 5'000'000);     // 5ms

    auto s1 = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    auto s2 = tracker.get_stats(LatencyStage::ORDER_TO_ACK);
    auto s3 = tracker.get_stats(LatencyStage::ACK_TO_FILL);

    assert(s1.count == 1);
    assert(s2.count == 1);
    assert(s3.count == 1);

    assert(s1.max_us == 500);
    assert(s2.max_us == 1000);
    assert(s3.max_us == 5000);

    printf("  [PASS] test_multiple_stages\n");
}

void test_latency_budget() {
    LatencyTracker tracker;
    bool alert_triggered = false;
    LatencyStage alerted_stage = LatencyStage::SIGNAL_TO_ORDER;

    tracker.set_alert_callback([&](LatencyStage stage, int64_t us, double threshold) {
        alert_triggered = true;
        alerted_stage = stage;
    });

    tracker.set_budget(LatencyStage::SIGNAL_TO_ORDER, 500.0);  // 500us budget

    // Under budget — no alert
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 300'000);  // 300us
    assert(!alert_triggered);

    // Over budget — alert
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);  // 1ms
    assert(alert_triggered);
    assert(alerted_stage == LatencyStage::SIGNAL_TO_ORDER);

    printf("  [PASS] test_latency_budget\n");
}

void test_scoped_measurement() {
    LatencyTracker tracker;

    {
        ScopedLatencyMeasurement m(tracker, LatencyStage::STRATEGY_COMPUTE);
        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }

    auto stats = tracker.get_stats(LatencyStage::STRATEGY_COMPUTE);
    assert(stats.count == 1);
    assert(stats.max_us >= 50);  // At least 50us (allowing for scheduling)

    printf("  [PASS] test_scoped_measurement (measured=%lldus)\n",
           static_cast<long long>(stats.max_us));
}

void test_reset() {
    LatencyTracker tracker;

    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 2'000'000);

    auto stats = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    assert(stats.count == 2);

    tracker.reset();

    stats = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    assert(stats.count == 0);

    printf("  [PASS] test_reset\n");
}

void test_empty_stats() {
    LatencyTracker tracker;

    auto stats = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    assert(stats.count == 0);
    assert(stats.p50_us == 0);
    assert(stats.p95_us == 0);

    printf("  [PASS] test_empty_stats\n");
}

int main() {
    printf("=== Latency Tracker Tests ===\n");
    test_basic_recording();
    test_percentiles();
    test_multiple_stages();
    test_latency_budget();
    test_scoped_measurement();
    test_reset();
    test_empty_stats();
    printf("=== All tests passed! ===\n");
    return 0;
}
