// Unit tests for SystemMonitor, MemoryTracker, HealthStatus
// Tests: increment/get, fill_rate, rejection_rate, snapshot fields, reset,
//        format_json contains all metrics, MemoryTracker alloc/dealloc,
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
    CHECK(sm.get(SystemMonitor::Metric::HEARTBEATS_SENT) == 0);
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
    sm.increment(SystemMonitor::Metric::HEARTBEATS_SENT, 100);
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
    CHECK(s.heartbeats_sent == 100);
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
    sm.increment(SystemMonitor::Metric::HEARTBEATS_SENT, 100);
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
    CHECK(json.find("\"heartbeats_sent\":100") != std::string::npos);
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
// MemoryTracker
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MemoryTracker: initial state is zero") {
    MemoryTracker mt;
    CHECK(mt.current_usage() == 0);
    CHECK(mt.total_allocated() == 0);
    CHECK(mt.max_single_alloc() == 0);
}

TEST_CASE("MemoryTracker: record_allocation updates all metrics") {
    MemoryTracker mt;
    mt.record_allocation(1024);
    CHECK(mt.current_usage() == 1024);
    CHECK(mt.total_allocated() == 1024);
    CHECK(mt.max_single_alloc() == 1024);
}

TEST_CASE("MemoryTracker: multiple allocations accumulate") {
    MemoryTracker mt;
    mt.record_allocation(512);
    mt.record_allocation(2048);
    CHECK(mt.current_usage() == 2560);
    CHECK(mt.total_allocated() == 2560);
    CHECK(mt.max_single_alloc() == 2048);
}

TEST_CASE("MemoryTracker: record_deallocation reduces current usage") {
    MemoryTracker mt;
    mt.record_allocation(2048);
    mt.record_deallocation(512);
    CHECK(mt.current_usage() == 1536);
    CHECK(mt.total_allocated() == 2048); // total doesn't decrease
}

TEST_CASE("MemoryTracker: max_single_alloc tracks largest single allocation") {
    MemoryTracker mt;
    mt.record_allocation(100);
    mt.record_allocation(500);
    mt.record_allocation(200);
    CHECK(mt.max_single_alloc() == 500);
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
