"""bolt402: L402 client SDK for AI agent frameworks.

Pay for APIs with Lightning. Built in Rust, available in Python.

Quick start::

    from bolt402 import create_mock_client

    client, server = create_mock_client({"/api/data": 100})
    response = client.get(f"{server.url}/api/data")
    print(response.status)  # 200
    print(response.paid)    # True

Classes:
    L402Client: Main client for L402-aware HTTP requests.
    Budget: Budget configuration for spending limits.
    Receipt: Payment receipt for audit and cost analysis.
    L402Response: Response from an L402-aware request.
    MockL402Server: Mock server for testing.

Functions:
    create_mock_client: Create a connected client+server pair for testing.
"""

from bolt402._bolt402 import (
    Budget,
    L402Client,
    L402Response,
    MockL402Server,
    Receipt,
    create_mock_client,
)

__all__ = [
    "Budget",
    "L402Client",
    "L402Response",
    "MockL402Server",
    "Receipt",
    "create_mock_client",
]

__version__ = "0.1.0"
