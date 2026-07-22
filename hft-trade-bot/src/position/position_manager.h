// Position manager — tracks open positions and PnL
#pragma once

#include "../data/types.h"
#include "../data/signal.h"
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <string>
#include <mutex>
#include <optional>

namespace hft {

class PositionManager {
public:
    void open_position(const Signal& signal, double quantity, const std::string& exchange) {
        if (!signal.is_actionable()) return;
        std::lock_guard<std::mutex> lock(mutex_);
        Position pos;
        pos.symbol = signal.symbol;
        pos.exchange = exchange;
        pos.side = signal.side();
        pos.quantity = quantity;
        pos.entry_price = signal.entry_price;
        pos.stop_loss = signal.stop_loss;
        pos.take_profit = signal.take_profit;
        positions_.push_back(std::move(pos));
        active_symbols_.insert(signal.symbol);
    }

    std::optional<Position> close_position(const std::string& symbol, double exit_price) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto it = positions_.begin(); it != positions_.end(); ++it) {
            if (it->symbol == symbol) {
                Position pos = *it;
                pos.update_pnl(exit_price);
                positions_.erase(it);
                active_symbols_.erase(symbol);
                return pos;
            }
        }
        return std::nullopt;
    }

    void update_all_pnl(const std::unordered_map<std::string, double>& prices) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& pos : positions_) {
            auto it = prices.find(pos.symbol);
            if (it != prices.end()) {
                pos.update_pnl(it->second);
            }
        }
    }

    std::vector<Position> get_positions() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return positions_;
    }

    int position_count() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return static_cast<int>(positions_.size());
    }

    bool has_position(const std::string& symbol) const {
        std::lock_guard<std::mutex> lock(mutex_);
        return active_symbols_.count(symbol) > 0;
    }

    // Check SL/TP for all positions
    struct CloseTrigger {
        std::string symbol;
        double price;
        std::string reason;  // "STOP_LOSS" or "TAKE_PROFIT"
    };

    std::vector<CloseTrigger> check_sl_tp(const std::unordered_map<std::string, double>& prices) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<CloseTrigger> triggers;
        for (const auto& pos : positions_) {
            auto it = prices.find(pos.symbol);
            if (it == prices.end()) continue;
            double price = it->second;

            if (pos.is_long()) {
                if (pos.stop_loss > 0 && price <= pos.stop_loss) {
                    triggers.push_back({pos.symbol, price, "STOP_LOSS"});
                } else if (pos.take_profit > 0 && price >= pos.take_profit) {
                    triggers.push_back({pos.symbol, price, "TAKE_PROFIT"});
                }
            } else {
                if (pos.stop_loss > 0 && price >= pos.stop_loss) {
                    triggers.push_back({pos.symbol, price, "STOP_LOSS"});
                } else if (pos.take_profit > 0 && price <= pos.take_profit) {
                    triggers.push_back({pos.symbol, price, "TAKE_PROFIT"});
                }
            }
        }
        return triggers;
    }

    double total_unrealized_pnl() const {
        std::lock_guard<std::mutex> lock(mutex_);
        double total = 0.0;
        for (const auto& pos : positions_) {
            total += pos.unrealized_pnl;
        }
        return total;
    }

private:
    mutable std::mutex mutex_;
    std::vector<Position> positions_;
    std::unordered_set<std::string> active_symbols_;
};

} // namespace hft
