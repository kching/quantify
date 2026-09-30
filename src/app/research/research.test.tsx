import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';

if (typeof window === 'undefined') GlobalRegistrator.register();
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: ResearchPage } = await import('./Research');

const result = {
  symbol: 'MQG.AX', strategyId: 'rsi-14', initialBalance: 10_000, finalBalance: 11_250,
  totalReturnPct: 12.5, winRatePct: 60, maxDrawdownPct: -8.2,
  trades: [{ entryDate: 1, exitDate: 2, entryPrice: 100, exitPrice: 110, pnlPct: 10 }],
};

let status = 200;
const fetchMock = mock(async (): Promise<Response> => status === 200
  ? Response.json({ result })
  : Response.json({ error: 'Not enough candle history.' }, { status }));

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
  it('runs a selected strategy backtest and shows its summary', async () => {
    render(<ResearchPage/>);

    await chooseOption('Backtest strategy', 'RSI (14)');
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));

    expect(await screen.findByText('LAST RUN · RSI (14)')).toBeDefined();
    expect(screen.getByText('12.5%')).toBeDefined();
    expect(screen.getByText('60%')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/backtest?symbol=MQG.AX&strategy=rsi-14&days=365');
  });

  it('shows an API error when the backtest cannot run', async () => {
    status = 422;
    render(<ResearchPage/>);
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Not enough candle history.');
  });
});
