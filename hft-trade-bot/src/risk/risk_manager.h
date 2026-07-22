// Risk manager — pre-trade risk checks, position limits, and production safety.
//
// V1: Signal-level checks (confidence, R:R, max positions, daily drawdown)
// V2: Production pre-trade checks (exposure, rate throttle, margin, blacklist, leverage)
#pragma once

#include "../data/types.h"
#include "../data/signal.h"
#include "../utils/low_latency.h"
#include <vector>
#include <string>
#include <unordered_set>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <mutex>
#include <cmath>

namespace hft {

class RiskManager {
public:
    struct Params {
        // V1 signal-level params
        double max_risk_per_trade_pct{2.0};
        double max_daily_drawdown_pct{8.0};
        double min_confidence{65.0};
        double min_rr_ratio{1.5};
        double max_position_size_pct{10.0};
        int max_open_positions{3};

        // V2 production params
        double max_position_qty{10.0};       // Max qty per symbol
        double max_total_exposure{100000.0}; // Max total notional (USD)
        double daily_loss_limit{5000.0};     // Max daily loss (USD) — kill switch
        double max_drawdown_pct{0.15};       // 15% max drawdown from peak equity
        int max_orders_per_second{50};       // Order rate throttle
        double min_margin_ratio{0.05};       // 5% minimum margin ratio
        double max_leverage{20};             // Max leverage allowed

        // Symbol blacklist
        std::unordered_set<std::string> blacklisted_symbols;

        // Per-symbol position limits (overrides max_position_qty)
        std::unordered_map<std::string, double> per_symbol_max_qty;
    };

    explicit RiskManager(const Params& params) : params_(params) {}

    struct CheckResult {
        bool passed{false};
        std::string reason;
        int code{0};  // 0=OK, 1=max_position, 2=max_exposure, 3=daily_loss,
                       // 4=rate_limit, 5=margin, 6=blacklisted, 7=max_leverage
    };

    // ─────────────────────────────────────────────────────────────────────────
    // V1: Signal-level check — hot path, called for every signal.
    //
    // Why no mutex? params_ is set once at construction and only modified
    // through blacklist_symbol/unblacklist_symbol (which take the lock).
    // In the hot path, params_ is effectively read-only — the risk check
    // reads params_.min_confidence, params_.min_rr_ratio, etc. which never
    // change during trading. Removing the mutex saves ~25ns per signal.
    //
    // Why [[unlikely]]? In HFT, most signals pass the risk check — the
    // rejection paths are cold. [[unlikely]] tells the compiler to arrange
    // the branch so the success path is fall-through, improving I-cache usage.
    // ─────────────────────────────────────────────────────────────────────────
    CheckResult check_signal(const Signal& signal, double balance, int open_positions) const {
        // Fast path: most signals pass — check cheapest conditions first
        if (signal.confidence < params_.min_confidence) [[unlikely]] {
            return {false, "Confidence below minimum", 0};
        }

        double rr = signal.rr_ratio();
        if (rr < params_.min_rr_ratio) [[unlikely]] {
            return {false, "R:R below minimum", 0};
        }

        if (open_positions >= params_.max_open_positions) [[unlikely]] {
            return {false, "Max positions reached", 1};
        }

        // Daily drawdown check — only if we're in a drawdown
        if (daily_pnl_.load(std::memory_order_relaxed) < 0 && balance > 0) [[unlikely]] {
            double drawdown_pct = std::abs(daily_pnl_.load(std::memory_order_relaxed)) / balance * 100.0;
            if (drawdown_pct >= params_.max_daily_drawdown_pct) [[unlikely]] {
                return {false, "Daily drawdown limit reached", 3};
            }
        }

        return {true, "OK", 0};
    }

    // V2: Production pre-trade check — call before every order submission
    CheckResult check_order(
        const std::string& symbol,
        const std::string& side,
        double quantity,
        double price,
        int leverage,
        double current_equity,
        double available_margin,
        double current_position_qty
    ) {
        std::lock_guard<std::mutex> lk(params_mutex_);
        // 1. Symbol blacklist
        if (params_.blacklisted_symbols.count(symbol)) {
            return {false, "Symbol blacklisted", 6};
        }

        // 2. Max leverage
        if (static_cast<double>(leverage) > params_.max_leverage) {
            return {false, "Leverage exceeds max", 7};
        }

        // 3. Position size limit
        double max_qty = params_.max_position_qty;
        auto it = params_.per_symbol_max_qty.find(symbol);
        if (it != params_.per_symbol_max_qty.end()) {
            max_qty = it->second;
        }

        double new_position_qty = current_position_qty;
        if (side == "BUY") {
            new_position_qty += quantity;
        } else {
            new_position_qty -= quantity;
        }

        if (std::abs(new_position_qty) > max_qty) {
            return {false, "Position size exceeds limit", 1};
        }

        // 4. Total exposure (notional)
        double order_notional = quantity * price;
        double new_exposure = total_exposure_.load(std::memory_order_relaxed) + order_notional;
        if (new_exposure > params_.max_total_exposure) {
            return {false, "Total exposure exceeds limit", 2};
        }

        // 5. Daily loss limit
        if (daily_pnl_.load(std::memory_order_relaxed) < -params_.daily_loss_limit) {
            return {false, "Daily loss limit reached", 3};
        }

        // 6. Max drawdown
        double peak = peak_equity_.load(std::memory_order_relaxed);
        if (peak > 0) {
            double drawdown = 1.0 - (current_equity / peak);
            if (drawdown > params_.max_drawdown_pct) {
                return {false, "Max drawdown exceeded", 3};
            }
        }

        // 7. Order rate throttle (CAS-based to avoid check-then-act race)
        auto now_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
        auto window_start_ns = rate_window_start_ns_.load(std::memory_order_relaxed);
        auto elapsed_ns = now_ns - window_start_ns;
        if (elapsed_ns >= 1'000'000'000) {
            // Try to reset the window — CAS ensures only one thread resets
            if (rate_window_start_ns_.compare_exchange_strong(window_start_ns, now_ns,
                    std::memory_order_acq_rel, std::memory_order_relaxed)) {
                orders_this_second_.store(0, std::memory_order_relaxed);
            }
        }
        if (orders_this_second_.fetch_add(1, std::memory_order_relaxed) >= params_.max_orders_per_second) {
            return {false, "Order rate limit exceeded", 4};
        }

        // 8. Margin check
        double required_margin = order_notional / std::max(1, leverage);
        if (required_margin > available_margin * params_.min_margin_ratio) {
            return {false, "Insufficient margin", 5};
        }

        return {true, "OK", 0};
    }

    double calculate_position_size(const Signal& signal, double balance) const {
        double risk_amount = balance * params_.max_risk_per_trade_pct * 0.01;
        double risk_per_unit = std::abs(signal.entry_price - signal.stop_loss);
        if (risk_per_unit <= 0) return 0.0;

        double qty = risk_amount / risk_per_unit;

        double max_notional = balance * params_.max_position_size_pct * 0.01;
        if (signal.entry_price <= 0) return 0.0;
        double max_qty = max_notional / signal.entry_price;

        return std::min(qty, max_qty);
    }

    // V2: Update position tracking after fill
    void on_fill(const std::string& /*symbol*/, const std::string& /*side*/,
                 double qty, double price, double fee) {
        total_exposure_.fetch_add(qty * price, std::memory_order_relaxed);
        daily_pnl_.fetch_sub(fee, std::memory_order_relaxed);
    }

    // V2: Update PnL (called periodically from mark-to-market)
    void update_pnl(double pnl) { daily_pnl_ += pnl; }

    void update_pnl_v2(double realized_pnl, double unrealized_pnl, double equity) {
        daily_pnl_.store(realized_pnl + unrealized_pnl, std::memory_order_relaxed);
        double peak = peak_equity_.load(std::memory_order_relaxed);
        while (equity > peak) {
            if (peak_equity_.compare_exchange_weak(peak, equity,
                    std::memory_order_relaxed, std::memory_order_relaxed)) {
                break;
            }
        }
    }

    void reset_daily() { daily_pnl_ = 0.0; }

    // V2: Reduce exposure when position is closed
    void reduce_exposure(double notional) {
        total_exposure_.fetch_sub(notional, std::memory_order_relaxed);
    }

    // V2: Symbol blacklist management (thread-safe via params_mutex_)
    void blacklist_symbol(const std::string& symbol) {
        std::lock_guard<std::mutex> lk(params_mutex_);
        params_.blacklisted_symbols.insert(symbol);
    }
    void unblacklist_symbol(const std::string& symbol) {
        std::lock_guard<std::mutex> lk(params_mutex_);
        params_.blacklisted_symbols.erase(symbol);
    }

    // V2: Getters for monitoring
    double total_exposure() const { return total_exposure_.load(std::memory_order_relaxed); }
    double daily_pnl() const { return daily_pnl_.load(std::memory_order_relaxed); }
    double peak_equity() const { return peak_equity_.load(std::memory_order_relaxed); }
    int orders_this_second() const { return orders_this_second_.load(std::memory_order_relaxed); }

    const Params& params() const {
        std::lock_guard<std::mutex> lk(params_mutex_);
        return params_;
    }

private:
    mutable std::mutex params_mutex_;
    Params params_;
    std::atomic<double> daily_pnl_{0.0};
    std::atomic<double> total_exposure_{0.0};
    std::atomic<double> peak_equity_{0.0};
    static_assert(std::atomic<double>::is_always_lock_free,
                  "std::atomic<double> must be lock-free for HFT hot path");
    std::atomic<int> orders_this_second_{0};
    std::atomic<int64_t> rate_window_start_ns_{
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count()
    };
};

} // namespace hft
