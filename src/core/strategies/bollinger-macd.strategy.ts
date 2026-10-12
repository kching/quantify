import type {
  Candle,
  ParamDescriptor,
  SignalResult,
  SignalStrategy,
  SignalType,
  StrategyParams,
} from "../types";

type BollingerMacdParams = StrategyParams & {
  bollingerPeriod?: number;
  stdDevMultiplier?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
};

function ema(values: readonly number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result = Array<number>(values.length).fill(0);
  values.forEach((value, index) => {
    result[index] =
      index === 0 ? value : value * alpha + result[index - 1]! * (1 - alpha);
  });
  return result;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

export class BollingerMacdStrategy implements SignalStrategy {
  readonly id = "bollinger-macd";
  readonly name = "Bollinger Bands + MACD";

  signalSeries(
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalType[] {
    const {
      bollingerPeriod = 20,
      stdDevMultiplier = 2,
      fastPeriod = 12,
      slowPeriod = 26,
      signalPeriod = 9,
    } = params as BollingerMacdParams;
    const bandPeriod = Math.max(2, positiveInteger(bollingerPeriod, 20));
    const fast = positiveInteger(fastPeriod, 12);
    const slow = Math.max(fast + 1, positiveInteger(slowPeriod, 26));
    const signalLength = positiveInteger(signalPeriod, 9);
    const deviationFactor =
      Number.isFinite(stdDevMultiplier) && stdDevMultiplier > 0
        ? stdDevMultiplier
        : 2;
    const closes = candles.map(({ close }) => close);
    const fastValues = ema(closes, fast);
    const slowValues = ema(closes, slow);
    const macd = fastValues.map(
      (value, valueIndex) => value - slowValues[valueIndex]!,
    );
    const signalLine = ema(macd, signalLength);
    const signals = Array<SignalType>(candles.length).fill("HOLD");
    let previousUpper = 0;
    let previousLower = 0;
    for (let index = bandPeriod - 1; index < candles.length; index += 1) {
      const values = closes.slice(index - bandPeriod + 1, index + 1);
      const mean = values.reduce((sum, value) => sum + value, 0) / bandPeriod;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        bandPeriod;
      const offset = Math.sqrt(variance) * deviationFactor;
      const upper = mean + offset;
      const lower = mean - offset;
      if (index >= bandPeriod) {
        const candle = candles[index]!;
        const previous = candles[index - 1]!;
        signals[index] =
          candle.close > upper &&
          previous.close <= previousUpper &&
          macd[index]! > signalLine[index]!
            ? "BUY"
            : candle.close < lower &&
                previous.close >= previousLower &&
                macd[index]! < signalLine[index]!
              ? "SELL"
              : "HOLD";
      }
      previousUpper = upper;
      previousLower = lower;
    }
    return signals;
  }

  get inputParams(): ParamDescriptor[] {
    return [
      {
        type: "number",
        id: "bollingerPeriod",
        label: "Bollinger period",
        defaultValues: { min: 10, max: 30, step: 10 },
      },
      {
        type: "number",
        id: "stdDevMultiplier",
        label: "Standard deviation multiplier",
        defaultValues: { min: 1, max: 3, step: 1 },
      },
      {
        type: "number",
        id: "fastPeriod",
        label: "MACD fast period",
        defaultValues: { min: 8, max: 16, step: 4 },
      },
      {
        type: "number",
        id: "slowPeriod",
        label: "MACD slow period",
        defaultValues: { min: 20, max: 40, step: 10 },
      },
      {
        type: "number",
        id: "signalPeriod",
        label: "MACD signal period",
        defaultValues: { min: 5, max: 12, step: 3 },
      },
    ];
  }

  analyze(
    symbol: string,
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalResult {
    const {
      bollingerPeriod = 20,
      stdDevMultiplier = 2,
      fastPeriod = 12,
      slowPeriod = 26,
      signalPeriod = 9,
    } = params as BollingerMacdParams;
    const bandPeriod = Math.max(2, positiveInteger(bollingerPeriod, 20));
    const fast = positiveInteger(fastPeriod, 12);
    const slow = Math.max(fast + 1, positiveInteger(slowPeriod, 26));
    const signalLength = positiveInteger(signalPeriod, 9);
    const deviationFactor =
      Number.isFinite(stdDevMultiplier) && stdDevMultiplier > 0
        ? stdDevMultiplier
        : 2;
    const closes = candles.map(({ close }) => close);
    const fastValues = ema(closes, fast);
    const slowValues = ema(closes, slow);
    const macd = fastValues.map(
      (value, valueIndex) => value - slowValues[valueIndex]!,
    );
    const signalLine = ema(macd, signalLength);
    const index = candles.length - 1;
    const candle = candles[index];
    const previous = candles[index - 1];
    const currentBandValues = closes.slice(Math.max(0, index - bandPeriod + 1));
    const previousBandValues = closes.slice(
      Math.max(0, index - bandPeriod),
      index,
    );
    const bands = (
      values: readonly number[],
    ): { upper: number; lower: number } => {
      if (values.length !== bandPeriod) return { upper: 0, lower: 0 };
      const mean = values.reduce((sum, value) => sum + value, 0) / bandPeriod;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        bandPeriod;
      const offset = Math.sqrt(variance) * deviationFactor;
      return { upper: mean + offset, lower: mean - offset };
    };
    const currentBands = bands(currentBandValues);
    const previousBands = bands(previousBandValues);
    const macdValue = macd[index] ?? 0;
    const signalValue = signalLine[index] ?? 0;
    const signal =
      candle &&
      previous &&
      currentBandValues.length === bandPeriod &&
      previousBandValues.length === bandPeriod
        ? candle.close > currentBands.upper &&
          previous.close <= previousBands.upper &&
          macdValue > signalValue
          ? "BUY"
          : candle.close < currentBands.lower &&
              previous.close >= previousBands.lower &&
              macdValue < signalValue
            ? "SELL"
            : "HOLD"
        : "HOLD";
    return {
      symbol,
      strategyId: this.id,
      strategyName: this.name,
      signal,
      timestamp: candle?.timestamp ?? Date.now(),
      price: candle?.close ?? 0,
      rationale:
        signal === "BUY"
          ? "Price broke above the upper Bollinger Band with bullish MACD confirmation."
          : signal === "SELL"
            ? "Price broke below the lower Bollinger Band with bearish MACD confirmation."
            : "No confirmed Bollinger Band breakout occurred on the latest candle.",
      indicators: {
        upperBand: currentBands.upper,
        lowerBand: currentBands.lower,
        macd: macdValue,
        macdSignal: signalValue,
      },
    };
  }
}
