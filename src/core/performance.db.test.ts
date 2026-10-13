import { afterAll, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle } from "./types";

mock.module("server-only", () => ({}));
const databaseDirectory = mkdtempSync(join(tmpdir(), "quantify-performance-"));
process.env.QUANTIFY_DB_PATH = join(databaseDirectory, "test.sqlite");

const database = await import("./db");
const webhookAdapter = await import("./adapters/webhook.adapter");
const { capturePortfolioPerformance } = await import("./performance.service");
const HOUR = 60 * 60 * 1000;
const now = Date.now();
const tradeTime = now - 5 * HOUR;

function candle(symbol: string, timestamp: number, close: number): Candle {
  return {
    symbol,
    interval: "1h",
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  };
}

afterAll(async () => {
  await database.db.$client.close();
  rmSync(databaseDirectory, { recursive: true, force: true });
});

describe("trade and performance persistence", () => {
  it("persists multiple webhook configs independently for each user", async () => {
    await database.ensureUserProfile({ id: "webhook-user-a", name: "User A" });
    await database.ensureUserProfile({ id: "webhook-user-b", name: "User B" });

    const first = await database.createWebhookConfig("webhook-user-a", {
      label: "Primary alerts",
      url: "https://example.com/first",
    });
    const second = await database.createWebhookConfig("webhook-user-a", {
      url: "https://example.com/second",
      clientId: "client-a",
      secretToken: "secret-a",
    });
    await database.createWebhookConfig("webhook-user-b", {
      url: "https://other.example.com/hook",
      clientId: "client-b",
    });

    expect(Number.isSafeInteger(first.id)).toBe(true);
    expect(first).toMatchObject({
      userId: "webhook-user-a",
      label: "Primary alerts",
      url: "https://example.com/first",
      clientId: null,
      secretToken: null,
    });
    expect(await database.listWebhookConfigs("webhook-user-a")).toEqual([
      first,
      second,
    ]);
    expect(await database.listWebhookConfigs("webhook-user-b")).toMatchObject([
      { url: "https://other.example.com/hook", clientId: "client-b" },
    ]);

    expect(
      await database.updateWebhookConfig("webhook-user-b", first.id, {
        url: "https://attacker.example.com/hook",
      }),
    ).toBeNull();
    const updated = await database.updateWebhookConfig(
      "webhook-user-a",
      first.id,
      {
        label: "Updated alerts",
        url: "https://example.com/updated",
        secretToken: "secret-updated",
      },
    );
    expect(updated).toMatchObject({
      label: "Updated alerts",
      url: "https://example.com/updated",
      clientId: null,
      secretToken: "secret-updated",
    });
    expect(
      await database.deleteWebhookConfig("webhook-user-b", second.id),
    ).toBe(false);
    expect(await database.deleteWebhookConfig("webhook-user-a", first.id)).toBe(
      true,
    );
    expect(await database.listWebhookConfigs("webhook-user-a")).toEqual([
      second,
    ]);
  });

  it("keeps webhook delivery logs self-contained with timestamp, URL and optional message", async () => {
    await database.ensureUserProfile({
      id: "webhook-log-user",
      name: "Webhook Log User",
    });
    const config = await database.createWebhookConfig("webhook-log-user", {
      url: "https://example.com/events",
    });
    const log = await database.recordWebhookDeliveryLog({
      userId: "webhook-log-user",
      webhookConfigId: config.id,
      eventType: "signal.changed",
      url: config.url,
      status: "success",
      statusCode: 202,
    });

    expect(Number.isSafeInteger(log.timestamp)).toBe(true);
    expect(log).toMatchObject({
      userId: "webhook-log-user",
      webhookConfigId: config.id,
      eventType: "signal.changed",
      url: "https://example.com/events",
      status: "success",
      statusCode: 202,
      message: null,
    });
    expect(
      (
        await database.db.$client.execute(
          "PRAGMA foreign_key_list(webhook_delivery_logs)",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      await database.deleteWebhookConfig("webhook-log-user", config.id),
    ).toBe(true);
    expect(await database.listWebhookDeliveryLogs("webhook-log-user")).toEqual([
      log,
    ]);
    expect(
      await database.listWebhookDeliveryLogs("other-webhook-user"),
    ).toEqual([]);
  });

  it("posts typed webhook events, follows redirects and logs only 2xx as success", async () => {
    await database.ensureUserProfile({
      id: "webhook-adapter-user",
      name: "Webhook Adapter User",
    });
    const config = await database.createWebhookConfig("webhook-adapter-user", {
      url: "https://example.com/events",
      clientId: "client-id",
      secretToken: "secret-token",
    });
    const originalFetch = globalThis.fetch;
    let responseStatus = 204;
    const fetchMock = mock(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> => {
        void _input;
        void _init;
        return new Response(null, { status: responseStatus });
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const payload = {
        type: "signal",
        data: { symbol: "ABC", signal: "BUY" },
      };
      const delivered = await webhookAdapter.invokeWebhook(config, payload);
      expect(delivered.delivered).toBe(true);
      expect(delivered.log).toMatchObject({
        url: config.url,
        eventType: "signal",
        status: "success",
        statusCode: 204,
      });
      const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
      expect(requestUrl).toBe(config.url);
      expect(requestInit).toMatchObject({ method: "POST", redirect: "follow" });
      expect(requestInit?.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Client-ID": "client-id",
        Authorization: "Bearer secret-token",
      });
      expect(JSON.parse(String(requestInit?.body))).toEqual(payload);

      responseStatus = 503;
      const rejected = await webhookAdapter.invokeWebhook(config, payload);
      expect(rejected.delivered).toBe(false);
      expect(rejected.log).toMatchObject({ status: "error", statusCode: 503 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("persists holding strategies independently for the same ticker in different portfolios", async () => {
    const firstPortfolio = await database.createPortfolio("Klinger watchlist");
    const secondPortfolio = await database.createPortfolio("RSI watchlist");
    await database.addHolding(firstPortfolio.id, "TEST.AX");
    await database.addHolding(secondPortfolio.id, "TEST.AX");

    const firstStrategy = await database.saveHoldingStrategy({
      portfolioId: firstPortfolio.id,
      symbol: "TEST.AX",
      label: "Klinger trend",
      name: "klinger-oscillator",
      params: { fastPeriod: 20, slowPeriod: 40, signalPeriod: 10 },
    });
    expect(firstStrategy).toMatchObject({
      id: expect.any(Number),
      portfolioId: firstPortfolio.id,
      symbol: "TEST.AX",
      label: "Klinger trend",
      name: "klinger-oscillator",
      params: { fastPeriod: 20, slowPeriod: 40, signalPeriod: 10 },
    });
    await database.saveHoldingStrategy({
      portfolioId: firstPortfolio.id,
      symbol: "TEST.AX",
      label: "RSI reversal",
      name: "rsi",
      params: { period: 7 },
    });
    await database.saveHoldingStrategy({
      portfolioId: secondPortfolio.id,
      symbol: "TEST.AX",
      label: "RSI reversal",
      name: "rsi",
      params: { period: 7 },
    });

    expect(
      await database.getHoldingStrategy(firstPortfolio.id, "TEST.AX"),
    ).toMatchObject({
      label: "Klinger trend",
      name: "klinger-oscillator",
      params: { fastPeriod: 20, slowPeriod: 40, signalPeriod: 10 },
    });
    expect(
      await database.listHoldingStrategies(firstPortfolio.id),
    ).toHaveLength(2);
    expect(
      await database.listHoldingStrategies(secondPortfolio.id),
    ).toMatchObject([
      {
        id: expect.any(Number),
        portfolioId: secondPortfolio.id,
        symbol: "TEST.AX",
        label: "RSI reversal",
        name: "rsi",
        params: { period: 7 },
      },
    ]);
    const strategyToDelete = (
      await database.listHoldingStrategies(firstPortfolio.id)
    ).find((strategy) => strategy.label === "Klinger trend");
    if (!strategyToDelete) throw new Error("Expected strategy to delete.");
    await database.removeHoldingStrategy(
      firstPortfolio.id,
      strategyToDelete.id,
      "TEST.AX",
    );
    expect(
      await database.listHoldingStrategies(firstPortfolio.id),
    ).toHaveLength(1);

    await database.removeHolding(firstPortfolio.id, "TEST.AX");
    expect(
      await database.getHoldingStrategy(firstPortfolio.id, "TEST.AX"),
    ).toBeNull();
    expect(
      await database.getHoldingStrategy(secondPortfolio.id, "TEST.AX"),
    ).not.toBeNull();
  });

  it("adds a missing holding before saving its strategy", async () => {
    const portfolio = await database.createPortfolio(
      "Auto-add strategy holding",
    );

    const strategy = await database.saveHoldingStrategy({
      portfolioId: portfolio.id,
      symbol: "NEW.AX",
      label: "New signal",
      name: "rsi",
      params: { period: 14 },
    });

    expect(strategy).toMatchObject({
      portfolioId: portfolio.id,
      symbol: "NEW.AX",
    });
    expect(
      (await database.listPortfolios()).find((item) => item.id === portfolio.id)
        ?.holdings,
    ).toEqual([{ symbol: "NEW.AX", addedAt: expect.any(Number) }]);
  });

  it("records signal state timestamps only when the state changes", async () => {
    const portfolio = await database.createPortfolio("Signal state history");
    await database.addHolding(portfolio.id, "STATE.AX");
    const strategy = await database.saveHoldingStrategy({
      portfolioId: portfolio.id,
      symbol: "STATE.AX",
      label: "State tracker",
      name: "rsi",
      params: { period: 14 },
    });

    expect(
      await database.recordSignalState(
        portfolio.id,
        strategy.id,
        "BUY",
        "admin",
        1_000,
      ),
    ).toBe(1_000);
    expect(
      await database.recordSignalState(
        portfolio.id,
        strategy.id,
        "BUY",
        "admin",
        2_000,
      ),
    ).toBe(1_000);
    expect(
      await database.recordSignalState(
        portfolio.id,
        strategy.id,
        "HOLD",
        "admin",
        3_000,
      ),
    ).toBe(3_000);
    expect(
      await database.getHoldingStrategy(portfolio.id, "STATE.AX"),
    ).toMatchObject({ lastSignal: "HOLD", signalUpdatedAt: 3_000 });
  });

  it("records a buy and sell ledger, prevents overselling, and captures hourly snapshots", async () => {
    const [portfolio] = await database.listPortfolios();
    expect(portfolio.holdings).toHaveLength(5);

    await database.recordTrade({
      portfolioId: portfolio.id,
      symbol: "MQG.AX",
      side: "BUY",
      quantity: 10,
      price: 100,
      brokerage: 5,
      timestamp: tradeTime,
    });
    await expect(
      database.recordTrade({
        portfolioId: portfolio.id,
        symbol: "MQG.AX",
        side: "SELL",
        quantity: 1,
        price: 120,
        brokerage: 5,
        timestamp: tradeTime - HOUR,
      }),
    ).rejects.toThrow(
      "Sell quantity exceeds the units held at the selected trade time.",
    );
    await database.recordTrade({
      portfolioId: portfolio.id,
      symbol: "MQG.AX",
      side: "SELL",
      quantity: 2,
      price: 120,
      brokerage: 5,
      timestamp: tradeTime + 2 * HOUR,
    });
    await database.recordCashTransaction({
      portfolioId: portfolio.id,
      type: "DEPOSIT",
      amount: 1_000,
      timestamp: tradeTime - 2 * HOUR,
      note: "Starting capital",
    });
    await database.recordCashTransaction({
      portfolioId: portfolio.id,
      type: "WITHDRAWAL",
      amount: 100,
      timestamp: tradeTime + 3 * HOUR,
      note: "Transfer out",
    });

    await database.saveCandles("1h", [
      candle("MQG.AX", tradeTime - HOUR, 100),
      candle("MQG.AX", tradeTime, 105),
      candle("MQG.AX", tradeTime + HOUR, 120),
      candle("MQG.AX", tradeTime + 2 * HOUR, 110),
      candle("MQG.AX", now + HOUR, 999),
    ]);
    await capturePortfolioPerformance(portfolio.id);

    const storedTrades = await database.listTrades(portfolio.id);
    expect(storedTrades.map((trade) => trade.side)).toEqual(["BUY", "SELL"]);
    const performance = await database.listPerformance(portfolio.id);
    expect(performance.holdings).toHaveLength(4);
    expect(performance.holdings.at(-1)).toMatchObject({
      symbol: "MQG.AX",
      quantity: 8,
      marketPrice: 110,
      averageUnitPrice: 100.5,
      marketValue: 880,
      profitLoss: 110,
    });
    expect(performance.portfolio.at(-1)).toMatchObject({
      cashBalance: 130,
      marketValue: 880,
      totalValue: 1_010,
      contributedCapital: 900,
      profitLoss: 110,
    });
    expect(await database.listCashTransactions(portfolio.id)).toHaveLength(2);
    expect(
      performance.holdings.some((point) => point.marketPrice === 999),
    ).toBe(false);
  });

  it("returns one year of holding snapshots for selectable pulse-chart ranges", async () => {
    const portfolio = await database.createPortfolio("Holding history window");
    const inRangeTimestamp = now - 180 * 24 * HOUR;
    const outOfRangeTimestamp = now - 400 * 24 * HOUR;
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [
        {
          symbol: "AAA.AX",
          timestamp: inRangeTimestamp,
          quantity: 1,
          marketPrice: 100,
          averageUnitPrice: 90,
          marketValue: 100,
          profitLoss: 10,
        },
        {
          symbol: "AAA.AX",
          timestamp: outOfRangeTimestamp,
          quantity: 1,
          marketPrice: 90,
          averageUnitPrice: 90,
          marketValue: 90,
          profitLoss: 0,
        },
      ],
      portfolio: [],
    });

    const performance = await database.listPerformance(portfolio.id);
    expect(performance.holdings.map((point) => point.timestamp)).toContain(
      inRangeTimestamp,
    );
    expect(performance.holdings.map((point) => point.timestamp)).not.toContain(
      outOfRangeTimestamp,
    );
  });

  it("evicts hourly data after 12 months and daily candles after 10 years while preserving ledgers", async () => {
    const portfolio = await database.createPortfolio("Time-series retention");
    const oldTimestamp = now - 400 * 24 * HOUR;
    const currentTimestamp = now - HOUR;
    await database.recordTrade({
      portfolioId: portfolio.id,
      symbol: "AAA.AX",
      side: "BUY",
      quantity: 10,
      price: 100,
      brokerage: 5,
      timestamp: oldTimestamp,
    });
    await database.recordCashTransaction({
      portfolioId: portfolio.id,
      type: "DEPOSIT",
      amount: 2_000,
      timestamp: oldTimestamp - HOUR,
      note: "Original funding",
    });
    await database.saveCandles("1h", [
      candle("AAA.AX", oldTimestamp, 90),
      candle("AAA.AX", currentTimestamp, 120),
    ]);
    await database.saveCandles("1d", [
      { ...candle("AAA.AX", now - 11 * 365 * 24 * HOUR, 80), interval: "1d" },
      { ...candle("AAA.AX", now - 2 * 365 * 24 * HOUR, 100), interval: "1d" },
    ]);
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [
        {
          symbol: "AAA.AX",
          timestamp: oldTimestamp,
          quantity: 10,
          marketPrice: 90,
          averageUnitPrice: 100.5,
          marketValue: 900,
          profitLoss: -115,
        },
        {
          symbol: "AAA.AX",
          timestamp: currentTimestamp,
          quantity: 10,
          marketPrice: 120,
          averageUnitPrice: 100.5,
          marketValue: 1_200,
          profitLoss: 185,
        },
      ],
      portfolio: [
        {
          timestamp: oldTimestamp,
          cashBalance: 995,
          marketValue: 900,
          totalValue: 1_895,
          contributedCapital: 2_000,
          profitLoss: -105,
        },
        {
          timestamp: currentTimestamp,
          cashBalance: 995,
          marketValue: 1_200,
          totalValue: 2_195,
          contributedCapital: 2_000,
          profitLoss: 195,
        },
      ],
    });

    await database.evictExpiredTimeSeriesData(now);

    expect(
      (await database.getCandles("AAA.AX", "1h")).map((row) => row.timestamp),
    ).toEqual([currentTimestamp]);
    expect(
      (await database.getCandles("AAA.AX", "1d")).map((row) => row.timestamp),
    ).toEqual([now - 2 * 365 * 24 * HOUR]);
    expect(
      (await database.listPerformance(portfolio.id)).holdings.map(
        (point) => point.timestamp,
      ),
    ).toEqual([currentTimestamp]);
    expect(await database.listTrades(portfolio.id)).toHaveLength(1);
    expect(await database.listCashTransactions(portfolio.id)).toHaveLength(1);
    expect(
      (await database.listPortfolios())
        .find((row) => row.id === portfolio.id)
        ?.holdings.map((row) => row.symbol),
    ).toContain("AAA.AX");

    await capturePortfolioPerformance(portfolio.id);
    const performance = await database.listPerformance(portfolio.id);
    expect(performance.holdings.at(-1)).toMatchObject({
      quantity: 10,
      marketPrice: 120,
      profitLoss: 195,
    });
    expect(performance.portfolio.at(-1)).toMatchObject({
      cashBalance: 995,
      totalValue: 2_195,
      contributedCapital: 2_000,
      profitLoss: 195,
    });
  });

  it("prevents deleting a buy that supports later sells and clears snapshots after a valid deletion", async () => {
    const portfolio = await database.createPortfolio("Trade deletion");
    const buy = await database.recordTrade({
      portfolioId: portfolio.id,
      symbol: "AAA.AX",
      side: "BUY",
      quantity: 10,
      price: 100,
      brokerage: 5,
      timestamp: tradeTime,
    });
    const sell = await database.recordTrade({
      portfolioId: portfolio.id,
      symbol: "AAA.AX",
      side: "SELL",
      quantity: 2,
      price: 120,
      brokerage: 5,
      timestamp: tradeTime + HOUR,
    });
    await expect(
      database.deletePortfolioTrade(portfolio.id, buy.id),
    ).rejects.toThrow("later sell would exceed the remaining position");
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [
        {
          symbol: "AAA.AX",
          timestamp: now - HOUR,
          quantity: 10,
          marketPrice: 100,
          averageUnitPrice: 100.5,
          marketValue: 1_000,
          profitLoss: -5,
        },
      ],
      portfolio: [
        {
          timestamp: now - HOUR,
          cashBalance: -1_005,
          marketValue: 1_000,
          totalValue: -5,
          contributedCapital: 0,
          profitLoss: -5,
        },
      ],
    });

    expect(
      await database.deletePortfolioTrade(portfolio.id, sell.id),
    ).toMatchObject({ id: sell.id, side: "SELL" });
    expect(await database.listTrades(portfolio.id)).toHaveLength(1);
    expect(await database.listPerformance(portfolio.id)).toEqual({
      holdings: [],
      portfolio: [],
    });
  });

  it("serves six newest trades per page and applies ticker filters before pagination", async () => {
    const portfolio = await database.createPortfolio("Trade pagination");
    const insertedTrades = [];
    for (let index = 0; index < 8; index += 1) {
      insertedTrades.push(
        await database.recordTrade({
          portfolioId: portfolio.id,
          symbol: index < 3 ? "AAA.AX" : "BBB.AX",
          side: "BUY",
          quantity: 1,
          price: 100 + index,
          brokerage: 0,
          timestamp: tradeTime + index * HOUR,
        }),
      );
    }

    const pageOne = await database.listTradePage(portfolio.id, 1);
    const pageTwo = await database.listTradePage(portfolio.id, 2);
    const filtered = await database.listTradePage(portfolio.id, 1, "BBB.AX");
    expect(pageOne.trades).toHaveLength(6);
    expect(pageOne.trades[0].id).toBe(insertedTrades[7].id);
    expect(pageTwo.trades.map((trade) => trade.id)).toEqual([
      insertedTrades[1].id,
      insertedTrades[0].id,
    ]);
    expect(filtered.trades).toHaveLength(5);
    expect(filtered.trades.every((trade) => trade.symbol === "BBB.AX")).toBe(
      true,
    );
    expect(filtered.total).toBe(5);
    expect(filtered.tickers).toEqual(["AAA.AX", "BBB.AX"]);
  });

  it("handles profile upserts, ownership checks, alerts, and missing ledger records", async () => {
    const profile = await database.ensureUserProfile({
      id: "researcher",
      name: "Researcher",
      email: "one@example.com",
      image: "avatar.png",
      googleSubject: "google-1",
    });
    expect(await database.getUserProfile("researcher")).toMatchObject({
      id: "researcher",
      name: "Researcher",
      email: "one@example.com",
    });

    const updated = await database.ensureUserProfile({
      id: profile.id,
      name: "Updated Researcher",
      isAnonymous: false,
    });
    expect(updated).toMatchObject({
      id: "researcher",
      name: "Updated Researcher",
      email: null,
      image: null,
      googleSubject: null,
      isAnonymous: false,
    });
    expect(await database.getUserProfile("missing-user")).toBeNull();

    const portfolio = await database.createPortfolio(
      "Research portfolio",
      profile.id,
    );
    expect(await database.ownsPortfolio(portfolio.id, profile.id)).toBe(true);
    expect(await database.ownsPortfolio(portfolio.id, "admin")).toBe(false);
    await expect(database.addHolding(999_999, "TEST.AX")).rejects.toThrow(
      "Portfolio not found.",
    );
    await expect(database.removeHolding(999_999, "TEST.AX")).rejects.toThrow(
      "Portfolio not found.",
    );
    await expect(
      database.recordCashTransaction({
        portfolioId: 999_999,
        type: "DEPOSIT",
        amount: 10,
        timestamp: now,
        note: "",
      }),
    ).rejects.toThrow("Portfolio not found.");
    await expect(
      database.deleteCashTransaction(portfolio.id, 999_999, profile.id),
    ).rejects.toThrow("Cash transaction not found.");

    await database.recordAlert(
      portfolio.id,
      {
        symbol: "TEST.AX",
        strategyId: "rsi",
        signal: "BUY",
        timestamp: now,
        price: 100,
        rationale: "test alert",
        indicators: { rsi: 29 },
      },
      profile.id,
    );
    expect(await database.listAlerts(portfolio.id, profile.id)).toMatchObject([
      { portfolioId: portfolio.id, indicators: { rsi: 29 } },
    ]);
    expect(await database.listAlerts(undefined, profile.id)).toHaveLength(1);
    expect(
      await database.listCashTransactionPage(portfolio.id, 1),
    ).toMatchObject({ transactions: [], total: 0, page: 1, pageCount: 0 });

    const cashTransaction = await database.recordCashTransaction(
      {
        portfolioId: portfolio.id,
        type: "DEPOSIT",
        amount: 25,
        timestamp: now,
        note: "Test funding",
      },
      profile.id,
    );
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [],
      portfolio: [
        {
          timestamp: now,
          cashBalance: 25,
          marketValue: 0,
          totalValue: 25,
          contributedCapital: 25,
          profitLoss: 0,
        },
      ],
    });
    await expect(
      database.deleteCashTransaction(
        portfolio.id,
        cashTransaction.id,
        profile.id,
      ),
    ).resolves.toMatchObject({ id: cashTransaction.id });
    expect(await database.listPerformance(portfolio.id)).toEqual({
      holdings: [],
      portfolio: [],
    });

    await expect(
      database.deletePortfolio(portfolio.id, profile.id),
    ).resolves.toBeUndefined();
    expect(await database.ownsPortfolio(portfolio.id, profile.id)).toBe(false);
  });

  it("persists MCP sweeps and pages results only for their owner", async () => {
    await database.ensureUserProfile({ id: "mcp-sweep-owner", name: "Owner" });
    await database.ensureUserProfile({ id: "mcp-sweep-other", name: "Other" });
    const sweep = await database.createMcpSweep(
      {
        userId: "mcp-sweep-owner",
        symbol: "ABC",
        strategyId: "rsi",
        cadence: "1h",
        days: 30,
        totalRuns: 3,
      },
      [
        {
          runIndex: 0,
          params: { period: 5 },
          metrics: { strategyReturnPct: 1 },
        },
        {
          runIndex: 1,
          params: { period: 10 },
          metrics: { strategyReturnPct: 2 },
        },
        {
          runIndex: 2,
          params: { period: 15 },
          metrics: { strategyReturnPct: 3 },
        },
      ],
    );
    expect(await database.getMcpSweep("mcp-sweep-other", sweep.id)).toBeNull();
    expect(
      await database.listMcpSweepRuns("mcp-sweep-other", sweep.id),
    ).toEqual([]);
    expect(
      await database.listMcpSweepRuns("mcp-sweep-owner", sweep.id, 1, 1),
    ).toEqual([
      {
        sweepId: sweep.id,
        runIndex: 1,
        params: { period: 10 },
        metrics: { strategyReturnPct: 2 },
      },
    ]);
    expect(
      await database.getMcpSweepRun("mcp-sweep-owner", sweep.id, 2),
    ).toMatchObject({
      sweep: { id: sweep.id, symbol: "ABC", cadence: "1h" },
      run: { runIndex: 2, params: { period: 15 } },
    });
    expect(await database.listMcpSweeps("mcp-sweep-owner")).toMatchObject([
      { id: sweep.id, totalRuns: 3 },
    ]);
    expect(await database.listMcpSweeps("mcp-sweep-other")).toEqual([]);

    const portfolio = await database.createPortfolio(
      "Agent portfolio",
      "mcp-sweep-owner",
      "mcp",
    );
    expect(portfolio.createdVia).toBe("mcp");
    await expect(
      database.updatePortfolioName(portfolio.id, "Renamed", "mcp-sweep-other"),
    ).resolves.toBeNull();
    await expect(
      database.updatePortfolioName(portfolio.id, "Renamed", "mcp-sweep-owner"),
    ).resolves.toMatchObject({ name: "Renamed", createdVia: "mcp" });
    await database.addHolding(portfolio.id, "ABC", "mcp-sweep-owner");
    const signal = await database.saveHoldingStrategy(
      {
        portfolioId: portfolio.id,
        symbol: "ABC",
        label: "RSI setup",
        name: "rsi",
        params: { period: 14 },
      },
      "mcp-sweep-owner",
    );
    expect(
      await database.listHoldingStrategies(portfolio.id, "mcp-sweep-other"),
    ).toEqual([]);
    await database.recordSignalStateChange(
      portfolio.id,
      signal.id,
      "BUY",
      "mcp-sweep-owner",
      now,
    );
    expect(
      await database.listHoldingStrategies(portfolio.id, "mcp-sweep-owner"),
    ).toMatchObject([
      { id: signal.id, lastSignal: "BUY", signalUpdatedAt: now },
    ]);
  });

  it("restricts MCP ledger changes to MCP portfolios and pages trade and cash ledgers consistently", async () => {
    await database.ensureUserProfile({
      id: "mcp-ledger-owner",
      name: "Ledger Owner",
    });
    await database.ensureUserProfile({
      id: "mcp-ledger-other",
      name: "Other Owner",
    });
    const manual = await database.createPortfolio(
      "Manual ledger",
      "mcp-ledger-owner",
    );
    const mcp = await database.createPortfolio(
      "Agent ledger",
      "mcp-ledger-owner",
      "mcp",
    );
    await expect(
      database.recordMcpTrade(
        {
          portfolioId: manual.id,
          symbol: "ABC",
          side: "BUY",
          quantity: 1,
          price: 10,
          brokerage: 0,
          timestamp: now,
        },
        "mcp-ledger-owner",
      ),
    ).rejects.toThrow("MCP-created portfolio not found.");
    await expect(
      database.recordMcpCashTransaction(
        {
          portfolioId: manual.id,
          type: "DEPOSIT",
          amount: 100,
          timestamp: now,
          note: "",
        },
        "mcp-ledger-owner",
      ),
    ).rejects.toThrow("MCP-created portfolio not found.");

    const buy = await database.recordMcpTrade(
      {
        portfolioId: mcp.id,
        symbol: "ABC",
        side: "BUY",
        quantity: 10,
        price: 100,
        brokerage: 1,
        timestamp: now - 10,
      },
      "mcp-ledger-owner",
    );
    const sell = await database.recordMcpTrade(
      {
        portfolioId: mcp.id,
        symbol: "ABC",
        side: "SELL",
        quantity: 5,
        price: 110,
        brokerage: 1,
        timestamp: now - 5,
      },
      "mcp-ledger-owner",
    );
    await expect(
      database.updateMcpTrade(
        mcp.id,
        buy.id,
        {
          symbol: "ABC",
          side: "BUY",
          quantity: 4,
          price: 100,
          brokerage: 1,
          timestamp: now - 10,
        },
        "mcp-ledger-owner",
      ),
    ).rejects.toThrow("position negative");
    await expect(
      database.updateMcpTrade(
        mcp.id,
        buy.id,
        {
          symbol: "ABC",
          side: "BUY",
          quantity: 12,
          price: 101,
          brokerage: 1,
          timestamp: now - 10,
        },
        "mcp-ledger-owner",
      ),
    ).resolves.toMatchObject({ trade: { quantity: 12, price: 101 } });

    const cash = await database.recordMcpCashTransaction(
      {
        portfolioId: mcp.id,
        type: "DEPOSIT",
        amount: 250,
        timestamp: now - 3,
        note: "Initial funding",
      },
      "mcp-ledger-owner",
    );
    await expect(
      database.updateMcpCashTransaction(
        mcp.id,
        cash.id,
        {
          type: "WITHDRAWAL",
          amount: 50,
          timestamp: now - 2,
          note: "Correction",
        },
        "mcp-ledger-owner",
      ),
    ).resolves.toMatchObject({ type: "WITHDRAWAL", amount: 50 });
    await expect(
      database.deleteMcpCashTransaction(mcp.id, cash.id, "mcp-ledger-other"),
    ).rejects.toThrow("MCP-created portfolio not found.");

    for (let index = 0; index < 5; index += 1) {
      await database.recordMcpTrade(
        {
          portfolioId: mcp.id,
          symbol: "XYZ",
          side: "BUY",
          quantity: 1,
          price: 10,
          brokerage: 0,
          timestamp: now + index,
        },
        "mcp-ledger-owner",
      );
    }
    const firstTradePage = await database.listTradePage(mcp.id, 1);
    const secondTradePage = await database.listTradePage(mcp.id, 2);
    const firstCashPage = await database.listCashTransactionPage(mcp.id, 1);
    expect(firstTradePage).toMatchObject({
      page: 1,
      pageSize: 6,
      total: 7,
      pageCount: 2,
    });
    expect(secondTradePage).toMatchObject({
      page: 2,
      pageSize: firstTradePage.pageSize,
      total: firstTradePage.total,
      pageCount: firstTradePage.pageCount,
    });
    expect(firstTradePage.trades.map(({ id }) => id)).not.toContain(
      secondTradePage.trades[0]?.id,
    );
    expect(firstCashPage).toMatchObject({
      page: 1,
      pageSize: firstTradePage.pageSize,
      total: 1,
      pageCount: 1,
    });

    await database.deleteMcpTrade(mcp.id, sell.id, "mcp-ledger-owner");
    await database.deleteMcpTrade(mcp.id, buy.id, "mcp-ledger-owner");
    await database.deleteMcpCashTransaction(
      mcp.id,
      cash.id,
      "mcp-ledger-owner",
    );
  });
});
