// Unit tests for KillSwitch using doctest
// Tests: activate/deactivate, reason recording, timestamp recording, callbacks, can_trade,
// double-activate
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/risk/kill_switch.h"

#include <atomic>
#include <chrono>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Basic state
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: inactive by default") {
    KillSwitch ks;
    CHECK(ks.is_active() == false);
    CHECK(ks.can_trade() == true);
}

TEST_CASE("KillSwitch: activate sets active") {
    KillSwitch ks;
    ks.activate();
    CHECK(ks.is_active() == true);
    CHECK(ks.can_trade() == false);
}

TEST_CASE("KillSwitch: deactivate clears active") {
    KillSwitch ks;
    ks.activate();
    ks.deactivate();
    CHECK(ks.is_active() == false);
    CHECK(ks.can_trade() == true);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reason recording (regression test for bug where activate() didn't store reason)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: activate records reason MANUAL") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::MANUAL);
    CHECK(ks.last_reason() == KillSwitch::Reason::MANUAL);
}

TEST_CASE("KillSwitch: activate records reason DAILY_LOSS") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::DAILY_LOSS);
    CHECK(ks.last_reason() == KillSwitch::Reason::DAILY_LOSS);
}

TEST_CASE("KillSwitch: activate records reason MAX_DRAWDOWN") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::MAX_DRAWDOWN);
    CHECK(ks.last_reason() == KillSwitch::Reason::MAX_DRAWDOWN);
}

TEST_CASE("KillSwitch: activate records reason MARGIN_CALL") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::MARGIN_CALL);
    CHECK(ks.last_reason() == KillSwitch::Reason::MARGIN_CALL);
}

TEST_CASE("KillSwitch: activate records reason FILE_TRIGGER") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::FILE_TRIGGER);
    CHECK(ks.last_reason() == KillSwitch::Reason::FILE_TRIGGER);
}

TEST_CASE("KillSwitch: default reason is MANUAL before activation") {
    KillSwitch ks;
    CHECK(ks.last_reason() == KillSwitch::Reason::MANUAL);
}

// ═══════════════════════════════════════════════════════════════════════════
// Timestamp recording (regression test for bug where activated_at_ was never set)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: activated_at is zero before activation") {
    KillSwitch ks;
    CHECK(ks.activated_at() == 0);
}

TEST_CASE("KillSwitch: activate sets activated_at timestamp") {
    KillSwitch ks;
    auto       before = std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::system_clock::now().time_since_epoch())
                            .count();
    ks.activate();
    auto after = std::chrono::duration_cast<std::chrono::nanoseconds>(
                     std::chrono::system_clock::now().time_since_epoch())
                     .count();
    CHECK(ks.activated_at() >= static_cast<uint64_t>(before));
    CHECK(ks.activated_at() <= static_cast<uint64_t>(after));
}

// ═══════════════════════════════════════════════════════════════════════════
// Double activate (idempotency)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: double activate is idempotent") {
    KillSwitch       ks;
    std::atomic<int> cancel_count{0};
    ks.set_cancel_all_callback([&]() { cancel_count++; });

    ks.activate(KillSwitch::Reason::DAILY_LOSS);
    ks.activate(KillSwitch::Reason::MAX_DRAWDOWN); // should be no-op

    CHECK(cancel_count.load() == 1);
    CHECK(ks.last_reason() == KillSwitch::Reason::DAILY_LOSS); // first reason kept
}

// ═══════════════════════════════════════════════════════════════════════════
// Callbacks
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: cancel_all callback invoked on activate") {
    KillSwitch        ks;
    std::atomic<bool> cancelled{false};
    ks.set_cancel_all_callback([&]() { cancelled = true; });
    ks.activate();
    CHECK(cancelled.load() == true);
}

TEST_CASE("KillSwitch: close_all callback invoked on activate") {
    KillSwitch        ks;
    std::atomic<bool> closed{false};
    ks.set_close_all_callback([&]() { closed = true; });
    ks.activate();
    CHECK(closed.load() == true);
}

TEST_CASE("KillSwitch: notify callback invoked with correct reason") {
    KillSwitch       ks;
    std::atomic<int> notified_reason{-1};
    ks.set_notify_callback(
        [&](KillSwitch::Reason r) { notified_reason.store(static_cast<int>(r)); });
    ks.activate(KillSwitch::Reason::MARGIN_CALL);
    CHECK(notified_reason.load() == static_cast<int>(KillSwitch::Reason::MARGIN_CALL));
}

TEST_CASE("KillSwitch: callbacks not invoked on double activate") {
    KillSwitch       ks;
    std::atomic<int> count{0};
    ks.set_cancel_all_callback([&]() { count++; });
    ks.set_close_all_callback([&]() { count++; });
    ks.set_notify_callback([&](KillSwitch::Reason) { count++; });

    ks.activate();
    CHECK(count.load() == 3);

    ks.activate();            // no-op
    CHECK(count.load() == 3); // still 3
}

TEST_CASE("KillSwitch: works without any callbacks set") {
    KillSwitch ks;
    ks.activate(KillSwitch::Reason::MANUAL);
    CHECK(ks.is_active() == true);
}

// ═══════════════════════════════════════════════════════════════════════════
// Deactivate and re-activate
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: re-activate after deactivate works") {
    KillSwitch       ks;
    std::atomic<int> cancel_count{0};
    ks.set_cancel_all_callback([&]() { cancel_count++; });

    ks.activate(KillSwitch::Reason::DAILY_LOSS);
    CHECK(cancel_count.load() == 1);

    ks.deactivate();
    CHECK(ks.is_active() == false);

    ks.activate(KillSwitch::Reason::MAX_DRAWDOWN);
    CHECK(cancel_count.load() == 2);
    CHECK(ks.last_reason() == KillSwitch::Reason::MAX_DRAWDOWN);
}

// ═══════════════════════════════════════════════════════════════════════════
// can_trade
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KillSwitch: can_trade false when active") {
    KillSwitch ks;
    ks.activate();
    CHECK(ks.can_trade() == false);
}

TEST_CASE("KillSwitch: can_trade true after deactivate") {
    KillSwitch ks;
    ks.activate();
    ks.deactivate();
    CHECK(ks.can_trade() == true);
}
