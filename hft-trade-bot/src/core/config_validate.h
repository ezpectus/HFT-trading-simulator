// Config validation functions — extracted from config.cpp for file-size compliance.
//
// All functions are in namespace hft::detail and are called from config.cpp.
// Every violation is a hard error: Config::load throws std::runtime_error
// listing all of them. A "validation" that only warns is a green light for
// configs that can never work or silently disarm the kill-switch.
#pragma once

#include "config.h"
#include <spdlog/spdlog.h>
#include <stdexcept>
#include <string>
#include <vector>

namespace hft::detail {

inline void validate_risk_params(const Config& cfg, std::vector<std::string>& errors) {
    if (cfg.max_risk_per_trade_pct <= 0 || cfg.max_risk_per_trade_pct > 100)
        errors.push_back("max_risk_per_trade_pct out of range (0, 100] — risk.risk_per_trade_pct");
    if (cfg.max_daily_drawdown_pct <= 0 || cfg.max_daily_drawdown_pct > 100)
        errors.push_back(
            "max_daily_drawdown_pct out of range (0, 100] — risk.max_daily_drawdown_pct");
    if (cfg.min_rr_ratio < 0)
        errors.push_back("min_rr_ratio must be non-negative — risk.min_rr_ratio");
    if (cfg.max_position_size_pct <= 0 || cfg.max_position_size_pct > 100)
        errors.push_back(
            "max_position_size_pct out of range (0, 100] — risk.max_position_size_pct");
    // max_drawdown_pct is a FRACTION (0.15 = 15%) unlike the percent-scale
    // *daily* drawdown key — a percent-thought typo here either can never trip
    // the kill-switch (>1) or trips on the first tick (<=0).
    if (cfg.max_drawdown_pct <= 0 || cfg.max_drawdown_pct > 1)
        errors.push_back("max_drawdown_pct must be a fraction in (0, 1] (e.g. 0.15 = 15%) — "
                         "risk.max_drawdown_pct");
}

inline void validate_trading_params(const Config& cfg, std::vector<std::string>& errors) {
    if (cfg.signal_interval_ms < 0)
        errors.push_back("signal_interval_ms must be >= 0 — trading.signal_interval_ms");
    if (cfg.max_open_positions < 1)
        errors.push_back("max_open_positions must be >= 1 — trading.max_open_positions");
    if (cfg.symbols.empty()) errors.push_back("no trading symbols configured — trading.symbols");
    if (cfg.fast_ema_period < 2)
        errors.push_back("fast_ema_period must be >= 2 — hft_strategies.fast_ema_period");
    if (cfg.fast_ema_period >= cfg.slow_ema_period)
        errors.push_back(
            "fast_ema_period must be < slow_ema_period — hft_strategies.{fast,slow}_ema_period");
    // IPC mode sources signals from SHM — a websocket URL is only mandatory
    // when the bot actually opens one.
    if (!cfg.ipc_enabled && cfg.ws_url.find("ws://") != 0 && cfg.ws_url.find("wss://") != 0)
        errors.push_back("websocket_url must start with ws:// or wss:// — exchange.websocket_url");
}

inline void validate_production_limits(const Config& cfg, std::vector<std::string>& errors) {
    if (cfg.max_position_qty <= 0)
        errors.push_back("max_position_qty must be positive — risk.max_position_qty");
    if (cfg.max_total_exposure <= 0)
        errors.push_back("max_total_exposure must be positive — risk.max_total_exposure");
    if (cfg.daily_loss_limit <= 0)
        errors.push_back("daily_loss_limit must be positive — risk.daily_loss_limit");
    if (cfg.max_orders_per_second <= 0)
        errors.push_back("max_orders_per_second must be positive — risk.max_orders_per_second");
    if (cfg.max_leverage < 1) errors.push_back("max_leverage must be >= 1 — risk.max_leverage");
    if (cfg.min_margin_ratio < 0 || cfg.min_margin_ratio > 1)
        errors.push_back("min_margin_ratio out of range [0, 1] — risk.min_margin_ratio");
}

inline void validate_config(const Config& cfg) {
    std::vector<std::string> errors;
    validate_risk_params(cfg, errors);
    validate_trading_params(cfg, errors);
    if (cfg.is_production) {
        validate_production_limits(cfg, errors);
    }
    if (!errors.empty()) {
        for (const auto& e : errors)
            spdlog::error("Config: {}", e);
        throw std::runtime_error("Config validation failed (" + std::to_string(errors.size()) +
                                 " error(s))");
    }
    spdlog::info("Config validated: {} symbols, {}ms interval, max {} positions",
                 cfg.symbols.size(), cfg.signal_interval_ms, cfg.max_open_positions);
}

} // namespace hft::detail
