// Tests: PnL, position averaging, margin, SL/TP
#include "../src/position/position_manager_v2.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <unordered_map>

using namespace hft;

void test_open_position() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 5.0, 10);

    auto pos = pm.get_position("BTCUSDT");
    assert(pos.is_open());
    assert(pos.is_long());
    assert(pos.quantity == 1.0);
    assert(pos.entry_price == 50000.0);
    assert(pos.leverage == 10);

    printf("  [PASS] test_open_position\n");
}

void test_add_to_position() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 51000.0);

    auto pos = pm.get_position("BTCUSDT");
    assert(pos.quantity == 2.0);
    // Weighted avg: (50000*1 + 51000*1) / 2 = 50500
    assert(std::abs(pos.entry_price - 50500.0) < 1e-6);

    printf("  [PASS] test_add_to_position\n");
}

void test_close_position() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0); // Close

    auto pos = pm.get_position("BTCUSDT");
    assert(!pos.is_open());
    assert(pos.realized_pnl == 1000.0); // (51000 - 50000) * 1.0

    printf("  [PASS] test_close_position (realized_pnl=%.2f)\n", pos.realized_pnl);
}

void test_partial_close() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 2.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0); // Partial close

    auto pos = pm.get_position("BTCUSDT");
    assert(pos.is_open());
    assert(pos.quantity == 1.0);
    assert(pos.realized_pnl == 1000.0); // (51000 - 50000) * 1.0

    printf("  [PASS] test_partial_close (remaining=%.2f realized=%.2f)\n", pos.quantity,
           pos.realized_pnl);
}

void test_unrealized_pnl() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);

    std::unordered_map<std::string, double> prices = {{"BTCUSDT", 52000.0}};
    pm.update_mark_prices(prices);

    auto pos = pm.get_position("BTCUSDT");
    assert(std::abs(pos.unrealized_pnl - 2000.0) < 1e-6); // (52000 - 50000) * 1.0

    assert(pm.total_unrealized_pnl() == 2000.0);

    printf("  [PASS] test_unrealized_pnl\n");
}

void test_short_position() {
    PositionManagerV2 pm;
    pm.on_fill("ETHUSDT", "okx", Side::SELL, 10.0, 3000.0);

    auto pos = pm.get_position("ETHUSDT");
    assert(pos.is_open());
    assert(!pos.is_long());

    std::unordered_map<std::string, double> prices = {{"ETHUSDT", 2900.0}};
    pm.update_mark_prices(prices);

    // Short PnL: (3000 - 2900) * 10 = 1000
    assert(std::abs(pos.unrealized_pnl - 1000.0) < 1e-6);

    printf("  [PASS] test_short_position\n");
}

void test_margin() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);

    auto pos = pm.get_position("BTCUSDT");
    // Margin = (1 * 50000) / 10 = 5000
    assert(std::abs(pos.margin - 5000.0) < 1e-6);
    assert(pm.total_margin() == 5000.0);

    printf("  [PASS] test_margin\n");
}

void test_aggregate_pnl() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "okx", Side::BUY, 10.0, 3000.0);

    std::unordered_map<std::string, double> prices = {{"BTCUSDT", 51000.0}, {"ETHUSDT", 3100.0}};
    pm.update_mark_prices(prices);

    // BTC unrealized: (51000 - 50000) * 1 = 1000
    // ETH unrealized: (3100 - 3000) * 10 = 1000
    assert(std::abs(pm.total_unrealized_pnl() - 2000.0) < 1e-6);

    printf("  [PASS] test_aggregate_pnl\n");
}

void test_sl_tp_check() {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);

    // Price drops below SL (entry - 2% = 49000)
    std::unordered_map<std::string, double> prices   = {{"BTCUSDT", 48000.0}};
    auto                                    triggers = pm.check_sl_tp(prices, 2.0, 3.0);

    assert(!triggers.empty());
    assert(triggers[0].reason == "STOP_LOSS");

    printf("  [PASS] test_sl_tp_check\n");
}

int main() {
    printf("=== Position Manager V2 Tests ===\n");
    test_open_position();
    test_add_to_position();
    test_close_position();
    test_partial_close();
    test_unrealized_pnl();
    test_short_position();
    test_margin();
    test_aggregate_pnl();
    test_sl_tp_check();
    printf("=== All tests passed! ===\n");
    return 0;
}
