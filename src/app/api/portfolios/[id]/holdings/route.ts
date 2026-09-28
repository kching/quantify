import { addHolding, removeHolding } from '@/core/db';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  const body = await request.json() as { symbol?: unknown };
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return Response.json({ error: 'Enter a valid ticker, such as MQG.AX.' }, { status: 400 });
  try {
    await addHolding(id, symbol.includes('.') ? symbol : `${symbol}.AX`);
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  const symbol = new URL(request.url).searchParams.get('symbol')?.trim().toUpperCase() ?? '';
  if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return Response.json({ error: 'Invalid portfolio or ticker.' }, { status: 400 });
  await removeHolding(id, symbol);
  return Response.json({ ok: true });
}
