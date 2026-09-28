import { analyzeSymbol } from './engine';
import { getCandles, listPortfolioTradeSymbols, listPortfolios, recordAlert, saveCandles } from './db';
import { capturePortfolioPerformance } from './performance.service';
import { fetchYahooCandles } from './providers/yahoo.provider';
import type { Candle, CandleInterval } from './types';

const lastChecked = new Map<string, number>();
const pendingRefreshes = new Map<string, Promise<Candle[]>>();

async function refreshSymbol(symbol: string, interval: CandleInterval): Promise<Candle[]> {
  const key = `${symbol}:${interval}`;
  const pending = pendingRefreshes.get(key);
  if (pending) return pending;
  const refresh = refreshSymbolIfStale(symbol, interval, key);
  pendingRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    pendingRefreshes.delete(key);
  }
}

async function refreshSymbolIfStale(symbol: string, interval: CandleInterval, key: string): Promise<Candle[]> {
  const cached = await getCandles(symbol, interval);
  const now = Date.now();
  const freshness = interval === '1h' ? 60 * 60_000 : 24 * 60 * 60_000;
  const cooldown = interval === '1h' ? 30 * 60_000 : 8 * 60 * 60_000;
  if (cached.length && (now - cached[cached.length - 1].timestamp < freshness || now - (lastChecked.get(key) ?? 0) < cooldown)) return cached;
  const days = cached.length ? 10 : interval === '1h' ? 700 : 1825;
  try {
    const fresh = await fetchYahooCandles(symbol, interval, days);
    await saveCandles(interval, fresh);
  } finally {
    lastChecked.set(key, now);
  }
  return getCandles(symbol, interval);
}

interface SymbolScan {
  daily: ReturnType<typeof analyzeSymbol>;
  hourly: ReturnType<typeof analyzeSymbol>;
  hourlyCandles: Candle[];
  dailyCandles: Candle[];
}

async function scanSymbol(symbol: string, warnings: string[]): Promise<SymbolScan> {
    const [dailyCandles, hourlyCandles] = await Promise.all([
      refreshSymbol(symbol, '1d').catch(async (error: unknown) => { warnings.push(`${symbol} daily data: ${error instanceof Error ? error.message : 'refresh failed'}`); return getCandles(symbol, '1d'); }),
      refreshSymbol(symbol, '1h').catch(async (error: unknown) => { warnings.push(`${symbol} hourly data: ${error instanceof Error ? error.message : 'refresh failed'}`); return getCandles(symbol, '1h'); }),
    ]);
    const daily = analyzeSymbol(symbol, dailyCandles);
    const hourly = analyzeSymbol(symbol, hourlyCandles);
    return {
      daily, hourly,
      dailyCandles: dailyCandles.slice(-90), hourlyCandles: hourlyCandles.slice(-48),
    };
}

export async function scanPortfolio(portfolioId: number): Promise<{ signals: Array<SymbolScan & { symbol: string }>; warnings: string[] }> {
  const portfolio = (await listPortfolios()).find((item) => item.id === portfolioId);
  if (!portfolio) throw new Error('Portfolio not found.');
  const warnings: string[] = [];
  const tradedSymbols = await listPortfolioTradeSymbols(portfolioId);
  const symbols = new Set([...portfolio.holdings.map(({ symbol }) => symbol), ...tradedSymbols]);
  const signals = await Promise.all([...symbols].map(async (symbol) => {
    const result = await scanSymbol(symbol, warnings);
    for (const signal of result.daily) if (signal.signal !== 'HOLD' && signal.price > 0) await recordAlert(portfolioId, signal);
    return { symbol, ...result };
  }));
  await capturePortfolioPerformance(portfolioId);
  return { signals, warnings };
}

export async function updateAllPortfolioMarkets(): Promise<{ portfolioCount: number; symbolCount: number; warnings: string[] }> {
  const portfolios = await listPortfolios();
  const ownersBySymbol = new Map<string, number[]>();
  for (const portfolio of portfolios) {
    const tradedSymbols = await listPortfolioTradeSymbols(portfolio.id);
    const symbols = new Set([...portfolio.holdings.map(({ symbol }) => symbol), ...tradedSymbols]);
    for (const symbol of symbols) {
      const owners = ownersBySymbol.get(symbol) ?? [];
      owners.push(portfolio.id);
      ownersBySymbol.set(symbol, owners);
    }
  }
  const warnings: string[] = [];
  await Promise.all([...ownersBySymbol].map(async ([symbol, portfolioIds]) => {
    const result = await scanSymbol(symbol, warnings);
    for (const portfolioId of portfolioIds) {
      for (const signal of result.daily) if (signal.signal !== 'HOLD' && signal.price > 0) await recordAlert(portfolioId, signal);
    }
  }));
  await Promise.all(portfolios.map(({ id }) => capturePortfolioPerformance(id)));
  return { portfolioCount: portfolios.length, symbolCount: ownersBySymbol.size, warnings };
}
