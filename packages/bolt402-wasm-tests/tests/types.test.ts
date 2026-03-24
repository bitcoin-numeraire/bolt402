import { describe, it, expect, beforeAll } from 'vitest';
import {
  WasmMockServer,
  WasmMockClient,
  WasmBudget,
  WasmResponse,
  WasmReceipt,
  WasmLndRestBackend,
  WasmSwissKnifeBackend,
  version,
  parseL402Challenge,
  buildL402Header,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('TypeScript type correctness', () => {
  it('should import all types without any casts', () => {
    // These imports would fail at compile time if .d.ts was incorrect
    expect(WasmMockServer).toBeDefined();
    expect(WasmMockClient).toBeDefined();
    expect(WasmBudget).toBeDefined();
    expect(WasmLndRestBackend).toBeDefined();
    expect(WasmSwissKnifeBackend).toBeDefined();
    expect(version).toBeDefined();
    expect(parseL402Challenge).toBeDefined();
    expect(buildL402Header).toBeDefined();
  });

  it('WasmReceipt fields have correct types', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);
    const resp = client.get('/api/data');
    const receipt: WasmReceipt = resp.receipt!;

    // bigint fields
    const amountSats: bigint = receipt.amountSats;
    const feeSats: bigint = receipt.feeSats;
    const timestamp: bigint = receipt.timestamp;
    const totalCost: bigint = receipt.totalCostSats();

    expect(typeof amountSats).toBe('bigint');
    expect(typeof feeSats).toBe('bigint');
    expect(typeof timestamp).toBe('bigint');
    expect(typeof totalCost).toBe('bigint');

    // number fields
    const responseStatus: number = receipt.responseStatus;
    expect(typeof responseStatus).toBe('number');

    // string fields
    const endpoint: string = receipt.endpoint;
    const paymentHash: string = receipt.paymentHash;
    const preimage: string = receipt.preimage;

    expect(typeof endpoint).toBe('string');
    expect(typeof paymentHash).toBe('string');
    expect(typeof preimage).toBe('string');
  });

  it('WasmResponse fields have correct types', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);
    const resp: WasmResponse = client.get('/api/data');

    const paid: boolean = resp.paid;
    const status: number = resp.status;
    const body: string = resp.body;
    const receipt: WasmReceipt | undefined = resp.receipt;

    expect(typeof paid).toBe('boolean');
    expect(typeof status).toBe('number');
    expect(typeof body).toBe('string');
    expect(receipt).toBeDefined();
  });

  it('WasmBudget fields have correct types', () => {
    const budget = new WasmBudget(100n, 500n, 2000n, 10000n);

    const perRequestMax: bigint | undefined = budget.perRequestMax;
    const hourlyMax: bigint | undefined = budget.hourlyMax;
    const dailyMax: bigint | undefined = budget.dailyMax;
    const totalMax: bigint | undefined = budget.totalMax;

    expect(perRequestMax).toBe(100n);
    expect(hourlyMax).toBe(500n);
    expect(dailyMax).toBe(2000n);
    expect(totalMax).toBe(10000n);
  });

  it('version returns string', () => {
    const v: string = version();
    expect(typeof v).toBe('string');
  });
});
