import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';

if (typeof window === 'undefined') GlobalRegistrator.register();
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: ResearchPage } = await import('./research');

const result = {
  symbol: 'MQG.AX', strategyId: 'rsi-14', initialBalance: 10_000, finalBalance: 11_250,
  totalReturnPct: 12.5, winRatePct: 60, maxDrawdownPct: -8.2,
  trades: [{ entryDate: 1, exitDate: 2, entryPrice: 100, exitPrice: 110, pnlPct: 10 }],
};

let status = 200;
const fetchMock = mock(async (url: string): Promise<Response> => { void url; return status === 200
  ? Response.json({ result })
  : Response.json({ error: 'Not enough hourly candles.' }, { status }); });

async function chooseOption(label: string, optionName: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('combobox', { name: label }));
    await Promise.resolve();
  });
  const option = await screen.findByRole('option', { name: optionName });
  await act(async () => {
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  status = 200;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  await cleanup();
});

describe('ResearchPage', () => {
  it('runs a selected strategy sweep and shows the results workspace', async () => {
    render(<ResearchPage/>);

    await chooseOption('Backtest strategy', 'RSI (14)');
    fireEvent.click(screen.getByRole('button', { name: 'Run parameter sweep' }));

    expect(await screen.findByText('Return vs drawdown')).toBeDefined();
    expect(screen.getByText('Highest return')).toBeDefined();
    expect(screen.getByText('Lowest drawdown')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('cadence=hourly');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('days=90');
  });

  it('shows an API error when the backtest cannot run', async () => {
    status = 422;
    render(<ResearchPage/>);
    fireEvent.click(screen.getByRole('button', { name: 'Run parameter sweep' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Not enough hourly candles.');
  });
});
