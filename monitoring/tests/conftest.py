import pytest
from prometheus_client import REGISTRY


@pytest.fixture(autouse=True)
def clean_prometheus_registry():
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except (KeyError, AttributeError):
            pass
    yield
    collectors = list(REGISTRY._collector_to_names.keys())
    for collector in collectors:
        try:
            REGISTRY.unregister(collector)
        except (KeyError, AttributeError):
            pass
