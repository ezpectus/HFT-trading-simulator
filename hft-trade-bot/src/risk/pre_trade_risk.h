// Pre-trade risk validation — token bucket rate limiter, position/exposure/loss limits.
//
// All checks are O(1) with atomic counters. Token bucket for rate limiting.
// No heap allocations in hot path.
#pragma once

#include "../utils/low_latency.h"
#include <atomic>
#include <chrono>
#include <cmath>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Token bucket rate limiter — O(1) check, lock-free
// ─────────────────────────────────────────────────────────────────────────────
class TokenBucket {
  public:
    TokenBucket(double rate_per_second, double burst_size)
        : rate_(rate_per_second), burst_(burst_size), tokens_(burst_size),
          last_refill_ns_(std::chrono::duration_cast<std::chrono::nanoseconds>(
                              std::chrono::steady_clock::now().time_since_epoch())
                              .count()) {}

    bool try_acquire() noexcept {
        refill();
        double expected = tokens_.load(std::memory_order_relaxed);
        while (expected >= 1.0) {
            if (tokens_.compare_exchange_weak(expected, expected - 1.0, std::memory_order_relaxed,
                                              std::memory_order_relaxed)) {
                return true;
            }
        }
        return false;
    }

    bool try_acquire_n(double n) noexcept {
        refill();
        double expected = tokens_.load(std::memory_order_relaxed);
        while (expected >= n) {
            if (tokens_.compare_exchange_weak(expected, expected - n, std::memory_order_relaxed,
                                              std::memory_order_relaxed)) {
                return true;
            }
        }
        return false;
    }

    double available_tokens() const noexcept { return tokens_.load(std::memory_order_relaxed); }

    void refill() noexcept {
        auto    now = std::chrono::steady_clock::now();
        int64_t now_ns =
            std::chrono::duration_cast<std::chrono::nanoseconds>(now.time_since_epoch()).count();
        int64_t last = last_refill_ns_.load(std::memory_order_relaxed);
        if (now_ns <= last) return;

        // CAS on last_refill_ns_ ensures only one thread performs the refill
        if (!last_refill_ns_.compare_exchange_strong(last, now_ns, std::memory_order_relaxed,
                                                     std::memory_order_relaxed)) {
            return; // Another thread already refilled
        }

        double elapsed = static_cast<double>(now_ns - last) / 1e9;
        if (elapsed <= 0.0) return;

        double add = elapsed * rate_;

        // CAS loop: atomically update tokens_
        double current = tokens_.load(std::memory_order_relaxed);
        while (true) {
            double new_tokens = std::min(burst_, current + add);
            if (tokens_.compare_exchange_weak(current, new_tokens, std::memory_order_relaxed,
                                              std::memory_order_relaxed)) {
                break;
            }
        }
    }

  private:
    double               rate_;
    double               burst_;
    std::atomic<double>  tokens_;
    std::atomic<int64_t> last_refill_ns_;
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-trade risk — all checks before order submission
// ─────────────────────────────────────────────────────────────────────────────
class PreTradeRisk {
  public:
    struct Config {
        double max_position_per_symbol = 10.0;
        double max_total_notional      = 100000.0;
        double daily_loss_limit        = 5000.0;
        double max_leverage            = 20.0;
        double min_margin_ratio        = 0.05;
        double order_rate_per_second   = 50.0;
        double order_burst_size        = 10.0;

        std::unordered_set<std::string>         blacklist;
        std::unordered_set<std::string>         whitelist; // If non-empty, only these are allowed
        std::unordered_map<std::string, double> per_symbol_max_position;
    };

    struct Result {
        bool        approved{false};
        int         rejection_code{0};
        const char* reason{""};
        // Codes: 0=OK, 1=blacklisted, 2=not_whitelisted, 3=max_position,
        //        4=max_exposure, 5=daily_loss, 6=rate_limit, 7=margin,
        //        8=max_leverage
    };

    explicit PreTradeRisk(const Config& cfg)
        : config_(cfg), rate_limiter_(cfg.order_rate_per_second, cfg.order_burst_size) {}

    // Check if an order is allowed. O(1), lock-free for most checks.
    Result check(const std::string& symbol,
                 const std::string& side, // "BUY" or "SELL"
                 double quantity, double price, int leverage, double current_equity,
                 double available_margin,
                 double current_position_qty, // signed: + long, - short
                 double current_total_exposure) noexcept {
        // 1. Blacklist
        if (config_.blacklist.count(symbol)) {
            return {false, 1, "Symbol blacklisted"};
        }

        // 2. Whitelist (if non-empty)
        if (!config_.whitelist.empty() && !config_.whitelist.count(symbol)) {
            return {false, 2, "Symbol not whitelisted"};
        }

        // 3. Max leverage
        if (static_cast<double>(leverage) > config_.max_leverage) {
            return {false, 8, "Leverage exceeds maximum"};
        }

        // 4. Position size limit
        double max_pos = config_.max_position_per_symbol;
        auto   it      = config_.per_symbol_max_position.find(symbol);
        if (it != config_.per_symbol_max_position.end()) {
            max_pos = it->second;
        }
        double new_pos = current_position_qty;
        if (side == "BUY")
            new_pos += quantity;
        else
            new_pos -= quantity;
        if (std::abs(new_pos) > max_pos) {
            return {false, 3, "Position size exceeds limit"};
        }

        // 5. Total notional exposure
        double order_notional = quantity * price;
        if (current_total_exposure + order_notional > config_.max_total_notional) {
            return {false, 4, "Total exposure exceeds limit"};
        }

        // 6. Daily loss limit
        if (daily_pnl_.load(std::memory_order_relaxed) < -config_.daily_loss_limit) {
            return {false, 5, "Daily loss limit reached"};
        }

        // 7. Rate limit (token bucket)
        if (!rate_limiter_.try_acquire()) {
            return {false, 6, "Order rate limit exceeded"};
        }

        // 8. Margin check (keep min_margin_ratio fraction as buffer)
        double required_margin = order_notional / std::max(1, leverage);
        if (required_margin > available_margin * (1.0 - config_.min_margin_ratio)) {
            return {false, 7, "Insufficient margin"};
        }

        return {true, 0, "OK"};
    }

    // Update daily PnL (called from mark-to-market)
    void update_daily_pnl(double pnl) noexcept { daily_pnl_.store(pnl, std::memory_order_relaxed); }

    // Reset daily counters
    void reset_daily() noexcept { daily_pnl_.store(0.0, std::memory_order_relaxed); }

    // Blacklist/whitelist management
    void blacklist(const std::string& symbol) { config_.blacklist.insert(symbol); }
    void unblacklist(const std::string& symbol) { config_.blacklist.erase(symbol); }
    void whitelist(const std::string& symbol) { config_.whitelist.insert(symbol); }
    void unwhitelist(const std::string& symbol) { config_.whitelist.erase(symbol); }

    double daily_pnl() const noexcept { return daily_pnl_.load(std::memory_order_relaxed); }
    double available_rate_tokens() const noexcept { return rate_limiter_.available_tokens(); }

  private:
    Config              config_;
    TokenBucket         rate_limiter_;
    std::atomic<double> daily_pnl_{0.0};
};

} // namespace hft
