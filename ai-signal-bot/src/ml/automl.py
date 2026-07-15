"""
AutoML pipeline using Optuna for hyperparameter optimization.

Automatically searches for optimal strategy parameters across:
- Technical indicator periods (RSI, EMA, ATR)
- Signal thresholds (confidence, spread)
- Risk management (stop-loss, take-profit, position sizing)
- Model hyperparameters (LSTM layers, learning rate, dropout)

Usage:
    from src.ml.automl import AutoMLOptimizer

    optimizer = AutoMLOptimizer(n_trials=100, strategy="trend_following")
    best_params = optimizer.optimize(train_data, val_data)
    print(best_params)
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

try:
    import optuna
    from optuna.samplers import TPESampler
    from optuna.pruners import MedianPruner
    OPTUNA_AVAILABLE = True
except ImportError:
    OPTUNA_AVAILABLE = False
    logger.warning("[AutoML] optuna not installed — run: pip install optuna")


@dataclass
class AutoMLConfig:
    n_trials: int = 100
    timeout: int = 3600  # 1 hour
    n_startup_trials: int = 10
    pruner_n_warmup_steps: int = 5
    storage: Optional[str] = None  # "sqlite:///automl.db"
    study_name: str = "hft_automl"


class AutoMLOptimizer:
    """
    Hyperparameter optimization using Optuna TPE sampler.

    The objective function should:
    1. Sample hyperparameters from trial
    2. Build strategy/model with those params
    3. Run backtest
    4. Return metric (e.g., Sharpe ratio)
    """

    def __init__(
        self,
        config: AutoMLConfig = None,
        strategy: str = "trend_following",
    ):
        self.config = config or AutoMLConfig()
        self.strategy = strategy
        self.best_params: Optional[Dict] = None
        self.best_value: float = float("-inf")
        self.study: Optional[object] = None

    def _default_search_space(self, trial) -> Dict[str, Any]:
        """Default search space for trading strategies."""
        params = {}

        # Indicator parameters
        params["rsi_period"] = trial.suggest_int("rsi_period", 7, 28)
        params["rsi_oversold"] = trial.suggest_float("rsi_oversold", 20, 35)
        params["rsi_overbought"] = trial.suggest_float("rsi_overbought", 65, 85)
        params["ema_fast"] = trial.suggest_int("ema_fast", 5, 30)
        params["ema_slow"] = trial.suggest_int("ema_slow", 30, 120)
        params["atr_period"] = trial.suggest_int("atr_period", 10, 28)

        # Signal thresholds
        params["confidence_threshold"] = trial.suggest_float("confidence_threshold", 0.3, 0.9)
        params["spread_threshold"] = trial.suggest_float("spread_threshold", 0.0001, 0.002)

        # Risk management
        params["stop_loss_atr_mult"] = trial.suggest_float("stop_loss_atr_mult", 0.5, 4.0)
        params["take_profit_atr_mult"] = trial.suggest_float("take_profit_atr_mult", 0.5, 6.0)
        params["max_position_pct"] = trial.suggest_float("max_position_pct", 0.05, 0.30)
        params["max_open_positions"] = trial.suggest_int("max_open_positions", 1, 10)

        # Strategy-specific
        if self.strategy == "mean_reversion":
            params["bb_period"] = trial.suggest_int("bb_period", 15, 40)
            params["bb_std"] = trial.suggest_float("bb_std", 1.0, 3.0)
            params["zscore_entry"] = trial.suggest_float("zscore_entry", 1.0, 3.0)
        elif self.strategy == "trend_following":
            params["trend_strength_threshold"] = trial.suggest_float("trend_strength_threshold", 0.2, 0.8)
            params["trailing_stop_atr"] = trial.suggest_float("trailing_stop_atr", 0.5, 3.0)

        return params

    def optimize(
        self,
        objective_fn: Optional[Callable] = None,
        search_space_fn: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """
        Run hyperparameter optimization.

        Args:
            objective_fn: Custom objective function(trial) -> float
            search_space_fn: Custom search space function(trial) -> dict

        Returns:
            Best hyperparameters found
        """
        if not OPTUNA_AVAILABLE:
            logger.error("[AutoML] optuna not available")
            return {}

        sampler = TPESampler(n_startup_trials=self.config.n_startup_trials)
        pruner = MedianPruner(
            n_startup_trials=self.config.n_startup_trials,
            n_warmup_steps=self.config.pruner_n_warmup_steps,
        )

        self.study = optuna.create_study(
            study_name=f"{self.config.study_name}_{self.strategy}",
            direction="maximize",
            sampler=sampler,
            pruner=pruner,
            storage=self.config.storage,
            load_if_exists=True,
        )

        if objective_fn is None:
            logger.warning("[AutoML] No objective function provided — using dummy")
            objective_fn = lambda trial: 0.0

        space_fn = search_space_fn or self._default_search_space

        def wrapped_objective(trial):
            params = space_fn(trial)
            return objective_fn(params)

        logger.info(f"[AutoML] Starting optimization: {self.config.n_trials} trials, strategy={self.strategy}")
        start = time.time()

        self.study.optimize(
            wrapped_objective,
            n_trials=self.config.n_trials,
            timeout=self.config.timeout,
            show_progress_bar=True,
        )

        elapsed = time.time() - start
        self.best_params = self.study.best_params
        self.best_value = self.study.best_value

        logger.info(
            f"[AutoML] Optimization complete in {elapsed:.0f}s — "
            f"best value: {self.best_value:.4f}"
        )
        logger.info(f"[AutoML] Best params: {self.best_params}")

        return self.best_params

    def get_param_importances(self) -> Dict[str, float]:
        """Get hyperparameter importances."""
        if not self.study or not OPTUNA_AVAILABLE:
            return {}
        try:
            return dict(optuna.importance.get_param_importances(self.study))
        except Exception:
            return {}

    def get_trials_dataframe(self):
        """Get all trials as a DataFrame."""
        if not self.study or not OPTUNA_AVAILABLE:
            return None
        try:
            import pandas as pd
            return self.study.trials_dataframe()
        except Exception:
            return None

    def save_best_params(self, path: str) -> None:
        """Save best parameters to JSON."""
        if self.best_params:
            import json
            with open(path, "w") as f:
                json.dump({
                    "strategy": self.strategy,
                    "best_value": self.best_value,
                    "best_params": self.best_params,
                    "n_trials": len(self.study.trials) if self.study else 0,
                }, f, indent=2)
            logger.info(f"[AutoML] Saved best params to {path}")
