# 📈 Quantify

> A modular, TypeScript-powered quantitative swing trading engine featuring custom indicator strategies,
> interactive Next.js dashboards, integrated backtesting, and Zulip ChatOps alerts.

---

## 📸 Overview

**Quantify** is built to analyze market time-series data, run pluggable strategy pipelines
(starting with the **Klinger Volume Oscillator**), backtest historical performance, and notify
traders via Zulip stream webhooks and interactive bot commands.

```text
               ┌────────────────────────┐
               │  Yahoo Finance API     │
               └───────────┬────────────┘
                           │ Candles
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Quantify Engine                      │
│  ┌──────────────────┐          ┌────────────────────┐  │
│  │ Klinger Strategy │          │ Backtest Runner    │  │
│  └─────────┬────────┘          └─────────┬──────────┘  │
└────────────┼─────────────────────────────┼─────────────┘
             │ Signal                      │ Metrics & Trades
             ▼                             ▼
┌────────────────────────┐    ┌────────────────────────┐
│     Zulip Notifier     │    │ Next.js Dashboard UI   │
└────────────────────────┘    └────────────────────────┘
```

## ✨ Core Features
* 📁 Portfolio Tracking: Group multiple stock tickers into custom portfolios with asset weighting, position sizing, and combined equity curve tracking.
* * 🎯 Pluggable Strategy Engine: Standardized strategy contract (SignalStrategy) allowing easy addition of indicators (KVO, RSI, MACD, or custom strategies).
* 📊 Klinger Volume Oscillator (KVO): Out-of-the-box volume force and dual EMA crossover signal calculation.
* 🧪 Built-in Backtester: Step-by-step portfolio execution accounting for fees, max drawdown, win rate, profit factor, and annualized Sharpe ratio.
* 💬 Zulip ChatOps:
    * Interactive Bot Commands: Trigger instant technical analyses directly by mentioning @QuantifyBot AAPL in streams or private messages.
    * Automated Stream Alerts: Push rich formatted markdown trade alerts (BUY/SELL/HOLD) to designated Zulip streams and topics.
* 💻 Next.js Dashboard: Visual chart interface, watchlist overview, and backtest results monitor.

## 🚀 Getting Started
### Prerequisites
* bun v1.3.14+

### Installation
1. Install dependencies:
```bash
bun install
```

2. Configure Environment Variables:
```bash
cp .env.example .env.local
```
3. Run the development server:
```bash
bun dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🧪 Running a Backtest
You can trigger strategy backtests programmatically or via the REST endpoint:
```bash
curl "http://localhost:3000/api/backtest?symbol=AAPL&days=365"
```
Sample output:
```json
{
  "symbol": "AAPL",
  "strategyId": "klinger-oscillator",
  "initialBalance": 10000,
  "finalBalance": 11845,
  "totalReturnPct": 18.45,
  "winRatePct": 62.5,
  "profitFactor": 1.84,
  "maxDrawdownPct": 8.12,
  "sharpeRatio": 1.42,
  "trades": [
    {
      "id": 1,
      "entryDate": 1704067200000,
      "exitDate": 1705276800000,
      "entryPrice": 185.20,
      "exitPrice": 192.50,
      "type": "LONG",
      "pnl": 394.17,
      "pnlPct": 0.0394,
      "status": "CLOSED"
    }
  ]
}
```

## 🤝 Adding New Strategies
To implement a new indicator or signal strategy:
1. Create a new strategy file in src/core/strategies/ implementing SignalStrategy:
```ts
import { Candle, SignalResult, SignalStrategy } from '../types';

export class RsiStrategy implements SignalStrategy {
  id = 'rsi-strategy';
  name = 'RSI Overbought/Oversold';

  analyze(symbol: string, candles: Candle[]): SignalResult {
    // Custom indicator evaluation logic...
  }
}
```
2. Plug the new strategy into the backtest runner or signal engine in app/api/signals/route.ts.