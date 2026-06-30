// Logger — thread-safe console + file logging with timestamped filenames
#pragma once

#include <fmt/core.h>
#include <fmt/format.h>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <iomanip>
#include <memory>
#include <sstream>
#include <string>

namespace hft {

class Logger {
public:
    static void init(const std::string& level = "info",
                     const std::string& dir = "logs") {
        // Create logs directory
        std::filesystem::create_directories(dir);

        // Generate timestamped filename: hft_trade_bot_YYYYMMDD_HHMMSS.log
        auto now = std::chrono::system_clock::now();
        auto t = std::chrono::system_clock::to_time_t(now);
        std::tm tm{};
        localtime_r(&t, &tm);
        std::ostringstream ss;
        ss << dir << "/hft_trade_bot_"
           << std::put_time(&tm, "%Y%m%d_%H%M%S") << ".log";
        std::string log_path = ss.str();

        std::string latest_path = dir + "/hft_trade_bot_latest.log";

        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(log_path, true);
        auto latest_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(latest_path, true);

        auto logger = std::make_shared<spdlog::logger>("hft",
            spdlog::sinks_init_list{console_sink, file_sink, latest_sink});
        logger->set_pattern("[%Y-%m-%d %H:%M:%S] [%^%l%$] %v");

        if (level == "debug") logger->set_level(spdlog::level::debug);
        else if (level == "trace") logger->set_level(spdlog::level::trace);
        else if (level == "warn") logger->set_level(spdlog::level::warn);
        else if (level == "error") logger->set_level(spdlog::level::err);
        else logger->set_level(spdlog::level::info);

        spdlog::set_default_logger(logger);
        spdlog::info("Log file: {}", log_path);
    }

    static std::string get_log_dir() {
        return "logs";
    }
};

} // namespace hft
