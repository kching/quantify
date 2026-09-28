import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Candle, Portfolio } from '@/core/types';

const seededPortfolios = [
  {
    id: 1,
    userId: 'admin',
    name: 'My watchlist',
    createdAt: 1,
    holdings: [{ symbol: 'MQG.AX', addedAt: 1 }],
  },
];
let portfolios = structuredClone(seededPortfolios);
let alerts: Array<Record<string, unknown>> = [];
let candles: Candle[] = [];

const listPortfolios = mock(async () => portfolios);
const createPortfolio = mock(async (name: string): Promise<Portfolio> => {
  if (portfolios.some((portfolio) => portfolio.name === name)) throw new Error('duplicate');
  const portfolio: Portfolio = { id: portfolios.length + 1, userId: 'admin', name, createdAt: 2 };
  portfolios.push({ ...portfolio, holdings: [] });
  return portfolio;
});
const deletePortfolio = mock(async (id: number) => {
  portfolios = portfolios.filter((portfolio) => portfolio.id !== id);
});
const addHolding = mock(async (id: number, symbol: string) => {
  const portfolio = portfolios.find((item) => item.id === id);
  if (!portfolio) throw new Error('not found');
  if (!portfolio.holdings.some((holding) => holding.symbol === symbol)) portfolio.holdings.push({ symbol, addedAt: 3 });
});
const removeHolding = mock(async (id: number, symbol: string) => {
  const portfolio = portfolios.find((item) => item.id === id);
  if (portfolio) portfolio.holdings = portfolio.holdings.filter((holding) => holding.symbol !== symbol);
});
const getCandles = mock(async (symbol: string) => candles.filter((candle) => candle.symbol === symbol));
const saveCandles = mock(async (_interval: string, rows: readonly Candle[]) => { candles = [...candles, ...rows]; });
const listAlerts = mock(async () => alerts);
const scanPortfolio = mock(async (portfolioId: number) => ({ portfolioId, scanned: 1 }));
const runBacktest = mock(() => ({ symbol: 'TEST.AX', strategyId: 'klinger-oscillator', trades: [] }));
const fetchYahooCandles = mock(async () => [] as Candle[]);

mock.module('@/core/db', () => ({
  listPortfolios, createPortfolio, deletePortfolio, addHolding, removeHolding,
  getCandles, saveCandles, listAlerts,
}));
mock.module('@/core/market', () => ({ scanPortfolio }));
mock.module('@/core/backtest', () => ({ runBacktest }));
mock.module('@/core/engine', () => ({
  strategies: [{ id: 'klinger-oscillator', name: 'Klinger', analyze: () => ({}) }],
}));
mock.module('@/core/providers/yahoo.provider', () => ({ fetchYahooCandles }));

const portfoliosRoute = await import('./portfolios/route');
const portfolioRoute = await import('./portfolios/[id]/route');
const holdingsRoute = await import('./portfolios/[id]/holdings/route');
const alertsRoute = await import('./alerts/route');
const scanRoute = await import('./scan/route');
const backtestRoute = await import('./backtest/route');

function request(url: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('API route handlers', () => {
  beforeEach(() => {
    portfolios = structuredClone(seededPortfolios);
    alerts = [];
    candles = [];
    for (const handler of [listPortfolios, createPortfolio, deletePortfolio, addHolding, removeHolding, getCandles, saveCandles, listAlerts, scanPortfolio, runBacktest, fetchYahooCandles]) handler.mockClear();
  });

  describe('/api/portfolios', () => {
    it('lists portfolios and their holdings', async () => {
      const response = await portfoliosRoute.GET();
      expect(response.status).toBe(200);
      expect((await payload(response)).portfolios).toEqual(seededPortfolios);
    });

    it('validates and creates a portfolio', async () => {
      expect((await portfoliosRoute.POST(request('/api/portfolios', 'POST', { name: '  ' }))).status).toBe(400);
      const response = await portfoliosRoute.POST(request('/api/portfolios', 'POST', { name: 'Growth' }));
      expect(response.status).toBe(201);
      expect((await payload(response)).portfolio).toMatchObject({ name: 'Growth', holdings: [] });
      expect(createPortfolio).toHaveBeenCalledWith('Growth');
    });

    it('rejects duplicate portfolio names', async () => {
      const response = await portfoliosRoute.POST(request('/api/portfolios', 'POST', { name: 'My watchlist' }));
      expect(response.status).toBe(409);
    });
  });

  describe('/api/portfolios/[id]', () => {
    it('rejects malformed ids and deletes valid portfolios', async () => {
      expect((await portfolioRoute.DELETE(request('/api/portfolios/nope', 'DELETE'), context('nope'))).status).toBe(400);
      const response = await portfolioRoute.DELETE(request('/api/portfolios/1', 'DELETE'), context('1'));
      expect(response.status).toBe(200);
      expect(await payload(response)).toEqual({ ok: true });
      expect(deletePortfolio).toHaveBeenCalledWith(1);
    });
  });

  describe('/api/portfolios/[id]/holdings', () => {
    it('normalizes symbols and rejects invalid symbols', async () => {
      const invalid = await holdingsRoute.POST(request('/api/portfolios/1/holdings', 'POST', { symbol: 'bad symbol' }), context('1'));
      expect(invalid.status).toBe(400);
      const response = await holdingsRoute.POST(request('/api/portfolios/1/holdings', 'POST', { symbol: ' csl ' }), context('1'));
      expect(response.status).toBe(201);
      expect(addHolding).toHaveBeenCalledWith(1, 'CSL.AX');
    });

    it('returns not found when adding to an unknown portfolio', async () => {
      const response = await holdingsRoute.POST(request('/api/portfolios/99/holdings', 'POST', { symbol: 'CSL' }), context('99'));
      expect(response.status).toBe(404);
    });

    it('validates and removes a holding', async () => {
      expect((await holdingsRoute.DELETE(request('/api/portfolios/1/holdings?symbol=bad%20symbol', 'DELETE'), context('1'))).status).toBe(400);
      const response = await holdingsRoute.DELETE(request('/api/portfolios/1/holdings?symbol=mqg.ax', 'DELETE'), context('1'));
      expect(response.status).toBe(200);
      expect(removeHolding).toHaveBeenCalledWith(1, 'MQG.AX');
    });
  });

  it('validates and filters alert requests', async () => {
    expect((await alertsRoute.GET(request('/api/alerts?portfolioId=0'))).status).toBe(400);
    const response = await alertsRoute.GET(request('/api/alerts?portfolioId=1'));
    expect(response.status).toBe(200);
    expect(await payload(response)).toEqual({ alerts: [] });
    expect(listAlerts).toHaveBeenCalledWith(1);
  });

  it('only scans an existing portfolio and returns scan errors as 500', async () => {
    expect((await scanRoute.GET(request('/api/scan?portfolioId=99'))).status).toBe(404);
    expect(scanPortfolio).not.toHaveBeenCalled();
    scanPortfolio.mockRejectedValueOnce(new Error('provider unavailable'));
    const response = await scanRoute.GET(request('/api/scan?portfolioId=1'));
    expect(response.status).toBe(500);
    expect(await payload(response)).toEqual({ error: 'provider unavailable' });
  });

  describe('/api/backtest', () => {
    it('rejects an invalid ticker or strategy', async () => {
      expect((await backtestRoute.GET(request('/api/backtest?symbol=bad%20ticker'))).status).toBe(400);
      expect((await backtestRoute.GET(request('/api/backtest?symbol=MQG.AX&strategy=unknown'))).status).toBe(400);
    });

    it('returns 422 when there are too few cached candles', async () => {
      const response = await backtestRoute.GET(request('/api/backtest?symbol=MQG.AX'));
      expect(response.status).toBe(422);
      expect(fetchYahooCandles).toHaveBeenCalledWith('MQG.AX', '1d', 1825);
    });

    it('uses cached candles for a valid backtest', async () => {
      const now = Date.now();
      candles = Array.from({ length: 80 }, (_, index) => ({
        symbol: 'MQG.AX', timestamp: now - (79 - index) * 86_400_000,
        open: 100, high: 102, low: 99, close: 101, volume: 1_000,
      }));
      const response = await backtestRoute.GET(request('/api/backtest?symbol=MQG.AX&days=365'));
      expect(response.status).toBe(200);
      expect((await payload(response)).result).toEqual({ symbol: 'TEST.AX', strategyId: 'klinger-oscillator', trades: [] });
      expect(fetchYahooCandles).not.toHaveBeenCalled();
      expect(runBacktest).toHaveBeenCalledTimes(1);
    });

    it('returns 502 when history cannot be fetched', async () => {
      fetchYahooCandles.mockRejectedValueOnce(new Error('Yahoo unavailable'));
      const response = await backtestRoute.GET(request('/api/backtest?symbol=MQG.AX'));
      expect(response.status).toBe(502);
      expect(await payload(response)).toEqual({ error: 'Yahoo unavailable' });
    });
  });
});
