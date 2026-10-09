const roundCurrency = (amount: number): number =>
  Math.round(amount * 100) / 100;

export function calculateBrokerage(tradeValue: number): number {
  if (!Number.isFinite(tradeValue) || tradeValue <= 0) return 0;
  if (tradeValue <= 1_000) return 5;
  if (tradeValue <= 3_000) return 10;
  if (tradeValue <= 10_000) return 19.95;
  if (tradeValue <= 25_000) return 29.95;
  return roundCurrency(tradeValue * 0.0012);
}
