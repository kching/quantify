import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  authenticateMcpToken,
  createPortfolio,
  createWebhookConfig,
  deleteMcpPortfolio,
  deleteMcpWebhookConfig,
  getCandles,
  listPortfolios,
  listTrades,
  listWebhookConfigs,
  ownsPortfolio,
  listPortfolioTradeSymbols,
  saveHoldingStrategy,
  updateMcpWebhookConfig,
  TIME_SERIES_RETENTION_MS,
  DAILY_CANDLE_HISTORY_DAYS,
  DAILY_CANDLE_RETENTION_MS,
  saveCandles,
} from "@/core/db";
import { strategies, loadStrategy } from "@/core/engine";
import { runBacktestSweepWorkers } from "@/core/backtest-workers";
import { fetchYahooCandles } from "@/core/providers/yahoo.provider";
import type {
  CandleInterval,
  StrategyParams,
  WebhookConfigInput,
} from "@/core/types";
import { hashMcpSecret } from "@/lib/mcp-tokens";

export const dynamic = "force-dynamic";
const MAX_SWEEP_COMBINATIONS = 100_000;

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function safeWebhook(
  value: Awaited<ReturnType<typeof listWebhookConfigs>>[number],
) {
  return {
    id: value.id,
    label: value.label,
    url: value.url,
    clientId: value.clientId,
    hasSecretToken: Boolean(value.secretToken),
    createdVia: value.createdVia,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function makeServer(userId: string): McpServer {
  const server = new McpServer({ name: "quantify", version: "1.0.0" });
  server.registerTool(
    "list_strategies",
    { description: "List available strategies and their parameters." },
    async () =>
      toolResult(
        strategies.map(({ id, name, inputParams }) => ({
          id,
          name,
          parameters: inputParams,
        })),
      ),
  );
  server.registerTool(
    "run_sweep",
    {
      description: `Run a parameter sweep for a stock. Supply an integer [min,max,step] tuple for each numeric strategy parameter. Maximum ${MAX_SWEEP_COMBINATIONS.toLocaleString()} combinations.`,
      inputSchema: z.object({
        symbol: z.string().min(1).max(20),
        strategyId: z.string(),
        cadence: z.enum(["hourly", "daily"]).default("daily"),
        days: z.number().int().min(30).max(3650).default(365),
        ranges: z.record(
          z.string(),
          z.tuple([z.number().int(), z.number().int(), z.number().int()]),
        ),
      }),
    },
    async ({ symbol: rawSymbol, strategyId, cadence, days, ranges }) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol))
        throw new Error("Invalid ticker symbol.");
      const strategy = strategies.find((item) => item.id === strategyId);
      if (!strategy) throw new Error("Unknown strategy.");
      const descriptors = strategy.inputParams.filter(
        (item) => item.type === "number",
      );
      if (
        !descriptors.length ||
        descriptors.some(({ id }) => !ranges[id]) ||
        Object.keys(ranges).some((id) => !descriptors.some((p) => p.id === id))
      )
        throw new Error(
          "Provide a range for every numeric strategy parameter.",
        );
      let combinations: StrategyParams[] = [{}];
      for (const descriptor of descriptors) {
        const tuple = ranges[descriptor.id];
        if (!tuple) throw new Error("Missing parameter range.");
        const [min, max, step] = tuple;
        if (
          !Number.isSafeInteger(min) ||
          !Number.isSafeInteger(max) ||
          !Number.isSafeInteger(step) ||
          min < 1 ||
          max < min ||
          step < 0
        )
          throw new Error(`Invalid range for ${descriptor.id}.`);
        const valueCount =
          step === 0
            ? min === max
              ? 1
              : 2
            : Math.ceil((max - min) / step) + 1;
        if (combinations.length * valueCount > MAX_SWEEP_COMBINATIONS)
          throw new Error(
            `Sweep exceeds the ${MAX_SWEEP_COMBINATIONS.toLocaleString()} combination limit.`,
          );
        const values =
          step === 0
            ? [...new Set([min, max])]
            : [
                ...new Set([
                  ...Array.from(
                    { length: Math.floor((max - min) / step) + 1 },
                    (_, i) => min + i * step,
                  ),
                  max,
                ]),
              ];
        combinations = combinations.flatMap((params) =>
          values.map((value) => ({ ...params, [descriptor.id]: value })),
        );
        if (combinations.length > MAX_SWEEP_COMBINATIONS)
          throw new Error(
            `Sweep exceeds the ${MAX_SWEEP_COMBINATIONS.toLocaleString()} combination limit.`,
          );
      }
      const interval: CandleInterval = cadence === "hourly" ? "1h" : "1d";
      const historyDays =
        interval === "1h"
          ? Math.floor(TIME_SERIES_RETENTION_MS / 86_400_000)
          : DAILY_CANDLE_HISTORY_DAYS;
      const cutoff =
        Date.now() -
        (interval === "1h"
          ? TIME_SERIES_RETENTION_MS
          : DAILY_CANDLE_RETENTION_MS);
      let candles = await getCandles(symbol, interval);
      if (!candles.length || candles[0]!.timestamp > cutoff) {
        const fetched = await fetchYahooCandles(symbol, interval, historyDays);
        await saveCandles(
          interval,
          fetched.filter((candle) => candle.timestamp >= cutoff),
        );
        candles = await getCandles(symbol, interval);
      }
      if (candles.length < 70)
        throw new Error(`At least 70 ${cadence} candles are needed.`);
      const window = candles.filter(
        (candle) =>
          candle.timestamp >=
          Date.now() - Math.min(days, historyDays) * 86_400_000,
      );
      const runs: Array<{
        runIndex: number;
        params: StrategyParams;
        metrics: Record<string, number | string>;
      }> = [];
      await runBacktestSweepWorkers(
        symbol,
        window,
        strategyId,
        combinations,
        (result, params, runIndex) =>
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
          }),
      );
      runs.sort((a, b) => a.runIndex - b.runIndex);
      return toolResult({
        symbol,
        strategyId,
        cadence,
        days,
        summary: {
          totalRuns: runs.length,
          bestReturnRunIndex: runs.reduce(
            (best, run) =>
              run.metrics.strategyReturnPct >
              runs[best]!.metrics.strategyReturnPct
                ? run.runIndex
                : best,
            0,
          ),
          lowestDrawdownRunIndex: runs.reduce(
            (best, run) =>
              run.metrics.maxDrawdownPct < runs[best]!.metrics.maxDrawdownPct
                ? run.runIndex
                : best,
            0,
          ),
        },
        runs,
      });
    },
  );
  server.registerTool(
    "save_sweep_result_as_signal",
    {
      description:
        "Save selected sweep parameters as an active signal in a portfolio.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        symbol: z.string(),
        strategyId: z.string(),
        params: z.record(
          z.string(),
          z.union([
            z.number(),
            z.array(z.number()),
            z.boolean(),
            z.array(z.boolean()),
          ]),
        ),
        cadence: z.enum(["hourly", "daily"]).default("daily"),
        label: z.string().min(1).max(100),
      }),
    },
    async (input) => {
      const symbol = input.symbol.trim().toUpperCase();
      if (
        !/^[A-Z0-9.^-]{1,20}$/.test(symbol) ||
        !(await ownsPortfolio(input.portfolioId, userId))
      )
        throw new Error("Portfolio or ticker not found.");
      const strategy = await loadStrategy(input.strategyId);
      if (!strategy) throw new Error("Unknown strategy.");
      const validIds = new Set(strategy.inputParams.map(({ id }) => id));
      if (Object.keys(input.params).some((key) => !validIds.has(key)))
        throw new Error("Parameters do not match this strategy.");
      return toolResult(
        await saveHoldingStrategy(
          {
            portfolioId: input.portfolioId,
            symbol,
            label: input.label,
            name: input.strategyId,
            params: input.params as StrategyParams,
            candleType: input.cadence === "hourly" ? "1h" : "1d",
          },
          userId,
        ),
      );
    },
  );
  server.registerTool(
    "list_portfolios",
    { description: "List portfolios and their current holdings." },
    async () => toolResult(await listPortfolios(userId)),
  );
  server.registerTool(
    "list_current_holdings",
    {
      description:
        "List current net share positions calculated from recorded trades.",
    },
    async () => {
      const portfolios = await listPortfolios(userId);
      const positions = await Promise.all(
        portfolios.map(async (portfolio) => {
          const trades = await listTrades(portfolio.id);
          const symbols = await listPortfolioTradeSymbols(portfolio.id);
          const holdings = symbols.map((symbol) => {
            const forSymbol = trades.filter((trade) => trade.symbol === symbol);
            const quantity = forSymbol.reduce(
              (sum, trade) =>
                sum + (trade.side === "BUY" ? trade.quantity : -trade.quantity),
              0,
            );
            return {
              symbol,
              quantity,
              lastTradeAt: forSymbol.at(-1)?.timestamp ?? null,
            };
          });
          return {
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            holdings: holdings.filter((holding) => holding.quantity > 0),
          };
        }),
      );
      return toolResult(positions);
    },
  );
  server.registerTool(
    "create_portfolio",
    {
      description: "Create a portfolio managed by MCP.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(100) }),
    },
    async ({ name }) => toolResult(await createPortfolio(name, userId, "mcp")),
  );
  server.registerTool(
    "delete_mcp_portfolio",
    {
      description: "Delete a portfolio originally created through MCP.",
      inputSchema: z.object({ portfolioId: z.number().int().positive() }),
    },
    async ({ portfolioId }) => {
      if (!(await deleteMcpPortfolio(portfolioId, userId)))
        throw new Error("MCP-created portfolio not found.");
      return toolResult({ success: true });
    },
  );
  server.registerTool(
    "list_past_trades",
    {
      description: "List trades recorded in an owned portfolio. Read-only.",
      inputSchema: z.object({ portfolioId: z.number().int().positive() }),
    },
    async ({ portfolioId }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      return toolResult(await listTrades(portfolioId));
    },
  );
  server.registerTool(
    "list_webhooks",
    { description: "List webhook configurations with secrets redacted." },
    async () => toolResult((await listWebhookConfigs(userId)).map(safeWebhook)),
  );
  const webhookSchema = z.object({
    label: z.string().trim().min(1).max(100),
    url: z.string().url(),
    clientId: z.string().nullable().optional(),
    secretToken: z.string().nullable().optional(),
  });
  const validateWebhook = (input: WebhookConfigInput): WebhookConfigInput => {
    const url = new URL(input.url);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Webhook URL must use HTTP or HTTPS.");
    return { ...input, url: url.toString() };
  };
  server.registerTool(
    "create_webhook",
    {
      description: "Create an MCP-owned webhook. Secret values are write-only.",
      inputSchema: webhookSchema,
    },
    async (input) =>
      toolResult(
        safeWebhook(
          await createWebhookConfig(userId, validateWebhook(input), "mcp"),
        ),
      ),
  );
  server.registerTool(
    "update_mcp_webhook",
    {
      description:
        "Update a webhook originally created through MCP. Secret values are write-only; omit secretToken to preserve it.",
      inputSchema: webhookSchema.extend({
        webhookId: z.number().int().positive(),
      }),
    },
    async ({ webhookId, ...input }) => {
      const updated = await updateMcpWebhookConfig(
        userId,
        webhookId,
        validateWebhook(input),
      );
      if (!updated) throw new Error("MCP-created webhook not found.");
      return toolResult(safeWebhook(updated));
    },
  );
  server.registerTool(
    "delete_mcp_webhook",
    {
      description: "Delete a webhook originally created through MCP.",
      inputSchema: z.object({ webhookId: z.number().int().positive() }),
    },
    async ({ webhookId }) => {
      if (!(await deleteMcpWebhookConfig(userId, webhookId)))
        throw new Error("MCP-created webhook not found.");
      return toolResult({ success: true });
    },
  );
  return server;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (qcp_[a-f0-9]{64})$/i.exec(authorization);
  if (!match)
    return Response.json({ error: "Bearer token required." }, { status: 401 });
  const token = match[1]!;
  const identity = await authenticateMcpToken(await hashMcpSecret(token));
  if (!identity)
    return Response.json(
      { error: "Invalid or expired token." },
      { status: 401 },
    );
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host)
        return Response.json({ error: "Origin not allowed." }, { status: 403 });
    } catch {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
  }
  const handler = createMcpHandler(() => makeServer(identity.userId));
  return handler.fetch(request, {
    authInfo: {
      token,
      clientId: "quantify-personal-token",
      scopes: [],
      expiresAt: Math.floor((Date.now() + 60_000) / 1000),
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
