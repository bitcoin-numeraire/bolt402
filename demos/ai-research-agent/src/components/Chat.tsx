"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { SpendingPanel } from "./SpendingPanel";

const SUGGESTIONS = [
  "What freight pricing data can you fetch?",
  "Check your Lightning node balance",
  "What L402 services are available on satring.com?",
  "How much have we spent this session?",
];

export function Chat() {
  const [spendingOpen, setSpendingOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } =
    useChat();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    append({ role: "user", content: text });
  };

  return (
    <div className="flex flex-col h-full">
      <SpendingPanel
        messages={messages}
        isOpen={spendingOpen}
        onToggle={() => setSpendingOpen(!spendingOpen)}
      />

      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-bitcoin/20 flex items-center justify-center">
            <span className="text-bitcoin text-lg">⚡</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">
              AI Research Agent
            </h1>
            <p className="text-xs text-zinc-500">
              Powered by bolt402 — pays for data with Lightning
            </p>
          </div>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-24 pb-8">
              <div className="w-16 h-16 rounded-2xl bg-bitcoin/10 flex items-center justify-center mb-6">
                <span className="text-bitcoin text-3xl">⚡</span>
              </div>
              <h2 className="text-xl font-semibold text-zinc-200 mb-2">
                AI Research Agent
              </h2>
              <p className="text-sm text-zinc-500 text-center max-w-md mb-8">
                Ask questions that require paid data. I&apos;ll query L402-gated
                APIs and pay with Lightning automatically.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-left px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-bitcoin/20 flex items-center justify-center text-bitcoin text-sm shrink-0">
                  ⚡
                </div>
                <div className="rounded-2xl rounded-bl-md bg-zinc-800/80 px-4 py-3">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-zinc-500 typing-dot-1" />
                    <span className="w-2 h-2 rounded-full bg-zinc-500 typing-dot-2" />
                    <span className="w-2 h-2 rounded-full bg-zinc-500 typing-dot-3" />
                  </span>
                </div>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto px-4 py-3 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about L402 APIs, freight data, prices..."
            disabled={isLoading}
            className="flex-1 rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-bitcoin text-white text-sm font-medium hover:bg-bitcoin/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
