'use client';

import { useState } from 'react';
import { Activity, BarChart3, CircleHelp, LayoutDashboard, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { BacktestResult } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import StrategyResearch, { type StrategyResearchInput } from '@/components/StrategyResearch';

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
    <aside className="app-sidebar">
      <Link className="sidebar-brand" href="/"><span className="sidebar-logo">Q</span><span>quantify<span>.</span><small>ASX MARKET WORKSPACE</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <Link className="nav-item" href="/#overview"><LayoutDashboard/>Overview</Link>
        <Link className="nav-item" href="/#portfolio"><BarChart3/>Portfolio signals</Link>
        <Link className="nav-item" href="/#performance"><Activity/>P&amp;L performance</Link>
        <Link className="nav-item" href="/#ledger"><Wallet/>Trade &amp; cash ledger</Link>
        <Link className="nav-item active" href="/research"><Activity/>Strategy research</Link>
      </nav>
      <div className="sidebar-footer"><div className="sidebar-help"><CircleHelp/><span>Decision support only<br/><small>No orders are sent</small></span></div><div className="sidebar-profile"><span className="profile-avatar">A</span><span><strong>admin</strong><small>Local workspace</small></span></div></div>
    </aside>

    <main className="app-main">
      <header className="app-header"><div className="breadcrumb"><Link href="/">Workspace</Link><span>›</span><strong>Research</strong></div><div className="header-actions"><Badge variant="outline" className="market-badge"><i/>ASX <span>·</span> AUSTRALIA</Badge><span className="header-divider"/><span className="cycle-label">STRATEGY LAB</span></div></header>
      <div className="dashboard-content">
        <section className="page-heading"><div><p className="section-kicker">STRATEGY LAB</p><h1>Research strategies</h1><p className="page-subtitle">Test a hypothesis against cached daily market history.</p></div></section>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <StrategyResearch result={result} busy={busy} onRun={runBacktest}/>
        <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span><span>Local only · Cached ASX market data</span></footer>
      </div>
    </main>
  </div>;
}
