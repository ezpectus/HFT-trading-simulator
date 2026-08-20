"""Tests for research/ modules — competition, genetic_strategy, attribution, greeks_hedging, microstructure_lab."""
import math

import numpy as np
import pytest

from src.research.attribution import (
    AttributionResult,
    BrinsonFachler,
    SectorAttribution,
)
from src.research.competition import CompetitionResult, StrategyCompetition
from src.research.genetic_strategy import Chromosome, GeneticStrategyDiscovery
from src.research.greeks_hedging import (
    GreeksHedgingSimulator,
    HedgeSimulationResult,
    black_scholes_greeks,
    norm_cdf,
    norm_pdf,
)
from src.research.microstructure_lab import (
    MicrostructureLab,
    MicrostructureMetrics,
)


# ─── Attribution ───


class TestBrinsonFachler:
    def test_basic_attribution(self):
        bf = BrinsonFachler()
        result = bf.attribute(
            portfolio_weights={"BTC": 0.4, "ETH": 0.3, "SOL": 0.3},
            benchmark_weights={"BTC": 0.5, "ETH": 0.3, "SOL": 0.2},
            portfolio_returns={"BTC": 0.05, "ETH": 0.03, "SOL": 0.08},
            benchmark_returns={"BTC": 0.02, "ETH": 0.04, "SOL": 0.05},
        )
        assert isinstance(result, AttributionResult)
        assert len(result.sectors) == 3
        assert result.active_return == pytest.approx(
            result.total_portfolio_return - result.total_benchmark_return
        )

    def test_total_returns(self):
        bf = BrinsonFachler()
        result = bf.attribute(
            portfolio_weights={"A": 0.6, "B": 0.4},
            benchmark_weights={"A": 0.5, "B": 0.5},
            portfolio_returns={"A": 0.10, "B": 0.02},
            benchmark_returns={"A": 0.05, "B": 0.03},
        )
        assert result.total_portfolio_return == pytest.approx(0.06 + 0.008)
        assert result.total_benchmark_return == pytest.approx(0.025 + 0.015)

    def test_effects_sum(self):
        bf = BrinsonFachler()
        result = bf.attribute(
            portfolio_weights={"A": 0.6, "B": 0.4},
            benchmark_weights={"A": 0.5, "B": 0.5},
            portfolio_returns={"A": 0.10, "B": 0.02},
            benchmark_returns={"A": 0.05, "B": 0.03},
        )
        total_effects = (
            result.total_allocation_effect
            + result.total_selection_effect
            + result.total_interaction_effect
        )
        assert total_effects == pytest.approx(result.active_return, abs=1e-10)

    def test_equal_weights(self):
        bf = BrinsonFachler()
        result = bf.attribute(
            portfolio_weights={"A": 0.5, "B": 0.5},
            benchmark_weights={"A": 0.5, "B": 0.5},
            portfolio_returns={"A": 0.05, "B": 0.03},
            benchmark_returns={"A": 0.05, "B": 0.03},
        )
        assert result.active_return == pytest.approx(0.0)
        assert result.total_allocation_effect == pytest.approx(0.0)

    def test_missing_sector_in_portfolio(self):
        bf = BrinsonFachler()
        result = bf.attribute(
            portfolio_weights={"A": 1.0},
            benchmark_weights={"A": 0.5, "B": 0.5},
            portfolio_returns={"A": 0.05},
            benchmark_returns={"A": 0.05, "B": 0.03},
        )
        assert len(result.sectors) == 2


# ─── Competition ───


class TestCompetitionResult:
    def test_defaults(self):
        cr = CompetitionResult(
            strategy_name="test",
            total_return_pct=10.0,
            sharpe_ratio=1.5,
            sortino_ratio=2.0,
            max_drawdown_pct=5.0,
            win_rate=0.6,
            profit_factor=1.8,
            total_trades=50,
            final_balance=11000,
        )
        assert cr.elo_rating == 1000.0
        assert cr.rank == 0
        assert cr.wins == 0


class TestStrategyCompetition:
    def test_init_defaults(self):
        comp = StrategyCompetition()
        assert comp.initial_capital == 10000.0
        assert comp.elo_k == 32.0
        assert len(comp.strategies) == 0

    def test_register(self):
        comp = StrategyCompetition()
        comp.register("trend", object())
        assert "trend" in comp.strategies

    def test_run_tournament_empty(self):
        comp = StrategyCompetition()
        results = comp.run_tournament()
        assert results == {}

    def test_run_tournament_default_backtest(self):
        comp = StrategyCompetition()
        comp.register("strat_a", object())
        comp.register("strat_b", object())
        results = comp.run_tournament()
        assert len(results) == 2
        assert "strat_a" in results
        assert "strat_b" in results

    def test_run_tournament_custom_backtest(self):
        comp = StrategyCompetition()

        def custom_bt(strategy, data, capital):
            return {
                "total_return_pct": 15.0,
                "sharpe_ratio": 2.0,
                "sortino_ratio": 2.5,
                "max_drawdown_pct": 3.0,
                "win_rate": 0.65,
                "profit_factor": 2.1,
                "total_trades": 30,
                "final_balance": 11500,
            }

        comp.register("strat_a", object())
        results = comp.run_tournament(backtest_fn=custom_bt)
        assert results["strat_a"].total_return_pct == 15.0
        assert results["strat_a"].sharpe_ratio == 2.0

    def test_elo_ranking(self):
        comp = StrategyCompetition()

        def bt_a(strategy, data, capital):
            return {"sharpe_ratio": 3.0, "final_balance": 12000}

        def bt_b(strategy, data, capital):
            return {"sharpe_ratio": 1.0, "final_balance": 10500}

        comp.register("good", object())
        comp.register("bad", object())
        results = comp.run_tournament()
        ranked = sorted(results.values(), key=lambda r: r.elo_rating, reverse=True)
        assert ranked[0].rank == 1


# ─── GeneticStrategy ───


class TestChromosome:
    def test_creation(self):
        c = Chromosome(
            indicators={"rsi": {"period": 14}},
            entry_rules=[{"indicator": "rsi", "operator": "<", "value": 30, "action": "buy"}],
            exit_rules=[{"indicator": "rsi", "operator": ">", "value": 70, "action": "sell"}],
            risk={"stop_loss": 2.0, "take_profit": 4.0, "max_position": 10.0},
        )
        assert c.fitness == 0.0
        assert "rsi" in c.indicators


class TestGeneticStrategyDiscovery:
    def test_init_defaults(self):
        ga = GeneticStrategyDiscovery()
        assert ga.population_size == 100
        assert ga.generations == 50
        assert ga.crossover_rate == 0.7
        assert ga.mutation_rate == 0.15

    def test_init_custom(self):
        ga = GeneticStrategyDiscovery(population_size=10, generations=5)
        assert ga.population_size == 10
        assert ga.generations == 5

    def test_random_chromosome(self):
        ga = GeneticStrategyDiscovery()
        c = ga._random_chromosome()
        assert len(c.indicators) >= 2
        assert len(c.entry_rules) >= 1
        assert "stop_loss" in c.risk

    def test_random_indicator_params(self):
        ga = GeneticStrategyDiscovery()
        params = ga._random_indicator_params("rsi")
        assert "period" in params
        params = ga._random_indicator_params("ema")
        assert "fast" in params
        assert "slow" in params

    def test_evolve(self):
        ga = GeneticStrategyDiscovery(population_size=6, generations=2, elite_count=1)

        def fitness_fn(chromosome):
            return sum(len(r) for r in chromosome.entry_rules)

        best = ga.evolve(data=None, fitness_fn=fitness_fn, symbol="BTC/USDT")
        assert isinstance(best, Chromosome)
        assert best.fitness >= 0
        assert len(ga.history) == 2


# ─── GreeksHedging ───


class TestNormCDF:
    def test_zero(self):
        assert norm_cdf(0) == pytest.approx(0.5)

    def test_positive(self):
        assert norm_cdf(1.96) > 0.97

    def test_negative(self):
        assert norm_cdf(-1.96) < 0.03


class TestNormPDF:
    def test_zero(self):
        assert norm_pdf(0) == pytest.approx(1 / math.sqrt(2 * math.pi))

    def test_symmetric(self):
        assert norm_pdf(1) == pytest.approx(norm_pdf(-1))


class TestBlackScholesGreeks:
    def test_call_price(self):
        greeks = black_scholes_greeks(S=100, K=100, T=1, r=0.05, sigma=0.2, option_type="call")
        assert greeks["price"] > 0
        assert 0 < greeks["delta"] < 1
        assert greeks["gamma"] > 0
        assert greeks["vega"] > 0

    def test_put_price(self):
        greeks = black_scholes_greeks(S=100, K=100, T=1, r=0.05, sigma=0.2, option_type="put")
        assert greeks["price"] > 0
        assert -1 < greeks["delta"] < 0

    def test_zero_expiry(self):
        greeks = black_scholes_greeks(S=105, K=100, T=0, r=0.05, sigma=0.2, option_type="call")
        assert greeks["price"] == 5.0
        assert greeks["delta"] == 0

    def test_zero_volatility(self):
        greeks = black_scholes_greeks(S=105, K=100, T=1, r=0.0, sigma=0, option_type="call")
        assert greeks["price"] == 5.0


class TestGreeksHedgingSimulator:
    def test_init_defaults(self):
        sim = GreeksHedgingSimulator()
        assert sim.s0 == 65000.0
        assert sim.sigma == 0.60

    def test_simulate_delta_hedge(self):
        sim = GreeksHedgingSimulator(s0=100, sigma=0.3, r=0.0, t=30 / 365)
        result = sim.simulate_delta_hedge(
            option_type="call", strike=100, n_days=10, n_paths=1, seed=42
        )
        assert isinstance(result, HedgeSimulationResult)
        assert isinstance(result.final_pnl, float)
        assert isinstance(result.n_rebalances, int)
        assert len(result.daily_pnl) > 0

    def test_simulate_with_seed_deterministic(self):
        sim = GreeksHedgingSimulator(s0=100, sigma=0.3, r=0.0, t=30 / 365)
        r1 = sim.simulate_delta_hedge(strike=100, n_days=5, seed=123)
        r2 = sim.simulate_delta_hedge(strike=100, n_days=5, seed=123)
        assert r1.final_pnl == pytest.approx(r2.final_pnl)


# ─── MicrostructureLab ───


@pytest.fixture
def book_snapshots():
    return [
        {"timestamp": 1, "bids": [{"price": 99, "qty": 10}], "asks": [{"price": 101, "qty": 8}]},
        {"timestamp": 2, "bids": [{"price": 100, "qty": 15}], "asks": [{"price": 101, "qty": 5}]},
        {"timestamp": 3, "bids": [{"price": 100, "qty": 12}], "asks": [{"price": 102, "qty": 10}]},
    ]


@pytest.fixture
def trades():
    return [
        {"timestamp": 1, "qty": 40, "side": "buy"},
        {"timestamp": 2, "qty": 30, "side": "sell"},
        {"timestamp": 3, "qty": 50, "side": "buy"},
        {"timestamp": 4, "qty": 20, "side": "sell"},
    ]


class TestMicrostructureMetrics:
    def test_defaults(self):
        m = MicrostructureMetrics()
        assert m.ofi_mean == 0.0
        assert m.vpin == 0.0
        assert m.kyle_lambda == 0.0


class TestMicrostructureLab:
    def test_init_empty(self):
        lab = MicrostructureLab()
        assert lab.trades == []
        assert lab.book_snapshots == []

    def test_init_with_data(self, trades, book_snapshots):
        lab = MicrostructureLab(trades=trades, book_snapshots=book_snapshots)
        assert len(lab.trades) == 4
        assert len(lab.book_snapshots) == 3

    def test_compute_ofi_empty(self):
        lab = MicrostructureLab()
        ts, ofi = lab.compute_ofi()
        assert len(ofi) == 0

    def test_compute_ofi(self, book_snapshots):
        lab = MicrostructureLab(book_snapshots=book_snapshots)
        ts, ofi = lab.compute_ofi()
        assert len(ofi) == 2
        assert lab.metrics.ofi_mean != 0

    def test_compute_price_impact(self):
        lab = MicrostructureLab()
        ofi = np.random.randn(20)
        returns = np.random.randn(20)
        impact = lab.compute_price_impact(ofi, returns)
        assert isinstance(impact, float)

    def test_compute_price_impact_short(self):
        lab = MicrostructureLab()
        assert lab.compute_price_impact(np.array([1]), np.array([1])) == 0.0

    def test_compute_vpin_empty(self):
        lab = MicrostructureLab()
        assert lab.compute_vpin() == 0.0

    def test_compute_vpin(self, trades):
        lab = MicrostructureLab(trades=trades)
        vpin = lab.compute_vpin(bucket_volume=50)
        assert 0 <= vpin <= 1

    def test_compute_spread_metrics_empty(self):
        lab = MicrostructureLab()
        assert lab.compute_spread_metrics() == {}

    def test_compute_spread_metrics(self, book_snapshots):
        lab = MicrostructureLab(book_snapshots=book_snapshots)
        result = lab.compute_spread_metrics()
        assert "effective_spread_bps" in result
        assert result["effective_spread_bps"] > 0

    def test_compute_trade_intensity_empty(self):
        lab = MicrostructureLab()
        assert lab.compute_trade_intensity() == {}

    def test_compute_trade_intensity(self, trades):
        lab = MicrostructureLab(trades=trades)
        result = lab.compute_trade_intensity()
        assert "trade_arrival_rate" in result
        assert result["trade_arrival_rate"] > 0

    def test_compute_amihud_illiquidity(self):
        lab = MicrostructureLab()
        returns = np.array([0.01, -0.02, 0.005])
        volumes = np.array([1000, 2000, 500])
        illiq = lab.compute_amihud_illiquidity(returns, volumes)
        assert illiq > 0

    def test_compute_amihud_empty(self):
        lab = MicrostructureLab()
        assert lab.compute_amihud_illiquidity(np.array([]), np.array([])) == 0.0

    def test_analyze_all(self, trades, book_snapshots):
        prices = np.array([100, 101, 102, 101, 103], dtype=float)
        lab = MicrostructureLab(
            trades=trades,
            book_snapshots=book_snapshots,
            price_history=prices,
        )
        metrics = lab.analyze_all()
        assert isinstance(metrics, MicrostructureMetrics)
        assert metrics.effective_spread_bps > 0
