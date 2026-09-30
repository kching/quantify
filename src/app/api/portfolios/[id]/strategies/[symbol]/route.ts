import { removeHoldingStrategy } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; symbol: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id, symbol: rawSymbol } = await context.params;
  const portfolioId = Number(id);
  const symbol = rawSymbol.trim().toUpperCase();
  if (!Number.isInteger(portfolioId) || portfolioId < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return Response.json({ error: 'Invalid strategy.' }, { status: 400 });
  try {
    await removeHoldingStrategy(portfolioId, symbol, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to delete strategy.' }, { status: 404 });
  }
}
