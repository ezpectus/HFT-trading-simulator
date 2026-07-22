// Smart order router v2 — 5 routing strategies with per-exchange latency tracking,
// fee schedules, anti-toxic backoff, and depth-aware routing.
//
// Uses IExchange interface (DIP/SOLID) — no concrete exchange in core.
#pragma once

#include "../data/aligned_types.h"
#include "../data/types.h"
#include "../exchange/ExchangeBase.h"
#include "../exchange/IExchange.h"
#include "../utils/low_latency.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>

namespace hft {

// ─────────────────────────────────────────────────────────────────────────────
// SmartOrderRouterV2 — routes orders to best exchange
// ─────────────────────────────────────────────────────────────────────────────
class SmartOrderRouterV2 {
  public:
    enum class Strategy {
        BEST_PRICE,     // Best raw price (ignoring fees)
        LOWEST_LATENCY, // Fastest exchange
        LOWEST_FEES,    // Cheapest fees (maker preferred)
        BEST_EFFECTIVE, // Best price after fees
        DEPTH_AWARE     // Considers available depth
    };

    struct RoutingConfig {
        Strategy strategy{Strategy::BEST_EFFECTIVE};
        int      toxic_threshold{5};  // Skip exchange with ≥5 toxic events
        int      depth_levels{5};     // Levels to check for depth-aware routing
        double   min_depth_qty{0.01}; // Minimum depth to consider exchange
        bool     prefer_maker{true};  // Prefer maker (limit) when possible
    };

    SmartOrderRouterV2() : SmartOrderRouterV2(RoutingConfig{}) {}
    explicit SmartOrderRouterV2(const RoutingConfig& config) : config_(config) {}

    // Register an exchange
    void add_exchange(IExchange* exchange) { exchanges_.push_back(exchange); }

    // Route an order — returns RoutingDecision
    RoutingDecision route(const std::string& symbol, bool is_buy, double quantity) const {
        RoutingDecision decision{};
        decision.strategy = static_cast<RoutingDecision::Strategy>(config_.strategy);

        // Filter available exchanges (circuit breaker + toxic backoff)
        // Stack-allocated array — no heap allocation in hot path
        constexpr int MAX_EXCHANGES = 16;
        IExchange*    available[MAX_EXCHANGES];
        int           n_available = 0;
        for (auto* ex : exchanges_) {
            if (n_available >= MAX_EXCHANGES) break;
            if (!ex->is_available()) {
                continue;
            }
            if (ex->toxic_event_count() >= config_.toxic_threshold) {
                continue;
            }
            available[n_available++] = ex;
        }

        if (n_available == 0) [[unlikely]] {
            decision.set_reason("No available exchanges");
            return decision;
        }

        // Score each exchange based on strategy
        IExchange* best          = nullptr;
        double     best_score    = is_buy ? 1e18 : -1e18; // Minimize for buy, maximize for sell
        double     best_price    = 0.0;
        double     best_fee      = 0.0;
        bool       best_is_maker = false;
        int64_t    best_latency  = 0;

        for (int idx = 0; idx < n_available; ++idx) {
            IExchange* ex    = available[idx];
            double     price = is_buy ? ex->best_ask(symbol) : ex->best_bid(symbol);
            if (price <= 0) continue;

            double depth = is_buy ? ex->ask_depth(symbol, config_.depth_levels)
                                  : ex->bid_depth(symbol, config_.depth_levels);

            // Check minimum depth
            if (depth < config_.min_depth_qty) continue;

            double  fee      = config_.prefer_maker ? ex->maker_fee_bps() : ex->taker_fee_bps();
            bool    is_maker = config_.prefer_maker;
            int64_t latency  = ex->estimated_latency_us();

            // Effective price: for buy, price + fee; for sell, price - fee
            // Precompute fee fraction to avoid division per exchange
            double fee_fraction = fee * 0.0001; // fee / 10000.0
            double effective_price =
                is_buy ? price * (1.0 + fee_fraction) : price * (1.0 - fee_fraction);

            double score;
            switch (config_.strategy) {
            case Strategy::BEST_PRICE:
                score = is_buy ? price : -price;
                break;
            case Strategy::LOWEST_LATENCY:
                score = static_cast<double>(latency);
                if (!is_buy) score = -score;
                break;
            case Strategy::LOWEST_FEES:
                score = fee;
                if (!is_buy) score = -score;
                break;
            case Strategy::BEST_EFFECTIVE:
                score = is_buy ? effective_price : -effective_price;
                break;
            case Strategy::DEPTH_AWARE: {
                // Effective price adjusted by depth penalty
                double depth_penalty = depth < quantity ? (quantity - depth) * 0.01 : 0.0;
                score =
                    is_buy ? (effective_price + depth_penalty) : -(effective_price - depth_penalty);
                break;
            }
            default:
                score = is_buy ? effective_price : -effective_price;
            }

            bool is_better = is_buy ? (score < best_score) : (score > best_score);
            if (is_better) {
                best          = ex;
                best_score    = score;
                best_price    = price;
                best_fee      = fee;
                best_is_maker = is_maker;
                best_latency  = latency;
            }
        }

        if (!best) [[unlikely]] {
            decision.set_reason("No suitable exchange found");
            return decision;
        }

        decision.set_exchange(best->id().c_str());
        decision.effective_price = is_buy ? best_price * (1.0 + best_fee / 10000.0)
                                          : best_price * (1.0 - best_fee / 10000.0);
        decision.fee_bps         = best_fee;
        decision.latency_us      = best_latency;
        decision.is_maker        = best_is_maker;

        // Format reason
        const char* strat_names[] = {"best_price", "lowest_latency", "lowest_fees",
                                     "best_effective", "depth_aware"};
        decision.set_reason(strat_names[static_cast<int>(config_.strategy)]);
        return decision;
    }

    // Set routing strategy
    void set_strategy(Strategy s) { config_.strategy = s; }

    // Get all registered exchanges
    const std::vector<IExchange*>& exchanges() const { return exchanges_; }

    // Reset toxic counters for all exchanges (call periodically)
    void reset_toxic_counters() {
        for (auto* ex : exchanges_) {
            ex->reset_toxic_events();
        }
    }

  private:
    RoutingConfig           config_;
    std::vector<IExchange*> exchanges_;
};

} // namespace hft
