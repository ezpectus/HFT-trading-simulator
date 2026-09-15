#include "core/bot_setup.h"
#include "core/logger.h"

#include <csignal>
#include <filesystem>
#include <unordered_set>

#include <spdlog/spdlog.h>

namespace hft {

static std::atomic<bool> g_running{true};

static void signal_handler(int) {
    g_running = false;
}
static void init_shm_signal_consumer(BotContext& ctx);
static void init_shm_market_data(BotContext& ctx);

bool is_running() {
    return g_running.load();
}
void set_running(bool v) {
    g_running.store(v);
}

static void log_banner(const Config& c) {
    spdlog::info("=" + std::string(60, '='));
    spdlog::info("  HFT TRADE BOT v{}", c.system_version);
    spdlog::info("  Mode: {}", c.is_production ? "PRODUCTION" : "SIMULATOR");
    spdlog::info("  Symbols: {}", fmt::join(c.symbols, ", "));
    spdlog::info("  Exchange: {}", c.default_exchange);
    spdlog::info("  Signal Engine V2: {}", c.signal_engine_v2_enabled);
    spdlog::info("  Signal Engine V3: {}", c.signal_engine_v3_enabled);
    spdlog::info("  Adaptive Orders: {}", c.adaptive_order_enabled);
    spdlog::info("  Thread Pinning: {}", c.thread_pinning_enabled);
    if (c.is_production) {
        spdlog::info("  IPC: {} | Metrics: {}", c.ipc_enabled, c.metrics_enabled);
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
    ctx.config = Config::load(config_path);
    Logger::init(ctx.config.log_level, ctx.config.log_file, ctx.config.is_production,
                 &ctx.sys_monitor);
    log_banner(ctx.config);
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    setup_thread_pinning(ctx.config);
    return true;
}

void init_core_components(BotContext& ctx) {
    ctx.receiver = std::make_unique<SignalReceiver>(ctx.config.ws_url);
    ctx.receiver->set_default_exchange(ctx.config.default_exchange);
    if (ctx.config.ai_signal_enabled) {
        ctx.ai_signal_receiver = std::make_unique<SignalReceiver>(ctx.config.ai_signal_ws_url);
    }
    ctx.risk_mgr = std::make_unique<RiskManager>(RiskManager::Params{
        ctx.config.max_risk_per_trade_pct,
        ctx.config.max_daily_drawdown_pct,
        ctx.config.min_confidence,
        ctx.config.min_rr_ratio,
        ctx.config.max_position_size_pct,
        ctx.config.max_open_positions,
        ctx.config.max_position_qty,
        ctx.config.max_total_exposure,
        ctx.config.daily_loss_limit,
        ctx.config.max_drawdown_pct,
        ctx.config.max_orders_per_second,
        ctx.config.min_margin_ratio,
        static_cast<double>(ctx.config.max_leverage),
        ctx.config.blacklisted_symbols,
        ctx.config.per_symbol_max_qty,
    });
    ctx.executor = std::make_unique<OrderExecutor>(ctx.config.ws_url, ctx.config.default_exchange);
    ctx.balance.store(ctx.config.initial_balance, std::memory_order_relaxed);
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

static SignalEngineV3::Params make_v3_params(const Config& c) {
    SignalEngineV3::Params p;
    p.trend_boost            = c.v3_trend_boost;
    p.trend_dampen           = c.v3_trend_dampen;
    p.range_confidence_cap   = c.v3_range_confidence_cap;
    p.volatile_leverage_mult = c.v3_volatile_leverage_mult;
    p.volatile_stop_mult     = c.v3_volatile_stop_mult;
    p.hmm_update_threshold   = c.v3_hmm_update_threshold;
    p.min_regime_confidence  = c.v3_min_regime_confidence;
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
        ctx.engine_v3 = std::make_unique<SignalEngineV3>(v2_params, make_v3_params(ctx.config));
        ctx.engine_v3->prepopulate(ctx.config.symbols);
        spdlog::info("Signal Engine V3: HMM regime detection ENABLED");
    }
    PressureModel::Params pp;
    pp.toxic_size_threshold = ctx.config.v2_toxic_size_threshold;
    pp.obi_levels_5         = ctx.config.v2_obi_levels_5;
    pp.obi_levels_10        = ctx.config.v2_obi_levels_10;
    pp.obi_levels_20        = ctx.config.v2_obi_levels_20;
    pp.microprice_enabled   = ctx.config.pressure_microprice_enabled;
    ctx.pressure_model      = std::make_unique<PressureModel>(pp);
    SignalEngine::Params ep;
    ep.fast_ema_period  = ctx.config.fast_ema_period;
    ep.slow_ema_period  = ctx.config.slow_ema_period;
    ep.fast_ema_enabled = ctx.config.fast_ema_enabled;
    ep.fft_enabled      = ctx.config.fft_enabled;
    ep.fft_min_candles  = ctx.config.fft_min_candles;
    ep.obi_enabled      = ctx.config.obi_enabled;
    ep.vwap_enabled     = ctx.config.vwap_enabled;
    ep.pressure_enabled = ctx.config.pressure_model_enabled;
    ctx.engine_v1       = std::make_unique<SignalEngine>(ep);
    return true;
}

void init_order_routing(BotContext& ctx) {
    AdaptiveOrderSelectorV2::Params ap;
    ap.high_confidence      = ctx.config.adaptive_high_confidence;
    ap.low_confidence       = ctx.config.adaptive_low_confidence;
    ap.emergency_confidence = ctx.config.adaptive_emergency_confidence;
    ap.gtd_seconds          = ctx.config.adaptive_gtd_seconds;
    ap.toxic_threshold      = ctx.config.adaptive_toxic_threshold;
    ctx.adaptive_selector   = std::make_unique<AdaptiveOrderSelectorV2>(ap);
}

void init_kill_switch(BotContext& ctx) {
    ctx.kill_switch = std::make_unique<KillSwitch>(ctx.config.kill_switch_trigger_file,
                                                   ctx.config.kill_switch_shm_name);
    ctx.kill_switch->set_cancel_all_callback([&]() {
        if (ctx.executor && ctx.executor->cancel_all_orders()) {
            spdlog::warn("KILL SWITCH: cancel-all-orders request sent to exchange");
        } else {
            spdlog::error("KILL SWITCH: cancel-all-orders request NOT sent — resting "
                          "orders may stay live on the exchange");
        }
    });
    ctx.kill_switch->set_close_all_callback([&]() {
        spdlog::warn("KILL SWITCH: Closing all positions at market...");
        auto positions = ctx.pos_mgr.get_positions();
        for (const auto& pos : positions) {
            if (ctx.executor->close_position(pos.symbol)) {
                // Fill books PnL at the real price — just mark closing (S248).
                ctx.pos_mgr.mark_closing(pos.symbol);
            } else {
                spdlog::error("KILL SWITCH: close request not sent for {} — position still open "
                              "locally and on exchange",
                              pos.symbol);
            }
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
        ctx.config.metrics_port, ctx.config.metrics_host, ctx.config.metrics_enabled);
    ctx.health_server->start(&ctx.sys_monitor);
    // S246: reconnect/staleness counters live inside the sockets — hand them
    // the monitor so hft_reconnects_total/hft_heartbeats_missed_total move.
    if (ctx.receiver) ctx.receiver->set_monitor(&ctx.sys_monitor);
    if (ctx.ai_signal_receiver) ctx.ai_signal_receiver->set_monitor(&ctx.sys_monitor);
    if (ctx.executor) ctx.executor->set_monitor(&ctx.sys_monitor);
    // scripts/monitor.py reads /hft_heartbeat — publish it unconditionally
    // (independent of ipc_enabled) so the tool always reflects liveness.
    try {
        ctx.shm_heartbeat = std::make_unique<ipc::ShmHeartbeat>();
    } catch (const std::exception& e) {
        spdlog::warn("SHM heartbeat unavailable: {}", e.what());
        ctx.shm_heartbeat.reset();
    }
}

void init_ipc(BotContext& ctx) {
    if (!ctx.config.ipc_enabled) return;
    ctx.shm_fill_producer = std::make_unique<ipc::ShmFillProducer>(ctx.config.ipc_fills_shm,
                                                                   ctx.config.ipc_fills_capacity);
    if (ctx.shm_fill_producer->init()) {
        spdlog::info("SHM IPC: fill producer ready (shm={})", ctx.config.ipc_fills_shm);
        if (ctx.receiver) ctx.receiver->set_fill_producer(ctx.shm_fill_producer.get());
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
            sig.symbol      = (msg.symbol_id < ctx.config.symbols.size())
                                  ? ctx.config.symbols[msg.symbol_id]
                                  : "UNKNOWN";
            sig.direction   = msg.action == static_cast<uint8_t>(ipc::Action::LONG)    ? "LONG"
                              : msg.action == static_cast<uint8_t>(ipc::Action::SHORT) ? "SHORT"
                                                                                       : "NEUTRAL";
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
    // Fills are the exchange's source of truth — reconcile the position book
    // and feed the risk trackers from them (S178/S179).
    ctx.receiver->on_fill([&](const std::string& sym, const std::string& side,
                              const std::string& status, double qty, double price, double fee) {
        auto res = ctx.pos_mgr.apply_fill(sym, side, qty, price, fee, status);
        if (status == "FILLED") {
            ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_FILLED);
            ctx.last_fill_ms.store(std::chrono::duration_cast<std::chrono::milliseconds>(
                                       std::chrono::system_clock::now().time_since_epoch())
                                       .count(),
                                   std::memory_order_relaxed);
            if (res.effect == PositionManager::FillEffect::OPENED ||
                res.effect == PositionManager::FillEffect::INCREASED) {
                ctx.risk_mgr->on_fill(sym, side, qty, price, fee);
            } else if (res.effect == PositionManager::FillEffect::REDUCED ||
                       res.effect == PositionManager::FillEffect::CLOSED) {
                ctx.risk_mgr->reduce_exposure(res.notional);
            }
            if (res.realized_pnl != 0.0) {
                ctx.balance.fetch_add(res.realized_pnl, std::memory_order_relaxed);
                spdlog::info("Position {} {} by fill: realized {:+.2f}", sym,
                             res.effect == PositionManager::FillEffect::CLOSED ? "closed"
                                                                               : "reduced",
                             res.realized_pnl);
            }
        } else if (status == "CANCELLED") {
            ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_CANCELED);
        } else if (status == "REJECTED") {
            ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_REJECTED);
        }
    });
    // Account broadcast is the authoritative balance — the hardcoded seed is
    // only a pre-connect placeholder (S180). Also reconciles exchange-side
    // positions into the local book.
    ctx.receiver->on_account([&](const json& accounts) {
        auto it = accounts.find(ctx.config.default_exchange);
        if (it == accounts.end() || !it->is_object()) return;
        const double bal = it->value("balance", 0.0);
        if (bal > 0.0) ctx.balance.store(bal, std::memory_order_relaxed);
        if (it->contains("positions") && (*it)["positions"].is_array()) {
            std::unordered_set<std::string> broadcast_symbols;
            for (const auto& p : (*it)["positions"]) {
                const std::string sym = p.value("symbol", "");
                broadcast_symbols.insert(sym);
                ctx.pos_mgr.sync_position(sym, p.value("side", "") == "BUY",
                                          p.value("quantity", 0.0), p.value("entry_price", 0.0),
                                          p.value("stop_loss", 0.0), p.value("take_profit", 0.0),
                                          ctx.config.default_exchange);
            }
            for (const auto& sym :
                 ctx.pos_mgr.reconcile_positions(broadcast_symbols, ctx.config.default_exchange)) {
                spdlog::warn("Dropped ghost position {} — absent from {} "
                             "account broadcast (missed close fill)",
                             sym, ctx.config.default_exchange);
            }
        }
    });
    // Exchange-side cancels release the pending-order slot so the symbol can
    // be traded again.
    ctx.receiver->on_order_cancelled([&](const std::string& sym) {
        ctx.sys_monitor.increment(SystemMonitor::Metric::ORDERS_CANCELED);
        if (sym.empty())
            ctx.pos_mgr.clear_pending_orders();
        else
            ctx.pos_mgr.cancel_pending(sym);
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
