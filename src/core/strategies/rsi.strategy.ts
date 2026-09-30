import type { Candle, SignalResult, SignalStrategy, StrategyParamValue, StrategyParams } from '../types';

export type RsiParams = StrategyParams & {
  period?: number;
};

function period(value: StrategyParamValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function calculateRsi(candles: readonly Candle[], periodLength = 14): number[] {
  const closes = candles.map((candle) => candle.close);
  const result = Array<number>(closes.length).fill(50);
  if (closes.length <= periodLength) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= periodLength; i += 1) {
    const change = closes[i] - closes[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let avgGain = gain / periodLength;
  let avgLoss = loss / periodLength;
  const value = (): number => avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result[periodLength] = value();
  for (let i = periodLength + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (periodLength - 1) + Math.max(change, 0)) / periodLength;
    avgLoss = (avgLoss * (periodLength - 1) + Math.max(-change, 0)) / periodLength;
    result[i] = value();
  }
  return result;
}

export class RsiStrategy implements SignalStrategy {
  readonly id = 'rsi-14';
  readonly name = 'RSI (14)';

  analyze(symbol: string, candles: readonly Candle[], params: StrategyParams = {}): SignalResult {
    const { period: periodParam } = params as RsiParams;
    const rsi = calculateRsi(candles, period(periodParam, 14));
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
