// Integration test: Kill Switch + System Monitor
// Verifies that the kill switch correctly blocks trading when triggered
// and that the system monitor tracks counters accurately.
#include "../src/risk/kill_switch.h"
#include "../src/monitoring/system_monitor.h"
#include <doctest.h>
#include <filesystem>
#include <fstream>
#include <thread>
#include <chrono>

TEST_SUITE("Kill Switch + System Monitor Integration") {

TEST_CASE("KillSwitch: file trigger blocks trading") {
    const std::string trigger_file = "test_kill_switch_trigger";
    std::filesystem::remove(trigger_file);

    hft::KillSwitch ks(trigger_file, 0.5);  // 0.5s poll interval

    // Initially, trading should be allowed
    CHECK(ks.can_trade() == true);

    // Create trigger file
    {
        std::ofstream f(trigger_file);
        f << "triggered";
    }

    // Wait for poll thread to detect it
    std::this_thread::sleep_for(std::chrono::milliseconds(800));

    // Now trading should be blocked
    CHECK(ks.can_trade() == false);

    // Remove trigger file
    std::filesystem::remove(trigger_file);

    // Wait for poll thread to clear it
    std::this_thread::sleep_for(std::chrono::milliseconds(800));

    // Trading should be allowed again
    CHECK(ks.can_trade() == true);
}

TEST_CASE("SystemMonitor: counters increment correctly") {
    hft::SystemMonitor monitor;

    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::OrdersSent) == 0);
    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::SignalsReceived) == 0);
    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::Errors) == 0);

    monitor.increment(hft::SystemMonitor::Counter::OrdersSent);
    monitor.increment(hft::SystemMonitor::Counter::OrdersSent);
    monitor.increment(hft::SystemMonitor::Counter::SignalsReceived);
    monitor.increment(hft::SystemMonitor::Counter::Errors);

    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::OrdersSent) == 2);
    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::SignalsReceived) == 1);
    CHECK(monitor.get_counter(hft::SystemMonitor::Counter::Errors) == 1);
}

TEST_CASE("SystemMonitor: snapshot contains all counters") {
    hft::SystemMonitor monitor;

    monitor.increment(hft::SystemMonitor::Counter::OrdersSent, 5);
    monitor.increment(hft::SystemMonitor::Counter::SignalsReceived, 3);

    auto snapshot = monitor.snapshot();
    CHECK(snapshot.find("orders_sent") != snapshot.end());
    CHECK(snapshot.find("signals_received") != snapshot.end());
    CHECK(snapshot.at("orders_sent") == 5);
    CHECK(snapshot.at("signals_received") == 3);
}

} // TEST_SUITE
