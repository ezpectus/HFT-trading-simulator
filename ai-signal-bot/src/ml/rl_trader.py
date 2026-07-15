"""
Reinforcement Learning trader using PPO (Proximal Policy Optimization).

Trains an agent on the exchange simulator to learn optimal trading policy.
Agent observes market state and outputs action: {hold, buy, sell, close}.

Architecture:
  - Actor: MLP → action probabilities (softmax)
  - Critic: MLP → state value estimate
  - PPO clip objective with GAE (Generalized Advantage Estimation)

Training:
  python train_rl.py --algo ppo --episodes 10000 --symbol BTC/USDT
  python train_rl.py --algo dqn --episodes 10000 --symbol BTC/USDT

Export:
  Actor network exported to ONNX for C++ inference.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import logging
from typing import Tuple, List, Optional
from dataclasses import dataclass
from collections import deque
import random

logger = logging.getLogger(__name__)

# Actions: 0=hold, 1=buy, 2=sell, 3=close_position
NUM_ACTIONS = 4


@dataclass
class RLConfig:
    state_dim: int = 20  # market features
    hidden_dim: int = 256
    lr_actor: float = 3e-4
    lr_critic: float = 1e-3
    gamma: float = 0.99  # discount factor
    gae_lambda: float = 0.95
    clip_eps: float = 0.2
    ppo_epochs: int = 10
    batch_size: int = 64
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    max_grad_norm: float = 0.5
    # DQN
    dqn_lr: float = 1e-4
    dqn_buffer_size: int = 100000
    dqn_batch_size: int = 64
    dqn_target_update: int = 1000
    dqn_epsilon_start: float = 1.0
    dqn_epsilon_end: float = 0.01
    dqn_epsilon_decay: float = 0.995


# ── PPO ──

class ActorCritic(nn.Module):
    """Actor-Critic network for PPO."""

    def __init__(self, state_dim: int, hidden_dim: int):
        super().__init__()

        # Shared feature extractor
        self.features = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )

        # Actor head
        self.actor = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, NUM_ACTIONS),
        )

        # Critic head
        self.critic = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, state: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        feats = self.features(state)
        logits = self.actor(feats)
        value = self.critic(feats)
        return F.softmax(logits, dim=-1), value

    def get_action(self, state: torch.Tensor) -> Tuple[int, float, float]:
        probs, value = self.forward(state.unsqueeze(0))
        dist = torch.distributions.Categorical(probs)
        action = dist.sample()
        log_prob = dist.log_prob(action)
        return action.item(), log_prob.item(), value.item()


class PPOAgent:
    """Proximal Policy Optimization agent."""

    def __init__(self, config: RLConfig, device: str = "cpu"):
        self.config = config
        self.device = torch.device(device)
        self.ac = ActorCritic(config.state_dim, config.hidden_dim).to(self.device)
        self.optimizer = torch.optim.Adam([
            {"params": self.ac.features.parameters(), "lr": config.lr_actor},
            {"params": self.ac.actor.parameters(), "lr": config.lr_actor},
            {"params": self.ac.critic.parameters(), "lr": config.lr_critic},
        ])
        self.reset_buffer()

    def reset_buffer(self) -> None:
        self.states: List[torch.Tensor] = []
        self.actions: List[int] = []
        self.log_probs: List[float] = []
        self.rewards: List[float] = []
        self.values: List[float] = []
        self.dones: List[bool] = []

    def select_action(self, state: np.ndarray) -> int:
        state_t = torch.FloatTensor(state).to(self.device)
        action, log_prob, value = self.ac.get_action(state_t)
        self.states.append(state_t)
        self.actions.append(action)
        self.log_probs.append(log_prob)
        self.values.append(value)
        return action

    def store_reward(self, reward: float, done: bool) -> None:
        self.rewards.append(reward)
        self.dones.append(done)

    def update(self) -> dict:
        if len(self.states) < self.config.batch_size:
            return {}

        states = torch.stack(self.states).to(self.device)
        actions = torch.LongTensor(self.actions).to(self.device)
        old_log_probs = torch.FloatTensor(self.log_probs).to(self.device)
        rewards = torch.FloatTensor(self.rewards).to(self.device)
        values = torch.FloatTensor(self.values).to(self.device)
        dones = torch.FloatTensor(self.dones).to(self.device)

        # Compute GAE
        advantages = torch.zeros_like(rewards)
        returns = torch.zeros_like(rewards)
        gae = 0.0
        for t in reversed(range(len(rewards))):
            if t == len(rewards) - 1:
                next_value = 0.0
            else:
                next_value = values[t + 1]
            delta = rewards[t] + self.config.gamma * next_value * (1 - dones[t]) - values[t]
            gae = delta + self.config.gamma * self.config.gae_lambda * (1 - dones[t]) * gae
            advantages[t] = gae
            returns[t] = advantages[t] + values[t]

        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update
        metrics = {"policy_loss": 0, "value_loss": 0, "entropy": 0}
        n_updates = 0

        for _ in range(self.config.ppo_epochs):
            idx = torch.randperm(len(states))
            for i in range(0, len(states), self.config.batch_size):
                batch_idx = idx[i:i + self.config.batch_size]
                if len(batch_idx) < 4:
                    continue

                probs, value = self.ac(states[batch_idx])
                dist = torch.distributions.Categorical(probs)
                log_probs = dist.log_prob(actions[batch_idx])
                entropy = dist.entropy().mean()

                ratio = torch.exp(log_probs - old_log_probs[batch_idx])
                surr1 = ratio * advantages[batch_idx]
                surr2 = torch.clamp(ratio, 1 - self.config.clip_eps, 1 + self.config.clip_eps) * advantages[batch_idx]
                policy_loss = -torch.min(surr1, surr2).mean()

                value_loss = F.mse_loss(value.squeeze(), returns[batch_idx])

                loss = policy_loss + self.config.value_coef * value_loss - self.config.entropy_coef * entropy

                self.optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.ac.parameters(), self.config.max_grad_norm)
                self.optimizer.step()

                metrics["policy_loss"] += policy_loss.item()
                metrics["value_loss"] += value_loss.item()
                metrics["entropy"] += entropy.item()
                n_updates += 1

        for k in metrics:
            metrics[k] /= max(n_updates, 1)

        self.reset_buffer()
        return metrics


# ── DQN ──

class QNetwork(nn.Module):
    """Q-Network for DQN."""

    def __init__(self, state_dim: int, hidden_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, NUM_ACTIONS),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class DQNAgent:
    """Deep Q-Network agent with experience replay."""

    def __init__(self, config: RLConfig, device: str = "cpu"):
        self.config = config
        self.device = torch.device(device)
        self.q_net = QNetwork(config.state_dim, config.hidden_dim).to(self.device)
        self.target_net = QNetwork(config.state_dim, config.hidden_dim).to(self.device)
        self.target_net.load_state_dict(self.q_net.state_dict())
        self.optimizer = torch.optim.Adam(self.q_net.parameters(), lr=config.dqn_lr)
        self.buffer = deque(maxlen=config.dqn_buffer_size)
        self.epsilon = config.dqn_epsilon_start
        self.step_count = 0

    def select_action(self, state: np.ndarray) -> int:
        if random.random() < self.epsilon:
            return random.randint(0, NUM_ACTIONS - 1)
        with torch.no_grad():
            q_values = self.q_net(torch.FloatTensor(state).unsqueeze(0).to(self.device))
            return q_values.argmax(dim=1).item()

    def store(self, state, action, reward, next_state, done) -> None:
        self.buffer.append((state, action, reward, next_state, done))

    def update(self) -> dict:
        if len(self.buffer) < self.config.dqn_batch_size:
            return {}

        batch = random.sample(self.buffer, self.config.dqn_batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        states = torch.FloatTensor(np.array(states)).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(np.array(next_states)).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)

        q_values = self.q_net(states).gather(1, actions.unsqueeze(1)).squeeze()
        with torch.no_grad():
            next_q = self.target_net(next_states).max(dim=1)[0]
            target = rewards + self.config.gamma * next_q * (1 - dones)

        loss = F.mse_loss(q_values, target)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_net.parameters(), self.config.max_grad_norm)
        self.optimizer.step()

        self.step_count += 1
        if self.step_count % self.config.dqn_target_update == 0:
            self.target_net.load_state_dict(self.q_net.state_dict())

        self.epsilon = max(self.config.dqn_epsilon_end, self.epsilon * self.config.dqn_epsilon_decay)

        return {"q_loss": loss.item(), "epsilon": self.epsilon}


def export_rl_onnx(agent, config: RLConfig, output_path: str, algo: str = "ppo") -> bool:
    """Export RL agent policy to ONNX."""
    try:
        if algo == "ppo":
            model = agent.ac.features
            dummy = torch.randn(1, config.state_dim)
            torch.onnx.export(
                agent.ac, dummy, output_path,
                export_params=True, opset_version=17,
                input_names=["state"], output_names=["probs", "value"],
                dynamic_axes={"state": {0: "batch"}, "probs": {0: "batch"}, "value": {0: "batch"}},
            )
        else:
            dummy = torch.randn(1, config.state_dim)
            torch.onnx.export(
                agent.q_net, dummy, output_path,
                export_params=True, opset_version=17,
                input_names=["state"], output_names=["q_values"],
                dynamic_axes={"state": {0: "batch"}, "q_values": {0: "batch"}},
            )
        logger.info(f"[RL] Exported {algo} policy to {output_path}")
        return True
    except Exception as e:
        logger.error(f"[RL] Export failed: {e}")
        return False
