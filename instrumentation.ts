export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startHourlyMarketScheduler } = await import('./src/core/scheduler');
  startHourlyMarketScheduler();
}
