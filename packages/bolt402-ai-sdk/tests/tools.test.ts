import { describe, expect, it, vi } from 'vitest';
import { createBolt402Tools } from '../src/tools.js';
import type { LnBackend, NodeInfo, PaymentResult } from '../src/types.js';

/** Creates a mock LnBackend for testing tools. */
function createMockBackend(): LnBackend {
  return {
    payInvoice: vi.fn().mockResolvedValue({
      preimage: 'abc123',
      paymentHash: 'def456',
      amountSats: 50,
      feeSats: 1,
    } satisfies PaymentResult),
    getBalance: vi.fn().mockResolvedValue(500_000),
    getInfo: vi.fn().mockResolvedValue({
      pubkey: '02abc123',
      alias: 'test-node',
      numActiveChannels: 3,
    } satisfies NodeInfo),
  };
}

/** Creates a mock fetch for testing. */
function createMockFetch(responses: Array<{ status: number; headers?: Record<string, string>; body?: string }>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return new Response(resp.body ?? '', {
      status: resp.status,
      headers: new Headers(resp.headers ?? {}),
    });
  });
}

describe('createBolt402Tools', () => {
  it('returns all three tools', () => {
    const tools = createBolt402Tools({
      backend: createMockBackend(),
      fetchFn: createMockFetch([]),
    });

    expect(tools).toHaveProperty('l402_fetch');
    expect(tools).toHaveProperty('l402_get_balance');
    expect(tools).toHaveProperty('l402_get_receipts');
  });

  describe('l402_fetch', () => {
    it('fetches a free URL', async () => {
      const mockFetch = createMockFetch([{ status: 200, body: '{"data": "free"}' }]);
      const tools = createBolt402Tools({
        backend: createMockBackend(),
        fetchFn: mockFetch,
      });

      const result = await tools.l402_fetch.execute(
        { url: 'https://api.example.com/free', method: 'GET' },
        { toolCallId: 'test-1', messages: [] },
      );

      expect(result.status).toBe(200);
      expect(result.body).toBe('{"data": "free"}');
      expect(result.paid).toBe(false);
      expect(result.receipt).toBeNull();
    });

    it('handles L402 payment flow', async () => {
      const mockFetch = createMockFetch([
        {
          status: 402,
          headers: { 'www-authenticate': 'L402 macaroon="bWFj", invoice="lnbc50n1test"' },
        },
        { status: 200, body: '{"data": "premium"}' },
      ]);
      const tools = createBolt402Tools({
        backend: createMockBackend(),
        fetchFn: mockFetch,
      });

      const result = await tools.l402_fetch.execute(
        { url: 'https://api.example.com/paid', method: 'GET' },
        { toolCallId: 'test-2', messages: [] },
      );

      expect(result.status).toBe(200);
      expect(result.body).toBe('{"data": "premium"}');
      expect(result.paid).toBe(true);
      expect(result.receipt).not.toBeNull();
      expect(result.receipt!.amountSats).toBe(50);
      expect(result.receipt!.totalCostSats).toBe(51);
    });
  });

  describe('l402_get_balance', () => {
    it('returns balance and node info', async () => {
      const tools = createBolt402Tools({
        backend: createMockBackend(),
        fetchFn: createMockFetch([]),
      });

      const result = await tools.l402_get_balance.execute(
        {},
        { toolCallId: 'test-3', messages: [] },
      );

      expect(result.balanceSats).toBe(500_000);
      expect(result.nodeAlias).toBe('test-node');
      expect(result.activeChannels).toBe(3);
    });
  });

  describe('l402_get_receipts', () => {
    it('returns empty receipts initially', async () => {
      const tools = createBolt402Tools({
        backend: createMockBackend(),
        fetchFn: createMockFetch([]),
      });

      const result = await tools.l402_get_receipts.execute(
        {},
        { toolCallId: 'test-4', messages: [] },
      );

      expect(result.totalSpentSats).toBe(0);
      expect(result.paymentCount).toBe(0);
      expect(result.receipts).toEqual([]);
    });

    it('returns receipts after payments', async () => {
      const mockFetch = createMockFetch([
        {
          status: 402,
          headers: { 'www-authenticate': 'L402 macaroon="bWFj", invoice="lnbc50n1test"' },
        },
        { status: 200, body: 'ok' },
      ]);
      const tools = createBolt402Tools({
        backend: createMockBackend(),
        fetchFn: mockFetch,
      });

      // Make a paid request first
      await tools.l402_fetch.execute(
        { url: 'https://api.example.com/paid', method: 'GET' },
        { toolCallId: 'test-5', messages: [] },
      );

      const result = await tools.l402_get_receipts.execute(
        {},
        { toolCallId: 'test-6', messages: [] },
      );

      expect(result.totalSpentSats).toBe(51);
      expect(result.paymentCount).toBe(1);
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0].url).toBe('https://api.example.com/paid');
      expect(result.receipts[0].amountSats).toBe(50);
    });
  });
});
