import type { Candle, HoldingPerformancePoint, PerformanceSnapshots, PortfolioCashTransaction, PortfolioPerformancePoint, PortfolioTrade } from './types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Values each holding from its trade cash flows and the latest hourly close.
 * P&L includes realized proceeds, the remaining market value, and all brokerage.
 */
export function calculatePerformanceSnapshots(
  trades: readonly PortfolioTrade[],
  candlesBySymbol: ReadonlyMap<string, readonly Candle[]>,
  cashTransactions: readonly PortfolioCashTransaction[] = [],
): PerformanceSnapshots {
  const tradesBySymbol = new Map<string, PortfolioTrade[]>();
  for (const trade of trades) {
    const rows = tradesBySymbol.get(trade.symbol) ?? [];
    rows.push(trade);
    tradesBySymbol.set(trade.symbol, rows);
  }

  const holdingPoints: HoldingPerformancePoint[] = [];
  const pointsBySymbol = new Map<string, HoldingPerformancePoint[]>();
  for (const [symbol, symbolTrades] of tradesBySymbol) {
    const orderedTrades = [...symbolTrades].sort((left, right) => left.timestamp - right.timestamp || left.id - right.id);
    const orderedCandles = [...(candlesBySymbol.get(symbol) ?? [])].sort((left, right) => left.timestamp - right.timestamp);
    const points: HoldingPerformancePoint[] = [];
    let tradeIndex = 0;
    let quantity = 0;
    let costBasis = 0;
    let cashFlow = 0;

    for (const candle of orderedCandles) {
      const closeTimestamp = candle.timestamp + HOUR_MS;
      while (tradeIndex < orderedTrades.length && orderedTrades[tradeIndex].timestamp <= closeTimestamp) {
        const trade = orderedTrades[tradeIndex];
        if (trade.side === 'BUY') {
          quantity += trade.quantity;
          costBasis += trade.quantity * trade.price + trade.brokerage;
          cashFlow -= trade.quantity * trade.price + trade.brokerage;
        } else {
          const averageUnitPrice = quantity > 0 ? costBasis / quantity : 0;
          costBasis -= averageUnitPrice * trade.quantity;
          quantity -= trade.quantity;
          if (Math.abs(quantity) < 1e-10) costBasis = 0;
          cashFlow += trade.quantity * trade.price - trade.brokerage;
        }
        tradeIndex += 1;
      }
      if (tradeIndex === 0) continue;

      const marketValue = quantity * candle.close;
      points.push({
        symbol,
        timestamp: closeTimestamp,
        quantity: Math.abs(quantity) < 1e-10 ? 0 : quantity,
        marketPrice: candle.close,
        averageUnitPrice: quantity > 0 ? costBasis / quantity : 0,
        marketValue,
        profitLoss: marketValue + cashFlow,
      });
    }
    pointsBySymbol.set(symbol, points);
    holdingPoints.push(...points);
  }

  const timestamps = [...new Set(holdingPoints.map((point) => point.timestamp))].sort((left, right) => left - right);
  const portfolioPoints: PortfolioPerformancePoint[] = [];
  for (const timestamp of timestamps) {
    let marketValue = 0;
    for (const points of pointsBySymbol.values()) {
      const point = latestPointAtOrBefore(points, timestamp);
      if (!point) continue;
      marketValue += point.marketValue;
    }
    let cashBalance = 0;
    let contributedCapital = 0;
    for (const trade of trades) {
      if (trade.timestamp > timestamp) continue;
      cashBalance += trade.side === 'BUY' ? -(trade.quantity * trade.price + trade.brokerage) : trade.quantity * trade.price - trade.brokerage;
    }
    for (const transaction of cashTransactions) {
      if (transaction.timestamp > timestamp) continue;
      const amount = transaction.type === 'DEPOSIT' ? transaction.amount : -transaction.amount;
      cashBalance += amount;
      contributedCapital += amount;
    }
    const totalValue = marketValue + cashBalance;
    portfolioPoints.push({ timestamp, cashBalance, marketValue, totalValue, contributedCapital, profitLoss: totalValue - contributedCapital });
  }

  return {
    holdings: holdingPoints.sort((left, right) => left.timestamp - right.timestamp || left.symbol.localeCompare(right.symbol)),
    portfolio: portfolioPoints,
  };
}

function latestPointAtOrBefore(points: readonly HoldingPerformancePoint[], timestamp: number): HoldingPerformancePoint | undefined {
  let latest: HoldingPerformancePoint | undefined;
  for (const point of points) {
    if (point.timestamp > timestamp) break;
    latest = point;
  }
  return latest;
}
