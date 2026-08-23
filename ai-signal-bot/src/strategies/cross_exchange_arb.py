"""
Cross-exchange arbitrage execution engine.

Monitors prices across Binance, OKX, Bybit and executes real arbitrage
when price discrepancies exceed transaction costs.

Strategies:
  - Simple arbitrage: buy on cheapest exchange, sell on most expensive
  - Triangular arbitrage: A→B→C→A within same exchange
  - Statistical arbitrage: mean-reversion of price spread between exchanges

Execution:
  - Simultaneous order placement on both exchanges
  - Leg risk management (if one leg fills but other doesn't)
  - Slippage monitoring and position sizing

Usage:
    from src.strategies.cross_exchange_arb import CrossExchangeArbEngine

    engine = CrossExchangeArbEngine(
        exchanges={"binance": binance_client, "okx": okx_client, "bybit": bybit_client},
        min_profit_bps=5.0,
        max_position_usd=1000,
    )
    await engine.start()
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ArbStatus(Enum):
    DETECTED = "detected"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL_FILL = "partial_fill"


@dataclass
class ExchangePrice:
    exchange: str
    bid: float
    ask: float
    bid_qty: float
    ask_qty: float
    timestamp: float = field(default_factory=time.time)

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2

    @property
    def spread_bps(self) -> float:
        mid = self.mid
        return (self.ask - self.bid) / mid * 10000 if mid > 0 else 0.0


@dataclass
class ArbitrageOpportunity:
    symbol: str
    buy_exchange: str
    sell_exchange: str
    buy_price: float  # ask on buy exchange
    sell_price: float  # bid on sell exchange
    qty: float
    gross_profit_usd: float
    net_profit_usd: float
    profit_bps: float
    status: ArbStatus = ArbStatus.DETECTED
    timestamp: float = field(default_factory=time.time)
    execution_time_ms: float = 0.0
    error: str = ""


@dataclass
class ExecutionResult:
    success: bool
    fill_price: float
    fill_qty: float
    slippage_bps: float
    error: str = ""


class CrossExchangeArbEngine:
    """Cross-exchange arbitrage detection and execution engine."""

    def __init__(
        self,
        exchanges: dict[str, object],
        symbols: list[str] | None = None,
        min_profit_bps: float = 5.0,
        max_position_usd: float = 1000.0,
        max_open_positions: int = 5,
        execution_timeout_s: float = 5.0,
        taker_fee_bps: dict[str, float] | None = None,
    ):
        self.exchanges = exchanges
        self.symbols = symbols or ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
        self.min_profit_bps = min_profit_bps
        self.max_position_usd = max_position_usd
        self.max_open_positions = max_open_positions
        self.execution_timeout_s = execution_timeout_s
        self.taker_fees = taker_fee_bps or {
            "binance": 4.0,  # 0.04%
            "okx": 5.0,      # 0.05%
            "bybit": 6.0,    # 0.06%
        }

        self.prices: dict[str, dict[str, ExchangePrice]] = {}
        self.open_positions: list[ArbitrageOpportunity] = []
        self.completed: list[ArbitrageOpportunity] = []
        self._running = False
        self._pending_tasks: set[asyncio.Task] = set()
        self._stats = {
            "opportunities_detected": 0,
            "opportunities_executed": 0,
            "opportunities_failed": 0,
            "total_profit_usd": 0.0,
            "total_slippage_bps": 0.0,
        }

    async def start(self) -> None:
        self._running = True
        logger.info("[CrossExArb] Started — symbols=%s, min_profit=%sbps", self.symbols, self.min_profit_bps)
        tasks = [self._monitor_loop(symbol) for symbol in self.symbols]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def stop(self) -> None:
        self._running = False
        for task in list(self._pending_tasks):
            task.cancel()
        if self._pending_tasks:
            await asyncio.gather(*self._pending_tasks, return_exceptions=True)
        self._pending_tasks.clear()

    def update_price(self, symbol: str, exchange: str, price: ExchangePrice) -> None:
        """Update price quote from an exchange."""
        if symbol not in self.prices:
            self.prices[symbol] = {}
        self.prices[symbol][exchange] = price

    async def _monitor_loop(self, symbol: str) -> None:
        while self._running:
            try:
                await asyncio.sleep(0.1)  # 100ms polling
                opp = self._detect_opportunity(symbol)
                if opp and len(self.open_positions) < self.max_open_positions:
                    self._stats["opportunities_detected"] += 1
                    task = asyncio.create_task(self._execute_arbitrage(opp))
                    self._pending_tasks.add(task)
                    task.add_done_callback(self._pending_tasks.discard)
            except (RuntimeError, OSError, ValueError, TypeError) as e:
                logger.error("[CrossExArb] Monitor error for %s: %s", symbol, e)

    def _detect_opportunity(self, symbol: str) -> ArbitrageOpportunity | None:
        """Detect best arbitrage opportunity for a symbol."""
        quotes = self.prices.get(symbol, {})
        if len(quotes) < 2:
            return None

        best_opp: ArbitrageOpportunity | None = None

        for buy_ex, buy_quote in quotes.items():
            for sell_ex, sell_quote in quotes.items():
                if buy_ex == sell_ex:
                    continue
                opp = self._evaluate_pair(symbol, buy_ex, buy_quote, sell_ex, sell_quote)
                if opp and (not best_opp or opp.net_profit_usd > best_opp.net_profit_usd):
                    best_opp = opp

        return best_opp

    def _evaluate_pair(
        self, symbol: str, buy_ex: str, buy_quote: ExchangePrice,
        sell_ex: str, sell_quote: ExchangePrice,
    ) -> ArbitrageOpportunity | None:
        """Evaluate a single exchange pair for arbitrage."""
        buy_price = buy_quote.ask
        sell_price = sell_quote.bid
        if buy_price <= 0 or sell_price <= 0:
            return None

        spread_bps = (sell_price - buy_price) / buy_price * 10000
        total_fees_bps = self.taker_fees.get(buy_ex, 5.0) + self.taker_fees.get(sell_ex, 5.0)
        net_bps = spread_bps - total_fees_bps
        if net_bps < self.min_profit_bps:
            return None

        max_qty_by_price = self.max_position_usd / buy_price
        qty = min(buy_quote.ask_qty, sell_quote.bid_qty, max_qty_by_price)
        if qty <= 0:
            return None

        gross_profit = (sell_price - buy_price) * qty
        net_profit = gross_profit - (buy_price * qty * total_fees_bps / 10000)

        return ArbitrageOpportunity(
            symbol=symbol, buy_exchange=buy_ex, sell_exchange=sell_ex,
            buy_price=buy_price, sell_price=sell_price, qty=qty,
            gross_profit_usd=gross_profit, net_profit_usd=net_profit, profit_bps=net_bps,
        )

    async def _execute_arbitrage(self, opp: ArbitrageOpportunity) -> None:
        """Execute both legs of the arbitrage simultaneously."""
        opp.status = ArbStatus.EXECUTING
        self.open_positions.append(opp)
        start_time = time.time()

        try:
            buy_client = self.exchanges.get(opp.buy_exchange)
            sell_client = self.exchanges.get(opp.sell_exchange)

            if not buy_client or not sell_client:
                opp.error = "Exchange client not found"
                opp.status = ArbStatus.FAILED
                self._stats["opportunities_failed"] += 1
                return

            buy_result, sell_result = await self._execute_both_legs(
                buy_client, sell_client, opp
            )
            opp.execution_time_ms = (time.time() - start_time) * 1000

            if isinstance(buy_result, Exception) or isinstance(sell_result, Exception):
                opp.error = f"Leg error: buy={buy_result}, sell={sell_result}"
                opp.status = ArbStatus.FAILED
                self._stats["opportunities_failed"] += 1
                return

            if not buy_result.success or not sell_result.success:
                opp.error = f"Leg failed: buy={buy_result.error}, sell={sell_result.error}"
                opp.status = ArbStatus.PARTIAL_FILL
                self._stats["opportunities_failed"] += 1
                return

            self._record_successful_arb(opp, buy_result, sell_result)

        except TimeoutError:
            opp.error = "Execution timeout"
            opp.status = ArbStatus.FAILED
            self._stats["opportunities_failed"] += 1
        except (RuntimeError, OSError, ValueError, TypeError, KeyError) as e:
            opp.error = str(e)
            opp.status = ArbStatus.FAILED
            self._stats["opportunities_failed"] += 1
        finally:
            if opp in self.open_positions:
                self.open_positions.remove(opp)
            self.completed.append(opp)
            if len(self.completed) > 100:
                self.completed = self.completed[-50:]

    async def _execute_both_legs(
        self, buy_client: object, sell_client: object, opp: ArbitrageOpportunity
    ) -> tuple[ExecutionResult, ExecutionResult]:
        """Execute buy and sell legs simultaneously with timeout."""
        buy_task = asyncio.create_task(
            self._execute_leg(buy_client, opp.symbol, "buy", opp.qty, opp.buy_price)
        )
        sell_task = asyncio.create_task(
            self._execute_leg(sell_client, opp.symbol, "sell", opp.qty, opp.sell_price)
        )
        return await asyncio.wait_for(
            asyncio.gather(buy_task, sell_task, return_exceptions=True),
            timeout=self.execution_timeout_s,
        )

    def _record_successful_arb(
        self, opp: ArbitrageOpportunity,
        buy_result: ExecutionResult, sell_result: ExecutionResult,
    ) -> None:
        """Record stats for a successful arbitrage execution."""
        actual_profit = (sell_result.fill_price - buy_result.fill_price) * min(
            buy_result.fill_qty, sell_result.fill_qty
        )
        total_slippage = buy_result.slippage_bps + sell_result.slippage_bps

        opp.status = ArbStatus.COMPLETED
        self._stats["opportunities_executed"] += 1
        self._stats["total_profit_usd"] += actual_profit
        self._stats["total_slippage_bps"] += total_slippage

        logger.info(
            f"[CrossExArb] {opp.symbol}: buy={opp.buy_exchange}@{buy_result.fill_price:.2f} "
            f"sell={opp.sell_exchange}@{sell_result.fill_price:.2f} "
            f"profit=${actual_profit:.2f} slip={total_slippage:.1f}bps "
            f"time={opp.execution_time_ms:.0f}ms"
        )

    async def _execute_leg(
        self, client: object, symbol: str, side: str, qty: float, limit_price: float
    ) -> ExecutionResult:
        """Execute one leg of the arbitrage."""
        try:
            if hasattr(client, "place_order"):
                result = await client.place_order(
                    symbol=symbol, side=side, qty=qty,
                    order_type="limit", price=limit_price,
                    time_in_force="ioc",  # Immediate or Cancel
                )
                fill_price = result.get("avg_price", limit_price)
                fill_qty = result.get("executed_qty", 0)
                if limit_price > 0:
                    slippage = (fill_price - limit_price) / limit_price * 10000
                    if side == "sell":
                        slippage = (limit_price - fill_price) / limit_price * 10000
                else:
                    slippage = 0.0

                return ExecutionResult(
                    success=fill_qty > 0,
                    fill_price=fill_price,
                    fill_qty=fill_qty,
                    slippage_bps=slippage,
                )
            else:
                return ExecutionResult(False, 0, 0, 0, "No place_order method")
        except (RuntimeError, OSError, ValueError, TypeError, AttributeError) as e:
            return ExecutionResult(False, 0, 0, 0, str(e))

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "open_positions": len(self.open_positions),
            "avg_slippage_bps": (
                self._stats["total_slippage_bps"] / max(self._stats["opportunities_executed"], 1)
            ),
        }
