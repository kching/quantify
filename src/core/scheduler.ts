import { updateAllPortfolioMarkets } from './market';

const HOUR_MS = 60 * 60 * 1000;

interface SchedulerGlobal {
  quantifyHourlyTimer?: ReturnType<typeof setInterval>;
  quantifyHourlyRunActive?: boolean;
}

const schedulerGlobal = globalThis as typeof globalThis & SchedulerGlobal;

async function runMarketUpdate(): Promise<void> {
  if (schedulerGlobal.quantifyHourlyRunActive) return;
  schedulerGlobal.quantifyHourlyRunActive = true;
  try {
    const result = await updateAllPortfolioMarkets();
    console.info(`[quantify] Market update complete: ${result.symbolCount} unique tickers across ${result.portfolioCount} portfolios.`);
    for (const warning of result.warnings) console.warn(`[quantify] ${warning}`);
  } catch (error) {
    console.error('[quantify] Scheduled market update failed.', error);
  } finally {
    schedulerGlobal.quantifyHourlyRunActive = false;
  }
}

export function startHourlyMarketScheduler(): void {
  if (schedulerGlobal.quantifyHourlyTimer) return;

  schedulerGlobal.quantifyHourlyTimer = setInterval(() => void runMarketUpdate(), HOUR_MS);
  schedulerGlobal.quantifyHourlyTimer.unref?.();
  void runMarketUpdate();
}
