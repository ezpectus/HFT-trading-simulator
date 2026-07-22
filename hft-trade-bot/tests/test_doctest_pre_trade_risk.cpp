// Unit tests for PreTradeRisk and TokenBucket using doctest
// Tests: token bucket rate limiting, blacklist/whitelist, position limits,
//        exposure limits, daily loss, leverage, margin check (regression test)
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include "../src/risk/pre_trade_risk.h"

#include <chrono>
#include <thread>

using namespace hft;

// ═══════════════════════════════════════════════════════════════════════════
// TokenBucket
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("TokenBucket: initial tokens equal burst size") {
    TokenBucket tb(10.0, 5.0);
    // Available should be ~burst_size (may have refilled slightly)
    CHECK(tb.available_tokens() <= 5.0 + 0.01);
    CHECK(tb.available_tokens() >= 5.0 - 0.01);
}

TEST_CASE("TokenBucket: try_acquire decrements tokens") {
    TokenBucket tb(1000.0, 10.0); // high rate so refill is negligible
    CHECK(tb.try_acquire());
    CHECK(tb.try_acquire());
    CHECK(tb.try_acquire());
    // Should have consumed 3 tokens
    CHECK(tb.available_tokens() <= 7.01);
}

TEST_CASE("TokenBucket: try_acquire fails when empty") {
    TokenBucket tb(0.01, 3.0); // very slow refill
    CHECK(tb.try_acquire());
    CHECK(tb.try_acquire());
    CHECK(tb.try_acquire());
    // Bucket should be empty now
    CHECK_FALSE(tb.try_acquire());
}

TEST_CASE("TokenBucket: try_acquire_n acquires multiple") {
    TokenBucket tb(0.01, 10.0);
    CHECK(tb.try_acquire_n(5.0));
    CHECK_FALSE(tb.try_acquire_n(10.0)); // Only ~5 left
}

TEST_CASE("TokenBucket: refills over time") {
    TokenBucket tb(1000.0, 5.0); // 1000/sec
    // Consume all
    tb.try_acquire();
    tb.try_acquire();
    tb.try_acquire();
    tb.try_acquire();
    tb.try_acquire();
    CHECK_FALSE(tb.try_acquire());
    // Wait for refill
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    // Should have refilled several tokens
    CHECK(tb.try_acquire());
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — basic approval
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: valid order approved") {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 10.0;
    cfg.max_total_notional      = 100000.0;
    cfg.daily_loss_limit        = 5000.0;
    cfg.max_leverage            = 20.0;
    cfg.min_margin_ratio        = 0.05;
    cfg.order_rate_per_second   = 100.0;
    cfg.order_burst_size        = 100.0;

    PreTradeRisk risk(cfg);
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 10, 100000.0, 50000.0, 0.0, 0.0);
    CHECK(result.approved);
    CHECK(result.rejection_code == 0);
}

TEST_CASE("PreTradeRisk: blacklisted symbol rejected") {
    PreTradeRisk::Config cfg;
    cfg.blacklist.insert("DOGEUSDT");
    PreTradeRisk risk(cfg);
    auto         result = risk.check("DOGEUSDT", "BUY", 1.0, 0.10, 1, 10000.0, 5000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 1);
}

TEST_CASE("PreTradeRisk: non-whitelisted symbol rejected") {
    PreTradeRisk::Config cfg;
    cfg.whitelist.insert("BTCUSDT");
    PreTradeRisk risk(cfg);
    auto         result = risk.check("ETHUSDT", "BUY", 1.0, 3000.0, 5, 100000.0, 50000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 2);
}

TEST_CASE("PreTradeRisk: whitelisted symbol passes") {
    PreTradeRisk::Config cfg;
    cfg.whitelist.insert("BTCUSDT");
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 10, 100000.0, 50000.0, 0.0, 0.0);
    CHECK(result.approved);
}

TEST_CASE("PreTradeRisk: leverage exceeds max rejected") {
    PreTradeRisk::Config cfg;
    cfg.max_leverage     = 10.0;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 20, 100000.0, 50000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 8);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — position limits
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: position size exceeds limit rejected") {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 5.0;
    cfg.order_burst_size        = 100.0;
    PreTradeRisk risk(cfg);
    // Buying 6 when current is 0 → new_pos = 6, exceeds 5
    auto result = risk.check("BTCUSDT", "BUY", 6.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 3);
}

TEST_CASE("PreTradeRisk: per-symbol max position override") {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol            = 5.0;
    cfg.per_symbol_max_position["BTCUSDT"] = 20.0;
    cfg.order_burst_size                   = 100.0;
    PreTradeRisk risk(cfg);
    // 10 BTC with per-symbol override of 20 → should pass
    auto result = risk.check("BTCUSDT", "BUY", 10.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK(result.approved);
}

TEST_CASE("PreTradeRisk: short position reduces abs position") {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 5.0;
    cfg.order_burst_size        = 100.0;
    PreTradeRisk risk(cfg);
    // Current long 4, sell 3 → new_pos = 1, within limit
    auto result = risk.check("BTCUSDT", "SELL", 3.0, 50000.0, 1, 100000.0, 50000.0, 4.0, 200000.0);
    CHECK(result.approved);
}

TEST_CASE("PreTradeRisk: sell flips long to short exceeding limit") {
    PreTradeRisk::Config cfg;
    cfg.max_position_per_symbol = 5.0;
    cfg.order_burst_size        = 100.0;
    PreTradeRisk risk(cfg);
    // Current long 2, sell 8 → new_pos = -6, |−6| > 5
    auto result =
        risk.check("BTCUSDT", "SELL", 8.0, 50000.0, 1, 1000000.0, 500000.0, 2.0, 100000.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — exposure limits
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: total exposure exceeds limit rejected") {
    PreTradeRisk::Config cfg;
    cfg.max_total_notional = 100000.0;
    cfg.order_burst_size   = 100.0;
    PreTradeRisk risk(cfg);
    // Current exposure 80000, order notional 30000 → 110000 > 100000
    auto result = risk.check("BTCUSDT", "BUY", 3.0, 10000.0, 1, 1000000.0, 500000.0, 0.0, 80000.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 4);
}

TEST_CASE("PreTradeRisk: exposure exactly at limit passes") {
    PreTradeRisk::Config cfg;
    cfg.max_total_notional = 100000.0;
    cfg.order_burst_size   = 100.0;
    PreTradeRisk risk(cfg);
    // Current exposure 50000, order notional 50000 → 100000 == 100000 (not >)
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 50000.0);
    CHECK(result.approved);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — daily loss limit
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: daily loss limit reached rejected") {
    PreTradeRisk::Config cfg;
    cfg.daily_loss_limit = 5000.0;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    risk.update_daily_pnl(-6000.0);
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 5);
}

TEST_CASE("PreTradeRisk: daily loss at exactly limit rejected") {
    PreTradeRisk::Config cfg;
    cfg.daily_loss_limit = 5000.0;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    risk.update_daily_pnl(-5001.0); // Just past limit
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 5);
}

TEST_CASE("PreTradeRisk: reset_daily clears loss limit") {
    PreTradeRisk::Config cfg;
    cfg.daily_loss_limit = 5000.0;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    risk.update_daily_pnl(-6000.0);
    risk.reset_daily();
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK(result.approved);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — rate limiting
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: rate limit exceeded after burst") {
    PreTradeRisk::Config cfg;
    cfg.order_rate_per_second = 0.01; // Very slow refill
    cfg.order_burst_size      = 3.0;
    PreTradeRisk risk(cfg);
    // First 3 should pass (burst), 4th should fail
    auto r1 = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    auto r2 = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    auto r3 = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    auto r4 = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 1, 1000000.0, 500000.0, 0.0, 0.0);
    CHECK(r1.approved);
    CHECK(r2.approved);
    CHECK(r3.approved);
    CHECK_FALSE(r4.approved);
    CHECK(r4.rejection_code == 6);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — margin check (REGRESSION TEST for bug fix)
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: margin check allows reasonable order — regression test") {
    PreTradeRisk::Config cfg;
    cfg.min_margin_ratio = 0.05; // Keep 5% buffer
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    // available_margin = 10000, required_margin = 5000
    // With bug: 5000 > 10000 * 0.05 = 500 → rejected (WRONG)
    // With fix: 5000 > 10000 * 0.95 = 9500 → approved (CORRECT)
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 50000.0, 10, 100000.0, 10000.0, 0.0, 0.0);
    CHECK(result.approved);
}

TEST_CASE("PreTradeRisk: margin check rejects when insufficient") {
    PreTradeRisk::Config cfg;
    cfg.min_margin_ratio = 0.05;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    // available_margin = 10000, required_margin = 9600
    // 9600 > 10000 * 0.95 = 9500 → rejected
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 96000.0, 10, 100000.0, 10000.0, 0.0, 0.0);
    CHECK_FALSE(result.approved);
    CHECK(result.rejection_code == 7);
}

TEST_CASE("PreTradeRisk: margin check at exactly threshold passes") {
    PreTradeRisk::Config cfg;
    cfg.min_margin_ratio = 0.05;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    // available_margin = 10000, required_margin = 9500
    // 9500 > 10000 * 0.95 = 9500 → false (not strictly greater), so approved
    auto result = risk.check("BTCUSDT", "BUY", 1.0, 95000.0, 10, 100000.0, 10000.0, 0.0, 0.0);
    CHECK(result.approved);
}

// ═══════════════════════════════════════════════════════════════════════════
// PreTradeRisk — blacklist/whitelist management
// ═══════════════════════════════════════════════════════════════════════════
TEST_CASE("PreTradeRisk: dynamic blacklist add/remove") {
    PreTradeRisk::Config cfg;
    cfg.order_burst_size = 100.0;
    PreTradeRisk risk(cfg);
    // Initially allowed
    auto r1 = risk.check("ETHUSDT", "BUY", 1.0, 3000.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    CHECK(r1.approved);
    // Blacklist
    risk.blacklist("ETHUSDT");
    auto r2 = risk.check("ETHUSDT", "BUY", 1.0, 3000.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    CHECK_FALSE(r2.approved);
    // Unblacklist
    risk.unblacklist("ETHUSDT");
    auto r3 = risk.check("ETHUSDT", "BUY", 1.0, 3000.0, 1, 100000.0, 50000.0, 0.0, 0.0);
    CHECK(r3.approved);
}

TEST_CASE("PreTradeRisk: daily_pnl getter returns stored value") {
    PreTradeRisk::Config cfg;
    PreTradeRisk         risk(cfg);
    risk.update_daily_pnl(1500.0);
    CHECK(risk.daily_pnl() == doctest::Approx(1500.0));
}
