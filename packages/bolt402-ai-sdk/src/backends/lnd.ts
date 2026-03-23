/**
 * LND REST backend adapter.
 *
 * Wraps the Rust LndRestBackend from bolt402-wasm. The actual HTTP client
 * and LND protocol logic lives in Rust, compiled to WASM via reqwest.
 */

import type { LnBackend, NodeInfo, PaymentResult } from '../types.js';

// WASM types loaded dynamically
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

/** Configuration for the LND REST backend. */
export interface LndBackendConfig {
  /** LND REST API URL (e.g., 'https://localhost:8080'). */
  url: string;
  /** Hex-encoded admin macaroon. */
  macaroon: string;
}

/**
 * LND REST API backend.
 *
 * Uses the Rust LndRestBackend compiled to WASM. All HTTP requests to LND
 * go through the Rust reqwest client (which uses browser fetch on WASM).
 */
export class LndBackend implements LnBackend {
  private readonly config: LndBackendConfig;
  private inner: InstanceType<WasmModule['WasmLndRestBackend']> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: LndBackendConfig) {
    this.config = config;
  }

  private async ensureInit(): Promise<InstanceType<WasmModule['WasmLndRestBackend']>> {
    if (this.inner) return this.inner;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        const wasm = await loadWasm();
        if (!wasm) {
          throw new Error('bolt402-wasm module failed to load. LND backend requires WASM support.');
        }
        this.inner = new wasm.WasmLndRestBackend(this.config.url, this.config.macaroon);
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
