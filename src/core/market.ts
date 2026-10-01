import { loadStrategy } from './engine';
import { DAILY_CANDLE_HISTORY_DAYS, DAILY_CANDLE_RETENTION_MS, getCandles, listHoldingStrategies, listPortfolioTradeSymbols, listPortfolios, recordAlert, recordSignalState, saveCandles, TIME_SERIES_RETENTION_MS } from './db';
import { capturePortfolioPerformance } from './performance.service';
import { fetchYahooCandles } from './providers/yahoo.provider';
import type { Candle, CandleInterval, HoldingStrategy, SignalResult, SignalStrategy, StrategyParams } from './types';

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
  const days = interval === '1d' ? cached.length ? 10 : DAILY_CANDLE_HISTORY_DAYS : cached.length ? 10 : Math.floor(TIME_SERIES_RETENTION_MS / (24 * 60 * 60 * 1000));
  try {
    const fresh = await fetchYahooCandles(symbol, interval, days);
    const cutoff = now - (interval === '1d' ? DAILY_CANDLE_RETENTION_MS : TIME_SERIES_RETENTION_MS);
    await saveCandles(interval, fresh.filter((candle) => candle.timestamp >= cutoff));
  } finally {
    lastChecked.set(key, now);
  }
  return getCandles(symbol, interval);
}

export async function refreshPortfolioSymbol(portfolioId: number, symbol: string): Promise<void> {
  const now = Date.now();
  const fresh = await fetchYahooCandles(symbol, '1h', 10);
  const cutoff = now - TIME_SERIES_RETENTION_MS;
  await saveCandles('1h', fresh.filter((candle) => candle.timestamp >= cutoff));
  await capturePortfolioPerformance(portfolioId);
}

export async function updateAllPortfolioDailyCandles(): Promise<{ symbolCount: number; warnings: string[] }> {
  const portfolios = await listPortfolios();
  const symbols = new Set<string>();
  for (const portfolio of portfolios) {
    portfolio.holdings.forEach(({ symbol }) => symbols.add(symbol));
    (await listPortfolioTradeSymbols(portfolio.id)).forEach((symbol) => symbols.add(symbol));
  }
  const warnings: string[] = [];
  const cutoff = Date.now() - DAILY_CANDLE_RETENTION_MS;
  await Promise.all([...symbols].map(async (symbol) => {
    try {
      const fresh = await fetchYahooCandles(symbol, '1d', DAILY_CANDLE_HISTORY_DAYS);
      await saveCandles('1d', fresh.filter((candle) => candle.timestamp >= cutoff));
    } catch (error: unknown) {
      warnings.push(`${symbol} daily data: ${error instanceof Error ? error.message : 'refresh failed'}`);
    }
  }));
  return { symbolCount: symbols.size, warnings };
}

interface SymbolScan {
  daily: SignalResult[];
  hourly: SignalResult[];
  hourlyCandles: Candle[];
  dailyCandles: Candle[];
}

interface LoadedStrategy {
  id: number;
  label: string;
  name: string;
  strategy: SignalStrategy;
  params: StrategyParams;
}

async function configuredStrategies(symbol: string, holdingStrategies: readonly HoldingStrategy[], warnings: string[]): Promise<LoadedStrategy[]> {
  const loaded = await Promise.all(holdingStrategies.map(async (holdingStrategy) => {
    try {
      return { id: holdingStrategy.id, label: holdingStrategy.label, name: holdingStrategy.name, strategy: await loadStrategy(holdingStrategy.name), params: holdingStrategy.params };
    } catch (error: unknown) {
      warnings.push(`${symbol} strategy ${holdingStrategy.name}: ${error instanceof Error ? error.message : 'load failed'}`);
      return { id: holdingStrategy.id, label: holdingStrategy.label, name: holdingStrategy.name, strategy: null, params: holdingStrategy.params };
    }
  }));
  for (const item of loaded) if (!item.strategy) warnings.push(`${symbol} strategy ${item.name}: strategy not found`);
  return loaded.filter((item): item is LoadedStrategy => item.strategy !== null);
}

async function scanSymbol(symbol: string, warnings: string[], holdingStrategies: readonly HoldingStrategy[] = []): Promise<SymbolScan> {
    const [dailyCandles, hourlyCandles] = await Promise.all([
      refreshSymbol(symbol, '1d').catch(async (error: unknown) => { warnings.push(`${symbol} daily data: ${error instanceof Error ? error.message : 'refresh failed'}`); return getCandles(symbol, '1d'); }),
      refreshSymbol(symbol, '1h').catch(async (error: unknown) => { warnings.push(`${symbol} hourly data: ${error instanceof Error ? error.message : 'refresh failed'}`); return getCandles(symbol, '1h'); }),
    ]);
    const selected = holdingStrategies.length ? await configuredStrategies(symbol, holdingStrategies, warnings) : [];
    const daily = selected.map(({ id, label, strategy, params }) => ({ ...strategy.analyze(symbol, dailyCandles, params), label, signalId: id }));
    const hourly = selected.map(({ id, label, strategy, params }) => ({ ...strategy.analyze(symbol, hourlyCandles, params), label, signalId: id }));
    return {
      daily, hourly,
      dailyCandles: dailyCandles.slice(-90), hourlyCandles: hourlyCandles.slice(-48),
    };
}

export async function scanPortfolio(portfolioId: number, userId = 'admin'): Promise<{ signals: Array<SymbolScan & { symbol: string }>; warnings: string[] }> {
  const portfolio = (await listPortfolios(userId)).find((item) => item.id === portfolioId);
  if (!portfolio) throw new Error('Portfolio not found.');
  const warnings: string[] = [];
  const holdingStrategies = await listHoldingStrategies(portfolioId, userId);
  const tradedSymbols = await listPortfolioTradeSymbols(portfolioId);
  const symbols = new Set([...portfolio.holdings.map(({ symbol }) => symbol), ...tradedSymbols]);
  const signals = await Promise.all([...symbols].map(async (symbol) => {
    const configured = holdingStrategies.filter((holdingStrategy) => holdingStrategy.symbol === symbol);
    const result = await scanSymbol(symbol, warnings, configured);
    const daily = await Promise.all(result.daily.map(async (signal) => ({ ...signal, stateUpdatedAt: await recordSignalState(portfolioId, signal.signalId ?? 0, signal.signal, userId) })));
    const statefulResult = { ...result, daily };
    for (const signal of daily) if (signal.signal !== 'HOLD' && signal.price > 0) await recordAlert(portfolioId, signal, userId);
    return { symbol, ...statefulResult };
  }));
  await capturePortfolioPerformance(portfolioId);
  return { signals, warnings };
}

export async function updateAllPortfolioMarkets(): Promise<{ portfolioCount: number; symbolCount: number; warnings: string[] }> {
  const portfolios = await listPortfolios();
  const ownersBySymbol = new Map<string, Array<{ id: number; userId: string; holdingStrategies: HoldingStrategy[] }>>();
  for (const portfolio of portfolios) {
    const holdingStrategies = await listHoldingStrategies(portfolio.id, portfolio.userId);
    const tradedSymbols = await listPortfolioTradeSymbols(portfolio.id);
    const symbols = new Set([...portfolio.holdings.map(({ symbol }) => symbol), ...tradedSymbols]);
    for (const symbol of symbols) {
      const owners = ownersBySymbol.get(symbol) ?? [];
      owners.push({ id: portfolio.id, userId: portfolio.userId, holdingStrategies: holdingStrategies.filter((holdingStrategy) => holdingStrategy.symbol === symbol) });
      ownersBySymbol.set(symbol, owners);
    }
  }
  const warnings: string[] = [];
  await Promise.all([...ownersBySymbol].map(async ([symbol, owners]) => {
    await Promise.all(owners.map(async (owner) => {
      const result = await scanSymbol(symbol, warnings, owner.holdingStrategies);
      const daily = await Promise.all(result.daily.map(async (signal) => ({ ...signal, stateUpdatedAt: await recordSignalState(owner.id, signal.signalId ?? 0, signal.signal, owner.userId) })));
      for (const signal of daily) if (signal.signal !== 'HOLD' && signal.price > 0) await recordAlert(owner.id, signal, owner.userId);
    }));
  }));
  await Promise.all(portfolios.map(({ id }) => capturePortfolioPerformance(id)));
  return { portfolioCount: portfolios.length, symbolCount: ownersBySymbol.size, warnings };
}
