# Design Doc 006: Vercel AI SDK Integration

**Status:** In Progress
**Issue:** #8
**Author:** Toshi

## Problem

bolt402 provides a Rust L402 client SDK, but the primary consumers of L402-gated APIs today are AI agents, most of which run in TypeScript/Node.js. The Vercel AI SDK is the dominant framework for building AI agent applications in TypeScript (20M+ monthly downloads). There is no existing library that provides Vercel AI SDK tools for L402 payments.

Lightning Labs' `lightning-agent-tools` provides CLI-based tools (lnget) and an MCP server, but no programmatic TypeScript SDK and no Vercel AI SDK integration. bolt402 fills this gap.

## Goals

1. Provide a TypeScript package (`bolt402-ai-sdk`) that gives AI agents the ability to pay for L402-gated APIs
2. Expose Vercel AI SDK tools via a simple `createBolt402Tools()` function
3. Mirror the Rust core's hexagonal architecture: pluggable Lightning backends, token caching, budget tracking
4. Ship with working Lightning backends (LND REST, SwissKnife REST)
5. Include comprehensive tests, docs, and a working example

## Non-Goals

- WASM bindings from the Rust core (future work, separate issue)
- Full BOLT11 invoice decoding in TypeScript (use amount from the challenge or backend response)
- Server-side L402 middleware (this is client-side only)

## Design

### Package Structure

```
packages/
  bolt402-ai-sdk/
    src/
      index.ts              # Public API exports
      l402-client.ts        # L402Client: core protocol engine
      tools.ts              # createBolt402Tools(): Vercel AI SDK tools
      types.ts              # Shared types (LnBackend, TokenStore, etc.)
      token-store.ts        # InMemoryTokenStore adapter
      budget.ts             # BudgetTracker
      receipt.ts            # Receipt type
      backends/
        lnd.ts              # LND REST API backend
        swissknife.ts       # SwissKnife REST API backend
    tests/
      l402-client.test.ts   # Unit tests for L402Client
      tools.test.ts         # Unit tests for AI SDK tools
      budget.test.ts        # Budget tracker tests
      token-store.test.ts   # Token store tests
    package.json
    tsconfig.json
    vitest.config.ts
    README.md
```

### Architecture (Hexagonal, mirroring Rust core)

```
                    Vercel AI SDK
                         │
                  createBolt402Tools()
                         │
                    ┌─────────────┐
                    │  L402Client  │  (core engine)
                    │             │
                    │ - fetch()   │
                    │ - get()     │
                    │ - post()    │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │LnBackend │ │TokenStore│ │  Budget   │
        │  (port)  │ │  (port)  │ │ Tracker   │
        └────┬─────┘ └────┬─────┘ └──────────┘
             │             │
     ┌───────┴──────┐     │
     ▼              ▼     ▼
  ┌──────┐   ┌─────────┐ ┌──────────┐
  │ LND  │   │Swissknife│ │InMemory  │
  │ REST │   │  REST    │ │TokenStore│
  └──────┘   └─────────┘ └──────────┘
```

### Core Types (ports)

```typescript
// Lightning backend port
interface LnBackend {
  payInvoice(bolt11: string, maxFeeSats: number): Promise<PaymentResult>;
  getBalance(): Promise<number>;
  getInfo(): Promise<NodeInfo>;
}

// Token storage port
interface TokenStore {
  get(endpoint: string): Promise<CachedToken | null>;
  put(endpoint: string, macaroon: string, preimage: string): Promise<void>;
  remove(endpoint: string): Promise<void>;
  clear(): Promise<void>;
}

interface PaymentResult {
  preimage: string;
  paymentHash: string;
  amountSats: number;
  feeSats: number;
}

interface NodeInfo {
  pubkey: string;
  alias: string;
  numActiveChannels: number;
}
```

### L402Client

```typescript
const client = new L402Client({
  backend: new LndBackend({ url: 'https://localhost:8080', macaroon: '...' }),
  tokenStore: new InMemoryTokenStore(),
  budget: { perRequestMax: 1000, dailyMax: 10000 },
  maxFeeSats: 100,
});

// Core methods
const response = await client.fetch('https://api.example.com/resource');
const response = await client.get('https://api.example.com/resource');
const response = await client.post('https://api.example.com/resource', { body: '...' });
```

The L402 flow mirrors the Rust implementation exactly:
1. Check token cache for endpoint
2. If cached token exists, try it. If rejected (402), remove and continue.
3. Make request without auth
4. If not 402, return as-is
5. Parse `WWW-Authenticate: L402` header
6. Check budget
7. Pay invoice via LnBackend
8. Cache token
9. Retry with `Authorization: L402 <macaroon>:<preimage>` header
10. Record receipt

### Vercel AI SDK Tools

```typescript
import { createBolt402Tools } from 'bolt402-ai-sdk';

const tools = createBolt402Tools({
  backend: new LndBackend({ ... }),
  budget: { perRequestMax: 1000 },
});

// Use with Vercel AI SDK
const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'Fetch the weather data from this L402-gated API: https://api.example.com/weather',
});
```

The function returns an object with these tools:

#### `l402_fetch`
Fetch any URL, automatically handling L402 payment challenges.

```typescript
{
  description: 'Fetch a URL, automatically paying Lightning invoices for L402-gated APIs. Returns the response body and payment receipt if a payment was made.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method'),
    body: z.string().optional().describe('Request body (for POST/PUT)'),
    headers: z.record(z.string()).optional().describe('Additional headers'),
  }),
  execute: async ({ url, method, body, headers }) => { ... }
}
```

#### `l402_get_balance`
Check the Lightning node balance.

```typescript
{
  description: 'Get the current Lightning node balance in satoshis.',
  inputSchema: z.object({}),
  execute: async () => { ... }
}
```

#### `l402_get_receipts`
Get payment receipts for auditing.

```typescript
{
  description: 'Get all L402 payment receipts from this session. Useful for tracking costs.',
  inputSchema: z.object({}),
  execute: async () => { ... }
}
```

### Lightning Backends

#### LND REST

```typescript
const backend = new LndBackend({
  url: 'https://localhost:8080',
  macaroon: 'hex-encoded-admin-macaroon',
  // OR
  macaroonPath: '/path/to/admin.macaroon',
  tlsCertPath: '/path/to/tls.cert', // optional, for self-signed certs
});
```

Uses LND's REST API:
- `POST /v2/router/send` for payments (v2 sync send)
- `GET /v1/balance/channels` for balance
- `GET /v1/getinfo` for node info

#### SwissKnife REST

```typescript
const backend = new SwissKnifeBackend({
  url: 'https://app.numeraire.tech',
  apiKey: 'sk-...',
});
```

Uses SwissKnife's API:
- `POST /api/payments/bolt11` for paying invoices
- `GET /api/balance` for balance
- `GET /api/info` for node info

## Key Decisions

1. **Native TypeScript, not WASM.** The L402 protocol is simple enough that a native TS implementation is cleaner than WASM bindings. WASM can come later for users who want a single source of truth. The TS client mirrors the Rust core's API and behavior exactly.

2. **`packages/` directory in the repo root.** Separates TypeScript packages from the Rust workspace. The Rust crates stay in `crates/`, TypeScript packages go in `packages/`. Clean separation.

3. **Zod for schema validation.** The Vercel AI SDK uses Zod for tool input schemas. It's the standard and required for type inference.

4. **Vitest for testing.** Fast, TypeScript-native, good Vercel AI SDK ecosystem support.

5. **`fetch` API, not Axios.** Uses the standard `fetch` API (available in Node 18+). No unnecessary dependencies. Compatible with edge runtimes.

6. **Budget tracking is optional.** Defaults to unlimited if not configured, matching the Rust core behavior.

7. **`needsApproval` option.** The `l402_fetch` tool supports the Vercel AI SDK's `needsApproval` feature for high-value payments (configurable threshold).

## Alternatives Considered

- **WASM-first approach:** Would ensure Rust and TS implementations are identical, but adds build complexity and limits edge runtime compatibility. The L402 protocol is simple; a native TS port is more practical for the first release.
- **MCP server instead of Vercel AI SDK tools:** MCP is framework-agnostic but doesn't integrate as tightly with the Vercel AI SDK's tool calling, type inference, and streaming. The Vercel AI SDK is the target framework per the issue.
- **Single mega-tool:** Instead of 3 tools, use a single tool with a discriminated `action` field. Rejected because separate tools give the LLM clearer affordances and better type inference.

## Testing Plan

1. **Unit tests** for L402Client: mock HTTP responses (402 with challenge headers, 200 after payment), mock LnBackend
2. **Unit tests** for each tool: verify schema, mock L402Client, check return values
3. **Unit tests** for backends: mock HTTP, verify correct API calls to LND/SwissKnife
4. **Unit tests** for budget tracker and token store
5. **Integration test** with `bolt402-mock` server: start the mock server, configure L402Client to use it with a mock backend, verify end-to-end flow
6. **CI:** lint (eslint), format (prettier), type-check (tsc), test (vitest)

## Dependencies

- `ai` (Vercel AI SDK core, peer dependency)
- `zod` (schema validation, peer dependency)
- No other runtime dependencies (uses native `fetch`)

## Future Work

- WASM bindings to replace native TS core (keep same API surface)
- Additional tools: `l402_pay_invoice` (direct invoice payment), `l402_create_invoice` (for receiving)
- More backends: CLN, Phoenixd, custom REST
- npm publish pipeline in CI
