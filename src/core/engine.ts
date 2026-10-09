import { KlingerStrategy } from "./strategies/klinger.strategy";
import { RsiStrategy } from "./strategies/rsi.strategy";
import type { Candle, SignalResult, SignalStrategy } from "./types";

export const strategies: readonly SignalStrategy[] = [
  new KlingerStrategy(),
  new RsiStrategy(),
];

const strategyLoaders: Record<string, () => Promise<SignalStrategy>> = {
  "klinger-oscillator": async () =>
    new (await import("./strategies/klinger.strategy")).KlingerStrategy(),
  "rsi-14": async () =>
    new (await import("./strategies/rsi.strategy")).RsiStrategy(),
};

export async function loadStrategy(
  name: string,
): Promise<SignalStrategy | null> {
  return strategyLoaders[name.trim().toLowerCase()]?.() ?? null;
}

export function analyzeSymbol(
  symbol: string,
  candles: readonly Candle[],
): SignalResult[] {
  return strategies.map((strategy) => strategy.analyze(symbol, candles));
}
