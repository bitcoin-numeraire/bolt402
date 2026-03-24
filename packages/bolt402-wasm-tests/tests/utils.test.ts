import { describe, it, expect, beforeAll } from 'vitest';
import {
  version,
  parseL402Challenge,
  buildL402Header,
  setPanicHook,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('version', () => {
  it('should return a non-empty string', () => {
    const v = version();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('parseL402Challenge', () => {
  it('should parse a valid L402 challenge header', () => {
    const header = 'L402 macaroon="YWJjZGVm", invoice="lnbc1..."';
    const result = parseL402Challenge(header);

    expect(result).toBeDefined();
    expect(result.macaroon).toBe('YWJjZGVm');
    expect(result.invoice).toBe('lnbc1...');
  });

  it('should throw on invalid input', () => {
    expect(() => parseL402Challenge('')).toThrow();
    expect(() => parseL402Challenge('Bearer token123')).toThrow();
  });
});

describe('buildL402Header', () => {
  it('should construct a proper L402 Authorization header', () => {
    const header = buildL402Header('YWJjZGVm', 'abcdef1234567890');

    expect(typeof header).toBe('string');
    expect(header).toContain('L402');
    expect(header).toContain('YWJjZGVm');
    expect(header).toContain('abcdef1234567890');
  });
});

describe('setPanicHook', () => {
  it('should not throw when called', () => {
    expect(() => setPanicHook()).not.toThrow();
  });

  it('should be idempotent (safe to call multiple times)', () => {
    expect(() => {
      setPanicHook();
      setPanicHook();
    }).not.toThrow();
  });
});
