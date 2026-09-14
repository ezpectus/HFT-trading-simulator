// Unit tests for the connection activity watchdog (used by SignalReceiver
// and OrderExecutor for stale-connection detection).
#include "../../src/network/watchdog.h"
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include <chrono>
#include <iostream>
#include <thread>

using namespace hft::net;

TEST_CASE("test_watchdog_alive") {
    Watchdog wd(100); // 100ms timeout
    REQUIRE(wd.is_alive());
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    REQUIRE(!wd.is_alive());
    wd.feed();
    REQUIRE(wd.is_alive());
}

TEST_CASE("test_watchdog_idle") {
    Watchdog wd(1000);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    uint64_t idle = wd.idle_ms();
    REQUIRE(idle >= 40 && idle <= 100);
}
