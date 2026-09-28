import { afterAll, describe, expect, it, mock } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Candle } from './types';

mock.module('server-only', () => ({}));
const databaseDirectory = mkdtempSync(join(tmpdir(), 'quantify-performance-'));
process.env.QUANTIFY_DB_PATH = join(databaseDirectory, 'test.sqlite');

const database = await import('./db');
const { capturePortfolioPerformance } = await import('./performance.service');
const HOUR = 60 * 60 * 1000;
const now = Date.now();
const tradeTime = now - 5 * HOUR;

function candle(symbol: string, timestamp: number, close: number): Candle {
  return { symbol, timestamp, open: close, high: close, low: close, close, volume: 1_000 };
}

afterAll(async () => {
  await database.db.$client.close();
  rmSync(databaseDirectory, { recursive: true, force: true });
});

describe('trade and performance persistence', () => {
  it('records a buy and sell ledger, prevents overselling, and captures hourly snapshots', async () => {
    const [portfolio] = await database.listPortfolios();
    expect(portfolio.holdings).toHaveLength(5);

    await database.recordTrade({ portfolioId: portfolio.id, symbol: 'MQG.AX', side: 'BUY', quantity: 10, price: 100, brokerage: 5, timestamp: tradeTime });
    await expect(database.recordTrade({ portfolioId: portfolio.id, symbol: 'MQG.AX', side: 'SELL', quantity: 1, price: 120, brokerage: 5, timestamp: tradeTime - HOUR })).rejects.toThrow('Sell quantity exceeds the units held at the selected trade time.');
    await database.recordTrade({ portfolioId: portfolio.id, symbol: 'MQG.AX', side: 'SELL', quantity: 2, price: 120, brokerage: 5, timestamp: tradeTime + 2 * HOUR });
    await database.recordCashTransaction({ portfolioId: portfolio.id, type: 'DEPOSIT', amount: 1_000, timestamp: tradeTime - 2 * HOUR, note: 'Starting capital' });
    await database.recordCashTransaction({ portfolioId: portfolio.id, type: 'WITHDRAWAL', amount: 100, timestamp: tradeTime + 3 * HOUR, note: 'Transfer out' });

    await database.saveCandles('1h', [
      candle('MQG.AX', tradeTime - HOUR, 100),
      candle('MQG.AX', tradeTime, 105),
      candle('MQG.AX', tradeTime + HOUR, 120),
      candle('MQG.AX', tradeTime + 2 * HOUR, 110),
      candle('MQG.AX', now + HOUR, 999),
    ]);
    await capturePortfolioPerformance(portfolio.id);

    const storedTrades = await database.listTrades(portfolio.id);
    expect(storedTrades.map((trade) => trade.side)).toEqual(['BUY', 'SELL']);
    const performance = await database.listPerformance(portfolio.id);
    expect(performance.holdings).toHaveLength(4);
    expect(performance.holdings.at(-1)).toMatchObject({ symbol: 'MQG.AX', quantity: 8, marketPrice: 110, averageUnitPrice: 100.5, marketValue: 880, profitLoss: 110 });
    expect(performance.portfolio.at(-1)).toMatchObject({ cashBalance: 130, marketValue: 880, totalValue: 1_010, contributedCapital: 900, profitLoss: 110 });
    expect(await database.listCashTransactions(portfolio.id)).toHaveLength(2);
    expect(performance.holdings.some((point) => point.marketPrice === 999)).toBe(false);
  });

  it('returns one year of holding snapshots for selectable pulse-chart ranges', async () => {
    const portfolio = await database.createPortfolio('Holding history window');
    const inRangeTimestamp = now - 180 * 24 * HOUR;
    const outOfRangeTimestamp = now - 400 * 24 * HOUR;
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [
        { symbol: 'AAA.AX', timestamp: inRangeTimestamp, quantity: 1, marketPrice: 100, averageUnitPrice: 90, marketValue: 100, profitLoss: 10 },
        { symbol: 'AAA.AX', timestamp: outOfRangeTimestamp, quantity: 1, marketPrice: 90, averageUnitPrice: 90, marketValue: 90, profitLoss: 0 },
      ],
      portfolio: [],
    });

    const performance = await database.listPerformance(portfolio.id);
    expect(performance.holdings.map((point) => point.timestamp)).toContain(inRangeTimestamp);
    expect(performance.holdings.map((point) => point.timestamp)).not.toContain(outOfRangeTimestamp);
  });

  it('prevents deleting a buy that supports later sells and clears snapshots after a valid deletion', async () => {
    const portfolio = await database.createPortfolio('Trade deletion');
    const buy = await database.recordTrade({ portfolioId: portfolio.id, symbol: 'AAA.AX', side: 'BUY', quantity: 10, price: 100, brokerage: 5, timestamp: tradeTime });
    const sell = await database.recordTrade({ portfolioId: portfolio.id, symbol: 'AAA.AX', side: 'SELL', quantity: 2, price: 120, brokerage: 5, timestamp: tradeTime + HOUR });
    await expect(database.deletePortfolioTrade(portfolio.id, buy.id)).rejects.toThrow('later sell would exceed the remaining position');
    await database.savePerformanceSnapshots(portfolio.id, {
      holdings: [{ symbol: 'AAA.AX', timestamp: now - HOUR, quantity: 10, marketPrice: 100, averageUnitPrice: 100.5, marketValue: 1_000, profitLoss: -5 }],
      portfolio: [{ timestamp: now - HOUR, cashBalance: -1_005, marketValue: 1_000, totalValue: -5, contributedCapital: 0, profitLoss: -5 }],
    });

    expect(await database.deletePortfolioTrade(portfolio.id, sell.id)).toMatchObject({ id: sell.id, side: 'SELL' });
    expect(await database.listTrades(portfolio.id)).toHaveLength(1);
    expect(await database.listPerformance(portfolio.id)).toEqual({ holdings: [], portfolio: [] });
  });

  it('serves six newest trades per page and applies ticker filters before pagination', async () => {
    const portfolio = await database.createPortfolio('Trade pagination');
    const insertedTrades = [];
    for (let index = 0; index < 8; index += 1) {
      insertedTrades.push(await database.recordTrade({
        portfolioId: portfolio.id, symbol: index < 3 ? 'AAA.AX' : 'BBB.AX', side: 'BUY', quantity: 1,
        price: 100 + index, brokerage: 0, timestamp: tradeTime + index * HOUR,
      }));
    }

    const pageOne = await database.listTradePage(portfolio.id, 1);
    const pageTwo = await database.listTradePage(portfolio.id, 2);
    const filtered = await database.listTradePage(portfolio.id, 1, 'BBB.AX');
    expect(pageOne.trades).toHaveLength(6);
    expect(pageOne.trades[0].id).toBe(insertedTrades[7].id);
    expect(pageTwo.trades.map((trade) => trade.id)).toEqual([
      insertedTrades[1].id,
      insertedTrades[0].id,
    ]);
    expect(filtered.trades).toHaveLength(5);
    expect(filtered.trades.every((trade) => trade.symbol === 'BBB.AX')).toBe(true);
    expect(filtered.total).toBe(5);
    expect(filtered.tickers).toEqual(['AAA.AX', 'BBB.AX']);
  });
});
