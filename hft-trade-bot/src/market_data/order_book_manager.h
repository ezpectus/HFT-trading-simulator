// Full L2 order book manager — incremental updates, snapshot merge, depth tracking.
//
// Maintains sorted bid/ask price levels with O(1) best bid/ask access.
// Incremental updates from WebSocket/SHM deltas. Snapshot recovery on gap.
// Computes mid-price, weighted mid-price, microprice, spread regime.
//
// No heap allocations in hot path: uses fixed-size arrays with alignas(64).
#pragma once

#include "../data/aligned_types.h"
#include "../utils/low_latency.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Price level — sorted by price (bids descending, asks ascending)
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) PriceLevel {
    double   price{0.0};
    double   quantity{0.0};
    uint64_t order_count{0};
    uint8_t  padding_[32]{};
};

static_assert(sizeof(PriceLevel) == 64, "PriceLevel must be 64 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// Spread regime classification
// ─────────────────────────────────────────────────────────────────────────────
enum class SpreadRegime : uint8_t {
    TIGHT   = 0, // < 1 bp
    NORMAL  = 1, // 1-5 bp
    WIDE    = 2, // 5-20 bp
    EXTREME = 3, // > 20 bp
};

inline const char* spread_regime_str(SpreadRegime r) {
    switch (r) {
    case SpreadRegime::TIGHT:
        return "TIGHT";
    case SpreadRegime::NORMAL:
        return "NORMAL";
    case SpreadRegime::WIDE:
        return "WIDE";
    case SpreadRegime::EXTREME:
        return "EXTREME";
    }
    return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────────────────────
// Order book manager — fixed-capacity L2 book
// ─────────────────────────────────────────────────────────────────────────────
template <size_t MaxLevels = 200> class OrderBookManager {
  public:
    static constexpr size_t MAX_LEVELS = MaxLevels;

    OrderBookManager() = default;

    // Clear all levels
    void clear() noexcept {
        bid_count_      = 0;
        ask_count_      = 0;
        last_update_ns_ = 0;
    }

    // ── Incremental updates ──

    // Update or add a bid level. Returns false if book is full and level is new.
    bool update_bid(double price, double quantity, uint64_t order_count = 0) noexcept {
        if (price <= 0.0) return false;
        if (quantity <= 0.0) {
            return remove_bid(price);
        }
        // Find insertion point (bids sorted descending)
        size_t i = 0;
        while (i < bid_count_ && bids_[i].price > price)
            ++i;
        if (i < bid_count_ && bids_[i].price == price) {
            // Update existing
            bids_[i].quantity    = quantity;
            bids_[i].order_count = order_count;
        } else if (bid_count_ < MAX_LEVELS) {
            // Insert new level — shift down
            for (size_t j = bid_count_; j > i; --j) {
                bids_[j] = bids_[j - 1];
            }
            bids_[i].price       = price;
            bids_[i].quantity    = quantity;
            bids_[i].order_count = order_count;
            ++bid_count_;
        } else {
            return false; // Book full
        }
        last_update_ns_ = now_ns();
        return true;
    }

    // Update or add an ask level. Returns false if book is full and level is new.
    bool update_ask(double price, double quantity, uint64_t order_count = 0) noexcept {
        if (price <= 0.0) return false;
        if (quantity <= 0.0) {
            return remove_ask(price);
        }
        // Find insertion point (asks sorted ascending)
        size_t i = 0;
        while (i < ask_count_ && asks_[i].price < price)
            ++i;
        if (i < ask_count_ && asks_[i].price == price) {
            asks_[i].quantity    = quantity;
            asks_[i].order_count = order_count;
        } else if (ask_count_ < MAX_LEVELS) {
            for (size_t j = ask_count_; j > i; --j) {
                asks_[j] = asks_[j - 1];
            }
            asks_[i].price       = price;
            asks_[i].quantity    = quantity;
            asks_[i].order_count = order_count;
            ++ask_count_;
        } else {
            return false;
        }
        last_update_ns_ = now_ns();
        return true;
    }

    // Remove a bid level
    bool remove_bid(double price) noexcept {
        for (size_t i = 0; i < bid_count_; ++i) {
            if (bids_[i].price == price) {
                for (size_t j = i; j < bid_count_ - 1; ++j) {
                    bids_[j] = bids_[j + 1];
                }
                --bid_count_;
                last_update_ns_ = now_ns();
                return true;
            }
        }
        return false;
    }

    // Remove an ask level
    bool remove_ask(double price) noexcept {
        for (size_t i = 0; i < ask_count_; ++i) {
            if (asks_[i].price == price) {
                for (size_t j = i; j < ask_count_ - 1; ++j) {
                    asks_[j] = asks_[j + 1];
                }
                --ask_count_;
                last_update_ns_ = now_ns();
                return true;
            }
        }
        return false;
    }

    // ── Snapshot merge (recover from gap) ──

    // Replace entire book from snapshot
    void set_snapshot(const PriceLevel* bids, size_t bid_n, const PriceLevel* asks,
                      size_t ask_n) noexcept {
        bid_count_ = std::min(bid_n, MAX_LEVELS);
        ask_count_ = std::min(ask_n, MAX_LEVELS);
        std::memcpy(bids_.data(), bids, bid_count_ * sizeof(PriceLevel));
        std::memcpy(asks_.data(), asks, ask_count_ * sizeof(PriceLevel));
        last_update_ns_ = now_ns();
    }

    // ── Accessors ──

    double best_bid() const noexcept { return bid_count_ > 0 ? bids_[0].price : 0.0; }

    double best_ask() const noexcept { return ask_count_ > 0 ? asks_[0].price : 0.0; }

    double best_bid_qty() const noexcept { return bid_count_ > 0 ? bids_[0].quantity : 0.0; }

    double best_ask_qty() const noexcept { return ask_count_ > 0 ? asks_[0].quantity : 0.0; }

    double mid_price() const noexcept {
        double b = best_bid();
        double a = best_ask();
        return (b > 0.0 && a > 0.0) ? (b + a) / 2.0 : 0.0;
    }

    // Weighted mid-price: (bid * ask_qty + ask * bid_qty) / (bid_qty + ask_qty)
    double weighted_mid() const noexcept {
        double b     = best_bid();
        double a     = best_ask();
        double bq    = best_bid_qty();
        double aq    = best_ask_qty();
        double total = bq + aq;
        if (total <= 0.0) return mid_price();
        return (b * aq + a * bq) / total;
    }

    // Microprice: (bid * ask_qty + ask * bid_qty) / (bid_qty + ask_qty)
    // Same as weighted mid — included for naming clarity
    double microprice() const noexcept { return weighted_mid(); }

    double spread() const noexcept { return best_ask() - best_bid(); }

    // Spread in basis points relative to mid
    double spread_bps() const noexcept {
        double m = mid_price();
        if (m <= 0.0) return 0.0;
        return (spread() / m) * 10000.0;
    }

    SpreadRegime spread_regime() const noexcept {
        double bps = spread_bps();
        if (bps < 1.0) return SpreadRegime::TIGHT;
        if (bps < 5.0) return SpreadRegime::NORMAL;
        if (bps < 20.0) return SpreadRegime::WIDE;
        return SpreadRegime::EXTREME;
    }

    // Depth at top N levels (total quantity)
    double bid_depth(size_t levels) const noexcept {
        double total = 0.0;
        size_t n     = std::min(levels, bid_count_);
        for (size_t i = 0; i < n; ++i)
            total += bids_[i].quantity;
        return total;
    }

    double ask_depth(size_t levels) const noexcept {
        double total = 0.0;
        size_t n     = std::min(levels, ask_count_);
        for (size_t i = 0; i < n; ++i)
            total += asks_[i].quantity;
        return total;
    }

    // Order book imbalance at top N levels: (bid_depth - ask_depth) / (bid_depth + ask_depth)
    double obi(size_t levels = 5) const noexcept {
        double bd    = bid_depth(levels);
        double ad    = ask_depth(levels);
        double total = bd + ad;
        if (total <= 0.0) return 0.0;
        return (bd - ad) / total;
    }

    // Get level by index
    const PriceLevel& bid_level(size_t i) const noexcept { return bids_[i]; }
    const PriceLevel& ask_level(size_t i) const noexcept { return asks_[i]; }

    size_t bid_level_count() const noexcept { return bid_count_; }
    size_t ask_level_count() const noexcept { return ask_count_; }

    uint64_t last_update_ns() const noexcept { return last_update_ns_; }

    // Check if book is crossed (best bid >= best ask — invalid state)
    bool is_crossed() const noexcept {
        return bid_count_ > 0 && ask_count_ > 0 && best_bid() >= best_ask();
    }

    // Check if book has locked market (best bid == best ask)
    bool is_locked() const noexcept {
        return bid_count_ > 0 && ask_count_ > 0 && best_bid() == best_ask();
    }

  private:
    static uint64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(tp.time_since_epoch()).count();
    }

    alignas(64) std::array<PriceLevel, MaxLevels> bids_{};
    alignas(64) std::array<PriceLevel, MaxLevels> asks_{};
    size_t   bid_count_{0};
    size_t   ask_count_{0};
    uint64_t last_update_ns_{0};
    uint8_t  padding_[24]{};
};

} // namespace hft
