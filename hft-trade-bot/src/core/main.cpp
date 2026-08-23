#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#endif

#include "core/bot_context.h"
#include "core/bot_loop.h"
#include "core/bot_setup.h"

#include <csignal>
#include <chrono>

#include <spdlog/spdlog.h>

using namespace hft;

// Forward-declare the g_running flag setter from bot_setup.cpp
namespace hft { void set_running(bool v); }

int main(int argc, char* argv[]) {
    // Register signal handlers for graceful shutdown
    std::signal(SIGINT,  [](int) { hft::set_running(false); });
    std::signal(SIGTERM, [](int) { hft::set_running(false); });

    BotContext ctx{Config{}};
    if (!init_config_and_logger(ctx, argc, argv)) return 1;

    try {
        init_core_components(ctx);
        if (!init_signal_engines(ctx)) return 1;
        init_order_routing(ctx);
        init_kill_switch(ctx);
        init_monitoring(ctx);
        init_ipc(ctx);
        init_callbacks(ctx);
        if (!connect_all(ctx)) return 1;
        init_symbol_entries(ctx);

        auto last_print = std::chrono::steady_clock::now();

        while (is_running()) {
            ScopedLatency loop_timer(ctx.total_loop_hist);
            const double current_balance = ctx.balance.load(std::memory_order_relaxed);
            const bool   can_trade = ctx.receiver->is_trading_active() && ctx.kill_switch->can_trade();

            process_sl_tp(ctx, current_balance);
            process_arbitrage(ctx, can_trade);
            process_ai_signals(ctx, current_balance, can_trade);

            if (ctx.config.signal_engine_v2_enabled && can_trade) {
                run_v2_signal_loop(ctx, current_balance, can_trade);
            } else if (can_trade) {
                run_v1_fallback_loop(ctx, current_balance);
            }

            auto now = std::chrono::steady_clock::now();
            if (std::chrono::duration_cast<std::chrono::seconds>(now - last_print).count() >= 10) {
                last_print = now;
                print_status(ctx);
            }

            ctx.receiver->wait_for_data(ctx.config.signal_interval_ms);
            poll_shm_market_data(ctx);
        }
    } catch (const std::exception& e) {
        spdlog::critical("Unhandled exception in main loop: {}", e.what());
    } catch (...) {
        spdlog::critical("Unknown exception in main loop");
    }

    graceful_shutdown(ctx);
    return 0;
}
