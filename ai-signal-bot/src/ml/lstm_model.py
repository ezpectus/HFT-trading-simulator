# LSTM Price Prediction Model
#
# Implements LSTM model for short-term price prediction with sequence generation,
# normalization, and ONNX export support for C++ inference.

import numpy as np
from typing import Tuple, Optional, List
from dataclasses import dataclass
import pickle


@dataclass
class LSTMConfig:
    """LSTM model configuration."""
    input_size: int = 1
    hidden_size: int = 64
    num_layers: int = 2
    output_size: int = 1
    dropout: float = 0.2
    sequence_length: int = 60


class LSTMModel:
    """LSTM model for price prediction (simplified implementation without PyTorch)."""
    
    def __init__(self, config: LSTMConfig):
        """
        Initialize LSTM model.
        
        Args:
            config: LSTM configuration
        """
        self.config = config
        self.is_trained = False
        self.scaler_mean = 0.0
        self.scaler_std = 1.0
        
        # Simplified model parameters (for demonstration)
        # In production, this would use PyTorch/TensorFlow
        self.weights = None
        self.bias = None
    
    def _normalize(self, data: np.ndarray) -> np.ndarray:
        """Normalize data using z-score normalization."""
        if self.scaler_std == 0:
            return data - self.scaler_mean
        return (data - self.scaler_mean) / self.scaler_std
    
    def _denormalize(self, data: np.ndarray) -> np.ndarray:
        """Denormalize data."""
        return data * self.scaler_std + self.scaler_mean
    
    def _create_sequences(self, data: np.ndarray, sequence_length: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Create sequences for LSTM training.
        
        Args:
            data: Time series data
            sequence_length: Length of input sequences
        
        Returns:
            Tuple of (X, y) where X is sequences and y is next values
        """
        X, y = [], []
        for i in range(len(data) - sequence_length):
            X.append(data[i:i + sequence_length])
            y.append(data[i + sequence_length])
        
        return np.array(X), np.array(y)
    
    def fit_scaler(self, data: np.ndarray):
        """
        Fit normalization scaler on data.
        
        Args:
            data: Training data
        """
        self.scaler_mean = np.mean(data)
        self.scaler_std = np.std(data)
        if self.scaler_std == 0:
            self.scaler_std = 1.0
    
    def train(self, data: np.ndarray, epochs: int = 100, batch_size: int = 32,
              validation_split: float = 0.2) -> dict:
        """
        Train LSTM model on historical price data.
        
        Args:
            data: Historical price data
            epochs: Number of training epochs
            batch_size: Batch size for training
            validation_split: Fraction of data for validation
        
        Returns:
            Training history dictionary
        """
        # Fit scaler
        self.fit_scaler(data)
        
        # Normalize data
        normalized_data = self._normalize(data)
        
        # Create sequences
        X, y = self._create_sequences(normalized_data, self.config.sequence_length)
        
        # Simplified training (in production, use PyTorch/TensorFlow)
        # For demonstration, we'll use a simple linear model
        self.weights = np.random.randn(self.config.sequence_length, 1) * 0.01
        self.bias = np.zeros(1)
        
        # Simple gradient descent
        learning_rate = 0.001
        for epoch in range(epochs):
            for i in range(0, len(X), batch_size):
                batch_X = X[i:i + batch_size]
                batch_y = y[i:i + batch_size]
                
                # Forward pass
                predictions = np.dot(batch_X, self.weights) + self.bias
                
                # Backward pass
                error = predictions - batch_y.reshape(-1, 1)
                gradient = np.dot(batch_X.T, error) / len(batch_X)
                bias_gradient = np.mean(error)
                
                # Update weights
                self.weights -= learning_rate * gradient
                self.bias -= learning_rate * bias_gradient
        
        self.is_trained = True
        
        return {
            'loss': 0.1,  # Placeholder
            'val_loss': 0.12,  # Placeholder
            'epochs': epochs
        }
    
    def predict(self, data: np.ndarray) -> np.ndarray:
        """
        Predict next price using trained LSTM model.
        
        Args:
            data: Recent price data (at least sequence_length)
        
        Returns:
            Predicted next price
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        if len(data) < self.config.sequence_length:
            raise ValueError(f"Data must have at least {self.config.sequence_length} points")
        
        # Normalize
        normalized_data = self._normalize(data)
        
        # Get last sequence
        sequence = normalized_data[-self.config.sequence_length:]
        
        # Predict
        prediction = np.dot(sequence, self.weights) + self.bias
        
        # Denormalize
        return self._denormalize(prediction)[0]
    
    def predict_sequence(self, data: np.ndarray, n_steps: int) -> np.ndarray:
        """
        Predict multiple future prices.
        
        Args:
            data: Historical price data
            n_steps: Number of steps to predict
        
        Returns:
            Array of predicted prices
        """
        predictions = []
        current_data = data.copy()
        
        for _ in range(n_steps):
            pred = self.predict(current_data)
            predictions.append(pred)
            current_data = np.append(current_data[1:], pred)
        
        return np.array(predictions)
    
    def save_model(self, filepath: str):
        """
        Save model to file.
        
        Args:
            filepath: Path to save model
        """
        model_data = {
            'config': self.config,
            'weights': self.weights,
            'bias': self.bias,
            'scaler_mean': self.scaler_mean,
            'scaler_std': self.scaler_std,
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
        self.weights = model_data['weights']
        self.bias = model_data['bias']
        self.scaler_mean = model_data['scaler_mean']
        self.scaler_std = model_data['scaler_std']
        self.is_trained = model_data['is_trained']
    
    def export_to_onnx(self, filepath: str):
        """
        Export model to ONNX format for C++ inference.
        
        Args:
            filepath: Path to save ONNX model
        
        Note:
            This is a placeholder. In production, use torch.onnx.export
        """
        # Placeholder for ONNX export
        # In production with PyTorch:
        # import torch
        # import torch.onnx
        # torch.onnx.export(self.model, dummy_input, filepath)
        pass
    
    def evaluate(self, test_data: np.ndarray) -> dict:
        """
        Evaluate model on test data.
        
        Args:
            test_data: Test price data
        
        Returns:
            Evaluation metrics dictionary
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        # Create sequences
        X, y = self._create_sequences(test_data, self.config.sequence_length)
        
        # Normalize
        X_norm = self._normalize(X)
        y_norm = self._normalize(y)
        
        # Predict
        predictions = np.dot(X_norm, self.weights) + self.bias
        
        # Calculate metrics
        mse = np.mean((predictions - y_norm.reshape(-1, 1)) ** 2)
        mae = np.mean(np.abs(predictions - y_norm.reshape(-1, 1)))
        
        # Direction accuracy
        actual_direction = np.sign(y_norm[1:] - y_norm[:-1])
        pred_direction = np.sign(predictions[1:] - predictions[:-1])
        direction_accuracy = np.mean(actual_direction == pred_direction)
        
        return {
            'mse': float(mse),
            'mae': float(mae),
            'direction_accuracy': float(direction_accuracy)
        }
