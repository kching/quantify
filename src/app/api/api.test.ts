import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Candle, Portfolio } from "@/core/types";

const seededPortfolios = [
  {
    id: 1,
    userId: "admin",
    name: "My watchlist",
    createdAt: 1,
    holdings: [{ symbol: "MQG.AX", addedAt: 1 }],
  },
];
let portfolios = structuredClone(seededPortfolios);
let alerts: Array<Record<string, unknown>> = [];
let candles: Candle[] = [];
let recordedTrades: Array<Record<string, unknown>> = [];
let recordedCashTransactions: Array<Record<string, unknown>> = [];

const listPortfolios = mock(async () => portfolios);
const ownsPortfolio = mock(async (id: number) => id === 1);
const createPortfolio = mock(async (name: string): Promise<Portfolio> => {
  if (portfolios.some((portfolio) => portfolio.name === name))
    throw new Error("duplicate");
  const portfolio: Portfolio = {
    id: portfolios.length + 1,
    userId: "admin",
    name,
    createdAt: 2,
  };
  portfolios.push({ ...portfolio, holdings: [] });
  return portfolio;
});
const deletePortfolio = mock(async (id: number) => {
  portfolios = portfolios.filter((portfolio) => portfolio.id !== id);
});
const addHolding = mock(async (id: number, symbol: string) => {
  const portfolio = portfolios.find((item) => item.id === id);
  if (!portfolio) throw new Error("not found");
  if (!portfolio.holdings.some((holding) => holding.symbol === symbol))
    portfolio.holdings.push({ symbol, addedAt: 3 });
});
const removeHolding = mock(async (id: number, symbol: string) => {
  const portfolio = portfolios.find((item) => item.id === id);
  if (portfolio)
    portfolio.holdings = portfolio.holdings.filter(
      (holding) => holding.symbol !== symbol,
    );
});
const getCandles = mock(async (symbol: string) =>
  candles.filter((candle) => candle.symbol === symbol),
);
const saveCandles = mock(async (_interval: string, rows: readonly Candle[]) => {
  candles = [...candles, ...rows];
});
const listAlerts = mock(async () => alerts);
const listTrades = mock(async () => recordedTrades);
const listTradePage = mock(
  async (portfolioId: number, page: number, symbol?: string) => {
    const matches = recordedTrades.filter(
      (trade) =>
        trade.portfolioId === portfolioId &&
        (!symbol || trade.symbol === symbol),
    );
    const ordered = [...matches].sort(
      (left, right) =>
        Number(right.timestamp) - Number(left.timestamp) ||
        Number(right.id) - Number(left.id),
    );
    const pageSize = 6;
    const pageCount = Math.ceil(matches.length / pageSize);
    const safePage = Math.min(page, Math.max(pageCount, 1));
    return {
      trades: ordered.slice((safePage - 1) * pageSize, safePage * pageSize),
      tickers: [
        ...new Set(recordedTrades.map((trade) => String(trade.symbol))),
      ].sort(),
      total: matches.length,
      page: safePage,
      pageSize,
      pageCount,
    };
  },
);
const recordTrade = mock(async (trade: Record<string, unknown>) => {
  const created = { id: recordedTrades.length + 1, ...trade };
  recordedTrades.push(created);
  return created;
});
const deletePortfolioTrade = mock(
  async (portfolioId: number, tradeId: number) => {
    const index = recordedTrades.findIndex(
      (trade) => trade.portfolioId === portfolioId && trade.id === tradeId,
    );
    if (index < 0) throw new Error("Trade not found.");
    return recordedTrades.splice(index, 1)[0];
  },
);
const capturePortfolioPerformance = mock(async () => undefined);
const listCashTransactionPage = mock(
  async (portfolioId: number, page: number) => {
    const matches = recordedCashTransactions.filter(
      (transaction) => transaction.portfolioId === portfolioId,
    );
    const total = matches.length;
    const pageSize = 6;
    const pageCount = Math.ceil(total / pageSize);
    const safePage = Math.min(page, Math.max(pageCount, 1));
    const ordered = [...matches].sort(
      (left, right) =>
        Number(right.timestamp) - Number(left.timestamp) ||
        Number(right.id) - Number(left.id),
    );
    return {
      transactions: ordered.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize,
      ),
      total,
      page: safePage,
      pageSize,
      pageCount,
    };
  },
);
const recordCashTransaction = mock(
  async (transaction: Record<string, unknown>) => {
    const created = { id: recordedCashTransactions.length + 1, ...transaction };
    recordedCashTransactions.push(created);
    return created;
  },
);
const deleteCashTransaction = mock(
  async (portfolioId: number, transactionId: number) => {
    const index = recordedCashTransactions.findIndex(
      (transaction) =>
        transaction.portfolioId === portfolioId &&
        transaction.id === transactionId,
    );
    if (index < 0) throw new Error("Cash transaction not found.");
    return recordedCashTransactions.splice(index, 1)[0];
  },
);
const listPerformance = mock(async () => ({ holdings: [], portfolio: [] }));
const listPortfolioTradeSymbols = mock(async () => [] as string[]);
const savePerformanceSnapshots = mock(async () => undefined);
const scanPortfolio = mock(async (portfolioId: number) => ({
  portfolioId,
  scanned: 1,
}));
const runBacktest = mock(() => ({
  symbol: "TEST.AX",
  strategyId: "klinger-oscillator",
  trades: [],
}));
const fetchYahooCandles = mock(async () => [] as Candle[]);

mock.module("@/core/db", () => ({
  DAILY_CANDLE_HISTORY_DAYS: 3650,
  DAILY_CANDLE_RETENTION_MS: 10 * 365 * 24 * 60 * 60 * 1000,
  TIME_SERIES_RETENTION_MS: 365 * 24 * 60 * 60 * 1000,
  listPortfolios,
  createPortfolio,
  deletePortfolio,
  addHolding,
  removeHolding,
  ownsPortfolio,
  getCandles,
  saveCandles,
  listAlerts,
  listTrades,
  listTradePage,
  recordTrade,
  deletePortfolioTrade,
  listPerformance,
  listPortfolioTradeSymbols,
  savePerformanceSnapshots,
  listCashTransactionPage,
  recordCashTransaction,
  deleteCashTransaction,
}));
mock.module("@/core/market", () => ({ scanPortfolio }));
mock.module("@/core/performance.service", () => ({
  capturePortfolioPerformance,
}));
mock.module("@/core/backtest", () => ({ runBacktest }));
mock.module("@/core/engine", () => ({
  strategies: [
    {
      id: "klinger-oscillator",
      name: "Klinger",
      inputParams: [
        {
          type: "number",
          id: "fastPeriod",
          label: "Fast period",
          defaultValues: { min: 10, max: 60, step: 1 },
        },
        {
          type: "number",
          id: "slowPeriod",
          label: "Slow period",
          defaultValues: { min: 30, max: 100, step: 1 },
        },
        {
          type: "number",
          id: "signalPeriod",
          label: "Signal period",
          defaultValues: { min: 5, max: 30, step: 1 },
        },
      ],
      analyze: () => ({}),
    },
  ],
}));
mock.module("@/core/providers/yahoo.provider", () => ({ fetchYahooCandles }));

const portfoliosRoute = await import("./portfolios/route");
const portfolioRoute = await import("./portfolios/[id]/route");
const holdingsRoute = await import("./portfolios/[id]/holdings/route");
const alertsRoute = await import("./alerts/route");
const scanRoute = await import("./scan/route");
const backtestRoute = await import("./backtest/route");
const backtestEventsRoute = await import("./backtest/events/route");
const tradesRoute = await import("./portfolios/[id]/trades/route");
const performanceRoute = await import("./portfolios/[id]/performance/route");
const cashRoute = await import("./portfolios/[id]/cash/route");
const cashItemRoute =
  await import("./portfolios/[id]/cash/[transactionId]/route");
const tradeItemRoute = await import("./portfolios/[id]/trades/[tradeId]/route");

function request(url: string, method = "GET", body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("API route handlers", () => {
  beforeEach(() => {
    portfolios = structuredClone(seededPortfolios);
    alerts = [];
    candles = [];
    recordedTrades = [];
    recordedCashTransactions = [];
    fetchYahooCandles.mockResolvedValue([
      {
        symbol: "CSL",
        interval: "1d",
        timestamp: 1,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
      },
    ]);
    for (const handler of [
      listPortfolios,
      createPortfolio,
      deletePortfolio,
      addHolding,
      removeHolding,
      ownsPortfolio,
      getCandles,
      saveCandles,
      listAlerts,
      listTrades,
      listTradePage,
      recordTrade,
      deletePortfolioTrade,
      capturePortfolioPerformance,
      listPerformance,
      listPortfolioTradeSymbols,
      savePerformanceSnapshots,
      listCashTransactionPage,
      recordCashTransaction,
      deleteCashTransaction,
      scanPortfolio,
      runBacktest,
      fetchYahooCandles,
    ])
      handler.mockClear();
    runBacktest.mockImplementation(() => ({
      symbol: "TEST.AX",
      strategyId: "klinger-oscillator",
      trades: [],
    }));
  });

  describe("/api/portfolios", () => {
    it("lists portfolios and their holdings", async () => {
      const response = await portfoliosRoute.GET();
      expect(response.status).toBe(200);
      expect((await payload(response)).portfolios).toEqual(seededPortfolios);
    });

    it("validates and creates a portfolio", async () => {
      expect(
        (
          await portfoliosRoute.POST(
            request("/api/portfolios", "POST", { name: "  " }),
          )
        ).status,
      ).toBe(400);
      const response = await portfoliosRoute.POST(
        request("/api/portfolios", "POST", { name: "Growth" }),
      );
      expect(response.status).toBe(201);
      expect((await payload(response)).portfolio).toMatchObject({
        name: "Growth",
        holdings: [],
      });
      expect(createPortfolio).toHaveBeenCalledWith("Growth", "admin");
    });

    it("rejects duplicate portfolio names", async () => {
      const response = await portfoliosRoute.POST(
        request("/api/portfolios", "POST", { name: "My watchlist" }),
      );
      expect(response.status).toBe(409);
    });
  });

  describe("/api/portfolios/[id]", () => {
    it("rejects malformed ids and deletes valid portfolios", async () => {
      expect(
        (
          await portfolioRoute.DELETE(
            request("/api/portfolios/nope", "DELETE"),
            context("nope"),
          )
        ).status,
      ).toBe(400);
      const response = await portfolioRoute.DELETE(
        request("/api/portfolios/1", "DELETE"),
        context("1"),
      );
      expect(response.status).toBe(200);
      expect(await payload(response)).toEqual({ ok: true });
      expect(deletePortfolio).toHaveBeenCalledWith(1, "admin");
    });
  });

  describe("/api/portfolios/[id]/holdings", () => {
    it("normalizes symbol case and preserves the entered market", async () => {
      const invalid = await holdingsRoute.POST(
        request("/api/portfolios/1/holdings", "POST", { symbol: "bad symbol" }),
        context("1"),
      );
      expect(invalid.status).toBe(400);
      const response = await holdingsRoute.POST(
        request("/api/portfolios/1/holdings", "POST", { symbol: " csl " }),
        context("1"),
      );
      expect(response.status).toBe(201);
      expect(addHolding).toHaveBeenCalledWith(1, "CSL", "admin");
      await holdingsRoute.POST(
        request("/api/portfolios/1/holdings", "POST", { symbol: "qqq" }),
        context("1"),
      );
      expect(addHolding).toHaveBeenCalledWith(1, "QQQ", "admin");
    });

    it("returns not found when adding to an unknown portfolio", async () => {
      const response = await holdingsRoute.POST(
        request("/api/portfolios/99/holdings", "POST", { symbol: "CSL" }),
        context("99"),
      );
      expect(response.status).toBe(404);
    });

    it("returns not found when Yahoo has no data for a ticker", async () => {
      fetchYahooCandles.mockResolvedValueOnce([]);
      const response = await holdingsRoute.POST(
        request("/api/portfolios/1/holdings", "POST", { symbol: "NOTREAL" }),
        context("1"),
      );
      expect(response.status).toBe(404);
      expect(await payload(response)).toEqual({ error: "Ticker not found." });
      expect(addHolding).not.toHaveBeenCalled();
    });

    it("validates and removes a holding", async () => {
      expect(
        (
          await holdingsRoute.DELETE(
            request("/api/portfolios/1/holdings?symbol=bad%20symbol", "DELETE"),
            context("1"),
          )
        ).status,
      ).toBe(400);
      const response = await holdingsRoute.DELETE(
        request("/api/portfolios/1/holdings?symbol=mqg.ax", "DELETE"),
        context("1"),
      );
      expect(response.status).toBe(200);
      expect(removeHolding).toHaveBeenCalledWith(1, "MQG.AX", "admin");
    });
  });

  it("validates and filters alert requests", async () => {
    expect(
      (await alertsRoute.GET(request("/api/alerts?portfolioId=0"))).status,
    ).toBe(400);
    const response = await alertsRoute.GET(
      request("/api/alerts?portfolioId=1"),
    );
    expect(response.status).toBe(200);
    expect(await payload(response)).toEqual({ alerts: [] });
    expect(listAlerts).toHaveBeenCalledWith(1, "admin");
  });

  describe("/api/portfolios/[id]/trades", () => {
    it("lists ledger entries for an existing portfolio", async () => {
      const response = await tradesRoute.GET(
        request("/api/portfolios/1/trades"),
        context("1"),
      );
      expect(response.status).toBe(200);
      expect(await payload(response)).toEqual({
        trades: [],
        tickers: [],
        total: 0,
        page: 1,
        pageSize: 6,
        pageCount: 0,
      });
      expect(
        (
          await tradesRoute.GET(
            request("/api/portfolios/no/trades"),
            context("no"),
          )
        ).status,
      ).toBe(400);
    });

    it("filters and paginates trade requests at six entries per page", async () => {
      recordedTrades = Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        portfolioId: 1,
        symbol: index < 3 ? "MQG.AX" : "XRO.AX",
        timestamp: index + 1,
      }));
      const response = await tradesRoute.GET(
        request("/api/portfolios/1/trades?page=2&symbol=xro.ax"),
        context("1"),
      );
      expect(response.status).toBe(200);
      expect(await payload(response)).toEqual({
        trades: [
          { id: 8, portfolioId: 1, symbol: "XRO.AX", timestamp: 8 },
          { id: 7, portfolioId: 1, symbol: "XRO.AX", timestamp: 7 },
          { id: 6, portfolioId: 1, symbol: "XRO.AX", timestamp: 6 },
          { id: 5, portfolioId: 1, symbol: "XRO.AX", timestamp: 5 },
          { id: 4, portfolioId: 1, symbol: "XRO.AX", timestamp: 4 },
        ],
        tickers: ["MQG.AX", "XRO.AX"],
        total: 5,
        page: 1,
        pageSize: 6,
        pageCount: 1,
      });
      expect(listTradePage).toHaveBeenCalledWith(1, 2, "XRO.AX");
      expect(
        (
          await tradesRoute.GET(
            request("/api/portfolios/1/trades?page=0"),
            context("1"),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await tradesRoute.GET(
            request("/api/portfolios/1/trades?symbol=invalid%20ticker"),
            context("1"),
          )
        ).status,
      ).toBe(400);
    });

    it("validates a trade and preserves non-ASX tickers", async () => {
      expect(
        (
          await tradesRoute.POST(
            request("/api/portfolios/1/trades", "POST", {
              symbol: "MQG",
              side: "BUY",
              quantity: 0,
              price: 100,
              brokerage: 5,
              timestamp: 1,
            }),
            context("1"),
          )
        ).status,
      ).toBe(400);
      const response = await tradesRoute.POST(
        request("/api/portfolios/1/trades", "POST", {
          symbol: "qqq",
          side: "BUY",
          quantity: 10,
          price: 100,
          brokerage: 7.25,
          timestamp: 1,
        }),
        context("1"),
      );
      expect(response.status).toBe(201);
      expect(recordTrade).toHaveBeenCalledWith(
        {
          portfolioId: 1,
          symbol: "QQQ",
          side: "BUY",
          quantity: 10,
          price: 100,
          brokerage: 7.25,
          timestamp: 1,
        },
        "admin",
      );
    });

    it("returns an error when the ledger rejects a sell", async () => {
      recordTrade.mockRejectedValueOnce(
        new Error("Sell quantity exceeds the units currently held."),
      );
      const response = await tradesRoute.POST(
        request("/api/portfolios/1/trades", "POST", {
          symbol: "MQG.AX",
          side: "SELL",
          quantity: 2,
          price: 100,
          brokerage: 5,
          timestamp: 1,
        }),
        context("1"),
      );
      expect(response.status).toBe(422);
      expect((await payload(response)).error).toBe(
        "Sell quantity exceeds the units currently held.",
      );
    });
  });

  it("/api/portfolios/[id]/trades/[tradeId] deletes a trade and rebuilds performance", async () => {
    recordedTrades = [{ id: 7, portfolioId: 1, symbol: "MQG.AX", side: "BUY" }];
    const response = await tradeItemRoute.DELETE(
      request("/api/portfolios/1/trades/7", "DELETE"),
      { params: Promise.resolve({ id: "1", tradeId: "7" }) },
    );
    expect(response.status).toBe(200);
    expect((await payload(response)).ok).toBe(true);
    expect(deletePortfolioTrade).toHaveBeenCalledWith(1, 7, "admin");
    expect(capturePortfolioPerformance).toHaveBeenCalledWith(1);
    expect(
      (
        await tradeItemRoute.DELETE(
          request("/api/portfolios/x/trades/7", "DELETE"),
          { params: Promise.resolve({ id: "x", tradeId: "7" }) },
        )
      ).status,
    ).toBe(400);
  });

  it("returns portfolio performance and validates its portfolio id", async () => {
    expect(
      (
        await performanceRoute.GET(
          request("/api/portfolios/1/performance"),
          context("1"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await performanceRoute.GET(
          request("/api/portfolios/no/performance"),
          context("no"),
        )
      ).status,
    ).toBe(400);
  });

  it("/api/portfolios/[id]/cash lists and records valid cash movements", async () => {
    const getResponse = await cashRoute.GET(
      request("/api/portfolios/1/cash"),
      context("1"),
    );
    expect(getResponse.status).toBe(200);
    expect((await payload(getResponse)).transactions).toEqual([]);
    expect(listCashTransactionPage).toHaveBeenCalledWith(1, 1);

    expect(
      (
        await cashRoute.POST(
          request("/api/portfolios/1/cash", "POST", {
            type: "DEPOSIT",
            amount: -5,
            timestamp: 2,
          }),
          context("1"),
        )
      ).status,
    ).toBe(400);
    const response = await cashRoute.POST(
      request("/api/portfolios/1/cash", "POST", {
        type: "DEPOSIT",
        amount: 5_000,
        timestamp: 2,
        note: "Funding",
      }),
      context("1"),
    );
    expect(response.status).toBe(201);
    expect(recordCashTransaction).toHaveBeenCalledWith(
      {
        portfolioId: 1,
        type: "DEPOSIT",
        amount: 5_000,
        timestamp: 2,
        note: "Funding",
      },
      "admin",
    );
  });

  it("/api/portfolios/[id]/cash/[transactionId] deletes a cash movement and rebuilds performance", async () => {
    recordedCashTransactions = [
      {
        id: 8,
        portfolioId: 1,
        type: "DEPOSIT",
        amount: 500,
        timestamp: 2,
        note: "",
      },
    ];
    const response = await cashItemRoute.DELETE(
      request("/api/portfolios/1/cash/8", "DELETE"),
      { params: Promise.resolve({ id: "1", transactionId: "8" }) },
    );
    expect(response.status).toBe(200);
    expect((await payload(response)).ok).toBe(true);
    expect(deleteCashTransaction).toHaveBeenCalledWith(1, 8, "admin");
    expect(capturePortfolioPerformance).toHaveBeenCalledWith(1);
  });

  it("only scans an existing portfolio and returns scan errors as 500", async () => {
    expect(
      (await scanRoute.GET(request("/api/scan?portfolioId=99"))).status,
    ).toBe(404);
    expect(scanPortfolio).not.toHaveBeenCalled();
    scanPortfolio.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await scanRoute.GET(request("/api/scan?portfolioId=1"));
    expect(response.status).toBe(500);
    expect(await payload(response)).toEqual({ error: "provider unavailable" });
  });

  describe("/api/backtest", () => {
    it("rejects an invalid ticker or strategy", async () => {
      expect(
        (await backtestRoute.GET(request("/api/backtest?symbol=bad%20ticker")))
          .status,
      ).toBe(400);
      expect(
        (
          await backtestRoute.GET(
            request("/api/backtest?symbol=MQG.AX&strategy=unknown"),
          )
        ).status,
      ).toBe(400);
    });

    it("returns 422 when there are too few cached candles", async () => {
      const response = await backtestRoute.GET(
        request("/api/backtest?symbol=MQG.AX"),
      );
      expect(response.status).toBe(422);
      expect(fetchYahooCandles).toHaveBeenCalledWith("MQG.AX", "1d", 3650);
    });

    it("uses cached candles for a valid backtest", async () => {
      const now = Date.now();
      candles = Array.from({ length: 80 }, (_, index) => ({
        symbol: "MQG.AX",
        interval: "1d",
        timestamp: now - (79 - index) * 86_400_000,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1_000,
      }));
      const response = await backtestRoute.GET(
        request("/api/backtest?symbol=MQG.AX&days=365"),
      );
      expect(response.status).toBe(200);
      expect((await payload(response)).result).toEqual({
        symbol: "TEST.AX",
        strategyId: "klinger-oscillator",
        trades: [],
      });
      expect(fetchYahooCandles).toHaveBeenCalledWith("MQG.AX", "1d", 3650);
      expect(runBacktest).toHaveBeenCalledTimes(1);
    });

    it("streams sweep events and returns a summary after the batch completes", async () => {
      const now = Date.now();
      candles = Array.from({ length: 80 }, (_, index) => ({
        symbol: "MQG.AX",
        interval: "1d",
        timestamp: now - (79 - index) * 86_400_000,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1_000,
      }));
      runBacktest.mockClear();
      runBacktest.mockImplementation(() => ({
        symbol: "TEST.AX",
        strategyId: "klinger-oscillator",
        initialBalance: 10_000,
        finalBalance: 10_500,
        strategyReturnPct: 5,
        buyAndHoldReturnPct: 10,
        totalReturnPct: -5,
        winRatePct: 50,
        maxDrawdownPct: 4,
        trades: [],
      }));
      const tuple = (min: number, max: number, step: number): string =>
        encodeURIComponent(JSON.stringify([min, max, step]));
      const batchId = "sweep-test-1";
      const eventResponse = await backtestEventsRoute.GET(
        request(`/api/backtest/events?batchId=${batchId}`),
      );
      expect(eventResponse.status).toBe(200);
      expect(eventResponse.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      expect(eventResponse.headers.get("x-accel-buffering")).toBe("no");
      const eventReader = eventResponse.body!.getReader();
      const responsePromise = backtestRoute.POST(
        request(
          `/api/backtest?symbol=MQG.AX&fastPeriod=${tuple(10, 20, 10)}&slowPeriod=${tuple(30, 40, 10)}&signalPeriod=${tuple(5, 15, 10)}`,
          "POST",
          { batchId },
        ),
      );
      const decoder = new TextDecoder();
      let eventText = "";
      while ((eventText.match(/event: result/g) ?? []).length < 8) {
        const { value, done } = await eventReader.read();
        if (done) throw new Error("Sweep event stream closed too early.");
        eventText += decoder.decode(value);
      }
      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(await payload(response)).toEqual({
        summary: {
          totalRuns: 8,
          completedRuns: 8,
          buyAndHoldReturnPct: 10,
          buyAndHoldCagrPct: 10,
          maxReturnRunIndex: 0,
          maxReturnCagrPct: 5,
          maxReturnVsBuyAndHoldPct: -5,
          lowestDrawdownRunIndex: 0,
          lowestDrawdownPct: 4,
          balancedPickRunIndex: 0,
          balancedPickCagrPct: 5,
          balancedPickVsBuyAndHoldPct: -5,
        },
      });
      expect(eventText.match(/event: result/g)).toHaveLength(8);
      const eventRuns = eventText
        .split("\n\n")
        .filter(Boolean)
        .map((frame) => {
          const data = frame
            .split("\n")
            .find((line) => line.startsWith("data: "));
          return data ? JSON.parse(data.slice(6)) : null;
        });
      expect(eventRuns.map((run) => run?.runIndex).sort()).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ]);
      await eventReader.cancel();
      expect(runBacktest).toHaveBeenCalledTimes(8);
    });

    it("returns 502 when history cannot be fetched", async () => {
      fetchYahooCandles.mockRejectedValueOnce(new Error("Yahoo unavailable"));
      const response = await backtestRoute.GET(
        request("/api/backtest?symbol=MQG.AX"),
      );
      expect(response.status).toBe(502);
      expect(await payload(response)).toEqual({ error: "Yahoo unavailable" });
    });
  });
});
