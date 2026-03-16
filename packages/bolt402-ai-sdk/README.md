# bolt402-ai-sdk

L402 Lightning payment tools for the [Vercel AI SDK](https://ai-sdk.dev/). Let AI agents autonomously pay for APIs with Bitcoin over the Lightning Network.

## What is L402?

[L402](https://docs.lightning.engineering/the-lightning-network/l402) is a protocol that uses HTTP 402 (Payment Required) responses to gate API access behind Lightning Network payments. When a server responds with 402, the client pays a Lightning invoice and retries with proof of payment.

bolt402-ai-sdk wraps this flow into [Vercel AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), so AI agents can access paid APIs without manual intervention.

## Install

```bash
npm install bolt402-ai-sdk ai zod
```

## Quick Start

```typescript
import { createBolt402Tools, LndBackend } from 'bolt402-ai-sdk';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Configure Lightning backend
const backend = new LndBackend({
  url: 'https://localhost:8080',
  macaroon: process.env.LND_MACAROON!,
});

// Create AI SDK tools with budget limits
const tools = createBolt402Tools({
  backend,
  budget: { perRequestMax: 1000, dailyMax: 50_000 },
});

// Use with any Vercel AI SDK model
const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  maxSteps: 5,
  prompt: 'Fetch the premium weather data from https://api.example.com/v1/weather',
});

console.log(result.text);
```

## Tools

`createBolt402Tools()` returns three tools:

### `l402_fetch`

Fetch any URL, automatically handling L402 payment challenges. When the server returns HTTP 402 with a Lightning invoice, the tool pays it, caches the token, and retries.

**Parameters:**
- `url` (string, required): The URL to fetch
- `method` (string, optional): HTTP method (GET, POST, PUT, DELETE). Default: GET
- `body` (string, optional): Request body for POST/PUT
- `headers` (object, optional): Additional HTTP headers

**Returns:** Response body, status code, and payment receipt (if paid).

### `l402_get_balance`

Check the Lightning node's spendable balance.

**Returns:** Balance in satoshis, node alias, active channel count.

### `l402_get_receipts`

Get all payment receipts from the current session for cost tracking and auditing.

**Returns:** Total spent, payment count, and detailed receipts.

## Lightning Backends

### LND REST

```typescript
import { LndBackend } from 'bolt402-ai-sdk';

const backend = new LndBackend({
  url: 'https://localhost:8080',
  macaroon: 'hex-encoded-admin-macaroon',
});
```

### SwissKnife

```typescript
import { SwissKnifeBackend } from 'bolt402-ai-sdk';

const backend = new SwissKnifeBackend({
  url: 'https://app.numeraire.tech',
  apiKey: 'sk-your-api-key',
});
```

### Custom Backend

Implement the `LnBackend` interface:

```typescript
import type { LnBackend, PaymentResult, NodeInfo } from 'bolt402-ai-sdk';

class MyBackend implements LnBackend {
  async payInvoice(bolt11: string, maxFeeSats: number): Promise<PaymentResult> {
    // Your payment logic
  }
  async getBalance(): Promise<number> {
    // Return balance in satoshis
  }
  async getInfo(): Promise<NodeInfo> {
    // Return node info
  }
}
```

## Budget Control

Set spending limits to prevent runaway costs:

```typescript
const tools = createBolt402Tools({
  backend,
  budget: {
    perRequestMax: 1000,   // Max 1000 sats per request
    hourlyMax: 10_000,     // Max 10k sats per hour
    dailyMax: 100_000,     // Max 100k sats per day
    totalMax: 1_000_000,   // Max 1M sats total
  },
});
```

## Using the L402 Client Directly

For non-AI use cases, use `L402Client` directly:

```typescript
import { L402Client, LndBackend, InMemoryTokenStore } from 'bolt402-ai-sdk';

const client = new L402Client({
  backend: new LndBackend({ url: '...', macaroon: '...' }),
  tokenStore: new InMemoryTokenStore(),
  budget: { perRequestMax: 500 },
});

const response = await client.get('https://api.example.com/data');
console.log(response.body);

if (response.paid) {
  console.log(`Paid ${response.receipt!.totalCostSats} sats`);
}
```

## Architecture

bolt402-ai-sdk follows hexagonal (ports & adapters) architecture, mirroring the [Rust bolt402-core](https://github.com/bitcoin-numeraire/bolt402):

```
Vercel AI SDK → createBolt402Tools() → L402Client
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                         LnBackend    TokenStore    BudgetTracker
                         (port)       (port)
                              │            │
                    ┌─────────┴──┐         │
                    ▼            ▼         ▼
                   LND      SwissKnife  InMemory
                   REST       REST      TokenStore
```

## License

MIT OR Apache-2.0
