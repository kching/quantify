import { describe, expect, it } from 'bun:test';
import { runBacktest } from './backtest';
import type { Candle, SignalResult, SignalStrategy, SignalType } from './types';

function makeCandles(length: number): Candle[] {
  return Array.from({ length }, (_, index) => ({
    symbol: 'TEST.AX', interval: '1d', timestamp: index, open: 100, high: 101,
    low: 99, close: 100, volume: 1_000,
  }));
}

function strategyForSignals(signals: Readonly<Record<number, SignalType>>): SignalStrategy {
  return {
    id: 'test-strategy',
    name: 'Test strategy',
    analyze(symbol: string, candles: readonly Candle[]): SignalResult {
      return {
        symbol, strategyId: this.id, strategyName: this.name,
        signal: signals[candles.length] ?? 'HOLD',
        timestamp: candles.at(-1)?.timestamp ?? 0,
        price: candles.at(-1)?.close ?? 0,
        rationale: 'Deterministic test signal.', indicators: {},
      };
    },
  };
}

describe('runBacktest', () => {
  it('fills at the next candle open after a signal and reports the closed trade', () => {
    const candles = makeCandles(63);
    candles[59].close = 75;
    candles[60].open = 100;
    candles[62].open = 110;
    candles[62].close = 130;
    const result = runBacktest('TEST.AX', candles, strategyForSignals({ 60: 'BUY', 62: 'SELL' }));

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      entryDate: 60, exitDate: 62, entryPrice: 100, exitPrice: 110,
    });
    expect(result.trades[0].pnlPct).toBeCloseTo(0.1);
    expect(result.finalBalance).toBeCloseTo(11_000);
    expect(result.strategyReturnPct).toBeCloseTo(10);
    expect(result.buyAndHoldReturnPct).toBeCloseTo(30);
    expect(result.totalReturnPct).toBeCloseTo(-20);
  });

  it('compounds closed trades and calculates win rate and drawdown', () => {
    const candles = makeCandles(66);
    candles[60].open = 100;
    candles[62].open = 110;
    candles[63].open = 100;
    candles[65].open = 90;
    const strategy = strategyForSignals({ 60: 'BUY', 62: 'SELL', 63: 'BUY', 65: 'SELL' });

    const result = runBacktest('TEST.AX', candles, strategy, 1_000);

    expect(result.finalBalance).toBeCloseTo(990);
    expect(result.totalReturnPct).toBeCloseTo(-1);
    expect(result.winRatePct).toBe(50);
    expect(result.maxDrawdownPct).toBeCloseTo(10);
    expect(result.trades).toHaveLength(2);
  });

  it('returns the initial balance when no trades close', () => {
    const result = runBacktest('TEST.AX', makeCandles(60), strategyForSignals({}));

    expect(result.finalBalance).toBe(10_000);
    expect(result.totalReturnPct).toBe(0);
    expect(result.winRatePct).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.trades).toEqual([]);
  });

  it('ignores an open position that has no sell signal by the end of the data', () => {
    const result = runBacktest('TEST.AX', makeCandles(61), strategyForSignals({ 60: 'BUY' }));

    expect(result.finalBalance).toBe(10_000);
    expect(result.trades).toEqual([]);
  });

  it('does not mutate its candle input', () => {
    const candles = makeCandles(63);
    const before = structuredClone(candles);

    runBacktest('TEST.AX', candles, strategyForSignals({ 60: 'BUY', 62: 'SELL' }));

    expect(candles).toEqual(before);
  });
});
