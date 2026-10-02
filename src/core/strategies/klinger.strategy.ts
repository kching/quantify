import type { Candle, ParamDescriptior, SignalResult, SignalStrategy, StrategyParamValue, StrategyParams } from '../types';

export type KlingerParams = StrategyParams & {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
};

function period(value: StrategyParamValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function ema(values: readonly number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  return values.reduce<number[]>((result, value, index) => {
    result.push(index === 0 ? value : value * alpha + result[index - 1] * (1 - alpha));
    return result;
  }, []);
}

export class KlingerStrategy implements SignalStrategy {
  readonly id = 'klinger-oscillator';
  readonly name = 'Klinger Volume Oscillator';
  get inputParams(): ParamDescriptior[] {
    return [
      { type: 'number', id: 'fastPeriod', label: 'Fast period', defaultValues: { min: 5, max: 40, step: 2 } },
      { type: 'number', id: 'slowPeriod', label: 'Slow period', defaultValues: { min: 15, max: 100, step: 5 } },
      { type: 'number', id: 'signalPeriod', label: 'Signal period', defaultValues: { min: 3, max: 21, step: 1 } },
    ];
  }

  analyze(symbol: string, candles: readonly Candle[], params: StrategyParams = {}): SignalResult {
    const { fastPeriod, slowPeriod, signalPeriod } = params as KlingerParams;
    const safe = candles.filter((candle) => Number.isFinite(candle.close) && Number.isFinite(candle.volume));
    const typical = safe.map((candle) => (candle.high + candle.low + candle.close) / 3);
    const trend = safe.map((_, index) => index === 0 || typical[index] >= typical[index - 1] ? 1 : -1);
    const dm = safe.map((candle) => candle.high - candle.low);
    const cm: number[] = [];
    for (let i = 0; i < dm.length; i += 1) cm.push(i > 0 && trend[i] === trend[i - 1] ? cm[i - 1] + dm[i] : (i > 0 ? dm[i - 1] : 0) + dm[i]);
    const force = safe.map((candle, index) => cm[index] === 0 ? 0 : candle.volume * Math.abs(2 * dm[index] / cm[index] - 1) * trend[index] * 100);
    const fast = ema(force, period(fastPeriod, 34));
    const slow = ema(force, period(slowPeriod, 55));
    const oscillator = fast.map((value, index) => value - slow[index]);
    const signalLine = ema(oscillator, period(signalPeriod, 13));
    const i = safe.length - 1;
    const previous = i > 0 ? oscillator[i - 1] - signalLine[i - 1] : 0;
    const current = i >= 0 ? oscillator[i] - signalLine[i] : 0;
    const signal = previous <= 0 && current > 0 ? 'BUY' : previous >= 0 && current < 0 ? 'SELL' : 'HOLD';
    const candle = safe[i];
    return {
      symbol, strategyId: this.id, strategyName: this.name, signal,
      timestamp: candle?.timestamp ?? Date.now(), price: candle?.close ?? 0,
      rationale: signal === 'BUY' ? 'KVO crossed above its signal line, indicating improving volume force.' : signal === 'SELL' ? 'KVO crossed below its signal line, indicating weakening volume force.' : 'No KVO/signal-line crossover on the latest candle.',
      indicators: { kvo: oscillator[i] ?? 0, signalLine: signalLine[i] ?? 0, histogram: current },
    };
  }
}
