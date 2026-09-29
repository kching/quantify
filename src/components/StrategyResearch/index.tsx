'use client';

import { useState } from 'react';
import { Activity, LoaderCircle } from 'lucide-react';
import type { BacktestResult } from '@/core/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SelectControl, SelectOption } from '@/components/ui/select';

export interface StrategyResearchInput {
  symbol: string;
  strategy: string;
}

interface StrategyResearchProps {
  result: BacktestResult | null;
  busy: boolean;
  onRun: (input: StrategyResearchInput) => Promise<boolean>;
}

export default function Index({ result, busy, onRun }: StrategyResearchProps): React.JSX.Element {
  const [symbol, setSymbol] = useState('MQG.AX');
  const [strategy, setStrategy] = useState('klinger-oscillator');

  async function submitBacktest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onRun({ symbol, strategy });
  }

  return <section id="research" className="research-section"><Card className="backtest-panel"><CardHeader className="section-card-header"><div><p className="section-kicker">STRATEGY RESEARCH</p><CardTitle>Test a hypothesis</CardTitle><CardDescription>Compare strategies against the same cached daily history.</CardDescription></div><Badge variant="outline">1Y test window</Badge></CardHeader><CardContent>
    <form className="backtest-form" onSubmit={(event) => void submitBacktest(event)}><Input aria-label="Ticker for backtest" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())}/><SelectControl value={strategy} ariaLabel="Backtest strategy" onValueChange={setStrategy}><SelectOption value="klinger-oscillator">Klinger</SelectOption><SelectOption value="rsi-14">RSI (14)</SelectOption></SelectControl><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Activity className="size-4"/>}{busy ? 'Working…' : 'Run backtest'}</Button></form>
    {result && <><div className="backtest-result-label">LAST RUN · {result.strategyId === 'rsi-14' ? 'RSI (14)' : 'Klinger'}</div><div className="backtest-results"><div><small>1Y RETURN</small><strong className={result.totalReturnPct >= 0 ? 'positive' : 'negative'}>{result.totalReturnPct.toFixed(1)}%</strong></div><div><small>WIN RATE</small><strong>{result.winRatePct.toFixed(0)}%</strong></div><div><small>MAX DRAWDOWN</small><strong className="negative">{result.maxDrawdownPct.toFixed(1)}%</strong></div><div><small>CLOSED TRADES</small><strong>{result.trades.length}</strong></div></div></>}
    <p className="method-note">{strategy === 'rsi-14' ? 'BUY when RSI re-enters above 30. SELL when RSI re-enters below 70.' : 'BUY on KVO crossover above its signal line. SELL on crossover below.'} Next-candle open execution; no fees or slippage.</p>
  </CardContent></Card></section>;
}
