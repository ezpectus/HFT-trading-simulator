"""
Feature store for reusable ML features across strategies.

Uses Redis as the online feature store for low-latency feature serving.
Features are computed once and shared across all strategies that need them.

Features:
  - Technical indicators (RSI, EMA, ATR, MACD, Bollinger Bands)
  - Market microstructure (OBI, spread, depth ratio)
  - Price-derived (returns, volatility, momentum)
  - Cross-asset (correlation, beta, spread)

Usage:
    from src.ml.feature_store import FeatureStore

    fs = FeatureStore(redis_host="localhost")

    # Compute and store features
    fs.update_features("BTC/USDT", {
        "rsi_14": 65.3,
        "ema_fast": 65100.5,
        "atr_14": 120.0,
        "return_1m": 0.0012,
        "volatility_5m": 0.0008,
    })

    # Retrieve features for inference
    features = fs.get_features("BTC/USDT", ["rsi_14", "ema_fast", "atr_14"])

    # Batch get for multiple symbols
    batch = fs.get_features_batch(["BTC/USDT", "ETH/USDT"], ["rsi_14", "return_1m"])
"""

from __future__ import annotations

import json
import time
import logging
from typing import Optional, Dict, Any, List, Set
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("[FeatureStore] redis not installed — run: pip install redis")


class FeatureStore:
    """
    Redis-backed online feature store.

    Features are stored as Redis hashes:
        Key: features:{symbol}
        Fields: feature_name → JSON-encoded value + timestamp

    Feature definitions are stored in a separate set for discovery.
    """

    FEATURE_PREFIX = "features:"
    FEATURE_REGISTRY_KEY = "feature_registry"
    FEATURE_TTL = 3600  # 1 hour

    def __init__(
        self,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 0,
        redis_password: Optional[str] = None,
        ttl: int = FEATURE_TTL,
    ):
        self.ttl = ttl
        self._redis: Optional[object] = None

        if not REDIS_AVAILABLE:
            logger.warning("[FeatureStore] Redis not available — using in-memory fallback")
            self._memory: Dict[str, Dict[str, Any]] = {}
            return

        try:
            self._redis = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
            )
            self._redis.ping()
            logger.info(f"[FeatureStore] Connected to Redis {redis_host}:{redis_port}")
        except Exception as e:
            logger.warning(f"[FeatureStore] Redis connection failed: {e} — using in-memory")
            self._redis = None
            self._memory = {}

    def update_features(self, symbol: str, features: Dict[str, Any]) -> int:
        """Update features for a symbol. Returns number of features set."""
        timestamp = time.time()

        if self._redis:
            key = f"{self.FEATURE_PREFIX}{symbol}"
            pipe = self._redis.pipeline()
            for name, value in features.items():
                entry = json.dumps({"value": value, "timestamp": timestamp})
                pipe.hset(key, name, entry)
                pipe.sadd(self.FEATURE_REGISTRY_KEY, name)
            pipe.expire(key, self.ttl)
            pipe.execute()
        else:
            if symbol not in self._memory:
                self._memory[symbol] = {}
            for name, value in features.items():
                self._memory[symbol][name] = {"value": value, "timestamp": timestamp}

        return len(features)

    def get_features(self, symbol: str, feature_names: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get features for a symbol. If feature_names is None, get all."""
        if self._redis:
            key = f"{self.FEATURE_PREFIX}{symbol}"
            if feature_names:
                raw = self._redis.hmget(key, feature_names)
                result = {}
                for name, data in zip(feature_names, raw):
                    if data:
                        entry = json.loads(data)
                        result[name] = entry["value"]
                return result
            else:
                raw = self._redis.hgetall(key)
                return {k: json.loads(v)["value"] for k, v in raw.items()}
        else:
            data = self._memory.get(symbol, {})
            if feature_names:
                return {n: data[n]["value"] for n in feature_names if n in data}
            return {k: v["value"] for k, v in data.items()}

    def get_features_batch(
        self, symbols: List[str], feature_names: Optional[List[str]] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Get features for multiple symbols."""
        result = {}
        for symbol in symbols:
            result[symbol] = self.get_features(symbol, feature_names)
        return result

    def get_feature_vector(
        self, symbol: str, feature_names: List[str], fill_missing: float = 0.0
    ) -> List[float]:
        """Get features as an ordered vector for ML inference."""
        features = self.get_features(symbol, feature_names)
        return [float(features.get(name, fill_missing)) for name in feature_names]

    def get_feature_matrix(
        self, symbols: List[str], feature_names: List[str], fill_missing: float = 0.0
    ) -> List[List[float]]:
        """Get features as a matrix (symbols × features) for batch ML inference."""
        batch = self.get_features_batch(symbols, feature_names)
        return [
            [float(batch[s].get(name, fill_missing)) for name in feature_names]
            for s in symbols
        ]

    def list_features(self) -> Set[str]:
        """List all registered feature names."""
        if self._redis:
            return set(self._redis.smembers(self.FEATURE_REGISTRY_KEY))
        else:
            features: set = set()
            for data in self._memory.values():
                features.update(data.keys())
            return features

    def list_symbols(self) -> List[str]:
        """List all symbols with features."""
        if self._redis:
            keys = self._redis.keys(f"{self.FEATURE_PREFIX}*")
            return [k.replace(self.FEATURE_PREFIX, "") for k in keys]
        else:
            return list(self._memory.keys())

    def delete_features(self, symbol: str) -> int:
        """Delete all features for a symbol."""
        if self._redis:
            return self._redis.delete(f"{self.FEATURE_PREFIX}{symbol}")
        else:
            return self._memory.pop(symbol, None) is not None

    def get_feature_age(self, symbol: str, feature_name: str) -> Optional[float]:
        """Get age of a feature in seconds (time since last update)."""
        if self._redis:
            data = self._redis.hget(f"{self.FEATURE_PREFIX}{symbol}", feature_name)
            if data:
                return time.time() - json.loads(data)["timestamp"]
        else:
            data = self._memory.get(symbol, {}).get(feature_name)
            if data:
                return time.time() - data["timestamp"]
        return None

    def is_healthy(self) -> bool:
        """Check if the feature store is accessible."""
        if self._redis:
            try:
                return self._redis.ping()
            except Exception:
                return False
        return True  # in-memory always works
