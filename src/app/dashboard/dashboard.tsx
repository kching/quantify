"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CircleX,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import type {
  PerformanceSnapshots,
  Portfolio,
  PortfolioCashTransaction,
  PortfolioHolding,
  PortfolioTrade,
  SignalResult,
  UserProfile,
} from "@/core/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectControl, SelectOption } from "@/components/ui/select";
import CashLedger, { type CashLedgerInput } from "@/components/CashLedger";
import PositionLedger, {
  type PositionLedgerInput,
} from "@/components/PositionLedger";
import PortfolioSignals, { SignalPill } from "@/components/PortfolioSignals";
import type { PortfolioSignalRow } from "@/components/PortfolioSignals";
import RecentMovements from "@/components/RecentMovements";
import PortfolioPerformance, {
  type PerformanceRange,
} from "@/components/PortfolioPerformance";
import AppSidebar from "@/components/AppSidebar";
import { ToastProvider, useToast } from "@/components/ui/toast";

type ConnectionStatus = "connecting" | "connected" | "disconnected";
interface PortfolioWithHoldings extends Portfolio {
  holdings: PortfolioHolding[];
}
interface ScanPayload {
  signals: PortfolioSignalRow[];
  warnings: string[];
}
interface AlertItem extends SignalResult {
  id: number;
  portfolioId: number;
}
interface TradesPayload {
  trades: PortfolioTrade[];
  tickers?: string[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
interface CashPayload {
  transactions: PortfolioCashTransaction[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
const emptyPerformance: PerformanceSnapshots = { holdings: [], portfolio: [] };
const strategyLabels: Record<string, string> = {
  "klinger-oscillator": "Klinger",
  rsi: "RSI (14)",
  supertrend: "Supertrend",
  "bollinger-rsi": "Bollinger Bands + RSI",
  "bollinger-macd": "Bollinger Bands + MACD",
  "donchian-breakout": "Donchian Breakout",
  "relative-strength-momentum": "Relative Strength Momentum",
};
const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function wholeDollarMoney(value: number): string {
  return money.format(Math.floor(value));
}
const dateTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
});

function DashboardContent({
  user,
}: {
  user?: Pick<UserProfile, "name" | "image">;
}): React.JSX.Element {
  const [portfolios, setPortfolios] = useState<PortfolioWithHoldings[]>([]);
  const [portfoliosLoaded, setPortfoliosLoaded] = useState(false);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [watchlistPage, setWatchlistPage] = useState(1);
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [tradeTickers, setTradeTickers] = useState<string[]>([]);
  const [tradeFilter, setTradeFilter] = useState("");
  const [tradePage, setTradePage] = useState(1);
  const [tradePageCount, setTradePageCount] = useState(0);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [cashTransactions, setCashTransactions] = useState<
    PortfolioCashTransaction[]
  >([]);
  const [cashPage, setCashPage] = useState(1);
  const [cashPageCount, setCashPageCount] = useState(0);
  const [cashTotal, setCashTotal] = useState(0);
  const [performance, setPerformance] =
    useState<PerformanceSnapshots>(emptyPerformance);
  const [performanceRange, setPerformanceRange] =
    useState<PerformanceRange>("1m");
  const [portfolioInput, setPortfolioInput] = useState("");
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const reportError = useCallback((cause: unknown, fallback: string): void => {
    toastRef.current(
      cause instanceof Error ? cause.message : fallback,
      "error",
    );
  }, []);
  const loadPortfolios = useCallback(
    async (selectFirst = false): Promise<void> => {
      const response = await fetch("/api/portfolios");
      const body = (await response.json()) as {
        portfolios: PortfolioWithHoldings[];
      };
      setPortfolios(body.portfolios);
      setPortfoliosLoaded(true);
      if (selectFirst) {
        setPortfolioId(body.portfolios[0]?.id ?? null);
        setWatchlistPage(1);
        setPerformance(emptyPerformance);
        setScan(null);
        setAlerts([]);
        setLastScannedAt(null);
        setTradePage(1);
        setTradeFilter("");
        setCashPage(1);
      }
    },
    [],
  );

  const loadTradePage = useCallback(
    async (
      requestedPage = tradePage,
      requestedFilter = tradeFilter,
    ): Promise<void> => {
      if (!portfolioId) {
        setTrades([]);
        setTradeTickers([]);
        setTradePageCount(0);
        setTradeTotal(0);
        return;
      }
      const params = new URLSearchParams({ page: String(requestedPage) });
      if (requestedFilter) params.set("symbol", requestedFilter);
      const response = await fetch(
        `/api/portfolios/${portfolioId}/trades?${params.toString()}`,
      );
      const body = (await response.json()) as TradesPayload & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not load trades.");
      setTrades(body.trades);
      setTradeTickers(Array.isArray(body.tickers) ? body.tickers : []);
      setTradeTotal(body.total);
      setTradePageCount(body.pageCount);
      setTradePage(body.page);
    },
    [portfolioId, tradeFilter, tradePage],
  );

  const loadCashPage = useCallback(
    async (requestedPage: number): Promise<void> => {
      if (!portfolioId) {
        setCashTransactions([]);
        setCashPageCount(0);
        setCashTotal(0);
        return;
      }
      const response = await fetch(
        `/api/portfolios/${portfolioId}/cash?page=${requestedPage}`,
      );
      const body = (await response.json()) as CashPayload & { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not load cash entries.");
      setCashTransactions(body.transactions);
      setCashTotal(body.total);
      setCashPageCount(body.pageCount);
      setCashPage(body.page);
    },
    [portfolioId],
  );

  const refresh = useCallback(async (): Promise<ScanPayload | null> => {
    if (!portfolioId) return null;
    setLoading(true);
    try {
      const [scanResponse, alertResponse] = await Promise.all([
        fetch(`/api/scan?portfolioId=${portfolioId}`),
        fetch(`/api/alerts?portfolioId=${portfolioId}`),
      ]);
      const scanBody = (await scanResponse.json()) as ScanPayload & {
        error?: string;
      };
      const alertBody = (await alertResponse.json()) as { alerts: AlertItem[] };
      if (!scanResponse.ok)
        throw new Error(scanBody.error ?? "Market scan failed.");
      const performanceResponse = await fetch(
        `/api/portfolios/${portfolioId}/performance`,
        { cache: "no-store" },
      );
      const performanceBody =
        (await performanceResponse.json()) as PerformanceSnapshots;
      setScan(scanBody);
      setAlerts(alertBody.alerts);
      setPerformance(performanceBody);
      setLastScannedAt(Date.now());
      return scanBody;
    } catch (cause) {
      reportError(cause, "Market scan failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [portfolioId, reportError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPortfolios(true), 0);
    return () => window.clearTimeout(timer);
  }, [loadPortfolios]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTradePage().catch((cause: unknown) =>
        reportError(cause, "Could not load trades."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTradePage, reportError]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCashPage(cashPage).catch((cause: unknown) =>
        reportError(cause, "Could not load cash entries."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cashPage, loadCashPage, reportError]);
  useEffect(() => {
    if (!portfolioId) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15 * 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [portfolioId, refresh]);
  useEffect(() => {
    if (typeof window.EventSource === "undefined") {
      const timer = window.setTimeout(
        () => setConnectionStatus("disconnected"),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    const eventSource = new EventSource("/api/market-updates");
    eventSource.onopen = () => setConnectionStatus("connected");
    eventSource.onerror = () => setConnectionStatus("disconnected");
    eventSource.onmessage = () => {
      void refresh();
    };
    return () => eventSource.close();
  }, [refresh]);

  async function createPortfolio(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: portfolioInput }),
      });
      const body = (await response.json()) as {
        portfolio?: PortfolioWithHoldings;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Could not create portfolio.");
      setPortfolioInput("");
      await loadPortfolios();
      if (body.portfolio) {
        setPortfolioId(body.portfolio.id);
        setPerformance(emptyPerformance);
        setScan(null);
        setAlerts([]);
        setLastScannedAt(null);
        setTradePage(1);
        setTradeFilter("");
      }
      setPortfolioDialogOpen(false);
    } catch (cause) {
      reportError(cause, "Could not create portfolio.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePortfolio(): Promise<void> {
    if (!portfolioId) return;
    const name =
      portfolios.find((portfolio) => portfolio.id === portfolioId)?.name ??
      "this portfolio";
    if (!window.confirm(`Delete ${name} and its watchlist?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolios/${portfolioId}`, { method: "DELETE" });
      await loadPortfolios(true);
      setScan(null);
    } finally {
      setBusy(false);
    }
  }

  async function addHolding(symbol: string): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/holdings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status === 404) {
          toast(body.error ?? "Ticker not found.", "error");
          return false;
        }
        throw new Error(body.error ?? "Could not add ticker.");
      }
      await loadPortfolios();
      const scanResult = await refresh();
      const normalizedSymbol = symbol.trim().toUpperCase();
      const yahooWarning = scanResult?.warnings.find((warning) =>
        warning.startsWith(`${normalizedSymbol} `),
      );
      if (yahooWarning) {
        const removeResponse = await fetch(
          `/api/portfolios/${portfolioId}/holdings?symbol=${encodeURIComponent(normalizedSymbol)}`,
          { method: "DELETE" },
        );
        if (!removeResponse.ok)
          throw new Error(
            "Yahoo Finance could not load this ticker, and it could not be removed automatically.",
          );
        await loadPortfolios();
        setScan(null);
        toast(
          `${yahooWarning} The ticker was removed from this portfolio.`,
          "error",
        );
        return false;
      }
      return true;
    } catch (cause) {
      reportError(cause, "Could not add ticker.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recordPortfolioTrade(
    trade: PositionLedgerInput,
  ): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not record this trade.");
      setTradePage(1);
      setTradeFilter("");
      await loadTradePage(1, "");
      await loadPortfolios();
      await refresh();
      return true;
    } catch (cause) {
      reportError(cause, "Could not record this trade.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removePortfolioTrade(trade: PortfolioTrade): Promise<void> {
    if (!portfolioId) return;
    const description = `${trade.side} ${trade.quantity} ${trade.symbol} @ ${money.format(trade.price)}`;
    if (
      !window.confirm(
        `Delete trade ${description}? Portfolio performance will be recalculated.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/trades/${trade.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not delete this trade.");
      await loadTradePage();
      const performanceResponse = await fetch(
        `/api/portfolios/${portfolioId}/performance`,
        { cache: "no-store" },
      );
      const performanceBody =
        (await performanceResponse.json()) as PerformanceSnapshots;
      if (!performanceResponse.ok)
        throw new Error(
          "Trade was deleted, but performance could not be refreshed.",
        );
      setPerformance(performanceBody);
    } catch (cause) {
      reportError(cause, "Could not delete this trade.");
    } finally {
      setBusy(false);
    }
  }

  async function recordCashEntry(entry: CashLedgerInput): Promise<boolean> {
    if (!portfolioId) return false;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not record this cash entry.");
      setCashPage(1);
      await loadCashPage(1);
      await refresh();
      return true;
    } catch (cause) {
      reportError(cause, "Could not record this cash entry.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeCashEntry(
    entry: PortfolioCashTransaction,
  ): Promise<void> {
    if (!portfolioId) return;
    const description = `${entry.type.toLowerCase()} of ${money.format(entry.amount)}`;
    if (
      !window.confirm(
        `Delete cash ${description}? Portfolio performance will be recalculated.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/cash/${entry.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not delete this cash entry.");
      await loadCashPage(cashPage);
      const performanceResponse = await fetch(
        `/api/portfolios/${portfolioId}/performance`,
        { cache: "no-store" },
      );
      const performanceBody =
        (await performanceResponse.json()) as PerformanceSnapshots;
      if (!performanceResponse.ok)
        throw new Error(
          "Cash entry was deleted, but performance could not be refreshed.",
        );
      setPerformance(performanceBody);
    } catch (cause) {
      reportError(cause, "Could not delete this cash entry.");
    } finally {
      setBusy(false);
    }
  }

  async function removeHolding(symbol: string): Promise<void> {
    if (!portfolioId) return;
    if (!window.confirm(`Remove ${symbol} from this portfolio?`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/holdings?symbol=${encodeURIComponent(symbol)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? `Could not remove ${symbol}.`);
      await loadPortfolios();
      await refresh();
    } catch (cause) {
      reportError(cause, `Could not remove ${symbol}.`);
    } finally {
      setBusy(false);
    }
  }

  async function removeSignal(symbol: string, signalId: number): Promise<void> {
    if (!portfolioId) return;
    if (!window.confirm(`Delete the signal from ${symbol}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/strategies/${encodeURIComponent(symbol)}?id=${signalId}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not delete signal.");
      await refresh();
    } catch (cause) {
      reportError(cause, "Could not delete signal.");
    } finally {
      setBusy(false);
    }
  }

  async function dismissAlert(alertId: number): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not dismiss signal.");
      setAlerts((current) => current.filter((alert) => alert.id !== alertId));
    } catch (cause) {
      reportError(cause, "Could not dismiss signal.");
    } finally {
      setBusy(false);
    }
  }

  const currentPortfolio = portfolios.find(
    (portfolio) => portfolio.id === portfolioId,
  );
  const latestPortfolioPerformance = performance.portfolio.at(-1);
  const watchlistPageSize = 6;
  const watchlistTotal = currentPortfolio?.holdings.length ?? 0;
  const watchlistPageCount = Math.max(
    1,
    Math.ceil(watchlistTotal / watchlistPageSize),
  );
  const activeWatchlistPage = Math.min(watchlistPage, watchlistPageCount);
  const visibleWatchlistHoldings =
    currentPortfolio?.holdings.slice(
      (activeWatchlistPage - 1) * watchlistPageSize,
      activeWatchlistPage * watchlistPageSize,
    ) ?? [];

  return (
    <div className="app-shell" id="top">
      {portfoliosLoaded && (
        <AppSidebar
          page="dashboard"
          hasPortfolio={portfolios.length > 0}
          user={user}
          navItems={[
            {
              id: "overview",
              label: "Overview",
              icon: "layout-dashboard",
              href: "/dashboard#overview",
            },
            {
              id: "watchlist",
              label: "Watchlist",
              icon: "list-checks",
              href: "/dashboard#watchlist",
            },
            {
              id: "portfolio",
              label: "Portfolio",
              icon: "bar-chart-3",
              href: "/dashboard#portfolio",
            },
            {
              id: "ledger",
              label: "Ledger",
              icon: "wallet",
              href: "/dashboard#ledger",
            },
            {
              id: "research",
              label: "Strategies",
              icon: "flask-conical",
              href: "/research",
            },
          ]}
        />
      )}

      <main className="app-main">
        {portfoliosLoaded && (
          <header className="app-header">
            <div />
            <div className="header-actions">
              <span
                className={`connection-status connection-status-${connectionStatus}`}
                role="status"
                aria-live="polite"
              >
                <i aria-hidden="true" />
                {connectionStatus === "connected"
                  ? "Connected"
                  : connectionStatus === "connecting"
                    ? "Connecting"
                    : "Disconnected"}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="refresh-button rounded-full"
                onClick={() => void refresh()}
                disabled={loading || !portfolioId}
                aria-label={loading ? "Scanning…" : "Refresh data"}
                title={loading ? "Scanning…" : "Refresh data"}
              >
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </div>
          </header>
        )}

        <div className="dashboard-content">
          {!portfoliosLoaded ? (
            <div
              className="portfolio-loading"
              role="status"
              aria-label="Loading portfolios"
            >
              <div className="loading-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : !portfolios.length ? (
            <section className="welcome-panel" aria-labelledby="welcome-title">
              <div className="welcome-panel-content">
                <p className="section-kicker">WELCOME TO QUANTIFY</p>
                <h1 id="welcome-title">
                  Start by creating your first portfolio.
                </h1>
                <p>What would you like to call it?</p>
                <form
                  className="welcome-form"
                  aria-label="Create your first portfolio"
                  onSubmit={(event) => void createPortfolio(event)}
                >
                  <label htmlFor="welcome-portfolio-name">PORTFOLIO NAME</label>
                  <div className="welcome-form-controls">
                    <Input
                      id="welcome-portfolio-name"
                      aria-label="Portfolio name"
                      placeholder="e.g. Long-term investments"
                      value={portfolioInput}
                      onChange={(event) =>
                        setPortfolioInput(event.target.value)
                      }
                      maxLength={60}
                      required
                    />
                    <Button
                      type="submit"
                      disabled={busy || !portfolioInput.trim()}
                    >
                      {busy ? "Creating…" : "Create portfolio"}
                    </Button>
                  </div>
                </form>
              </div>
            </section>
          ) : (
            <>
              <section className="page-heading" id="overview">
                <div>
                  <p className="section-kicker">YOUR MARKET, IN FOCUS</p>
                  <h1>
                    Good trading starts with <span>good signals.</span>
                  </h1>
                  <p className="page-subtitle">
                    A considered view of the market, refreshed against your
                    portfolio.
                  </p>
                </div>
                <div className="portfolio-picker">
                  <label htmlFor="portfolio-picker">ACTIVE PORTFOLIO</label>
                  <SelectControl
                    id="portfolio-picker"
                    value={portfolioId === null ? "" : String(portfolioId)}
                    displayValue={currentPortfolio?.name}
                    ariaLabel="PORTFOLIO"
                    placeholder="Select a portfolio"
                    className="portfolio-select"
                    onValueChange={(value) => {
                      if (value === "new") setPortfolioDialogOpen(true);
                      else {
                        setPortfolioId(Number(value) || null);
                        setWatchlistPage(1);
                        setPerformance(emptyPerformance);
                        setScan(null);
                        setAlerts([]);
                        setLastScannedAt(null);
                        setTradePage(1);
                        setTradeFilter("");
                      }
                    }}
                  >
                    {portfolios.map((portfolio) => (
                      <SelectOption
                        key={portfolio.id}
                        value={String(portfolio.id)}
                      >
                        {portfolio.name}
                      </SelectOption>
                    ))}
                    <SelectOption value="new">＋ New portfolio…</SelectOption>
                  </SelectControl>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="delete-portfolio"
                    aria-label="Delete portfolio"
                    title="Delete portfolio"
                    disabled={!portfolioId || busy}
                    onClick={() => void deletePortfolio()}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </section>
              <section className="metric-grid" aria-label="Portfolio summary">
                <Card className="metric-card">
                  <CardContent className="metric-content">
                    <div className="metric-heading">
                      <div className="metric-icon blue">
                        <Wallet />
                      </div>
                      <div className="metric-label">PORTFOLIO</div>
                    </div>
                    <strong>
                      {latestPortfolioPerformance
                        ? wholeDollarMoney(
                            latestPortfolioPerformance.totalValue,
                          )
                        : "—"}
                    </strong>
                    <div className="metric-breakdown">
                      <small>
                        Holding value:{" "}
                        {latestPortfolioPerformance
                          ? wholeDollarMoney(
                              latestPortfolioPerformance.marketValue,
                            )
                          : "—"}
                      </small>
                      <small>
                        Cash value:{" "}
                        {latestPortfolioPerformance
                          ? wholeDollarMoney(
                              latestPortfolioPerformance.cashBalance,
                            )
                          : "—"}
                      </small>
                    </div>
                  </CardContent>
                </Card>
                <Card className="metric-card">
                  <CardContent className="metric-content">
                    <div className="metric-heading">
                      <div
                        className="metric-icon"
                        data-positive={
                          latestPortfolioPerformance
                            ? latestPortfolioPerformance.profitLoss >= 0
                            : undefined
                        }
                      >
                        {latestPortfolioPerformance &&
                        latestPortfolioPerformance.profitLoss >= 0 ? (
                          <ArrowUpRight />
                        ) : (
                          <ArrowDownRight />
                        )}
                      </div>
                      <div className="metric-label">PROFIT &amp; LOSS</div>
                    </div>
                    <strong
                      className={
                        latestPortfolioPerformance &&
                        latestPortfolioPerformance.profitLoss >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {latestPortfolioPerformance
                        ? money.format(latestPortfolioPerformance.profitLoss)
                        : "—"}
                    </strong>
                    <small>Realized + unrealized, net brokerage</small>
                  </CardContent>
                </Card>
                <Card className="metric-card">
                  <CardContent className="metric-content">
                    <div className="metric-heading">
                      <div className="metric-icon violet">
                        <BarChart3 />
                      </div>
                      <div className="metric-label">WATCHLIST</div>
                    </div>
                    <strong>
                      {currentPortfolio?.holdings.length ?? 0}
                      <span className="metric-unit"> assets</span>
                    </strong>
                    <small>
                      Across {portfolios.length}{" "}
                      {portfolios.length === 1 ? "portfolio" : "portfolios"}
                    </small>
                  </CardContent>
                </Card>
                <Card className="metric-card">
                  <CardContent className="metric-content">
                    <div className="metric-heading">
                      <div className="metric-icon amber">
                        <Bell />
                      </div>
                      <div className="metric-label">SIGNALS</div>
                    </div>
                    <strong>
                      {scan?.signals
                        .flatMap((row) => row.daily)
                        .filter((signal) => signal.signal !== "HOLD").length ??
                        "—"}
                      <span className="metric-unit"> today</span>
                    </strong>
                  </CardContent>
                </Card>
              </section>

              <section className="overview-grid" id="watchlist">
                <PortfolioSignals
                  hasPortfolio={Boolean(currentPortfolio)}
                  holdings={visibleWatchlistHoldings}
                  totalHoldings={watchlistTotal}
                  page={activeWatchlistPage}
                  pageCount={watchlistPageCount}
                  signals={scan?.signals ?? []}
                  warnings={scan?.warnings ?? []}
                  lastScannedAt={lastScannedAt}
                  busy={busy}
                  onAddHolding={addHolding}
                  onRemoveHolding={removeHolding}
                  onRemoveSignal={removeSignal}
                  onPageChange={setWatchlistPage}
                />
                <RecentMovements
                  tickers={visibleWatchlistHoldings.map(({ symbol }) => symbol)}
                  signals={scan?.signals ?? []}
                />
              </section>

              <section className="performance-section" id="portfolio">
                <PortfolioPerformance
                  performance={performance}
                  range={performanceRange}
                  onRangeChange={setPerformanceRange}
                />
              </section>

              <section className="ledger-grid" id="ledger">
                <PositionLedger
                  portfolioId={portfolioId}
                  symbols={
                    currentPortfolio?.holdings.map(({ symbol }) => symbol) ?? []
                  }
                  trades={trades}
                  tickers={tradeTickers}
                  filter={tradeFilter}
                  page={tradePage}
                  pageCount={tradePageCount}
                  total={tradeTotal}
                  busy={busy}
                  onSubmit={recordPortfolioTrade}
                  onDelete={removePortfolioTrade}
                  onFilterChange={(symbol) => {
                    setTradeFilter(symbol);
                    setTradePage(1);
                  }}
                  onPageChange={setTradePage}
                />
                <CashLedger
                  portfolioId={portfolioId}
                  transactions={cashTransactions}
                  page={cashPage}
                  pageCount={cashPageCount}
                  total={cashTotal}
                  busy={busy}
                  onSubmit={recordCashEntry}
                  onDelete={removeCashEntry}
                  onPageChange={setCashPage}
                />
              </section>

              <section className="activity-section">
                <Card className="alerts-panel">
                  <CardHeader className="section-card-header">
                    <div>
                      <p className="section-kicker">ACTIVITY</p>
                      <CardTitle>Signal history</CardTitle>
                    </div>
                    <Badge variant="outline">{alerts.length} RECORDED</Badge>
                  </CardHeader>
                  <CardContent>
                    {alerts.length ? (
                      <div className="alert-list">
                        {alerts.slice(0, 8).map((alert) => (
                          <div className="alert-row" key={alert.id}>
                            <span
                              className={`alert-dot ${alert.signal.toLowerCase()}`}
                            />
                            <div className="alert-main">
                              <div>
                                <strong>{alert.symbol}</strong>
                                <Badge
                                  variant="outline"
                                  className="alert-strategy"
                                >
                                  {strategyLabels[alert.strategyId] ??
                                    alert.strategyId}
                                </Badge>
                              </div>
                              <small>{alert.rationale}</small>
                            </div>
                            <div className="alert-right">
                              <SignalPill
                                signal={alert.signal as SignalResult["signal"]}
                                compact
                              />
                              <small>{dateTime.format(alert.timestamp)}</small>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="alert-dismiss-button"
                              aria-label={`Dismiss ${alert.symbol} signal`}
                              title="Dismiss signal"
                              disabled={busy}
                              onClick={() => void dismissAlert(alert.id)}
                            >
                              <CircleX className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-activity">
                        <span className="activity-icon">
                          <Bell />
                        </span>
                        <strong>No actionable signals yet</strong>
                        <p>
                          When Klinger or RSI crosses its trigger, the event
                          will be recorded here.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>

              <footer className="page-footer">
                <span>
                  QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE
                </span>
              </footer>
            </>
          )}
        </div>
      </main>

      <DialogRoot
        open={portfolioDialogOpen}
        onOpenChange={setPortfolioDialogOpen}
      >
        <DialogContent
          aria-label="Create a portfolio"
          className="portfolio-dialog"
        >
          <p className="section-kicker">PORTFOLIO SETUP</p>
          <DialogTitle className="dialog-title">Create a portfolio</DialogTitle>
          <DialogDescription className="panel-description">
            Give this portfolio a name. You can add assets after creating it.
          </DialogDescription>
          <form
            className="portfolio-dialog-form"
            onSubmit={(event) => void createPortfolio(event)}
          >
            <label htmlFor="new-portfolio-name">PORTFOLIO NAME</label>
            <Input
              id="new-portfolio-name"
              aria-label="New portfolio name"
              autoFocus
              placeholder="e.g. Long-term investments"
              value={portfolioInput}
              onChange={(event) => setPortfolioInput(event.target.value)}
              maxLength={60}
              required
            />
            <div className="dialog-actions">
              <DialogClose
                render={<Button variant="outline" disabled={busy} />}
              >
                Cancel
              </DialogClose>
              <Button type="submit" disabled={busy || !portfolioInput.trim()}>
                {busy ? "Creating…" : "Create portfolio"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}

export default function Dashboard({
  user,
}: {
  user?: Pick<UserProfile, "name" | "image">;
}): React.JSX.Element {
  return (
    <ToastProvider>
      <DashboardContent user={user} />
    </ToastProvider>
  );
}
