// Logger — thread-safe console + file logging
#pragma once

#include <fmt/core.h>
#include <fmt/format.h>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <memory>
#include <string>

namespace hft {

class Logger {
public:
    static void init(const std::string& level = "info",
                     const std::string& file = "logs/hft_trade_bot.log") {
        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(file, true);

        spdlog::logger logger("hft", {console_sink, file_sink});
        logger.set_pattern("[%H:%M:%S] [%^%l%$] %v");

        if (level == "debug") logger.set_level(spdlog::level::debug);
        else if (level == "trace") logger.set_level(spdlog::level::trace);
        else if (level == "warn") logger.set_level(spdlog::level::warn);
        else if (level == "error") logger.set_level(spdlog::level::err);
        else logger.set_level(spdlog::level::info);

        spdlog::set_default_logger(std::make_shared<spdlog::logger>(logger));
    }
};

} // namespace hft
