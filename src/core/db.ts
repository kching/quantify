import 'server-only';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Candle, CandleInterval, Portfolio, PortfolioHolding } from './types';

const users = sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() });
const portfolios = sqliteTable('portfolios', {
  id: integer('id').primaryKey({ autoIncrement: true }), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), createdAt: integer('created_at').notNull(),
}, (table) => [uniqueIndex('portfolios_user_name').on(table.userId, table.name)]);
const holdings = sqliteTable('holdings', {
  portfolioId: integer('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(), addedAt: integer('added_at').notNull(),
}, (table) => [uniqueIndex('holdings_portfolio_symbol').on(table.portfolioId, table.symbol)]);
const candles = sqliteTable('candles', {
  symbol: text('symbol').notNull(), interval: text('interval').notNull(), timestamp: integer('timestamp').notNull(),
  open: real('open').notNull(), high: real('high').notNull(), low: real('low').notNull(), close: real('close').notNull(), volume: real('volume').notNull(),
}, (table) => [uniqueIndex('candles_symbol_interval_timestamp').on(table.symbol, table.interval, table.timestamp), index('candles_symbol_interval').on(table.symbol, table.interval)]);
const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portfolioId: integer('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }), symbol: text('symbol').notNull(),
  strategyId: text('strategy_id').notNull(), signal: text('signal').notNull(), timestamp: integer('timestamp').notNull(),
  price: real('price').notNull(), rationale: text('rationale').notNull(), indicators: text('indicators').notNull(),
}, (table) => [uniqueIndex('alerts_once_per_candle').on(table.portfolioId, table.symbol, table.strategyId, table.signal, table.timestamp)]);

const dbPath = process.env.QUANTIFY_DB_PATH ?? join(process.cwd(), 'data', 'quantify.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const client = createClient({ url: `file:${dbPath}` });
export const db = drizzle({ client, schema: { users, portfolios, holdings, candles, alerts } });

async function initializeDatabase(): Promise<void> {
  await client.executeMultiple(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portfolios (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id, name));
    CREATE TABLE IF NOT EXISTS holdings (portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY(portfolio_id, symbol));
    CREATE TABLE IF NOT EXISTS candles (symbol TEXT NOT NULL, interval TEXT NOT NULL, timestamp INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, PRIMARY KEY(symbol, interval, timestamp));
    CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, symbol TEXT NOT NULL, strategy_id TEXT NOT NULL, signal TEXT NOT NULL, timestamp INTEGER NOT NULL, price REAL NOT NULL, rationale TEXT NOT NULL, indicators TEXT NOT NULL, UNIQUE(portfolio_id, symbol, strategy_id, signal, timestamp));
  `);
  const adminUser = await db.select({ id: users.id }).from(users).where(eq(users.id, 'admin')).get();
  if (!adminUser) {
    await db.insert(users).values({ id: 'admin', name: 'Admin' }).run();
    const createdAt = Date.now();
    const inserted = await db.insert(portfolios).values({ userId: 'admin', name: 'My watchlist', createdAt }).returning({ id: portfolios.id }).get();
    await db.insert(holdings).values(['MQG.AX', 'COL.AX', 'XRO.AX', 'VGS.AX', 'REA.AX'].map((symbol) => ({ portfolioId: inserted.id, symbol, addedAt: createdAt }))).run();
  }
}

let initialization: Promise<void> | undefined;

function ensureDatabase(): Promise<void> {
  initialization ??= initializeDatabase();
  return initialization;
}

export async function listPortfolios(): Promise<Array<Portfolio & { holdings: PortfolioHolding[] }>> {
  await ensureDatabase();
  const rows = await db.select().from(portfolios).where(eq(portfolios.userId, 'admin')).orderBy(portfolios.createdAt).all();
  return Promise.all(rows.map(async (portfolio) => ({
    ...portfolio, holdings: await db.select({ symbol: holdings.symbol, addedAt: holdings.addedAt }).from(holdings).where(eq(holdings.portfolioId, portfolio.id)).orderBy(holdings.symbol).all(),
  })));
}

export async function createPortfolio(name: string): Promise<Portfolio> {
  await ensureDatabase();
  return db.insert(portfolios).values({ userId: 'admin', name, createdAt: Date.now() }).returning().get();
}

export async function deletePortfolio(id: number): Promise<void> {
  await ensureDatabase();
  await db.delete(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.userId, 'admin'))).run();
}

export async function addHolding(portfolioId: number, symbol: string): Promise<void> {
  await ensureDatabase();
  await db.insert(holdings).values({ portfolioId, symbol, addedAt: Date.now() }).onConflictDoNothing().run();
}

export async function removeHolding(portfolioId: number, symbol: string): Promise<void> {
  await ensureDatabase();
  await db.delete(holdings).where(sql`${holdings.portfolioId} = ${portfolioId} AND ${holdings.symbol} = ${symbol}`).run();
}

export async function getCandles(symbol: string, interval: CandleInterval): Promise<Candle[]> {
  await ensureDatabase();
  return db.select().from(candles).where(sql`${candles.symbol} = ${symbol} AND ${candles.interval} = ${interval}`).orderBy(candles.timestamp).all() as Promise<Candle[]>;
}

export async function saveCandles(interval: CandleInterval, rows: readonly Candle[]): Promise<void> {
  await ensureDatabase();
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100).map((candle) => ({ ...candle, interval }));
    await db.insert(candles).values(batch).onConflictDoUpdate({ target: [candles.symbol, candles.interval, candles.timestamp], set: {
      open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`,
    } }).run();
  }
}

export async function recordAlert(portfolioId: number, result: { symbol: string; strategyId: string; signal: string; timestamp: number; price: number; rationale: string; indicators: Record<string, number> }): Promise<void> {
  await ensureDatabase();
  await db.insert(alerts).values({ userId: 'admin', portfolioId, ...result, indicators: JSON.stringify(result.indicators) }).onConflictDoNothing().run();
}

export async function listAlerts(portfolioId?: number): Promise<Array<Record<string, unknown>>> {
  await ensureDatabase();
  const rows = portfolioId
    ? await db.select().from(alerts).where(sql`${alerts.userId} = 'admin' AND ${alerts.portfolioId} = ${portfolioId}`).orderBy(desc(alerts.timestamp)).limit(100).all()
    : await db.select().from(alerts).where(eq(alerts.userId, 'admin')).orderBy(desc(alerts.timestamp)).limit(100).all();
  return rows.map((row) => ({ ...row, indicators: JSON.parse(row.indicators) as Record<string, number> }));
}
