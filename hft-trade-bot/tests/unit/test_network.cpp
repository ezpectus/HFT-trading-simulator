// Unit tests for the connection activity watchdog (used by SignalReceiver
// and OrderExecutor for stale-connection detection).
#include "../../src/network/watchdog.h"
#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>

using namespace hft::net;

void test_watchdog_alive() {
    Watchdog wd(100); // 100ms timeout
    assert(wd.is_alive());
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    assert(!wd.is_alive());
    wd.feed();
    assert(wd.is_alive());
    std::cout << "  [PASS] test_watchdog_alive\n";
}

void test_watchdog_idle() {
    Watchdog wd(1000);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    uint64_t idle = wd.idle_ms();
    assert(idle >= 40 && idle <= 100);
    std::cout << "  [PASS] test_watchdog_idle\n";
}

int main() {
    std::cout << "=== Network Tests ===\n";
    test_watchdog_alive();
    test_watchdog_idle();
    std::cout << "=== All tests passed! ===\n";
    return 0;
}
