// Signal — trading signal received from AI Signal Bot
#pragma once

#include "types.h"
#include <string>

namespace hft {

struct Signal {
    std::string symbol;
    std::string direction;  // "LONG", "SHORT", "NEUTRAL"
    double confidence{};
    std::string strategy;
    double entry_price{};
    double stop_loss{};
    double take_profit{};
    uint8_t leverage{1};
    std::string reason;
    int64_t timestamp{};

    bool is_long() const { return direction == "LONG"; }
    bool is_short() const { return direction == "SHORT"; }
    bool is_actionable() const { return direction != "NEUTRAL"; }

    Side side() const {
        if (is_long()) return Side::BUY;
        if (is_short()) return Side::SELL;
        return Side::BUY;  // NEUTRAL defaults to BUY; caller should check is_actionable() first
    }

    double rr_ratio() const {
        if (is_long()) {
            double risk = entry_price - stop_loss;
            double reward = take_profit - entry_price;
            return risk > 0 ? reward / risk : 0.0;
        } else if (is_short()) {
            double risk = stop_loss - entry_price;
            double reward = entry_price - take_profit;
            return risk > 0 ? reward / risk : 0.0;
        }
        return 0.0;
    }
};

} // namespace hft
