"""Tests for strategies/marketplace.py — StrategyPlugin, StrategyMarketplace."""
import json
import os
import tempfile

import pytest

from src.strategies.marketplace import StrategyMarketplace, StrategyPlugin


@pytest.fixture
def tmp_registry():
    with tempfile.TemporaryDirectory() as tmpdir:
        registry = os.path.join(tmpdir, "registry.json")
        yield registry


@pytest.fixture
def marketplace(tmp_registry):
    return StrategyMarketplace(registry_path=tmp_registry)


def make_plugin(name="test_strategy", **kwargs):
    defaults = dict(
        name=name,
        version="1.0.0",
        description="Test strategy",
        author="test",
        module_path="src.strategies.test_strategy",
    )
    defaults.update(kwargs)
    return StrategyPlugin(**defaults)


class TestStrategyPlugin:
    def test_defaults(self):
        p = make_plugin()
        assert p.name == "test_strategy"
        assert p.version == "1.0.0"
        assert p.config == {}
        assert p.tags == []
        assert p.min_capital == 0.0
        assert p.risk_level == "medium"
        assert p.enabled is True


class TestStrategyMarketplaceInit:
    def test_empty_registry(self, marketplace):
        assert len(marketplace.plugins) == 0
        assert len(marketplace.list_installed()) == 0

    def test_load_existing_registry(self, tmp_registry):
        data = {
            "strategies": {
                "my_strategy": {
                    "name": "my_strategy",
                    "version": "2.0.0",
                    "description": "Loaded from registry",
                    "author": "test",
                    "module_path": "src.strategies.my_strategy",
                    "config": {"param": 1},
                    "tags": ["trend"],
                    "min_capital": 1000.0,
                    "risk_level": "high",
                    "enabled": True,
                }
            }
        }
        with open(tmp_registry, "w", encoding="utf-8") as f:
            json.dump(data, f)
        m = StrategyMarketplace(registry_path=tmp_registry)
        assert "my_strategy" in m.plugins
        assert m.plugins["my_strategy"].version == "2.0.0"

    def test_no_registry_file(self, tmp_registry):
        m = StrategyMarketplace(registry_path=tmp_registry)
        assert len(m.plugins) == 0


class TestRegister:
    def test_register(self, marketplace):
        p = make_plugin()
        marketplace.register(p)
        assert "test_strategy" in marketplace.plugins
        assert len(marketplace.list_installed()) == 1

    def test_register_saves_to_file(self, marketplace, tmp_registry):
        marketplace.register(make_plugin())
        with open(tmp_registry) as f:
            data = json.load(f)
        assert "test_strategy" in data["strategies"]


class TestUnregister:
    def test_unregister_existing(self, marketplace):
        marketplace.register(make_plugin())
        result = marketplace.unregister("test_strategy")
        assert result is True
        assert "test_strategy" not in marketplace.plugins

    def test_unregister_nonexistent(self, marketplace):
        result = marketplace.unregister("nonexistent")
        assert result is False


class TestListAndSearch:
    def test_list_installed(self, marketplace):
        marketplace.register(make_plugin("s1"))
        marketplace.register(make_plugin("s2"))
        installed = marketplace.list_installed()
        assert len(installed) == 2

    def test_list_available_tags(self, marketplace):
        marketplace.register(make_plugin("s1", tags=["trend", "momentum"]))
        marketplace.register(make_plugin("s2", tags=["trend", "mean_reversion"]))
        tags = marketplace.list_available_tags()
        assert "trend" in tags
        assert "momentum" in tags
        assert "mean_reversion" in tags

    def test_search_by_tag(self, marketplace):
        marketplace.register(make_plugin("s1", tags=["trend"]))
        marketplace.register(make_plugin("s2", tags=["mean_reversion"]))
        results = marketplace.search(tag="trend")
        assert len(results) == 1
        assert results[0].name == "s1"

    def test_search_by_risk_level(self, marketplace):
        marketplace.register(make_plugin("s1", risk_level="high"))
        marketplace.register(make_plugin("s2", risk_level="low"))
        results = marketplace.search(risk_level="high")
        assert len(results) == 1
        assert results[0].name == "s1"

    def test_search_no_filters(self, marketplace):
        marketplace.register(make_plugin("s1"))
        marketplace.register(make_plugin("s2"))
        results = marketplace.search()
        assert len(results) == 2


class TestEnableDisable:
    def test_enable(self, marketplace):
        marketplace.register(make_plugin())
        marketplace.plugins["test_strategy"].enabled = False
        result = marketplace.enable("test_strategy")
        assert result is True
        assert marketplace.plugins["test_strategy"].enabled is True

    def test_enable_nonexistent(self, marketplace):
        result = marketplace.enable("nonexistent")
        assert result is False

    def test_disable(self, marketplace):
        marketplace.register(make_plugin())
        result = marketplace.disable("test_strategy")
        assert result is True
        assert marketplace.plugins["test_strategy"].enabled is False

    def test_disable_nonexistent(self, marketplace):
        result = marketplace.disable("nonexistent")
        assert result is False


class TestConfig:
    def test_get_config(self, marketplace):
        marketplace.register(make_plugin(config={"param": 42}))
        config = marketplace.get_config("test_strategy")
        assert config["param"] == 42

    def test_get_config_nonexistent(self, marketplace):
        config = marketplace.get_config("nonexistent")
        assert config is None

    def test_update_config(self, marketplace):
        marketplace.register(make_plugin(config={"param": 1}))
        result = marketplace.update_config("test_strategy", {"param": 2, "new": 3})
        assert result is True
        assert marketplace.plugins["test_strategy"].config["param"] == 2
        assert marketplace.plugins["test_strategy"].config["new"] == 3

    def test_update_config_nonexistent(self, marketplace):
        result = marketplace.update_config("nonexistent", {})
        assert result is False


class TestLoad:
    def test_load_nonexistent(self, marketplace):
        result = marketplace.load("nonexistent")
        assert result is None

    def test_load_caches(self, marketplace):
        marketplace.register(make_plugin())
        marketplace._loaded["test_strategy"] = "cached_instance"
        result = marketplace.load("test_strategy")
        assert result == "cached_instance"
