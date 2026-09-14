// Unit tests for monitoring::SystemMonitor
#include "../../src/monitoring/system_monitor.h"
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include <chrono>
#include <iostream>
#include <thread>

using namespace hft;

TEST_CASE("test_basic_counters") {
    SystemMonitor mon;
    REQUIRE(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
    mon.increment(SystemMonitor::Metric::ORDERS_SENT);
    REQUIRE(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 1);
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 5);
    REQUIRE(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 6);
}

TEST_CASE("test_fill_rate") {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    mon.increment(SystemMonitor::Metric::ORDERS_FILLED, 75);
    double fr = mon.fill_rate();
    REQUIRE(fr > 0.74 && fr < 0.76);
}

TEST_CASE("test_rejection_rate") {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 100);
    mon.increment(SystemMonitor::Metric::ORDERS_REJECTED, 10);
    double rr = mon.rejection_rate();
    REQUIRE(rr > 0.09 && rr < 0.11);
}

TEST_CASE("test_snapshot") {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 50);
    mon.increment(SystemMonitor::Metric::ORDERS_FILLED, 40);
    mon.increment(SystemMonitor::Metric::ERRORS, 3);
    auto s = mon.snapshot();
    REQUIRE(s.orders_sent == 50);
    REQUIRE(s.orders_filled == 40);
    REQUIRE(s.errors == 3);
    REQUIRE(s.fill_rate > 0.79 && s.fill_rate < 0.81);
}

TEST_CASE("test_reset") {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 10);
    mon.reset();
    REQUIRE(mon.get(SystemMonitor::Metric::ORDERS_SENT) == 0);
}

TEST_CASE("test_json_format") {
    SystemMonitor mon;
    mon.increment(SystemMonitor::Metric::ORDERS_SENT, 5);
    std::string json = mon.format_json();
    REQUIRE(json.find("\"orders_sent\":5") != std::string::npos);
    REQUIRE(json.find("{") == 0);
    REQUIRE(json.rfind("}") == json.size() - 1);
}

TEST_CASE("test_uptime") {
    SystemMonitor mon;
    std::this_thread::sleep_for(std::chrono::seconds(1));
    REQUIRE(mon.uptime_seconds() >= 1);
}

TEST_CASE("test_health_status") {
    HealthStatus hs;
    REQUIRE(hs.is_healthy());
    hs.shm_healthy = false;
    REQUIRE(!hs.is_healthy());
    hs.shm_healthy      = true;
    hs.error_count_5min = 200;
    REQUIRE(!hs.is_healthy());
    hs.error_count_5min   = 10;
    hs.last_signal_age_ms = 20000;
    REQUIRE(!hs.is_healthy());
}

TEST_CASE("test_health_json") {
    HealthStatus hs;
    hs.memory_usage_mb = 256;
    std::string json   = hs.format_json();
    REQUIRE(json.find("\"healthy\":true") != std::string::npos);
    REQUIRE(json.find("256") != std::string::npos);
}
