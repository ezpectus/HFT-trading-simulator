// Logger — thread-safe console + file logging with timestamped filenames
// Supports both human-readable (default) and JSON structured logging (production).
// Production mode uses rotating file sinks to prevent unbounded log growth.
#pragma once

#include <chrono>
#include <ctime>
#include <filesystem>
#include <fmt/core.h>
#include <fmt/format.h>
#include <iomanip>
#include <memory>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>
#include <sstream>
#include <string>

namespace hft {

class Logger {
  public:
    static void init(const std::string& level = "info", const std::string& dir = "logs",
                     bool json = false) {
        // Create logs directory
        log_dir_ = dir;
        std::filesystem::create_directories(dir);

        // Generate timestamped filename: hft_trade_bot_YYYYMMDD_HHMMSS.log
        auto    now = std::chrono::system_clock::now();
        auto    t   = std::chrono::system_clock::to_time_t(now);
        std::tm tm{};
#ifdef _WIN32
        localtime_s(&tm, &t);
#else
        localtime_r(&t, &tm);
#endif
        std::ostringstream ss;
        ss << dir << "/hft_trade_bot_" << std::put_time(&tm, "%Y%m%d_%H%M%S") << ".log";
        std::string log_path = ss.str();

        std::string latest_path = dir + "/hft_trade_bot_latest.log";

        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();

        std::shared_ptr<spdlog::sinks::sink> file_sink;
        std::shared_ptr<spdlog::sinks::sink> latest_sink;

        if (json) {
            // Production: rotating file sinks — 50MB max, 5 rotated files kept
            file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
                log_path, 50 * 1024 * 1024, 5, true);
            latest_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
                latest_path, 50 * 1024 * 1024, 3, true);
        } else {
            // Development: basic file sinks (truncate on each run)
            file_sink   = std::make_shared<spdlog::sinks::basic_file_sink_mt>(log_path, true);
            latest_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(latest_path, true);
        }

        auto logger = std::make_shared<spdlog::logger>(
            "hft", spdlog::sinks_init_list{console_sink, file_sink, latest_sink});

        if (json) {
            // JSON structured logging — one JSON object per line
            // Fields: ts, level, msg, thread
            // Note: spdlog does not auto-escape quotes in %v. Use a custom formatter
            // or ensure log messages do not contain unescaped double quotes.
            logger->set_pattern(
                R"({"ts":"%Y-%m-%dT%H:%M:%S.%e","level":"%l","msg":"%v","thread":%t})");
        } else {
            logger->set_pattern("[%Y-%m-%d %H:%M:%S] [%^%l%$] %v");
        }

        if (level == "debug")
            logger->set_level(spdlog::level::debug);
        else if (level == "trace")
            logger->set_level(spdlog::level::trace);
        else if (level == "warn")
            logger->set_level(spdlog::level::warn);
        else if (level == "error")
            logger->set_level(spdlog::level::err);
        else
            logger->set_level(spdlog::level::info);

        spdlog::set_default_logger(logger);
        spdlog::info("Log file: {}", log_path);
    }

    static std::string get_log_dir() { return log_dir_; }

  private:
    static inline std::string log_dir_{"logs"};
};

} // namespace hft
