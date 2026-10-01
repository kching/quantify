import { listHoldingStrategies, saveHoldingStrategy } from '@/core/db';
import { loadStrategy } from '@/core/engine';
import type { StrategyParams } from '@/core/types';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

function validParams(value: unknown): value is StrategyParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry === 'boolean') return true;
    return Array.isArray(entry) && entry.every((item) => typeof item === 'number' && Number.isFinite(item));
  });
}

function portfolioIdFrom(params: Promise<{ id: string }>): Promise<number> {
  return params.then(({ id }) => Number(id));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const portfolioId = await portfolioIdFrom(context.params);
  if (!Number.isInteger(portfolioId) || portfolioId < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  return Response.json({ strategies: await listHoldingStrategies(portfolioId, user.id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const portfolioId = await portfolioIdFrom(context.params);
  if (!Number.isInteger(portfolioId) || portfolioId < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  const body = await request.json() as { id?: unknown; symbol?: unknown; label?: unknown; name?: unknown; params?: unknown };
  const strategyId = body.id == null ? undefined : Number(body.id);
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if ((strategyId != null && (!Number.isInteger(strategyId) || strategyId < 1)) || !/^[A-Z0-9.^-]{1,20}$/.test(symbol) || !label || label.length > 80 || !name || !validParams(body.params)) return Response.json({ error: 'Provide a valid holding, label, strategy, and parameters.' }, { status: 400 });
  if (!await loadStrategy(name)) return Response.json({ error: 'Unknown strategy.' }, { status: 400 });
  try {
    const strategy = await saveHoldingStrategy({ id: strategyId, portfolioId, symbol, label, name, params: body.params }, user.id);
    return Response.json({ strategy }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save strategy.';
    return Response.json({ error: message }, { status: message === 'Portfolio not found.' || message === 'Holding not found.' ? 404 : 422 });
  }
}
