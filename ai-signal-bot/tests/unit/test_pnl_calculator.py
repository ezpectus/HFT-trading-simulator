"""Tests for PnLCalculator — spot, futures, options PnL logic, slippage, fees, funding."""
import pytest

from src.backtesting.pnl_calculator import (
    AssetType,
    OptionType,
    PnLBreakdown,
    PnLCalculator,
    PnLConfig,
)


class TestPnLCalculatorInit:
    def test_default_spot(self):
        calc = PnLCalculator()
        assert calc.asset_type == AssetType.SPOT
        assert calc.option_type is None

    def test_futures(self):
        calc = PnLCalculator(asset_type=AssetType.FUTURES)
        assert calc.asset_type == AssetType.FUTURES

    def test_options_defaults_to_call(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS)
        assert calc.option_type == OptionType.CALL

    def test_options_put(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.PUT)
        assert calc.option_type == OptionType.PUT

    def test_custom_config(self):
        cfg = PnLConfig(fee_rate=0.001, slippage_bps=5.0, funding_rate=0.0005)
        calc = PnLCalculator(config=cfg)
        assert calc.config.fee_rate == 0.001
        assert calc.config.slippage_bps == 5.0
        assert calc.config.funding_rate == 0.0005


class TestSlippage:
    def test_long_entry_slippage_increases_price(self):
        calc = PnLCalculator(config=PnLConfig(slippage_bps=10.0))
        result = calc.apply_entry_slippage("LONG", 50000.0)
        assert result > 50000.0
        assert result == pytest.approx(50000.0 * 1.001, rel=1e-6)

    def test_short_entry_slippage_decreases_price(self):
        calc = PnLCalculator(config=PnLConfig(slippage_bps=10.0))
        result = calc.apply_entry_slippage("SHORT", 50000.0)
        assert result < 50000.0
        assert result == pytest.approx(50000.0 * 0.999, rel=1e-6)

    def test_long_exit_slippage_decreases_price(self):
        calc = PnLCalculator(config=PnLConfig(slippage_bps=10.0))
        result = calc.apply_exit_slippage("LONG", 50000.0)
        assert result < 50000.0

    def test_short_exit_slippage_increases_price(self):
        calc = PnLCalculator(config=PnLConfig(slippage_bps=10.0))
        result = calc.apply_exit_slippage("SHORT", 50000.0)
        assert result > 50000.0

    def test_zero_slippage(self):
        calc = PnLCalculator(config=PnLConfig(slippage_bps=0.0))
        assert calc.apply_entry_slippage("LONG", 100.0) == 100.0
        assert calc.apply_exit_slippage("SHORT", 100.0) == 100.0


class TestFees:
    def test_entry_fee(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.001))
        fee = calc.calculate_entry_fee(qty=2.0, entry_price=50000.0)
        assert fee == pytest.approx(100.0, rel=1e-6)  # 2 * 50000 * 0.001

    def test_exit_fee(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.001))
        fee = calc.calculate_exit_fee(qty=2.0, exit_price=51000.0)
        assert fee == pytest.approx(102.0, rel=1e-6)

    def test_zero_fee_rate(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.0))
        assert calc.calculate_entry_fee(1.0, 100.0) == 0.0
        assert calc.calculate_exit_fee(1.0, 100.0) == 0.0

    def test_contract_multiplier(self):
        calc = PnLCalculator(
            asset_type=AssetType.FUTURES,
            config=PnLConfig(fee_rate=0.001, contract_multiplier=10.0),
        )
        fee = calc.calculate_entry_fee(qty=1.0, entry_price=50000.0)
        assert fee == pytest.approx(500.0, rel=1e-6)  # 1 * 50000 * 10 * 0.001


class TestFundingCost:
    def test_futures_funding(self):
        calc = PnLCalculator(asset_type=AssetType.FUTURES, config=PnLConfig(funding_rate=0.0001))
        # 8h hold = 1 funding period
        funding = calc.calculate_funding_cost(qty=1.0, price=50000.0, hold_time_s=8 * 3600)
        assert funding == pytest.approx(5.0, rel=1e-6)  # 1 * 50000 * 0.0001 * 1

    def test_spot_no_funding(self):
        calc = PnLCalculator(asset_type=AssetType.SPOT)
        funding = calc.calculate_funding_cost(qty=1.0, price=50000.0, hold_time_s=8 * 3600)
        assert funding == 0.0

    def test_options_no_funding(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS)
        funding = calc.calculate_funding_cost(qty=1.0, price=50000.0, hold_time_s=8 * 3600)
        assert funding == 0.0

    def test_zero_hold_time(self):
        calc = PnLCalculator(asset_type=AssetType.FUTURES)
        funding = calc.calculate_funding_cost(qty=1.0, price=50000.0, hold_time_s=0.0)
        assert funding == 0.0

    def test_partial_funding_period(self):
        calc = PnLCalculator(asset_type=AssetType.FUTURES, config=PnLConfig(funding_rate=0.0001))
        # 4h hold = 0.5 funding periods
        funding = calc.calculate_funding_cost(qty=1.0, price=50000.0, hold_time_s=4 * 3600)
        assert funding == pytest.approx(2.5, rel=1e-6)


class TestUnrealizedPnL:
    def test_long_spot_unrealized_profit(self):
        calc = PnLCalculator()
        pnl = calc.unrealized_pnl("LONG", 1.0, 50000.0, 51000.0)
        assert pnl == pytest.approx(1000.0, rel=1e-6)

    def test_long_spot_unrealized_loss(self):
        calc = PnLCalculator()
        pnl = calc.unrealized_pnl("LONG", 1.0, 50000.0, 49000.0)
        assert pnl == pytest.approx(-1000.0, rel=1e-6)

    def test_short_spot_unrealized_profit(self):
        calc = PnLCalculator()
        pnl = calc.unrealized_pnl("SHORT", 1.0, 50000.0, 49000.0)
        assert pnl == pytest.approx(1000.0, rel=1e-6)

    def test_short_spot_unrealized_loss(self):
        calc = PnLCalculator()
        pnl = calc.unrealized_pnl("SHORT", 1.0, 50000.0, 51000.0)
        assert pnl == pytest.approx(-1000.0, rel=1e-6)

    def test_futures_with_multiplier(self):
        calc = PnLCalculator(
            asset_type=AssetType.FUTURES,
            config=PnLConfig(contract_multiplier=5.0),
        )
        pnl = calc.unrealized_pnl("LONG", 1.0, 100.0, 110.0)
        assert pnl == pytest.approx(50.0, rel=1e-6)  # (110-100) * 1 * 5

    def test_options_long_unrealized(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS)
        # Premium went from 2.0 to 3.5
        pnl = calc.unrealized_pnl("LONG", 10.0, 2.0, 3.5)
        assert pnl == pytest.approx(15.0, rel=1e-6)

    def test_options_short_unrealized(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS)
        # Sold at 3.5, now worth 2.0
        pnl = calc.unrealized_pnl("SHORT", 10.0, 3.5, 2.0)
        assert pnl == pytest.approx(15.0, rel=1e-6)


class TestCalculatePnLSpot:
    def test_long_profit(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.0, slippage_bps=0.0, funding_rate=0.0))
        breakdown = calc.calculate_pnl("LONG", 1.0, 50000.0, 51000.0, hold_time_s=0.0)
        assert breakdown.gross_pnl == pytest.approx(1000.0, rel=1e-6)
        assert breakdown.net_pnl == pytest.approx(1000.0, rel=1e-6)
        assert breakdown.entry_fee == 0.0
        assert breakdown.exit_fee == 0.0
        assert breakdown.funding_cost == 0.0

    def test_long_with_fees(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.001, slippage_bps=0.0, funding_rate=0.0))
        breakdown = calc.calculate_pnl("LONG", 1.0, 50000.0, 51000.0, hold_time_s=0.0)
        assert breakdown.gross_pnl == pytest.approx(1000.0, rel=1e-6)
        assert breakdown.entry_fee == pytest.approx(50.0, rel=1e-6)
        assert breakdown.exit_fee == pytest.approx(51.0, rel=1e-6)
        assert breakdown.net_pnl == pytest.approx(1000.0 - 50.0 - 51.0, rel=1e-6)

    def test_short_with_slippage(self):
        calc = PnLCalculator(config=PnLConfig(fee_rate=0.0, slippage_bps=10.0, funding_rate=0.0))
        breakdown = calc.calculate_pnl("SHORT", 1.0, 50000.0, 49000.0, hold_time_s=0.0)
        # Entry: 50000 * (1 - 10/10000) = 49950
        # Exit: 49000 * (1 + 10/10000) = 49049
        # Gross: (49950 - 49049) * 1 = 901
        assert breakdown.fill_entry_price == pytest.approx(49950.0, rel=1e-4)
        assert breakdown.fill_exit_price == pytest.approx(49049.0, rel=1e-4)
        assert breakdown.gross_pnl == pytest.approx(901.0, rel=1e-2)
        assert breakdown.net_pnl == pytest.approx(901.0, rel=1e-2)

    def test_returns_pnl_breakdown(self):
        calc = PnLCalculator()
        breakdown = calc.calculate_pnl("LONG", 1.0, 100.0, 110.0)
        assert isinstance(breakdown, PnLBreakdown)
        assert breakdown.net_pnl > 0


class TestCalculatePnLFutures:
    def test_futures_with_funding(self):
        calc = PnLCalculator(
            asset_type=AssetType.FUTURES,
            config=PnLConfig(fee_rate=0.0, slippage_bps=0.0, funding_rate=0.0001),
        )
        # Hold for 16h = 2 funding periods
        breakdown = calc.calculate_pnl("LONG", 1.0, 50000.0, 51000.0, hold_time_s=16 * 3600)
        assert breakdown.gross_pnl == pytest.approx(1000.0, rel=1e-6)
        assert breakdown.funding_cost == pytest.approx(10.2, rel=1e-2)  # 1 * 51000 * 0.0001 * 2
        assert breakdown.net_pnl == pytest.approx(1000.0 - 10.2, rel=1e-2)

    def test_futures_short_with_funding(self):
        calc = PnLCalculator(
            asset_type=AssetType.FUTURES,
            config=PnLConfig(fee_rate=0.0, slippage_bps=0.0, funding_rate=0.0001),
        )
        breakdown = calc.calculate_pnl("SHORT", 1.0, 50000.0, 49000.0, hold_time_s=8 * 3600)
        assert breakdown.gross_pnl == pytest.approx(1000.0, rel=1e-6)
        assert breakdown.funding_cost == pytest.approx(4.9, rel=1e-2)  # 1 * 49000 * 0.0001 * 1


class TestCalculatePnLOptions:
    def test_long_call_pnl(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.0, slippage_bps=0.0),
        )
        # Bought at premium 2.0, sold at 3.5
        breakdown = calc.calculate_pnl("LONG", 10.0, 2.0, 3.5, hold_time_s=0.0)
        assert breakdown.gross_pnl == pytest.approx(15.0, rel=1e-6)
        assert breakdown.funding_cost == 0.0

    def test_short_put_pnl(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.PUT,
            config=PnLConfig(fee_rate=0.0, slippage_bps=0.0),
        )
        # Sold at 3.5, bought back at 2.0
        breakdown = calc.calculate_pnl("SHORT", 10.0, 3.5, 2.0, hold_time_s=0.0)
        assert breakdown.gross_pnl == pytest.approx(15.0, rel=1e-6)

    def test_options_no_funding(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS)
        breakdown = calc.calculate_pnl("LONG", 10.0, 2.0, 3.0, hold_time_s=8 * 3600)
        assert breakdown.funding_cost == 0.0


class TestOptionsIntrinsicValue:
    def test_call_in_the_money(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.CALL)
        iv = calc.options_intrinsic_value(underlying_price=55000, strike_price=50000)
        assert iv == 5000.0

    def test_call_out_of_the_money(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.CALL)
        iv = calc.options_intrinsic_value(underlying_price=45000, strike_price=50000)
        assert iv == 0.0

    def test_put_in_the_money(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.PUT)
        iv = calc.options_intrinsic_value(underlying_price=45000, strike_price=50000)
        assert iv == 5000.0

    def test_put_out_of_the_money(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.PUT)
        iv = calc.options_intrinsic_value(underlying_price=55000, strike_price=50000)
        assert iv == 0.0

    def test_at_the_money(self):
        calc = PnLCalculator(asset_type=AssetType.OPTIONS, option_type=OptionType.CALL)
        iv = calc.options_intrinsic_value(underlying_price=50000, strike_price=50000)
        assert iv == 0.0


class TestOptionsPnLAtExpiry:
    def test_long_call_profitable(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.0),
        )
        # Bought call at premium 2000, strike 50000, underlying at 55000
        breakdown = calc.options_pnl_at_expiry(
            side="LONG", qty=1.0, premium=2000.0,
            strike_price=50000, underlying_price=55000,
        )
        # Intrinsic = 5000, premium = 2000 → gross = 3000
        assert breakdown.gross_pnl == pytest.approx(3000.0, rel=1e-6)
        assert breakdown.net_pnl == pytest.approx(3000.0, rel=1e-6)

    def test_long_call_expired_worthless(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.0),
        )
        # Bought call at premium 2000, strike 50000, underlying at 48000
        breakdown = calc.options_pnl_at_expiry(
            side="LONG", qty=1.0, premium=2000.0,
            strike_price=50000, underlying_price=48000,
        )
        # Intrinsic = 0, premium = 2000 → gross = -2000
        assert breakdown.gross_pnl == pytest.approx(-2000.0, rel=1e-6)
        assert breakdown.net_pnl == pytest.approx(-2000.0, rel=1e-6)

    def test_short_call_profitable(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.0),
        )
        # Sold call at premium 2000, strike 50000, underlying at 48000
        breakdown = calc.options_pnl_at_expiry(
            side="SHORT", qty=1.0, premium=2000.0,
            strike_price=50000, underlying_price=48000,
        )
        # Intrinsic = 0, premium = 2000 → gross = 2000
        assert breakdown.gross_pnl == pytest.approx(2000.0, rel=1e-6)

    def test_short_call_loss(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.0),
        )
        # Sold call at premium 2000, strike 50000, underlying at 55000
        breakdown = calc.options_pnl_at_expiry(
            side="SHORT", qty=1.0, premium=2000.0,
            strike_price=50000, underlying_price=55000,
        )
        # Intrinsic = 5000, premium = 2000 → gross = -3000
        assert breakdown.gross_pnl == pytest.approx(-3000.0, rel=1e-6)

    def test_long_put_profitable(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.PUT,
            config=PnLConfig(fee_rate=0.0),
        )
        # Bought put at premium 1500, strike 50000, underlying at 45000
        breakdown = calc.options_pnl_at_expiry(
            side="LONG", qty=1.0, premium=1500.0,
            strike_price=50000, underlying_price=45000,
        )
        # Intrinsic = 5000, premium = 1500 → gross = 3500
        assert breakdown.gross_pnl == pytest.approx(3500.0, rel=1e-6)

    def test_with_fees(self):
        calc = PnLCalculator(
            asset_type=AssetType.OPTIONS,
            option_type=OptionType.CALL,
            config=PnLConfig(fee_rate=0.001),
        )
        breakdown = calc.options_pnl_at_expiry(
            side="LONG", qty=1.0, premium=2000.0,
            strike_price=50000, underlying_price=55000,
        )
        # Entry fee = 2000 * 0.001 = 2
        assert breakdown.entry_fee == pytest.approx(2.0, rel=1e-6)
        assert breakdown.net_pnl == pytest.approx(3000.0 - 2.0, rel=1e-6)


class TestPnLBreakdown:
    def test_dataclass_fields(self):
        bd = PnLBreakdown(
            gross_pnl=1000.0,
            entry_fee=50.0,
            exit_fee=51.0,
            funding_cost=5.0,
            net_pnl=894.0,
            fill_entry_price=50005.0,
            fill_exit_price=50995.0,
        )
        assert bd.gross_pnl == 1000.0
        assert bd.entry_fee == 50.0
        assert bd.exit_fee == 51.0
        assert bd.funding_cost == 5.0
        assert bd.net_pnl == 894.0
        assert bd.fill_entry_price == 50005.0
        assert bd.fill_exit_price == 50995.0


class TestBackwardCompatibility:
    """Verify that default spot calculator produces same results as old BacktestEngine logic."""

    def test_spot_matches_old_exit_logic(self):
        cfg = PnLConfig(fee_rate=0.0004, slippage_bps=1.0, funding_rate=0.0001)
        calc = PnLCalculator(asset_type=AssetType.SPOT, config=cfg)

        # Simulate old BacktestEngine._exit_position for LONG
        qty = 1.0
        entry_price_raw = 50000.0
        exit_price_raw = 51000.0
        hold_time = 8 * 3600

        # Old logic (spot: no funding cost):
        old_fill_entry = entry_price_raw * (1 + 1.0 / 10000)
        old_fill_exit = exit_price_raw * (1 - 1.0 / 10000)
        old_pnl = (old_fill_exit - old_fill_entry) * qty
        old_entry_fee = qty * old_fill_entry * 0.0004
        old_exit_fee = qty * old_fill_exit * 0.0004
        old_net = old_pnl - old_entry_fee - old_exit_fee

        # New logic:
        breakdown = calc.calculate_pnl("LONG", qty, entry_price_raw, exit_price_raw, hold_time)

        assert breakdown.net_pnl == pytest.approx(old_net, rel=1e-4)
        assert breakdown.fill_exit_price == pytest.approx(old_fill_exit, rel=1e-6)
