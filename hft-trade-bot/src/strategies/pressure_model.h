// Order book pressure model — multi-level OBI, trade flow imbalance,
// toxicity detection, queue position estimation, spread regime, price impact
//
// All calculations inlined, no heap allocations. Operates on OrderBook L2 data.
#pragma once

#include "../data/aligned_types.h"
#include "../data/types.h"
#include <cmath>
#include <algorithm>
#include <cstdint>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// PressureModel — analyzes L2 order book microstructure
// ─────────────────────────────────────────────────────────────────────────────
class PressureModel {
public:
    struct Params {
        int obi_levels_5{5};
        int obi_levels_10{10};
        int obi_levels_20{20};
        double toxic_size_threshold{5.0};   // Multiplier of median level size
        int trade_flow_lookback{20};        // Number of recent trades
        double large_order_percentile{0.9}; // Top 10% = large
    };

    explicit PressureModel(const Params& params = Params{}) : params_(params) {}

    // Main analysis — takes L2 order book + recent trade flow
    // trades: array of {buyer_initiated: bool, quantity: double}
    struct TradeTick {
        bool buyer_initiated;
        double quantity;
    };

    PressureResult analyze(
        const OrderBook& ob,
        const TradeTick* trades, size_t n_trades
    ) noexcept {
        PressureResult result{};

        if (ob.bids.empty() || ob.asks.empty()) [[unlikely]] {
            return result;
        }

        double mid = ob.mid_price();
        if (mid <= 0) [[unlikely]] return result;

        // ── Spread regime ──
        double spread = ob.spread();
        result.spread_bps = spread / mid * 10000.0;
        result.spread_regime =
            result.spread_bps < 1.0 ? PressureResult::SpreadRegime::TIGHT :
            result.spread_bps > 5.0 ? PressureResult::SpreadRegime::WIDE :
            PressureResult::SpreadRegime::NORMAL;

        // ── Multi-level OBI ──
        result.obi_5 = compute_obi(ob, params_.obi_levels_5);
        result.obi_10 = compute_obi(ob, params_.obi_levels_10);
        result.obi_20 = compute_obi(ob, params_.obi_levels_20);

        // Distance-weighted OBI — closer levels have more weight
        result.obi_weighted = compute_weighted_obi(ob, params_.obi_levels_20);

        // ── Trade flow imbalance ──
        result.trade_imbalance = compute_trade_imbalance(trades, n_trades);

        // ── Toxicity detection ──
        result.toxic_score = compute_toxicity(ob, trades, n_trades);

        // ── Microprice deviation ──
        result.microprice_dev = compute_microprice_dev(ob);

        // ── Queue position estimation ──
        result.queue_pos_bid = estimate_queue_position(ob, true);
        result.queue_pos_ask = estimate_queue_position(ob, false);

        // ── Price impact prediction ──
        // impact = obi*2 + trade_imbalance*1.5 + microprice_dev*0.5 (bps)
        result.predicted_impact =
            result.obi_weighted * 2.0 +
            result.trade_imbalance * 1.5 +
            result.microprice_dev * 0.5;

        return result;
    }

    // Convenience: analyze with just order book (no trade flow)
    PressureResult analyze(const OrderBook& ob) noexcept {
        return analyze(ob, nullptr, 0);
    }

    // Get the weighted OBI for use by signal engine
    double get_obi_weighted(const OrderBook& ob) noexcept {
        return compute_weighted_obi(ob, params_.obi_levels_20);
    }

    // Get pressure score for signal engine
    double get_pressure_score(const OrderBook& ob, const TradeTick* trades, size_t n) noexcept {
        double obi = compute_weighted_obi(ob, params_.obi_levels_20);
        double ti = compute_trade_imbalance(trades, n);
        // Combined pressure: OBI + trade flow
        return obi * 0.6 + ti * 0.4;
    }

private:
    // ── OBI at N levels ──
    static inline double compute_obi(const OrderBook& ob, int levels) noexcept {
        double bid_vol = 0.0, ask_vol = 0.0;
        int n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
        for (int i = 0; i < n; ++i) {
            bid_vol += ob.bids[i].quantity;
            ask_vol += ob.asks[i].quantity;
        }
        double total = bid_vol + ask_vol;
        return total > 0 ? (bid_vol - ask_vol) / total : 0.0;
    }

    // ── Distance-weighted OBI — exponential decay by level depth ──
    static inline double compute_weighted_obi(const OrderBook& ob, int levels) noexcept {
        double bid_w = 0.0, ask_w = 0.0;
        double total_w = 0.0;
        int n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
        for (int i = 0; i < n; ++i) {
            // Weight = 1 / (1 + i) — linear decay
            double w = 1.0 / (1.0 + i);
            bid_w += ob.bids[i].quantity * w;
            ask_w += ob.asks[i].quantity * w;
            total_w += w;
        }
        if (total_w == 0) return 0.0;
        double total = bid_w + ask_w;
        return total > 0 ? (bid_w - ask_w) / total : 0.0;
    }

    // ── Trade flow imbalance — buyer vs seller initiated ──
    static inline double compute_trade_imbalance(const TradeTick* trades, size_t n) noexcept {
        if (!trades || n == 0) return 0.0;
        double buy_vol = 0.0, sell_vol = 0.0;
        for (size_t i = 0; i < n; ++i) {
            if (trades[i].buyer_initiated) buy_vol += trades[i].quantity;
            else sell_vol += trades[i].quantity;
        }
        double total = buy_vol + sell_vol;
        return total > 0 ? (buy_vol - sell_vol) / total : 0.0;
    }

    // ── Toxicity detection — large aggressive orders → toxic score [0, 1] ──
    double compute_toxicity(const OrderBook& ob, const TradeTick* trades, size_t n) const noexcept {
        if (!trades || n == 0) return 0.0;

        // Compute median trade size
        if (n < 3) return 0.0;

        // Simple approach: count trades that are > toxic_size_threshold × median
        // and are aggressive (buyer_initiated hitting asks or seller hitting bids)
        double sizes[64];  // Stack-allocated, max 64 trades
        size_t count = std::min(n, static_cast<size_t>(64));
        for (size_t i = 0; i < count; ++i) sizes[i] = trades[i].quantity;

        // Partial sort for median
        std::nth_element(sizes, sizes + count / 2, sizes + count);
        double median = sizes[count / 2];

        if (median <= 0) return 0.0;

        double toxic_threshold = median * params_.toxic_size_threshold;
        int toxic_count = 0;
        int aggressive_count = 0;

        for (size_t i = 0; i < count; ++i) {
            if (trades[i].quantity > toxic_threshold) {
                ++toxic_count;
            }
        }
        aggressive_count = static_cast<int>(count);  // All provided trades are aggressive

        // Toxic score: ratio of toxic trades to total, scaled by size ratio
        double toxic_ratio = static_cast<double>(toxic_count) / static_cast<double>(count);
        double size_ratio = 0.0;
        if (toxic_count > 0) {
            double toxic_vol = 0.0, total_vol = 0.0;
            for (size_t i = 0; i < count; ++i) {
                total_vol += trades[i].quantity;
                if (trades[i].quantity > toxic_threshold) toxic_vol += trades[i].quantity;
            }
            size_ratio = total_vol > 0 ? toxic_vol / total_vol : 0.0;
        }

        // Combined: 0.5 * count_ratio + 0.5 * volume_ratio
        return std::min(1.0, toxic_ratio * 0.5 + size_ratio * 0.5);
    }

    // ── Microprice deviation from mid (bps) ──
    // Microprice = (bid_price * ask_vol + ask_price * bid_vol) / (bid_vol + ask_vol)
    static inline double compute_microprice_dev(const OrderBook& ob) noexcept {
        if (ob.bids.empty() || ob.asks.empty()) return 0.0;
        double bb = ob.bids[0].price;
        double ba = ob.asks[0].price;
        double bv = ob.bids[0].quantity;
        double av = ob.asks[0].quantity;
        double total_vol = bv + av;
        if (total_vol <= 0) return 0.0;

        double microprice = (bb * av + ba * bv) / total_vol;
        double mid = (bb + ba) / 2.0;
        return mid > 0 ? (microprice - mid) / mid * 10000.0 : 0.0;
    }

    // ── Queue position estimation at best bid/ask ──
    // Estimates our position in the queue (0 = front, 1 = back)
    // Based on relative size at best level vs deeper levels
    static inline double estimate_queue_position(const OrderBook& ob, bool is_bid) noexcept {
        if (ob.bids.empty() || ob.asks.empty()) return 1.0;

        double best_size = is_bid ? ob.bids[0].quantity : ob.asks[0].quantity;
        double total_size = 0.0;
        int n = std::min(10, static_cast<int>(is_bid ? ob.bids.size() : ob.asks.size()));
        for (int i = 0; i < n; ++i) {
            total_size += is_bid ? ob.bids[i].quantity : ob.asks[i].quantity;
        }
        if (total_size <= 0) return 1.0;

        // Queue position: ratio of best level to total (higher = more queued ahead)
        double ratio = best_size / total_size;
        // If best level is large relative to total, queue is longer → worse position
        return std::min(1.0, ratio);
    }

    Params params_;
};

} // namespace hft
