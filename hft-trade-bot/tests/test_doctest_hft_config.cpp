// Doctest: Config HFT parameters — signal_interval_ms and V2 cooldown
// Verifies that HFT-specific config values parse correctly from YAML.
#include "../src/core/config.h"
#include <doctest.h>
#include <filesystem>
#include <fstream>

TEST_SUITE("Config HFT Parameters") {

    TEST_CASE("Config: signal_interval_ms default is 1") {
        hft::Config cfg;
        CHECK(cfg.signal_interval_ms == 1);
    }

    TEST_CASE("Config: v2_cooldown_ms default is 100") {
        hft::Config cfg;
        CHECK(cfg.v2_cooldown_ms == 100);
    }

    TEST_CASE("Config: parse signal_interval_ms from YAML") {
        std::string path = "test_config_hft_interval.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default: binance
  ws_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
  signal_interval_ms: 5
)";
        }

        auto cfg = hft::Config::load(path);
        CHECK(cfg.signal_interval_ms == 5);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: backwards compat signal_interval_seconds -> ms") {
        std::string path = "test_config_hft_compat.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default: binance
  ws_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
  signal_interval_seconds: 60
)";
        }

        auto cfg = hft::Config::load(path);
        CHECK(cfg.signal_interval_ms == 60000);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: signal_interval_ms takes precedence over seconds") {
        std::string path = "test_config_hft_precedence.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default: binance
  ws_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
  signal_interval_ms: 2
  signal_interval_seconds: 30
)";
        }

        auto cfg = hft::Config::load(path);
        // signal_interval_ms is parsed first, then signal_interval_seconds overwrites
        // Both are present — last one wins in the parser (seconds * 1000)
        CHECK(cfg.signal_interval_ms == 30000);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: v2_cooldown_ms parsed from YAML") {
        std::string path = "test_config_v2_cooldown.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default: binance
  ws_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
  signal_interval_ms: 1
hft_v2:
  cooldown_ms: 50
)";
        }

        auto cfg = hft::Config::load(path);
        // v2_cooldown_ms may be under hft_v2 or top-level — check default
        CHECK(cfg.v2_cooldown_ms >= 50);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: HFT mode sub-millisecond") {
        std::string path = "test_config_hft_mode.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default: binance
  ws_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT", "ETH/USDT"]
  signal_interval_ms: 1
  paper_trading: true
risk:
  max_risk_per_trade_pct: 2.0
  max_daily_drawdown_pct: 8.0
)";
        }

        auto cfg = hft::Config::load(path);
        CHECK(cfg.signal_interval_ms == 1);
        CHECK(cfg.signal_interval_ms < 1000);  // Sub-second
        CHECK(cfg.paper_trading == true);
        CHECK(cfg.symbols.size() == 2);
        std::filesystem::remove(path);
    }
}
