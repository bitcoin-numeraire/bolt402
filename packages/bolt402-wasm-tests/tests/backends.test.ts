import { describe, it, expect, beforeAll } from 'vitest';
import {
  WasmLndRestBackend,
  WasmSwissKnifeBackend,
  WasmClnRestBackend,
} from '@bolt402/bolt402-wasm';
import { ensureInit } from './setup.js';

beforeAll(() => {
  ensureInit();
});

describe('WasmLndRestBackend', () => {
  it('should construct without throwing', () => {
    const backend = new WasmLndRestBackend(
      'https://localhost:8080',
      'deadbeefcafebabe'
    );
    expect(backend).toBeDefined();
  });

  it('should have payInvoice, getBalance, getInfo methods', () => {
    const backend = new WasmLndRestBackend(
      'https://localhost:8080',
      'deadbeefcafebabe'
    );
    expect(typeof backend.payInvoice).toBe('function');
    expect(typeof backend.getBalance).toBe('function');
    expect(typeof backend.getInfo).toBe('function');
  });
});

describe('WasmSwissKnifeBackend', () => {
  it('should construct without throwing', () => {
    const backend = new WasmSwissKnifeBackend(
      'https://app.numeraire.tech',
      'sk-test-key'
    );
    expect(backend).toBeDefined();
  });

  it('should have payInvoice, getBalance, getInfo methods', () => {
    const backend = new WasmSwissKnifeBackend(
      'https://app.numeraire.tech',
      'sk-test-key'
    );
    expect(typeof backend.payInvoice).toBe('function');
    expect(typeof backend.getBalance).toBe('function');
    expect(typeof backend.getInfo).toBe('function');
  });
});

describe('WasmClnRestBackend', () => {
  it('should construct without throwing', () => {
    const backend = new WasmClnRestBackend(
      'https://localhost:3001',
      'deadbeefcafebabe'
    );
    expect(backend).toBeDefined();
  });

  it('should construct with rune via static method', () => {
    const backend = WasmClnRestBackend.withRune(
      'https://localhost:3001',
      'test-rune-string'
    );
    expect(backend).toBeDefined();
  });

  it('should have payInvoice, getBalance, getInfo methods', () => {
    const backend = new WasmClnRestBackend(
      'https://localhost:3001',
      'deadbeefcafebabe'
    );
    expect(typeof backend.payInvoice).toBe('function');
    expect(typeof backend.getBalance).toBe('function');
    expect(typeof backend.getInfo).toBe('function');
  });
});
