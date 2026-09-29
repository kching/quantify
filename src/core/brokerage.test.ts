import { describe, expect, it } from 'bun:test';
import { calculateBrokerage } from './brokerage';

describe('calculateBrokerage', () => {
  it('applies each brokerage tier at its boundaries', () => {
    expect(calculateBrokerage(1_000)).toBe(5);
    expect(calculateBrokerage(1_000.01)).toBe(10);
    expect(calculateBrokerage(3_000)).toBe(10);
    expect(calculateBrokerage(3_000.01)).toBe(19.95);
    expect(calculateBrokerage(10_000)).toBe(19.95);
    expect(calculateBrokerage(10_000.01)).toBe(29.95);
    expect(calculateBrokerage(25_000)).toBe(29.95);
    expect(calculateBrokerage(25_000.01)).toBe(30);
  });
});
