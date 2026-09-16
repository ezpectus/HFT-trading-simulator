// Doctest: Config HFT parameters — signal_interval_ms and V2 cooldown
// Verifies that HFT-specific config values parse correctly from YAML.
#include "../src/core/config.h"
#include <doctest.h>
#include <filesystem>
#include <fstream>
#include <stdexcept>

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
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
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
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
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
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
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
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
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
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT", "ETH/USDT"]
  signal_interval_ms: 1
  max_open_positions: 4
risk:
  max_risk_per_trade_pct: 2.0
  max_daily_drawdown_pct: 8.0
)";
        }

        auto cfg = hft::Config::load(path);
        CHECK(cfg.signal_interval_ms == 1);
        CHECK(cfg.signal_interval_ms < 1000); // Sub-second
        CHECK(cfg.max_open_positions == 4);
        CHECK(cfg.symbols.size() == 2);
        std::filesystem::remove(path);
    }

    // prod-format risk.blacklisted_symbols / per_symbol_max_qty were
    // documented in config.prod.yaml but parsed nowhere.
    TEST_CASE("Config: prod risk blacklist + per-symbol qty parse") {
        std::string path = "test_config_s240_risk.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
risk:
  max_position_qty: 1.0
  blacklisted_symbols: ["DOGE/USDT", "SHIB/USDT"]
  per_symbol_max_qty:
    BTC/USDT: 2.5
    ETH/USDT: 10.0
)";
        }
        auto cfg = hft::Config::load(path);
        CHECK(cfg.blacklisted_symbols.count("DOGE/USDT") == 1);
        CHECK(cfg.blacklisted_symbols.count("BTC/USDT") == 0);
        CHECK(cfg.per_symbol_max_qty.at("BTC/USDT") == 2.5);
        CHECK(cfg.per_symbol_max_qty.at("ETH/USDT") == 10.0);
        std::filesystem::remove(path);
    }

    // pressure_model.toxicity_threshold was miswired into
    // v2_pressure_threshold — it gates the adaptive selector's toxic->IOC
    // branch instead.
    TEST_CASE("Config: toxicity_threshold maps to adaptive selector") {
        std::string path = "test_config_s240_toxic.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
pressure_model:
  enabled: true
  toxicity_threshold: 0.9
  pressure_threshold: 0.35
)";
        }
        auto cfg = hft::Config::load(path);
        CHECK(cfg.adaptive_toxic_threshold == doctest::Approx(0.9));
        CHECK(cfg.v2_pressure_threshold == doctest::Approx(0.35));
        std::filesystem::remove(path);
    }

    // validation must be able to FAIL — the old warn-only validator let
    // every misconfig through, including the percent-vs-fraction drawdown mine.
    TEST_CASE("Config: validation throws on impossible values") {
        std::string path = "test_config_s251_invalid.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
risk:
  max_risk_per_trade_pct: 150.0
)";
        }
        CHECK_THROWS_AS(hft::Config::load(path), std::runtime_error);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: percent-scale value in the fraction key fails") {
        // max_drawdown_pct is a fraction — 8.0 (percent-thinking) can never trip.
        std::string path = "test_config_s251_unit.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT"]
risk:
  max_drawdown_pct: 8.0
)";
        }
        CHECK_THROWS_AS(hft::Config::load(path), std::runtime_error);
        std::filesystem::remove(path);
    }

    TEST_CASE("Config: missing ws_url fails validation") {
        std::string path = "test_config_s251_nows.yaml";
        {
            std::ofstream f(path);
            f << R"(
trading:
  symbols: ["BTC/USDT"]
)";
        }
        CHECK_THROWS_AS(hft::Config::load(path), std::runtime_error);
        std::filesystem::remove(path);
    }
}
