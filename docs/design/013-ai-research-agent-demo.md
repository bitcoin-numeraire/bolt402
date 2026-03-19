# Design Doc 013: AI Research Agent Demo

**Issue:** #30
**Author:** Toshi
**Date:** 2026-03-19

## Problem

bolt402 has a Vercel AI SDK integration (`bolt402-ai-sdk`) but no demo showing it in action. We need a chatbot that demonstrates the core value proposition: an AI agent that autonomously discovers and pays for L402-gated API data using Lightning.

## Proposed Design

A Next.js chatbot application using Vercel AI SDK's `streamText` with `bolt402-ai-sdk` tools. Users type natural language questions, the LLM decides which L402 endpoints to query, bolt402 handles payment automatically, and the response is streamed back with cost breakdowns.

### Architecture

```
User → Chat UI → Next.js API route → Vercel AI SDK (streamText)
                                        ├─ LLM (OpenAI/Anthropic)
                                        └─ bolt402 tools
                                             ├─ l402_fetch (HTTP + auto-pay)
                                             ├─ l402_get_balance (node info)
                                             └─ l402_get_receipts (cost tracking)
```

### Key Components

1. **Chat Interface** (`page.tsx` + `ChatMessage.tsx`)
   - Clean chat UI with message bubbles
   - User input at bottom, messages scroll up
   - Tool call results rendered inline (cost badges, data cards)
   - Streaming responses via `useChat` hook

2. **API Route** (`app/api/chat/route.ts`)
   - Uses `streamText` from Vercel AI SDK
   - System prompt instructs the LLM about available L402 services
   - bolt402 tools injected via `createBolt402Tools()`
   - Backend configurable via env vars (LND or mock)

3. **Spending Dashboard** (`SpendingPanel.tsx`)
   - Sidebar or collapsible panel showing:
     - Total sats spent this session
     - Number of API calls
     - Budget remaining (if configured)
     - Receipt list with per-call costs

4. **Mock Mode**
   - Default: runs with a mock backend that simulates payments
   - Mock backend returns realistic payment data without real Lightning
   - Allows demo without LND/SwissKnife configuration

### Mock Backend for Demo

Since this is a demo app, we need a mock `LnBackend` that works client-side / in API routes without a real Lightning node:

```typescript
class MockBackend implements LnBackend {
  async payInvoice(bolt11: string, maxFeeSats: number): Promise<PaymentResult> {
    // Simulate payment delay
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
    return {
      preimage: crypto.randomUUID().replace(/-/g, '') + '00'.repeat(8),
      paymentHash: crypto.randomUUID().replace(/-/g, '') + '00'.repeat(8),
      amountSats: 10 + Math.floor(Math.random() * 90), // 10-100 sats
      feeSats: Math.floor(Math.random() * 5),
    };
  }
  // ...
}
```

### System Prompt

The LLM receives a system prompt listing known L402 services (from satring.com or hardcoded), teaching it to use `l402_fetch` for data retrieval. Example:

```
You are an AI research agent with Lightning payment capabilities.
When asked questions that require paid API data, use the l402_fetch tool
to query L402-gated APIs. Known services include:
- oracle.neofreight.net - freight/shipping data
- [other satring.com services]
After fetching data, present it clearly and mention the cost.
```

### UI Design

- Dark theme matching L402 Explorer (zinc-950 base, orange accents)
- Left: Chat area (full width on mobile, ~70% on desktop)
- Right: Spending dashboard (collapsible sidebar, ~30%)
- Message bubbles: user (right-aligned, orange), assistant (left-aligned, zinc)
- Tool call results: inline cards with orange border, showing URL + cost + status

## API Sketch

### Environment Variables

```bash
# Required for real mode
OPENAI_API_KEY=sk-...           # or ANTHROPIC_API_KEY
BOLT402_BACKEND=mock|lnd|swissknife
BOLT402_LND_URL=https://...
BOLT402_LND_MACAROON=hex...
BOLT402_SWISSKNIFE_URL=https://...
BOLT402_SWISSKNIFE_API_KEY=...

# Optional
BOLT402_BUDGET_PER_REQUEST=1000
BOLT402_BUDGET_TOTAL=100000
```

### Chat API Route

```typescript
// POST /api/chat
// Body: { messages: Message[] }
// Returns: ReadableStream (Vercel AI SDK streaming format)
```

## Key Decisions

1. **Mock by default**: Demo runs without any Lightning config. Real payments opt-in via env vars.
2. **Vercel AI SDK `useChat`**: Standard pattern, works with streaming, handles tool calls.
3. **Server-side tools only**: bolt402 tools run in the API route (server-side), not browser. The LN backend credentials never reach the client.
4. **OpenAI default, configurable**: Default to `gpt-4o` but support `OPENAI_MODEL` env var.
5. **No database**: In-memory receipts, session-scoped. This is a demo, not a production app.

## Alternatives Considered

- **Langchain instead of Vercel AI SDK**: Rejected; we already have `bolt402-ai-sdk` built for Vercel AI SDK.
- **Full-stack with auth**: Over-engineered for a demo. Keep it simple.
- **SSR-only (no streaming)**: Worse UX. Streaming is the standard for chat apps.

## Testing Plan

- `npm run build` must pass
- Manual testing: send a chat message, verify tool calls appear, verify mock payments work
- Verify spending dashboard updates after each tool call
- Test with `BOLT402_BACKEND=mock` (default) and verify no errors

## File Structure

```
demos/ai-research-agent/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main chat page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Tailwind + dark theme
│   │   └── api/chat/
│   │       └── route.ts          # Streaming chat API
│   ├── components/
│   │   ├── Chat.tsx              # Chat container (client)
│   │   ├── ChatMessage.tsx       # Message bubble
│   │   ├── ToolCallCard.tsx      # Inline tool result display
│   │   └── SpendingPanel.tsx     # Cost tracker sidebar
│   └── lib/
│       ├── backend.ts            # Backend factory + mock
│       └── system-prompt.ts      # LLM system instructions
├── package.json
├── tsconfig.json
└── README.md
```
