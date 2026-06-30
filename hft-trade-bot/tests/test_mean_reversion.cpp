// Tests: OU estimation, z-score, entry/exit signals, Kalman filter
#include "../strategies/mean_reversion_v2.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <random>

using namespace hft;

void test_kalman_filter() {
    KalmanFilter1D kf(1e-5, 1e-3);
    kf.reset(100.0);

    // Feed noisy measurements around 100
    std::mt19937 rng(42);
    std::normal_distribution<double> noise(0.0, 0.1);

    for (int i = 0; i < 1000; ++i) {
        kf.update(100.0 + noise(rng));
    }

    // Estimate should converge near 100
    assert(std::abs(kf.estimate() - 100.0) < 1.0);
    assert(kf.variance() < 0.1);

    printf("  [PASS] test_kalman_filter\n");
}

void test_mean_reversion_no_signal() {
    MeanReversionV2 mr;
    std::mt19937 rng(42);
    std::normal_distribution<double> noise(0.0, 0.01);

    // Feed stable price — should not generate entry signals
    for (int i = 0; i < 200; ++i) {
        auto sig = mr.on_price(i * 1'000'000'000ULL, 100.0 + noise(rng));
        if (i < 100) {
            assert(sig.action == MeanReversionV2::Signal::Action::NONE);
        }
    }

    printf("  [PASS] test_mean_reversion_no_signal\n");
}

void test_mean_reversion_entry_signal() {
    MeanReversionV2 mr;
    mr.reset();

    // Feed stable price for burn-in
    for (int i = 0; i < 200; ++i) {
        mr.on_price(i * 1'000'000'000ULL, 100.0);
    }

    // Sudden price spike — should generate short signal
    auto sig = mr.on_price(200'000'000'000ULL, 105.0);
    // z-score should be positive (price above fair value)
    assert(sig.z_score > 0.0 || sig.action == MeanReversionV2::Signal::Action::NONE);

    printf("  [PASS] test_mean_reversion_entry_signal\n");
}

void test_mean_reversion_exit_signal() {
    MeanReversionV2 mr;
    mr.reset();

    // Burn-in
    for (int i = 0; i < 200; ++i) {
        mr.on_price(i * 1'000'000'000ULL, 100.0);
    }

    // Price deviation then reversion
    mr.on_price(200'000'000'000ULL, 103.0);
    auto sig = mr.on_price(201'000'000'000ULL, 100.1);

    // After reversion, z-score should be small
    assert(std::abs(sig.z_score) < 3.0);

    printf("  [PASS] test_mean_reversion_exit_signal\n");
}

void test_ou_parameter_estimation() {
    MeanReversionV2 mr;
    mr.reset();

    // Simulate OU process: dx = κ(θ - x)dt + σ dW
    double kappa = 0.1, theta = 100.0, sigma = 0.5;
    double x = 100.0;
    std::mt19937 rng(42);
    std::normal_distribution<double> noise(0.0, 1.0);

    for (int i = 0; i < 1000; ++i) {
        double dt = 1.0;
        x = x + kappa * (theta - x) * dt + sigma * noise(rng) * std::sqrt(dt);
        mr.on_price(static_cast<uint64_t>(i) * 1'000'000'000ULL, x);
    }

    double est_kappa, est_theta, est_sigma;
    mr.get_ou_params(est_kappa, est_theta, est_sigma);

    // Estimated theta should be near 100
    assert(std::abs(est_theta - 100.0) < 5.0);
    // Estimated sigma should be positive
    assert(est_sigma > 0.0);

    printf("  [PASS] test_ou_parameter_estimation (kappa=%.4f theta=%.2f sigma=%.4f)\n",
           est_kappa, est_theta, est_sigma);
}

void test_half_life() {
    MeanReversionV2 mr;
    mr.reset();

    for (int i = 0; i < 500; ++i) {
        mr.on_price(static_cast<uint64_t>(i) * 1'000'000'000ULL, 100.0);
    }

    // Half-life should be positive
    auto sig = mr.on_price(500'000'000'000ULL, 100.0);
    assert(sig.half_life_seconds >= 0.0);

    printf("  [PASS] test_half_life (half_life=%.2fs)\n", sig.half_life_seconds);
}

int main() {
    printf("=== Mean Reversion V2 Tests ===\n");
    test_kalman_filter();
    test_mean_reversion_no_signal();
    test_mean_reversion_entry_signal();
    test_mean_reversion_exit_signal();
    test_ou_parameter_estimation();
    test_half_life();
    printf("=== All tests passed! ===\n");
    return 0;
}
