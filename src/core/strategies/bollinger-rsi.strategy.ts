import type {
  Candle,
  ParamDescriptor,
  SignalResult,
  SignalStrategy,
  StrategyParams,
} from "../types";

type BollingerRsiParams = StrategyParams & {
  bollingerPeriod?: number;
  stdDevMultiplier?: number;
  rsiPeriod?: number;
};

function rsiValues(candles: readonly Candle[], period: number): number[] {
  const values = Array<number>(candles.length).fill(50);
  if (candles.length <= period) return values;
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index]!.close - candles[index - 1]!.close;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;
  const currentRsi = (): number =>
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  values[period] = currentRsi();
  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index]!.close - candles[index - 1]!.close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    values[index] = currentRsi();
  }
  return values;
}

export class BollingerRsiStrategy implements SignalStrategy {
  readonly id = "bollinger-rsi";
  readonly name = "Bollinger Bands + RSI";

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
        id: "rsiPeriod",
        label: "RSI period",
        defaultValues: { min: 7, max: 21, step: 7 },
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
      rsiPeriod = 14,
    } = params as BollingerRsiParams;
    const bandPeriod =
      Number.isInteger(bollingerPeriod) && bollingerPeriod > 1
        ? bollingerPeriod
        : 20;
    const deviationFactor =
      Number.isFinite(stdDevMultiplier) && stdDevMultiplier > 0
        ? stdDevMultiplier
        : 2;
    const strengthPeriod =
      Number.isInteger(rsiPeriod) && rsiPeriod > 0 ? rsiPeriod : 14;
    const rsi = rsiValues(candles, strengthPeriod);
    const index = candles.length - 1;
    const values = candles
      .slice(Math.max(0, index - bandPeriod + 1), index + 1)
      .map(({ close }) => close);
    const mean =
      values.length === bandPeriod
        ? values.reduce((sum, value) => sum + value, 0) / bandPeriod
        : 0;
    const variance =
      values.length === bandPeriod
        ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          bandPeriod
        : 0;
    const deviation = Math.sqrt(variance);
    const lowerBand = mean - deviationFactor * deviation;
    const upperBand = mean + deviationFactor * deviation;
    const candle = candles[index];
    const currentRsi = rsi[index] ?? 50;
    const signal =
      candle &&
      values.length === bandPeriod &&
      candle.close <= lowerBand &&
      currentRsi <= 30
        ? "BUY"
        : candle &&
            values.length === bandPeriod &&
            candle.close >= upperBand &&
            currentRsi >= 70
          ? "SELL"
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
          ? "Price reached the lower Bollinger Band while RSI was oversold."
          : signal === "SELL"
            ? "Price reached the upper Bollinger Band while RSI was overbought."
            : "The Bollinger Band and RSI conditions did not align on the latest candle.",
      indicators: { rsi: currentRsi, upperBand, middleBand: mean, lowerBand },
    };
  }
}
