# Trading Environment for Reinforcement Learning
#
# Implements OpenAI Gym-compatible trading environment for RL agent training
# with state/action/reward definition and episode management.

import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np

logger = logging.getLogger(__name__)


class Action(Enum):
    """Trading actions."""
    HOLD = 0
    BUY = 1
    SELL = 2


@dataclass
class TradingState:
    """Trading state for RL agent."""
    prices: np.ndarray
    portfolio_value: float
    position: float
    cash: float
    features: np.ndarray


class TradingEnv:
    """Trading environment for reinforcement learning (simplified Gym interface)."""

    def __init__(self, initial_cash: float = 100000, transaction_cost: float = 0.001):
        """
        Initialize trading environment.

        Args:
            initial_cash: Initial cash amount
            transaction_cost: Transaction cost as percentage
        """
        self.initial_cash = initial_cash
        self.transaction_cost = transaction_cost

        # Environment state
        self.current_step = 0
        self.cash = initial_cash
        self.position = 0.0
        self.portfolio_value = initial_cash
        self.prices = None
        self.features = None

        # Episode tracking
        self.total_reward = 0.0
        self.trade_count = 0

        # Action space: 3 actions (HOLD, BUY, SELL)
        self.action_space_n = 3

        # Observation space: 60 recent prices + 3 portfolio state = 63
        self.observation_space_n = 63

    def reset(self, prices: np.ndarray | None = None, features: np.ndarray | None = None) -> np.ndarray:
        """
        Reset environment for new episode.

        Args:
            prices: Historical price data
            features: Additional features (optional)

        Returns:
            Initial observation
        """
        self.current_step = 0
        self.cash = self.initial_cash
        self.position = 0.0
        self.portfolio_value = self.initial_cash
        if prices is None:
            prices = np.random.randn(200) * 10 + 100
        self.prices = prices
        self.features = features
        self.total_reward = 0.0
        self.trade_count = 0

        return self._get_observation()

    def _get_observation(self) -> np.ndarray:
        """
        Get current observation.

        Returns:
            Observation vector
        """
        # Get recent prices
        window_size = 60
        if self.current_step < window_size:
            recent_prices = np.zeros(window_size)
            recent_prices[window_size - self.current_step:] = self.prices[:self.current_step]
        else:
            recent_prices = self.prices[self.current_step - window_size:self.current_step]

        # Normalize prices
        if len(recent_prices) > 0 and recent_prices[-1] > 0:
            recent_prices = recent_prices / recent_prices[-1]

        # Portfolio state
        portfolio_state = np.array([
            self.cash / self.initial_cash,
            self.position,
            self.portfolio_value / self.initial_cash
        ])

        # Combine
        observation = np.concatenate([recent_prices, portfolio_state])

        return observation

    def step(self, action: int) -> tuple[np.ndarray, float, bool, dict]:
        """Execute one step in environment.

        Args:
            action: Action to take (0=HOLD, 1=BUY, 2=SELL)

        Returns:
            Tuple of (observation, reward, done, info)
        """
        if self.current_step >= len(self.prices) - 1:
            return self._get_observation(), 0.0, True, {}

        current_price = self.prices[self.current_step]
        next_price = self.prices[self.current_step + 1]
        prev_portfolio_value = self.cash + self.position * current_price

        self._execute_action(action, current_price)

        self.portfolio_value = self.cash + self.position * next_price
        reward = (self.portfolio_value - prev_portfolio_value) / self.initial_cash

        self.current_step += 1
        self.total_reward += reward
        done = self.current_step >= len(self.prices) - 1

        info = self._build_step_info()
        return self._get_observation(), reward, done, info

    def _execute_action(self, action: int, current_price: float) -> None:
        """Execute trading action at current price."""
        action_taken = Action(action)
        if action_taken == Action.BUY:
            if self.cash > 0 and current_price > 0:
                buy_amount = self.cash * (1 - self.transaction_cost)
                self.position += buy_amount / current_price
                self.cash = 0
                self.trade_count += 1
        elif action_taken == Action.SELL:
            if self.position > 0:
                sell_value = self.position * current_price * (1 - self.transaction_cost)
                self.cash += sell_value
                self.position = 0
                self.trade_count += 1

    def _build_step_info(self) -> dict:
        """Build info dict for step return."""
        return {
            'portfolio_value': self.portfolio_value,
            'position': self.position,
            'cash': self.cash,
            'trade_count': self.trade_count,
            'total_reward': self.total_reward
        }

    def render(self):
        """Render current state (optional, debug-level logging)."""
        if self.current_step < len(self.prices):
            logger.debug(
                "Step: %d | Price: %.2f | Portfolio: %.2f | Position: %.4f | Cash: %.2f | Reward: %.4f",
                self.current_step,
                self.prices[self.current_step],
                self.portfolio_value,
                self.position,
                self.cash,
                self.total_reward,
            )

    def close(self):
        """Clean up environment resources."""
        self.prices = np.array([], dtype=np.float64)
        self.features = None
        self.current_step = 0
        self.position = 0.0
        self.cash = 0.0
        logger.debug("TradingEnv closed — resources released")
