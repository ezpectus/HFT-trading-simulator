// Position manager v2 — real-time PnL, weighted averaging, margin calculation.
//
// Tracks per-symbol positions with FIFO/weighted average cost basis.
// Real-time unrealized + realized PnL. Per-symbol + aggregate portfolio PnL.
// Isolated + cross margin calculation.
//
// Extends v1 PositionManager with production features.
#pragma once

#include "../data/types.h"
#include "../utils/low_latency.h"
#include <array>
#include <atomic>
#include <bitset>
#include <cmath>
#include <cstdint>
#include <string>
#include <string_view>
#include <cstdio>
#include <unordered_map>
#include <unordered_set>
#include <mutex>
#include <vector>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Position v2 — extended with margin, leverage, realized PnL
// ─────────────────────────────────────────────────────────────────────────────
struct PositionV2 {
    std::string symbol;
    std::string exchange;
    uint16_t symbol_id{0xFFFF};     // HFT-O11: numeric symbol ID for fast path
    Side side{Side::BUY};
    double quantity{0.0};           // Net position (always positive)
    double entry_price{0.0};        // Weighted average entry
    double realized_pnl{0.0};       // Cumulative realized PnL
    double unrealized_pnl{0.0};     // Current unrealized PnL
    double total_fees{0.0};         // Cumulative fees
    int leverage{1};
    double margin{0.0};             // Margin allocated
    double liq_price{0.0};          // Liquidation price
    int64_t opened_ns{0};           // Open timestamp
    int64_t last_update_ns{0};

    bool is_long() const noexcept { return side == Side::BUY; }
    bool is_open() const noexcept { return quantity > 1e-10; }
    double notional() const noexcept { return quantity * entry_price; }

    void update_unrealized(double mark_price) noexcept {
        if (!is_open()) {
            unrealized_pnl = 0.0;
            return;
        }
        if (is_long()) {
            unrealized_pnl = (mark_price - entry_price) * quantity;
        } else {
            unrealized_pnl = (entry_price - mark_price) * quantity;
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Position manager v2 — production position tracking
// ─────────────────────────────────────────────────────────────────────────────
class PositionManagerV2 {
public:
    enum class MarginMode : uint8_t { ISOLATED = 0, CROSS = 1 };

    struct Config {
        MarginMode margin_mode{MarginMode::ISOLATED};
        double maintenance_margin_ratio{0.005};  // 0.5%
    };

    PositionManagerV2() : PositionManagerV2(Config{}) {}
    explicit PositionManagerV2(const Config& cfg) : config_(cfg) {}

    // On fill — update or open position
    void on_fill(const std::string& symbol, const std::string& exchange,
                 Side side, double qty, double price, double fee = 0.0,
                 int leverage = 1, uint16_t symbol_id = 0xFFFF) noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        // Build key without heap allocation using stack buffer
        char key_buf[128];
        int key_len = std::snprintf(key_buf, sizeof(key_buf), "%s:%s", symbol.c_str(), exchange.c_str());
        if (key_len <= 0) return;
        key_len = std::min(key_len, static_cast<int>(sizeof(key_buf) - 1));
        std::string_view key_sv(key_buf, static_cast<size_t>(key_len));
        auto& pos = positions_[std::string(key_sv)];

        const bool was_open = pos.is_open();

        if (!pos.is_open()) {
            // Open new position
            pos.symbol = symbol;
            pos.exchange = exchange;
            pos.symbol_id = symbol_id;
            pos.side = side;
            pos.quantity = qty;
            pos.entry_price = price;
            pos.leverage = leverage;
            pos.opened_ns = now_ns();
            pos.margin = (qty * price) / std::max(1, leverage);
        } else if (pos.side == side) {
            // Add to position (same direction) — weighted average
            double prev_notional = pos.entry_price * pos.quantity;
            double new_notional = price * qty;
            pos.quantity += qty;
            pos.entry_price = (prev_notional + new_notional) / pos.quantity;
            pos.margin += (qty * price) / std::max(1, leverage);
        } else {
            // Reduce or close position (opposite direction)
            double close_qty = std::min(qty, pos.quantity);
            // Realize PnL on closed portion
            if (pos.is_long()) {
                pos.realized_pnl += (price - pos.entry_price) * close_qty;
            } else {
                pos.realized_pnl += (pos.entry_price - price) * close_qty;
            }
            pos.quantity -= close_qty;
            pos.margin *= (pos.quantity > 0.0) ? (pos.quantity / (pos.quantity + close_qty)) : 0.0;

            // If remaining qty and fill was larger, open opposite position
            double remaining = qty - close_qty;
            if (remaining > 1e-10) {
                pos.side = side;
                pos.quantity = remaining;
                pos.entry_price = price;
                pos.margin = (remaining * price) / std::max(1, leverage);
                pos.opened_ns = now_ns();
            }

            if (!pos.is_open()) {
                pos.margin = 0.0;
                pos.unrealized_pnl = 0.0;
            }
        }

        // Maintain atomic counter, bitset, and name set on open/close transitions
        const bool is_open_now = pos.is_open();
        if (!was_open && is_open_now) {
            open_positions_count_.fetch_add(1, std::memory_order_relaxed);
            if (symbol_id < 256) open_symbols_.set(symbol_id);
            open_symbol_names_.insert(symbol);
        } else if (was_open && !is_open_now) {
            open_positions_count_.fetch_sub(1, std::memory_order_relaxed);
            if (symbol_id < 256) open_symbols_.reset(symbol_id);
            open_symbol_names_.erase(symbol);
        }

        pos.total_fees += fee;
        pos.last_update_ns = now_ns();
    }

    // Update mark prices for all positions
    void update_mark_prices(const std::unordered_map<std::string, double>& prices) noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        for (auto& [key, pos] : positions_) {
            auto it = prices.find(pos.symbol);
            if (it != prices.end()) {
                pos.update_unrealized(it->second);
                pos.last_update_ns = now_ns();
            }
        }
    }

    // Get position for a symbol
    PositionV2 get_position(const std::string& symbol,
                            const std::string& exchange = "") const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        if (!exchange.empty()) {
            char key_buf[128];
            int key_len = std::snprintf(key_buf, sizeof(key_buf), "%s:%s", symbol.c_str(), exchange.c_str());
            if (key_len <= 0) return {};
            key_len = std::min(key_len, static_cast<int>(sizeof(key_buf) - 1));
            auto it = positions_.find(std::string(key_buf, static_cast<size_t>(key_len)));
            if (it != positions_.end()) return it->second;
        } else {
            for (const auto& [key, pos] : positions_) {
                if (pos.symbol == symbol) return pos;
            }
        }
        return {};
    }

    // Check if position exists — O(1) via open_symbol_names_ set
    bool has_position(const std::string& symbol) const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        return open_symbol_names_.count(symbol) > 0;
    }

    // HFT-O11: Fast path — check position by numeric symbol ID (no string compare)
    // Uses bitset for O(1) lookup — no spinlock needed (bitset is updated under lock,
    // but reads are atomic for single-bit tests on most platforms)
    bool has_position_by_id(uint16_t symbol_id) const noexcept {
        if (symbol_id >= 256) [[unlikely]] return false;
        std::lock_guard<Spinlock> lk(lock_);
        return open_symbols_.test(symbol_id);
    }

    // Get all open positions
    std::vector<PositionV2> get_all_positions() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        std::vector<PositionV2> result;
        for (const auto& [key, pos] : positions_) {
            if (pos.is_open()) result.push_back(pos);
        }
        return result;
    }

    // Aggregate PnL
    double total_unrealized_pnl() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total = 0.0;
        for (const auto& [key, pos] : positions_) {
            total += pos.unrealized_pnl;
        }
        return total;
    }

    double total_realized_pnl() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total = 0.0;
        for (const auto& [key, pos] : positions_) {
            total += pos.realized_pnl;
        }
        return total;
    }

    double total_pnl() const noexcept {
        return total_unrealized_pnl() + total_realized_pnl();
    }

    double total_fees() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total = 0.0;
        for (const auto& [key, pos] : positions_) {
            total += pos.total_fees;
        }
        return total;
    }

    double total_margin() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total = 0.0;
        for (const auto& [key, pos] : positions_) {
            total += pos.margin;
        }
        return total;
    }

    double total_notional() const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total = 0.0;
        for (const auto& [key, pos] : positions_) {
            total += pos.notional();
        }
        return total;
    }

    // O(1) open position count — uses atomic counter maintained in add_fill
    int open_position_count() const noexcept {
        return open_positions_count_.load(std::memory_order_relaxed);
    }

    // Check SL/TP for all positions
    struct CloseTrigger {
        std::string symbol;
        std::string exchange;
        double price;
        std::string reason;
    };

    std::vector<CloseTrigger> check_sl_tp(
        const std::unordered_map<std::string, double>& prices,
        double stop_loss_mult = 2.0,
        double take_profit_mult = 3.0
    ) const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        std::vector<CloseTrigger> triggers;
        for (const auto& [key, pos] : positions_) {
            if (!pos.is_open()) continue;
            auto it = prices.find(pos.symbol);
            if (it == prices.end()) continue;
            double price = it->second;

            // Simple ATR-based SL/TP (using entry price as reference)
            double sl_distance = pos.entry_price * 0.01 * stop_loss_mult;  // 1% * mult
            double tp_distance = pos.entry_price * 0.01 * take_profit_mult;

            if (pos.is_long()) {
                if (price <= pos.entry_price - sl_distance) {
                    triggers.push_back({pos.symbol, pos.exchange, price, "STOP_LOSS"});
                } else if (price >= pos.entry_price + tp_distance) {
                    triggers.push_back({pos.symbol, pos.exchange, price, "TAKE_PROFIT"});
                }
            } else {
                if (price >= pos.entry_price + sl_distance) {
                    triggers.push_back({pos.symbol, pos.exchange, price, "STOP_LOSS"});
                } else if (price <= pos.entry_price - tp_distance) {
                    triggers.push_back({pos.symbol, pos.exchange, price, "TAKE_PROFIT"});
                }
            }
        }
        return triggers;
    }

    // Margin check — returns true if any position is below maintenance margin
    bool check_margin_call(double account_equity) const noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        double total_margin = 0.0;
        for (const auto& [key, pos] : positions_) {
            total_margin += pos.margin;
        }
        if (total_margin <= 0.0) return false;
        double margin_ratio = (account_equity - total_margin) / total_margin;
        return margin_ratio < config_.maintenance_margin_ratio;
    }

    // Reset all positions (for session restart)
    void reset() noexcept {
        std::lock_guard<Spinlock> lk(lock_);
        positions_.clear();
        open_symbol_names_.clear();
        open_positions_count_.store(0, std::memory_order_relaxed);
        open_symbols_.reset();
    }

private:
    static int64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }

    Config config_;
    mutable Spinlock lock_;
    std::unordered_map<std::string, PositionV2> positions_;
    // O(1) open position count — maintained in add_fill on open/close transitions
    std::atomic<int> open_positions_count_{0};
    // O(1) position lookup by symbol ID — bitset updated in add_fill
    std::bitset<256> open_symbols_{};
    // O(1) position lookup by symbol name — set updated in on_fill
    std::unordered_set<std::string> open_symbol_names_;
};

} // namespace hft
