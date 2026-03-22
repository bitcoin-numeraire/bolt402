# Design Doc 058: Multi-Backend Failover

**Issue:** #58
**Author:** Toshi
**Date:** 2026-03-22

## Problem

Production deployments need resilience. If an LND node goes down, an AI agent's payments stop entirely. With bolt402's hexagonal architecture, users can swap backends, but there's no built-in way to compose multiple backends with automatic failover.

## Proposed Design

Add a `FailoverBackend` adapter in `bolt402-core` that wraps multiple `LnBackend` implementations and tries them in order. This lives in the core crate because it composes the existing `LnBackend` port — it's an adapter that wraps other adapters.

### Module Structure

```
crates/bolt402-core/src/
├── failover.rs          # FailoverBackend implementation
├── failover/
│   └── health.rs        # HealthTracker (circuit breaker)
```

### API

```rust
use bolt402_core::failover::{FailoverBackend, FailoverConfig};

let failover = FailoverBackend::builder()
    .add_backend(lnd_backend)
    .add_backend(cln_backend)
    .add_backend(nwc_backend)
    .config(FailoverConfig {
        health_check_interval: Duration::from_secs(60),
        failure_threshold: 3,
        recovery_timeout: Duration::from_secs(300),
    })
    .build();

let client = L402Client::builder()
    .ln_backend(failover)
    .token_store(InMemoryTokenStore::default())
    .budget(Budget::unlimited())
    .build()
    .unwrap();
```

### Error Classification

Not all errors should trigger failover. The key insight: **infrastructure errors** should trigger failover, **application errors** should not.

| Error Type | Failover? | Rationale |
|---|---|---|
| `ClientError::Backend { .. }` | ✅ Yes | Connection/timeout/gRPC errors |
| `ClientError::PaymentFailed { .. }` | ✅ Yes | Node might be out of liquidity |
| `ClientError::BudgetExceeded { .. }` | ❌ No | Budget is a client-side policy |
| `ClientError::InvoiceExpired` | ❌ No | Server-side issue, not backend |
| `ClientError::Protocol { .. }` | ❌ No | Challenge parsing, not backend |

This is implemented via an `is_failover_eligible` method on `ClientError`.

### Health Tracking (Circuit Breaker)

Each backend has a health state:

```
Healthy → (failure_threshold consecutive failures) → Unhealthy
Unhealthy → (recovery_timeout elapsed) → HalfOpen
HalfOpen → (next call succeeds) → Healthy
HalfOpen → (next call fails) → Unhealthy
```

Unhealthy backends are skipped. This avoids wasting time on known-dead backends.

### FailoverConfig

```rust
pub struct FailoverConfig {
    /// Number of consecutive failures before marking a backend unhealthy.
    /// Default: 3
    pub failure_threshold: u32,

    /// How long to wait before retrying an unhealthy backend.
    /// Default: 5 minutes
    pub recovery_timeout: Duration,
}
```

### Key Decisions

1. **Lives in bolt402-core, not a separate crate.** It composes the `LnBackend` trait and uses `ClientError` for classification. No external dependencies needed.
2. **Builder pattern** for ergonomic construction with any number of backends.
3. **Ordered priority.** Backends are tried in insertion order. The first backend is the "primary."
4. **`get_info` and `get_balance` use the first healthy backend.** These are informational and don't need failover semantics.
5. **Thread-safe.** Health state is behind `Arc<RwLock<_>>` for concurrent access.

## Alternatives Considered

1. **Separate crate (bolt402-failover):** Rejected. The failover adapter is pure composition of existing ports — no new dependencies. Keeping it in core makes it discoverable and avoids crate proliferation.
2. **Weighted/random selection:** Rejected for v1. Ordered priority is simpler and sufficient. Can be added later.
3. **Automatic health probing (background task):** Rejected. Adds runtime complexity. The circuit breaker pattern is passive and sufficient.

## Testing Plan

- Unit tests with mock backends: verify failover order, error classification, health transitions
- Test: primary fails → secondary succeeds
- Test: all backends fail → returns last error
- Test: circuit breaker skips unhealthy backend
- Test: half-open recovery
- Test: non-failover errors propagate immediately
- Integration test with bolt402-mock
