import "server-only";
import { runBacktestSweepWorkers } from "./backtest-workers";
import {
  claimNextMcpSweep,
  completeMcpSweep,
  DAILY_CANDLE_HISTORY_DAYS,
  DAILY_CANDLE_RETENTION_MS,
  failMcpSweep,
  getCandles,
  resetInterruptedMcpSweeps,
  saveCandles,
  TIME_SERIES_RETENTION_MS,
  updateMcpSweepProgress,
} from "./db";
import { fetchYahooCandles } from "./providers/yahoo.provider";
import type { McpSweep, McpSweepRun, StrategyParams } from "./types";

let initialization: Promise<void> | null = null;
let running = false;
let wakeRequested = false;

async function executeSweep(
  sweep: McpSweep,
  parameterSets: readonly StrategyParams[],
): Promise<void> {
  const { symbol, cadence, strategyId, days } = sweep;
  const historyDays =
    cadence === "1h"
      ? Math.floor(TIME_SERIES_RETENTION_MS / 86_400_000)
      : DAILY_CANDLE_HISTORY_DAYS;
  const cutoff =
    Date.now() -
    (cadence === "1h" ? TIME_SERIES_RETENTION_MS : DAILY_CANDLE_RETENTION_MS);
  let candles = await getCandles(symbol, cadence);
  if (!candles.length || candles[0]!.timestamp > cutoff) {
    const fetched = await fetchYahooCandles(symbol, cadence, historyDays);
    await saveCandles(
      cadence,
      fetched.filter((candle) => candle.timestamp >= cutoff),
    );
    candles = await getCandles(symbol, cadence);
  }
  if (candles.length < 70)
    throw new Error(
      `At least 70 ${cadence === "1h" ? "hourly" : "daily"} candles are needed.`,
    );
  const window = candles.filter(
    (candle) => candle.timestamp >= Date.now() - days * 86_400_000,
  );
  const runs: Array<Omit<McpSweepRun, "sweepId">> = [];
  let progressWrite: Promise<void> = Promise.resolve();
  await runBacktestSweepWorkers(
    symbol,
    window,
    strategyId,
    parameterSets,
    (result, params, runIndex) => {
      runs.push({
        runIndex,
        params,
        metrics: {
          finalBalance: result.finalBalance,
          strategyReturnPct: result.strategyReturnPct,
          buyAndHoldReturnPct: result.buyAndHoldReturnPct,
          winRatePct: result.winRatePct,
          maxDrawdownPct: result.maxDrawdownPct,
          totalReturnPct: result.totalReturnPct,
        },
      });
      if (runs.length % 20 === 0) {
        const completed = runs.length;
        progressWrite = progressWrite
          .then(() => updateMcpSweepProgress(sweep.id, completed))
          .catch((error: unknown) => {
            console.warn("[quantify] Unable to save sweep progress.", error);
          });
      }
    },
  );
  await progressWrite;
  runs.sort((left, right) => left.runIndex - right.runIndex);
  const bestReturnRunIndex = runs.reduce(
    (best, run) =>
      run.metrics.strategyReturnPct > runs[best]!.metrics.strategyReturnPct
        ? run.runIndex
        : best,
    0,
  );
  const lowestDrawdownRunIndex = runs.reduce(
    (best, run) =>
      run.metrics.maxDrawdownPct < runs[best]!.metrics.maxDrawdownPct
        ? run.runIndex
        : best,
    0,
  );
  await completeMcpSweep(sweep.id, runs, {
    bestReturnRunIndex,
    lowestDrawdownRunIndex,
  });
}

async function drainSweepJobs(): Promise<void> {
  if (running) {
    wakeRequested = true;
    return;
  }
  running = true;
  try {
    let job = await claimNextMcpSweep();
    while (job) {
      try {
        await executeSweep(job.sweep, job.parameterSets);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Sweep execution failed.";
        await failMcpSweep(job.sweep.id, message);
      }
      job = await claimNextMcpSweep();
    }
  } catch (error) {
    console.error("[quantify] MCP sweep job queue failed.", error);
  } finally {
    running = false;
    if (wakeRequested) {
      wakeRequested = false;
      void wakeMcpSweepJobs();
    }
  }
}

export async function wakeMcpSweepJobs(): Promise<void> {
  initialization ??= resetInterruptedMcpSweeps();
  await initialization;
  if (running) {
    wakeRequested = true;
    return;
  }
  void drainSweepJobs();
}
