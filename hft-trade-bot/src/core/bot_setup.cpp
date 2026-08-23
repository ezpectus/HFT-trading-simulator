#include "core/bot_setup.h"
#include "core/logger.h"

#include <csignal>
#include <filesystem>

#include <spdlog/spdlog.h>

namespace hft {

static std::atomic<bool> g_running{true};

static void signal_handler(int) { g_running = false; }
static void setup_real_exchanges(BotContext& ctx);
static void setup_sim_exchanges(BotContext& ctx);
static void init_shm_signal_consumer(BotContext& ctx);
static void init_shm_market_data(BotContext& ctx);

bool is_running() { return g_running.load(); }
void set_running(bool v) { g_running.store(v); }

static void log_banner(const Config& c) {
    spdlog::info("=" + std::string(60, '='));
    spdlog::info("  HFT TRADE BOT v{}", c.system_version);
    spdlog::info("  Mode: {}", c.is_production ? "PRODUCTION" : "SIMULATOR");
    spdlog::info("  Symbols: {}", fmt::join(c.symbols, ", "));
    spdlog::info("  Exchange: {}", c.default_exchange);
    spdlog::info("  Paper trading: {}", c.paper_trading);
    spdlog::info("  Signal Engine V2: {}", c.signal_engine_v2_enabled);
    spdlog::info("  Signal Engine V3: {}", c.signal_engine_v3_enabled);
    spdlog::info("  Smart Router: {}", c.smart_router_enabled);
    spdlog::info("  Adaptive Orders: {}", c.adaptive_order_enabled);
    spdlog::info("  Thread Pinning: {}", c.thread_pinning_enabled);
    if (c.is_production) {
        spdlog::info("  IPC: {} | FIX: {} | DB: {} | Redis: {} | Metrics: {}",
                     c.ipc_enabled, c.fix_enabled, !c.db_dsn.empty(),
                     c.redis_enabled, c.metrics_enabled);
    }
    spdlog::info("=" + std::string(60, '='));
}

static void setup_thread_pinning(const Config& c) {
    if (!c.thread_pinning_enabled) return;
    if (ThreadAffinity::pin_to_core(c.execution_core_id)) {
        spdlog::info("Execution thread pinned to core {}", c.execution_core_id);
    } else {
        spdlog::warn("Failed to pin thread to core {}", c.execution_core_id);
    }
    if (ThreadAffinity::set_priority_max()) {
        spdlog::info("Thread priority set to maximum");
    } else {
        spdlog::warn("Failed to set thread priority");
    }
}

bool init_config_and_logger(BotContext& ctx, int argc, char* argv[]) {
    std::string config_path = "config/config.yaml";
    if (argc > 1) config_path = argv[1];
    std::filesystem::create_directories("logs");
    ctx.config = Config::load(config_path);
    Logger::init(ctx.config.log_level, "logs", ctx.config.is_production);
    log_banner(ctx.config);
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    setup_thread_pinning(ctx.config);
    return true;
}

void init_core_components(BotContext& ctx) {
    ctx.receiver = std::make_unique<SignalReceiver>(ctx.config.ws_url);
    if (ctx.config.ai_signal_enabled) {
        ctx.ai_signal_receiver = std::make_unique<SignalReceiver>(ctx.config.ai_signal_ws_url);
    }
    ctx.risk_mgr = std::make_unique<RiskManager>(RiskManager::Params{
        ctx.config.max_risk_per_trade_pct, ctx.config.max_daily_drawdown_pct,
        ctx.config.min_confidence, ctx.config.min_rr_ratio,
        ctx.config.max_position_size_pct, ctx.config.max_open_positions,
        ctx.config.max_position_qty, ctx.config.max_total_exposure,
        ctx.config.daily_loss_limit, ctx.config.max_drawdown_pct,
        ctx.config.max_orders_per_second, ctx.config.min_margin_ratio,
        static_cast<double>(ctx.config.max_leverage), {}, {},
    });
    ctx.executor = std::make_unique<OrderExecutor>(ctx.config.ws_url, ctx.config.default_exchange);
}

static SignalEngineV2::Params make_v2_params(const Config& c) {
    SignalEngineV2::Params p;
    p.ema_fast_period                = c.v2_ema_fast_period;
    p.ema_slow_period                = c.v2_ema_slow_period;
    p.ema_signal_period              = c.v2_ema_signal_period;
    p.rsi_period                     = c.v2_rsi_period;
    p.rsi_overbought                 = c.v2_rsi_overbought;
    p.rsi_oversold                   = c.v2_rsi_oversold;
    p.adx_period                     = c.v2_adx_period;
    p.adx_trend_threshold            = c.v2_adx_trend_threshold;
    p.adx_strong_threshold           = c.v2_adx_strong_threshold;
    p.obi_levels_5                   = c.v2_obi_levels_5;
    p.obi_levels_10                  = c.v2_obi_levels_10;
    p.obi_levels_20                  = c.v2_obi_levels_20;
    p.atr_period                     = c.v2_atr_period;
    p.sl_atr_mult                    = c.v2_sl_atr_mult;
    p.tp_atr_mult                    = c.v2_tp_atr_mult;
    p.cooldown_ms                    = c.v2_cooldown_ms;
    p.buy_threshold                  = c.v2_buy_threshold;
    p.sell_threshold                 = c.v2_sell_threshold;
    p.min_confidence                 = c.v2_min_confidence;
    p.obi_threshold                  = c.v2_obi_threshold;
    p.pressure_threshold             = c.v2_pressure_threshold;
    p.vwap_band_mult                 = c.v2_vwap_band_mult;
    p.vwap_dev_threshold             = c.v2_vwap_dev_threshold;
    p.toxic_penalty                  = c.v2_toxic_penalty;
    p.body_direction_lookback        = c.v2_body_direction_lookback;
    p.dynamic_leverage               = c.v2_dynamic_leverage;
    p.max_leverage                   = c.v2_max_leverage;
    p.high_confidence_leverage       = c.v2_high_confidence_leverage;
    p.emergency_confidence_threshold = c.v2_emergency_confidence_threshold;
    p.emergency_adx_threshold        = c.v2_emergency_adx_threshold;
    p.w_ema                          = c.v2_weight_ema;
    p.w_rsi                          = c.v2_weight_rsi;
    p.w_obi                          = c.v2_weight_obi;
    p.w_vwap                         = c.v2_weight_vwap;
    p.w_adx                          = c.v2_weight_adx;
    p.w_pressure                     = c.v2_weight_pressure;
    return p;
}

bool init_signal_engines(BotContext& ctx) {
    auto v2_params = make_v2_params(ctx.config);
    if (!v2_params.validate()) {
        spdlog::error("Signal Engine V2 params invalid: {}", v2_params.validation_error());
        return false;
    }
    ctx.engine_v2 = std::make_unique<SignalEngineV2>(v2_params);
    ctx.engine_v2->prepopulate(ctx.config.symbols);
    if (ctx.config.signal_engine_v3_enabled) {
        ctx.engine_v3 = std::make_unique<SignalEngineV3>(v2_params, SignalEngineV3::Params{});
        ctx.engine_v3->prepopulate(ctx.config.symbols);
        spdlog::info("Signal Engine V3: HMM regime detection ENABLED");
    }
    PressureModel::Params pp;
    pp.toxic_size_threshold = ctx.config.v2_toxic_size_threshold;
    ctx.pressure_model = std::make_unique<PressureModel>(pp);
    SignalEngine::Params ep;
    ep.fast_ema_period  = ctx.config.fast_ema_period;
    ep.slow_ema_period  = ctx.config.slow_ema_period;
    ep.obi_enabled      = ctx.config.obi_enabled;
    ep.vwap_enabled     = ctx.config.vwap_enabled;
    ep.pressure_enabled = ctx.config.pressure_model_enabled;
    ctx.engine_v1 = std::make_unique<SignalEngine>(ep);
    return true;
}

void init_order_routing(BotContext& ctx) {
    SmartOrderRouterV2::RoutingConfig rc;
    rc.strategy        = static_cast<SmartOrderRouterV2::Strategy>(ctx.config.router_strategy);
    rc.toxic_threshold = ctx.config.router_toxic_threshold;
    ctx.router = std::make_unique<SmartOrderRouterV2>(rc);
    AdaptiveOrderSelectorV2::Params ap;
    ap.high_confidence      = ctx.config.adaptive_high_confidence;
    ap.low_confidence       = ctx.config.adaptive_low_confidence;
    ap.emergency_confidence = ctx.config.adaptive_emergency_confidence;
    ap.gtd_seconds          = ctx.config.adaptive_gtd_seconds;
    ctx.adaptive_selector   = std::make_unique<AdaptiveOrderSelectorV2>(ap);
    if (ctx.config.is_production && ctx.config.smart_router_enabled) {
        setup_real_exchanges(ctx);
    } else if (ctx.config.smart_router_enabled) {
        setup_sim_exchanges(ctx);
    }
}

static void setup_real_exchanges(BotContext& ctx) {
    if (ctx.config.binance_cfg.enabled) {
        BinanceAdapter::Config bcfg;
        bcfg.api_key    = ctx.config.binance_cfg.api_key;
        bcfg.api_secret = ctx.config.binance_cfg.api_secret;
        bcfg.base_url   = ctx.config.binance_cfg.rest_url;
        bcfg.ws_url     = ctx.config.binance_cfg.ws_url;
        ctx.real_binance = std::make_unique<BinanceAdapter>(bcfg);
        ctx.router->add_exchange(ctx.real_binance.get());
        spdlog::info("Router: Binance adapter connected (ws={})", bcfg.ws_url);
    }
    if (ctx.config.okx_cfg.enabled) {
        OKXAdapter::Config ocfg;
        ocfg.api_key    = ctx.config.okx_cfg.api_key;
        ocfg.api_secret = ctx.config.okx_cfg.api_secret;
        ocfg.passphrase = ctx.config.okx_cfg.passphrase;
        ocfg.base_url   = ctx.config.okx_cfg.rest_url;
        ocfg.ws_url     = ctx.config.okx_cfg.ws_url;
        ocfg.inst_type  = ctx.config.okx_cfg.inst_type;
        ctx.real_okx    = std::make_unique<OKXAdapter>(ocfg);
        ctx.router->add_exchange(ctx.real_okx.get());
        spdlog::info("Router: OKX adapter connected (ws={})", ocfg.ws_url);
    }
    if (ctx.config.bybit_cfg.enabled) {
        BybitAdapter::Config ycfg;
        ycfg.api_key    = ctx.config.bybit_cfg.api_key;
        ycfg.api_secret = ctx.config.bybit_cfg.api_secret;
        ycfg.base_url   = ctx.config.bybit_cfg.rest_url;
        ycfg.ws_url     = ctx.config.bybit_cfg.ws_url;
        ycfg.category   = ctx.config.bybit_cfg.category;
        ctx.real_bybit  = std::make_unique<BybitAdapter>(ycfg);
        ctx.router->add_exchange(ctx.real_bybit.get());
        spdlog::info("Router: Bybit adapter connected (ws={})", ycfg.ws_url);
    }
}

static void setup_sim_exchanges(BotContext& ctx) {
    ctx.sim_binance = std::make_unique<SimExchange>("binance", 0.02, 0.04, *ctx.receiver);
    ctx.sim_okx     = std::make_unique<SimExchange>("okx", 0.01, 0.03, *ctx.receiver);
    ctx.sim_bybit   = std::make_unique<SimExchange>("bybit", 0.03, 0.05, *ctx.receiver);
    ctx.sim_binance->record_latency(120);
    ctx.sim_okx->record_latency(200);
    ctx.sim_bybit->record_latency(350);
    ctx.router->add_exchange(ctx.sim_binance.get());
    ctx.router->add_exchange(ctx.sim_okx.get());
    ctx.router->add_exchange(ctx.sim_bybit.get());
    spdlog::info("Router: 3 simulated exchanges (simulator mode)");
}

void init_kill_switch(BotContext& ctx) {
    ctx.kill_switch = std::make_unique<KillSwitch>(ctx.config.kill_switch_trigger_file, "/hft_kill_switch");
    ctx.kill_switch->set_cancel_all_callback([&]() {
        spdlog::warn("KILL SWITCH: Cancelling all open orders...");
    });
    ctx.kill_switch->set_close_all_callback([&]() {
        spdlog::warn("KILL SWITCH: Closing all positions at market...");
        auto positions = ctx.pos_mgr.get_positions();
        for (const auto& pos : positions) {
            ctx.executor->close_position(pos.symbol);
            ctx.pos_mgr.close_position(pos.symbol, ctx.receiver->get_price(pos.symbol));
        }
    });
    ctx.kill_switch->set_notify_callback([&](KillSwitch::Reason reason) {
        const char* rs[] = {"MANUAL", "DAILY_LOSS", "MAX_DRAWDOWN", "MARGIN_CALL", "FILE_TRIGGER"};
        spdlog::critical("KILL SWITCH ACTIVATED: reason={}", rs[static_cast<int>(reason)]);
    });
    if (!ctx.kill_switch->init_shm()) {
        spdlog::warn("Kill switch SHM init failed — file-based trigger still active");
    }
    ctx.kill_switch->start_monitoring(ctx.config.kill_switch_poll_interval_ms);
    spdlog::info("Kill switch armed (trigger: {})", ctx.config.kill_switch_trigger_file);
}

void init_monitoring(BotContext& ctx) {
    ctx.health_server = std::make_unique<HealthServer>(
        ctx.config.is_production ? ctx.config.metrics_port : 9091);
    ctx.health_server->start(&ctx.sys_monitor);
}

void init_ipc(BotContext& ctx) {
    if (!ctx.config.ipc_enabled) return;
    ctx.shm_fill_producer = std::make_unique<ipc::ShmFillProducer>(
        ctx.config.ipc_fills_shm, ctx.config.ipc_fills_capacity);
    if (ctx.shm_fill_producer->init()) {
        spdlog::info("SHM IPC: fill producer ready (shm={})", ctx.config.ipc_fills_shm);
    } else {
        spdlog::warn("SHM IPC: fill producer init failed — fills won't be shared with Python");
        ctx.shm_fill_producer.reset();
    }
    init_shm_signal_consumer(ctx);
    init_shm_market_data(ctx);
}

static void init_shm_signal_consumer(BotContext& ctx) {
    ctx.shm_signal_consumer = std::make_unique<ipc::ShmSignalConsumer>(
        ctx.config.ipc_signals_shm, ctx.config.ipc_signals_capacity);
    try {
        ctx.shm_signal_consumer->start([&](const ipc::SignalMsg& msg) {
            Signal sig;
            sig.symbol = (msg.symbol_id < ctx.config.symbols.size())
                             ? ctx.config.symbols[msg.symbol_id] : "UNKNOWN";
            sig.direction   = (msg.action == 1) ? "LONG" : (msg.action == 2) ? "SHORT" : "NEUTRAL";
            sig.confidence  = msg.confidence * 100.0f;
            sig.entry_price = msg.price;
            sig.stop_loss   = msg.sl;
            sig.take_profit = msg.tp;
            sig.leverage    = msg.leverage;
            if (sig.direction == "LONG" || sig.direction == "SHORT") {
                std::lock_guard<std::mutex> lk(ctx.ai_signal_queue_mtx);
                if (!ctx.ai_signal_queue.push(sig)) {
                    spdlog::warn("AI signal queue full — signal dropped");
                } else {
                    ctx.sys_monitor.increment(SystemMonitor::Metric::SIGNALS_RECEIVED);
                }
            }
        });
        spdlog::info("SHM IPC: signal consumer started (shm={})", ctx.config.ipc_signals_shm);
    } catch (const std::exception& e) {
        spdlog::warn("SHM IPC: signal consumer failed to start: {}", e.what());
        ctx.shm_signal_consumer.reset();
    }
}

static void init_shm_market_data(BotContext& ctx) {
    try {
        ctx.shm_market_data = std::make_unique<ipc::ShmMarketData>(
            ctx.config.ipc_market_data_shm,
            static_cast<uint8_t>(ctx.config.ipc_market_data_max_symbols), false);
        spdlog::info("SHM IPC: market data consumer ready (shm={}, max_symbols={})",
                     ctx.config.ipc_market_data_shm, ctx.config.ipc_market_data_max_symbols);
    } catch (const std::exception& e) {
        spdlog::warn("SHM IPC: market data consumer failed: {}", e.what());
        ctx.shm_market_data.reset();
    }
}

void init_callbacks(BotContext& ctx) {
    if (ctx.ai_signal_receiver) {
        ctx.ai_signal_receiver->on_signal([&](const Signal& sig) {
            if (sig.direction == "LONG" || sig.direction == "SHORT") {
                std::lock_guard<std::mutex> lk(ctx.ai_signal_queue_mtx);
                if (!ctx.ai_signal_queue.push(sig)) {
                    spdlog::warn("AI signal queue full — signal dropped");
                } else {
                    ctx.sys_monitor.increment(SystemMonitor::Metric::SIGNALS_RECEIVED);
                }
            }
        });
    }
    ctx.receiver->on_arbitrage([&](const std::string& symbol, const std::string& buy_ex,
                                   const std::string& sell_ex, double buy_p, double sell_p,
                                   double spread_bps, double max_qty) {
        ctx.arb_lock.lock();
        ctx.latest_arb = {symbol, buy_ex, sell_ex, buy_p, sell_p, spread_bps, max_qty};
        ctx.arb_lock.unlock();
        ctx.has_arb_opportunity = true;
    });
}

bool connect_all(BotContext& ctx) {
    if (!ctx.receiver->connect()) {
        spdlog::error("Failed to connect to exchange simulator");
        return false;
    }
    if (ctx.ai_signal_receiver && ctx.ai_signal_receiver->connect()) {
        spdlog::info("Connected to AI Signal Bot ({})", ctx.config.ai_signal_ws_url);
    } else if (ctx.config.ai_signal_enabled) {
        spdlog::warn("Could not connect to AI Signal Bot — running in standalone HFT mode");
    }
    if (!ctx.executor->connect()) {
        spdlog::warn("Order executor failed to connect (orders will be logged only)");
    }
    std::this_thread::sleep_for(std::chrono::seconds(2));
    spdlog::info("HFT Trade Bot v2 running. Press Ctrl+C to stop.");
    if (ctx.config.thread_pinning_enabled) {
        if (ThreadAffinity::pin_to_core(ctx.config.execution_core_id)) {
            spdlog::info("Main loop thread pinned to core {}", ctx.config.execution_core_id);
        } else {
            spdlog::warn("Could not pin thread to core {}", ctx.config.execution_core_id);
        }
    }
    return true;
}

void init_symbol_entries(BotContext& ctx) {
    ctx.prices_cache.reserve(ctx.config.symbols.size());
    ctx.candles_buf.reserve(100);
    ctx.receiver->register_symbols(ctx.config.symbols);
    ctx.symbol_entries.clear();
    for (size_t i = 0; i < ctx.config.symbols.size(); ++i) {
        ctx.symbol_entries.push_back(
            {ctx.config.symbols[i], ctx.config.symbols[i].c_str(), static_cast<uint16_t>(i)});
    }
}

} // namespace hft
