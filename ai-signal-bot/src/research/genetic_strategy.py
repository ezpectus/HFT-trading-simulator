"""
Genetic Algorithm strategy discovery.

Evolves trading strategies through:
  - Population of random strategies (chromosomes)
  - Fitness = backtest Sharpe ratio
  - Crossover: combine indicators/rules from two parents
  - Mutation: randomly modify parameters
  - Selection: tournament selection
  - Elitism: keep best individuals

Each chromosome encodes:
  - Indicator selection (which indicators to use)
  - Indicator parameters (periods, thresholds)
  - Entry/exit rules (combinations of indicator conditions)
  - Risk management (stop-loss, take-profit, position size)

Usage:
    from src.research.genetic_strategy import GeneticStrategyDiscovery

    ga = GeneticStrategyDiscovery(population_size=100, generations=50)
    best = ga.evolve(historical_data, symbol="BTC/USDT")
    print(f"Best strategy: Sharpe={best.fitness:.2f}")
    print(f"Rules: {best.chromosome}")
"""

from __future__ import annotations

import random
import logging
import time
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from copy import deepcopy

logger = logging.getLogger(__name__)


@dataclass
class Chromosome:
    """A trading strategy encoded as a chromosome."""
    indicators: Dict[str, Dict[str, float]]  # {rsi: {period: 14}, ema: {fast: 12, slow: 26}, ...}
    entry_rules: List[Dict[str, Any]]  # [{indicator: rsi, operator: <, value: 30, action: buy}, ...]
    exit_rules: List[Dict[str, Any]]
    risk: Dict[str, float]  # {stop_loss: 2.0, take_profit: 4.0, max_position: 10.0}
    fitness: float = 0.0


class GeneticStrategyDiscovery:
    """Genetic algorithm for discovering trading strategies."""

    INDICATORS_POOL = ["rsi", "ema", "sma", "macd", "bbands", "atr", "stoch", "adx", "obv", "vwap"]
    OPERATORS = [">", "<", ">=", "<=", "crosses_above", "crosses_below"]
    ACTIONS = ["buy", "sell", "hold", "close"]

    def __init__(
        self,
        population_size: int = 100,
        generations: int = 50,
        crossover_rate: float = 0.7,
        mutation_rate: float = 0.15,
        elite_count: int = 5,
        tournament_size: int = 5,
        max_rules: int = 5,
    ):
        self.population_size = population_size
        self.generations = generations
        self.crossover_rate = crossover_rate
        self.mutation_rate = mutation_rate
        self.elite_count = elite_count
        self.tournament_size = tournament_size
        self.max_rules = max_rules
        self.population: List[Chromosome] = []
        self.history: List[Dict] = []

    def _random_indicator_params(self, indicator: str) -> Dict[str, float]:
        if indicator == "rsi":
            return {"period": random.randint(7, 28)}
        elif indicator == "ema":
            return {"fast": random.randint(5, 30), "slow": random.randint(30, 120)}
        elif indicator == "sma":
            return {"period": random.randint(10, 100)}
        elif indicator == "macd":
            return {"fast": random.randint(8, 20), "slow": random.randint(20, 40), "signal": random.randint(5, 15)}
        elif indicator == "bbands":
            return {"period": random.randint(15, 40), "std": round(random.uniform(1.0, 3.0), 1)}
        elif indicator == "atr":
            return {"period": random.randint(10, 28)}
        elif indicator == "stoch":
            return {"k_period": random.randint(5, 20), "d_period": random.randint(3, 10)}
        elif indicator == "adx":
            return {"period": random.randint(10, 28)}
        return {}

    def _random_rule(self) -> Dict[str, Any]:
        return {
            "indicator": random.choice(self.INDICATORS_POOL),
            "operator": random.choice(self.OPERATORS),
            "value": round(random.uniform(-100, 100), 2),
            "action": random.choice(self.ACTIONS),
        }

    def _random_chromosome(self) -> Chromosome:
        num_indicators = random.randint(2, 5)
        indicators = {}
        for ind in random.sample(self.INDICATORS_POOL, num_indicators):
            indicators[ind] = self._random_indicator_params(ind)

        num_entry_rules = random.randint(1, self.max_rules)
        num_exit_rules = random.randint(1, 3)

        return Chromosome(
            indicators=indicators,
            entry_rules=[self._random_rule() for _ in range(num_entry_rules)],
            exit_rules=[self._random_rule() for _ in range(num_exit_rules)],
            risk={
                "stop_loss": round(random.uniform(0.5, 5.0), 1),
                "take_profit": round(random.uniform(1.0, 8.0), 1),
                "max_position": round(random.uniform(5, 30), 1),
            },
        )

    def _initialize_population(self) -> None:
        self.population = [self._random_chromosome() for _ in range(self.population_size)]

    def _evaluate_fitness(
        self, chromosome: Chromosome, fitness_fn: Callable[[Chromosome], float]
    ) -> float:
        return fitness_fn(chromosome)

    def _tournament_selection(self) -> Chromosome:
        contestants = random.sample(self.population, min(self.tournament_size, len(self.population)))
        return max(contestants, key=lambda c: c.fitness)

    def _crossover(self, parent1: Chromosome, parent2: Chromosome) -> tuple[Chromosome, Chromosome]:
        if random.random() > self.crossover_rate:
            return deepcopy(parent1), deepcopy(parent2)

        # Crossover indicators
        child1_indicators = {}
        child2_indicators = {}
        all_inds = set(list(parent1.indicators.keys()) + list(parent2.indicators.keys()))
        for ind in all_inds:
            if ind in parent1.indicators and ind in parent2.indicators:
                child1_indicators[ind] = parent1.indicators[ind] if random.random() < 0.5 else parent2.indicators[ind]
                child2_indicators[ind] = parent2.indicators[ind] if random.random() < 0.5 else parent1.indicators[ind]
            elif ind in parent1.indicators:
                child1_indicators[ind] = parent1.indicators[ind]
            else:
                child2_indicators[ind] = parent2.indicators[ind]

        # Crossover rules
        split = random.randint(1, max(len(parent1.entry_rules) - 1, 1))
        child1_entry = parent1.entry_rules[:split] + parent2.entry_rules[split:]
        child2_entry = parent2.entry_rules[:split] + parent1.entry_rules[split:]

        split = random.randint(1, max(len(parent1.exit_rules) - 1, 1))
        child1_exit = parent1.exit_rules[:split] + parent2.exit_rules[split:]
        child2_exit = parent2.exit_rules[:split] + parent1.exit_rules[split:]

        # Crossover risk
        child1_risk = {
            k: parent1.risk.get(k, 0) if random.random() < 0.5 else parent2.risk.get(k, 0)
            for k in set(list(parent1.risk.keys()) + list(parent2.risk.keys()))
        }
        child2_risk = {
            k: parent2.risk.get(k, 0) if random.random() < 0.5 else parent1.risk.get(k, 0)
            for k in set(list(parent1.risk.keys()) + list(parent2.risk.keys()))
        }

        return (
            Chromosome(child1_indicators, child1_entry, child1_exit, child1_risk),
            Chromosome(child2_indicators, child2_entry, child2_exit, child2_risk),
        )

    def _mutate(self, chromosome: Chromosome) -> Chromosome:
        if random.random() > self.mutation_rate:
            return chromosome

        mutation_type = random.choice(["indicator", "rule", "risk", "add_rule", "remove_rule"])

        if mutation_type == "indicator" and chromosome.indicators:
            ind = random.choice(list(chromosome.indicators.keys()))
            chromosome.indicators[ind] = self._random_indicator_params(ind)

        elif mutation_type == "rule" and chromosome.entry_rules:
            idx = random.randint(0, len(chromosome.entry_rules) - 1)
            chromosome.entry_rules[idx] = self._random_rule()

        elif mutation_type == "risk":
            key = random.choice(list(chromosome.risk.keys()))
            if key == "stop_loss":
                chromosome.risk[key] = round(random.uniform(0.5, 5.0), 1)
            elif key == "take_profit":
                chromosome.risk[key] = round(random.uniform(1.0, 8.0), 1)
            else:
                chromosome.risk[key] = round(random.uniform(5, 30), 1)

        elif mutation_type == "add_rule" and len(chromosome.entry_rules) < self.max_rules:
            chromosome.entry_rules.append(self._random_rule())

        elif mutation_type == "remove_rule" and len(chromosome.entry_rules) > 1:
            chromosome.entry_rules.pop(random.randint(0, len(chromosome.entry_rules) - 1))

        return chromosome

    def evolve(
        self,
        data: Any,
        fitness_fn: Callable[[Chromosome], float],
        symbol: str = "BTC/USDT",
    ) -> Chromosome:
        """Run genetic algorithm evolution."""
        self._initialize_population()
        logger.info(f"[GA] Starting evolution: pop={self.population_size}, gens={self.generations}, symbol={symbol}")

        for gen in range(self.generations):
            start = time.time()

            # Evaluate fitness
            for chrom in self.population:
                chrom.fitness = self._evaluate_fitness(chrom, fitness_fn)

            # Sort by fitness
            self.population.sort(key=lambda c: c.fitness, reverse=True)

            best = self.population[0]
            avg = sum(c.fitness for c in self.population) / len(self.population)
            gen_time = time.time() - start

            self.history.append({
                "generation": gen + 1,
                "best_fitness": best.fitness,
                "avg_fitness": avg,
                "time_s": round(gen_time, 2),
            })

            logger.info(
                f"[GA] Gen {gen+1}/{self.generations}: "
                f"best={best.fitness:.4f} avg={avg:.4f} time={gen_time:.1f}s"
            )

            # Create next generation
            next_gen: List[Chromosome] = []

            # Elitism: keep best individuals
            next_gen.extend(deepcopy(c) for c in self.population[:self.elite_count])

            # Fill rest with crossover + mutation
            while len(next_gen) < self.population_size:
                p1 = self._tournament_selection()
                p2 = self._tournament_selection()
                c1, c2 = self._crossover(p1, p2)
                next_gen.append(self._mutate(c1))
                if len(next_gen) < self.population_size:
                    next_gen.append(self._mutate(c2))

            self.population = next_gen

        # Final evaluation
        for chrom in self.population:
            chrom.fitness = self._evaluate_fitness(chrom, fitness_fn)
        self.population.sort(key=lambda c: c.fitness, reverse=True)

        best = self.population[0]
        logger.info(f"[GA] Evolution complete. Best fitness: {best.fitness:.4f}")
        return best

    def get_history(self) -> List[Dict]:
        return self.history

    def get_top_strategies(self, n: int = 10) -> List[Chromosome]:
        return self.population[:n]
