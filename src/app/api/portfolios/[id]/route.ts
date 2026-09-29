import { deletePortfolio } from '@/core/db';
import { getCurrentUser } from '@/lib/current-user';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: rawId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid portfolio.' }, { status: 400 });
  if (user.id === 'admin') await deletePortfolio(id); else await deletePortfolio(id, user.id);
  return Response.json({ ok: true });
}
