// Integration test: Kill Switch + System Monitor
// Verifies that the kill switch correctly blocks trading when triggered
// and that the system monitor tracks counters accurately.
#include "../src/monitoring/system_monitor.h"
#include "../src/risk/kill_switch.h"
#include <chrono>
#include <doctest.h>
#include <filesystem>
#include <fstream>
#include <thread>

TEST_SUITE("Kill Switch + System Monitor Integration") {

    TEST_CASE("KillSwitch: file trigger blocks trading until manual reset") {
        const std::string trigger_file = "test_kill_switch_trigger";
        std::filesystem::remove(trigger_file);

        hft::KillSwitch ks(trigger_file);
        ks.start_monitoring(50); // 50ms poll for a fast test

        // Initially, trading should be allowed
        CHECK(ks.can_trade() == true);

        // Create trigger file
        {
            std::ofstream f(trigger_file);
            f << "triggered";
        }

        // Wait for the poll thread to detect it (generous window for CI)
        bool blocked = false;
        for (int i = 0; i < 40 && !blocked; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            blocked = !ks.can_trade();
        }
        CHECK(blocked);
        CHECK(ks.last_reason() == hft::KillSwitch::Reason::FILE_TRIGGER);
        // activate(FILE_TRIGGER) removes the trigger file itself
        CHECK(!std::filesystem::exists(trigger_file));

        // Activation is sticky — removing the file must NOT auto-clear it
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        CHECK(ks.can_trade() == false);

        // Only an explicit manual reset re-enables trading
        ks.deactivate();
        CHECK(ks.can_trade() == true);

        ks.stop_monitoring();
    }

    TEST_CASE("SystemMonitor: counters increment correctly") {
        hft::SystemMonitor monitor;

        CHECK(monitor.get(hft::SystemMonitor::Metric::ORDERS_SENT) == 0);
        CHECK(monitor.get(hft::SystemMonitor::Metric::SIGNALS_RECEIVED) == 0);
        CHECK(monitor.get(hft::SystemMonitor::Metric::ERRORS) == 0);

        monitor.increment(hft::SystemMonitor::Metric::ORDERS_SENT);
        monitor.increment(hft::SystemMonitor::Metric::ORDERS_SENT);
        monitor.increment(hft::SystemMonitor::Metric::SIGNALS_RECEIVED);
        monitor.increment(hft::SystemMonitor::Metric::ERRORS);

        CHECK(monitor.get(hft::SystemMonitor::Metric::ORDERS_SENT) == 2);
        CHECK(monitor.get(hft::SystemMonitor::Metric::SIGNALS_RECEIVED) == 1);
        CHECK(monitor.get(hft::SystemMonitor::Metric::ERRORS) == 1);
    }

    TEST_CASE("SystemMonitor: snapshot reflects counters") {
        hft::SystemMonitor monitor;

        monitor.increment(hft::SystemMonitor::Metric::ORDERS_SENT, 5);
        monitor.increment(hft::SystemMonitor::Metric::SIGNALS_RECEIVED, 3);

        auto snapshot = monitor.snapshot();
        CHECK(snapshot.orders_sent == 5);
        CHECK(snapshot.signals_received == 3);
        CHECK(snapshot.errors == 0);
    }

} // TEST_SUITE
