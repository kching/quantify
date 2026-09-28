import { listCashTransactions, listPortfolios, recordCashTransaction } from '@/core/db';
import type { CashTransactionType } from '@/core/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  if (!(await listPortfolios()).some((portfolio) => portfolio.id === id)) return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  return Response.json({ transactions: await listCashTransactions(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const portfolioId = Number((await context.params).id);
  const body = await request.json() as { type?: unknown; amount?: unknown; timestamp?: unknown; note?: unknown };
  const type = body.type;
  const amount = Number(body.amount);
  const timestamp = Number(body.timestamp);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : '';
  if (!Number.isSafeInteger(portfolioId) || portfolioId < 1 || (type !== 'DEPOSIT' && type !== 'WITHDRAWAL')
    || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(timestamp) || timestamp < 1) {
    return Response.json({ error: 'Enter a valid transaction type, positive AUD amount and transaction time.' }, { status: 400 });
  }
  try {
    const transaction = await recordCashTransaction({ portfolioId, type: type as CashTransactionType, amount, timestamp, note });
    return Response.json({ transaction }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to record this cash transaction.';
    return Response.json({ error: message }, { status: message === 'Portfolio not found.' ? 404 : 422 });
  }
}
