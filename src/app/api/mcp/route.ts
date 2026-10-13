import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  authenticateMcpToken,
  addHolding,
  enqueueMcpSweep,
  createPortfolio,
  createWebhookConfig,
  deleteMcpPortfolio,
  deleteMcpWebhookConfig,
  getMcpSweep,
  getMcpSweepRun,
  listAlerts,
  listCashTransactionPage,
  listHoldingStrategies,
  listMcpSweepRuns,
  listMcpSweeps,
  listPortfolios,
  listPerformance,
  listTrades,
  listTradePage,
  listWebhookConfigs,
  ownsPortfolio,
  listPortfolioTradeSymbols,
  listWebhookDeliveryLogs,
  recordMcpCashTransaction,
  recordMcpTrade,
  saveHoldingStrategy,
  removeHolding,
  removeHoldingStrategy,
  deleteMcpCashTransaction,
  deleteMcpTrade,
  updateMcpCashTransaction,
  updateMcpTrade,
  updatePortfolioName,
  updateMcpWebhookConfig,
  DAILY_CANDLE_HISTORY_DAYS,
  saveCandles,
} from "@/core/db";
import { refreshPortfolioSymbol, scanPortfolio } from "@/core/market";
import { capturePortfolioPerformance } from "@/core/performance.service";
import { strategies, loadStrategy } from "@/core/engine";
import { wakeMcpSweepJobs } from "@/core/mcp-sweep-jobs";
import {
  MCP_SWEEP_RESULT_TTL_MS,
  readMcpSweepResults,
} from "@/core/mcp-sweep-results";
import { fetchYahooCandles } from "@/core/providers/yahoo.provider";
import type {
  CandleInterval,
  McpSweepRun,
  StrategyParams,
  WebhookConfigInput,
} from "@/core/types";
import { hashMcpSecret } from "@/lib/mcp-tokens";

export const dynamic = "force-dynamic";
const MAX_SWEEP_COMBINATIONS = 1_000;

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent:
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { items: value },
  };
}

function expiredSweepResult() {
  const error = "Sweep results expired or are unavailable after one hour.";
  return {
    isError: true,
    content: [{ type: "text" as const, text: `404: ${error}` }],
    structuredContent: { status: 404, error },
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

function validSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol))
    throw new Error("Invalid ticker symbol.");
  return symbol;
}

function validateStrategyParams(
  strategy: (typeof strategies)[number],
  params: StrategyParams,
): void {
  const descriptors = new Map(
    strategy.inputParams.map((item) => [item.id, item]),
  );
  for (const [id, value] of Object.entries(params)) {
    const descriptor = descriptors.get(id);
    if (!descriptor) throw new Error(`Unknown parameter: ${id}.`);
    const valid =
      descriptor.type === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : descriptor.type === "boolean"
          ? typeof value === "boolean"
          : descriptor.type === "number[]"
            ? Array.isArray(value) &&
              value.every(
                (item) => typeof item === "number" && Number.isFinite(item),
              )
            : Array.isArray(value) &&
              value.every((item) => typeof item === "boolean");
    if (!valid) throw new Error(`Invalid value for strategy parameter ${id}.`);
  }
}

async function refreshLedgerData(
  portfolioId: number,
  symbols: readonly string[],
  userId: string,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const symbol of new Set(symbols)) {
    try {
      await refreshPortfolioSymbol(portfolioId, symbol, userId);
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : `Unable to refresh ${symbol}.`,
      );
    }
  }
  if (warnings.length) {
    try {
      await capturePortfolioPerformance(portfolioId);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Unable to rebuild portfolio performance.",
      );
    }
  }
  return warnings;
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
      description: `Queue a parameter sweep for a stock and return its sweep ID immediately. Poll get_sweep_status, then read get_sweep_results when completed. Results expire one hour after completion. Supply an integer [min,max,step] tuple for each numeric strategy parameter. Maximum ${MAX_SWEEP_COMBINATIONS.toLocaleString()} combinations.`,
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
      const symbol = validSymbol(rawSymbol);
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
      const historyDays = interval === "1h" ? 365 : DAILY_CANDLE_HISTORY_DAYS;
      const sweep = await enqueueMcpSweep(
        {
          userId,
          symbol,
          strategyId,
          cadence: interval,
          days: Math.min(days, historyDays),
          totalRuns: combinations.length,
        },
        combinations,
      );
      await wakeMcpSweepJobs();
      return toolResult({ sweep, sweepId: sweep.id, status: sweep.status });
    },
  );
  server.registerTool(
    "get_sweep_status",
    {
      description:
        "Read a sweep's current queued, running, completed, or failed state and progress. Completed results expire one hour after completion.",
      inputSchema: z.object({ sweepId: z.number().int().positive() }),
    },
    async ({ sweepId }) => {
      await wakeMcpSweepJobs();
      const sweep = await getMcpSweep(userId, sweepId);
      if (!sweep) throw new Error("Sweep not found.");
      return toolResult({ sweep });
    },
  );
  server.registerTool(
    "get_sweep_results",
    {
      description:
        "Read a bounded page of runs from a completed sweep. Results expire one hour after completion; expired or missing results report a 404 tool error. The authenticated GET /api/mcp/sweeps/{sweepId}/results endpoint returns HTTP 404 for the same case. Check status before selecting a result. Results are ordered by run index.",
      inputSchema: z.object({
        sweepId: z.number().int().positive(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(10),
      }),
    },
    async ({ sweepId, offset, limit }) => {
      await wakeMcpSweepJobs();
      const sweep = await getMcpSweep(userId, sweepId);
      if (!sweep) throw new Error("Sweep not found.");
      let runs: McpSweepRun[] = [];
      if (sweep.status === "completed") {
        const expiresAt =
          sweep.resultsExpiresAt ??
          (sweep.finishedAt ?? sweep.createdAt) + MCP_SWEEP_RESULT_TTL_MS;
        if (Date.now() >= expiresAt) return expiredSweepResult();
        if (sweep.resultsExpiresAt !== null) {
          const storedRuns = await readMcpSweepResults(sweep.id, expiresAt);
          if (!storedRuns) return expiredSweepResult();
          runs = storedRuns
            .slice(offset, offset + limit)
            .map((run) => ({ ...run, sweepId }));
        } else {
          runs = await listMcpSweepRuns(userId, sweepId, offset, limit);
        }
      }
      return toolResult({
        sweep,
        offset,
        limit,
        runs,
      });
    },
  );
  server.registerTool(
    "list_sweeps",
    {
      description: "List recent sweeps created by the authenticated user.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async ({ limit }) => {
      await wakeMcpSweepJobs();
      return toolResult(await listMcpSweeps(userId, limit));
    },
  );
  server.registerTool(
    "save_sweep_result_as_signal",
    {
      description:
        "Save selected sweep parameters as an active signal in a portfolio. Sweep results must be selected within one hour of completion.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        symbol: z.string().optional(),
        strategyId: z.string().optional(),
        params: z.record(
          z.string(),
          z.union([
            z.number(),
            z.array(z.number()),
            z.boolean(),
            z.array(z.boolean()),
          ]),
        ),
        cadence: z.enum(["hourly", "daily"]).optional(),
        sweepId: z.number().int().positive().optional(),
        runIndex: z.number().int().min(0).optional(),
        label: z.string().min(1).max(100),
      }),
    },
    async (input) => {
      let symbol: string;
      let strategyId: string;
      let params: StrategyParams;
      let cadence: "hourly" | "daily";
      if (input.sweepId !== undefined || input.runIndex !== undefined) {
        if (input.sweepId === undefined || input.runIndex === undefined)
          throw new Error("Provide both sweepId and runIndex.");
        const selected = await getMcpSweepRun(
          userId,
          input.sweepId,
          input.runIndex,
        );
        if (!selected) throw new Error("Sweep run not found.");
        symbol = selected.sweep.symbol;
        strategyId = selected.sweep.strategyId;
        params = selected.run.params;
        cadence = selected.sweep.cadence === "1h" ? "hourly" : "daily";
      } else {
        if (!input.symbol || !input.strategyId || !input.params)
          throw new Error(
            "Provide sweepId/runIndex or symbol, strategyId, and params.",
          );
        symbol = validSymbol(input.symbol);
        strategyId = input.strategyId;
        params = input.params as StrategyParams;
        cadence = input.cadence ?? "daily";
      }
      if (!(await ownsPortfolio(input.portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const strategy = await loadStrategy(strategyId);
      if (!strategy) throw new Error("Unknown strategy.");
      validateStrategyParams(strategy, params);
      return toolResult(
        await saveHoldingStrategy(
          {
            portfolioId: input.portfolioId,
            symbol,
            label: input.label,
            name: strategyId,
            params,
            candleType: cadence === "hourly" ? "1h" : "1d",
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
    "rename_portfolio",
    {
      description: "Rename a portfolio owned by the authenticated user.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        name: z.string().trim().min(1).max(100),
      }),
    },
    async ({ portfolioId, name }) => {
      const portfolio = await updatePortfolioName(portfolioId, name, userId);
      if (!portfolio) throw new Error("Portfolio not found.");
      return toolResult(portfolio);
    },
  );
  server.registerTool(
    "add_watchlist_symbol",
    {
      description: "Validate and add a ticker to a portfolio watchlist.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        symbol: z.string().min(1).max(20),
      }),
    },
    async ({ portfolioId, symbol: rawSymbol }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const symbol = validSymbol(rawSymbol);
      const candles = await fetchYahooCandles(symbol, "1d", 365);
      if (!candles.length) throw new Error("Ticker not found.");
      await addHolding(portfolioId, symbol, userId);
      await saveCandles("1d", candles);
      return toolResult({ portfolioId, symbol, added: true });
    },
  );
  server.registerTool(
    "remove_watchlist_symbol",
    {
      description:
        "Remove a ticker and its configured signals from a portfolio watchlist.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        symbol: z.string().min(1).max(20),
      }),
    },
    async ({ portfolioId, symbol: rawSymbol }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const symbol = validSymbol(rawSymbol);
      await removeHolding(portfolioId, symbol, userId);
      return toolResult({ portfolioId, symbol, removed: true });
    },
  );
  server.registerTool(
    "list_signals",
    {
      description: "List configured signals and their latest evaluated state.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive().optional(),
      }),
    },
    async ({ portfolioId }) => {
      if (portfolioId !== undefined) {
        if (!(await ownsPortfolio(portfolioId, userId)))
          throw new Error("Portfolio not found.");
        return toolResult(await listHoldingStrategies(portfolioId, userId));
      }
      const portfolios = await listPortfolios(userId);
      const signals = await Promise.all(
        portfolios.map(async (portfolio) =>
          (await listHoldingStrategies(portfolio.id, userId)).map((signal) => ({
            ...signal,
            portfolioName: portfolio.name,
          })),
        ),
      );
      return toolResult(signals.flat());
    },
  );
  server.registerTool(
    "update_signal",
    {
      description:
        "Update a configured signal in a portfolio owned by the authenticated user.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        signalId: z.number().int().positive(),
        symbol: z.string().min(1).max(20),
        label: z.string().trim().min(1).max(100),
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
        cadence: z.enum(["hourly", "daily"]),
      }),
    },
    async ({
      portfolioId,
      signalId,
      symbol: rawSymbol,
      label,
      strategyId,
      params: rawParams,
      cadence,
    }) => {
      const symbol = validSymbol(rawSymbol);
      const existing = (await listHoldingStrategies(portfolioId, userId)).find(
        (signal) => signal.id === signalId,
      );
      if (!existing || existing.symbol !== symbol)
        throw new Error("Signal not found.");
      const strategy = await loadStrategy(strategyId);
      if (!strategy) throw new Error("Unknown strategy.");
      const params = rawParams as StrategyParams;
      validateStrategyParams(strategy, params);
      return toolResult(
        await saveHoldingStrategy(
          {
            id: signalId,
            portfolioId,
            symbol,
            label,
            name: strategyId,
            params,
            candleType: cadence === "hourly" ? "1h" : "1d",
          },
          userId,
        ),
      );
    },
  );
  server.registerTool(
    "delete_signal",
    {
      description:
        "Delete a configured signal from a portfolio owned by the authenticated user.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        signalId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, signalId }) => {
      const existing = (await listHoldingStrategies(portfolioId, userId)).find(
        (signal) => signal.id === signalId,
      );
      if (!existing) throw new Error("Signal not found.");
      await removeHoldingStrategy(
        portfolioId,
        signalId,
        existing.symbol,
        userId,
      );
      return toolResult({ success: true, portfolioId, signalId });
    },
  );
  server.registerTool(
    "scan_portfolio",
    {
      description:
        "Refresh market candles and evaluate every configured signal in an owned portfolio. This can update signal state and trigger Telegram/webhook notifications.",
      inputSchema: z.object({ portfolioId: z.number().int().positive() }),
    },
    async ({ portfolioId }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      return toolResult(await scanPortfolio(portfolioId, userId));
    },
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
          const performance = await listPerformance(portfolio.id);
          const latestPerformanceBySymbol = new Map<
            string,
            (typeof performance.holdings)[number]
          >();
          for (const point of performance.holdings) {
            const previous = latestPerformanceBySymbol.get(point.symbol);
            if (!previous || point.timestamp > previous.timestamp)
              latestPerformanceBySymbol.set(point.symbol, point);
          }
          const latestPortfolioPerformance =
            performance.portfolio.at(-1) ?? null;
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
              currentPrice:
                latestPerformanceBySymbol.get(symbol)?.marketPrice ?? null,
              marketValue:
                latestPerformanceBySymbol.get(symbol)?.marketValue ?? null,
              unrealizedProfitLoss:
                latestPerformanceBySymbol.get(symbol)?.profitLoss ?? null,
              asOf: latestPerformanceBySymbol.get(symbol)?.timestamp ?? null,
            };
          });
          return {
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            cashBalance: latestPortfolioPerformance?.cashBalance ?? null,
            portfolioValue: latestPortfolioPerformance?.totalValue ?? null,
            performanceAsOf: latestPortfolioPerformance?.timestamp ?? null,
            holdings: holdings.filter((holding) => holding.quantity > 0),
          };
        }),
      );
      return toolResult(positions);
    },
  );
  server.registerTool(
    "get_portfolio_performance",
    {
      description:
        "Read recent stored portfolio and per-holding performance snapshots, including their timestamps.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        limit: z.number().int().min(1).max(365).default(90),
      }),
    },
    async ({ portfolioId, limit }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const snapshots = await listPerformance(portfolioId);
      const latestBySymbol = new Map<
        string,
        (typeof snapshots.holdings)[number]
      >();
      for (const point of snapshots.holdings) {
        const previous = latestBySymbol.get(point.symbol);
        if (!previous || point.timestamp > previous.timestamp)
          latestBySymbol.set(point.symbol, point);
      }
      return toolResult({
        portfolioId,
        portfolio: snapshots.portfolio.slice(-limit),
        holdings: [...latestBySymbol.values()],
        asOf: snapshots.portfolio.at(-1)?.timestamp ?? null,
      });
    },
  );
  server.registerTool(
    "list_cash_transactions",
    {
      description:
        "Read a page of cash deposits and withdrawals. This tool does not modify the cash ledger.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(10),
      }),
    },
    async ({ portfolioId, page, pageSize }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const history = await listCashTransactionPage(
        portfolioId,
        page,
        pageSize,
      );
      const performance = await listPerformance(portfolioId);
      return toolResult({
        portfolioId,
        cashBalance: performance.portfolio.at(-1)?.cashBalance ?? null,
        ...history,
      });
    },
  );
  const tradeInputSchema = z.object({
    symbol: z.string().min(1).max(20),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().finite().positive(),
    price: z.number().finite().positive(),
    brokerage: z.number().finite().min(0),
    timestamp: z.number().int().positive().safe(),
  });
  const cashInputSchema = z.object({
    type: z.enum(["DEPOSIT", "WITHDRAWAL"]),
    amount: z.number().finite().positive(),
    timestamp: z.number().int().positive().safe(),
    note: z.string().max(160).default(""),
  });
  server.registerTool(
    "record_trade",
    {
      description:
        "Record a buy or sell in an MCP-created portfolio. Trade ledger modifications are restricted to MCP-created portfolios.",
      inputSchema: tradeInputSchema.extend({
        portfolioId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, ...input }) => {
      const symbol = validSymbol(input.symbol);
      const trade = await recordMcpTrade(
        { ...input, symbol, portfolioId },
        userId,
      );
      const refreshWarnings = await refreshLedgerData(
        portfolioId,
        [symbol],
        userId,
      );
      return toolResult({ trade, refreshWarnings });
    },
  );
  server.registerTool(
    "update_trade",
    {
      description:
        "Update an existing trade in an MCP-created portfolio. The update is rejected if it would create a negative position.",
      inputSchema: tradeInputSchema.extend({
        portfolioId: z.number().int().positive(),
        tradeId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, tradeId, ...input }) => {
      const symbol = validSymbol(input.symbol);
      const result = await updateMcpTrade(
        portfolioId,
        tradeId,
        { ...input, symbol },
        userId,
      );
      const refreshWarnings = await refreshLedgerData(
        portfolioId,
        [result.previousSymbol, symbol],
        userId,
      );
      return toolResult({ trade: result.trade, refreshWarnings });
    },
  );
  server.registerTool(
    "delete_trade",
    {
      description:
        "Delete a trade from an MCP-created portfolio. Deletion is rejected when later trades would leave a negative position.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        tradeId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, tradeId }) => {
      const trade = await deleteMcpTrade(portfolioId, tradeId, userId);
      const refreshWarnings = await refreshLedgerData(
        portfolioId,
        [trade.symbol],
        userId,
      );
      return toolResult({ deletedTrade: trade, refreshWarnings });
    },
  );
  server.registerTool(
    "record_cash_transaction",
    {
      description:
        "Record a deposit or withdrawal in an MCP-created portfolio. Cash ledger modifications are restricted to MCP-created portfolios.",
      inputSchema: cashInputSchema.extend({
        portfolioId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, ...input }) => {
      const transaction = await recordMcpCashTransaction(
        { ...input, portfolioId },
        userId,
      );
      let refreshWarning: string | null = null;
      try {
        await capturePortfolioPerformance(portfolioId);
      } catch (error) {
        refreshWarning =
          error instanceof Error
            ? error.message
            : "Unable to rebuild portfolio performance.";
      }
      return toolResult({ transaction, refreshWarning });
    },
  );
  server.registerTool(
    "update_cash_transaction",
    {
      description: "Update a cash transaction in an MCP-created portfolio.",
      inputSchema: cashInputSchema.extend({
        portfolioId: z.number().int().positive(),
        transactionId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, transactionId, ...input }) => {
      const transaction = await updateMcpCashTransaction(
        portfolioId,
        transactionId,
        input,
        userId,
      );
      let refreshWarning: string | null = null;
      try {
        await capturePortfolioPerformance(portfolioId);
      } catch (error) {
        refreshWarning =
          error instanceof Error
            ? error.message
            : "Unable to rebuild portfolio performance.";
      }
      return toolResult({ transaction, refreshWarning });
    },
  );
  server.registerTool(
    "delete_cash_transaction",
    {
      description: "Delete a cash transaction from an MCP-created portfolio.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        transactionId: z.number().int().positive(),
      }),
    },
    async ({ portfolioId, transactionId }) => {
      const transaction = await deleteMcpCashTransaction(
        portfolioId,
        transactionId,
        userId,
      );
      let refreshWarning: string | null = null;
      try {
        await capturePortfolioPerformance(portfolioId);
      } catch (error) {
        refreshWarning =
          error instanceof Error
            ? error.message
            : "Unable to rebuild portfolio performance.";
      }
      return toolResult({ deletedTransaction: transaction, refreshWarning });
    },
  );
  server.registerTool(
    "get_market_data",
    {
      description:
        "Fetch and return recent daily or hourly candles for a ticker. Returns at most 500 candles.",
      inputSchema: z.object({
        symbol: z.string().min(1).max(20),
        cadence: z.enum(["hourly", "daily"]).default("daily"),
        days: z.number().int().min(1).max(3650).default(30),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    },
    async ({ symbol: rawSymbol, cadence, days, limit }) => {
      const symbol = validSymbol(rawSymbol);
      const interval: CandleInterval = cadence === "hourly" ? "1h" : "1d";
      const historyDays = interval === "1h" ? 365 : DAILY_CANDLE_HISTORY_DAYS;
      const candles = await fetchYahooCandles(
        symbol,
        interval,
        Math.min(days, historyDays),
      );
      await saveCandles(interval, candles);
      return toolResult({
        symbol,
        cadence,
        candles: candles.slice(-limit),
        asOf: candles.at(-1)?.timestamp ?? null,
      });
    },
  );
  server.registerTool(
    "list_alerts",
    {
      description:
        "Read recent signal alerts for an owned portfolio, or across the user's portfolios.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive().optional(),
      }),
    },
    async ({ portfolioId }) => {
      if (
        portfolioId !== undefined &&
        !(await ownsPortfolio(portfolioId, userId))
      )
        throw new Error("Portfolio not found.");
      return toolResult(await listAlerts(portfolioId, userId));
    },
  );
  server.registerTool(
    "list_webhook_delivery_logs",
    {
      description:
        "Read recent webhook delivery successes and failures for the authenticated user.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(500).default(100),
      }),
    },
    async ({ limit }) =>
      toolResult(await listWebhookDeliveryLogs(userId, limit)),
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
      description:
        "Read one page of trade history, using the same page size and metadata as cash-ledger history.",
      inputSchema: z.object({
        portfolioId: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(10),
        symbol: z.string().optional(),
      }),
    },
    async ({ portfolioId, page, pageSize, symbol: rawSymbol }) => {
      if (!(await ownsPortfolio(portfolioId, userId)))
        throw new Error("Portfolio not found.");
      const symbol = rawSymbol ? validSymbol(rawSymbol) : undefined;
      return toolResult(
        await listTradePage(portfolioId, page, symbol, pageSize),
      );
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
