import { describe, it, expect, beforeAll } from 'vitest';
import {
  WasmMockServer,
  WasmMockClient,
  WasmResponse,
  WasmReceipt,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('WasmMockServer', () => {
  it('should construct with endpoint config and expose paths', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const paths = server.endpointPaths();
    expect(paths).toContain('/api/data');
    expect(paths).toHaveLength(1);
  });

  it('should have initial balance', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    expect(typeof server.balance).toBe('bigint');
  });

  it('should support multiple endpoints', () => {
    const server = new WasmMockServer({
      '/api/data': 10n,
      '/api/premium': 100n,
      '/api/cheap': 1n,
    });
    const paths = server.endpointPaths();
    expect(paths).toHaveLength(3);
    expect(paths).toContain('/api/data');
    expect(paths).toContain('/api/premium');
    expect(paths).toContain('/api/cheap');
  });
});

describe('WasmMockClient', () => {
  it('should GET a paid endpoint and receive status 200', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);
    const resp: WasmResponse = client.get('/api/data');

    expect(resp.status).toBe(200);
    expect(resp.paid).toBe(true);
    expect(resp.receipt).toBeDefined();
  });

  it('should POST to an endpoint', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);
    const resp: WasmResponse = client.post('/api/data');

    expect(resp.status).toBe(200);
    expect(resp.paid).toBe(true);
  });

  it('should have a receipt with correct fields', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);
    const resp = client.get('/api/data');
    const receipt: WasmReceipt = resp.receipt!;

    expect(receipt.endpoint).toBe('/api/data');
    expect(receipt.amountSats).toBe(10n);
    expect(typeof receipt.feeSats).toBe('bigint');
    expect(typeof receipt.timestamp).toBe('bigint');
    expect(receipt.responseStatus).toBe(200);
    expect(typeof receipt.paymentHash).toBe('string');
    expect(receipt.paymentHash.length).toBeGreaterThan(0);
    expect(typeof receipt.preimage).toBe('string');
    expect(receipt.preimage.length).toBeGreaterThan(0);
  });

  it('should cache tokens — second request does NOT generate new receipt', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);

    client.get('/api/data');
    expect(client.paymentCount).toBe(1);

    client.get('/api/data');
    expect(client.paymentCount).toBe(1);
  });

  it('should generate new payment after clearCache', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);

    client.get('/api/data');
    expect(client.paymentCount).toBe(1);

    client.clearCache();

    client.get('/api/data');
    expect(client.paymentCount).toBe(2);
  });

  it('should track receipts, totalSpent, and paymentCount', () => {
    const server = new WasmMockServer({
      '/api/data': 10n,
      '/api/premium': 50n,
    });
    const client = new WasmMockClient(server, 100n);

    client.get('/api/data');
    client.get('/api/premium');

    expect(client.paymentCount).toBe(2);
    expect(client.totalSpent).toBeGreaterThanOrEqual(60n);

    const receipts: WasmReceipt[] = client.receipts();
    expect(receipts).toHaveLength(2);
  });

  it('should handle multiple endpoints with different prices', () => {
    const server = new WasmMockServer({
      '/api/cheap': 1n,
      '/api/expensive': 1000n,
    });
    const client = new WasmMockClient(server, 100n);

    const cheapResp = client.get('/api/cheap');
    const expensiveResp = client.get('/api/expensive');

    expect(cheapResp.receipt!.amountSats).toBe(1n);
    expect(expensiveResp.receipt!.amountSats).toBe(1000n);
  });

  it('should fail for unconfigured path', () => {
    const server = new WasmMockServer({ '/api/data': 10n });
    const client = new WasmMockClient(server, 100n);

    // The mock server returns an error response for unconfigured paths
    const resp = client.get('/api/nonexistent');
    expect(resp.status).not.toBe(200);
    expect(resp.paid).toBe(false);
  });
});
