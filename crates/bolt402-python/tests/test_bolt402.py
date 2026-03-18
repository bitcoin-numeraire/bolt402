"""Tests for bolt402 Python bindings.

Run with: pytest tests/test_bolt402.py -v
Requires: pip install bolt402 (or maturin develop)
"""

import json

import bolt402
from bolt402 import Budget, L402Client, MockL402Server, Receipt, create_mock_client


class TestBudget:
    """Tests for the Budget class."""

    def test_unlimited(self):
        budget = Budget.unlimited()
        assert repr(budget) == "Budget(per_request_max=None, hourly_max=None, daily_max=None, total_max=None)"

    def test_with_limits(self):
        budget = Budget(
            per_request_max=100,
            hourly_max=1000,
            daily_max=5000,
            total_max=50000,
        )
        assert "per_request_max=100" in repr(budget)
        assert "total_max=50000" in repr(budget)

    def test_partial_limits(self):
        budget = Budget(per_request_max=100)
        assert "per_request_max=100" in repr(budget)
        assert "hourly_max=None" in repr(budget)


class TestMockServer:
    """Tests for the MockL402Server."""

    def test_create_server(self):
        server = MockL402Server(endpoints={"/api/data": 100})
        assert server.url.startswith("http://127.0.0.1:")
        assert "MockL402Server" in repr(server)


class TestCreateMockClient:
    """Tests for the create_mock_client convenience function."""

    def test_basic(self):
        client, server = create_mock_client({"/api/data": 100})
        assert server.url.startswith("http://127.0.0.1:")
        assert repr(client) == "L402Client(...)"


class TestL402Flow:
    """End-to-end tests for the L402 payment flow using mock infrastructure."""

    def test_get_with_payment(self):
        """Test that GET requests automatically handle L402 challenges."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        assert response.status == 200
        assert response.paid is True
        assert response.receipt is not None
        assert response.receipt.amount_sats == 100
        assert response.receipt.fee_sats == 0
        assert response.receipt.response_status == 200
        assert response.receipt.total_cost_sats() == 100

    def test_get_not_found(self):
        """Test that non-existent endpoints return 404 without payment."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/nonexistent")

        assert response.status == 404
        assert response.paid is False
        assert response.receipt is None

    def test_response_body(self):
        """Test that response body is accessible after payment."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        body = response.text()
        assert "ok" in body
        assert "true" in body

    def test_response_json(self):
        """Test JSON parsing of response body."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        data = response.json()
        assert data["ok"] is True
        assert data["price"] == 100

    def test_receipts_accumulate(self):
        """Test that receipts are recorded across multiple requests."""
        client, server = create_mock_client({
            "/api/a": 100,
            "/api/b": 200,
        })

        client.get(f"{server.url}/api/a")
        client.get(f"{server.url}/api/b")

        receipts = client.receipts()
        assert len(receipts) == 2
        assert receipts[0].amount_sats == 100
        assert receipts[1].amount_sats == 200

    def test_total_spent(self):
        """Test total spending tracker."""
        client, server = create_mock_client({
            "/api/a": 100,
            "/api/b": 200,
        })

        assert client.total_spent() == 0
        client.get(f"{server.url}/api/a")
        assert client.total_spent() == 100
        client.get(f"{server.url}/api/b")
        assert client.total_spent() == 300

    def test_token_caching(self):
        """Test that tokens are cached and reused on subsequent requests."""
        client, server = create_mock_client({"/api/data": 100})

        # First request: should pay
        r1 = client.get(f"{server.url}/api/data")
        assert r1.paid is True

        # Second request: should use cached token (no payment)
        r2 = client.get(f"{server.url}/api/data")
        assert r2.paid is False
        assert r2.status == 200

        # Only one receipt (one payment)
        assert len(client.receipts()) == 1

    def test_budget_enforcement(self):
        """Test that budget limits are enforced."""
        budget = Budget(per_request_max=50)
        client, server = create_mock_client(
            {"/api/expensive": 100},
            budget=budget,
        )

        try:
            client.get(f"{server.url}/api/expensive")
            assert False, "Should have raised an error"
        except ValueError as e:
            assert "BudgetExceeded" in str(e)

    def test_budget_allows_cheap_request(self):
        """Test that requests within budget succeed."""
        budget = Budget(per_request_max=200)
        client, server = create_mock_client(
            {"/api/cheap": 100},
            budget=budget,
        )

        response = client.get(f"{server.url}/api/cheap")
        assert response.status == 200
        assert response.paid is True


class TestReceipt:
    """Tests for the Receipt class."""

    def test_receipt_properties(self):
        """Test all receipt properties are accessible."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        receipt = response.receipt
        assert receipt.timestamp > 0
        assert receipt.endpoint.endswith("/api/data")
        assert receipt.amount_sats == 100
        assert receipt.fee_sats == 0
        assert len(receipt.payment_hash) > 0
        assert len(receipt.preimage) > 0
        assert receipt.response_status == 200
        assert receipt.latency_ms >= 0

    def test_receipt_to_json(self):
        """Test receipt JSON serialization."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        receipt_json = response.receipt.to_json()
        data = json.loads(receipt_json)
        assert data["amount_sats"] == 100
        assert "endpoint" in data
        assert "payment_hash" in data

    def test_receipt_repr(self):
        """Test receipt string representation."""
        client, server = create_mock_client({"/api/data": 100})
        response = client.get(f"{server.url}/api/data")

        repr_str = repr(response.receipt)
        assert "Receipt(" in repr_str
        assert "amount_sats=100" in repr_str


class TestVersion:
    """Test module metadata."""

    def test_version(self):
        assert bolt402.__version__ == "0.1.0"
