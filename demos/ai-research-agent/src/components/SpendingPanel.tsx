"use client";

import type { UIMessage } from "ai";
import { useMemo } from "react";

interface SpendingPanelProps {
  messages: UIMessage[];
  isOpen: boolean;
  onToggle: () => void;
}

interface Receipt {
  url: string;
  amountSats: number;
  feeSats: number;
  totalCostSats: number;
  latencyMs: number;
}

export function SpendingPanel({
  messages,
  isOpen,
  onToggle,
}: SpendingPanelProps) {
  const receipts = useMemo(() => {
    const found: Receipt[] = [];
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool-invocation") {
          const inv = part.toolInvocation;
          if (
            inv.toolName === "l402_fetch" &&
            inv.state === "result" &&
            inv.result
          ) {
            const res = inv.result as Record<string, unknown>;
            if (res.paid) {
              const r = res.receipt as Record<string, unknown> | null;
              if (r) {
                found.push({
                  url: (res.url as string) ?? "unknown",
                  amountSats: r.amountSats as number,
                  feeSats: r.feeSats as number,
                  totalCostSats: r.totalCostSats as number,
                  latencyMs: r.latencyMs as number,
                });
              }
            }
          }
        }
      }
    }
    return found;
  }, [messages]);

  const totalSats = receipts.reduce((sum, r) => sum + r.totalCostSats, 0);
  const avgLatency =
    receipts.length > 0
      ? receipts.reduce((sum, r) => sum + r.latencyMs, 0) / receipts.length
      : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
      >
        <span className="text-bitcoin">⚡</span>
        <span className="font-mono">{totalSats} sats</span>
        <span className="text-zinc-500">|</span>
        <span className="text-zinc-400">{receipts.length} calls</span>
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-zinc-900 border-l border-zinc-800 z-40 transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              Spending Dashboard
            </h2>
            <button
              onClick={onToggle}
              className="text-zinc-500 hover:text-zinc-300 text-lg"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <StatCard label="Total Spent" value={`${totalSats} sats`} />
          <StatCard label="API Calls" value={`${receipts.length}`} />
          <StatCard
            label="Avg Latency"
            value={`${avgLatency.toFixed(0)}ms`}
          />
          <StatCard
            label="Total Fees"
            value={`${receipts.reduce((s, r) => s + r.feeSats, 0)} sats`}
          />
        </div>

        <div className="p-4 border-t border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
            Receipts
          </h3>
          {receipts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No payments yet. Ask a question that requires L402 data.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {receipts.map((r, i) => (
                <div
                  key={i}
                  className="p-2 rounded bg-zinc-800/50 border border-zinc-800 text-xs"
                >
                  <div className="font-mono text-bitcoin mb-1">
                    ⚡ {r.totalCostSats} sats
                  </div>
                  <div className="text-zinc-400 truncate">{r.url}</div>
                  <div className="flex gap-3 mt-1 text-zinc-500">
                    <span>{r.latencyMs.toFixed(0)}ms</span>
                    <span>fee: {r.feeSats} sats</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className="text-sm font-mono text-zinc-200">{value}</div>
    </div>
  );
}
