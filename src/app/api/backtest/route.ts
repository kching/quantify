import { DAILY_CANDLE_HISTORY_DAYS, DAILY_CANDLE_RETENTION_MS, TIME_SERIES_RETENTION_MS, getCandles, saveCandles } from '@/core/db';
import { runBacktest } from '@/core/backtest';
import { strategies } from '@/core/engine';
import { fetchYahooCandles } from '@/core/providers/yahoo.provider';
import type { CandleInterval } from '@/core/types';
import type { StrategyParams } from '@/core/types';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!(await getCurrentUser())) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const symbol = query.get('symbol')?.trim().toUpperCase() ?? '';
  const strategyId = query.get('strategy') ?? 'klinger-oscillator';
  const strategy = strategies.find((candidate) => candidate.id === strategyId);
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol) || !strategy) return Response.json({ error: 'Provide a valid ticker and strategy.' }, { status: 400 });
  const cadence = query.get('cadence') === 'hourly' ? 'hourly' : 'daily';
  const interval: CandleInterval = cadence === 'hourly' ? '1h' : '1d';
  let params: StrategyParams = {};
  const rawParams = query.get('params');
  if (rawParams) {
    try {
      const parsed: unknown = JSON.parse(rawParams);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Parameters must be an object.');
      params = parsed as StrategyParams;
    } catch {
      return Response.json({ error: 'Strategy parameters are invalid.' }, { status: 400 });
    }
  }
  let candles = await getCandles(symbol, interval);
  const retentionMs = interval === '1h' ? TIME_SERIES_RETENTION_MS : DAILY_CANDLE_RETENTION_MS;
  const historyDays = interval === '1h' ? Math.floor(TIME_SERIES_RETENTION_MS / 86_400_000) : DAILY_CANDLE_HISTORY_DAYS;
  const cutoff = Date.now() - retentionMs;
  if (!candles.length || candles[0].timestamp > cutoff) {
    try {
      const fetched = await fetchYahooCandles(symbol, interval, historyDays);
      await saveCandles(interval, fetched.filter((candle) => candle.timestamp >= cutoff));
      candles = await getCandles(symbol, interval);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to load historical data.' }, { status: 502 });
    }
  }
  if (candles.length < 70) return Response.json({ error: `At least 70 ${cadence} candles are needed for this backtest.` }, { status: 422 });
  const requestedDays = Number(query.get('days') ?? '365');
  const days = Math.min(Math.max(Number.isFinite(requestedDays) ? requestedDays : 365, 30), historyDays);
  const windowCutoff = Date.now() - days * 86_400_000;
  const window = candles.filter((candle) => candle.timestamp >= windowCutoff);
  return Response.json({ result: runBacktest(symbol, window, strategy, 10_000, params) });
}
