# Architecture Guide

bolt402 follows **hexagonal architecture** (ports and adapters), inspired by domain-driven design. The core protocol logic has zero external dependencies beyond standard async/HTTP libraries. Lightning backends and token stores are interchangeable through trait boundaries.

## Crate Dependency Graph

```
                         bolt402-proto
               (protocol types, ports, errors)
                ↑      ↑      ↑      ↑     ↑
                │      │      │      │     │
     ┌──────────┤      │      │      │     └──────────┐
     │          │      │      │      │                │
bolt402-lnd  bolt402-  │  bolt402-  bolt402-    bolt402-wasm
 (gRPC+REST) swissknife│   cln      nwc        (WASM bindings)
     │          │      │                         wraps: lnd(rest),
     │          │      │                         swissknife
     │          │      │
     └─────┬────┘      │
           │           │
     bolt402-core      bolt402-mock
     (L402 engine,     (test server)
      budget, cache)
        ↑     ↑
        │     │
   bolt402- bolt402-
    ffi     python
```

| Crate | Role |
|-------|------|
| `bolt402-proto` | Shared protocol types: `L402Challenge`, `L402Token`, `L402Error`, `ClientError`. **Also owns all port traits** (`LnBackend`, `TokenStore`) and shared domain types (`PaymentResult`, `NodeInfo`). No async runtime dependency (no tokio). WASM-safe. |
| `bolt402-core` | The L402 client engine. Contains `L402Client` (HTTP orchestration with reqwest), `BudgetTracker`, `InMemoryTokenStore`, and `Receipt`. Re-exports ports from `bolt402-proto`. |
| `bolt402-lnd` | Implements `LnBackend` for LND. Two feature-gated backends: `grpc` (tonic, requires tokio) and `rest` (reqwest, WASM-compatible). Depends on `bolt402-proto` only. |
| `bolt402-cln` | Implements `LnBackend` for Core Lightning (CLN) via gRPC with mTLS. |
| `bolt402-nwc` | Implements `LnBackend` for Nostr Wallet Connect (NIP-47). |
| `bolt402-swissknife` | Implements `LnBackend` for Numeraire SwissKnife via REST API. Depends on `bolt402-proto` only. WASM-compatible. |
| `bolt402-mock` | A mock L402 server and mock Lightning backend for testing. No real Lightning infrastructure needed. |
| `bolt402-wasm` | WebAssembly bindings via `wasm-bindgen`. Wraps `bolt402-lnd` (REST) and `bolt402-swissknife` as `WasmLndRestBackend` and `WasmSwissKnifeBackend`. Also provides an in-process mock L402 client for demos/testing. Depends on `bolt402-proto` + backend crates directly (not `bolt402-core`). |
| `bolt402-sqlite` | Persistent `TokenStore` implementation using SQLite. |
| `bolt402-ai-sdk` | TypeScript package providing Vercel AI SDK tools. Consumes `bolt402-wasm` for Rust-powered L402 protocol logic in the browser. |

## Ports and Adapters

The hexagonal architecture separates what the system does (core logic) from how it connects to the outside world (adapters).

### Ports (Trait Definitions)

Ports live in `bolt402-proto` so that adapter crates can implement them without pulling in tokio or reqwest, enabling WASM compilation:

```rust
// Lightning payment port
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
pub trait LnBackend: Send + Sync {
    async fn pay_invoice(&self, bolt11: &str, max_fee_sats: u64)
        -> Result<PaymentResult, ClientError>;
    async fn get_balance(&self) -> Result<u64, ClientError>;
    async fn get_info(&self) -> Result<NodeInfo, ClientError>;
}

// Token caching port
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
pub trait TokenStore: Send + Sync {
    async fn put(&self, endpoint: &str, macaroon: &str, preimage: &str)
        -> Result<(), ClientError>;
    async fn get(&self, endpoint: &str)
        -> Result<Option<(String, String)>, ClientError>;
    async fn remove(&self, endpoint: &str) -> Result<(), ClientError>;
    async fn clear(&self) -> Result<(), ClientError>;
}
```

The `#[cfg_attr]` conditional ensures `async_trait(?Send)` on WASM targets (where `reqwest::Response` is not `Send`) and standard `async_trait` on native targets.

### Adapters (Implementations)

Each adapter lives in its own crate:

| Port | Adapter | Crate | WASM-compatible |
|------|---------|-------|-----------------|
| `LnBackend` | LND gRPC | `bolt402-lnd` (feature `grpc`) | No |
| `LnBackend` | LND REST | `bolt402-lnd` (feature `rest`) | Yes |
| `LnBackend` | CLN gRPC | `bolt402-cln` | No |
| `LnBackend` | NWC (NIP-47) | `bolt402-nwc` | No |
| `LnBackend` | SwissKnife REST | `bolt402-swissknife` | Yes |
| `LnBackend` | Mock (for testing) | `bolt402-mock` | No |
| `TokenStore` | In-memory LRU cache | `bolt402-core` (built-in) | No |
| `TokenStore` | SQLite | `bolt402-sqlite` | No |

You can implement your own adapters for LDK or any other Lightning implementation. See the [Custom Backend Tutorial](tutorials/custom-backend.md).

## WASM Architecture

The WASM path intentionally bypasses `bolt402-core` to avoid pulling in tokio:

```
bolt402-wasm
  ├── bolt402-proto          (types, ports, errors — no async runtime)
  ├── bolt402-lnd[rest]      (reqwest → browser fetch on WASM)
  └── bolt402-swissknife     (reqwest → browser fetch on WASM)
```

`bolt402-wasm` exposes:
- **`WasmLndRestBackend`** / **`WasmSwissKnifeBackend`**: Thin wasm-bindgen wrappers around the real Rust backends. These make actual HTTP calls via `reqwest` (which compiles to browser `fetch` on `wasm32-unknown-unknown`).
- **`WasmMockServer`** / **`WasmMockClient`**: In-process mock L402 environment for testing and demos. No HTTP server needed.
- **Utility functions**: `parseL402Challenge()`, `buildL402Header()`, `version()`.

The TypeScript `bolt402-ai-sdk` package consumes the WASM package and wraps the backends into Vercel AI SDK tools.

## The L402 Protocol Flow

When `L402Client.get(url)` is called, the following happens:

```
Client                     Server                     Lightning
  │                          │                           │
  │── GET /api/data ────────▶│                           │
  │                          │                           │
  │◀── 402 Payment Required ─│                           │
  │    WWW-Authenticate:     │                           │
  │    L402 macaroon="..",   │                           │
  │         invoice=".."     │                           │
  │                          │                           │
  │  [Parse L402 challenge]  │                           │
  │  [Check budget limits]   │                           │
  │                          │                           │
  │── pay_invoice(bolt11) ──────────────────────────────▶│
  │◀── PaymentResult(preimage, hash, amount) ───────────│
  │                          │                           │
  │  [Cache token]           │                           │
  │                          │                           │
  │── GET /api/data ────────▶│                           │
  │   Authorization:         │                           │
  │   L402 <macaroon>:<preimage>                         │
  │                          │                           │
  │◀── 200 OK ──────────────│                           │
  │    {"result": "..."}     │                           │
  │                          │                           │
  │  [Record receipt]        │                           │
```

On subsequent requests to the same URL, the cached token is used directly (no payment needed).

## Budget System

The `BudgetTracker` enforces spending limits at multiple granularities:

- **Per-request**: Maximum satoshis for a single payment
- **Hourly**: Rolling hourly cap
- **Daily**: Rolling daily cap
- **Total**: Lifetime cap for the client instance
- **Domain-specific**: Override budgets for specific API domains

Budget checks happen before payment. If a limit would be exceeded, `ClientError::BudgetExceeded` is returned and no payment is attempted.

## Design Principles

1. **WASM-safe foundation.** `bolt402-proto` owns all port traits and has zero async runtime dependency. Backend crates that need to compile to WASM depend only on `bolt402-proto`, not `bolt402-core`.

2. **Zero-dependency core.** `bolt402-core` depends only on `bolt402-proto`, reqwest, and tokio (for `RwLock`). No Lightning-specific dependencies leak into the core.

3. **Swap anything.** Need a different Lightning backend? Implement `LnBackend`. Need persistent token storage? Implement `TokenStore`. The core doesn't care.

4. **Test without infrastructure.** `bolt402-mock` provides a complete L402 server and mock Lightning backend. `bolt402-wasm` includes an in-process mock for browser testing. No real Lightning node needed.

5. **Receipts by default.** Every payment is recorded as a `Receipt` with amount, fees, latency, and payment hash. This makes cost analysis and auditing trivial.

6. **Safety first for agents.** AI agents spending real money need guardrails. The budget system is not optional decoration; it's a first-class concern built into the protocol flow.
