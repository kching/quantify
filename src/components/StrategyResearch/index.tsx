'use client';

import { useState } from 'react';
import { Activity, LoaderCircle, Pencil, Save, Trash2 } from 'lucide-react';
import type { BacktestResult, HoldingStrategy, Portfolio } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectControl, SelectOption } from '@/components/ui/select';
import './StrategyResearch.css';

export interface StrategyResearchInput { symbol: string; strategy: string; params: Record<string, number>; }
interface StrategyResearchProps {
  result: BacktestResult | null;
  busy: boolean;
  portfolios?: Array<Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }>;
  savedStrategies?: HoldingStrategy[];
  onRun: (input: StrategyResearchInput) => Promise<boolean>;
  onSaved?: (strategy: HoldingStrategy) => void;
  onDeleted?: (portfolioId: number, symbol: string, id: number) => void;
}
const strategyLabels: Record<string, string> = { 'klinger-oscillator': 'Klinger Volume Oscillator', 'rsi-14': 'RSI (14)' };

export default function StrategyResearch({ result, busy, portfolios = [], savedStrategies = [], onRun, onSaved = () => undefined, onDeleted = () => undefined }: StrategyResearchProps): React.JSX.Element {
  const [symbol, setSymbol] = useState('MQG.AX');
  const [signalId, setSignalId] = useState<number | null>(null);
  const [strategy, setStrategy] = useState('klinger-oscillator');
  const [label, setLabel] = useState('');
  const [params, setParams] = useState<Record<string, number>>({ fastPeriod: 34, slowPeriod: 55, signalPeriod: 13 });
  const [portfolioId, setPortfolioId] = useState(String(portfolios[0]?.id ?? ''));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedPortfolio = portfolios.find((portfolio) => String(portfolio.id) === portfolioId);
  const portfolioHoldings = selectedPortfolio?.holdings ?? [];

  function changeStrategy(next: string): void { setStrategy(next); setParams(next === 'rsi-14' ? { period: 14 } : { fastPeriod: 34, slowPeriod: 55, signalPeriod: 13 }); }
  function setParam(name: string, value: string): void { const number = Number(value); setParams((current) => ({ ...current, [name]: Number.isFinite(number) ? number : 0 })); }
  async function submitBacktest(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); await onRun({ symbol, strategy, params }); }
  function loadSaved(saved: HoldingStrategy): void {
    setSignalId(saved.id); setSymbol(saved.symbol); setLabel(saved.label); setStrategy(saved.name); setParams(Object.fromEntries(Object.entries(saved.params).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))); setPortfolioId(String(saved.portfolioId)); setMessage(`Editing ${saved.label} · ${saved.symbol} · ${strategyLabels[saved.name] ?? saved.name}`);
  }
  async function saveSignal(): Promise<void> {
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/strategies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: signalId ?? undefined, symbol, label, name: strategy, params }) });
      const body = await response.json() as { strategy?: HoldingStrategy; error?: string };
      if (!response.ok || !body.strategy) throw new Error(body.error ?? 'Unable to save signal.');
      onSaved(body.strategy); setMessage(`${symbol} strategy saved to ${selectedPortfolio?.name ?? 'portfolio'}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save signal.'); } finally { setSaving(false); }
  }
  async function deleteSignal(saved: HoldingStrategy): Promise<void> {
    if (!window.confirm(`Delete the ${saved.symbol} strategy?`)) return;
    const response = await fetch(`/api/portfolios/${saved.portfolioId}/strategies/${encodeURIComponent(saved.symbol)}`, { method: 'DELETE' });
    if (response.ok) onDeleted(saved.portfolioId, saved.symbol, saved.id); else setMessage('Unable to delete signal.');
  }
  const parameterFields: Array<[string, string]> = strategy === 'rsi-14' ? [['period', 'RSI period']] : [['fastPeriod', 'Fast period'], ['slowPeriod', 'Slow period'], ['signalPeriod', 'Signal period']];

  return <section id="research" className="research-section">
    <Card className="backtest-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">SIGNAL BUILDER</p><CardTitle>Create and test a signal</CardTitle><CardDescription>Choose a strategy, tune its parameters, and test it against cached daily history.</CardDescription></div><Badge variant="outline">1Y test window</Badge></CardHeader><CardContent>
      <form className="signal-form" onSubmit={(event) => void submitBacktest(event)}><label>Ticker<Input aria-label="Ticker for backtest" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())}/></label><label>Strategy<SelectControl value={strategy} ariaLabel="Backtest strategy" onValueChange={changeStrategy}><SelectOption value="klinger-oscillator">Klinger Volume Oscillator</SelectOption><SelectOption value="rsi-14">RSI (14)</SelectOption></SelectControl></label>{parameterFields.map(([name, label]) => <label key={name}>{label}<Input aria-label={label} type="number" min="1" step="1" value={params[name] ?? ''} onChange={(event) => setParam(name, event.target.value)}/></label>)}<Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Activity className="size-4"/>}{busy ? 'Working…' : 'Run backtest'}</Button></form>
      {result && <><div className="backtest-result-label">LAST RUN · {strategyLabels[result.strategyId] ?? result.strategyId}</div><div className="backtest-results"><div><small>1Y RETURN</small><strong className={result.totalReturnPct >= 0 ? 'positive' : 'negative'}>{result.totalReturnPct.toFixed(1)}%</strong></div><div><small>WIN RATE</small><strong>{result.winRatePct.toFixed(0)}%</strong></div><div><small>MAX DRAWDOWN</small><strong className="negative">{result.maxDrawdownPct.toFixed(1)}%</strong></div><div><small>CLOSED TRADES</small><strong>{result.trades.length}</strong></div></div></>}
      <p className="method-note">{strategy === 'rsi-14' ? 'BUY when RSI re-enters above 30. SELL when RSI re-enters below 70.' : 'BUY on KVO crossover above its signal line. SELL on crossover below.'} Next-candle open execution; no fees or slippage.</p>
    </CardContent></Card>
    <Card className="signal-save-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">PORTFOLIO ASSIGNMENT</p><CardTitle>Save signal to a holding</CardTitle><CardDescription>Assign a required label, ticker, and parameters to a holding. Saving again updates that labeled signal.</CardDescription></div><Save className="section-icon"/></CardHeader><CardContent><div className="save-form"><label>Label<Input aria-label="Signal label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required/></label><label>Portfolio<SelectControl value={portfolioId} ariaLabel="Portfolio" onValueChange={setPortfolioId}>{portfolios.map((portfolio) => <SelectOption key={portfolio.id} value={String(portfolio.id)}>{portfolio.name}</SelectOption>)}</SelectControl></label><label>Holding<SelectControl value={symbol} ariaLabel="Holding" onValueChange={setSymbol}>{portfolioHoldings.length ? portfolioHoldings.map((holding) => <SelectOption key={holding.symbol} value={holding.symbol}>{holding.symbol}</SelectOption>) : <SelectOption value={symbol}>{symbol} (not in portfolio)</SelectOption>}</SelectControl></label><Button onClick={() => void saveSignal()} disabled={saving || !portfolioId || !label.trim()}>{saving ? <LoaderCircle className="size-4 animate-spin"/> : <Save className="size-4"/>}{saving ? 'Saving…' : 'Save signal'}</Button></div>{message && <p className="save-message" role="status">{message}</p>}{!portfolios.length && <p className="method-note">Create a portfolio and add a holding before saving a signal.</p>}</CardContent></Card>
    <Card className="saved-signals-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">SAVED SIGNALS</p><CardTitle>Configured holdings</CardTitle></div></CardHeader><CardContent>{savedStrategies.length ? <div className="saved-signals">{savedStrategies.map((saved) => <div className="saved-signal" key={saved.id}><div><strong>{saved.label}</strong><span>{saved.symbol} · {strategyLabels[saved.name] ?? saved.name} · {Object.entries(saved.params).map(([key, value]) => `${key}: ${value}`).join(' · ')}</span></div><div className="saved-actions"><Button size="sm" variant="ghost" aria-label={`Edit ${saved.label} signal`} onClick={() => loadSaved(saved)}><Pencil className="size-4"/></Button><Button size="sm" variant="ghost" aria-label={`Delete ${saved.label} signal`} onClick={() => void deleteSignal(saved)}><Trash2 className="size-4"/></Button></div></div>)}</div> : <p className="method-note">No saved signals yet.</p>}</CardContent></Card>
  </section>;
}
