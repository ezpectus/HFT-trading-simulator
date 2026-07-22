"""
Funding rate arbitrage detector.

Detects arbitrage opportunities between:
1. Spot vs Perp funding: Buy spot, short perp, collect funding
2. Cross-exchange funding: Short high-funding exchange, long low-funding exchange
3. Calendar spread: Near-term vs far-term funding rate differential

Strategy:
  When funding rate > threshold and spot/perp spread < threshold:
  → Buy spot, short perp → collect funding every 8h
  → Unwind when funding rate drops below threshold or spread widens
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ArbType(Enum):
    SPOT_PERP = "spot_perp"
    CROSS_EXCHANGE = "cross_exchange"
    CALENDAR_SPREAD = "calendar_spread"


@dataclass
class FundingRate:
    exchange: str
    symbol: str
    rate: float  # 8h funding rate as fraction (0.0001 = 0.01%)
    next_funding_time: int  # unix seconds
    timestamp: int = 0

    def __post_init__(self):
        if self.timestamp == 0:
            self.timestamp = int(time.time())

    @property
    def annualized(self) -> float:
        """Approximate annualized rate (3 funding periods/day * 365)."""
        return self.rate * 3 * 365

    @property
    def daily(self) -> float:
        """Daily funding rate (3 periods)."""
        return self.rate * 3


@dataclass
class ArbitrageOpportunity:
    type: ArbType
    symbol: str
    exchanges: list[str]
    funding_rate: float
    expected_daily_return: float
    cost_estimate: float
    net_expected_return: float
    confidence: float  # 0-100
    details: dict = field(default_factory=dict)
    timestamp: int = 0

    def __post_init__(self):
        if self.timestamp == 0:
            self.timestamp = int(time.time())


class FundingRateArbitrageDetector:
    """
    Detects funding rate arbitrage opportunities.

    Config:
      min_funding_rate: Minimum 8h funding rate to trigger (default 0.0003 = 0.03%)
      max_spread: Maximum spot/perp spread to enter (default 0.001 = 0.1%)
      min_confidence: Minimum confidence to signal (default 60)
      cost_per_trade: Estimated round-trip cost as fraction (default 0.0005)
    """

    def __init__(
        self,
        min_funding_rate: float = 0.0003,
        max_spread: float = 0.001,
        min_confidence: float = 60.0,
        cost_per_trade: float = 0.0005,
    ):
        self.min_funding_rate = min_funding_rate
        self.max_spread = max_spread
        self.min_confidence = min_confidence
        self.cost_per_trade = cost_per_trade

        self._funding_rates: dict[str, dict[str, FundingRate]] = {}  # exchange → symbol → rate
        self._spot_prices: dict[str, dict[str, float]] = {}  # exchange → symbol → price
        self._perp_prices: dict[str, dict[str, float]] = {}  # exchange → symbol → price

        self.on_opportunity: Callable[[ArbitrageOpportunity], Awaitable[None]] | None = None
        self._active_opportunities: dict[str, ArbitrageOpportunity] = {}

    def update_funding_rate(self, exchange: str, symbol: str, rate: float, next_funding: int):
        if exchange not in self._funding_rates:
            self._funding_rates[exchange] = {}
        self._funding_rates[exchange][symbol] = FundingRate(
            exchange=exchange, symbol=symbol, rate=rate, next_funding_time=next_funding
        )

    def update_spot_price(self, exchange: str, symbol: str, price: float):
        if exchange not in self._spot_prices:
            self._spot_prices[exchange] = {}
        self._spot_prices[exchange][symbol] = price

    def update_perp_price(self, exchange: str, symbol: str, price: float):
        if exchange not in self._perp_prices:
            self._perp_prices[exchange] = {}
        self._perp_prices[exchange][symbol] = price

    def detect(self) -> list[ArbitrageOpportunity]:
        """Run all detection strategies and return opportunities."""
        opportunities = []
        opportunities.extend(self._detect_spot_perp())
        opportunities.extend(self._detect_cross_exchange())
        opportunities.extend(self._detect_calendar_spread())

        # Filter by confidence
        filtered = [o for o in opportunities if o.confidence >= self.min_confidence]

        # Update active opportunities
        for opp in filtered:
            key = f"{opp.type.value}:{opp.symbol}:{','.join(opp.exchanges)}"
            self._active_opportunities[key] = opp

        return filtered

    def _detect_spot_perp(self) -> list[ArbitrageOpportunity]:
        """Detect spot vs perp funding arbitrage."""
        results = []

        for exchange, funding_map in self._funding_rates.items():
            spot_prices = self._spot_prices.get(exchange, {})
            perp_prices = self._perp_prices.get(exchange, {})

            for symbol, funding in funding_map.items():
                if funding.rate < self.min_funding_rate:
                    continue

                spot = spot_prices.get(symbol)
                perp = perp_prices.get(symbol)
                if not spot or not perp:
                    continue

                spread = abs(perp - spot) / spot
                if spread > self.max_spread:
                    continue

                daily_funding = funding.daily
                cost = self.cost_per_trade * 2  # entry + exit
                net_daily = daily_funding - cost / 30  # amortize cost over 30 days

                if net_daily <= 0:
                    continue

                confidence = min(100, funding.rate / self.min_funding_rate * 50 + (1 - spread / self.max_spread) * 50)

                results.append(ArbitrageOpportunity(
                    type=ArbType.SPOT_PERP,
                    symbol=symbol,
                    exchanges=[exchange],
                    funding_rate=funding.rate,
                    expected_daily_return=daily_funding,
                    cost_estimate=cost,
                    net_expected_return=net_daily,
                    confidence=confidence,
                    details={
                        "spot_price": spot,
                        "perp_price": perp,
                        "spread": spread,
                        "next_funding": funding.next_funding_time,
                        "annualized": funding.annualized,
                        "action": f"Buy spot {symbol}, short perp {symbol} on {exchange}",
                    },
                ))

        return results

    def _detect_cross_exchange(self) -> list[ArbitrageOpportunity]:
        """Detect cross-exchange funding rate arbitrage."""
        results = []

        all_symbols = set()
        for funding_map in self._funding_rates.values():
            all_symbols.update(funding_map.keys())

        for symbol in all_symbols:
            rates_by_exchange = {}
            for exchange, funding_map in self._funding_rates.items():
                if symbol in funding_map:
                    rates_by_exchange[exchange] = funding_map[symbol]

            if len(rates_by_exchange) < 2:
                continue

            sorted_rates = sorted(rates_by_exchange.items(), key=lambda x: x[1].rate, reverse=True)
            high_exchange, high_funding = sorted_rates[0]
            low_exchange, low_funding = sorted_rates[-1]

            rate_diff = high_funding.rate - low_funding.rate
            if rate_diff < self.min_funding_rate:
                continue

            cost = self.cost_per_trade * 2
            net_daily = rate_diff * 3 - cost / 30

            if net_daily <= 0:
                continue

            confidence = min(100, rate_diff / self.min_funding_rate * 60 + 40)

            results.append(ArbitrageOpportunity(
                type=ArbType.CROSS_EXCHANGE,
                symbol=symbol,
                exchanges=[high_exchange, low_exchange],
                funding_rate=rate_diff,
                expected_daily_return=rate_diff * 3,
                cost_estimate=cost,
                net_expected_return=net_daily,
                confidence=confidence,
                details={
                    "high_exchange": high_exchange,
                    "high_rate": high_funding.rate,
                    "low_exchange": low_exchange,
                    "low_rate": low_funding.rate,
                    "action": f"Short perp on {high_exchange} ({high_funding.rate:.4%}), long perp on {low_exchange} ({low_funding.rate:.4%})",
                },
            ))

        return results

    def _detect_calendar_spread(self) -> list[ArbitrageOpportunity]:
        """Detect calendar spread funding arbitrage (near vs far term)."""
        results = []

        # This would require multiple expiry funding data
        # Placeholder for future implementation with term structure data
        return results

    def get_active_opportunities(self) -> dict[str, ArbitrageOpportunity]:
        """Return currently active opportunities."""
        return dict(self._active_opportunities)

    def format_opportunity(self, opp: ArbitrageOpportunity) -> str:
        """Format opportunity for display/notification."""
        lines = [
            f"Funding Arb: {opp.type.value} — {opp.symbol}",
            f"  Exchanges: {', '.join(opp.exchanges)}",
            f"  Funding rate: {opp.funding_rate:.4%} (8h)",
            f"  Expected daily: {opp.expected_daily_return:.4%}",
            f"  Cost estimate: {opp.cost_estimate:.4%}",
            f"  Net daily return: {opp.net_expected_return:.4%}",
            f"  Confidence: {opp.confidence:.0f}%",
            f"  Action: {opp.details.get('action', 'N/A')}",
        ]
        return "\n".join(lines)
