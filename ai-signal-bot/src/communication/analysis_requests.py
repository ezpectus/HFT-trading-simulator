"""Risk + analytics request handling for the signal WebSocket server.

Same pattern as portfolio_requests.py: self-free functions taking the raw
params dict and returning a JSON-ready payload. Heavy math (MLE grid
search, Monte Carlo) runs in ``asyncio.to_thread`` so it can't stall the
broadcast loop.

Protocol:
  ← {"type": "cvar_analysis", "returns": [0.01, -0.02, ...],
     "confidence": 0.95, "method": "historical|parametric|monte_carlo"}
  → {"type": "cvar_result", "var": ..., "cvar": ..., "tail": {...}, ...}

  ← {"type": "stress_test", "portfolio_value": 10000,
     "positions": [{"symbol": "BTC/USDT", "qty": 0.5, "price": 64000}, ...]}
  → {"type": "stress_test_result", "results": [...], "summary": {...}}

  ← {"type": "position_size", "direction": "LONG", "price": 64000,
     "volatility": 0.02, "account_value": 10000, "method": "volatility"}
  → {"type": "position_size_result", "position_size": ..., ...}

  ← {"type": "hawkes_fit", "events": [1694..., ...], "t": 3600}
  → {"type": "hawkes_result", "params": {...}, "intensity_path": [...]}

  ← {"type": "funding_arb_scan", "funding_rates": {"binance": 0.0004},
     "prices": {"binance": {"BTC/USDT": 64000}}, "symbols": ["BTC/USDT"]}
  → {"type": "funding_arb_result", "opportunities": [...]}
"""
import asyncio
import time

import numpy as np

from src.observability.logging import get_logger

logger = get_logger("ai_signal_bot.signal_publisher")

_CVAR_METHODS = ("historical", "parametric", "monte_carlo")
_SIZING_METHODS = ("volatility", "risk_parity", "kelly")
_SCENARIOS = ("crisis_2008", "covid_crash", "ftx_collapse")
_MAX_RETURNS = 5000
_MAX_POSITIONS = 100
_MAX_EVENTS = 5000
_MAX_PATH_POINTS = 200


def _parse_returns(params: dict) -> "np.ndarray | str":
    raw = params.get("returns")
    if isinstance(raw, list):
        try:
            returns = np.asarray([float(r) for r in raw[-_MAX_RETURNS:]], dtype=float)
        except (TypeError, ValueError):
            return "returns must be numbers"
        if returns.shape[0] < 10:
            return "need ≥10 return observations"
        if not np.all(np.isfinite(returns)):
            return "returns must be finite"
        return returns
    candles = params.get("candles_data")
    if isinstance(candles, list):
        try:
            closes = np.asarray([float(c["close"]) for c in candles[-_MAX_RETURNS:]], dtype=float)
        except (TypeError, ValueError, KeyError):
            return "each candle needs a numeric close"
        if closes.shape[0] < 11 or np.any(closes <= 0):
            return "need ≥11 closes > 0"
        return closes[1:] / closes[:-1] - 1.0
    return "need returns[] or candles_data[]"


def _cvar_compute(parsed: dict) -> dict:
    from src.risk.cvar import CVaRCalculator

    calc = CVaRCalculator(
        confidence_level=parsed["confidence"],
        time_horizon=parsed["time_horizon"],
    )
    res = calc.calculate_cvar(
        parsed["returns"], method=parsed["method"])
    tail = calc.calculate_tail_risk_measures(parsed["returns"])
    scenarios = calc.analyze_stress_scenarios(
        parsed["returns"], {"crisis_2008": 2.0, "covid_crash": 1.5, "ftx_collapse": 1.8})
    return {
        "var": float(res.var_value),
        "cvar": float(res.cvar_value),
        "confidence_level": res.confidence_level,
        "time_horizon": res.time_horizon,
        "method": res.method,
        "n_observations": int(parsed["returns"].shape[0]),
        "tail": {k: (float(v) if np.isfinite(v) else None)
                 for k, v in tail.items()},
        "scenarios": {
            name: {"cvar": float(s["cvar"]), "var": float(s["var"]),
                   "shock_multiplier": s["shock_multiplier"]}
            for name, s in scenarios.items()
        },
    }


async def cvar_analysis_request(params: dict) -> dict:
    """Handle a cvar_analysis WS request — VaR/CVaR + tail measures."""
    returns = _parse_returns(params)
    if isinstance(returns, str):
        return {"type": "cvar_result", "error": returns}
    method = str(params.get("method", "historical"))[:16]
    if method not in _CVAR_METHODS:
        return {"type": "cvar_result", "error": f"unknown method '{method}' — {_CVAR_METHODS}"}
    try:
        confidence = float(params.get("confidence", 0.95))
        horizon = float(params.get("time_horizon", 1.0))
    except (TypeError, ValueError):
        return {"type": "cvar_result", "error": "confidence/time_horizon must be numbers"}
    if not (0.5 < confidence < 0.999) or horizon <= 0:
        return {"type": "cvar_result", "error": "confidence must be in (0.5, 0.999), horizon > 0"}
    parsed = {"returns": returns, "confidence": confidence,
              "time_horizon": horizon, "method": method}
    try:
        out = await asyncio.to_thread(_cvar_compute, parsed)
    except (ValueError, RuntimeError, FloatingPointError) as e:
        return {"type": "cvar_result", "error": f"cvar failed: {e}"}
    logger.info("CVaR computed: %s @%.2f over %s obs", method, confidence, returns.shape[0])
    return {"type": "cvar_result", **out}


def _stress_compute(parsed: dict) -> dict:
    from src.risk.stress_test import StressTestScenario

    tester = StressTestScenario(initial_portfolio_value=parsed["portfolio_value"])
    prices, positions = parsed["prices"], parsed["positions"]
    scenario = parsed.get("scenario")
    if scenario:
        fn = {
            "crisis_2008": tester.crisis_2008_scenario,
            "covid_crash": tester.covid_crash_scenario,
            "ftx_collapse": tester.ftx_collapse_scenario,
        }[scenario]
        results = [fn(prices, positions)]
    else:
        results = tester.run_all_scenarios(prices, positions)
    if parsed.get("custom_shocks") is not None:
        results.append(tester.custom_scenario(
            prices, positions, parsed["custom_shocks"], "Custom Shock"))
    return {
        "results": [
            {"scenario": r.scenario_name,
             "value_before": round(float(r.portfolio_value_before), 2),
             "value_after": round(float(r.portfolio_value_after), 2),
             "pnl": round(float(r.pnl), 2),
             "pnl_pct": round(float(r.pnl_percentage), 6),
             "margin_requirement": round(float(r.margin_requirement), 2),
             "liquidity_impact": round(float(r.liquidity_impact), 4),
             "passed": bool(r.passed)}
            for r in results
        ],
        "summary": {k: round(float(v), 6) for k, v in
                    tester.generate_summary(results).items()},
    }


async def stress_test_request(params: dict) -> dict:
    """Handle a stress_test WS request — predefined + custom scenarios."""
    raw = params.get("positions")
    if not isinstance(raw, list) or not (1 <= len(raw) <= _MAX_POSITIONS):
        return {"type": "stress_test_result", "error": f"need 1-{_MAX_POSITIONS} positions"}
    prices, positions = [], []
    for p in raw:
        try:
            qty, price = float(p["qty"]), float(p["price"])
        except (TypeError, ValueError, KeyError):
            return {"type": "stress_test_result",
                    "error": "each position needs numeric qty + price"}
        prices.append(price)
        positions.append(qty)
    scenario = params.get("scenario")
    if scenario is not None and scenario not in _SCENARIOS:
        return {"type": "stress_test_result",
                "error": f"unknown scenario '{scenario}' — {_SCENARIOS} or omit for all"}
    custom = params.get("custom_shocks")
    parsed_custom = None
    if custom is not None:
        try:
            parsed_custom = np.asarray([float(s) for s in custom], dtype=float)
        except (TypeError, ValueError):
            return {"type": "stress_test_result", "error": "custom_shocks must be numbers"}
        if parsed_custom.shape[0] != len(prices) or np.any(parsed_custom <= 0):
            return {"type": "stress_test_result",
                    "error": "custom_shocks length must match positions, all > 0"}
    try:
        portfolio_value = float(params.get("portfolio_value", 0) or
                                float(np.dot(np.asarray(prices), np.asarray(positions))))
    except (TypeError, ValueError):
        portfolio_value = 0.0
    parsed = {"prices": np.asarray(prices, dtype=float),
              "positions": np.asarray(positions, dtype=float),
              "portfolio_value": portfolio_value,
              "scenario": scenario, "custom_shocks": parsed_custom}
    out = await asyncio.to_thread(_stress_compute, parsed)
    logger.info("Stress test run: %s positions, scenario=%s", len(prices), scenario or "all")
    return {"type": "stress_test_result", **out}


def _size_compute(parsed: dict) -> dict:
    from src.risk.position_sizing import DynamicPositionSizer

    sizer = DynamicPositionSizer(
        account_value=parsed["account_value"],
        max_position_size=parsed["max_position_pct"],
    )
    res = sizer.calculate_position_size(
        signal=parsed["direction"], price=parsed["price"],
        volatility=parsed["volatility"], risk_per_trade=parsed["risk_per_trade"],
        method=parsed["method"])
    return {
        "position_size": float(res.position_size),
        "position_value": float(res.position_value),
        "risk_amount": float(res.risk_amount),
        "leverage": float(res.leverage),
        "method": res.method,
    }


async def position_size_request(params: dict) -> dict:
    """Handle a position_size WS request — dynamic sizing methods."""
    direction = str(params.get("direction", "")).upper()[:8]
    if direction not in ("LONG", "SHORT", "HOLD"):
        return {"type": "position_size_result",
                "error": "direction must be LONG|SHORT|HOLD"}
    method = str(params.get("method", "volatility"))[:16]
    if method not in _SIZING_METHODS:
        return {"type": "position_size_result",
                "error": f"unknown method '{method}' — {_SIZING_METHODS}"}
    try:
        price = float(params.get("price", 0))
        account = float(params.get("account_value", 10000))
        risk_pct = float(params.get("risk_per_trade", 0.02))
        max_pos = float(params.get("max_position_pct", 0.2))
    except (TypeError, ValueError):
        return {"type": "position_size_result", "error": "numeric fields must be numbers"}
    if price <= 0 or account <= 0 or not (0 < risk_pct <= 1) or not (0 < max_pos <= 1):
        return {"type": "position_size_result",
                "error": "price/account > 0, risk_per_trade & max_position_pct in (0, 1]"}
    volatility = params.get("volatility")
    if volatility is not None:
        try:
            volatility = float(volatility)
        except (TypeError, ValueError):
            return {"type": "position_size_result", "error": "volatility must be a number"}
        if volatility <= 0:
            return {"type": "position_size_result", "error": "volatility must be > 0"}
    elif method in ("volatility", "kelly"):
        return {"type": "position_size_result",
                "error": f"method '{method}' requires volatility"}
    parsed = {"direction": direction, "price": price, "account_value": account,
              "risk_per_trade": risk_pct, "max_position_pct": max_pos,
              "volatility": volatility, "method": method}
    try:
        out = await asyncio.to_thread(_size_compute, parsed)
    except (ValueError, RuntimeError, ZeroDivisionError) as e:
        return {"type": "position_size_result", "error": f"sizing failed: {e}"}
    logger.info("Position size: %s %s @%s → %s", direction, method, price, out["position_size"])
    return {"type": "position_size_result", **out}


def _hawkes_compute(parsed: dict) -> dict:
    from src.technical_analysis.hawkes_funcs import fit_hawkes, hawkes_intensity

    events, t = parsed["events"], parsed["t"]
    params = fit_hawkes(events, t)
    step = t / min(_MAX_PATH_POINTS, max(len(events), 10))
    grid = [i * step for i in range(1, int(t / step) + 1)]
    path = [
        {"t": round(g, 4),
         "intensity": round(hawkes_intensity(g, events, params.mu, params.alpha, params.beta), 6)}
        for g in grid
    ]
    return {
        "params": {
            "mu": round(params.mu, 6), "alpha": round(params.alpha, 6),
            "beta": round(params.beta, 6),
            "branching_ratio": round(params.branching_ratio, 6),
            "log_lik": round(params.log_lik, 4),
        },
        "n_events": len(events),
        "horizon": t,
        "intensity_path": path,
    }


async def hawkes_fit_request(params: dict) -> dict:
    """Handle a hawkes_fit WS request — MLE fit + conditional intensity path."""
    raw = params.get("events")
    if not isinstance(raw, list) or not (5 <= len(raw) <= _MAX_EVENTS):
        return {"type": "hawkes_result", "error": f"need 5-{_MAX_EVENTS} event times"}
    try:
        events = sorted(float(e) for e in raw)
    except (TypeError, ValueError):
        return {"type": "hawkes_result", "error": "events must be numbers"}
    t = events[-1] - events[0]
    if t <= 0:
        return {"type": "hawkes_result", "error": "event times must span t > 0"}
    # Normalize to a [0, T] window — the model is time-origin invariant
    events = [e - events[0] for e in events]
    try:
        out = await asyncio.to_thread(_hawkes_compute, {"events": events, "t": t})
    except (ValueError, RuntimeError, OverflowError) as e:
        return {"type": "hawkes_result", "error": f"hawkes fit failed: {e}"}
    logger.info("Hawkes fit: n=%s T=%.1f branching=%.3f",
                len(events), t, out["params"]["branching_ratio"])
    return {"type": "hawkes_result", **out}


def _arb_scan(parsed: dict) -> dict:
    from src.strategies.funding_arb_detector import FundingRateArbitrageDetector

    det = FundingRateArbitrageDetector()
    now = int(time.time())
    for exchange, rate in parsed["funding_rates"].items():
        for symbol in parsed["symbols"]:
            det.update_funding_rate(exchange, symbol, rate, now + 8 * 3600)
    for exchange, sym_prices in parsed["prices"].items():
        for symbol, price in sym_prices.items():
            # The simulator's perp trades on the same price feed and charges
            # funding on open positions — spot/perp spread is 0 by design.
            det.update_spot_price(exchange, symbol, price)
            det.update_perp_price(exchange, symbol, price)
    opps = det.detect()
    return {
        "opportunities": [
            {"type": o.type.value, "symbol": o.symbol, "exchanges": o.exchanges,
             "funding_rate": round(float(o.funding_rate), 6),
             "expected_daily_return": round(float(o.expected_daily_return), 6),
             "cost_estimate": round(float(o.cost_estimate), 6),
             "net_expected_return": round(float(o.net_expected_return), 6),
             "confidence": round(float(o.confidence), 2),
             "details": o.details, "timestamp": o.timestamp}
            for o in opps
        ],
        "scanned_exchanges": len(parsed["funding_rates"]),
        "scanned_symbols": len(parsed["symbols"]),
    }


async def funding_arb_scan_request(params: dict, exchange=None) -> dict:
    """Handle a funding_arb_scan WS request — detect funding-rate arbitrage."""
    funding = params.get("funding_rates")
    prices = params.get("prices")
    symbols = params.get("symbols")
    if exchange is not None:
        funding = funding or getattr(exchange, "funding_rates", None)
        prices = prices or getattr(exchange, "latest_prices", None)
    if not isinstance(funding, dict) or not funding:
        return {"type": "funding_arb_result", "error": "no funding_rates (request or live feed)"}
    try:
        funding = {str(k)[:32]: float(v) for k, v in funding.items()}
    except (TypeError, ValueError):
        return {"type": "funding_arb_result", "error": "funding_rates must be {exchange: number}"}
    if not isinstance(prices, dict) or not prices:
        return {"type": "funding_arb_result", "error": "no prices (request or live feed)"}
    if not isinstance(symbols, list) or not symbols:
        symbols = sorted({s for sp in prices.values() for s in sp})[:50]
    else:
        symbols = [str(s)[:32] for s in symbols[:50]]
    parsed = {"funding_rates": funding, "prices": prices, "symbols": symbols}
    out = await asyncio.to_thread(_arb_scan, parsed)
    logger.info("Funding arb scan: %s exchanges → %s opportunities",
                len(funding), len(out["opportunities"]))
    return {"type": "funding_arb_result", **out}
