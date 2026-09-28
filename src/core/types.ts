export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type CandleInterval = '1h' | '1d';

export interface Candle {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalResult {
  symbol: string;
  strategyId: string;
  strategyName: string;
  signal: SignalType;
  timestamp: number;
  price: number;
  rationale: string;
  indicators: Record<string, number>;
}

export interface SignalStrategy {
  id: string;
  name: string;
  analyze(symbol: string, candles: readonly Candle[]): SignalResult;
}

export interface Portfolio {
  id: number;
  userId: string;
  name: string;
  createdAt: number;
}

export interface PortfolioHolding {
  symbol: string;
  addedAt: number;
}

export interface BacktestTrade {
  entryDate: number;
  exitDate: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
}

export interface BacktestResult {
  symbol: string;
  strategyId: string;
  initialBalance: number;
  finalBalance: number;
  totalReturnPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
}
