// Unit tests for PortfolioRisk and DrawdownTracker using doctest
// Tests: drawdown tracking, historical VaR, parametric VaR, CVaR,
//        stress testing, correlation-adjusted exposure, return sampling
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/risk/portfolio_risk.h"

#include <cmath>
#include <vector>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// DrawdownTracker
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("DrawdownTracker: initial state is zero") {
    DrawdownTracker dd;
    CHECK(dd.current_drawdown() == doctest::Approx(0.0));
    CHECK(dd.max_drawdown() == doctest::Approx(0.0));
    CHECK(dd.peak_equity() == doctest::Approx(0.0));
}

TEST_CASE("DrawdownTracker: peak updates on new high") {
    DrawdownTracker dd;
    dd.update(10000.0);
    CHECK(dd.peak_equity() == doctest::Approx(10000.0));
    dd.update(12000.0);
    CHECK(dd.peak_equity() == doctest::Approx(12000.0));
    CHECK(dd.current_drawdown() == doctest::Approx(0.0));
}

TEST_CASE("DrawdownTracker: drawdown on decline") {
    DrawdownTracker dd;
    dd.update(10000.0);
    dd.update(9000.0);
    // DD = (10000 - 9000) / 10000 = 0.10
    CHECK(dd.current_drawdown() == doctest::Approx(0.10));
    CHECK(dd.max_drawdown() == doctest::Approx(0.10));
}

TEST_CASE("DrawdownTracker: max drawdown tracks deepest") {
    DrawdownTracker dd;
    dd.update(10000.0);
    dd.update(9500.0); // 5% DD
    dd.update(9800.0); // 2% DD (recovered a bit)
    dd.update(8500.0); // 15% DD (new max)
    CHECK(dd.max_drawdown() == doctest::Approx(0.15));
    CHECK(dd.current_drawdown() == doctest::Approx(0.15));
}

TEST_CASE("DrawdownTracker: reset clears all") {
    DrawdownTracker dd;
    dd.update(10000.0);
    dd.update(8000.0);
    dd.reset();
    CHECK(dd.current_drawdown() == doctest::Approx(0.0));
    CHECK(dd.max_drawdown() == doctest::Approx(0.0));
    CHECK(dd.peak_equity() == doctest::Approx(0.0));
}

TEST_CASE("DrawdownTracker: zero peak produces zero drawdown") {
    DrawdownTracker dd;
    dd.update(0.0);
    CHECK(dd.current_drawdown() == doctest::Approx(0.0));
}

TEST_CASE("DrawdownTracker: peak does not decrease") {
    DrawdownTracker dd;
    dd.update(10000.0);
    dd.update(8000.0);
    dd.update(7000.0);
    CHECK(dd.peak_equity() == doctest::Approx(10000.0));
    // DD = (10000 - 7000) / 10000 = 0.30
    CHECK(dd.current_drawdown() == doctest::Approx(0.30));
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — return sampling
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: initial return count is zero") {
    PortfolioRisk pr;
    CHECK(pr.return_count() == 0);
}

TEST_CASE("PortfolioRisk: add_return increments count") {
    PortfolioRisk pr;
    pr.add_return(0.01);
    pr.add_return(-0.02);
    CHECK(pr.return_count() == 2);
}

TEST_CASE("PortfolioRisk: add_return wraps around MAX_RETURNS") {
    PortfolioRisk pr;
    for (size_t i = 0; i < PortfolioRisk::MAX_RETURNS + 50; ++i) {
        pr.add_return(0.001 * static_cast<double>(i));
    }
    CHECK(pr.return_count() == PortfolioRisk::MAX_RETURNS);
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — historical VaR
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: historical VaR returns zero with insufficient data") {
    PortfolioRisk pr;
    for (int i = 0; i < 5; ++i)
        pr.add_return(0.01);
    auto result = pr.compute_historical_var();
    CHECK(result.var_95 == doctest::Approx(0.0));
    CHECK(result.var_99 == doctest::Approx(0.0));
}

TEST_CASE("PortfolioRisk: historical VaR with known returns") {
    PortfolioRisk pr;
    // Add 20 returns: -0.05 to +0.05 in steps
    for (int i = 0; i < 20; ++i) {
        pr.add_return(-0.05 + 0.005 * i); // -0.05, -0.045, ..., +0.045
    }
    auto result = pr.compute_historical_var();
    // With 20 sorted returns, idx_95 = 20*0.05 = 1, idx_99 = 20*0.01 = 0
    // sorted[0] = -0.05, sorted[1] = -0.045
    // var_95 = -sorted[1] = 0.045, var_99 = -sorted[0] = 0.05
    CHECK(result.var_95 == doctest::Approx(0.045));
    CHECK(result.var_99 == doctest::Approx(0.05));
    // CVaR should be >= VaR
    CHECK(result.cvar_95 >= result.var_95);
    CHECK(result.cvar_99 >= result.var_99);
}

TEST_CASE("PortfolioRisk: historical VaR with all positive returns") {
    PortfolioRisk pr;
    for (int i = 0; i < 20; ++i) {
        pr.add_return(0.01 + 0.001 * i); // all positive
    }
    auto result = pr.compute_historical_var();
    // VaR should be negative (no real risk) or very small
    CHECK(result.var_95 <= 0.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — parametric VaR
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: parametric VaR returns zero with insufficient data") {
    PortfolioRisk pr;
    pr.add_return(0.01);
    auto result = pr.compute_parametric_var(100000.0);
    CHECK(result.var_95 == doctest::Approx(0.0));
    CHECK(result.var_99 == doctest::Approx(0.0));
}

TEST_CASE("PortfolioRisk: parametric VaR scales with portfolio value") {
    PortfolioRisk pr;
    for (int i = 0; i < 100; ++i) {
        pr.add_return(0.001 * (i % 5 - 2)); // some variance
    }
    auto r1 = pr.compute_parametric_var(10000.0);
    auto r2 = pr.compute_parametric_var(20000.0);
    // VaR should scale linearly with portfolio value
    CHECK(r2.var_95 == doctest::Approx(2.0 * r1.var_95));
    CHECK(r2.var_99 == doctest::Approx(2.0 * r1.var_99));
}

TEST_CASE("PortfolioRisk: parametric VaR 99 >= VaR 95") {
    PortfolioRisk pr;
    for (int i = 0; i < 100; ++i) {
        pr.add_return(0.001 * (i % 7 - 3));
    }
    auto result = pr.compute_parametric_var(100000.0);
    CHECK(result.var_99 >= result.var_95);
    CHECK(result.cvar_99 >= result.cvar_95);
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — stress testing
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: stress test computes total loss") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.5},
    };
    auto scenario = PortfolioRisk::flash_crash();
    auto result   = pr.run_stress_test(positions, scenario);
    // BTC: 1.0 * 50000 * -0.10 = -5000
    // ETH: 10.0 * 3000 * -0.12 = -3600
    // Total: -8600
    CHECK(result.total_loss == doctest::Approx(-8600.0));
}

TEST_CASE("PortfolioRisk: stress test identifies worst position") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.5},
    };
    auto scenario = PortfolioRisk::flash_crash();
    auto result   = pr.run_stress_test(positions, scenario);
    // BTC loss = -5000, ETH loss = -3600 → BTC is worst
    CHECK(result.worst_symbol == "BTCUSDT");
    CHECK(result.worst_position_loss == doctest::Approx(-5000.0));
}

TEST_CASE("PortfolioRisk: stress test with no matching symbols") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"DOGEUSDT", 1000.0, 0.10, 1.0},
    };
    auto scenario = PortfolioRisk::flash_crash(); // BTC, ETH, SOL
    auto result   = pr.run_stress_test(positions, scenario);
    CHECK(result.total_loss == doctest::Approx(0.0));
    CHECK(result.worst_symbol.empty());
}

TEST_CASE("PortfolioRisk: stress test with short position") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", -1.0, 50000.0, -0.5}, // short
    };
    auto scenario = PortfolioRisk::flash_crash(); // BTC -10%
    auto result   = pr.run_stress_test(positions, scenario);
    // Short * price * shock = -1 * 50000 * -0.10 = +5000 (profit on crash)
    CHECK(result.total_loss == doctest::Approx(5000.0));
}

TEST_CASE("PortfolioRisk: flash_crash scenario structure") {
    auto s = PortfolioRisk::flash_crash();
    CHECK(s.name == "Flash Crash");
    CHECK(s.shocks.size() == 3);
}

TEST_CASE("PortfolioRisk: volatility_spike scenario structure") {
    auto s = PortfolioRisk::volatility_spike();
    CHECK(s.name == "Volatility Spike");
    CHECK(s.shocks.size() == 3);
}

TEST_CASE("PortfolioRisk: correlation_breakdown scenario structure") {
    auto s = PortfolioRisk::correlation_breakdown();
    CHECK(s.name == "Correlation Breakdown");
    CHECK(s.shocks.size() == 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — correlation-adjusted exposure
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: correlation adjusted exposure single position") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 1.0},
    };
    std::vector<std::vector<double>> corr     = {{1.0}};
    double                           exposure = pr.correlation_adjusted_exposure(positions, corr);
    // Single position: no correlation adjustment
    CHECK(exposure == doctest::Approx(50000.0));
}

TEST_CASE("PortfolioRisk: correlation adjusted exposure multiple positions") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.5},
    };
    // Total abs value = 50000 + 30000 = 80000
    std::vector<std::vector<double>> corr = {
        {1.0, 0.8},
        {0.8, 1.0},
    };
    double exposure = pr.correlation_adjusted_exposure(positions, corr);
    // avg_corr = 0.8, n=2
    // adjusted = 80000 * sqrt(1 + 0.8 * 1/2) = 80000 * sqrt(1.4)
    CHECK(exposure == doctest::Approx(80000.0 * std::sqrt(1.4)));
}

TEST_CASE("PortfolioRisk: correlation adjusted exposure with zero correlation") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.5},
    };
    std::vector<std::vector<double>> corr = {
        {1.0, 0.0},
        {0.0, 1.0},
    };
    double exposure = pr.correlation_adjusted_exposure(positions, corr);
    // avg_corr = 0, adjusted = 80000 * sqrt(1) = 80000
    CHECK(exposure == doctest::Approx(80000.0));
}

TEST_CASE("PortfolioRisk: correlation adjusted exposure empty corr matrix") {
    PortfolioRisk                        pr;
    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.5},
    };
    std::vector<std::vector<double>> corr; // empty
    double                           exposure = pr.correlation_adjusted_exposure(positions, corr);
    // No corr data → just sum of abs values
    CHECK(exposure == doctest::Approx(80000.0));
}

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioRisk — drawdown tracker accessor
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PortfolioRisk: drawdown tracker accessible") {
    PortfolioRisk pr;
    pr.drawdown().update(10000.0);
    pr.drawdown().update(9000.0);
    CHECK(pr.drawdown().current_drawdown() == doctest::Approx(0.10));
    CHECK(pr.drawdown().max_drawdown() == doctest::Approx(0.10));
}

TEST_CASE("PortfolioRisk: const drawdown tracker accessible") {
    PortfolioRisk pr;
    pr.drawdown().update(10000.0);
    const PortfolioRisk& cpr = pr;
    CHECK(cpr.drawdown().peak_equity() == doctest::Approx(10000.0));
}
