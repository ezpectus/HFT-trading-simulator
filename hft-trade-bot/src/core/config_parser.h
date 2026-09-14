// Config YAML parsing helpers — extracted from config.cpp for file-size compliance.
//
// Split from Config::load into parse_dev_config and parse_production_config.
// Both operate on a Config& and a YAML::Node root.
#pragma once

#include "config.h"
#include <cstdlib>
#include <spdlog/spdlog.h>
#include <string>
#include <yaml-cpp/yaml.h>

namespace hft::detail {

inline std::string expand_env(const std::string& s) {
    std::string result;
    result.reserve(s.size());
    size_t i = 0;
    while (i < s.size()) {
        if (i + 1 < s.size() && s[i] == '$' && s[i + 1] == '{') {
            size_t end = s.find('}', i + 2);
            if (end == std::string::npos) {
                result += s.substr(i);
                break;
            }
            std::string var_name = s.substr(i + 2, end - i - 2);
            // "${VAR:-default}" — fall back to the default when the env var is
            // unset or empty (k8s/compose inject service DNS via env).
            std::string fallback;
            const auto  sep = var_name.find(":-");
            if (sep != std::string::npos) {
                fallback = var_name.substr(sep + 2);
                var_name = var_name.substr(0, sep);
            }
            const char* val = std::getenv(var_name.c_str());
            if (val && *val) {
                result += val;
            } else {
                result += fallback;
            }
            i = end + 1;
        } else {
            result += s[i++];
        }
    }
    return result;
}

inline void parse_dev_config(Config& cfg, const YAML::Node& root) {
    if (auto ex = root["exchange"]) {
        if (ex["websocket_url"]) cfg.ws_url = expand_env(ex["websocket_url"].as<std::string>());
        if (ex["default_exchange"]) cfg.default_exchange = ex["default_exchange"].as<std::string>();
    }
    if (auto t = root["trading"]) {
        if (t["symbols"]) {
            cfg.symbols.clear();
            for (const auto& s : t["symbols"])
                cfg.symbols.push_back(s.as<std::string>());
        }
        if (t["signal_interval_ms"]) cfg.signal_interval_ms = t["signal_interval_ms"].as<int>();
        if (t["signal_interval_seconds"])
            cfg.signal_interval_ms =
                t["signal_interval_seconds"].as<int>() * 1000; // backwards compat
        if (t["max_open_positions"]) cfg.max_open_positions = t["max_open_positions"].as<int>();
    }
    if (auto r = root["risk"]) {
        if (r["max_risk_per_trade_pct"])
            cfg.max_risk_per_trade_pct = r["max_risk_per_trade_pct"].as<double>();
        if (r["max_daily_drawdown_pct"])
            cfg.max_daily_drawdown_pct = r["max_daily_drawdown_pct"].as<double>();
        if (r["min_confidence"]) cfg.min_confidence = r["min_confidence"].as<double>();
        if (r["min_rr_ratio"]) cfg.min_rr_ratio = r["min_rr_ratio"].as<double>();
        if (r["max_position_size_pct"])
            cfg.max_position_size_pct = r["max_position_size_pct"].as<double>();
    }
    if (auto s = root["hft_strategies"]) {
        if (s["fast_ema_enabled"]) cfg.fast_ema_enabled = s["fast_ema_enabled"].as<bool>();
        if (s["fast_ema_period"]) cfg.fast_ema_period = s["fast_ema_period"].as<int>();
        if (s["slow_ema_period"]) cfg.slow_ema_period = s["slow_ema_period"].as<int>();
        if (s["obi_enabled"]) cfg.obi_enabled = s["obi_enabled"].as<bool>();
        if (s["vwap_enabled"]) cfg.vwap_enabled = s["vwap_enabled"].as<bool>();
        if (s["pressure_model_enabled"])
            cfg.pressure_model_enabled = s["pressure_model_enabled"].as<bool>();
        if (s["fft_enabled"]) cfg.fft_enabled = s["fft_enabled"].as<bool>();
        if (s["fft_min_candles"]) cfg.fft_min_candles = s["fft_min_candles"].as<int>();
    }
}

inline void parse_v2_dev(Config& cfg, const YAML::Node& root) {
    if (auto v2 = root["signal_engine_v2"]) {
        if (v2["enabled"]) cfg.signal_engine_v2_enabled = v2["enabled"].as<bool>();
        if (v2["ema_fast_period"]) cfg.v2_ema_fast_period = v2["ema_fast_period"].as<int>();
        if (v2["ema_slow_period"]) cfg.v2_ema_slow_period = v2["ema_slow_period"].as<int>();
        if (v2["ema_signal_period"]) cfg.v2_ema_signal_period = v2["ema_signal_period"].as<int>();
        if (v2["rsi_period"]) cfg.v2_rsi_period = v2["rsi_period"].as<int>();
        if (v2["rsi_overbought"]) cfg.v2_rsi_overbought = v2["rsi_overbought"].as<double>();
        if (v2["rsi_oversold"]) cfg.v2_rsi_oversold = v2["rsi_oversold"].as<double>();
        if (v2["adx_period"]) cfg.v2_adx_period = v2["adx_period"].as<int>();
        if (v2["adx_trend_threshold"])
            cfg.v2_adx_trend_threshold = v2["adx_trend_threshold"].as<double>();
        if (v2["adx_strong_threshold"])
            cfg.v2_adx_strong_threshold = v2["adx_strong_threshold"].as<double>();
        if (v2["obi_levels_5"]) cfg.v2_obi_levels_5 = v2["obi_levels_5"].as<int>();
        if (v2["obi_levels_10"]) cfg.v2_obi_levels_10 = v2["obi_levels_10"].as<int>();
        if (v2["obi_levels_20"]) cfg.v2_obi_levels_20 = v2["obi_levels_20"].as<int>();
        if (v2["atr_period"]) cfg.v2_atr_period = v2["atr_period"].as<int>();
        if (v2["sl_atr_mult"]) cfg.v2_sl_atr_mult = v2["sl_atr_mult"].as<double>();
        if (v2["tp_atr_mult"]) cfg.v2_tp_atr_mult = v2["tp_atr_mult"].as<double>();
        if (v2["cooldown_ms"]) cfg.v2_cooldown_ms = v2["cooldown_ms"].as<int64_t>();
        if (v2["buy_threshold"]) cfg.v2_buy_threshold = v2["buy_threshold"].as<double>();
        if (v2["sell_threshold"]) cfg.v2_sell_threshold = v2["sell_threshold"].as<double>();
        if (v2["min_confidence"])
            cfg.v2_min_confidence = static_cast<uint8_t>(v2["min_confidence"].as<int>());
        if (v2["vwap_band_mult"]) cfg.v2_vwap_band_mult = v2["vwap_band_mult"].as<double>();
        if (v2["vwap_dev_threshold"])
            cfg.v2_vwap_dev_threshold = v2["vwap_dev_threshold"].as<double>();
        if (v2["dynamic_leverage"]) cfg.v2_dynamic_leverage = v2["dynamic_leverage"].as<bool>();
        if (v2["max_leverage"])
            cfg.v2_max_leverage = static_cast<uint8_t>(v2["max_leverage"].as<int>());
        if (v2["high_confidence_leverage"])
            cfg.v2_high_confidence_leverage =
                static_cast<uint8_t>(v2["high_confidence_leverage"].as<int>());
        if (v2["emergency_confidence_threshold"])
            cfg.v2_emergency_confidence_threshold =
                static_cast<uint8_t>(v2["emergency_confidence_threshold"].as<int>());
        if (v2["emergency_adx_threshold"])
            cfg.v2_emergency_adx_threshold = v2["emergency_adx_threshold"].as<double>();
    }
    if (auto pm = root["pressure_model"]) {
        if (pm["toxic_size_threshold"])
            cfg.v2_toxic_size_threshold = pm["toxic_size_threshold"].as<double>();
        if (pm["obi_threshold"]) cfg.v2_obi_threshold = pm["obi_threshold"].as<double>();
        if (pm["pressure_threshold"])
            cfg.v2_pressure_threshold = pm["pressure_threshold"].as<double>();
        if (pm["toxic_penalty"]) cfg.v2_toxic_penalty = pm["toxic_penalty"].as<double>();
        if (pm["body_direction_lookback"])
            cfg.v2_body_direction_lookback = pm["body_direction_lookback"].as<int>();
    }
}

// signal_engine_v3 — shared by dev and prod parse paths (S245: the block was
// flag-only; the 7 Params tunables were unreachable hardcoded defaults).
inline void parse_v3_section(Config& cfg, const YAML::Node& v3) {
    if (v3["enabled"]) cfg.signal_engine_v3_enabled = v3["enabled"].as<bool>();
    if (v3["trend_boost"]) cfg.v3_trend_boost = v3["trend_boost"].as<double>();
    if (v3["trend_dampen"]) cfg.v3_trend_dampen = v3["trend_dampen"].as<double>();
    if (v3["range_confidence_cap"])
        cfg.v3_range_confidence_cap = v3["range_confidence_cap"].as<double>();
    if (v3["volatile_leverage_mult"])
        cfg.v3_volatile_leverage_mult = v3["volatile_leverage_mult"].as<double>();
    if (v3["volatile_stop_mult"]) cfg.v3_volatile_stop_mult = v3["volatile_stop_mult"].as<double>();
    if (v3["hmm_update_threshold"])
        cfg.v3_hmm_update_threshold = v3["hmm_update_threshold"].as<double>();
    if (v3["min_regime_confidence"])
        cfg.v3_min_regime_confidence = v3["min_regime_confidence"].as<double>();
}

inline void parse_dev_extras(Config& cfg, const YAML::Node& root) {
    if (auto v3 = root["signal_engine_v3"]) parse_v3_section(cfg, v3);
    if (auto ao = root["adaptive_order_selector"]) {
        if (ao["enabled"]) cfg.adaptive_order_enabled = ao["enabled"].as<bool>();
        if (ao["high_confidence"])
            cfg.adaptive_high_confidence = static_cast<uint8_t>(ao["high_confidence"].as<int>());
        if (ao["low_confidence"])
            cfg.adaptive_low_confidence = static_cast<uint8_t>(ao["low_confidence"].as<int>());
        if (ao["emergency_confidence"])
            cfg.adaptive_emergency_confidence =
                static_cast<uint8_t>(ao["emergency_confidence"].as<int>());
        if (ao["gtd_seconds"]) cfg.adaptive_gtd_seconds = ao["gtd_seconds"].as<int>();
    }
    if (auto lo = root["latency_optimization"]) {
        if (lo["thread_pinning_enabled"])
            cfg.thread_pinning_enabled = lo["thread_pinning_enabled"].as<bool>();
        if (lo["execution_core_id"]) cfg.execution_core_id = lo["execution_core_id"].as<int>();
        if (lo["latency_histogram_enabled"])
            cfg.latency_histogram_enabled = lo["latency_histogram_enabled"].as<bool>();
    }
    if (auto l = root["logging"]) {
        if (l["level"]) cfg.log_level = l["level"].as<std::string>();
        if (l["file"]) cfg.log_file = l["file"].as<std::string>();
    }
    if (auto m = root["metrics"]) {
        if (m["enabled"]) cfg.metrics_enabled = m["enabled"].as<bool>();
        if (m["port"]) cfg.metrics_port = m["port"].as<int>();
        if (m["host"]) cfg.metrics_host = m["host"].as<std::string>();
    }
    if (auto ai = root["ai_signal_bot"]) {
        if (ai["enabled"]) cfg.ai_signal_enabled = ai["enabled"].as<bool>();
        if (ai["websocket_url"])
            cfg.ai_signal_ws_url = expand_env(ai["websocket_url"].as<std::string>());
    }
}

inline void parse_prod_system(Config& cfg, const YAML::Node& root) {
    if (!root["system"]) return;
    auto sys = root["system"];
    // `mode` gates the production flag — a system: section with a non-production
    // mode (e.g. staging) does not flip is_production.
    cfg.is_production = !sys["mode"] || sys["mode"].as<std::string>() == "production";
    if (sys["version"]) cfg.system_version = sys["version"].as<std::string>();
    if (sys["log_level"]) cfg.log_level = sys["log_level"].as<std::string>();
    if (sys["log_file"]) cfg.log_file = sys["log_file"].as<std::string>();
    spdlog::info("Config: production mode detected (v{})", cfg.system_version);
}

inline void parse_prod_exchanges(Config& cfg, const YAML::Node& root) {
    if (auto ex = root["exchange"]) {
        if (ex["active"]) {
            cfg.active_exchanges.clear();
            for (const auto& name : ex["active"])
                cfg.active_exchanges.push_back(name.as<std::string>());
        }
        if (ex["simulator_ws_url"])
            cfg.ws_url = expand_env(ex["simulator_ws_url"].as<std::string>());
        if (!cfg.active_exchanges.empty()) cfg.default_exchange = cfg.active_exchanges[0];
    }
}

inline void parse_prod_ipc(Config& cfg, const YAML::Node& root) {
    if (auto ipc = root["ipc"]) {
        if (ipc["enabled"]) cfg.ipc_enabled = ipc["enabled"].as<bool>();
        if (auto sig = ipc["signals"]) {
            if (sig["shm_name"]) cfg.ipc_signals_shm = sig["shm_name"].as<std::string>();
            if (sig["capacity"]) cfg.ipc_signals_capacity = sig["capacity"].as<int>();
        }
        if (auto fills = ipc["fills"]) {
            if (fills["shm_name"]) cfg.ipc_fills_shm = fills["shm_name"].as<std::string>();
            if (fills["capacity"]) cfg.ipc_fills_capacity = fills["capacity"].as<int>();
        }
        if (auto md = ipc["market_data"]) {
            if (md["shm_name"]) cfg.ipc_market_data_shm = md["shm_name"].as<std::string>();
            if (md["max_symbols"]) cfg.ipc_market_data_max_symbols = md["max_symbols"].as<int>();
        }
        if (auto ks = ipc["kill_switch"]) {
            if (ks["shm_name"]) cfg.kill_switch_shm_name = ks["shm_name"].as<std::string>();
            if (ks["trigger_file"])
                cfg.kill_switch_trigger_file = expand_env(ks["trigger_file"].as<std::string>());
            if (ks["poll_interval_ms"])
                cfg.kill_switch_poll_interval_ms = ks["poll_interval_ms"].as<int>();
        }
    }
}

inline void parse_prod_v2_weights(Config& cfg, const YAML::Node& root) {
    if (auto v2 = root["signal_engine_v2"]) {
        if (v2["enabled"]) cfg.signal_engine_v2_enabled = v2["enabled"].as<bool>();
        if (auto w = v2["weights"]) {
            if (w["ema"]) cfg.v2_weight_ema = w["ema"].as<double>();
            if (w["rsi"]) cfg.v2_weight_rsi = w["rsi"].as<double>();
            if (w["obi"]) cfg.v2_weight_obi = w["obi"].as<double>();
            if (w["vwap"]) cfg.v2_weight_vwap = w["vwap"].as<double>();
            if (w["adx"]) cfg.v2_weight_adx = w["adx"].as<double>();
            if (w["pressure"]) cfg.v2_weight_pressure = w["pressure"].as<double>();
        }
        if (auto th = v2["thresholds"]) {
            if (th["min_confidence"])
                cfg.v2_min_confidence = static_cast<uint8_t>(th["min_confidence"].as<int>());
        }
        if (auto p = v2["periods"]) {
            if (p["ema_fast"]) cfg.v2_ema_fast_period = p["ema_fast"].as<int>();
            if (p["ema_slow"]) cfg.v2_ema_slow_period = p["ema_slow"].as<int>();
            if (p["rsi_period"]) cfg.v2_rsi_period = p["rsi_period"].as<int>();
            if (p["adx_period"]) cfg.v2_adx_period = p["adx_period"].as<int>();
        }
        // Multi-level OBI depths — same flat keys as the dev parser; they feed
        // both SignalEngineV2 and PressureModel via bot_setup.
        if (v2["obi_levels_5"]) cfg.v2_obi_levels_5 = v2["obi_levels_5"].as<int>();
        if (v2["obi_levels_10"]) cfg.v2_obi_levels_10 = v2["obi_levels_10"].as<int>();
        if (v2["obi_levels_20"]) cfg.v2_obi_levels_20 = v2["obi_levels_20"].as<int>();
    }
}

inline void parse_prod_engines(Config& cfg, const YAML::Node& root) {
    if (auto v3 = root["signal_engine_v3"]) parse_v3_section(cfg, v3);
    if (auto ao = root["adaptive_order_selector"]) {
        if (ao["enabled"]) cfg.adaptive_order_enabled = ao["enabled"].as<bool>();
        if (ao["gtd_timeout_ms"])
            cfg.adaptive_gtd_seconds = (ao["gtd_timeout_ms"].as<int>() + 999) / 1000;
        if (ao["gtd_seconds"]) cfg.adaptive_gtd_seconds = ao["gtd_seconds"].as<int>();
    }
}

inline void parse_prod_risk(Config& cfg, const YAML::Node& root) {
    if (auto r = root["risk"]) {
        if (r["max_risk_per_trade_pct"])
            cfg.max_risk_per_trade_pct = r["max_risk_per_trade_pct"].as<double>();
        if (r["max_daily_drawdown_pct"])
            cfg.max_daily_drawdown_pct = r["max_daily_drawdown_pct"].as<double>();
        if (r["min_confidence"]) cfg.min_confidence = r["min_confidence"].as<double>();
        if (r["min_rr_ratio"]) cfg.min_rr_ratio = r["min_rr_ratio"].as<double>();
        if (r["max_position_size_pct"])
            cfg.max_position_size_pct = r["max_position_size_pct"].as<double>();
        if (r["max_open_positions"]) cfg.max_open_positions = r["max_open_positions"].as<int>();
        if (r["max_position_qty"]) cfg.max_position_qty = r["max_position_qty"].as<double>();
        if (r["max_total_exposure"]) cfg.max_total_exposure = r["max_total_exposure"].as<double>();
        if (r["daily_loss_limit"]) cfg.daily_loss_limit = r["daily_loss_limit"].as<double>();
        if (r["max_drawdown_pct"]) cfg.max_drawdown_pct = r["max_drawdown_pct"].as<double>();
        if (r["max_orders_per_second"])
            cfg.max_orders_per_second = r["max_orders_per_second"].as<int>();
        if (r["min_margin_ratio"]) cfg.min_margin_ratio = r["min_margin_ratio"].as<double>();
        if (r["max_leverage"]) cfg.max_leverage = r["max_leverage"].as<int>();
        if (r["initial_balance"]) cfg.initial_balance = r["initial_balance"].as<double>();
        // kill_switch is configured under `ipc.kill_switch` only — a second
        // block here would shadow the env-aware trigger_file (S196).
    }
}

inline void parse_prod_extras(Config& cfg, const YAML::Node& root) {
    if (auto pm = root["pressure_model"]) {
        if (pm["enabled"]) cfg.pressure_model_enabled = pm["enabled"].as<bool>();
        if (pm["toxicity_threshold"])
            cfg.v2_pressure_threshold = pm["toxicity_threshold"].as<double>();
        if (pm["toxic_penalty"]) cfg.v2_toxic_penalty = pm["toxic_penalty"].as<double>();
        if (pm["microprice_enabled"])
            cfg.pressure_microprice_enabled = pm["microprice_enabled"].as<bool>();
    }
    if (auto m = root["metrics"]) {
        if (m["enabled"]) cfg.metrics_enabled = m["enabled"].as<bool>();
        if (m["port"]) cfg.metrics_port = m["port"].as<int>();
        if (m["host"]) cfg.metrics_host = m["host"].as<std::string>();
    }
    if (auto syms = root["symbols"]) {
        if (syms.IsSequence() && syms.size() > 0 && syms[0]["name"]) {
            cfg.symbols.clear();
            for (const auto& s : syms)
                cfg.symbols.push_back(s["name"].as<std::string>());
        }
    }
    if (auto lo = root["latency_optimization"]) {
        if (lo["thread_pinning"]) cfg.thread_pinning_enabled = lo["thread_pinning"].as<bool>();
        if (lo["execution_thread_core"])
            cfg.execution_core_id = lo["execution_thread_core"].as<int>();
    }
}

} // namespace hft::detail
