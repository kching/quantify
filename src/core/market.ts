import { loadStrategy } from "./engine";
import {
  DAILY_CANDLE_HISTORY_DAYS,
  DAILY_CANDLE_RETENTION_MS,
  getCandles,
  getTelegramConnection,
  listHoldingStrategies,
  listWebhookConfigs,
  listPortfolioTradeSymbols,
  listPortfolios,
  listAllPortfolios,
  recordAlert,
  recordSignalStateChange,
  saveCandles,
  TIME_SERIES_RETENTION_MS,
} from "./db";
import { capturePortfolioPerformance } from "./performance.service";
import { sendTelegramSignalNotification } from "./adapters/telegram.adapter";
import { invokeWebhook } from "./adapters/webhook.adapter";
import { fetchYahooCandles } from "./providers/yahoo.provider";
import type {
  Candle,
  CandleInterval,
  HoldingStrategy,
  SignalResult,
  SignalStrategy,
  StrategyParams,
} from "./types";

const lastChecked = new Map<string, number>();
const pendingRefreshes = new Map<string, Promise<CandleRefresh>>();

interface CandleRefresh {
  candles: Candle[];
  updatedCandles: Candle[];
}

function changedCandles(
  previousCandles: readonly Candle[],
  nextCandles: readonly Candle[],
): Candle[] {
  if (!previousCandles.length) return nextCandles.slice(-1);
  const latestPreviousTimestamp = Math.max(
    ...previousCandles.map((candle) => candle.timestamp),
  );
  const previousByTimestamp = new Map(
    previousCandles.map((candle) => [candle.timestamp, candle]),
  );
  return nextCandles.filter((candle) => {
    const previous = previousByTimestamp.get(candle.timestamp);
    if (!previous) return candle.timestamp > latestPreviousTimestamp;
    return (
      previous.open !== candle.open ||
      previous.high !== candle.high ||
      previous.low !== candle.low ||
      previous.close !== candle.close ||
      previous.volume !== candle.volume
    );
  });
}

async function notifyWebhookConfigs<TData>(
  userId: string,
  portfolioId: number,
  type: "candle" | "signal",
  data: TData,
  warnings: string[],
): Promise<void> {
  let configs: Awaited<ReturnType<typeof listWebhookConfigs>>;
  try {
    configs = await listWebhookConfigs(userId);
  } catch (error: unknown) {
    warnings.push(
      `Webhook settings for user ${userId}: ${error instanceof Error ? error.message : "could not be loaded"}`,
    );
    return;
  }
  await Promise.all(
    configs
      .filter((config) => !config.excludedPortfolioIds.includes(portfolioId))
      .map(async (config) => {
        try {
          const result = await invokeWebhook(config, {
            type,
            portfolioId,
            data,
          });
          if (!result.delivered)
            warnings.push(
              `${config.url} webhook ${type}: ${result.log.message ?? "delivery failed"}`,
            );
        } catch (error: unknown) {
          warnings.push(
            `${config.url} webhook ${type}: ${error instanceof Error ? error.message : "delivery failed"}`,
          );
        }
      }),
  );
}

async function notifyCandleUpdates(
  userId: string,
  portfolioId: number,
  updatedCandles: readonly Candle[],
  warnings: string[],
  emitted?: Set<string>,
): Promise<void> {
  for (const candle of updatedCandles) {
    const key = `${userId}:${portfolioId}:${candle.symbol}:${candle.interval}:${candle.timestamp}`;
    if (emitted?.has(key)) continue;
    emitted?.add(key);
    await notifyWebhookConfigs(userId, portfolioId, "candle", candle, warnings);
  }
}

async function recordSignalAndNotify(
  portfolioId: number,
  signal: SignalResult,
  userId: string,
  warnings: string[],
): Promise<SignalResult & { stateUpdatedAt: number }> {
  const state = await recordSignalStateChange(
    portfolioId,
    signal.signalId ?? 0,
    signal.signal,
    userId,
  );
  if (state.changed)
    await notifyWebhookConfigs(userId, portfolioId, "signal", signal, warnings);
  if (state.changed && state.previousSignal) {
    try {
      const connection = await getTelegramConnection(userId);
      if (connection) {
        await sendTelegramSignalNotification({
          chatId: connection.chatId,
          previousSignal: state.previousSignal,
          result: signal,
        });
      }
    } catch (error: unknown) {
      warnings.push(
        `${signal.symbol} Telegram notification: ${error instanceof Error ? error.message : "delivery failed"}`,
      );
    }
  }
  return { ...signal, stateUpdatedAt: state.updatedAt };
}

async function refreshSymbol(
  symbol: string,
  interval: CandleInterval,
): Promise<CandleRefresh> {
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

async function refreshSymbolIfStale(
  symbol: string,
  interval: CandleInterval,
  key: string,
): Promise<CandleRefresh> {
  const cached = await getCandles(symbol, interval);
  const now = Date.now();
  const freshness = interval === "1h" ? 60 * 60_000 : 24 * 60 * 60_000;
  const cooldown = interval === "1h" ? 20 * 60_000 : 8 * 60 * 60_000;
  if (
    cached.length &&
    (now - cached[cached.length - 1].timestamp < freshness ||
      now - (lastChecked.get(key) ?? 0) < cooldown)
  )
    return { candles: cached, updatedCandles: [] };
  const days =
    interval === "1d"
      ? cached.length
        ? 10
        : DAILY_CANDLE_HISTORY_DAYS
      : cached.length
        ? 10
        : Math.floor(TIME_SERIES_RETENTION_MS / (24 * 60 * 60 * 1000));
  try {
    const fresh = await fetchYahooCandles(symbol, interval, days);
    const cutoff =
      now -
      (interval === "1d"
        ? DAILY_CANDLE_RETENTION_MS
        : TIME_SERIES_RETENTION_MS);
    const retained = fresh.filter((candle) => candle.timestamp >= cutoff);
    const updatedCandles = changedCandles(cached, retained);
    await saveCandles(interval, retained);
    return { candles: await getCandles(symbol, interval), updatedCandles };
  } finally {
    lastChecked.set(key, now);
  }
}

export async function refreshPortfolioSymbol(
  portfolioId: number,
  symbol: string,
  userId = "admin",
): Promise<void> {
  const cached = await getCandles(symbol, "1h");
  const now = Date.now();
  const fresh = await fetchYahooCandles(symbol, "1h", 10);
  const cutoff = now - TIME_SERIES_RETENTION_MS;
  const retained = fresh.filter((candle) => candle.timestamp >= cutoff);
  const updates = changedCandles(cached, retained);
  await saveCandles("1h", retained);
  const warnings: string[] = [];
  await notifyCandleUpdates(userId, portfolioId, updates, warnings);
  for (const warning of warnings) console.warn(`[quantify] ${warning}`);
  await capturePortfolioPerformance(portfolioId);
}

export async function updateAllPortfolioDailyCandles(): Promise<{
  symbolCount: number;
  warnings: string[];
}> {
  const portfolios = await listAllPortfolios();
  const symbols = new Set<string>();
  const portfoliosBySymbol = new Map<
    string,
    Array<{ portfolioId: number; userId: string }>
  >();
  for (const portfolio of portfolios) {
    const portfolioSymbols = new Set([
      ...portfolio.holdings.map(({ symbol }) => symbol),
      ...(await listPortfolioTradeSymbols(portfolio.id)),
    ]);
    for (const symbol of portfolioSymbols) {
      symbols.add(symbol);
      const owners = portfoliosBySymbol.get(symbol) ?? [];
      owners.push({ portfolioId: portfolio.id, userId: portfolio.userId });
      portfoliosBySymbol.set(symbol, owners);
    }
  }
  const warnings: string[] = [];
  const emittedCandleEvents = new Set<string>();
  const cutoff = Date.now() - DAILY_CANDLE_RETENTION_MS;
  await Promise.all(
    [...symbols].map(async (symbol) => {
      try {
        const cached = await getCandles(symbol, "1d");
        const fresh = await fetchYahooCandles(
          symbol,
          "1d",
          DAILY_CANDLE_HISTORY_DAYS,
        );
        const retained = fresh.filter((candle) => candle.timestamp >= cutoff);
        const updates = changedCandles(cached, retained);
        await saveCandles("1d", retained);
        await Promise.all(
          (portfoliosBySymbol.get(symbol) ?? []).map(
            ({ portfolioId, userId }) =>
              notifyCandleUpdates(
                userId,
                portfolioId,
                updates,
                warnings,
                emittedCandleEvents,
              ),
          ),
        );
      } catch (error: unknown) {
        warnings.push(
          `${symbol} daily data: ${error instanceof Error ? error.message : "refresh failed"}`,
        );
      }
    }),
  );
  await Promise.all(
    portfolios.map(async (portfolio) => {
      const holdingStrategies = await listHoldingStrategies(
        portfolio.id,
        portfolio.userId,
      );
      const tradedSymbols = await listPortfolioTradeSymbols(portfolio.id);
      const ownedSymbols = new Set([
        ...portfolio.holdings.map(({ symbol }) => symbol),
        ...tradedSymbols,
      ]);
      await Promise.all(
        [...ownedSymbols].map(async (symbol) => {
          try {
            const configured = holdingStrategies.filter(
              (item) => item.symbol === symbol && item.candleType === "1d",
            );
            const result = await scanSymbol(symbol, warnings, configured, [
              "1d",
            ]);
            const daily = await Promise.all(
              result.daily.map((signal) =>
                recordSignalAndNotify(
                  portfolio.id,
                  signal,
                  portfolio.userId,
                  warnings,
                ),
              ),
            );
            for (const signal of daily)
              if (signal.signal !== "HOLD" && signal.price > 0)
                await recordAlert(portfolio.id, signal, portfolio.userId);
          } catch (error: unknown) {
            warnings.push(
              `${symbol} daily signal: ${error instanceof Error ? error.message : "evaluation failed"}`,
            );
          }
        }),
      );
    }),
  );
  return { symbolCount: symbols.size, warnings };
}

interface SymbolScan {
  daily: SignalResult[];
  hourly: SignalResult[];
  candleUpdates: Candle[];
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

async function configuredStrategies(
  symbol: string,
  holdingStrategies: readonly HoldingStrategy[],
  warnings: string[],
): Promise<LoadedStrategy[]> {
  const loaded = await Promise.all(
    holdingStrategies.map(async (holdingStrategy) => {
      try {
        return {
          id: holdingStrategy.id,
          label: holdingStrategy.label,
          name: holdingStrategy.name,
          strategy: await loadStrategy(holdingStrategy.name),
          params: holdingStrategy.params,
        };
      } catch (error: unknown) {
        warnings.push(
          `${symbol} strategy ${holdingStrategy.name}: ${error instanceof Error ? error.message : "load failed"}`,
        );
        return {
          id: holdingStrategy.id,
          label: holdingStrategy.label,
          name: holdingStrategy.name,
          strategy: null,
          params: holdingStrategy.params,
        };
      }
    }),
  );
  for (const item of loaded)
    if (!item.strategy)
      warnings.push(`${symbol} strategy ${item.name}: strategy not found`);
  return loaded.filter(
    (item): item is LoadedStrategy => item.strategy !== null,
  );
}

async function scanSymbol(
  symbol: string,
  warnings: string[],
  holdingStrategies: readonly HoldingStrategy[] = [],
  intervals: readonly CandleInterval[] = ["1d", "1h"],
): Promise<SymbolScan> {
  const dailyPromise = intervals.includes("1d")
    ? refreshSymbol(symbol, "1d").catch(async (error: unknown) => {
        warnings.push(
          `${symbol} daily data: ${error instanceof Error ? error.message : "refresh failed"}`,
        );
        return { candles: await getCandles(symbol, "1d"), updatedCandles: [] };
      })
    : getCandles(symbol, "1d").then((candles) => ({
        candles,
        updatedCandles: [],
      }));
  const hourlyPromise = intervals.includes("1h")
    ? refreshSymbol(symbol, "1h").catch(async (error: unknown) => {
        warnings.push(
          `${symbol} hourly data: ${error instanceof Error ? error.message : "refresh failed"}`,
        );
        return { candles: await getCandles(symbol, "1h"), updatedCandles: [] };
      })
    : getCandles(symbol, "1h").then((candles) => ({
        candles,
        updatedCandles: [],
      }));
  const [dailyRefresh, hourlyRefresh] = await Promise.all([
    dailyPromise,
    hourlyPromise,
  ]);
  const dailyCandles = dailyRefresh.candles;
  const hourlyCandles = hourlyRefresh.candles;
  const selected = holdingStrategies.length
    ? await configuredStrategies(symbol, holdingStrategies, warnings)
    : [];
  const daily = intervals.includes("1d")
    ? selected
        .filter(
          ({ id }) =>
            holdingStrategies.find((item) => item.id === id)?.candleType ===
            "1d",
        )
        .map(({ id, label, strategy, params }) => ({
          ...strategy.analyze(symbol, dailyCandles, params),
          label,
          signalId: id,
        }))
    : [];
  const hourly = intervals.includes("1h")
    ? selected
        .filter(
          ({ id }) =>
            holdingStrategies.find((item) => item.id === id)?.candleType ===
            "1h",
        )
        .map(({ id, label, strategy, params }) => ({
          ...strategy.analyze(symbol, hourlyCandles, params),
          label,
          signalId: id,
        }))
    : [];
  return {
    daily,
    hourly,
    candleUpdates: [
      ...dailyRefresh.updatedCandles,
      ...hourlyRefresh.updatedCandles,
    ],
    dailyCandles: dailyCandles.slice(-90),
    hourlyCandles: hourlyCandles.slice(-48),
  };
}

export async function scanPortfolio(
  portfolioId: number,
  userId = "admin",
): Promise<{
  signals: Array<Omit<SymbolScan, "candleUpdates"> & { symbol: string }>;
  warnings: string[];
}> {
  const portfolio = (await listPortfolios(userId)).find(
    (item) => item.id === portfolioId,
  );
  if (!portfolio) throw new Error("Portfolio not found.");
  const warnings: string[] = [];
  const holdingStrategies = await listHoldingStrategies(portfolioId, userId);
  const tradedSymbols = await listPortfolioTradeSymbols(portfolioId);
  const symbols = new Set([
    ...portfolio.holdings.map(({ symbol }) => symbol),
    ...tradedSymbols,
  ]);
  const emittedCandleEvents = new Set<string>();
  const signals = await Promise.all(
    [...symbols].map(async (symbol) => {
      const configured = holdingStrategies.filter(
        (holdingStrategy) => holdingStrategy.symbol === symbol,
      );
      const result = await scanSymbol(symbol, warnings, configured);
      await notifyCandleUpdates(
        userId,
        portfolioId,
        result.candleUpdates,
        warnings,
        emittedCandleEvents,
      );
      const daily = await Promise.all(
        result.daily.map((signal) =>
          recordSignalAndNotify(portfolioId, signal, userId, warnings),
        ),
      );
      const hourly = await Promise.all(
        result.hourly.map((signal) =>
          recordSignalAndNotify(portfolioId, signal, userId, warnings),
        ),
      );
      const statefulResult = {
        daily,
        hourly,
        dailyCandles: result.dailyCandles,
        hourlyCandles: result.hourlyCandles,
      };
      for (const signal of daily)
        if (signal.signal !== "HOLD" && signal.price > 0)
          await recordAlert(portfolioId, signal, userId);
      for (const signal of hourly)
        if (signal.signal !== "HOLD" && signal.price > 0)
          await recordAlert(portfolioId, signal, userId);
      return { symbol, ...statefulResult };
    }),
  );
  await capturePortfolioPerformance(portfolioId);
  return { signals, warnings };
}

export async function updateAllPortfolioMarkets(): Promise<{
  portfolioCount: number;
  symbolCount: number;
  warnings: string[];
}> {
  const portfolios = await listAllPortfolios();
  const ownersBySymbol = new Map<
    string,
    Array<{ id: number; userId: string; holdingStrategies: HoldingStrategy[] }>
  >();
  for (const portfolio of portfolios) {
    const holdingStrategies = await listHoldingStrategies(
      portfolio.id,
      portfolio.userId,
    );
    const tradedSymbols = await listPortfolioTradeSymbols(portfolio.id);
    const symbols = new Set([
      ...portfolio.holdings.map(({ symbol }) => symbol),
      ...tradedSymbols,
    ]);
    for (const symbol of symbols) {
      const owners = ownersBySymbol.get(symbol) ?? [];
      owners.push({
        id: portfolio.id,
        userId: portfolio.userId,
        holdingStrategies: holdingStrategies.filter(
          (holdingStrategy) => holdingStrategy.symbol === symbol,
        ),
      });
      ownersBySymbol.set(symbol, owners);
    }
  }
  const warnings: string[] = [];
  const emittedCandleEvents = new Set<string>();
  await Promise.all(
    [...ownersBySymbol].map(async ([symbol, owners]) => {
      await Promise.all(
        owners.map(async (owner) => {
          const result = await scanSymbol(
            symbol,
            warnings,
            owner.holdingStrategies.filter((item) => item.candleType === "1h"),
            ["1h"],
          );
          await notifyCandleUpdates(
            owner.userId,
            owner.id,
            result.candleUpdates,
            warnings,
            emittedCandleEvents,
          );
          const hourly = await Promise.all(
            result.hourly.map((signal) =>
              recordSignalAndNotify(owner.id, signal, owner.userId, warnings),
            ),
          );
          for (const signal of hourly)
            if (signal.signal !== "HOLD" && signal.price > 0)
              await recordAlert(owner.id, signal, owner.userId);
        }),
      );
    }),
  );
  await Promise.all(
    portfolios.map(({ id }) => capturePortfolioPerformance(id)),
  );
  return {
    portfolioCount: portfolios.length,
    symbolCount: ownersBySymbol.size,
    warnings,
  };
}
