"""
Model registry with versioning, A/B testing, and rollback support.

Tracks ML models (LSTM, Transformer, RL agents) with:
- Version management (semver)
- Performance metrics per version
- A/B testing between model versions
- Automatic rollback on performance degradation
- Model metadata (training data, hyperparams, metrics)

Usage:
    from src.ml.model_registry import ModelRegistry

    registry = ModelRegistry(storage_dir="models/registry")

    # Register a new model
    registry.register(
        name="lstm_btc_1m",
        version="1.2.0",
        path="models/lstm_btc_v1.2.0.onnx",
        metrics={"accuracy": 0.62, "sharpe": 1.8, "max_drawdown": -0.12},
        metadata={"lookback": 60, "features": 11, "epochs": 50},
    )

    # Get best model for production
    model = registry.get_production_model("lstm_btc_1m")

    # A/B test
    registry.set_ab_test("lstm_btc_1m", control="1.1.0", treatment="1.2.0", traffic_split=0.3)
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class ModelStatus(Enum):
    CANDIDATE = "candidate"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"
    ROLLED_BACK = "rolled_back"


@dataclass
class ModelVersion:
    name: str
    version: str
    path: str
    status: ModelStatus = ModelStatus.CANDIDATE
    metrics: dict[str, float] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    registered_at: float = field(default_factory=time.time)
    promoted_at: float | None = None
    ab_impressions: int = 0
    ab_successes: int = 0


@dataclass
class ABTest:
    model_name: str
    control_version: str
    treatment_version: str
    traffic_split: float  # 0.0 to 1.0 (fraction to treatment)
    started_at: float = field(default_factory=time.time)
    control_impressions: int = 0
    control_successes: int = 0
    treatment_impressions: int = 0
    treatment_successes: int = 0
    active: bool = True


class ModelRegistry:
    """Model registry with file-based persistence."""

    def __init__(self, storage_dir: str = "models/registry"):
        self.storage_dir = storage_dir
        self.index_path = os.path.join(storage_dir, "registry.json")
        self.models: dict[str, dict[str, ModelVersion]] = {}
        self.ab_tests: dict[str, ABTest] = {}
        self._load()

    def _load(self) -> None:
        if not os.path.exists(self.index_path):
            return
        try:
            with open(self.index_path) as f:
                data = json.load(f)
            for name, versions in data.get("models", {}).items():
                self.models[name] = {}
                for ver, vdata in versions.items():
                    vdata["status"] = ModelStatus(vdata["status"])
                    self.models[name][ver] = ModelVersion(**vdata)
            for name, ab_data in data.get("ab_tests", {}).items():
                self.ab_tests[name] = ABTest(**ab_data)
        except Exception as e:
            logger.warning(f"[ModelRegistry] Failed to load: {e}")

    def _save(self) -> None:
        os.makedirs(self.storage_dir, exist_ok=True)
        data = {
            "models": {
                name: {
                    ver: {**asdict(v), "status": v.status.value}
                    for ver, v in versions.items()
                }
                for name, versions in self.models.items()
            },
            "ab_tests": {name: asdict(ab) for name, ab in self.ab_tests.items()},
        }
        with open(self.index_path, "w") as f:
            json.dump(data, f, indent=2)

    def register(
        self,
        name: str,
        version: str,
        path: str,
        metrics: dict[str, float] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ModelVersion:
        """Register a new model version."""
        if name not in self.models:
            self.models[name] = {}

        if version in self.models[name]:
            logger.warning(f"[ModelRegistry] Overwriting {name}@{version}")

        mv = ModelVersion(
            name=name,
            version=version,
            path=path,
            metrics=metrics or {},
            metadata=metadata or {},
        )
        self.models[name][version] = mv
        self._save()
        logger.info(f"[ModelRegistry] Registered {name}@{version} (metrics: {metrics})")
        return mv

    def get(self, name: str, version: str) -> ModelVersion | None:
        return self.models.get(name, {}).get(version)

    def get_production_model(self, name: str) -> ModelVersion | None:
        """Get the current production model."""
        versions = self.models.get(name, {})
        for mv in versions.values():
            if mv.status == ModelStatus.PRODUCTION:
                return mv
        return None

    def promote(self, name: str, version: str, to_status: ModelStatus) -> bool:
        """Promote a model to a new status."""
        mv = self.get(name, version)
        if not mv:
            return False

        if to_status == ModelStatus.PRODUCTION:
            # Demote current production model
            current = self.get_production_model(name)
            if current and current.version != version:
                current.status = ModelStatus.ARCHIVED
                logger.info(f"[ModelRegistry] Archived {name}@{current.version}")

        mv.status = to_status
        mv.promoted_at = time.time()
        self._save()
        logger.info(f"[ModelRegistry] Promoted {name}@{version} → {to_status.value}")
        return True

    def rollback(self, name: str) -> ModelVersion | None:
        """Rollback to the previous production model."""
        versions = list(self.models.get(name, {}).values())
        prod_models = [v for v in versions if v.status == ModelStatus.ARCHIVED]
        if not prod_models:
            logger.warning(f"[ModelRegistry] No model to rollback for {name}")
            return None

        # Get most recently archived
        prod_models.sort(key=lambda v: v.promoted_at or 0, reverse=True)
        previous = prod_models[0]

        current = self.get_production_model(name)
        if current:
            current.status = ModelStatus.ROLLED_BACK

        previous.status = ModelStatus.PRODUCTION
        self._save()
        logger.info(f"[ModelRegistry] Rolled back {name} to @{previous.version}")
        return previous

    def list_versions(self, name: str) -> list[ModelVersion]:
        """List all versions of a model."""
        return list(self.models.get(name, {}).values())

    def set_ab_test(
        self,
        name: str,
        control_version: str,
        treatment_version: str,
        traffic_split: float = 0.5,
    ) -> ABTest:
        """Set up an A/B test between two model versions."""
        if not self.get(name, control_version) or not self.get(name, treatment_version):
            raise ValueError("Model versions not found")

        ab = ABTest(
            model_name=name,
            control_version=control_version,
            treatment_version=treatment_version,
            traffic_split=traffic_split,
        )
        self.ab_tests[name] = ab
        self._save()
        logger.info(
            f"[ModelRegistry] A/B test: {name} control={control_version} "
            f"treatment={treatment_version} split={traffic_split}"
        )
        return ab

    def select_ab_model(self, name: str) -> str:
        """Select which model version to use based on A/B test traffic split."""
        ab = self.ab_tests.get(name)
        if not ab or not ab.active:
            prod = self.get_production_model(name)
            return prod.version if prod else ""

        import random
        if random.random() < ab.traffic_split:
            ab.treatment_impressions += 1
            return ab.treatment_version
        else:
            ab.control_impressions += 1
            return ab.control_version

    def record_ab_outcome(self, name: str, version: str, success: bool) -> None:
        """Record A/B test outcome."""
        ab = self.ab_tests.get(name)
        if not ab:
            return
        if version == ab.control_version and success:
            ab.control_successes += 1
        elif version == ab.treatment_version and success:
            ab.treatment_successes += 1
        self._save()

    def get_ab_results(self, name: str) -> dict | None:
        """Get A/B test results."""
        ab = self.ab_tests.get(name)
        if not ab:
            return None
        control_rate = ab.control_successes / max(ab.control_impressions, 1)
        treatment_rate = ab.treatment_successes / max(ab.treatment_impressions, 1)
        return {
            "control": {
                "version": ab.control_version,
                "impressions": ab.control_impressions,
                "successes": ab.control_successes,
                "success_rate": round(control_rate, 4),
            },
            "treatment": {
                "version": ab.treatment_version,
                "impressions": ab.treatment_impressions,
                "successes": ab.treatment_successes,
                "success_rate": round(treatment_rate, 4),
            },
            "uplift": round(treatment_rate - control_rate, 4),
            "recommendation": "promote_treatment" if treatment_rate > control_rate * 1.05 else "keep_control",
        }

    def stop_ab_test(self, name: str, promote_winner: bool = True) -> None:
        """Stop A/B test and optionally promote the winner."""
        ab = self.ab_tests.get(name)
        if not ab:
            return
        ab.active = False

        if promote_winner:
            results = self.get_ab_results(name)
            if results and results["recommendation"] == "promote_treatment":
                self.promote(name, ab.treatment_version, ModelStatus.PRODUCTION)
            else:
                self.promote(name, ab.control_version, ModelStatus.PRODUCTION)

        self._save()
