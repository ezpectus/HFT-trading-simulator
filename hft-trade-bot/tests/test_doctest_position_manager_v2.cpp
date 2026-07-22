// Unit tests for PositionManagerV2 using doctest
// Tests: open/add/close/reverse, weighted average entry, realized/unrealized PnL,
//        margin calculation, fees, SL/TP triggers, margin call, aggregation, reset
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/position/position_manager_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// PositionV2 struct
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionV2: default position is closed") {
    PositionV2 pos;
    CHECK_FALSE(pos.is_open());
    CHECK(pos.quantity == doctest::Approx(0.0));
}

TEST_CASE("PositionV2: is_long for BUY side") {
    PositionV2 pos;
    pos.side = Side::BUY;
    CHECK(pos.is_long());
}

TEST_CASE("PositionV2: is_short for SELL side") {
    PositionV2 pos;
    pos.side = Side::SELL;
    CHECK_FALSE(pos.is_long());
}

TEST_CASE("PositionV2: notional = quantity * entry_price") {
    PositionV2 pos;
    pos.quantity    = 2.0;
    pos.entry_price = 50000.0;
    CHECK(pos.notional() == doctest::Approx(100000.0));
}

TEST_CASE("PositionV2: update_unrealized long position") {
    PositionV2 pos;
    pos.side        = Side::BUY;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_unrealized(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("PositionV2: update_unrealized short position") {
    PositionV2 pos;
    pos.side        = Side::SELL;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_unrealized(49000.0);
    // Short: (entry - mark) * qty = (50000 - 49000) * 1 = 1000
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("PositionV2: update_unrealized zero when closed") {
    PositionV2 pos;
    pos.quantity = 0.0;
    pos.update_unrealized(50000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(0.0));
}

TEST_CASE("PositionV2: update_unrealized long negative when price drops") {
    PositionV2 pos;
    pos.side        = Side::BUY;
    pos.quantity    = 2.0;
    pos.entry_price = 50000.0;
    pos.update_unrealized(48000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(-4000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — open / add / close
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: open new long position") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.is_open());
    CHECK(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
    CHECK(pos.entry_price == doctest::Approx(50000.0));
}

TEST_CASE("PositionManagerV2: open new short position") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 50000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.is_open());
    CHECK_FALSE(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
}

TEST_CASE("PositionManagerV2: add to long position — weighted average") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 52000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.quantity == doctest::Approx(2.0));
    // Weighted avg: (50000*1 + 52000*1) / 2 = 51000
    CHECK(pos.entry_price == doctest::Approx(51000.0));
}

TEST_CASE("PositionManagerV2: add to short position — weighted average") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 2.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 49000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.quantity == doctest::Approx(3.0));
    // (50000*2 + 49000*1) / 3 = 149000/3
    CHECK(pos.entry_price == doctest::Approx(149000.0 / 3.0));
}

TEST_CASE("PositionManagerV2: close long position — realized PnL") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK_FALSE(pos.is_open());
    // Realized: (51000 - 50000) * 1 = 1000
    CHECK(pos.realized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("PositionManagerV2: close short position — realized PnL") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 49000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK_FALSE(pos.is_open());
    // Short realized: (50000 - 49000) * 1 = 1000
    CHECK(pos.realized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("PositionManagerV2: partial close long — realized PnL") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 2.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 52000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.is_open());
    CHECK(pos.quantity == doctest::Approx(1.0));
    // Realized: (52000 - 50000) * 1 = 2000
    CHECK(pos.realized_pnl == doctest::Approx(2000.0));
}

TEST_CASE("PositionManagerV2: reverse position long to short") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    // Sell 2: close 1 long, open 1 short
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 2.0, 49000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.is_open());
    CHECK_FALSE(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
    CHECK(pos.entry_price == doctest::Approx(49000.0));
    // Realized on closed long: (49000 - 50000) * 1 = -1000
    CHECK(pos.realized_pnl == doctest::Approx(-1000.0));
}

TEST_CASE("PositionManagerV2: reverse position short to long") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 50000.0);
    // Buy 3: close 1 short, open 2 long
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 3.0, 51000.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.is_open());
    CHECK(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(2.0));
    CHECK(pos.entry_price == doctest::Approx(51000.0));
    // Realized on closed short: (50000 - 51000) * 1 = -1000
    CHECK(pos.realized_pnl == doctest::Approx(-1000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — margin
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: margin calculated on open") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    auto pos = pm.get_position("BTCUSDT", "binance");
    // margin = (qty * price) / leverage = 50000 / 10 = 5000
    CHECK(pos.margin == doctest::Approx(5000.0));
}

TEST_CASE("PositionManagerV2: margin with leverage 1") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 2.0, 50000.0, 0.0, 1);
    auto pos = pm.get_position("BTCUSDT", "binance");
    // margin = 100000 / 1 = 100000
    CHECK(pos.margin == doctest::Approx(100000.0));
}

TEST_CASE("PositionManagerV2: margin increases on add") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 52000.0, 0.0, 10);
    auto pos = pm.get_position("BTCUSDT", "binance");
    // 5000 + 5200 = 10200
    CHECK(pos.margin == doctest::Approx(10200.0));
}

TEST_CASE("PositionManagerV2: margin zero when closed") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0, 0.0, 10);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.margin == doctest::Approx(0.0));
}

TEST_CASE("PositionManagerV2: total_margin across positions") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0, 0.0, 10);
    // 5000 + 300 = 5300
    CHECK(pm.total_margin() == doctest::Approx(5300.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — fees
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: fees accumulate") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 10.0);
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 51000.0, 10.0);
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.total_fees == doctest::Approx(20.0));
}

TEST_CASE("PositionManagerV2: total_fees across positions") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 5.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0, 3.0);
    CHECK(pm.total_fees() == doctest::Approx(8.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — mark price updates & unrealized PnL
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: update_mark_prices sets unrealized PnL") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.update_mark_prices({{"BTCUSDT", 51000.0}});
    auto pos = pm.get_position("BTCUSDT", "binance");
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("PositionManagerV2: total_unrealized_pnl across positions") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0);
    pm.update_mark_prices({{"BTCUSDT", 51000.0}, {"ETHUSDT", 3100.0}});
    // BTC: 1000, ETH: 100 → total 1100
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(1100.0));
}

TEST_CASE("PositionManagerV2: total_realized_pnl") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0);
    CHECK(pm.total_realized_pnl() == doctest::Approx(1000.0));
}

TEST_CASE("PositionManagerV2: total_pnl = unrealized + realized") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 2.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0);
    pm.update_mark_prices({{"BTCUSDT", 50500.0}});
    // Realized: 1000, Unrealized: (50500-50000)*1 = 500 → total 1500
    CHECK(pm.total_pnl() == doctest::Approx(1500.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — position queries
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: has_position returns true for open") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    CHECK(pm.has_position("BTCUSDT"));
}

TEST_CASE("PositionManagerV2: has_position returns false when closed") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0);
    CHECK_FALSE(pm.has_position("BTCUSDT"));
}

TEST_CASE("PositionManagerV2: has_position returns false when never opened") {
    PositionManagerV2 pm;
    CHECK_FALSE(pm.has_position("BTCUSDT"));
}

TEST_CASE("PositionManagerV2: get_position returns empty for unknown") {
    PositionManagerV2 pm;
    auto              pos = pm.get_position("UNKNOWN", "binance");
    CHECK_FALSE(pos.is_open());
}

TEST_CASE("PositionManagerV2: get_position without exchange matches symbol") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    auto pos = pm.get_position("BTCUSDT");
    CHECK(pos.is_open());
    CHECK(pos.symbol == "BTCUSDT");
}

TEST_CASE("PositionManagerV2: get_all_positions returns only open") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0);
    pm.on_fill("ETHUSDT", "binance", Side::SELL, 1.0, 3100.0);
    auto all = pm.get_all_positions();
    CHECK(all.size() == 1);
    CHECK(all[0].symbol == "BTCUSDT");
}

TEST_CASE("PositionManagerV2: open_position_count") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0);
    CHECK(pm.open_position_count() == 2);
}

TEST_CASE("PositionManagerV2: total_notional across positions") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 2.0, 3000.0);
    // 50000 + 6000 = 56000
    CHECK(pm.total_notional() == doctest::Approx(56000.0));
}

TEST_CASE("PositionManagerV2: separate positions per exchange") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "bybit", Side::BUY, 2.0, 51000.0);
    auto pos_b = pm.get_position("BTCUSDT", "binance");
    auto pos_y = pm.get_position("BTCUSDT", "bybit");
    CHECK(pos_b.quantity == doctest::Approx(1.0));
    CHECK(pos_y.quantity == doctest::Approx(2.0));
    CHECK(pm.open_position_count() == 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — SL/TP checking
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: SL trigger for long") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    // SL distance = 50000 * 0.01 * 2 = 1000 → SL at 49000
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 48500.0}}, 2.0, 3.0);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
    CHECK(triggers[0].symbol == "BTCUSDT");
}

TEST_CASE("PositionManagerV2: TP trigger for long") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    // TP distance = 50000 * 0.01 * 3 = 1500 → TP at 51500
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 52000.0}}, 2.0, 3.0);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("PositionManagerV2: SL trigger for short") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 50000.0);
    // SL distance = 50000 * 0.01 * 2 = 1000 → SL at 51000
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 51500.0}}, 2.0, 3.0);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("PositionManagerV2: TP trigger for short") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 50000.0);
    // TP distance = 50000 * 0.01 * 3 = 1500 → TP at 48500
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 48000.0}}, 2.0, 3.0);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("PositionManagerV2: no trigger when price in range") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 50500.0}}, 2.0, 3.0);
    CHECK(triggers.empty());
}

TEST_CASE("PositionManagerV2: no trigger for closed position") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("BTCUSDT", "binance", Side::SELL, 1.0, 51000.0);
    auto triggers = pm.check_sl_tp({{"BTCUSDT", 40000.0}}, 2.0, 3.0);
    CHECK(triggers.empty());
}

TEST_CASE("PositionManagerV2: no trigger when price missing") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    auto triggers = pm.check_sl_tp({{"ETHUSDT", 3000.0}}, 2.0, 3.0);
    CHECK(triggers.empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — margin call
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: margin call when equity low") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    // margin = 5000, equity = 5050
    // margin_ratio = (5050 - 5000) / 5000 = 0.01 < 0.005? No, 0.01 > 0.005
    // Need equity closer: equity = 5020 → (5020-5000)/5000 = 0.004 < 0.005
    CHECK(pm.check_margin_call(5020.0));
}

TEST_CASE("PositionManagerV2: no margin call when equity sufficient") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    // margin = 5000, equity = 10000
    // margin_ratio = (10000 - 5000) / 5000 = 1.0 > 0.005
    CHECK_FALSE(pm.check_margin_call(10000.0));
}

TEST_CASE("PositionManagerV2: no margin call with no positions") {
    PositionManagerV2 pm;
    CHECK_FALSE(pm.check_margin_call(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2: reset clears all positions") {
    PositionManagerV2 pm;
    pm.on_fill("BTCUSDT", "binance", Side::BUY, 1.0, 50000.0);
    pm.on_fill("ETHUSDT", "binance", Side::BUY, 1.0, 3000.0);
    pm.reset();
    CHECK(pm.open_position_count() == 0);
    CHECK_FALSE(pm.has_position("BTCUSDT"));
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(0.0));
    CHECK(pm.total_realized_pnl() == doctest::Approx(0.0));
}
