'use client';

import { useState } from 'react';
import type { BacktestResult, HoldingStrategy, Portfolio, StrategyParams, UserProfile } from '@/core/types';
import StrategyResearch, { type StrategyResearchInput, type StrategySweepResult } from '@/components/StrategyResearch';
import AppSidebar from '@/components/AppSidebar';
import { ToastProvider } from '@/components/ui/toast';

export default function ResearchPage({ user, portfolios = [], initialStrategies = [] }: { user?: Pick<UserProfile, 'name' | 'image'>; portfolios?: Array<Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }>; initialStrategies?: HoldingStrategy[] }): React.JSX.Element {
  const [result, setResult] = useState<StrategySweepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedStrategies, setSavedStrategies] = useState(initialStrategies);

  async function runBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const values = (min: number, max: number): number[] => Array.from(new Set([min, Math.round((min + max) / 2), max]));
      const parameterSets: StrategyParams[] = input.strategy === 'rsi-14'
        ? values(input.ranges.period.min, input.ranges.period.max).map((period) => ({ period }))
        : [
            { fastPeriod: input.ranges.fastPeriod.min, slowPeriod: input.ranges.slowPeriod.min, signalPeriod: input.ranges.signalPeriod.min },
            { fastPeriod: input.ranges.fastPeriod.max, slowPeriod: input.ranges.slowPeriod.max, signalPeriod: input.ranges.signalPeriod.max },
            { fastPeriod: input.ranges.fastPeriod.min, slowPeriod: input.ranges.slowPeriod.max, signalPeriod: input.ranges.signalPeriod.min },
            { fastPeriod: input.ranges.fastPeriod.max, slowPeriod: input.ranges.slowPeriod.min, signalPeriod: input.ranges.signalPeriod.max },
            { fastPeriod: Math.round((input.ranges.fastPeriod.min + input.ranges.fastPeriod.max) / 2), slowPeriod: Math.round((input.ranges.slowPeriod.min + input.ranges.slowPeriod.max) / 2), signalPeriod: Math.round((input.ranges.signalPeriod.min + input.ranges.signalPeriod.max) / 2) },
          ];
      const runs = await Promise.all(parameterSets.map(async (params): Promise<BacktestResult> => {
        const search = new URLSearchParams({ symbol: input.symbol, strategy: input.strategy, cadence: input.cadence, days: String(input.days), params: JSON.stringify(params) });
        const response = await fetch(`/api/backtest?${search.toString()}`);
        const body = await response.json() as { result?: BacktestResult; error?: string };
        if (!response.ok || !body.result) throw new Error(body.error ?? 'Backtest failed.');
        return body.result;
      }));
      setResult({ ...input, runs });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backtest failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return <div className="app-shell" id="top">
    <AppSidebar page="research" hasPortfolio={portfolios.length > 0} user={user} navItems={[
      {id: 'overview', label: 'Overview', icon:'layout-dashboard', href:'/dashboard#overview'},
      {id: 'watchlist', label: 'Watchlist', icon:'list-checks', href:'/dashboard#watchlist'},
      {id: 'portfolio', label: 'Portfolio', icon:'bar-chart-3', href:'/dashboard#portfolio'},
      {id: 'ledger', label: 'Ledger', icon:'wallet', href:'/dashboard#ledger'},
      {id: 'research', label: 'Strategies', icon:'flask-conical', href:'/research'}
    ]}/>

    <main className="app-main">
      <div className="dashboard-content">
        <section className="page-heading"><div><p className="section-kicker">STRATEGY LAB</p><h1>Research strategies</h1><p className="page-subtitle">Test a hypothesis against cached daily market history.</p></div></section>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <ToastProvider><StrategyResearch result={result} busy={busy} portfolios={portfolios} savedStrategies={savedStrategies} onRun={runBacktest} onBack={() => setResult(null)} onSaved={(saved) => setSavedStrategies((current) => [...current.filter((item) => item.id !== saved.id), saved])} onDeleted={(_portfolioId, _symbol, id) => setSavedStrategies((current) => current.filter((item) => item.id !== id))}/></ToastProvider>
        <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span></footer>
      </div>
    </main>
  </div>;
}
