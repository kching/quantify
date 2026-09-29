import { listPortfolios, listTradePage, recordTrade } from '@/core/db';
import type { TradeSide } from '@/core/types';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await context.params).id);
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  if (!(await listPortfolios(user.id)).some((portfolio) => portfolio.id === id)) return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const page = params.has('page') ? Number(params.get('page')) : 1;
  const symbolInput = params.get('symbol')?.trim().toUpperCase() ?? '';
  const symbol = symbolInput && !symbolInput.includes('.') ? `${symbolInput}.AX` : symbolInput;
  if (!Number.isSafeInteger(page) || page < 1 || (symbol && !/^[A-Z0-9.^-]{1,20}$/.test(symbol))) {
    return Response.json({ error: 'Enter a valid page and ticker filter.' }, { status: 400 });
  }
  return Response.json(await listTradePage(id, page, symbol || undefined));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const portfolioId = Number((await context.params).id);
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json() as { symbol?: unknown; side?: unknown; quantity?: unknown; price?: unknown; brokerage?: unknown; timestamp?: unknown };
  const symbolInput = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const symbol = symbolInput.includes('.') ? symbolInput : `${symbolInput}.AX`;
  const side = body.side;
  const quantity = Number(body.quantity);
  const price = Number(body.price);
  const brokerage = Number(body.brokerage);
  const timestamp = Number(body.timestamp);
  if (!Number.isSafeInteger(portfolioId) || portfolioId < 1 || !/^[A-Z0-9.^-]{1,20}$/.test(symbol)
    || (side !== 'BUY' && side !== 'SELL') || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(price) || price <= 0 || !Number.isFinite(brokerage) || brokerage < 0
    || !Number.isSafeInteger(timestamp) || timestamp < 1) {
    return Response.json({ error: 'Enter a valid ticker, side, units, price, brokerage and trade time.' }, { status: 400 });
  }
  try {
    const input = { portfolioId, symbol, side: side as TradeSide, quantity, price, brokerage, timestamp };
    const trade = user.id === 'admin' ? await recordTrade(input) : await recordTrade(input, user.id);
    return Response.json({ trade }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to record this trade.';
    const status = message === 'Portfolio not found.' ? 404 : 422;
    return Response.json({ error: message }, { status });
  }
}
