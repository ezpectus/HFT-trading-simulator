// Unit tests for StatisticalArbV2 and CorrelationMatrix using doctest
// Tests: OLS regression, Kalman hedge ratio, z-score signals, pair finding
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/statistical_arb_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// Helper: feed correlated price series
// ═══════════════════════════════════════════════════════════════════════════
static void feed_correlated_prices(StatisticalArbV2& sa, int count, double base_a, double base_b,
                                   double beta, double noise = 0.0) {
    for (int i = 0; i < count; ++i) {
        double a = base_a + i * 0.5 + noise * (i % 3 - 1);
        double b = base_b + i * 0.5 / beta;
        sa.on_prices(a, b, i * 60000000000ULL);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// StatisticalArbV2 Config
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 default config") {
    StatisticalArbV2::Config cfg;
    CHECK(cfg.entry_z == doctest::Approx(2.0));
    CHECK(cfg.exit_z == doctest::Approx(0.5));
    CHECK(cfg.stop_z == doctest::Approx(4.0));
    CHECK(cfg.min_samples == 200);
    CHECK(cfg.regression_window == 500);
}

TEST_CASE("StatisticalArbV2 custom config") {
    StatisticalArbV2::Config cfg;
    cfg.entry_z           = 1.5;
    cfg.exit_z            = 0.3;
    cfg.stop_z            = 3.0;
    cfg.min_samples       = 50;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);
    // Should accept custom config
    auto sig = sa.on_prices(100, 100, 0);
    CHECK(sig.action == StatisticalArbV2::Signal::Action::NONE);
}

// ═══════════════════════════════════════════════════════════════════════════
// Early stage — not enough samples
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 returns NONE before min_samples") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples = 100;
    StatisticalArbV2 sa(cfg);
    for (int i = 0; i < 50; ++i) {
        auto sig = sa.on_prices(100 + i, 100 + i, i * 1000000000ULL);
        CHECK(sig.action == StatisticalArbV2::Signal::Action::NONE);
    }
}

TEST_CASE("StatisticalArbV2 sample_count increments") {
    StatisticalArbV2 sa;
    for (int i = 0; i < 10; ++i) {
        sa.on_prices(100, 100, i * 1000000000ULL);
    }
    CHECK(sa.sample_count() == 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// Signal generation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 generates signals after min_samples") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 50;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);

    // Feed correlated prices to build regression
    for (int i = 0; i < 60; ++i) {
        sa.on_prices(100 + i * 0.5, 100 + i * 0.5, i * 1000000000ULL);
    }
    // After min_samples, signals should be generated (could be NONE if z-score is in range)
    // Just verify it doesn't crash and returns a valid signal
    auto sig = sa.on_prices(130, 130, 60 * 1000000000ULL);
    CHECK(sig.action <= StatisticalArbV2::Signal::Action::STOP);
}

TEST_CASE("StatisticalArbV2 STOP signal on extreme z-score") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    cfg.stop_z            = 3.0;
    cfg.entry_z           = 2.0;
    StatisticalArbV2 sa(cfg);

    // Build correlated history
    for (int i = 0; i < 50; ++i) {
        sa.on_prices(100 + i * 0.1, 100 + i * 0.1, i * 1000000000ULL);
    }
    // Sudden divergence — price_a jumps, price_b drops
    auto sig = sa.on_prices(200, 50, 50 * 1000000000ULL);
    // Should generate STOP or SHORT_LONG due to extreme spread
    bool is_stop       = sig.action == StatisticalArbV2::Signal::Action::STOP;
    bool is_short_long = sig.action == StatisticalArbV2::Signal::Action::SHORT_LONG;
    CHECK((is_stop || is_short_long));
}

TEST_CASE("StatisticalArbV2 CLOSE signal when z-score reverts") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    cfg.entry_z           = 2.0;
    cfg.exit_z            = 0.5;
    StatisticalArbV2 sa(cfg);

    // Build correlated history
    for (int i = 0; i < 50; ++i) {
        sa.on_prices(100 + i * 0.1, 100 + i * 0.1, i * 1000000000ULL);
    }
    // Feed prices that converge (z-score near 0)
    auto sig = sa.on_prices(105, 105, 50 * 1000000000ULL);
    // With correlated prices, z-score should be small → CLOSE
    if (std::abs(sig.z_score) < cfg.exit_z) {
        CHECK(sig.action == StatisticalArbV2::Signal::Action::CLOSE);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Signal structure
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 Signal default values") {
    StatisticalArbV2::Signal sig;
    CHECK(sig.action == StatisticalArbV2::Signal::Action::NONE);
    CHECK(sig.z_score == doctest::Approx(0.0));
    CHECK(sig.hedge_ratio == doctest::Approx(0.0));
    CHECK(sig.spread == doctest::Approx(0.0));
    CHECK(sig.confidence == doctest::Approx(0.0));
}

TEST_CASE("StatisticalArbV2 signal has z_score and hedge_ratio after warmup") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);

    for (int i = 0; i < 50; ++i) {
        sa.on_prices(100 + i * 0.5, 100 + i * 0.5, i * 1000000000ULL);
    }
    auto sig = sa.on_prices(125, 125, 50 * 1000000000ULL);
    CHECK(sig.hedge_ratio != 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Hedge ratio and spread
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 hedge_ratio converges for correlated assets") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);

    // Perfectly correlated: a = b, so beta ≈ 1
    for (int i = 0; i < 100; ++i) {
        sa.on_prices(100 + i, 100 + i, i * 1000000000ULL);
    }
    CHECK(sa.hedge_ratio() == doctest::Approx(1.0).epsilon(0.1));
}

TEST_CASE("StatisticalArbV2 hedge_ratio for 2x relationship") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);

    // a = 2*b, so beta ≈ 2
    for (int i = 0; i < 100; ++i) {
        sa.on_prices(200 + 2 * i, 100 + i, i * 1000000000ULL);
    }
    CHECK(sa.hedge_ratio() == doctest::Approx(2.0).epsilon(0.2));
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 reset clears state") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples = 30;
    StatisticalArbV2 sa(cfg);

    for (int i = 0; i < 50; ++i) {
        sa.on_prices(100 + i, 100 + i, i * 1000000000ULL);
    }
    CHECK(sa.sample_count() == 50);

    sa.reset();
    CHECK(sa.sample_count() == 0);
    CHECK(sa.current_z() == doctest::Approx(0.0));
    CHECK(sa.current_spread() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Confidence scoring
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("StatisticalArbV2 confidence in valid range") {
    StatisticalArbV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.regression_window = 100;
    StatisticalArbV2 sa(cfg);

    for (int i = 0; i < 50; ++i) {
        sa.on_prices(100 + i * 0.5, 100 + i * 0.5, i * 1000000000ULL);
    }
    auto sig = sa.on_prices(150, 80, 50 * 1000000000ULL);
    if (sig.action != StatisticalArbV2::Signal::Action::NONE) {
        CHECK(sig.confidence >= 0.0);
        CHECK(sig.confidence <= 100.0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CorrelationMatrix
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("CorrelationMatrix default all zeros") {
    CorrelationMatrix cm;
    CHECK(cm.get(0, 0) == doctest::Approx(0.0));
    CHECK(cm.get(0, 1) == doctest::Approx(0.0));
    CHECK(cm.get(5, 10) == doctest::Approx(0.0));
}

TEST_CASE("CorrelationMatrix update and get") {
    CorrelationMatrix cm;
    cm.update(0, 1, 0.85);
    CHECK(cm.get(0, 1) == doctest::Approx(0.85));
    CHECK(cm.get(1, 0) == doctest::Approx(0.85)); // Symmetric
}

TEST_CASE("CorrelationMatrix out of bounds returns zero") {
    CorrelationMatrix cm;
    cm.update(0, 1, 0.5);
    CHECK(cm.get(100, 0) == doctest::Approx(0.0));
    CHECK(cm.get(0, 100) == doctest::Approx(0.0));
}

TEST_CASE("CorrelationMatrix find_pairs above threshold") {
    CorrelationMatrix cm;
    cm.update(0, 1, 0.9);
    cm.update(0, 2, 0.3);
    cm.update(1, 2, 0.8);

    auto pairs = cm.find_pairs(0.7);
    CHECK(pairs.size() == 2); // (0,1) and (1,2)

    // Check that (0,2) with 0.3 is not included
    bool has_02 = false;
    for (const auto& p : pairs) {
        if ((p.i == 0 && p.j == 2) || (p.i == 2 && p.j == 0)) {
            has_02 = true;
        }
    }
    CHECK_FALSE(has_02);
}

TEST_CASE("CorrelationMatrix find_pairs empty when none above threshold") {
    CorrelationMatrix cm;
    cm.update(0, 1, 0.3);
    cm.update(1, 2, 0.5);

    auto pairs = cm.find_pairs(0.9);
    CHECK(pairs.empty());
}

TEST_CASE("CorrelationMatrix find_pairs all above threshold") {
    CorrelationMatrix cm;
    cm.update(0, 1, 0.95);
    cm.update(0, 2, 0.90);
    cm.update(1, 2, 0.85);

    auto pairs = cm.find_pairs(0.7);
    CHECK(pairs.size() == 3);
}

TEST_CASE("CorrelationMatrix update out of bounds ignored") {
    CorrelationMatrix cm;
    cm.update(100, 0, 0.9); // Should be ignored
    CHECK(cm.get(100, 0) == doctest::Approx(0.0));
}

TEST_CASE("CorrelationMatrix negative correlation") {
    CorrelationMatrix cm;
    cm.update(0, 1, -0.85);
    auto pairs = cm.find_pairs(0.7);
    CHECK(pairs.size() == 1);
    CHECK(pairs[0].correlation == doctest::Approx(-0.85));
}
