import { createPortfolio, listPortfolios } from '@/core/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json({ portfolios: await listPortfolios() });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60) return Response.json({ error: 'Enter a portfolio name up to 60 characters.' }, { status: 400 });
  try {
    return Response.json({ portfolio: { ...await createPortfolio(name), holdings: [] } }, { status: 201 });
  } catch {
    return Response.json({ error: 'A portfolio with that name already exists.' }, { status: 409 });
  }
}
