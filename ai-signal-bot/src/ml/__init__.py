# Machine Learning Package
#
# Contains ML modules for price prediction, signal generation, reinforcement learning,
# and feature store for the AI signal bot.
#
# Note: lstm_model.py, transformer_model.py, and rl_agent.py were removed.
# Real PyTorch implementations live in price_predictor.py (LSTM/Transformer)
# and rl_trader.py (PPO). Use those instead.

from .autoencoder import (
    AutoencoderModel,
    AutoencoderResult,
    autoencoder_analysis,
    autoencoder_signal,
    detect_anomalies,
    extract_ae_features,
    standardize as ae_standardize,
    train_autoencoder,
)
from .environment import TradingEnv
from .feature_store import FeatureStore
from .rkhs import (
    RKHSResult,
    center_kernel,
    compute_mmd,
    jacobi_eig,
    kernel_matrix,
    kernel_ridge_regression,
    laplacian_kernel,
    predict_krr,
    rbf_kernel,
    rkhs_analysis,
    rkhs_signal,
)
from .svm_signal import (
    SVMResult,
    extract_svm_features,
    linear_svm,
    predict as svm_predict,
    standardize as svm_standardize,
)
from .vae import (
    VAE,
    VAEResult,
    vae_analysis,
    vae_signal,
)

__all__ = [
    'TradingEnv',
    'FeatureStore',
    'SVMResult',
    'linear_svm',
    'svm_predict',
    'extract_svm_features',
    'svm_standardize',
    'AutoencoderModel',
    'AutoencoderResult',
    'train_autoencoder',
    'autoencoder_analysis',
    'autoencoder_signal',
    'detect_anomalies',
    'extract_ae_features',
    'ae_standardize',
    'VAE',
    'VAEResult',
    'vae_analysis',
    'vae_signal',
    'RKHSResult',
    'rkhs_analysis',
    'rkhs_signal',
    'rbf_kernel',
    'laplacian_kernel',
    'kernel_matrix',
    'center_kernel',
    'jacobi_eig',
    'compute_mmd',
    'kernel_ridge_regression',
    'predict_krr',
]
