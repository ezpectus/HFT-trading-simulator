# Trading Environment for Reinforcement Learning
#
# Implements OpenAI Gym-compatible trading environment for RL agent training
# with state/action/reward definition and episode management.

import numpy as np
from typing import Tuple, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


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
        
        # Observation space: prices + portfolio state
        self.observation_space_n = 100  # Placeholder
    
    def reset(self, prices: np.ndarray, features: Optional[np.ndarray] = None) -> np.ndarray:
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
    
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict]:
        """
        Execute one step in environment.
        
        Args:
            action: Action to take (0=HOLD, 1=BUY, 2=SELL)
        
        Returns:
            Tuple of (observation, reward, done, info)
        """
        if self.current_step >= len(self.prices) - 1:
            return self._get_observation(), 0.0, True, {}
        
        current_price = self.prices[self.current_step]
        next_price = self.prices[self.current_step + 1]
        
        # Execute action
        reward = 0.0
        action_taken = Action(action)
        
        if action_taken == Action.BUY:
            if self.cash > 0:
                # Buy as much as possible
                buy_amount = self.cash * (1 - self.transaction_cost)
                shares_bought = buy_amount / current_price
                self.position += shares_bought
                self.cash = 0
                self.trade_count += 1
        
        elif action_taken == Action.SELL:
            if self.position > 0:
                # Sell all position
                sell_value = self.position * current_price * (1 - self.transaction_cost)
                self.cash += sell_value
                self.position = 0
                self.trade_count += 1
        
        # Calculate portfolio value
        self.portfolio_value = self.cash + self.position * next_price
        
        # Calculate reward (PnL)
        prev_portfolio_value = self.cash + self.position * current_price
        reward = (self.portfolio_value - prev_portfolio_value) / self.initial_cash
        
        # Move to next step
        self.current_step += 1
        self.total_reward += reward
        
        # Check if done
        done = self.current_step >= len(self.prices) - 1
        
        # Info
        info = {
            'portfolio_value': self.portfolio_value,
            'position': self.position,
            'cash': self.cash,
            'trade_count': self.trade_count,
            'total_reward': self.total_reward
        }
        
        return self._get_observation(), reward, done, info
    
    def render(self):
        """Render current state (optional)."""
        if self.current_step < len(self.prices):
            print(f"Step: {self.current_step}")
            print(f"Price: {self.prices[self.current_step]:.2f}")
            print(f"Portfolio Value: {self.portfolio_value:.2f}")
            print(f"Position: {self.position:.4f}")
            print(f"Cash: {self.cash:.2f}")
            print(f"Total Reward: {self.total_reward:.4f}")
            print()
    
    def close(self):
        """Clean up environment resources."""
        pass
