"""
Brinson-Fachler performance attribution.

Decomposes portfolio returns into:
  - Allocation effect: return from over/under-weighting sectors
  - Selection effect: return from picking better securities within sectors
  - Interaction effect: combined allocation + selection
  - Benchmark return: passive index return

Formula:
  Allocation_i = (w_p_i - w_b_i) * (r_b_i - r_b)
  Selection_i = w_b_i * (r_p_i - r_b_i)
  Interaction_i = (w_p_i - w_b_i) * (r_p_i - r_b_i)

Where:
  w_p_i = portfolio weight in sector i
  w_b_i = benchmark weight in sector i
  r_p_i = portfolio return in sector i
  r_b_i = benchmark return in sector i
  r_b   = total benchmark return

Usage:
    from src.research.attribution import BrinsonFachler

    bf = BrinsonFachler()
    result = bf.attribute(
        portfolio_weights={"BTC": 0.4, "ETH": 0.3, "SOL": 0.3},
        benchmark_weights={"BTC": 0.5, "ETH": 0.3, "SOL": 0.2},
        portfolio_returns={"BTC": 0.05, "ETH": 0.03, "SOL": 0.08},
        benchmark_returns={"BTC": 0.02, "ETH": 0.04, "SOL": 0.05},
    )
    bf.print_report(result)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SectorAttribution:
    sector: str
    portfolio_weight: float
    benchmark_weight: float
    portfolio_return: float
    benchmark_return: float
    allocation_effect: float
    selection_effect: float
    interaction_effect: float
    total_effect: float


@dataclass
class AttributionResult:
    total_portfolio_return: float
    total_benchmark_return: float
    active_return: float
    total_allocation_effect: float
    total_selection_effect: float
    total_interaction_effect: float
    sectors: list[SectorAttribution] = field(default_factory=list)


class BrinsonFachler:
    """Brinson-Fachler performance attribution model."""

    def attribute(
        self,
        portfolio_weights: dict[str, float],
        benchmark_weights: dict[str, float],
        portfolio_returns: dict[str, float],
        benchmark_returns: dict[str, float],
    ) -> AttributionResult:
        """
        Perform Brinson-Fachler attribution.

        Args:
            portfolio_weights: {sector: weight} for portfolio
            benchmark_weights: {sector: weight} for benchmark
            portfolio_returns: {sector: return} for portfolio
            benchmark_returns: {sector: return} for benchmark

        Returns:
            AttributionResult with full decomposition
        """
        all_sectors = set(list(portfolio_weights.keys()) + list(benchmark_weights.keys()))

        # Total returns
        total_p_return = sum(
            portfolio_weights.get(s, 0) * portfolio_returns.get(s, 0) for s in all_sectors
        )
        total_b_return = sum(
            benchmark_weights.get(s, 0) * benchmark_returns.get(s, 0) for s in all_sectors
        )

        sector_results: list[SectorAttribution] = []
        total_alloc = 0.0
        total_select = 0.0
        total_inter = 0.0

        for sector in all_sectors:
            w_p = portfolio_weights.get(sector, 0)
            w_b = benchmark_weights.get(sector, 0)
            r_p = portfolio_returns.get(sector, 0)
            r_b = benchmark_returns.get(sector, 0)

            # Brinson-Fachler formulas
            allocation = (w_p - w_b) * (r_b - total_b_return)
            selection = w_b * (r_p - r_b)
            interaction = (w_p - w_b) * (r_p - r_b)

            total_alloc += allocation
            total_select += selection
            total_inter += interaction

            sector_results.append(SectorAttribution(
                sector=sector,
                portfolio_weight=w_p,
                benchmark_weight=w_b,
                portfolio_return=r_p,
                benchmark_return=r_b,
                allocation_effect=allocation,
                selection_effect=selection,
                interaction_effect=interaction,
                total_effect=allocation + selection + interaction,
            ))

        active_return = total_p_return - total_b_return

        return AttributionResult(
            total_portfolio_return=total_p_return,
            total_benchmark_return=total_b_return,
            active_return=active_return,
            total_allocation_effect=total_alloc,
            total_selection_effect=total_select,
            total_interaction_effect=total_inter,
            sectors=sector_results,
        )

    def print_report(self, result: AttributionResult) -> None:
        """Print formatted attribution report."""
        logger.info(f"\n{'='*90}")
        logger.info("Brinson-Fachler Performance Attribution Report")
        logger.info(f"{'='*90}")
        logger.info(f"Portfolio Return:  {result.total_portfolio_return:>10.4f} ({result.total_portfolio_return*100:.2f}%)")
        logger.info(f"Benchmark Return:  {result.total_benchmark_return:>10.4f} ({result.total_benchmark_return*100:.2f}%)")
        logger.info(f"Active Return:     {result.active_return:>10.4f} ({result.active_return*100:.2f}%)")
        logger.info(f"{'-'*90}")
        logger.info(f"{'Sector':<12} {'W_p':>8} {'W_b':>8} {'R_p':>8} {'R_b':>8} "
                    f"{'Alloc':>8} {'Select':>8} {'Inter':>8} {'Total':>8}")
        logger.info(f"{'-'*90}")

        for s in result.sectors:
            logger.info(
                f"{s.sector:<12} {s.portfolio_weight:>8.2%} {s.benchmark_weight:>8.2%} "
                f"{s.portfolio_return:>8.2%} {s.benchmark_return:>8.2%} "
                f"{s.allocation_effect:>8.4f} {s.selection_effect:>8.4f} "
                f"{s.interaction_effect:>8.4f} {s.total_effect:>8.4f}"
            )

        logger.info(f"{'-'*90}")
        logger.info(
            f"{'TOTAL':<12} {'':>8} {'':>8} {'':>8} {'':>8} "
            f"{result.total_allocation_effect:>8.4f} {result.total_selection_effect:>8.4f} "
            f"{result.total_interaction_effect:>8.4f} "
            f"{result.total_allocation_effect + result.total_selection_effect + result.total_interaction_effect:>8.4f}"
        )
        logger.info(f"{'='*90}")

    def multi_period_attribution(
        self,
        periods: list[dict[str, dict[str, float]]],
    ) -> list[AttributionResult]:
        """Run attribution across multiple time periods."""
        results = []
        for _i, period in enumerate(periods):
            result = self.attribute(
                portfolio_weights=period["portfolio_weights"],
                benchmark_weights=period["benchmark_weights"],
                portfolio_returns=period["portfolio_returns"],
                benchmark_returns=period["benchmark_returns"],
            )
            results.append(result)
        return results
