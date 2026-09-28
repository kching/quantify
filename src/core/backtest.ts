import type { BacktestResult, BacktestTrade, Candle, SignalStrategy } from './types';

export function runBacktest(symbol: string, candles: readonly Candle[], strategy: SignalStrategy, initialBalance = 10_000): BacktestResult {
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdownPct = 0;
  let entry: Candle | null = null;
  const trades: BacktestTrade[] = [];
  for (let index = 60; index < candles.length; index += 1) {
    const current = candles[index];
    const signal = strategy.analyze(symbol, candles.slice(0, index)).signal;
    if (!entry && signal === 'BUY') entry = { ...current, close: current.open };
    else if (entry && signal === 'SELL') {
      const pnlPct = current.open / entry.close - 1;
      balance *= 1 + pnlPct;
      trades.push({ entryDate: entry.timestamp, exitDate: current.timestamp, entryPrice: entry.close, exitPrice: current.open, pnlPct });
      entry = null;
      peak = Math.max(peak, balance);
      maxDrawdownPct = Math.max(maxDrawdownPct, (peak - balance) / peak * 100);
    }
  }
  const wins = trades.filter((trade) => trade.pnlPct > 0).length;
  return {
    symbol, strategyId: strategy.id, initialBalance, finalBalance: balance,
    totalReturnPct: (balance / initialBalance - 1) * 100,
    winRatePct: trades.length ? wins / trades.length * 100 : 0,
    maxDrawdownPct, trades,
  };
}
