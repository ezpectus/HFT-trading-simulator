// Mock exchange implementation for testing.
// Provides a simple in-memory exchange simulator for unit/integration tests.
#pragma once

#include "../src/data/aligned_types.h"
#include "../src/monitoring/system_monitor.h"
#include <cassert>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace hft::test {

// ─────────────────────────────────────────────────────────────────────────────
// MockExchange — in-memory exchange for testing
// ─────────────────────────────────────────────────────────────────────────────
class MockExchange {
  public:
    struct Position {
        int    symbol_id{0};
        int    side{0}; // 1=long, -1=short
        double qty{0.0};
        double entry_price{0.0};
    };

    struct Order {
        uint64_t id{0};
        int      symbol_id{0};
        int      side{0};
        double   qty{0.0};
        double   price{0.0};
        int      type{0};   // 0=market, 1=limit
        int      status{0}; // 0=pending, 1=filled, 2=canceled, 3=rejected
        uint64_t timestamp_ns{0};
    };

    MockExchange(double initial_price = 50000.0) : price_(initial_price), next_order_id_(1) {}

    void set_price(double p) noexcept { price_ = p; }

    double get_price() const noexcept { return price_; }

    Order place_order(int symbol_id, int side, double qty, int type = 0, double price = 0.0) {
        Order o;
        o.id           = next_order_id_++;
        o.symbol_id    = symbol_id;
        o.side         = side;
        o.qty          = qty;
        o.price        = (type == 0) ? price_ : price;
        o.type         = type;
        o.status       = 1; // Immediately filled for mock
        o.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
                             std::chrono::steady_clock::now().time_since_epoch())
                             .count();
        orders_.push_back(o);

        // Update position
        update_position(symbol_id, side, qty, o.price);

        return o;
    }

    bool cancel_order(uint64_t order_id) {
        for (auto& o : orders_) {
            if (o.id == order_id && o.status == 0) {
                o.status = 2;
                return true;
            }
        }
        return false;
    }

    const Position& get_position(int symbol_id) const {
        static Position empty;
        auto            it = positions_.find(symbol_id);
        return (it != positions_.end()) ? it->second : empty;
    }

    double get_balance() const noexcept { return balance_; }

    void set_balance(double b) noexcept { balance_ = b; }

    const std::vector<Order>& get_orders() const { return orders_; }

    size_t order_count() const { return orders_.size(); }

    void reset() {
        orders_.clear();
        positions_.clear();
        balance_       = 100000.0;
        next_order_id_ = 1;
        price_         = 50000.0;
    }

  private:
    void update_position(int symbol_id, int side, double qty, double fill_price) {
        auto& pos = positions_[symbol_id];
        if (pos.qty == 0) {
            pos.symbol_id   = symbol_id;
            pos.side        = side;
            pos.qty         = qty;
            pos.entry_price = fill_price;
        } else if (pos.side == side) {
            // Adding to position
            double new_qty  = pos.qty + qty;
            pos.entry_price = (pos.entry_price * pos.qty + fill_price * qty) / new_qty;
            pos.qty         = new_qty;
        } else {
            // Reducing or reversing
            if (qty < pos.qty) {
                pos.qty -= qty;
            } else {
                // Reversed
                double remaining = qty - pos.qty;
                pos.side         = side;
                pos.qty          = remaining;
                pos.entry_price  = fill_price;
            }
        }
    }

    double                            price_;
    double                            balance_{100000.0};
    uint64_t                          next_order_id_;
    std::vector<Order>                orders_;
    std::unordered_map<int, Position> positions_;
};

// ─────────────────────────────────────────────────────────────────────────────
// MockSHMBuffer — in-memory ring buffer for testing without real SHM
// ─────────────────────────────────────────────────────────────────────────────
template <typename T, size_t Capacity> class MockSHMBuffer {
  public:
    bool try_push(const T& item) {
        if (size_ >= Capacity) return false;
        buffer_[tail_] = item;
        tail_          = (tail_ + 1) % Capacity;
        ++size_;
        return true;
    }

    bool try_pop(T& out) {
        if (size_ == 0) return false;
        out   = buffer_[head_];
        head_ = (head_ + 1) % Capacity;
        --size_;
        return true;
    }

    size_t size() const noexcept { return size_; }
    bool   empty() const noexcept { return size_ == 0; }
    bool   full() const noexcept { return size_ >= Capacity; }

    void clear() noexcept { head_ = tail_ = size_ = 0; }

  private:
    T      buffer_[Capacity]{};
    size_t head_{0};
    size_t tail_{0};
    size_t size_{0};
};

} // namespace hft::test
