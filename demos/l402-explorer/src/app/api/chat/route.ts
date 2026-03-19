import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  createBolt402Tools,
  LndBackend,
  SwissKnifeBackend,
  type LnBackend,
} from '@/lib/bolt402';
import { MockBackend } from '@/lib/mock-backend';

function getConfig() {
  const backendType = process.env.BACKEND_TYPE || 'mock';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const lndUrl = process.env.LND_URL || '(not set)';
  const swissKnifeUrl = process.env.SWISSKNIFE_URL || '(not set)';
  const satringUrl = process.env.SATRING_API_URL || 'https://satring.com/api/v1';

  return { backendType, model, hasOpenAIKey, lndUrl, swissKnifeUrl, satringUrl };
}

function createBackend(): LnBackend {
  const { backendType } = getConfig();

  if (backendType === 'lnd' && process.env.LND_URL && process.env.LND_MACAROON) {
    return new LndBackend({
      url: process.env.LND_URL,
      macaroon: process.env.LND_MACAROON,
    });
  }

  if (
    backendType === 'swissknife' &&
    process.env.SWISSKNIFE_URL &&
    process.env.SWISSKNIFE_API_KEY
  ) {
    return new SwissKnifeBackend({
      url: process.env.SWISSKNIFE_URL,
      apiKey: process.env.SWISSKNIFE_API_KEY,
    });
  }

  return new MockBackend();
}

function buildSystemPrompt(services: Array<{ name: string; url: string; description: string; pricing_sats: number; pricing_model: string; categories: Array<{ name: string }> }>) {
  const serviceList = services
    .map(
      (s) =>
        `- **${s.name}**: ${s.description}\n  URL: ${s.url}\n  Price: ${s.pricing_sats} sats/${s.pricing_model.replace('per-', '')}\n  Categories: ${s.categories.map((c) => c.name).join(', ')}`,
    )
    .join('\n');

  return `You are an AI research assistant powered by bolt402. You have access to L402-gated APIs that you can query by paying with Lightning Network micropayments.

Available L402 services:
${serviceList || 'No services currently loaded.'}

When a user asks a question:
1. Identify which L402 API(s) can answer it
2. Use the l402_fetch tool to query the API endpoint with the appropriate URL
3. Present the data clearly and in a well-formatted way
4. Report which APIs you used, their cost in sats, and response latency

If no API can answer the question, explain what services are available and what they can do.
Always mention the cost of each API call to keep the user informed about spending.

When presenting data, use markdown formatting for clarity. If you receive JSON data, extract the key information and present it in a human-readable format.`;
}

export async function POST(req: Request) {
  const config = getConfig();

  // Log config on each request (non-sensitive info only)
  console.log('[bolt402-chat]', {
    backend: config.backendType,
    model: config.model,
    openaiKeySet: config.hasOpenAIKey,
    lndUrl: config.backendType === 'lnd' ? config.lndUrl : undefined,
    swissKnifeUrl: config.backendType === 'swissknife' ? config.swissKnifeUrl : undefined,
    satringApi: config.satringUrl,
  });

  if (!config.hasOpenAIKey) {
    return new Response(
      JSON.stringify({
        error: 'OPENAI_API_KEY is not set. Add it to .env.local to enable the AI chat.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { messages, services } = await req.json();

    const backend = createBackend();
    const tools = createBolt402Tools({
      backend,
      budget: { perRequestMax: 1000, dailyMax: 50000 },
      maxFeeSats: 100,
    });

    const result = streamText({
      model: openai(config.model),
      system: buildSystemPrompt(services || []),
      messages,
      tools,
      maxSteps: 5,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[bolt402-chat] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
