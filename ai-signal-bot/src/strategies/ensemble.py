"""EnsembleVoter — majority/weighted voting across strategy signals."""
from src.strategies.signal import Signal, SignalDirection


class EnsembleVoter:
    """Combines signals from multiple strategies using majority voting.

    Modes:
    - "majority":  Direction with most votes wins
    - "weighted":  Confidence-weighted direction
    Min votes required to produce a signal.
    """

    def __init__(self, mode: str = "majority", min_votes: int = 2,
                 strategies: list | None = None):
        self.mode = mode
        self.min_votes = min_votes
        self.strategies = strategies or []
        self.name = "ensemble"

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        """Run all configured strategies and combine their signals via vote()."""
        if not self.strategies:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="No strategies configured",
            )
        signals = [s.analyze(symbol, candles) for s in self.strategies]
        return self.vote(signals)

    def vote(self, signals: list[Signal]) -> Signal:
        """Combine multiple strategy signals into one ensemble signal."""
        long_count, short_count, long_score, short_score, \
            long_agg, short_agg, long_strategies, short_strategies, \
            first_actionable, long_signals, short_signals = self._accumulate_signals(signals)

        if first_actionable is None:
            return Signal(
                symbol=signals[0].symbol if signals else "",
                direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name,
                entry_price=0, stop_loss=0, take_profit=0,
                reason="No actionable signals",
            )

        winning_signals = long_signals if (
            (self.mode == "weighted" and long_score > short_score)
            or (self.mode != "weighted" and long_count > short_count)
        ) else short_signals

        return self._select_winner(
            long_count, short_count, long_score, short_score,
            long_agg, short_agg, long_strategies, short_strategies,
            first_actionable, winning_signals,
        )

    @staticmethod
    def _accumulate_signals(signals: list[Signal]) -> tuple:
        """Single-pass accumulation of long/short votes. Returns aggregated counts and sums."""
        long_count = 0
        short_count = 0
        long_score = 0.0
        short_score = 0.0
        long_agg = [0.0, 0.0, 0.0, 0.0]
        short_agg = [0.0, 0.0, 0.0, 0.0]
        long_strategies = []
        short_strategies = []
        long_signals = []
        short_signals = []
        first_actionable = None

        for s in signals:
            if not s.is_actionable:
                continue
            if first_actionable is None:
                first_actionable = s
            if s.direction == SignalDirection.LONG:
                long_count += 1
                long_score += s.confidence
                long_agg[0] += s.confidence
                long_agg[1] += s.entry_price
                long_agg[2] += s.stop_loss
                long_agg[3] += s.take_profit
                long_strategies.append(s.strategy)
                long_signals.append(s)
            elif s.direction == SignalDirection.SHORT:
                short_count += 1
                short_score += s.confidence
                short_agg[0] += s.confidence
                short_agg[1] += s.entry_price
                short_agg[2] += s.stop_loss
                short_agg[3] += s.take_profit
                short_strategies.append(s.strategy)
                short_signals.append(s)

        return (long_count, short_count, long_score, short_score,
                long_agg, short_agg, long_strategies, short_strategies, first_actionable,
                long_signals, short_signals)

    def _select_winner(
        self, long_count: int, short_count: int, long_score: float,
        short_score: float, long_agg: list, short_agg: list,
        long_strategies: list, short_strategies: list,
        first_actionable: Signal,
        winning_signals: list[Signal] | None = None,
    ) -> Signal:
        """Select winning direction and build ensemble signal."""
        if self.mode == "weighted":
            if long_score > short_score and long_count >= self.min_votes:
                winner_count, winner_agg, winner_strategies, direction = \
                    long_count, long_agg, long_strategies, SignalDirection.LONG
            elif short_score > long_score and short_count >= self.min_votes:
                winner_count, winner_agg, winner_strategies, direction = \
                    short_count, short_agg, short_strategies, SignalDirection.SHORT
            else:
                return Signal(
                    symbol=first_actionable.symbol,
                    direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy=self.name,
                    entry_price=first_actionable.entry_price,
                    stop_loss=0, take_profit=0,
                    reason=f"Insufficient votes (L:{long_count}/S:{short_count})",
                )
        else:
            if long_count > short_count and long_count >= self.min_votes:
                winner_count, winner_agg, winner_strategies, direction = \
                    long_count, long_agg, long_strategies, SignalDirection.LONG
            elif short_count > long_count and short_count >= self.min_votes:
                winner_count, winner_agg, winner_strategies, direction = \
                    short_count, short_agg, short_strategies, SignalDirection.SHORT
            else:
                return Signal(
                    symbol=first_actionable.symbol,
                    direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy=self.name,
                    entry_price=first_actionable.entry_price,
                    stop_loss=0, take_profit=0,
                    reason=f"Split vote (L:{long_count}/S:{short_count})",
                )

        inv_count = 1.0 / winner_count
        # Use highest-confidence signal's SL/TP/entry instead of averaging
        if winning_signals:
            best = max(winning_signals, key=lambda s: s.confidence)
            entry_price = best.entry_price
            stop_loss = best.stop_loss
            take_profit = best.take_profit
        else:
            entry_price = winner_agg[1] * inv_count
            stop_loss = winner_agg[2] * inv_count
            take_profit = winner_agg[3] * inv_count

        return Signal(
            symbol=first_actionable.symbol,
            direction=direction,
            confidence=round(winner_agg[0] * inv_count, 1),
            strategy=self.name,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            reason=f"Ensemble ({', '.join(winner_strategies)}): {winner_count} votes",
        )

