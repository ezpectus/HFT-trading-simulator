// Position manager — tracks open positions and PnL
#pragma once

#include "../data/signal.h"
#include "../data/types.h"
#include <chrono>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace hft {

class PositionManager {
  public:
    // ── Order-level tracking (S179) ─────────────────────────────────────────
    // Positions are booked only when the exchange reports FILLED — a send
    // ack is not a position. Resting LIMITs sit in pending_orders_ until
    // their fill (or rejection/cancel) arrives.
    struct PendingOrder {
        std::string symbol;
        Side        side{Side::BUY};
        double      quantity{};
        double      stop_loss{};
        double      take_profit{};
        std::string exchange;
    };

    enum class FillEffect { NONE, OPENED, INCREASED, REDUCED, CLOSED };
    struct FillResult {
        FillEffect effect{FillEffect::NONE};
        double     realized_pnl{0.0};
        double     notional{0.0};
    };

    // Register an order just handed to the exchange. Symbols with a pending
    // order count as engaged in has_position() so the strategy loops don't
    // stack repeated orders while a LIMIT rests.
    void add_pending_order(const Signal& signal, double quantity, const std::string& exchange) {
        if (!signal.is_actionable()) return;
        std::lock_guard<std::mutex> lock(mutex_);
        PendingOrder                po;
        po.symbol                      = signal.symbol;
        po.side                        = signal.side();
        po.quantity                    = quantity;
        po.stop_loss                   = signal.stop_loss;
        po.take_profit                 = signal.take_profit;
        po.exchange                    = exchange;
        pending_orders_[signal.symbol] = po;
        active_symbols_.insert(signal.symbol);
    }

    // Order ended without a fill (cancelled/rejected) — release the symbol.
    void cancel_pending(const std::string& symbol) {
        std::lock_guard<std::mutex> lock(mutex_);
        cancel_pending_locked(symbol);
    }

    void clear_pending_orders() {
        std::lock_guard<std::mutex> lock(mutex_);
        for (const auto& [sym, po] : pending_orders_) {
            if (!has_position_locked(sym)) active_symbols_.erase(sym);
        }
        pending_orders_.clear();
    }

    // Signed position quantity for pre-trade checks (+long / -short / 0 flat).
    double position_qty(const std::string& symbol) const {
        std::lock_guard<std::mutex> lock(mutex_);
        for (const auto& pos : positions_) {
            if (pos.symbol == symbol) return pos.is_long() ? pos.quantity : -pos.quantity;
        }
        return 0.0;
    }

    // Apply an exchange fill/ack to the local book — the exchange is the
    // source of truth. Returns what changed so callers can feed risk trackers.
    FillResult apply_fill(const std::string& symbol, const std::string& side, double filled_qty,
                          double price, double fee, const std::string& status) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (status == "PENDING") return {}; // resting-order ack — still pending
        if (status != "FILLED") {           // REJECTED / CANCELLED
            cancel_pending_locked(symbol);
            closing_since_.erase(symbol); // failed close — let SL/TP retrigger
            return {};
        }
        if (filled_qty <= 0.0 || price <= 0.0) return {};

        const bool buy = (side == "BUY");
        FillResult res;
        res.notional = filled_qty * price;

        for (auto it = positions_.begin(); it != positions_.end(); ++it) {
            if (it->symbol != symbol) continue;
            if (it->is_long() == buy) {
                // Same direction — scale in with a weighted-average entry.
                double total_qty = it->quantity + filled_qty;
                it->entry_price = (it->entry_price * it->quantity + price * filled_qty) / total_qty;
                it->quantity    = total_qty;
                it->fees_paid += fee;
                it->update_pnl(price);
                res.effect = FillEffect::INCREASED;
            } else if (filled_qty + 1e-12 < it->quantity) {
                // Opposite direction, partial — realize the closed slice.
                double pnl =
                    (it->is_long() ? (price - it->entry_price) : (it->entry_price - price)) *
                        filled_qty -
                    fee;
                it->quantity -= filled_qty;
                it->fees_paid += fee;
                it->update_pnl(price);
                closing_since_.erase(symbol);
                realized_pnl_total_ += pnl;
                res.effect       = FillEffect::REDUCED;
                res.realized_pnl = pnl;
            } else {
                // Opposite direction, full — close the position.
                it->fees_paid += fee;
                it->update_pnl(price);
                closing_since_.erase(symbol);
                realized_pnl_total_ += it->unrealized_pnl;
                res.realized_pnl = it->unrealized_pnl;
                res.effect       = FillEffect::CLOSED;
                positions_.erase(it);
                if (pending_orders_.find(symbol) == pending_orders_.end()) {
                    active_symbols_.erase(symbol);
                }
            }
            pending_orders_.erase(symbol);
            return res;
        }

        // No position — fill for one of our pending orders.
        auto p = pending_orders_.find(symbol);
        if (p != pending_orders_.end()) {
            Position pos;
            pos.symbol      = symbol;
            pos.exchange    = p->second.exchange;
            pos.side        = buy ? Side::BUY : Side::SELL;
            pos.quantity    = filled_qty;
            pos.entry_price = price;
            pos.stop_loss   = p->second.stop_loss;
            pos.take_profit = p->second.take_profit;
            pos.fees_paid   = fee;
            pos.update_pnl(price);
            positions_.push_back(std::move(pos));
            pending_orders_.erase(p);
            res.effect = FillEffect::OPENED;
            return res;
        }
        // Stray fill with no position and no pending order — e.g. a manual
        // exchange-side trade or a duplicated fill message. Nothing to do.
        return {};
    }

    // Reconcile against the exchange account broadcast: adopt positions the
    // exchange reports but we don't track (e.g. opened while disconnected)
    // and refresh qty/entry on tracked ones. Never removes — fills own removals.
    void sync_position(const std::string& symbol, bool is_long, double qty, double entry_price,
                       double stop_loss, double take_profit, const std::string& exchange) {
        if (qty <= 0.0 || symbol.empty()) return;
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& pos : positions_) {
            if (pos.symbol == symbol) {
                pos.quantity    = qty;
                pos.entry_price = entry_price;
                return;
            }
        }
        if (pending_orders_.count(symbol)) return; // our order in flight — fill will book it
        Position pos;
        pos.symbol      = symbol;
        pos.exchange    = exchange;
        pos.side        = is_long ? Side::BUY : Side::SELL;
        pos.quantity    = qty;
        pos.entry_price = entry_price;
        pos.stop_loss   = stop_loss;
        pos.take_profit = take_profit;
        positions_.push_back(std::move(pos));
        active_symbols_.insert(symbol);
    }

    std::optional<Position> close_position(const std::string& symbol, double exit_price) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto it = positions_.begin(); it != positions_.end(); ++it) {
            if (it->symbol == symbol) {
                Position pos = *it;
                pos.update_pnl(exit_price);
                realized_pnl_total_ += pos.unrealized_pnl;
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

    // Engaged symbols = open positions + in-flight pending orders — a resting
    // LIMIT still commits a slot for the max-open-positions gate.
    int position_count() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return static_cast<int>(active_symbols_.size());
    }

    bool has_position(const std::string& symbol) const {
        std::lock_guard<std::mutex> lock(mutex_);
        return active_symbols_.count(symbol) > 0;
    }

    // Check SL/TP for all positions
    struct CloseTrigger {
        std::string symbol;
        double      price;
        std::string reason; // "STOP_LOSS" or "TAKE_PROFIT"
    };

    std::vector<CloseTrigger> check_sl_tp(const std::unordered_map<std::string, double>& prices) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<CloseTrigger>   triggers;
        for (const auto& pos : positions_) {
            auto it = prices.find(pos.symbol);
            if (it == prices.end()) continue;
            double price = it->second;

            // Close order already in flight — don't refire. A stale mark
            // (close never filled) expires and re-triggers (S248).
            auto cm = closing_since_.find(pos.symbol);
            if (cm != closing_since_.end() &&
                std::chrono::steady_clock::now() - cm->second < CLOSE_RETRY) {
                continue;
            }

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

    // Mark a close order as sent for this symbol — the position stays on the
    // book until the real fill arrives and books PnL/fee at the actual price
    // (S248). check_sl_tp suppresses re-triggers until the mark goes stale.
    void mark_closing(const std::string& symbol) {
        std::lock_guard<std::mutex> lock(mutex_);
        closing_since_[symbol] = std::chrono::steady_clock::now();
    }

    double total_unrealized_pnl() const {
        std::lock_guard<std::mutex> lock(mutex_);
        double                      total = 0.0;
        for (const auto& pos : positions_) {
            total += pos.unrealized_pnl;
        }
        return total;
    }

    double total_realized_pnl() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return realized_pnl_total_;
    }

  private:
    bool has_position_locked(const std::string& symbol) const {
        for (const auto& pos : positions_) {
            if (pos.symbol == symbol) return true;
        }
        return false;
    }
    void cancel_pending_locked(const std::string& symbol) {
        pending_orders_.erase(symbol);
        if (!has_position_locked(symbol)) active_symbols_.erase(symbol);
    }

    mutable std::mutex                            mutex_;
    double                                        realized_pnl_total_{0.0};
    std::vector<Position>                         positions_;
    std::unordered_set<std::string>               active_symbols_;
    std::unordered_map<std::string, PendingOrder> pending_orders_;
    // symbol → when its close order was sent (steady clock, for staleness)
    std::unordered_map<std::string, std::chrono::steady_clock::time_point> closing_since_;
    static constexpr std::chrono::seconds                                  CLOSE_RETRY{10};
};

} // namespace hft
