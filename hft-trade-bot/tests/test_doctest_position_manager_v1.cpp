// Unit tests for PositionManager (V1) using doctest
// Tests: open, close, update_pnl, has_position, check_sl_tp, total_pnl, NEUTRAL guard
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/position/position_manager.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
static Signal make_long_signal(std::string symbol = "BTC/USDT", double entry = 50000,
                               double sl = 49000, double tp = 52000) {
    Signal s;
    s.symbol      = symbol;
    s.direction   = "LONG";
    s.confidence  = 0.85;
    s.strategy    = "momentum";
    s.entry_price = entry;
    s.stop_loss   = sl;
    s.take_profit = tp;
    s.timestamp   = 1000;
    return s;
}

static Signal make_short_signal(std::string symbol = "BTC/USDT", double entry = 50000,
                                double sl = 51000, double tp = 48000) {
    Signal s;
    s.symbol      = symbol;
    s.direction   = "SHORT";
    s.confidence  = 0.80;
    s.strategy    = "mean_reversion";
    s.entry_price = entry;
    s.stop_loss   = sl;
    s.take_profit = tp;
    s.timestamp   = 1000;
    return s;
}

static Signal make_neutral_signal(std::string symbol = "BTC/USDT") {
    Signal s;
    s.symbol      = symbol;
    s.direction   = "NEUTRAL";
    s.entry_price = 50000;
    s.stop_loss   = 49000;
    s.take_profit = 52000;
    s.timestamp   = 1000;
    return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// Open position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Open long position creates correct position") {
    PositionManager pm;
    auto            sig = make_long_signal();
    pm.open_position(sig, 1.0, "binance");
    CHECK(pm.position_count() == 1);
    auto positions = pm.get_positions();
    CHECK(positions[0].symbol == "BTC/USDT");
    CHECK(positions[0].side == Side::BUY);
    CHECK(positions[0].quantity == doctest::Approx(1.0));
    CHECK(positions[0].entry_price == doctest::Approx(50000.0));
    CHECK(positions[0].exchange == "binance");
}

TEST_CASE("Open short position creates SELL side") {
    PositionManager pm;
    auto            sig = make_short_signal();
    pm.open_position(sig, 2.0, "okx");
    CHECK(pm.position_count() == 1);
    auto positions = pm.get_positions();
    CHECK(positions[0].side == Side::SELL);
    CHECK(positions[0].quantity == doctest::Approx(2.0));
}

TEST_CASE("Open position with NEUTRAL signal is rejected") {
    PositionManager pm;
    auto            sig = make_neutral_signal();
    pm.open_position(sig, 1.0, "binance");
    CHECK(pm.position_count() == 0);
}

TEST_CASE("Multiple positions can be opened") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT"), 1.0, "binance");
    pm.open_position(make_short_signal("ETH/USDT"), 2.0, "okx");
    CHECK(pm.position_count() == 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Close position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Close position returns position with pnl") {
    PositionManager pm;
    pm.open_position(make_long_signal(), 1.0, "binance");
    auto result = pm.close_position("BTC/USDT", 51000.0);
    REQUIRE(result.has_value());
    CHECK(result->symbol == "BTC/USDT");
    CHECK(result->unrealized_pnl == doctest::Approx(1000.0));
    CHECK(pm.position_count() == 0);
}

TEST_CASE("Close non-existent position returns nullopt") {
    PositionManager pm;
    auto            result = pm.close_position("DOGE/USDT", 0.10);
    CHECK_FALSE(result.has_value());
}

TEST_CASE("Close short position calculates correct pnl") {
    PositionManager pm;
    pm.open_position(make_short_signal(), 1.0, "binance");
    auto result = pm.close_position("BTC/USDT", 48000.0);
    REQUIRE(result.has_value());
    CHECK(result->unrealized_pnl == doctest::Approx(2000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// has_position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("has_position returns true for open position") {
    PositionManager pm;
    pm.open_position(make_long_signal(), 1.0, "binance");
    CHECK(pm.has_position("BTC/USDT") == true);
}

TEST_CASE("has_position returns false for non-open symbol") {
    PositionManager pm;
    CHECK(pm.has_position("BTC/USDT") == false);
}

TEST_CASE("has_position returns false after close") {
    PositionManager pm;
    pm.open_position(make_long_signal(), 1.0, "binance");
    pm.close_position("BTC/USDT", 51000.0);
    CHECK(pm.has_position("BTC/USDT") == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// update_all_pnl
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("update_all_pnl updates unrealized pnl") {
    PositionManager pm;
    pm.open_position(make_long_signal(), 1.0, "binance");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 51000.0}};
    pm.update_all_pnl(prices);
    auto positions = pm.get_positions();
    CHECK(positions[0].unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("update_all_pnl ignores missing symbols") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT"), 1.0, "binance");
    pm.open_position(make_short_signal("ETH/USDT"), 2.0, "okx");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 51000.0}};
    pm.update_all_pnl(prices);
    auto positions = pm.get_positions();
    CHECK(positions[0].unrealized_pnl == doctest::Approx(1000.0));
    CHECK(positions[1].unrealized_pnl == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// total_unrealized_pnl
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("total_unrealized_pnl sums all positions") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT"), 1.0, "binance");
    pm.open_position(make_short_signal("ETH/USDT", 3000, 3100, 2900), 2.0, "okx");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 51000.0}, {"ETH/USDT", 2900.0}};
    pm.update_all_pnl(prices);
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(1200.0));
}

TEST_CASE("total_unrealized_pnl zero with no positions") {
    PositionManager pm;
    CHECK(pm.total_unrealized_pnl() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// check_sl_tp
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("check_sl_tp detects stop loss for long") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 48500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].symbol == "BTC/USDT");
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("check_sl_tp detects take profit for long") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 52500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("check_sl_tp detects stop loss for short") {
    PositionManager pm;
    pm.open_position(make_short_signal("BTC/USDT", 50000, 51000, 48000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 51500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("check_sl_tp detects take profit for short") {
    PositionManager pm;
    pm.open_position(make_short_signal("BTC/USDT", 50000, 51000, 48000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 47500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("check_sl_tp no triggers when price in range") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 50500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.empty());
}

TEST_CASE("check_sl_tp skips missing price data") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT"), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"ETH/USDT", 3000.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.empty());
}

TEST_CASE("check_sl_tp multiple positions multiple triggers") {
    PositionManager pm;
    pm.open_position(make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    pm.open_position(make_short_signal("ETH/USDT", 3000, 3100, 2900), 2.0, "okx");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 48500.0}, {"ETH/USDT", 2850.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.size() == 2);
}
