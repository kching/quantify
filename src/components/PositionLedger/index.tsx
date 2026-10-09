"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { calculateBrokerage } from "@/core/brokerage";
import type { PortfolioTrade, TradeSide } from "@/core/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectControl, SelectOption } from "@/components/ui/select";
import "./PositionLedger.css";

export interface PositionLedgerInput {
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  brokerage: number;
  timestamp: number;
}

interface PositionLedgerProps {
  portfolioId: number | null;
  symbols: string[];
  trades: PortfolioTrade[];
  tickers: string[];
  filter: string;
  page: number;
  pageCount: number;
  total: number;
  busy: boolean;
  onSubmit: (trade: PositionLedgerInput) => Promise<boolean>;
  onDelete: (trade: PortfolioTrade) => Promise<void>;
  onFilterChange: (symbol: string) => void;
  onPageChange: (page: number) => void;
}

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});
const dateTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
});
const localDateTimeValue = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export default function Index({
  portfolioId,
  symbols,
  trades,
  tickers,
  filter,
  page,
  pageCount,
  total,
  busy,
  onSubmit,
  onDelete,
  onFilterChange,
  onPageChange,
}: PositionLedgerProps): React.JSX.Element {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<TradeSide>("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [tradeTime, setTradeTime] = useState(localDateTimeValue);

  const updateBrokerageFromTradeValue = (
    nextQuantity: string,
    nextPrice: string,
  ): void => {
    const calculatedBrokerage = calculateBrokerage(
      Number(nextQuantity) * Number(nextPrice),
    );
    setBrokerage(calculatedBrokerage ? calculatedBrokerage.toFixed(2) : "");
  };

  async function submitTrade(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!portfolioId) return;
    const timestamp = tradeTime ? new Date(tradeTime).getTime() : 0;
    const saved = await onSubmit({
      symbol,
      side,
      quantity: Number(quantity),
      price: Number(price),
      brokerage: Number(brokerage),
      timestamp,
    });
    if (!saved) return;
    setSymbol("");
    setQuantity("");
    setPrice("");
    setBrokerage("");
    setTradeTime(localDateTimeValue());
  }

  return (
    <Card className="trade-panel">
      <CardHeader className="section-card-header">
        <div>
          <p className="section-kicker">POSITION LEDGER</p>
          <CardTitle>Record a trade</CardTitle>
          <CardDescription>
            Log completed trades. Positions and P&amp;L derive from these
            entries; no orders are sent.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="trade-form"
          onSubmit={(event) => void submitTrade(event)}
        >
          <div className="trade-form-row">
            <label>
              TYPE
              <SelectControl
                value={side}
                displayValue={side === "BUY" ? "Buy" : "Sell"}
                ariaLabel="Trade side"
                onValueChange={(value) => setSide(value as TradeSide)}
              >
                <SelectOption value="BUY">Buy</SelectOption>
                <SelectOption value="SELL">Sell</SelectOption>
              </SelectControl>
            </label>
            <label>
              TICKER
              <Input
                aria-label="Trade ticker"
                value={symbol}
                onChange={(event) =>
                  setSymbol(event.target.value.toUpperCase())
                }
                placeholder="e.g. QQQ or MQG.AX"
                list="portfolio-tickers"
                required
                maxLength={20}
              />
              <datalist id="portfolio-tickers">
                {symbols.map((ticker) => (
                  <option key={ticker} value={ticker} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="trade-form-row">
            <label>
              UNITS
              <Input
                aria-label="Trade units"
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                onChange={(event) => {
                  const nextQuantity = event.target.value;
                  setQuantity(nextQuantity);
                  updateBrokerageFromTradeValue(nextQuantity, price);
                }}
                required
              />
            </label>
            <label>
              PRICE / UNIT (AUD)
              <Input
                aria-label="Trade price"
                type="number"
                min="0.000001"
                step="any"
                value={price}
                onChange={(event) => {
                  const nextPrice = event.target.value;
                  setPrice(nextPrice);
                  updateBrokerageFromTradeValue(quantity, nextPrice);
                }}
                required
              />
            </label>
            <label>
              BROKERAGE (AUD)
              <Input
                aria-label="Trade brokerage"
                type="number"
                min="0"
                step="0.01"
                value={brokerage}
                onChange={(event) => setBrokerage(event.target.value)}
                required
              />
            </label>
          </div>
          <div className="trade-form-row">
            <div>
              <label>
                TRADE DATE / TIME
                <Input
                  aria-label="Trade date and time"
                  lang="en-GB"
                  type="datetime-local"
                  value={tradeTime}
                  onChange={(event) => setTradeTime(event.target.value)}
                />
              </label>
            </div>
          </div>
          <Button type="submit" disabled={busy || !portfolioId}>
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {busy ? "Saving…" : "Save trade"}
          </Button>
        </form>
        <p className="form-hint">
          Brokerage is calculated automatically from the trade value and can be
          adjusted. Trade date/time defaults to the current local time; sells
          cannot exceed your recorded position.
        </p>
        <div className="trade-history">
          <div className="trade-history-heading">
            <h3>Recent trades</h3>
            <label className="trade-filter-label">
              <span>TICKER</span>
              <SelectControl
                value={filter || "ALL"}
                displayValue={filter || "All tickers"}
                ariaLabel="Filter trades by ticker"
                onValueChange={(value) =>
                  onFilterChange(value === "ALL" ? "" : value)
                }
              >
                <SelectOption value="ALL">All tickers</SelectOption>
                {tickers.map((ticker) => (
                  <SelectOption key={ticker} value={ticker}>
                    {ticker}
                  </SelectOption>
                ))}
              </SelectControl>
            </label>
          </div>
          {trades.length ? (
            <>
              <div className="trade-table">
                {trades.map((trade) => (
                  <div className="trade-row" key={trade.id}>
                    <Badge
                      variant={trade.side === "BUY" ? "success" : "danger"}
                    >
                      {trade.side}
                    </Badge>
                    <strong>{trade.symbol}</strong>
                    <span>
                      {trade.quantity} @ {money.format(trade.price)}
                    </span>
                    <small>
                      {dateTime.format(trade.timestamp)}
                    </small>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="trade-delete-button"
                      aria-label={`Delete ${trade.symbol} ${trade.side} trade ${dateTime.format(trade.timestamp)}`}
                      disabled={busy}
                      onClick={() => void onDelete(trade)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="trade-pagination">
                <span>
                  {(page - 1) * 6 + 1}–{Math.min(page * 6, total)} of {total}
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Previous trade page"
                    disabled={busy || page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <span>
                    Page {page} of {Math.max(pageCount, 1)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Next trade page"
                    disabled={busy || page >= pageCount}
                    onClick={() => onPageChange(page + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="chart-empty">
              {filter
                ? `No trades recorded for ${filter}.`
                : "No trades recorded for this portfolio."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
