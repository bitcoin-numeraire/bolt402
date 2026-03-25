# Regtest Integration Tests

End-to-end Lightning regtest environment for validating the full L402 protocol flow
against **Aperture** (Lightning Labs' reference L402 reverse proxy).

## Protocol Flow Under Test

```
Client (bolt402)           Aperture (L402 proxy)           Backend
     │                           │                           │
     │── GET /api/data ─────────►│                           │
     │◄── 402 + WWW-Authenticate │                           │
     │    L402 macaroon+invoice  │                           │
     │                           │                           │
     │── pay invoice ──► lnd-bob │                           │
     │◄── preimage ───────────── │                           │
     │                           │                           │
     │── GET /api/data ─────────►│── GET /api/data ─────────►│
     │   Authorization: L402     │                           │
     │◄── 200 OK ───────────────│◄── 200 OK ────────────────│
```

## Topology

```
                    ┌──────────┐
                    │ bitcoind │  (regtest)
                    └────┬─────┘
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌─────┐
        │lnd-alice │ │ lnd-bob  │ │ cln │
        │ (payer)  │ │(receiver)│ │(payer)│
        └──────────┘ └────┬─────┘ └─────┘
              │            │
              │       ┌────┴─────┐    ┌─────────┐
              │       │ Aperture │───►│ backend  │
              │       │(L402 proxy)│  │ (Node.js)│
              │       └──────────┘    └─────────┘
              │            │
         bolt402 client tests
         (gRPC, REST, CLN)
```

- **bitcoind** — regtest chain
- **lnd-alice** — payer node for LND backend tests (gRPC + REST)
- **lnd-bob** — receiver node, Aperture creates invoices here
- **cln** — payer node for CLN backend tests (gRPC mTLS)
- **aperture** — Lightning Labs' reference L402 reverse proxy (v0.4.2)
- **backend** — simple Node.js HTTP server behind Aperture

## Test Suites (Rust)

| Suite | Backend | What it tests |
|-------|---------|---------------|
| `lnd_grpc_flow` | LND gRPC | Full L402 flow, receipt verification, preimage hash |
| `lnd_rest_flow` | LND REST | Same via REST, multi-endpoint sequential payments |
| `cln_flow` | CLN gRPC | Full L402 flow, token caching |
| `budget_enforcement` | LND REST | Per-request limits, total budget caps |
| `token_caching` | LND REST | Cache hits skip payment, store isolation |
| `sqlite_persistence` | LND REST | Tokens survive client restart via SQLite |

## Quick Start

```bash
# From the repo root:

# 1. Bring up Docker services
docker compose -f tests/regtest/docker-compose.yml up -d

# 2. Initialize network (fund wallets, open channels, export creds)
./tests/regtest/scripts/init-regtest.sh

# 3. Run all regtest tests
cargo test -p bolt402-regtest -- --nocapture

# 4. Run a single suite
cargo test -p bolt402-regtest --test lnd_grpc_flow -- --nocapture

# 5. Teardown
docker compose -f tests/regtest/docker-compose.yml down -v
```

## Layout

```
tests/regtest/
├── Cargo.toml                  # Rust test crate
├── README.md
├── docker-compose.yml
├── src/
│   └── lib.rs                  # Shared helpers, skip_if_no_regtest! macro
├── tests/
│   ├── lnd_grpc_flow.rs
│   ├── lnd_rest_flow.rs
│   ├── cln_flow.rs
│   ├── budget_enforcement.rs
│   ├── token_caching.rs
│   └── sqlite_persistence.rs
├── scripts/
│   └── init-regtest.sh
├── aperture/
│   └── aperture.yaml
├── backend/
│   └── server.js
├── lnd/
│   ├── alice.conf
│   └── bob.conf
└── cln/
    └── config
```

## Future Multi-Language Tests

The Docker stack is shared infrastructure. Other languages should:
1. Source `tests/regtest/.env.regtest` for credentials
2. Hit the same `L402_SERVER_URL` (Aperture on port 8081)

Planned:
- **WASM/Node.js**: `crates/bolt402-wasm/tests/node/integration/`
- **Python**: `crates/bolt402-python/tests/integration/`
- **Go**: `bindings/bolt402-go/tests/integration/`

## CI

The `regtest.yml` workflow runs on every PR and push to main:
1. Compiles the regtest crate
2. Starts Docker Compose services
3. Bootstraps the Lightning network
4. Runs all Rust regtest tests
5. Dumps logs on failure
6. Tears down cleanly

## Swissknife Tests

Swissknife backend tests require a running Swissknife instance with API credentials.
These will be separate from the regtest environment (either against a staging
instance or a dedicated Swissknife Docker setup).
