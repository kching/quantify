import { describe, expect, it } from "bun:test";
import { calculatePerformanceSnapshots } from "./performance";
import type { Candle, PortfolioCashTransaction, PortfolioTrade } from "./types";

const HOUR = 60 * 60 * 1000;

const trades: PortfolioTrade[] = [
  {
    id: 1,
    portfolioId: 1,
    symbol: "AAA.AX",
    side: "BUY",
    quantity: 10,
    price: 100,
    brokerage: 5,
    timestamp: HOUR,
  },
  {
    id: 2,
    portfolioId: 1,
    symbol: "AAA.AX",
    side: "SELL",
    quantity: 4,
    price: 120,
    brokerage: 5,
    timestamp: 3 * HOUR,
  },
  {
    id: 3,
    portfolioId: 1,
    symbol: "BBB.AX",
    side: "BUY",
    quantity: 2,
    price: 50,
    brokerage: 2,
    timestamp: 2 * HOUR,
  },
];

function candles(symbol: string, values: Array<[number, number]>): Candle[] {
  return values.map(([timestamp, close]) => ({
    symbol,
    interval: "1h",
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  }));
}

describe("calculatePerformanceSnapshots", () => {
  it("calculates hourly holding P&L including realized returns and brokerage", () => {
    const result = calculatePerformanceSnapshots(
      trades,
      new Map([
        [
          "AAA.AX",
          candles("AAA.AX", [
            [0, 100],
            [HOUR, 110],
            [2 * HOUR, 120],
            [3 * HOUR, 115],
          ]),
        ],
        [
          "BBB.AX",
          candles("BBB.AX", [
            [HOUR, 50],
            [2 * HOUR, 55],
            [3 * HOUR, 60],
          ]),
        ],
      ]),
    );

    expect(
      result.holdings.filter((point) => point.symbol === "AAA.AX"),
    ).toEqual([
      {
        symbol: "AAA.AX",
        timestamp: HOUR,
        quantity: 10,
        marketPrice: 100,
        averageUnitPrice: 100.5,
        marketValue: 1_000,
        profitLoss: -5,
      },
      {
        symbol: "AAA.AX",
        timestamp: 2 * HOUR,
        quantity: 10,
        marketPrice: 110,
        averageUnitPrice: 100.5,
        marketValue: 1_100,
        profitLoss: 95,
      },
      {
        symbol: "AAA.AX",
        timestamp: 3 * HOUR,
        quantity: 6,
        marketPrice: 120,
        averageUnitPrice: 100.5,
        marketValue: 720,
        profitLoss: 190,
      },
      {
        symbol: "AAA.AX",
        timestamp: 4 * HOUR,
        quantity: 6,
        marketPrice: 115,
        averageUnitPrice: 100.5,
        marketValue: 690,
        profitLoss: 160,
      },
    ]);
    expect(result.portfolio.map((point) => point.profitLoss)).toEqual([
      -5, 93, 198, 178,
    ]);
  });

  it("does not apply trades until the candle is at or after the trade time", () => {
    const trade = { ...trades[0], timestamp: HOUR + 1 };
    const result = calculatePerformanceSnapshots(
      [trade],
      new Map([
        [
          "AAA.AX",
          candles("AAA.AX", [
            [0, 90],
            [HOUR, 100],
            [2 * HOUR, 105],
          ]),
        ],
      ]),
    );

    expect(result.holdings).toHaveLength(2);
    expect(result.holdings[0].timestamp).toBe(2 * HOUR);
    expect(result.holdings[1].timestamp).toBe(3 * HOUR);
    expect(result.holdings[0].quantity).toBe(10);
  });

  it("values a new trade against the latest available candle when calculating current performance", () => {
    const asOf = 3 * HOUR;
    const trade = { ...trades[0], timestamp: asOf - 1 };
    const result = calculatePerformanceSnapshots(
      [trade],
      new Map([["AAA.AX", candles("AAA.AX", [[HOUR, 110]])]]),
      [],
      asOf,
    );

    expect(result.holdings).toEqual([
      {
        symbol: "AAA.AX",
        timestamp: asOf,
        quantity: 10,
        marketPrice: 110,
        averageUnitPrice: 100.5,
        marketValue: 1_100,
        profitLoss: 95,
      },
    ]);
  });

  it("includes deposits and withdrawals in cash and total value without treating them as P&L", () => {
    const cashTransactions: PortfolioCashTransaction[] = [
      {
        id: 1,
        portfolioId: 1,
        type: "DEPOSIT",
        amount: 2_000,
        timestamp: 0,
        note: "Starting funds",
      },
      {
        id: 2,
        portfolioId: 1,
        type: "WITHDRAWAL",
        amount: 100,
        timestamp: 2 * HOUR,
        note: "Transfer out",
      },
    ];
    const result = calculatePerformanceSnapshots(
      [trades[0]],
      new Map([
        [
          "AAA.AX",
          candles("AAA.AX", [
            [0, 100],
            [HOUR, 110],
            [2 * HOUR, 105],
          ]),
        ],
      ]),
      cashTransactions,
    );

    expect(result.portfolio).toEqual([
      {
        timestamp: HOUR,
        cashBalance: 995,
        marketValue: 1_000,
        totalValue: 1_995,
        contributedCapital: 2_000,
        profitLoss: -5,
      },
      {
        timestamp: 2 * HOUR,
        cashBalance: 895,
        marketValue: 1_100,
        totalValue: 1_995,
        contributedCapital: 1_900,
        profitLoss: 95,
      },
      {
        timestamp: 3 * HOUR,
        cashBalance: 895,
        marketValue: 1_050,
        totalValue: 1_945,
        contributedCapital: 1_900,
        profitLoss: 45,
      },
    ]);
  });

  it("does not let a later cash deposit conceal an existing trading loss", () => {
    const trade = { ...trades[0], timestamp: 0 };
    const cashTransactions: PortfolioCashTransaction[] = [
      {
        id: 1,
        portfolioId: 1,
        type: "DEPOSIT",
        amount: 2_000,
        timestamp: 0,
        note: "Initial funding",
      },
      {
        id: 2,
        portfolioId: 1,
        type: "DEPOSIT",
        amount: 5_000,
        timestamp: HOUR + 1,
        note: "Additional funding",
      },
    ];
    const result = calculatePerformanceSnapshots(
      [trade],
      new Map([
        [
          "AAA.AX",
          candles("AAA.AX", [
            [0, 90],
            [HOUR, 90],
          ]),
        ],
      ]),
      cashTransactions,
    );

    expect(result.portfolio.map((point) => point.profitLoss)).toEqual([
      -105, -105,
    ]);
    expect(result.portfolio.map((point) => point.totalValue)).toEqual([
      1_895, 6_895,
    ]);
    expect(result.portfolio.map((point) => point.contributedCapital)).toEqual([
      2_000, 7_000,
    ]);
  });

  it("returns empty series without recorded trades or matching prices", () => {
    expect(calculatePerformanceSnapshots([], new Map()).portfolio).toEqual([]);
    expect(
      calculatePerformanceSnapshots([trades[0]], new Map()).holdings,
    ).toEqual([]);
  });
});
