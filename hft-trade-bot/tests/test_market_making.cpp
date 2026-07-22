// Tests: Avellaneda-Stoikov quotes, inventory skew, adverse selection
#include "../src/strategies/market_making_v2.h"
#include <cassert>
#include <cmath>
#include <cstdio>

using namespace hft;

void test_basic_quotes() {
    MarketMakingV2 mm;
    mm.reset();

    // Zero inventory, zero toxicity
    auto q = mm.generate_quotes(100.0, 0.0, 0.0, 0);

    // Bid < mid < ask
    assert(q.bid_price > 0.0);
    assert(q.ask_price > 0.0);
    assert(q.bid_price < 100.0);
    assert(q.ask_price > 100.0);
    assert(q.bid_price < q.ask_price);
    assert(!q.should_cancel);

    printf("  [PASS] test_basic_quotes (bid=%.4f ask=%.4f spread=%.6f)\n", q.bid_price, q.ask_price,
           q.spread);
}

void test_inventory_skew() {
    MarketMakingV2 mm;
    mm.reset();

    // Long inventory → bid should be lower (reservation price shifts down)
    auto q_long = mm.generate_quotes(100.0, 5.0, 0.0, 0);
    mm.reset();
    auto q_flat = mm.generate_quotes(100.0, 0.0, 0.0, 0);
    mm.reset();
    auto q_short = mm.generate_quotes(100.0, -5.0, 0.0, 0);

    // Reservation price should shift: long < flat < short
    assert(q_long.reservation_price < q_flat.reservation_price);
    assert(q_short.reservation_price > q_flat.reservation_price);

    printf("  [PASS] test_inventory_skew (res_long=%.4f res_flat=%.4f res_short=%.4f)\n",
           q_long.reservation_price, q_flat.reservation_price, q_short.reservation_price);
}

void test_adverse_selection() {
    MarketMakingV2 mm;
    mm.reset();

    // High toxicity → should cancel
    auto q = mm.generate_quotes(100.0, 0.0, 0.8, 0);
    assert(q.should_cancel);
    assert(q.confidence == 0.0);

    printf("  [PASS] test_adverse_selection\n");
}

void test_low_toxicity() {
    MarketMakingV2 mm;
    mm.reset();

    auto q = mm.generate_quotes(100.0, 0.0, 0.3, 0);
    assert(!q.should_cancel);
    assert(q.confidence > 0.0);

    printf("  [PASS] test_low_toxicity (confidence=%.1f)\n", q.confidence);
}

void test_max_inventory() {
    MarketMakingV2::Config cfg;
    cfg.max_inventory = 5.0;
    MarketMakingV2 mm(cfg);
    mm.reset();

    // At max long inventory → no bid
    auto q = mm.generate_quotes(100.0, 5.0, 0.0, 0);
    assert(q.bid_price == 0.0);
    assert(q.bid_size == 0.0);
    assert(q.ask_price > 0.0);

    // At max short inventory → no ask
    mm.reset();
    q = mm.generate_quotes(100.0, -5.0, 0.0, 0);
    assert(q.ask_price == 0.0);
    assert(q.ask_size == 0.0);
    assert(q.bid_price > 0.0);

    printf("  [PASS] test_max_inventory\n");
}

void test_size_skew() {
    MarketMakingV2 mm;
    mm.reset();

    // Long inventory → bid size < ask size
    auto q = mm.generate_quotes(100.0, 3.0, 0.0, 0);
    assert(q.bid_size < q.ask_size);

    // Short inventory → ask size < bid size
    mm.reset();
    q = mm.generate_quotes(100.0, -3.0, 0.0, 0);
    assert(q.ask_size < q.bid_size);

    printf("  [PASS] test_size_skew\n");
}

void test_spread_clamping() {
    MarketMakingV2::Config cfg;
    cfg.spread_cap   = 0.001; // Very tight cap
    cfg.spread_floor = 0.0001;
    MarketMakingV2 mm(cfg);
    mm.reset();

    auto q = mm.generate_quotes(100.0, 0.0, 0.0, 0);
    assert(q.spread <= cfg.spread_cap + 1e-10);
    assert(q.spread >= cfg.spread_floor - 1e-10);

    printf("  [PASS] test_spread_clamping (spread=%.6f cap=%.6f)\n", q.spread, cfg.spread_cap);
}

int main() {
    printf("=== Market Making V2 Tests ===\n");
    test_basic_quotes();
    test_inventory_skew();
    test_adverse_selection();
    test_low_toxicity();
    test_max_inventory();
    test_size_skew();
    test_spread_clamping();
    printf("=== All tests passed! ===\n");
    return 0;
}
