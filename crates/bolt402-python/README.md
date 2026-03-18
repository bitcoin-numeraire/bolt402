# bolt402 — Python SDK

L402 client SDK for AI agent frameworks. Pay for APIs with Lightning.

Built in Rust via [PyO3](https://pyo3.rs), this package gives Python AI frameworks native Lightning payment capabilities for [L402](https://docs.lightning.engineering/the-lightning-network/l402)-gated APIs.

## Installation

```bash
pip install bolt402
```

## Quick Start

```python
from bolt402 import create_mock_client, Budget

# Create a test environment (mock server + connected client)
client, server = create_mock_client(
    endpoints={"/api/data": 100},  # 100 sats per request
    budget=Budget(daily_max=5000),
)

# Make an L402-aware request
response = client.get(f"{server.url}/api/data")
print(response.status)  # 200
print(response.paid)    # True
print(response.receipt.amount_sats)  # 100

# Budget tracking
print(client.total_spent())  # 100
print(client.receipts())     # [Receipt(...)]
```

## API Reference

### `L402Client`

Main client for L402-aware HTTP requests.

```python
client = L402Client(
    backend="mock",
    budget=Budget(per_request_max=100),
    max_fee_sats=100,
    mock_server_url="http://localhost:8080",
)

response = client.get("http://localhost:8080/api/data")
response = client.post("http://localhost:8080/api/data", body='{"key": "value"}')
```

### `Budget`

Budget configuration for spending limits.

```python
budget = Budget(
    per_request_max=100,   # Max sats per request
    hourly_max=1000,       # Max sats per hour
    daily_max=5000,        # Max sats per day
    total_max=50000,       # Max sats total
)

# Or no limits
budget = Budget.unlimited()
```

### `L402Response`

Response from an L402-aware request.

```python
response.status      # HTTP status code (int)
response.paid        # Whether a payment was made (bool)
response.receipt     # Payment receipt or None
response.text()      # Response body as string
response.json()      # Response body parsed as JSON
response.headers     # Response headers (dict)
```

### `Receipt`

Payment receipt for audit and cost analysis.

```python
receipt.timestamp        # Unix timestamp (seconds)
receipt.endpoint         # URL accessed
receipt.amount_sats      # Amount paid (sats)
receipt.fee_sats         # Routing fee (sats)
receipt.payment_hash     # Payment hash (hex)
receipt.preimage         # Preimage (hex)
receipt.response_status  # HTTP status after payment
receipt.latency_ms       # Total latency
receipt.total_cost_sats()  # amount + fee
receipt.to_json()        # JSON serialization
```

### `MockL402Server`

Mock server for testing without real Lightning infrastructure.

```python
server = MockL402Server(endpoints={"/api/data": 100})
print(server.url)  # http://127.0.0.1:XXXXX
```

### `create_mock_client()`

Convenience function that creates a connected client + server pair.

```python
client, server = create_mock_client(
    endpoints={"/api/data": 100},
    budget=Budget(daily_max=5000),
    max_fee_sats=100,
)
```

## Development

```bash
# Build and install locally
cd crates/bolt402-python
maturin develop

# Run tests
pytest tests/ -v

# Build wheels
maturin build --release
```

## License

MIT OR Apache-2.0
