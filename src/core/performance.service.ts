import { getCandles, listCashTransactions, listPortfolioTradeSymbols, listTrades, savePerformanceSnapshots } from './db';
import { calculatePerformanceSnapshots } from './performance';

const HOUR_MS = 60 * 60 * 1000;

export async function capturePortfolioPerformance(portfolioId: number): Promise<void> {
  const trades = await listTrades(portfolioId);
  if (!trades.length) return;
  const cashTransactions = await listCashTransactions(portfolioId);
  const symbols = await listPortfolioTradeSymbols(portfolioId);
  const now = Date.now();
  const candleRows = await Promise.all(symbols.map(async (symbol) => [
    symbol,
    (await getCandles(symbol, '1h')).filter((candle) => candle.timestamp + HOUR_MS <= now),
  ] as const));
  const snapshots = calculatePerformanceSnapshots(trades, new Map(candleRows), cashTransactions);
  await savePerformanceSnapshots(portfolioId, snapshots);
}
