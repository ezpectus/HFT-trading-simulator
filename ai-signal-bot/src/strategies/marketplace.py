"""
Strategy marketplace — plugin system for loading and sharing strategies.

Strategies are defined as Python modules with a standard interface.
Can be loaded from:
  - Local filesystem (src/strategies/)
  - Git repositories (clone + install)
  - Compressed archives (.tar.gz, .zip)
  - JSON/YAML configuration files

Each strategy plugin must implement:
  - name: str
  - version: str
  - description: str
  - generate_signals(candles, indicators) -> List[Signal]
  - get_config() -> StrategyConfig

Usage:
    from src.strategies.marketplace import StrategyMarketplace

    market = StrategyMarketplace()
    market.install_from_git("https://github.com/user/my-strategy")
    strategies = market.list_installed()
    strategy = market.load("my-strategy")
"""

from __future__ import annotations

import importlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class StrategyPlugin:
    name: str
    version: str
    description: str
    author: str
    module_path: str
    config: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    min_capital: float = 0.0
    risk_level: str = "medium"  # low, medium, high
    enabled: bool = True


class StrategyMarketplace:
    """Strategy plugin marketplace and loader."""

    def __init__(
        self,
        strategies_dir: str = "src/strategies",
        registry_path: str = "config/strategy_registry.json",
    ):
        self.strategies_dir = Path(strategies_dir)
        self.registry_path = Path(registry_path)
        self.plugins: dict[str, StrategyPlugin] = {}
        self._loaded: dict[str, Any] = {}
        self._load_registry()

    def _load_registry(self) -> None:
        if not self.registry_path.exists():
            return
        try:
            with open(self.registry_path) as f:
                data = json.load(f)
            for name, pdata in data.get("strategies", {}).items():
                self.plugins[name] = StrategyPlugin(**pdata)
        except Exception as e:
            logger.warning(f"[Marketplace] Failed to load registry: {e}")

    def _save_registry(self) -> None:
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "strategies": {
                name: {
                    "name": p.name, "version": p.version,
                    "description": p.description, "author": p.author,
                    "module_path": p.module_path, "config": p.config,
                    "tags": p.tags, "min_capital": p.min_capital,
                    "risk_level": p.risk_level, "enabled": p.enabled,
                }
                for name, p in self.plugins.items()
            }
        }
        with open(self.registry_path, "w") as f:
            json.dump(data, f, indent=2)

    def register(self, plugin: StrategyPlugin) -> None:
        """Register a strategy plugin."""
        self.plugins[plugin.name] = plugin
        self._save_registry()
        logger.info(f"[Marketplace] Registered: {plugin.name} v{plugin.version}")

    def unregister(self, name: str) -> bool:
        """Remove a strategy from the registry."""
        if name in self.plugins:
            del self.plugins[name]
            self._save_registry()
            logger.info(f"[Marketplace] Unregistered: {name}")
            return True
        return False

    def list_installed(self) -> list[StrategyPlugin]:
        """List all installed strategy plugins."""
        return list(self.plugins.values())

    def list_available_tags(self) -> list[str]:
        """List all unique tags."""
        tags: set = set()
        for p in self.plugins.values():
            tags.update(p.tags)
        return sorted(tags)

    def search(self, tag: str | None = None, risk_level: str | None = None) -> list[StrategyPlugin]:
        """Search strategies by tag or risk level."""
        results = []
        for p in self.plugins.values():
            if tag and tag not in p.tags:
                continue
            if risk_level and p.risk_level != risk_level:
                continue
            results.append(p)
        return results

    def load(self, name: str) -> Any | None:
        """Load and instantiate a strategy by name."""
        if name in self._loaded:
            return self._loaded[name]

        plugin = self.plugins.get(name)
        if not plugin:
            logger.error(f"[Marketplace] Strategy not found: {name}")
            return None

        try:
            module = importlib.import_module(plugin.module_path)
            strategy_class = getattr(module, plugin.name, None)
            if not strategy_class:
                strategy_class = getattr(module, "Strategy", None)
            if not strategy_class:
                logger.error(f"[Marketplace] No strategy class in {plugin.module_path}")
                return None

            instance = strategy_class(**plugin.config) if plugin.config else strategy_class()
            self._loaded[name] = instance
            logger.info(f"[Marketplace] Loaded: {name}")
            return instance
        except Exception as e:
            logger.error(f"[Marketplace] Failed to load {name}: {e}")
            return None

    def install_from_file(self, path: str, name: str | None = None) -> bool:
        """Install a strategy from a Python file."""
        p = Path(path)
        if not p.exists() or not p.suffix == ".py":
            logger.error(f"[Marketplace] Invalid file: {path}")
            return False

        target = self.strategies_dir / (name or p.stem)
        target.mkdir(parents=True, exist_ok=True)

        import shutil
        shutil.copy2(p, target / "__init__.py")

        plugin = StrategyPlugin(
            name=name or p.stem,
            version="1.0.0",
            description=f"Installed from {p.name}",
            author="local",
            module_path=f"src.strategies.{name or p.stem}",
        )
        self.register(plugin)
        return True

    def install_from_git(self, git_url: str, name: str | None = None) -> bool:
        """Clone a strategy from a git repository."""
        import re
        import subprocess

        if not git_url.startswith(("https://", "git://")) or ".." in git_url:
            logger.error(f"[Marketplace] Rejected URL (must be https:// or git://): {git_url}")
            return False

        repo_name = name or git_url.rstrip("/").split("/")[-1].replace(".git", "")
        if not re.match(r'^[a-zA-Z0-9_\-]+$', repo_name):
            logger.error(f"[Marketplace] Invalid repo name: {repo_name}")
            return False

        target = self.strategies_dir / repo_name

        if target.exists():
            logger.warning(f"[Marketplace] {repo_name} already exists")
            return False

        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", git_url, str(target)],
                check=True, capture_output=True, timeout=30,
            )
            plugin = StrategyPlugin(
                name=repo_name,
                version="1.0.0",
                description=f"Installed from {git_url}",
                author=git_url,
                module_path=f"src.strategies.{repo_name}",
            )
            self.register(plugin)
            return True
        except Exception as e:
            logger.error(f"[Marketplace] Git install failed: {e}")
            return False

    def enable(self, name: str) -> bool:
        """Enable a strategy."""
        if name in self.plugins:
            self.plugins[name].enabled = True
            self._save_registry()
            return True
        return False

    def disable(self, name: str) -> bool:
        """Disable a strategy."""
        if name in self.plugins:
            self.plugins[name].enabled = False
            self._save_registry()
            return True
        return False

    def get_config(self, name: str) -> dict | None:
        """Get strategy configuration."""
        plugin = self.plugins.get(name)
        return plugin.config if plugin else None

    def update_config(self, name: str, config: dict) -> bool:
        """Update strategy configuration."""
        if name in self.plugins:
            self.plugins[name].config.update(config)
            self._save_registry()
            return True
        return False
