import { describe, expect, it } from "bun:test";
import { runBacktest } from "./backtest";
import { runBacktestSweepWorkers } from "./backtest-workers";
import { RsiStrategy } from "./strategies/rsi.strategy";
import type { BacktestRunMetrics, Candle, StrategyParams } from "./types";

describe("backtest worker pool", () => {
  it("returns each parameter result from a worker", async () => {
    const candles: Candle[] = Array.from({ length: 90 }, (_, index) => {
      const close = 100 + Math.sin(index / 3) * 10;
      return {
        symbol: "TEST.AX",
        interval: "1d",
        timestamp: index,
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000,
      };
    });
    const parameterSets: StrategyParams[] = [
      { period: 5 },
      { period: 10 },
      { period: 14 },
    ];
    const received = new Map<number, BacktestRunMetrics>();

    await runBacktestSweepWorkers(
      "TEST.AX",
      candles,
      "rsi",
      parameterSets,
      (result, params, index) => {
        expect(params).toEqual(parameterSets[index]);
        received.set(index, result);
      },
    );

    expect(received.size).toBe(parameterSets.length);
    for (const [index, params] of parameterSets.entries()) {
      const fullResult = runBacktest(
        "TEST.AX",
        candles,
        new RsiStrategy(),
        10_000,
        params,
      );
      expect(received.get(index)).toEqual({
        symbol: fullResult.symbol,
        strategyId: fullResult.strategyId,
        initialBalance: fullResult.initialBalance,
        finalBalance: fullResult.finalBalance,
        strategyReturnPct: fullResult.strategyReturnPct,
        buyAndHoldReturnPct: fullResult.buyAndHoldReturnPct,
        totalReturnPct: fullResult.totalReturnPct,
        winRatePct: fullResult.winRatePct,
        maxDrawdownPct: fullResult.maxDrawdownPct,
      });
      expect(received.get(index)).not.toHaveProperty("trades");
    }
  });
});
