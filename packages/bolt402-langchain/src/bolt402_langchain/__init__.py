"""bolt402-langchain: LangChain integration for L402 Lightning payments.

Provides LangChain tools that enable AI agents to autonomously pay for
L402-gated APIs using Lightning Network payments via bolt402.

Quick start::

    from bolt402 import create_mock_client
    from bolt402_langchain import L402FetchTool, L402BudgetTool

    client, server = create_mock_client({"/api/data": 100})
    fetch = L402FetchTool(client=client)
    result = fetch.invoke(f"{server.url}/api/data")

Classes:
    L402FetchTool: LangChain tool for L402-aware HTTP requests.
    L402BudgetTool: LangChain tool for spending monitoring.
    PaymentCallbackHandler: LangChain callback for payment events.

Functions:
    create_l402_client: Factory for creating configured L402 clients.
"""

from bolt402_langchain.callbacks import PaymentCallbackHandler
from bolt402_langchain.config import create_l402_client
from bolt402_langchain.tools import L402BudgetTool, L402FetchTool

__all__ = [
    "L402FetchTool",
    "L402BudgetTool",
    "PaymentCallbackHandler",
    "create_l402_client",
]

__version__ = "0.1.0"
