import {
  DAILY_CANDLE_HISTORY_DAYS,
  DAILY_CANDLE_RETENTION_MS,
  TIME_SERIES_RETENTION_MS,
  getCandles,
  saveCandles,
} from "@/core/db";
import { runBacktest } from "@/core/backtest";
import { runBacktestSweepWorkers } from "@/core/backtest-workers";
import { strategies } from "@/core/engine";
import { fetchYahooCandles } from "@/core/providers/yahoo.provider";
import type { CandleInterval } from "@/core/types";
import type {
  BacktestSweepSummary,
  SignalStrategy,
  StrategyParams,
} from "@/core/types";
import {
  completeBacktestEvents,
  publishBacktestResult,
} from "@/lib/backtest-events";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type ParameterTuple = [number, number, number];
const MAX_SWEEP_RUNS = 10_000;

function parseParameterTuple(raw: string | null): ParameterTuple | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      !parsed.every(
        (value) =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          Number.isFinite(value),
      )
    )
      return null;
    const [min, max, step] = parsed;
    if (min < 1 || max < min || step < 0) return null;
    return [min, max, step];
  } catch {
    return null;
  }
}

function parameterValues([min, max, step]: ParameterTuple): number[] {
  if (step === 0) return Array.from(new Set([min, max]));
  const values = Array.from(
    { length: Math.floor((max - min) / step) + 1 },
    (_, index) => min + index * step,
  );
  return Array.from(new Set([...values, max]));
}

function annualizedReturn(returnPct: number, days: number): number {
  const growthFactor = Math.max(0, 1 + returnPct / 100);
  const annualizedPct =
    (Math.pow(growthFactor, 365 / Math.max(days, 1)) - 1) * 100;
  return Math.round(annualizedPct * 10) / 10;
}

function sweepParameterSets(
  strategy: SignalStrategy,
  query: URLSearchParams,
): StrategyParams[] | null {
  const descriptors = strategy.inputParams.filter(
    (descriptor) => descriptor.type === "number",
  );
  const requested = descriptors.map((descriptor) => ({
    id: descriptor.id,
    tuple: parseParameterTuple(query.get(descriptor.id)),
    wasRequested: query.has(descriptor.id),
  }));
  if (!requested.some(({ wasRequested }) => wasRequested)) return null;
  if (requested.some(({ tuple }) => tuple === null)) return null;

  const valuesByParameter = requested.map(
    ({ id, tuple }) => [id, parameterValues(tuple as ParameterTuple)] as const,
  );
  const runCount = valuesByParameter.reduce(
    (count, [, values]) => count * values.length,
    1,
  );
  if (runCount > MAX_SWEEP_RUNS)
    throw new Error(
      `Sweep is limited to ${MAX_SWEEP_RUNS.toLocaleString()} runs.`,
    );
  return valuesByParameter.reduce<StrategyParams[]>(
    (sets, [id, values]) =>
      sets.flatMap((params) =>
        values.map((value) => ({ ...params, [id]: value })),
      ),
    [{}],
  );
}

async function runBacktestRequest(
  request: Request,
  batchId?: string,
): Promise<Response> {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const symbol = query.get("symbol")?.trim().toUpperCase() ?? "";
  const strategyId = query.get("strategy") ?? "klinger-oscillator";
  const strategy = strategies.find((candidate) => candidate.id === strategyId);
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol) || !strategy)
    return Response.json(
      { error: "Provide a valid ticker and strategy." },
      { status: 400 },
    );
  const cadence = query.get("cadence") === "hourly" ? "hourly" : "daily";
  const interval: CandleInterval = cadence === "hourly" ? "1h" : "1d";
  let params: StrategyParams = {};
  let parameterSets: StrategyParams[] | null = null;
  const numericParameterIds = strategy.inputParams
    .filter((descriptor) => descriptor.type === "number")
    .map(({ id }) => id);
  const hasSweep = numericParameterIds.some((id) => query.has(id));
  if (hasSweep) {
    try {
      parameterSets = sweepParameterSets(strategy, query);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Sweep parameters are invalid.",
        },
        { status: 422 },
      );
    }
    if (!parameterSets)
      return Response.json(
        { error: "Sweep parameters must be [min, max, step] tuples." },
        { status: 400 },
      );
    if (!batchId)
      return Response.json(
        { error: "A batch id is required for parameter sweeps." },
        { status: 400 },
      );
  }
  const rawParams = query.get("params");
  if (rawParams && !parameterSets) {
    try {
      const parsed: unknown = JSON.parse(rawParams);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Parameters must be an object.");
      params = parsed as StrategyParams;
    } catch {
      return Response.json(
        { error: "Strategy parameters are invalid." },
        { status: 400 },
      );
    }
  }
  let candles = await getCandles(symbol, interval);
  const retentionMs =
    interval === "1h" ? TIME_SERIES_RETENTION_MS : DAILY_CANDLE_RETENTION_MS;
  const historyDays =
    interval === "1h"
      ? Math.floor(TIME_SERIES_RETENTION_MS / 86_400_000)
      : DAILY_CANDLE_HISTORY_DAYS;
  const cutoff = Date.now() - retentionMs;
  if (!candles.length || candles[0].timestamp > cutoff) {
    try {
      const fetched = await fetchYahooCandles(symbol, interval, historyDays);
      await saveCandles(
        interval,
        fetched.filter((candle) => candle.timestamp >= cutoff),
      );
      candles = await getCandles(symbol, interval);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to load historical data.",
        },
        { status: 502 },
      );
    }
  }
  if (candles.length < 70)
    return Response.json(
      { error: `At least 70 ${cadence} candles are needed for this backtest.` },
      { status: 422 },
    );
  const requestedDays = Number(query.get("days") ?? "365");
  const days = Math.min(
    Math.max(Number.isFinite(requestedDays) ? requestedDays : 365, 30),
    historyDays,
  );
  const windowCutoff = Date.now() - days * 86_400_000;
  const window = candles.filter((candle) => candle.timestamp >= windowCutoff);
  if (!parameterSets)
    return Response.json({
      result: runBacktest(symbol, window, strategy, 10_000, params),
    });

  const sweepBatchId = batchId!;
  let completedRuns = 0;
  let buyAndHoldReturnPct = 0;
  let maximumReturn = Number.NEGATIVE_INFINITY;
  let lowestDrawdown = Number.POSITIVE_INFINITY;
  let bestBalanceScore = Number.NEGATIVE_INFINITY;
  let maxReturnRunIndex = 0;
  let maxReturnCagrPct = 0;
  let lowestDrawdownRunIndex = 0;
  let balancedPickRunIndex = 0;
  let balancedPickCagrPct = 0;
  try {
    await runBacktestSweepWorkers(
      symbol,
      window,
      strategy.id,
      parameterSets,
      (result, sweepParams, index) => {
        publishBacktestResult(sweepBatchId, {
          runIndex: index,
          params: sweepParams,
          result,
        });
        if (completedRuns === 0)
          buyAndHoldReturnPct = result.buyAndHoldReturnPct;
        if (
          result.strategyReturnPct > maximumReturn ||
          (result.strategyReturnPct === maximumReturn &&
            index < maxReturnRunIndex)
        ) {
          maximumReturn = result.strategyReturnPct;
          maxReturnRunIndex = index;
          maxReturnCagrPct = annualizedReturn(result.strategyReturnPct, days);
        }
        if (
          result.maxDrawdownPct < lowestDrawdown ||
          (result.maxDrawdownPct === lowestDrawdown &&
            index < lowestDrawdownRunIndex)
        ) {
          lowestDrawdown = result.maxDrawdownPct;
          lowestDrawdownRunIndex = index;
        }
        const strategyCagr = annualizedReturn(result.strategyReturnPct, days);
        const balanceScore = strategyCagr + result.maxDrawdownPct;
        if (
          balanceScore > bestBalanceScore ||
          (balanceScore === bestBalanceScore && index < balancedPickRunIndex)
        ) {
          bestBalanceScore = balanceScore;
          balancedPickRunIndex = index;
          balancedPickCagrPct = strategyCagr;
        }
        completedRuns += 1;
      },
    );
  } catch (failure) {
    completeBacktestEvents(sweepBatchId);
    return Response.json(
      {
        error:
          failure instanceof Error ? failure.message : "A backtest run failed.",
      },
      { status: 500 },
    );
  }
  completeBacktestEvents(sweepBatchId);
  const summary: BacktestSweepSummary = {
    totalRuns: parameterSets.length,
    completedRuns,
    buyAndHoldReturnPct,
    buyAndHoldCagrPct: annualizedReturn(buyAndHoldReturnPct, days),
    maxReturnRunIndex,
    maxReturnCagrPct,
    maxReturnVsBuyAndHoldPct:
      maxReturnCagrPct - annualizedReturn(buyAndHoldReturnPct, days),
    lowestDrawdownRunIndex,
    lowestDrawdownPct: lowestDrawdown,
    balancedPickRunIndex,
    balancedPickCagrPct,
    balancedPickVsBuyAndHoldPct:
      balancedPickCagrPct - annualizedReturn(buyAndHoldReturnPct, days),
  };
  return Response.json({
    summary,
  });
}

export async function GET(request: Request): Promise<Response> {
  return runBacktestRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("batchId" in body) ||
    typeof body.batchId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(body.batchId)
  )
    return Response.json(
      { error: "A valid batch id is required." },
      { status: 400 },
    );
  return runBacktestRequest(request, body.batchId);
}
