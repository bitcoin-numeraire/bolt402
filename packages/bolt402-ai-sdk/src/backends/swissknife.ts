/**
 * SwissKnife REST backend adapter.
 *
 * Wraps the Rust SwissKnifeBackend from bolt402-wasm.
 */

import type { LnBackend, NodeInfo, PaymentResult } from '../types.js';

type WasmModule = typeof import('bolt402-wasm');

let wasmModule: WasmModule | null = null;
let wasmInitPromise: Promise<WasmModule | null> | null = null;

async function loadWasm(): Promise<WasmModule | null> {
  if (wasmModule) return wasmModule;
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const wasm = await import('bolt402-wasm');
        if (typeof wasm.default === 'function') {
          await wasm.default();
        }
        wasmModule = wasm;
        return wasm;
      } catch {
        return null;
      }
    })();
  }
  return wasmInitPromise;
}

/** Configuration for the SwissKnife backend. */
export interface SwissKnifeBackendConfig {
  /** SwissKnife API URL (e.g., 'https://app.numeraire.tech'). */
  url: string;
  /** API key for authentication. */
  apiKey: string;
}

/**
 * SwissKnife REST API backend.
 *
 * Uses the Rust SwissKnifeBackend compiled to WASM.
 */
export class SwissKnifeBackend implements LnBackend {
  private readonly config: SwissKnifeBackendConfig;
  private inner: InstanceType<WasmModule['WasmSwissKnifeBackend']> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SwissKnifeBackendConfig) {
    this.config = config;
  }

  private async ensureInit(): Promise<InstanceType<WasmModule['WasmSwissKnifeBackend']>> {
    if (this.inner) return this.inner;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        const wasm = await loadWasm();
        if (!wasm) {
          throw new Error('bolt402-wasm module failed to load. SwissKnife backend requires WASM support.');
        }
        this.inner = new wasm.WasmSwissKnifeBackend(this.config.url, this.config.apiKey);
      })();
    }

    await this.initPromise;
    return this.inner!;
  }

  async payInvoice(bolt11: string, maxFeeSats: number): Promise<PaymentResult> {
    const backend = await this.ensureInit();
    const result = await backend.payInvoice(bolt11, BigInt(maxFeeSats));
    return {
      preimage: result.preimage as string,
      paymentHash: result.paymentHash as string,
      amountSats: Number(result.amountSats),
      feeSats: Number(result.feeSats),
    };
  }

  async getBalance(): Promise<number> {
    const backend = await this.ensureInit();
    return Number(await backend.getBalance());
  }

  async getInfo(): Promise<NodeInfo> {
    const backend = await this.ensureInit();
    const info = await backend.getInfo();
    return {
      pubkey: info.pubkey as string,
      alias: info.alias as string,
      numActiveChannels: Number(info.numActiveChannels),
    };
  }
}
