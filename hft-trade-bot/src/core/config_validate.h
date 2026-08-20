// Config validation functions — extracted from config.cpp for file-size compliance.
//
// All functions are in namespace hft::detail and are called from config.cpp.
#pragma once

#include "config.h"
#include <spdlog/spdlog.h>

namespace hft::detail {

inline void validate_risk_params(const Config& cfg) {
    if (cfg.max_risk_per_trade_pct <= 0 || cfg.max_risk_per_trade_pct > 100)
        spdlog::warn("Config: max_risk_per_trade_pct={} out of range (0, 100]. "
                     "Recommended: 1.0-5.0. Set risk.risk_per_trade_pct in config.yaml",
                     cfg.max_risk_per_trade_pct);
    if (cfg.max_daily_drawdown_pct <= 0 || cfg.max_daily_drawdown_pct > 100)
        spdlog::warn("Config: max_daily_drawdown_pct={} out of range (0, 100]. "
                     "Recommended: 5.0-15.0. Set risk.max_daily_drawdown_pct in config.yaml",
                     cfg.max_daily_drawdown_pct);
    if (cfg.stop_loss_pct <= 0 || cfg.stop_loss_pct > 50)
        spdlog::warn("Config: stop_loss_pct={} out of range (0, 50]. "
                     "Recommended: 1.0-5.0. Set risk.stop_loss_pct in config.yaml",
                     cfg.stop_loss_pct);
    if (cfg.take_profit_pct <= 0 || cfg.take_profit_pct > 100)
        spdlog::warn("Config: take_profit_pct={} out of range (0, 100]. "
                     "Recommended: 2.0-10.0. Set risk.take_profit_pct in config.yaml",
                     cfg.take_profit_pct);
    if (cfg.min_rr_ratio < 0)
        spdlog::warn("Config: min_rr_ratio={} should be non-negative. "
                     "Recommended: 1.5-3.0. Set risk.min_rr_ratio in config.yaml",
                     cfg.min_rr_ratio);
    if (cfg.max_position_size_pct <= 0 || cfg.max_position_size_pct > 100)
        spdlog::warn("Config: max_position_size_pct={} out of range (0, 100]. "
                     "Recommended: 5.0-20.0. Set risk.max_position_size_pct in config.yaml",
                     cfg.max_position_size_pct);
}

inline void validate_trading_params(const Config& cfg) {
    if (cfg.signal_interval_seconds < 1)
        spdlog::warn("Config: signal_interval_seconds={} should be >= 1. "
                     "Set trading.signal_interval_seconds in config.yaml",
                     cfg.signal_interval_seconds);
    if (cfg.max_open_positions < 1)
        spdlog::warn("Config: max_open_positions={} should be >= 1. "
                     "Set trading.max_open_positions in config.yaml",
                     cfg.max_open_positions);
    if (cfg.symbols.empty())
        spdlog::warn("Config: no trading symbols configured. "
                     "Add symbols under trading.symbols in config.yaml");
    if (cfg.fast_ema_period >= cfg.slow_ema_period)
        spdlog::warn("Config: fast_ema_period={} should be < slow_ema_period={}. "
                     "Set hft_strategies.fast_ema_period and slow_ema_period in config.yaml",
                     cfg.fast_ema_period, cfg.slow_ema_period);
    if (cfg.fast_ema_period < 2)
        spdlog::warn("Config: fast_ema_period={} should be >= 2. "
                     "Set hft_strategies.fast_ema_period in config.yaml",
                     cfg.fast_ema_period);
    if (cfg.ws_url.find("ws://") != 0 && cfg.ws_url.find("wss://") != 0)
        spdlog::warn("Config: websocket_url '{}' should start with ws:// or wss://. "
                     "Set exchange.websocket_url in config.yaml",
                     cfg.ws_url);
}

inline void validate_production_limits(const Config& cfg) {
    if (cfg.max_position_qty <= 0)
        spdlog::warn("Config: max_position_qty={} should be positive", cfg.max_position_qty);
    if (cfg.max_total_exposure <= 0)
        spdlog::warn("Config: max_total_exposure={} should be positive", cfg.max_total_exposure);
    if (cfg.daily_loss_limit <= 0)
        spdlog::warn("Config: daily_loss_limit={} should be positive", cfg.daily_loss_limit);
    if (cfg.max_orders_per_second <= 0)
        spdlog::warn("Config: max_orders_per_second={} should be positive", cfg.max_orders_per_second);
    if (cfg.max_leverage < 1)
        spdlog::warn("Config: max_leverage={} should be >= 1", cfg.max_leverage);
    if (cfg.min_margin_ratio < 0 || cfg.min_margin_ratio > 1)
        spdlog::warn("Config: min_margin_ratio={} out of range [0, 1]", cfg.min_margin_ratio);
    for (const auto* ec : {&cfg.binance_cfg, &cfg.okx_cfg, &cfg.bybit_cfg}) {
        if (ec->enabled) {
            if (ec->maker_bps < 0 || ec->maker_bps > 100)
                spdlog::warn("Config: maker_bps={} out of range [0, 100]", ec->maker_bps);
            if (ec->taker_bps < 0 || ec->taker_bps > 100)
                spdlog::warn("Config: taker_bps={} out of range [0, 100]", ec->taker_bps);
        }
    }
}

inline void validate_config(const Config& cfg) {
    validate_risk_params(cfg);
    validate_trading_params(cfg);
    if (cfg.is_production) {
        validate_production_limits(cfg);
    }
    spdlog::info("Config validated: {} symbols, {}s interval, max {} positions", cfg.symbols.size(),
                 cfg.signal_interval_seconds, cfg.max_open_positions);
}

} // namespace hft::detail
