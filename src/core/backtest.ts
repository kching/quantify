import type { BacktestResult, BacktestTrade, Candle, SignalStrategy, StrategyParams } from './types';

const BACKTEST_START_INDEX = 60;

function calculateBuyAndHoldReturn(candles: readonly Candle[]): number {
  const firstCandle = candles[BACKTEST_START_INDEX];
  const lastCandle = candles.at(-1);
  if (!firstCandle || !lastCandle || firstCandle.open <= 0) return 0;
  return (lastCandle.close / firstCandle.open - 1) * 100;
}

export function runBacktest(symbol: string, candles: readonly Candle[], strategy: SignalStrategy, initialBalance = 10_000, params: StrategyParams = {}): BacktestResult {
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdownPct = 0;
  let entry: Candle | null = null;
  const trades: BacktestTrade[] = [];
  for (let index = BACKTEST_START_INDEX; index < candles.length; index += 1) {
    const current = candles[index];
    const signal = strategy.analyze(symbol, candles.slice(0, index), params).signal;
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
  const strategyReturnPct = (balance / initialBalance - 1) * 100;
  const buyAndHoldReturnPct = calculateBuyAndHoldReturn(candles);
  return {
    symbol, strategyId: strategy.id, initialBalance, finalBalance: balance,
    strategyReturnPct, buyAndHoldReturnPct, totalReturnPct: strategyReturnPct - buyAndHoldReturnPct,
    winRatePct: trades.length ? wins / trades.length * 100 : 0,
    maxDrawdownPct, trades,
  };
}
