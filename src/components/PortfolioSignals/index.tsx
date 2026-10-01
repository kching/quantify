'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import type { Candle, PortfolioHolding, SignalResult } from '@/core/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import './PortfolioSignals.css';

export interface PortfolioSignalRow {
  symbol?: string;
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
  onRemoveSignal: (symbol: string, signalId: number) => Promise<void>;
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
const sydneyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
const signalOrder: SignalResult['signal'][] = ['SELL', 'BUY', 'HOLD'];

interface SignalSummaryProps {
  signals: readonly SignalResult[];
}

export default function Index({ hasPortfolio, holdings, signals, warnings, error, onDismissError, lastScannedAt, busy, onAddHolding, onRemoveHolding, onRemoveSignal }: PortfolioSignalsProps): React.JSX.Element {
  const [symbolInput, setSymbolInput] = useState('');
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(() => new Set());
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(() => new Set());
  const scanned = new Map(signals.map((row) => [row.symbol ?? row.daily[0]?.symbol ?? row.dailyCandles[0]?.symbol ?? row.hourlyCandles[0]?.symbol ?? '', row]));
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

  return <Card className="signals-card"><CardHeader className="section-card-header"><div><p className="section-kicker">SIGNAL MONITOR</p><CardTitle>Watchlist</CardTitle></div></CardHeader>
    <CardContent className="signals-content">
      {hasPortfolio && <div className="watchlist-tools"><form className="inline-form" onSubmit={(event) => void addHolding(event)}><Input aria-label="ASX ticker" placeholder="Add ticker e.g. QQQ" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} maxLength={20}/><Button type="submit" variant="outline" size="icon" className="add-asset-button" aria-label="Add asset" title="Add asset" disabled={busy || !symbolInput.trim()}><Plus className="size-4"/></Button></form></div>}
      <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>LAST PRICE</th><th>SIGNALS</th><th>DAILY CHANGE</th><th><span className="sr-only">ACTIONS</span></th></tr></thead><tbody>{holdings.map((holding) => {
        const row = scanned.get(holding.symbol);
        const latestSignal = row?.daily[0];
        const latestPrice = latestSignal?.price ?? row?.hourlyCandles.at(-1)?.close ?? row?.dailyCandles.at(-1)?.close;
        const expanded = expandedSymbols.has(holding.symbol);
        const toggleExpanded = (): void => setExpandedSymbols((current) => { const next = new Set(current); if (next.has(holding.symbol)) next.delete(holding.symbol); else next.add(holding.symbol); return next; });
        return <Fragment key={holding.symbol}><tr><td><button type="button" className="signal-expand-button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${holding.symbol} signals`} onClick={toggleExpanded}>{expanded ? <ChevronUp className="size-4"/> : <ChevronDown className="size-4"/>}<span className="asset-symbol">{holding.symbol}</span></button></td><td className="price-cell">{latestPrice ? money.format(latestPrice) : '—'}</td><td><SignalSummary signals={row?.daily ?? []}/></td><td><DayPriceChange dailyCandles={row?.dailyCandles ?? []} hourlyCandles={row?.hourlyCandles ?? []}/></td><td><Button variant="ghost" size="icon" className="trade-delete-button" aria-label={`Remove ${holding.symbol}`} title={`Remove ${holding.symbol}`} disabled={busy} onClick={() => void onRemoveHolding(holding.symbol)}><Trash2 className="size-4"/></Button></td></tr>{expanded && <tr className="expanded-signals-row"><td colSpan={5}><SignalList symbol={holding.symbol} signals={row?.daily ?? []} busy={busy} onRemoveSignal={onRemoveSignal}/></td></tr>}</Fragment>;
      })}{holdings.length === 0 && <tr><td colSpan={5} className="empty-row">{hasPortfolio ? 'Add tickers above to start monitoring this portfolio.' : 'Create a portfolio to begin your market scan.'}</td></tr>}</tbody></table></div>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span><button className="notice-dismiss" type="button" aria-label="Dismiss error" onClick={onDismissError}><X className="size-4"/></button></div>}{visibleWarnings.map((warning) => <div className="notice notice-warning" role="alert" key={warning}><span>{warning}</span><button className="notice-dismiss" type="button" aria-label="Dismiss warning" onClick={() => setDismissedWarnings((current) => new Set([...current, warning]))}><X className="size-4"/></button></div>)}<p className="panel-footnote">Signals are decision support, not trade instructions. Last checked: {lastScannedAt ? dateTime.format(lastScannedAt) : 'not yet scanned'}.</p>
    </CardContent>
  </Card>;
}

function SignalList({ symbol, signals, busy, onRemoveSignal }: { symbol: string; signals: readonly SignalResult[]; busy: boolean; onRemoveSignal: (symbol: string, signalId: number) => Promise<void> }): React.JSX.Element {
  if (!signals.length) return <div className="signal-list-empty">No signals available for this holding.</div>;
  return <div className="signal-list">{signals.map((signal) => <div className="signal-list-item" key={`${signal.signalId ?? signal.strategyId}-${signal.strategyId}`}><div className="signal-list-main"><div><strong>{signal.label ?? signal.strategyName}</strong><span>{signal.strategyName}</span></div><SignalPill signal={signal.signal} compact/></div><p>{signal.rationale}</p>{signal.signalId != null && <Button variant="ghost" size="icon" aria-label={`Delete ${signal.label ?? signal.strategyName} signal`} title={`Delete ${signal.label ?? signal.strategyName} signal`} disabled={busy} onClick={() => void onRemoveSignal(symbol, signal.signalId ?? 0)}><Trash2 className="size-4"/></Button>}</div>)}</div>;
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
