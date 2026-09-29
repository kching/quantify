# Quantify

Quantify is a local, single-user ASX market monitor for human-led trading decisions. It scans portfolio tickers against daily technical strategies, shows hourly price context, records actionable signal events, and backtests against locally cached Yahoo Finance candles. It does not connect to brokerage accounts or place trades.

## Run locally

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000). On first start, Quantify creates an `admin` user, a **My watchlist** portfolio, and the initial tickers `MQG.AX`, `COL.AX`, `XRO.AX`, `VGS.AX`, and `REA.AX`. Add or remove tickers and create or delete portfolios from the dashboard. Tickers without an exchange suffix are treated as ASX symbols and receive `.AX` automatically.

The SQLite database is created at `data/quantify.sqlite` and ignored by Git. Set `QUANTIFY_DB_PATH` to choose another local file. Candle and portfolio/holding P&L time-series data are retained for up to 12 months; older points are evicted at startup and once per day. Trade and cash ledgers, along with portfolio positions, are retained so current holdings, cash, and P&L remain correct. When the local Next.js server starts, its engine immediately updates all unique tickers across all portfolios, then repeats hourly without an external scheduler or API caller. Dashboard requests can also refresh a selected portfolio on demand. Both paths reuse recent candles and refresh stale data from Yahoo Finance; hourly data has a 30-minute request cooldown and daily data an eight-hour cooldown. Network failures leave the last cached candles available and are shown in the dashboard or server log.

## Strategies and signals

- **Klinger Volume Oscillator:** 34/55 EMA oscillator with a 13-period EMA signal line. BUY/SELL are emitted on crossovers.
- **RSI (14):** Wilder RSI. BUY occurs when RSI crosses back above 30; SELL occurs when it crosses back below 70.

The dashboard compares both strategies against daily candles. Hourly Klinger context and recent hourly prices help inspect the daily decision. Alerts are saved locally when either daily strategy emits a BUY or SELL, once per candle and strategy.

The backtest panel can run either Klinger or RSI over the same most recent year of cached daily candles (fetching history once if needed), so their behavior can be compared separately. It uses full-position entries, executes at the next candle's open after a signal, compounds closed-trade returns, and reports return, win rate, closed-trade count, and drawdown based on closed trades. Fees, slippage, sizing rules, dividends, and benchmark comparison are not modeled yet; results are exploratory, not a representation of brokerage performance.

## Architecture

- `src/core/` contains pure strategies, signal types, and backtest calculations, plus separate Yahoo and SQLite adapters.
- `src/app/api/` contains Next.js route handlers for portfolios, holdings, market scans, alerts, and backtests.
- The SQLite schema includes a user key on user-owned tables. The current local workspace uses the `admin` user so authentication can be added later.

Yahoo Finance chart data is accessed through its public chart endpoint. Data availability, intraday retention, and symbol coverage are controlled by Yahoo Finance.
