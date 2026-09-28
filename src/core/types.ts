export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type CandleInterval = '1h' | '1d';
export type TradeSide = 'BUY' | 'SELL';

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

export interface PortfolioTrade {
  id: number;
  portfolioId: number;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  brokerage: number;
  timestamp: number;
}

export type CashTransactionType = 'DEPOSIT' | 'WITHDRAWAL';

export interface PortfolioCashTransaction {
  id: number;
  portfolioId: number;
  type: CashTransactionType;
  amount: number;
  timestamp: number;
  note: string;
}

export interface HoldingPerformancePoint {
  symbol: string;
  timestamp: number;
  quantity: number;
  marketPrice: number;
  marketValue: number;
  profitLoss: number;
}

export interface PortfolioPerformancePoint {
  timestamp: number;
  cashBalance: number;
  marketValue: number;
  totalValue: number;
  contributedCapital: number;
  profitLoss: number;
}

export interface PerformanceSnapshots {
  holdings: HoldingPerformancePoint[];
  portfolio: PortfolioPerformancePoint[];
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
