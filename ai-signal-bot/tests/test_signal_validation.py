"""Tests for signal validation logic."""
import pytest

from src.signal_validation.validator import SignalValidator, ValidationResult
from src.strategies.signal import Signal, SignalDirection


def make_signal(
    symbol: str = "BTC/USDT",
    direction: SignalDirection = SignalDirection.LONG,
    confidence: float = 80.0,
    entry: float = 100.0,
    sl: float = 95.0,
    tp: float = 115.0,
    strategy: str = "test",
) -> Signal:
    return Signal(
        symbol=symbol,
        direction=direction,
        confidence=confidence,
        strategy=strategy,
        entry_price=entry,
        stop_loss=sl,
        take_profit=tp,
    )


@pytest.fixture
def validator():
    return SignalValidator(
        min_confidence=65,
        min_rr_ratio=1.5,
        max_drawdown_pct=8.0,
        max_open_positions=3,
    )


class TestSignalValidator:
    """Test SignalValidator class."""

    @pytest.mark.asyncio
    async def test_valid_signal_passes(self, validator):
        signal = make_signal(confidence=80, entry=100, sl=95, tp=115)
        result = await validator.validate(signal)
        assert result.passed is True
        assert result.reason == "Signal validated"

    @pytest.mark.asyncio
    async def test_neutral_signal_rejected(self, validator):
        signal = make_signal(direction=SignalDirection.NEUTRAL)
        result = await validator.validate(signal)
        assert result.passed is False
        assert "neutral" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_low_confidence_rejected(self, validator):
        signal = make_signal(confidence=50)
        result = await validator.validate(signal)
        assert result.passed is False
        assert "Confidence" in result.reason

    @pytest.mark.asyncio
    async def test_confidence_at_threshold_passes(self, validator):
        signal = make_signal(confidence=65)
        result = await validator.validate(signal)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_low_rr_ratio_rejected(self, validator):
        signal = make_signal(entry=100, sl=95, tp=102)  # RR = 2/5 = 0.4
        result = await validator.validate(signal)
        assert result.passed is False
        assert "R:R" in result.reason

    @pytest.mark.asyncio
    async def test_good_rr_ratio_passes(self, validator):
        signal = make_signal(entry=100, sl=95, tp=110)  # RR = 10/5 = 2.0
        result = await validator.validate(signal)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_drawdown_rejected(self, validator):
        await validator.update_pnl(-1000)  # -10% of 10000
        signal = make_signal()
        result = await validator.validate(signal, account_balance=10000)
        assert result.passed is False
        assert "drawdown" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_positive_pnl_does_not_trigger_drawdown(self, validator):
        await validator.update_pnl(500)
        signal = make_signal()
        result = await validator.validate(signal, account_balance=10000)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_max_positions_rejected(self, validator):
        await validator.update_position_count(3)
        signal = make_signal()
        result = await validator.validate(signal)
        assert result.passed is False
        assert "Max positions" in result.reason

    @pytest.mark.asyncio
    async def test_duplicate_signal_rejected(self, validator):
        signal = make_signal(symbol="BTC/USDT")
        result1 = await validator.validate(signal)
        assert result1.passed is True
        result2 = await validator.validate(signal)
        assert result2.passed is False
        assert "Duplicate" in result2.reason

    @pytest.mark.asyncio
    async def test_different_symbols_not_duplicate(self, validator):
        s1 = make_signal(symbol="BTC/USDT")
        s2 = make_signal(symbol="ETH/USDT")
        r1 = await validator.validate(s1)
        r2 = await validator.validate(s2)
        assert r1.passed is True
        assert r2.passed is True

    @pytest.mark.asyncio
    async def test_short_signal_rr_ratio(self, validator):
        signal = make_signal(
            direction=SignalDirection.SHORT,
            entry=100,
            sl=105,
            tp=90,  # RR = 10/5 = 2.0
        )
        result = await validator.validate(signal)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_short_signal_low_rr_rejected(self, validator):
        signal = make_signal(
            direction=SignalDirection.SHORT,
            entry=100,
            sl=105,
            tp=102,  # RR = 2/5 = 0.4
        )
        result = await validator.validate(signal)
        assert result.passed is False
        assert "R:R" in result.reason

    def test_reset_daily(self, validator):
        validator._daily_pnl = -500
        validator.reset_daily()
        assert validator._daily_pnl == 0.0

    @pytest.mark.asyncio
    async def test_update_position_count(self, validator):
        await validator.update_position_count(5)
        assert validator._open_positions == 5

    def test_validation_result_dataclass(self):
        signal = make_signal()
        result = ValidationResult(True, "test reason", signal)
        assert result.passed is True
        assert result.reason == "test reason"
        assert result.signal is signal
