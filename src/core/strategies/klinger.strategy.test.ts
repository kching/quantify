import { describe, expect, it } from 'bun:test';
import { KlingerStrategy } from './klinger.strategy';
import type { Candle } from '../types';

function makeCandles(): Candle[] {
  return Array.from({ length: 160 }, (_, index): Candle => {
    const close = 100 + index;
    const volume = index < 70 ? 100 : index < 110 ? 8_000 : 100;
    return {
      symbol: 'TEST.AX', interval: '1d', timestamp: index, open: close, high: close + 0.5,
      low: close - 0.5, close, volume,
    };
  });
}

describe('KlingerStrategy', () => {
  const strategy = new KlingerStrategy();

  it('reports a sell when the oscillator crosses below the signal line', () => {
    const candles = makeCandles().slice(0, 100);
    const result = strategy.analyze('TEST.AX', candles);

    expect(result.signal).toBe('SELL');
    expect(result.timestamp).toBe(99);
    expect(result.price).toBe(199);
    expect(result.indicators.histogram).toBeLessThan(0);
    expect(result.rationale).toContain('crossed below');
  });

  it('reports a buy when the oscillator crosses above the signal line', () => {
    const candles = makeCandles().slice(0, 148);
    const result = strategy.analyze('TEST.AX', candles);

    expect(result.signal).toBe('BUY');
    expect(result.timestamp).toBe(147);
    expect(result.indicators.histogram).toBeGreaterThan(0);
    expect(result.rationale).toContain('crossed above');
  });

  it('returns a hold for empty input with zero-valued indicators', () => {
    const result = strategy.analyze('TEST.AX', []);

    expect(result.signal).toBe('HOLD');
    expect(result.price).toBe(0);
    expect(result.indicators).toEqual({ kvo: 0, signalLine: 0, histogram: 0 });
  });

  it('does not mutate the supplied candles', () => {
    const candles = makeCandles();
    const before = structuredClone(candles);

    strategy.analyze('TEST.AX', candles);

    expect(candles).toEqual(before);
  });
});
