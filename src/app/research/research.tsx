"use client";

import { useState } from "react";
import type {
  BacktestResult,
  HoldingStrategy,
  Portfolio,
  UserProfile,
} from "@/core/types";
import StrategyResearch, {
  type StrategyResearchInput,
  type StrategySweepResult,
} from "@/components/StrategyResearch";
import AppSidebar from "@/components/AppSidebar";
import { ToastProvider } from "@/components/ui/toast";

export default function ResearchPage({
  user,
  portfolios = [],
  initialStrategies = [],
}: {
  user?: Pick<UserProfile, "name" | "image">;
  portfolios?: Array<
    Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }
  >;
  initialStrategies?: HoldingStrategy[];
}): React.JSX.Element {
  const [result, setResult] = useState<StrategySweepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedStrategies, setSavedStrategies] = useState(initialStrategies);

  async function runBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const parameterTuple = (range: {
        min: number;
        max: number;
        step: number;
      }): string => JSON.stringify([range.min, range.max, range.step]);
      const search = new URLSearchParams({
        symbol: input.symbol,
        strategy: input.strategy,
        cadence: input.cadence,
        days: String(input.days),
      });
      if (input.strategy === "rsi-14")
        search.set("period", parameterTuple(input.ranges.period));
      else {
        search.set("fastPeriod", parameterTuple(input.ranges.fastPeriod));
        search.set("slowPeriod", parameterTuple(input.ranges.slowPeriod));
        search.set("signalPeriod", parameterTuple(input.ranges.signalPeriod));
      }
      const response = await fetch(`/api/backtest?${search.toString()}`);
      const body = (await response.json()) as {
        results?: BacktestResult[];
        error?: string;
      };
      if (!response.ok || !body.results)
        throw new Error(body.error ?? "Backtest failed.");
      setResult({ ...input, runs: body.results });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backtest failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" id="top">
      <AppSidebar
        page="research"
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

      <main className="app-main">
        <div className="dashboard-content">
          <section className="page-heading">
            <div>
              <p className="section-kicker">STRATEGY LAB</p>
              <h1>Research strategies</h1>
              <p className="page-subtitle">
                Test a hypothesis against cached daily market history.
              </p>
            </div>
          </section>
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          <ToastProvider>
            <StrategyResearch
              result={result}
              busy={busy}
              portfolios={portfolios}
              savedStrategies={savedStrategies}
              onRun={runBacktest}
              onBack={() => setResult(null)}
              onSaved={(saved) =>
                setSavedStrategies((current) => [
                  ...current.filter((item) => item.id !== saved.id),
                  saved,
                ])
              }
              onDeleted={(_portfolioId, _symbol, id) =>
                setSavedStrategies((current) =>
                  current.filter((item) => item.id !== id),
                )
              }
            />
          </ToastProvider>
          <footer className="page-footer">
            <span>
              QUANTIFY <i>·</i> PERSONAL MARKET WORKSPACE
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
