"""Configuration validation for the exchange simulator.

Validates config.yaml structure, value ranges, and cross-references
before the simulator starts, providing clear error messages.

Usage:
    from exchange_simulator.config_validator import validate_config

    config = load_config("config.yaml")
    errors, warnings = validate_config(config)
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        sys.exit(1)
"""
import logging
from typing import Optional

logger = logging.getLogger("exchange_simulator.config_validator")

REQUIRED_SECTIONS = ["exchanges", "initial_prices", "volatility", "market", "account"]
VALID_TIMEFRAMES = {"1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"}
TIMEFRAME_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900,
    "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
}


def validate_config(config: dict) -> tuple[list[str], list[str]]:
    """Validate exchange simulator configuration.

    Args:
        config: Parsed YAML config dict

    Returns:
        (errors, warnings) — errors are fatal, warnings are informational
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Check required sections
    for section in REQUIRED_SECTIONS:
        if section not in config:
            errors.append(f"Missing required section: '{section}'")

    if errors:
        return errors, warnings

    # Validate exchanges
    exchanges = config.get("exchanges", {})
    if not exchanges:
        errors.append("No exchanges defined in 'exchanges' section")
    else:
        all_symbols = set()
        for ex_id, ex_cfg in exchanges.items():
            if not isinstance(ex_cfg, dict):
                errors.append(f"Exchange '{ex_id}' must be a mapping")
                continue

            if "name" not in ex_cfg:
                errors.append(f"Exchange '{ex_id}' missing 'name'")

            fee = ex_cfg.get("fee_pct")
            if fee is None:
                errors.append(f"Exchange '{ex_id}' missing 'fee_pct'")
            elif not isinstance(fee, (int, float)):
                errors.append(f"Exchange '{ex_id}' fee_pct must be a number")
            elif fee < 0 or fee > 1.0:
                errors.append(f"Exchange '{ex_id}' fee_pct={fee} out of range [0, 1.0]")

            slip = ex_cfg.get("slippage_bps")
            if slip is None:
                errors.append(f"Exchange '{ex_id}' missing 'slippage_bps'")
            elif not isinstance(slip, (int, float)):
                errors.append(f"Exchange '{ex_id}' slippage_bps must be a number")
            elif slip < 0 or slip > 100:
                warnings.append(f"Exchange '{ex_id}' slippage_bps={slip} is unusually high")

            symbols = ex_cfg.get("symbols", [])
            if not symbols:
                warnings.append(f"Exchange '{ex_id}' has no symbols defined")
            all_symbols.update(symbols)

    # Validate initial_prices
    initial_prices = config.get("initial_prices", {})
    if not initial_prices:
        errors.append("No initial prices defined")
    else:
        for sym, price in initial_prices.items():
            if not isinstance(price, (int, float)):
                errors.append(f"Initial price for '{sym}' must be a number")
            elif price <= 0:
                errors.append(f"Initial price for '{sym}' must be positive, got {price}")

    # Validate volatility
    volatility = config.get("volatility", {})
    if not volatility:
        errors.append("No volatility defined")
    else:
        for sym, vol in volatility.items():
            if not isinstance(vol, (int, float)):
                errors.append(f"Volatility for '{sym}' must be a number")
            elif vol <= 0 or vol > 10:
                warnings.append(f"Volatility for '{sym}'={vol} is out of typical range [0.1, 3.0]")

    # Cross-reference: symbols in exchanges vs initial_prices
    price_symbols = set(initial_prices.keys())
    vol_symbols = set(volatility.keys())
    if all_symbols != price_symbols:
        missing_prices = all_symbols - price_symbols
        extra_prices = price_symbols - all_symbols
        if missing_prices:
            errors.append(f"Symbols missing from initial_prices: {missing_prices}")
        if extra_prices:
            warnings.append(f"Symbols in initial_prices but not in any exchange: {extra_prices}")

    if all_symbols != vol_symbols:
        missing_vol = all_symbols - vol_symbols
        extra_vol = vol_symbols - all_symbols
        if missing_vol:
            errors.append(f"Symbols missing from volatility: {missing_vol}")
        if extra_vol:
            warnings.append(f"Symbols in volatility but not in any exchange: {extra_vol}")

    # Validate market section
    market = config.get("market", {})
    tf = market.get("timeframe")
    if tf and tf not in VALID_TIMEFRAMES:
        errors.append(f"Invalid timeframe '{tf}', valid: {sorted(VALID_TIMEFRAMES)}")

    tf_seconds = market.get("timeframe_seconds")
    if tf_seconds is not None:
        if not isinstance(tf_seconds, int) or tf_seconds < 1:
            errors.append(f"timeframe_seconds must be a positive integer, got {tf_seconds}")
        if tf and tf in TIMEFRAME_SECONDS:
            if tf_seconds != TIMEFRAME_SECONDS[tf]:
                warnings.append(
                    f"timeframe_seconds={tf_seconds} doesn't match timeframe '{tf}' "
                    f"(expected {TIMEFRAME_SECONDS[tf]})"
                )

    warmup = market.get("warmup_candles")
    if warmup is not None:
        if not isinstance(warmup, int) or warmup < 0:
            errors.append(f"warmup_candles must be >= 0, got {warmup}")
        elif warmup < 50:
            warnings.append(f"warmup_candles={warmup} is low, strategies may not have enough history")

    depth = market.get("order_book_depth")
    if depth is not None:
        if not isinstance(depth, int) or depth < 1:
            errors.append(f"order_book_depth must be >= 1, got {depth}")
        elif depth < 5:
            warnings.append(f"order_book_depth={depth} is low, OBI calculations may be noisy")

    drift = market.get("drift")
    if drift is not None:
        if not isinstance(drift, (int, float)):
            errors.append(f"drift must be a number, got {type(drift)}")
        elif abs(drift) > 0.01:
            warnings.append(f"drift={drift} is very high, market will be strongly trending")

    # Validate account section
    account = config.get("account", {})
    balance = account.get("initial_balance")
    if balance is not None:
        if not isinstance(balance, (int, float)) or balance <= 0:
            errors.append(f"initial_balance must be positive, got {balance}")

    leverage = account.get("leverage")
    if leverage is not None:
        if not isinstance(leverage, (int, float)) or leverage < 1:
            errors.append(f"leverage must be >= 1, got {leverage}")
        elif leverage > 50:
            warnings.append(f"leverage={leverage} is very high, liquidation risk")

    # Validate websocket section
    ws = config.get("websocket", {})
    port = ws.get("port")
    if port is not None:
        if not isinstance(port, int) or port < 1 or port > 65535:
            errors.append(f"websocket port must be 1-65535, got {port}")

    # Validate arbitrage section
    arb = config.get("arbitrage", {})
    if arb:
        min_spread = arb.get("min_spread_bps")
        if min_spread is not None:
            if not isinstance(min_spread, (int, float)) or min_spread < 0:
                errors.append(f"arbitrage.min_spread_bps must be >= 0, got {min_spread}")

        ttl = arb.get("opportunity_ttl")
        if ttl is not None:
            if not isinstance(ttl, (int, float)) or ttl <= 0:
                errors.append(f"arbitrage.opportunity_ttl must be positive, got {ttl}")

    # Validate visualizer section
    viz = config.get("visualizer", {})
    if viz:
        refresh = viz.get("refresh_interval")
        if refresh is not None:
            if not isinstance(refresh, (int, float)) or refresh <= 0:
                errors.append(f"visualizer.refresh_interval must be positive, got {refresh}")
            elif refresh < 0.1:
                warnings.append(f"visualizer.refresh_interval={refresh} is very fast, may cause high CPU")

    return errors, warnings


def validate_or_exit(config: dict) -> dict:
    """Validate config and exit on errors.

    Args:
        config: Parsed YAML config dict

    Returns:
        The config dict if validation passes

    Raises:
        SystemExit: If validation errors are found
    """
    import sys

    errors, warnings = validate_config(config)

    for w in warnings:
        logger.warning(f"Config: {w}")

    if errors:
        for e in errors:
            logger.error(f"Config: {e}")
        logger.error(f"Configuration validation failed with {len(errors)} error(s)")
        sys.exit(1)

    logger.info(f"Configuration validated: {len(warnings)} warning(s)")
    return config
