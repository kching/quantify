import { describe, expect, it } from 'bun:test';
import { analyzeSymbol, loadStrategy, strategies } from './engine';
import type { Candle } from './types';

describe('core strategy engine', () => {
  it('registers Klinger and RSI as separate strategies', () => {
    expect(strategies.map((strategy) => strategy.id)).toEqual(['klinger-oscillator', 'rsi-14']);
  });

  it('returns one result per registered strategy for a symbol', () => {
    const candles: Candle[] = Array.from({ length: 80 }, (_, index) => {
      const close = 100 + index;
      return {
        symbol: 'TEST.AX', interval: '1d', timestamp: index, open: close, high: close + 1,
        low: close - 1, close, volume: 1_000,
      };
    });

    const results = analyzeSymbol('TEST.AX', candles);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.strategyId)).toEqual(['klinger-oscillator', 'rsi-14']);
    expect(results.every((result) => result.symbol === 'TEST.AX')).toBe(true);
  });

  it('dynamically loads a strategy by holding strategy name', async () => {
    const strategy = await loadStrategy('RSI (14)');

    expect(strategy?.id).toBe('rsi-14');
  });
});
