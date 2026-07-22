// Tests: Pre-trade checks, kill switch, VaR/CVaR, drawdown tracker
#include "../src/risk/kill_switch.h"
#include "../src/risk/portfolio_risk.h"
#include "../src/risk/pre_trade_risk.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <vector>

using namespace hft;

// ── Pre-trade risk tests ──

void test_pre_trade_approved() {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 10.0;
    cfg.max_total_notional      = 100000.0;
    cfg.daily_loss_limit        = 5000.0;
    cfg.max_leverage            = 20;
    cfg.order_rate_per_second   = 50;
    cfg.order_burst_size        = 10;

    PreTradeRisk risk(cfg);

    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 10, 10000.0, 5000.0, 0.0, 0.0);
    assert(result.approved);
    assert(result.rejection_code == 0);

    printf("  [PASS] test_pre_trade_approved\n");
}

void test_pre_trade_blacklisted() {
    PreTradeRisk::Config cfg;
    cfg.blacklist.insert("SCAMUSDT");
    PreTradeRisk risk(cfg);

    auto result = risk.check("SCAMUSDT", "BUY", 1.0, 100.0, 1, 10000.0, 5000.0, 0.0, 0.0);
    assert(!result.approved);
    assert(result.rejection_code == 1);

    printf("  [PASS] test_pre_trade_blacklisted\n");
}

void test_pre_trade_max_leverage() {
    PreTradeRisk::Config cfg;
    cfg.max_leverage = 10;
    PreTradeRisk risk(cfg);

    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 20, 10000.0, 5000.0, 0.0, 0.0);
    assert(!result.approved);
    assert(result.rejection_code == 8);

    printf("  [PASS] test_pre_trade_max_leverage\n");
}

void test_pre_trade_max_position() {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 5.0;
    PreTradeRisk risk(cfg);

    auto result = risk.check("BTCUSDT", "BUY", 10.0, 50000.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    assert(!result.approved);
    assert(result.rejection_code == 3);

    printf("  [PASS] test_pre_trade_max_position\n");
}

void test_pre_trade_daily_loss() {
    PreTradeRisk::Config cfg;
    cfg.daily_loss_limit = 1000.0;
    PreTradeRisk risk(cfg);
    risk.update_daily_pnl(-2000.0); // Exceeded loss limit

    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 10000.0, 5000.0, 0.0, 0.0);
    assert(!result.approved);
    assert(result.rejection_code == 5);

    printf("  [PASS] test_pre_trade_daily_loss\n");
}

void test_pre_trade_rate_limit() {
    PreTradeRisk::Config cfg;
    cfg.order_rate_per_second = 2.0;
    cfg.order_burst_size      = 2.0;
    PreTradeRisk risk(cfg);

    // Use up burst
    auto r1 = risk.check("BTCUSDT", "BUY", 0.01, 100.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    auto r2 = risk.check("BTCUSDT", "BUY", 0.01, 100.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    auto r3 = risk.check("BTCUSDT", "BUY", 0.01, 100.0, 1, 100000.0, 50000.0, 0.0, 0.0);

    assert(r1.approved);
    assert(r2.approved);
    assert(!r3.approved);
    assert(r3.rejection_code == 6);

    printf("  [PASS] test_pre_trade_rate_limit\n");
}

// ── Portfolio risk tests ──

void test_var_computation() {
    PortfolioRisk pr;

    // Add some returns (normal distribution)
    double returns[] = {-0.02, -0.01, -0.005, -0.003, -0.001, 0.001, 0.002, 0.003, 0.005, 0.01};

    for (double r : returns) {
        pr.add_return(r);
    }

    auto var = pr.compute_historical_var();
    assert(var.var_95 > 0.0);
    assert(var.var_99 > 0.0);
    assert(var.cvar_95 >= var.var_95);
    assert(var.cvar_99 >= var.var_99);

    printf("  [PASS] test_var_computation (VaR95=%.4f VaR99=%.4f CVaR95=%.4f)\n", var.var_95,
           var.var_99, var.cvar_95);
}

void test_parametric_var() {
    PortfolioRisk pr;

    for (int i = 0; i < 100; ++i) {
        pr.add_return(0.001 * (i % 10 - 5)); // Range -0.005 to +0.004
    }

    auto var = pr.compute_parametric_var(100000.0); // $100k portfolio
    assert(var.var_95 > 0.0);
    assert(var.var_99 > var.var_95);

    printf("  [PASS] test_parametric_var (VaR95=$%.2f VaR99=$%.2f)\n", var.var_95, var.var_99);
}

void test_stress_test() {
    PortfolioRisk pr;

    std::vector<PortfolioRisk::Position> positions = {
        {"BTCUSDT", 1.0, 50000.0, 0.5},
        {"ETHUSDT", 10.0, 3000.0, 0.3},
        {"SOLUSDT", 100.0, 100.0, 0.2},
    };

    auto scenario = PortfolioRisk::flash_crash();
    auto result   = pr.run_stress_test(positions, scenario);

    // Flash crash should result in a loss
    assert(result.total_loss < 0.0);

    printf("  [PASS] test_stress_test (loss=$%.2f worst=%s)\n", result.total_loss,
           result.worst_symbol.c_str());
}

void test_drawdown_tracker() {
    DrawdownTracker dd;

    dd.update(10000.0);
    assert(dd.current_drawdown() == 0.0);

    dd.update(12000.0); // New peak
    assert(dd.peak_equity() == 12000.0);
    assert(dd.current_drawdown() == 0.0);

    dd.update(10000.0); // Drawdown
    assert(dd.current_drawdown() > 0.0);
    assert(dd.max_drawdown() > 0.0);

    double expected_dd = (12000.0 - 10000.0) / 12000.0;
    assert(std::abs(dd.current_drawdown() - expected_dd) < 1e-10);

    printf("  [PASS] test_drawdown_tracker (dd=%.4f max_dd=%.4f)\n", dd.current_drawdown(),
           dd.max_drawdown());
}

int main() {
    printf("=== Risk Engine Tests ===\n");

    printf("-- Pre-trade risk --\n");
    test_pre_trade_approved();
    test_pre_trade_blacklisted();
    test_pre_trade_max_leverage();
    test_pre_trade_max_position();
    test_pre_trade_daily_loss();
    test_pre_trade_rate_limit();

    printf("-- Portfolio risk --\n");
    test_var_computation();
    test_parametric_var();
    test_stress_test();
    test_drawdown_tracker();

    printf("=== All tests passed! ===\n");
    return 0;
}
