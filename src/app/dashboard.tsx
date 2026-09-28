'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BacktestResult, Candle, Portfolio, PortfolioHolding, SignalResult } from '@/core/types';

interface PortfolioWithHoldings extends Portfolio { holdings: PortfolioHolding[] }
interface ScannedSymbol { daily: SignalResult[]; hourly: SignalResult[]; dailyCandles: Candle[]; hourlyCandles: Candle[] }
interface ScanPayload { signals: ScannedSymbol[]; warnings: string[] }
interface AlertItem extends SignalResult { id: number; portfolioId: number }
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

function LineChart({ candles }: { candles: Candle[] }) {
  const points = useMemo(() => {
    const closes = candles.map((candle) => candle.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    return closes.map((close, index) => `${(index / Math.max(closes.length - 1, 1)) * 600},${100 - ((close - min) / (max - min || 1)) * 84}`).join(' ');
  }, [candles]);
  if (candles.length < 2) return <div className="chart-empty">Chart will appear when candle history is available.</div>;
  return <svg className="price-chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label="Recent price history"><defs><linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity=".22"/><stop offset="100%" stopColor="#60a5fa" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 600,100`} fill="url(#price-fill)"/><polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>;
}

export default function Dashboard() {
  const [portfolios, setPortfolios] = useState<PortfolioWithHoldings[]>([]);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [symbolInput, setSymbolInput] = useState('');
  const [portfolioInput, setPortfolioInput] = useState('');
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestSymbol, setBacktestSymbol] = useState('MQG.AX');
  const [backtestStrategy, setBacktestStrategy] = useState('klinger-oscillator');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);

  const loadPortfolios = useCallback(async (selectFirst = false): Promise<void> => {
    const response = await fetch('/api/portfolios');
    const body = await response.json() as { portfolios: PortfolioWithHoldings[] };
    setPortfolios(body.portfolios);
    if (selectFirst) setPortfolioId(body.portfolios[0]?.id ?? null);
  }, []);

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
      setScan(scanBody);
      setAlerts(alertBody.alerts);
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
      if (body.portfolio) setPortfolioId(body.portfolio.id);
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

  async function addHolding(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!portfolioId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/holdings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: symbolInput }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error);
      setSymbolInput('');
      await loadPortfolios();
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add ticker.'); }
    finally { setBusy(false); }
  }

  async function removeHolding(symbol: string): Promise<void> {
    if (!portfolioId) return;
    await fetch(`/api/portfolios/${portfolioId}/holdings?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    await loadPortfolios();
    await refresh();
  }

  async function runSelectedBacktest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/backtest?symbol=${encodeURIComponent(backtestSymbol)}&strategy=${backtestStrategy}&days=365`);
      const body = await response.json() as { result?: BacktestResult; error?: string };
      if (!response.ok || !body.result) throw new Error(body.error ?? 'Backtest failed.');
      setBacktest(body.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Backtest failed.'); }
    finally { setBusy(false); }
  }

  const currentPortfolio = portfolios.find((portfolio) => portfolio.id === portfolioId);
  const scanned = new Map(scan?.signals.map((row) => [row.daily[0]?.symbol ?? row.daily[1]?.symbol ?? '', row]) ?? []);

  return <main className="dashboard-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">Q</span><span>quantify<span className="brand-dot">.</span><small>MARKET INTELLIGENCE</small></span></a><div className="market-status"><span className="status-light"/> ASX · AUSTRALIA <span className="topbar-divider"/> DAILY DECISION CYCLE</div><div className="user-pill"><span className="avatar">A</span> admin</div></header>
    <div className="page-content" id="top">
      <section className="welcome-row"><div><div className="eyebrow">YOUR MARKET, IN FOCUS</div><h1>Good trading starts with <span>good signals.</span></h1><p className="subhead">A considered view of the ASX, refreshed against your portfolio.</p></div><button className="button button-quiet" onClick={() => void refresh()} disabled={loading || !portfolioId}><span className={loading ? 'spinner' : 'refresh-icon'}>↻</span>{loading ? 'Scanning market…' : 'Refresh signals'}</button></section>
      {error && <div className="notice notice-error">{error}</div>}
      <section className="summary-strip"><div><span className="summary-label">PORTFOLIO VALUE</span><strong>—</strong><small>Position tracking not configured</small></div><div><span className="summary-label">WATCHLIST</span><strong>{currentPortfolio?.holdings.length ?? 0}<span className="summary-unit"> assets</span></strong><small>Across {portfolios.length} {portfolios.length === 1 ? 'portfolio' : 'portfolios'}</small></div><div><span className="summary-label">ACTIONABLE SIGNALS</span><strong>{scan?.signals.flatMap((row) => row.daily).filter((signal) => signal.signal !== 'HOLD').length ?? '—'}<span className="summary-unit"> today</span></strong><small>Klinger + RSI · daily candles</small></div><div><span className="summary-label">DATA SOURCE</span><strong className="source-state">Yahoo Finance</strong><small>{loading ? 'Updating cached candles…' : 'Local candle cache enabled'}</small></div></section>
      <div className="main-grid">
        <section className="panel signals-panel"><div className="panel-heading"><div><div className="eyebrow">SIGNAL MONITOR</div><h2>Portfolio signals</h2></div><span className="live-tag"><i/> LIVE MONITOR</span></div>
          <div className="portfolio-bar"><label className="field-label" htmlFor="portfolio-select">PORTFOLIO</label><select id="portfolio-select" value={portfolioId ?? ''} onChange={(event) => setPortfolioId(Number(event.target.value) || null)}><option value="" disabled>Select a portfolio</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select><button className="text-button danger-text" disabled={!portfolioId || busy} onClick={() => void deletePortfolio()}>Delete</button></div>
          {currentPortfolio && <div className="holdings-chips">{currentPortfolio.holdings.map((holding) => <button key={holding.symbol} className="holding-chip" title={`Remove ${holding.symbol}`} onClick={() => void removeHolding(holding.symbol)}>{holding.symbol}<span>×</span></button>)}</div>}
          {currentPortfolio && <form className="inline-form" onSubmit={(event) => void addHolding(event)}><input aria-label="ASX ticker" placeholder="Add ticker e.g. CSL or CSL.AX" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} maxLength={20}/><button className="button button-outline" disabled={busy || !symbolInput.trim()}>Add asset</button></form>}
          <form className="create-form" onSubmit={(event) => void createPortfolio(event)}><input aria-label="New portfolio name" placeholder="New portfolio name" value={portfolioInput} onChange={(event) => setPortfolioInput(event.target.value)} maxLength={60}/><button className="text-button" disabled={busy || !portfolioInput.trim()}>＋ New portfolio</button></form>
          <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>LAST PRICE</th><th>DAILY KVO</th><th>DAILY RSI</th><th>HOURLY CONTEXT</th></tr></thead><tbody>{currentPortfolio?.holdings.map((holding) => {
            const row = scanned.get(holding.symbol);
            const klinger = row?.daily.find((item) => item.strategyId === 'klinger-oscillator');
            const rsi = row?.daily.find((item) => item.strategyId === 'rsi-14');
            const hour = row?.hourly.find((item) => item.strategyId === 'klinger-oscillator');
            return <tr key={holding.symbol}><td><span className="asset-symbol">{holding.symbol.replace('.AX', '')}</span><small className="asset-exchange">ASX</small></td><td className="price-cell">{klinger?.price ? money.format(klinger.price) : '—'}</td><td><SignalPill signal={klinger?.signal ?? 'HOLD'} /></td><td><SignalPill signal={rsi?.signal ?? 'HOLD'} detail={rsi?.indicators.rsi != null ? `RSI ${rsi.indicators.rsi.toFixed(0)}` : undefined}/></td><td><SignalPill signal={hour?.signal ?? 'HOLD'} compact/></td></tr>;
          })}{currentPortfolio?.holdings.length === 0 && <tr><td colSpan={5} className="empty-row">Add tickers above to start monitoring this portfolio.</td></tr>}{!currentPortfolio && <tr><td colSpan={5} className="empty-row">Create a portfolio to begin your market scan.</td></tr>}</tbody></table></div>
          {scan?.warnings.map((warning) => <div className="notice notice-warning" key={warning}>{warning}</div>)}<div className="panel-footnote">Signals describe indicator conditions and are decision support, not trade instructions. Last checked: {lastScannedAt ? dateTime.format(lastScannedAt) : 'not yet scanned'}.</div>
        </section>
        <aside className="panel watch-panel"><div className="panel-heading"><div><div className="eyebrow">PRICE CONTEXT</div><h2>Recent movement</h2></div><span className="timeframe-tag">1H · LAST 48 BARS</span></div>{currentPortfolio?.holdings.slice(0, 4).map((holding) => { const row = scanned.get(holding.symbol); const latest = row?.hourlyCandles.at(-1); return <div className="watch-row" key={holding.symbol}><div className="watch-meta"><span className="asset-symbol">{holding.symbol.replace('.AX', '')}</span><small>{latest ? money.format(latest.close) : 'Waiting for data'}</small></div><LineChart candles={row?.hourlyCandles ?? []}/></div>; })}{!currentPortfolio?.holdings.length && <div className="chart-empty">Add assets to see hourly price context.</div>}<div className="chart-caption">Hourly candles add context to the daily signal.</div></aside>
      </div>
      <div className="lower-grid"><section className="panel alerts-panel"><div className="panel-heading"><div><div className="eyebrow">ACTIVITY</div><h2>Signal history</h2></div><span className="count-tag">{alerts.length} RECORDED</span></div>{alerts.length ? <div className="alert-list">{alerts.slice(0, 8).map((alert) => <div className="alert-row" key={alert.id}><span className={`alert-dot ${alert.signal.toLowerCase()}`}/><div className="alert-main"><div><strong>{alert.symbol.replace('.AX', '')}</strong><span className="alert-strategy">{alert.strategyId === 'rsi-14' ? 'RSI (14)' : 'Klinger'}</span></div><small>{alert.rationale}</small></div><div className="alert-right"><SignalPill signal={alert.signal as SignalResult['signal']} compact/><small>{dateTime.format(alert.timestamp)}</small></div></div>)}</div> : <div className="empty-activity"><span className="activity-icon">⌁</span><strong>No actionable signals yet</strong><p>When Klinger or RSI crosses its trigger, the event will be recorded here.</p></div>}</section>
        <section className="panel backtest-panel"><div className="eyebrow">STRATEGY RESEARCH</div><h2>Test a hypothesis</h2><p className="panel-description">Compare strategies against the same cached daily history.</p><form className="backtest-form" onSubmit={(event) => void runSelectedBacktest(event)}><input aria-label="Ticker for backtest" value={backtestSymbol} onChange={(event) => setBacktestSymbol(event.target.value.toUpperCase())}/><select aria-label="Backtest strategy" value={backtestStrategy} onChange={(event) => setBacktestStrategy(event.target.value)}><option value="klinger-oscillator">Klinger</option><option value="rsi-14">RSI (14)</option></select><button className="button button-primary" disabled={busy}>{busy ? 'Working…' : 'Run backtest'}</button></form>{backtest && <><div className="backtest-result-label">LAST RUN · {backtest.strategyId === 'rsi-14' ? 'RSI (14)' : 'Klinger'}</div><div className="backtest-results"><div><small>1Y RETURN</small><strong className={backtest.totalReturnPct >= 0 ? 'positive' : 'negative'}>{backtest.totalReturnPct.toFixed(1)}%</strong></div><div><small>WIN RATE</small><strong>{backtest.winRatePct.toFixed(0)}%</strong></div><div><small>MAX DRAWDOWN</small><strong className="negative">{backtest.maxDrawdownPct.toFixed(1)}%</strong></div><div><small>CLOSED TRADES</small><strong>{backtest.trades.length}</strong></div></div></>}<div className="method-note">{backtestStrategy === 'rsi-14' ? 'BUY when RSI re-enters above 30. SELL when RSI re-enters below 70.' : 'BUY on KVO crossover above its signal line. SELL on crossover below.'} Next-candle open execution; no fees or slippage.</div></section></div>
      <footer className="page-footer"><span>QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE</span><span>Local only · Candles stored on this device</span></footer>
    </div>
  </main>;
}

function SignalPill({ signal, detail, compact = false }: { signal: SignalResult['signal']; detail?: string; compact?: boolean }) {
  return <span className={`signal-pill ${signal.toLowerCase()} ${compact ? 'compact' : ''}`}><i/>{compact ? signal : signal}{detail && <small>{detail}</small>}</span>;
}
