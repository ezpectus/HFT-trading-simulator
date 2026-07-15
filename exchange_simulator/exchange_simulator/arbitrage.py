"""Multi-exchange arbitrage detector.

Monitors price differences across exchanges for the same symbol and
detects arbitrage opportunities (buy low on one exchange, sell high
on another).

Arbitrage condition:
    best_ask(exchange_A) < best_bid(exchange_B)
    profit = best_bid(B) - best_ask(A) - fees - slippage

The detector runs in the exchange simulator and broadcasts opportunities
via the WebSocket server so bots can act on them.
"""
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from exchange_simulator.models import OrderBook

logger = logging.getLogger("exchange_simulator.arbitrage")


class ArbStatus(Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    EXPIRED = "EXPIRED"


@dataclass
class ArbitrageOpportunity:
    """A cross-exchange arbitrage opportunity."""
    symbol: str
    buy_exchange: str
    sell_exchange: str
    buy_price: float       # best ask on buy exchange
    sell_price: float      # best bid on sell exchange
    gross_spread: float    # sell_price - buy_price
    net_spread: float      # after fees
    spread_bps: float      # net spread in basis points
    buy_quantity: float    # available quantity at buy price
    sell_quantity: float   # available quantity at sell price
    max_quantity: float    # min(buy_qty, sell_qty)
    estimated_profit: float
    timestamp: int
    status: ArbStatus = ArbStatus.OPEN
    closed_at: int = 0
    close_reason: str = ""


class ArbitrageDetector:
    """Detects cross-exchange arbitrage opportunities.

    Scans order books across all exchanges for each symbol and identifies
    cases where the best ask on one exchange is below the best bid on another.

    Usage:
        detector = ArbitrageDetector(
            exchanges={"binance": ex1, "bybit": ex2, "okx": ex3},
            fee_pct=0.075,
            min_spread_bps=5.0,
        )
        opportunities = detector.scan()
        detector.broadcast(opportunities, websocket_server)
    """

    def __init__(
        self,
        exchanges: dict,
        fee_pct: float = 0.075,        # per side, in percent
        slippage_bps: float = 2.0,
        min_spread_bps: float = 5.0,    # minimum net spread to report
        max_opportunities: int = 50,
        opportunity_ttl: float = 30.0,  # seconds before expiry
    ):
        self.exchanges = exchanges
        self.fee_pct = fee_pct
        self.slippage_bps = slippage_bps
        self.min_spread_bps = min_spread_bps
        self.max_opportunities = max_opportunities
        self.opportunity_ttl = opportunity_ttl

        self._active_opportunities: list[ArbitrageOpportunity] = []
        self._closed_history: list[ArbitrageOpportunity] = []
        self._stats = {
            "total_detected": 0,
            "total_closed": 0,
            "total_expired": 0,
            "total_estimated_profit": 0.0,
            "best_spread_bps": 0.0,
        }

    @property
    def stats(self) -> dict:
        return dict(self._stats)

    @property
    def active_count(self) -> int:
        return len(self._active_opportunities)

    def scan(self) -> list[ArbitrageOpportunity]:
        """Scan all exchanges for arbitrage opportunities.

        Returns list of new opportunities found.
        """
        now = int(time.time())
        new_opportunities = []

        # Get all symbols
        symbols = set()
        for ex in self.exchanges.values():
            symbols.update(ex.symbols)

        for symbol in symbols:
            # Collect order books from all exchanges
            books: dict[str, OrderBook] = {}
            for ex_id, exchange in self.exchanges.items():
                ob = exchange.get_order_book(symbol)
                if ob.bids and ob.asks:
                    books[ex_id] = ob

            if len(books) < 2:
                continue

            # Build price list
            exchange_prices = []
            for ex_id, ob in books.items():
                exchange_prices.append({
                    "exchange": ex_id,
                    "best_bid": ob.best_bid,
                    "best_ask": ob.best_ask,
                    "bid_qty": ob.bids[0].quantity,
                    "ask_qty": ob.asks[0].quantity,
                })

            # Check all exchange pairs
            for i, buyer in enumerate(exchange_prices):
                for j, seller in enumerate(exchange_prices):
                    if i == j:
                        continue

                    buy_price = buyer["best_ask"]
                    sell_price = seller["best_bid"]

                    if sell_price <= buy_price:
                        continue

                    # Net spread after fees + slippage
                    buy_fee = buy_price * self.fee_pct / 100
                    sell_fee = sell_price * self.fee_pct / 100
                    buy_slip = buy_price * self.slippage_bps / 10000
                    sell_slip = sell_price * self.slippage_bps / 10000

                    net_spread = sell_price - buy_price - buy_fee - sell_fee - buy_slip - sell_slip

                    if net_spread <= 0:
                        continue

                    spread_bps = net_spread / buy_price * 10000
                    if spread_bps < self.min_spread_bps:
                        continue

                    max_qty = min(buyer["ask_qty"], seller["bid_qty"])
                    est_profit = net_spread * max_qty

                    opp = ArbitrageOpportunity(
                        symbol=symbol,
                        buy_exchange=buyer["exchange"],
                        sell_exchange=seller["exchange"],
                        buy_price=buy_price,
                        sell_price=sell_price,
                        gross_spread=sell_price - buy_price,
                        net_spread=net_spread,
                        spread_bps=spread_bps,
                        buy_quantity=buyer["ask_qty"],
                        sell_quantity=seller["bid_qty"],
                        max_quantity=max_qty,
                        estimated_profit=est_profit,
                        timestamp=now,
                    )

                    # Check if this is a duplicate of an active opportunity
                    is_dup = any(
                        o.symbol == opp.symbol
                        and o.buy_exchange == opp.buy_exchange
                        and o.sell_exchange == opp.sell_exchange
                        for o in self._active_opportunities
                    )

                    if not is_dup:
                        new_opportunities.append(opp)
                        self._active_opportunities.append(opp)
                        self._stats["total_detected"] += 1
                        self._stats["total_estimated_profit"] += est_profit
                        self._stats["best_spread_bps"] = max(
                            self._stats["best_spread_bps"], spread_bps
                        )

                        logger.info(
                            f"ARB FOUND: {symbol} "
                            f"buy={opp.buy_exchange}@{buy_price:.2f} "
                            f"sell={opp.sell_exchange}@{sell_price:.2f} "
                            f"net={net_spread:.2f} ({spread_bps:.1f}bps) "
                            f"qty={max_qty:.4f} profit=${est_profit:.2f}"
                        )

        # Expire old opportunities
        self._expire_old(now)

        # Trim history
        if len(self._closed_history) > self.max_opportunities:
            self._closed_history = self._closed_history[-self.max_opportunities:]

        return new_opportunities

    def _expire_old(self, now: int) -> None:
        """Expire opportunities older than TTL."""
        still_active = []
        for opp in self._active_opportunities:
            age = now - opp.timestamp
            if age > self.opportunity_ttl:
                opp.status = ArbStatus.EXPIRED
                opp.closed_at = now
                opp.close_reason = "TTL expired"
                self._closed_history.append(opp)
                self._stats["total_expired"] += 1
            else:
                still_active.append(opp)
        self._active_opportunities = still_active

    def close_opportunity(self, symbol: str, buy_ex: str, sell_ex: str, reason: str = "executed") -> None:
        """Mark an opportunity as closed (executed by a bot)."""
        now = int(time.time())
        for i, opp in enumerate(self._active_opportunities):
            if opp.symbol == symbol and opp.buy_exchange == buy_ex and opp.sell_exchange == sell_ex:
                opp.status = ArbStatus.CLOSED
                opp.closed_at = now
                opp.close_reason = reason
                self._closed_history.append(opp)
                self._active_opportunities.pop(i)
                self._stats["total_closed"] += 1
                logger.info(f"ARB CLOSED: {symbol} {buy_ex}→{sell_ex} ({reason})")
                return

    def get_active(self) -> list[ArbitrageOpportunity]:
        """Get currently active opportunities."""
        return list(self._active_opportunities)

    def get_recent_closed(self, limit: int = 20) -> list[ArbitrageOpportunity]:
        """Get recently closed/expired opportunities."""
        return self._closed_history[-limit:]

    def to_dict(self) -> dict:
        """Serialize detector state for WebSocket broadcast."""
        return {
            "type": "arbitrage_scan",
            "active": [
                {
                    "symbol": o.symbol,
                    "buy_exchange": o.buy_exchange,
                    "sell_exchange": o.sell_exchange,
                    "buy_price": o.buy_price,
                    "sell_price": o.sell_price,
                    "net_spread": o.net_spread,
                    "spread_bps": o.spread_bps,
                    "max_quantity": o.max_quantity,
                    "estimated_profit": o.estimated_profit,
                    "timestamp": o.timestamp,
                }
                for o in self._active_opportunities
            ],
            "stats": self._stats,
            "active_count": len(self._active_opportunities),
        }

    def render_terminal(self) -> str:
        """Render arbitrage info for terminal visualizer."""
        if not self._active_opportunities:
            return "  No active arbitrage opportunities"

        lines = [f"  Active Arbitrage ({len(self._active_opportunities)}):"]
        for opp in sorted(self._active_opportunities, key=lambda x: x.spread_bps, reverse=True)[:5]:
            lines.append(
                f"    {opp.symbol:<12} "
                f"Buy {opp.buy_exchange:>8}@{opp.buy_price:>10.2f}  "
                f"Sell {opp.sell_exchange:>8}@{opp.sell_price:>10.2f}  "
                f"Net: {opp.net_spread:>+8.2f} ({opp.spread_bps:>6.1f}bps)  "
                f"Qty: {opp.max_quantity:.4f}  "
                f"Profit: ${opp.estimated_profit:.2f}"
            )
        return "\n".join(lines)
