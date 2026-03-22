"""Tests for L402FetchTool and L402BudgetTool."""

import json

from bolt402_langchain import L402BudgetTool, L402FetchTool


class TestL402FetchTool:
    """Tests for the L402FetchTool LangChain tool."""

    def test_get_with_payment(self, mock_setup):
        """GET request triggers L402 payment and returns data."""
        tool = L402FetchTool(client=mock_setup["client"])
        result = tool.invoke(f"{mock_setup['server'].url}/api/weather")

        assert "[Paid 50 sats" in result
        assert "status 200" in result

    def test_get_not_found(self, mock_setup):
        """GET to non-existent endpoint returns 404 without payment."""
        tool = L402FetchTool(client=mock_setup["client"])
        result = tool.invoke(f"{mock_setup['server'].url}/nonexistent")

        assert "No payment" in result
        assert "status 404" in result

    def test_get_with_cached_token(self, mock_setup):
        """Second GET to same endpoint uses cached token (no payment)."""
        tool = L402FetchTool(client=mock_setup["client"])

        # First request: should pay
        r1 = tool.invoke(f"{mock_setup['server'].url}/api/weather")
        assert "[Paid 50 sats" in r1

        # Second request: should use cache
        r2 = tool.invoke(f"{mock_setup['server'].url}/api/weather")
        assert "No payment" in r2
        assert "status 200" in r2

    def test_budget_exceeded(self, budget_mock_setup):
        """Request exceeding budget returns error string (no exception)."""
        tool = L402FetchTool(client=budget_mock_setup["client"])
        result = tool.invoke(
            f"{budget_mock_setup['server'].url}/api/expensive"
        )

        assert "Payment error" in result
        assert "BudgetExceeded" in result

    def test_post_with_json_input(self, mock_setup):
        """POST request via JSON input format."""
        tool = L402FetchTool(client=mock_setup["client"])
        input_data = json.dumps({
            "url": f"{mock_setup['server'].url}/api/market-data",
            "body": json.dumps({"query": "BTC"}),
        })
        result = tool.invoke(input_data)

        assert "[Paid 200 sats" in result
        assert "status 200" in result

    def test_post_with_dict_body(self, mock_setup):
        """POST with body as dict in JSON input (auto-serialized)."""
        tool = L402FetchTool(client=mock_setup["client"])
        input_data = json.dumps({
            "url": f"{mock_setup['server'].url}/api/weather",
            "body": {"query": "forecast"},
        })
        result = tool.invoke(input_data)

        assert "status 200" in result

    def test_tool_metadata(self):
        """Tool has correct name and description for LangChain."""
        from bolt402 import create_mock_client

        client, _ = create_mock_client({"/test": 10})
        tool = L402FetchTool(client=client)

        assert tool.name == "l402_fetch"
        assert "L402" in tool.description
        assert "Lightning" in tool.description

    def test_multiple_endpoints(self, mock_setup):
        """Fetching different endpoints records separate payments."""
        tool = L402FetchTool(client=mock_setup["client"])

        r1 = tool.invoke(f"{mock_setup['server'].url}/api/weather")
        r2 = tool.invoke(f"{mock_setup['server'].url}/api/market-data")

        assert "[Paid 50 sats" in r1
        assert "[Paid 200 sats" in r2


class TestL402BudgetTool:
    """Tests for the L402BudgetTool LangChain tool."""

    def test_no_payments(self, mock_setup):
        """Reports zero spending when no payments made."""
        tool = L402BudgetTool(client=mock_setup["client"])
        result = tool.invoke("")

        assert "No payments made yet" in result
        assert "0 sats" in result

    def test_after_payments(self, mock_setup):
        """Reports correct spending after payments."""
        client = mock_setup["client"]
        server_url = mock_setup["server"].url

        # Make some payments via fetch tool
        fetch = L402FetchTool(client=client)
        fetch.invoke(f"{server_url}/api/weather")
        fetch.invoke(f"{server_url}/api/market-data")

        # Check budget
        budget_tool = L402BudgetTool(client=client)
        result = budget_tool.invoke("")

        assert "Total spent: 250 sats" in result
        assert "2 payment(s)" in result
        assert "/api/weather" in result
        assert "/api/market-data" in result

    def test_tool_metadata(self):
        """Tool has correct name and description."""
        from bolt402 import create_mock_client

        client, _ = create_mock_client({"/test": 10})
        tool = L402BudgetTool(client=client)

        assert tool.name == "l402_check_budget"
        assert "spent" in tool.description.lower()

    def test_includes_fee_info(self, mock_setup):
        """Receipt breakdown includes fee information."""
        client = mock_setup["client"]
        fetch = L402FetchTool(client=client)
        fetch.invoke(f"{mock_setup['server'].url}/api/weather")

        budget_tool = L402BudgetTool(client=client)
        result = budget_tool.invoke("")

        assert "50 sats" in result
        assert "fee" in result
