import { updateAllPortfolioMarkets } from './market';
import { evictExpiredTimeSeriesData } from './db';
import { publishMarketUpdate } from './market-update-events';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface SchedulerGlobal {
  quantifyHourlyTimer?: ReturnType<typeof setInterval>;
  quantifyDailyRetentionTimer?: ReturnType<typeof setInterval>;
  quantifyHourlyRunActive?: boolean;
  quantifyRetentionRunActive?: boolean;
}

const schedulerGlobal = globalThis as typeof globalThis & SchedulerGlobal;

async function runMarketUpdate(): Promise<void> {
  if (schedulerGlobal.quantifyHourlyRunActive) return;
  schedulerGlobal.quantifyHourlyRunActive = true;
  try {
    const result = await updateAllPortfolioMarkets();
    console.info(`[quantify] Market update complete: ${result.symbolCount} unique tickers across ${result.portfolioCount} portfolios.`);
    for (const warning of result.warnings) console.warn(`[quantify] ${warning}`);
    publishMarketUpdate({ completedAt: Date.now() });
  } catch (error) {
    console.error('[quantify] Scheduled market update failed.', error);
  } finally {
    schedulerGlobal.quantifyHourlyRunActive = false;
  }
}

async function runRetention(): Promise<void> {
  if (schedulerGlobal.quantifyRetentionRunActive) return;
  schedulerGlobal.quantifyRetentionRunActive = true;
  try {
    await evictExpiredTimeSeriesData();
    console.info('[quantify] Time-series retention complete: data older than 12 months removed.');
  } catch (error) {
    console.error('[quantify] Scheduled time-series retention failed.', error);
  } finally {
    schedulerGlobal.quantifyRetentionRunActive = false;
  }
}

async function runStartupWork(): Promise<void> {
  await runRetention();
  await runMarketUpdate();
}

export function startHourlyMarketScheduler(): void {
  if (schedulerGlobal.quantifyHourlyTimer) return;

  schedulerGlobal.quantifyHourlyTimer = setInterval(() => void runMarketUpdate(), HOUR_MS);
  schedulerGlobal.quantifyHourlyTimer.unref?.();
  schedulerGlobal.quantifyDailyRetentionTimer = setInterval(() => void runRetention(), DAY_MS);
  schedulerGlobal.quantifyDailyRetentionTimer.unref?.();
  void runStartupWork();
}
