"""
Options Greeks hedging simulator.

Simulates delta hedging of options positions:
  - Delta hedging: adjust stock position to maintain delta-neutral
  - Gamma scalping: profit from gamma by rebalancing delta
  - Vega hedging: offset vega exposure with other options
  - Portfolio Greeks: aggregate across all positions

Simulates:
  - Daily rebalancing vs. threshold-based rebalancing
  - Transaction costs impact on hedge effectiveness
  - P&L decomposition (delta P&L, gamma P&L, theta P&L, vega P&L)

Usage:
    from src.research.greeks_hedging import GreeksHedgingSimulator

    sim = GreeksHedgingSimulator(s0=65000, sigma=0.6, r=0.0, t=30/365)
    result = sim.simulate_delta_hedge(option_type='call', strike=65000, n_days=30)
    sim.print_summary(result)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def black_scholes_greeks(S, K, T, r, sigma, option_type='call'):
    """Compute Black-Scholes price and all Greeks."""
    if T <= 0 or sigma <= 0:
        intrinsic = max(S - K, 0) if option_type == 'call' else max(K - S, 0)
        return {"price": intrinsic, "delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0}

    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if option_type == 'call':
        price = S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
        delta = norm_cdf(d1)
        rho = K * T * math.exp(-r * T) * norm_cdf(d2) / 100
    else:
        price = K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)
        delta = -norm_cdf(-d1)
        rho = -K * T * math.exp(-r * T) * norm_cdf(-d2) / 100

    gamma = norm_pdf(d1) / (S * sigma * math.sqrt(T))
    vega = S * norm_pdf(d1) * math.sqrt(T) / 100
    theta = (-(S * norm_pdf(d1) * sigma) / (2 * math.sqrt(T))
             - r * K * math.exp(-r * T) * (norm_cdf(d2) if option_type == 'call' else -norm_cdf(-d2))) / 365

    return {"price": price, "delta": delta, "gamma": gamma, "theta": theta, "vega": vega, "rho": rho}


@dataclass
class HedgeSimulationResult:
    final_pnl: float
    hedging_pnl: float
    option_pnl: float
    transaction_costs: float
    n_rebalances: int
    avg_hedge_error: float
    max_hedge_error: float
    daily_pnl: list[float] = field(default_factory=list)
    daily_delta: list[float] = field(default_factory=list)
    daily_hedge_position: list[float] = field(default_factory=list)
    pnl_decomposition: dict[str, float] = field(default_factory=dict)


class GreeksHedgingSimulator:
    """Simulate options hedging strategies."""

    def __init__(
        self,
        s0: float = 65000.0,
        sigma: float = 0.60,
        r: float = 0.0,
        t: float = 30 / 365,
        transaction_cost_bps: float = 2.0,
    ):
        self.s0 = s0
        self.sigma = sigma
        self.r = r
        self.t = t
        self.tc_bps = transaction_cost_bps

    def simulate_delta_hedge(
        self,
        option_type: str = 'call',
        strike: float = 65000.0,
        n_days: int = 30,
        n_options: float = 1.0,
        rebalance_threshold: float = 0.05,  # rebalance when |delta| > threshold
        n_paths: int = 1,
        seed: int | None = None,
    ) -> HedgeSimulationResult:
        """
        Simulate delta hedging over time.

        Args:
            option_type: 'call' or 'put'
            strike: option strike price
            n_days: simulation length in days
            n_options: number of option contracts
            rebalance_threshold: rebalance when delta deviation exceeds this
            n_paths: number of Monte Carlo paths
            seed: random seed
        """
        if seed is not None:
            np.random.seed(seed)

        dt = 1.0 / 365.0
        all_results = []

        for _ in range(n_paths):
            # Generate price path (GBM)
            prices = np.zeros(n_days + 1)
            prices[0] = self.s0
            for i in range(1, n_days + 1):
                z = np.random.standard_normal()
                prices[i] = prices[i-1] * np.exp(
                    (self.r - 0.5 * self.sigma**2) * dt + self.sigma * math.sqrt(dt) * z
                )

            # Initial option price and Greeks
            T = self.t
            greeks = black_scholes_greeks(prices[0], strike, T, self.r, self.sigma, option_type)
            option_price_0 = greeks["price"]
            delta_0 = greeks["delta"]

            # Initial hedge: short delta shares per option
            hedge_position = -delta_0 * n_options
            cash = option_price_0 * n_options + delta_0 * n_options * prices[0]

            daily_pnl = []
            daily_delta = [delta_0]
            daily_hedge = [hedge_position]
            total_tc = 0.0
            n_rebalances = 0
            hedge_errors = []

            for day in range(1, n_days + 1):
                T_remaining = max(self.t - day * dt, 0.001)
                price = prices[day]

                # Update option Greeks
                greeks = black_scholes_greeks(price, strike, T_remaining, self.r, self.sigma, option_type)
                new_delta = greeks["delta"]

                # Daily P&L
                option_pnl = (greeks["price"] - black_scholes_greeks(
                    prices[day-1], strike, max(self.t - (day-1) * dt, 0.001),
                    self.r, self.sigma, option_type)["price"]) * n_options
                hedge_pnl = hedge_position * (price - prices[day-1])
                daily_pnl.append(option_pnl + hedge_pnl)

                # Check if rebalance needed
                target_hedge = -new_delta * n_options
                hedge_error = abs(hedge_position - target_hedge)

                if hedge_error > rebalance_threshold * n_options:
                    trade_qty = target_hedge - hedge_position
                    tc = abs(trade_qty) * price * self.tc_bps / 10000
                    total_tc += tc
                    cash -= tc
                    hedge_position = target_hedge
                    n_rebalances += 1

                hedge_errors.append(hedge_error)
                daily_delta.append(new_delta)
                daily_hedge.append(hedge_position)

            # Final settlement
            final_price = prices[-1]
            if option_type == 'call':
                payoff = max(final_price - strike, 0)
            else:
                payoff = max(strike - final_price, 0)

            final_option_value = payoff * n_options
            final_hedge_value = hedge_position * final_price
            final_pnl = cash + final_hedge_value - final_option_value

            # P&L decomposition
            total_option_pnl = final_option_value - option_price_0 * n_options
            total_hedge_pnl = sum(hedge_position * (prices[i] - prices[i-1])
                                  for i, hedge_position in enumerate([daily_hedge[0]] + daily_hedge[:-1], 1))

            result = HedgeSimulationResult(
                final_pnl=final_pnl,
                hedging_pnl=total_hedge_pnl,
                option_pnl=total_option_pnl,
                transaction_costs=total_tc,
                n_rebalances=n_rebalances,
                avg_hedge_error=float(np.mean(hedge_errors)) if hedge_errors else 0,
                max_hedge_error=float(np.max(hedge_errors)) if hedge_errors else 0,
                daily_pnl=daily_pnl,
                daily_delta=daily_delta,
                daily_hedge=daily_hedge,
                pnl_decomposition={
                    "option_pnl": total_option_pnl,
                    "hedge_pnl": total_hedge_pnl,
                    "transaction_costs": total_tc,
                    "net_pnl": final_pnl,
                    "gamma_pnl": final_pnl - total_hedge_pnl + total_option_pnl + total_tc,
                },
            )
            all_results.append(result)

        # Average across paths
        if n_paths > 1:
            avg_result = HedgeSimulationResult(
                final_pnl=float(np.mean([r.final_pnl for r in all_results])),
                hedging_pnl=float(np.mean([r.hedging_pnl for r in all_results])),
                option_pnl=float(np.mean([r.option_pnl for r in all_results])),
                transaction_costs=float(np.mean([r.transaction_costs for r in all_results])),
                n_rebalances=int(np.mean([r.n_rebalances for r in all_results])),
                avg_hedge_error=float(np.mean([r.avg_hedge_error for r in all_results])),
                max_hedge_error=float(np.mean([r.max_hedge_error for r in all_results])),
                pnl_decomposition=all_results[0].pnl_decomposition,
            )
            return avg_result

        return all_results[0]

    def print_summary(self, result: HedgeSimulationResult) -> None:
        logger.info(f"\n{'='*60}")
        logger.info("Delta Hedging Simulation Results")
        logger.info(f"{'='*60}")
        logger.info(f"Final P&L:          ${result.final_pnl:>10.2f}")
        logger.info(f"Option P&L:         ${result.option_pnl:>10.2f}")
        logger.info(f"Hedge P&L:          ${result.hedging_pnl:>10.2f}")
        logger.info(f"Transaction Costs:  ${result.transaction_costs:>10.2f}")
        logger.info(f"Rebalances:         {result.n_rebalances:>10d}")
        logger.info(f"Avg Hedge Error:    {result.avg_hedge_error:>10.4f}")
        logger.info(f"Max Hedge Error:    {result.max_hedge_error:>10.4f}")
        logger.info(f"{'-'*60}")
        logger.info("P&L Decomposition:")
        for k, v in result.pnl_decomposition.items():
            logger.info(f"  {k:<20} ${v:>10.2f}")
        logger.info(f"{'='*60}")
