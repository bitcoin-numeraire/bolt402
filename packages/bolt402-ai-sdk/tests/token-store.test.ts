import { describe, expect, it } from 'vitest';
import { InMemoryTokenStore } from '../src/token-store.js';

describe('InMemoryTokenStore', () => {
  it('returns null for unknown endpoint', async () => {
    const store = new InMemoryTokenStore();
    const result = await store.get('https://example.com');
    expect(result).toBeNull();
  });

  it('stores and retrieves a token', async () => {
    const store = new InMemoryTokenStore();
    await store.put('https://example.com', 'mac1', 'pre1');

    const result = await store.get('https://example.com');
    expect(result).toEqual({ macaroon: 'mac1', preimage: 'pre1' });
  });

  it('removes a token', async () => {
    const store = new InMemoryTokenStore();
    await store.put('https://example.com', 'mac1', 'pre1');
    await store.remove('https://example.com');

    const result = await store.get('https://example.com');
    expect(result).toBeNull();
  });

  it('clears all tokens', async () => {
    const store = new InMemoryTokenStore();
    await store.put('https://a.com', 'mac1', 'pre1');
    await store.put('https://b.com', 'mac2', 'pre2');

    expect(store.size).toBe(2);

    await store.clear();

    expect(store.size).toBe(0);
    expect(await store.get('https://a.com')).toBeNull();
    expect(await store.get('https://b.com')).toBeNull();
  });

  it('evicts oldest entry when at capacity', async () => {
    const store = new InMemoryTokenStore(2);
    await store.put('https://a.com', 'mac1', 'pre1');
    await store.put('https://b.com', 'mac2', 'pre2');
    await store.put('https://c.com', 'mac3', 'pre3');

    // a.com should be evicted (oldest)
    expect(await store.get('https://a.com')).toBeNull();
    expect(await store.get('https://b.com')).toEqual({ macaroon: 'mac2', preimage: 'pre2' });
    expect(await store.get('https://c.com')).toEqual({ macaroon: 'mac3', preimage: 'pre3' });
  });

  it('refreshes LRU position on get', async () => {
    const store = new InMemoryTokenStore(2);
    await store.put('https://a.com', 'mac1', 'pre1');
    await store.put('https://b.com', 'mac2', 'pre2');

    // Access a.com to make it most recently used
    await store.get('https://a.com');

    // Adding c.com should evict b.com (now the oldest)
    await store.put('https://c.com', 'mac3', 'pre3');

    expect(await store.get('https://a.com')).toEqual({ macaroon: 'mac1', preimage: 'pre1' });
    expect(await store.get('https://b.com')).toBeNull();
  });

  it('overwrites existing token', async () => {
    const store = new InMemoryTokenStore();
    await store.put('https://example.com', 'mac1', 'pre1');
    await store.put('https://example.com', 'mac2', 'pre2');

    const result = await store.get('https://example.com');
    expect(result).toEqual({ macaroon: 'mac2', preimage: 'pre2' });
    expect(store.size).toBe(1);
  });
});
