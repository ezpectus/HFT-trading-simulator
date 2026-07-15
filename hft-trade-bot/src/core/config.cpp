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
        spdlog::warn("Config: max_risk_per_trade_pct={} out of range (0, 100]. "
                     "Recommended: 1.0-5.0. Set risk.risk_per_trade_pct in config.yaml", cfg.max_risk_per_trade_pct);
    if (cfg.max_daily_drawdown_pct <= 0 || cfg.max_daily_drawdown_pct > 100)
        spdlog::warn("Config: max_daily_drawdown_pct={} out of range (0, 100]. "
                     "Recommended: 5.0-15.0. Set risk.max_daily_drawdown_pct in config.yaml", cfg.max_daily_drawdown_pct);
    if (cfg.stop_loss_pct <= 0 || cfg.stop_loss_pct > 50)
        spdlog::warn("Config: stop_loss_pct={} out of range (0, 50]. "
                     "Recommended: 1.0-5.0. Set risk.stop_loss_pct in config.yaml", cfg.stop_loss_pct);
    if (cfg.take_profit_pct <= 0 || cfg.take_profit_pct > 100)
        spdlog::warn("Config: take_profit_pct={} out of range (0, 100]. "
                     "Recommended: 2.0-10.0. Set risk.take_profit_pct in config.yaml", cfg.take_profit_pct);
    if (cfg.min_rr_ratio < 0)
        spdlog::warn("Config: min_rr_ratio={} should be non-negative. "
                     "Recommended: 1.5-3.0. Set risk.min_rr_ratio in config.yaml", cfg.min_rr_ratio);
    if (cfg.max_position_size_pct <= 0 || cfg.max_position_size_pct > 100)
        spdlog::warn("Config: max_position_size_pct={} out of range (0, 100]. "
                     "Recommended: 5.0-20.0. Set risk.max_position_size_pct in config.yaml", cfg.max_position_size_pct);

    // Trading parameters
    if (cfg.signal_interval_seconds < 1)
        spdlog::warn("Config: signal_interval_seconds={} should be >= 1. "
                     "Set trading.signal_interval_seconds in config.yaml", cfg.signal_interval_seconds);
    if (cfg.max_open_positions < 1)
        spdlog::warn("Config: max_open_positions={} should be >= 1. "
                     "Set trading.max_open_positions in config.yaml", cfg.max_open_positions);
    if (cfg.symbols.empty())
        spdlog::warn("Config: no trading symbols configured. "
                     "Add symbols under trading.symbols in config.yaml");

    // EMA periods
    if (cfg.fast_ema_period >= cfg.slow_ema_period)
        spdlog::warn("Config: fast_ema_period={} should be < slow_ema_period={}. "
                     "Set hft_strategies.fast_ema_period and slow_ema_period in config.yaml",
            cfg.fast_ema_period, cfg.slow_ema_period);
    if (cfg.fast_ema_period < 2)
        spdlog::warn("Config: fast_ema_period={} should be >= 2. "
                     "Set hft_strategies.fast_ema_period in config.yaml", cfg.fast_ema_period);

    // WebSocket URL
    if (cfg.ws_url.find("ws://") != 0 && cfg.ws_url.find("wss://") != 0)
        spdlog::warn("Config: websocket_url '{}' should start with ws:// or wss://. "
                     "Set exchange.websocket_url in config.yaml", cfg.ws_url);

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

    // Signal Engine V3 — HMM regime detection
    if (auto v3 = root["signal_engine_v3"]) {
        if (v3["enabled"]) cfg.signal_engine_v3_enabled = v3["enabled"].as<bool>();
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

    // ─── Production format detection ───
    if (root["system"]) {
        cfg.is_production = true;
        auto sys = root["system"];
        if (sys["mode"]) {
            std::string mode = sys["mode"].as<std::string>();
            cfg.paper_trading = (mode != "production");
        }
        if (sys["version"]) cfg.system_version = sys["version"].as<std::string>();
        if (sys["log_level"]) cfg.log_level = sys["log_level"].as<std::string>();
        if (sys["log_file"]) cfg.log_file = sys["log_file"].as<std::string>();
        spdlog::info("Config: production mode detected (v{})", cfg.system_version);
    }

    // ─── Production: exchange config ───
    if (auto ex = root["exchange"]) {
        if (ex["active"]) {
            cfg.active_exchanges.clear();
            for (const auto& name : ex["active"]) {
                cfg.active_exchanges.push_back(name.as<std::string>());
            }
        }
        if (ex["fallback_to_simulator"]) cfg.fallback_to_simulator = ex["fallback_to_simulator"].as<bool>();
        if (ex["simulator_ws_url"]) {
            cfg.simulator_ws_url = ex["simulator_ws_url"].as<std::string>();
            cfg.ws_url = cfg.simulator_ws_url; // Default ws_url to simulator for fallback
        }

        // Parse each exchange
        auto parse_exchange = [](const YAML::Node& node, Config::ExchangeConfig& ec) {
            if (!node) return;
            if (node["enabled"]) ec.enabled = node["enabled"].as<bool>();
            if (node["ws_url"]) ec.ws_url = node["ws_url"].as<std::string>();
            if (node["rest_url"]) ec.rest_url = node["rest_url"].as<std::string>();
            if (node["api_key"]) ec.api_key = node["api_key"].as<std::string>();
            if (node["api_secret"]) ec.api_secret = node["api_secret"].as<std::string>();
            if (node["passphrase"]) ec.passphrase = node["passphrase"].as<std::string>();
            if (node["inst_type"]) ec.inst_type = node["inst_type"].as<std::string>();
            if (node["category"]) ec.category = node["category"].as<std::string>();
            if (auto fees = node["fees"]) {
                if (fees["maker_bps"]) ec.maker_bps = fees["maker_bps"].as<double>();
                if (fees["taker_bps"]) ec.taker_bps = fees["taker_bps"].as<double>();
            }
            if (auto rl = node["rate_limit"]) {
                if (rl["weight_per_min"]) ec.rate_limit_weight_per_min = rl["weight_per_min"].as<int>();
                if (rl["orders_per_min"]) ec.rate_limit_orders_per_min = rl["orders_per_min"].as<int>();
            }
        };
        parse_exchange(ex["binance"], cfg.binance_cfg);
        parse_exchange(ex["okx"], cfg.okx_cfg);
        parse_exchange(ex["bybit"], cfg.bybit_cfg);

        // Set default exchange to first active
        if (!cfg.active_exchanges.empty()) {
            cfg.default_exchange = cfg.active_exchanges[0];
        }
        // If any real exchange is enabled, use its ws_url
        if (cfg.binance_cfg.enabled && !cfg.binance_cfg.ws_url.empty()) {
            cfg.ws_url = cfg.binance_cfg.ws_url;
        }
    }

    // ─── Production: IPC / SHM ───
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
            if (ks["shm_name"]) cfg.kill_switch_trigger_file = ks["trigger_file"].as<std::string>();
            if (ks["poll_interval_ms"]) cfg.kill_switch_poll_interval_ms = ks["poll_interval_ms"].as<int>();
        }
    }

    // ─── Production: FIX 4.4 ───
    if (auto fix = root["fix"]) {
        if (fix["enabled"]) cfg.fix_enabled = fix["enabled"].as<bool>();
        if (fix["sender_comp_id"]) cfg.fix_sender_comp_id = fix["sender_comp_id"].as<std::string>();
        if (fix["target_comp_id"]) cfg.fix_target_comp_id = fix["target_comp_id"].as<std::string>();
        if (fix["seq_file"]) cfg.fix_seq_file = fix["seq_file"].as<std::string>();
        if (fix["heart_bt_int"]) cfg.fix_heart_bt_int = fix["heart_bt_int"].as<int>();
    }

    // ─── Production: Signal Engine V2 weights ───
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
            if (th["min_confidence"]) cfg.v2_min_confidence = static_cast<uint8_t>(th["min_confidence"].as<int>());
            if (th["min_composite"]) cfg.v2_min_composite = th["min_composite"].as<double>();
        }
        if (auto p = v2["periods"]) {
            if (p["ema_fast"]) cfg.v2_ema_fast_period = p["ema_fast"].as<int>();
            if (p["ema_slow"]) cfg.v2_ema_slow_period = p["ema_slow"].as<int>();
            if (p["rsi_period"]) cfg.v2_rsi_period = p["rsi_period"].as<int>();
            if (p["adx_period"]) cfg.v2_adx_period = p["adx_period"].as<int>();
            if (p["vwap_window"]) cfg.v2_vwap_window = p["vwap_window"].as<int>();
        }
    }

    // ─── Production: pressure model ───
    if (auto pm = root["pressure_model"]) {
        if (pm["enabled"]) cfg.pressure_model_enabled = pm["enabled"].as<bool>();
        if (pm["toxicity_threshold"]) cfg.v2_toxic_penalty = pm["toxicity_threshold"].as<double>();
    }

    // ─── Production: smart order router ───
    if (auto sr = root["smart_order_router"]) {
        if (sr["strategy"]) {
            std::string strat = sr["strategy"].as<std::string>();
            if (strat == "best_price") cfg.router_strategy = 0;
            else if (strat == "lowest_latency") cfg.router_strategy = 1;
            else if (strat == "lowest_fees") cfg.router_strategy = 2;
            else if (strat == "best_effective") cfg.router_strategy = 3;
            else if (strat == "depth_aware") cfg.router_strategy = 4;
        }
        if (sr["toxic_threshold"]) cfg.router_toxic_threshold = sr["toxic_threshold"].as<int>();
    }

    // ─── Production: Signal Engine V3 (HMM regime detection) ───
    if (auto v3 = root["signal_engine_v3"]) {
        if (v3["enabled"]) cfg.signal_engine_v3_enabled = v3["enabled"].as<bool>();
    }

    // ─── Production: adaptive order selector ───
    if (auto ao = root["adaptive_order_selector"]) {
        if (ao["enabled"]) cfg.adaptive_order_enabled = ao["enabled"].as<bool>();
        if (ao["gtd_timeout_ms"]) cfg.adaptive_gtd_seconds = ao["gtd_timeout_ms"].as<int>() / 1000;
    }

    // ─── Production: risk (extended) ───
    if (auto r = root["risk"]) {
        // Standard risk fields (same keys as dev)
        if (r["max_risk_per_trade_pct"]) cfg.max_risk_per_trade_pct = r["max_risk_per_trade_pct"].as<double>();
        if (r["max_daily_drawdown_pct"]) cfg.max_daily_drawdown_pct = r["max_daily_drawdown_pct"].as<double>();
        if (r["min_confidence"]) cfg.min_confidence = r["min_confidence"].as<double>();
        if (r["min_rr_ratio"]) cfg.min_rr_ratio = r["min_rr_ratio"].as<double>();
        if (r["max_position_size_pct"]) cfg.max_position_size_pct = r["max_position_size_pct"].as<double>();
        if (r["max_open_positions"]) cfg.max_open_positions = r["max_open_positions"].as<int>();
        // Prod-specific
        if (r["max_position_qty"]) cfg.max_position_qty = r["max_position_qty"].as<double>();
        if (r["max_total_exposure"]) cfg.max_total_exposure = r["max_total_exposure"].as<double>();
        if (r["daily_loss_limit"]) cfg.daily_loss_limit = r["daily_loss_limit"].as<double>();
        if (r["max_drawdown_pct"]) cfg.max_drawdown_pct = r["max_drawdown_pct"].as<double>();
        if (r["max_orders_per_second"]) cfg.max_orders_per_second = r["max_orders_per_second"].as<int>();
        if (r["min_margin_ratio"]) cfg.min_margin_ratio = r["min_margin_ratio"].as<double>();
        if (r["max_leverage"]) cfg.max_leverage = r["max_leverage"].as<int>();
        // Kill switch in risk section
        if (auto ks = r["kill_switch"]) {
            if (ks["trigger_file"]) cfg.kill_switch_trigger_file = ks["trigger_file"].as<std::string>();
        }
    }

    // ─── Production: database ───
    if (auto db = root["database"]) {
        if (db["dsn"]) cfg.db_dsn = db["dsn"].as<std::string>();
        if (db["pool_min"]) cfg.db_pool_min = db["pool_min"].as<int>();
        if (db["pool_max"]) cfg.db_pool_max = db["pool_max"].as<int>();
        if (db["persist_trades"]) cfg.db_persist_trades = db["persist_trades"].as<bool>();
        if (db["persist_signals"]) cfg.db_persist_signals = db["persist_signals"].as<bool>();
        if (db["persist_positions"]) cfg.db_persist_positions = db["persist_positions"].as<bool>();
        if (db["persist_candles"]) cfg.db_persist_candles = db["persist_candles"].as<bool>();
    }

    // ─── Production: Redis ───
    if (auto redis = root["redis"]) {
        if (redis["enabled"]) cfg.redis_enabled = redis["enabled"].as<bool>();
        if (redis["url"]) cfg.redis_url = redis["url"].as<std::string>();
        if (redis["cache_ttl"]) cfg.redis_cache_ttl = redis["cache_ttl"].as<int>();
    }

    // ─── Production: metrics ───
    if (auto m = root["metrics"]) {
        if (m["enabled"]) cfg.metrics_enabled = m["enabled"].as<bool>();
        if (m["port"]) cfg.metrics_port = m["port"].as<int>();
        if (m["host"]) cfg.metrics_host = m["host"].as<std::string>();
    }

    // ─── Production: symbols (list of objects with name/id/max_leverage) ───
    if (auto syms = root["symbols"]) {
        if (syms.IsSequence() && !syms[0]["name"]) {
            // Dev format: simple string list
        } else if (syms.IsSequence() && syms[0]["name"]) {
            // Prod format: list of objects
            cfg.symbols.clear();
            for (const auto& s : syms) {
                cfg.symbols.push_back(s["name"].as<std::string>());
            }
        }
    }

    // ─── Production: latency optimization ───
    if (auto lo = root["latency_optimization"]) {
        if (lo["thread_pinning"]) cfg.thread_pinning_enabled = lo["thread_pinning"].as<bool>();
        if (lo["execution_thread_core"]) cfg.execution_core_id = lo["execution_thread_core"].as<int>();
    }

    validate_config(cfg);
    return cfg;
}

} // namespace hft
