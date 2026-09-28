import { describe, expect, it } from 'bun:test';
import { RsiStrategy } from './rsi.strategy';
import type { Candle } from '../types';

function makeCandles(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    symbol: 'TEST.AX', timestamp: index, open: close, high: close + 1,
    low: close - 1, close, volume: 1_000,
  }));
}

describe('RsiStrategy', () => {
  const strategy = new RsiStrategy();

  it('buys when RSI re-enters above 30 after oversold conditions', () => {
    const closes = [...Array.from({ length: 15 }, (_, index) => 100 - index), 96];
    const result = strategy.analyze('TEST.AX', makeCandles(closes));

    expect(result.signal).toBe('BUY');
    expect(result.indicators.rsi).toBeCloseTo(43.4783, 3);
    expect(result.rationale).toContain('above 30');
  });

  it('sells when RSI re-enters below 70 after overbought conditions', () => {
    const closes = [...Array.from({ length: 15 }, (_, index) => 100 + index), 104];
    const result = strategy.analyze('TEST.AX', makeCandles(closes));

    expect(result.signal).toBe('SELL');
    expect(result.indicators.rsi).toBeCloseTo(56.5217, 3);
    expect(result.rationale).toContain('below 70');
  });

  it('holds when RSI stays overbought without a threshold re-entry', () => {
    const closes = Array.from({ length: 30 }, (_, index) => 100 + index);
    const result = strategy.analyze('TEST.AX', makeCandles(closes));

    expect(result.signal).toBe('HOLD');
    expect(result.indicators.rsi).toBe(100);
  });

  it('uses a neutral RSI while there is not enough history for the 14-period seed', () => {
    const result = strategy.analyze('TEST.AX', makeCandles(Array.from({ length: 14 }, (_, index) => 100 + index)));

    expect(result.signal).toBe('HOLD');
    expect(result.indicators.rsi).toBe(50);
  });

  it('does not mutate the supplied candles', () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, index) => 100 + index));
    const before = structuredClone(candles);

    strategy.analyze('TEST.AX', candles);

    expect(candles).toEqual(before);
  });
});
