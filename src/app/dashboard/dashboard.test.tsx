import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import type { Candle, Portfolio, SignalResult } from '@/core/types';

GlobalRegistrator.register();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: Dashboard } = await import('./dashboard');

interface PortfolioWithHoldings extends Portfolio {
  holdings: Array<{ symbol: string; addedAt: number }>;
}

const initialPortfolio: PortfolioWithHoldings = {
  id: 1,
  userId: 'admin',
  name: 'My watchlist',
  createdAt: 1,
  holdings: [{ symbol: 'MQG.AX', addedAt: 1 }],
};

const buySignal: SignalResult = {
  symbol: 'MQG.AX', strategyId: 'klinger-oscillator', strategyName: 'Klinger Volume Oscillator',
  signal: 'BUY', timestamp: 1_700_000_000_000, price: 200, rationale: 'KVO crossed above its signal line.',
  indicators: { kvo: 1.4, signal: 0.8 },
};
const rsiSignal: SignalResult = {
  ...buySignal, strategyId: 'rsi-14', strategyName: 'RSI (14)', signal: 'HOLD',
  rationale: 'RSI is neutral.', indicators: { rsi: 52 },
};
const backtestResult = {
  symbol: 'MQG.AX', strategyId: 'rsi-14', initialBalance: 10_000, finalBalance: 11_250,
  totalReturnPct: 12.5, winRatePct: 60, maxDrawdownPct: -8.2, trades: [{ entryDate: 1, exitDate: 2, entryPrice: 100, exitPrice: 110, pnlPct: 10 }],
};

let portfolios: PortfolioWithHoldings[];
let scanPayload: { signals: Array<{ daily: SignalResult[]; hourly: SignalResult[]; dailyCandles: Candle[]; hourlyCandles: Candle[] }>; warnings: string[] };
let alerts: Array<SignalResult & { id: number; portfolioId: number }>;
let scanStatus = 200;
let backtestStatus = 200;
let confirmMock: ReturnType<typeof mock>;
const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input), 'http://localhost');
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : {};

  if (url.pathname === '/api/portfolios' && method === 'GET') return Response.json({ portfolios });
  if (url.pathname === '/api/portfolios' && method === 'POST') {
    const portfolio: PortfolioWithHoldings = { id: 2, userId: 'admin', name: body.name, createdAt: 2, holdings: [] };
    portfolios = [...portfolios, portfolio];
    return Response.json({ portfolio }, { status: 201 });
  }
  if (url.pathname === '/api/portfolios/1' && method === 'DELETE') {
    portfolios = portfolios.filter((portfolio) => portfolio.id !== 1);
    return Response.json({ ok: true });
  }
  const holdingMatch = url.pathname.match(/^\/api\/portfolios\/(\d+)\/holdings$/);
  if (holdingMatch && method === 'POST') {
    const portfolio = portfolios.find((item) => item.id === Number(holdingMatch[1]));
    const symbol = body.symbol.toUpperCase();
    if (portfolio) portfolio.holdings.push({ symbol: symbol.endsWith('.AX') ? symbol : `${symbol}.AX`, addedAt: 3 });
    return Response.json({ ok: true }, { status: 201 });
  }
  if (holdingMatch && method === 'DELETE') {
    const portfolio = portfolios.find((item) => item.id === Number(holdingMatch[1]));
    if (portfolio) portfolio.holdings = portfolio.holdings.filter((holding) => holding.symbol !== url.searchParams.get('symbol'));
    return Response.json({ ok: true });
  }
  if (url.pathname === '/api/scan') {
    return scanStatus === 200
      ? Response.json(scanPayload)
      : Response.json({ error: 'Market scan failed' }, { status: scanStatus });
  }
  if (url.pathname === '/api/alerts') return Response.json({ alerts });
  if (url.pathname === '/api/backtest') return Response.json(backtestStatus === 200 ? { result: backtestResult } : { error: 'Not enough candle history.' }, { status: backtestStatus });
  throw new Error(`Unexpected dashboard request: ${method} ${url.pathname}`);
});

beforeEach(() => {
  portfolios = structuredClone([initialPortfolio]);
  scanPayload = {
    signals: [{ daily: [buySignal, rsiSignal], hourly: [{ ...buySignal, signal: 'HOLD' }], dailyCandles: [], hourlyCandles: [
      { symbol: 'MQG.AX', timestamp: 1, open: 198, high: 202, low: 197, close: 200, volume: 10_000 },
      { symbol: 'MQG.AX', timestamp: 2, open: 200, high: 205, low: 199, close: 204, volume: 12_000 },
    ] }],
    warnings: [],
  };
  alerts = [{ ...buySignal, id: 10, portfolioId: 1 }];
  scanStatus = 200;
  backtestStatus = 200;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  confirmMock = mock(() => true);
  window.confirm = confirmMock as unknown as typeof window.confirm;
});

afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    cleanup();
  });
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('Dashboard', () => {
  it('loads portfolios, scans the selected watchlist and displays daily/hourly context and alerts', async () => {
    render(<Dashboard />);

    expect(await screen.findByRole('option', { name: 'My watchlist' })).toBeDefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scan?portfolioId=1'));
    expect(await screen.findByText('KVO crossed above its signal line.')).toBeDefined();
    expect(screen.getByText('RSI 52')).toBeDefined();
    expect(screen.getAllByText('BUY')).toHaveLength(2);
    expect(screen.getByText('$204.00')).toBeDefined();
    expect(screen.getByText('1 RECORDED')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/alerts?portfolioId=1');
  });

  it('shows an empty portfolio state and offers a way to create a portfolio', async () => {
    portfolios = [];
    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios'));
    await act(async () => { await Promise.resolve(); });
    expect(await screen.findByText('Create a portfolio to begin your market scan.')).toBeDefined();
    expect(screen.getByText('Add assets to see hourly price context.')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'ASX ticker' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'New portfolio name' })).toBeDefined();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/scan'))).toBe(false);
  });

  it('creates a portfolio and selects it', async () => {
    render(<Dashboard />);
    await screen.findByRole('option', { name: 'My watchlist' });

    fireEvent.change(screen.getByRole('textbox', { name: 'New portfolio name' }), { target: { value: 'Long term' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ New portfolio' }));

    await waitFor(() => expect((screen.getByRole('combobox', { name: 'PORTFOLIO' }) as HTMLSelectElement).value).toBe('2'));
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('option', { name: 'Long term' })).toBeDefined();
    expect(await screen.findByText('Add tickers above to start monitoring this portfolio.')).toBeDefined();
  });

  it('adds and removes a ticker from the selected watchlist', async () => {
    render(<Dashboard />);
    expect(await screen.findByTitle('Remove MQG.AX')).toBeDefined();

    fireEvent.change(screen.getByRole('textbox', { name: 'ASX ticker' }), { target: { value: 'csl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    expect(await screen.findByTitle('Remove CSL.AX')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/holdings', expect.objectContaining({ method: 'POST' }));

    fireEvent.click(screen.getByTitle('Remove CSL.AX'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/holdings?symbol=CSL.AX', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByTitle('Remove CSL.AX')).toBeNull());
  });

  it('confirms portfolio deletion and loads the next available portfolio', async () => {
    portfolios = [initialPortfolio, { ...initialPortfolio, id: 2, name: 'Second', holdings: [] }];
    render(<Dashboard />);
    await screen.findByRole('option', { name: 'My watchlist' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirmMock).toHaveBeenCalledWith('Delete My watchlist and its watchlist?');
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'PORTFOLIO' }) as HTMLSelectElement).value).toBe('2'));
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1', { method: 'DELETE' });
  });

  it('shows the API error when the market scan fails', async () => {
    scanStatus = 500;
    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scan?portfolioId=1'));
    expect(await screen.findByText('Market scan failed')).toBeDefined();
    expect(screen.getByRole('button', { name: /Scanning market|Refresh signals/ })).toBeDefined();
  });

  it('runs a selected strategy backtest and displays its summary', async () => {
    render(<Dashboard />);
    await screen.findByRole('option', { name: 'My watchlist' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Backtest strategy' }), { target: { value: 'rsi-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));

    expect(await screen.findByText('LAST RUN · RSI (14)')).toBeDefined();
    expect(screen.getByText('12.5%')).toBeDefined();
    expect(screen.getByText('60%')).toBeDefined();
    expect(screen.getByText('1', { selector: '.backtest-results strong' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/backtest?symbol=MQG.AX&strategy=rsi-14&days=365');
  });

  it('renders an API error when the backtest cannot run', async () => {
    backtestStatus = 422;
    render(<Dashboard />);
    await screen.findByRole('option', { name: 'My watchlist' });

    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));

    expect(await screen.findByText('Not enough candle history.')).toBeDefined();
  });
});
