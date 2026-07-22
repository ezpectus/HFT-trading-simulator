"""PnL calculator — pluggable PnL logic for different asset types.

Supports spot, futures, and options. Each asset type has unique
characteristics for entry/exit fees, funding, and PnL computation.

The PnLCalculator is injected into BacktestEngine, allowing the engine
to remain asset-agnostic while delegating all PnL arithmetic here.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class AssetType(StrEnum):
    SPOT = "spot"
    FUTURES = "futures"
    OPTIONS = "options"


class OptionType(StrEnum):
    CALL = "call"
    PUT = "put"


@dataclass
class PnLConfig:
    """Configuration for PnL calculations."""
    fee_rate: float = 0.0004          # 0.04% per side
    slippage_bps: float = 1.0         # 1 bp slippage
    funding_rate: float = 0.0001      # 8h funding rate (futures only)
    funding_interval_s: float = 8 * 3600  # 8 hours in seconds
    # Options-specific
    option_premium_pct: float = 0.02  # 2% of notional as premium
    contract_multiplier: float = 1.0  # contract size multiplier


@dataclass
class PnLBreakdown:
    """Detailed PnL breakdown for a closed position."""
    gross_pnl: float
    entry_fee: float
    exit_fee: float
    funding_cost: float
    net_pnl: float
    fill_entry_price: float
    fill_exit_price: float


class PnLCalculator:
    """Pluggable PnL calculator supporting spot, futures, and options.

    Args:
        asset_type: Type of asset being backtested
        config: PnL configuration (fees, slippage, funding, etc.)
        option_type: Call or put (options only)
    """

    def __init__(
        self,
        asset_type: AssetType = AssetType.SPOT,
        config: PnLConfig | None = None,
        option_type: OptionType | None = None,
    ):
        self.asset_type = asset_type
        self.config = config or PnLConfig()
        self.option_type = option_type

        if asset_type == AssetType.OPTIONS and option_type is None:
            self.option_type = OptionType.CALL

    # ── Slippage ────────────────────────────────────────────────────────

    def apply_entry_slippage(self, side: str, price: float) -> float:
        """Apply slippage to entry price."""
        if side == "LONG":
            return price * (1 + self.config.slippage_bps / 10000)
        return price * (1 - self.config.slippage_bps / 10000)

    def apply_exit_slippage(self, side: str, price: float) -> float:
        """Apply slippage to exit price."""
        if side == "LONG":
            return price * (1 - self.config.slippage_bps / 10000)
        return price * (1 + self.config.slippage_bps / 10000)

    # ── Fees ────────────────────────────────────────────────────────────

    def calculate_entry_fee(self, qty: float, entry_price: float) -> float:
        """Calculate entry fee based on asset type."""
        notional = qty * entry_price * self.config.contract_multiplier
        return notional * self.config.fee_rate

    def calculate_exit_fee(self, qty: float, exit_price: float) -> float:
        """Calculate exit fee based on asset type."""
        notional = qty * exit_price * self.config.contract_multiplier
        return notional * self.config.fee_rate

    # ── Funding ─────────────────────────────────────────────────────────

    def calculate_funding_cost(self, qty: float, price: float, hold_time_s: float) -> float:
        """Calculate funding cost (futures only)."""
        if self.asset_type != AssetType.FUTURES:
            return 0.0
        funding_periods = hold_time_s / self.config.funding_interval_s
        return qty * price * self.config.funding_rate * funding_periods

    # ── Unrealized PnL ──────────────────────────────────────────────────

    def unrealized_pnl(
        self,
        side: str,
        qty: float,
        entry_price: float,
        current_price: float,
    ) -> float:
        """Calculate unrealized PnL for an open position."""
        if self.asset_type == AssetType.OPTIONS:
            return self._options_unrealized_pnl(side, qty, entry_price, current_price)

        multiplier = self.config.contract_multiplier
        if side == "LONG":
            return (current_price - entry_price) * qty * multiplier
        return (entry_price - current_price) * qty * multiplier

    def _options_unrealized_pnl(
        self,
        side: str,
        qty: float,
        entry_price: float,
        current_price: float,
    ) -> float:
        """Calculate unrealized PnL for options positions.

        entry_price is the premium paid/received per contract.
        current_price is the current option premium (mark-to-market).
        """
        multiplier = self.config.contract_multiplier
        if side == "LONG":
            return (current_price - entry_price) * qty * multiplier
        return (entry_price - current_price) * qty * multiplier

    # ── Realized PnL ────────────────────────────────────────────────────

    def calculate_pnl(
        self,
        side: str,
        qty: float,
        entry_price: float,
        exit_price: float,
        hold_time_s: float = 0.0,
    ) -> PnLBreakdown:
        """Calculate full PnL breakdown for a closed position.

        Args:
            side: "LONG" or "SHORT"
            qty: Position quantity
            entry_price: Raw entry price (before slippage)
            exit_price: Raw exit price (before slippage)
            hold_time_s: Holding time in seconds (for funding)

        Returns:
            PnLBreakdown with gross PnL, fees, funding, and net PnL
        """
        fill_entry = self.apply_entry_slippage(side, entry_price)
        fill_exit = self.apply_exit_slippage(side, exit_price)

        entry_fee = self.calculate_entry_fee(qty, fill_entry)
        exit_fee = self.calculate_exit_fee(qty, fill_exit)
        funding = self.calculate_funding_cost(qty, fill_exit, hold_time_s)

        if self.asset_type == AssetType.OPTIONS:
            gross_pnl = self._options_gross_pnl(side, qty, fill_entry, fill_exit)
        else:
            gross_pnl = self._spot_futures_gross_pnl(side, qty, fill_entry, fill_exit)

        net_pnl = gross_pnl - entry_fee - exit_fee - funding

        return PnLBreakdown(
            gross_pnl=gross_pnl,
            entry_fee=entry_fee,
            exit_fee=exit_fee,
            funding_cost=funding,
            net_pnl=net_pnl,
            fill_entry_price=fill_entry,
            fill_exit_price=fill_exit,
        )

    def _spot_futures_gross_pnl(
        self,
        side: str,
        qty: float,
        entry_price: float,
        exit_price: float,
    ) -> float:
        """Gross PnL for spot or futures (before fees and funding)."""
        multiplier = self.config.contract_multiplier
        if side == "LONG":
            return (exit_price - entry_price) * qty * multiplier
        return (entry_price - exit_price) * qty * multiplier

    def _options_gross_pnl(
        self,
        side: str,
        qty: float,
        entry_price: float,
        exit_price: float,
    ) -> float:
        """Gross PnL for options.

        entry_price and exit_price are option premiums (per contract).
        Long: profit when premium rises. Short: profit when premium falls.
        """
        multiplier = self.config.contract_multiplier
        if side == "LONG":
            return (exit_price - entry_price) * qty * multiplier
        return (entry_price - exit_price) * qty * multiplier

    # ── Options intrinsic value ─────────────────────────────────────────

    def options_intrinsic_value(
        self,
        underlying_price: float,
        strike_price: float,
    ) -> float:
        """Calculate intrinsic value of an option at expiry.

        For calls: max(underlying - strike, 0)
        For puts: max(strike - underlying, 0)
        """
        if self.option_type == OptionType.CALL:
            return max(underlying_price - strike_price, 0.0)
        return max(strike_price - underlying_price, 0.0)

    def options_pnl_at_expiry(
        self,
        side: str,
        qty: float,
        premium: float,
        strike_price: float,
        underlying_price: float,
    ) -> PnLBreakdown:
        """Calculate PnL for an options position at expiry.

        Args:
            side: "LONG" (buyer) or "SHORT" (seller)
            qty: Number of contracts
            premium: Premium paid (long) or received (short) per contract
            strike_price: Option strike price
            underlying_price: Price of underlying at expiry

        Returns:
            PnLBreakdown with settlement PnL
        """
        intrinsic = self.options_intrinsic_value(underlying_price, strike_price)
        multiplier = self.config.contract_multiplier

        entry_fee = self.calculate_entry_fee(qty, premium)
        exit_fee = 0.0  # No exit fee if held to expiry (settlement)
        funding = 0.0   # No funding for options

        if side == "LONG":
            # Buyer: pays premium, receives intrinsic value
            gross_pnl = (intrinsic - premium) * qty * multiplier
        else:
            # Seller: receives premium, pays intrinsic value
            gross_pnl = (premium - intrinsic) * qty * multiplier

        net_pnl = gross_pnl - entry_fee - exit_fee - funding

        return PnLBreakdown(
            gross_pnl=gross_pnl,
            entry_fee=entry_fee,
            exit_fee=exit_fee,
            funding_cost=funding,
            net_pnl=net_pnl,
            fill_entry_price=premium,
            fill_exit_price=intrinsic,
        )
