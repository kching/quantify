import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { BacktestRunMetrics, Candle, StrategyParams } from "./types";

const MAX_WORKERS = 5;

interface WorkerResult {
  runIndex: number;
  result?: BacktestRunMetrics;
  error?: string;
}

export async function runBacktestSweepWorkers(
  symbol: string,
  candles: readonly Candle[],
  strategyId: string,
  parameterSets: readonly StrategyParams[],
  onResult: (
    result: BacktestRunMetrics,
    params: StrategyParams,
    runIndex: number,
  ) => void,
): Promise<void> {
  if (parameterSets.length === 0) return;

  const workerCount = Math.min(
    MAX_WORKERS,
    Math.max(1, availableParallelism()),
    parameterSets.length,
  );
  const workers: Worker[] = [];
  let nextRunIndex = 0;
  let completedRuns = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (reason: Error): void => {
        if (settled) return;
        settled = true;
        reject(reason);
      };
      const assign = (worker: Worker): void => {
        if (settled || nextRunIndex >= parameterSets.length) return;
        const runIndex = nextRunIndex++;
        worker.postMessage({ runIndex, params: parameterSets[runIndex] });
      };

      for (let index = 0; index < workerCount; index += 1) {
        const worker = new Worker(
          new URL("./backtest.worker.ts", import.meta.url),
          {
            workerData: { symbol, candles, strategyId },
          },
        );
        workers.push(worker);
        worker.on("message", (message: WorkerResult) => {
          if (settled) return;
          if (message.error || !message.result) {
            fail(
              new Error(
                message.error ?? "A backtest worker returned no result.",
              ),
            );
            return;
          }
          const params = parameterSets[message.runIndex];
          if (!params) {
            fail(new Error("A backtest worker returned an unknown run."));
            return;
          }
          try {
            onResult(message.result, params, message.runIndex);
          } catch (error) {
            fail(
              error instanceof Error
                ? error
                : new Error("A backtest result failed."),
            );
            return;
          }
          completedRuns += 1;
          if (completedRuns === parameterSets.length) {
            settled = true;
            resolve();
          } else assign(worker);
        });
        worker.on("error", fail);
        worker.on("exit", (code) => {
          if (!settled)
            fail(
              new Error(`A backtest worker stopped with exit code ${code}.`),
            );
        });
        assign(worker);
      }
    });
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
