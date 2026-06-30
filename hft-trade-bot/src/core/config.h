// Config manager — loads YAML configuration
#pragma once

#include <yaml-cpp/yaml.h>
#include <string>
#include <vector>
#include <optional>

namespace hft {

struct Config {
    // Connection
    std::string ws_url{"ws://localhost:8765"};
    std::string default_exchange{"binance"};

    // Trading
    std::vector<std::string> symbols{"BTC/USDT", "ETH/USDT", "SOL/USDT"};
    int signal_interval_seconds{60};
    int max_open_positions{3};
    bool paper_trading{true};

    // Risk
    double max_risk_per_trade_pct{2.0};
    double max_daily_drawdown_pct{8.0};
    double min_confidence{65.0};
    double min_rr_ratio{1.5};
    double stop_loss_pct{2.0};
    double take_profit_pct{4.0};
    double max_position_size_pct{10.0};

    // HFT strategies
    bool fast_ema_enabled{true};
    int fast_ema_period{9};
    int slow_ema_period{21};
    bool obi_enabled{true};  // Order Book Imbalance
    bool vwap_enabled{true};
    bool pressure_model_enabled{true};

    // HFT v2 — native signal engine
    bool signal_engine_v2_enabled{true};
    int v2_ema_fast_period{21};
    int v2_ema_slow_period{50};
    int v2_ema_signal_period{9};
    int v2_rsi_period{14};
    double v2_rsi_overbought{70.0};
    double v2_rsi_oversold{30.0};
    int v2_adx_period{14};
    double v2_adx_trend_threshold{25.0};
    double v2_adx_strong_threshold{40.0};
    int v2_obi_levels_5{5};
    int v2_obi_levels_10{10};
    int v2_obi_levels_20{20};
    int v2_atr_period{14};
    double v2_sl_atr_mult{1.5};
    double v2_tp_atr_mult{3.0};
    int64_t v2_cooldown_ms{5000};
    double v2_buy_threshold{0.3};
    double v2_sell_threshold{-0.3};
    uint8_t v2_min_confidence{60};

    // VWAP
    double v2_vwap_band_mult{2.0};
    double v2_vwap_dev_threshold{5.0};

    // Leverage
    bool v2_dynamic_leverage{true};
    uint8_t v2_max_leverage{5};
    uint8_t v2_high_confidence_leverage{3};
    uint8_t v2_emergency_confidence_threshold{85};
    double v2_emergency_adx_threshold{30.0};

    // Pressure model
    double v2_toxic_size_threshold{5.0};
    double v2_obi_threshold{0.15};
    double v2_pressure_threshold{0.2};
    double v2_toxic_penalty{0.5};
    int v2_body_direction_lookback{5};

    // Smart order router v2
    bool smart_router_enabled{true};
    int router_strategy{3};  // 0=BestPrice, 1=LowestLatency, 2=LowestFees, 3=BestEffective, 4=DepthAware
    int router_toxic_threshold{5};

    // Adaptive order selector v2
    bool adaptive_order_enabled{true};
    uint8_t adaptive_high_confidence{80};
    uint8_t adaptive_low_confidence{60};
    uint8_t adaptive_emergency_confidence{95};
    int adaptive_gtd_seconds{30};

    // Latency optimization
    bool thread_pinning_enabled{false};
    int execution_core_id{0};
    bool latency_histogram_enabled{true};

    // FFT (existing)
    bool fft_enabled{true};
    int fft_min_candles{64};

    // Logging
    std::string log_level{"info"};
    std::string log_file{"logs/hft_trade_bot.log"};

    // AI Signal Bot connection (optional)
    bool ai_signal_enabled{true};
    std::string ai_signal_ws_url{"ws://localhost:8766"};

    // Graceful shutdown
    int shutdown_timeout_seconds{10};

    static Config load(const std::string& path);
};

} // namespace hft
