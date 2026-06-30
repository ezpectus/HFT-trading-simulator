// Config manager implementation
#include "config.h"
#include <spdlog/spdlog.h>
#include <filesystem>
#include <algorithm>

namespace hft {

// Validate config values and log warnings for out-of-range parameters.
static void validate_config(const Config& cfg) {
    // Risk parameters
    if (cfg.max_risk_per_trade_pct <= 0 || cfg.max_risk_per_trade_pct > 100)
        spdlog::warn("Config: max_risk_per_trade_pct={} out of range (0, 100]", cfg.max_risk_per_trade_pct);
    if (cfg.max_daily_drawdown_pct <= 0 || cfg.max_daily_drawdown_pct > 100)
        spdlog::warn("Config: max_daily_drawdown_pct={} out of range (0, 100]", cfg.max_daily_drawdown_pct);
    if (cfg.stop_loss_pct <= 0 || cfg.stop_loss_pct > 50)
        spdlog::warn("Config: stop_loss_pct={} out of range (0, 50]", cfg.stop_loss_pct);
    if (cfg.take_profit_pct <= 0 || cfg.take_profit_pct > 100)
        spdlog::warn("Config: take_profit_pct={} out of range (0, 100]", cfg.take_profit_pct);
    if (cfg.min_rr_ratio < 0)
        spdlog::warn("Config: min_rr_ratio={} should be non-negative", cfg.min_rr_ratio);
    if (cfg.max_position_size_pct <= 0 || cfg.max_position_size_pct > 100)
        spdlog::warn("Config: max_position_size_pct={} out of range (0, 100]", cfg.max_position_size_pct);

    // Trading parameters
    if (cfg.signal_interval_seconds < 1)
        spdlog::warn("Config: signal_interval_seconds={} should be >= 1", cfg.signal_interval_seconds);
    if (cfg.max_open_positions < 1)
        spdlog::warn("Config: max_open_positions={} should be >= 1", cfg.max_open_positions);
    if (cfg.symbols.empty())
        spdlog::warn("Config: no trading symbols configured");

    // EMA periods
    if (cfg.fast_ema_period >= cfg.slow_ema_period)
        spdlog::warn("Config: fast_ema_period={} should be < slow_ema_period={}",
            cfg.fast_ema_period, cfg.slow_ema_period);
    if (cfg.fast_ema_period < 2)
        spdlog::warn("Config: fast_ema_period={} should be >= 2", cfg.fast_ema_period);

    // WebSocket URL
    if (cfg.ws_url.find("ws://") != 0 && cfg.ws_url.find("wss://") != 0)
        spdlog::warn("Config: websocket_url '{}' should start with ws:// or wss://", cfg.ws_url);

    spdlog::info("Config validated: {} symbols, {}s interval, max {} positions",
        cfg.symbols.size(), cfg.signal_interval_seconds, cfg.max_open_positions);
}

Config Config::load(const std::string& path) {
    Config cfg;

    if (!std::filesystem::exists(path)) {
        spdlog::warn("Config file not found: {}, using defaults", path);
        return cfg;
    }

    YAML::Node root = YAML::LoadFile(path);

    // Exchange connection
    if (auto ex = root["exchange"]) {
        if (ex["websocket_url"]) cfg.ws_url = ex["websocket_url"].as<std::string>();
        if (ex["default_exchange"]) cfg.default_exchange = ex["default_exchange"].as<std::string>();
    }

    // Trading
    if (auto t = root["trading"]) {
        if (t["symbols"]) {
            cfg.symbols.clear();
            for (const auto& s : t["symbols"]) {
                cfg.symbols.push_back(s.as<std::string>());
            }
        }
        if (t["signal_interval_seconds"]) cfg.signal_interval_seconds = t["signal_interval_seconds"].as<int>();
        if (t["max_open_positions"]) cfg.max_open_positions = t["max_open_positions"].as<int>();
        if (t["paper_trading"]) cfg.paper_trading = t["paper_trading"].as<bool>();
    }

    // Risk
    if (auto r = root["risk"]) {
        if (r["max_risk_per_trade_pct"]) cfg.max_risk_per_trade_pct = r["max_risk_per_trade_pct"].as<double>();
        if (r["max_daily_drawdown_pct"]) cfg.max_daily_drawdown_pct = r["max_daily_drawdown_pct"].as<double>();
        if (r["min_confidence"]) cfg.min_confidence = r["min_confidence"].as<double>();
        if (r["min_rr_ratio"]) cfg.min_rr_ratio = r["min_rr_ratio"].as<double>();
        if (r["stop_loss_pct"]) cfg.stop_loss_pct = r["stop_loss_pct"].as<double>();
        if (r["take_profit_pct"]) cfg.take_profit_pct = r["take_profit_pct"].as<double>();
        if (r["max_position_size_pct"]) cfg.max_position_size_pct = r["max_position_size_pct"].as<double>();
    }

    // HFT strategies
    if (auto s = root["hft_strategies"]) {
        if (s["fast_ema_enabled"]) cfg.fast_ema_enabled = s["fast_ema_enabled"].as<bool>();
        if (s["fast_ema_period"]) cfg.fast_ema_period = s["fast_ema_period"].as<int>();
        if (s["slow_ema_period"]) cfg.slow_ema_period = s["slow_ema_period"].as<int>();
        if (s["obi_enabled"]) cfg.obi_enabled = s["obi_enabled"].as<bool>();
        if (s["vwap_enabled"]) cfg.vwap_enabled = s["vwap_enabled"].as<bool>();
        if (s["pressure_model_enabled"]) cfg.pressure_model_enabled = s["pressure_model_enabled"].as<bool>();
        if (s["fft_enabled"]) cfg.fft_enabled = s["fft_enabled"].as<bool>();
        if (s["fft_min_candles"]) cfg.fft_min_candles = s["fft_min_candles"].as<int>();
    }

    // HFT v2 — native signal engine
    if (auto v2 = root["signal_engine_v2"]) {
        if (v2["enabled"]) cfg.signal_engine_v2_enabled = v2["enabled"].as<bool>();
        if (v2["ema_fast_period"]) cfg.v2_ema_fast_period = v2["ema_fast_period"].as<int>();
        if (v2["ema_slow_period"]) cfg.v2_ema_slow_period = v2["ema_slow_period"].as<int>();
        if (v2["ema_signal_period"]) cfg.v2_ema_signal_period = v2["ema_signal_period"].as<int>();
        if (v2["rsi_period"]) cfg.v2_rsi_period = v2["rsi_period"].as<int>();
        if (v2["rsi_overbought"]) cfg.v2_rsi_overbought = v2["rsi_overbought"].as<double>();
        if (v2["rsi_oversold"]) cfg.v2_rsi_oversold = v2["rsi_oversold"].as<double>();
        if (v2["adx_period"]) cfg.v2_adx_period = v2["adx_period"].as<int>();
        if (v2["adx_trend_threshold"]) cfg.v2_adx_trend_threshold = v2["adx_trend_threshold"].as<double>();
        if (v2["adx_strong_threshold"]) cfg.v2_adx_strong_threshold = v2["adx_strong_threshold"].as<double>();
        if (v2["obi_levels_5"]) cfg.v2_obi_levels_5 = v2["obi_levels_5"].as<int>();
        if (v2["obi_levels_10"]) cfg.v2_obi_levels_10 = v2["obi_levels_10"].as<int>();
        if (v2["obi_levels_20"]) cfg.v2_obi_levels_20 = v2["obi_levels_20"].as<int>();
        if (v2["atr_period"]) cfg.v2_atr_period = v2["atr_period"].as<int>();
        if (v2["sl_atr_mult"]) cfg.v2_sl_atr_mult = v2["sl_atr_mult"].as<double>();
        if (v2["tp_atr_mult"]) cfg.v2_tp_atr_mult = v2["tp_atr_mult"].as<double>();
        if (v2["cooldown_ms"]) cfg.v2_cooldown_ms = v2["cooldown_ms"].as<int64_t>();
        if (v2["buy_threshold"]) cfg.v2_buy_threshold = v2["buy_threshold"].as<double>();
        if (v2["sell_threshold"]) cfg.v2_sell_threshold = v2["sell_threshold"].as<double>();
        if (v2["min_confidence"]) cfg.v2_min_confidence = static_cast<uint8_t>(v2["min_confidence"].as<int>());
        if (v2["vwap_band_mult"]) cfg.v2_vwap_band_mult = v2["vwap_band_mult"].as<double>();
        if (v2["vwap_dev_threshold"]) cfg.v2_vwap_dev_threshold = v2["vwap_dev_threshold"].as<double>();
        if (v2["dynamic_leverage"]) cfg.v2_dynamic_leverage = v2["dynamic_leverage"].as<bool>();
        if (v2["max_leverage"]) cfg.v2_max_leverage = static_cast<uint8_t>(v2["max_leverage"].as<int>());
        if (v2["high_confidence_leverage"]) cfg.v2_high_confidence_leverage = static_cast<uint8_t>(v2["high_confidence_leverage"].as<int>());
        if (v2["emergency_confidence_threshold"]) cfg.v2_emergency_confidence_threshold = static_cast<uint8_t>(v2["emergency_confidence_threshold"].as<int>());
        if (v2["emergency_adx_threshold"]) cfg.v2_emergency_adx_threshold = v2["emergency_adx_threshold"].as<double>();
    }

    // Pressure model
    if (auto pm = root["pressure_model"]) {
        if (pm["toxic_size_threshold"]) cfg.v2_toxic_size_threshold = pm["toxic_size_threshold"].as<double>();
        if (pm["obi_threshold"]) cfg.v2_obi_threshold = pm["obi_threshold"].as<double>();
        if (pm["pressure_threshold"]) cfg.v2_pressure_threshold = pm["pressure_threshold"].as<double>();
        if (pm["toxic_penalty"]) cfg.v2_toxic_penalty = pm["toxic_penalty"].as<double>();
        if (pm["body_direction_lookback"]) cfg.v2_body_direction_lookback = pm["body_direction_lookback"].as<int>();
    }

    // Smart order router v2
    if (auto sr = root["smart_order_router"]) {
        if (sr["enabled"]) cfg.smart_router_enabled = sr["enabled"].as<bool>();
        if (sr["strategy"]) cfg.router_strategy = sr["strategy"].as<int>();
        if (sr["toxic_threshold"]) cfg.router_toxic_threshold = sr["toxic_threshold"].as<int>();
    }

    // Adaptive order selector v2
    if (auto ao = root["adaptive_order_selector"]) {
        if (ao["enabled"]) cfg.adaptive_order_enabled = ao["enabled"].as<bool>();
        if (ao["high_confidence"]) cfg.adaptive_high_confidence = static_cast<uint8_t>(ao["high_confidence"].as<int>());
        if (ao["low_confidence"]) cfg.adaptive_low_confidence = static_cast<uint8_t>(ao["low_confidence"].as<int>());
        if (ao["emergency_confidence"]) cfg.adaptive_emergency_confidence = static_cast<uint8_t>(ao["emergency_confidence"].as<int>());
        if (ao["gtd_seconds"]) cfg.adaptive_gtd_seconds = ao["gtd_seconds"].as<int>();
    }

    // Latency optimization
    if (auto lo = root["latency_optimization"]) {
        if (lo["thread_pinning_enabled"]) cfg.thread_pinning_enabled = lo["thread_pinning_enabled"].as<bool>();
        if (lo["execution_core_id"]) cfg.execution_core_id = lo["execution_core_id"].as<int>();
        if (lo["latency_histogram_enabled"]) cfg.latency_histogram_enabled = lo["latency_histogram_enabled"].as<bool>();
    }

    // Logging
    if (auto l = root["logging"]) {
        if (l["level"]) cfg.log_level = l["level"].as<std::string>();
        if (l["file"]) cfg.log_file = l["file"].as<std::string>();
    }

    // AI Signal Bot connection (optional)
    if (auto ai = root["ai_signal_bot"]) {
        if (ai["enabled"]) cfg.ai_signal_enabled = ai["enabled"].as<bool>();
        if (ai["websocket_url"]) cfg.ai_signal_ws_url = ai["websocket_url"].as<std::string>();
    }

    validate_config(cfg);
    return cfg;
}

} // namespace hft
