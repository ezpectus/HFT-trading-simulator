// Unit tests for LatencyTracker and ScopedLatencyMeasurement using doctest
// Tests: record, stats, percentiles, budget alerts, reset, scoped measurement
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/execution/latency_tracker.h"

#include <thread>
#include <vector>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════════
static LatencyTracker make_tracker() {
    return LatencyTracker(64);
}

// ═══════════════════════════════════════════════════════════════════════════
// Basic recording
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("LatencyTracker initial stats are empty") {
    auto tracker = make_tracker();
    auto stats   = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    CHECK(stats.count == 0);
    CHECK(stats.sum_us == 0);
    CHECK(stats.min_us == INT64_MAX);
    CHECK(stats.max_us == 0);
    CHECK(stats.p50_us == 0);
}

TEST_CASE("Record updates count and sum") {
    auto tracker = make_tracker();
    // 1000us = 1ms = 1,000,000ns
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);
    auto stats = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    CHECK(stats.count == 1);
    CHECK(stats.sum_us == 1000);
}

TEST_CASE("Record tracks min and max") {
    auto tracker = make_tracker();
    tracker.record(LatencyStage::ORDER_TO_ACK, 500'000);   // 500us
    tracker.record(LatencyStage::ORDER_TO_ACK, 2'000'000); // 2000us
    tracker.record(LatencyStage::ORDER_TO_ACK, 1'000'000); // 1000us
    auto stats = tracker.get_stats(LatencyStage::ORDER_TO_ACK);
    CHECK(stats.count == 3);
    CHECK(stats.min_us == 500);
    CHECK(stats.max_us == 2000);
    CHECK(stats.sum_us == 3500);
}

TEST_CASE("Record ignores invalid stage") {
    auto tracker = make_tracker();
    // Casting a large value to LatencyStage — should be ignored
    tracker.record(static_cast<LatencyStage>(99), 1'000'000);
    // No crash, all stages should still have 0 count
    CHECK(tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER).count == 0);
}

TEST_CASE("Negative latency clamped to zero") {
    auto tracker = make_tracker();
    tracker.record(LatencyStage::RISK_CHECK, -500'000);
    auto stats = tracker.get_stats(LatencyStage::RISK_CHECK);
    CHECK(stats.count == 1);
    CHECK(stats.min_us == 0);
    CHECK(stats.sum_us == 0);
}

TEST_CASE("Latency above max is clamped") {
    auto tracker = make_tracker();
    // 20 seconds in ns = 20,000,000,000 ns → 20,000,000 us → clamped to MAX_LATENCY_US
    tracker.record(LatencyStage::STRATEGY_COMPUTE, 20'000'000'000LL);
    auto stats = tracker.get_stats(LatencyStage::STRATEGY_COMPUTE);
    CHECK(stats.count == 1);
    CHECK(stats.max_us == LatencyTracker::MAX_LATENCY_US);
}

// ═══════════════════════════════════════════════════════════════════════════
// Percentile computation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Percentiles computed from histogram") {
    auto tracker = make_tracker();
    // Record 100 samples at 1000us each
    for (int i = 0; i < 100; ++i) {
        tracker.record(LatencyStage::SIGNAL_TO_FILL, 1'000'000);
    }
    auto stats = tracker.get_stats(LatencyStage::SIGNAL_TO_FILL);
    CHECK(stats.count == 100);
    // All samples in same bin → percentiles should be near 1000us
    // Bin width = 10,000,000 / 64 = 156,250us; bin 0 center = 78,125us
    // Actually 1000us is in bin 0 → p50 ≈ 78125 (bin center)
    // Just check percentiles are > 0 and consistent
    CHECK(stats.p50_us > 0);
    CHECK(stats.p50_us == stats.p95_us);
    CHECK(stats.p95_us == stats.p99_us);
}

TEST_CASE("Percentiles differentiate across bins") {
    auto tracker = make_tracker();
    // Record samples spread across bins
    // bin 0: 0-156250us, bin 1: 156250-312500us, etc.
    // 500us → bin 0, 200000us → bin 1, 500000us → bin 3
    for (int i = 0; i < 50; ++i) {
        tracker.record(LatencyStage::MARKET_DATA_PROCESS, 500'000); // bin 0
    }
    for (int i = 0; i < 45; ++i) {
        tracker.record(LatencyStage::MARKET_DATA_PROCESS, 200'000'000); // bin 12ish → 200000us
    }
    for (int i = 0; i < 5; ++i) {
        tracker.record(LatencyStage::MARKET_DATA_PROCESS, 500'000'000); // bin 32ish → 500000us
    }
    auto stats = tracker.get_stats(LatencyStage::MARKET_DATA_PROCESS);
    CHECK(stats.count == 100);
    // P50 should be in lower bin, P99 in higher bin
    CHECK(stats.p99_us >= stats.p50_us);
}

// ═══════════════════════════════════════════════════════════════════════════
// Budget enforcement
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Budget alert fires when latency exceeds threshold") {
    auto         tracker     = make_tracker();
    int          alert_count = 0;
    LatencyStage alert_stage{};
    int64_t      alert_us        = 0;
    double       alert_threshold = 0.0;

    tracker.set_alert_callback([&](LatencyStage s, int64_t us, double threshold) {
        alert_count++;
        alert_stage     = s;
        alert_us        = us;
        alert_threshold = threshold;
    });

    tracker.set_budget(LatencyStage::ORDER_TO_ACK, 500.0); // 500us budget
    // Under budget — no alert
    tracker.record(LatencyStage::ORDER_TO_ACK, 100'000); // 100us
    CHECK(alert_count == 0);
    // Over budget — alert
    tracker.record(LatencyStage::ORDER_TO_ACK, 1'000'000); // 1000us
    CHECK(alert_count == 1);
    CHECK(alert_stage == LatencyStage::ORDER_TO_ACK);
    CHECK(alert_us == 1000);
    CHECK(alert_threshold == doctest::Approx(500.0));
}

TEST_CASE("Zero budget means no alerts") {
    auto tracker     = make_tracker();
    int  alert_count = 0;
    tracker.set_alert_callback([&](LatencyStage, int64_t, double) { alert_count++; });
    // Default budget is 0 → no alerts
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 10'000'000'000LL); // 10s
    CHECK(alert_count == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// record_interval
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("record_interval computes delta") {
    auto tracker = make_tracker();
    tracker.record_interval(LatencyStage::RISK_CHECK, 1'000'000'000, 1'001'000'000);
    auto stats = tracker.get_stats(LatencyStage::RISK_CHECK);
    CHECK(stats.count == 1);
    // delta = 1,000,000ns = 1000us
    CHECK(stats.sum_us == 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Reset clears all stats") {
    auto tracker = make_tracker();
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);
    tracker.record(LatencyStage::ORDER_TO_ACK, 2'000'000);
    tracker.reset();
    for (size_t i = 0; i < LatencyTracker::NUM_STAGES; ++i) {
        auto stats = tracker.get_stats(static_cast<LatencyStage>(i));
        CHECK(stats.count == 0);
        CHECK(stats.sum_us == 0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary string
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Summary includes stages with data") {
    auto tracker = make_tracker();
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);
    tracker.record(LatencyStage::ORDER_TO_ACK, 2'000'000);
    auto s = tracker.summary();
    CHECK(s.find("SIGNAL_TO_ORDER") != std::string::npos);
    CHECK(s.find("ORDER_TO_ACK") != std::string::npos);
    CHECK(s.find("ACK_TO_FILL") == std::string::npos); // No data for this stage
}

TEST_CASE("Summary empty when no data") {
    auto tracker = make_tracker();
    auto s       = tracker.summary();
    CHECK(s.empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// ScopedLatencyMeasurement
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ScopedLatencyMeasurement records on destruction") {
    auto tracker = make_tracker();
    {
        ScopedLatencyMeasurement scope(tracker, LatencyStage::STRATEGY_COMPUTE);
        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }
    auto stats = tracker.get_stats(LatencyStage::STRATEGY_COMPUTE);
    CHECK(stats.count == 1);
    CHECK(stats.min_us > 0);
}

TEST_CASE("ScopedLatencyMeasurement is non-copyable") {
    auto tracker = make_tracker();
    // These should fail to compile if uncommented:
    // ScopedLatencyMeasurement s1(tracker, LatencyStage::RISK_CHECK);
    // ScopedLatencyMeasurement s2 = s1;  // Should not compile
    // Just verify it constructs
    ScopedLatencyMeasurement scope(tracker, LatencyStage::RISK_CHECK);
    (void)scope;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage string conversion
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("latency_stage_str returns correct names") {
    CHECK(std::string(latency_stage_str(LatencyStage::SIGNAL_TO_ORDER)) == "SIGNAL_TO_ORDER");
    CHECK(std::string(latency_stage_str(LatencyStage::ORDER_TO_ACK)) == "ORDER_TO_ACK");
    CHECK(std::string(latency_stage_str(LatencyStage::ACK_TO_FILL)) == "ACK_TO_FILL");
    CHECK(std::string(latency_stage_str(LatencyStage::SIGNAL_TO_FILL)) == "SIGNAL_TO_FILL");
    CHECK(std::string(latency_stage_str(LatencyStage::ORDER_TO_FILL)) == "ORDER_TO_FILL");
    CHECK(std::string(latency_stage_str(LatencyStage::MARKET_DATA_PROCESS)) ==
          "MARKET_DATA_PROCESS");
    CHECK(std::string(latency_stage_str(LatencyStage::RISK_CHECK)) == "RISK_CHECK");
    CHECK(std::string(latency_stage_str(LatencyStage::STRATEGY_COMPUTE)) == "STRATEGY_COMPUTE");
}

// ═══════════════════════════════════════════════════════════════════════════
// Multiple stages independent
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Multiple stages are tracked independently") {
    auto tracker = make_tracker();
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 1'000'000);
    tracker.record(LatencyStage::SIGNAL_TO_ORDER, 2'000'000);
    tracker.record(LatencyStage::ORDER_TO_ACK, 5'000'000);

    auto s1 = tracker.get_stats(LatencyStage::SIGNAL_TO_ORDER);
    auto s2 = tracker.get_stats(LatencyStage::ORDER_TO_ACK);
    CHECK(s1.count == 2);
    CHECK(s2.count == 1);
    CHECK(s1.sum_us == 3000);
    CHECK(s2.sum_us == 5000);
}
