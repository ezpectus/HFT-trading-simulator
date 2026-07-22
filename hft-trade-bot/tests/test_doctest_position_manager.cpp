// Unit tests for PositionManagerV2 using doctest
// Tests: open/add/close/reverse positions, PnL, margin, SL/TP, margin call, reset
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/position/position_manager_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper: create a fill on the manager
// ═══════════════════════════════════════════════════════════════════════════
static void fill(PositionManagerV2& pm, const char* sym, const char* exch, Side side, double qty,
                 double price, double fee = 0.0, int lev = 1) {
    pm.on_fill(sym, exch, side, qty, price, fee, lev);
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionV2 struct tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionV2 default values") {
    PositionV2 pos;
    CHECK(pos.symbol.empty());
    CHECK(pos.side == Side::BUY);
    CHECK(pos.quantity == doctest::Approx(0.0));
    CHECK(pos.entry_price == doctest::Approx(0.0));
    CHECK(pos.realized_pnl == doctest::Approx(0.0));
    CHECK(pos.unrealized_pnl == doctest::Approx(0.0));
    CHECK(pos.leverage == 1);
    CHECK_FALSE(pos.is_open());
}

TEST_CASE("PositionV2 is_long/is_short") {
    PositionV2 pos;
    pos.side = Side::BUY;
    CHECK(pos.is_long());
    pos.side = Side::SELL;
    CHECK_FALSE(pos.is_long());
}

TEST_CASE("PositionV2 is_open threshold") {
    PositionV2 pos;
    pos.quantity = 0.0;
    CHECK_FALSE(pos.is_open());
    pos.quantity = 1e-11; // Below threshold
    CHECK_FALSE(pos.is_open());
    pos.quantity = 0.001;
    CHECK(pos.is_open());
}

TEST_CASE("PositionV2 notional") {
    PositionV2 pos;
    pos.quantity    = 2.0;
    pos.entry_price = 50000.0;
    CHECK(pos.notional() == doctest::Approx(100000.0));
}

TEST_CASE("PositionV2 update_unrealized long") {
    PositionV2 pos;
    pos.side        = Side::BUY;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_unrealized(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
    pos.update_unrealized(49000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(-1000.0));
}

TEST_CASE("PositionV2 update_unrealized short") {
    PositionV2 pos;
    pos.side        = Side::SELL;
    pos.quantity    = 1.0;
    pos.entry_price = 50000.0;
    pos.update_unrealized(49000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(1000.0));
    pos.update_unrealized(51000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(-1000.0));
}

TEST_CASE("PositionV2 update_unrealized closed position") {
    PositionV2 pos;
    pos.quantity = 0.0;
    pos.update_unrealized(50000.0);
    CHECK(pos.unrealized_pnl == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PositionManagerV2 — Open positions
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 open long position") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0, 10.0, 10);

    auto pos = pm.get_position("BTC/USDT", "binance");
    CHECK(pos.is_open());
    CHECK(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
    CHECK(pos.entry_price == doctest::Approx(50000.0));
    CHECK(pos.leverage == 10);
    CHECK(pos.margin == doctest::Approx(5000.0)); // 50000/10
    CHECK(pos.total_fees == doctest::Approx(10.0));
}

TEST_CASE("PositionManagerV2 open short position") {
    PositionManagerV2 pm;
    fill(pm, "ETH/USDT", "okx", Side::SELL, 2.0, 3000.0, 5.0, 5);

    auto pos = pm.get_position("ETH/USDT", "okx");
    CHECK(pos.is_open());
    CHECK_FALSE(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(2.0));
    CHECK(pos.entry_price == doctest::Approx(3000.0));
    CHECK(pos.leverage == 5);
    CHECK(pos.margin == doctest::Approx(1200.0)); // 6000/5
}

// ═══════════════════════════════════════════════════════════════════════════
// Add to existing position (weighted average)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 add to long position weighted average") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 52000.0);

    auto pos = pm.get_position("BTC/USDT", "binance");
    CHECK(pos.quantity == doctest::Approx(2.0));
    // Weighted avg: (50000*1 + 52000*1) / 2 = 51000
    CHECK(pos.entry_price == doctest::Approx(51000.0));
    // Margin: 50000 + 52000 = 102000 (leverage=1)
    CHECK(pos.margin == doctest::Approx(102000.0));
}

TEST_CASE("PositionManagerV2 add to short position") {
    PositionManagerV2 pm;
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3000.0);
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3100.0);

    auto pos = pm.get_position("ETH/USDT", "okx");
    CHECK(pos.quantity == doctest::Approx(2.0));
    CHECK(pos.entry_price == doctest::Approx(3050.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Close / reduce position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 close long position fully") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "BTC/USDT", "binance", Side::SELL, 1.0, 51000.0);

    auto pos = pm.get_position("BTC/USDT", "binance");
    CHECK_FALSE(pos.is_open());
    CHECK(pos.realized_pnl == doctest::Approx(1000.0)); // (51000-50000)*1
    CHECK(pos.margin == doctest::Approx(0.0));
}

TEST_CASE("PositionManagerV2 close short position fully") {
    PositionManagerV2 pm;
    fill(pm, "ETH/USDT", "okx", Side::SELL, 2.0, 3000.0);
    fill(pm, "ETH/USDT", "okx", Side::BUY, 2.0, 2900.0);

    auto pos = pm.get_position("ETH/USDT", "okx");
    CHECK_FALSE(pos.is_open());
    // Realized: (3000-2900)*2 = 200
    CHECK(pos.realized_pnl == doctest::Approx(200.0));
}

TEST_CASE("PositionManagerV2 partial close reduces qty") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 2.0, 50000.0);
    fill(pm, "BTC/USDT", "binance", Side::SELL, 0.5, 51000.0);

    auto pos = pm.get_position("BTC/USDT", "binance");
    CHECK(pos.is_open());
    CHECK(pos.quantity == doctest::Approx(1.5));
    // Realized: (51000-50000)*0.5 = 500
    CHECK(pos.realized_pnl == doctest::Approx(500.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Position reversal (close + open opposite)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 reversal long to short") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    // Sell 2.0 — closes 1.0 long, opens 1.0 short
    fill(pm, "BTC/USDT", "binance", Side::SELL, 2.0, 49000.0);

    auto pos = pm.get_position("BTC/USDT", "binance");
    CHECK(pos.is_open());
    CHECK_FALSE(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
    CHECK(pos.entry_price == doctest::Approx(49000.0));
    // Realized: (49000-50000)*1 = -1000
    CHECK(pos.realized_pnl == doctest::Approx(-1000.0));
}

TEST_CASE("PositionManagerV2 reversal short to long") {
    PositionManagerV2 pm;
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3000.0);
    // Buy 2.0 — closes 1.0 short, opens 1.0 long
    fill(pm, "ETH/USDT", "okx", Side::BUY, 2.0, 3100.0);

    auto pos = pm.get_position("ETH/USDT", "okx");
    CHECK(pos.is_open());
    CHECK(pos.is_long());
    CHECK(pos.quantity == doctest::Approx(1.0));
    CHECK(pos.entry_price == doctest::Approx(3100.0));
    // Realized: (3000-3100)*1 = -100
    CHECK(pos.realized_pnl == doctest::Approx(-100.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PnL aggregation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 total unrealized PnL") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "ETH/USDT", "okx", Side::BUY, 1.0, 3000.0);

    std::unordered_map<std::string, double> prices = {
        {"BTC/USDT", 51000.0},
        {"ETH/USDT", 3100.0},
    };
    pm.update_mark_prices(prices);

    // BTC: +1000, ETH: +100
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(1100.0));
}

TEST_CASE("PositionManagerV2 total realized PnL") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "BTC/USDT", "binance", Side::SELL, 1.0, 51000.0);

    CHECK(pm.total_realized_pnl() == doctest::Approx(1000.0));
}

TEST_CASE("PositionManagerV2 total fees") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0, 10.0);
    fill(pm, "BTC/USDT", "binance", Side::SELL, 1.0, 51000.0, 8.0);

    CHECK(pm.total_fees() == doctest::Approx(18.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Position queries
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 has_position") {
    PositionManagerV2 pm;
    CHECK_FALSE(pm.has_position("BTC/USDT"));
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    CHECK(pm.has_position("BTC/USDT"));
}

TEST_CASE("PositionManagerV2 open_position_count") {
    PositionManagerV2 pm;
    CHECK(pm.open_position_count() == 0);
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3000.0);
    CHECK(pm.open_position_count() == 2);
}

TEST_CASE("PositionManagerV2 get_all_positions") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3000.0);
    auto all = pm.get_all_positions();
    CHECK(all.size() == 2);
}

TEST_CASE("PositionManagerV2 get_position not found returns empty") {
    PositionManagerV2 pm;
    auto              pos = pm.get_position("DOGE/USDT", "binance");
    CHECK_FALSE(pos.is_open());
}

// ═══════════════════════════════════════════════════════════════════════════
// SL/TP checking
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 SL trigger for long") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);

    // SL distance = 50000 * 0.01 * 2.0 = 1000 → SL at 49000
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 48500.0}};
    auto                                    triggers = pm.check_sl_tp(prices, 2.0, 3.0);
    CHECK(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("PositionManagerV2 TP trigger for long") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);

    // TP distance = 50000 * 0.01 * 3.0 = 1500 → TP at 51500
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 52000.0}};
    auto                                    triggers = pm.check_sl_tp(prices, 2.0, 3.0);
    CHECK(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("PositionManagerV2 SL trigger for short") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::SELL, 1.0, 50000.0);

    // SL for short: price goes up by 1000 → 51000
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 51500.0}};
    auto                                    triggers = pm.check_sl_tp(prices, 2.0, 3.0);
    CHECK(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("PositionManagerV2 no trigger when price in range") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);

    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 50500.0}};
    auto                                    triggers = pm.check_sl_tp(prices, 2.0, 3.0);
    CHECK(triggers.empty());
}

// ═══════════════════════════════════════════════════════════════════════════
// Margin call and reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 margin call when equity low") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0, 0.0, 10);
    // Margin = 5000, equity = 5050 → ratio = (5050-5000)/5000 = 0.01 < 0.005? No
    // Need equity very close to margin
    CHECK_FALSE(pm.check_margin_call(5050.0));
    // equity = 5001 → ratio = 1/5000 = 0.0002 < 0.005 → margin call
    CHECK(pm.check_margin_call(5001.0));
}

TEST_CASE("PositionManagerV2 no margin call with no positions") {
    PositionManagerV2 pm;
    CHECK_FALSE(pm.check_margin_call(0.0));
}

TEST_CASE("PositionManagerV2 reset clears all") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "ETH/USDT", "okx", Side::SELL, 1.0, 3000.0);
    CHECK(pm.open_position_count() == 2);

    pm.reset();
    CHECK(pm.open_position_count() == 0);
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Multiple exchanges — same symbol
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PositionManagerV2 same symbol different exchanges") {
    PositionManagerV2 pm;
    fill(pm, "BTC/USDT", "binance", Side::BUY, 1.0, 50000.0);
    fill(pm, "BTC/USDT", "okx", Side::SELL, 1.0, 50100.0);

    auto binance_pos = pm.get_position("BTC/USDT", "binance");
    auto okx_pos     = pm.get_position("BTC/USDT", "okx");

    CHECK(binance_pos.is_long());
    CHECK_FALSE(okx_pos.is_long());
    CHECK(binance_pos.entry_price == doctest::Approx(50000.0));
    CHECK(okx_pos.entry_price == doctest::Approx(50100.0));
    CHECK(pm.open_position_count() == 2);
}
