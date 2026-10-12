"use client";

import { useState } from "react";
import type {
  BacktestRunMetrics,
  BacktestSweepSummary,
  Portfolio,
  StrategyParams,
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
}: {
  user?: Pick<UserProfile, "name" | "image">;
  portfolios?: Array<
    Portfolio & { holdings: Array<{ symbol: string; addedAt: number }> }
  >;
}): React.JSX.Element {
  const [result, setResult] = useState<StrategySweepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runBacktest(input: StrategyResearchInput): Promise<boolean> {
    setBusy(true);
    setError("");
    setResult(null);
    let closeEventSource: (() => void) | undefined;
    try {
      const batchId = crypto.randomUUID();
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
      Object.entries(input.ranges).forEach(([id, range]) => {
        search.set(id, parameterTuple(range));
      });
      const runs: BacktestRunMetrics[] = [];
      const runIndices: number[] = [];
      const runParams: StrategyParams[] = [];
      const seenRunIndices = new Set<number>();
      let summary: BacktestSweepSummary | null = null;
      let startRequested = false;
      await new Promise<void>((resolve, reject) => {
        const finishIfComplete = (): void => {
          if (!summary || runs.length !== summary.completedRuns) return;
          setResult({
            ...input,
            runs,
            runIndices,
            runParams,
            summary,
          });
          resolve();
        };
        const eventSource = new EventSource(
          `/api/backtest/events?batchId=${encodeURIComponent(batchId)}`,
        );
        closeEventSource = () => eventSource.close();
        eventSource.addEventListener("result", (event: Event) => {
          try {
            const run = JSON.parse((event as MessageEvent<string>).data) as {
              runIndex: number;
              params: StrategyParams;
              result: BacktestRunMetrics;
            };
            if (
              !Number.isInteger(run.runIndex) ||
              run.runIndex < 0 ||
              seenRunIndices.has(run.runIndex)
            )
              return;
            seenRunIndices.add(run.runIndex);
            runs.push(run.result);
            runIndices.push(run.runIndex);
            runParams.push(run.params);
            setResult({ ...input, runs, runIndices, runParams });
            finishIfComplete();
          } catch (cause) {
            reject(
              cause instanceof Error
                ? cause
                : new Error("Backtest result was invalid."),
            );
          }
        });
        eventSource.onopen = () => {
          if (startRequested) return;
          startRequested = true;
          void fetch(`/api/backtest?${search.toString()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchId }),
          })
            .then(async (response) => {
              const body = (await response.json()) as {
                summary?: BacktestSweepSummary;
                error?: string;
              };
              if (!response.ok)
                throw new Error(body.error ?? "Backtest failed.");
              if (
                !body.summary ||
                body.summary.totalRuns !== body.summary.completedRuns
              )
                throw new Error("Backtest summary was invalid.");
              summary = body.summary;
              finishIfComplete();
            })
            .catch(reject);
        };
        eventSource.onerror = () => {
          if (eventSource.readyState === EventSource.CLOSED)
            reject(new Error("The backtest event connection failed."));
        };
      });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backtest failed.");
      return false;
    } finally {
      closeEventSource?.();
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
        <div className="dashboard-content research-page-content">
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
              onRun={runBacktest}
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
