import type { Candle, SignalResult, SignalStrategy } from '../types';

function calculateRsi(candles: readonly Candle[], period = 14): number[] {
  const closes = candles.map((candle) => candle.close);
  const result = Array<number>(closes.length).fill(50);
  if (closes.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = (): number => avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result[period] = value();
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[i] = value();
  }
  return result;
}

export class RsiStrategy implements SignalStrategy {
  readonly id = 'rsi-14';
  readonly name = 'RSI (14)';

  analyze(symbol: string, candles: readonly Candle[]): SignalResult {
    const rsi = calculateRsi(candles);
    const i = candles.length - 1;
    const prior = rsi[i - 1] ?? 50;
    const current = rsi[i] ?? 50;
    const signal = prior <= 30 && current > 30 ? 'BUY' : prior >= 70 && current < 70 ? 'SELL' : 'HOLD';
    const candle = candles[i];
    return {
      symbol, strategyId: this.id, strategyName: this.name, signal,
      timestamp: candle?.timestamp ?? Date.now(), price: candle?.close ?? 0,
      rationale: signal === 'BUY' ? 'RSI crossed back above 30 from oversold territory.' : signal === 'SELL' ? 'RSI crossed back below 70 from overbought territory.' : `RSI is ${current.toFixed(1)}; no threshold re-entry occurred on the latest candle.`,
      indicators: { rsi: current },
    };
  }
}
