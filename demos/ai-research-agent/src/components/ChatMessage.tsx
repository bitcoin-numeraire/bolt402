"use client";

import type { UIMessage } from "ai";
import { ToolCallCard } from "./ToolCallCard";

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 animate-fade-in-up ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-bitcoin/20 flex items-center justify-center text-bitcoin text-sm shrink-0 mt-1">
          ⚡
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;

          if (part.type === "text") {
            if (!part.text.trim()) return null;
            return (
              <div
                key={key}
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? "bg-bitcoin text-white rounded-br-md"
                    : "bg-zinc-800/80 text-zinc-100 rounded-bl-md"
                }`}
              >
                {part.text}
              </div>
            );
          }

          if (part.type === "tool-invocation") {
            const inv = part.toolInvocation;
            return (
              <ToolCallCard
                key={key}
                toolName={inv.toolName}
                args={inv.args as Record<string, unknown>}
                result={
                  inv.state === "result"
                    ? (inv.result as Record<string, unknown>)
                    : undefined
                }
                state={inv.state}
              />
            );
          }

          return null;
        })}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm shrink-0 mt-1">
          U
        </div>
      )}
    </div>
  );
}
