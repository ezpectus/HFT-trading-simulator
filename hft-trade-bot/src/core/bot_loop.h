#pragma once

#include "core/bot_context.h"

namespace hft {

void process_sl_tp(BotContext& ctx, double current_balance);
void process_arbitrage(BotContext& ctx, bool can_trade);
void process_ai_signals(BotContext& ctx, double current_balance, bool can_trade);
void run_v2_signal_loop(BotContext& ctx, double current_balance, bool can_trade);
void run_v1_fallback_loop(BotContext& ctx, double current_balance);
void print_status(BotContext& ctx);
void poll_shm_market_data(BotContext& ctx);
void graceful_shutdown(BotContext& ctx);

} // namespace hft
