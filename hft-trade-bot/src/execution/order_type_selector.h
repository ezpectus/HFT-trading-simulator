// Order type selector — chooses optimal order type based on market conditions
#pragma once

#include "../data/types.h"
#include "../data/signal.h"
#include <string>

namespace hft {

class OrderTypeSelector {
public:
    // Decide order type based on urgency, spread, and signal confidence
    static OrderType select(const Signal& signal, const OrderBook& ob) {
        double spread_bps = ob.mid_price() > 0
            ? ob.spread() / ob.mid_price() * 10000.0
            : 999.0;

        // High confidence + tight spread = market order (urgent execution)
        if (signal.confidence >= 80 && spread_bps < 5.0) {
            return OrderType::MARKET;
        }

        // Low confidence + wide spread = limit order (better entry)
        if (signal.confidence < 70 || spread_bps > 10.0) {
            return OrderType::LIMIT;
        }

        // Default: market order for fast execution
        return OrderType::MARKET;
    }

    // Calculate limit price (mid - small offset for buys, mid + offset for sells)
    static double limit_price(Side side, const OrderBook& ob, double offset_bps = 1.0) {
        double mid = ob.mid_price();
        double offset = mid * offset_bps / 10000.0;
        return side == Side::BUY ? mid - offset : mid + offset;
    }
};

} // namespace hft
