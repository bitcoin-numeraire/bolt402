# AI Research Agent — bolt402 Demo

AI chatbot that answers questions by fetching data from L402-gated APIs, paying automatically with Lightning. Built with [Vercel AI SDK](https://ai-sdk.dev) and [bolt402-ai-sdk](../../packages/bolt402-ai-sdk).

## Features

- **Chat interface** — Ask natural language questions
- **Autonomous payments** — Agent discovers and pays L402 APIs automatically
- **Streaming responses** — Real-time AI responses via Vercel AI SDK
- **Spending dashboard** — Track costs, receipts, and budget in real-time
- **Mock mode** — Run without a Lightning node (simulated payments)
- **Configurable backend** — LND, SwissKnife, or mock

## Quick Start

```bash
# Install dependencies
npm install

# Build bolt402-ai-sdk (if not already built)
cd ../../packages/bolt402-ai-sdk && npm install && npm run build && cd -

# Set up environment
cp .env.example .env.local
# Edit .env.local with your OpenAI API key

# Run in development mode
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for the LLM |
| `OPENAI_MODEL` | No | `gpt-4o` | Model to use |
| `BOLT402_BACKEND` | No | `mock` | `mock`, `lnd`, or `swissknife` |
| `BOLT402_LND_URL` | If LND | — | LND REST API URL |
| `BOLT402_LND_MACAROON` | If LND | — | Hex-encoded admin macaroon |
| `BOLT402_SWISSKNIFE_URL` | If SwissKnife | — | SwissKnife API URL |
| `BOLT402_SWISSKNIFE_API_KEY` | If SwissKnife | — | SwissKnife API key |
| `BOLT402_BUDGET_PER_REQUEST` | No | ∞ | Max sats per request |
| `BOLT402_BUDGET_TOTAL` | No | ∞ | Max total sats |

## Architecture

```
User → Chat UI (useChat) → /api/chat (streamText) → OpenAI
                                         ↓
                              bolt402-ai-sdk tools
                              ├─ l402_fetch (HTTP + L402)
                              ├─ l402_get_balance
                              └─ l402_get_receipts
```

The LLM decides when to use tools. When it calls `l402_fetch`, bolt402 handles the full L402 flow: initial request → detect 402 → pay Lightning invoice → retry with token → return data.

## Mock Mode

By default, the demo runs with a mock Lightning backend that simulates payments with realistic delays and costs (10-100 sats per request). No real Lightning node required.

To use real payments, set `BOLT402_BACKEND=lnd` or `BOLT402_BACKEND=swissknife` with the appropriate credentials.

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Vercel AI SDK](https://ai-sdk.dev) (`streamText`, `useChat`)
- [bolt402-ai-sdk](../../packages/bolt402-ai-sdk) (L402 tools)
- [Tailwind CSS 4](https://tailwindcss.com)
- [@ai-sdk/openai](https://ai-sdk.dev/providers/ai-sdk-providers/openai) provider

## License

MIT OR Apache-2.0
