import { KlingerStrategy } from "./strategies/klinger.strategy";
import { RsiStrategy } from "./strategies/rsi.strategy";
import { SupertrendStrategy } from "./strategies/supertrend.strategy";
import { BollingerRsiStrategy } from "./strategies/bollinger-rsi.strategy";
import { DonchianBreakoutStrategy } from "./strategies/donchian-breakout.strategy";
import { RelativeStrengthMomentumStrategy } from "./strategies/relative-strength-momentum.strategy";
import type { Candle, SignalResult, SignalStrategy } from "./types";

export const strategies: readonly SignalStrategy[] = [
  new KlingerStrategy(),
  new RsiStrategy(),
  new SupertrendStrategy(),
  new BollingerRsiStrategy(),
  new DonchianBreakoutStrategy(),
  new RelativeStrengthMomentumStrategy(),
];

const strategyLoaders: Record<string, () => Promise<SignalStrategy>> = {
  "klinger-oscillator": async () =>
    new (await import("./strategies/klinger.strategy")).KlingerStrategy(),
  rsi: async () =>
    new (await import("./strategies/rsi.strategy")).RsiStrategy(),
  supertrend: async () =>
    new (await import("./strategies/supertrend.strategy")).SupertrendStrategy(),
  "bollinger-rsi": async () =>
    new (
      await import("./strategies/bollinger-rsi.strategy")
    ).BollingerRsiStrategy(),
  "donchian-breakout": async () =>
    new (
      await import("./strategies/donchian-breakout.strategy")
    ).DonchianBreakoutStrategy(),
  "relative-strength-momentum": async () =>
    new (
      await import("./strategies/relative-strength-momentum.strategy")
    ).RelativeStrengthMomentumStrategy(),
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
