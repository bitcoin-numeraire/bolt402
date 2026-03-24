import { describe, it, expect, beforeAll } from 'vitest';
import {
  WasmBudget,
  WasmMockServer,
  WasmMockClient,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('WasmBudget', () => {
  it('should construct with all params and expose fields', () => {
    const budget = new WasmBudget(100n, 500n, 2000n, 10000n);

    expect(budget.perRequestMax).toBe(100n);
    expect(budget.hourlyMax).toBe(500n);
    expect(budget.dailyMax).toBe(2000n);
    expect(budget.totalMax).toBe(10000n);
  });

  it('should create unlimited budget', () => {
    const budget = WasmBudget.unlimited();

    expect(budget.perRequestMax).toBeUndefined();
    expect(budget.hourlyMax).toBeUndefined();
    expect(budget.dailyMax).toBeUndefined();
    expect(budget.totalMax).toBeUndefined();
  });

  it('should support partial limits', () => {
    const budget = new WasmBudget(50n, null, null, 1000n);

    expect(budget.perRequestMax).toBe(50n);
    expect(budget.hourlyMax).toBeUndefined();
    expect(budget.dailyMax).toBeUndefined();
    expect(budget.totalMax).toBe(1000n);
  });
});

describe('WasmMockClient.withBudget', () => {
  it('should throw when request exceeds per-request budget', () => {
    const server = new WasmMockServer({ '/api/expensive': 500n });
    const budget = new WasmBudget(100n, null, null, null);
    const client = WasmMockClient.withBudget(server, 10n, budget);

    expect(() => client.get('/api/expensive')).toThrow();
  });

  it('should allow requests within budget', () => {
    const server = new WasmMockServer({ '/api/cheap': 10n });
    const budget = new WasmBudget(100n, null, null, null);
    const client = WasmMockClient.withBudget(server, 10n, budget);

    const resp = client.get('/api/cheap');
    expect(resp.status).toBe(200);
    expect(resp.paid).toBe(true);
  });

  it('should throw when total budget is exceeded', () => {
    const server = new WasmMockServer({ '/api/data': 60n });
    const budget = new WasmBudget(null, null, null, 100n);
    const client = WasmMockClient.withBudget(server, 10n, budget);

    // First request: 60 sats — within budget
    const resp = client.get('/api/data');
    expect(resp.status).toBe(200);

    // Clear cache to force new payment
    client.clearCache();

    // Second request: another 60 sats — exceeds 100 total
    expect(() => client.get('/api/data')).toThrow();
  });
});
