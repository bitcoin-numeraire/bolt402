import { describe, expect, it, vi } from 'vitest';
import { L402Client, L402Error, parseL402Challenge } from '../src/l402-client.js';
import type { LnBackend, NodeInfo, PaymentResult } from '../src/types.js';

/** Creates a mock LnBackend that returns configurable results. */
function createMockBackend(overrides: Partial<LnBackend> = {}): LnBackend {
  return {
    payInvoice: vi.fn().mockResolvedValue({
      preimage: 'abc123preimage',
      paymentHash: 'def456hash',
      amountSats: 100,
      feeSats: 1,
    } satisfies PaymentResult),
    getBalance: vi.fn().mockResolvedValue(1_000_000),
    getInfo: vi.fn().mockResolvedValue({
      pubkey: 'mock_pubkey',
      alias: 'mock_node',
      numActiveChannels: 5,
    } satisfies NodeInfo),
    ...overrides,
  };
}

/** Creates a mock fetch that returns configurable responses. */
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

describe('parseL402Challenge', () => {
  it('parses standard format with quoted params', () => {
    const header = 'L402 macaroon="YWJjZGVm", invoice="lnbc100n1test"';
    const challenge = parseL402Challenge(header);
    expect(challenge).toEqual({
      macaroon: 'YWJjZGVm',
      invoice: 'lnbc100n1test',
    });
  });

  it('parses compact format', () => {
    const header = 'L402 YWJjZGVm:lnbc100n1test';
    const challenge = parseL402Challenge(header);
    expect(challenge).toEqual({
      macaroon: 'YWJjZGVm',
      invoice: 'lnbc100n1test',
    });
  });

  it('parses LSAT format (legacy)', () => {
    const header = 'LSAT YWJjZGVm:lnbc100n1test';
    const challenge = parseL402Challenge(header);
    expect(challenge).toEqual({
      macaroon: 'YWJjZGVm',
      invoice: 'lnbc100n1test',
    });
  });

  it('returns null for invalid header', () => {
    expect(parseL402Challenge('Bearer token123')).toBeNull();
    expect(parseL402Challenge('')).toBeNull();
    expect(parseL402Challenge('L402')).toBeNull();
  });
});

describe('L402Client', () => {
  it('returns response directly for non-402 status', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([{ status: 200, body: '{"data": "ok"}' }]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    const response = await client.get('https://api.example.com/free');

    expect(response.status).toBe(200);
    expect(response.body).toBe('{"data": "ok"}');
    expect(response.paid).toBe(false);
    expect(response.receipt).toBeNull();
    expect(backend.payInvoice).not.toHaveBeenCalled();
  });

  it('handles full L402 flow: 402 -> pay -> retry', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      // First request: 402 with L402 challenge
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFjYXJvb24=", invoice="lnbc100n1test"' },
        body: 'Payment Required',
      },
      // Retry after payment: 200
      {
        status: 200,
        body: '{"data": "premium content"}',
      },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    const response = await client.get('https://api.example.com/paid');

    expect(response.status).toBe(200);
    expect(response.body).toBe('{"data": "premium content"}');
    expect(response.paid).toBe(true);
    expect(response.receipt).not.toBeNull();
    expect(response.receipt!.amountSats).toBe(100);
    expect(response.receipt!.feeSats).toBe(1);
    expect(response.receipt!.totalCostSats).toBe(101);
    expect(backend.payInvoice).toHaveBeenCalledWith('lnbc100n1test', 100);
  });

  it('uses cached token on second request', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      // First request: 402
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFjYXJvb24=", invoice="lnbc100n1test"' },
      },
      // Retry: 200
      { status: 200, body: 'first' },
      // Second request (with cached token): 200 directly
      { status: 200, body: 'second' },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await client.get('https://api.example.com/paid');
    const second = await client.get('https://api.example.com/paid');

    expect(second.status).toBe(200);
    expect(second.body).toBe('second');
    expect(second.paid).toBe(false);
    // Payment should only happen once
    expect(backend.payInvoice).toHaveBeenCalledTimes(1);
  });

  it('removes cached token if server rejects it and re-pays', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      // First call: 402 with challenge (initial, no cache)
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFjMQ==", invoice="lnbc100n1first"' },
      },
      // Second call: retry after payment, 200 (success, token cached)
      { status: 200, body: 'first-ok' },
      // Third call: use cached token, but server rejects it (402)
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFjMg==", invoice="lnbc100n1second"' },
      },
      // Fourth call: request without auth, 402 again with new challenge
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFjMg==", invoice="lnbc100n1second"' },
      },
      // Fifth call: retry after new payment, 200
      { status: 200, body: 'second-ok' },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    // First request populates the cache
    const first = await client.get('https://api.example.com/paid');
    expect(first.status).toBe(200);
    expect(first.paid).toBe(true);

    // Second request: cached token is rejected, client re-pays
    const second = await client.get('https://api.example.com/paid');
    expect(second.status).toBe(200);
    expect(second.paid).toBe(true);
    expect(backend.payInvoice).toHaveBeenCalledTimes(2);
  });

  it('throws on 402 without WWW-Authenticate header', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([{ status: 402, body: 'Payment Required' }]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await expect(client.get('https://api.example.com/broken')).rejects.toThrow(L402Error);
    await expect(client.get('https://api.example.com/broken')).rejects.toThrow(
      /no WWW-Authenticate/,
    );
  });

  it('throws on invalid L402 challenge', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      { status: 402, headers: { 'www-authenticate': 'Bearer invalid' }, body: 'Payment Required' },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await expect(client.get('https://api.example.com/broken')).rejects.toThrow(L402Error);
  });

  it('throws when retry after payment still returns 402', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFj", invoice="lnbc100n1test"' },
      },
      { status: 402, body: 'Still requires payment' },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await expect(client.get('https://api.example.com/broken')).rejects.toThrow(/402 again/);
  });

  it('records receipts', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([
      {
        status: 402,
        headers: { 'www-authenticate': 'L402 macaroon="bWFj", invoice="lnbc100n1test"' },
      },
      { status: 200, body: 'ok' },
    ]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await client.get('https://api.example.com/paid');

    const receipts = client.getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].url).toBe('https://api.example.com/paid');
    expect(receipts[0].amountSats).toBe(100);
    expect(receipts[0].feeSats).toBe(1);
    expect(receipts[0].totalCostSats).toBe(101);
    expect(receipts[0].httpStatus).toBe(200);
    expect(receipts[0].timestamp).toBeDefined();
  });

  it('tracks total spent', async () => {
    const backend = createMockBackend();
    let reqCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      reqCount++;
      if (reqCount % 2 === 1) {
        return new Response('', {
          status: 402,
          headers: new Headers({
            'www-authenticate': 'L402 macaroon="bWFj", invoice="lnbc100n1test"',
          }),
        });
      }
      return new Response('ok', { status: 200 });
    });

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    await client.get('https://api.example.com/a');
    expect(client.getTotalSpent()).toBe(101); // 100 + 1 fee
  });

  it('sends POST with body', async () => {
    const backend = createMockBackend();
    const mockFetch = createMockFetch([{ status: 200, body: 'created' }]);

    const client = new L402Client({
      backend,
      fetchFn: mockFetch,
    });

    const response = await client.post('https://api.example.com/create', '{"name": "test"}');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/create',
      expect.objectContaining({
        method: 'POST',
        body: '{"name": "test"}',
      }),
    );
  });

  it('starts with empty receipts', () => {
    const backend = createMockBackend();
    const client = new L402Client({
      backend,
      fetchFn: createMockFetch([]),
    });

    expect(client.getReceipts()).toEqual([]);
    expect(client.getTotalSpent()).toBe(0);
  });
});
