// Tests: Order state machine, partial fills, timeout, cancel-replace
#include "../src/execution/order_manager.h"
#include <cassert>
#include <chrono>
#include <cstdio>
#include <thread>

using namespace hft;

void test_order_creation() {
    OrderManager om;
    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);

    assert(cid > 0);
    assert(om.active_count() == 1);

    const OrderRecord* rec = om.get_order(cid);
    assert(rec != nullptr);
    assert(rec->side == Side::BUY);
    assert(rec->quantity == 1.0);
    assert(rec->price == 50000.0);
    assert(rec->state == OrderStateV2::PENDING);

    printf("  [PASS] test_order_creation\n");
}

void test_order_ack() {
    OrderManager om;
    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0);

    om.on_ack(cid, 12345);
    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::ACK);
    assert(rec->order_id == 12345);
    assert(rec->ack_ns > 0);

    printf("  [PASS] test_order_ack\n");
}

void test_order_partial_fill() {
    OrderManager om;
    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 2.0, 50000.0);

    om.on_ack(cid, 1);
    om.on_partial_fill(cid, 0.5, 49999.0);
    om.on_partial_fill(cid, 0.5, 50001.0);

    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::PARTIAL);
    assert(std::abs(rec->filled_quantity - 1.0) < 1e-10);
    // Weighted avg: (49999*0.5 + 50001*0.5) / 1.0 = 50000
    assert(std::abs(rec->avg_fill_price - 50000.0) < 1e-6);

    printf("  [PASS] test_order_partial_fill\n");
}

void test_order_full_fill() {
    OrderManager om;
    uint64_t     cid = om.create_order("BTCUSDT", "binance", Side::SELL, OrderType::MARKET, 1.0);

    om.on_fill(cid, 50100.0, 0.5);
    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::FILLED);
    assert(rec->filled_quantity == 1.0);
    assert(rec->avg_fill_price == 50100.0);
    assert(om.active_count() == 0);

    printf("  [PASS] test_order_full_fill\n");
}

void test_order_cancel() {
    OrderManager om;
    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 49000.0);

    om.on_cancel(cid, "User canceled");
    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::CANCELED);
    assert(om.active_count() == 0);

    printf("  [PASS] test_order_cancel\n");
}

void test_order_reject() {
    OrderManager om;
    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 100.0, 1.0);

    om.on_reject(cid, "Insufficient margin");
    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::REJECTED);
    assert(om.active_count() == 0);

    printf("  [PASS] test_order_reject\n");
}

void test_order_timeout() {
    OrderManager om(100); // 100ms timeout
    bool         timeout_called = false;
    om.set_timeout_callback([&](uint64_t) { timeout_called = true; });

    uint64_t cid = om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 48000.0,
                                   100 * 1'000'000); // 100ms timeout

    // Wait for timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    om.check_timeouts();

    const OrderRecord* rec = om.get_order(cid);
    assert(rec->state == OrderStateV2::EXPIRED);
    assert(timeout_called);
    assert(om.active_count() == 0);

    printf("  [PASS] test_order_timeout\n");
}

void test_multiple_orders() {
    OrderManager          om;
    std::vector<uint64_t> cids;

    for (int i = 0; i < 10; ++i) {
        uint64_t cid =
            om.create_order("BTCUSDT", "binance", Side::BUY, OrderType::LIMIT, 1.0, 50000.0 - i);
        cids.push_back(cid);
    }

    assert(om.active_count() == 10);

    // Fill some, cancel others
    om.on_fill(cids[0], 50000.0);
    om.on_fill(cids[1], 49999.0);
    om.on_cancel(cids[2]);

    assert(om.active_count() == 7);

    printf("  [PASS] test_multiple_orders\n");
}

int main() {
    printf("=== Order Manager Tests ===\n");
    test_order_creation();
    test_order_ack();
    test_order_partial_fill();
    test_order_full_fill();
    test_order_cancel();
    test_order_reject();
    test_order_timeout();
    test_multiple_orders();
    printf("=== All tests passed! ===\n");
    return 0;
}
