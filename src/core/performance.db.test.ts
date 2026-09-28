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
    expect(performance.holdings.at(-1)).toMatchObject({ symbol: 'MQG.AX', quantity: 8, marketPrice: 110, marketValue: 880, profitLoss: 110 });
    expect(performance.portfolio.at(-1)).toMatchObject({ cashBalance: 130, marketValue: 880, totalValue: 1_010, contributedCapital: 900, profitLoss: 110 });
    expect(await database.listCashTransactions(portfolio.id)).toHaveLength(2);
    expect(performance.holdings.some((point) => point.marketPrice === 999)).toBe(false);
  });
});
