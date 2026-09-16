"""Configuration consistency test script.

Verifies that configuration is consistent across all components:
- shared_config.yaml
- exchange_simulator/config.yaml
- ai-signal-bot/config/settings.yaml
- hft-trade-bot/config/config.yaml
"""
import os
import re
import sys

import yaml
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_yaml(path: Path) -> dict:
    """Load a YAML file."""
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


_ENV_VAR = re.compile(r"\$\{([^}:]+)(?::-([^}]*))?\}")


def expand_env(value: str) -> str:
    """Resolve ${VAR} / ${VAR:-default} placeholders the way the C++ and
    Python config parsers do (hft config_parser.h::expand_env)."""
    def repl(m: re.Match) -> str:
        name, default = m.group(1), m.group(2)
        env = os.environ.get(name)
        if env:
            return env
        return default if default is not None else ""
    return _ENV_VAR.sub(repl, value)


def test_symbol_consistency():
    """Test that symbols are consistent across all config files."""
    project_root = Path(__file__).parent.parent
    
    # Load configurations
    shared_config = load_yaml(project_root / "shared_config.yaml")
    exchange_config = load_yaml(project_root / "exchange_simulator" / "config.yaml")
    ai_config = load_yaml(project_root / "ai-signal-bot" / "config" / "settings.yaml")
    hft_config = load_yaml(project_root / "hft-trade-bot" / "config" / "config.yaml")
    
    # Get symbol lists
    shared_symbols = set(shared_config["symbols"])
    
    # Get symbols from exchange config. Per-exchange lists are optional — the
    # runtime universe is initial_prices, so fall back to it when absent.
    exchange_symbols = set()
    for exchange in exchange_config["exchanges"].values():
        if "symbols" in exchange:
            exchange_symbols.update(exchange["symbols"])
    if not exchange_symbols:
        exchange_symbols = set(exchange_config.get("initial_prices", {}).keys())
    
    ai_symbols = set(ai_config["trading"]["symbols"])
    hft_symbols = set(hft_config["trading"]["symbols"])
    
    # Verify consistency
    print(f"Shared config symbols: {len(shared_symbols)}")
    print(f"Exchange config symbols: {len(exchange_symbols)}")
    print(f"AI bot symbols: {len(ai_symbols)}")
    print(f"HFT bot symbols: {len(hft_symbols)}")
    
    # Check if all symbol sets match
    if shared_symbols != exchange_symbols:
        missing_in_exchange = shared_symbols - exchange_symbols
        extra_in_exchange = exchange_symbols - shared_symbols
        if missing_in_exchange:
            print(f"ERROR: Symbols in shared_config but not in exchange_config: {missing_in_exchange}")
        if extra_in_exchange:
            print(f"ERROR: Symbols in exchange_config but not in shared_config: {extra_in_exchange}")
        return False
    
    if shared_symbols != ai_symbols:
        missing_in_ai = shared_symbols - ai_symbols
        extra_in_ai = ai_symbols - shared_symbols
        if missing_in_ai:
            print(f"ERROR: Symbols in shared_config but not in ai_config: {missing_in_ai}")
        if extra_in_ai:
            print(f"ERROR: Symbols in ai_config but not in shared_config: {extra_in_ai}")
        return False
    
    if shared_symbols != hft_symbols:
        missing_in_hft = shared_symbols - hft_symbols
        extra_in_hft = hft_symbols - shared_symbols
        if missing_in_hft:
            print(f"ERROR: Symbols in shared_config but not in hft_config: {missing_in_hft}")
        if extra_in_hft:
            print(f"ERROR: Symbols in hft_config but not in shared_config: {extra_in_hft}")
        return False
    
    print("✓ Symbol consistency check passed")
    return True


def test_exchange_consistency():
    """Test that exchanges are consistent across all config files."""
    project_root = Path(__file__).parent.parent
    
    shared_config = load_yaml(project_root / "shared_config.yaml")
    exchange_config = load_yaml(project_root / "exchange_simulator" / "config.yaml")
    ai_config = load_yaml(project_root / "ai-signal-bot" / "config" / "settings.yaml")
    hft_config = load_yaml(project_root / "hft-trade-bot" / "config" / "config.yaml")
    
    # Get exchange lists
    shared_exchanges = set(shared_config["exchanges"])
    exchange_exchanges = set(exchange_config["exchanges"].keys())
    
    # AI and HFT configs reference exchanges by name, not list
    ai_default_exchange = ai_config["exchange"]["default_exchange"]
    hft_default_exchange = hft_config["exchange"]["default_exchange"]
    
    print(f"Shared config exchanges: {shared_exchanges}")
    print(f"Exchange config exchanges: {exchange_exchanges}")
    print(f"AI bot default exchange: {ai_default_exchange}")
    print(f"HFT bot default exchange: {hft_default_exchange}")
    
    # Check consistency
    if shared_exchanges != exchange_exchanges:
        print("ERROR: Exchange lists don't match")
        return False
    
    if ai_default_exchange not in shared_exchanges:
        print(f"ERROR: AI bot default exchange {ai_default_exchange} not in shared config")
        return False
    
    if hft_default_exchange not in shared_exchanges:
        print(f"ERROR: HFT bot default exchange {hft_default_exchange} not in shared config")
        return False
    
    print("✓ Exchange consistency check passed")
    return True


def test_websocket_consistency():
    """Test that WebSocket endpoints are consistent."""
    project_root = Path(__file__).parent.parent
    
    shared_config = load_yaml(project_root / "shared_config.yaml")
    exchange_config = load_yaml(project_root / "exchange_simulator" / "config.yaml")
    ai_config = load_yaml(project_root / "ai-signal-bot" / "config" / "settings.yaml")
    hft_config = load_yaml(project_root / "hft-trade-bot" / "config" / "config.yaml")
    
    # Get WebSocket settings
    shared_exchange_ws = shared_config["websocket"]["exchange_simulator"]
    shared_signal_ws = shared_config["websocket"]["ai_signal_bot"]
    
    exchange_ws = exchange_config["websocket"]
    ai_ws = ai_config["exchange"]
    hft_ws = hft_config["exchange"]
    
    print(f"Shared exchange WebSocket: {shared_exchange_ws['host']}:{shared_exchange_ws['port']}")
    print(f"Exchange simulator WebSocket: {exchange_ws['host']}:{exchange_ws['port']}")
    ai_url = expand_env(ai_ws["websocket_url"])
    hft_url = expand_env(hft_ws["websocket_url"])
    print(f"AI bot WebSocket: {ai_url}")
    print(f"HFT bot WebSocket: {hft_url}")
    
    # Check consistency
    if exchange_ws["host"] != shared_exchange_ws["host"]:
        print("ERROR: Exchange simulator host mismatch")
        return False
    
    if exchange_ws["port"] != shared_exchange_ws["port"]:
        print("ERROR: Exchange simulator port mismatch")
        return False
    
    # AI bot connects to exchange simulator for market data, not signal bot
    expected_ai_url = f"ws://{shared_exchange_ws['host']}:{shared_exchange_ws['port']}"
    if ai_url != expected_ai_url:
        print(f"ERROR: AI bot WebSocket URL mismatch (expected {expected_ai_url}, got {ai_url})")
        return False

    expected_hft_url = f"ws://{shared_exchange_ws['host']}:{shared_exchange_ws['port']}"
    if hft_url != expected_hft_url:
        print(f"ERROR: HFT bot WebSocket URL mismatch (expected {expected_hft_url}, got {hft_url})")
        return False

    # The HFT bot also consumes the AI signal publisher — its endpoint must
    # match the shared ai_signal_bot section.
    hft_signal_url = expand_env(hft_config["ai_signal_bot"]["websocket_url"])
    expected_signal_url = f"ws://{shared_signal_ws['host']}:{shared_signal_ws['port']}"
    if hft_signal_url != expected_signal_url:
        print(f"ERROR: HFT ai_signal_bot WebSocket URL mismatch (expected {expected_signal_url}, got {hft_signal_url})")
        return False

    print("✓ WebSocket consistency check passed")
    return True


def test_risk_parameter_consistency():
    """Test that risk parameters are consistent where applicable."""
    project_root = Path(__file__).parent.parent
    
    shared_config = load_yaml(project_root / "shared_config.yaml")
    ai_config = load_yaml(project_root / "ai-signal-bot" / "config" / "settings.yaml")
    hft_config = load_yaml(project_root / "hft-trade-bot" / "config" / "config.yaml")
    
    shared_risk = shared_config["risk"]
    ai_risk = ai_config["risk"]
    hft_risk = hft_config["risk"]
    
    print("Shared risk parameters:", shared_risk)
    print("AI bot risk parameters:", ai_risk)
    print("HFT bot risk parameters:", hft_risk)
    
    # Key risk parameters must match across shared/AI/HFT configs —
    # a drift here means the bots size risk differently than declared.
    ok = True
    for key in ("max_risk_per_trade_pct", "max_daily_drawdown_pct", "min_confidence"):
        sv, av, hv = shared_risk.get(key), ai_risk.get(key), hft_risk.get(key)
        if not (sv == av == hv):
            print(f"ERROR: risk.{key} drift — shared={sv}, ai={av}, hft={hv}")
            ok = False

    if ok:
        print("✓ Risk parameter consistency check passed")
    return ok


def test_optional_features_configured():
    """Test that optional feature sections are properly formed where present."""
    project_root = Path(__file__).parent.parent

    exchange_config = load_yaml(project_root / "exchange_simulator" / "config.yaml")

    # Audit logging configuration (wired by)
    if "audit" not in exchange_config:
        print("ERROR: audit section missing from exchange config")
        return False
    
    audit = exchange_config["audit"]
    if not audit.get("enabled", False):
        print("WARNING: audit logging not enabled")

    print("✓ Audit logging configuration present")
    return True


def main():
    """Run all configuration consistency tests."""
    print("=" * 60)
    print("Configuration Consistency Tests")
    print("=" * 60)
    print()
    
    tests = [
        ("Symbol Consistency", test_symbol_consistency),
        ("Exchange Consistency", test_exchange_consistency),
        ("WebSocket Consistency", test_websocket_consistency),
        ("Risk Parameter Consistency", test_risk_parameter_consistency),
        ("Optional Features Configured", test_optional_features_configured),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\nRunning: {test_name}")
        print("-" * 60)
        try:
            result = test_func()
            results.append((test_name, result))
        except (OSError, RuntimeError, ValueError, TypeError, KeyError) as e:
            print(f"ERROR: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result for _, result in results)
    
    print()
    if all_passed:
        print("All configuration consistency tests passed!")
        return 0
    else:
        print("Some configuration consistency tests failed!")
        return 1


if __name__ == "__main__":
    exit(main())
