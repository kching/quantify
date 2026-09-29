import { addHolding, removeHolding } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

function normalizeAsxSymbol(value: string): string {
  return value.endsWith('.AX') ? value : `${value}.AX`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const id = Number(rawId);
  const body = await request.json() as { symbol?: unknown };
  const symbolInput = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const symbol = symbolInput ? normalizeAsxSymbol(symbolInput) : '';
  if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return Response.json({ error: 'Enter a valid ticker, such as QQQ or MQG.AX.' }, { status: 400 });
  try {
    if (user.id === 'admin') await addHolding(id, symbol);
    else await addHolding(id, symbol, user.id);
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const id = Number(rawId);
  const symbol = new URL(request.url).searchParams.get('symbol')?.trim().toUpperCase() ?? '';
  if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return Response.json({ error: 'Invalid portfolio or ticker.' }, { status: 400 });
  try {
    if (user.id === 'admin') await removeHolding(id, symbol); else await removeHolding(id, symbol, user.id);
  } catch { return Response.json({ error: 'Portfolio not found.' }, { status: 404 }); }
  return Response.json({ ok: true });
}
