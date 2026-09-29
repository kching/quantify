'use client';

import { useMemo } from 'react';
import type { Candle } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PortfolioSignalRow } from '@/components/PortfolioSignals';
import './RecentMovements.css';

interface RecentMovementsProps {
  tickers: string[];
  timeframe: string;
  signals: PortfolioSignalRow[];
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function LineChart({ candles }: { candles: Candle[] }): React.JSX.Element {
  const points = useMemo(() => {
    const closes = candles.map((candle) => candle.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    return closes.map((close, index) => `${(index / Math.max(closes.length - 1, 1)) * 600},${100 - ((close - min) / (max - min || 1)) * 84}`).join(' ');
  }, [candles]);
  if (candles.length < 2) return <div className="chart-empty">Chart will appear when candle history is available.</div>;
  return <svg className="price-chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label="Recent price history"><defs><linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity=".22"/><stop offset="100%" stopColor="#60a5fa" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 600,100`} fill="url(#price-fill)"/><polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>;
}

export default function RecentMovements({ tickers, timeframe, signals }: RecentMovementsProps): React.JSX.Element {
  const rows = new Map(signals.map((row) => [row.daily[0]?.symbol ?? row.daily[1]?.symbol ?? '', row]));
  return <Card className="movement-card"><CardHeader className="section-card-header"><div><p className="section-kicker">PRICE CONTEXT</p><CardTitle>Recent movement</CardTitle></div><Badge variant="outline">{timeframe}</Badge></CardHeader><CardContent className="movement-content">{tickers.map((ticker) => { const row = rows.get(ticker); const latest = row?.hourlyCandles.at(-1); return <div className="watch-row" key={ticker}><div className="watch-meta"><span className="asset-symbol">{ticker}</span><small>{latest ? money.format(latest.close) : 'Waiting for data'}</small></div><LineChart candles={row?.hourlyCandles ?? []}/></div>; })}{!tickers.length && <div className="chart-empty">Add assets to see hourly price context.</div>}<p className="chart-caption">Hourly candles add context to the daily signal.</p></CardContent></Card>;
}
