import { describe, expect, it } from "bun:test";
import { strategies } from "./engine";
import type { Candle, StrategyParams } from "./types";

function makeCandles(): Candle[] {
  return Array.from({ length: 130 }, (_, index) => {
    const close = 100 + index * 0.04 + Math.sin(index / 4) * 12;
    return {
      symbol: "TEST.AX",
      interval: "1d" as const,
      timestamp: index,
      open: close - Math.sin(index / 3),
      high: close + 2,
      low: close - 2,
      close,
      volume: 1_000 + (index % 17) * 300,
    };
  });
}

const customParams: Record<string, StrategyParams> = {
  "klinger-oscillator": { fastPeriod: 5, slowPeriod: 15, signalPeriod: 3 },
  rsi: { period: 5 },
  supertrend: { atrPeriod: 7, multiplier: 2 },
  "bollinger-rsi": { bollingerPeriod: 10, stdDevMultiplier: 1, rsiPeriod: 7 },
  "donchian-breakout": { lookbackPeriod: 10 },
  "relative-strength-momentum": {
    lookbackPeriod: 20,
    momentumThresholdPct: 1,
  },
  "bollinger-macd": {
    bollingerPeriod: 10,
    stdDevMultiplier: 1,
    fastPeriod: 8,
    slowPeriod: 20,
    signalPeriod: 5,
  },
};

describe("strategy signal series", () => {
  it("matches analysis of every historical prefix for default and custom parameters", () => {
    const candles = makeCandles();
    for (const strategy of strategies) {
      for (const params of [{}, customParams[strategy.id]!]) {
        const series = strategy.signalSeries(candles, params);
        expect(series).toHaveLength(candles.length);
        for (let length = 1; length <= candles.length; length += 1)
          expect(series[length - 1]).toBe(
            strategy.analyze("TEST.AX", candles.slice(0, length), params)
              .signal,
          );
      }
    }
  });

  it("keeps Klinger signals aligned when a candle is filtered out", () => {
    const candles = makeCandles();
    candles[72]!.volume = Number.NaN;
    const strategy = strategies.find(
      (item) => item.id === "klinger-oscillator",
    )!;
    const series = strategy.signalSeries(candles);
    for (let length = 65; length <= 80; length += 1)
      expect(series[length - 1]).toBe(
        strategy.analyze("TEST.AX", candles.slice(0, length)).signal,
      );
  });
});
