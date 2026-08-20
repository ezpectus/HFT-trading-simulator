// ═══════════════════════════════════════════════════════════════════════════════
// OBI (Order Book Imbalance) utility functions
//
// Extracted from signal_engine_v2.h for file-size compliance.
// Static functions — no instance state required.
// ═══════════════════════════════════════════════════════════════════════════════
#pragma once

#include "../data/types.h"
#include <algorithm>
#include <cmath>

namespace hft {

struct OBIResult {
    double obi_5, obi_10, obi_weighted;
};

inline double compute_obi_levels(const OrderBook& ob, int levels) noexcept {
    double bid_vol = 0.0, ask_vol = 0.0;
    int    n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
    for (int i = 0; i < n; ++i) {
        bid_vol += ob.bids[i].quantity;
        ask_vol += ob.asks[i].quantity;
    }
    double total = bid_vol + ask_vol;
    return total > 1e-12 ? (bid_vol - ask_vol) / total : 0.0;
}

inline double compute_weighted_obi(const OrderBook& ob, int levels) noexcept {
    double bid_w = 0.0, ask_w = 0.0;
    int    n = std::min(levels, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
    for (int i = 0; i < n; ++i) {
        double w = 1.0 / (1.0 + i);
        bid_w += ob.bids[i].quantity * w;
        ask_w += ob.asks[i].quantity * w;
    }
    double total = bid_w + ask_w;
    return total > 1e-12 ? (bid_w - ask_w) / total : 0.0;
}

inline OBIResult compute_obi_all(const OrderBook& ob, int l5, int l10, int l20) noexcept {
    int    n       = std::min(l20, static_cast<int>(std::min(ob.bids.size(), ob.asks.size())));
    double bid_vol = 0.0, ask_vol = 0.0;
    double bid_w = 0.0, ask_w = 0.0;
    double obi_5 = 0.0, obi_10 = 0.0, obi_w = 0.0;
    for (int i = 0; i < n; ++i) {
        double bq = ob.bids[i].quantity;
        double aq = ob.asks[i].quantity;
        bid_vol += bq;
        ask_vol += aq;
        double w = 1.0 / (1.0 + i);
        bid_w += bq * w;
        ask_w += aq * w;
        if (i == l5 - 1) {
            double t = bid_vol + ask_vol;
            obi_5    = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
        }
        if (i == l10 - 1) {
            double t = bid_vol + ask_vol;
            obi_10   = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
        }
    }
    double tw = bid_w + ask_w;
    obi_w     = tw > 1e-12 ? (bid_w - ask_w) / tw : 0.0;
    if (n < l5) {
        double t = bid_vol + ask_vol;
        double v = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
        obi_5 = obi_10 = v;
    } else if (n < l10) {
        double t = bid_vol + ask_vol;
        obi_10   = t > 1e-12 ? (bid_vol - ask_vol) / t : 0.0;
    }
    return {obi_5, obi_10, obi_w};
}

} // namespace hft
