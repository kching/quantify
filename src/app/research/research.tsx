'use client';

import { useState } from 'react';
import type {BacktestResult, HoldingStrategy, Portfolio, UserProfile} from '@/core/types';
import { Badge } from '@/components/ui/badge';
import StrategyResearch, { type StrategyResearchInput } from '@/components/StrategyResearch';
import AppSidebar from '@/components/AppSidebar';

export default function ResearchPage({ user, portfolios = [], initialStrategies = [] }: { user?: Pick<UserProfile, 'name' | 'image'>; portfolios?: Array<Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }>; initialStrategies?: HoldingStrategy[] }): React.JSX.Element {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedStrategies, setSavedStrategies] = useState(initialStrategies);

  async function runBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const defaults = input.strategy === 'rsi-14' ? { period: 14 } : { fastPeriod: 34, slowPeriod: 55, signalPeriod: 13 };
      const paramsQuery = JSON.stringify(input.params) === JSON.stringify(defaults) ? '' : `&params=${encodeURIComponent(JSON.stringify(input.params))}`;
      const response = await fetch(`/api/backtest?symbol=${encodeURIComponent(input.symbol)}&strategy=${input.strategy}${paramsQuery}&days=365`);
      const body = await response.json() as { result?: BacktestResult; error?: string };
      if (!response.ok || !body.result) throw new Error(body.error ?? 'Backtest failed.');
      setResult(body.result);
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
      {id: 'portfolio', label: 'Portfolio Signals', icon:'activity', href:'/dashboard#portfolio'},
      {id: 'performance', label: 'Portfolio Performance', icon:'bar-chart-3', href:'/dashboard#performance'},
      {id: 'ledger', label: 'Trade & Cash Ledger', icon:'wallet', href:'/dashboard#ledger'},
      {id: 'research', label: 'Strategy Research', icon:'microscope', href:'/research'}
    ]}/>

    <main className="app-main">
      <div className="dashboard-content">
        <section className="page-heading"><div><p className="section-kicker">STRATEGY LAB</p><h1>Research strategies</h1><p className="page-subtitle">Test a hypothesis against cached daily market history.</p></div></section>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <StrategyResearch result={result} busy={busy} portfolios={portfolios} savedStrategies={savedStrategies} onRun={runBacktest} onSaved={(saved) => setSavedStrategies((current) => [...current.filter((item) => !(item.portfolioId === saved.portfolioId && item.symbol === saved.symbol)), saved])} onDeleted={(portfolioId, symbol) => setSavedStrategies((current) => current.filter((item) => !(item.portfolioId === portfolioId && item.symbol === symbol)))}/>
        <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span></footer>
      </div>
    </main>
  </div>;
}
