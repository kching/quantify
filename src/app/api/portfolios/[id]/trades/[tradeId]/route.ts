import { deletePortfolioTrade, listPortfolios } from '@/core/db';
import { capturePortfolioPerformance } from '@/core/performance.service';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; tradeId: string }> }): Promise<Response> {
  const { id: portfolioIdString, tradeId: tradeIdString } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const portfolioId = Number(portfolioIdString);
  const tradeId = Number(tradeIdString);
  if (!Number.isSafeInteger(portfolioId) || portfolioId < 1 || !Number.isSafeInteger(tradeId) || tradeId < 1) {
    return Response.json({ error: 'Invalid portfolio or trade.' }, { status: 400 });
  }
  if (!(await listPortfolios(user.id)).some((portfolio) => portfolio.id === portfolioId)) return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  try {
    const trade = user.id === 'admin' ? await deletePortfolioTrade(portfolioId, tradeId) : await deletePortfolioTrade(portfolioId, tradeId, user.id);
    await capturePortfolioPerformance(portfolioId);
    return Response.json({ ok: true, trade });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to delete this trade.';
    const status = message === 'Portfolio not found.' || message === 'Trade not found.' ? 404 : 422;
    return Response.json({ error: message }, { status });
  }
}
