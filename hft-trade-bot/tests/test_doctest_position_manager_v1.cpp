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

// Books a position the way prod does register the pending order,
// then apply its FILLED ack. open_position() was removed — it bypassed the
// fill path and its same-symbol overwrite branch silently dropped PnL.
static void open_via_fill(PositionManager& pm, const Signal& sig, double qty,
                          const std::string& exchange) {
    pm.add_pending_order(sig, qty, exchange);
    pm.apply_fill(sig.symbol, sig.direction == "LONG" ? "BUY" : "SELL", qty, sig.entry_price, 0.0,
                  "FILLED");
}

// ═══════════════════════════════════════════════════════════════════════════
// Open position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Open long position creates correct position") {
    PositionManager pm;
    auto            sig = make_long_signal();
    open_via_fill(pm, sig, 1.0, "binance");
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
    open_via_fill(pm, sig, 2.0, "okx");
    CHECK(pm.position_count() == 1);
    auto positions = pm.get_positions();
    CHECK(positions[0].side == Side::SELL);
    CHECK(positions[0].quantity == doctest::Approx(2.0));
}

TEST_CASE("Open position with NEUTRAL signal is rejected") {
    PositionManager pm;
    auto            sig = make_neutral_signal();
    open_via_fill(pm, sig, 1.0, "binance");
    CHECK(pm.position_count() == 0);
}

TEST_CASE("Multiple positions can be opened") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT"), 1.0, "binance");
    open_via_fill(pm, make_short_signal("ETH/USDT"), 2.0, "okx");
    CHECK(pm.position_count() == 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Close position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Close position returns position with pnl") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
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
    open_via_fill(pm, make_short_signal(), 1.0, "binance");
    auto result = pm.close_position("BTC/USDT", 48000.0);
    REQUIRE(result.has_value());
    CHECK(result->unrealized_pnl == doctest::Approx(2000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// has_position
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("has_position returns true for open position") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    CHECK(pm.has_position("BTC/USDT") == true);
}

TEST_CASE("has_position returns false for non-open symbol") {
    PositionManager pm;
    CHECK(pm.has_position("BTC/USDT") == false);
}

TEST_CASE("has_position returns false after close") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    pm.close_position("BTC/USDT", 51000.0);
    CHECK(pm.has_position("BTC/USDT") == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// update_all_pnl
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("update_all_pnl updates unrealized pnl") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 51000.0}};
    pm.update_all_pnl(prices);
    auto positions = pm.get_positions();
    CHECK(positions[0].unrealized_pnl == doctest::Approx(1000.0));
}

TEST_CASE("update_all_pnl ignores missing symbols") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT"), 1.0, "binance");
    open_via_fill(pm, make_short_signal("ETH/USDT"), 2.0, "okx");
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
    open_via_fill(pm, make_long_signal("BTC/USDT"), 1.0, "binance");
    open_via_fill(pm, make_short_signal("ETH/USDT", 3000, 3100, 2900), 2.0, "okx");
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
    open_via_fill(pm, make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 48500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].symbol == "BTC/USDT");
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("check_sl_tp detects take profit for long") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 52500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("check_sl_tp detects stop loss for short") {
    PositionManager pm;
    open_via_fill(pm, make_short_signal("BTC/USDT", 50000, 51000, 48000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 51500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "STOP_LOSS");
}

TEST_CASE("check_sl_tp detects take profit for short") {
    PositionManager pm;
    open_via_fill(pm, make_short_signal("BTC/USDT", 50000, 51000, 48000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 47500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    REQUIRE(triggers.size() == 1);
    CHECK(triggers[0].reason == "TAKE_PROFIT");
}

TEST_CASE("check_sl_tp no triggers when price in range") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"BTC/USDT", 50500.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.empty());
}

TEST_CASE("check_sl_tp skips missing price data") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT"), 1.0, "binance");
    std::unordered_map<std::string, double> prices   = {{"ETH/USDT", 3000.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.empty());
}

TEST_CASE("check_sl_tp multiple positions multiple triggers") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT", 50000, 49000, 52000), 1.0, "binance");
    open_via_fill(pm, make_short_signal("ETH/USDT", 3000, 3100, 2900), 2.0, "okx");
    std::unordered_map<std::string, double> prices = {{"BTC/USDT", 48500.0}, {"ETH/USDT", 2850.0}};
    auto                                    triggers = pm.check_sl_tp(prices);
    CHECK(triggers.size() == 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// — partial-close fee must be realized once, not netted twice
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("Partial close realizes fee once, not twice") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");

    // Reduce 0.4 @ 51000 with a 5.0 fee → slice realizes 400 - 5 = 395.
    auto res = pm.apply_fill("BTC/USDT", "SELL", 0.4, 51000.0, 5.0, "FILLED");
    CHECK(res.effect == PositionManager::FillEffect::REDUCED);
    CHECK(res.realized_pnl == doctest::Approx(395.0));

    // The close-fill fee belongs to the closed slice — the remainder must
    // not carry it, or update_pnl subtracts it again at the final close.
    auto positions = pm.get_positions();
    REQUIRE(positions.size() == 1);
    CHECK(positions[0].fees_paid == doctest::Approx(0.0));

    // Final close of the remaining 0.6 @ 51000 with a 6.0 fee:
    // realized += (1000 * 0.6) - 6 = 594 → total 989 = 1000 gross - 11 fees.
    auto res2 = pm.apply_fill("BTC/USDT", "SELL", 0.6, 51000.0, 6.0, "FILLED");
    CHECK(res2.effect == PositionManager::FillEffect::CLOSED);
    CHECK(pm.total_realized_pnl() == doctest::Approx(989.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// — ghosts: local positions absent from the account broadcast age out
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("reconcile_positions drops ghost after SYNC_MISS_LIMIT misses") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    const std::unordered_set<std::string> empty;

    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.has_position("BTC/USDT"));
    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.has_position("BTC/USDT"));

    auto removed = pm.reconcile_positions(empty, "binance");
    REQUIRE(removed.size() == 1);
    CHECK(removed[0] == "BTC/USDT");
    CHECK_FALSE(pm.has_position("BTC/USDT"));
    CHECK(pm.position_count() == 0);
}

TEST_CASE("reconcile_positions keeps symbols present in the broadcast") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    const std::unordered_set<std::string> seen = {"BTC/USDT"};
    for (int i = 0; i < 5; ++i) {
        CHECK(pm.reconcile_positions(seen, "binance").empty());
    }
    CHECK(pm.has_position("BTC/USDT"));
}

TEST_CASE("reconcile_positions resets the miss counter on reappearance") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal(), 1.0, "binance");
    const std::unordered_set<std::string> empty;
    const std::unordered_set<std::string> seen = {"BTC/USDT"};

    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.reconcile_positions(seen, "binance").empty()); // resets streak
    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.reconcile_positions(empty, "binance").empty());
    CHECK(pm.has_position("BTC/USDT"));
    auto removed = pm.reconcile_positions(empty, "binance");
    REQUIRE(removed.size() == 1);
}

TEST_CASE("reconcile_positions only touches the broadcast's exchange") {
    PositionManager pm;
    open_via_fill(pm, make_short_signal("ETH/USDT"), 2.0, "okx");
    const std::unordered_set<std::string> empty;
    for (int i = 0; i < 5; ++i) {
        CHECK(pm.reconcile_positions(empty, "binance").empty());
    }
    CHECK(pm.has_position("ETH/USDT"));
}

TEST_CASE("sync_position adopts broadcast-only positions and refreshes tracked") {
    PositionManager pm;
    pm.sync_position("BTC/USDT", true, 1.5, 50000.0, 49000.0, 52000.0, "binance");
    CHECK(pm.has_position("BTC/USDT"));
    pm.sync_position("BTC/USDT", true, 1.2, 50100.0, 49000.0, 52000.0, "binance");
    auto positions = pm.get_positions();
    REQUIRE(positions.size() == 1);
    CHECK(positions[0].quantity == doctest::Approx(1.2));
    CHECK(positions[0].entry_price == doctest::Approx(50100.0));
}

TEST_CASE("total_realized_pnl accumulates on close") {
    PositionManager pm;
    open_via_fill(pm, make_long_signal("BTC/USDT"), 1.0, "binance");
    CHECK(pm.total_realized_pnl() == doctest::Approx(0.0));
    auto result = pm.close_position("BTC/USDT", 51000.0);
    REQUIRE(result.has_value());
    CHECK(pm.total_realized_pnl() == doctest::Approx(result->unrealized_pnl));
    // second close accumulates
    open_via_fill(pm, make_long_signal("ETH/USDT", 3000), 1.0, "binance");
    auto r2 = pm.close_position("ETH/USDT", 3300.0);
    CHECK(pm.total_realized_pnl() == doctest::Approx(result->unrealized_pnl + r2->unrealized_pnl));
}
