import { describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetTracker } from '../src/budget.js';

describe('BudgetTracker', () => {
  it('allows payments with no limits', () => {
    const tracker = new BudgetTracker();
    expect(() => tracker.checkAndRecord(1_000_000)).not.toThrow();
    expect(tracker.getTotalSpent()).toBe(1_000_000);
  });

  it('blocks payment exceeding per-request max', () => {
    const tracker = new BudgetTracker({ perRequestMax: 100 });
    expect(() => tracker.checkAndRecord(101)).toThrow(BudgetExceededError);
    expect(() => tracker.checkAndRecord(101)).toThrow(/per-request/);
  });

  it('allows payment within per-request max', () => {
    const tracker = new BudgetTracker({ perRequestMax: 100 });
    expect(() => tracker.checkAndRecord(100)).not.toThrow();
    expect(tracker.getTotalSpent()).toBe(100);
  });

  it('blocks payment exceeding total max', () => {
    const tracker = new BudgetTracker({ totalMax: 500 });
    tracker.checkAndRecord(300);
    tracker.checkAndRecord(100);
    expect(() => tracker.checkAndRecord(200)).toThrow(BudgetExceededError);
    expect(() => tracker.checkAndRecord(200)).toThrow(/total/);
  });

  it('tracks payment count', () => {
    const tracker = new BudgetTracker();
    tracker.checkAndRecord(10);
    tracker.checkAndRecord(20);
    tracker.checkAndRecord(30);
    expect(tracker.getPaymentCount()).toBe(3);
    expect(tracker.getTotalSpent()).toBe(60);
  });

  it('blocks payment exceeding daily max', () => {
    const tracker = new BudgetTracker({ dailyMax: 1000 });
    tracker.checkAndRecord(600);
    tracker.checkAndRecord(300);
    expect(() => tracker.checkAndRecord(200)).toThrow(BudgetExceededError);
    expect(() => tracker.checkAndRecord(200)).toThrow(/daily/);
  });

  it('blocks payment exceeding hourly max', () => {
    const tracker = new BudgetTracker({ hourlyMax: 500 });
    tracker.checkAndRecord(300);
    tracker.checkAndRecord(100);
    expect(() => tracker.checkAndRecord(200)).toThrow(BudgetExceededError);
    expect(() => tracker.checkAndRecord(200)).toThrow(/hourly/);
  });

  it('allows exact limit', () => {
    const tracker = new BudgetTracker({ perRequestMax: 100, totalMax: 100 });
    expect(() => tracker.checkAndRecord(100)).not.toThrow();
  });

  it('BudgetExceededError has correct properties', () => {
    const err = new BudgetExceededError('total', 600, 500);
    expect(err.name).toBe('BudgetExceededError');
    expect(err.limit).toBe('total');
    expect(err.current).toBe(600);
    expect(err.max).toBe(500);
    expect(err.message).toContain('total');
    expect(err.message).toContain('600');
    expect(err.message).toContain('500');
  });
});
