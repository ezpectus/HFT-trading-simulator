// Unit tests for OrderManager using doctest
// Tests: create, ACK, partial fill, full fill, cancel, reject, expire, timeout, modify, slot reuse
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/execution/order_manager.h"

#include <atomic>
#include <chrono>
#include <thread>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════════
static OrderManager make_mgr(int64_t timeout_ms = 5000) {
    return OrderManager(timeout_ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// Create order
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Create order returns valid client ID") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    CHECK(cid > 0);
    CHECK(mgr.active_count() == 1);
}

TEST_CASE("Create order stores correct fields") {
    auto        mgr = make_mgr();
    uint64_t    cid = mgr.create_order("ETH/USDT", "okx", Side::SELL, OrderType::MARKET, 2.5, 0.0);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(std::string(rec->symbol) == "ETH/USDT");
    CHECK(std::string(rec->exchange) == "okx");
    CHECK(rec->side == Side::SELL);
    CHECK(rec->quantity == doctest::Approx(2.5));
    CHECK(rec->state == OrderStateV2::PENDING);
}

TEST_CASE("Get order returns nullptr for unknown ID") {
    auto mgr = make_mgr();
    CHECK(mgr.get_order(99999) == nullptr);
}

// ═══════════════════════════════════════════════════════════════════════════
// ACK
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("ACK sets exchange order ID and state") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_ack(cid, 123456);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->order_id == 123456);
    CHECK(rec->state == OrderStateV2::ACK);
    CHECK(rec->ack_ns > 0);
}

TEST_CASE("ACK for unknown ID is ignored") {
    auto mgr = make_mgr();
    mgr.on_ack(99999, 123456);
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Partial fill
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Partial fill updates quantity and avg price") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 2.0, 50000.0);
    mgr.on_ack(cid, 1);
    mgr.on_partial_fill(cid, 0.5, 50100.0, 1.0);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->filled_quantity == doctest::Approx(0.5));
    CHECK(rec->avg_fill_price == doctest::Approx(50100.0));
    CHECK(rec->state == OrderStateV2::PARTIAL);
    CHECK(rec->fee == doctest::Approx(1.0));
    CHECK(mgr.active_count() == 1);
}

TEST_CASE("Partial fill then completing transitions to FILLED") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_ack(cid, 1);
    mgr.on_partial_fill(cid, 0.5, 50100.0, 1.0);
    mgr.on_partial_fill(cid, 0.5, 50200.0, 1.0);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->filled_quantity == doctest::Approx(1.0));
    // avg = (50100*0.5 + 50200*0.5) / 1.0 = 50150
    CHECK(rec->avg_fill_price == doctest::Approx(50150.0));
    CHECK(rec->state == OrderStateV2::FILLED);
    CHECK(mgr.active_count() == 0);
}

TEST_CASE("Partial fill callback called once on completion") {
    auto mgr        = make_mgr();
    int  call_count = 0;
    mgr.set_fill_callback([&call_count](const OrderRecord&) { call_count++; });

    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_ack(cid, 1);
    // Single partial fill that completes the order
    mgr.on_partial_fill(cid, 1.0, 50000.0, 0.0);
    CHECK(call_count == 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// Full fill
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Full fill sets state and decrements active count") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_ack(cid, 1);
    mgr.on_fill(cid, 50050.0, 2.0);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::FILLED);
    CHECK(rec->filled_quantity == doctest::Approx(1.0));
    CHECK(rec->avg_fill_price == doctest::Approx(50050.0));
    CHECK(rec->fee == doctest::Approx(2.0));
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cancel
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Cancel sets state and decrements active count") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_cancel(cid, "User cancelled");
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::CANCELED);
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reject
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Reject sets state and reason") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_reject(cid, "Insufficient balance");
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::REJECTED);
    CHECK(std::string(rec->reject_reason) == "Insufficient balance");
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Expire
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Expire sets state and decrements active count") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_expire(cid);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::EXPIRED);
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Timeout
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("check_timeouts expires pending orders past timeout") {
    // Use 1ms timeout
    OrderManager mgr(1);
    uint64_t     cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    // Wait for timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    mgr.check_timeouts();
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::EXPIRED);
    CHECK(mgr.active_count() == 0);
}

TEST_CASE("check_timeouts calls timeout and cancel callbacks") {
    OrderManager mgr(1);
    bool         timeout_called = false;
    bool         cancel_called  = false;
    mgr.set_timeout_callback([&timeout_called](uint64_t) { timeout_called = true; });
    mgr.set_cancel_callback([&cancel_called](uint64_t) { cancel_called = true; });

    mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    mgr.check_timeouts();
    CHECK(timeout_called);
    CHECK(cancel_called);
}

// ═══════════════════════════════════════════════════════════════════════════
// Modify (cancel-replace)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Modify order creates new order with updated params") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_ack(cid, 1);
    uint64_t new_cid = mgr.modify_order(cid, 2.0, 51000.0);
    CHECK(new_cid > 0);
    CHECK(new_cid != cid);
    const auto* old_rec = mgr.get_order(cid);
    REQUIRE(old_rec != nullptr);
    CHECK(old_rec->state == OrderStateV2::MODIFY_PENDING);
    const auto* new_rec = mgr.get_order(new_cid);
    REQUIRE(new_rec != nullptr);
    CHECK(new_rec->quantity == doctest::Approx(2.0));
    CHECK(new_rec->price == doctest::Approx(51000.0));
}

TEST_CASE("Modify order on non-ACK state returns 0") {
    auto     mgr = make_mgr();
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    // Still PENDING, not ACK
    CHECK(mgr.modify_order(cid, 2.0, 51000.0) == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Slot reuse (regression for cid_to_slot_ cleanup)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Slot reuse cleans up old cid_to_slot_ entry") {
    auto     mgr = make_mgr();
    uint64_t cid1 =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    mgr.on_fill(cid1, 50000.0); // Terminal state → slot can be reused

    // Old cid should still be in map (not cleaned up until slot reuse)
    CHECK(mgr.get_order(cid1) != nullptr);

    // Create new order — should reuse slot and clean up old entry
    uint64_t cid2 = mgr.create_order("ETH/USDT", "okx", Side::SELL, OrderType::LIMIT, 2.0, 3000.0);
    CHECK(cid2 > 0);

    // Old cid should no longer be in map (cleaned up during slot reuse)
    CHECK(mgr.get_order(cid1) == nullptr);

    // New order should be accessible
    const auto* rec = mgr.get_order(cid2);
    REQUIRE(rec != nullptr);
    CHECK(std::string(rec->symbol) == "ETH/USDT");
}

TEST_CASE("Multiple orders can be created and tracked") {
    auto                  mgr = make_mgr();
    std::vector<uint64_t> cids;
    for (int i = 0; i < 10; ++i) {
        uint64_t cid = mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0,
                                        50000.0 + i * 100);
        CHECK(cid > 0);
        cids.push_back(cid);
    }
    CHECK(mgr.active_count() == 10);

    // Fill all
    for (auto cid : cids) {
        mgr.on_fill(cid, 50000.0);
    }
    CHECK(mgr.active_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// check_timeouts scan range optimization (regression)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("check_timeouts only scans up to max_slot_used") {
    auto     mgr = make_mgr(1); // 1ms timeout
    uint64_t cid =
        mgr.create_order("BTC/USDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);
    REQUIRE(cid > 0);

    std::atomic<bool> timeout_called{false};
    mgr.set_timeout_callback([&](uint64_t) { timeout_called = true; });

    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    mgr.check_timeouts();

    CHECK(timeout_called.load() == true);
    const auto* rec = mgr.get_order(cid);
    REQUIRE(rec != nullptr);
    CHECK(rec->state == OrderStateV2::EXPIRED);
}

TEST_CASE("check_timeouts safe with no orders") {
    auto mgr = make_mgr();
    mgr.check_timeouts();
}
