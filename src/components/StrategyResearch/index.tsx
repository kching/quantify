'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle, Save, Trash2 } from 'lucide-react';
import type { BacktestResult, HoldingStrategy, Portfolio, StrategyParams } from '@/core/types';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectControl, SelectOption } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import './StrategyResearch.css';

type Cadence = 'hourly' | 'daily';
interface ParameterRange { min: number; max: number; step: number; }
interface StrategyRanges { period: ParameterRange; fastPeriod: ParameterRange; slowPeriod: ParameterRange; signalPeriod: ParameterRange; }
export interface StrategyResearchInput { symbol: string; strategy: string; cadence: Cadence; days: number; ranges: StrategyRanges; }
export interface StrategySweepResult extends StrategyResearchInput { runs: BacktestResult[]; }
interface StrategyResearchProps {
  result: StrategySweepResult | null;
  busy: boolean;
  portfolios?: Array<Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }>;
  savedStrategies?: HoldingStrategy[];
  onRun: (input: StrategyResearchInput) => Promise<boolean>;
  onBack: () => void;
  onSaved?: (strategy: HoldingStrategy) => void;
  onDeleted?: (portfolioId: number, symbol: string, id: number) => void;
}

const strategyLabels: Record<string, string> = { 'klinger-oscillator': 'Klinger Volume Oscillator', 'rsi-14': 'RSI (14)' };
const rangeOptions: Record<Cadence, Array<{ label: string; shortLabel: string; days: number }>> = {
  hourly: [{ label: 'Last month', shortLabel: '1M', days: 30 }, { label: 'Last 3 months', shortLabel: '3M', days: 90 }, { label: 'Last 6 months', shortLabel: '6M', days: 182 }, { label: 'Last 1 year', shortLabel: '12M', days: 365 }],
  daily: [{ label: 'Last year', shortLabel: '1Y', days: 365 }, { label: 'Last 3 years', shortLabel: '3Y', days: 1095 }, { label: 'Last 5 years', shortLabel: '5Y', days: 1825 }, { label: 'Last 10 years', shortLabel: '10Y', days: 3650 }],
};
const initialRanges: StrategyRanges = { period: { min: 5, max: 30, step: 1 }, fastPeriod: { min: 10, max: 60, step: 1 }, slowPeriod: { min: 30, max: 100, step: 1 }, signalPeriod: { min: 5, max: 30, step: 1 } };

function parameterSets(sweep: StrategySweepResult): StrategyParams[] {
  const values = (min: number, max: number, step: number): number[] => {
    const stepped = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
    return Array.from(new Set([...stepped, max]));
  };
  return sweep.strategy === 'rsi-14'
    ? values(sweep.ranges.period.min, sweep.ranges.period.max, sweep.ranges.period.step).map((period) => ({ period }))
    : values(sweep.ranges.fastPeriod.min, sweep.ranges.fastPeriod.max, sweep.ranges.fastPeriod.step).flatMap((fastPeriod) => values(sweep.ranges.slowPeriod.min, sweep.ranges.slowPeriod.max, sweep.ranges.slowPeriod.step).flatMap((slowPeriod) => values(sweep.ranges.signalPeriod.min, sweep.ranges.signalPeriod.max, sweep.ranges.signalPeriod.step).map((signalPeriod) => ({ fastPeriod, slowPeriod, signalPeriod }))));
}
function paramsLabel(params: StrategyParams): string { return Object.entries(params).map(([key, value]) => `${key.replace('Period', '')} ${String(value)}`).join(' · '); }
interface ChartScale { min: number; max: number; ticks: number[]; }
function chartScale(values: number[]): ChartScale {
  const maximum = Math.max(...values, 0);
  const minimum = Math.min(...values, 0);
  const step = Math.max(1, Math.ceil((maximum - minimum) / 4 / 5) * 5);
  const min = Math.floor(minimum / step) * step;
  const max = Math.ceil(maximum / step) * step || step;
  return { min, max, ticks: Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4) };
}
function percentLabel(value: number): string { return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`; }

export default function StrategyResearch({ result, busy, portfolios = [], savedStrategies = [], onRun, onBack, onSaved = () => undefined, onDeleted = () => undefined }: StrategyResearchProps): React.JSX.Element {
  const [symbol, setSymbol] = useState('MQG.AX');
  const [strategy, setStrategy] = useState('klinger-oscillator');
  const [cadence, setCadence] = useState<Cadence>('hourly');
  const [days, setDays] = useState(90);
  const [ranges, setRanges] = useState<StrategyRanges>(initialRanges);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [signalLabel, setSignalLabel] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState(String(portfolios[0]?.id ?? ''));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const selectedPortfolio = portfolios.find((portfolio) => String(portfolio.id) === portfolioId);
  const portfolioHoldings = selectedPortfolio?.holdings ?? [];
  const selectedRun = result?.runs[selectedIndex] ?? result?.runs[0];
  const selectedRunParams = result ? parameterSets(result)[selectedIndex] ?? {} : {};
  const defaultSignalLabel = paramsLabel(selectedRunParams);
  const displayedSignalLabel = signalLabel ?? defaultSignalLabel;
  const normalizedSignalLabel = displayedSignalLabel.trim();
  const returnScale = result ? chartScale(result.runs.map((run) => run.totalReturnPct)) : chartScale([0]);
  const drawdownScale = result ? chartScale(result.runs.map((run) => Math.abs(run.maxDrawdownPct))) : chartScale([0]);
  const ranked = useMemo(() => result ? [...result.runs].sort((a, b) => b.totalReturnPct - a.totalReturnPct) : [], [result]);
  const lowestDrawdown = useMemo(() => result ? [...result.runs].sort((a, b) => a.maxDrawdownPct - b.maxDrawdownPct)[0] : undefined, [result]);
  const balancedPick = useMemo(() => result ? [...result.runs].sort((a, b) => (b.totalReturnPct + b.maxDrawdownPct) - (a.totalReturnPct + a.maxDrawdownPct))[0] : undefined, [result]);

  function showToast(message: string, kind: 'success' | 'error'): void { toast(message, kind); }

  function changeStrategy(next: string): void { setStrategy(next); setRanges(next === 'rsi-14' ? { ...initialRanges, period: { min: 5, max: 30, step: 1 } } : initialRanges); }
  function changeCadence(next: Cadence): void { setCadence(next); setDays(rangeOptions[next][next === 'hourly' ? 1 : 2].days); }
  function updateRange(name: keyof StrategyRanges, edge: keyof ParameterRange, value: string): void {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    setRanges((current) => {
      const range = current[name];
      const nextValue = Math.max(1, Math.round(number));
      const nextRange: ParameterRange = edge === 'min'
        ? { min: Math.min(nextValue, range.max), max: range.max, step: range.step }
        : { min: range.min, max: Math.max(nextValue, range.min), step: range.step };
      return { ...current, [name]: nextRange };
    });
  }
  function updateStep(name: keyof StrategyRanges, value: string): void { const number = Number(value); if (Number.isFinite(number)) setRanges((current) => ({ ...current, [name]: { ...current[name], step: Math.max(1, Math.round(number)) } })); }
  async function submitBacktest(event: React.FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); setSelectedIndex(0); setSignalLabel(null); await onRun({ symbol, strategy, cadence, days, ranges }); }
  function selectRun(index: number): void { setSelectedIndex(index); setSignalLabel(null); }
  async function saveSignal(): Promise<void> {
    if (!selectedRun || !portfolioId || !normalizedSignalLabel) {
      showToast('Enter a label before saving the signal.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/strategies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, label: normalizedSignalLabel, name: strategy, params: selectedRunParams }) });
      const body = await response.json() as { strategy?: HoldingStrategy; error?: string };
      if (!response.ok || !body.strategy) throw new Error(body.error ?? 'Unable to save signal.');
      onSaved(body.strategy); showToast(`${symbol} signal saved to ${selectedPortfolio?.name ?? 'portfolio'}.`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save signal.', 'error'); } finally { setSaving(false); }
  }
  async function deleteSignal(saved: HoldingStrategy): Promise<void> { const response = await fetch(`/api/portfolios/${saved.portfolioId}/strategies/${encodeURIComponent(saved.symbol)}`, { method: 'DELETE' }); if (response.ok) { onDeleted(saved.portfolioId, saved.symbol, saved.id); showToast(`${saved.symbol} signal deleted.`, 'success'); } else showToast('Unable to delete signal.', 'error'); }

  if (!result) return <Card className="backtest-panel research-setup-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">SIGNAL BUILDER</p><CardTitle>Configure your backtest</CardTitle><CardDescription>Choose a strategy, cadence, time window, and parameter ranges to sweep.</CardDescription></div></CardHeader><CardContent>
    <form className="research-setup-form" onSubmit={(event) => void submitBacktest(event)}>
      <div className="setup-columns"><div className="setup-controls"><div className="setup-grid"><label>Symbol<Input aria-label="Ticker for backtest" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())}/></label><label>Strategy<SelectControl value={strategy} ariaLabel="Backtest strategy" onValueChange={changeStrategy}><SelectOption value="klinger-oscillator">Klinger Volume Oscillator</SelectOption><SelectOption value="rsi-14">RSI (14)</SelectOption></SelectControl></label></div>
        <div className="field-block"><span className="field-label">Candle cadence</span><ButtonGroup className="cadence-button-group">{(['hourly', 'daily'] as const).map((option) => <button className={cadence === option ? 'choice-button selected' : 'choice-button'} type="button" aria-pressed={cadence === option} key={option} onClick={() => changeCadence(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</ButtonGroup></div>
        <div className="field-block"><div className="slider-heading"><span className="field-label">Backtest window</span><strong>{rangeOptions[cadence].find((option) => option.days === days)?.label}</strong></div><input className="range-slider" aria-label="Backtest window" type="range" min="0" max={rangeOptions[cadence].length - 1} step="1" value={Math.max(0, rangeOptions[cadence].findIndex((option) => option.days === days))} onChange={(event) => setDays(rangeOptions[cadence][Number(event.target.value)]?.days ?? days)}/><div className="slider-labels">{rangeOptions[cadence].map((option) => <span key={option.days}>{option.shortLabel}</span>)}</div></div>
      </div><div className="parameter-panel"><div><span className="field-label">Parameter ranges</span><p>Set the minimum and maximum values to test.</p></div><div className="parameter-range-grid">{(strategy === 'rsi-14' ? [['period', 'RSI period']] : [['fastPeriod', 'Fast period'], ['slowPeriod', 'Slow period'], ['signalPeriod', 'Signal period']]).map(([name, label]) => { const range = ranges[name as keyof StrategyRanges]; return <div className="parameter-range" key={name}><span className="field-label">{label}</span><label>Min<Input aria-label={`${label} minimum`} type="number" min="1" max={range.max} value={range.min} onChange={(event) => updateRange(name as keyof StrategyRanges, 'min', event.target.value)}/></label><label>Max<Input aria-label={`${label} maximum`} type="number" min={range.min} value={range.max} onChange={(event) => updateRange(name as keyof StrategyRanges, 'max', event.target.value)}/></label><label>Step<Input aria-label={`${label} step`} type="number" min="1" step="1" value={range.step} disabled={range.min === range.max} onChange={(event) => updateStep(name as keyof StrategyRanges, event.target.value)}/></label></div>; })}</div></div>
      </div>
      <div className="setup-actions"><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : null}{busy ? 'Running sweep…' : 'Run parameter sweep'}</Button></div>
    </form>
  </CardContent></Card>;

  const outcomeCards: Array<{ label: string; run?: BacktestResult; type: string }> = [{ label: 'Highest return', run: ranked[0], type: 'return' }, { label: 'Lowest drawdown', run: lowestDrawdown, type: 'drawdown' }, { label: 'Balanced pick', run: balancedPick, type: 'balanced' }];
  return <section className="research-results"><div className="results-toolbar"><div><Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4"/>Back to setup</Button></div><div><p className="section-kicker">SWEEP COMPLETE</p><h2>{strategyLabels[result.strategy] ?? result.strategy}</h2><p>{symbol} · {cadence === 'hourly' ? 'Hourly' : 'Daily'} · {rangeOptions[cadence].find((option) => option.days === days)?.label}</p></div><div aria-hidden="true" /></div>
    <div className="outcome-grid">{outcomeCards.map(({ label, run, type }) => run && <button type="button" className={`outcome-card ${type === 'return' ? 'active' : ''}`} key={label} onClick={() => selectRun(result.runs.indexOf(run))}><span>{label}</span><strong className="positive">{type === 'drawdown' ? `${run.maxDrawdownPct.toFixed(1)}%` : `+${run.totalReturnPct.toFixed(1)}%`}</strong><small>{paramsLabel(parameterSets(result)[result.runs.indexOf(run)] ?? {})}</small></button>)}</div>
    <div className="results-grid"><Card className="scatter-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">PARAMETER SWEEP</p><CardTitle>Return vs drawdown</CardTitle><CardDescription>Select a dot to inspect that run&apos;s parameters.</CardDescription></div></CardHeader><CardContent><div className="scatter-chart"><span className="axis-label axis-y">RETURN</span><span className="axis-label axis-x">MAX DRAWDOWN</span><div className="chart-grid-lines" aria-hidden="true"/><div className="chart-y-scale" aria-hidden="true">{[...returnScale.ticks].reverse().map((tick) => <span key={tick} style={{ top: `${100 - ((tick - returnScale.min) / (returnScale.max - returnScale.min)) * 100}%` }}>{percentLabel(tick)}</span>)}</div><div className="chart-x-scale" aria-hidden="true">{drawdownScale.ticks.map((tick) => <span key={tick} style={{ left: `${((tick - drawdownScale.min) / (drawdownScale.max - drawdownScale.min)) * 100}%` }}>{percentLabel(tick)}</span>)}</div>{result.runs.map((run, index) => { const drawdown = Math.abs(run.maxDrawdownPct); const x = ((drawdown - drawdownScale.min) / (drawdownScale.max - drawdownScale.min)) * 100; const y = 100 - ((run.totalReturnPct - returnScale.min) / (returnScale.max - returnScale.min)) * 100; return <button type="button" aria-label={`Select run ${index + 1}`} key={`${run.totalReturnPct}-${index}`} className={`scatter-point ${selectedIndex === index ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => selectRun(index)}><span>{index + 1}</span></button>; })}</div><div className="selected-run"><div><span>Selected run</span><strong>{paramsLabel(selectedRunParams) || '—'}</strong></div><div><span>Return</span><strong className="positive">{selectedRun?.totalReturnPct.toFixed(1)}%</strong></div><div><span>Drawdown</span><strong className="negative">-{selectedRun?.maxDrawdownPct.toFixed(1)}%</strong></div></div></CardContent></Card>
      <Card className="save-signal-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">SAVE AS SIGNAL</p><CardTitle>Assign selected parameters</CardTitle><CardDescription>Save the selected run to a holding.</CardDescription></div></CardHeader><CardContent><div className="save-form"><div className="save-params"><span>Parameters</span><strong>{paramsLabel(selectedRunParams)}</strong></div><label>Label<Input aria-label="Signal label" value={displayedSignalLabel} maxLength={80} required aria-required="true" aria-invalid={signalLabel !== null && !normalizedSignalLabel} onChange={(event) => setSignalLabel(event.target.value)} /></label><label>Portfolio<SelectControl value={portfolioId} ariaLabel="Portfolio" onValueChange={setPortfolioId}>{portfolios.map((portfolio) => <SelectOption key={portfolio.id} value={String(portfolio.id)}>{portfolio.name}</SelectOption>)}</SelectControl></label><label>Holding<SelectControl value={symbol} ariaLabel="Holding" onValueChange={setSymbol}>{portfolioHoldings.length ? portfolioHoldings.map((holding) => <SelectOption key={holding.symbol} value={holding.symbol}>{holding.symbol}</SelectOption>) : <SelectOption value={symbol}>{symbol}</SelectOption>}</SelectControl></label><Button onClick={() => void saveSignal()} disabled={saving || !selectedRun || !portfolioId || !normalizedSignalLabel}><Save className="size-4"/>{saving ? 'Saving…' : 'Save selected signal'}</Button></div>{!portfolios.length && <p className="method-note">Create a portfolio and add a holding before saving a signal.</p>}</CardContent></Card></div>
    {savedStrategies.length > 0 && <Card className="saved-signals-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">SAVED SIGNALS</p><CardTitle>Configured holdings</CardTitle></div></CardHeader><CardContent><div className="saved-signals">{savedStrategies.map((saved) => <div className="saved-signal" key={saved.id}><div><strong>{saved.symbol}</strong><span>{saved.label} · {strategyLabels[saved.name] ?? saved.name}</span></div><Button size="sm" variant="ghost" aria-label={`Delete ${saved.symbol} signal`} onClick={() => void deleteSignal(saved)}><Trash2 className="size-4"/></Button></div>)}</div></CardContent></Card>}
  </section>;
}
