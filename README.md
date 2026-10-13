# Quantify

Quantify is a stock market monitor for human-led trading decisions. It scans portfolio tickers against daily technical strategies, shows hourly price context, records actionable signal events, and backtests against locally cached Yahoo Finance candles. It does not connect to brokerage accounts or place trades.

## Run locally

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000). On first start, Quantify creates an `admin` user, a **My watchlist** portfolio, and the initial tickers `MQG.AX`, `COL.AX`, `XRO.AX`, `VGS.AX`, and `REA.AX`. Add or remove tickers and create or delete portfolios from the dashboard. Tickers are stored exactly as entered, so symbols from other markets such as `QQQ` can be used alongside explicit exchange-qualified symbols such as `MQG.AX`.

The SQLite database is created at `data/quantify.sqlite` and ignored by Git. Set `QUANTIFY_DB_PATH` to choose another local file. Hourly candles and portfolio/holding P&L time-series data are retained for up to 12 months; daily candles are retained for up to 10 years. Older points are evicted at startup and once per day. Trade and cash ledgers, along with portfolio positions, are retained so current holdings, cash, and P&L remain correct. When the local Next.js server starts, its engine immediately updates all unique tickers across all portfolios, then repeats hourly without an external scheduler or API caller. A separate local-midnight job backfills each portfolio ticker's daily candles for the last 10 years. Dashboard requests can also refresh a selected portfolio on demand. Both paths reuse recent candles and refresh stale data from Yahoo Finance; hourly data has a 30-minute request cooldown and daily data an eight-hour cooldown. Network failures leave the last cached candles available and are shown in the dashboard or server log.

## Strategies and signals

- **Klinger Volume Oscillator:** 34/55 EMA oscillator with a 13-period EMA signal line. BUY/SELL are emitted on crossovers.
- **RSI (14):** Wilder RSI. BUY occurs when RSI crosses back above 30; SELL occurs when it crosses back below 70.

The dashboard compares both strategies against daily candles. Hourly Klinger context and recent hourly prices help inspect the daily decision. Alerts are saved locally when either daily strategy emits a BUY or SELL, once per candle and strategy.

The backtest panel can run either Klinger or RSI over the same most recent year of daily candles. When a backtest starts, the API ensures the ticker has up to 10 years of daily history cached before applying the selected test window, so the strategy has enough warm-up data. It uses full-position entries, executes at the next candle's open after a signal, compounds closed-trade returns, and reports return, win rate, closed-trade count, and drawdown based on closed trades. Fees, slippage, sizing rules, dividends, and benchmark comparison are not modeled yet; results are exploratory, not a representation of brokerage performance.

## Architecture

- `src/core/` contains pure strategies, signal types, and backtest calculations, plus separate Yahoo and SQLite adapters.
- `src/app/api/` contains Next.js route handlers for portfolios, holdings, market scans, alerts, and backtests.
- The SQLite schema includes a user key on user-owned tables. Google-authenticated profiles live in the existing `users` table and every portfolio API operation is owner-scoped.

### Future scope: separate strategy worker

Strategy execution should eventually move into a separate strategy worker so strategies can be discovered, added, updated, and reloaded independently of the Next.js application bundle. The worker should support strategies implemented in either TypeScript or Python and communicate with the application through a small JSON-based RPC or queue protocol.

The worker should load strategies from an external plugin directory using a manifest that contains at least the strategy name, runtime, entrypoint, version or content hash, and supported parameter metadata. `HoldingStrategy` would continue to persist the selected strategy name and per-holding JSON parameters, while the worker would resolve the name to the corresponding plugin. Plugin failures should be isolated from the web process, and the worker should support refreshing its plugin catalog without restarting the Next.js server.

Strategies supplied by untrusted users must not execute with unrestricted application or host access. They should run in a sandboxed worker or isolated service with restricted filesystem, network, process, and resource permissions. Suitable execution options include a hardened subprocess/container boundary, WebAssembly for compatible TypeScript code, or another restricted execution environment for Python. Plugin validation, dependency allowlists, timeouts, memory/CPU limits, and audit logging should be part of the design before accepting untrusted strategy code.

Yahoo Finance chart data is accessed through its public chart endpoint. Data availability, intraday retention, and symbol coverage are controlled by Yahoo Finance.

## Authentication

Quantify uses Auth.js with Google OAuth. Configure these variables before running a non-test server:

```bash
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
```

The local Google OAuth callback URL is `http://localhost:3000/api/auth/callback/google`. All users must authenticate with Google before accessing the dashboard or portfolio APIs.

## Telegram notifications

Quantify uses one shared Telegram bot for all users. Create the bot with [@BotFather](https://t.me/BotFather), then set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, and `TELEGRAM_WEBHOOK_SECRET` in the server environment. The webhook URL must be the app's public HTTPS URL ending in `/api/telegram/webhook`. Use a random 1–256 character secret containing only letters, numbers, underscores, or hyphens. The first user who connects automatically registers the webhook with Telegram.

Users connect from **Preferences → Telegram** by generating a temporary QR code, scanning it in Telegram, and tapping **Start**. The code expires after 10 minutes and can only be used once. Quantify stores the resulting Telegram chat ID against the signed-in user; the shared bot token stays in server configuration. Users can test or disconnect the connection from the same page, or send `/stop` to the bot.

## MCP sweeps

The MCP `run_sweep` tool queues a sweep and returns its ID immediately. Agents can poll `get_sweep_status` and read pages with `get_sweep_results` after completion. Completed runs are stored for one hour in the application's `data/tmp/mcp-sweep-results` directory, alongside the SQLite database. The authenticated `GET /api/mcp/sweeps/{sweepId}/results` endpoint returns HTTP 404 for expired or missing results; the MCP tool returns a 404 tool error. A Bun cron job checks temporary results every hour and removes only files whose stored expiry time has passed. Queued or interrupted sweeps resume when the server starts.

## Docker deployment

The production image is built from the multi-stage `Dockerfile` and runs the Next.js standalone server as an unprivileged user. The SQLite database lives in `/app/data`; use the included `compose.yml` so it remains in a named Docker volume:

```bash
QUANTIFY_IMAGE=docker.local.curiouscoding.dev/quantify:latest docker compose up -d
```

Set `QUANTIFY_DATA_VOLUME` to use a different named volume, and set `QUANTIFY_PORT` to change the host port. When building the image yourself, `APP_UID` and `APP_GID` are configurable Docker build arguments and default to `1001`:

```bash
docker build --build-arg APP_UID=1001 --build-arg APP_GID=1001 -t quantify:local .
```

Copy `.env.example` to `.env` and set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` before starting the compose service. The published image is built for `linux/amd64`.

The Gitea workflows run lint, tests, and a Next.js build on every push or manual dispatch. The Docker publish workflow runs manually, increments the application version from Conventional Commits since the previous release, and publishes that version and `latest` to `docker.local.curiouscoding.dev`. After publishing, it retains the newest `docker_retention_count` distinct images from `.gitea/vars.yml` (currently 10), deleting older images by creation time while preserving the published version and `latest`. If the registry requires authentication for deletion, configure the optional Gitea Actions secrets `DOCKER_REGISTRY_USERNAME` and `DOCKER_REGISTRY_PASSWORD`. The Docker deploy workflow can be run manually or starts after a successful Docker publish. Set `server_hostname` and `working_directory` in `.gitea/vars.yml`; the working directory must contain the deployment's `compose.yml`. Configure the Gitea Actions secrets `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, and `DEPLOY_SSH_KNOWN_HOSTS` for SSH access. The deployment server must already be able to authenticate to the image registry. The workflow connects with strict host key checking, runs `docker compose pull`, and then runs `docker compose up -d --remove-orphans` from the configured directory.
