import { describe, it, expect, beforeAll } from 'vitest';
import {
  WasmL402Client,
  WasmBudgetConfig,
  WasmL402Response,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('WasmBudgetConfig', () => {
  it('should construct with all params', () => {
    const budget = new WasmBudgetConfig(1000n, 5000n, 50000n, 1000000n);
    expect(budget.perRequestMax).toBe(1000n);
    expect(budget.hourlyMax).toBe(5000n);
    expect(budget.dailyMax).toBe(50000n);
    expect(budget.totalMax).toBe(1000000n);
  });

  it('should create unlimited budget', () => {
    const budget = WasmBudgetConfig.unlimited();
    expect(budget.perRequestMax).toBe(0n);
    expect(budget.hourlyMax).toBe(0n);
    expect(budget.dailyMax).toBe(0n);
    expect(budget.totalMax).toBe(0n);
  });

  it('should treat 0 as no limit', () => {
    const budget = new WasmBudgetConfig(500n, 0n, 0n, 0n);
    expect(budget.perRequestMax).toBe(500n);
    expect(budget.hourlyMax).toBe(0n);
  });
});

describe('WasmL402Client', () => {
  it('should construct via withLndRest', () => {
    const budget = WasmBudgetConfig.unlimited();
    const client = WasmL402Client.withLndRest(
      'https://localhost:8080',
      'deadbeefcafebabe',
      budget,
      100n
    );
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.receipts).toBe('function');
  });

  it('should construct via withSwissKnife', () => {
    const budget = WasmBudgetConfig.unlimited();
    const client = WasmL402Client.withSwissKnife(
      'https://app.numeraire.tech',
      'sk-test-key',
      budget,
      100n
    );
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
  });
});
