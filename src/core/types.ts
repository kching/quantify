export type SignalType = "BUY" | "SELL" | "HOLD";
export type CandleInterval = "1h" | "1d";
export type TradeSide = "BUY" | "SELL";
export type StrategyParamValue = number | number[] | boolean | boolean[];
export type StrategyParams = Record<string, StrategyParamValue>;
export type ParamDescriptorType =
  "number" | "number[]" | "boolean" | "boolean[]";

export interface ParamDefaultValues {
  min: StrategyParamValue;
  max: StrategyParamValue;
  step?: StrategyParamValue;
}

export interface ParamDescriptior {
  type: ParamDescriptorType;
  id: string;
  label: string;
  defaultValues: ParamDefaultValues;
}

export type ParamDescriptor = ParamDescriptior;

export interface Candle {
  symbol: string;
  interval: CandleInterval;
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
  label?: string;
  signalId?: number;
  stateUpdatedAt?: number;
}

export interface SignalStrategy {
  signalSeries(
    candles: readonly Candle[],
    params?: StrategyParams,
  ): readonly SignalType[];
  analyze(
    symbol: string,
    candles: readonly Candle[],
    params?: StrategyParams,
  ): SignalResult;
  get inputParams(): ParamDescriptior[];
  get id(): string;
  get name(): string;
}

export interface Portfolio {
  id: number;
  userId: string;
  name: string;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  isAnonymous: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookConfig {
  id: number;
  userId: string;
  label: string;
  url: string;
  clientId: string | null;
  secretToken: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookConfigInput {
  label?: string;
  url: string;
  clientId?: string | null;
  secretToken?: string | null;
}

export type WebhookDeliveryStatus = "success" | "error";

export interface WebhookDeliveryLog {
  id: number;
  /** User ID snapshot for UI ownership filtering; intentionally has no FK. */
  userId: string;
  webhookConfigId: number | null;
  eventType: string;
  url: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  message: string | null;
  timestamp: number;
}

export interface WebhookDeliveryLogInput {
  /** User ID snapshot for UI ownership filtering; intentionally has no FK. */
  userId: string;
  webhookConfigId: number | null;
  eventType: string;
  url: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  message?: string | null;
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type UserPreferences = Record<string, JsonValue>;

export interface PortfolioHolding {
  symbol: string;
  addedAt: number;
}

export interface HoldingStrategy {
  id: number;
  portfolioId: number;
  symbol: string;
  label: string;
  name: string;
  params: StrategyParams;
  candleType: CandleInterval;
  lastSignal: SignalType | null;
  signalUpdatedAt: number | null;
}

export type HoldingStrategyInput = Omit<
  HoldingStrategy,
  "id" | "lastSignal" | "signalUpdatedAt" | "candleType"
> & { id?: number; candleType?: CandleInterval };

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

export type CashTransactionType = "DEPOSIT" | "WITHDRAWAL";

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
  averageUnitPrice: number;
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
  strategyReturnPct: number;
  buyAndHoldReturnPct: number;
  totalReturnPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
}

export type BacktestRunMetrics = Omit<BacktestResult, "trades">;

export interface BacktestSweepSummary {
  totalRuns: number;
  completedRuns: number;
  buyAndHoldReturnPct: number;
  buyAndHoldCagrPct: number;
  maxReturnRunIndex: number;
  maxReturnCagrPct: number;
  maxReturnVsBuyAndHoldPct: number;
  lowestDrawdownRunIndex: number;
  lowestDrawdownPct: number;
  balancedPickRunIndex: number;
  balancedPickCagrPct: number;
  balancedPickVsBuyAndHoldPct: number;
}
