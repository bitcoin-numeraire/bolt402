/**
 * Lightning backend factory.
 *
 * Creates the appropriate LnBackend based on environment configuration.
 * Defaults to MockBackend for demo purposes.
 */

import { LndBackend, SwissKnifeBackend } from "bolt402-ai-sdk";
import type { LnBackend, NodeInfo, PaymentResult } from "bolt402-ai-sdk";
import { randomBytes } from "crypto";

/**
 * Mock Lightning backend for demo purposes.
 *
 * Simulates Lightning payments with realistic delays and random costs.
 * No real Lightning node required.
 */
class MockBackend implements LnBackend {
  private balance = 1_000_000; // 1M sats starting balance

  async payInvoice(
    _bolt11: string,
    _maxFeeSats: number
  ): Promise<PaymentResult> {
    // Simulate network delay (300-800ms)
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

    const amountSats = 10 + Math.floor(Math.random() * 90);
    const feeSats = Math.floor(Math.random() * 5);
    this.balance -= amountSats + feeSats;

    return {
      preimage: randomBytes(32).toString("hex"),
      paymentHash: randomBytes(32).toString("hex"),
      amountSats,
      feeSats,
    };
  }

  async getBalance(): Promise<number> {
    return this.balance;
  }

  async getInfo(): Promise<NodeInfo> {
    return {
      pubkey:
        "02" + randomBytes(32).toString("hex"),
      alias: "bolt402-demo-node",
      numActiveChannels: 3,
    };
  }
}

/** Create a Lightning backend from environment variables. */
export function createBackend(): LnBackend {
  const backendType = process.env.BOLT402_BACKEND ?? "mock";

  switch (backendType) {
    case "lnd": {
      const url = process.env.BOLT402_LND_URL;
      const macaroon = process.env.BOLT402_LND_MACAROON;
      if (!url || !macaroon) {
        throw new Error(
          "BOLT402_LND_URL and BOLT402_LND_MACAROON are required for LND backend"
        );
      }
      return new LndBackend({ url, macaroon });
    }

    case "swissknife": {
      const url = process.env.BOLT402_SWISSKNIFE_URL;
      const apiKey = process.env.BOLT402_SWISSKNIFE_API_KEY;
      if (!url || !apiKey) {
        throw new Error(
          "BOLT402_SWISSKNIFE_URL and BOLT402_SWISSKNIFE_API_KEY are required for SwissKnife backend"
        );
      }
      return new SwissKnifeBackend({ url, apiKey });
    }

    case "mock":
    default:
      return new MockBackend();
  }
}

/** Get budget configuration from environment variables. */
export function getBudgetConfig() {
  const perRequestMax = process.env.BOLT402_BUDGET_PER_REQUEST
    ? parseInt(process.env.BOLT402_BUDGET_PER_REQUEST, 10)
    : undefined;
  const totalMax = process.env.BOLT402_BUDGET_TOTAL
    ? parseInt(process.env.BOLT402_BUDGET_TOTAL, 10)
    : undefined;

  if (!perRequestMax && !totalMax) return undefined;

  return { perRequestMax, totalMax };
}
