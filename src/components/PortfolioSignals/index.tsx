'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Candle, PortfolioHolding, SignalResult } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import './PortfolioSignals.css';

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
  error: string;
  onDismissError: () => void;
  lastScannedAt: number | null;
  busy: boolean;
  onAddHolding: (symbol: string) => Promise<boolean>;
  onRemoveHolding: (symbol: string) => Promise<void>;
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
const sydneyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
const signalOrder: SignalResult['signal'][] = ['SELL', 'BUY', 'HOLD'];

interface SignalSummaryProps {
  signals: readonly SignalResult[];
}

export default function Index({ hasPortfolio, holdings, signals, warnings, error, onDismissError, lastScannedAt, busy, onAddHolding, onRemoveHolding }: PortfolioSignalsProps): React.JSX.Element {
  const [symbolInput, setSymbolInput] = useState('');
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(() => new Set());
  const scanned = new Map(signals.map((row) => [row.daily[0]?.symbol ?? row.daily[1]?.symbol ?? '', row]));
  const visibleWarnings = warnings.filter((warning) => !dismissedWarnings.has(warning));

  useEffect(() => {
    if (!warnings.length) return;
    const timer = window.setTimeout(() => setDismissedWarnings((current) => new Set([...current, ...warnings])), 5_000);
    return () => window.clearTimeout(timer);
  }, [warnings]);

  async function addHolding(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (await onAddHolding(symbolInput)) setSymbolInput('');
  }

  return <Card className="signals-card"><CardHeader className="section-card-header"><div><p className="section-kicker">SIGNAL MONITOR</p><CardTitle>Portfolio signals</CardTitle></div></CardHeader>
    <CardContent className="signals-content">
      {hasPortfolio && <div className="watchlist-tools"><form className="inline-form" onSubmit={(event) => void addHolding(event)}><Input aria-label="ASX ticker" placeholder="Add ticker e.g. QQQ" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} maxLength={20}/><Button type="submit" variant="outline" size="icon" className="add-asset-button" aria-label="Add asset" title="Add asset" disabled={busy || !symbolInput.trim()}><Plus className="size-4"/></Button></form></div>}
      <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>LAST PRICE</th><th>SIGNALS</th><th>DAILY CHANGE</th><th><span className="sr-only">ACTIONS</span></th></tr></thead><tbody>{holdings.map((holding) => {
        const row = scanned.get(holding.symbol);
        const latestSignal = row?.daily[0];
        return <tr key={holding.symbol}><td><span className="asset-symbol">{holding.symbol}</span></td><td className="price-cell">{latestSignal?.price ? money.format(latestSignal.price) : '—'}</td><td><SignalSummary signals={row?.daily ?? []}/></td><td><DayPriceChange dailyCandles={row?.dailyCandles ?? []} hourlyCandles={row?.hourlyCandles ?? []}/></td><td><Button variant="ghost" size="icon" className="trade-delete-button" aria-label={`Remove ${holding.symbol}`} title={`Remove ${holding.symbol}`} disabled={busy} onClick={() => void onRemoveHolding(holding.symbol)}><Trash2 className="size-4"/></Button></td></tr>;
      })}{holdings.length === 0 && <tr><td colSpan={5} className="empty-row">{hasPortfolio ? 'Add tickers above to start monitoring this portfolio.' : 'Create a portfolio to begin your market scan.'}</td></tr>}</tbody></table></div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span><button className="notice-dismiss" type="button" aria-label="Dismiss error" onClick={onDismissError}><X className="size-4"/></button></div>}{visibleWarnings.map((warning) => <div className="notice notice-warning" role="alert" key={warning}><span>{warning}</span><button className="notice-dismiss" type="button" aria-label="Dismiss warning" onClick={() => setDismissedWarnings((current) => new Set([...current, warning]))}><X className="size-4"/></button></div>)}<p className="panel-footnote">Signals are decision support, not trade instructions. Last checked: {lastScannedAt ? dateTime.format(lastScannedAt) : 'not yet scanned'}.</p>
    </CardContent>
  </Card>;
}

function SignalSummary({ signals }: SignalSummaryProps): React.JSX.Element {
  return <div className="signal-summary">{signalOrder.map((signal) => {
    const matchingSignals = signals.filter((item) => item.signal === signal);
    const strategyNames = matchingSignals.map((item) => item.strategyName);
    const tooltip = strategyNames.length ? `${signal}: ${strategyNames.join(', ')}` : `No ${signal} signals`;
    return <SignalPill key={signal} signal={signal} detail={String(matchingSignals.length)} detailBefore compact tooltip={tooltip}/>;
  })}</div>;
}

export function SignalPill({ signal, detail, detailBefore = false, compact = false, tooltip }: { signal: SignalResult['signal']; detail?: string; detailBefore?: boolean; compact?: boolean; tooltip?: string }): React.JSX.Element {
  return <span className={`signal-pill ${signal.toLowerCase()} ${compact ? 'compact' : ''}`} title={tooltip} aria-label={tooltip ?? [signal, detail].filter(Boolean).join(' ')}><i/>{detail && detailBefore && <small>{detail}</small>}{signal}{detail && !detailBefore && <small>{detail}</small>}</span>;
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
