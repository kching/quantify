import { listPerformance, listPortfolios } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await context.params).id);
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  if (!(await listPortfolios(user.id)).some((portfolio) => portfolio.id === id)) return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  return Response.json(await listPerformance(id));
}
