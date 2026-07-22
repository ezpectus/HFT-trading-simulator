// Data structures — Candle, Order, Position, Signal
// Core types used across the HFT trade bot.
#pragma once

#include <cstdint>
#include <ctime>
#include <optional>
#include <string>
#include <vector>

namespace hft {

enum class Side { BUY, SELL };
enum class OrderType { MARKET, LIMIT };
enum class OrderStatus { PENDING, PARTIAL, FILLED, REJECTED, CANCELLED };

inline std::string side_to_string(Side s) {
    return s == Side::BUY ? "BUY" : "SELL";
}

inline Side string_to_side(const std::string& s) {
    return s == "BUY" ? Side::BUY : Side::SELL;
}

struct Candle {
    int64_t     timestamp{};
    double      open{};
    double      high{};
    double      low{};
    double      close{};
    double      volume{};
    std::string symbol;
    std::string exchange;
};

struct OrderBookLevel {
    double price{};
    double quantity{};
};

struct OrderBook {
    std::string                 symbol;
    std::string                 exchange;
    std::vector<OrderBookLevel> bids;
    std::vector<OrderBookLevel> asks;
    int64_t                     timestamp{};

    double best_bid() const { return bids.empty() ? 0.0 : bids[0].price; }
    double best_ask() const { return asks.empty() ? 0.0 : asks[0].price; }
    double spread() const { return best_ask() - best_bid(); }
    double mid_price() const { return (best_bid() + best_ask()) / 2.0; }
};

struct Order {
    std::string           id;
    std::string           symbol;
    std::string           exchange;
    Side                  side{Side::BUY};
    OrderType             type{OrderType::MARKET};
    double                quantity{};
    std::optional<double> price; // nullopt for market orders
    OrderStatus           status{OrderStatus::PENDING};
    double                filled_price{};
    double                filled_quantity{};
    double                fee{};
    int64_t timestamp{static_cast<int64_t>(std::time(nullptr) * 1000)}; // milliseconds
};

struct Position {
    std::string symbol;
    std::string exchange;
    Side        side{Side::BUY};
    double      quantity{};
    double      entry_price{};
    double      stop_loss{};
    double      take_profit{};
    int64_t     opened_at{static_cast<int64_t>(std::time(nullptr) * 1000)}; // milliseconds
    double      unrealized_pnl{};
    double      fees_paid{};    // cumulative fees paid
    double      funding_paid{}; // cumulative funding paid

    bool is_long() const { return side == Side::BUY; }

    void update_pnl(double current_price) {
        unrealized_pnl = is_long() ? (current_price - entry_price) * quantity
                                   : (entry_price - current_price) * quantity;
        unrealized_pnl -= fees_paid + funding_paid;
    }
};

} // namespace hft
