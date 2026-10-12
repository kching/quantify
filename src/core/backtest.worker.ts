import { parentPort, workerData } from "node:worker_threads";
import { runBacktest } from "./backtest";
import { strategies } from "./engine";
import type { BacktestRunMetrics, Candle, StrategyParams } from "./types";

interface WorkerSetup {
  symbol: string;
  candles: Candle[];
  strategyId: string;
}

interface WorkItem {
  runIndex: number;
  params: StrategyParams;
}

const setup = workerData as WorkerSetup;
const strategy = strategies.find((item) => item.id === setup.strategyId);

if (!parentPort || !strategy)
  throw new Error("The backtest worker could not load its strategy.");

const port = parentPort;
port.on("message", (item: WorkItem): void => {
  try {
    const result = runBacktest(
      setup.symbol,
      setup.candles,
      strategy,
      10_000,
      item.params,
    );
    const metrics: BacktestRunMetrics = {
      symbol: result.symbol,
      strategyId: result.strategyId,
      initialBalance: result.initialBalance,
      finalBalance: result.finalBalance,
      strategyReturnPct: result.strategyReturnPct,
      buyAndHoldReturnPct: result.buyAndHoldReturnPct,
      totalReturnPct: result.totalReturnPct,
      winRatePct: result.winRatePct,
      maxDrawdownPct: result.maxDrawdownPct,
    };
    port.postMessage({ runIndex: item.runIndex, result: metrics });
  } catch (error) {
    port.postMessage({
      runIndex: item.runIndex,
      error: error instanceof Error ? error.message : "A backtest run failed.",
    });
  }
});
