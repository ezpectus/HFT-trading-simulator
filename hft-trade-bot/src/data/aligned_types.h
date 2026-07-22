// Cache-line aligned data structures for hot-path zero false-sharing
//
// All hot-path structs use alignas(64) to prevent false sharing across CPU cores.
// Signal and Order types include padding to fill cache lines.
#pragma once

#include <cstdint>
#include <string>
#include <atomic>
#include <chrono>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// Cache-line aligned order book level — 64 bytes, one per cache line
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) AlignedOrderBookLevel {
    double price{};
    double quantity{};
    uint64_t order_count{};
    uint8_t padding_[32];  // Fill to 64 bytes
};

static_assert(sizeof(AlignedOrderBookLevel) == 64, "AlignedOrderBookLevel must be 64 bytes");

// ─────────────────────────────────────────────────────────────────────────────
// Cache-line aligned fast signal — no std::string, fixed-size buffers
// Designed for SPSC queue transit without heap allocation
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) FastSignal {
    enum class Direction : uint8_t { NEUTRAL = 0, LONG = 1, SHORT = 2 };

    Direction direction{Direction::NEUTRAL};
    uint8_t confidence{0};           // 0-100
    uint8_t leverage{1};
    uint8_t padding1_{0};

    double entry_price{0.0};
    double stop_loss{0.0};
    double take_profit{0.0};

    int64_t timestamp{0};            // nanoseconds since epoch

    char symbol[32]{};               // Fixed-size, no heap alloc (supports up to 31 chars)
    char reason[48]{};               // Short reason string

    // Composite score breakdown
    double ema_score{0.0};           // -1 to +1
    double rsi_score{0.0};           // -1 to +1
    double obi_score{0.0};           // -1 to +1
    double vwap_score{0.0};          // -1 to +1
    double adx_score{0.0};           // 0 to 100
    double pressure_score{0.0};      // -1 to +1
    double composite_score{0.0};     // weighted sum

    uint8_t padding2_[16]{};

    void set_symbol(const char* s) {
        size_t i = 0;
        while (s[i] && i < 15) { symbol[i] = s[i]; ++i; }
        symbol[i] = '\0';
    }

    void set_reason(const char* s) {
        size_t i = 0;
        while (s[i] && i < 47) { reason[i] = s[i]; ++i; }
        reason[i] = '\0';
    }

    const char* dir_str() const {
        switch (direction) {
            case Direction::LONG: return "LONG";
            case Direction::SHORT: return "SHORT";
            default: return "NEUTRAL";
        }
    }

    bool is_actionable() const {
        return direction != Direction::NEUTRAL;
    }

    bool is_long() const { return direction == Direction::LONG; }
    bool is_short() const { return direction == Direction::SHORT; }

    double rr_ratio() const {
        if (direction == Direction::LONG) {
            double risk = entry_price - stop_loss;
            double reward = take_profit - entry_price;
            return risk > 0 ? reward / risk : 0.0;
        } else if (direction == Direction::SHORT) {
            double risk = stop_loss - entry_price;
            double reward = entry_price - take_profit;
            return risk > 0 ? reward / risk : 0.0;
        }
        return 0.0;
    }

    static int64_t now_ns() {
        // Monotonic clock for latency measurements (not epoch time)
        auto tp = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }

    // Epoch nanoseconds for timestamps that need to compare with market data
    static int64_t now_epoch_ns() {
        auto tp = std::chrono::system_clock::now();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(
            tp.time_since_epoch()).count();
    }
};

static_assert(sizeof(FastSignal) <= 256, "FastSignal should fit in 4 cache lines");

// ─────────────────────────────────────────────────────────────────────────────
// Cache-line aligned fast order — for SPSC queue to executor
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) FastOrder {
    enum class OrderKind : uint8_t {
        MARKET, LIMIT_IOC, LIMIT_FOK, LIMIT_GTD, POST_ONLY
    };
    enum class Side : uint8_t { BUY = 0, SELL = 1 };

    Side side{Side::BUY};
    OrderKind kind{OrderKind::MARKET};
    uint8_t leverage{1};
    uint8_t padding1_{0};

    double quantity{0.0};
    double price{0.0};           // 0 for market orders
    double stop_loss{0.0};
    double take_profit{0.0};

    int64_t timestamp{0};
    int64_t expire_at{0};        // For GTD orders (ns since epoch)

    char symbol[32]{};
    char exchange[32]{};
    char client_order_id[32]{};  // Unique ID for idempotency

    uint8_t padding2_[16]{};

    void set_symbol(const char* s) {
        size_t i = 0;
        while (s[i] && i < 31) { symbol[i] = s[i]; ++i; }
        symbol[i] = '\0';
    }

    void set_exchange(const char* s) {
        size_t i = 0;
        while (s[i] && i < 31) { exchange[i] = s[i]; ++i; }
        exchange[i] = '\0';
    }

    void set_client_order_id(const char* s) {
        size_t i = 0;
        while (s[i] && i < 31) { client_order_id[i] = s[i]; ++i; }
        client_order_id[i] = '\0';
    }

    const char* side_str() const { return side == Side::BUY ? "BUY" : "SELL"; }

    const char* kind_str() const {
        switch (kind) {
            case OrderKind::MARKET: return "MARKET";
            case OrderKind::LIMIT_IOC: return "IOC";
            case OrderKind::LIMIT_FOK: return "FOK";
            case OrderKind::LIMIT_GTD: return "GTD";
            case OrderKind::POST_ONLY: return "POST_ONLY";
        }
        return "UNKNOWN";
    }
};

static_assert(sizeof(FastOrder) <= 256, "FastOrder should fit in 4 cache lines");

// ─────────────────────────────────────────────────────────────────────────────
// Pressure model result — output of order book pressure analysis
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) PressureResult {
    double obi_5{0.0};           // OBI at 5 levels
    double obi_10{0.0};          // OBI at 10 levels
    double obi_20{0.0};          // OBI at 20 levels
    double obi_weighted{0.0};    // Distance-weighted OBI
    double trade_imbalance{0.0}; // Buyer vs seller initiated
    double toxic_score{0.0};     // 0 to 1, large aggressive orders
    double microprice_dev{0.0};  // Microprice deviation from mid (bps)
    double queue_pos_bid{0.0};   // Estimated queue position at best bid (0-1)
    double queue_pos_ask{0.0};   // Estimated queue position at best ask (0-1)
    double predicted_impact{0.0}; // Predicted price impact (bps)

    enum class SpreadRegime : uint8_t {
        TIGHT = 0,    // < 1 bp
        NORMAL = 1,   // 1-5 bp
        WIDE = 2      // > 5 bp
    };

    SpreadRegime spread_regime{SpreadRegime::NORMAL};
    double spread_bps{0.0};

    uint8_t padding_[24]{};
};

static_assert(sizeof(PressureResult) <= 192, "PressureResult should fit in 3 cache lines");

// ─────────────────────────────────────────────────────────────────────────────
// Routing decision — output of smart order router
// ─────────────────────────────────────────────────────────────────────────────
struct alignas(64) RoutingDecision {
    char exchange[32]{};
    double effective_price{0.0};  // Price after fees
    double fee_bps{0.0};
    int64_t latency_us{0};        // Estimated round-trip latency
    bool is_maker{false};

    enum class Strategy : uint8_t {
        BEST_PRICE = 0,
        LOWEST_LATENCY = 1,
        LOWEST_FEES = 2,
        BEST_EFFECTIVE = 3,
        DEPTH_AWARE = 4
    };

    Strategy strategy{Strategy::BEST_PRICE};
    char reason[32]{};

    uint8_t padding_[32]{};

    void set_exchange(const char* s) {
        size_t i = 0;
        while (s[i] && i < 31) { exchange[i] = s[i]; ++i; }
        exchange[i] = '\0';
    }

    void set_reason(const char* s) {
        size_t i = 0;
        while (s[i] && i < 31) { reason[i] = s[i]; ++i; }
        reason[i] = '\0';
    }
};

static_assert(sizeof(RoutingDecision) <= 192, "RoutingDecision should fit in 3 cache lines");

} // namespace hft
