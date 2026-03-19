import {
  streamText,
  convertToCoreMessages,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { createBolt402Tools } from "bolt402-ai-sdk";
import { createBackend, getBudgetConfig } from "@/lib/backend";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const backend = createBackend();
  const budget = getBudgetConfig();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const tools = createBolt402Tools({
    backend,
    budget,
  });

  const result = streamText({
    model: openai(model),
    system: SYSTEM_PROMPT,
    messages: convertToCoreMessages(messages),
    tools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
