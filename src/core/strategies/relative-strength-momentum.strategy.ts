import type {
  Candle,
  ParamDescriptor,
  SignalResult,
  SignalStrategy,
  SignalType,
  StrategyParams,
} from "../types";

type RelativeStrengthMomentumParams = StrategyParams & {
  lookbackPeriod?: number;
  momentumThresholdPct?: number;
};

function momentum(
  candles: readonly Candle[],
  endIndex: number,
  period: number,
): number {
  const current = candles[endIndex]?.close;
  const prior = candles[endIndex - period]?.close;
  if (current === undefined || prior === undefined || prior <= 0) return 0;
  return (current / prior - 1) * 100;
}

export class RelativeStrengthMomentumStrategy implements SignalStrategy {
  readonly id = "relative-strength-momentum";
  readonly name = "Relative Strength Momentum";

  signalSeries(
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalType[] {
    const { lookbackPeriod = 60, momentumThresholdPct = 3 } =
      params as RelativeStrengthMomentumParams;
    const period =
      Number.isInteger(lookbackPeriod) && lookbackPeriod > 0
        ? lookbackPeriod
        : 60;
    const threshold =
      Number.isFinite(momentumThresholdPct) && momentumThresholdPct > 0
        ? momentumThresholdPct
        : 3;
    return candles.map((_, index) => {
      const current = momentum(candles, index, period);
      const previous = momentum(candles, index - 1, period);
      return previous <= threshold && current > threshold
        ? "BUY"
        : previous >= -threshold && current < -threshold
          ? "SELL"
          : "HOLD";
    });
  }

  get inputParams(): ParamDescriptor[] {
    return [
      {
        type: "number",
        id: "lookbackPeriod",
        label: "Momentum lookback",
        defaultValues: { min: 20, max: 120, step: 20 },
      },
      {
        type: "number",
        id: "momentumThresholdPct",
        label: "Momentum threshold (%)",
        defaultValues: { min: 1, max: 10, step: 3 },
      },
    ];
  }

  analyze(
    symbol: string,
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalResult {
    const { lookbackPeriod = 60, momentumThresholdPct = 3 } =
      params as RelativeStrengthMomentumParams;
    const period =
      Number.isInteger(lookbackPeriod) && lookbackPeriod > 0
        ? lookbackPeriod
        : 60;
    const threshold =
      Number.isFinite(momentumThresholdPct) && momentumThresholdPct > 0
        ? momentumThresholdPct
        : 3;
    const index = candles.length - 1;
    const currentMomentum = momentum(candles, index, period);
    const previousMomentum = momentum(candles, index - 1, period);
    const signal =
      previousMomentum <= threshold && currentMomentum > threshold
        ? "BUY"
        : previousMomentum >= -threshold && currentMomentum < -threshold
          ? "SELL"
          : "HOLD";
    const candle = candles[index];
    return {
      symbol,
      strategyId: this.id,
      strategyName: this.name,
      signal,
      timestamp: candle?.timestamp ?? Date.now(),
      price: candle?.close ?? 0,
      rationale:
        signal === "BUY"
          ? `Price momentum crossed above ${threshold}%.`
          : signal === "SELL"
            ? `Price momentum crossed below -${threshold}%.`
            : "Relative price momentum did not cross a threshold on the latest candle.",
      indicators: { momentumPct: currentMomentum, thresholdPct: threshold },
    };
  }
}
