import type {
  Candle,
  ParamDescriptor,
  SignalResult,
  SignalStrategy,
  SignalType,
  StrategyParams,
} from "../types";

type SupertrendParams = StrategyParams & {
  atrPeriod?: number;
  multiplier?: number;
};

function getAtr(candles: readonly Candle[], period: number): number[] {
  const trueRanges = candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close;
    return previousClose === undefined
      ? candle.high - candle.low
      : Math.max(
          candle.high - candle.low,
          Math.abs(candle.high - previousClose),
          Math.abs(candle.low - previousClose),
        );
  });
  const atr = Array<number>(candles.length).fill(0);
  if (candles.length < period) return atr;
  atr[period - 1] =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < candles.length; index += 1)
    atr[index] = (atr[index - 1] * (period - 1) + trueRanges[index]) / period;
  return atr;
}

export class SupertrendStrategy implements SignalStrategy {
  readonly id = "supertrend";
  readonly name = "Supertrend";

  signalSeries(
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalType[] {
    const { atrPeriod = 10, multiplier = 3 } = params as SupertrendParams;
    const period =
      Number.isInteger(atrPeriod) && atrPeriod > 0 ? atrPeriod : 10;
    const factor =
      Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 3;
    const atr = getAtr(candles, period);
    const upper = Array<number>(candles.length).fill(0);
    const lower = Array<number>(candles.length).fill(0);
    const direction = Array<number>(candles.length).fill(-1);
    const signals = Array<SignalType>(candles.length).fill("HOLD");

    for (let index = period - 1; index < candles.length; index += 1) {
      const candle = candles[index]!;
      const midpoint = (candle.high + candle.low) / 2;
      const basicUpper = midpoint + factor * atr[index]!;
      const basicLower = midpoint - factor * atr[index]!;
      const previousUpper = upper[index - 1] ?? basicUpper;
      const previousLower = lower[index - 1] ?? basicLower;
      const previousClose = candles[index - 1]?.close ?? candle.close;
      upper[index] =
        index === period - 1 ||
        basicUpper < previousUpper ||
        previousClose > previousUpper
          ? basicUpper
          : previousUpper;
      lower[index] =
        index === period - 1 ||
        basicLower > previousLower ||
        previousClose < previousLower
          ? basicLower
          : previousLower;
      const prior = direction[index - 1] ?? -1;
      const current =
        index === period - 1
          ? -1
          : prior < 0 && candle.close > previousUpper
            ? 1
            : prior > 0 && candle.close < previousLower
              ? -1
              : prior;
      direction[index] = current;
      signals[index] =
        prior < 0 && current > 0
          ? "BUY"
          : prior > 0 && current < 0
            ? "SELL"
            : "HOLD";
    }
    return signals;
  }

  get inputParams(): ParamDescriptor[] {
    return [
      {
        type: "number",
        id: "atrPeriod",
        label: "ATR period",
        defaultValues: { min: 7, max: 21, step: 7 },
      },
      {
        type: "number",
        id: "multiplier",
        label: "ATR multiplier",
        defaultValues: { min: 2, max: 4, step: 1 },
      },
    ];
  }

  analyze(
    symbol: string,
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalResult {
    const { atrPeriod = 10, multiplier = 3 } = params as SupertrendParams;
    const period =
      Number.isInteger(atrPeriod) && atrPeriod > 0 ? atrPeriod : 10;
    const factor =
      Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 3;
    const atr = getAtr(candles, period);
    const upper = Array<number>(candles.length).fill(0);
    const lower = Array<number>(candles.length).fill(0);
    const direction = Array<number>(candles.length).fill(-1);

    for (let index = period - 1; index < candles.length; index += 1) {
      const candle = candles[index]!;
      const midpoint = (candle.high + candle.low) / 2;
      const basicUpper = midpoint + factor * atr[index]!;
      const basicLower = midpoint - factor * atr[index]!;
      const previousUpper = upper[index - 1] ?? basicUpper;
      const previousLower = lower[index - 1] ?? basicLower;
      const previousClose = candles[index - 1]?.close ?? candle.close;
      upper[index] =
        index === period - 1 ||
        basicUpper < previousUpper ||
        previousClose > previousUpper
          ? basicUpper
          : previousUpper;
      lower[index] =
        index === period - 1 ||
        basicLower > previousLower ||
        previousClose < previousLower
          ? basicLower
          : previousLower;
      const previousDirection = direction[index - 1] ?? -1;
      direction[index] =
        index === period - 1
          ? -1
          : previousDirection < 0 && candle.close > previousUpper
            ? 1
            : previousDirection > 0 && candle.close < previousLower
              ? -1
              : previousDirection;
    }

    const index = candles.length - 1;
    const priorDirection = direction[index - 1] ?? -1;
    const currentDirection = direction[index] ?? -1;
    const signal =
      priorDirection < 0 && currentDirection > 0
        ? "BUY"
        : priorDirection > 0 && currentDirection < 0
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
          ? "Supertrend changed from bearish to bullish."
          : signal === "SELL"
            ? "Supertrend changed from bullish to bearish."
            : "Supertrend direction did not change on the latest candle.",
      indicators: {
        supertrend:
          currentDirection > 0 ? (lower[index] ?? 0) : (upper[index] ?? 0),
        atr: atr[index] ?? 0,
        direction: currentDirection,
      },
    };
  }
}
