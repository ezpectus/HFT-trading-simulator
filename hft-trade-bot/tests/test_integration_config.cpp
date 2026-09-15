// Integration test: Config loading from YAML files
// Verifies that Config::load() correctly parses both dev and prod config formats.
#include "../src/core/config.h"
#include <doctest.h>
#include <filesystem>
#include <fstream>

TEST_SUITE("Config Integration") {

    TEST_CASE("Config: load dev config") {
        // Create a minimal dev config file
        std::string path = "test_config_dev.yaml";
        {
            std::ofstream f(path);
            f << R"(
exchange:
  default_exchange: binance
  websocket_url: "ws://localhost:8765"
trading:
  symbols: ["BTC/USDT", "ETH/USDT"]
  max_open_positions: 10
risk:
  max_position_size_pct: 10.0
  max_risk_per_trade_pct: 2.0
  daily_loss_limit_pct: 5.0
)";
        }

        auto config = hft::Config::load(path);
        CHECK(config.default_exchange == "binance");
        CHECK(config.symbols.size() == 2);
        CHECK(config.symbols[0] == "BTC/USDT");
        CHECK(config.symbols[1] == "ETH/USDT");
        CHECK(config.max_open_positions == 10);
        CHECK(config.is_production == false);

        std::filesystem::remove(path);
    }

    TEST_CASE("Config: load prod config") {
        std::string path = "test_config_prod.yaml";
        {
            std::ofstream f(path);
            f << R"(
system:
  version: "2.0.0"
  mode: "production"
exchange:
  default_exchange: binance
ipc:
  enabled: true
  signals_shm: "/hft_signals"
  fills_shm: "/hft_fills"
  signals_capacity: 4096
  fills_capacity: 4096
risk:
  max_position_size_pct: 5.0
  max_risk_per_trade_pct: 1.0
  daily_loss_limit_pct: 3.0
  max_drawdown_pct: 0.10  # fraction (10%), not percent — percent values fail validation (S251)
symbols:
  - name: "BTC/USDT"
    min_qty: 0.001
  - name: "ETH/USDT"
    min_qty: 0.01
)";
        }

        auto config = hft::Config::load(path);
        CHECK(config.is_production == true);
        CHECK(config.default_exchange == "binance");
        CHECK(config.ipc_enabled == true);
        CHECK(config.ipc_signals_shm == "/hft_signals");
        CHECK(config.ipc_fills_shm == "/hft_fills");
        CHECK(config.symbols.size() == 2);
        CHECK(config.symbols[0] == "BTC/USDT");

        std::filesystem::remove(path);
    }

    TEST_CASE("Config: missing file returns defaults") {
        auto config = hft::Config::load("nonexistent_config.yaml");
        // Should not crash, should return default values
        CHECK(config.symbols.empty() == false); // May have defaults
    }

} // TEST_SUITE
