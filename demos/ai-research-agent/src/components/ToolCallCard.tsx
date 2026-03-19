"use client";

interface ToolCallCardProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  state: "call" | "result" | "partial-call";
}

export function ToolCallCard({
  toolName,
  args,
  result,
  state,
}: ToolCallCardProps) {
  const isLoading = state === "call" || state === "partial-call";

  return (
    <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden animate-fade-in-up">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <span className="text-bitcoin text-sm font-medium">⚡</span>
        <span className="text-sm font-mono text-zinc-300">{toolName}</span>
        {isLoading && (
          <span className="ml-auto flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bitcoin typing-dot-1" />
            <span className="w-1.5 h-1.5 rounded-full bg-bitcoin typing-dot-2" />
            <span className="w-1.5 h-1.5 rounded-full bg-bitcoin typing-dot-3" />
          </span>
        )}
        {!isLoading && result && (
          <span className="ml-auto text-xs text-emerald-400">✓ done</span>
        )}
      </div>

      {/* Arguments */}
      {args && Object.keys(args).length > 0 && (
        <div className="px-3 py-2 text-xs">
          <div className="text-zinc-500 mb-1">Input</div>
          <div className="font-mono text-zinc-400 space-y-0.5">
            {Object.entries(args).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-zinc-500">{key}:</span>
                <span className="text-zinc-300 truncate max-w-sm">
                  {typeof value === "string"
                    ? value
                    : JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="px-3 py-2 border-t border-zinc-800 text-xs">
          <div className="text-zinc-500 mb-1">Result</div>
          <ToolResult toolName={toolName} result={result} />
        </div>
      )}
    </div>
  );
}

function ToolResult({
  toolName,
  result,
}: {
  toolName: string;
  result: Record<string, unknown>;
}) {
  if (toolName === "l402_fetch") {
    const paid = result.paid as boolean;
    const receipt = result.receipt as Record<string, unknown> | null;
    const status = result.status as number;

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-mono ${
              status >= 200 && status < 300
                ? "bg-emerald-900/50 text-emerald-400"
                : "bg-red-900/50 text-red-400"
            }`}
          >
            {status}
          </span>
          {paid && receipt && (
            <span className="text-bitcoin font-mono">
              ⚡ {receipt.totalCostSats as number} sats
              <span className="text-zinc-500 ml-1">
                ({receipt.amountSats as number} + {receipt.feeSats as number}{" "}
                fee)
              </span>
            </span>
          )}
          {!paid && (
            <span className="text-zinc-500">No payment required</span>
          )}
        </div>
        {receipt && (
          <div className="text-zinc-500 font-mono">
            {(receipt.latencyMs as number).toFixed(0)}ms
          </div>
        )}
      </div>
    );
  }

  if (toolName === "l402_get_balance") {
    return (
      <div className="flex items-center gap-3 text-zinc-300 font-mono">
        <span>⚡ {(result.balanceSats as number).toLocaleString()} sats</span>
        <span className="text-zinc-500">|</span>
        <span className="text-zinc-400">
          {result.nodeAlias as string}
        </span>
        <span className="text-zinc-500">
          ({result.activeChannels as number} channels)
        </span>
      </div>
    );
  }

  if (toolName === "l402_get_receipts") {
    const totalSpent = result.totalSpentSats as number;
    const count = result.paymentCount as number;
    return (
      <div className="text-zinc-300 font-mono">
        ⚡ {totalSpent.toLocaleString()} sats total across {count} payment
        {count !== 1 ? "s" : ""}
      </div>
    );
  }

  return (
    <pre className="text-zinc-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-40">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}
