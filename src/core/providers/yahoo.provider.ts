import type { Candle, CandleInterval } from "../types";

interface YahooChartResponse {
  chart?: {
    error?: { description?: string } | null;
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }> | null;
  };
}

export async function fetchYahooCandles(
  symbol: string,
  interval: CandleInterval,
  periodDays: number,
): Promise<Candle[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - periodDays * 86_400;
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("interval", interval);
  url.searchParams.set("events", "history");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Quantify/0.1" },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}.`);
  const payload = (await response.json()) as YahooChartResponse;
  const chart = payload.chart?.result?.[0];
  if (!chart)
    throw new Error(
      payload.chart?.error?.description ??
        `No Yahoo Finance data returned for ${symbol}.`,
    );
  const timestamps = chart.timestamp ?? [];
  const quote = chart.indicators?.quote?.[0];
  if (!quote) return [];
  return timestamps.flatMap((timestamp, index) => {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    const volume = quote.volume?.[index];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null
    )
      return [];
    return [
      {
        symbol,
        interval,
        timestamp: timestamp * 1000,
        open,
        high,
        low,
        close,
        volume,
      },
    ];
  });
}
