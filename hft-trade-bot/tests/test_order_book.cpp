// Tests: Order book add/update/delete, best bid/ask, depth, mid-price, spread regime
#include "../market_data/order_book_manager.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <vector>

using namespace hft;

void test_empty_book() {
    OrderBookManager<100> ob;
    assert(ob.best_bid() == 0.0);
    assert(ob.best_ask() == 0.0);
    assert(ob.mid_price() == 0.0);
    assert(ob.spread() == 0.0);
    assert(ob.bid_level_count() == 0);
    assert(ob.ask_level_count() == 0);
    printf("  [PASS] test_empty_book\n");
}

void test_add_levels() {
    OrderBookManager<100> ob;

    assert(ob.update_bid(100.0, 1.5));
    assert(ob.update_bid(99.0, 2.0));
    assert(ob.update_bid(101.0, 0.5));

    // Bids sorted descending
    assert(ob.best_bid() == 101.0);
    assert(ob.bid_level_count() == 3);
    assert(ob.bid_level(0).price == 101.0);
    assert(ob.bid_level(1).price == 100.0);
    assert(ob.bid_level(2).price == 99.0);

    assert(ob.update_ask(102.0, 1.0));
    assert(ob.update_ask(103.0, 2.0));
    assert(ob.update_ask(101.5, 0.8));

    // Asks sorted ascending
    assert(ob.best_ask() == 101.5);
    assert(ob.ask_level_count() == 3);
    assert(ob.ask_level(0).price == 101.5);
    assert(ob.ask_level(1).price == 102.0);
    assert(ob.ask_level(2).price == 103.0);

    printf("  [PASS] test_add_levels\n");
}

void test_update_existing() {
    OrderBookManager<100> ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(100.0, 2.5);  // Update same level

    assert(ob.bid_level_count() == 1);
    assert(ob.best_bid() == 100.0);
    assert(ob.best_bid_qty() == 2.5);

    printf("  [PASS] test_update_existing\n");
}

void test_remove_levels() {
    OrderBookManager<100> ob;
    ob.update_bid(100.0, 1.0);
    ob.update_bid(99.0, 2.0);
    ob.update_bid(98.0, 3.0);

    assert(ob.remove_bid(99.0));
    assert(ob.bid_level_count() == 2);
    assert(ob.best_bid() == 100.0);
    assert(ob.bid_level(1).price == 98.0);

    // Remove non-existent
    assert(!ob.remove_bid(50.0));

    printf("  [PASS] test_remove_levels\n");
}

void test_depth_and_obi() {
    OrderBookManager<100> ob;

    for (int i = 0; i < 10; ++i) {
        ob.update_bid(100.0 - i, 1.0);
        ob.update_ask(101.0 + i, 1.0);
    }

    assert(ob.bid_depth(5) == 5.0);
    assert(ob.ask_depth(5) == 5.0);
    assert(std::abs(ob.obi(5) - 0.0) < 1e-10);  // Equal depth

    // Make bid side heavier
    ob.update_bid(100.0, 10.0);
    double obi = ob.obi(5);
    assert(obi > 0.0);  // More bid depth

    printf("  [PASS] test_depth_and_obi\n");
}

void test_mid_price_and_spread() {
    OrderBookManager<100> ob;
    ob.update_bid(100.0, 1.0);
    ob.update_ask(101.0, 1.0);

    assert(ob.mid_price() == 100.5);
    assert(ob.spread() == 1.0);
    assert(ob.spread_bps() > 0.0);

    // Weighted mid
    ob.update_bid(100.0, 2.0);
    ob.update_ask(101.0, 1.0);
    double wm = ob.weighted_mid();
    // (100 * 1 + 101 * 2) / (2 + 1) = 302/3 = 100.666...
    assert(std::abs(wm - 100.666666) < 0.01);

    printf("  [PASS] test_mid_price_and_spread\n");
}

void test_spread_regime() {
    OrderBookManager<100> ob;

    // Tight spread (< 1 bp)
    ob.update_bid(10000.0, 1.0);
    ob.update_ask(10000.5, 1.0);  // 0.5 spread on 10000 = 0.05 bp
    assert(ob.spread_regime() == SpreadRegime::TIGHT);

    // Normal spread
    ob.update_ask(10005.0, 1.0);  // 5 spread on 10000 = 5 bp
    assert(ob.spread_regime() == SpreadRegime::NORMAL);

    // Wide spread
    ob.update_ask(10300.0, 1.0);  // 300 spread on 10000 = 300 bp
    assert(ob.spread_regime() == SpreadRegime::EXTREME);

    printf("  [PASS] test_spread_regime\n");
}

void test_crossed_book() {
    OrderBookManager<100> ob;
    ob.update_bid(101.0, 1.0);
    ob.update_ask(100.0, 1.0);

    assert(ob.is_crossed());

    ob.clear();
    assert(!ob.is_crossed());

    printf("  [PASS] test_crossed_book\n");
}

void test_snapshot_merge() {
    OrderBookManager<100> ob;

    std::vector<PriceLevel> bids = {{100.0, 1.0}, {99.0, 2.0}, {98.0, 3.0}};
    std::vector<PriceLevel> asks = {{101.0, 1.0}, {102.0, 2.0}, {103.0, 3.0}};

    ob.set_snapshot(bids.data(), bids.size(), asks.data(), asks.size());

    assert(ob.bid_level_count() == 3);
    assert(ob.ask_level_count() == 3);
    assert(ob.best_bid() == 100.0);
    assert(ob.best_ask() == 101.0);

    printf("  [PASS] test_snapshot_merge\n");
}

int main() {
    printf("=== Order Book Manager Tests ===\n");
    test_empty_book();
    test_add_levels();
    test_update_existing();
    test_remove_levels();
    test_depth_and_obi();
    test_mid_price_and_spread();
    test_spread_regime();
    test_crossed_book();
    test_snapshot_merge();
    printf("=== All tests passed! ===\n");
    return 0;
}
