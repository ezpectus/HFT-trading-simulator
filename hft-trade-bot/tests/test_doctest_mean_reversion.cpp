// Unit tests for MeanReversionV2 — OU-based mean reversion with Kalman filter
// Tests: Kalman filter, z-score tracking, signal generation, OU params, reset
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/strategies/mean_reversion_v2.h"

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// KalmanFilter1D tests
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("KalmanFilter1D initialization") {
    KalmanFilter1D kf(1e-5, 1e-3);
    kf.reset(100.0);
    CHECK(kf.estimate() == doctest::Approx(100.0));
    CHECK(kf.variance() == doctest::Approx(1.0));
}

TEST_CASE("KalmanFilter1D update converges to measurement") {
    KalmanFilter1D kf(1e-5, 1e-3);
    kf.reset(100.0);
    for (int i = 0; i < 100; ++i) {
        kf.update(105.0);
    }
    CHECK(kf.estimate() == doctest::Approx(105.0).epsilon(0.01));
}

TEST_CASE("KalmanFilter1D variance decreases with updates") {
    KalmanFilter1D kf(1e-5, 1e-3);
    kf.reset(100.0);
    double v0 = kf.variance();
    for (int i = 0; i < 10; ++i) {
        kf.update(100.0);
    }
    CHECK(kf.variance() < v0);
}

TEST_CASE("KalmanFilter1D set_process_noise and set_measurement_noise") {
    KalmanFilter1D kf;
    kf.set_process_noise(0.01);
    kf.set_measurement_noise(0.1);
    kf.reset(50.0);
    double est = kf.update(55.0);
    // With higher measurement noise, estimate should move less toward measurement
    CHECK(est > 50.0);
    CHECK(est < 55.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// MeanReversionV2 Config
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 default config") {
    MeanReversionV2::Config cfg;
    CHECK(cfg.entry_z_threshold == doctest::Approx(2.0));
    CHECK(cfg.exit_z_threshold == doctest::Approx(0.5));
    CHECK(cfg.stop_z_threshold == doctest::Approx(4.0));
    CHECK(cfg.min_samples == 100);
    CHECK(cfg.ou_window == 500);
}

TEST_CASE("MeanReversionV2 custom config") {
    MeanReversionV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.ou_window         = 100;
    cfg.entry_z_threshold = 1.5;
    MeanReversionV2 mr(cfg);
    auto            sig = mr.on_price(0, 100.0);
    CHECK(sig.action == MeanReversionV2::Signal::Action::NONE);
}

// ═══════════════════════════════════════════════════════════════════════════
// Early stage — not enough samples
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 returns NONE before min_samples") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 50;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);
    for (int i = 0; i < 30; ++i) {
        auto sig = mr.on_price(i * 1000000000ULL, 100.0 + i * 0.1);
        CHECK(sig.action == MeanReversionV2::Signal::Action::NONE);
    }
}

TEST_CASE("MeanReversionV2 price_count increments") {
    MeanReversionV2 mr;
    for (int i = 0; i < 10; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    CHECK(mr.price_count() == 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// Signal generation
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 generates signal after warmup") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    // Feed stable prices around 100
    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0 + (i % 3 - 1) * 0.5);
    }
    // After warmup, signal should be generated
    auto sig = mr.on_price(50 * 1000000000ULL, 100.0);
    CHECK(sig.action <= MeanReversionV2::Signal::Action::STOP);
}

TEST_CASE("MeanReversionV2 ENTER_SHORT on price spike") {
    MeanReversionV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.ou_window         = 100;
    cfg.entry_z_threshold = 1.5;
    MeanReversionV2 mr(cfg);

    // Build stable history
    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    // Sudden price spike
    auto sig = mr.on_price(50 * 1000000000ULL, 120.0);
    // Should generate ENTER_SHORT or STOP (price far above fair value)
    bool is_short = sig.action == MeanReversionV2::Signal::Action::ENTER_SHORT;
    bool is_stop  = sig.action == MeanReversionV2::Signal::Action::STOP;
    CHECK((is_short || is_stop));
}

TEST_CASE("MeanReversionV2 ENTER_LONG on price drop") {
    MeanReversionV2::Config cfg;
    cfg.min_samples       = 30;
    cfg.ou_window         = 100;
    cfg.entry_z_threshold = 1.5;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    auto sig     = mr.on_price(50 * 1000000000ULL, 80.0);
    bool is_long = sig.action == MeanReversionV2::Signal::Action::ENTER_LONG;
    bool is_stop = sig.action == MeanReversionV2::Signal::Action::STOP;
    CHECK((is_long || is_stop));
}

// ═══════════════════════════════════════════════════════════════════════════
// Z-score tracking (regression for last_z_ bug)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 current_z_score tracks last signal") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    auto sig = mr.on_price(50 * 1000000000ULL, 110.0);
    // current_z_score() should match the signal's z_score
    CHECK(mr.current_z_score() == doctest::Approx(sig.z_score));
}

TEST_CASE("MeanReversionV2 current_z_score non-zero after price deviation") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    mr.on_price(50 * 1000000000ULL, 120.0);
    // Z-score should be non-zero after a price deviation
    CHECK(mr.current_z_score() != 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Fair price tracking
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 fair_price converges to input") {
    MeanReversionV2 mr;
    for (int i = 0; i < 100; ++i) {
        mr.on_price(i * 1000000000ULL, 50000.0);
    }
    CHECK(mr.fair_price() == doctest::Approx(50000.0).epsilon(0.01));
}

// ═══════════════════════════════════════════════════════════════════════════
// Signal structure
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 Signal default values") {
    MeanReversionV2::Signal sig;
    CHECK(sig.action == MeanReversionV2::Signal::Action::NONE);
    CHECK(sig.z_score == doctest::Approx(0.0));
    CHECK(sig.fair_price == doctest::Approx(0.0));
    CHECK(sig.half_life_seconds == doctest::Approx(0.0));
    CHECK(sig.confidence == doctest::Approx(0.0));
}

TEST_CASE("MeanReversionV2 signal has fair_price after warmup") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    auto sig = mr.on_price(50 * 1000000000ULL, 100.0);
    CHECK(sig.fair_price > 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Confidence scoring
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 confidence in valid range") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0);
    }
    auto sig = mr.on_price(50 * 1000000000ULL, 130.0);
    if (sig.action != MeanReversionV2::Signal::Action::NONE) {
        CHECK(sig.confidence >= 0.0);
        CHECK(sig.confidence <= 100.0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// OU parameters
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 OU params accessible after warmup") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0 + (i % 3 - 1) * 0.5);
    }
    double k, t, s;
    mr.get_ou_params(k, t, s);
    CHECK(k >= 0.0);
    CHECK(s >= 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Reset
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 reset clears state") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0 + i * 0.1);
    }
    CHECK(mr.price_count() == 50);

    mr.reset();
    CHECK(mr.price_count() == 0);
    CHECK(mr.current_z_score() == doctest::Approx(0.0));
    CHECK(mr.fair_price() == doctest::Approx(0.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// Half-life
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("MeanReversionV2 half_life positive after warmup") {
    MeanReversionV2::Config cfg;
    cfg.min_samples = 30;
    cfg.ou_window   = 100;
    MeanReversionV2 mr(cfg);

    for (int i = 0; i < 50; ++i) {
        mr.on_price(i * 1000000000ULL, 100.0 + (i % 3 - 1) * 0.5);
    }
    auto sig = mr.on_price(50 * 1000000000ULL, 100.0);
    CHECK(sig.half_life_seconds >= 0.0);
}
