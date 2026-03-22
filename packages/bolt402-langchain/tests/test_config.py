"""Tests for the create_l402_client factory function."""

import pytest

from bolt402 import Budget, MockL402Server

from bolt402_langchain import create_l402_client


class TestCreateL402Client:
    """Tests for the create_l402_client factory."""

    def test_mock_backend(self):
        """Mock backend creates a working client and server."""
        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/data": 100},
        )

        assert server is not None
        assert isinstance(server, MockL402Server)
        assert server.url.startswith("http://127.0.0.1:")

        # Client works
        response = client.get(f"{server.url}/api/data")
        assert response.status == 200
        assert response.paid is True

    def test_mock_with_dict_budget(self):
        """Dict budget is converted to Budget instance."""
        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/data": 100},
            budget={"per_request_max": 200, "daily_max": 1000},
        )

        # Should succeed (within budget)
        response = client.get(f"{server.url}/api/data")
        assert response.status == 200

    def test_mock_with_budget_instance(self):
        """Budget instance is passed through directly."""
        budget = Budget(per_request_max=200)
        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/data": 100},
            budget=budget,
        )

        response = client.get(f"{server.url}/api/data")
        assert response.status == 200

    def test_mock_budget_enforcement(self):
        """Budget limits are enforced via factory-created client."""
        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/expensive": 500},
            budget={"per_request_max": 100},
        )

        with pytest.raises(ValueError, match="BudgetExceeded"):
            client.get(f"{server.url}/api/expensive")

    def test_mock_no_endpoints_raises(self):
        """Missing endpoints raises ValueError."""
        with pytest.raises(ValueError, match="endpoints"):
            create_l402_client(backend="mock")

    def test_unsupported_backend_raises(self):
        """Unsupported backend raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported backend"):
            create_l402_client(
                backend="lnd",
                endpoints={"/api/data": 100},
            )

    def test_invalid_budget_type_raises(self):
        """Non-dict, non-Budget budget raises TypeError."""
        with pytest.raises(TypeError, match="budget must be"):
            create_l402_client(
                backend="mock",
                endpoints={"/api/data": 100},
                budget="invalid",  # type: ignore[arg-type]
            )

    def test_no_budget_defaults_to_unlimited(self):
        """No budget means unlimited spending."""
        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/data": 100},
        )

        # Should work without budget limits
        response = client.get(f"{server.url}/api/data")
        assert response.status == 200
        assert response.paid is True
