// Unit tests for SystemMonitor, HealthStatus
// Tests: increment/get, fill_rate, rejection_rate, snapshot fields, reset,
//        format_json contains all metrics,
//        HealthStatus is_healthy, HealthStatus format_json
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/monitoring/system_monitor.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — increment and get
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: default all counters are zero") {
    SystemMonitor sm;
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_FILLED) == 0);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_REJECTED) == 0);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_CANCELED) == 0);
    CHECK(sm.get(SystemMonitor::Metric::SIGNALS_RECEIVED) == 0);
    CHECK(sm.get(SystemMonitor::Metric::SIGNALS_PROCESSED) == 0);
    CHECK(sm.get(SystemMonitor::Metric::ERRORS) == 0);
    CHECK(sm.get(SystemMonitor::Metric::RECONNECTS) == 0);
    CHECK(sm.get(SystemMonitor::Metric::SHM_DROPS) == 0);
    CHECK(sm.get(SystemMonitor::Metric::HEARTBEATS_MISSED) == 0);
}

TEST_CASE("SystemMonitor: increment by 1") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT);
    sm.increment(SystemMonitor::Metric::ORDERS_SENT);
    sm.increment(SystemMonitor::Metric::ORDERS_FILLED);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_SENT) == 2);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_FILLED) == 1);
}

TEST_CASE("SystemMonitor: increment by delta") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ERRORS, 5);
    sm.increment(SystemMonitor::Metric::ERRORS, 3);
    CHECK(sm.get(SystemMonitor::Metric::ERRORS) == 8);
}

TEST_CASE("SystemMonitor: increment by negative delta") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, -3);
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_SENT) == 7);
}

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — fill_rate and rejection_rate
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: fill_rate zero when no orders sent") {
    SystemMonitor sm;
    CHECK(sm.fill_rate() == 0.0);
}

TEST_CASE("SystemMonitor: fill_rate correct") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    sm.increment(SystemMonitor::Metric::ORDERS_FILLED, 75);
    CHECK(sm.fill_rate() == doctest::Approx(0.75));
}

TEST_CASE("SystemMonitor: rejection_rate zero when no orders sent") {
    SystemMonitor sm;
    CHECK(sm.rejection_rate() == 0.0);
}

TEST_CASE("SystemMonitor: rejection_rate correct") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    sm.increment(SystemMonitor::Metric::ORDERS_REJECTED, 20);
    CHECK(sm.rejection_rate() == doctest::Approx(0.2));
}

TEST_CASE("SystemMonitor: risk rejects do not pollute rejection_rate (S395)") {
    // Pre-trade gate rejections never reached the wire — counting them as
    // ORDERS_REJECTED let the rate exceed 1.0 (internal rejects / sent).
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    sm.increment(SystemMonitor::Metric::RISK_REJECTED, 40);
    CHECK(sm.get(SystemMonitor::Metric::RISK_REJECTED) == 40);
    CHECK(sm.rejection_rate() == doctest::Approx(0.0));
    auto s = sm.snapshot();
    CHECK(s.risk_rejected == 40);
    std::string json = sm.format_json();
    CHECK(json.find("\"risk_rejected\":40") != std::string::npos);
    std::string prom = sm.format_prometheus();
    CHECK(prom.find("hft_risk_rejected_total 40") != std::string::npos);
    CHECK(prom.find("# TYPE hft_risk_rejected_total counter") != std::string::npos);
}

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — snapshot
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: snapshot reflects all counters") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    sm.increment(SystemMonitor::Metric::ORDERS_FILLED, 8);
    sm.increment(SystemMonitor::Metric::ORDERS_REJECTED, 1);
    sm.increment(SystemMonitor::Metric::ORDERS_CANCELED, 1);
    sm.increment(SystemMonitor::Metric::SIGNALS_RECEIVED, 50);
    sm.increment(SystemMonitor::Metric::SIGNALS_PROCESSED, 48);
    sm.increment(SystemMonitor::Metric::ERRORS, 2);
    sm.increment(SystemMonitor::Metric::RECONNECTS, 1);
    sm.increment(SystemMonitor::Metric::SHM_DROPS, 3);
    sm.increment(SystemMonitor::Metric::HEARTBEATS_MISSED, 5);

    auto s = sm.snapshot();
    CHECK(s.orders_sent == 10);
    CHECK(s.orders_filled == 8);
    CHECK(s.orders_rejected == 1);
    CHECK(s.orders_canceled == 1);
    CHECK(s.signals_received == 50);
    CHECK(s.signals_processed == 48);
    CHECK(s.errors == 2);
    CHECK(s.reconnects == 1);
    CHECK(s.shm_drops == 3);
    CHECK(s.heartbeats_missed == 5);
    CHECK(s.fill_rate == doctest::Approx(0.8));
    CHECK(s.rejection_rate == doctest::Approx(0.1));
}

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: reset zeroes all counters") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    sm.increment(SystemMonitor::Metric::ERRORS, 5);
    sm.reset();
    CHECK(sm.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
    CHECK(sm.get(SystemMonitor::Metric::ERRORS) == 0);
    CHECK(sm.fill_rate() == 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — format_json includes all metrics (regression for missing fields)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: format_json contains all metric fields") {
    SystemMonitor sm;
    sm.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    sm.increment(SystemMonitor::Metric::ORDERS_FILLED, 8);
    sm.increment(SystemMonitor::Metric::ORDERS_REJECTED, 1);
    sm.increment(SystemMonitor::Metric::ORDERS_CANCELED, 1);
    sm.increment(SystemMonitor::Metric::HEARTBEATS_MISSED, 5);

    std::string json = sm.format_json();
    CHECK(json.find("\"orders_sent\":10") != std::string::npos);
    CHECK(json.find("\"orders_filled\":8") != std::string::npos);
    CHECK(json.find("\"orders_rejected\":1") != std::string::npos);
    CHECK(json.find("\"orders_canceled\":1") != std::string::npos);
    CHECK(json.find("\"signals_received\":") != std::string::npos);
    CHECK(json.find("\"signals_processed\":") != std::string::npos);
    CHECK(json.find("\"errors\":") != std::string::npos);
    CHECK(json.find("\"reconnects\":") != std::string::npos);
    CHECK(json.find("\"shm_drops\":") != std::string::npos);
    CHECK(json.find("\"heartbeats_missed\":5") != std::string::npos);
    CHECK(json.find("\"fill_rate\":") != std::string::npos);
    CHECK(json.find("\"rejection_rate\":") != std::string::npos);
    CHECK(json.find("\"uptime_seconds\":") != std::string::npos);
}

TEST_CASE("SystemMonitor: format_json is valid JSON structure") {
    SystemMonitor sm;
    std::string   json = sm.format_json();
    CHECK(json.front() == '{');
    CHECK(json.back() == '}');
}

// ═══════════════════════════════════════════════════════════════════════════
// HealthStatus
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("HealthStatus: default is healthy") {
    HealthStatus hs;
    CHECK(hs.is_healthy() == true);
}

TEST_CASE("HealthStatus: shm unhealthy makes overall unhealthy") {
    HealthStatus hs;
    hs.shm_healthy = false;
    CHECK(hs.is_healthy() == false);
}

TEST_CASE("HealthStatus: exchange disconnected makes unhealthy") {
    HealthStatus hs;
    hs.exchange_connected = false;
    CHECK(hs.is_healthy() == false);
}

TEST_CASE("HealthStatus: signal engine inactive makes unhealthy") {
    HealthStatus hs;
    hs.signal_engine_active = false;
    CHECK(hs.is_healthy() == false);
}

TEST_CASE("HealthStatus: high error count makes unhealthy") {
    HealthStatus hs;
    hs.error_count_5min = 100;
    CHECK(hs.is_healthy() == false);
}

TEST_CASE("HealthStatus: error count just below threshold is healthy") {
    HealthStatus hs;
    hs.error_count_5min = 99;
    CHECK(hs.is_healthy() == true);
}

TEST_CASE("HealthStatus: stale signal makes unhealthy") {
    HealthStatus hs;
    hs.last_signal_age_ms = 10000;
    CHECK(hs.is_healthy() == false);
}

TEST_CASE("HealthStatus: signal age just below threshold is healthy") {
    HealthStatus hs;
    hs.last_signal_age_ms = 9999;
    CHECK(hs.is_healthy() == true);
}

TEST_CASE("HealthStatus: format_json contains all fields") {
    HealthStatus hs;
    hs.shm_healthy          = true;
    hs.exchange_connected   = false;
    hs.signal_engine_active = true;
    hs.last_signal_age_ms   = 5000;
    hs.last_fill_age_ms     = 2000;
    hs.error_count_5min     = 10;
    hs.memory_usage_mb      = 128.5;

    std::string json = hs.format_json();
    CHECK(json.find("\"healthy\":false") != std::string::npos);
    CHECK(json.find("\"shm_healthy\":true") != std::string::npos);
    CHECK(json.find("\"exchange_connected\":false") != std::string::npos);
    CHECK(json.find("\"signal_engine_active\":true") != std::string::npos);
    CHECK(json.find("\"last_signal_age_ms\":5000") != std::string::npos);
    CHECK(json.find("\"last_fill_age_ms\":2000") != std::string::npos);
    CHECK(json.find("\"error_count_5min\":10") != std::string::npos);
    CHECK(json.find("\"memory_usage_mb\":") != std::string::npos);
}

// ═══════════════════════════════════════════════════════════════════════════
// SystemMonitor — runtime gauges (S131)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("SystemMonitor: runtime gauges default to zero") {
    SystemMonitor sm;
    std::string   prom = sm.format_prometheus();
    CHECK(prom.find("hft_active_positions 0") != std::string::npos);
    CHECK(prom.find("hft_pnl_unrealized 0") != std::string::npos);
    CHECK(prom.find("hft_pnl_total 0") != std::string::npos);
    CHECK(prom.find("hft_memory_usage_mb 0") != std::string::npos);
    CHECK(prom.find("hft_shm_signal_queue_depth 0") != std::string::npos);
    CHECK(prom.find("hft_shm_order_queue_depth 0") != std::string::npos);
    CHECK(prom.find("hft_shm_fill_queue_depth 0") != std::string::npos);
}

TEST_CASE("SystemMonitor: set_runtime_gauges reflected in prometheus output") {
    SystemMonitor                sm;
    SystemMonitor::RuntimeGauges g;
    g.active_positions       = 3;
    g.pnl_unrealized         = 12.5;
    g.pnl_total              = 40.25;
    g.memory_usage_mb        = 96.0;
    g.shm_signal_queue_depth = 7;
    g.shm_order_queue_depth  = 2;
    g.shm_fill_queue_depth   = 4;
    sm.set_runtime_gauges(g);

    std::string prom = sm.format_prometheus();
    CHECK(prom.find("hft_active_positions 3") != std::string::npos);
    CHECK(prom.find("hft_pnl_unrealized 12.5") != std::string::npos);
    CHECK(prom.find("hft_pnl_total 40.25") != std::string::npos);
    CHECK(prom.find("hft_memory_usage_mb 96.00") != std::string::npos);
    CHECK(prom.find("hft_shm_signal_queue_depth 7") != std::string::npos);
    CHECK(prom.find("hft_shm_order_queue_depth 2") != std::string::npos);
    CHECK(prom.find("hft_shm_fill_queue_depth 4") != std::string::npos);
    CHECK(prom.find("# HELP hft_pnl_total") != std::string::npos);
    CHECK(prom.find("# TYPE hft_pnl_total gauge") != std::string::npos);
}

TEST_CASE("SystemMonitor: latency histogram emits cumulative buckets") {
    SystemMonitor sm;
    // 3 samples <= 2^1.5≈2.83us bound, 1 sample <= 2^3=8us bound, 1 above all
    uint64_t cumulative[SystemMonitor::LATENCY_BUCKETS]{};
    cumulative[0] = 1; // le=1.41us
    cumulative[1] = 3; // le=2us
    cumulative[2] = 3; // le=2.83us
    cumulative[3] = 3;
    cumulative[4] = 3;
    cumulative[5] = 3; // le=8us
    cumulative[6] = 4; // le=11.31us — sparse higher bucket
    sm.set_latency_histogram(cumulative, SystemMonitor::LATENCY_BUCKETS, 5, 33.0);

    std::string prom = sm.format_prometheus();
    CHECK(prom.find("# TYPE hft_latency_us histogram") != std::string::npos);
    CHECK(prom.find("hft_latency_us_bucket{le=\"1.41421\"} 1") != std::string::npos);
    CHECK(prom.find("hft_latency_us_bucket{le=\"2\"} 3") != std::string::npos);
    CHECK(prom.find("hft_latency_us_bucket{le=\"8\"} 3") != std::string::npos);
    CHECK(prom.find("hft_latency_us_bucket{le=\"11.3137\"} 4") != std::string::npos);
    CHECK(prom.find("hft_latency_us_bucket{le=\"+Inf\"} 5") != std::string::npos);
    CHECK(prom.find("hft_latency_us_sum 33.00") != std::string::npos);
    CHECK(prom.find("hft_latency_us_count 5") != std::string::npos);
}

// ═══════════════════════════════════════════════════════════════════════════
// LatencyHistogram — snapshot_buckets (S131)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("LatencyHistogram: snapshot_buckets is cumulative and carries totals") {
    LatencyHistogram h;
    h.record(0.5);  // bucket 0 (<1us)
    h.record(1.5);  // bucket 1 ([1,2)us)
    h.record(30.0); // bucket 9 ([16,32)us? 2^(9/2)=22.6 -> [22.6,32))
    uint64_t cumulative[LatencyHistogram::NUM_BUCKETS]{};
    uint64_t total  = 0;
    double   sum_us = 0.0;
    h.snapshot_buckets(cumulative, LatencyHistogram::NUM_BUCKETS, &total, &sum_us);
    CHECK(total == 3);
    CHECK(sum_us == doctest::Approx(32.0));
    CHECK(cumulative[0] == 1);
    CHECK(cumulative[1] == 2);
    // bucket covering 30us: upper = 2^((i+1)/2) >= 30 -> i=9 (2^5=32)
    CHECK(cumulative[9] == 3);
    CHECK(cumulative[LatencyHistogram::NUM_BUCKETS - 1] == 3);
}

TEST_CASE("LatencyHistogram: reset clears sum") {
    LatencyHistogram h;
    h.record(5.0);
    h.reset();
    uint64_t cumulative[LatencyHistogram::NUM_BUCKETS]{};
    uint64_t total  = 99;
    double   sum_us = 99.0;
    h.snapshot_buckets(cumulative, LatencyHistogram::NUM_BUCKETS, &total, &sum_us);
    CHECK(total == 0);
    CHECK(sum_us == doctest::Approx(0.0));
}
