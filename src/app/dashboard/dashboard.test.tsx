import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from './dashboard';

function renderDashboard(): string {
  return renderToStaticMarkup(<Dashboard />);
}

describe('Dashboard', () => {
  it('renders the market overview and decision-support disclaimer', () => {
    const html = renderDashboard();

    expect(html).toContain('Good trading starts with');
    expect(html).toContain('Portfolio signals');
    expect(html).toContain('Recent movement');
    expect(html).toContain('Signal history');
    expect(html).toContain('Test a hypothesis');
    expect(html).toContain('decision support, not trade instructions');
  });

  it('shows empty states and disables portfolio actions until data is loaded', () => {
    const html = renderDashboard();

    expect(html).toContain('Create a portfolio to begin your market scan.');
    expect(html).toContain('Add assets to see hourly price context.');
    expect(html).toContain('No actionable signals yet');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="New portfolio name"');
    expect(html).not.toContain('aria-label="ASX ticker"');
  });

  it('starts with the default ticker and Klinger backtest strategy', () => {
    const html = renderDashboard();

    expect(html).toContain('aria-label="Ticker for backtest" value="MQG.AX"');
    expect(html).toContain('<option value="klinger-oscillator" selected="">Klinger</option>');
    expect(html).toContain('<option value="rsi-14">RSI (14)</option>');
    expect(html).toContain('BUY on KVO crossover above its signal line. SELL on crossover below.');
  });
});
