'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Candle, PortfolioHolding, SignalResult } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface PortfolioSignalRow {
  daily: SignalResult[];
  hourly: SignalResult[];
  dailyCandles: Candle[];
  hourlyCandles: Candle[];
}

interface PortfolioSignalsProps {
  hasPortfolio: boolean;
  holdings: PortfolioHolding[];
  signals: PortfolioSignalRow[];
  warnings: string[];
  lastScannedAt: number | null;
  busy: boolean;
  onAddHolding: (symbol: string) => Promise<boolean>;
  onRemoveHolding: (symbol: string) => Promise<void>;
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
const sydneyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });

export default function Index({ hasPortfolio, holdings, signals, warnings, lastScannedAt, busy, onAddHolding, onRemoveHolding }: PortfolioSignalsProps): React.JSX.Element {
  const [symbolInput, setSymbolInput] = useState('');
  const scanned = new Map(signals.map((row) => [row.daily[0]?.symbol ?? row.daily[1]?.symbol ?? '', row]));

  async function addHolding(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (await onAddHolding(symbolInput)) setSymbolInput('');
  }

  return <Card className="signals-card"><CardHeader className="section-card-header"><div><p className="section-kicker">SIGNAL MONITOR</p><CardTitle>Portfolio signals</CardTitle></div></CardHeader>
    <CardContent className="signals-content">
      {hasPortfolio && <div className="watchlist-tools"><form className="inline-form" onSubmit={(event) => void addHolding(event)}><Input aria-label="ASX ticker" placeholder="Add ASX ticker e.g. CSL" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} maxLength={20}/><Button type="submit" variant="outline" size="sm" disabled={busy || !symbolInput.trim()}>Add asset</Button></form></div>}
      <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>LAST PRICE</th><th>DAILY KVO</th><th>DAILY RSI</th><th>DAILY CHANGE</th><th><span className="sr-only">ACTIONS</span></th></tr></thead><tbody>{holdings.map((holding) => {
        const row = scanned.get(holding.symbol);
        const klinger = row?.daily.find((item) => item.strategyId === 'klinger-oscillator');
        const rsi = row?.daily.find((item) => item.strategyId === 'rsi-14');
        return <tr key={holding.symbol}><td><span className="asset-symbol">{holding.symbol.replace('.AX', '')}</span><small className="asset-exchange">ASX</small></td><td className="price-cell">{klinger?.price ? money.format(klinger.price) : '—'}</td><td><SignalPill signal={klinger?.signal ?? 'HOLD'}/></td><td><SignalPill signal={rsi?.signal ?? 'HOLD'} detail={rsi?.indicators.rsi != null ? `RSI ${rsi.indicators.rsi.toFixed(0)}` : undefined}/></td><td><DayPriceChange dailyCandles={row?.dailyCandles ?? []} hourlyCandles={row?.hourlyCandles ?? []}/></td><td><Button variant="ghost" size="icon" className="trade-delete-button" aria-label={`Remove ${holding.symbol}`} title={`Remove ${holding.symbol}`} disabled={busy} onClick={() => void onRemoveHolding(holding.symbol)}><Trash2 className="size-4"/></Button></td></tr>;
      })}{holdings.length === 0 && <tr><td colSpan={6} className="empty-row">{hasPortfolio ? 'Add tickers above to start monitoring this portfolio.' : 'Create a portfolio to begin your market scan.'}</td></tr>}</tbody></table></div>
      {warnings.map((warning) => <div className="notice notice-warning" key={warning}>{warning}</div>)}<p className="panel-footnote">Signals are decision support, not trade instructions. Last checked: {lastScannedAt ? dateTime.format(lastScannedAt) : 'not yet scanned'}.</p>
    </CardContent>
  </Card>;
}

export function SignalPill({ signal, detail, compact = false }: { signal: SignalResult['signal']; detail?: string; compact?: boolean }): React.JSX.Element {
  return <span className={`signal-pill ${signal.toLowerCase()} ${compact ? 'compact' : ''}`}><i/>{signal}{detail && <small>{detail}</small>}</span>;
}

function DayPriceChange({ dailyCandles, hourlyCandles }: { dailyCandles: Candle[]; hourlyCandles: Candle[] }): React.JSX.Element {
  const latestHourly = hourlyCandles.at(-1);
  if (!latestHourly) return <span className="day-change-empty">—</span>;
  const latestDate = sydneyDate.format(latestHourly.timestamp);
  const previousDaily = dailyCandles.filter((candle) => sydneyDate.format(candle.timestamp) < latestDate).at(-1);
  if (!previousDaily || previousDaily.close <= 0) return <span className="day-change-empty">—</span>;
  const amount = latestHourly.close - previousDaily.close;
  const percent = amount / previousDaily.close * 100;
  const sign = amount >= 0 ? '+' : '−';
  return <span className={`day-change ${amount >= 0 ? 'positive' : 'negative'}`} aria-label={`Day change ${sign}${money.format(Math.abs(amount))} (${sign}${Math.abs(percent).toFixed(2)}%)`}>
    <strong>{sign}{money.format(Math.abs(amount))}</strong><small>({sign}{Math.abs(percent).toFixed(2)}%)</small>
  </span>;
}
