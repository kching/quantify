'use client';

import { useState } from 'react';
import type { BacktestResult } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import StrategyResearch, { type StrategyResearchInput } from '@/components/StrategyResearch';
import AppSidebar from '@/components/AppSidebar';

export default function ResearchPage(): React.JSX.Element {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function runBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/backtest?symbol=${encodeURIComponent(input.symbol)}&strategy=${input.strategy}&days=365`);
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
    <AppSidebar page="research"/>

    <main className="app-main">
      <header className="app-header"><div className="header-actions"><Badge variant="outline" className="market-badge"><i/>ASX <span>·</span> AUSTRALIA</Badge><span className="header-divider"/><span className="cycle-label">STRATEGY LAB</span></div></header>
      <div className="dashboard-content">
        <section className="page-heading"><div><p className="section-kicker">STRATEGY LAB</p><h1>Research strategies</h1><p className="page-subtitle">Test a hypothesis against cached daily market history.</p></div></section>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <StrategyResearch result={result} busy={busy} onRun={runBacktest}/>
        <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span><span>Local only · Cached ASX market data</span></footer>
      </div>
    </main>
  </div>;
}
