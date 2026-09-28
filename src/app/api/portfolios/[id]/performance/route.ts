import { listPerformance, listPortfolios } from '@/core/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  if (!(await listPortfolios()).some((portfolio) => portfolio.id === id)) return Response.json({ error: 'Portfolio not found.' }, { status: 404 });
  return Response.json(await listPerformance(id));
}
