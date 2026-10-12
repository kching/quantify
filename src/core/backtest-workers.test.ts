import { describe, expect, it } from "bun:test";
import { runBacktest } from "./backtest";
import { runBacktestSweepWorkers } from "./backtest-workers";
import { RsiStrategy } from "./strategies/rsi.strategy";
import type { BacktestRunMetrics, Candle, StrategyParams } from "./types";

describe("backtest worker pool", () => {
  it("returns without starting workers when there are no parameter sets", async () => {
    let resultCount = 0;
    await runBacktestSweepWorkers("TEST.AX", [], "rsi", [], () => {
      resultCount += 1;
    });
    expect(resultCount).toBe(0);
  });

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
    const parameterSets: StrategyParams[] = Array.from(
      { length: 8 },
      (_, index) => ({ period: 5 + index }),
    );
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

  it("rejects when a worker cannot load its strategy", async () => {
    await expect(
      runBacktestSweepWorkers(
        "TEST.AX",
        [],
        "missing-strategy",
        [{}],
        () => {},
      ),
    ).rejects.toThrow("The backtest worker could not load its strategy.");
  });

  it("stops the sweep when the result callback fails", async () => {
    await expect(
      runBacktestSweepWorkers("TEST.AX", [], "rsi", [{}], () => {
        throw new Error("Result delivery failed.");
      }),
    ).rejects.toThrow("Result delivery failed.");
  });
});
