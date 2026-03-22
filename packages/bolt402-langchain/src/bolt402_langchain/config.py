"""Configuration helpers for creating bolt402 clients.

Provides ``create_l402_client()`` as a convenient factory function for
LangChain users who want a quick-start setup without learning the full
bolt402 API.
"""

from __future__ import annotations

from typing import Any, Optional, Union

from bolt402 import Budget, L402Client, MockL402Server, create_mock_client


def create_l402_client(
    *,
    backend: str = "mock",
    endpoints: Optional[dict[str, int]] = None,
    budget: Optional[Union[Budget, dict[str, Any]]] = None,
    max_fee_sats: int = 100,
) -> tuple[L402Client, Optional[MockL402Server]]:
    """Create a configured L402 client for use with LangChain tools.

    Factory function that simplifies client creation. Currently supports
    the mock backend for testing and development. Real Lightning backends
    (LND, CLN, NWC, SwissKnife) will be added as the ``bolt402`` Python
    bindings gain support for them.

    Args:
        backend: Lightning backend type. Currently only ``"mock"`` is
            supported.
        endpoints: Map of endpoint paths to prices in satoshis. Required
            when ``backend="mock"``.
        budget: Spending limits. Can be a ``Budget`` instance or a dict
            with keys ``per_request_max``, ``hourly_max``, ``daily_max``,
            ``total_max``.
        max_fee_sats: Maximum routing fee in satoshis per payment.

    Returns:
        A tuple of ``(client, server)``. For mock backend, ``server`` is
        the running ``MockL402Server``. For real backends (future),
        ``server`` will be ``None``.

    Raises:
        ValueError: If the backend is not supported or required parameters
            are missing.

    Example::

        from bolt402_langchain import create_l402_client

        client, server = create_l402_client(
            backend="mock",
            endpoints={"/api/data": 100, "/api/premium": 500},
            budget={"per_request_max": 200, "daily_max": 5000},
        )
    """
    resolved_budget = _resolve_budget(budget)

    if backend == "mock":
        if not endpoints:
            raise ValueError(
                "endpoints dict is required for mock backend. "
                "Example: endpoints={'/api/data': 100}"
            )
        client, server = create_mock_client(
            endpoints,
            budget=resolved_budget,
            max_fee_sats=max_fee_sats,
        )
        return client, server

    raise ValueError(
        f"Unsupported backend: {backend!r}. "
        f"Currently supported: 'mock'. "
        f"Real backends (LND, CLN, NWC) coming soon."
    )


def _resolve_budget(
    budget: Optional[Union[Budget, dict[str, Any]]],
) -> Optional[Budget]:
    """Convert a budget dict to a Budget instance, or pass through."""
    if budget is None:
        return None
    if isinstance(budget, Budget):
        return budget
    if isinstance(budget, dict):
        return Budget(
            per_request_max=budget.get("per_request_max"),
            hourly_max=budget.get("hourly_max"),
            daily_max=budget.get("daily_max"),
            total_max=budget.get("total_max"),
        )
    raise TypeError(
        f"budget must be a Budget instance or dict, got {type(budget).__name__}"
    )
