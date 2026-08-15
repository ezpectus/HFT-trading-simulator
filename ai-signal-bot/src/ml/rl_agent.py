# Reinforcement Learning Agents
#
# Implements PPO and DQN agents for trading strategy optimization with
# experience replay, policy updates, and reward tracking.

import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from collections import deque
import pickle

from .environment import TradingEnv


@dataclass
class RLConfig:
    """RL agent configuration."""
    state_size: int = 100
    action_size: int = 3
    learning_rate: float = 0.001
    gamma: float = 0.99
    epsilon: float = 1.0
    epsilon_min: float = 0.01
    epsilon_decay: float = 0.995
    batch_size: int = 32
    memory_size: int = 10000


class DQNAgent:
    """Deep Q-Network agent for trading (simplified implementation)."""
    
    def __init__(self, config: RLConfig):
        """
        Initialize DQN agent.
        
        Args:
            config: RL configuration
        """
        self.config = config
        self.memory: deque = deque(maxlen=config.memory_size)
        self.epsilon = config.epsilon
        
        # Simplified Q-network (in production, use PyTorch/TensorFlow)
        self.q_network_weights = None
        self.target_network_weights = None
        self.is_trained = False
    
    def _build_network(self):
        """Build Q-network (simplified)."""
        # Simplified linear network
        self.q_network_weights = np.random.randn(
            self.config.state_size, self.config.action_size
        ) * 0.01
        self.target_network_weights = self.q_network_weights.copy()
    
    def remember(self, state: np.ndarray, action: int, reward: float, 
                 next_state: np.ndarray, done: bool):
        """
        Store experience in replay memory.
        
        Args:
            state: Current state
            action: Action taken
            reward: Reward received
            next_state: Next state
            done: Episode done flag
        """
        self.memory.append((state, action, reward, next_state, done))
    
    def act(self, state: np.ndarray, training: bool = True) -> int:
        """
        Select action using epsilon-greedy policy.
        
        Args:
            state: Current state
            training: Whether in training mode
        
        Returns:
            Action to take
        """
        if training and np.random.random() <= self.epsilon:
            return np.random.randint(self.config.action_size)
        
        if self.q_network_weights is None:
            self._build_network()
        
        # Q-values
        q_values = np.dot(state, self.q_network_weights)
        
        return np.argmax(q_values)
    
    def replay(self, batch_size: Optional[int] = None):
        """
        Train on batch of experiences.
        
        Args:
            batch_size: Batch size (uses config default if None)
        """
        if batch_size is None:
            batch_size = self.config.batch_size

        if len(self.memory) < batch_size:
            return
        
        # Sample batch
        batch_indices = np.random.choice(len(self.memory), batch_size, replace=False)
        batch = [self.memory[i] for i in batch_indices]
        
        states = np.array([e[0] for e in batch])
        actions = np.array([e[1] for e in batch])
        rewards = np.array([e[2] for e in batch])
        next_states = np.array([e[3] for e in batch])
        dones = np.array([e[4] for e in batch])
        
        # Calculate target Q-values
        target_q_values = np.dot(next_states, self.target_network_weights)
        max_target_q = np.max(target_q_values, axis=1)
        targets = rewards + self.config.gamma * max_target_q * (1 - dones)
        
        # Update Q-network (simplified)
        current_q = np.dot(states, self.q_network_weights)
        for i in range(batch_size):
            current_q[i, actions[i]] = targets[i]
        
        # Gradient descent update
        learning_rate = self.config.learning_rate
        gradient = np.dot(states.T, current_q - np.dot(states, self.q_network_weights)) / batch_size
        self.q_network_weights -= learning_rate * gradient
        
        # Decay epsilon
        if self.epsilon > self.config.epsilon_min:
            self.epsilon *= self.config.epsilon_decay
    
    def update_target_network(self):
        """Update target network with current network weights."""
        self.target_network_weights = self.q_network_weights.copy()
    
    def train(self, env: TradingEnv, episodes: int = 1000,
              prices: np.ndarray = None, features: np.ndarray = None) -> Dict:
        """
        Train agent in environment.
        
        Args:
            env: Trading environment
            episodes: Number of training episodes
            prices: Price data for environment reset
            features: Optional feature data for environment reset
        
        Returns:
            Training history dictionary
        """
        if self.q_network_weights is None:
            self._build_network()
        
        history = {
            'episode_rewards': [],
            'episode_lengths': [],
            'total_trades': []
        }
        
        for episode in range(episodes):
            state = env.reset(prices, features) if prices is not None else env.reset()
            total_reward = 0
            done = False
            steps = 0
            info = {}
            
            while not done:
                action = self.act(state, training=True)
                next_state, reward, done, info = env.step(action)
                
                self.remember(state, action, reward, next_state, done)
                self.replay()
                
                state = next_state
                total_reward += reward
                steps += 1
            
            # Update target network every 10 episodes
            if episode % 10 == 0:
                self.update_target_network()
            
            history['episode_rewards'].append(total_reward)
            history['episode_lengths'].append(steps)
            history['total_trades'].append(info.get('trade_count', 0))
        
        self.is_trained = True
        return history
    
    def save_model(self, filepath: str):
        """
        Save model to file.
        
        Args:
            filepath: Path to save model
        """
        model_data = {
            'config': self.config,
            'q_network_weights': self.q_network_weights,
            'target_network_weights': self.target_network_weights,
            'epsilon': self.epsilon,
            'is_trained': self.is_trained
        }
        
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
    
    def load_model(self, filepath: str):
        """
        Load model from file.
        
        Args:
            filepath: Path to load model from
        """
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)
        
        self.config = model_data['config']
        self.q_network_weights = model_data['q_network_weights']
        self.target_network_weights = model_data['target_network_weights']
        self.epsilon = model_data['epsilon']
        self.is_trained = model_data['is_trained']


class PPOAgent:
    """Proximal Policy Optimization agent for trading (simplified implementation)."""
    
    def __init__(self, config: RLConfig):
        """
        Initialize PPO agent.
        
        Args:
            config: RL configuration
        """
        self.config = config
        self.memory: deque = deque(maxlen=config.memory_size)
        self.is_trained = False
        
        # Simplified policy and value networks
        self.policy_weights = None
        self.value_weights = None
    
    def _build_networks(self):
        """Build policy and value networks (simplified)."""
        self.policy_weights = np.random.randn(
            self.config.state_size, self.config.action_size
        ) * 0.01
        self.value_weights = np.random.randn(self.config.state_size, 1) * 0.01
    
    def get_action(self, state: np.ndarray) -> Tuple[int, float]:
        """
        Get action from policy network.
        
        Args:
            state: Current state
        
        Returns:
            Tuple of (action, log_probability)
        """
        if self.policy_weights is None:
            self._build_networks()
        
        # Policy logits
        logits = np.dot(state, self.policy_weights)
        
        # Softmax
        exp_logits = np.exp(logits - np.max(logits))
        policy_probs = exp_logits / np.sum(exp_logits)
        
        # Sample action
        action = np.random.choice(self.config.action_size, p=policy_probs)
        log_prob = np.log(policy_probs[action] + 1e-10)
        
        return action, log_prob
    
    def get_value(self, state: np.ndarray) -> float:
        """
        Get state value from value network.
        
        Args:
            state: Current state
        
        Returns:
            State value
        """
        if self.value_weights is None:
            self._build_networks()
        
        return float(np.dot(state, self.value_weights)[0])
    
    def remember(self, state: np.ndarray, action: int, log_prob: float,
                 reward: float, value: float, done: bool):
        """
        Store experience.
        
        Args:
            state: Current state
            action: Action taken
            log_prob: Log probability of action
            reward: Reward received
            value: State value
            done: Episode done flag
        """
        self.memory.append((state, action, log_prob, reward, value, done))
    
    def train(self, env: TradingEnv, episodes: int = 1000,
              prices: np.ndarray = None, features: np.ndarray = None) -> Dict:
        """
        Train agent in environment.
        
        Args:
            env: Trading environment
            episodes: Number of training episodes
            prices: Price data for environment reset
            features: Optional feature data for environment reset
        
        Returns:
            Training history dictionary
        """
        if self.policy_weights is None:
            self._build_networks()
        
        history = {
            'episode_rewards': [],
            'episode_lengths': [],
            'total_trades': []
        }
        
        for episode in range(episodes):
            state = env.reset(prices, features) if prices is not None else env.reset()
            total_reward = 0
            done = False
            steps = 0
            info = {}
            
            while not done:
                action, log_prob = self.get_action(state)
                value = self.get_value(state)
                
                next_state, reward, done, info = env.step(action)
                
                self.remember(state, action, log_prob, reward, value, done)
                
                # PPO update (simplified)
                if len(self.memory) >= self.config.batch_size:
                    self._update_policy()
                
                state = next_state
                total_reward += reward
                steps += 1
            
            history['episode_rewards'].append(total_reward)
            history['episode_lengths'].append(steps)
            history['total_trades'].append(info.get('trade_count', 0))
        
        self.is_trained = True
        return history
    
    def _update_policy(self):
        """Update policy using PPO with ratio clipping."""
        batch_size = min(len(self.memory), self.config.batch_size)
        batch = list(self.memory)[-batch_size:]

        states = np.array([e[0] for e in batch])
        actions = np.array([e[1] for e in batch])
        old_log_probs = np.array([e[2] for e in batch])
        rewards = np.array([e[3] for e in batch])

        # Calculate advantages (simplified: use returns minus baseline)
        advantages = rewards - np.mean(rewards)
        advantages = advantages / (np.std(advantages) + 1e-8)

        # PPO update with ratio clipping
        learning_rate = self.config.learning_rate
        clip_eps = 0.2

        for i in range(batch_size):
            # Compute current log_prob
            logits = np.dot(states[i], self.policy_weights)
            exp_logits = np.exp(logits - np.max(logits))
            probs = exp_logits / np.sum(exp_logits)
            new_log_prob = np.log(probs[actions[i]] + 1e-10)

            # PPO ratio
            ratio = np.exp(new_log_prob - old_log_probs[i])
            clipped_ratio = np.clip(ratio, 1 - clip_eps, 1 + clip_eps)

            # Clipped surrogate objective
            surrogate = min(ratio * advantages[i], clipped_ratio * advantages[i])

            # Policy gradient update
            gradient = states[i] * surrogate
            self.policy_weights[:, actions[i]] += learning_rate * gradient
    
    def save_model(self, filepath: str):
        """
        Save model to file.
        
        Args:
            filepath: Path to save model
        """
        model_data = {
            'config': self.config,
            'policy_weights': self.policy_weights,
            'value_weights': self.value_weights,
            'is_trained': self.is_trained
        }
        
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
    
    def load_model(self, filepath: str):
        """
        Load model from file.
        
        Args:
            filepath: Path to load model from
        """
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)
        
        self.config = model_data['config']
        self.policy_weights = model_data['policy_weights']
        self.value_weights = model_data['value_weights']
        self.is_trained = model_data['is_trained']
