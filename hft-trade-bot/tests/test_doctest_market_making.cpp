// Unit tests for MarketMakingV2 — Avellaneda-Stoikov model regression tests
// Tests: reservation price tracking, inventory skew, toxicity, spread clamping, reset
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/market_making_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Config and initialization
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 default config") {
    MarketMakingV2::Config cfg;
    CHECK(cfg.gamma == doctest::Approx(0.1));
    CHECK(cfg.T_seconds == doctest::Approx(60.0));
    CHECK(cfg.sigma == doctest::Approx(0.01));
    CHECK(cfg.spread_cap == doctest::Approx(0.005));
    CHECK(cfg.spread_floor == doctest::Approx(0.0001));
    CHECK(cfg.max_inventory == doctest::Approx(10.0));
    CHECK(cfg.toxicity_threshold == doctest::Approx(0.7));
}

TEST_CASE("MarketMakingV2 generates valid quotes") {
    MarketMakingV2 mm;
    // Feed some prices to build volatility
    for (int i = 0; i < 10; ++i) {
        auto q = mm.generate_quotes(50000.0 + i * 10, 0.0, 0.0, i * 1000000000ULL);
        CHECK(q.bid_price > 0.0);
        CHECK(q.ask_price > 0.0);
        CHECK(q.ask_price > q.bid_price);
        CHECK(q.spread > 0.0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Reservation price tracking (regression for last_reservation_ bug)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 reservation_price tracks last quote") {
    MarketMakingV2 mm;
    // Initial reservation should be 0
    CHECK(mm.reservation_price() == doctest::Approx(0.0));

    // Generate quotes to update reservation
    auto q = mm.generate_quotes(50000.0, 0.0, 0.0, 0);
    CHECK(mm.reservation_price() == doctest::Approx(q.reservation_price));
}

TEST_CASE("MarketMakingV2 reservation_price updates with new prices") {
    MarketMakingV2 mm;
    mm.generate_quotes(50000.0, 0.0, 0.0, 0);
    double r1 = mm.reservation_price();

    mm.generate_quotes(51000.0, 0.0, 0.0, 1000000000ULL);
    double r2 = mm.reservation_price();

    // Reservation should have changed with different mid price
    CHECK(r2 != doctest::Approx(r1));
}

TEST_CASE("MarketMakingV2 reservation_price non-zero after quotes") {
    MarketMakingV2 mm;
    for (int i = 0; i < 5; ++i) {
        mm.generate_quotes(50000.0 + i * 100, 0.0, 0.0, i * 1000000000ULL);
    }
    CHECK(mm.reservation_price() > 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Inventory skew
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 long inventory skews bid down") {
    MarketMakingV2 mm;
    // Build volatility
    for (int i = 0; i < 5; ++i) {
        mm.generate_quotes(50000.0, 0.0, 0.0, i * 1000000000ULL);
    }

    auto q_flat = mm.generate_quotes(50000.0, 0.0, 0.0, 5000000000ULL);
    auto q_long = mm.generate_quotes(50000.0, 5.0, 0.0, 6000000000ULL);

    // Long inventory should skew bid lower (to avoid adding more long)
    CHECK(q_long.bid_price < q_flat.bid_price);
}

TEST_CASE("MarketMakingV2 short inventory skews ask up") {
    MarketMakingV2 mm;
    for (int i = 0; i < 5; ++i) {
        mm.generate_quotes(50000.0, 0.0, 0.0, i * 1000000000ULL);
    }

    auto q_flat  = mm.generate_quotes(50000.0, 0.0, 0.0, 5000000000ULL);
    auto q_short = mm.generate_quotes(50000.0, -5.0, 0.0, 6000000000ULL);

    // Short inventory should skew ask higher (to avoid adding more short)
    CHECK(q_short.ask_price > q_flat.ask_price);
}

TEST_CASE("MarketMakingV2 size skew with long inventory") {
    MarketMakingV2 mm;
    for (int i = 0; i < 5; ++i) {
        mm.generate_quotes(50000.0, 0.0, 0.0, i * 1000000000ULL);
    }

    auto q = mm.generate_quotes(50000.0, 5.0, 0.0, 5000000000ULL);
    // Long inventory: bid_size < ask_size (reduce buying, increase selling)
    CHECK(q.bid_size < q.ask_size);
}

TEST_CASE("MarketMakingV2 size skew with short inventory") {
    MarketMakingV2 mm;
    for (int i = 0; i < 5; ++i) {
        mm.generate_quotes(50000.0, 0.0, 0.0, i * 1000000000ULL);
    }

    auto q = mm.generate_quotes(50000.0, -5.0, 0.0, 5000000000ULL);
    // Short inventory: ask_size < bid_size (reduce selling, increase buying)
    CHECK(q.ask_size < q.bid_size);
}

// ═══════════════════════════════════════════════════════════════════════════
// Adverse selection / toxicity
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 cancels on high toxicity") {
    MarketMakingV2 mm;
    auto           q = mm.generate_quotes(50000.0, 0.0, 0.8, 0);
    CHECK(q.should_cancel == true);
    CHECK(q.confidence == doctest::Approx(0.0));
}

TEST_CASE("MarketMakingV2 no cancel on low toxicity") {
    MarketMakingV2 mm;
    auto           q = mm.generate_quotes(50000.0, 0.0, 0.3, 0);
    CHECK(q.should_cancel == false);
    CHECK(q.confidence > 0.0);
}

TEST_CASE("MarketMakingV2 confidence inversely proportional to toxicity") {
    MarketMakingV2 mm;
    auto           q_low  = mm.generate_quotes(50000.0, 0.0, 0.1, 0);
    auto           q_high = mm.generate_quotes(50000.0, 0.0, 0.5, 1000000000ULL);
    CHECK(q_low.confidence > q_high.confidence);
}

// ═══════════════════════════════════════════════════════════════════════════
// Spread clamping
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 spread within floor and cap") {
    MarketMakingV2 mm;
    for (int i = 0; i < 20; ++i) {
        auto q = mm.generate_quotes(50000.0 + i * 10, 0.0, 0.0, i * 1000000000ULL);
        CHECK(q.spread >= mm.config().spread_floor - 1e-10);
        CHECK(q.spread <= mm.config().spread_cap + 1e-10);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Max inventory
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 stops bidding at max long inventory") {
    MarketMakingV2 mm;
    auto           q = mm.generate_quotes(50000.0, mm.config().max_inventory, 0.0, 0);
    CHECK(q.bid_price == doctest::Approx(0.0));
    CHECK(q.bid_size == doctest::Approx(0.0));
    CHECK(q.ask_price > 0.0);
}

TEST_CASE("MarketMakingV2 stops asking at max short inventory") {
    MarketMakingV2 mm;
    auto           q = mm.generate_quotes(50000.0, -mm.config().max_inventory, 0.0, 0);
    CHECK(q.ask_price == doctest::Approx(0.0));
    CHECK(q.ask_size == doctest::Approx(0.0));
    CHECK(q.bid_price > 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 reset clears state") {
    MarketMakingV2 mm;
    for (int i = 0; i < 10; ++i) {
        mm.generate_quotes(50000.0 + i * 100, 2.0, 0.0, i * 1000000000ULL);
    }
    CHECK(mm.reservation_price() > 0.0);
    CHECK(mm.current_sigma() > 0.0);

    mm.reset();
    CHECK(mm.reservation_price() == doctest::Approx(0.0));
    CHECK(mm.current_sigma() == doctest::Approx(mm.config().sigma));
}

// ═══════════════════════════════════════════════════════════════════════════
// Volatility tracking
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MarketMakingV2 sigma updates with price changes") {
    MarketMakingV2 mm;
    double         sigma0 = mm.current_sigma();

    // Feed volatile prices
    for (int i = 0; i < 20; ++i) {
        mm.generate_quotes(50000.0 + (i % 2 == 0 ? 500 : -500), 0.0, 0.0, i * 1000000000ULL);
    }
    CHECK(mm.current_sigma() > sigma0);
}

TEST_CASE("MarketMakingV2 sigma stable with flat prices") {
    MarketMakingV2 mm;
    for (int i = 0; i < 20; ++i) {
        mm.generate_quotes(50000.0, 0.0, 0.0, i * 1000000000ULL);
    }
    // Flat prices → zero returns → sigma should be very small
    CHECK(mm.current_sigma() < 0.01);
}
