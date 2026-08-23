"""Simulated exchange -- order matching engine with fees and slippage.

Each exchange (Binance, Bybit, OKX) has its own fee structure and slippage
model. Orders are matched against the simulated order book.

Refactored: advanced orders -> exchange_advanced_orders.py,
order submission -> exchange_order_submission.py,
liquidation -> exchange_liquidation.py.
"""

from collections import deque

from exchange_simulator.audit_logger import get_audit_logger
from exchange_simulator.exchange_advanced_orders import AdvancedOrderMixin
from exchange_simulator.exchange_liquidation import LiquidationMixin
from exchange_simulator.exchange_order_submission import OrderSubmissionMixin
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import (
    Account,
    AuditEventType,
    IcebergOrder,
    OCOGroup,
    Order,
    OrderBook,
    Position,
    StopLimitOrder,
    TrailingStopOrder,
)


class SimulatedExchange(
    AdvancedOrderMixin, OrderSubmissionMixin, LiquidationMixin
):
    """A single simulated exchange with order matching.

    Handles market and limit orders, applies fees and slippage,
    tracks positions and account balance.
    """

    def __init__(
        self,
        exchange_id: str,
        name: str,
        fee_pct: float,
        slippage_bps: float,
        market: MarketSimulator,
        initial_balance: float = 10000.0,
        leverage: int = 10,
    ):
        self.exchange_id = exchange_id
        self.name = name
        self.fee_pct = fee_pct
        self.slippage_bps = slippage_bps
        self.market = market
        self.account = Account(
            exchange=exchange_id,
            balance=initial_balance,
            leverage=leverage,
        )
        self._order_history: deque[Order] = deque(maxlen=10000)
        self._order_counter: int = 0
        self.insurance_fund: float = 0.0
        self.partial_liquidation_ratio: float = 0.5
        self._positions_by_symbol: dict[str, Position] = {}
        self._audit_logger = get_audit_logger()

        self._pending_stop_limits: dict[str, StopLimitOrder] = {}
        self._pending_trailing_stops: dict[str, TrailingStopOrder] = {}
        self._pending_icebergs: dict[str, IcebergOrder] = {}
        self._oco_groups: dict[str, OCOGroup] = {}

        self._audit_logger.log(
            event_type=AuditEventType.SYSTEM_START,
            exchange=exchange_id,
            metadata={"name": name, "initial_balance": initial_balance, "leverage": leverage},
        )

    @property
    def symbols(self) -> list[str]:
        return self.market.symbols

    def get_price(self, symbol: str) -> float:
        return self.market.get_price(symbol, self.exchange_id)

    def get_order_book(self, symbol: str) -> OrderBook:
        return self.market.generate_order_book(self.exchange_id, symbol)

    def get_candles(self, symbol: str, n: int = 100):
        return self.market.get_history(self.exchange_id, symbol, n)

    def update_positions_pnl(self) -> None:
        """Update unrealized PnL for all open positions."""
        for pos in self.account.positions:
            current_price = self.get_price(pos.symbol)
            pos.update_pnl(current_price)

    def charge_funding(self, funding_rate: float) -> list[str]:
        """Charge funding rate to all open positions.

        Positive rate: longs pay shorts. Negative: shorts pay longs.
        Returns list of funding notifications.
        """
        notifications = []
        for pos in self.account.positions:
            notional = self.get_price(pos.symbol) * pos.quantity
            if pos.is_long:
                payment = -notional * funding_rate
            else:
                payment = notional * funding_rate

            self.account.balance += payment
            if abs(payment) > 0.01:
                notifications.append(
                    f"{'+' if payment > 0 else ''}{payment:.2f} on {pos.symbol} ({pos.side.value})"
                )

        return notifications

    def get_order_history(self, limit: int = 50) -> list[Order]:
        return self._order_history[-limit:]

    def get_account_status(self) -> dict:
        self.update_positions_pnl()
        return self.account.to_dict()

    def _build_depth_levels(self, ob: OrderBook, n: int) -> tuple[list[dict], list[dict], float, float]:
        """Build bid/ask level dicts and return cumulative volumes."""
        bid_levels = []
        ask_levels = []
        cum_bid = 0.0
        cum_ask = 0.0
        for i in range(n):
            cum_bid += ob.bids[i].quantity
            cum_ask += ob.asks[i].quantity
            bid_levels.append({
                "price": ob.bids[i].price,
                "quantity": ob.bids[i].quantity,
                "cumulative": round(cum_bid, 4),
            })
            ask_levels.append({
                "price": ob.asks[i].price,
                "quantity": ob.asks[i].quantity,
                "cumulative": round(cum_ask, 4),
            })
        return bid_levels, ask_levels, cum_bid, cum_ask

    def get_depth_snapshot(self, symbol: str, levels: int = 20) -> dict:
        """Return a depth snapshot for a symbol -- cumulative bid/ask volumes,
        imbalance, spread, and per-level breakdown.
        """
        ob = self.get_order_book(symbol)
        if not ob.bids or not ob.asks:
            return {"symbol": symbol, "exchange": self.exchange_id, "bids": [], "asks": [],
                    "spread_bps": 0, "imbalance": 0, "bid_depth": 0, "ask_depth": 0}

        n = min(levels, len(ob.bids), len(ob.asks))
        bid_levels, ask_levels, cum_bid, cum_ask = self._build_depth_levels(ob, n)

        mid = (ob.bids[0].price + ob.asks[0].price) / 2
        spread = ob.asks[0].price - ob.bids[0].price
        spread_bps = (spread / mid * 10000) if mid > 0 else 0
        total = cum_bid + cum_ask
        imbalance = (cum_bid - cum_ask) / total if total > 0 else 0

        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "timestamp": self.market.current_timestamp,
            "mid_price": round(mid, 2),
            "spread_bps": round(spread_bps, 2),
            "imbalance": round(imbalance, 4),
            "bid_depth": round(cum_bid, 4),
            "ask_depth": round(cum_ask, 4),
            "bids": bid_levels,
            "asks": ask_levels,
        }
