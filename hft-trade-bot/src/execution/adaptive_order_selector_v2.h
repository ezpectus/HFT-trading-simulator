// Adaptive order type selector v2 — dynamic IOC/FOK/GTD/PostOnly
//
// Selects order type based on: confidence, spread, OBI, toxicity.
// Maps to exchange-specific order types (Binance: IOC, FOK, GTX, GTC+expire).
#pragma once

#include "../data/aligned_types.h"
#include "../data/types.h"
#include "../strategies/pressure_model.h"
#include <cstdint>
#include <cmath>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// AdaptiveOrderSelectorV2 — selects optimal order kind for execution
// ─────────────────────────────────────────────────────────────────────────────
class AdaptiveOrderSelectorV2 {
public:
    struct Params {
        // Confidence thresholds
        uint8_t high_confidence{80};
        uint8_t low_confidence{60};
        uint8_t emergency_confidence{95};

        // Spread thresholds (bps)
        double tight_spread_bps{1.0};
        double wide_spread_bps{5.0};

        // Toxicity threshold
        double toxic_threshold{0.5};

        // OBI threshold (strong imbalance = urgency)
        double obi_urgency_threshold{0.4};

        // Large order vs depth ratio (if order > 20% of top-5 depth → large)
        double large_order_depth_ratio{0.2};

        // GTD duration in seconds
        int gtd_seconds{30};
    };

    explicit AdaptiveOrderSelectorV2(const Params& params = Params{}) : params_(params) {}

    // Select order kind based on signal + market microstructure
    // Returns FastOrder::OrderKind + sets limit price
    struct SelectionResult {
        FastOrder::OrderKind kind{FastOrder::OrderKind::MARKET};
        double limit_price{0.0};      // 0 for market orders
        int64_t expire_ns{0};         // For GTD
        const char* reason{""};
    };

    SelectionResult select(
        uint8_t confidence,
        bool is_buy,
        double mid_price,
        double spread_bps,
        double obi_weighted,
        double toxic_score,
        double order_quantity,
        double top5_depth,
        int64_t now_ns = 0
    ) const noexcept {
        SelectionResult result{};

        // ── Emergency → FOK (fill or kill, all or nothing) ──
        if (confidence >= params_.emergency_confidence) {
            result.kind = FastOrder::OrderKind::LIMIT_FOK;
            result.limit_price = is_buy ? mid_price * 1.0002 : mid_price * 0.9998;  // Slightly aggressive
            result.reason = "Emergency: FOK (urgent fill)";
            return result;
        }

        // ── Toxic → IOC (immediate or cancel, avoid getting picked off) ──
        if (toxic_score >= params_.toxic_threshold) {
            result.kind = FastOrder::OrderKind::LIMIT_IOC;
            result.limit_price = is_buy ? mid_price * 1.0001 : mid_price * 0.9999;
            result.reason = "Toxic: IOC (avoid adverse selection)";
            return result;
        }

        // ── High confidence + tight spread → IOC (fast execution) ──
        if (confidence >= params_.high_confidence && spread_bps < params_.tight_spread_bps) {
            result.kind = FastOrder::OrderKind::LIMIT_IOC;
            result.limit_price = is_buy ? mid_price * 1.0001 : mid_price * 0.9999;
            result.reason = "High conf + tight: IOC";
            return result;
        }

        // ── High confidence + strong OBI → IOC (momentum) ──
        if (confidence >= params_.high_confidence &&
            std::abs(obi_weighted) > params_.obi_urgency_threshold) {
            result.kind = FastOrder::OrderKind::LIMIT_IOC;
            result.limit_price = is_buy ? mid_price * 1.0001 : mid_price * 0.9999;
            result.reason = "High conf + OBI urgency: IOC";
            return result;
        }

        // ── Large order vs thin depth → GTD (passive split) ──
        if (top5_depth > 0 && order_quantity / top5_depth > params_.large_order_depth_ratio) {
            result.kind = FastOrder::OrderKind::LIMIT_GTD;
            result.limit_price = is_buy ? mid_price * 0.9999 : mid_price * 1.0001;  // Passive side
            result.expire_ns = now_ns + static_cast<int64_t>(params_.gtd_seconds) * 1'000'000'000LL;
            result.reason = "Large vs thin depth: GTD (passive split)";
            return result;
        }

        // ── Low confidence + wide spread → PostOnly (maker rebate) ──
        if (confidence < params_.low_confidence || spread_bps > params_.wide_spread_bps) {
            result.kind = FastOrder::OrderKind::POST_ONLY;
            result.limit_price = is_buy ? mid_price * 0.9998 : mid_price * 1.0002;  // Behind best
            result.reason = "Low conf + wide: PostOnly (maker rebate)";
            return result;
        }

        // ── Default: IOC at mid (balanced execution) ──
        result.kind = FastOrder::OrderKind::LIMIT_IOC;
        result.limit_price = mid_price;
        result.reason = "Default: IOC at mid";
        return result;
    }

    // Map internal order kind to Binance-specific order type string
    static const char* to_binance_type(FastOrder::OrderKind kind) noexcept {
        switch (kind) {
            case FastOrder::OrderKind::MARKET:      return "MARKET";
            case FastOrder::OrderKind::LIMIT_IOC:   return "LIMIT";
            case FastOrder::OrderKind::LIMIT_FOK:   return "LIMIT";
            case FastOrder::OrderKind::LIMIT_GTD:   return "LIMIT";
            case FastOrder::OrderKind::POST_ONLY:   return "GTX";  // Binance post-only
        }
        return "MARKET";
    }

    // Map to Binance time-in-force
    static const char* to_binance_tif(FastOrder::OrderKind kind) noexcept {
        switch (kind) {
            case FastOrder::OrderKind::MARKET:      return "GTC";
            case FastOrder::OrderKind::LIMIT_IOC:   return "IOC";
            case FastOrder::OrderKind::LIMIT_FOK:   return "FOK";
            case FastOrder::OrderKind::LIMIT_GTD:   return "GTC";  // GTC + expireT
            case FastOrder::OrderKind::POST_ONLY:   return "GTX";  // Post-only
        }
        return "GTC";
    }

    // Map to OKX order type
    static const char* to_okx_type(FastOrder::OrderKind kind) noexcept {
        switch (kind) {
            case FastOrder::OrderKind::MARKET:      return "market";
            case FastOrder::OrderKind::LIMIT_IOC:   return "ioc";
            case FastOrder::OrderKind::LIMIT_FOK:   return "fok";
            case FastOrder::OrderKind::LIMIT_GTD:   return "gtc";  // + expireTs
            case FastOrder::OrderKind::POST_ONLY:   return "post_only";
        }
        return "market";
    }

    // Map to Bybit order type
    static const char* to_bybit_type(FastOrder::OrderKind kind) noexcept {
        switch (kind) {
            case FastOrder::OrderKind::MARKET:      return "Market";
            case FastOrder::OrderKind::LIMIT_IOC:   return "Limit";
            case FastOrder::OrderKind::LIMIT_FOK:   return "Limit";
            case FastOrder::OrderKind::LIMIT_GTD:   return "Limit";
            case FastOrder::OrderKind::POST_ONLY:   return "Limit";
        }
        return "Market";
    }

    static const char* to_bybit_tif(FastOrder::OrderKind kind) noexcept {
        switch (kind) {
            case FastOrder::OrderKind::MARKET:      return "GoodTillCancel";
            case FastOrder::OrderKind::LIMIT_IOC:   return "ImmediateOrCancel";
            case FastOrder::OrderKind::LIMIT_FOK:   return "FillOrKill";
            case FastOrder::OrderKind::LIMIT_GTD:   return "GoodTillCancel";  // + expire
            case FastOrder::OrderKind::POST_ONLY:   return "PostOnly";
        }
        return "GoodTillCancel";
    }

    // Get exchange-specific order type mapping
    static const char* to_exchange_type(FastOrder::OrderKind kind, const char* exchange) noexcept {
        if (std::strcmp(exchange, "binance") == 0) return to_binance_type(kind);
        if (std::strcmp(exchange, "okx") == 0) return to_okx_type(kind);
        if (std::strcmp(exchange, "bybit") == 0) return to_bybit_type(kind);
        return to_binance_type(kind);  // Default to Binance mapping
    }

    static const char* to_exchange_tif(FastOrder::OrderKind kind, const char* exchange) noexcept {
        if (std::strcmp(exchange, "binance") == 0) return to_binance_tif(kind);
        if (std::strcmp(exchange, "bybit") == 0) return to_bybit_tif(kind);
        // OKX embeds TIF in order type
        return "GTC";
    }

private:
    Params params_;
};

} // namespace hft
