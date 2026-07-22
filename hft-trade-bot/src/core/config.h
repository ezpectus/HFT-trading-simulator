// Config manager — loads YAML configuration
#pragma once

#include <yaml-cpp/yaml.h>
#include <string>
#include <vector>
#include <optional>
#include <cstdint>

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

    // Signal Engine V3 — HMM regime detection
    bool signal_engine_v3_enabled{false};  // Off by default, opt-in

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

    // ── Production config fields ──
    bool is_production{false};
    std::string system_version{"2.0.0"};

    // Real exchange adapters
    struct ExchangeConfig {
        bool enabled{false};
        std::string ws_url;
        std::string rest_url;
        std::string api_key;
        std::string api_secret;
        std::string passphrase;      // OKX only
        std::string inst_type;       // OKX: SWAP
        std::string category;        // Bybit: linear
        double maker_bps{2.0};   // Binance default: 0.02% = 2 bps
        double taker_bps{5.0};   // Binance default: 0.05% = 5 bps
        int rate_limit_weight_per_min{1200};
        int rate_limit_orders_per_min{1200};
    };
    std::vector<std::string> active_exchanges;
    bool fallback_to_simulator{true};
    std::string simulator_ws_url{"ws://localhost:8765"};
    ExchangeConfig binance_cfg;
    ExchangeConfig okx_cfg;
    ExchangeConfig bybit_cfg;

    // IPC / SHM
    bool ipc_enabled{false};
    std::string ipc_signals_shm{"/hft_signals"};
    int ipc_signals_capacity{4096};
    std::string ipc_fills_shm{"/hft_fills"};
    int ipc_fills_capacity{4096};
    std::string ipc_market_data_shm{"/hft_market"};
    int ipc_market_data_max_symbols{10};
    std::string kill_switch_trigger_file{"logs/kill_switch_trigger"};
    int kill_switch_poll_interval_ms{250};

    // FIX 4.4
    bool fix_enabled{false};
    std::string fix_sender_comp_id{"HFTBOT"};
    std::string fix_target_comp_id{"EXCHANGE"};
    std::string fix_seq_file{"logs/fix_seq.txt"};
    int fix_heart_bt_int{30};

    // Database (PostgreSQL)
    std::string db_dsn;
    int db_pool_min{2};
    int db_pool_max{10};
    bool db_persist_trades{false};
    bool db_persist_signals{false};
    bool db_persist_positions{false};
    bool db_persist_candles{false};

    // Redis
    bool redis_enabled{false};
    std::string redis_url;
    int redis_cache_ttl{60};

    // Prometheus metrics
    bool metrics_enabled{false};
    int metrics_port{9090};
    std::string metrics_host{"0.0.0.0"};

    // Production risk limits
    double max_position_qty{100.0};
    double max_total_exposure{100000.0};
    double daily_loss_limit{10000.0};
    double max_drawdown_pct{0.15};
    int max_orders_per_second{100};
    double min_margin_ratio{0.05};
    int max_leverage{20};

    // Signal Engine V2 weights (prod format)
    double v2_weight_ema{0.20};
    double v2_weight_rsi{0.15};
    double v2_weight_obi{0.20};
    double v2_weight_vwap{0.15};
    double v2_weight_adx{0.10};
    double v2_weight_pressure{0.20};
    // Note: v2_min_composite and v2_vwap_window are loaded from YAML
    // but not currently used by SignalEngineV2::Params. Reserved for future use.
    double v2_min_composite{0.35};
    int v2_vwap_window{60};

    static Config load(const std::string& path);
};

} // namespace hft
