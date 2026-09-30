import { createPortfolio, listPortfolios } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in to view portfolios.' }, { status: 401 });
  return Response.json({ portfolios: await listPortfolios(user.id) });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in to create a portfolio.' }, { status: 401 });
  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60) return Response.json({ error: 'Enter a portfolio name up to 60 characters.' }, { status: 400 });
  try {
    const portfolio = await createPortfolio(name, user.id);
    return Response.json({ portfolio: { ...portfolio, holdings: [] } }, { status: 201 });
  } catch {
    return Response.json({ error: 'A portfolio with that name already exists.' }, { status: 409 });
  }
}
