#pragma once

#include "core/bot_context.h"

namespace hft {

bool is_running();
bool init_config_and_logger(BotContext& ctx, int argc, char* argv[]);
void init_core_components(BotContext& ctx);
bool init_signal_engines(BotContext& ctx);
void init_order_routing(BotContext& ctx);
void init_kill_switch(BotContext& ctx);
void init_monitoring(BotContext& ctx);
void init_ipc(BotContext& ctx);
void init_callbacks(BotContext& ctx);
bool connect_all(BotContext& ctx);
void init_symbol_entries(BotContext& ctx);

} // namespace hft
