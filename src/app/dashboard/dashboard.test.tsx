import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import type { Candle, PerformanceSnapshots, Portfolio, PortfolioTrade, SignalResult } from '@/core/types';

GlobalRegistrator.register();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: Dashboard } = await import('./dashboard');

async function chooseOption(label: string, optionName: string): Promise<void> {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

async function waitForPortfolio(name = 'My watchlist'): Promise<void> {
  await screen.findByRole('combobox', { name: 'PORTFOLIO' });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'PORTFOLIO' }).textContent).toContain(name));
}

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
let portfolios: PortfolioWithHoldings[];
let trades: PortfolioTrade[];
let cashTransactions: Array<{ id: number; portfolioId: number; type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number; timestamp: number; note: string }>;
let performance: PerformanceSnapshots;
let scanPayload: { signals: Array<{ daily: SignalResult[]; hourly: SignalResult[]; dailyCandles: Candle[]; hourlyCandles: Candle[] }>; warnings: string[] };
let alerts: Array<SignalResult & { id: number; portfolioId: number }>;
let scanStatus = 200;
let omitTradeTickers = false;
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
  const portfolioIdMatch = url.pathname.match(/^\/api\/portfolios\/(\d+)\/(trades|performance|cash)$/);
  if (portfolioIdMatch?.[2] === 'trades' && method === 'GET') {
    const symbol = url.searchParams.get('symbol');
    const matches = trades.filter((trade) => !symbol || trade.symbol === symbol).sort((left, right) => right.timestamp - left.timestamp || right.id - left.id);
    const pageSize = 6;
    const pageCount = Math.ceil(matches.length / pageSize);
    const page = Math.min(Number(url.searchParams.get('page') ?? '1'), Math.max(pageCount, 1));
    return Response.json({ trades: matches.slice((page - 1) * pageSize, page * pageSize), ...(omitTradeTickers ? {} : { tickers: [...new Set(trades.map((trade) => trade.symbol))].sort() }), total: matches.length, page, pageSize, pageCount });
  }
  if (portfolioIdMatch?.[2] === 'trades' && method === 'POST') {
    const symbolInput = body.symbol.toUpperCase();
    const symbol = symbolInput.includes('.') ? symbolInput : `${symbolInput}.AX`;
    const trade: PortfolioTrade = {
      id: trades.length + 1, portfolioId: Number(portfolioIdMatch[1]), symbol, side: body.side as PortfolioTrade['side'],
      quantity: Number(body.quantity), price: Number(body.price), brokerage: Number(body.brokerage), timestamp: Number(body.timestamp),
    };
    trades.push(trade);
    const portfolio = portfolios.find((item) => item.id === trade.portfolioId);
    if (portfolio && !portfolio.holdings.some((holding) => holding.symbol === symbol)) portfolio.holdings.push({ symbol, addedAt: trade.timestamp });
    return Response.json({ trade }, { status: 201 });
  }
  if (portfolioIdMatch?.[2] === 'performance' && method === 'GET') return Response.json(performance);
  if (portfolioIdMatch?.[2] === 'cash' && method === 'GET') {
    const pageSize = 6;
    const pageCount = Math.ceil(cashTransactions.length / pageSize);
    const page = Math.min(Number(url.searchParams.get('page') ?? '1'), Math.max(pageCount, 1));
    const entries = [...cashTransactions].sort((left, right) => right.timestamp - left.timestamp || right.id - left.id);
    return Response.json({ transactions: entries.slice((page - 1) * pageSize, page * pageSize), total: cashTransactions.length, page, pageSize, pageCount });
  }
  if (portfolioIdMatch?.[2] === 'cash' && method === 'POST') {
    const transaction = { id: cashTransactions.length + 1, portfolioId: Number(portfolioIdMatch[1]), type: body.type as 'DEPOSIT' | 'WITHDRAWAL', amount: Number(body.amount), timestamp: Number(body.timestamp), note: String(body.note ?? '') };
    cashTransactions.push(transaction);
    return Response.json({ transaction }, { status: 201 });
  }
  const tradeDeleteMatch = url.pathname.match(/^\/api\/portfolios\/(\d+)\/trades\/(\d+)$/);
  if (tradeDeleteMatch && method === 'DELETE') {
    trades = trades.filter((trade) => trade.id !== Number(tradeDeleteMatch[2]));
    return Response.json({ ok: true });
  }
  const cashDeleteMatch = url.pathname.match(/^\/api\/portfolios\/(\d+)\/cash\/(\d+)$/);
  if (cashDeleteMatch && method === 'DELETE') {
    cashTransactions = cashTransactions.filter((transaction) => transaction.id !== Number(cashDeleteMatch[2]));
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
  throw new Error(`Unexpected dashboard request: ${method} ${url.pathname}`);
});

async function waitForScanCompletion(): Promise<void> {
  await waitFor(() => expect(document.querySelector('.panel-footnote')?.textContent).not.toContain('not yet scanned'));
}

beforeEach(() => {
  portfolios = structuredClone([initialPortfolio]);
  trades = [];
  cashTransactions = [];
  const now = Date.now();
  const performancePoint = (timestamp: number, profitLoss: number) => ({ timestamp, cashBalance: 100, marketValue: 10_000 + profitLoss, totalValue: 10_100 + profitLoss, contributedCapital: 10_100, profitLoss });
  performance = {
    holdings: [
      { symbol: 'MQG.AX', timestamp: now - 180 * 86_400_000, quantity: 2, marketPrice: 95, averageUnitPrice: 95, marketValue: 190, profitLoss: 0 },
      { symbol: 'MQG.AX', timestamp: now - 400 * 86_400_000, quantity: 2, marketPrice: 90, averageUnitPrice: 95, marketValue: 180, profitLoss: -10 },
      { symbol: 'MQG.AX', timestamp: now - 25 * 86_400_000, quantity: 2, marketPrice: 100, averageUnitPrice: 95, marketValue: 200, profitLoss: 10 },
      { symbol: 'MQG.AX', timestamp: now - 5 * 86_400_000, quantity: 2, marketPrice: 103, averageUnitPrice: 95, marketValue: 206, profitLoss: 15 },
      { symbol: 'MQG.AX', timestamp: now, quantity: 2, marketPrice: 105, averageUnitPrice: 95, marketValue: 210, profitLoss: 20 },
      { symbol: 'XRO.AX', timestamp: now - 25 * 86_400_000, quantity: 1, marketPrice: 90, averageUnitPrice: 98, marketValue: 90, profitLoss: -8 },
      { symbol: 'XRO.AX', timestamp: now - 5 * 86_400_000, quantity: 1, marketPrice: 91, averageUnitPrice: 98, marketValue: 91, profitLoss: -7 },
      { symbol: 'XRO.AX', timestamp: now, quantity: 1, marketPrice: 92, averageUnitPrice: 98, marketValue: 92, profitLoss: -6 },
    ],
    portfolio: [performancePoint(now - 400 * 86_400_000, -30), performancePoint(now - 180 * 86_400_000, -20), performancePoint(now - 60 * 86_400_000, 5), performancePoint(now - 25 * 86_400_000, 10), performancePoint(now - 5 * 86_400_000, 15), performancePoint(now, 20)],
  };
  scanPayload = {
    signals: [{ daily: [buySignal, rsiSignal], hourly: [{ ...buySignal, signal: 'HOLD' }], dailyCandles: [
      { symbol: 'MQG.AX', timestamp: Date.UTC(2025, 0, 1), open: 190, high: 202, low: 188, close: 200, volume: 100_000 },
      { symbol: 'MQG.AX', timestamp: Date.UTC(2025, 0, 2), open: 200, high: 205, low: 199, close: 204, volume: 12_000 },
    ], hourlyCandles: [
      { symbol: 'MQG.AX', timestamp: Date.UTC(2025, 0, 2, 1), open: 198, high: 202, low: 197, close: 200, volume: 10_000 },
      { symbol: 'MQG.AX', timestamp: Date.UTC(2025, 0, 2, 2), open: 200, high: 205, low: 199, close: 204, volume: 12_000 },
    ] }],
    warnings: [],
  };
  alerts = [{ ...buySignal, id: 10, portfolioId: 1 }];
  scanStatus = 200;
  omitTradeTickers = false;
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
  it('loads portfolios, scans the selected watchlist and displays daily signals, day change and alerts', async () => {
    render(<Dashboard />);

    await waitForPortfolio();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scan?portfolioId=1'));
    expect(await screen.findByText('KVO crossed above its signal line.')).toBeDefined();
    expect(screen.getByText('RSI 52')).toBeDefined();
    expect(screen.getAllByText('BUY')).toHaveLength(2);
    expect(screen.getByText('$204.00')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'DAILY CHANGE' })).toBeDefined();
    expect(await screen.findByLabelText('Day change +$4.00 (+2.00%)')).toBeDefined();
    expect(screen.getByText('1 RECORDED')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/alerts?portfolioId=1');
    await waitForScanCompletion();
  });

  it('shows an empty portfolio state and offers a way to create a portfolio', async () => {
    portfolios = [];
    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios'));
    await act(async () => { await Promise.resolve(); });
    expect(await screen.findByText('Create a portfolio to begin your market scan.')).toBeDefined();
    expect(screen.getByText('Add assets to see hourly price context.')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'ASX ticker' })).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: 'PORTFOLIO' }));
    expect(await screen.findByRole('option', { name: '＋ New portfolio…' })).toBeDefined();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'PORTFOLIO' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'New portfolio name' })).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/scan'))).toBe(false);
  });

  it('creates a portfolio and selects it', async () => {
    render(<Dashboard />);
    await waitForPortfolio();

    await chooseOption('PORTFOLIO', '＋ New portfolio…');
    expect(await screen.findByRole('dialog', { name: 'Create a portfolio' })).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'New portfolio name' }), { target: { value: 'Long term' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create portfolio' }));

    await waitForPortfolio('Long term');
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByRole('combobox', { name: 'PORTFOLIO' }).textContent).toContain('Long term');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Add tickers above to start monitoring this portfolio.')).toBeDefined();
    await waitForScanCompletion();
  });

  it('closes the new portfolio dialog without creating anything', async () => {
    render(<Dashboard />);
    await waitForPortfolio();
    await chooseOption('PORTFOLIO', '＋ New portfolio…');
    expect(await screen.findByRole('dialog', { name: 'Create a portfolio' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/portfolios', expect.objectContaining({ method: 'POST' }));
  });

  it('adds and removes a ticker from the selected watchlist', async () => {
    render(<Dashboard />);
    expect(await screen.findByLabelText('Remove MQG.AX')).toBeDefined();
    await waitForScanCompletion();

    fireEvent.change(screen.getByRole('textbox', { name: 'ASX ticker' }), { target: { value: 'csl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add asset' }));
    expect(await screen.findByLabelText('Remove CSL.AX')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/holdings', expect.objectContaining({ method: 'POST' }));

    fireEvent.click(screen.getByLabelText('Remove CSL.AX'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/holdings?symbol=CSL.AX', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByLabelText('Remove CSL.AX')).toBeNull());
    await waitForScanCompletion();
  });

  it('records a completed trade with execution price, units and brokerage', async () => {
    render(<Dashboard />);
    await waitForPortfolio();
    await screen.findByLabelText('Remove MQG.AX');
    expect(screen.getByLabelText('Trade date and time').getAttribute('lang')).toBe('en-GB');

    fireEvent.change(screen.getByLabelText('Trade ticker'), { target: { value: 'csl' } });
    await chooseOption('Trade side', 'Buy');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trade units' }), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trade price' }), { target: { value: '120' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trade brokerage' }), { target: { value: '9.95' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save trade' }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/trades', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('5 @ $120.00')).toBeDefined();
    expect(screen.getByText(/Brokerage \$9\.95/)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/trades', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByLabelText('Remove CSL.AX')).toBeDefined();
    await waitForScanCompletion();
  });

  it('paginates recent trades six at a time and filters them by ticker', async () => {
    const baseTime = Date.now() - 100_000;
    trades = Array.from({ length: 13 }, (_, index) => ({
      id: index + 1, portfolioId: 1, symbol: index < 8 ? 'MQG.AX' : 'XRO.AX', side: 'BUY' as const,
      quantity: index + 1, price: 100 + index, brokerage: 5, timestamp: baseTime + index * 1_000,
    }));
    render(<Dashboard />);
    await waitForPortfolio();
    await screen.findByText('Page 1 of 3');
    const history = document.querySelector('.trade-panel .trade-history') as HTMLElement;
    expect(history.querySelectorAll('.trade-row')).toHaveLength(6);
    expect(screen.getByText('1–6 of 13')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Next trade page' }));
    await screen.findByText('Page 2 of 3');
    expect(screen.getByText('7–12 of 13')).toBeDefined();
    expect(history.querySelectorAll('.trade-row')).toHaveLength(6);

    await chooseOption('Filter trades by ticker', 'MQG.AX');
    await screen.findByText('Page 1 of 2');
    expect(screen.getByText('1–6 of 8')).toBeDefined();
    expect(history.querySelectorAll('.trade-row')).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/trades?page=1&symbol=MQG.AX');
    await waitForScanCompletion();
  });

  it('keeps the trade filter usable when a trade response omits ticker options', async () => {
    omitTradeTickers = true;
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Filter trades by ticker' })).toBeDefined());
    expect(screen.getByRole('combobox', { name: 'Filter trades by ticker' })).toBeDefined();
  });

  it('confirms and deletes a trade from the ledger', async () => {
    trades = [{ id: 42, portfolioId: 1, symbol: 'MQG.AX', side: 'BUY', quantity: 2, price: 100, brokerage: 5, timestamp: Date.now() - 1_000 }];
    render(<Dashboard />);
    await screen.findByText('2 @ $100.00');
    fireEvent.click(screen.getByRole('button', { name: /Delete MQG\.AX BUY trade/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/trades/42', { method: 'DELETE' }));
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('Delete trade BUY 2 MQG.AX @ $100.00?'));
    await waitFor(() => expect(screen.queryByText('2 @ $100.00')).toBeNull());
  });

  it('records cash deposits and withdrawals in the portfolio cash ledger', async () => {
    render(<Dashboard />);
    await waitForPortfolio();
    expect(screen.getByLabelText('Cash date and time').getAttribute('lang')).toBe('en-GB');

    await chooseOption('Cash entry type', 'Deposit');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cash amount' }), { target: { value: '5000' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Cash note' }), { target: { value: 'Initial funding' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save cash entry' }).closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/cash', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('Initial funding')).toBeDefined();
    expect(screen.getByText('CASH LEDGER')).toBeDefined();
    await waitForScanCompletion();
  });

  it('paginates and deletes cash entries from the cash ledger', async () => {
    const baseTime = Date.now() - 100_000;
    cashTransactions = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1, portfolioId: 1, type: index % 2 ? 'WITHDRAWAL' as const : 'DEPOSIT' as const,
      amount: 100 + index, timestamp: baseTime + index * 1_000, note: `Cash entry ${index + 1}`,
    }));
    render(<Dashboard />);
    await screen.findByText('Page 1 of 2');
    const history = document.querySelector('.cash-panel .cash-history') as HTMLElement;
    expect(history.querySelectorAll('.cash-row')).toHaveLength(6);
    expect(screen.getByText('1–6 of 7')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Next cash page' }));
    await screen.findByText('Page 2 of 2');
    expect(screen.getByText('7–7 of 7')).toBeDefined();
    await waitFor(() => expect(history.querySelectorAll('.cash-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /Delete deposit of \$100\.00/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1/cash/1', { method: 'DELETE' }));
    expect(confirmMock).toHaveBeenCalledWith('Delete cash deposit of $100.00? Portfolio performance will be recalculated.');
    await screen.findByText('Page 1 of 1');
    expect(history.querySelectorAll('.cash-row')).toHaveLength(6);
  });

  it('plots hourly portfolio P&L and shows the latest per-holding value', async () => {
    render(<Dashboard />);
    await waitForPortfolio();

    expect(await screen.findByRole('img', { name: 'Hourly portfolio profit and loss, Last 1m' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'MQG.AX hourly profit and loss' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'XRO.AX hourly profit and loss' })).toBeDefined();
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('2', { exact: true })).toBeDefined();
    expect(screen.getByText('AVG COST / UNIT')).toBeDefined();
    expect(screen.getByText('$95.00')).toBeDefined();
    expect(screen.getByText('HOLDING PERFORMANCE')).toBeDefined();
    const initialChart = screen.getByRole('img', { name: 'Hourly portfolio profit and loss, Last 1m' });
    const initialCoordinates = initialChart.querySelector('polyline')?.getAttribute('points');
    const initialHoldingCoordinates = screen.getByRole('img', { name: 'MQG.AX hourly profit and loss' }).querySelector('polyline')?.getAttribute('points');
    expect(screen.getByRole('tab', { name: 'Last 1m' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Last 1w' }));
    const weekChart = screen.getByRole('img', { name: 'Hourly portfolio profit and loss, Last 1w' });
    expect(weekChart.querySelector('polyline')?.getAttribute('points')).not.toBe(initialCoordinates);
    expect(screen.getByRole('img', { name: 'MQG.AX hourly profit and loss' }).querySelector('polyline')?.getAttribute('points')).not.toBe(initialHoldingCoordinates);
    expect(screen.getByRole('tab', { name: 'Last 1w' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Last 1y' }));
    expect(screen.getByRole('img', { name: 'Hourly portfolio profit and loss, Last 1y' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'MQG.AX hourly profit and loss' }).querySelector('polyline')?.getAttribute('points')).not.toBe(initialHoldingCoordinates);
    await waitForScanCompletion();
  });

  it('confirms portfolio deletion and loads the next available portfolio', async () => {
    portfolios = [initialPortfolio, { ...initialPortfolio, id: 2, name: 'Second', holdings: [] }];
    render(<Dashboard />);
    await waitForPortfolio();

    fireEvent.click(screen.getByRole('button', { name: 'Delete portfolio' }));

    expect(confirmMock).toHaveBeenCalledWith('Delete My watchlist and its watchlist?');
    await waitForPortfolio('Second');
    expect(fetchMock).toHaveBeenCalledWith('/api/portfolios/1', { method: 'DELETE' });
    await waitForScanCompletion();
  });

  it('shows the API error when the market scan fails', async () => {
    scanStatus = 500;
    render(<Dashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scan?portfolioId=1'));
    expect(await screen.findByText('Market scan failed')).toBeDefined();
    expect(screen.getByRole('button', { name: /Scanning…|Refresh data/ })).toBeDefined();
  });

});
