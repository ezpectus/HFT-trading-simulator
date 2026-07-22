"""
LSTM/Transformer price prediction model.

PyTorch model for short-term price movement prediction.
Exports to ONNX for C++ inference (via onnx_engine.h).

Architecture:
  - Input: last N candles (OHLCV) + technical indicators
  - LSTM layer: 128 hidden units, 2 layers
  - Attention: multi-head self-attention (optional)
  - Output: predicted return for next M candles (regression) or
            direction probability (buy/sell/hold classification)

Training:
  python train.py --model lstm --symbol BTC/USDT --interval 1m --lookback 60
  python train.py --model transformer --symbol BTC/USDT --interval 1m --lookback 60

Export to ONNX:
  python export_onnx.py --model-path checkpoints/lstm_best.pt --output models/lstm_btc.onnx
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

logger = logging.getLogger(__name__)


@dataclass
class ModelConfig:
    """Configuration for price prediction model."""
    model_type: str = "lstm"  # lstm | transformer
    input_dim: int = 11  # OHLCV + RSI + EMA_fast + EMA_slow + ATR + volume_ratio + return
    hidden_dim: int = 128
    num_layers: int = 2
    num_heads: int = 4  # for transformer
    dropout: float = 0.1
    output_dim: int = 3  # buy / sell / hold (classification)
    lookback: int = 60  # number of candles to look back
    horizon: int = 5  # predict N candles ahead
    learning_rate: float = 1e-3
    weight_decay: float = 1e-5
    batch_size: int = 64
    epochs: int = 50
    early_stop_patience: int = 10


class LSTMPredictor(nn.Module):
    """LSTM-based price movement predictor."""

    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config

        self.lstm = nn.LSTM(
            input_size=config.input_dim,
            hidden_size=config.hidden_dim,
            num_layers=config.num_layers,
            batch_first=True,
            dropout=config.dropout if config.num_layers > 1 else 0,
        )

        self.attention = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.Tanh(),
            nn.Linear(config.hidden_dim, 1),
            nn.Softmax(dim=1),
        )

        self.classifier = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(config.dropout),
            nn.Linear(config.hidden_dim // 2, config.output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_dim)
        lstm_out, _ = self.lstm(x)  # (batch, seq_len, hidden_dim)

        # Attention over LSTM outputs
        attn_weights = self.attention(lstm_out)  # (batch, seq_len, 1)
        context = (lstm_out * attn_weights).sum(dim=1)  # (batch, hidden_dim)

        logits = self.classifier(context)  # (batch, output_dim)
        return logits


class TransformerPredictor(nn.Module):
    """Transformer-based price movement predictor."""

    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config

        self.input_proj = nn.Linear(config.input_dim, config.hidden_dim)
        self.pos_encoding = PositionalEncoding(config.hidden_dim, config.dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=config.hidden_dim,
            nhead=config.num_heads,
            dim_feedforward=config.hidden_dim * 4,
            dropout=config.dropout,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=config.num_layers)

        self.classifier = nn.Sequential(
            nn.LayerNorm(config.hidden_dim),
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.GELU(),
            nn.Dropout(config.dropout),
            nn.Linear(config.hidden_dim // 2, config.output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)  # (batch, seq_len, hidden_dim)
        x = self.pos_encoding(x)
        x = self.transformer(x)
        # Use last token for prediction
        x = x[:, -1, :]  # (batch, hidden_dim)
        return self.classifier(x)


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding."""

    def __init__(self, d_model: int, dropout: float = 0.1, max_len: int = 500):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term[:pe[:, 1::2].size(1)])
        self.register_buffer("pe", pe.unsqueeze(0))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.pe[:, :x.size(1)]
        return self.dropout(x)


class PriceDataset(Dataset):
    """Dataset for price prediction from candle + indicator features."""

    def __init__(self, features: np.ndarray, labels: np.ndarray, lookback: int):
        self.features = features
        self.labels = labels
        self.lookback = lookback

    def __len__(self) -> int:
        return len(self.features) - self.lookback

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        x = self.features[idx:idx + self.lookback]
        y = self.labels[idx + self.lookback]
        return torch.FloatTensor(x), torch.LongTensor([y])


def create_model(config: ModelConfig) -> nn.Module:
    """Create model based on config."""
    if config.model_type == "lstm":
        return LSTMPredictor(config)
    elif config.model_type == "transformer":
        return TransformerPredictor(config)
    else:
        raise ValueError(f"Unknown model type: {config.model_type}")


def train_model(
    config: ModelConfig,
    train_features: np.ndarray,
    train_labels: np.ndarray,
    val_features: np.ndarray,
    val_labels: np.ndarray,
    device: str = "cpu",
) -> tuple[nn.Module, dict]:
    """Train price prediction model."""
    device = torch.device(device if torch.cuda.is_available() else "cpu")
    model = create_model(config).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay
    )
    criterion = nn.CrossEntropyLoss()

    train_ds = PriceDataset(train_features, train_labels, config.lookback)
    val_ds = PriceDataset(val_features, val_labels, config.lookback)
    train_loader = DataLoader(train_ds, batch_size=config.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=config.batch_size, shuffle=False)

    best_val_loss = float("inf")
    patience_counter = 0
    best_state = {k: v.clone() for k, v in model.state_dict().items()}
    history = {"train_loss": [], "val_loss": [], "val_acc": []}

    for epoch in range(config.epochs):
        model.train()
        train_loss = 0.0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device).squeeze()
            optimizer.zero_grad()
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        model.eval()
        val_loss = 0.0
        correct = 0
        total = 0
        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x, batch_y = batch_x.to(device), batch_y.to(device).squeeze()
                logits = model(batch_x)
                loss = criterion(logits, batch_y)
                val_loss += loss.item()
                preds = logits.argmax(dim=1)
                correct += (preds == batch_y).sum().item()
                total += batch_y.size(0)

        val_loss /= len(val_loader)
        val_acc = correct / total if total > 0 else 0

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["val_acc"].append(val_acc)

        logger.info(
            f"Epoch {epoch+1}/{config.epochs} — "
            f"train_loss={train_loss:.4f} val_loss={val_loss:.4f} val_acc={val_acc:.2%}"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= config.early_stop_patience:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break

    model.load_state_dict(best_state)
    return model, history


def export_onnx(model: nn.Module, config: ModelConfig, output_path: str) -> bool:
    """Export trained model to ONNX format for C++ inference."""
    model.eval()
    dummy_input = torch.randn(1, config.lookback, config.input_dim)

    try:
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=17,
            do_constant_folding=True,
            input_names=["features"],
            output_names=["logits"],
            dynamic_axes={
                "features": {0: "batch"},
                "logits": {0: "batch"},
            },
        )
        logger.info(f"[ONNX] Exported to {output_path}")
        return True
    except Exception as e:
        logger.error(f"[ONNX] Export failed: {e}")
        return False
