// Order lifecycle management — state machine, ID generation, timeout, fill tracking.
//
// State machine: PENDING → ACK → PARTIAL → FILLED / CANCELED / REJECTED
// Atomic order ID generation. Timeout handling (cancel if no ACK within N ms).
// Cancel-replace support. Partial fill aggregation.
//
// No heap allocations in hot path for order state tracking (fixed-size arrays).
#pragma once

#include "../data/types.h"
#include "../utils/low_latency.h"
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <string>
#include <functional>

namespace hft {

// Extended order status for v2
enum class OrderStateV2 : uint8_t {
    PENDING = 0,    // Sent to exchange, awaiting ACK
    ACK = 1,        // Exchange acknowledged
    PARTIAL = 2,    // Partially filled
    FILLED = 3,     // Fully filled
    CANCELED = 4,   // Canceled
    REJECTED = 5,   // Rejected by exchange
    EXPIRED = 6,    // Time-in-force expired (GTD)
    MODIFY_PENDING = 7,  // Cancel-replace in progress
};

inline const char* order_state_str(OrderStateV2 s) {
    switch (s) {
        case OrderStateV2::PENDING:        return "PENDING";
        case OrderStateV2::ACK:            return "ACK";
        case OrderStateV2::PARTIAL:        return "PARTIAL";
        case OrderStateV2::FILLED:         return "FILLED";
        case OrderStateV2::CANCELED:       return "CANCELED";
        case OrderStateV2::REJECTED:       return "REJECTED";
        case OrderStateV2::EXPIRED:        return "EXPIRED";
        case OrderStateV2::MODIFY_PENDING: return "MODIFY_PENDING";
    }
    return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────────────────────
// Order record — tracks full lifecycle of an order
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) OrderRecord {
    uint64_t order_id{0};
    uint64_t client_order_id{0};
    char symbol[32]{};
    char exchange[32]{};
    Side side{Side::BUY};
    OrderType type{OrderType::MARKET};
    double quantity{0.0};
    double price{0.0};
    double filled_quantity{0.0};
    double avg_fill_price{0.0};
    double fee{0.0};
    OrderStateV2 state{OrderStateV2::PENDING};
    int64_t created_ns{0};
    int64_t ack_ns{0};
    int64_t last_update_ns{0};
    int64_t timeout_ns{0};
    char reject_reason[64]{};
    uint8_t padding_[32]{};
};

static_assert(sizeof(OrderRecord) <= 320, "OrderRecord should be <= 320 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// Order manager — lifecycle, timeout, fill tracking
// ─────────────────────────────────────────────────────────────────────────────
class OrderManager {
public:
    static constexpr size_t MAX_ORDERS = 4096;

    using CancelCallback = std::function<void(uint64_t order_id)>;
    using FillCallback = std::function<void(const OrderRecord&)>;
    using TimeoutCallback = std::function<void(uint64_t order_id)>;

    OrderManager(int64_t default_timeout_ms = 5000)
        : default_timeout_ns_(default_timeout_ms * 1'000'000)
    {}

    // Create a new order. Returns client order ID (0 if table full).
    uint64_t create_order(const std::string& symbol, const std::string& exchange,
                          Side side, OrderType type, double quantity,
                          double price = 0.0, int64_t timeout_ns = 0) noexcept {
        uint64_t slot = find_free_slot();
        if (slot >= MAX_ORDERS) return 0;

        // Clean up stale cid_to_slot_ entry from previous order in this slot
        if (orders_[slot].client_order_id != 0) {
            cid_erase(orders_[slot].client_order_id);
        }

        uint64_t cid = next_client_id_.fetch_add(1, std::memory_order_relaxed);
        OrderRecord& rec = orders_[slot];
        rec.order_id = 0;  // Set on ACK from exchange
        rec.client_order_id = cid;
        std::memset(rec.symbol, 0, sizeof(rec.symbol));
        std::memset(rec.exchange, 0, sizeof(rec.exchange));
        symbol.copy(rec.symbol, sizeof(rec.symbol) - 1);
        exchange.copy(rec.exchange, sizeof(rec.exchange) - 1);
        rec.side = side;
        rec.type = type;
        rec.quantity = quantity;
        rec.price = price;
        rec.filled_quantity = 0.0;
        rec.avg_fill_price = 0.0;
        rec.fee = 0.0;
        rec.state = OrderStateV2::PENDING;
        rec.created_ns = now_ns();
        rec.ack_ns = 0;
        rec.last_update_ns = rec.created_ns;
        rec.timeout_ns = (timeout_ns > 0) ? timeout_ns : default_timeout_ns_;
        rec.reject_reason[0] = '\0';

        cid_insert(cid, slot);
        active_count_.fetch_add(1, std::memory_order_relaxed);

        // Track highest slot used to limit check_timeouts scan range
        size_t prev_max = max_slot_used_.load(std::memory_order_relaxed);
        while (slot > prev_max) {
            if (max_slot_used_.compare_exchange_weak(prev_max, slot,
                    std::memory_order_relaxed, std::memory_order_relaxed)) {
                break;
            }
        }

        return cid;
    }

    // On ACK from exchange
    void on_ack(uint64_t client_order_id, uint64_t exchange_order_id) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        rec.order_id = exchange_order_id;
        rec.state = OrderStateV2::ACK;
        rec.ack_ns = now_ns();
        rec.last_update_ns = rec.ack_ns;
    }

    // On partial fill
    void on_partial_fill(uint64_t client_order_id, double fill_qty,
                         double fill_price, double fee = 0.0) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        // Update weighted average fill price
        double prev_notional = rec.avg_fill_price * rec.filled_quantity;
        double new_notional = fill_price * fill_qty;
        rec.filled_quantity += fill_qty;
        if (rec.filled_quantity > 0) {
            rec.avg_fill_price = (prev_notional + new_notional) / rec.filled_quantity;
        }
        rec.fee += fee;
        rec.state = OrderStateV2::PARTIAL;
        rec.last_update_ns = now_ns();

        // Check if fully filled
        if (rec.filled_quantity >= rec.quantity - 1e-10) {
            rec.state = OrderStateV2::FILLED;
            active_count_.fetch_sub(1, std::memory_order_relaxed);
        }

        // Copy record before callback to prevent race if callback modifies state
        if (fill_cb_) {
            OrderRecord copy = rec;
            fill_cb_(copy);
        }
    }

    // On full fill
    void on_fill(uint64_t client_order_id, double fill_price, double fee = 0.0) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        rec.filled_quantity = rec.quantity;
        rec.avg_fill_price = fill_price;
        rec.fee = fee;
        rec.state = OrderStateV2::FILLED;
        rec.last_update_ns = now_ns();
        active_count_.fetch_sub(1, std::memory_order_relaxed);
        // Copy record before callback to prevent race
        if (fill_cb_) {
            OrderRecord copy = rec;
            fill_cb_(copy);
        }
    }

    // On cancel
    void on_cancel(uint64_t client_order_id, const std::string& reason = "") noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        rec.state = OrderStateV2::CANCELED;
        rec.last_update_ns = now_ns();
        if (!reason.empty()) {
            reason.copy(rec.reject_reason, sizeof(rec.reject_reason) - 1);
        }
        active_count_.fetch_sub(1, std::memory_order_relaxed);
    }

    // On rejection
    void on_reject(uint64_t client_order_id, const std::string& reason) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        rec.state = OrderStateV2::REJECTED;
        rec.last_update_ns = now_ns();
        reason.copy(rec.reject_reason, sizeof(rec.reject_reason) - 1);
        active_count_.fetch_sub(1, std::memory_order_relaxed);
    }

    // On expire (GTD timeout)
    void on_expire(uint64_t client_order_id) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return;
        OrderRecord& rec = orders_[it->slot];
        rec.state = OrderStateV2::EXPIRED;
        rec.last_update_ns = now_ns();
        active_count_.fetch_sub(1, std::memory_order_relaxed);
    }

    // Check for timed-out orders (call periodically)
    void check_timeouts() noexcept {
        int64_t now = now_ns();
        size_t scan_limit = max_slot_used_.load(std::memory_order_relaxed);
        for (size_t i = 0; i <= scan_limit && i < MAX_ORDERS; ++i) {
            OrderRecord& rec = orders_[i];
            if (rec.state == OrderStateV2::PENDING && rec.timeout_ns > 0) {
                if (now - rec.created_ns > rec.timeout_ns) {
                    rec.state = OrderStateV2::EXPIRED;
                    rec.last_update_ns = now;
                    active_count_.fetch_sub(1, std::memory_order_relaxed);
                    if (timeout_cb_) timeout_cb_(rec.client_order_id);
                    if (cancel_cb_) cancel_cb_(rec.client_order_id);
                }
            }
        }
    }

    // Cancel-replace (modify existing order)
    uint64_t modify_order(uint64_t client_order_id, double new_quantity,
                          double new_price) noexcept {
        const auto* it = cid_find(client_order_id);
        if (!it) return 0;
        OrderRecord& rec = orders_[it->slot];
        if (rec.state != OrderStateV2::ACK && rec.state != OrderStateV2::PARTIAL) {
            return 0;
        }
        // Cancel old order first
        if (cancel_cb_) cancel_cb_(rec.client_order_id);
        rec.state = OrderStateV2::MODIFY_PENDING;
        // Create new order with modified params
        return create_order(std::string(rec.symbol), std::string(rec.exchange), rec.side, rec.type,
                           new_quantity, new_price);
    }

    // Getters
    const OrderRecord* get_order(uint64_t client_order_id) const noexcept {
        const SlotEntry* entry = cid_find(client_order_id);
        if (!entry) return nullptr;
        return &orders_[entry->slot];
    }

    int active_count() const noexcept {
        return active_count_.load(std::memory_order_relaxed);
    }

    // Set callbacks
    void set_cancel_callback(CancelCallback cb) { cancel_cb_ = std::move(cb); }
    void set_fill_callback(FillCallback cb) { fill_cb_ = std::move(cb); }
    void set_timeout_callback(TimeoutCallback cb) { timeout_cb_ = std::move(cb); }

private:
    uint64_t find_free_slot() noexcept {
        for (size_t i = 0; i < MAX_ORDERS; ++i) {
            if (orders_[i].state == OrderStateV2::FILLED ||
                orders_[i].state == OrderStateV2::CANCELED ||
                orders_[i].state == OrderStateV2::REJECTED ||
                orders_[i].state == OrderStateV2::EXPIRED ||
                orders_[i].client_order_id == 0) {
                return i;
            }
        }
        return MAX_ORDERS;
    }

    static int64_t now_ns() noexcept {
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }

    alignas(64) std::array<OrderRecord, MAX_ORDERS> orders_{};

    // Flat hash map for cid→slot lookup — no heap allocations
    // Uses linear probing with power-of-2 capacity
    static constexpr size_t CID_MAP_CAPACITY = 8192;  // 2x MAX_ORDERS for low load factor
    static constexpr size_t CID_MAP_MASK = CID_MAP_CAPACITY - 1;
    struct alignas(16) SlotEntry {
        uint64_t cid{0};   // 0 = empty
        uint64_t slot{0};
    };
    std::array<SlotEntry, CID_MAP_CAPACITY> cid_to_slot_{};

    // Inline find/insert/erase for flat hash map
    const SlotEntry* cid_find(uint64_t cid) const noexcept {
        if (cid == 0) return nullptr;
        size_t idx = (cid * 0x9E3779B97F4A7C15ULL) & CID_MAP_MASK;
        for (size_t i = 0; i < CID_MAP_CAPACITY; ++i) {
            const auto& e = cid_to_slot_[idx];
            if (e.cid == 0) return nullptr;
            if (e.cid == cid) return &e;
            idx = (idx + 1) & CID_MAP_MASK;
        }
        return nullptr;
    }
    void cid_insert(uint64_t cid, uint64_t slot) noexcept {
        if (cid == 0) return;
        size_t idx = (cid * 0x9E3779B97F4A7C15ULL) & CID_MAP_MASK;
        for (size_t i = 0; i < CID_MAP_CAPACITY; ++i) {
            auto& e = cid_to_slot_[idx];
            if (e.cid == 0) {
                e.cid = cid;
                e.slot = slot;
                return;
            }
            idx = (idx + 1) & CID_MAP_MASK;
        }
    }
    void cid_erase(uint64_t cid) noexcept {
        if (cid == 0) return;
        size_t idx = (cid * 0x9E3779B97F4A7C15ULL) & CID_MAP_MASK;
        for (size_t i = 0; i < CID_MAP_CAPACITY; ++i) {
            auto& e = cid_to_slot_[idx];
            if (e.cid == 0) return;
            if (e.cid == cid) {
                e.cid = 0;
                e.slot = 0;
                // Re-insert subsequent entries to maintain probing chain
                size_t next = (idx + 1) & CID_MAP_MASK;
                while (cid_to_slot_[next].cid != 0) {
                    SlotEntry tmp = cid_to_slot_[next];
                    cid_to_slot_[next].cid = 0;
                    cid_to_slot_[next].slot = 0;
                    cid_insert(tmp.cid, tmp.slot);
                    next = (next + 1) & CID_MAP_MASK;
                }
                return;
            }
            idx = (idx + 1) & CID_MAP_MASK;
        }
    }

    std::atomic<uint64_t> next_client_id_{1};
    std::atomic<int> active_count_{0};
    std::atomic<size_t> max_slot_used_{0};
    int64_t default_timeout_ns_;

    CancelCallback cancel_cb_;
    FillCallback fill_cb_;
    TimeoutCallback timeout_cb_;
};

} // namespace hft
