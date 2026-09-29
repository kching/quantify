'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, ChevronRight, CircleHelp, LayoutDashboard, LoaderCircle, RefreshCw, Settings2, Trash2, Wallet } from 'lucide-react';
import type { BacktestResult, HoldingPerformancePoint, PerformanceSnapshots, Portfolio, PortfolioCashTransaction, PortfolioHolding, PortfolioTrade, SignalResult } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogClose, DialogContent, DialogDescription, DialogRoot, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SelectControl, SelectOption } from '@/components/ui/select';
import CashLedger, { type CashLedgerInput } from '@/components/CashLedger';
import PositionLedger, { type PositionLedgerInput } from '@/components/PositionLedger';
import PortfolioSignals, { SignalPill } from '@/components/PortfolioSignals';
import type { PortfolioSignalRow } from '@/components/PortfolioSignals';
import RecentMovements from '@/components/RecentMovements';
import StrategyResearch, { type StrategyResearchInput } from '@/components/StrategyResearch';

interface PortfolioWithHoldings extends Portfolio { holdings: PortfolioHolding[] }
interface ScanPayload { signals: PortfolioSignalRow[]; warnings: string[] }
interface AlertItem extends SignalResult { id: number; portfolioId: number }
interface TradesPayload { trades: PortfolioTrade[]; tickers?: string[]; total: number; page: number; pageSize: number; pageCount: number }
interface CashPayload { transactions: PortfolioCashTransaction[]; total: number; page: number; pageSize: number; pageCount: number }
type PerformanceRange = '1y' | '6m' | '3m' | '1m' | '1w';
const performanceRanges: Array<{ value: PerformanceRange; label: string; days: number }> = [
  { value: '1y', label: '1y', days: 365 },
  { value: '6m', label: '6m', days: 183 },
  { value: '3m', label: '3m', days: 92 },
  { value: '1m', label: '1m', days: 30 },
  { value: '1w', label: '1w', days: 7 },
];
const emptyPerformance: PerformanceSnapshots = { holdings: [], portfolio: [] };
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
function PerformanceChart({ points, rangeLabel }: { points: PerformanceSnapshots['portfolio']; rangeLabel: string }) {
  if (points.length < 2) return <div className="chart-empty">Hourly P&amp;L history will appear as new candles arrive after a trade is recorded.</div>;
  const values = points.map((point) => point.profitLoss);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const coords = values.map((value, index) => `${(index / (values.length - 1)) * 600},${90 - ((value - min) / range) * 80}`).join(' ');
  const zeroY = 90 - ((0 - min) / range) * 80;
  return <svg className="price-chart pnl-chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label={`Hourly portfolio profit and loss, ${rangeLabel}`}>
    <line x1="0" x2="600" y1={zeroY} y2={zeroY} stroke="#64748b" strokeDasharray="4 4"/>
    <polyline points={coords} fill="none" stroke={values.at(-1)! >= 0 ? '#34d399' : '#fb7185'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function HoldingPulseChart({ symbol, points }: { symbol: string; points: HoldingPerformancePoint[] }) {
  const ordered = [...points].sort((left, right) => left.timestamp - right.timestamp);
  if (ordered.length < 2) return <span className="holding-pulse-empty" aria-label={`${symbol} P&L history pending`}>—</span>;
  const values = ordered.map((point) => point.profitLoss);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const coords = values.map((value, index) => `${(index / (values.length - 1)) * 100},${90 - ((value - min) / range) * 80}`).join(' ');
  const zeroY = 90 - ((0 - min) / range) * 80;
  return <svg className="holding-pulse-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${symbol} hourly profit and loss`}>
    <line x1="0" x2="100" y1={zeroY} y2={zeroY} stroke="#cbd5e1" strokeDasharray="3 3"/>
    <polyline points={coords} fill="none" stroke={values.at(-1)! >= 0 ? '#34a879' : '#df7078'} strokeWidth="3" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function Dashboard() {
  const [portfolios, setPortfolios] = useState<PortfolioWithHoldings[]>([]);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [tradeTickers, setTradeTickers] = useState<string[]>([]);
  const [tradeFilter, setTradeFilter] = useState('');
  const [tradePage, setTradePage] = useState(1);
  const [tradePageCount, setTradePageCount] = useState(0);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [cashTransactions, setCashTransactions] = useState<PortfolioCashTransaction[]>([]);
  const [cashPage, setCashPage] = useState(1);
  const [cashPageCount, setCashPageCount] = useState(0);
  const [cashTotal, setCashTotal] = useState(0);
  const [performance, setPerformance] = useState<PerformanceSnapshots>(emptyPerformance);
  const [performanceRange, setPerformanceRange] = useState<PerformanceRange>('1m');
  const [portfolioInput, setPortfolioInput] = useState('');
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);

  const loadPortfolios = useCallback(async (selectFirst = false): Promise<void> => {
    const response = await fetch('/api/portfolios');
    const body = await response.json() as { portfolios: PortfolioWithHoldings[] };
    setPortfolios(body.portfolios);
    if (selectFirst) {
      setPortfolioId(body.portfolios[0]?.id ?? null);
      setTradePage(1);
      setTradeFilter('');
      setCashPage(1);
    }
  }, []);

  const loadTradePage = useCallback(async (requestedPage = tradePage, requestedFilter = tradeFilter): Promise<void> => {
    if (!portfolioId) {
      setTrades([]);
      setTradeTickers([]);
      setTradePageCount(0);
      setTradeTotal(0);
      return;
    }
    const params = new URLSearchParams({ page: String(requestedPage) });
    if (requestedFilter) params.set('symbol', requestedFilter);
    const response = await fetch(`/api/portfolios/${portfolioId}/trades?${params.toString()}`);
    const body = await response.json() as TradesPayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load trades.');
    setTrades(body.trades);
    setTradeTickers(Array.isArray(body.tickers) ? body.tickers : []);
    setTradeTotal(body.total);
    setTradePageCount(body.pageCount);
    setTradePage(body.page);
  }, [portfolioId, tradeFilter, tradePage]);

  const loadCashPage = useCallback(async (requestedPage: number): Promise<void> => {
    if (!portfolioId) {
      setCashTransactions([]);
      setCashPageCount(0);
      setCashTotal(0);
      return;
    }
    const response = await fetch(`/api/portfolios/${portfolioId}/cash?page=${requestedPage}`);
    const body = await response.json() as CashPayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load cash entries.');
    setCashTransactions(body.transactions);
    setCashTotal(body.total);
    setCashPageCount(body.pageCount);
    setCashPage(body.page);
  }, [portfolioId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!portfolioId) return;
    setLoading(true);
    setError('');
    try {
      const [scanResponse, alertResponse] = await Promise.all([
        fetch(`/api/scan?portfolioId=${portfolioId}`), fetch(`/api/alerts?portfolioId=${portfolioId}`),
      ]);
      const scanBody = await scanResponse.json() as ScanPayload & { error?: string };
      const alertBody = await alertResponse.json() as { alerts: AlertItem[] };
      if (!scanResponse.ok) throw new Error(scanBody.error ?? 'Market scan failed.');
      const performanceResponse = await fetch(`/api/portfolios/${portfolioId}/performance`);
      const performanceBody = await performanceResponse.json() as PerformanceSnapshots;
      setScan(scanBody);
      setAlerts(alertBody.alerts);
      setPerformance(performanceBody);
      setLastScannedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Market scan failed.');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPortfolios(true), 0);
    return () => window.clearTimeout(timer);
  }, [loadPortfolios]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTradePage().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load trades.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTradePage]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCashPage(cashPage).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load cash entries.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cashPage, loadCashPage]);
  useEffect(() => {
    if (!portfolioId) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15 * 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [portfolioId, refresh]);

  async function createPortfolio(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/portfolios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: portfolioInput }) });
      const body = await response.json() as { portfolio?: PortfolioWithHoldings; error?: string };
      if (!response.ok) throw new Error(body.error);
      setPortfolioInput('');
      await loadPortfolios();
      if (body.portfolio) {
        setPortfolioId(body.portfolio.id);
        setTradePage(1);
        setTradeFilter('');
      }
      setPortfolioDialogOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create portfolio.'); }
    finally { setBusy(false); }
  }

  async function deletePortfolio(): Promise<void> {
    if (!portfolioId) return;
    const name = portfolios.find((portfolio) => portfolio.id === portfolioId)?.name ?? 'this portfolio';
    if (!window.confirm(`Delete ${name} and its watchlist?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolios/${portfolioId}`, { method: 'DELETE' });
      await loadPortfolios(true);
      setScan(null);
    } finally { setBusy(false); }
  }

  async function addHolding(symbol: string): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/holdings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error);
      await loadPortfolios();
      await refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add ticker.'); return false; }
    finally { setBusy(false); }
  }

  async function recordPortfolioTrade(trade: PositionLedgerInput): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/trades`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not record this trade.');
      setTradePage(1);
      setTradeFilter('');
      await loadTradePage(1, '');
      await loadPortfolios();
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this trade.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removePortfolioTrade(trade: PortfolioTrade): Promise<void> {
    if (!portfolioId) return;
    const description = `${trade.side} ${trade.quantity} ${trade.symbol} @ ${money.format(trade.price)}`;
    if (!window.confirm(`Delete trade ${description}? Portfolio performance will be recalculated.`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/trades/${trade.id}`, { method: 'DELETE' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not delete this trade.');
      await loadTradePage();
      const performanceResponse = await fetch(`/api/portfolios/${portfolioId}/performance`);
      const performanceBody = await performanceResponse.json() as PerformanceSnapshots;
      if (!performanceResponse.ok) throw new Error('Trade was deleted, but performance could not be refreshed.');
      setPerformance(performanceBody);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this trade.');
    } finally { setBusy(false); }
  }

  async function recordCashEntry(entry: CashLedgerInput): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not record this cash entry.');
      setCashPage(1);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this cash entry.');
      return false;
    } finally { setBusy(false); }
  }

  async function removeCashEntry(entry: PortfolioCashTransaction): Promise<void> {
    if (!portfolioId) return;
    const description = `${entry.type.toLowerCase()} of ${money.format(entry.amount)}`;
    if (!window.confirm(`Delete cash ${description}? Portfolio performance will be recalculated.`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/cash/${entry.id}`, { method: 'DELETE' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not delete this cash entry.');
      await loadCashPage(cashPage);
      const performanceResponse = await fetch(`/api/portfolios/${portfolioId}/performance`);
      const performanceBody = await performanceResponse.json() as PerformanceSnapshots;
      if (!performanceResponse.ok) throw new Error('Cash entry was deleted, but performance could not be refreshed.');
      setPerformance(performanceBody);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this cash entry.');
    } finally { setBusy(false); }
  }

  async function removeHolding(symbol: string): Promise<void> {
    if (!portfolioId) return;
    if (!window.confirm(`Remove ${symbol} from this portfolio?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/holdings?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Could not remove ${symbol}.`);
      await loadPortfolios();
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not remove ${symbol}.`); }
    finally { setBusy(false); }
  }

  async function runSelectedBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/backtest?symbol=${encodeURIComponent(input.symbol)}&strategy=${input.strategy}&days=365`);
      const body = await response.json() as { result?: BacktestResult; error?: string };
      if (!response.ok || !body.result) throw new Error(body.error ?? 'Backtest failed.');
      setBacktest(body.result);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Backtest failed.'); return false; }
    finally { setBusy(false); }
  }

  const currentPortfolio = portfolios.find((portfolio) => portfolio.id === portfolioId);
  const latestHoldingPerformance = new Map<string, HoldingPerformancePoint>();
  const holdingPerformanceHistory = new Map<string, HoldingPerformancePoint[]>();
  for (const point of performance.holdings) {
    latestHoldingPerformance.set(point.symbol, point);
    const history = holdingPerformanceHistory.get(point.symbol) ?? [];
    history.push(point);
    holdingPerformanceHistory.set(point.symbol, history);
  }
  const latestPortfolioPerformance = performance.portfolio.at(-1);
  const selectedPerformanceRange = performanceRanges.find((range) => range.value === performanceRange) ?? performanceRanges[3];
  const latestPerformanceTimestamp = latestPortfolioPerformance?.timestamp ?? 0;
  const performanceCutoff = latestPerformanceTimestamp - selectedPerformanceRange.days * 24 * 60 * 60_000;
  const filteredPortfolioPerformance = performance.portfolio.filter((point) => point.timestamp >= performanceCutoff);

  return <div className="app-shell" id="top">
    <aside className="app-sidebar">
      <a className="sidebar-brand" href="#top"><span className="sidebar-logo">Q</span><span>quantify<span>.</span><small>ASX MARKET WORKSPACE</small></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <a className="nav-item active" href="#overview"><LayoutDashboard/>Overview</a>
        <a className="nav-item" href="#portfolio"><BarChart3/>Portfolio signals</a>
        <a className="nav-item" href="#performance"><Activity/>P&amp;L performance</a>
        <a className="nav-item" href="#ledger"><Wallet/>Trade &amp; cash ledger</a>
        <a className="nav-item" href="#research"><Activity/>Strategy research</a>
      </nav>
      <div className="sidebar-footer"><div className="sidebar-help"><CircleHelp/><span>Decision support only<br/><small>No orders are sent</small></span></div><div className="sidebar-profile"><span className="profile-avatar">A</span><span><strong>admin</strong><small>Local workspace</small></span><Settings2 className="profile-settings"/></div></div>
    </aside>

    <main className="app-main">
      <header className="app-header"><div className="breadcrumb"><span>Workspace</span><ChevronRight/><strong>Overview</strong></div><div className="header-actions"><Badge variant="outline" className="market-badge"><i/>ASX <span>·</span> AUSTRALIA</Badge><span className="header-divider"/><span className="cycle-label">DAILY DECISION CYCLE</span><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || !portfolioId}>{loading ? <LoaderCircle className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}{loading ? 'Scanning…' : 'Refresh data'}</Button></div></header>

      <div className="dashboard-content">
        <section className="page-heading" id="overview"><div><p className="section-kicker">YOUR MARKET, IN FOCUS</p><h1>Good trading starts with <span>good signals.</span></h1><p className="page-subtitle">A considered view of the ASX, refreshed against your portfolio.</p></div>
          <div className="portfolio-picker"><label htmlFor="portfolio-picker">ACTIVE PORTFOLIO</label><SelectControl id="portfolio-picker" value={portfolioId === null ? '' : String(portfolioId)} displayValue={currentPortfolio?.name} ariaLabel="PORTFOLIO" placeholder="Select a portfolio" className="portfolio-select" onValueChange={(value) => { if (value === 'new') setPortfolioDialogOpen(true); else { setPortfolioId(Number(value) || null); setTradePage(1); setTradeFilter(''); } }}>
            {portfolios.map((portfolio) => <SelectOption key={portfolio.id} value={String(portfolio.id)}>{portfolio.name}</SelectOption>)}<SelectOption value="new">＋ New portfolio…</SelectOption>
          </SelectControl><Button variant="ghost" size="icon" className="delete-portfolio" aria-label="Delete portfolio" title="Delete portfolio" disabled={!portfolioId || busy} onClick={() => void deletePortfolio()}><Trash2 className="size-4"/></Button></div>
        </section>
        {error && <div className="notice notice-error" role="alert">{error}</div>}

        <section className="metric-grid" aria-label="Portfolio summary">
          <Card className="metric-card"><CardContent className="metric-content"><div className="metric-icon blue"><Wallet/></div><div className="metric-label">TOTAL PORTFOLIO VALUE</div><strong>{latestPortfolioPerformance ? money.format(latestPortfolioPerformance.totalValue) : '—'}</strong><small>{latestPortfolioPerformance ? 'Cash + holdings at latest hourly close' : 'Record trades and cash entries to track'}</small></CardContent></Card>
          <Card className="metric-card"><CardContent className="metric-content"><div className="metric-icon" data-positive={latestPortfolioPerformance ? latestPortfolioPerformance.profitLoss >= 0 : undefined}>{latestPortfolioPerformance && latestPortfolioPerformance.profitLoss >= 0 ? <ArrowUpRight/> : <ArrowDownRight/>}</div><div className="metric-label">PORTFOLIO PROFIT &amp; LOSS</div><strong className={latestPortfolioPerformance && latestPortfolioPerformance.profitLoss >= 0 ? 'positive' : 'negative'}>{latestPortfolioPerformance ? money.format(latestPortfolioPerformance.profitLoss) : '—'}</strong><small>Realized + unrealized, net brokerage</small></CardContent></Card>
          <Card className="metric-card"><CardContent className="metric-content"><div className="metric-icon violet"><BarChart3/></div><div className="metric-label">WATCHLIST</div><strong>{currentPortfolio?.holdings.length ?? 0}<span className="metric-unit"> assets</span></strong><small>Across {portfolios.length} {portfolios.length === 1 ? 'portfolio' : 'portfolios'}</small></CardContent></Card>
          <Card className="metric-card"><CardContent className="metric-content"><div className="metric-icon amber"><Bell/></div><div className="metric-label">ACTIONABLE SIGNALS</div><strong>{scan?.signals.flatMap((row) => row.daily).filter((signal) => signal.signal !== 'HOLD').length ?? '—'}<span className="metric-unit"> today</span></strong><small>Klinger + RSI · daily candles</small></CardContent></Card>
        </section>

        <section className="overview-grid" id="portfolio">
          <PortfolioSignals hasPortfolio={Boolean(currentPortfolio)} holdings={currentPortfolio?.holdings ?? []} signals={scan?.signals ?? []} warnings={scan?.warnings ?? []} lastScannedAt={lastScannedAt} busy={busy} onAddHolding={addHolding} onRemoveHolding={removeHolding}/>
          <RecentMovements tickers={currentPortfolio?.holdings.slice(0, 4).map(({ symbol }) => symbol) ?? []} timeframe="1H · LAST 48 BARS" signals={scan?.signals ?? []}/>
        </section>

        <section className="performance-section" id="performance">
          <Tabs.Root value={performanceRange} onValueChange={(value) => setPerformanceRange(value as PerformanceRange)} className="performance-tabs">
            <Card className="performance-card"><CardHeader className="performance-header"><div><p className="section-kicker">HOURLY PERFORMANCE</p><CardTitle>Portfolio profit &amp; loss</CardTitle><CardDescription>Track portfolio performance without deposits masking trading returns.</CardDescription></div><Tabs.List className="timeframe-tabs" aria-label="Portfolio P&L timeframe">{performanceRanges.map((range) => <Tabs.Tab key={range.value} value={range.value} className="timeframe-tab">{range.label}</Tabs.Tab>)}</Tabs.List></CardHeader>
              <Tabs.Panel value={performanceRange} className="performance-panel-content"><CardContent className="performance-content">
                <div className="performance-metrics"><div className="performance-total"><small>CASH BALANCE</small><strong>{latestPortfolioPerformance ? money.format(latestPortfolioPerformance.cashBalance) : '—'}</strong></div><div className="performance-total"><small>REALIZED + UNREALIZED · NET BROKERAGE</small><strong className={latestPortfolioPerformance && latestPortfolioPerformance.profitLoss >= 0 ? 'positive' : 'negative'}>{latestPortfolioPerformance ? money.format(latestPortfolioPerformance.profitLoss) : '—'}</strong></div></div>
                <PerformanceChart points={filteredPortfolioPerformance} rangeLabel={selectedPerformanceRange.label}/>
                {filteredPortfolioPerformance.length > 1 && <div className="chart-axis-labels"><span>{dateTime.format(filteredPortfolioPerformance[0].timestamp)}</span><span>{dateTime.format(filteredPortfolioPerformance.at(-1)!.timestamp)}</span></div>}
                <p className="chart-caption">{selectedPerformanceRange.label} · Each point is captured from cached hourly candle closes.</p>
                <div className="holding-performance"><div className="holding-heading"><div><p className="section-kicker">POSITIONS</p><h3>HOLDING PERFORMANCE</h3></div><span>{latestHoldingPerformance.size} assets</span></div>{latestHoldingPerformance.size ? <div className="holding-table-wrap"><div className="holding-performance-head"><span>ASSET</span><span>UNITS</span><span>AVG COST / UNIT</span><span>MARKET VALUE</span><span>P&amp;L</span><span>TREND</span></div>{[...latestHoldingPerformance.values()].sort((left, right) => left.symbol.localeCompare(right.symbol)).map((point) => <div className="holding-performance-row" key={point.symbol}><strong>{point.symbol}</strong><span>{point.quantity}</span><span>{money.format(point.averageUnitPrice)}</span><span>{money.format(point.marketValue)}</span><strong className={point.profitLoss >= 0 ? 'positive' : 'negative'}>{money.format(point.profitLoss)}</strong><HoldingPulseChart symbol={point.symbol} points={(holdingPerformanceHistory.get(point.symbol) ?? []).filter((historyPoint) => historyPoint.timestamp >= performanceCutoff)}/></div>)}</div> : <div className="chart-empty">Add a trade to see per-holding P&amp;L.</div>}</div>
              </CardContent></Tabs.Panel>
            </Card>
          </Tabs.Root>
        </section>

        <section className="ledger-grid" id="ledger">
          <PositionLedger portfolioId={portfolioId} symbols={currentPortfolio?.holdings.map(({ symbol }) => symbol) ?? []} trades={trades} tickers={tradeTickers} filter={tradeFilter} page={tradePage} pageCount={tradePageCount} total={tradeTotal} busy={busy} onSubmit={recordPortfolioTrade} onDelete={removePortfolioTrade} onFilterChange={(symbol) => { setTradeFilter(symbol); setTradePage(1); }} onPageChange={setTradePage}/>
          <CashLedger portfolioId={portfolioId} transactions={cashTransactions} page={cashPage} pageCount={cashPageCount} total={cashTotal} busy={busy} onSubmit={recordCashEntry} onDelete={removeCashEntry} onPageChange={setCashPage}/>
        </section>

        <section className="activity-section">
          <Card className="alerts-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">ACTIVITY</p><CardTitle>Signal history</CardTitle></div><Badge variant="outline">{alerts.length} RECORDED</Badge></CardHeader><CardContent>{alerts.length ? <div className="alert-list">{alerts.slice(0, 8).map((alert) => <div className="alert-row" key={alert.id}><span className={`alert-dot ${alert.signal.toLowerCase()}`}/><div className="alert-main"><div><strong>{alert.symbol.replace('.AX', '')}</strong><Badge variant="outline" className="alert-strategy">{alert.strategyId === 'rsi-14' ? 'RSI (14)' : 'Klinger'}</Badge></div><small>{alert.rationale}</small></div><div className="alert-right"><SignalPill signal={alert.signal as SignalResult['signal']} compact/><small>{dateTime.format(alert.timestamp)}</small></div></div>)}</div> : <div className="empty-activity"><span className="activity-icon"><Bell/></span><strong>No actionable signals yet</strong><p>When Klinger or RSI crosses its trigger, the event will be recorded here.</p></div>}</CardContent></Card>
        </section>

        <StrategyResearch result={backtest} busy={busy} onRun={runSelectedBacktest}/>
        <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span><span>Local only · Candles stored on this device</span></footer>
      </div>
    </main>

    <DialogRoot open={portfolioDialogOpen} onOpenChange={setPortfolioDialogOpen}><DialogContent aria-label="Create a portfolio" className="portfolio-dialog"><p className="section-kicker">PORTFOLIO SETUP</p><DialogTitle className="dialog-title">Create a portfolio</DialogTitle><DialogDescription className="panel-description">Give this portfolio a name. You can add assets after creating it.</DialogDescription><form className="portfolio-dialog-form" onSubmit={(event) => void createPortfolio(event)}><label htmlFor="new-portfolio-name">PORTFOLIO NAME</label><Input id="new-portfolio-name" aria-label="New portfolio name" autoFocus placeholder="e.g. Long-term investments" value={portfolioInput} onChange={(event) => setPortfolioInput(event.target.value)} maxLength={60} required/><div className="dialog-actions"><DialogClose render={<Button variant="outline" disabled={busy}/>}>Cancel</DialogClose><Button type="submit" disabled={busy || !portfolioInput.trim()}>{busy ? 'Creating…' : 'Create portfolio'}</Button></div></form></DialogContent></DialogRoot>
  </div>;
}
