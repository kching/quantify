import { KlingerStrategy } from './strategies/klinger.strategy';
import { RsiStrategy } from './strategies/rsi.strategy';
import type { Candle, SignalResult, SignalStrategy } from './types';

export const strategies: readonly SignalStrategy[] = [new KlingerStrategy(), new RsiStrategy()];

export function analyzeSymbol(symbol: string, candles: readonly Candle[]): SignalResult[] {
  return strategies.map((strategy) => strategy.analyze(symbol, candles));
}
