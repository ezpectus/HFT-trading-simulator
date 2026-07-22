// Unit tests for monitoring::SystemMonitor
#include "../../src/monitoring/system_monitor.h"
#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>

using namespace hft;

void test_basic_counters() {
    SystemMonitor mon;
    assert(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
    mon.increment(SystemMonitor::Metric::ORDERS_SENT);
    assert(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 1);
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 5);
    assert(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 6);
    std::cout << "  [PASS] test_basic_counters\n";
}

void test_fill_rate() {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    mon.increment(SystemMonitor::Metric::ORDERS_FILLED, 75);
    double fr = mon.fill_rate();
    assert(fr > 0.74 && fr < 0.76);
    std::cout << "  [PASS] test_fill_rate\n";
}

void test_rejection_rate() {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    mon.increment(SystemMonitor::Metric::ORDERS_REJECTED, 10);
    double rr = mon.rejection_rate();
    assert(rr > 0.09 && rr < 0.11);
    std::cout << "  [PASS] test_rejection_rate\n";
}

void test_snapshot() {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 50);
    mon.increment(SystemMonitor::Metric::ORDERS_FILLED, 40);
    mon.increment(SystemMonitor::Metric::ERRORS, 3);
    auto s = mon.snapshot();
    assert(s.orders_sent == 50);
    assert(s.orders_filled == 40);
    assert(s.errors == 3);
    assert(s.fill_rate > 0.79 && s.fill_rate < 0.81);
    std::cout << "  [PASS] test_snapshot\n";
}

void test_reset() {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    mon.reset();
    assert(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
    std::cout << "  [PASS] test_reset\n";
}

void test_json_format() {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 5);
    std::string json = mon.format_json();
    assert(json.find("\"orders_sent\":5") != std::string::npos);
    assert(json.find("{") == 0);
    assert(json.rfind("}") == json.size() - 1);
    std::cout << "  [PASS] test_json_format\n";
}

void test_uptime() {
    SystemMonitor mon;
    std::this_thread::sleep_for(std::chrono::seconds(1));
    assert(mon.uptime_seconds() >= 1);
    std::cout << "  [PASS] test_uptime\n";
}

void test_memory_tracker() {
    MemoryTracker mt;
    mt.record_allocation(1024);
    assert(mt.current_usage() == 1024);
    mt.record_allocation(2048);
    assert(mt.current_usage() == 3072);
    mt.record_deallocation(1024);
    assert(mt.current_usage() == 2048);
    assert(mt.total_allocated() == 3072);
    assert(mt.max_single_alloc() == 2048);
    std::cout << "  [PASS] test_memory_tracker\n";
}

void test_health_status() {
    HealthStatus hs;
    assert(hs.is_healthy());
    hs.shm_healthy = false;
    assert(!hs.is_healthy());
    hs.shm_healthy      = true;
    hs.error_count_5min = 200;
    assert(!hs.is_healthy());
    hs.error_count_5min   = 10;
    hs.last_signal_age_ms = 20000;
    assert(!hs.is_healthy());
    std::cout << "  [PASS] test_health_status\n";
}

void test_health_json() {
    HealthStatus hs;
    hs.memory_usage_mb = 256;
    std::string json   = hs.format_json();
    assert(json.find("\"healthy\":true") != std::string::npos);
    assert(json.find("256") != std::string::npos);
    std::cout << "  [PASS] test_health_json\n";
}

int main() {
    std::cout << "=== SystemMonitor Tests ===\n";
    test_basic_counters();
    test_fill_rate();
    test_rejection_rate();
    test_snapshot();
    test_reset();
    test_json_format();
    test_uptime();
    test_memory_tracker();
    test_health_status();
    test_health_json();
    std::cout << "=== All tests passed! ===\n";
    return 0;
}
