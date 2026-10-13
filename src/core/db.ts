import "server-only";
import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import {
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  Candle,
  CandleInterval,
  HoldingPerformancePoint,
  HoldingStrategy,
  HoldingStrategyInput,
  PerformanceSnapshots,
  Portfolio,
  PortfolioCashTransaction,
  PortfolioHolding,
  PortfolioPerformancePoint,
  PortfolioTrade,
  SignalType,
  StrategyParams,
  UserPreferences,
  UserProfile,
  WebhookConfig,
  WebhookConfigInput,
  WebhookDeliveryLog,
  WebhookDeliveryLogInput,
  McpAccessToken,
  McpSweep,
  McpSweepRun,
} from "./types";

const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    image: text("image"),
    googleSubject: text("google_subject"),
    isAnonymous: integer("is_anonymous", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [uniqueIndex("users_google_subject").on(table.googleSubject)],
);
const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  preferences: text("preferences").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});
const telegramConnections = sqliteTable(
  "telegram_connections",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    connectedAt: integer("connected_at").notNull(),
  },
  (table) => [uniqueIndex("telegram_connections_chat_id").on(table.chatId)],
);
const telegramLinkTokens = sqliteTable(
  "telegram_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("telegram_link_tokens_user_id").on(table.userId)],
);
const webhookConfigs = sqliteTable(
  "webhook_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Webhook"),
    url: text("url").notNull(),
    clientId: text("client_id"),
    secretToken: text("secret_token"),
    excludedPortfolioIds: text("excluded_portfolio_ids")
      .notNull()
      .default("[]"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    createdVia: text("created_via", { enum: ["user", "mcp"] })
      .notNull()
      .default("user"),
  },
  (table) => [index("webhook_configs_user_id").on(table.userId)],
);
const webhookDeliveryLogs = sqliteTable(
  "webhook_delivery_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    webhookConfigId: integer("webhook_config_id"),
    eventType: text("event_type").notNull(),
    status: text("status", { enum: ["success", "error"] }).notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    message: text("message"),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [
    index("webhook_delivery_logs_user_created").on(
      table.userId,
      table.timestamp,
    ),
    index("webhook_delivery_logs_config_created").on(
      table.webhookConfigId,
      table.timestamp,
    ),
  ],
);
const portfolios = sqliteTable(
  "portfolios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
    createdVia: text("created_via", { enum: ["user", "mcp"] })
      .notNull()
      .default("user"),
  },
  (table) => [uniqueIndex("portfolios_user_name").on(table.userId, table.name)],
);
const mcpAccessTokens = sqliteTable(
  "mcp_access_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("mcp_access_tokens_user_id").on(table.userId)],
);
const mcpSweeps = sqliteTable(
  "mcp_sweeps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    strategyId: text("strategy_id").notNull(),
    cadence: text("cadence", { enum: ["1h", "1d"] }).notNull(),
    days: integer("days").notNull(),
    totalRuns: integer("total_runs").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("mcp_sweeps_user_created").on(table.userId, table.createdAt),
  ],
);
const mcpSweepRuns = sqliteTable(
  "mcp_sweep_runs",
  {
    sweepId: integer("sweep_id")
      .notNull()
      .references(() => mcpSweeps.id, { onDelete: "cascade" }),
    runIndex: integer("run_index").notNull(),
    params: text("params").notNull(),
    metrics: text("metrics").notNull(),
  },
  (table) => [
    uniqueIndex("mcp_sweep_runs_index").on(table.sweepId, table.runIndex),
  ],
);
const holdings = sqliteTable(
  "holdings",
  {
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (table) => [
    uniqueIndex("holdings_portfolio_symbol").on(
      table.portfolioId,
      table.symbol,
    ),
  ],
);
const holdingStrategies = sqliteTable(
  "holding_strategies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id").notNull(),
    symbol: text("symbol").notNull(),
    label: text("label").notNull(),
    name: text("name").notNull(),
    params: text("params").notNull(),
    candleType: text("candle_type").notNull().default("1d"),
    lastSignal: text("last_signal"),
    signalUpdatedAt: integer("signal_updated_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.portfolioId, table.symbol],
      foreignColumns: [holdings.portfolioId, holdings.symbol],
      name: "holding_strategies_holding_fk",
    }),
  ],
);
const candles = sqliteTable(
  "candles",
  {
    symbol: text("symbol").notNull(),
    interval: text("interval").notNull(),
    timestamp: integer("timestamp").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
  },
  (table) => [
    uniqueIndex("candles_symbol_interval_timestamp").on(
      table.symbol,
      table.interval,
      table.timestamp,
    ),
    index("candles_symbol_interval").on(table.symbol, table.interval),
  ],
);
const alerts = sqliteTable(
  "alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    strategyId: text("strategy_id").notNull(),
    signal: text("signal").notNull(),
    timestamp: integer("timestamp").notNull(),
    price: real("price").notNull(),
    rationale: text("rationale").notNull(),
    indicators: text("indicators").notNull(),
  },
  (table) => [
    uniqueIndex("alerts_once_per_candle").on(
      table.portfolioId,
      table.symbol,
      table.strategyId,
      table.signal,
      table.timestamp,
    ),
  ],
);
const trades = sqliteTable(
  "trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    quantity: real("quantity").notNull(),
    price: real("price").notNull(),
    brokerage: real("brokerage").notNull(),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [
    index("trades_portfolio_symbol_time").on(
      table.portfolioId,
      table.symbol,
      table.timestamp,
    ),
  ],
);
const cashTransactions = sqliteTable(
  "cash_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: real("amount").notNull(),
    timestamp: integer("timestamp").notNull(),
    note: text("note").notNull().default(""),
  },
  (table) => [
    index("cash_transactions_portfolio_time").on(
      table.portfolioId,
      table.timestamp,
    ),
  ],
);
const holdingPerformance = sqliteTable(
  "holding_performance",
  {
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    timestamp: integer("timestamp").notNull(),
    quantity: real("quantity").notNull(),
    marketPrice: real("market_price").notNull(),
    averageUnitPrice: real("average_unit_price").notNull().default(0),
    marketValue: real("market_value").notNull(),
    profitLoss: real("profit_loss").notNull(),
  },
  (table) => [
    uniqueIndex("holding_performance_once_per_candle").on(
      table.portfolioId,
      table.symbol,
      table.timestamp,
    ),
  ],
);
const portfolioPerformance = sqliteTable(
  "portfolio_performance",
  {
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp").notNull(),
    cashBalance: real("cash_balance").notNull().default(0),
    marketValue: real("market_value").notNull(),
    totalValue: real("total_value").notNull().default(0),
    contributedCapital: real("contributed_capital").notNull().default(0),
    profitLoss: real("profit_loss").notNull(),
  },
  (table) => [
    uniqueIndex("portfolio_performance_once_per_candle").on(
      table.portfolioId,
      table.timestamp,
    ),
  ],
);
export const TIME_SERIES_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const DAILY_CANDLE_RETENTION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
export const DAILY_CANDLE_HISTORY_DAYS = 10 * 365;

const dbPath =
  process.env.QUANTIFY_DB_PATH ??
  join(process.cwd(), "data", "quantify.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const client = createClient({ url: `file:${dbPath}` });
export const db = drizzle({
  client,
  schema: {
    users,
    userPreferences,
    telegramConnections,
    telegramLinkTokens,
    mcpAccessTokens,
    mcpSweeps,
    mcpSweepRuns,
    webhookConfigs,
    webhookDeliveryLogs,
    portfolios,
    holdings,
    holdingStrategies,
    candles,
    alerts,
    trades,
    cashTransactions,
    holdingPerformance,
    portfolioPerformance,
  },
});

async function initializeDatabase(): Promise<void> {
  await client.executeMultiple(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT, google_subject TEXT UNIQUE, is_anonymous INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, preferences TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_connections (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, chat_id TEXT NOT NULL UNIQUE, connected_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_id ON telegram_link_tokens(user_id);
    CREATE TABLE IF NOT EXISTS webhook_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL DEFAULT 'Webhook', url TEXT NOT NULL, client_id TEXT, secret_token TEXT, excluded_portfolio_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS webhook_configs_user_id ON webhook_configs(user_id);
    CREATE TABLE IF NOT EXISTS mcp_access_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER);
    CREATE INDEX IF NOT EXISTS mcp_access_tokens_user_id ON mcp_access_tokens(user_id);
    CREATE TABLE IF NOT EXISTS mcp_sweeps (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, symbol TEXT NOT NULL, strategy_id TEXT NOT NULL, cadence TEXT NOT NULL, days INTEGER NOT NULL, total_runs INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS mcp_sweeps_user_created ON mcp_sweeps(user_id, created_at);
    CREATE TABLE IF NOT EXISTS mcp_sweep_runs (sweep_id INTEGER NOT NULL REFERENCES mcp_sweeps(id) ON DELETE CASCADE, run_index INTEGER NOT NULL, params TEXT NOT NULL, metrics TEXT NOT NULL, PRIMARY KEY(sweep_id, run_index));
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, webhook_config_id INTEGER, event_type TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL, status_code INTEGER, message TEXT, timestamp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS portfolios (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id, name));
    CREATE TABLE IF NOT EXISTS holdings (portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY(portfolio_id, symbol));
    CREATE TABLE IF NOT EXISTS holding_strategies (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL, symbol TEXT NOT NULL, label TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL, candle_type TEXT NOT NULL DEFAULT '1d', last_signal TEXT, signal_updated_at INTEGER, FOREIGN KEY(portfolio_id, symbol) REFERENCES holdings(portfolio_id, symbol) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS candles (symbol TEXT NOT NULL, interval TEXT NOT NULL, timestamp INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, PRIMARY KEY(symbol, interval, timestamp));
    CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, strategy_id TEXT NOT NULL, signal TEXT NOT NULL, timestamp INTEGER NOT NULL, price REAL NOT NULL, rationale TEXT NOT NULL, indicators TEXT NOT NULL, UNIQUE(portfolio_id, symbol, strategy_id, signal, timestamp));
    CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, brokerage REAL NOT NULL, timestamp INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS trades_portfolio_symbol_time ON trades(portfolio_id, symbol, timestamp);
    CREATE TABLE IF NOT EXISTS cash_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL')), amount REAL NOT NULL CHECK(amount > 0), timestamp INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS cash_transactions_portfolio_time ON cash_transactions(portfolio_id, timestamp);
    CREATE TABLE IF NOT EXISTS holding_performance (portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, timestamp INTEGER NOT NULL, quantity REAL NOT NULL, market_price REAL NOT NULL, average_unit_price REAL NOT NULL DEFAULT 0, market_value REAL NOT NULL, profit_loss REAL NOT NULL, PRIMARY KEY(portfolio_id, symbol, timestamp));
    CREATE TABLE IF NOT EXISTS portfolio_performance (portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL, cash_balance REAL NOT NULL DEFAULT 0, market_value REAL NOT NULL, total_value REAL NOT NULL DEFAULT 0, contributed_capital REAL NOT NULL DEFAULT 0, profit_loss REAL NOT NULL, PRIMARY KEY(portfolio_id, timestamp));
  `);
  for (const tableName of ["webhook_configs", "portfolios"] as const) {
    const columns = await client.execute(`PRAGMA table_info(${tableName})`);
    if (!columns.rows.some((row) => String(row.name) === "created_via"))
      await client.execute(
        `ALTER TABLE ${tableName} ADD COLUMN created_via TEXT NOT NULL DEFAULT 'user'`,
      );
  }
  const webhookConfigColumns = await client.execute(
    "PRAGMA table_info(webhook_configs)",
  );
  if (
    !webhookConfigColumns.rows.some(
      (row) => String(row.name) === "excluded_portfolio_ids",
    )
  ) {
    await client.execute(
      "ALTER TABLE webhook_configs ADD COLUMN excluded_portfolio_ids TEXT NOT NULL DEFAULT '[]'",
    );
  }
  if (!webhookConfigColumns.rows.some((row) => String(row.name) === "label")) {
    await client.execute(
      "ALTER TABLE webhook_configs ADD COLUMN label TEXT NOT NULL DEFAULT 'Webhook'",
    );
  }
  const webhookLogColumns = await client.execute(
    "PRAGMA table_info(webhook_delivery_logs)",
  );
  const webhookLogColumnNames = new Set(
    webhookLogColumns.rows.map((row) => String(row.name)),
  );
  const webhookLogForeignKeys = await client.execute(
    "PRAGMA foreign_key_list(webhook_delivery_logs)",
  );
  const webhookLogMessageColumn = webhookLogColumns.rows.find(
    (row) => String(row.name) === "message",
  );
  if (
    !webhookLogColumnNames.has("url") ||
    !webhookLogColumnNames.has("timestamp") ||
    webhookLogForeignKeys.rows.length > 0 ||
    Number(webhookLogMessageColumn?.notnull ?? 0) !== 0
  ) {
    await client.execute(
      "ALTER TABLE webhook_delivery_logs RENAME TO webhook_delivery_logs_legacy",
    );
    await client.execute(
      "CREATE TABLE webhook_delivery_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, webhook_config_id INTEGER, event_type TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL, status_code INTEGER, message TEXT, timestamp INTEGER NOT NULL)",
    );
    await client.execute(
      `INSERT INTO webhook_delivery_logs (id, user_id, webhook_config_id, event_type, url, status, status_code, message, timestamp)
       SELECT legacy.id, legacy.user_id, legacy.webhook_config_id, legacy.event_type,
         COALESCE((SELECT url FROM webhook_configs WHERE id = legacy.webhook_config_id), ''),
         legacy.status, legacy.status_code, legacy.message, legacy.created_at
       FROM webhook_delivery_logs_legacy AS legacy`,
    );
    await client.execute("DROP TABLE webhook_delivery_logs_legacy");
  }
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS webhook_delivery_logs_user_created ON webhook_delivery_logs(user_id, timestamp);
    CREATE INDEX IF NOT EXISTS webhook_delivery_logs_config_created ON webhook_delivery_logs(webhook_config_id, timestamp);
  `);
  await client.execute("DELETE FROM holding_strategies WHERE name = 'rsi-14'");
  await client.execute("DELETE FROM alerts WHERE strategy_id = 'rsi-14'");
  const preferenceRows = await client.execute(
    "SELECT user_id, preferences FROM user_preferences",
  );
  for (const row of preferenceRows.rows) {
    try {
      const stored: unknown = JSON.parse(String(row.preferences));
      if (!stored || typeof stored !== "object" || Array.isArray(stored))
        continue;
      const preferences = stored as Record<string, unknown>;
      if (!("telegram" in preferences)) continue;
      delete preferences.telegram;
      await client.execute({
        sql: "UPDATE user_preferences SET preferences = ?, updated_at = ? WHERE user_id = ?",
        args: [JSON.stringify(preferences), Date.now(), String(row.user_id)],
      });
    } catch {
      // Preserve malformed preferences rather than overwriting unrelated data.
    }
  }
  const userColumns = await client.execute("PRAGMA table_info(users)");
  const userColumnNames = new Set(
    userColumns.rows.map((row) => String(row.name)),
  );
  if (!userColumnNames.has("email"))
    await client.execute("ALTER TABLE users ADD COLUMN email TEXT");
  if (!userColumnNames.has("image"))
    await client.execute("ALTER TABLE users ADD COLUMN image TEXT");
  if (!userColumnNames.has("google_subject"))
    await client.execute("ALTER TABLE users ADD COLUMN google_subject TEXT");
  if (!userColumnNames.has("is_anonymous"))
    await client.execute(
      "ALTER TABLE users ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0",
    );
  if (!userColumnNames.has("created_at"))
    await client.execute(
      "ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
    );
  if (!userColumnNames.has("updated_at"))
    await client.execute(
      "ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
    );
  const performanceColumns = await client.execute(
    "PRAGMA table_info(portfolio_performance)",
  );
  const columnNames = new Set(
    performanceColumns.rows.map((row) => String(row.name)),
  );
  if (!columnNames.has("cash_balance"))
    await client.execute(
      "ALTER TABLE portfolio_performance ADD COLUMN cash_balance REAL NOT NULL DEFAULT 0",
    );
  if (!columnNames.has("total_value"))
    await client.execute(
      "ALTER TABLE portfolio_performance ADD COLUMN total_value REAL NOT NULL DEFAULT 0",
    );
  if (!columnNames.has("contributed_capital"))
    await client.execute(
      "ALTER TABLE portfolio_performance ADD COLUMN contributed_capital REAL NOT NULL DEFAULT 0",
    );
  await client.execute(
    "UPDATE portfolio_performance SET total_value = market_value WHERE total_value = 0 AND market_value != 0",
  );
  const holdingColumns = await client.execute(
    "PRAGMA table_info(holding_performance)",
  );
  if (
    !holdingColumns.rows.some(
      (row) => String(row.name) === "average_unit_price",
    )
  ) {
    await client.execute(
      "ALTER TABLE holding_performance ADD COLUMN average_unit_price REAL NOT NULL DEFAULT 0",
    );
  }
  const holdingStrategyColumns = await client.execute(
    "PRAGMA table_info(holding_strategies)",
  );
  const hasHoldingStrategyLabel = holdingStrategyColumns.rows.some(
    (row) => String(row.name) === "label",
  );
  const hasHoldingStrategyId = holdingStrategyColumns.rows.some(
    (row) => String(row.name) === "id",
  );
  if (!hasHoldingStrategyLabel || !hasHoldingStrategyId) {
    await client.execute(
      "ALTER TABLE holding_strategies RENAME TO holding_strategies_legacy",
    );
    await client.execute(
      "CREATE TABLE holding_strategies (id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER NOT NULL, symbol TEXT NOT NULL, label TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL, candle_type TEXT NOT NULL DEFAULT '1d', last_signal TEXT, signal_updated_at INTEGER, FOREIGN KEY(portfolio_id, symbol) REFERENCES holdings(portfolio_id, symbol) ON DELETE CASCADE)",
    );
    const labelExpression = hasHoldingStrategyLabel ? "label" : "name";
    await client.execute(
      `INSERT INTO holding_strategies (id, portfolio_id, symbol, label, name, params) SELECT rowid, portfolio_id, symbol, ${labelExpression}, name, params FROM holding_strategies_legacy`,
    );
    await client.execute("DROP TABLE holding_strategies_legacy");
  }
  const currentHoldingStrategyColumns = await client.execute(
    "PRAGMA table_info(holding_strategies)",
  );
  const currentHoldingStrategyColumnNames = new Set(
    currentHoldingStrategyColumns.rows.map((row) => String(row.name)),
  );
  if (!currentHoldingStrategyColumnNames.has("candle_type"))
    await client.execute(
      "ALTER TABLE holding_strategies ADD COLUMN candle_type TEXT NOT NULL DEFAULT '1d'",
    );
  if (!currentHoldingStrategyColumnNames.has("last_signal"))
    await client.execute(
      "ALTER TABLE holding_strategies ADD COLUMN last_signal TEXT",
    );
  if (!currentHoldingStrategyColumnNames.has("signal_updated_at"))
    await client.execute(
      "ALTER TABLE holding_strategies ADD COLUMN signal_updated_at INTEGER",
    );
  const adminUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, "admin"))
    .get();
  if (!adminUser) {
    const now = Date.now();
    await db
      .insert(users)
      .values({
        id: "admin",
        name: "Admin",
        isAnonymous: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const createdAt = Date.now();
    const inserted = await db
      .insert(portfolios)
      .values({ userId: "admin", name: "My watchlist", createdAt })
      .returning({ id: portfolios.id })
      .get();
    await db
      .insert(holdings)
      .values(
        ["MQG.AX", "COL.AX", "XRO.AX", "VGS.AX", "REA.AX"].map((symbol) => ({
          portfolioId: inserted.id,
          symbol,
          addedAt: createdAt,
        })),
      )
      .run();
  }
}

let initialization: Promise<void> | undefined;

function ensureDatabase(): Promise<void> {
  initialization ??= initializeDatabase();
  return initialization;
}

export async function ensureUserProfile(input: {
  id: string;
  name: string;
  email?: string | null;
  image?: string | null;
  googleSubject?: string | null;
  isAnonymous?: boolean;
}): Promise<UserProfile> {
  await ensureDatabase();
  const now = Date.now();
  await db
    .insert(users)
    .values({
      id: input.id,
      name: input.name,
      email: input.email ?? null,
      image: input.image ?? null,
      googleSubject: input.googleSubject ?? null,
      isAnonymous: input.isAnonymous ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: input.name,
        email: input.email ?? null,
        image: input.image ?? null,
        googleSubject: input.googleSubject ?? null,
        isAnonymous: input.isAnonymous ?? false,
        updatedAt: now,
      },
    })
    .run();
  const row = await db.select().from(users).where(eq(users.id, input.id)).get();
  if (!row) throw new Error("Could not create user profile.");
  return row as UserProfile;
}

export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  await ensureDatabase();
  return (
    ((await db.select().from(users).where(eq(users.id, userId)).get()) as
      UserProfile | undefined) ?? null
  );
}

export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  await ensureDatabase();
  const row = await db
    .select({ preferences: userPreferences.preferences })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.preferences);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as UserPreferences)
      : {};
  } catch {
    return {};
  }
}

export async function updateUserPreferences(
  userId: string,
  updates: UserPreferences,
): Promise<UserPreferences> {
  await ensureDatabase();
  const current = await getUserPreferences(userId);
  const preferences = { ...current, ...updates };
  await db
    .insert(userPreferences)
    .values({
      userId,
      preferences: JSON.stringify(preferences),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { preferences: JSON.stringify(preferences), updatedAt: Date.now() },
    })
    .run();
  return preferences;
}

export async function listWebhookConfigs(
  userId: string,
): Promise<WebhookConfig[]> {
  await ensureDatabase();
  const rows = await db
    .select()
    .from(webhookConfigs)
    .where(eq(webhookConfigs.userId, userId))
    .orderBy(webhookConfigs.id)
    .all();
  return rows.map(toWebhookConfig);
}

function toWebhookConfig(
  row: typeof webhookConfigs.$inferSelect,
): WebhookConfig {
  let excludedPortfolioIds: number[] = [];
  try {
    const parsed: unknown = JSON.parse(row.excludedPortfolioIds);
    if (Array.isArray(parsed))
      excludedPortfolioIds = parsed.filter(
        (id): id is number => Number.isSafeInteger(id) && id > 0,
      );
  } catch {
    // Treat malformed legacy values as no exclusions.
  }
  return { ...row, excludedPortfolioIds };
}

export async function createWebhookConfig(
  userId: string,
  input: WebhookConfigInput,
  createdVia: "user" | "mcp" = "user",
): Promise<WebhookConfig> {
  await ensureDatabase();
  const now = Date.now();
  const row = await db
    .insert(webhookConfigs)
    .values({
      userId,
      url: input.url,
      label: input.label ?? "Webhook",
      clientId: input.clientId ?? null,
      secretToken: input.secretToken ?? null,
      excludedPortfolioIds: JSON.stringify(input.excludedPortfolioIds ?? []),
      createdAt: now,
      updatedAt: now,
      createdVia,
    })
    .returning()
    .get();
  return toWebhookConfig(row);
}

export async function updateWebhookConfig(
  userId: string,
  webhookId: number,
  input: WebhookConfigInput,
): Promise<WebhookConfig | null> {
  await ensureDatabase();
  const row = await db
    .update(webhookConfigs)
    .set({
      label: input.label ?? "Webhook",
      url: input.url,
      clientId: input.clientId ?? null,
      secretToken: input.secretToken ?? null,
      excludedPortfolioIds: JSON.stringify(input.excludedPortfolioIds ?? []),
      updatedAt: Date.now(),
    })
    .where(
      and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.userId, userId)),
    )
    .returning()
    .get();
  return row ? toWebhookConfig(row) : null;
}

export async function deleteWebhookConfig(
  userId: string,
  webhookId: number,
): Promise<boolean> {
  await ensureDatabase();
  const row = await db
    .delete(webhookConfigs)
    .where(
      and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.userId, userId)),
    )
    .returning({ id: webhookConfigs.id })
    .get();
  return Boolean(row);
}

export async function updateMcpWebhookConfig(
  userId: string,
  webhookId: number,
  input: WebhookConfigInput,
): Promise<WebhookConfig | null> {
  await ensureDatabase();
  const current = await db
    .select()
    .from(webhookConfigs)
    .where(
      and(
        eq(webhookConfigs.id, webhookId),
        eq(webhookConfigs.userId, userId),
        eq(webhookConfigs.createdVia, "mcp"),
      ),
    )
    .get();
  if (!current) return null;
  const row = await db
    .update(webhookConfigs)
    .set({
      label: input.label ?? current.label,
      url: input.url,
      clientId:
        input.clientId === undefined ? current.clientId : input.clientId,
      secretToken:
        input.secretToken === undefined
          ? current.secretToken
          : input.secretToken,
      excludedPortfolioIds:
        input.excludedPortfolioIds === undefined
          ? current.excludedPortfolioIds
          : JSON.stringify(input.excludedPortfolioIds),
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(webhookConfigs.id, webhookId),
        eq(webhookConfigs.userId, userId),
        eq(webhookConfigs.createdVia, "mcp"),
      ),
    )
    .returning()
    .get();
  return row ? toWebhookConfig(row) : null;
}

export async function deleteMcpWebhookConfig(
  userId: string,
  webhookId: number,
): Promise<boolean> {
  await ensureDatabase();
  const row = await db
    .delete(webhookConfigs)
    .where(
      and(
        eq(webhookConfigs.id, webhookId),
        eq(webhookConfigs.userId, userId),
        eq(webhookConfigs.createdVia, "mcp"),
      ),
    )
    .returning({ id: webhookConfigs.id })
    .get();
  return Boolean(row);
}

export async function createMcpAccessToken(input: {
  userId: string;
  label: string;
  tokenHash: string;
  expiresAt: number;
}): Promise<McpAccessToken> {
  await ensureDatabase();
  const row = await db
    .insert(mcpAccessTokens)
    .values({
      ...input,
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
    })
    .returning()
    .get();
  return row;
}

export async function listMcpAccessTokens(
  userId: string,
): Promise<McpAccessToken[]> {
  await ensureDatabase();
  return db
    .select({
      id: mcpAccessTokens.id,
      userId: mcpAccessTokens.userId,
      label: mcpAccessTokens.label,
      createdAt: mcpAccessTokens.createdAt,
      expiresAt: mcpAccessTokens.expiresAt,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      revokedAt: mcpAccessTokens.revokedAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.userId, userId))
    .orderBy(desc(mcpAccessTokens.createdAt))
    .all();
}

export async function revokeMcpAccessToken(
  userId: string,
  tokenId: number,
): Promise<boolean> {
  await ensureDatabase();
  const row = await db
    .update(mcpAccessTokens)
    .set({ revokedAt: Date.now() })
    .where(
      and(
        eq(mcpAccessTokens.userId, userId),
        eq(mcpAccessTokens.id, tokenId),
        isNull(mcpAccessTokens.revokedAt),
      ),
    )
    .returning({ id: mcpAccessTokens.id })
    .get();
  return Boolean(row);
}

export async function authenticateMcpToken(
  tokenHash: string,
): Promise<{ userId: string; id: number } | null> {
  await ensureDatabase();
  const now = Date.now();
  const token = await db
    .select({ id: mcpAccessTokens.id, userId: mcpAccessTokens.userId })
    .from(mcpAccessTokens)
    .where(
      and(
        eq(mcpAccessTokens.tokenHash, tokenHash),
        isNull(mcpAccessTokens.revokedAt),
      ),
    )
    .get();
  if (!token) return null;
  const active = await db
    .select({ id: mcpAccessTokens.id })
    .from(mcpAccessTokens)
    .where(
      and(
        eq(mcpAccessTokens.id, token.id),
        sql`${mcpAccessTokens.expiresAt} > ${now}`,
      ),
    )
    .get();
  if (!active) return null;
  await db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(mcpAccessTokens.id, token.id))
    .run();
  return token;
}

export async function createMcpSweep(
  input: Omit<McpSweep, "id" | "createdAt">,
  runs: readonly Omit<McpSweepRun, "sweepId">[],
): Promise<McpSweep> {
  await ensureDatabase();
  const sweep = await db
    .insert(mcpSweeps)
    .values({
      ...input,
      createdAt: Date.now(),
    })
    .returning()
    .get();
  for (let offset = 0; offset < runs.length; offset += 100) {
    const batch = runs.slice(offset, offset + 100).map((run) => ({
      sweepId: sweep.id,
      runIndex: run.runIndex,
      params: JSON.stringify(run.params),
      metrics: JSON.stringify(run.metrics),
    }));
    await db.insert(mcpSweepRuns).values(batch).run();
  }
  return sweep;
}

export async function listMcpSweeps(
  userId: string,
  limit = 20,
): Promise<McpSweep[]> {
  await ensureDatabase();
  return db
    .select()
    .from(mcpSweeps)
    .where(eq(mcpSweeps.userId, userId))
    .orderBy(desc(mcpSweeps.createdAt), desc(mcpSweeps.id))
    .limit(Math.max(1, Math.min(Math.floor(limit), 100)))
    .all();
}

export async function getMcpSweep(
  userId: string,
  sweepId: number,
): Promise<McpSweep | null> {
  await ensureDatabase();
  return (
    (await db
      .select()
      .from(mcpSweeps)
      .where(and(eq(mcpSweeps.id, sweepId), eq(mcpSweeps.userId, userId)))
      .get()) ?? null
  );
}

export async function listMcpSweepRuns(
  userId: string,
  sweepId: number,
  offset = 0,
  limit = 50,
): Promise<McpSweepRun[]> {
  await ensureDatabase();
  const ownedSweep = await getMcpSweep(userId, sweepId);
  if (!ownedSweep) return [];
  const rows = await db
    .select()
    .from(mcpSweepRuns)
    .where(eq(mcpSweepRuns.sweepId, sweepId))
    .orderBy(mcpSweepRuns.runIndex)
    .limit(Math.max(1, Math.min(Math.floor(limit), 100)))
    .offset(Math.max(0, Math.floor(offset)))
    .all();
  return rows.map((row) => ({
    sweepId: row.sweepId,
    runIndex: row.runIndex,
    params: JSON.parse(row.params) as StrategyParams,
    metrics: JSON.parse(row.metrics) as Record<string, number>,
  }));
}

export async function getMcpSweepRun(
  userId: string,
  sweepId: number,
  runIndex: number,
): Promise<{ sweep: McpSweep; run: McpSweepRun } | null> {
  await ensureDatabase();
  const sweep = await getMcpSweep(userId, sweepId);
  if (!sweep) return null;
  const row = await db
    .select()
    .from(mcpSweepRuns)
    .where(
      and(
        eq(mcpSweepRuns.sweepId, sweepId),
        eq(mcpSweepRuns.runIndex, runIndex),
      ),
    )
    .get();
  if (!row) return null;
  return {
    sweep,
    run: {
      sweepId: row.sweepId,
      runIndex: row.runIndex,
      params: JSON.parse(row.params) as StrategyParams,
      metrics: JSON.parse(row.metrics) as Record<string, number>,
    },
  };
}

export async function deleteMcpPortfolio(
  id: number,
  userId: string,
): Promise<boolean> {
  await ensureDatabase();
  const row = await db
    .delete(portfolios)
    .where(
      and(
        eq(portfolios.id, id),
        eq(portfolios.userId, userId),
        eq(portfolios.createdVia, "mcp"),
      ),
    )
    .returning({ id: portfolios.id })
    .get();
  return Boolean(row);
}

export async function recordWebhookDeliveryLog(
  input: WebhookDeliveryLogInput,
): Promise<WebhookDeliveryLog> {
  await ensureDatabase();
  const row = await db
    .insert(webhookDeliveryLogs)
    .values({ ...input, message: input.message ?? null, timestamp: Date.now() })
    .returning()
    .get();
  return row;
}

export async function listWebhookDeliveryLogs(
  userId: string,
  limit = 100,
): Promise<WebhookDeliveryLog[]> {
  await ensureDatabase();
  return db
    .select()
    .from(webhookDeliveryLogs)
    .where(eq(webhookDeliveryLogs.userId, userId))
    .orderBy(desc(webhookDeliveryLogs.timestamp), desc(webhookDeliveryLogs.id))
    .limit(Math.max(1, Math.min(Math.floor(limit), 500)))
    .all();
}

export interface TelegramConnection {
  userId: string;
  chatId: string;
  connectedAt: number;
}

export async function getTelegramConnection(
  userId: string,
): Promise<TelegramConnection | null> {
  await ensureDatabase();
  return (
    (await db
      .select()
      .from(telegramConnections)
      .where(eq(telegramConnections.userId, userId))
      .get()) ?? null
  );
}

export async function createTelegramLinkToken(
  userId: string,
  tokenHash: string,
  expiresAt: number,
): Promise<void> {
  await ensureDatabase();
  await db
    .delete(telegramLinkTokens)
    .where(eq(telegramLinkTokens.userId, userId))
    .run();
  await db.insert(telegramLinkTokens).values({
    tokenHash,
    userId,
    expiresAt,
    createdAt: Date.now(),
  });
}

export async function consumeTelegramLinkToken(
  tokenHash: string,
): Promise<string | null> {
  await ensureDatabase();
  const row = await db
    .delete(telegramLinkTokens)
    .where(eq(telegramLinkTokens.tokenHash, tokenHash))
    .returning({
      userId: telegramLinkTokens.userId,
      expiresAt: telegramLinkTokens.expiresAt,
    })
    .get();
  return row && row.expiresAt > Date.now() ? row.userId : null;
}

export async function connectTelegramChat(
  userId: string,
  chatId: string,
): Promise<void> {
  await ensureDatabase();
  await db
    .insert(telegramConnections)
    .values({ userId, chatId, connectedAt: Date.now() })
    .onConflictDoUpdate({
      target: telegramConnections.userId,
      set: { chatId, connectedAt: Date.now() },
    })
    .run();
}

export async function disconnectTelegramConnection(
  userId: string,
): Promise<void> {
  await ensureDatabase();
  await db
    .delete(telegramConnections)
    .where(eq(telegramConnections.userId, userId))
    .run();
  await db
    .delete(telegramLinkTokens)
    .where(eq(telegramLinkTokens.userId, userId))
    .run();
}

export async function disconnectTelegramChat(chatId: string): Promise<void> {
  await ensureDatabase();
  const connection = await db
    .select({ userId: telegramConnections.userId })
    .from(telegramConnections)
    .where(eq(telegramConnections.chatId, chatId))
    .get();
  await db
    .delete(telegramConnections)
    .where(eq(telegramConnections.chatId, chatId))
    .run();
  if (connection)
    await db
      .delete(telegramLinkTokens)
      .where(eq(telegramLinkTokens.userId, connection.userId))
      .run();
}

export async function listPortfolios(
  userId = "admin",
): Promise<Array<Portfolio & { holdings: PortfolioHolding[] }>> {
  await ensureDatabase();
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(portfolios.createdAt)
    .all();
  return Promise.all(
    rows.map(async (portfolio) => ({
      ...portfolio,
      holdings: await db
        .select({ symbol: holdings.symbol, addedAt: holdings.addedAt })
        .from(holdings)
        .where(eq(holdings.portfolioId, portfolio.id))
        .orderBy(holdings.symbol)
        .all(),
    })),
  );
}

export async function listAllPortfolios(): Promise<
  Array<Portfolio & { holdings: PortfolioHolding[] }>
> {
  await ensureDatabase();
  const rows = await db
    .select()
    .from(portfolios)
    .orderBy(portfolios.createdAt)
    .all();
  return Promise.all(
    rows.map(async (portfolio) => ({
      ...portfolio,
      holdings: await db
        .select({ symbol: holdings.symbol, addedAt: holdings.addedAt })
        .from(holdings)
        .where(eq(holdings.portfolioId, portfolio.id))
        .orderBy(holdings.symbol)
        .all(),
    })),
  );
}

export async function createPortfolio(
  name: string,
  userId = "admin",
  createdVia: "user" | "mcp" = "user",
): Promise<Portfolio> {
  await ensureDatabase();
  return db
    .insert(portfolios)
    .values({ userId, name, createdAt: Date.now(), createdVia })
    .returning()
    .get();
}

export async function updatePortfolioName(
  id: number,
  name: string,
  userId = "admin",
): Promise<Portfolio | null> {
  await ensureDatabase();
  const row = await db
    .update(portfolios)
    .set({ name: name.trim() })
    .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
    .returning()
    .get();
  return row ?? null;
}

export async function deletePortfolio(
  id: number,
  userId = "admin",
): Promise<void> {
  await ensureDatabase();
  await db
    .delete(portfolios)
    .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
    .run();
}

export async function ownsPortfolio(
  portfolioId: number,
  userId = "admin",
): Promise<boolean> {
  await ensureDatabase();
  return Boolean(
    await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
      .get(),
  );
}

export async function addHolding(
  portfolioId: number,
  symbol: string,
  userId = "admin",
): Promise<void> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  await db
    .insert(holdings)
    .values({ portfolioId, symbol, addedAt: Date.now() })
    .onConflictDoNothing()
    .run();
}

function parseStrategyParams(value: string): StrategyParams {
  const parsed: unknown = JSON.parse(value);
  if (!isStrategyParams(parsed))
    throw new Error("Stored holding strategy parameters are invalid.");
  return parsed;
}

function isStrategyParams(value: unknown): value is StrategyParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (typeof entry === "number" || typeof entry === "boolean") return true;
    return (
      Array.isArray(entry) &&
      entry.every(
        (item) => typeof item === "number" || typeof item === "boolean",
      )
    );
  });
}

function holdingStrategyFromRow(row: {
  id: number;
  portfolioId: number;
  symbol: string;
  label: string;
  name: string;
  params: string;
  candleType: string;
  lastSignal: string | null;
  signalUpdatedAt: number | null;
}): HoldingStrategy {
  const lastSignal =
    row.lastSignal === "BUY" ||
    row.lastSignal === "SELL" ||
    row.lastSignal === "HOLD"
      ? row.lastSignal
      : null;
  const candleType: CandleInterval = row.candleType === "1h" ? "1h" : "1d";
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    symbol: row.symbol,
    label: row.label,
    name: row.name,
    params: parseStrategyParams(row.params),
    candleType,
    lastSignal,
    signalUpdatedAt: row.signalUpdatedAt,
  };
}

export async function getHoldingStrategy(
  portfolioId: number,
  symbol: string,
  userId = "admin",
): Promise<HoldingStrategy | null> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId))) return null;
  const row = await db
    .select()
    .from(holdingStrategies)
    .where(
      and(
        eq(holdingStrategies.portfolioId, portfolioId),
        eq(holdingStrategies.symbol, symbol),
      ),
    )
    .get();
  return row ? holdingStrategyFromRow(row) : null;
}

export async function listHoldingStrategies(
  portfolioId: number,
  userId = "admin",
): Promise<HoldingStrategy[]> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId))) return [];
  const rows = await db
    .select()
    .from(holdingStrategies)
    .where(eq(holdingStrategies.portfolioId, portfolioId))
    .orderBy(holdingStrategies.symbol)
    .all();
  return rows.map(holdingStrategyFromRow);
}

export async function saveHoldingStrategy(
  input: HoldingStrategyInput,
  userId = "admin",
): Promise<HoldingStrategy> {
  await ensureDatabase();
  if (!(await ownsPortfolio(input.portfolioId, userId)))
    throw new Error("Portfolio not found.");
  if (!input.name.trim()) throw new Error("Holding strategy name is required.");
  if (!input.label.trim()) throw new Error("Holding signal label is required.");
  await db
    .insert(holdings)
    .values({
      portfolioId: input.portfolioId,
      symbol: input.symbol,
      addedAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
  const values = {
    portfolioId: input.portfolioId,
    symbol: input.symbol,
    label: input.label.trim(),
    name: input.name.trim(),
    params: JSON.stringify(input.params),
    candleType: input.candleType ?? "1d",
  };
  const row =
    input.id == null
      ? await db.insert(holdingStrategies).values(values).returning().get()
      : await db
          .update(holdingStrategies)
          .set(values)
          .where(
            and(
              eq(holdingStrategies.id, input.id),
              eq(holdingStrategies.portfolioId, input.portfolioId),
            ),
          )
          .returning()
          .get();
  if (!row) throw new Error("Holding strategy not found.");
  return holdingStrategyFromRow(row);
}

export interface SignalStateChange {
  updatedAt: number;
  changed: boolean;
  previousSignal: SignalType | null;
}

function validSignal(value: string | null): SignalType | null {
  return value === "BUY" || value === "SELL" || value === "HOLD" ? value : null;
}

export async function recordSignalStateChange(
  portfolioId: number,
  strategyId: number,
  signal: SignalType,
  userId = "admin",
  updatedAt = Date.now(),
): Promise<SignalStateChange> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  const row = await db
    .select({
      lastSignal: holdingStrategies.lastSignal,
      signalUpdatedAt: holdingStrategies.signalUpdatedAt,
    })
    .from(holdingStrategies)
    .where(
      and(
        eq(holdingStrategies.id, strategyId),
        eq(holdingStrategies.portfolioId, portfolioId),
      ),
    )
    .get();
  if (!row) throw new Error("Holding strategy not found.");
  const previousSignal = validSignal(row.lastSignal);
  if (row.lastSignal === signal && row.signalUpdatedAt != null)
    return { updatedAt: row.signalUpdatedAt, changed: false, previousSignal };
  const updated = await db
    .update(holdingStrategies)
    .set({ lastSignal: signal, signalUpdatedAt: updatedAt })
    .where(
      and(
        eq(holdingStrategies.id, strategyId),
        eq(holdingStrategies.portfolioId, portfolioId),
        or(
          ne(holdingStrategies.lastSignal, signal),
          isNull(holdingStrategies.lastSignal),
          isNull(holdingStrategies.signalUpdatedAt),
        ),
      ),
    )
    .returning({ signalUpdatedAt: holdingStrategies.signalUpdatedAt })
    .get();
  if (updated)
    return {
      updatedAt: updated.signalUpdatedAt ?? updatedAt,
      changed: previousSignal !== signal,
      previousSignal,
    };
  const latest = await db
    .select({
      lastSignal: holdingStrategies.lastSignal,
      signalUpdatedAt: holdingStrategies.signalUpdatedAt,
    })
    .from(holdingStrategies)
    .where(
      and(
        eq(holdingStrategies.id, strategyId),
        eq(holdingStrategies.portfolioId, portfolioId),
      ),
    )
    .get();
  return {
    updatedAt: latest?.signalUpdatedAt ?? updatedAt,
    changed: false,
    previousSignal: validSignal(latest?.lastSignal ?? null),
  };
}

export async function recordSignalState(
  portfolioId: number,
  strategyId: number,
  signal: SignalType,
  userId = "admin",
  updatedAt = Date.now(),
): Promise<number> {
  return (
    await recordSignalStateChange(
      portfolioId,
      strategyId,
      signal,
      userId,
      updatedAt,
    )
  ).updatedAt;
}

export async function removeHoldingStrategy(
  portfolioId: number,
  id: number,
  symbol: string,
  userId = "admin",
): Promise<void> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  await db
    .delete(holdingStrategies)
    .where(
      and(
        eq(holdingStrategies.portfolioId, portfolioId),
        eq(holdingStrategies.id, id),
        eq(holdingStrategies.symbol, symbol),
      ),
    )
    .run();
}

export async function listTrades(
  portfolioId: number,
): Promise<PortfolioTrade[]> {
  await ensureDatabase();
  return db
    .select()
    .from(trades)
    .where(eq(trades.portfolioId, portfolioId))
    .orderBy(trades.timestamp, trades.id)
    .all() as Promise<PortfolioTrade[]>;
}

export interface PortfolioTradePage {
  trades: PortfolioTrade[];
  tickers: string[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listTradePage(
  portfolioId: number,
  requestedPage: number,
  symbol?: string,
): Promise<PortfolioTradePage> {
  await ensureDatabase();
  const pageSize = 6;
  const where = symbol
    ? and(eq(trades.portfolioId, portfolioId), eq(trades.symbol, symbol))
    : eq(trades.portfolioId, portfolioId);
  const [countRow, tickerRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(trades)
      .where(where)
      .get(),
    db
      .selectDistinct({ symbol: trades.symbol })
      .from(trades)
      .where(eq(trades.portfolioId, portfolioId))
      .orderBy(trades.symbol)
      .all(),
  ]);
  const total = Number(countRow?.count ?? 0);
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, pageCount));
  const tradeRows = total
    ? await db
        .select()
        .from(trades)
        .where(where)
        .orderBy(desc(trades.timestamp), desc(trades.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
    : [];
  return {
    trades: tradeRows as PortfolioTrade[],
    tickers: tickerRows.map((row) => row.symbol),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function listCashTransactions(
  portfolioId: number,
): Promise<PortfolioCashTransaction[]> {
  await ensureDatabase();
  return db
    .select()
    .from(cashTransactions)
    .where(eq(cashTransactions.portfolioId, portfolioId))
    .orderBy(cashTransactions.timestamp, cashTransactions.id)
    .all() as Promise<PortfolioCashTransaction[]>;
}

export interface PortfolioCashTransactionPage {
  transactions: PortfolioCashTransaction[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listCashTransactionPage(
  portfolioId: number,
  requestedPage: number,
): Promise<PortfolioCashTransactionPage> {
  await ensureDatabase();
  const pageSize = 6;
  const where = eq(cashTransactions.portfolioId, portfolioId);
  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(cashTransactions)
    .where(where)
    .get();
  const total = Number(countRow?.count ?? 0);
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, pageCount));
  const rows = total
    ? await db
        .select()
        .from(cashTransactions)
        .where(where)
        .orderBy(desc(cashTransactions.timestamp), desc(cashTransactions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
    : [];
  return {
    transactions: rows as PortfolioCashTransaction[],
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function recordCashTransaction(
  input: Omit<PortfolioCashTransaction, "id">,
  userId = "admin",
): Promise<PortfolioCashTransaction> {
  await ensureDatabase();
  const portfolio = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, userId)),
    )
    .get();
  if (!portfolio) throw new Error("Portfolio not found.");
  return db
    .insert(cashTransactions)
    .values(input)
    .returning()
    .get() as Promise<PortfolioCashTransaction>;
}

export async function updateCashTransaction(
  portfolioId: number,
  transactionId: number,
  input: Omit<PortfolioCashTransaction, "id" | "portfolioId">,
  userId = "admin",
): Promise<PortfolioCashTransaction> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  const transaction = await db
    .update(cashTransactions)
    .set(input)
    .where(
      and(
        eq(cashTransactions.portfolioId, portfolioId),
        eq(cashTransactions.id, transactionId),
      ),
    )
    .returning()
    .get();
  if (!transaction) throw new Error("Cash transaction not found.");
  await db
    .delete(holdingPerformance)
    .where(eq(holdingPerformance.portfolioId, portfolioId))
    .run();
  await db
    .delete(portfolioPerformance)
    .where(eq(portfolioPerformance.portfolioId, portfolioId))
    .run();
  return transaction as PortfolioCashTransaction;
}

export async function deleteCashTransaction(
  portfolioId: number,
  transactionId: number,
  userId = "admin",
): Promise<PortfolioCashTransaction> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  const transaction = await db
    .select()
    .from(cashTransactions)
    .where(
      and(
        eq(cashTransactions.portfolioId, portfolioId),
        eq(cashTransactions.id, transactionId),
      ),
    )
    .get();
  if (!transaction) throw new Error("Cash transaction not found.");
  await db
    .delete(cashTransactions)
    .where(
      and(
        eq(cashTransactions.portfolioId, portfolioId),
        eq(cashTransactions.id, transactionId),
      ),
    )
    .run();
  await db
    .delete(holdingPerformance)
    .where(eq(holdingPerformance.portfolioId, portfolioId))
    .run();
  await db
    .delete(portfolioPerformance)
    .where(eq(portfolioPerformance.portfolioId, portfolioId))
    .run();
  return transaction as PortfolioCashTransaction;
}

export async function recordTrade(
  input: Omit<PortfolioTrade, "id">,
  userId = "admin",
): Promise<PortfolioTrade> {
  await ensureDatabase();
  const portfolio = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, userId)),
    )
    .get();
  if (!portfolio) throw new Error("Portfolio not found.");

  const previousTrades = await db
    .select({
      id: trades.id,
      side: trades.side,
      quantity: trades.quantity,
      timestamp: trades.timestamp,
    })
    .from(trades)
    .where(
      and(
        eq(trades.portfolioId, input.portfolioId),
        eq(trades.symbol, input.symbol),
      ),
    )
    .all();
  const chronologicalTrades = [
    ...previousTrades,
    { ...input, id: Number.MAX_SAFE_INTEGER },
  ].sort(
    (left, right) => left.timestamp - right.timestamp || left.id - right.id,
  );
  let currentQuantity = 0;
  for (const trade of chronologicalTrades) {
    currentQuantity += trade.side === "BUY" ? trade.quantity : -trade.quantity;
    if (currentQuantity < -1e-8)
      throw new Error(
        "Sell quantity exceeds the units held at the selected trade time.",
      );
  }

  const inserted = await db.insert(trades).values(input).returning().get();
  await db
    .insert(holdings)
    .values({
      portfolioId: input.portfolioId,
      symbol: input.symbol,
      addedAt: input.timestamp,
    })
    .onConflictDoNothing()
    .run();
  return inserted as PortfolioTrade;
}

export async function deletePortfolioTrade(
  portfolioId: number,
  tradeId: number,
  userId = "admin",
): Promise<PortfolioTrade> {
  await ensureDatabase();
  const portfolio = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .get();
  if (!portfolio) throw new Error("Portfolio not found.");
  const trade = await db
    .select()
    .from(trades)
    .where(and(eq(trades.portfolioId, portfolioId), eq(trades.id, tradeId)))
    .get();
  if (!trade) throw new Error("Trade not found.");

  const remainingTrades = await db
    .select()
    .from(trades)
    .where(
      and(eq(trades.portfolioId, portfolioId), eq(trades.symbol, trade.symbol)),
    )
    .all();
  let quantity = 0;
  for (const remaining of remainingTrades
    .filter((row) => row.id !== tradeId)
    .sort(
      (left, right) => left.timestamp - right.timestamp || left.id - right.id,
    )) {
    quantity +=
      remaining.side === "BUY" ? remaining.quantity : -remaining.quantity;
    if (quantity < -1e-8)
      throw new Error(
        "Cannot delete this trade because a later sell would exceed the remaining position. Delete or correct the dependent sell first.",
      );
  }

  await db
    .delete(trades)
    .where(and(eq(trades.portfolioId, portfolioId), eq(trades.id, tradeId)))
    .run();
  await db
    .delete(holdingPerformance)
    .where(eq(holdingPerformance.portfolioId, portfolioId))
    .run();
  await db
    .delete(portfolioPerformance)
    .where(eq(portfolioPerformance.portfolioId, portfolioId))
    .run();
  return trade as PortfolioTrade;
}

export async function updatePortfolioTrade(
  portfolioId: number,
  tradeId: number,
  input: Omit<PortfolioTrade, "id" | "portfolioId">,
  userId = "admin",
): Promise<{ trade: PortfolioTrade; previousSymbol: string }> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  const existing = await db
    .select()
    .from(trades)
    .where(and(eq(trades.portfolioId, portfolioId), eq(trades.id, tradeId)))
    .get();
  if (!existing) throw new Error("Trade not found.");
  const allTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.portfolioId, portfolioId))
    .all();
  const candidate = { ...input, id: tradeId, portfolioId };
  const resultingTrades = [
    ...allTrades.filter((trade) => trade.id !== tradeId),
    candidate,
  ];
  const symbols = new Set(resultingTrades.map((trade) => trade.symbol));
  for (const symbol of symbols) {
    let quantity = 0;
    const ordered = resultingTrades
      .filter((trade) => trade.symbol === symbol)
      .sort(
        (left, right) => left.timestamp - right.timestamp || left.id - right.id,
      );
    for (const trade of ordered) {
      quantity += trade.side === "BUY" ? trade.quantity : -trade.quantity;
      if (quantity < -1e-8)
        throw new Error(
          "Trade update would make a position negative before a later buy.",
        );
    }
  }
  const updated = await db
    .update(trades)
    .set(input)
    .where(and(eq(trades.portfolioId, portfolioId), eq(trades.id, tradeId)))
    .returning()
    .get();
  if (!updated) throw new Error("Trade not found.");
  await db
    .insert(holdings)
    .values({ portfolioId, symbol: input.symbol, addedAt: input.timestamp })
    .onConflictDoNothing()
    .run();
  await db
    .delete(holdingPerformance)
    .where(eq(holdingPerformance.portfolioId, portfolioId))
    .run();
  await db
    .delete(portfolioPerformance)
    .where(eq(portfolioPerformance.portfolioId, portfolioId))
    .run();
  return { trade: updated as PortfolioTrade, previousSymbol: existing.symbol };
}

async function requireMcpPortfolio(
  portfolioId: number,
  userId: string,
): Promise<void> {
  await ensureDatabase();
  const portfolio = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, portfolioId),
        eq(portfolios.userId, userId),
        eq(portfolios.createdVia, "mcp"),
      ),
    )
    .get();
  if (!portfolio) throw new Error("MCP-created portfolio not found.");
}

export async function recordMcpTrade(
  input: Omit<PortfolioTrade, "id">,
  userId: string,
): Promise<PortfolioTrade> {
  await requireMcpPortfolio(input.portfolioId, userId);
  return recordTrade(input, userId);
}

export async function updateMcpTrade(
  portfolioId: number,
  tradeId: number,
  input: Omit<PortfolioTrade, "id" | "portfolioId">,
  userId: string,
): Promise<{ trade: PortfolioTrade; previousSymbol: string }> {
  await requireMcpPortfolio(portfolioId, userId);
  return updatePortfolioTrade(portfolioId, tradeId, input, userId);
}

export async function deleteMcpTrade(
  portfolioId: number,
  tradeId: number,
  userId: string,
): Promise<PortfolioTrade> {
  await requireMcpPortfolio(portfolioId, userId);
  return deletePortfolioTrade(portfolioId, tradeId, userId);
}

export async function recordMcpCashTransaction(
  input: Omit<PortfolioCashTransaction, "id">,
  userId: string,
): Promise<PortfolioCashTransaction> {
  await requireMcpPortfolio(input.portfolioId, userId);
  return recordCashTransaction(input, userId);
}

export async function updateMcpCashTransaction(
  portfolioId: number,
  transactionId: number,
  input: Omit<PortfolioCashTransaction, "id" | "portfolioId">,
  userId: string,
): Promise<PortfolioCashTransaction> {
  await requireMcpPortfolio(portfolioId, userId);
  return updateCashTransaction(portfolioId, transactionId, input, userId);
}

export async function deleteMcpCashTransaction(
  portfolioId: number,
  transactionId: number,
  userId: string,
): Promise<PortfolioCashTransaction> {
  await requireMcpPortfolio(portfolioId, userId);
  return deleteCashTransaction(portfolioId, transactionId, userId);
}

export async function removeHolding(
  portfolioId: number,
  symbol: string,
  userId = "admin",
): Promise<void> {
  await ensureDatabase();
  if (!(await ownsPortfolio(portfolioId, userId)))
    throw new Error("Portfolio not found.");
  await db
    .delete(holdings)
    .where(
      sql`${holdings.portfolioId} = ${portfolioId} AND ${holdings.symbol} = ${symbol}`,
    )
    .run();
  await db
    .delete(holdingStrategies)
    .where(
      sql`${holdingStrategies.portfolioId} = ${portfolioId} AND ${holdingStrategies.symbol} = ${symbol}`,
    )
    .run();
}

export async function getCandles(
  symbol: string,
  interval: CandleInterval,
): Promise<Candle[]> {
  await ensureDatabase();
  return db
    .select()
    .from(candles)
    .where(
      sql`${candles.symbol} = ${symbol} AND ${candles.interval} = ${interval}`,
    )
    .orderBy(candles.timestamp)
    .all() as Promise<Candle[]>;
}

export async function saveCandles(
  interval: CandleInterval,
  rows: readonly Candle[],
): Promise<void> {
  await ensureDatabase();
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows
      .slice(index, index + 100)
      .map((candle) => ({ ...candle, interval }));
    await db
      .insert(candles)
      .values(batch)
      .onConflictDoUpdate({
        target: [candles.symbol, candles.interval, candles.timestamp],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
        },
      })
      .run();
  }
}

export async function evictExpiredTimeSeriesData(
  referenceTime = Date.now(),
): Promise<void> {
  await ensureDatabase();
  const hourlyCutoff = referenceTime - TIME_SERIES_RETENTION_MS;
  const dailyCandleCutoff = referenceTime - DAILY_CANDLE_RETENTION_MS;
  await Promise.all([
    db
      .delete(candles)
      .where(
        sql`(${candles.interval} = '1d' AND ${candles.timestamp} < ${dailyCandleCutoff}) OR (${candles.interval} != '1d' AND ${candles.timestamp} < ${hourlyCutoff})`,
      )
      .run(),
    db
      .delete(holdingPerformance)
      .where(sql`${holdingPerformance.timestamp} < ${hourlyCutoff}`)
      .run(),
    db
      .delete(portfolioPerformance)
      .where(sql`${portfolioPerformance.timestamp} < ${hourlyCutoff}`)
      .run(),
  ]);
}

export async function recordAlert(
  portfolioId: number,
  result: {
    symbol: string;
    strategyId: string;
    signal: string;
    timestamp: number;
    price: number;
    rationale: string;
    indicators: Record<string, number>;
  },
  userId = "admin",
): Promise<void> {
  await ensureDatabase();
  await db
    .insert(alerts)
    .values({
      userId,
      portfolioId,
      ...result,
      indicators: JSON.stringify(result.indicators),
    })
    .onConflictDoNothing()
    .run();
}

export async function listAlerts(
  portfolioId?: number,
  userId = "admin",
): Promise<Array<Record<string, unknown>>> {
  await ensureDatabase();
  const rows = portfolioId
    ? await db
        .select()
        .from(alerts)
        .where(
          and(eq(alerts.userId, userId), eq(alerts.portfolioId, portfolioId)),
        )
        .orderBy(desc(alerts.timestamp))
        .limit(100)
        .all()
    : await db
        .select()
        .from(alerts)
        .where(eq(alerts.userId, userId))
        .orderBy(desc(alerts.timestamp))
        .limit(100)
        .all();
  return rows.map((row) => ({
    ...row,
    indicators: JSON.parse(row.indicators) as Record<string, number>,
  }));
}

export async function deleteAlert(
  alertId: number,
  userId = "admin",
): Promise<boolean> {
  await ensureDatabase();
  const result = await db
    .delete(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId)))
    .run();
  return result.rowsAffected > 0;
}

export async function savePerformanceSnapshots(
  portfolioId: number,
  snapshots: PerformanceSnapshots,
): Promise<void> {
  await ensureDatabase();
  for (let index = 0; index < snapshots.holdings.length; index += 100) {
    const batch = snapshots.holdings
      .slice(index, index + 100)
      .map((point: HoldingPerformancePoint) => ({ portfolioId, ...point }));
    await db
      .insert(holdingPerformance)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          holdingPerformance.portfolioId,
          holdingPerformance.symbol,
          holdingPerformance.timestamp,
        ],
        set: {
          quantity: sql`excluded.quantity`,
          marketPrice: sql`excluded.market_price`,
          averageUnitPrice: sql`excluded.average_unit_price`,
          marketValue: sql`excluded.market_value`,
          profitLoss: sql`excluded.profit_loss`,
        },
      })
      .run();
  }
  for (let index = 0; index < snapshots.portfolio.length; index += 100) {
    const batch = snapshots.portfolio
      .slice(index, index + 100)
      .map((point: PortfolioPerformancePoint) => ({ portfolioId, ...point }));
    await db
      .insert(portfolioPerformance)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          portfolioPerformance.portfolioId,
          portfolioPerformance.timestamp,
        ],
        set: {
          cashBalance: sql`excluded.cash_balance`,
          marketValue: sql`excluded.market_value`,
          totalValue: sql`excluded.total_value`,
          contributedCapital: sql`excluded.contributed_capital`,
          profitLoss: sql`excluded.profit_loss`,
        },
      })
      .run();
  }
}

export async function listPerformance(
  portfolioId: number,
): Promise<PerformanceSnapshots> {
  await ensureDatabase();
  const holdingCutoff = Date.now() - 365 * 24 * 60 * 60_000;
  const portfolioCutoff = Date.now() - 365 * 24 * 60 * 60_000;
  const [holdingRows, portfolioRows] = await Promise.all([
    db
      .select()
      .from(holdingPerformance)
      .where(
        and(
          eq(holdingPerformance.portfolioId, portfolioId),
          sql`${holdingPerformance.timestamp} >= ${holdingCutoff}`,
        ),
      )
      .orderBy(holdingPerformance.timestamp)
      .all(),
    db
      .select()
      .from(portfolioPerformance)
      .where(
        and(
          eq(portfolioPerformance.portfolioId, portfolioId),
          sql`${portfolioPerformance.timestamp} >= ${portfolioCutoff}`,
        ),
      )
      .orderBy(portfolioPerformance.timestamp)
      .all(),
  ]);
  return {
    holdings: holdingRows as HoldingPerformancePoint[],
    portfolio: portfolioRows as PortfolioPerformancePoint[],
  };
}

export async function listPortfolioTradeSymbols(
  portfolioId: number,
): Promise<string[]> {
  await ensureDatabase();
  const rows = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .where(eq(trades.portfolioId, portfolioId))
    .all();
  return rows.map((row) => row.symbol);
}
