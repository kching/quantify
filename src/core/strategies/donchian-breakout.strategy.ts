import type {
  Candle,
  ParamDescriptor,
  SignalResult,
  SignalStrategy,
  SignalType,
  StrategyParams,
} from "../types";

type DonchianParams = StrategyParams & { lookbackPeriod?: number };

export class DonchianBreakoutStrategy implements SignalStrategy {
  readonly id = "donchian-breakout";
  readonly name = "Donchian Breakout";

  signalSeries(
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalType[] {
    const { lookbackPeriod = 20 } = params as DonchianParams;
    const period =
      Number.isInteger(lookbackPeriod) && lookbackPeriod > 0
        ? lookbackPeriod
        : 20;
    const signals = Array<SignalType>(candles.length).fill("HOLD");
    let previousUpper = 0;
    let previousLower = 0;
    for (let index = period; index < candles.length; index += 1) {
      let upper = Number.NEGATIVE_INFINITY;
      let lower = Number.POSITIVE_INFINITY;
      for (let offset = index - period; offset < index; offset += 1) {
        upper = Math.max(upper, candles[offset]!.high);
        lower = Math.min(lower, candles[offset]!.low);
      }
      const candle = candles[index]!;
      const previous = candles[index - 1];
      if (index > period && previous)
        signals[index] =
          candle.close > upper && previous.close <= previousUpper
            ? "BUY"
            : candle.close < lower && previous.close >= previousLower
              ? "SELL"
              : "HOLD";
      previousUpper = upper;
      previousLower = lower;
    }
    return signals;
  }

  get inputParams(): ParamDescriptor[] {
    return [
      {
        type: "number",
        id: "lookbackPeriod",
        label: "Channel lookback",
        defaultValues: { min: 10, max: 50, step: 10 },
      },
    ];
  }

  analyze(
    symbol: string,
    candles: readonly Candle[],
    params: StrategyParams = {},
  ): SignalResult {
    const { lookbackPeriod = 20 } = params as DonchianParams;
    const period =
      Number.isInteger(lookbackPeriod) && lookbackPeriod > 0
        ? lookbackPeriod
        : 20;
    const index = candles.length - 1;
    const candle = candles[index];
    const previous = candles[index - 1];
    const channelCandles = candles.slice(Math.max(0, index - period), index);
    const previousChannel = candles.slice(
      Math.max(0, index - period - 1),
      index - 1,
    );
    const upper = channelCandles.length
      ? Math.max(...channelCandles.map(({ high }) => high))
      : 0;
    const lower = channelCandles.length
      ? Math.min(...channelCandles.map(({ low }) => low))
      : 0;
    const previousUpper = previousChannel.length
      ? Math.max(...previousChannel.map(({ high }) => high))
      : 0;
    const previousLower = previousChannel.length
      ? Math.min(...previousChannel.map(({ low }) => low))
      : 0;
    const signal =
      candle &&
      previous &&
      channelCandles.length === period &&
      previousChannel.length === period
        ? candle.close > upper && previous.close <= previousUpper
          ? "BUY"
          : candle.close < lower && previous.close >= previousLower
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
          ? `Close broke above the prior ${period}-candle high.`
          : signal === "SELL"
            ? `Close broke below the prior ${period}-candle low.`
            : "Price did not break the Donchian channel on the latest candle.",
      indicators: { upperChannel: upper || 0, lowerChannel: lower || 0 },
    };
  }
}
