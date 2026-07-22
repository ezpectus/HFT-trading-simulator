// Unit tests for OrderBookManager using doctest
// Tests: bid/ask updates, removal, snapshot, spread, OBI, microprice, crossed/locked, clear, edge
// cases
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/market_data/order_book_manager.h"

using namespace hft;

using OB = OrderBookManager<32>; // Small capacity for testing

// ═══════════════════════════════════════════════════════════════════════════
// Empty book
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: empty book returns zeros") {
    OB ob;
    CHECK(ob.best_bid() == doctest::Approx(0.0));
    CHECK(ob.best_ask() == doctest::Approx(0.0));
    CHECK(ob.mid_price() == doctest::Approx(0.0));
    CHECK(ob.spread() == doctest::Approx(0.0));
    CHECK(ob.spread_bps() == doctest::Approx(0.0));
    CHECK(ob.bid_level_count() == 0);
    CHECK(ob.ask_level_count() == 0);
    CHECK(ob.is_crossed() == false);
    CHECK(ob.is_locked() == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bid updates
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: add single bid") {
    OB ob;
    CHECK(ob.update_bid(100.0, 1.5));
    CHECK(ob.bid_level_count() == 1);
    CHECK(ob.best_bid() == doctest::Approx(100.0));
    CHECK(ob.best_bid_qty() == doctest::Approx(1.5));
}

TEST_CASE("OrderBookManager: bids sorted descending") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(105.0, 2.0);
    ob.update_bid(102.0, 3.0);
    CHECK(ob.bid_level_count() == 3);
    CHECK(ob.best_bid() == doctest::Approx(105.0));
    CHECK(ob.bid_level(0).price == doctest::Approx(105.0));
    CHECK(ob.bid_level(1).price == doctest::Approx(102.0));
    CHECK(ob.bid_level(2).price == doctest::Approx(100.0));
}

TEST_CASE("OrderBookManager: update existing bid level") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(100.0, 2.5, 3);
    CHECK(ob.bid_level_count() == 1);
    CHECK(ob.best_bid_qty() == doctest::Approx(2.5));
    CHECK(ob.bid_level(0).order_count == 3);
}

TEST_CASE("OrderBookManager: reject invalid bid price") {
    OB ob;
    CHECK_FALSE(ob.update_bid(0.0, 1.0));
    CHECK_FALSE(ob.update_bid(-1.0, 1.0));
    CHECK(ob.bid_level_count() == 0);
}

TEST_CASE("OrderBookManager: zero quantity bid removes level") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(100.0, 0.0); // triggers removal
    CHECK(ob.bid_level_count() == 0);
    CHECK(ob.best_bid() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Ask updates
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: add single ask") {
    OB ob;
    CHECK(ob.update_ask(101.0, 2.0));
    CHECK(ob.ask_level_count() == 1);
    CHECK(ob.best_ask() == doctest::Approx(101.0));
    CHECK(ob.best_ask_qty() == doctest::Approx(2.0));
}

TEST_CASE("OrderBookManager: asks sorted ascending") {
    OB ob;
    ob.update_ask(105.0, 1.0);
    ob.update_ask(101.0, 2.0);
    ob.update_ask(103.0, 3.0);
    CHECK(ob.ask_level_count() == 3);
    CHECK(ob.best_ask() == doctest::Approx(101.0));
    CHECK(ob.ask_level(0).price == doctest::Approx(101.0));
    CHECK(ob.ask_level(1).price == doctest::Approx(103.0));
    CHECK(ob.ask_level(2).price == doctest::Approx(105.0));
}

TEST_CASE("OrderBookManager: update existing ask level") {
    OB ob;
    ob.update_ask(101.0, 1.0);
    ob.update_ask(101.0, 3.0, 5);
    CHECK(ob.ask_level_count() == 1);
    CHECK(ob.best_ask_qty() == doctest::Approx(3.0));
    CHECK(ob.ask_level(0).order_count == 5);
}

TEST_CASE("OrderBookManager: reject invalid ask price") {
    OB ob;
    CHECK_FALSE(ob.update_ask(0.0, 1.0));
    CHECK_FALSE(ob.update_ask(-5.0, 1.0));
    CHECK(ob.ask_level_count() == 0);
}

TEST_CASE("OrderBookManager: zero quantity ask removes level") {
    OB ob;
    ob.update_ask(101.0, 1.0);
    ob.update_ask(101.0, 0.0);
    CHECK(ob.ask_level_count() == 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Removal
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: remove bid by price") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(105.0, 2.0);
    ob.update_bid(102.0, 3.0);
    CHECK(ob.remove_bid(102.0));
    CHECK(ob.bid_level_count() == 2);
    CHECK(ob.bid_level(0).price == doctest::Approx(105.0));
    CHECK(ob.bid_level(1).price == doctest::Approx(100.0));
}

TEST_CASE("OrderBookManager: remove non-existent bid returns false") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    CHECK_FALSE(ob.remove_bid(999.0));
    CHECK(ob.bid_level_count() == 1);
}

TEST_CASE("OrderBookManager: remove ask by price") {
    OB ob;
    ob.update_ask(101.0, 1.0);
    ob.update_ask(103.0, 2.0);
    ob.update_ask(105.0, 3.0);
    CHECK(ob.remove_ask(101.0));
    CHECK(ob.ask_level_count() == 2);
    CHECK(ob.best_ask() == doctest::Approx(103.0));
}

TEST_CASE("OrderBookManager: remove non-existent ask returns false") {
    OB ob;
    ob.update_ask(101.0, 1.0);
    CHECK_FALSE(ob.remove_ask(999.0));
    CHECK(ob.ask_level_count() == 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// Mid price, spread, weighted mid, microprice
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: mid_price") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(102.0, 1.0);
    CHECK(ob.mid_price() == doctest::Approx(101.0));
}

TEST_CASE("OrderBookManager: mid_price with empty side returns zero") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    CHECK(ob.mid_price() == doctest::Approx(0.0));
}

TEST_CASE("OrderBookManager: spread") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(102.0, 1.0);
    CHECK(ob.spread() == doctest::Approx(2.0));
}

TEST_CASE("OrderBookManager: spread_bps") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(101.0, 1.0);
    // spread = 1, mid = 100.5, bps = (1 / 100.5) * 10000 = 99.50...
    CHECK(ob.spread_bps() == doctest::Approx(10000.0 / 100.5));
}

TEST_CASE("OrderBookManager: weighted_mid equal quantities equals mid") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(102.0, 1.0);
    CHECK(ob.weighted_mid() == doctest::Approx(101.0));
}

TEST_CASE("OrderBookManager: weighted_mid skewed by quantity") {
    OB ob;
    ob.update_bid(100.0, 10.0);
    ob.update_ask(102.0, 1.0);
    // wmid = (100 * 1 + 102 * 10) / 11 = (100 + 1020) / 11 = 102.727...
    CHECK(ob.weighted_mid() == doctest::Approx(1120.0 / 11.0));
}

TEST_CASE("OrderBookManager: microprice equals weighted_mid") {
    OB ob;
    ob.update_bid(100.0, 5.0);
    ob.update_ask(104.0, 3.0);
    CHECK(ob.microprice() == doctest::Approx(ob.weighted_mid()));
}

// ═══════════════════════════════════════════════════════════════════════════
// Spread regime
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: spread_regime TIGHT") {
    OB ob;
    // spread = 0.01, mid = 10000.005, bps ≈ 0.01 → < 1 bp
    ob.update_bid(10000.0, 1.0);
    ob.update_ask(10000.01, 1.0);
    CHECK(ob.spread_regime() == SpreadRegime::TIGHT);
}

TEST_CASE("OrderBookManager: spread_regime NORMAL") {
    OB ob;
    // spread = 1, mid = 1000.5, bps ≈ 9.995 → 1-5 bp? No, that's > 5.
    // Let's use: spread = 2, mid = 10000, bps = 2 → NORMAL
    ob.update_bid(9999.0, 1.0);
    ob.update_ask(10001.0, 1.0);
    // bps = (2 / 10000) * 10000 = 2 → NORMAL
    CHECK(ob.spread_regime() == SpreadRegime::NORMAL);
}

TEST_CASE("OrderBookManager: spread_regime WIDE") {
    OB ob;
    // bps = 10 → WIDE (5-20)
    ob.update_bid(100.0, 1.0);
    ob.update_ask(100.1, 1.0);
    // spread = 0.1, mid = 100.05, bps = (0.1 / 100.05) * 10000 ≈ 9.995 → WIDE
    CHECK(ob.spread_regime() == SpreadRegime::WIDE);
}

TEST_CASE("OrderBookManager: spread_regime EXTREME") {
    OB ob;
    // bps > 20
    ob.update_bid(100.0, 1.0);
    ob.update_ask(101.0, 1.0);
    // spread = 1, mid = 100.5, bps = (1 / 100.5) * 10000 ≈ 99.5 → EXTREME
    CHECK(ob.spread_regime() == SpreadRegime::EXTREME);
}

// ═══════════════════════════════════════════════════════════════════════════
// Depth and OBI
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: bid_depth sums top N levels") {
    OB ob;
    ob.update_bid(105.0, 1.0);
    ob.update_bid(104.0, 2.0);
    ob.update_bid(103.0, 3.0);
    CHECK(ob.bid_depth(2) == doctest::Approx(3.0));
    CHECK(ob.bid_depth(3) == doctest::Approx(6.0));
    CHECK(ob.bid_depth(10) == doctest::Approx(6.0)); // only 3 levels
}

TEST_CASE("OrderBookManager: ask_depth sums top N levels") {
    OB ob;
    ob.update_ask(101.0, 1.0);
    ob.update_ask(102.0, 2.0);
    ob.update_ask(103.0, 3.0);
    CHECK(ob.ask_depth(1) == doctest::Approx(1.0));
    CHECK(ob.ask_depth(3) == doctest::Approx(6.0));
}

TEST_CASE("OrderBookManager: obi balanced book") {
    OB ob;
    ob.update_bid(100.0, 5.0);
    ob.update_ask(102.0, 5.0);
    CHECK(ob.obi(1) == doctest::Approx(0.0));
}

TEST_CASE("OrderBookManager: obi bid heavy") {
    OB ob;
    ob.update_bid(100.0, 10.0);
    ob.update_ask(102.0, 2.0);
    // (10 - 2) / (10 + 2) = 8/12 = 0.6667
    CHECK(ob.obi(1) == doctest::Approx(8.0 / 12.0));
}

TEST_CASE("OrderBookManager: obi ask heavy") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(102.0, 9.0);
    // (1 - 9) / (1 + 9) = -8/10 = -0.8
    CHECK(ob.obi(1) == doctest::Approx(-0.8));
}

TEST_CASE("OrderBookManager: obi empty book returns zero") {
    OB ob;
    CHECK(ob.obi(5) == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Crossed and locked
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: is_crossed true when bid >= ask") {
    OB ob;
    ob.update_bid(105.0, 1.0);
    ob.update_ask(100.0, 1.0);
    CHECK(ob.is_crossed() == true);
}

TEST_CASE("OrderBookManager: is_crossed false when bid < ask") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(105.0, 1.0);
    CHECK(ob.is_crossed() == false);
}

TEST_CASE("OrderBookManager: is_locked true when bid == ask") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(100.0, 1.0);
    CHECK(ob.is_locked() == true);
    CHECK(ob.is_crossed() == true); // locked is a subset of crossed
}

TEST_CASE("OrderBookManager: not crossed with empty side") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    CHECK(ob.is_crossed() == false);
    CHECK(ob.is_locked() == false);
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: set_snapshot replaces book") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(102.0, 1.0);

    std::array<PriceLevel, 3> bids = {
        PriceLevel{110.0, 2.0, 1, {}},
        PriceLevel{108.0, 3.0, 1, {}},
        PriceLevel{106.0, 1.0, 1, {}},
    };
    std::array<PriceLevel, 2> asks = {
        PriceLevel{112.0, 4.0, 1, {}},
        PriceLevel{114.0, 2.0, 1, {}},
    };
    ob.set_snapshot(bids.data(), 3, asks.data(), 2);

    CHECK(ob.bid_level_count() == 3);
    CHECK(ob.ask_level_count() == 2);
    CHECK(ob.best_bid() == doctest::Approx(110.0));
    CHECK(ob.best_ask() == doctest::Approx(112.0));
}

TEST_CASE("OrderBookManager: set_snapshot truncates to max levels") {
    OB                         ob;
    std::array<PriceLevel, 40> bids{};
    std::array<PriceLevel, 40> asks{};
    for (size_t i = 0; i < 40; ++i) {
        bids[i].price    = 200.0 - i;
        bids[i].quantity = 1.0;
        asks[i].price    = 200.0 + i;
        asks[i].quantity = 1.0;
    }
    ob.set_snapshot(bids.data(), 40, asks.data(), 40);
    CHECK(ob.bid_level_count() == 32); // MAX_LEVELS = 32
    CHECK(ob.ask_level_count() == 32);
}

// ═══════════════════════════════════════════════════════════════════════════
// Clear
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: clear resets book") {
    OB ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(105.0, 2.0);
    ob.update_ask(102.0, 3.0);
    ob.update_ask(104.0, 4.0);
    ob.clear();
    CHECK(ob.bid_level_count() == 0);
    CHECK(ob.ask_level_count() == 0);
    CHECK(ob.best_bid() == doctest::Approx(0.0));
    CHECK(ob.best_ask() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Full book edge case
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: full book rejects new bid level") {
    OrderBookManager<4> ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(101.0, 1.0);
    ob.update_bid(102.0, 1.0);
    ob.update_bid(103.0, 1.0);
    CHECK(ob.bid_level_count() == 4);
    CHECK_FALSE(ob.update_bid(99.0, 1.0)); // new level, full → reject
    CHECK(ob.bid_level_count() == 4);
}

TEST_CASE("OrderBookManager: full book still allows update to existing level") {
    OrderBookManager<4> ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(101.0, 1.0);
    ob.update_bid(102.0, 1.0);
    ob.update_bid(103.0, 1.0);
    CHECK(ob.update_bid(100.0, 5.0)); // existing level → ok
    CHECK(ob.bid_level_count() == 4);
    CHECK(ob.bid_level(3).quantity == doctest::Approx(5.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// last_update_ns
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: last_update_ns updates on change") {
    OB ob;
    CHECK(ob.last_update_ns() == 0);
    ob.update_bid(100.0, 1.0);
    uint64_t t1 = ob.last_update_ns();
    CHECK(t1 > 0);
    ob.update_ask(102.0, 1.0);
    CHECK(ob.last_update_ns() >= t1);
}

// ═══════════════════════════════════════════════════════════════════════════
// spread_regime_str
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("OrderBookManager: spread_regime_str returns correct names") {
    CHECK(std::string(spread_regime_str(SpreadRegime::TIGHT)) == "TIGHT");
    CHECK(std::string(spread_regime_str(SpreadRegime::NORMAL)) == "NORMAL");
    CHECK(std::string(spread_regime_str(SpreadRegime::WIDE)) == "WIDE");
    CHECK(std::string(spread_regime_str(SpreadRegime::EXTREME)) == "EXTREME");
}
