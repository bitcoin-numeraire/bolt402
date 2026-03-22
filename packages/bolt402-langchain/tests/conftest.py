"""Shared test fixtures for bolt402-langchain tests."""

import pytest

from bolt402 import Budget, create_mock_client


@pytest.fixture()
def mock_setup():
    """Create a mock client and server with standard test endpoints.

    Returns a dict with:
        client: L402Client connected to mock backend
        server: MockL402Server with test endpoints
        endpoints: Dict of endpoint paths to prices
    """
    endpoints = {
        "/api/weather": 50,
        "/api/market-data": 200,
        "/api/premium": 1000,
    }
    client, server = create_mock_client(endpoints)
    return {
        "client": client,
        "server": server,
        "endpoints": endpoints,
    }


@pytest.fixture()
def budget_mock_setup():
    """Create a mock client with budget limits.

    Budget: 500 sats per request, 2000 sats daily.
    """
    endpoints = {
        "/api/cheap": 50,
        "/api/mid": 200,
        "/api/expensive": 1000,
    }
    budget = Budget(per_request_max=500, daily_max=2000)
    client, server = create_mock_client(endpoints, budget=budget)
    return {
        "client": client,
        "server": server,
        "endpoints": endpoints,
    }
